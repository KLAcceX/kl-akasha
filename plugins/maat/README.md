# Ma'at: the compliance checker

An app built fast, often with AI, carries rules it was never checked against: contrast that fails, images with no alt, a cookie banner that blocks nothing, a "100% ADA compliant" line in the footer. Ma'at checks an app against those rules and backs every verdict with evidence and every rule with a dated source.

At the judgment of the dead, the Egyptians weighed the heart against the feather of Ma'at, goddess of truth, justice and order, after 42 "negative confessions": "I have not lied", "I have not stolen". Here every control is a declaration the app must prove before the scale. **Ma'at weighs the evidence; you decide.** Nothing is changed, pushed or published without your yes, unless you asked for the fix.

## Install

```bash
claude plugin marketplace add KLAcceX/kl-akasha
claude plugin install maat@kl-akasha
```

Inside Claude Code, `/plugin marketplace add KLAcceX/kl-akasha` and `/plugin install maat@kl-akasha` do the same.

**Needs:** Node.js 18 or newer. For checks on the rendered page, also [Playwright](https://playwright.dev) with Chromium and [axe-core](https://github.com/dequelabs/axe-core) (`npm i -D playwright axe-core && npx playwright install chromium` in the app being checked). Without them, the static checks run and the report says what was not verified.

## What it does

One skill, `maat`. Ask in plain language, in any language: "is my app accessible?", "fix the contrast", "can this app get me in legal trouble?".

| Niche | Status | Areas |
|---|---|---|
| **Core** | live | **Audit** (the whole app, one report) · **Diff** (only what a PR or branch touches) · **Sources** (re-check the rules it cites) · **Profile** (what applies to this product) |
| **Accessibility** | live | **Contrast** (ACS-01) · **Labels** (alt text ACS-02, form labels ACS-04, button and link names ACS-05, page language and title ACS-06) · **Keyboard** (ACS-03) · **Overlays** (ACS-07) |

Accessibility is measured against WCAG 2.2 AA, which covers at once LBI and ABNT NBR 17225 in Brazil, the European Accessibility Act and EN 301 549 in the EU, and ADA Titles II and III and Section 508 in the US. Each finding says which of those requires it.

## How a verdict is reached

| Verdict | Meaning |
|---|---|
| Fails | The evidence shows the control is not met |
| Passes | The evidence shows it is met, within what was checked |
| Needs a person | A judgment Ma'at should not make alone, or a second look disagreed |
| Not verified | Ma'at could not look (no browser, a page behind login) |
| Not applicable | The product rules it out, with the reason |

Every Fails and Passes cites a file and line, a measured value or a script result, and the rule with the date it was checked. A second look tries to refute each failure before the report. The report counts verdicts but never gives a compliance score, and always says what still needs a person: automated tools find only part of the barriers. Ma'at is not legal advice, and a passing control is not a certification.

Reports come in English or Brazilian Portuguese, following the language you ask in.

## Scripts

Run from the plugin folder, no dependencies beyond Node (and Playwright and axe-core for `browse.mjs`):

| Script | What it does |
|---|---|
| `scripts/scan.mjs <dir>` | Static scan with file and line: images without alt, fields without labels, icon-only buttons, missing `lang`, removed focus outlines, clickable `div`s, light Tailwind grays, overlays, compliance claims |
| `scripts/contrast.mjs tokens <css>` | Every design-token pair in light and dark (hex, rgb, hsl, oklch, shadcn triplets), never rounded, with the smallest fix; exits 1 on a failing text pair, so it fits in CI |
| `scripts/contrast.mjs ratio <fg> <bg>` / `suggest <fg> <bg>` | One ratio; the nearest color that passes, changing the text or the background, whichever moves less |
| `scripts/browse.mjs axe <url> --dark` | axe-core on the rendered page, light and dark, mapped to Ma'at controls |
| `scripts/browse.mjs keys <url>` | A keyboard walk: focus order, traps, focus with no visible change, focus hidden by sticky content, clickable things Tab never reaches |
| `scripts/report.mjs check\|render <verdicts.json>` | Checks the verdicts against the evidence protocol, then renders the report in en or pt-BR |

Self-check: `node scripts/contrast.mjs --self-test && node scripts/scan.mjs --self-test && node scripts/report.mjs --self-test && node scripts/browse.mjs --self-test` (add `--browser` to the last one to drive a real browser).
