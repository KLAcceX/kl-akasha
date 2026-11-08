# Contrast

**ACS-01 Color contrast.** Low-contrast text is the most common accessibility failure on the web: 83.9% of the top million home pages in 2026 (WebAIM Million). AI-built apps make it worse by default: Tailwind's `text-gray-400` on white is 2.53:1, and white on `bg-indigo-500` is 4.46:1.

## The rule

| Criterion | Level | Minimum |
|---|---|---|
| 1.4.3 Contrast (Minimum) | AA | 4.5:1 for text; 3:1 for large text (at least 18pt = 24px, or 14pt bold ≈ 18.5px with weight 700) |
| 1.4.11 Non-text Contrast | AA | 3:1 for parts needed to identify a control and its state (input borders when they are the only cue, focus rings, icons that carry meaning) and for graphics needed to understand content |
| 1.4.6 Contrast (Enhanced) | AAA | 7:1; not required by any law below. Report as a suggestion, never a failure |

- **Never round.** White on `#6366f1` is 4.469…:1, shown as 4.46:1, and fails 4.5:1. `contrast.mjs` shows two decimals cut down, never up.
- **Placeholder, hover and focus text count.** Disabled controls (`disabled`, `aria-disabled`) and logotypes do not. Light gray on an active control is not "disabled".
- **APCA and WCAG 3 are not pass/fail.** WCAG 3.0 is still a Working Draft (10/09/2026) and its contrast method is undecided. APCA may be shown as information only.

## How to check

1. **Tokens first.** Find the theme files (`globals.css`, `app.css`, `tailwind.config.*`, `@theme`, `:root`/`.dark` blocks) and run `node scripts/contrast.mjs tokens <files> --json`. It reads hex, rgb, hsl, oklch and shadcn's bare `H S% L%`, resolves `var()`, checks `X-foreground` on `X`, foreground and muted text on the background, and border, input and ring at 3:1, in light and dark. Add custom pairs with `--pair --text-soft:--surface`. A border or input under 3:1 comes back as `check`: it fails 1.4.11 only if it is the one thing that shows where the field is, which needs a look → `human` unless the code shows no other cue (no background fill, no label box).
2. **Classes.** `scan.mjs` flags light Tailwind grays (`text-gray-300/400`, `placeholder:text-*-400`) as `check`: confirm the background behind them before calling a fail; `contrast.mjs ratio <fg> <bg>` gives the number.
3. **Rendered page.** With a URL, `browse.mjs axe --dark` runs axe's `color-contrast` in both schemes. Its `incomplete` items (text over images, gradients, transparency) are not passes: list them as `human`.
4. **What stays manual:** text on photos and gradients, charts whose series differ only by color (1.4.1), states that only appear after interaction.

Evidence for a fail: the pair, both values, the ratio and the minimum, and where the token is defined (`app/globals.css:12 --muted-foreground #9ca3af on --background #ffffff = 2.53:1, min 4.5`).

## Fix

- **Fix the token, not the element.** Change `--muted-foreground`, `--primary`, `--border` (or the Tailwind scale used for them) so every pair passes; 40 class names follow. `contrast.mjs suggest <fg> <bg>` finds the smallest change and says whether to move the text or the background: white text on a brand color usually means darkening the brand color.
- Fix **both themes**: dark mode often fails the other way round.
- Re-run `contrast.mjs tokens` after the change and put the new ratios in the report.
- Offer a CI check: `node scripts/contrast.mjs tokens app/globals.css` exits 1 when a text pair fails.

## Sources

- WCAG 2.2, SC 1.4.3, 1.4.11, definitions of contrast ratio, relative luminance and large scale. https://www.w3.org/TR/WCAG22/#contrast-minimum, checked 2026-11-04 [primary, via the W3C's source repository]
- Understanding 1.4.3 (no rounding; placeholder, hover and focus in scope). https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html, checked 2026-11-04 [primary]
- WebAIM Million 2026: 95.9% of home pages with detectable failures, low contrast on 83.9%. https://webaim.org/projects/million/, checked 2026-11-04 [secondary: the page was blocked, figures read in coverage of the report]
- WCAG 3.0 status (Working Draft, contrast method undecided). https://www.w3.org/standards/history/wcag-3.0/, checked 2026-11-04 [primary]
