#!/usr/bin/env node
// Argos verdicts: what the last AI validation of each PR found, kept beside the vigil's state
// so the pane shows it on every row. The AI writes them while it validates; the pane reads them.
//
// Usage:
//   node verdicts.mjs queue <pr-url>...                          a run asked for them: waiting
//   node verdicts.mjs start <pr-url>...                          marks them as being validated now
//   node verdicts.mjs set <pr-url> --sha <head sha> --issues <n> [--attention <m>] [--partial]
//                         [--finding "<top finding>"] [--report-file <path, or - for stdin>]
//     issues: blockers only, each with file:line and how it fails; attention: risks that do
//     not block (deploy, a weak test); partial: not all of it was read, so it never passes;
//     report: every finding, as it would read on the PR (publish.mjs posts it)
//   node verdicts.mjs fail <pr-url> --reason "<why>"              it could not be validated
//   node verdicts.mjs auto <off|mine|all> [--every <minutes>]   validate new PRs and new commits by itself
//   node verdicts.mjs ran <count>                                an automatic round sent that many
//   node verdicts.mjs human <pr-url>...                          the PRs left to humans (replaces the list):
//     neither auto-validate nor auto-merge touches them
//   node verdicts.mjs list                                       prints the file as JSON
//   node verdicts.mjs --self-test
// Env: ARGOS_STATE overrides the state file path (verdicts.json sits beside it).
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { add as addHistory } from "./history.mjs";
import { isMain } from "./is-main.mjs";

const STATE = process.env.ARGOS_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "state.json");
const FILE = join(dirname(STATE), "verdicts.json");
export const AUTO = ["off", "mine", "all"];
const EMPTY = { auto: "off", autoEvery: 30, lastAuto: null, batch: { urls: [], at: null }, prs: {}, human: [], approved: {} };
export const EVERY = [15, 30, 60];
const busy = (state) => state === "running" || state === "queued";

// No file yet is an empty start. A file that does not parse is an error, never an empty start: the
// next write would wipe every verdict.
export const read = (file = FILE) => {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return structuredClone(EMPTY);
    throw err;
  }
  return { ...EMPTY, ...JSON.parse(text) };
};
export const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Whole or not at all: a reader never sees half a file. Windows may hold the target for a moment.
export const write = (v, file = FILE) => {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2));
  for (let tries = 0; ; tries++) {
    try {
      return renameSync(tmp, file);
    } catch (err) {
      if (tries >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(err.code)) throw err;
      nap(50);
    }
  }
};
// One writer at a time: agents validate side by side, and each reads, changes and writes the file.
// A lock left by a process that died goes stale after 10 s.
export function withLock(fn, file = FILE) {
  mkdirSync(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  for (let tries = 0; ; tries++) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch (err) {
      if (err.code !== "EEXIST" && err.code !== "EPERM") throw err;
      try {
        if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { force: true });
      } catch {}
      if (tries >= 200) throw new Error("verdicts.json stayed locked for 10 s");
      nap(50);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}
const isPr = (url) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(url);

// A new batch replaces the last one once nothing of it is still waiting or running, so the pane
// counts "9 of 22" for what was asked together. The mod queues a run; the agent starts each PR as
// it reaches it, so the time limit counts from then.
function mark(v, urls, state, now) {
  const open = v.batch.urls.some((u) => busy(v.prs[u]?.state));
  const batch = open ? { ...v.batch, urls: [...new Set([...v.batch.urls, ...urls])] } : { urls, at: now };
  const prs = { ...v.prs };
  for (const u of urls) prs[u] = { ...prs[u], state, at: now };
  return { ...v, batch, prs };
}
// Tries count from here, so what keeps failing stops spending; a verdict starts over.
export function queue(v, urls, now) {
  const next = mark(v, urls, "queued", now);
  for (const u of urls) next.prs[u] = { ...next.prs[u], tries: (v.prs[u]?.tries ?? 0) + 1 };
  return next;
}
export const start = (v, urls, now) => mark(v, urls, "running", now);

// A validation run again on the same commit keeps what was posted for it: that comment stands.
export function set(v, url, { sha, issues, attention = 0, partial = false, finding = "", report = "" }, now) {
  const was = v.prs[url]?.published;
  const kept = was?.state === "posted" && was.sha === sha ? { published: was } : {};
  return { ...v, prs: { ...v.prs, [url]: { state: "done", sha, issues, attention, partial, finding: finding.trim().slice(0, 160), ...(report.trim() && { report: report.trim().slice(0, 6000) }), ...kept, at: now } } };
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
  if (cmd === "start" || cmd === "queue") {
    const urls = rest.filter((a) => !a.startsWith("--"));
    if (!urls.length || !urls.every(isPr)) throw new Error(`${cmd} takes PR URLs: https://github.com/<owner>/<repo>/pull/<n>`);
    write((cmd === "start" ? start : queue)(v, urls, now));
    return console.log(`${cmd === "start" ? "validating" : "queued"} ${urls.length}`);
  }
  if (cmd === "set") {
    const url = rest[0];
    const sha = flag(rest, "sha");
    const issues = Number(flag(rest, "issues"));
    const attention = Number(flag(rest, "attention") ?? 0);
    const partial = rest.includes("--partial");
    if (!isPr(url) || !/^[0-9a-f]{7,40}$/.test(sha ?? "") || ![issues, attention].every((n) => Number.isInteger(n) && n >= 0))
      throw new Error('set <pr-url> --sha <head sha> --issues <n> [--attention <m>] [--partial] [--finding "<text>"]');
    const file = flag(rest, "report-file");
    const next = set(v, url, { sha, issues, attention, partial, finding: flag(rest, "finding"), report: file ? readFileSync(file === "-" ? 0 : file, "utf8") : "" }, now);
    write(next);
    // this file keeps only the last verdict of a PR; the history keeps each commit's
    addHistory({ kind: "verdict", url, sha, issues, attention, partial, finding: next.prs[url].finding, at: now });
    const said = issues ? `blocks ${issues}` : partial ? "partial" : "passed";
    return console.log(`${url}: ${said}${attention ? ` · attention ${attention}` : ""}`);
  }
  if (cmd === "human") {
    if (!rest.every(isPr)) throw new Error("human takes PR URLs: https://github.com/<owner>/<repo>/pull/<n>");
    write({ ...v, human: rest });
    return console.log(`left to humans: ${rest.length}`);
  }
  if (cmd === "fail") {
    const url = rest[0];
    if (!isPr(url)) throw new Error('fail <pr-url> --reason "<why>"');
    write(fail(v, url, flag(rest, "reason"), now));
    return console.log(`${url}: failed`);
  }
  if (cmd === "auto") {
    const every = flag(rest, "every") === undefined ? v.autoEvery : Number(flag(rest, "every"));
    if (!AUTO.includes(rest[0]) || !EVERY.includes(every)) throw new Error(`auto takes ${AUTO.join(" | ")} [--every ${EVERY.join(" | ")}]`);
    write({ ...v, auto: rest[0], autoEvery: every });
    return console.log(`auto-validate: ${rest[0]}${rest[0] === "off" ? "" : `, every ${every} min`}`);
  }
  if (cmd === "ran") {
    const count = Number(rest[0]);
    if (!Number.isInteger(count) || count < 0) throw new Error("ran <count>");
    write({ ...v, lastAuto: { at: now, count } });
    return console.log(`auto round: ${count}`);
  }
  throw new Error("usage: verdicts.mjs queue|start|set|fail|auto|ran|human|list (see the file head)");
}

const EMPTYv = () => structuredClone(EMPTY);
// the lock file exists while its holder runs
const withLockFree = (f) => {
  try {
    statSync(`${f}.lock`);
    return true;
  } catch {
    return false;
  }
};
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
  // a queued PR keeps the batch open too
  assert.equal(queue(EMPTYv(), [a], "q").prs[a].state, "queued");
  assert.deepEqual(start(queue(EMPTYv(), [a], "q"), [b], "q2").batch.urls, [a, b]);
  // b still runs: a new start joins the same batch
  v = start(v, [a], "t3");
  assert.deepEqual(v.batch.urls, [a, b]);
  v = set(set(v, a, { sha: "abc1234", issues: 0 }, "t4"), b, { sha: "def5678", issues: 0 }, "t4");
  // nothing runs: the next start is a batch of its own
  assert.deepEqual(start(v, [b], "t5").batch, { urls: [b], at: "t5" });
  assert.deepEqual(fail(start(v, [a], "t6"), a, " no access ", "t7").prs[a], { state: "failed", sha: "abc1234", issues: 0, attention: 0, partial: false, finding: "", reason: "no access", at: "t7" });
  assert.equal(isPr(a), true);
  assert.equal(isPr("acme/web#1"), false);
  // a write is whole, a broken file is an error and not an empty start, and the lock lets one in
  const dir = mkdtempSync(join(tmpdir(), "argos-verdicts-"));
  const f = join(dir, "v.json");
  assert.deepEqual(read(f).prs, {});
  write(set(EMPTYv(), a, { sha: "abc1234", issues: 0 }, "t"), f);
  assert.equal(read(f).prs[a].sha, "abc1234");
  writeFileSync(f, '{"prs":');
  assert.throws(() => read(f));
  assert.equal(withLock(() => "ran", f), "ran");
  assert.equal(withLock(() => withLockFree(f), f), true);
  rmSync(dir, { recursive: true, force: true });
  console.log("self-test ok");
}

// Run as a command only; merge.mjs imports read() and write() without triggering it.
if (isMain(import.meta.url)) {
  if (process.argv.includes("--self-test")) selfTest();
  else
    try {
      withLock(() => main(process.argv.slice(2)));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
}
