#!/usr/bin/env node
// Argos history: only what GitHub does not know. PRs, their age and their reviews stay on GitHub
// and are asked for when needed; this keeps the verdict of each commit, so what the AI said can be
// compared later with what happened, the report and the run it belongs to, what Argos posted and
// merged in the person's name, and the tokens each agent spent, so a round has a cost.
//
// Usage:
//   node history.mjs usage --kind validate|fix --prs <n> --model <id> --input <n> --output <n> --cache-read <n> --cache-write <n>
//   node history.mjs stats [--days 30] [--lang pt-BR|en]    tokens and verdicts of the last days
//   node history.mjs verdicts [<pr-url>]                    the verdicts kept, one JSON per line
//   node history.mjs --self-test
// verdicts.mjs adds a verdict or a failure each time one is recorded, publish.mjs and merge.mjs what they
// did. The pane reads the file for its History page. Env: ARGOS_STATE, as the other scripts.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { langArg, t } from "./i18n.mjs";
import { isMain } from "./is-main.mjs";

const STATE = process.env.ARGOS_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "state.json");
const FILE = join(dirname(STATE), "history.jsonl");
// ponytail: the oldest lines go past this; about 1 MB, years of verdicts for one person
const KEEP = 5000;

export const readAll = (file = FILE) => {
  try {
    return readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
};

export function add(entry, file = FILE, keep = KEEP) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  if (lines.length > keep) writeFileSync(file, `${lines.slice(-keep).join("\n")}\n`);
}

const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

// What the last days came to. A commit validated twice counts once, by its last verdict.
export function summary(entries, since) {
  const recent = entries.filter((e) => Date.parse(e.at) >= since);
  const usage = recent.filter((e) => e.kind === "usage");
  const tokens = (e) => (e.input ?? 0) + (e.output ?? 0) + (e.cacheRead ?? 0) + (e.cacheWrite ?? 0);
  const of = (kind) => usage.filter((e) => e.agent === kind).reduce((n, e) => n + tokens(e), 0);
  const last = new Map();
  for (const e of recent) if (e.kind === "verdict") last.set(`${e.url}@${e.sha}`, e);
  const verdicts = [...last.values()];
  return {
    runs: usage.length,
    prs: usage.reduce((n, e) => n + (e.prs ?? 0), 0),
    validate: of("validate"),
    fix: of("fix"),
    commits: verdicts.length,
    passed: verdicts.filter((e) => !e.issues && !e.attention && !e.partial).length,
    blocked: verdicts.filter((e) => e.issues > 0).length,
    attention: verdicts.filter((e) => !e.issues && e.attention > 0).length,
    partial: verdicts.filter((e) => !e.issues && !e.attention && e.partial).length,
  };
}

const flag = (args, name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const count = (args, name) => {
  const n = Number(flag(args, name) ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function main(args) {
  const [cmd, ...rest] = args;
  if (cmd === "usage") {
    const agent = flag(rest, "kind");
    if (agent !== "validate" && agent !== "fix") throw new Error("usage --kind validate|fix --prs <n> --model <id> --input <n> --output <n> --cache-read <n> --cache-write <n>");
    return add({
      kind: "usage",
      agent,
      prs: count(rest, "prs"),
      model: flag(rest, "model") ?? "",
      input: count(rest, "input"),
      output: count(rest, "output"),
      cacheRead: count(rest, "cache-read"),
      cacheWrite: count(rest, "cache-write"),
      at: new Date().toISOString(),
    });
  }
  if (cmd === "verdicts") {
    const lines = readAll().filter((e) => e.kind === "verdict" && (!rest[0] || e.url === rest[0]));
    return console.log(lines.map((e) => JSON.stringify(e)).join("\n"));
  }
  if (cmd === "stats") {
    const lang = langArg(rest);
    const days = count(rest, "days") || 30;
    const s = summary(readAll(), Date.now() - days * 864e5);
    if (!s.runs && !s.commits) return console.log(`Argos: ${t(lang, "st_none", days)}`);
    return console.log(
      [
        `Argos: ${t(lang, "st_title", days)}`,
        `- ${t(lang, "st_tokens", compact(s.validate + s.fix), s.runs, s.prs, compact(s.validate), compact(s.fix))}`,
        `- ${t(lang, "st_verdicts", s.commits, s.passed, s.blocked, s.attention, s.partial)}`,
      ].join("\n"),
    );
  }
  throw new Error("usage: history.mjs usage|stats|verdicts (see the file head)");
}

function selfTest() {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const at = (d) => new Date(now - d * 864e5).toISOString();
  const entries = [
    { kind: "usage", agent: "validate", prs: 3, input: 100, output: 50, cacheRead: 800, cacheWrite: 50, at: at(1) },
    { kind: "usage", agent: "fix", prs: 1, input: 10, output: 5, cacheRead: 0, cacheWrite: 0, at: at(2) },
    { kind: "usage", agent: "validate", prs: 9, input: 9999, output: 0, at: at(60) },
    { kind: "verdict", url: "u1", sha: "a", issues: 2, attention: 0, partial: false, at: at(3) },
    // the same commit again: its last verdict counts
    { kind: "verdict", url: "u1", sha: "a", issues: 0, attention: 0, partial: false, at: at(2) },
    { kind: "verdict", url: "u1", sha: "b", issues: 1, attention: 0, partial: false, at: at(1) },
    { kind: "verdict", url: "u2", sha: "c", issues: 0, attention: 1, partial: false, at: at(1) },
    { kind: "verdict", url: "u3", sha: "d", issues: 0, attention: 0, partial: true, at: at(1) },
  ];
  assert.deepEqual(summary(entries, now - 30 * 864e5), { runs: 2, prs: 4, validate: 1000, fix: 15, commits: 4, passed: 1, blocked: 1, attention: 1, partial: 1 });
  assert.equal(compact(1500000), "1.5M");
  assert.equal(compact(1500), "2k");
  assert.equal(compact(15), "15");
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--self-test")) selfTest();
  else
    try {
      main(process.argv.slice(2));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
}
