#!/usr/bin/env node
// argos-pavo: one vigil round. Runs argos-ward, compares with the last round
// and prints only what is new. State lives outside any repo.
//
// Usage:
//   node pavo.mjs [extra search qualifiers...] [--account <gh login>] [--json]
//   node pavo.mjs org:acme --account me-at-work
//   node pavo.mjs --self-test
// Every round also writes last-round.json next to the state (the Argos mod reads it).
// Env: ARGOS_PAVO_STATE overrides the state file path.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const WARD = join(here, "..", "..", "argos-ward", "scripts", "ward.mjs");
const STATE = process.env.ARGOS_PAVO_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "pavo-state.json");

// State = { [url]: "signal|signal" } for my PRs that need action, plus { [url]: "review|..." } for my review queue.
export function snapshot({ mine, toReview }) {
  const s = {};
  for (const p of mine) if (p.signals.length) s[p.url] = [...p.signals].sort().join("|");
  for (const p of toReview) s[p.url] = ["review", ...p.signals].join("|");
  return s;
}

// New = a PR that now needs action and did not, or whose signals changed.
export function news(prev, ward) {
  const cur = snapshot(ward);
  const all = [...ward.mine, ...ward.toReview];
  return all.filter((p) => cur[p.url] && cur[p.url] !== prev[p.url]);
}

// A review request reads as such, plus its lateness when late.
export const describe = (p) => (p.kind === "review" ? ["pede sua revisão", ...p.signals].join(", ") : p.signals.join(", "));

export function notification(items) {
  const parts = items.map((p) => `${p.repo.split("/")[1]}#${p.number} ${describe(p)}`);
  let msg = `Argos: ${items.length} novidade(s): ${parts.join("; ")}`;
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
  const i = args.indexOf("--account");
  const account = i >= 0 ? args[i + 1] : undefined;
  const qualifiers = args.filter((a, j) => a !== "--json" && j !== i && j !== i + 1);

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
    else console.error(`ARGOS_PAVO: erro: ${error}`);
    process.exit(1);
  }

  let prev = {};
  try {
    prev = JSON.parse(readFileSync(STATE, "utf8"));
  } catch {} // first round: everything that needs action is new
  const items = news(prev, ward).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  writeFileSync(STATE, JSON.stringify(snapshot(ward), null, 2));
  const round = { at, me: ward.me, pending: pending(ward), news: items, notify: items.length ? notification(items) : null };
  writeFileSync(ROUND, JSON.stringify(round, null, 2));

  if (json) return console.log(JSON.stringify(round));
  if (!items.length) return console.log("ARGOS_PAVO: nada novo");
  console.log(`ARGOS_PAVO: ${items.length} novidade(s)`);
  console.log(`NOTIFY: ${round.notify}`);
  for (const p of items) {
    const what = describe(p);
    console.log(`- ${p.repo}#${p.number} ${p.title} | ${what} | aberto em ${p.createdAt.slice(0, 10)} | ${p.url}`);
  }
}

function selfTest() {
  const mine = (url, signals, createdAt = "2026-10-01") => ({ kind: "mine", url, repo: "acme/api", number: 1, title: "t", signals, createdAt });
  const rev = (url) => ({ kind: "review", url, repo: "acme/web", number: 2, title: "t", signals: [], createdAt: "2026-10-02" });
  const ward = { mine: [mine("a", ["conflito"]), mine("b", [])], toReview: [rev("r")] };

  // first round: every PR needing action is new, idle PRs are not
  assert.deepEqual(news({}, ward).map((p) => p.url), ["a", "r"]);
  // same state again: silence
  assert.deepEqual(news(snapshot(ward), ward), []);
  // signal changed on a PR: new again
  const changed = { ...ward, mine: [mine("a", ["conflito", "CI falhou"]), mine("b", [])] };
  assert.deepEqual(news(snapshot(ward), changed).map((p) => p.url), ["a"]);
  // signal order does not matter
  const reordered = { ...changed, mine: [mine("a", ["CI falhou", "conflito"]), mine("b", [])] };
  assert.deepEqual(news(snapshot(changed), reordered), []);
  // PR resolved then needing action again is new
  const resolved = { ...ward, mine: [mine("a", []), mine("b", [])] };
  assert.deepEqual(news(snapshot(resolved), ward).map((p) => p.url), ["a"]);
  // notification stays short
  const many = { mine: Array.from({ length: 30 }, (_, i) => mine(`u${i}`, ["mudanças pedidas"])), toReview: [] };
  assert.ok(notification(news({}, many)).length <= 190);
  assert.equal(notification([rev("r")]), "Argos: 1 novidade(s): web#2 pede sua revisão");
  // a review request turning late is news once, then quiet
  const late = { ...ward, toReview: [{ ...rev("r"), signals: ["atrasada > 1 dia"] }] };
  assert.deepEqual(news(snapshot(ward), late).map((p) => p.url), ["r"]);
  assert.deepEqual(news(snapshot(late), late), []);
  assert.equal(describe(late.toReview[0]), "pede sua revisão, atrasada > 1 dia");
  // pending lists everything needing action, oldest first, idle PRs left out
  assert.deepEqual(pending(ward).map((p) => p.url), ["a", "r"]);
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
