#!/usr/bin/env node
// argos-pavo: one vigil round. Runs argos-ward over the connected repos, compares
// with the last round and prints only what is new. State lives outside any repo.
//
// Usage:
//   node pavo.mjs [extra search qualifiers...] [--account <gh login>] [--lang en|pt-BR] [--json]
//   node pavo.mjs --account me-at-work --lang en
//   node pavo.mjs --self-test
// The vigil only watches what was connected on purpose: repos.json next to the state
// (managed by repos.mjs) or explicit repo: qualifiers. With neither, it searches nothing.
// Every round also writes last-round.json next to the state (the Argos mod reads it).
// Env: ARGOS_PAVO_STATE overrides the state file path.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { label, langArg, t } from "../../argos-ward/scripts/i18n.mjs";
import { read as readRepos } from "./repos.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WARD = join(here, "..", "..", "argos-ward", "scripts", "ward.mjs");
const STATE = process.env.ARGOS_PAVO_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "pavo-state.json");

// State = signal codes per PR url: my PRs that need action, my review queue, teammates' PRs needing a look.
export function snapshot({ mine, toReview, others = [] }) {
  const s = {};
  for (const p of others) if (p.signals.length) s[p.url] = ["other", ...p.signals].join("|");
  for (const p of mine) if (p.signals.length) s[p.url] = [...p.signals].sort().join("|");
  for (const p of toReview) s[p.url] = ["review", ...p.signals].join("|");
  return s;
}

// New = a PR that now needs action and did not, or whose signals changed.
export function news(prev, ward) {
  const cur = snapshot(ward);
  const all = [...ward.mine, ...ward.toReview, ...(ward.others ?? [])];
  return all.filter((p) => cur[p.url] && cur[p.url] !== prev[p.url]);
}

// What a person reads about a PR: a review request says so, a teammate's PR names its author.
export function describe(p, lang = "en") {
  const words = p.signals.map((c) => label(lang, c));
  if (p.kind === "review") return [t(lang, "asks_review"), ...words].join(", ");
  if (p.kind === "other") return [`@${p.author}`, ...words].join(", ");
  return words.join(", ");
}

// repo: qualifiers for the connected repos, unless the caller already scoped the search.
export const repoQualifiers = (list, qualifiers) =>
  qualifiers.some((q) => q.startsWith("repo:")) ? [] : list.map((r) => `repo:${r.repo}`);

export function notification(items, lang = "en") {
  const parts = items.map((p) => `${p.repo.split("/")[1]}#${p.number} ${describe(p, lang)}`);
  const msg = `Argos: ${t(lang, "news", items.length)}: ${parts.join("; ")}`;
  return msg.length > 190 ? msg.slice(0, 187) + "..." : msg;
}

// Everything that needs action now, oldest first.
export const pending = (ward) => {
  const cur = snapshot(ward);
  return [...ward.mine, ...ward.toReview].filter((p) => cur[p.url]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
  let qualifiers = args.filter((a, j) => a !== "--json" && !flags.has(j));
  qualifiers = [...qualifiers, ...repoQualifiers(repos, qualifiers)];

  // Nothing connected: search nothing, so no account's PRs are read by accident.
  if (!qualifiers.some((q) => q.startsWith("repo:"))) {
    const round = { at, repos: [], pending: [], others: [], news: [], notify: null, needsRepos: true };
    writeFileSync(ROUND, JSON.stringify(round, null, 2));
    if (json) return console.log(JSON.stringify(round));
    return console.log(`ARGOS_PAVO: ${t(lang, "no_repos")}`);
  }

  let ward;
  try {
    const env = { ...process.env };
    if (account) env.GH_TOKEN = execFileSync("gh", ["auth", "token", "-u", account], { encoding: "utf8" }).trim();
    ward = JSON.parse(execFileSync("node", [WARD, ...qualifiers, "--json"], { encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024 }));
  } catch (err) {
    const error = String(err.stderr || err.message).trim().split("\n").pop();
    // keep the last good list visible, flagged with the error
    let last = {};
    try {
      last = JSON.parse(readFileSync(ROUND, "utf8"));
    } catch {}
    writeFileSync(ROUND, JSON.stringify({ ...last, at, error, news: [], notify: null }, null, 2));
    if (json) console.log(JSON.stringify({ at, error }));
    else console.error(`ARGOS_PAVO: ${t(lang, "error")}: ${error}`);
    process.exit(1);
  }

  let prev = {};
  try {
    prev = JSON.parse(readFileSync(STATE, "utf8"));
  } catch {} // first round: everything that needs action is new
  const items = news(prev, ward).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  writeFileSync(STATE, JSON.stringify(snapshot(ward), null, 2));
  const round = {
    at,
    me: ward.me,
    repos: repos.map((r) => r.repo),
    pending: pending(ward),
    others: ward.others ?? [],
    news: items,
    notify: items.length ? notification(items, lang) : null,
  };
  writeFileSync(ROUND, JSON.stringify(round, null, 2));

  if (json) return console.log(JSON.stringify(round));
  if (!items.length) return console.log(`ARGOS_PAVO: ${t(lang, "nothing_new")}`);
  console.log(`ARGOS_PAVO: ${t(lang, "news", items.length)}`);
  console.log(`NOTIFY: ${round.notify}`);
  for (const p of items) console.log(`- ${p.repo}#${p.number} ${p.title} | ${describe(p, lang)} | ${p.createdAt.slice(0, 10)} | ${p.url}`);
}

function selfTest() {
  const mine = (url, signals, createdAt = "2026-10-01") => ({ kind: "mine", url, repo: "acme/api", number: 1, title: "t", signals, createdAt });
  const rev = (url) => ({ kind: "review", url, repo: "acme/web", number: 2, title: "t", signals: [], createdAt: "2026-10-02" });
  const ward = { mine: [mine("a", ["conflict"]), mine("b", [])], toReview: [rev("r")] };

  // first round: every PR needing action is new, idle PRs are not
  assert.deepEqual(news({}, ward).map((p) => p.url), ["a", "r"]);
  // same state again: silence
  assert.deepEqual(news(snapshot(ward), ward), []);
  // signal changed on a PR: new again
  const changed = { ...ward, mine: [mine("a", ["conflict", "ci_failed"]), mine("b", [])] };
  assert.deepEqual(news(snapshot(ward), changed).map((p) => p.url), ["a"]);
  // signal order does not matter
  const reordered = { ...changed, mine: [mine("a", ["ci_failed", "conflict"]), mine("b", [])] };
  assert.deepEqual(news(snapshot(changed), reordered), []);
  // PR resolved then needing action again is new
  const resolved = { ...ward, mine: [mine("a", []), mine("b", [])] };
  assert.deepEqual(news(snapshot(resolved), ward).map((p) => p.url), ["a"]);
  // notification stays short, in either language
  const many = { mine: Array.from({ length: 30 }, (_, i) => mine(`u${i}`, ["changes_requested"])), toReview: [] };
  assert.ok(notification(news({}, many)).length <= 190);
  assert.equal(notification([rev("r")], "pt-BR"), "Argos: 1 novidade(s): web#2 pede sua revisão");
  assert.equal(notification([rev("r")], "en"), "Argos: 1 new: web#2 asks for your review");
  // a review request turning late is news once, then quiet
  const late = { ...ward, toReview: [{ ...rev("r"), signals: ["late"] }] };
  assert.deepEqual(news(snapshot(ward), late).map((p) => p.url), ["r"]);
  assert.deepEqual(news(snapshot(late), late), []);
  assert.equal(describe(late.toReview[0], "pt-BR"), "pede sua revisão, atrasada > 1 dia");
  assert.equal(describe(late.toReview[0], "en"), "asks for your review, late > 1 day");
  // pending lists everything needing action, oldest first, idle PRs left out
  assert.deepEqual(pending(ward).map((p) => p.url), ["a", "r"]);
  // teammates' PRs: news only when they start needing a look, never in the band's pending count
  const other = (url, signals) => ({ kind: "other", url, repo: "acme/api", number: 3, title: "t", author: "bia", signals, createdAt: "2026-10-03" });
  const team = { ...ward, others: [other("o1", []), other("o2", ["no_review"])] };
  assert.deepEqual(news(snapshot(ward), team).map((p) => p.url), ["o2"]);
  assert.deepEqual(pending(team).map((p) => p.url), ["a", "r"]);
  assert.equal(describe(team.others[1]), "@bia, no review > 1 day");
  // connected repos scope the search unless the caller already did
  assert.deepEqual(repoQualifiers([{ repo: "acme/api" }, { repo: "acme/web" }], ["--x"]), ["repo:acme/api", "repo:acme/web"]);
  assert.deepEqual(repoQualifiers([{ repo: "acme/api" }], ["repo:acme/web"]), []);
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
