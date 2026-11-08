#!/usr/bin/env node
// Argos lessons: what reviewers kept asking on my merged PRs in one repo, gathered and counted
// as raw material for the lessons file. Read-only. The AI groups the asks into lessons; this
// script only collects them (through feedback.mjs' build) and counts by class, reviewer and area.
//
// Usage:
//   node lessons.mjs <owner/repo> [--author <login>] [--since YYYY-MM-DD] [--limit 20] [--account <gh login>] [--json]
//   node lessons.mjs --self-test
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { PR_FIELDS, build } from "./feedback.mjs";
import { isMain } from "./is-main.mjs";

const QUERY = `query($q: String!, $n: Int!) { search(query: $q, type: ISSUE, first: $n) { nodes { ... on PullRequest {${PR_FIELDS}
      mergedAt } } } }`;

// The folder an ask points at, two levels deep: where in the code reviewers keep looking.
export const area = (path) => (!path ? "(conversation)" : path.includes("/") ? `${path.split("/").slice(0, -1).slice(0, 2).join("/")}/` : "(root)");

const tally = (list, key) => Object.entries(list.reduce((m, a) => ((m[key(a)] = (m[key(a)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

// Raw merged PRs → every human ask with what it was before being addressed. Pure, for the self-test.
export function gather(prs, repo) {
  const asks = [];
  for (const pr of prs) {
    for (const i of build(pr, repo).plan.flatMap((g) => g.items)) {
      const cls = i.was ?? i.class;
      if (i.bot || cls === "praise") continue;
      asks.push({ pr: pr.number, url: i.url, by: i.by, class: cls, path: i.path, line: i.line, at: i.at, ask: i.ask.slice(0, 400) });
    }
  }
  return {
    repo,
    prs: prs.length,
    withFeedback: new Set(asks.map((a) => a.pr)).size,
    from: prs.map((p) => p.mergedAt).filter(Boolean).sort()[0] ?? null,
    asks: asks.length,
    byClass: tally(asks, (a) => a.class),
    byReviewer: tally(asks, (a) => a.by),
    byArea: tally(asks, (a) => area(a.path)),
    list: asks.sort((a, b) => a.at.localeCompare(b.at)),
  };
}

const cell = (s) => s.replace(/```suggestion[\s\S]*?```/g, "(suggestion block)").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

export function render(g) {
  const head = `## Review asks on my merged PRs in ${g.repo}\n\n${g.prs} merged PRs read${g.from ? ` (since ${g.from.slice(0, 10)})` : ""}, ${g.withFeedback} with feedback, ${g.asks} asks.`;
  if (!g.asks) return `${head}\n\n_No reviewer asks to learn from._`;
  const pairs = (t) => t.slice(0, 8).map(([k, n]) => `${k} ${n}`).join(" · ");
  const rows = g.list.map((a) => `| #${a.pr} | @${a.by} | ${a.class} | ${a.path ? `${a.path}${a.line ? `:${a.line}` : ""}` : "(conversation)"} | ${cell(a.ask)} |`);
  return [head, "", `**By class:** ${pairs(g.byClass)}`, `**By reviewer:** ${pairs(g.byReviewer)}`, `**By area:** ${pairs(g.byArea)}`, "",
    "| PR | By | Class | Where | Ask |", "|---|---|---|---|---|", ...rows].join("\n");
}

function main(args) {
  const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const repo = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    console.error("usage: node lessons.mjs <owner/repo> [--author <login>] [--since YYYY-MM-DD] [--limit 20] [--account <login>] [--json]");
    process.exit(2);
  }
  const env = { ...process.env };
  if (opt("--account")) env.GH_TOKEN = execFileSync("gh", ["auth", "token", "-u", opt("--account")], { encoding: "utf8" }).trim();
  const author = opt("--author") ?? execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", env }).trim();
  const limit = Math.min(Number(opt("--limit") ?? 20), 50);
  const q = `repo:${repo} is:pr is:merged author:${author}${opt("--since") ? ` merged:>=${opt("--since")}` : ""} sort:updated-desc`;
  // ponytail: one search page (up to 50 PRs, 100 threads each); --since covers the rest on later runs.
  const out = execFileSync("gh", ["api", "graphql", "-f", `query=${QUERY}`, "-f", `q=${q}`, "-F", `n=${limit}`], { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  const prs = JSON.parse(out).data.search.nodes.filter((n) => n.number);
  const g = gather(prs, repo);
  console.log(args.includes("--json") ? JSON.stringify(g, null, 2) : render(g));
}

function selfTest() {
  const u = (login, bot = false) => ({ login, __typename: bot ? "Bot" : "User" });
  const c = (login, body, createdAt, bot) => ({ body, createdAt, url: `u/${createdAt}`, author: u(login, bot) });
  const pr = (number, threads, comments = []) => ({
    number, title: "t", url: `pr/${number}`, state: "MERGED", isDraft: false, headRefName: "f", baseRefName: "main", mergeable: "UNKNOWN",
    reviewDecision: "APPROVED", author: u("me"), mergedAt: `2026-10-0${number}T00:00:00Z`,
    commits: { nodes: [{ commit: { oid: "a", committedDate: "2026-10-09T00:00:00Z", statusCheckRollup: null } }] },
    latestReviews: { nodes: [] },
    reviewThreads: { nodes: threads.map(([path, by, body, at, bot], i) => ({ id: `T${number}${i}`, isResolved: true, isOutdated: false, path, line: 3, comments: { nodes: [c(by, body, at, bot)] } })) },
    comments: { nodes: comments.map(([by, body, at], i) => ({ id: `C${number}${i}`, ...c(by, body, at) })) },
  });
  const g = gather([
    pr(1, [["src/cart/total.ts", "ana", "This must have a test.", "2026-10-01T00:00:00Z"], ["src/cart/total.ts", "copilot", "nit: spacing", "2026-10-01T01:00:00Z", true]]),
    pr(2, [["src/cart/coupon.ts", "ana", "Missing a test for the expired case.", "2026-10-02T00:00:00Z"], ["README.md", "bia", "nit: typo", "2026-10-02T01:00:00Z"]], [["bia", "LGTM", "2026-10-02T02:00:00Z"]]),
    pr(3, []),
  ], "acme/shop");
  assert.equal(g.prs, 3);
  assert.equal(g.withFeedback, 2);
  assert.equal(g.asks, 3); // the bot nit and the praise are left out
  assert.deepEqual(g.list.map((a) => a.class), ["blocking", "suggestion", "nit"]); // resolved threads keep what they were
  assert.deepEqual(g.byReviewer, [["ana", 2], ["bia", 1]]);
  assert.deepEqual(g.byArea, [["src/cart/", 2], ["(root)", 1]]);
  assert.equal(g.from, "2026-10-01T00:00:00Z");
  assert.equal(area(null), "(conversation)");
  assert.equal(area("a/b/c/d.ts"), "a/b/");
  const md = render(g);
  assert.match(md, /3 merged PRs read \(since 2026-10-01\), 2 with feedback, 3 asks/);
  assert.match(md, /\| #1 \| @ana \| blocking \| src\/cart\/total\.ts:3 \| This must have a test\. \|/);
  assert.match(render(gather([pr(3, [])], "acme/shop")), /No reviewer asks to learn from/);
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  args.includes("--self-test") ? selfTest() : main(args);
}
