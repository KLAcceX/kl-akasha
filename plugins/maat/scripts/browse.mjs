#!/usr/bin/env node
// Ma'at browse: what only a rendered page shows. Two passes on a URL or a local HTML file:
//   axe   runs axe-core with the WCAG 2.0-2.2 A/AA tags, in light and (with --dark) dark color
//         scheme, and maps each rule to a Ma'at control. "incomplete" results are not passes:
//         they are listed for a person to look at.
//   keys  walks the page with Tab like a keyboard user: the focus order, a trap with no way out,
//         a focused element with no visible change (2.4.7), one hidden behind sticky content such
//         as a cookie banner or chat widget (2.4.11), and clickable things Tab never reaches.
// Needs Playwright with Chromium and axe-core (axe only). They are looked up in the project being
// checked, then globally; when missing it exits 3 and says what to install, and the skill goes on
// with the static scan alone.
//
// Usage:
//   node browse.mjs axe <url|file> [--dark] [--axe <axe.min.js>] [--json]
//   node browse.mjs keys <url|file> [--max 80] [--json]
//   node browse.mjs --self-test [--browser]
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { isMain } from "./is-main.mjs";

export const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// axe rule -> Ma'at control. Rules not listed keep "other" and still show in the output.
const RULES = {
  "ACS-01": ["color-contrast", "link-in-text-block"],
  "ACS-02": ["image-alt", "input-image-alt", "area-alt", "svg-img-alt", "role-img-alt", "object-alt", "image-redundant-alt"],
  "ACS-03": ["scrollable-region-focusable", "frame-focusable-content", "nested-interactive", "aria-hidden-focus", "bypass", "tabindex"],
  "ACS-04": ["label", "select-name", "aria-input-field-name", "aria-toggle-field-name", "autocomplete-valid"],
  "ACS-05": ["link-name", "button-name", "input-button-name", "aria-command-name"],
  "ACS-06": ["html-has-lang", "html-lang-valid", "valid-lang", "document-title"],
};
export const controlOf = (rule) => Object.keys(RULES).find((c) => RULES[c].includes(rule)) ?? "other";

function find(mod, sub = "") {
  const roots = [resolvePath(process.cwd(), "package.json"), import.meta.url];
  try { roots.push(resolvePath(execFileSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "noop.js")); } catch {}
  for (const r of roots) {
    try { return createRequire(r).resolve(mod + sub); } catch {}
  }
  return null;
}

async function deps({ axe = false, axePath } = {}) {
  const missing = [];
  const pw = find("playwright");
  let chromium = null;
  if (pw) ({ chromium } = await import(pathToFileURL(pw).href).then((m) => m.default ?? m));
  else missing.push("playwright");
  let axeFile = axePath || process.env.MAAT_AXE || null;
  if (axe && !axeFile) axeFile = find("axe-core", "/axe.min.js");
  if (axe && (!axeFile || !existsSync(axeFile))) missing.push("axe-core");
  if (missing.length) {
    console.log(JSON.stringify({ error: "missing", missing, install: "npm i -D playwright axe-core && npx playwright install chromium", fallback: "run scan.mjs and the manual checks; say in the report that rendered checks did not run" }));
    process.exit(3);
  }
  return { chromium, axeFile };
}

const toUrl = (t) => (/^([a-z][a-z0-9+.-]*:\/\/|data:|about:)/i.test(t) ? t : pathToFileURL(resolvePath(t)).href);

// Shape axe results: one entry per rule, its control and up to 8 nodes.
export function shape(list) {
  return list.map((v) => ({
    rule: v.id, control: controlOf(v.id), impact: v.impact, help: v.help, tags: v.tags.filter((t) => /^wcag\d/.test(t)),
    nodes: v.nodes.slice(0, 8).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 200), summary: (n.failureSummary || "").split("\n").slice(1).join(" ").trim().slice(0, 240) })),
    count: v.nodes.length,
  }));
}

export async function runAxe(target, { dark = false, axePath } = {}) {
  const { chromium, axeFile } = await deps({ axe: true, axePath });
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const scheme of dark ? ["light", "dark"] : ["light"]) {
      const page = await browser.newPage({ colorScheme: scheme });
      await page.goto(toUrl(target), { waitUntil: "networkidle" }).catch(() => page.goto(toUrl(target)));
      await page.addScriptTag({ path: axeFile });
      const r = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "incomplete"] }), TAGS);
      results.push({ scheme, violations: shape(r.violations), incomplete: shape(r.incomplete) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return { target, tags: TAGS, results };
}

// Runs inside the page: everything about the element that has focus now.
function probe() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const sel = (e) => {
    if (e.id) return `#${CSS.escape(e.id)}`;
    const parts = [];
    for (let n = e; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      const sib = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(n.tagName.toLowerCase() + (sib.length > 1 ? `:nth-of-type(${sib.indexOf(n) + 1})` : ""));
      if (n.id) { parts[0] = `#${CSS.escape(n.id)}`; break; }
    }
    return parts.join(" > ");
  };
  const look = () => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join("|"); };
  const focused = look();
  el.blur();
  const resting = look();
  el.focus({ preventScroll: true });
  const r = el.getBoundingClientRect();
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]];
  const covered = pts.map(([x, y]) => {
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true;
    const top = document.elementFromPoint(x, y);
    if (!top || top === el || el.contains(top) || top.contains(el)) return false;
    for (let n = top; n; n = n.parentElement) if (["fixed", "sticky"].includes(getComputedStyle(n).position)) return true;
    return false;
  });
  const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("alt") || el.getAttribute("title") || el.value || "").trim().slice(0, 60);
  return { selector: sel(el), tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", name, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], visibleChange: focused !== resting, obscured: covered.every(Boolean) };
}

// Runs inside the page: things that look clickable that the keyboard can never reach.
function unreachable() {
  const focusable = "a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex='-1']),[contenteditable=true]";
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.matches(focusable) || el.closest(focusable) || el.querySelector(focusable)) continue;
    const s = getComputedStyle(el);
    if (s.cursor !== "pointer" && !el.hasAttribute("onclick")) continue;
    if (el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer" && !el.parentElement.matches(focusable)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility === "hidden") continue;
    out.push({ tag: el.tagName.toLowerCase(), text: (el.innerText || "").trim().slice(0, 60), html: el.outerHTML.slice(0, 160) });
  }
  return out.slice(0, 20);
}

// Reads a walk: a repeated short cycle that never reaches the rest is a trap; no visible change
// on focus is 2.4.7; fully covered is 2.4.11.
export function summarize(stops, total) {
  const keys = stops.map((s) => s.selector);
  let trap = null;
  const firstRepeat = keys.findIndex((k, i) => keys.indexOf(k) !== i);
  if (firstRepeat >= 0) {
    const cycle = new Set(keys.slice(keys.indexOf(keys[firstRepeat]), firstRepeat));
    if (keys.indexOf(keys[firstRepeat]) > 0 && cycle.size < Math.max(2, total - 1)) trap = { cycle: [...cycle], reached: new Set(keys).size, focusable: total };
  }
  const unique = [...new Map(stops.map((s) => [s.selector, s])).values()];
  return {
    order: unique.map((s) => `${s.tag}${s.role ? `[${s.role}]` : ""} ${s.name ? `"${s.name}"` : "(no name)"} ${s.selector}`),
    trap,
    noVisibleFocus: unique.filter((s) => !s.visibleChange).map((s) => s.selector),
    obscured: unique.filter((s) => s.obscured).map((s) => s.selector),
    noName: unique.filter((s) => !s.name).map((s) => s.selector),
  };
}

export async function runKeys(target, { max = 80 } = {}) {
  const { chromium } = await deps();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(toUrl(target), { waitUntil: "networkidle" }).catch(() => page.goto(toUrl(target)));
    const total = await page.evaluate(() => [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex='-1'])")].filter((e) => e.getBoundingClientRect().width > 0).length);
    const stops = [];
    for (let i = 0; i < Math.min(max, total * 2 + 4); i++) {
      await page.keyboard.press("Tab");
      const s = await page.evaluate(probe);
      if (!s) { if (stops.length) break; continue; }
      if (stops.length && s.selector === stops[0].selector) break; // wrapped around: full cycle
      stops.push(s);
    }
    const sum = summarize(stops, total);
    if (sum.trap) {
      await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
      const after = await page.evaluate(probe);
      if (after && !sum.trap.cycle.includes(after.selector)) sum.trap = null; // Escape lets focus out: not a trap
    }
    return { target, focusable: total, stops: stops.length, ...sum, unreachable: await page.evaluate(unreachable) };
  } finally {
    await browser.close();
  }
}

async function selfTest(browser) {
  assert.equal(controlOf("color-contrast"), "ACS-01");
  assert.equal(controlOf("image-alt"), "ACS-02");
  assert.equal(controlOf("button-name"), "ACS-05");
  assert.equal(controlOf("html-has-lang"), "ACS-06");
  assert.equal(controlOf("target-size"), "other");
  const st = (selector, extra = {}) => ({ selector, tag: "a", role: "", name: "x", visibleChange: true, obscured: false, ...extra });
  assert.equal(summarize([st("a"), st("b"), st("c")], 3).trap, null, "a clean walk");
  assert.ok(summarize([st("a"), st("b"), st("c"), st("b"), st("c")], 6).trap, "stuck between b and c");
  const s = summarize([st("a", { visibleChange: false }), st("b", { obscured: true, name: "" })], 2);
  assert.deepEqual([s.noVisibleFocus, s.obscured, s.noName], [["a"], ["b"], ["b"]]);
  if (browser) {
    const html = `<!doctype html><html><head><title>t</title><style>#a:focus{outline:none} footer{position:fixed;bottom:0;left:0;right:0;height:120px;background:#fff}</style></head><body>
      <a id="a" href="#">Plain link</a> <button id="b">Ok</button> <div id="d" style="cursor:pointer" onclick="x()">Fake button</div>
      <div style="height:2000px"></div><a id="z" href="#" style="position:fixed;bottom:10px;left:10px">Hidden link</a><footer>cookies</footer></body></html>`;
    const r = await runKeys("data:text/html," + encodeURIComponent(html));
    assert.ok(r.noVisibleFocus.includes("#a"), "outline removed is caught");
    assert.ok(!r.noVisibleFocus.includes("#b"), "default focus ring is visible");
    assert.ok(r.obscured.includes("#z"), "link under the fixed footer is obscured");
    assert.ok(r.unreachable.some((u) => u.text === "Fake button"), "clickable div is unreachable");
    if (find("axe-core", "/axe.min.js") || process.env.MAAT_AXE) {
      const a = await runAxe("data:text/html," + encodeURIComponent(`<!doctype html><html><head><title>t</title></head><body><main><img src="x.png"><button></button><p style="color:#9ca3af">low</p></main></body></html>`));
      const rules = a.results[0].violations.map((v) => v.rule);
      for (const r of ["image-alt", "button-name", "html-has-lang", "color-contrast"]) assert.ok(rules.includes(r), `axe finds ${r}`);
    } else console.log("axe-core not found: axe pass skipped");
  }
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
  const [cmd, target] = args.filter((a, i) => !a.startsWith("--") && !["--axe", "--max"].includes(args[i - 1]));
  const out = (r) => console.log(args.includes("--json") ? JSON.stringify(r, null, 2) : JSON.stringify(r, null, 1));
  if (args.includes("--self-test")) await selfTest(args.includes("--browser"));
  else if (cmd === "axe" && target) out(await runAxe(target, { dark: args.includes("--dark"), axePath: opt("--axe") }));
  else if (cmd === "keys" && target) out(await runKeys(target, { max: Number(opt("--max", 80)) }));
  else { console.error("usage: browse.mjs axe <url|file> [--dark] [--axe file] | keys <url|file> [--max n] | --self-test [--browser]"); process.exit(2); }
}
