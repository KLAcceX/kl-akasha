# Audit

The full run: every niche that applies, one report. It is the same flow as checking one control; only the number of controls changes.

## Steps

1. **Profile.** Fill `references/core/profile.md`. State the controls that apply and the ones that are `na`, with the reason.
2. **Discovery, once.** Run the scripts from this skill's directory and keep their output for every niche:
   - `node scripts/scan.mjs <app dir> --json` (static: files and lines)
   - `node scripts/contrast.mjs tokens <css files> --json` (design tokens, light and dark)
   - with a URL or a built page: `node scripts/browse.mjs axe <url> --dark --json` and `node scripts/browse.mjs keys <url> --json`. Exit code 3 means Playwright or axe-core is missing: say so, and mark the rendered checks `unverified` instead of guessing.
3. **Niches.** For each niche, read its area files and turn the discovery into verdicts. When subagents are available, give each niche its own, with the discovery output and the area file; otherwise do them one by one.
4. **Second opinion.** As in `references/core/protocol.md`.
5. **Report.** Write `verdicts.json` (format at the top of `scripts/report.mjs`), run `node scripts/report.mjs check verdicts.json`, fix every error, then `node scripts/report.mjs render verdicts.json --lang <user's language> --out <report.md>`.
6. **Fixes.** List the fixes in order of reach (a design token beats 40 class names). Apply them only after the user's yes, or right away if they asked for fixes.

## Niches today

| Niche | Status | Area files |
|---|---|---|
| Accessibility | live | `references/accessibility/` |
| Privacy, Consent, Contracts, Veracity, Licensing | planned | not yet: say they were not checked, never that they pass |

When asked for a full legal audit, run what is live and say plainly which niches are not built yet.
