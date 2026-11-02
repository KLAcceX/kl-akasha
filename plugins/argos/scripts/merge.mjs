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
//     the repo, or is an app that only touches upkeep files (Dependabot, Renovate). A coding agent
//     does not pass: it writes code from instructions anyone may have left it. A verdict reads the
//     PR's own text, so it can be talked into passing; this script decides on facts the PR cannot write
//   - no conflicts, and every CI check passed (no checks at all is not green)
//   - after the approval, GitHub says it can merge (required reviews and rules satisfied)
// Merge uses the first method the repo allows (squash, merge commit, rebase), pinned to the head
// commit, so a push in between makes the merge fail instead of merging unvalidated code.
//
// Usage:
//   node merge.mjs sweep          every passing verdict in an opted-in repo with no outcome yet
//   node merge.mjs --self-test
// Each outcome lands on the verdict (merge: { state: merged | approved | skipped, why, sha, at }).
// A commit is looked at again each round until its outcome stands: CI still running, more reviews
// needed or a network error may change; a fork or a merged PR will not. It is approved only once.
// A PR left to humans (verdicts.mjs human) is never touched. Env: ARGOS_STATE, as the other scripts.
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { read as readRepos } from "./repos.mjs";
import { onlyUpkeep } from "./upkeep.mjs";
import { read, withLock, write } from "./verdicts.mjs";

const repoOf = (url) => url.match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1] ?? "";
const sameSha = (a = "", b = "") => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));
const GREEN = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const WRITERS = new Set(["admin", "write"]);
// Skips that no later round can change, for this commit.
const FINAL = new Set(["not open", "your PR", "from a fork", "author cannot write", "coding agent"]);
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
    if (!onlyUpkeep((pr.files ?? []).map((f) => f.path))) return "coding agent";
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

function sweepAll() {
  const repos = readRepos().filter((r) => r.merge);
  if (!repos.length) return [];
  const v = read();
  const done = [];
  for (const [url, verdict] of Object.entries(v.prs)) {
    const cfg = repos.find((r) => r.repo.toLowerCase() === repoOf(url).toLowerCase());
    if (!cfg || !passes(verdict) || settled(verdict) || v.human?.includes(url)) continue;
    let approved = verdict.merge?.sha === verdict.sha && verdict.merge.state === "approved";
    let outcome;
    try {
      const env = cfg.account ? { ...process.env, GH_TOKEN: gh(["auth", "token", "-u", cfg.account]) } : process.env;
      const run = (args) => gh(args, env);
      const pr = JSON.parse(run(["pr", "view", url, "--json", "state,isDraft,headRefOid,author,isCrossRepository,files,mergeable,statusCheckRollup"]));
      const why = gate(pr, verdict, run(["api", "user", "-q", ".login"]), pr.author?.is_bot ? undefined : accessOf(run, repoOf(url), pr.author?.login));
      // approved stays on the record, so no later round approves again
      if (why) outcome = { state: approved ? "approved" : "skipped", why };
      else {
        if (!approved) {
          run(["pr", "review", url, "--approve", "--body", "Argos: validated with no blockers and nothing needing attention."]);
          approved = true;
        }
        const after = JSON.parse(run(["pr", "view", url, "--json", "mergeStateStatus"]));
        const how = method(JSON.parse(run(["api", `repos/${repoOf(url)}`])));
        if (after.mergeStateStatus !== "CLEAN" || !how) outcome = { state: "approved", why: how ? "needs more reviews" : "no merge method allowed" };
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
  return execFileSync("gh", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
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
  // counts against; an app passes only when it touches nothing but upkeep files
  assert.equal(gate({ ...ok, isCrossRepository: true }, v, "me", "write"), "from a fork");
  assert.equal(gate({ ...ok, isCrossRepository: undefined }, v, "me", "write"), "from a fork");
  assert.equal(gate(ok, v, "me", "read"), "author cannot write");
  assert.equal(gate(ok, v, "me", "none"), "author cannot write");
  assert.equal(gate(ok, v, "me"), "author access unknown");
  const bump = [{ path: "package.json" }, { path: "web/package-lock.json" }];
  assert.equal(gate({ ...ok, author: { login: "app/dependabot", is_bot: true }, files: bump }, v, "me"), null);
  assert.equal(gate({ ...ok, author: { login: "app/copilot-swe-agent", is_bot: true }, files: [...bump, { path: "src/pay.ts" }] }, v, "me"), "coding agent");
  assert.equal(gate({ ...ok, author: { login: "app/dependabot", is_bot: true } }, v, "me"), "coding agent");
  assert.equal(gate({ ...ok, author: { login: "app/evil", is_bot: true }, files: bump, isCrossRepository: true }, v, "me"), "from a fork");
  assert.equal(method({ allow_squash_merge: false, allow_merge_commit: true }), "--merge");
  assert.equal(method({}), null);
  console.log("self-test ok");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd] = process.argv.slice(2);
  if (cmd === "--self-test") selfTest();
  else if (cmd === "sweep") console.log(JSON.stringify(sweep()));
  else {
    console.error("usage: merge.mjs sweep | --self-test");
    process.exit(1);
  }
}
