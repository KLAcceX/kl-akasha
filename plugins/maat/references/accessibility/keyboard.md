# Keyboard

**ACS-03 Keyboard navigation.** Everything a mouse can do, the keyboard can do, in an order that makes sense, with the focus always visible and never hidden. This is where automated tools see least: axe-core has no rule for 2.1.2, 2.4.3, 2.4.7 or 2.4.11, so the walk in `browse.mjs keys` and a person's pass matter most here.

## The rule

| Criterion | Level | Meaning |
|---|---|---|
| 2.1.1 Keyboard | A | All functionality works from a keyboard |
| 2.1.2 No Keyboard Trap | A | Focus can always leave a component with the keyboard (a modal that traps focus on purpose and closes with Esc is fine) |
| 2.1.4 Character Key Shortcuts | A | Single-key shortcuts (`/`, `k`) can be turned off or remapped |
| 2.4.1 Bypass Blocks | A | A skip link or landmarks |
| 2.4.3 Focus Order | A | The order keeps meaning; no positive `tabindex` reshuffling it |
| 2.4.7 Focus Visible | AA | The focused element visibly changes |
| 2.4.11 Focus Not Obscured (Minimum) | AA, new in 2.2 | The focused element is not *entirely* hidden by author content: sticky headers, cookie banners, chat widgets |
| 2.4.13 Focus Appearance | AAA | Not required by law; a suggestion only |

2.4.11 is required where WCAG 2.2 is the standard (NBR 17225, EN 301 549 V4.1.1), not by ADA Title II (2.1) or Section 508 (2.0): label it.

## How to check

1. `node scripts/scan.mjs <app dir> --json`:
   - `click-not-focusable` (high): `div`/`span`/`li` with `onClick` and no `role` + `tabIndex`. Use a `<button>`.
   - `focus-outline-removed`: `outline: none` / `outline-none` with nothing drawing another indicator (high in a `:focus` rule, check otherwise).
   - `positive-tabindex` (check).
2. With a URL, `node scripts/browse.mjs keys <url> --json` presses Tab through the page and reports:
   - `order`: every stop with its role and name, to compare with the visual order;
   - `trap`: a short cycle that Esc does not break;
   - `noVisibleFocus`: elements whose look does not change on focus (2.4.7);
   - `obscured`: elements fully covered by fixed or sticky content when focused (2.4.11);
   - `unreachable`: things that look clickable (pointer cursor, `onclick`) that Tab never reaches (2.1.1).
3. **Manual, always:** the critical flows by keyboard alone (sign-up, login, checkout, the AI chat, any editor), modals (focus moves in, stays in, Esc closes, focus returns to the trigger), menus, comboboxes, drag and drop (2.5.7 needs a non-drag way). Without a browser, say these were not checked.

## Fix

- Native elements first: `<button>`, `<a href>`, `<input>`. Headless libraries (Radix, React Aria, Headless UI) already do the keyboard work; do not strip it.
- One global focus style from a token: `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }`, with `--ring` at 3:1 against the backgrounds. Remove orphan `outline-none`.
- Sticky header or footer: `scroll-padding-top` / `scroll-padding-bottom` equal to their height. A cookie banner that is modal, or one that does not cover content. A chat widget that closes with Esc.
- A skip link as the first focusable element, plus `<header>`, `<nav>`, `<main>` landmarks.

## Sources

- WCAG 2.2 SC 2.1.1, 2.1.2, 2.1.4, 2.4.1, 2.4.3, 2.4.7, 2.4.11, 2.4.13. https://www.w3.org/TR/WCAG22/#keyboard, checked 2026-11-04 [primary]
- Understanding 2.4.11 (cookie banners and sticky content; scroll-padding fix). https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html, checked 2026-11-04 [primary]
- UK GDS accessibility tool audit: 13% to 40% of planted barriers found by the best tools; axe 29%. https://alphagov.github.io/accessibility-tool-audit/, checked 2026-11-04 [primary; the audit is from 2018, so use it as a warning, not as a current rate]
- axe-core rule list (no rule for 2.1.2, 2.4.3, 2.4.7, 2.4.11). https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md, checked 2026-11-04 [primary]
