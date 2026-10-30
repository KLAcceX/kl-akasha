#!/usr/bin/env node
// argos-panoptes rules: the project's own review rules, found read-only through the GitHub
// contents API. When a project has rules they lead the review; Argos' references only fill
// the gaps (see SKILL.md, "Project rules").
//
// Usage:
//   node rules.mjs <owner/repo> [--ref <branch>] [--json] [--account <gh login>]
//   node rules.mjs --self-test
// Without --ref it reads the repo's default branch. A missing file or folder is never an error.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

export const KINDS = ["contributing", "pr_template", "codeowners", "agents", "claude", "copilot", "review"];

// GitHub reads CODEOWNERS and CONTRIBUTING from the first of these folders that has one.
const HOMES = [".github", "", "docs"];
const FIRST_ONLY = new Set(["contributing", "codeowners"]);

// Kind of a repo path, or null. Case-insensitive, like GitHub's own lookup.
export function classify(path) {
  const p = path.toLowerCase();
  const i = p.lastIndexOf("/");
  const dir = i < 0 ? "" : p.slice(0, i);
  const name = p.slice(i + 1);
  const home = HOMES.includes(dir);
  if (home && /^contributing(\.[a-z]+)?$/.test(name)) return "contributing";
  if ((home && /^pull_request_template(\.[a-z]+)?$/.test(name)) || dir === ".github/pull_request_template") return "pr_template";
  if (home && name === "codeowners") return "codeowners";
  if (p === "agents.md") return "agents";
  if (p === "claude.md" || p === ".claude/claude.md") return "claude";
  if (p === ".github/copilot-instructions.md") return "copilot";
  if (/^(\.github|docs)(\/|$)/.test(dir) && name.includes("review")) return "review";
  return null;
}

const dirRank = (path) => {
  const i = path.lastIndexOf("/");
  const r = HOMES.indexOf(i < 0 ? "" : path.slice(0, i).toLowerCase());
  return r < 0 ? HOMES.length : r;
};

export const excerpt = (text) =>
  (text ?? "").replace(/\r/g, "").split("\n").slice(0, 15).join("\n").slice(0, 600).trim();

// list(dir) → contents API entries ({name, path, type, size}), [] when absent; read(path) → text.
// Walks the root, then .github/, docs/, .claude/ and .github/PULL_REQUEST_TEMPLATE/ when they exist.
export function collect(list, read) {
  const root = list("");
  const entries = [...root];
  for (const d of root.filter((e) => e.type === "dir" && [".github", "docs", ".claude"].includes(e.name.toLowerCase())))
    entries.push(...list(d.path));
  const tpl = entries.find((e) => e.type === "dir" && e.path.toLowerCase() === ".github/pull_request_template");
  if (tpl) entries.push(...list(tpl.path));

  const files = entries
    .filter((e) => e.type === "file")
    .map((e) => ({ ...e, kind: classify(e.path) }))
    .filter((e) => e.kind)
    .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || dirRank(a.path) - dirRank(b.path) || a.path.localeCompare(b.path));
  const found = files
    .filter((f, i) => !FIRST_ONLY.has(f.kind) || files.findIndex((g) => g.kind === f.kind) === i)
    .map((f) => ({ path: f.path, kind: f.kind, bytes: f.size, excerpt: excerpt(read(f.path)) }));
  return { found, missing: KINDS.filter((k) => !found.some((f) => f.kind === k)) };
}

function main(args) {
  const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const repo = args.find((a) => !a.startsWith("--") && a !== opt("--ref") && a !== opt("--account"));
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error("usage: node rules.mjs <owner/repo> [--ref <branch>] [--json] [--account <login>]");
    process.exit(2);
  }
  const env = { ...process.env };
  if (opt("--account")) env.GH_TOKEN = execFileSync("gh", ["auth", "token", "-u", opt("--account")], { encoding: "utf8" }).trim();
  const gh = (...a) => execFileSync("gh", ["api", ...a], { encoding: "utf8", env, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 });

  let ref = opt("--ref");
  let out;
  try {
    ref ??= gh(`repos/${repo}`, "--jq", ".default_branch").trim();
    const q = `?ref=${encodeURIComponent(ref)}`;
    const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
    const list = (dir) => {
      try {
        const r = JSON.parse(gh(`repos/${repo}/contents${dir ? `/${enc(dir)}` : ""}${q}`));
        return Array.isArray(r) ? r : [];
      } catch {
        return [];
      }
    };
    const read = (path) => {
      try {
        return gh("-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/${enc(path)}${q}`);
      } catch {
        return "";
      }
    };
    out = { repo, ref, ...collect(list, read) };
  } catch {
    out = { repo, ref: ref ?? null, found: [], missing: KINDS, error: "repository or branch not readable with this account" };
  }

  if (args.includes("--json")) return console.log(JSON.stringify(out, null, 2));
  console.log(`${out.repo} @ ${out.ref ?? "?"}${out.error ? `: ${out.error}` : ""}`);
  for (const f of out.found) console.log(`  ${f.kind.padEnd(12)} ${f.path} (${f.bytes} B)`);
  if (!out.found.length && !out.error) console.log("  no review rules found: Argos' recommendations apply");
  if (out.missing.length) console.log(`  missing: ${out.missing.join(", ")}`);
}

function selfTest() {
  // classification: GitHub's locations, any case and extension
  const cases = {
    "CONTRIBUTING.md": "contributing",
    ".github/contributing.rst": "contributing",
    "docs/CONTRIBUTING": "contributing",
    "src/CONTRIBUTING.md": null,
    "pull_request_template.md": "pr_template",
    ".github/PULL_REQUEST_TEMPLATE.md": "pr_template",
    "docs/pull_request_template.md": "pr_template",
    ".github/PULL_REQUEST_TEMPLATE/bugfix.md": "pr_template",
    "CODEOWNERS": "codeowners",
    ".github/CODEOWNERS": "codeowners",
    "docs/CODEOWNERS": "codeowners",
    "lib/CODEOWNERS": null,
    "AGENTS.md": "agents",
    "CLAUDE.md": "claude",
    ".claude/CLAUDE.md": "claude",
    ".github/copilot-instructions.md": "copilot",
    ".github/code-review-checklist.md": "review",
    "docs/guides/REVIEWING.md": "review",
    "src/review.ts": null,
    "README.md": null,
  };
  for (const [p, kind] of Object.entries(cases)) assert.equal(classify(p), kind, p);

  assert.equal(excerpt("a\r\nb\n"), "a\nb");
  assert.equal(excerpt(undefined), "");
  assert.equal(excerpt(Array(30).fill("x").join("\n")).split("\n").length, 15);

  // a fake repo: only the listed folders exist; every other lookup is a 404 ([])
  const f = (path, size = 10) => ({ name: path.split("/").pop(), path, type: "file", size });
  const d = (path) => ({ name: path.split("/").pop(), path, type: "dir" });
  const tree = {
    "": [f("CODEOWNERS"), f("CONTRIBUTING.md"), f("CLAUDE.md", 99), f("README.md"), d(".github"), d("docs"), d("src")],
    ".github": [f(".github/CODEOWNERS"), d(".github/PULL_REQUEST_TEMPLATE"), d(".github/workflows")],
    ".github/PULL_REQUEST_TEMPLATE": [f(".github/PULL_REQUEST_TEMPLATE/feature.md")],
    docs: [f("docs/review-guide.md")],
  };
  const listed = [];
  const list = (dir) => (listed.push(dir), tree[dir] ?? []);
  const { found, missing } = collect(list, (p) => `# ${p}\nline 2`);
  assert.deepEqual(
    found.map((x) => [x.kind, x.path]),
    [
      ["contributing", "CONTRIBUTING.md"],
      ["pr_template", ".github/PULL_REQUEST_TEMPLATE/feature.md"],
      ["codeowners", ".github/CODEOWNERS"], // .github wins over root, root copy dropped
      ["claude", "CLAUDE.md"],
      ["review", "docs/review-guide.md"],
    ],
  );
  assert.equal(found.find((x) => x.kind === "claude").bytes, 99);
  assert.equal(found[0].excerpt, "# CONTRIBUTING.md\nline 2");
  assert.deepEqual(missing, ["agents", "copilot"]);
  assert.deepEqual(listed, ["", ".github", "docs", ".github/PULL_REQUEST_TEMPLATE"]); // no src/, workflows/
  // an unreadable repo is all missing, never a throw
  assert.deepEqual(collect(() => [], () => "").missing, KINDS);
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
