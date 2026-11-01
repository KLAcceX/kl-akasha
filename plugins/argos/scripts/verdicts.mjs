#!/usr/bin/env node
// Argos verdicts: what the last AI validation of each PR found, kept beside the vigil's state
// so the pane shows it on every row. The AI writes them while it validates; the pane reads them.
//
// Usage:
//   node verdicts.mjs start <pr-url>...                          marks them as being validated
//   node verdicts.mjs set <pr-url> --sha <head sha> --issues <n> [--finding "<top finding>"]
//   node verdicts.mjs auto <off|mine|all>                        revalidate new commits by itself
//   node verdicts.mjs list                                       prints the file as JSON
//   node verdicts.mjs --self-test
// Env: ARGOS_STATE overrides the state file path (verdicts.json sits beside it).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
const write = (v, file = FILE) => {
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

export function set(v, url, { sha, issues, finding = "" }, now) {
  return { ...v, prs: { ...v.prs, [url]: { state: "done", sha, issues, finding: finding.trim().slice(0, 160), at: now } } };
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
    if (!isPr(url) || !/^[0-9a-f]{7,40}$/.test(sha ?? "") || !Number.isInteger(issues) || issues < 0)
      throw new Error('set <pr-url> --sha <head sha> --issues <n> [--finding "<text>"]');
    write(set(v, url, { sha, issues, finding: flag(rest, "finding") }, now));
    return console.log(`${url}: ${issues ? `${issues} issue(s)` : "passed"}`);
  }
  if (cmd === "auto") {
    if (!AUTO.includes(rest[0])) throw new Error(`auto takes ${AUTO.join(" | ")}`);
    write({ ...v, auto: rest[0] });
    return console.log(`auto-validate: ${rest[0]}`);
  }
  throw new Error("usage: verdicts.mjs start|set|auto|list (see the file head)");
}

function selfTest() {
  const a = "https://github.com/acme/web/pull/1";
  const b = "https://github.com/acme/web/pull/2";
  let v = structuredClone(EMPTY);
  v = start(v, [a, b], "t1");
  assert.deepEqual(v.batch, { urls: [a, b], at: "t1" });
  assert.equal(v.prs[a].state, "running");
  v = set(v, a, { sha: "abc1234", issues: 2, finding: "  no backoff cap  " }, "t2");
  assert.deepEqual(v.prs[a], { state: "done", sha: "abc1234", issues: 2, finding: "no backoff cap", at: "t2" });
  // b still runs: a new start joins the same batch
  v = start(v, [a], "t3");
  assert.deepEqual(v.batch.urls, [a, b]);
  v = set(set(v, a, { sha: "abc1234", issues: 0 }, "t4"), b, { sha: "def5678", issues: 0 }, "t4");
  // nothing runs: the next start is a batch of its own
  assert.deepEqual(start(v, [b], "t5").batch, { urls: [b], at: "t5" });
  assert.equal(isPr(a), true);
  assert.equal(isPr("acme/web#1"), false);
  console.log("self-test ok");
}

if (process.argv.includes("--self-test")) selfTest();
else
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
