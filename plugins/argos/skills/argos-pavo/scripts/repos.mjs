#!/usr/bin/env node
// argos repos: the connected repositories the vigil watches, kept in repos.json
// next to the pavo state. Used by the AI (argos-pavo skill) and by /argos repos.
//
// Usage:
//   node repos.mjs list [--json] [--lang pt-BR|en]
//   node repos.mjs add <folder> [--lang ...]       reads the folder's git origin
//   node repos.mjs remove <owner/repo | folder> [--lang ...]
//   node repos.mjs --self-test
// Env: ARGOS_PAVO_STATE overrides the state file path (repos.json sits beside it).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { langArg, t } from "../../argos-ward/scripts/i18n.mjs";

const STATE = process.env.ARGOS_PAVO_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "pavo-state.json");
const FILE = join(dirname(STATE), "repos.json");

// "git@github.com:acme/api.git", "https://github.com/acme/api" or an SSH host
// alias such as "git@github-work:acme/api.git" → "acme/api"
export const repoFromRemote = (url) =>
  url.trim().match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?[^:/]*github[^:/]*[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/)?.[1];

export const read = () => {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
};

const write = (list) => {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(list, null, 2));
};

function main(args) {
  const lang = langArg(args);
  const l = args.indexOf("--lang");
  const [verb = "list", ...rest] = args.filter((a, i) => a !== "--json" && (l < 0 || (i !== l && i !== l + 1)));
  const target = rest.join(" ").trim();
  const list = read();

  if (verb === "add" && target) {
    const path = resolve(target);
    let repo;
    try {
      repo = repoFromRemote(execFileSync("git", ["-C", path, "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    } catch {}
    if (!repo) {
      console.log(`Argos: ${t(lang, "not_github", path)}`);
      process.exit(1);
    }
    const next = [...list.filter((r) => r.repo !== repo), { path, repo }];
    write(next);
    return console.log(`Argos: ${t(lang, "connected", repo, next.length)}`);
  }
  if (verb === "remove" && target) {
    const next = list.filter((r) => r.repo !== target && r.path !== resolve(target));
    write(next);
    return console.log(`Argos: ${t(lang, next.length < list.length ? "removed" : "not_connected", target)}`);
  }
  if (args.includes("--json")) return console.log(JSON.stringify(list));
  if (!list.length) return console.log(`Argos: ${t(lang, "no_repos")}`);
  console.log([`Argos: ${t(lang, "list_title")}`, ...list.map((r) => `- ${r.repo}  (${r.path})`)].join("\n"));
}

function selfTest() {
  assert.equal(repoFromRemote("git@github.com:acme/api.git\n"), "acme/api");
  assert.equal(repoFromRemote("https://github.com/acme/web"), "acme/web");
  assert.equal(repoFromRemote("https://github.com/acme/web.git/"), "acme/web");
  assert.equal(repoFromRemote("git@github-work:acme/portal.git"), "acme/portal");
  assert.equal(repoFromRemote("ssh://git@github.com/acme/api.git"), "acme/api");
  assert.equal(repoFromRemote("https://gitlab.com/acme/web"), undefined);
  console.log("self-test ok");
}

// Run as a command only; pavo.mjs imports read() without triggering it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  args.includes("--self-test") ? selfTest() : main(args);
}
