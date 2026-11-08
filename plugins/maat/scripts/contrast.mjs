#!/usr/bin/env node
// Ma'at contrast: WCAG 2.2 contrast ratios, computed the way the W3C defines them and never
// rounded (4.469:1 fails 4.5:1). It reads colors in any CSS form a design system uses (hex, rgb,
// hsl, oklch, shadcn's bare "H S% L%" triplets), checks the token pairs a theme actually uses,
// in light and dark, and suggests the nearest color that passes, so a fix lands on the token.
//
// Usage:
//   node contrast.mjs ratio <fg> <bg> [--large] [--json]
//   node contrast.mjs tokens <css-file>... [--pair fg:bg[:min]]... [--json]
//   node contrast.mjs suggest <fg> <bg> [--min 4.5] [--json]
//   node contrast.mjs --self-test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isMain } from "./is-main.mjs";

// WCAG 2.2 thresholds: 1.4.3 (text, large text) and 1.4.11 (non-text: UI parts and graphics).
export const MIN = { text: 4.5, large: 3, ui: 3 };

const NAMED = { white: "#ffffff", black: "#000000", transparent: "#00000000" };
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

// A CSS number that may be a percentage of `whole`.
const num = (s, whole = 1) => (String(s).trim().endsWith("%") ? (parseFloat(s) / 100) * whole : parseFloat(s));

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

// OKLCH -> linear sRGB -> gamma sRGB (Björn Ottosson's matrices, as CSS Color 4 uses them).
function oklchToRgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => {
    c = clamp(c);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  });
}

// Any supported color string -> { r, g, b, a } with channels in 0..1, or null.
export function parseColor(input) {
  let s = String(input).trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m;
  if ((m = s.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const v = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? v(6) : 1 };
  }
  const parts = (body) => body.replace(/[,/]/g, " ").split(/\s+/).filter(Boolean);
  if ((m = s.match(/^rgba?\((.*)\)$/))) {
    const [r, g, b, a = "1"] = parts(m[1]);
    return { r: num(r, 255) / 255, g: num(g, 255) / 255, b: num(b, 255) / 255, a: num(a) };
  }
  if ((m = s.match(/^hsla?\((.*)\)$/)) || (m = s.match(/^(-?[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%(?:\s*\/\s*[\d.]+%?)?)$/))) {
    const [h, sat, l, a = "1"] = parts(m[1]);
    const [r, g, b] = hslToRgb(parseFloat(h), num(sat), num(l));
    return { r, g, b, a: num(a) };
  }
  if ((m = s.match(/^oklch\((.*)\)$/))) {
    const [L, C, H, a = "1"] = parts(m[1]);
    const [r, g, b] = oklchToRgb(num(L), num(C, 0.4), parseFloat(H) || 0);
    return { r, g, b, a: num(a) };
  }
  return null;
}

// A color with alpha, painted over an opaque background.
export function over(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

// WCAG relative luminance (the 0.04045 threshold of the current text).
export function luminance({ r, g, b }) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function ratio(fg, bg) {
  const f = typeof fg === "string" ? parseColor(fg) : fg;
  let b = typeof bg === "string" ? parseColor(bg) : bg;
  if (!f || !b) return null;
  if ((b.a ?? 1) < 1) b = over(b, { r: 1, g: 1, b: 1 }); // WCAG: no background means white
  const [l1, l2] = [luminance(over(f, b)), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Shown with two decimals, cut and never rounded up, so 4.497 reads 4.49 and not 4.50.
export const show = (r) => (Math.floor(r * 100) / 100).toFixed(2);

export const toHex = ({ r, g, b }) =>
  "#" + [r, g, b].map((c) => Math.round(clamp(c) * 255).toString(16).padStart(2, "0")).join("");

function rgbToHsl({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// Move one color's lightness (same hue and saturation) in one direction until the pair reaches
// `min`. Returns the color and how far it moved, or null if it never gets there.
function walkLightness(moving, fixed, dir, min, movingIsFg) {
  const [h, s, l] = rgbToHsl(moving);
  for (let step = 1; step <= 200; step++) {
    const nl = clamp(l + dir * step * 0.005);
    const [r, g, b] = hslToRgb(h, s, nl);
    const c = { r, g, b, a: 1 };
    const rr = movingIsFg ? ratio(c, fixed) : ratio(fixed, c);
    if (rr >= min) return { color: toHex(c), ratio: rr, delta: Math.abs(nl - l) };
    if (nl === 0 || nl === 1) break;
  }
  return null;
}

// The smallest change that makes the pair reach `min`: darker or lighter text, or a darker or
// lighter background, whichever moves least. White text on a brand color usually means darkening
// the brand color, not graying the text. `target` says which token to change.
export function suggest(fgStr, bgStr, min = MIN.text) {
  const fg = parseColor(fgStr), bg = parseColor(bgStr);
  if (!fg || !bg) return null;
  if (ratio(fg, bg) >= min) return { target: "fg", color: toHex(fg), ratio: ratio(fg, bg), changed: false };
  const tries = [
    ["fg", walkLightness(fg, bg, -1, min, true)],
    ["fg", walkLightness(fg, bg, 1, min, true)],
    ["bg", walkLightness(bg, fg, -1, min, false)],
    ["bg", walkLightness(bg, fg, 1, min, false)],
  ].filter(([, r]) => r);
  if (!tries.length) return null;
  tries.sort((a, b) => a[1].delta - b[1].delta);
  const [target, best] = tries[0];
  return { target, color: best.color, ratio: best.ratio, changed: true };
}

// ---- design tokens -------------------------------------------------------------------------

// The block that a `{` at index i opens, as [start of body, index of its closing brace].
function blockEnd(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i;
  }
  return css.length;
}

const DARK = /(^|[\s,])(\.dark|\[data-theme=["']?dark["']?\]|\[data-mode=["']?dark["']?\]|:root\.dark|html\.dark)\b/;

// CSS custom properties per theme. Light = :root/html/body; dark = .dark, [data-theme=dark] or
// :root inside @media (prefers-color-scheme: dark). Dark inherits light, as in the browser.
export function readTokens(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const light = {}, dark = {};
  const decls = (body, into) => {
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) into[m[1]] = m[2].trim();
  };
  const walk = (text, inDarkMedia) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const head = text.slice(i, open).split(/[;}]/).pop().trim();
      const close = blockEnd(text, open);
      const body = text.slice(open + 1, close);
      if (head.startsWith("@media")) walk(body, inDarkMedia || /prefers-color-scheme:\s*dark/.test(head));
      else if (head.startsWith("@")) walk(body, inDarkMedia);
      else if (DARK.test(head)) decls(body, dark);
      else if (/(^|,)\s*(:root|html|body|:host)\s*($|,)/.test(head)) decls(body, inDarkMedia ? dark : light);
      i = close + 1;
    }
  };
  walk(css, false);
  return { light, dark: Object.keys(dark).length ? { ...light, ...dark } : {}, darkOwn: new Set(Object.keys(dark)) };
}

// Resolve var(--x) and var(--x, fallback) chains.
function resolve(vars, value, seen = new Set()) {
  const m = String(value).match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (!m) return value;
  if (seen.has(m[1])) return null;
  seen.add(m[1]);
  return vars[m[1]] !== undefined ? resolve(vars, vars[m[1]], seen) : m[2] ? resolve(vars, m[2], seen) : null;
}

// The pairs a design system uses: X-foreground on X (shadcn, Radix), foreground and
// muted-foreground on the page background, and borders, inputs and focus rings (non-text, 3:1).
export function tokenPairs(vars, extra = []) {
  const has = (k) => vars[k] !== undefined;
  const pairs = [];
  const add = (fg, bg, min, kind) => {
    if (has(fg) && has(bg) && !pairs.some((p) => p.fg === fg && p.bg === bg)) pairs.push({ fg, bg, min, kind });
  };
  for (const k of Object.keys(vars)) {
    const m = k.match(/^(--.+)-foreground$/);
    if (m) add(k, m[1], MIN.text, "text");
  }
  add("--foreground", "--background", MIN.text, "text");
  add("--muted-foreground", "--background", MIN.text, "text");
  add("--muted-foreground", "--card", MIN.text, "text");
  for (const k of Object.keys(vars)) {
    if (/^--(color-)?text(-[\w-]+)?$/.test(k)) for (const bg of ["--background", "--bg", "--color-background", "--color-bg"]) add(k, bg, MIN.text, "text");
  }
  for (const ui of ["--border", "--input", "--ring"]) add(ui, "--background", MIN.ui, "ui");
  for (const p of extra) add(p.fg, p.bg, p.min ?? MIN.text, p.kind ?? "text");
  return pairs;
}

// Every pair in every theme, with its ratio and a status. Text under its threshold fails
// (WCAG 1.4.3). A border or input outline under 3:1 is "check": it fails 1.4.11 only when it is
// the one thing that shows where the control is, which a person has to look at.
export function checkTokens(css, extra = []) {
  const { light, dark, darkOwn } = readTokens(css);
  const rows = [];
  for (const [theme, vars] of Object.entries({ light, dark })) {
    if (!Object.keys(vars).length) continue;
    for (const p of tokenPairs(vars, extra)) {
      // In dark, a pair the dark theme does not touch is the light pair again: skip it. A pair
      // with one side redefined and the other inherited may never be painted together: check.
      const own = theme === "dark" ? [darkOwn.has(p.fg), darkOwn.has(p.bg)] : [true, true];
      if (!own[0] && !own[1]) continue;
      const fgV = resolve(vars, vars[p.fg]), bgV = resolve(vars, vars[p.bg]);
      const r = fgV && bgV ? ratio(fgV, bgV) : null;
      let status = r === null ? "unreadable" : r >= p.min ? "pass" : p.kind === "ui" && p.fg !== "--ring" ? "check" : "fail";
      const inherited = own[0] && own[1] ? null : own[0] ? p.bg : p.fg;
      if (status === "fail" && inherited) status = "check";
      const fix = status === "fail" ? suggest(fgV, bgV, p.min) : null;
      const suggestion = fix && fix.changed ? { token: fix.target === "fg" ? p.fg : p.bg, color: fix.color, ratio: fix.ratio } : null;
      rows.push({ theme, fg: p.fg, bg: p.bg, fgValue: fgV, bgValue: bgV, ratio: r, min: p.min, kind: p.kind, status, suggestion, inherited });
    }
  }
  return rows;
}

// ---- CLI -----------------------------------------------------------------------------------

function cli(args) {
  const json = args.includes("--json");
  const [cmd, ...rest] = args.filter((a) => a !== "--json");
  if (cmd === "ratio") {
    const [fg, bg] = rest;
    const r = ratio(fg, bg);
    if (r === null) return fail(`can't read the colors "${fg}" and "${bg}"`);
    const min = rest.includes("--large") ? MIN.large : MIN.text;
    const out = { fg, bg, ratio: r, shown: show(r), text: r >= MIN.text, large: r >= MIN.large, ui: r >= MIN.ui, passes: r >= min };
    console.log(json ? JSON.stringify(out) : `${show(r)}:1  text ${out.text ? "pass" : "FAIL"} (4.5)  large ${out.large ? "pass" : "FAIL"} (3)  ui ${out.ui ? "pass" : "FAIL"} (3)`);
    return;
  }
  if (cmd === "suggest") {
    const [fg, bg] = rest;
    const i = rest.indexOf("--min");
    const s = suggest(fg, bg, i >= 0 ? Number(rest[i + 1]) : MIN.text);
    if (!s) return fail("no color with that hue reaches the target");
    console.log(json ? JSON.stringify(s) : s.changed ? `change the ${s.target === "fg" ? "text" : "background"} to ${s.color}  ${show(s.ratio)}:1` : `already passes  ${show(s.ratio)}:1`);
    return;
  }
  if (cmd === "tokens") {
    const extra = [];
    const files = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--pair") {
        const [fg, bg, min] = rest[++i].split(":");
        extra.push({ fg, bg, min: min ? Number(min) : undefined });
      } else files.push(rest[i]);
    }
    if (!files.length) return fail("give at least one CSS file");
    const rows = files.flatMap((f) => checkTokens(readFileSync(f, "utf8"), extra).map((r) => ({ file: f, ...r })));
    if (json) return console.log(JSON.stringify(rows, null, 2));
    if (!rows.length) return console.log("no token pairs found (pass --pair fg:bg for custom names)");
    for (const r of rows) {
      const shown = r.ratio === null ? "  ?  " : show(r.ratio);
      const tip = (r.suggestion ? `  -> ${r.suggestion.token}: ${r.suggestion.color} (${show(r.suggestion.ratio)}:1)` : "") + (r.inherited ? `  (${r.inherited} comes from the light theme: confirm they are used together)` : "");
      console.log(`${r.status.toUpperCase().padEnd(10)} ${shown}:1 (min ${r.min})  [${r.theme}] ${r.fg} ${r.fgValue} on ${r.bg} ${r.bgValue}${tip}  ${r.file}`);
    }
    process.exitCode = rows.some((r) => r.status === "fail") ? 1 : 0;
    return;
  }
  fail("usage: contrast.mjs ratio <fg> <bg> | tokens <css>... | suggest <fg> <bg> | --self-test");
}

function fail(msg) {
  console.error(msg);
  process.exitCode = 2;
}

function selfTest() {
  const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} is not ~${b}`);
  // Reference values: the W3C formula, checked against the Tailwind 3.4 palette.
  near(ratio("#000", "#fff"), 21);
  near(ratio("#767676", "#ffffff"), 4.54);
  near(ratio("#777777", "#ffffff"), 4.48);
  near(ratio("#9ca3af", "#ffffff"), 2.54);
  near(ratio("#ffffff", "#6366f1"), 4.47);
  near(ratio("#ffffff", "#3b82f6"), 3.68);
  assert.ok(ratio("#ffffff", "#6366f1") < MIN.text, "4.47 must fail 4.5: never rounded");
  assert.equal(show(4.4999), "4.49");
  // Every syntax lands on the same color.
  for (const c of ["#fff", "rgb(255 255 255)", "rgb(255,255,255)", "hsl(0 0% 100%)", "0 0% 100%", "oklch(1 0 0)", "oklch(100% 0 0)", "white"]) near(ratio(c, "#000"), 21);
  near(ratio("oklch(0.556 0 0)", "#ffffff"), ratio("#737373", "#ffffff"), 0.05);
  // Alpha is painted over the background first.
  near(ratio("rgba(0,0,0,0.5)", "#ffffff"), ratio("#808080", "#ffffff"), 0.05);
  // Suggestions reach the target and stay close to the original hue.
  const s = suggest("#9ca3af", "#ffffff");
  assert.ok(s.changed && s.target === "fg" && s.ratio >= 4.5, "gray text on white: darken the text");
  const brand = suggest("#ffffff", "#6366f1");
  assert.equal(brand.target, "bg", "white text on a brand color: darken the brand color, not the text");
  assert.ok(brand.ratio >= 4.5 && luminance(parseColor(brand.color)) < luminance(parseColor("#6366f1")));
  const darkText = suggest("#334155", "#0f172a");
  assert.ok(darkText.ratio >= 4.5 && darkText.target === "fg" && luminance(parseColor(darkText.color)) > luminance(parseColor("#334155")), "on dark backgrounds the text lightens");
  // Tokens: light and dark themes, shadcn triplets and oklch, pairs and statuses.
  const css = `
    /* shadcn-style */
    :root { --background: 0 0% 100%; --foreground: 222.2 84% 4.9%; --muted: 210 40% 96.1%;
            --muted-foreground: #9ca3af; --primary: #6366f1; --primary-foreground: #ffffff;
            --border: #e5e7eb; --ring: var(--primary); }
    .dark { --background: oklch(0.145 0 0); --foreground: oklch(0.985 0 0); --muted-foreground: #64748b; }
    @media (prefers-color-scheme: dark) { :root { --unused: red; } }`;
  const rows = checkTokens(css);
  const row = (theme, fg, bg) => rows.find((r) => r.theme === theme && r.fg === fg && r.bg === bg);
  assert.equal(row("light", "--foreground", "--background").status, "pass");
  assert.equal(row("light", "--muted-foreground", "--background").status, "fail");
  assert.ok(row("light", "--muted-foreground", "--background").suggestion, "a failing pair gets a suggestion");
  assert.equal(row("light", "--primary-foreground", "--primary").status, "fail");
  assert.equal(row("light", "--border", "--background").status, "check");
  assert.equal(row("light", "--ring", "--background").status, "pass", "ring resolves through var()");
  assert.equal(row("dark", "--foreground", "--background").status, "pass");
  assert.equal(row("dark", "--muted-foreground", "--background").status, "fail");
  assert.equal(row("dark", "--muted-foreground", "--muted").status, "check", "--muted is inherited from light: check, not fail");
  assert.equal(row("dark", "--primary-foreground", "--primary"), undefined, "a pair dark does not touch is not repeated");
  assert.equal(readTokens(css).dark["--unused"], "red", "prefers-color-scheme: dark counts as dark");
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--self-test")) selfTest();
  else cli(process.argv.slice(2));
}
