#!/usr/bin/env node
// Argos findings: a validation's report as fields, and what they read as. The agent writes the fields
// (references/comment.md); this file writes the text, so the format holds whatever the agent does and
// the pane shows what goes on GitHub. The fields read the PR's own text, so they are untrusted here.
//
// Usage: node findings.mjs --self-test
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isMain } from "./is-main.mjs";

const ORDER = ["blocker", "warning", "suggestion"];
const TYPES = ["bug", "scope", "contract", "deploy", "tests", "security", "cleanup"];
const MAX = { summary: 200, title: 120, effect: 300, fix: 200, why: 600, suggestion: 1000, findings: 8, report: 6000 };
const ALERT = { blocker: "CAUTION", warning: "WARNING", suggestion: "NOTE" };
const DOT = { blocker: "🔴", warning: "🟡", suggestion: "🔵" };
// By the PR's language, not the person's: the author reads it. GitHub does not translate an alert's title.
const WORDS = {
  en: { blocker: "Blocker", blockers: "blockers", warning: "Warning", warnings: "warnings", suggestion: "Suggestion", suggestions: "suggestions", severity: "Severity", type: "Type", where: "Where", what: "What", fix: "Fix", suggested: "Suggested change", why: "Why it fails" },
  "pt-BR": { blocker: "Bloqueio", blockers: "bloqueios", warning: "Aviso", warnings: "avisos", suggestion: "Sugestão", suggestions: "sugestões", severity: "Severidade", type: "Tipo", where: "Onde", what: "O quê", fix: "Ajuste", suggested: "Alteração sugerida", why: "Por que falha" },
};
const wordsOf = (r) => WORDS[r.lang] ?? WORDS.en;

const flat = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const limited = (name, text, max = MAX[name]) => {
  if (text.length > max) throw new Error(`${name} is over ${max} characters: ${text.slice(0, 40)}…`);
  return text;
};

// Whole or refused: the agent reads why and writes it again. Nothing is cut, since a cut report could
// hide a secret's shape from publish.mjs, and the order is the file's, most serious first.
export function parse(text) {
  const raw = JSON.parse(text);
  if (!Array.isArray(raw.findings) || !raw.findings.length) throw new Error("findings must list at least one; nothing found takes no file");
  if (raw.findings.length > MAX.findings) throw new Error(`more than ${MAX.findings} findings: keep the most serious, and say in notes how many were left out`);
  const findings = raw.findings.map((f) => {
    if (!ORDER.includes(f.severity)) throw new Error(`severity must be ${ORDER.join(", ")}`);
    if (!TYPES.includes(f.type)) throw new Error(`type must be ${TYPES.join(", ")}`);
    const line = f.path ? Number(f.line) : undefined;
    if (f.path && !(Number.isInteger(line) && line > 0)) throw new Error(`${f.path} needs a line`);
    if (!f.path && !flat(f.where)) throw new Error("a finding needs path and line, or where");
    for (const k of ["title", "effect", "fix"]) if (!flat(f[k])) throw new Error(`a finding needs ${k}`);
    const start = f.path && f.startLine ? Number(f.startLine) : line;
    if (f.path && !(Number.isInteger(start) && start > 0 && start <= line)) throw new Error(`${f.path}: startLine must come before line`);
    // inside a fence the text must stay exact, so what could break out of it goes instead of being changed
    const code = f.path && typeof f.suggestion === "string" && !f.suggestion.includes("```") && !f.suggestion.includes("<!--") ? f.suggestion.replace(/\r\n/g, "\n").replace(/\n$/, "") : undefined;
    return {
      severity: f.severity,
      type: f.type,
      ...(f.path ? { path: String(f.path), line, startLine: start } : { where: flat(f.where) }),
      title: limited("title", flat(f.title)),
      effect: limited("effect", flat(f.effect)),
      fix: limited("fix", flat(f.fix)),
      ...(code !== undefined && { suggestion: limited("suggestion", code) }),
      ...(String(f.why ?? "").trim() && { why: limited("why", String(f.why).trim()) }),
    };
  });
  findings.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const r = { lang: raw.lang === "pt-BR" ? "pt-BR" : "en", summary: limited("summary", flat(raw.summary)), findings, notes: (raw.notes ?? []).map(flat).filter(Boolean) };
  if (!r.summary) throw new Error("the report needs a summary");
  limited("report", plainOf(r));
  return r;
}

const count = (r, severity) => r.findings.filter((f) => f.severity === severity).length;
export const countsOf = (r) => ({ issues: count(r, "blocker"), attention: count(r, "warning") + count(r, "suggestion") });
const tally = (r) =>
  ORDER.filter((s) => count(r, s))
    .map((s) => `${count(r, s)} ${count(r, s) === 1 ? wordsOf(r)[s].toLowerCase() : wordsOf(r)[`${s}s`]}`)
    .join(", ");
const whereOf = (f) => (f.path ? `\`${f.path}:${f.line}\`` : f.where);

// The top one, for the pane's row: the most serious, with its place.
export const topOf = (r) => {
  const f = r.findings[0];
  const at = f.path ? ` (${f.path.split("/").at(-1)}:${f.line})` : "";
  const room = 80 - at.length - (f.severity === "blocker" ? 0 : f.type.length + 2);
  const title = f.title.length > room ? `${f.title.slice(0, room - 1)}…` : f.title;
  return `${f.severity === "blocker" ? "" : `${f.type}: `}${title}${at}`;
};

// For the pane and the history: one Text per line, no Markdown, and all of what goes on GitHub, since
// the person signs it and nobody expands anything there. A line starting with `- [type]` is counted.
export function plainOf(r) {
  const w = wordsOf(r);
  return [
    `${tally(r)}. ${r.summary}`,
    ...r.findings.flatMap((f) => [
      `- [${f.type}] ${w[f.severity]} · ${whereOf(f)}: ${f.title}`,
      `  ${f.effect}`,
      `  ${w.fix}: ${f.fix}`,
      ...(f.suggestion !== undefined ? [`  ${w.suggested}:`, ...f.suggestion.split("\n").map((l) => `    ${l}`)] : []),
      ...(f.why ? [`  ${w.why}: ${f.why}`] : []),
    ]),
    ...r.notes,
  ].join("\n");
}

// What the agent wrote stays text: outside code spans no HTML gets through, a pipe keeps a table whole.
const text = (s) => s.split(/(`[^`\n]*`)/).map((part, i) => (i % 2 ? part : part.replace(/</g, "&lt;"))).join("");
const cell = (s) => text(s).replace(/\|/g, "\\|");
const details = (r, f) => (f.why ? [`<details>\n<summary>${wordsOf(r).why}</summary>\n\n${text(f.why)}\n\n</details>`] : []);
const head = (r, f) => `${DOT[f.severity]} **${wordsOf(r)[f.severity]} · ${f.type}**`;

// The comment on the PR: what was found at a glance, then in full whatever has no line to sit on.
export function briefOf(r, inline = () => false) {
  const w = wordsOf(r);
  const apart = r.findings.filter((f) => !inline(f));
  return [
    `> [!${ALERT[r.findings[0].severity]}]\n> **${tally(r)}.** ${text(r.summary)}`,
    `| ${w.severity} | ${w.type} | ${w.where} | ${w.what} |\n|---|---|---|---|\n${r.findings.map((f) => `| ${DOT[f.severity]} ${w[f.severity]} | ${f.type} | ${cell(whereOf(f))} | ${cell(f.title)} |`).join("\n")}`,
    ...apart.map((f) => [`${head(r, f)} · ${text(whereOf(f))}: ${text(f.title)}\n${text(f.effect)}\n**${w.fix}:** ${text(f.fix)}`, ...details(r, f)].join("\n\n")),
    ...r.notes.map(text),
  ].join("\n\n");
}

// The comment on a line. A suggestion stands for the fix, since one click applies it.
export const inlineOf = (r, f) =>
  [`${head(r, f)}: ${text(f.title)}\n${text(f.effect)}`, f.suggestion !== undefined ? null : `**${wordsOf(r).fix}:** ${text(f.fix)}`, ...details(r, f)].filter((part) => part !== null);
export const fenceOf = (f) => (f.suggestion !== undefined ? `\`\`\`suggestion\n${f.suggestion}\n\`\`\`` : null);

// Same finding, same key, whatever its line by now: it goes on a line once.
export const keyOf = (f) => createHash("sha1").update(`${f.path}|${f.type}|${f.title.toLowerCase()}`).digest("hex").slice(0, 12);

// The lines of a file's new side that GitHub takes a comment on, hunk by hunk: a line outside them
// fails the whole review, and a range must not cross hunks.
export function hunksOf(patch = "") {
  const hunks = [];
  let n = 0;
  for (const l of patch.split("\n")) {
    const at = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (at) {
      n = Number(at[1]);
      hunks.push(new Set());
    } else if (hunks.length && l && l[0] !== "-" && l[0] !== "\\") hunks.at(-1).add(n++);
  }
  return hunks;
}
export const fits = (f, files) => {
  if (!f.path) return false;
  const hunks = hunksOf(files.find((x) => x.path === f.path)?.patch);
  return hunks.some((h) => {
    for (let n = f.startLine; n <= f.line; n++) if (!h.has(n)) return false;
    return true;
  });
};

function selfTest() {
  const bug = { severity: "blocker", type: "bug", path: "src/coupon.js", line: 2, title: "`percent` is a flat amount.", effect: "`f(200, 10)` returns 190, not 180.", fix: "take the percentage off.", suggestion: "return total - pct;\n", why: "Both give 90 on 100." };
  const note = { severity: "warning", type: "tests", path: "test/c.js", line: 6, title: "The test passes with the bug.", effect: "It only uses 100.", fix: "add 200." };
  const inPr = { severity: "blocker", type: "security", where: "PR description, last line", title: "Text addressed to reviewers.", effect: "It was ignored.", fix: "remove it." };
  const report = (over = {}) => JSON.stringify({ lang: "en", summary: "The discount is wrong.", findings: [note, bug], ...over });
  const r = parse(report());
  // most serious first, and the counts are the file's
  assert.deepEqual(r.findings.map((f) => f.type), ["bug", "tests"]);
  assert.deepEqual(countsOf(r), { issues: 1, attention: 1 });
  assert.deepEqual(countsOf(parse(report({ findings: [{ ...note, severity: "suggestion", type: "cleanup" }] }))), { issues: 0, attention: 1 });
  assert.equal(topOf(r), "`percent` is a flat amount. (coupon.js:2)");
  assert.equal(topOf(parse(report({ findings: [note] }))), "tests: The test passes with the bug. (c.js:6)");
  // refused whole
  for (const bad of [{ findings: [] }, { summary: " " }, { findings: Array(9).fill(bug) }, { findings: [{ ...bug, severity: "nit" }] }, { findings: [{ ...bug, type: "code" }] }, { findings: [{ ...bug, line: undefined }] }, { findings: [{ ...bug, path: undefined }] }, { findings: [{ ...bug, fix: "" }] }, { findings: [{ ...bug, why: "x".repeat(601) }] }, { findings: [{ ...bug, startLine: 9 }] }])
    assert.throws(() => parse(report(bad)));
  // a suggestion that could leave its fence, or fake a marker, goes; the finding stays
  assert.equal(parse(report({ findings: [{ ...bug, suggestion: "```\nout" }] })).findings[0].suggestion, undefined);
  assert.equal(parse(report({ findings: [{ ...bug, suggestion: "<!-- argos:x -->" }] })).findings[0].suggestion, undefined);
  assert.equal(parse(report()).findings[0].suggestion, "return total - pct;");
  // the pane reads all of it, and counts the tags
  const plain = plainOf(r);
  assert.equal(plain.split("\n")[0], "1 blocker, 1 warning. The discount is wrong.");
  assert.ok(plain.includes("- [bug] Blocker · `src/coupon.js:2`: `percent` is a flat amount."));
  for (const part of ["Fix: take", "Suggested change:", "    return total - pct;", "Why it fails: Both give"]) assert.ok(plain.includes(part), part);
  assert.ok(plainOf(parse(report({ lang: "pt-BR" }))).startsWith("1 bloqueio, 1 aviso."));
  // the alert goes by the most serious
  assert.ok(briefOf(r).startsWith("> [!CAUTION]\n> **1 blocker, 1 warning.**"));
  assert.ok(briefOf(parse(report({ findings: [note] }))).startsWith("> [!WARNING]"));
  assert.ok(briefOf(parse(report({ findings: [{ ...note, severity: "suggestion" }] }))).startsWith("> [!NOTE]"));
  // a table row holds, HTML stays text outside code, and what has a line is only named here
  const odd = parse(report({ findings: [{ ...inPr, title: "a | b <script> `<x>`" }] }));
  assert.ok(briefOf(odd).includes("a \\| b &lt;script> `<x>`"));
  assert.ok(briefOf(r).includes("| 🔴 Blocker | bug | `src/coupon.js:2` |"));
  assert.ok(briefOf(r).includes("**Fix:** take"));
  assert.ok(!briefOf(r, (f) => f.path).includes("**Fix:**"));
  // on the line: the suggestion stands for the fix
  assert.ok(!inlineOf(r, r.findings[0]).join("\n").includes("**Fix:**"));
  assert.ok(inlineOf(r, r.findings[1]).join("\n").includes("**Fix:** add 200."));
  assert.equal(fenceOf(r.findings[0]), "```suggestion\nreturn total - pct;\n```");
  assert.equal(fenceOf(r.findings[1]), null);
  // a moved line is the same finding, another title is not
  assert.equal(keyOf(r.findings[0]), keyOf({ ...r.findings[0], line: 40 }));
  assert.notEqual(keyOf(r.findings[0]), keyOf({ ...r.findings[0], title: "other" }));
  // added and context lines take a comment, removed lines and other hunks do not
  const patch = "@@ -1,3 +1,3 @@\n a\n-b\n+c\n d\n@@ -10 +20,2 @@ fn\n x\n+y";
  assert.deepEqual(hunksOf(patch).map((h) => [...h]), [[1, 2, 3], [20, 21]]);
  const files = [{ path: "p.js", patch }];
  const at = (startLine, line, path = "p.js") => ({ path, startLine, line });
  assert.equal(fits(at(2, 2), files), true);
  assert.equal(fits(at(1, 3), files), true);
  assert.equal(fits(at(3, 20), files), false);
  assert.equal(fits(at(9, 9), files), false);
  assert.equal(fits(at(1, 1, "other.js"), files), false);
  assert.equal(fits({ where: "PR description" }, files), false);
  assert.equal(fits(at(1, 1), [{ path: "p.js" }]), false);
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--self-test")) selfTest();
  else {
    console.error("usage: findings.mjs --self-test");
    process.exit(1);
  }
}
