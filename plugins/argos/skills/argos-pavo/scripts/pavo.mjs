#!/usr/bin/env node
// argos-pavo: one vigil round. Runs argos-ward, compares with the last round
// and prints only what is new. State lives outside any repo.
//
// Usage:
//   node pavo.mjs [extra search qualifiers...]   e.g. node pavo.mjs org:acme
//   node pavo.mjs --self-test
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

// State = { [url]: "signal|signal" } for my PRs that need action, plus { [url]: "review" } for my review queue.
export function snapshot({ mine, toReview }) {
  const s = {};
  for (const p of mine) if (p.signals.length) s[p.url] = [...p.signals].sort().join("|");
  for (const p of toReview) s[p.url] = "review";
  return s;
}

// New = a PR that now needs action and did not, or whose signals changed.
export function news(prev, ward) {
  const cur = snapshot(ward);
  const all = [...ward.mine, ...ward.toReview];
  return all.filter((p) => cur[p.url] && cur[p.url] !== prev[p.url]);
}

export function notification(items) {
  const parts = items.map((p) => `${p.repo.split("/")[1]}#${p.number} ${p.kind === "review" ? "pede sua revisão" : p.signals.join(", ")}`);
  let msg = `Argos: ${items.length} novidade(s): ${parts.join("; ")}`;
  return msg.length > 190 ? msg.slice(0, 187) + "..." : msg;
}

function main(args) {
  const ward = JSON.parse(execFileSync("node", [WARD, ...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
  let prev = {};
  try {
    prev = JSON.parse(readFileSync(STATE, "utf8"));
  } catch {} // first round: everything that needs action is new
  const items = news(prev, ward).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(snapshot(ward), null, 2));

  if (!items.length) return console.log("ARGOS_PAVO: nada novo");
  console.log(`ARGOS_PAVO: ${items.length} novidade(s)`);
  console.log(`NOTIFY: ${notification(items)}`);
  for (const p of items) {
    const what = p.kind === "review" ? "pede sua revisão" : p.signals.join(", ");
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
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
