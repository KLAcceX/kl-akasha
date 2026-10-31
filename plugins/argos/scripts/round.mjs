#!/usr/bin/env node
// Argos round: one vigil round. Runs queue.mjs over the connected repos, compares
// with the last round and prints only what is new. State lives outside any repo.
//
// Usage:
//   node round.mjs [extra search qualifiers...] [--account <gh login>] [--lang en|pt-BR] [--json]
//   node round.mjs --account me-at-work --lang en
//   node round.mjs --self-test
// The vigil only watches what was connected on purpose: repos.json next to the state
// (managed by repos.mjs) or explicit repo: qualifiers. With neither, it searches nothing.
// Every round also writes last-round.json next to the state (the Argos mod reads it).
// Env: ARGOS_STATE overrides the state file path.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { label, langArg, t } from "./i18n.mjs";
import { read as readRepos } from "./repos.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const QUEUE = join(here, "queue.mjs");
const STATE = process.env.ARGOS_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "state.json");

// State = signal codes per PR url: my PRs that need action, my review queue, teammates' PRs needing a look.
export function snapshot({ mine, toReview, others = [] }) {
  const s = {};
  for (const p of others) if (p.signals.length) s[p.url] = ["other", ...p.signals].join("|");
  for (const p of mine) if (p.signals.length) s[p.url] = [...p.signals].sort().join("|");
  for (const p of toReview) s[p.url] = ["review", ...p.signals].join("|");
  return s;
}

// New = a PR that now needs action and did not, or whose signals changed.
export function news(prev, queue) {
  const cur = snapshot(queue);
  const all = [...queue.mine, ...queue.toReview, ...(queue.others ?? [])];
  return all.filter((p) => cur[p.url] && cur[p.url] !== prev[p.url]);
}

// What a person reads about a PR: a review request says so, a teammate's PR names its author.
export function describe(p, lang = "en") {
  const words = p.signals.map((c) => label(lang, c));
  if (p.kind === "review") return [t(lang, "asks_review"), ...words].join(", ");
  if (p.kind === "other") return [`@${p.author}`, ...words].join(", ");
  return words.join(", ");
}

// One search per gh account: each connected repo is read as the account it was connected
// with (repos.json), else the vigil's; repo: qualifiers the caller passed go as the vigil's.
export function groups(list, qualifiers, account) {
  if (qualifiers.some((q) => q.startsWith("repo:"))) return [[account, qualifiers]];
  const by = new Map();
  for (const r of list) {
    const a = r.account || account || "";
    by.set(a, [...(by.get(a) ?? []), `repo:${r.repo}`]);
  }
  return [...by].map(([a, repos]) => [a || undefined, [...qualifiers, ...repos]]);
}

// The searches of every account as one queue.
export const merge = (queues) => ({
  me: queues[0]?.me,
  mine: queues.flatMap((q) => q.mine),
  toReview: queues.flatMap((q) => q.toReview),
  others: queues.flatMap((q) => q.others ?? []),
});

export function notification(items, lang = "en") {
  const parts = items.map((p) => `${p.repo.split("/")[1]}#${p.number} ${describe(p, lang)}`);
  const msg = `Argos: ${t(lang, "news", items.length)}: ${parts.join("; ")}`;
  return msg.length > 190 ? msg.slice(0, 187) + "..." : msg;
}

// Everything that needs action now, oldest first.
export const pending = (queue) => {
  const cur = snapshot(queue);
  return [...queue.mine, ...queue.toReview].filter((p) => cur[p.url]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

function main(args) {
  const at = new Date().toISOString();
  const ROUND = join(dirname(STATE), "last-round.json");
  mkdirSync(dirname(STATE), { recursive: true });
  const json = args.includes("--json");
  const lang = langArg(args);
  const flags = new Set();
  for (const f of ["--account", "--lang"]) {
    const i = args.indexOf(f);
    if (i >= 0) flags.add(i).add(i + 1);
  }
  const account = args.includes("--account") ? args[args.indexOf("--account") + 1] : undefined;
  const repos = readRepos();
  const plan = groups(repos, args.filter((a, j) => a !== "--json" && !flags.has(j)), account);

  // Nothing connected: search nothing, so no account's PRs are read by accident.
  if (!plan.length) {
    const round = { at, okAt: at, repos: [], pending: [], mine: [], others: [], news: [], notify: null, needsRepos: true };
    writeFileSync(ROUND, JSON.stringify(round, null, 2));
    if (json) return console.log(JSON.stringify(round));
    return console.log(`ARGOS: ${t(lang, "no_repos")}`);
  }

  let queue;
  try {
    queue = merge(
      plan.map(([login, qualifiers]) => {
        const env = { ...process.env };
        if (login) env.GH_TOKEN = execFileSync("gh", ["auth", "token", "-u", login], { encoding: "utf8" }).trim();
        return JSON.parse(execFileSync("node", [QUEUE, ...qualifiers, "--json"], { encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024 }));
      }),
    );
  } catch (err) {
    const error = String(err.stderr || err.message).trim().split("\n").pop();
    // keep the last good list visible, flagged with the error
    let last = {};
    try {
      last = JSON.parse(readFileSync(ROUND, "utf8"));
    } catch {}
    // `at` is this failed attempt; `okAt` stays the last round that worked, so the pane never passes old data off as fresh
    writeFileSync(ROUND, JSON.stringify({ ...last, at, okAt: last.okAt ?? null, error, news: [], notify: null }, null, 2));
    if (json) console.log(JSON.stringify({ at, error }));
    else console.error(`ARGOS: ${t(lang, "error")}: ${error}`);
    process.exit(1);
  }

  let prev = {};
  try {
    prev = JSON.parse(readFileSync(STATE, "utf8"));
  } catch {} // first round: everything that needs action is new
  const items = news(prev, queue).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  writeFileSync(STATE, JSON.stringify(snapshot(queue), null, 2));
  const round = {
    at,
    okAt: at,
    me: queue.me,
    repos: repos.map((r) => r.repo),
    pending: pending(queue),
    // every open PR of mine, signals or not: the pane counts and charts them
    mine: queue.mine,
    others: queue.others ?? [],
    news: items,
    notify: items.length ? notification(items, lang) : null,
  };
  writeFileSync(ROUND, JSON.stringify(round, null, 2));

  if (json) return console.log(JSON.stringify(round));
  if (!items.length) return console.log(`ARGOS: ${t(lang, "nothing_new")}`);
  console.log(`ARGOS: ${t(lang, "news", items.length)}`);
  console.log(`NOTIFY: ${round.notify}`);
  for (const p of items) console.log(`- ${p.repo}#${p.number} ${p.title} | ${describe(p, lang)} | ${p.createdAt.slice(0, 10)} | ${p.url}`);
}

function selfTest() {
  const mine = (url, signals, createdAt = "2026-10-01") => ({ kind: "mine", url, repo: "acme/api", number: 1, title: "t", signals, createdAt });
  const rev = (url) => ({ kind: "review", url, repo: "acme/web", number: 2, title: "t", signals: [], createdAt: "2026-10-02" });
  const queue = { mine: [mine("a", ["conflict"]), mine("b", [])], toReview: [rev("r")] };

  // first round: every PR needing action is new, idle PRs are not
  assert.deepEqual(news({}, queue).map((p) => p.url), ["a", "r"]);
  // same state again: silence
  assert.deepEqual(news(snapshot(queue), queue), []);
  // signal changed on a PR: new again
  const changed = { ...queue, mine: [mine("a", ["conflict", "ci_failed"]), mine("b", [])] };
  assert.deepEqual(news(snapshot(queue), changed).map((p) => p.url), ["a"]);
  // signal order does not matter
  const reordered = { ...changed, mine: [mine("a", ["ci_failed", "conflict"]), mine("b", [])] };
  assert.deepEqual(news(snapshot(changed), reordered), []);
  // PR resolved then needing action again is new
  const resolved = { ...queue, mine: [mine("a", []), mine("b", [])] };
  assert.deepEqual(news(snapshot(resolved), queue).map((p) => p.url), ["a"]);
  // notification stays short, in either language
  const many = { mine: Array.from({ length: 30 }, (_, i) => mine(`u${i}`, ["changes_requested"])), toReview: [] };
  assert.ok(notification(news({}, many)).length <= 190);
  assert.equal(notification([rev("r")], "pt-BR"), "Argos: 1 novidade(s): web#2 pede sua revisão");
  assert.equal(notification([rev("r")], "en"), "Argos: 1 new: web#2 asks for your review");
  // a review request turning late is news once, then quiet
  const late = { ...queue, toReview: [{ ...rev("r"), signals: ["late"] }] };
  assert.deepEqual(news(snapshot(queue), late).map((p) => p.url), ["r"]);
  assert.deepEqual(news(snapshot(late), late), []);
  assert.equal(describe(late.toReview[0], "pt-BR"), "pede sua revisão, atrasada > 1 dia");
  assert.equal(describe(late.toReview[0], "en"), "asks for your review, late > 1 day");
  // pending lists everything needing action, oldest first, idle PRs left out
  assert.deepEqual(pending(queue).map((p) => p.url), ["a", "r"]);
  // teammates' PRs: news only when they start needing a look, never in the band's pending count
  const other = (url, signals) => ({ kind: "other", url, repo: "acme/api", number: 3, title: "t", author: "bia", signals, createdAt: "2026-10-03" });
  const team = { ...queue, others: [other("o1", []), other("o2", ["no_review"])] };
  assert.deepEqual(news(snapshot(queue), team).map((p) => p.url), ["o2"]);
  assert.deepEqual(pending(team).map((p) => p.url), ["a", "r"]);
  assert.equal(describe(team.others[1]), "@bia, no review > 1 day");
  // connected repos scope the search, one search per account, unless the caller already scoped it
  assert.deepEqual(groups([{ repo: "acme/api" }, { repo: "acme/web" }], ["--x"], "me"), [["me", ["--x", "repo:acme/api", "repo:acme/web"]]]);
  assert.deepEqual(groups([{ repo: "acme/api", account: "work" }, { repo: "me/lib" }], [], undefined), [
    ["work", ["repo:acme/api"]],
    [undefined, ["repo:me/lib"]],
  ]);
  assert.deepEqual(groups([{ repo: "acme/api" }], ["repo:acme/web"], "me"), [["me", ["repo:acme/web"]]]);
  assert.deepEqual(groups([], [], "me"), []);
  assert.deepEqual(merge([{ me: "a", mine: [1], toReview: [] }, { me: "b", mine: [2], toReview: [3], others: [4] }]), { me: "a", mine: [1, 2], toReview: [3], others: [4] });
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
