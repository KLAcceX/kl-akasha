#!/usr/bin/env node
// argos-panoptes facts: the countable part of a PR, gathered fast through the GitHub CLI.
// Size, files, task key, risk hints and a suggested level. The model decides the real
// level after reading the task and the diff (see references/criticality.md).
//
// Usage:
//   node facts.mjs <pr-url | owner/repo#n> [--priority <task priority>] [--account <gh login>]
//   node facts.mjs --self-test
// Personal rubric: ~/.claude/kl-akasha/criticality.json (see references/criticality.md).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

export const LEVELS = ["low", "normal", "critical"];

// Default rubric: Jira's Priority field and the usual aliases.
export const DEFAULT_MAP = {
  highest: "critical", high: "critical", blocker: "critical", critical: "critical", p0: "critical", p1: "critical",
  medium: "normal", major: "normal", p2: "normal",
  low: "low", lowest: "low", minor: "low", trivial: "low", p3: "low", p4: "low",
};

// Paths that often carry a large blast radius. Hints only: the model confirms by reading the diff.
const RISK_PATHS = [
  /(^|\/)(auth|login|session|oauth|sso|permission|rbac|acl)/i,
  /(token|password|secret|credential|crypto)/i,
  /(payment|billing|checkout|invoice|stripe)/i,
  /(^|\/)(migrations?|schema\.prisma|.*\.sql$)/i,
  /(^|\/)middleware/i,
  /(^|\/)(\.env|docker-compose|dockerfile|\.github\/workflows|terraform|infra)/i,
];
const RISK_LABELS = /^(hotfix|security|incident|urgent|critical|p0|sev[ -]?[01])$/i;

// Above this many changed lines a careful review loses accuracy (Cisco/SmartBear study): review in parts.
export const CHUNK_LINES = 400;

export const parsePr = (ref) => {
  const url = ref.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (url) return { repo: url[1], number: Number(url[2]) };
  const short = ref.match(/^([^/\s]+\/[^#\s]+)#(\d+)$/);
  return short ? { repo: short[1], number: Number(short[2]) } : null;
};

// First Jira-style key (ABC-123) in the branch, then the title, then the body.
export const taskKey = (...texts) => texts.map((t) => (t ?? "").match(/\b[A-Z][A-Z0-9]+-\d+\b/)?.[0]).find(Boolean) ?? null;

export const riskSignals = (files, labels) => [
  ...labels.filter((l) => RISK_LABELS.test(l)).map((l) => `label:${l}`),
  ...[...new Set(files.filter((f) => RISK_PATHS.some((r) => r.test(f))))].map((f) => `path:${f}`),
];

// Suggested level: task priority through the repo's rubric (or the default), raised one step
// by risk hints, never lowered. No priority at all: normal, flagged as presumed.
export function level({ priority, rubric, signals }) {
  const map = rubric?.map ?? DEFAULT_MAP;
  const mapped = priority ? map[String(priority).trim().toLowerCase()] : undefined;
  const base = mapped ?? "normal";
  const raised = signals.length ? LEVELS[Math.min(LEVELS.indexOf(base) + 1, LEVELS.length - 1)] : base;
  return {
    suggestedLevel: raised,
    base,
    presumed: !mapped,
    source: mapped ? `${rubric ? "personal rubric" : "default rubric"}: priority "${priority}"` : priority ? `unknown priority "${priority}"` : "no priority found",
    raisedBy: raised !== base ? signals : [],
  };
}

// Files grouped into review parts of at most CHUNK_LINES changed lines (a big file is its own part).
export function chunks(files) {
  const parts = [];
  let cur = { files: [], lines: 0 };
  for (const f of files) {
    const n = f.additions + f.deletions;
    if (cur.files.length && cur.lines + n > CHUNK_LINES) {
      parts.push(cur);
      cur = { files: [], lines: 0 };
    }
    cur.files.push(f.path);
    cur.lines += n;
  }
  if (cur.files.length) parts.push(cur);
  return parts;
}

function readRubric(repo) {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".claude", "kl-akasha", "criticality.json"), "utf8"))[repo] ?? null;
  } catch {
    return null;
  }
}

function main(args) {
  const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const pr = parsePr(args.find((a) => !a.startsWith("--") && a !== opt("--priority") && a !== opt("--account")) ?? "");
  if (!pr) {
    console.error("usage: node facts.mjs <pr-url | owner/repo#n> [--priority <p>] [--account <login>]");
    process.exit(2);
  }
  const env = { ...process.env };
  if (opt("--account")) env.GH_TOKEN = execFileSync("gh", ["auth", "token", "-u", opt("--account")], { encoding: "utf8" }).trim();
  const fields = "number,title,body,url,isDraft,headRefName,baseRefName,author,labels,additions,deletions,changedFiles,files";
  const p = JSON.parse(execFileSync("gh", ["pr", "view", String(pr.number), "-R", pr.repo, "--json", fields], { encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024 }));

  const files = p.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));
  const labels = p.labels.map((l) => l.name);
  const signals = riskSignals(files.map((f) => f.path), labels);
  const rubric = readRubric(pr.repo);
  const lvl = level({ priority: opt("--priority"), rubric, signals });
  const lines = p.additions + p.deletions;

  console.log(
    JSON.stringify(
      {
        repo: pr.repo,
        number: p.number,
        url: p.url,
        title: p.title,
        author: p.author?.login,
        isDraft: p.isDraft,
        branch: p.headRefName,
        baseBranch: p.baseRefName,
        labels,
        taskKey: taskKey(p.headRefName, p.title, p.body),
        size: { lines, additions: p.additions, deletions: p.deletions, files: p.changedFiles },
        hasPersonalRubric: Boolean(rubric),
        ...lvl,
        riskSignals: signals,
        parts: lvl.suggestedLevel === "critical" && lines > CHUNK_LINES ? chunks(files) : null,
        files,
      },
      null,
      2,
    ),
  );
}

function selfTest() {
  assert.deepEqual(parsePr("https://github.com/acme/api/pull/42"), { repo: "acme/api", number: 42 });
  assert.deepEqual(parsePr("acme/api#7"), { repo: "acme/api", number: 7 });
  assert.equal(parsePr("nonsense"), null);

  assert.equal(taskKey("feature/PORT-123-login", "x", ""), "PORT-123");
  assert.equal(taskKey("fix/typo", "[ABC-9] typo", ""), "ABC-9");
  assert.equal(taskKey("main", "no key", "closes OPS-77"), "OPS-77");
  assert.equal(taskKey("main", "utf-8 fix", ""), null);

  const risky = riskSignals(["src/auth/session.ts", "README.md", "db/migrations/001.sql"], ["hotfix", "docs"]);
  assert.deepEqual(risky, ["label:hotfix", "path:src/auth/session.ts", "path:db/migrations/001.sql"]);
  assert.deepEqual(riskSignals(["src/ui/button.tsx"], ["feature"]), []);

  // default rubric, no signals
  assert.equal(level({ priority: "High", signals: [] }).suggestedLevel, "critical");
  assert.equal(level({ priority: "Medium", signals: [] }).suggestedLevel, "normal");
  assert.equal(level({ priority: "lowest", signals: [] }).suggestedLevel, "low");
  // signals raise one step, never lower
  const raised = level({ priority: "Low", signals: ["label:security"] });
  assert.equal(raised.suggestedLevel, "normal");
  assert.deepEqual(raised.raisedBy, ["label:security"]);
  assert.equal(level({ priority: "Highest", signals: ["path:x/auth.ts"] }).suggestedLevel, "critical");
  // nothing known: normal, presumed
  const none = level({ signals: [] });
  assert.equal(none.suggestedLevel, "normal");
  assert.equal(none.presumed, true);
  assert.equal(level({ priority: "Someday", signals: [] }).source, 'unknown priority "Someday"');
  // usual aliases
  assert.equal(level({ priority: "Blocker", signals: [] }).suggestedLevel, "critical");
  assert.equal(level({ priority: "P3", signals: [] }).suggestedLevel, "low");
  // a personal rubric wins over the default
  const rubric = { map: { blocker: "critical", p2: "low" } };
  assert.equal(level({ priority: "Blocker", rubric, signals: [] }).suggestedLevel, "critical");
  assert.equal(level({ priority: "P2", rubric, signals: [] }).source, 'personal rubric: priority "P2"');

  // parts never exceed the limit unless one file alone does
  const parts = chunks([
    { path: "a", additions: 300, deletions: 0 },
    { path: "b", additions: 150, deletions: 0 },
    { path: "c", additions: 900, deletions: 0 },
    { path: "d", additions: 10, deletions: 5 },
  ]);
  assert.deepEqual(parts.map((p) => p.files), [["a"], ["b"], ["c"], ["d"]]);
  assert.deepEqual(chunks([{ path: "a", additions: 100, deletions: 100 }, { path: "b", additions: 100, deletions: 50 }]).length, 1);
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
