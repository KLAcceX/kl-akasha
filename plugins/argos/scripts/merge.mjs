#!/usr/bin/env node
// Argos merge: approves and merges a validated PR, only in a repo the user turned it on for
// (`repos.mjs merge <repo> on`) and only under a strict rule. The mod runs it, never the agent
// that validated: the validation stays read-only, and this script decides from facts alone.
//
// The rule, all of it:
//   - the verdict passed: no blocker, nothing needing attention, not partial
//   - the verdict is on the head commit, the PR is open and not a draft
//   - the PR is not the user's own (GitHub does not let anyone approve their own)
//   - no conflicts, and every CI check passed (no checks at all is not green)
//   - after the approval, GitHub says it can merge (required reviews and rules satisfied)
// Merge uses the first method the repo allows (squash, merge commit, rebase), pinned to the head
// commit, so a push in between makes the merge fail instead of merging unvalidated code.
//
// Usage:
//   node merge.mjs sweep          every passing verdict in an opted-in repo with no outcome yet
//   node merge.mjs --self-test
// Each outcome lands on the verdict (merge: { state: merged | approved | skipped, why, sha, at }),
// once per head commit. Env: ARGOS_STATE, as the other scripts.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { read as readRepos } from "./repos.mjs";
import { read, write } from "./verdicts.mjs";

const repoOf = (url) => url.match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1] ?? "";
const sameSha = (a = "", b = "") => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));
const GREEN = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

// A passing verdict: the only ones this script looks at; the rest show their own verdict.
export const passes = (v) => v?.state === "done" && v.issues === 0 && !v.attention && !v.partial;

// From `gh pr view --json state,isDraft,headRefOid,author,mergeable,statusCheckRollup`: null when
// it may be approved, else the reason it is skipped, in a few words.
export function gate(pr, verdict, me) {
  if (pr.state !== "OPEN" || pr.isDraft) return "not open";
  if (!sameSha(pr.headRefOid, verdict.sha)) return "new commits";
  if (me && pr.author?.login?.toLowerCase() === me.toLowerCase()) return "your PR";
  if (pr.mergeable !== "MERGEABLE") return pr.mergeable === "CONFLICTING" ? "conflicts" : "mergeability unknown";
  const checks = pr.statusCheckRollup ?? [];
  if (!checks.length) return "no CI";
  const red = checks.some((c) => !GREEN.has(c.conclusion ?? c.state ?? ""));
  return red ? "CI red" : null;
}

// The repo's first allowed method, as a gh pr merge flag.
export const method = (r) => (r.allow_squash_merge ? "--squash" : r.allow_merge_commit ? "--merge" : r.allow_rebase_merge ? "--rebase" : null);

function sweep() {
  const repos = readRepos().filter((r) => r.merge);
  if (!repos.length) return [];
  const v = read();
  const done = [];
  for (const [url, verdict] of Object.entries(v.prs)) {
    const cfg = repos.find((r) => r.repo.toLowerCase() === repoOf(url).toLowerCase());
    if (!cfg || !passes(verdict) || verdict.merge?.sha === verdict.sha) continue;
    const env = cfg.account ? { ...process.env, GH_TOKEN: gh(["auth", "token", "-u", cfg.account]) } : process.env;
    const run = (args) => gh(args, env);
    let outcome;
    try {
      const pr = JSON.parse(run(["pr", "view", url, "--json", "state,isDraft,headRefOid,author,mergeable,statusCheckRollup"]));
      const why = gate(pr, verdict, run(["api", "user", "-q", ".login"]));
      if (why) outcome = { state: "skipped", why };
      else {
        run(["pr", "review", url, "--approve", "--body", "Argos: validated with no blockers and nothing needing attention."]);
        const after = JSON.parse(run(["pr", "view", url, "--json", "mergeStateStatus"]));
        const how = method(JSON.parse(run(["api", `repos/${repoOf(url)}`])));
        if (after.mergeStateStatus !== "CLEAN" || !how) outcome = { state: "approved", why: how ? "needs more reviews" : "no merge method allowed" };
        else {
          run(["pr", "merge", url, how, "--match-head-commit", pr.headRefOid]);
          outcome = { state: "merged", why: how.slice(2) };
        }
      }
    } catch (err) {
      outcome = { state: "skipped", why: String(err.message ?? err).split("\n")[0].slice(0, 80) };
    }
    // read again: a validation may have landed while GitHub answered
    const now = read();
    if (now.prs[url]?.sha === verdict.sha) write({ ...now, prs: { ...now.prs, [url]: { ...now.prs[url], merge: { ...outcome, sha: verdict.sha, at: new Date().toISOString() } } } });
    done.push({ url, ...outcome });
  }
  return done;
}

function gh(args, env = process.env) {
  return execFileSync("gh", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function selfTest() {
  const ok = { state: "OPEN", isDraft: false, headRefOid: "abc1234def", author: { login: "bia" }, mergeable: "MERGEABLE", statusCheckRollup: [{ conclusion: "SUCCESS" }, { state: "SUCCESS" }, { conclusion: "SKIPPED" }] };
  const v = { state: "done", sha: "abc1234", issues: 0, attention: 0, partial: false };
  assert.equal(passes(v), true);
  assert.equal(passes({ ...v, attention: 1 }), false);
  assert.equal(passes({ ...v, partial: true }), false);
  assert.equal(passes({ ...v, issues: 2 }), false);
  assert.equal(passes({ state: "running" }), false);
  assert.equal(gate(ok, v, "me"), null);
  assert.equal(gate({ ...ok, headRefOid: "fff9999" }, v, "me"), "new commits");
  assert.equal(gate(ok, v, "BIA"), "your PR");
  assert.equal(gate({ ...ok, isDraft: true }, v, "me"), "not open");
  assert.equal(gate({ ...ok, mergeable: "CONFLICTING" }, v, "me"), "conflicts");
  assert.equal(gate({ ...ok, statusCheckRollup: [] }, v, "me"), "no CI");
  assert.equal(gate({ ...ok, statusCheckRollup: [{ conclusion: "FAILURE" }] }, v, "me"), "CI red");
  // a check still running is not green either
  assert.equal(gate({ ...ok, statusCheckRollup: [{ status: "IN_PROGRESS", conclusion: "" }] }, v, "me"), "CI red");
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
