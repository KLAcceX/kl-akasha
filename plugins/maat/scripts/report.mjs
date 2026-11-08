#!/usr/bin/env node
// Ma'at report: checks a verdicts file against the evidence protocol, then renders it for people.
// The check is what keeps "don't make mistakes" honest: every verdict is one of five states, a
// pass or a fail carries evidence and a dated source, "not applicable" and "not verified" say
// why, and there is no single compliance score. The render is in the user's language.
//
// verdicts.json:
//   { "product": "Acme", "date": "2026-11-04", "scope": "accessibility", "lang": "pt-BR",
//     "verdicts": [ { "id": "ACS-01", "control": "Color contrast", "status": "fail",
//                     "evidence": [ { "where": "app/styles.css:4", "detail": "2.53:1, min 4.5" } ],
//                     "sources": [ { "title": "WCAG 2.2 SC 1.4.3", "url": "https://…", "checked": "2026-11-04" } ],
//                     "fix": "…", "note": "…" } ],
//     "coverage": { "automated": ["…"], "manual": ["…"] } }
//
// Usage:
//   node report.mjs check <verdicts.json>        exit 1 on errors, prints warnings
//   node report.mjs render <verdicts.json> [--lang en|pt-BR] [--out report.md]
//   node report.mjs --self-test
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { isMain } from "./is-main.mjs";
import { pickLang, t } from "./i18n.mjs";

export const STATUSES = ["fail", "human", "unverified", "pass", "na"];
const STALE_DAYS = 183;
const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 864e5;

export function check(doc) {
  const errors = [], warnings = [];
  const today = doc.date || new Date().toISOString().slice(0, 10);
  for (const k of Object.keys(doc)) {
    if (/score|percent|rate|grade/i.test(k)) errors.push(`"${k}": no single compliance score; list verdicts per control instead`);
  }
  if (!Array.isArray(doc.verdicts) || !doc.verdicts.length) errors.push("no verdicts");
  const seen = new Set();
  for (const v of doc.verdicts || []) {
    const at = v.id || "(no id)";
    if (!v.id) errors.push("a verdict has no id");
    if (seen.has(v.id)) errors.push(`${at}: listed twice`);
    seen.add(v.id);
    if (!STATUSES.includes(v.status)) { errors.push(`${at}: status "${v.status}" is not one of ${STATUSES.join(", ")}`); continue; }
    const ev = Array.isArray(v.evidence) ? v.evidence.filter((e) => e && (e.where || e.detail)) : [];
    if (["pass", "fail"].includes(v.status) && !ev.length) errors.push(`${at}: a ${v.status} needs evidence (file:line, a capture or a measured value)`);
    if (["pass", "fail", "human"].includes(v.status)) {
      const src = Array.isArray(v.sources) ? v.sources : [];
      if (!src.length) errors.push(`${at}: a ${v.status} needs at least one source`);
      for (const s of src) {
        if (!s.checked || Number.isNaN(Date.parse(s.checked))) errors.push(`${at}: source "${s.title || s.url}" has no checked date`);
        else if (days(today, s.checked) > STALE_DAYS) warnings.push(`${at}: source "${s.title || s.url}" was checked ${s.checked}, over 6 months ago`);
      }
    }
    if (["na", "unverified"].includes(v.status) && !(v.note || "").trim()) errors.push(`${at}: "${v.status}" needs a note saying why`);
    if (v.status === "fail" && !(v.fix || "").trim()) warnings.push(`${at}: a fail with no fix`);
  }
  const manual = doc.coverage?.manual || [];
  if (!manual.length) warnings.push("coverage.manual is empty: say what was not checked, or a pass reads as full compliance");
  return { errors, warnings };
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function render(doc, langIn) {
  const lang = pickLang(langIn || doc.lang);
  const L = (k, ...a) => t(lang, k, ...a);
  const vs = [...doc.verdicts].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.id.localeCompare(b.id));
  const out = [`# ${L("title", doc.product || "app")}`, "", L("meta", doc.date || "", doc.scope || ""), "", `## ${L("summary")}`, ""];
  for (const s of STATUSES) {
    const n = vs.filter((v) => v.status === s).length;
    if (n) out.push(`- ${L(`status_${s}`)}: ${n}`);
  }
  out.push("", L("summary_note"), "", `## ${L("controls")}`, "", `| ${L("col_id")} | ${L("col_control")} | ${L("col_verdict")} | ${L("col_evidence")} |`, "| --- | --- | --- | --- |");
  for (const v of vs) {
    const ev = (v.evidence || []).map((e) => [e.where && `\`${e.where}\``, e.detail].filter(Boolean).join(" ")).join("; ") || v.note || "";
    out.push(`| ${v.id} | ${cell(v.control)} | ${L(`status_${v.status}`)} | ${cell(ev)} |`);
  }
  const act = vs.filter((v) => ["fail", "human", "unverified"].includes(v.status));
  if (act.length) {
    out.push("", `## ${L("details")}`);
    for (const v of act) {
      out.push("", `### ${v.id} ${v.control || ""} · ${L(`status_${v.status}`)}`, "");
      for (const e of v.evidence || []) out.push(`- ${[e.where && `\`${e.where}\``, e.detail].filter(Boolean).join(" ")}`);
      if (v.note) out.push("", `**${L("why")}:** ${v.note}`);
      if (v.fix) out.push("", `**${L("fix")}:** ${v.fix}`);
      if (v.sources?.length) {
        out.push("", `**${L("sources")}:** ` + v.sources.map((s) => {
          const old = doc.date && s.checked && days(doc.date, s.checked) > STALE_DAYS ? ` (${L("stale")})` : "";
          return `[${s.title}](${s.url}) (${L("checked", s.checked)})${old}`;
        }).join(" · "));
      }
    }
  }
  const cov = doc.coverage || {};
  out.push("", `## ${L("coverage")}`, "");
  if (cov.automated?.length) out.push(`**${L("automated")}:**`, "", ...cov.automated.map((x) => `- ${x}`), "");
  if (cov.manual?.length) out.push(`**${L("manual")}:**`, "", ...cov.manual.map((x) => `- ${x}`), "");
  out.push(`> ${L("disclaimer")}`, "");
  return out.join("\n");
}

function selfTest() {
  const src = [{ title: "WCAG 2.2 SC 1.4.3", url: "https://www.w3.org/TR/WCAG22/#contrast-minimum", checked: "2026-11-04" }];
  const good = {
    product: "Acme", date: "2026-11-04", scope: "accessibility",
    verdicts: [
      { id: "ACS-01", control: "Contrast", status: "fail", evidence: [{ where: "app/styles.css:4", detail: "2.53:1 (min 4.5)" }], sources: src, fix: "--muted-foreground: #6b7280" },
      { id: "ACS-02", control: "Alt text", status: "pass", evidence: [{ detail: "axe image-alt: 0 violations on 3 pages" }], sources: src },
      { id: "ACS-07", control: "Overlays", status: "na", note: "no overlay script or claim found" },
    ],
    coverage: { automated: ["axe-core 4.10, light and dark"], manual: ["screen reader pass"] },
  };
  assert.deepEqual(check(good), { errors: [], warnings: [] });
  const bad = check({
    date: "2026-11-04", compliance_score: 92,
    verdicts: [
      { id: "ACS-01", status: "ok" },
      { id: "ACS-02", status: "pass", sources: src },
      { id: "ACS-03", status: "fail", evidence: [{ where: "a.tsx:1" }], sources: [{ title: "x", url: "u" }], fix: "y" },
      { id: "ACS-04", status: "na" },
      { id: "ACS-05", status: "human", evidence: [{ detail: "d" }], sources: [{ title: "old", url: "u", checked: "2025-01-01" }] },
    ],
  });
  const has = (list, part) => assert.ok(list.some((e) => e.includes(part)), `expected "${part}" in ${JSON.stringify(list)}`);
  has(bad.errors, "no single compliance score");
  has(bad.errors, `status "ok"`);
  has(bad.errors, "ACS-02: a pass needs evidence");
  has(bad.errors, "has no checked date");
  has(bad.errors, `ACS-04: "na" needs a note`);
  has(bad.warnings, "over 6 months ago");
  has(bad.warnings, "coverage.manual is empty");
  const md = render(good, "pt-BR");
  assert.ok(md.includes("Não conforme") && md.includes("Precisa") === false && md.includes("conferida em 2026-11-04"));
  assert.ok(md.indexOf("ACS-01") < md.indexOf("ACS-02"), "failures come first");
  assert.ok(!/\d+\s*%/.test(md.split("## ")[1]), "the summary has no percentage");
  assert.ok(render(good, "en").includes("Fails"));
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const [cmd, file] = args.filter((a, i) => !a.startsWith("--") && !["--lang", "--out"].includes(args[i - 1]));
  if (args.includes("--self-test")) selfTest();
  else if ((cmd === "check" || cmd === "render") && file) {
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const { errors, warnings } = check(doc);
    for (const w of warnings) console.error(`warning: ${w}`);
    for (const e of errors) console.error(`error: ${e}`);
    if (errors.length) process.exit(1);
    if (cmd === "check") console.log(`ok: ${doc.verdicts.length} verdicts`);
    else {
      const md = render(doc, opt("--lang"));
      if (opt("--out")) writeFileSync(opt("--out"), md);
      else console.log(md);
    }
  } else { console.error("usage: report.mjs check|render <verdicts.json> [--lang en|pt-BR] [--out file] | --self-test"); process.exit(2); }
}
