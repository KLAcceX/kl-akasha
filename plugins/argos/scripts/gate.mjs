#!/usr/bin/env node
// Argos gate: layer 0 of a validation, a script with no model in it. It reads the PR's diff,
// checks and size, and finds what must stop a merge whatever else is true: a secret pasted
// in, a CI workflow that hands a PR write access. Cheap, so it always runs, also on a PR the
// rest of the triage will not read ("not reviewable"): not reviewable never means not leaked.
//
// Usage:
//   node gate.mjs <pr-url | owner/repo#n> [--account <gh login>] [--json]
//   node gate.mjs --self-test
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

// A PR link or owner/repo#n (as facts.mjs reads it; importing facts.mjs would run its CLI).
const parsePr = (ref) => {
  const url = ref.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (url) return { repo: url[1], number: Number(url[2]) };
  const short = ref.match(/^([^/\s]+\/[^#\s]+)#(\d+)$/);
  return short ? { repo: short[1], number: Number(short[2]) } : null;
};

// Past this many changed lines the triage reads nothing and says why.
export const TOO_BIG = 1000;

// Secrets: the key shapes that are a leak the moment they reach the remote. The finding says
// to rotate the key: a later commit that removes it leaves it in the history.
const SECRETS = [
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Stripe or OpenAI-style key", /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}|\bsk-[A-Za-z0-9_-]{32,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["password in code", /\b(password|passwd|secret|api_?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];
// CI workflows that hand an outside PR more than it should have.
const WORKFLOW = [
  ["pull_request_target runs with write access on the PR's code", /pull_request_target/],
  ["workflow asks for write-all", /permissions:\s*write-all/],
  ["event text interpolated into a shell step", /run:.*\$\{\{\s*github\.event\./],
];
// Worth a look, not a stop: most repos pin actions by tag, so every bump a bot opens would block.
const WATCH = [["action not pinned to a commit SHA", /uses:\s*(?!\.\/|docker:\/\/)[^@\s]+@(?![0-9a-f]{40}\b)\S+/]];

// The added lines of a unified diff, by file, with their line numbers in the new file.
export function addedLines(diff) {
  const out = [];
  let file = null;
  let line = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) file = raw.slice(4).replace(/^b\//, "");
    else if (raw.startsWith("@@")) line = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0) - 1;
    else if (raw.startsWith("+") && file) out.push({ file, line: ++line, text: raw.slice(1) });
    else if (!raw.startsWith("-")) line++;
  }
  return out;
}

// What the gate finds in a diff: secrets anywhere, risky workflow lines under .github/workflows,
// and a .env file added.
export function scan(diff) {
  const found = [];
  for (const { file, line, text } of addedLines(diff)) {
    for (const [what, rx] of SECRETS) if (rx.test(text)) found.push({ kind: "secret", what, at: `${file}:${line}` });
    if (/^\.github\/workflows\//.test(file)) {
      for (const [what, rx] of WORKFLOW) if (rx.test(text)) found.push({ kind: "workflow", what, at: `${file}:${line}` });
      for (const [what, rx] of WATCH) if (rx.test(text)) found.push({ kind: "workflow", what, at: `${file}:${line}`, attention: true });
    }
  }
  for (const m of diff.matchAll(/^\+\+\+ b\/((?:.*\/)?\.env(?:\.[\w-]+)?)$/gm))
    if (!/\.(example|sample|template)$/.test(m[1])) found.push({ kind: "secret", what: ".env file added", at: m[1] });
  return found;
}

// The gate's answer: blockers it found, and whether the rest of the triage may read the PR.
export function verdict({ found, size, checks }) {
  const failing = checks.filter((c) => ["FAILURE", "ERROR", "fail"].includes(c.state ?? c.bucket));
  const reasons = [
    ...(size > TOO_BIG ? [`${size} changed lines, past ${TOO_BIG}: split it before an AI or a person reads it`] : []),
    ...(failing.length ? [`CI failing: ${failing.map((c) => c.name).join(", ")}`] : []),
  ];
  return { blockers: found.filter((f) => !f.attention), attention: found.filter((f) => f.attention), reviewable: reasons.length === 0, reasons };
}

function gh(args, env) {
  return execFileSync("gh", args, { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
}

function main(args) {
  const ref = args.find((a) => !a.startsWith("--") && a !== opt(args, "--account"));
  const pr = ref && parsePr(ref);
  if (!pr) throw new Error("usage: node gate.mjs <pr-url | owner/repo#n> [--account <gh login>] [--json]");
  const env = { ...process.env };
  if (opt(args, "--account")) env.GH_TOKEN = gh(["auth", "token", "-u", opt(args, "--account")], env).trim();
  const R = ["-R", pr.repo];
  const meta = JSON.parse(gh(["pr", "view", String(pr.number), ...R, "--json", "additions,deletions"], env));
  let checks = [];
  try {
    checks = JSON.parse(gh(["pr", "checks", String(pr.number), ...R, "--json", "name,state,bucket"], env));
  } catch {
    // no checks configured: nothing failing
  }
  const out = verdict({ found: scan(gh(["pr", "diff", String(pr.number), ...R], env)), size: meta.additions + meta.deletions, checks });
  if (args.includes("--json")) return console.log(JSON.stringify(out, null, 2));
  for (const b of out.blockers) console.log(`BLOCKER ${b.kind}: ${b.what} (${b.at})${b.kind === "secret" ? " — rotate it: removing it later leaves it in the history" : ""}`);
  for (const a of out.attention) console.log(`ATTENTION ${a.kind}: ${a.what} (${a.at})`);
  console.log(out.reviewable ? "reviewable" : `not reviewable: ${out.reasons.join("; ")}`);
}

const opt = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function selfTest() {
  const diff = [
    "diff --git a/src/pay.ts b/src/pay.ts",
    "+++ b/src/pay.ts",
    "@@ -1,2 +1,3 @@",
    " const a = 1",
    `+const key = "AKIA${"ABCDEFGHIJKLMNOP"}"`,
    " const b = 2",
    "diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml",
    "+++ b/.github/workflows/ci.yml",
    "@@ -0,0 +1,3 @@",
    "+on: pull_request_target",
    "+    - uses: actions/checkout@v4",
    "+    - uses: actions/setup-node@0123456789abcdef0123456789abcdef01234567",
    "diff --git a/.env b/.env",
    "+++ b/.env",
    "@@ -0,0 +1 @@",
    "+X=1",
    "diff --git a/.env.example b/.env.example",
    "+++ b/.env.example",
    "@@ -0,0 +1 @@",
    "+X=",
  ].join("\n");
  const found = scan(diff);
  assert.deepEqual(found.map((f) => [f.kind, f.at]), [
    ["secret", "src/pay.ts:2"],
    ["workflow", ".github/workflows/ci.yml:1"],
    ["workflow", ".github/workflows/ci.yml:2"],
    ["secret", ".env"],
  ]);
  // not reviewable still carries the blockers
  const v = verdict({ found, size: 1500, checks: [{ name: "test", state: "FAILURE" }] });
  assert.equal(v.reviewable, false);
  assert.equal(v.blockers.length, 3);
  assert.deepEqual(v.attention.map((a) => a.at), [".github/workflows/ci.yml:2"]);
  assert.equal(v.reasons.length, 2);
  assert.equal(verdict({ found: [], size: 10, checks: [{ name: "lint", state: "SUCCESS" }] }).reviewable, true);
  assert.deepEqual(parsePr("acme/web#7"), { repo: "acme/web", number: 7 });
  console.log("self-test ok");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--self-test")) selfTest();
  else
    try {
      main(process.argv.slice(2));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
}
