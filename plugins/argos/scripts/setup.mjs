#!/usr/bin/env node
// argos setup: what the first run needs to know. Is the GitHub CLI there, which accounts are
// logged in, and which repos the chosen account has open PRs in (to suggest connecting them).
//
// Usage:
//   node setup.mjs [--account <gh login>] --json
//       { gh: "ok" | "missing" | "none" | "error", accounts: [{ login, active }], account, suggestions: [{ repo, prs }], here, error? }
//       here: the current folder's GitHub repo (from its git origin), or null
//   node setup.mjs --self-test
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { repoFromRemote } from "./repos.mjs";

const run = (args, env) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });

// `gh auth status --json hosts` → the github.com logins, the active one marked
export const accountsOf = (status) =>
  (status?.hosts?.["github.com"] ?? []).filter((a) => a.state === "success").map((a) => ({ login: a.login, active: Boolean(a.active) }));

// `gh search prs --json repository` → repos by how many open PRs involve the account, most first
export const reposOf = (items) => {
  const counts = new Map();
  for (const it of items ?? []) {
    const repo = it?.repository?.nameWithOwner;
    if (repo) counts.set(repo, (counts.get(repo) ?? 0) + 1);
  }
  return [...counts].map(([repo, prs]) => ({ repo, prs })).sort((a, b) => b.prs - a.prs || a.repo.localeCompare(b.repo));
};

// the current folder's repo, from its git origin
const hereRepo = () => {
  try {
    return repoFromRemote(execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) ?? null;
  } catch {
    return null;
  }
};

export function check(wanted) {
  const here = hereRepo();
  let status;
  try {
    status = JSON.parse(run(["auth", "status", "--json", "hosts"]));
  } catch (e) {
    // no gh at all, or gh with nobody logged in (it exits non-zero then)
    if (e.code === "ENOENT") return { gh: "missing", accounts: [], account: null, suggestions: [], here };
    try {
      status = JSON.parse(String(e.stdout ?? ""));
    } catch {
      return { gh: "none", accounts: [], account: null, suggestions: [], here };
    }
  }
  const accounts = accountsOf(status);
  if (!accounts.length) return { gh: "none", accounts, account: null, suggestions: [], here };
  const account = accounts.find((a) => a.login === wanted)?.login ?? accounts.find((a) => a.active)?.login ?? accounts[0].login;
  try {
    const token = run(["auth", "token", "-u", account]).trim();
    const items = JSON.parse(run(["search", "prs", "--involves=@me", "--state=open", "--json", "repository", "--limit", "100"], { GH_TOKEN: token }));
    return { gh: "ok", accounts, account, suggestions: reposOf(items).slice(0, 8), here };
  } catch (e) {
    return { gh: "ok", accounts, account, suggestions: [], here, error: String(e.stderr ?? e.message ?? "").trim().split("\n")[0] };
  }
}

function selfTest() {
  const status = {
    hosts: {
      "github.com": [
        { state: "success", active: false, login: "octo" },
        { state: "success", active: true, login: "acme-dev" },
        { state: "error", active: false, login: "stale" },
      ],
    },
  };
  assert.deepEqual(accountsOf(status), [
    { login: "octo", active: false },
    { login: "acme-dev", active: true },
  ]);
  assert.deepEqual(accountsOf({}), []);
  const items = [{ repository: { nameWithOwner: "acme/web" } }, { repository: { nameWithOwner: "acme/api" } }, { repository: { nameWithOwner: "acme/web" } }, {}];
  assert.deepEqual(reposOf(items), [
    { repo: "acme/web", prs: 2 },
    { repo: "acme/api", prs: 1 },
  ]);
  console.log("self-test ok");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();
  else {
    const i = args.indexOf("--account");
    console.log(JSON.stringify(check(i >= 0 ? args[i + 1] : undefined)));
  }
}
