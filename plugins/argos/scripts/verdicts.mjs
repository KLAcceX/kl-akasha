#!/usr/bin/env node
// Argos verdicts: what the last AI validation of each PR found, kept beside the vigil's state
// so the pane shows it on every row. The AI writes them while it validates; the pane reads them.
//
// Usage:
//   node verdicts.mjs start <pr-url>...                          marks them as being validated
//   node verdicts.mjs set <pr-url> --sha <head sha> --issues <n> [--attention <m>] [--partial]
//                         [--finding "<top finding>"]
//     issues: blockers only, each with file:line and how it fails; attention: risks that do
//     not block (deploy, a weak test); partial: not all of it was read, so it never passes
//   node verdicts.mjs fail <pr-url> --reason "<why>"              it could not be validated
//   node verdicts.mjs auto <off|mine|all>                        validate new PRs and new commits by itself
//   node verdicts.mjs list                                       prints the file as JSON
//   node verdicts.mjs --self-test
// Env: ARGOS_STATE overrides the state file path (verdicts.json sits beside it).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const STATE = process.env.ARGOS_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "state.json");
const FILE = join(dirname(STATE), "verdicts.json");
export const AUTO = ["off", "mine", "all"];
const EMPTY = { auto: "off", batch: { urls: [], at: null }, prs: {} };

export const read = (file = FILE) => {
  try {
    return { ...EMPTY, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return structuredClone(EMPTY);
  }
};
export const write = (v, file = FILE) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(v, null, 2));
};
const isPr = (url) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(url);

// A new batch replaces the last one once nothing of it is still running, so the pane counts
// "9 of 22" for what was asked together.
export function start(v, urls, now) {
  const running = v.batch.urls.some((u) => v.prs[u]?.state === "running");
  const batch = running ? { ...v.batch, urls: [...new Set([...v.batch.urls, ...urls])] } : { urls, at: now };
  const prs = { ...v.prs };
  for (const u of urls) prs[u] = { ...prs[u], state: "running", at: now };
  return { ...v, batch, prs };
}

export function set(v, url, { sha, issues, attention = 0, partial = false, finding = "" }, now) {
  return { ...v, prs: { ...v.prs, [url]: { state: "done", sha, issues, attention, partial, finding: finding.trim().slice(0, 160), at: now } } };
}

// A PR that could not be validated (no access, closed, the agent stopped): failed, with why, so
// the pane offers Retry instead of a line stuck on "validating".
export function fail(v, url, reason, now) {
  return { ...v, prs: { ...v.prs, [url]: { ...v.prs[url], state: "failed", reason: String(reason ?? "").trim().slice(0, 120), at: now } } };
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args) {
  const [cmd, ...rest] = args;
  const now = new Date().toISOString();
  const v = read();
  if (cmd === "list") return console.log(JSON.stringify(v, null, 2));
  if (cmd === "start") {
    const urls = rest.filter((a) => !a.startsWith("--"));
    if (!urls.length || !urls.every(isPr)) throw new Error("start takes PR URLs: https://github.com/<owner>/<repo>/pull/<n>");
    write(start(v, urls, now));
    return console.log(`validating ${urls.length}`);
  }
  if (cmd === "set") {
    const url = rest[0];
    const sha = flag(rest, "sha");
    const issues = Number(flag(rest, "issues"));
    const attention = Number(flag(rest, "attention") ?? 0);
    const partial = rest.includes("--partial");
    if (!isPr(url) || !/^[0-9a-f]{7,40}$/.test(sha ?? "") || ![issues, attention].every((n) => Number.isInteger(n) && n >= 0))
      throw new Error('set <pr-url> --sha <head sha> --issues <n> [--attention <m>] [--partial] [--finding "<text>"]');
    write(set(v, url, { sha, issues, attention, partial, finding: flag(rest, "finding") }, now));
    const said = issues ? `blocks ${issues}` : partial ? "partial" : "passed";
    return console.log(`${url}: ${said}${attention ? ` · attention ${attention}` : ""}`);
  }
  if (cmd === "fail") {
    const url = rest[0];
    if (!isPr(url)) throw new Error('fail <pr-url> --reason "<why>"');
    write(fail(v, url, flag(rest, "reason"), now));
    return console.log(`${url}: failed`);
  }
  if (cmd === "auto") {
    if (!AUTO.includes(rest[0])) throw new Error(`auto takes ${AUTO.join(" | ")}`);
    write({ ...v, auto: rest[0] });
    return console.log(`auto-validate: ${rest[0]}`);
  }
  throw new Error("usage: verdicts.mjs start|set|fail|auto|list (see the file head)");
}

function selfTest() {
  const a = "https://github.com/acme/web/pull/1";
  const b = "https://github.com/acme/web/pull/2";
  let v = structuredClone(EMPTY);
  v = start(v, [a, b], "t1");
  assert.deepEqual(v.batch, { urls: [a, b], at: "t1" });
  assert.equal(v.prs[a].state, "running");
  v = set(v, a, { sha: "abc1234", issues: 2, finding: "  no backoff cap  " }, "t2");
  assert.deepEqual(v.prs[a], { state: "done", sha: "abc1234", issues: 2, attention: 0, partial: false, finding: "no backoff cap", at: "t2" });
  assert.equal(set(v, a, { sha: "abc1234", issues: 0, attention: 2, partial: true }, "t2").prs[a].partial, true);
  // b still runs: a new start joins the same batch
  v = start(v, [a], "t3");
  assert.deepEqual(v.batch.urls, [a, b]);
  v = set(set(v, a, { sha: "abc1234", issues: 0 }, "t4"), b, { sha: "def5678", issues: 0 }, "t4");
  // nothing runs: the next start is a batch of its own
  assert.deepEqual(start(v, [b], "t5").batch, { urls: [b], at: "t5" });
  assert.deepEqual(fail(start(v, [a], "t6"), a, " no access ", "t7").prs[a], { state: "failed", sha: "abc1234", issues: 0, attention: 0, partial: false, finding: "", reason: "no access", at: "t7" });
  assert.equal(isPr(a), true);
  assert.equal(isPr("acme/web#1"), false);
  console.log("self-test ok");
}

// Run as a command only; merge.mjs imports read() and write() without triggering it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv.includes("--self-test")) selfTest();
  else
    try {
      main(process.argv.slice(2));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
}
