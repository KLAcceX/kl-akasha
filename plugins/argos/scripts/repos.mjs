#!/usr/bin/env node
// argos repos: the connected repositories the vigil watches, kept in repos.json
// next to the vigil state. Used by the AI (argos skill) and by /argos repos.
//
// Usage:
//   node repos.mjs list [--json] [--lang pt-BR|en]
//   node repos.mjs add [folder | owner/name | GitHub URL] [--account <gh login>] [--lang ...]
//       a folder (default: the current one) is read from its git origin; a name or URL
//       needs no clone and is checked with `gh repo view` as that account (default: the active one)
//   node repos.mjs remove <owner/name | URL | folder> [--lang ...]
//   node repos.mjs merge <repo> on|off [--lang ...]
//       on: Argos approves and merges this repo's PRs that pass its strict rule (see merge.mjs)
//   node repos.mjs prompt <repo> [text ...] [--lang ...]
//       this repo's own validation prompt, added to Argos's job for its PRs; none clears it
//   node repos.mjs --self-test
// Env: ARGOS_STATE overrides the state file path (repos.json sits beside it).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { langArg, t } from "./i18n.mjs";

const STATE = process.env.ARGOS_STATE ?? join(homedir(), ".claude", "kl-akasha", "argos", "state.json");
const FILE = join(dirname(STATE), "repos.json");

// "git@github.com:acme/api.git", "https://github.com/acme/api" or an SSH host
// alias such as "git@github-work:acme/api.git" → "acme/api"
export const repoFromRemote = (url) =>
  url.trim().match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?[^:/]*github[^:/]*[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/)?.[1];

// What the user typed, when it names a GitHub repo: "acme/api", any github.com link
// (a PR or file link too) or a remote URL → "acme/api". Folders give undefined.
export const repoFromArg = (arg) => {
  const a = arg.trim();
  const link = a.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (link) return `${link[1]}/${link[2]}`;
  return /^[A-Za-z0-9-]+\/[\w.-]+$/.test(a) ? a : repoFromRemote(a);
};

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

const run = (cmd, args, env = process.env) => execFileSync(cmd, args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "ignore"] }).trim();

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
  const account = args.includes("--account") ? args[args.indexOf("--account") + 1] : undefined;
  const flags = new Set(["--lang", "--account"].flatMap((f) => (args.includes(f) ? [args.indexOf(f), args.indexOf(f) + 1] : [])));
  const [verb = "list", ...rest] = args.filter((a, i) => a !== "--json" && !flags.has(i));
  const target = rest.join(" ").trim();
  const list = read();
  const fail = (msg) => {
    console.log(`Argos: ${msg}`);
    process.exit(1);
  };

  if (verb === "add") {
    const arg = target || ".";
    let path = resolve(arg);
    let repo;
    if (existsSync(path)) {
      try {
        repo = repoFromRemote(run("git", ["-C", path, "remote", "get-url", "origin"]));
      } catch {}
      if (!repo && !repoFromArg(arg)) fail(t(lang, "not_github", path));
    }
    if (!repo) {
      path = undefined;
      const name = repoFromArg(arg);
      if (!name) fail(t(lang, "not_repo", arg));
      try {
        // as the vigil's account, so a repo private to it is found
        const env = account ? { ...process.env, GH_TOKEN: run("gh", ["auth", "token", "-u", account]) } : process.env;
        repo = run("gh", ["repo", "view", name, "--json", "nameWithOwner", "-q", ".nameWithOwner"], env);
      } catch {}
      if (!repo) fail(t(lang, "repo_not_found", name));
    }
    // adding by name keeps the folder an earlier add recorded
    const old = list.find((r) => same(r.repo, repo));
    // the account that sees the repo, so the vigil reads it as that account
    const next = [...list.filter((r) => r !== old), { ...old, repo, ...(path && { path }), ...(account && { account }) }];
    write(next);
    return console.log(`Argos: ${t(lang, "connected", repo, next.length)}`);
  }
  if (verb === "remove" && target) {
    const name = repoFromArg(target) ?? target;
    const next = list.filter((r) => !same(r.repo, name) && r.path !== resolve(target));
    write(next);
    return console.log(`Argos: ${t(lang, next.length < list.length ? "removed" : "not_connected", name)}`);
  }
  // per repo settings, on a connected repo only
  if ((verb === "merge" || verb === "prompt") && rest[0]) {
    const name = repoFromArg(rest[0]) ?? rest[0];
    const old = list.find((r) => same(r.repo, name));
    if (!old) fail(t(lang, "not_connected", name));
    if (verb === "merge" && !["on", "off"].includes(rest[1])) fail("merge <repo> on|off");
    const text = rest.slice(1).join(" ").trim();
    // a prompt replaces the skills list an older version kept
    const { skills: _, prompt: __, ...base } = old;
    const next = verb === "merge" ? { ...old, merge: rest[1] === "on" } : { ...base, ...(text && { prompt: text }) };
    write(list.map((r) => (r === old ? next : r)));
    return console.log(`Argos: ${verb === "merge" ? t(lang, next.merge ? "merge_on" : "merge_off", old.repo) : t(lang, text ? "rp_set" : "rp_clear", old.repo)}`);
  }
  if (args.includes("--json")) return console.log(JSON.stringify(list));
  if (!list.length) return console.log(`Argos: ${t(lang, "no_repos")}`);
  const extra = (r) => `${r.merge ? " · auto-merge" : ""}${r.prompt ? " · own prompt" : ""}`;
  console.log([`Argos: ${t(lang, "list_title")}`, ...list.map((r) => `- ${r.repo}${r.account ? ` as ${r.account}` : ""}${extra(r)}${r.path ? `  (${r.path})` : ""}`)].join("\n"));
}

function selfTest() {
  assert.equal(repoFromRemote("git@github.com:acme/api.git\n"), "acme/api");
  assert.equal(repoFromRemote("https://github.com/acme/web"), "acme/web");
  assert.equal(repoFromRemote("https://github.com/acme/web.git/"), "acme/web");
  assert.equal(repoFromRemote("git@github-work:acme/portal.git"), "acme/portal");
  assert.equal(repoFromRemote("ssh://git@github.com/acme/api.git"), "acme/api");
  assert.equal(repoFromRemote("https://gitlab.com/acme/web"), undefined);

  // names and links
  assert.equal(repoFromArg("acme/api"), "acme/api");
  assert.equal(repoFromArg(" KLAcceX/kl-akasha "), "KLAcceX/kl-akasha");
  assert.equal(repoFromArg("acme/my_repo.js"), "acme/my_repo.js");
  assert.equal(repoFromArg("https://github.com/acme/api"), "acme/api");
  assert.equal(repoFromArg("github.com/acme/api.git"), "acme/api");
  assert.equal(repoFromArg("https://github.com/acme/api/pull/42"), "acme/api");
  assert.equal(repoFromArg("https://github.com/acme/api/pull/42/files#diff-1"), "acme/api");
  assert.equal(repoFromArg("https://www.github.com/acme/api?tab=readme"), "acme/api");
  assert.equal(repoFromArg("git@github.com:acme/api.git"), "acme/api");
  // folders
  for (const f of [".", "..", "./api", "../acme/api", "api", "/home/me/api", "C:\code\api", "D:/Projects/api", "~/api", "a/b/c"])
    assert.equal(repoFromArg(f), undefined, f);
  assert.equal(repoFromArg("https://gitlab.com/acme/api"), undefined);
  console.log("self-test ok");
}

// Run as a command only; round.mjs imports read() without triggering it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  args.includes("--self-test") ? selfTest() : main(args);
}
