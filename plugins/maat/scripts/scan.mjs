#!/usr/bin/env node
// Ma'at scan: a static pass over the source, no browser. It finds what can be seen in the code
// itself and says where (file and line), so every finding is evidence a person can open. It reads
// HTML, JSX/TSX, Vue, Svelte, Astro and CSS. It is a first pass: anything it marks "check" needs a
// look, and what it cannot see (a rendered color, the real focus order) is for browse.mjs.
//
// Usage:
//   node scan.mjs <dir|file>... [--json]
//   node scan.mjs --self-test
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { isMain } from "./is-main.mjs";

const EXT = new Set([".html", ".htm", ".jsx", ".tsx", ".js", ".ts", ".vue", ".svelte", ".astro", ".css", ".scss"]);
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", "coverage", "out", ".turbo", "vendor"]);
const MARKUP = new Set([".html", ".htm", ".jsx", ".tsx", ".js", ".ts", ".vue", ".svelte", ".astro"]);

// One finding: the control it belongs to, a stable rule code, where, and how sure the scan is.
// "high": the code shows the failure. "check": the code suggests it; a person or browse.mjs decides.
const finding = (control, rule, file, line, excerpt, confidence, note) => ({ control, rule, file, line, excerpt: excerpt.trim().slice(0, 160), confidence, note });

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// Opening tags with their attributes, read char by char so `onClick={() => x}` or `a > b` inside
// braces and quotes do not end the tag early.
export function tags(text, names) {
  const out = [];
  const re = new RegExp(`<(${names.join("|")})(?=[\\s/>])`, "g");
  let m;
  while ((m = re.exec(text))) {
    let depth = 0, quote = null, i = m.index + m[0].length;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) break;
    }
    const raw = text.slice(m.index, i + 1);
    out.push({ name: m[1], raw, index: m.index, end: i + 1, selfClosing: raw.endsWith("/>") });
  }
  return out;
}

const attr = (raw, name) => {
  const m = raw.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|\\{([^}]*)\\})`, "i"));
  if (m) return m[2] ?? m[3] ?? m[4] ?? "";
  return new RegExp(`\\s${name}(?=[\\s/>])`, "i").test(raw) ? "" : null;
};
const hasAny = (raw, names) => names.some((n) => attr(raw, n) !== null);

// The markup between an opening tag and its closing tag (same name, not nested-aware beyond depth).
function inner(text, t) {
  if (t.selfClosing) return "";
  const close = new RegExp(`</${t.name}\\s*>`, "g");
  close.lastIndex = t.end;
  const m = close.exec(text);
  return m ? text.slice(t.end, m.index) : "";
}

// What a screen reader would announce from markup: text nodes, alt of images, aria-label.
function accessibleText(markup) {
  const alts = [...markup.matchAll(/<img\b[^>]*\salt\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const labels = [...markup.matchAll(/aria-label\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const srOnly = /class(Name)?\s*=\s*["'][^"']*\b(sr-only|visually-hidden)\b/.test(markup);
  const textOnly = markup.replace(/<[^>]*>/g, " ").replace(/\{[^}]*\}/g, " ").replace(/&nbsp;/g, " ").trim();
  return { text: textOnly, alts, labels, srOnly, hasExpression: /\{[^}]+\}/.test(markup.replace(/<[^>]*>/g, "")) };
}

const PLACEHOLDER_ALT = /^(image|img|photo|picture|foto|imagem|graphic|icon|logo|banner|untitled|screenshot|.*\.(png|jpe?g|gif|webp|svg|avif))$|^img[_-]?\d+/i;
const OVERLAY = /acsbapp|accessibe|userway|audioeye|equalweb|accessiway|max-access|enable\.co\.il|userwaywidget/i;
const CLAIM = /\b(ada|wcag(?:\s*2(?:\.\d)?)?(?:\s*aa)?|section\s*508)[\s-]+(compliant|certified|conformant|approved)\b|\b100\s*%\s*(accessible|acess[ií]vel)\b|\bfully\s+accessible\b|\btotalmente\s+acess[ií]vel\b|\bem\s+conformidade\s+com\s+(a\s+)?(ada|wcag)\b/i;
const LOW_TEXT = /(?<![\w:-])(?:placeholder:)?text-(gray|slate|zinc|neutral|stone)-(100|200|300|400)\b/g;

export function scanText(text, file) {
  const ext = extname(file).toLowerCase();
  const out = [];
  const lines = text.split("\n");
  const at = (i) => lineAt(text, i);

  if (MARKUP.has(ext)) {
    // ACS-02: images need a text alternative (alt="" for decoration).
    for (const t of tags(text, ["img", "Image"])) {
      const alt = attr(t.raw, "alt");
      if (alt === null && !hasAny(t.raw, ["aria-label", "aria-labelledby"]) && attr(t.raw, "role") !== "presentation" && !/aria-hidden\s*=\s*["{]?true/.test(t.raw)) {
        out.push(finding("ACS-02", "img-no-alt", file, at(t.index), t.raw, "high", "image without alt: a screen reader reads the file name"));
      } else if (alt && PLACEHOLDER_ALT.test(alt.trim().replace(/^["'`]|["'`]$/g, ""))) {
        out.push(finding("ACS-02", "img-placeholder-alt", file, at(t.index), t.raw, "check", "alt looks like a file name or placeholder"));
      }
    }
    // ACS-04: form fields need a label a screen reader can tie to them.
    const labelled = new Set([...text.matchAll(/(?:htmlFor|for)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
    for (const t of tags(text, ["input", "select", "textarea"])) {
      const type = (attr(t.raw, "type") || "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
      if (hasAny(t.raw, ["aria-label", "aria-labelledby", "title"])) continue;
      const id = attr(t.raw, "id");
      if (id && labelled.has(id)) continue;
      const before = text.slice(Math.max(0, t.index - 400), t.index);
      const opens = (before.match(/<label\b/g) || []).length, closes = (before.match(/<\/label>/g) || []).length;
      if (opens > closes) continue; // wrapped in <label>
      const ph = attr(t.raw, "placeholder");
      out.push(finding("ACS-04", ph ? "field-placeholder-only" : "field-no-label", file, at(t.index), t.raw, "high", ph ? "the placeholder is the only label; it disappears on typing and is not a label" : "form field with no label"));
    }
    // ACS-05: buttons and links need an accessible name.
    for (const t of tags(text, ["button", "a"])) {
      if (hasAny(t.raw, ["aria-label", "aria-labelledby", "title"])) continue;
      if (t.name === "a" && attr(t.raw, "href") === null) continue;
      const body = inner(text, t);
      const a = accessibleText(body);
      if (a.text || a.alts.length || a.labels.length || a.srOnly) continue;
      if (a.hasExpression) out.push(finding("ACS-05", `${t.name}-name-unknown`, file, at(t.index), t.raw + body.slice(0, 60), "check", "the name comes from an expression; confirm it is never empty"));
      else out.push(finding("ACS-05", `${t.name}-no-name`, file, at(t.index), t.raw + body.trim().slice(0, 60), "high", `${t.name === "a" ? "link" : "button"} with only an icon and no accessible name`));
    }
    // ACS-06: the page language (and a title) in documents that have <html>/<head>.
    for (const t of tags(text, ["html"])) {
      if (attr(t.raw, "lang") === null) out.push(finding("ACS-06", "html-no-lang", file, at(t.index), t.raw, "high", "no lang on <html>: screen readers guess the language"));
    }
    if (/<head[\s>]/i.test(text) && !/<title[\s>]/i.test(text) && /\.html?$/.test(ext)) {
      out.push(finding("ACS-06", "no-title", file, at(text.search(/<head[\s>]/i)), "<head>", "high", "page without <title>"));
    }
    // ACS-03: a click handler on something the keyboard cannot reach.
    for (const t of tags(text, ["div", "span", "li", "td", "img", "section", "article"])) {
      if (!/\son(Click|click)\s*=/.test(t.raw)) continue;
      const role = attr(t.raw, "role"), tab = attr(t.raw, "tabIndex") ?? attr(t.raw, "tabindex");
      if (role && tab !== null) continue;
      out.push(finding("ACS-03", "click-not-focusable", file, at(t.index), t.raw, "high", `<${t.name}> with a click handler but no ${!role ? "role" : ""}${!role && tab === null ? " and no " : ""}${tab === null ? "tabIndex" : ""}: a keyboard cannot use it`));
    }
    for (const m of text.matchAll(/tab[iI]ndex\s*=\s*(?:\{|["'])\s*([1-9]\d*)/g)) {
      out.push(finding("ACS-03", "positive-tabindex", file, at(m.index), lines[at(m.index) - 1], "check", "positive tabindex reorders focus away from the visual order"));
    }
  }

  // ACS-03: focus outlines removed with no replacement in the same rule or class list.
  const fileHasFocusStyle = /:focus-visible|focus-visible:|:focus\s*\{[^}]*(outline|box-shadow|border)|focus:(ring|outline|border|shadow)-/.test(text);
  lines.forEach((l, i) => {
    if (/(\boutline-none\b|outline\s*:\s*(none|0)\b)/.test(l) && !/focus-visible|focus:ring|focus:outline-|focus:border|focus:shadow/.test(l)) {
      const isFocusRule = /:focus\b/.test(l) || (ext.match(/css/) && /:focus\b/.test(lines.slice(Math.max(0, i - 3), i + 1).join(" ")));
      if (isFocusRule || !fileHasFocusStyle) out.push(finding("ACS-03", "focus-outline-removed", file, i + 1, l, isFocusRule ? "high" : "check", "the focus outline is removed and nothing here draws another one"));
    }
  });

  // ACS-01: Tailwind grays light enough to fail on a white background.
  lines.forEach((l, i) => {
    for (const m of l.matchAll(LOW_TEXT)) out.push(finding("ACS-01", "light-text-class", file, i + 1, l, "check", `${m[0]} is under 4.5:1 on white (gray-400 is 2.53:1); confirm the background`));
  });

  // ACS-07: accessibility overlays and claims of full compliance.
  lines.forEach((l, i) => {
    if (OVERLAY.test(l)) out.push(finding("ACS-07", "overlay-script", file, i + 1, l, "high", "accessibility overlay: it does not fix the source and is not a defence (FTC v. accessiBe, 2025)"));
    if (CLAIM.test(l)) out.push(finding("ACS-07", "compliance-claim", file, i + 1, l, "high", "claim of full accessibility compliance: needs proof it holds (see VER-04)"));
  });
  return out;
}

function* walk(path) {
  const st = statSync(path);
  if (st.isFile()) { if (EXT.has(extname(path).toLowerCase())) yield path; return; }
  for (const name of readdirSync(path)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    yield* walk(join(path, name));
  }
}

export function scan(paths, base = process.cwd()) {
  const findings = [];
  let files = 0;
  for (const p of paths) for (const f of walk(p)) {
    files++;
    findings.push(...scanText(readFileSync(f, "utf8"), f).map((x) => ({ ...x, file: relative(base, x.file) || x.file })));
  }
  findings.sort((a, b) => a.control.localeCompare(b.control) || a.file.localeCompare(b.file) || a.line - b.line);
  return { files, findings };
}

function selfTest() {
  const rules = (text, file = "x.tsx") => scanText(text, file).map((f) => `${f.control}:${f.rule}:${f.confidence}`);
  assert.deepEqual(rules(`<img src="a.png">`), ["ACS-02:img-no-alt:high"]);
  assert.deepEqual(rules(`<img src="a.png" alt="">`), [], "alt=\"\" marks decoration");
  assert.deepEqual(rules(`<Image src={hero} alt="IMG_2041.jpg" />`), ["ACS-02:img-placeholder-alt:check"]);
  assert.deepEqual(rules(`<input placeholder="Email" />`), ["ACS-04:field-placeholder-only:high"]);
  assert.deepEqual(rules(`<label htmlFor="e">Email</label><input id="e" />`), []);
  assert.deepEqual(rules(`<label>Email <input type="email" /></label>`), []);
  assert.deepEqual(rules(`<input type="hidden" name="t" />`), []);
  assert.deepEqual(rules(`<button onClick={() => open()}><MenuIcon /></button>`), ["ACS-05:button-no-name:high"]);
  assert.deepEqual(rules(`<button aria-label="Menu"><MenuIcon /></button>`), []);
  assert.deepEqual(rules(`<button><X /><span className="sr-only">Close</span></button>`), []);
  assert.deepEqual(rules(`<button>{label}</button>`), ["ACS-05:button-name-unknown:check"]);
  assert.deepEqual(rules(`<a href="/"><img src="l.svg" alt="Home"></a>`, "x.html"), []);
  assert.deepEqual(rules(`<html><head><title>x</title></head>`, "i.html"), ["ACS-06:html-no-lang:high"]);
  assert.deepEqual(rules(`<html lang="pt-BR"><head></head>`, "i.html"), ["ACS-06:no-title:high"]);
  assert.deepEqual(rules(`<div className="card" onClick={() => go(a > b)}>x</div>`), ["ACS-03:click-not-focusable:high"]);
  assert.deepEqual(rules(`<div role="button" tabIndex={0} onClick={go}>x</div>`), []);
  assert.deepEqual(rules(`<input className="outline-none" aria-label="q" />`), ["ACS-03:focus-outline-removed:check"]);
  assert.deepEqual(rules(`<input className="outline-none focus-visible:ring-2" aria-label="q" />`), []);
  assert.deepEqual(rules(`a:focus { outline: none; }`, "s.css"), ["ACS-03:focus-outline-removed:high"]);
  assert.deepEqual(rules(`<p className="text-gray-400">hi</p>`), ["ACS-01:light-text-class:check"]);
  assert.deepEqual(rules(`<p className="text-gray-600 hover:text-gray-900">hi</p>`), []);
  assert.deepEqual(rules(`<script src="https://acsbapp.com/apps/app/dist/js/app.js"></script>`, "i.html").filter((r) => r.startsWith("ACS-07")), ["ACS-07:overlay-script:high"]);
  assert.deepEqual(rules(`<p>Our site is 100% ADA compliant.</p>`), ["ACS-07:compliance-claim:high"]);
  assert.deepEqual(rules(`<p>Site totalmente acessível e em conformidade com a WCAG</p>`), ["ACS-07:compliance-claim:high"]);
  assert.equal(tags(`<div onClick={() => a > b ? 1 : 2} id="x">`, ["div"])[0].raw.endsWith(`id="x">`), true, "arrow functions do not end the tag");
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();
  else {
    const paths = args.filter((a) => !a.startsWith("--"));
    if (!paths.length) { console.error("usage: scan.mjs <dir|file>... [--json] | --self-test"); process.exit(2); }
    const res = scan(paths);
    if (args.includes("--json")) console.log(JSON.stringify(res, null, 2));
    else {
      console.log(`${res.files} files, ${res.findings.length} findings`);
      for (const f of res.findings) console.log(`${f.control} ${f.confidence.padEnd(5)} ${f.file}:${f.line}  ${f.rule}: ${f.note}\n      ${f.excerpt}`);
    }
  }
}
