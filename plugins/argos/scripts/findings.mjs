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
const MAX = { summaryWords: 20, summary: 200, title: 120, effect: 300, fix: 200, why: 600, suggestion: 1000, findings: 8, report: 6000 };
const ALERT = { blocker: "CAUTION", warning: "WARNING", suggestion: "NOTE" };
const DOT = { blocker: "🔴", warning: "🟡", suggestion: "🔵" };
// By the PR's language, not the person's: the author reads it. GitHub does not translate an alert's title.
const WORDS = {
  en: { blocker: "Blocker", blockers: "blockers", warning: "Warning", warnings: "warnings", suggestion: "Suggestion", suggestions: "suggestions", severity: "Severity", type: "Type", where: "Where", fix: "Fix", suggested: "Suggested change", why: "Why it fails", footer: (sha) => `Argos · AI validation of ${sha} · not a human review, and it can be wrong`, sign: "Argos · AI", none: (sha) => `No findings on \`${sha}\`.` },
  "pt-BR": { blocker: "Bloqueio", blockers: "bloqueios", warning: "Aviso", warnings: "avisos", suggestion: "Sugestão", suggestions: "sugestões", severity: "Severidade", type: "Tipo", where: "Onde", fix: "Ajuste", suggested: "Alteração sugerida", why: "Por que falha", footer: (sha) => `Argos · validação por IA de ${sha} · não é revisão humana, pode errar`, sign: "Argos · IA", none: (sha) => `Nenhum achado em \`${sha}\`.` },
};
const wordsOf = (r) => WORDS[r?.lang] ?? WORDS.en;
// The account is a person's, so the footer says who wrote this: whole once, in the brief; a thread is
// seen alone in the Files tab, so each is signed. A report with no fields has no language: English.
export const footerOf = (r, sha) => `<sub>${wordsOf(r).footer(sha.slice(0, 7))}</sub>`;
export const signOf = (r) => `<sub>${wordsOf(r).sign}</sub>`;
// A pass has no report to say its language; the brief it closes does, in its footer.
export const langOf = (body = "") => (body.includes("validação por IA") ? "pt-BR" : "en");
export const noneOf = (r, sha) => wordsOf(r).none(sha.slice(0, 7));

const flat = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const limited = (name, text, max = MAX[name]) => {
  if (text.length > max) throw new Error(`${name} is over ${max} characters: ${text.slice(0, 40)}…`);
  return text;
};

const tokensOf = (s) => flat(s).toLowerCase().replace(/[`.,;:!?()"]/g, "").split(" ").filter(Boolean);
// Five words in a row from a finding: the summary tells nothing the finding does not.
const repeats = (summary, text) => {
  const hay = ` ${tokensOf(summary).join(" ")} `;
  const w = tokensOf(text);
  return w.some((_, i) => i + 5 <= w.length && hay.includes(` ${w.slice(i, i + 5).join(" ")} `));
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
    // what proves it: a blocker with no line has none to give, such as a text in the description
    if (f.severity === "blocker" && f.path && !/`|\d/.test(f.effect)) throw new Error(`${f.path}: a blocker's effect needs a literal value or code: the input and what comes out`);
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
  const counted = r.summary.split(" ").length;
  if (counted > MAX.summaryWords) throw new Error(`the summary has ${counted} words, the limit is ${MAX.summaryWords}: say the consequence and leave the rest to the findings`);
  if (findings.some((f) => repeats(r.summary, f.title) || repeats(r.summary, f.effect))) throw new Error("the summary repeats a finding's words: say the consequence, or how the findings connect");
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

// The counts with their dots: the dot alone is colour alone, and this says what each one means.
const dotted = (r) =>
  ORDER.filter((s) => count(r, s))
    .map((s) => `${DOT[s]} ${count(r, s)} ${count(r, s) === 1 ? wordsOf(r)[s].toLowerCase() : wordsOf(r)[`${s}s`]}`)
    .join(" · ");

// The first thing on the PR: what was found, most serious first. A finding with a thread is one line
// here, its title; one with no line to sit on is in full, in its place. No list marker: the dot is one.
export function briefOf(r, inline = () => false) {
  const w = wordsOf(r);
  const parts = [];
  r.findings.forEach((f, i) => {
    const line = `${DOT[f.severity]} ${text(f.title)}`;
    if (!inline(f)) parts.push([`${head(r, f)} · ${text(whereOf(f))}: ${text(f.title)}\n${text(f.effect)}\n**${w.fix}:** ${text(f.fix)}`, ...details(r, f)].join("\n\n"));
    else if (i && inline(r.findings[i - 1])) parts[parts.length - 1] += `\n${line}`;
    else parts.push(line);
  });
  return [`> [!${ALERT[r.findings[0].severity]}]\n> **${dotted(r)}.** ${text(r.summary)}`, ...parts, ...r.notes.map(text)].join("\n\n");
}

// The end of a path that tells it from the others here: a whole path does not fit a phone's table, and
// the brief or the thread has the rest.
const shortOf = (r, path) => {
  const parts = path.split("/");
  const others = r.findings.filter((f) => f.path && f.path !== path).map((f) => f.path);
  for (let n = 1; n < parts.length; n++) {
    const end = parts.slice(-n).join("/");
    if (!others.some((p) => p === end || p.endsWith(`/${end}`))) return end;
  }
  return path;
};

// The last thing on the PR: kind and place of each, and a place with a thread leads to it.
export function listOf(r, linkOf = () => null) {
  const w = wordsOf(r);
  const where = (f) => cell(f.path ? `\`${shortOf(r, f.path)}:${f.line}\`` : f.where.replace(/^`(?:[^`]*\/)?([^`/]+)`$/, "`$1`"));
  const place = (f) => (linkOf(f) ? `[${where(f)}](${linkOf(f)})` : where(f));
  return `| ${w.severity} | ${w.type} | ${w.where} |\n|---|---|---|\n${r.findings.map((f) => `| ${DOT[f.severity]} ${w[f.severity]} | ${f.type} | ${place(f)} |`).join("\n")}`;
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
    const at = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
    if (at) {
      n = Number(at[1]);
      hunks.push(Object.assign(new Map(), { head: at[2] }));
    } else if (hunks.length && l && l[0] !== "-" && l[0] !== "\\") hunks.at(-1).set(n++, l.slice(1));
  }
  return hunks;
}
// Does the place show the first code the title names, its subject? It looks one line either way and at the
// hunk's function, in any case. A number counted by hand can land a few lines off, and a thread there reads
// as nonsense. A title naming no code, or only its own file, proves nothing and passes. Later names can be
// what is missing from the line, so they prove nothing either. ponytail: a subject on a removed line fails
// too, which only moves it to the brief.
export const shows = (f, files) => {
  const subject = f.title.match(/`([^`]+)`/)?.[1];
  if (!subject || f.path.endsWith(subject)) return true;
  const names = subject.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
  if (!names.length) return true;
  const hunk = hunksOf(files.find((x) => x.path === f.path)?.patch).find((h) => h.has(f.line));
  let text = hunk?.head ?? "";
  for (let n = f.startLine - 1; n <= f.line + 1; n++) text += `\n${hunk?.get(n) ?? ""}`;
  text = text.toLowerCase();
  return names.some((w) => text.includes(w));
};
// A finding whose line does not show it goes by file, in the brief, with no number to mislead.
export const placed = (f, files) => {
  if (!fits(f, files) || shows(f, files)) return f;
  const { path, line, startLine, ...rest } = f;
  return { ...rest, where: `\`${path}\`` };
};
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
  // the summary: words counted, and nothing lifted from a finding
  assert.throws(() => parse(report({ summary: Array(21).fill("palavra").join(" ") })), /has 21 words, the limit is 20/);
  assert.ok(parse(report({ summary: Array(20).fill("palavra").join(" ") })));
  assert.throws(() => parse(report({ summary: "Nothing works, since `f(200, 10)` returns 190, not 180." })), /repeats/);
  assert.throws(() => parse(report({ summary: "Coupons fail: `percent` is a flat amount today." })), /repeats/);
  assert.ok(parse(report({ summary: "The test passes while the discount is wrong." })));
  // a blocker on a line shows its proof; one with no line, or a smaller finding, need not
  assert.throws(() => parse(report({ findings: [{ ...bug, effect: "It charges too much." }] })), /literal value or code/);
  assert.ok(parse(report({ findings: [{ ...bug, effect: "It returns 190." }] })));
  assert.ok(parse(report({ findings: [{ ...inPr, effect: "It was ignored." }, { ...note, effect: "It only uses one total." }] })));
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
  // the alert goes by the most serious, and the counts say what each dot means
  assert.ok(briefOf(r).startsWith("> [!CAUTION]\n> **🔴 1 blocker · 🟡 1 warning.** The discount is wrong."));
  assert.ok(briefOf(parse(report({ findings: [note] }))).startsWith("> [!WARNING]"));
  assert.ok(briefOf(parse(report({ findings: [{ ...note, severity: "suggestion" }] }))).startsWith("> [!NOTE]"));
  assert.ok(briefOf(parse(report({ lang: "pt-BR" }))).includes("**🔴 1 bloqueio · 🟡 1 aviso.**"));
  // HTML stays text outside code; what has a thread is one line, with no marker of its own
  assert.ok(briefOf(parse(report({ findings: [{ ...inPr, title: "a <script> `<x>`" }] }))).includes("a &lt;script> `<x>`"));
  assert.ok(briefOf(r).includes("**Fix:** take"));
  const threaded = briefOf(r, (f) => f.path);
  assert.ok(threaded.includes("\n\n🔴 `percent` is a flat amount.\n🟡 The test passes with the bug."));
  assert.ok(!threaded.includes("**Fix:**") && !threaded.includes("- "));
  // one with no line keeps its place by severity and is in full, its title not said twice
  const mixed = briefOf(parse(report({ findings: [bug, note, inPr] })), (f) => f.path);
  assert.ok(mixed.includes("\n\n🔴 `percent` is a flat amount.\n\n🔴 **Blocker · security** · PR description, last line: Text addressed to reviewers.\nIt was ignored.\n**Fix:** remove it.\n\n🟡 The test"));
  assert.equal(mixed.split("Text addressed").length, 2);
  // the list has kind and place only, and only a place with a thread is a link; a row holds
  assert.equal(listOf(r), "| Severity | Type | Where |\n|---|---|---|\n| 🔴 Blocker | bug | `coupon.js:2` |\n| 🟡 Warning | tests | `c.js:6` |");
  assert.ok(listOf(r, (f) => (f.type === "bug" ? "https://x/pull/1#discussion_r9" : null)).includes("| [`coupon.js:2`](https://x/pull/1#discussion_r9) |\n| 🟡 Warning | tests | `c.js:6` |"));
  // a path is cut to what tells it from the others, and two with one name keep their folders
  const same = listOf(parse(report({ findings: [{ ...bug, path: "a/x/i.js" }, { ...note, path: "b/x/i.js" }, { ...note, title: "z", path: "deep/er/only.js" }] })));
  assert.ok(same.includes("`a/x/i.js:2`") && same.includes("`b/x/i.js:6`") && same.includes("`only.js:6`"));
  assert.ok(listOf(parse(report({ findings: [{ ...bug, path: "i.js" }, { ...note, path: "src/i.js" }] }))).includes("`src/i.js:6`"));
  assert.ok(listOf(parse(report({ findings: [{ ...inPr, where: "a | b" }] }))).includes("a \\| b"));
  assert.ok(listOf(parse(report({ findings: [{ ...inPr, where: "`deep/er/only.js`" }] }))).includes("| `only.js` |"));
  assert.ok(listOf(parse(report({ findings: [{ ...inPr, where: "PR description, a/b" }] }))).includes("| PR description, a/b |"));
  assert.ok(listOf(parse(report({ lang: "pt-BR" }))).startsWith("| Severidade | Tipo | Onde |"));
  // the footer and the signature go by the PR's language
  assert.equal(footerOf(r, "abc1234def"), "<sub>Argos · AI validation of abc1234 · not a human review, and it can be wrong</sub>");
  assert.equal(footerOf({ lang: "pt-BR" }, "abc1234def"), "<sub>Argos · validação por IA de abc1234 · não é revisão humana, pode errar</sub>");
  assert.equal(footerOf(undefined, "abc1234def"), footerOf(r, "abc1234def"));
  assert.equal(signOf({ lang: "pt-BR" }), "<sub>Argos · IA</sub>");
  // a pass speaks the language of the brief it closes
  assert.equal(langOf(footerOf({ lang: "pt-BR" }, "abc1234def")), "pt-BR");
  assert.equal(langOf(footerOf(r, "abc1234def")), "en");
  assert.equal(noneOf({ lang: "pt-BR" }, "abc1234def"), "Nenhum achado em `abc1234`.");
  assert.equal(noneOf({ lang: "en" }, "abc1234def"), "No findings on `abc1234`.");
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
  assert.deepEqual(hunksOf(patch).map((h) => [...h.keys()]), [[1, 2, 3], [20, 21]]);
  assert.equal(hunksOf(patch)[1].get(21), "y");
  const files = [{ path: "p.js", patch }];
  const at = (startLine, line, path = "p.js") => ({ path, startLine, line });
  assert.equal(fits(at(2, 2), files), true);
  assert.equal(fits(at(1, 3), files), true);
  assert.equal(fits(at(3, 20), files), false);
  assert.equal(fits(at(9, 9), files), false);
  assert.equal(fits(at(1, 1, "other.js"), files), false);
  assert.equal(fits({ where: "PR description" }, files), false);
  assert.equal(fits(at(1, 1), [{ path: "p.js" }]), false);
  // the line must show what the title names, one line either way
  const code = [{ path: "src/r.js", patch: "@@ -1,6 +1,6 @@\n a\n const x = findById(id);\n b\n c\n d\n logger.info(token);" }];
  const on = (title, line) => ({ path: "src/r.js", line, startLine: line, title });
  assert.equal(shows(on("`findById(id)` reads with no filter.", 2), code), true);
  assert.equal(shows(on("`findById(id)` reads with no filter.", 3), code), true);
  assert.equal(shows(on("`findById(id)` reads with no filter.", 5), code), false);
  assert.equal(shows(on("`logger.info` writes the token.", 2), code), false);
  assert.equal(shows(on("No code is named here.", 5), code), true);
  assert.equal(shows(on("`r.js` tests too little.", 5), code), true);
  assert.equal(shows(on("`id` is too short to prove anything.", 5), code), true);
  // in any case, and only the subject counts: what comes later may be what the line lacks
  assert.equal(shows(on("`LOGGER.INFO` writes the token.", 6), code), true);
  assert.equal(shows(on("`findById(id)` ignores `tenantId`.", 2), code), true);
  assert.equal(shows(on("`tenantId` is missing and `findById` passes.", 2), code), false);
  // the hunk's function counts: the subject is often declared above the hunk
  const inFn = [{ path: "src/r.js", patch: "@@ -20,2 +20,2 @@ export function findByEmail(email) {\n a\n b" }];
  assert.equal(shows(on("`findByEmail` reads the column.", 21), inFn), true);
  const off = placed({ ...on("`logger.info` writes the token.", 2), severity: "blocker", type: "bug" }, code);
  assert.ok(!off.path && !off.line && off.where === "`src/r.js`");
  assert.equal(fits(off, code), false);
  assert.equal(placed(on("`findById(id)` reads.", 2), code).line, 2);
  assert.equal(placed(on("`logger.info` writes.", 99), code).line, 99);
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--self-test")) selfTest();
  else {
    console.error("usage: findings.mjs --self-test");
    process.exit(1);
  }
}
