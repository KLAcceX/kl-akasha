---
name: maat
description: Checks a web app or SaaS against the rules it must follow, with evidence for every verdict and a dated source for every rule. The Accessibility niche is live, measured against WCAG 2.2 AA and labelled by the law behind each item (LBI and NBR 17225, the European Accessibility Act, ADA, Section 508), covering color contrast in light and dark themes, alt text, form labels, button and link names, page language, keyboard navigation and focus, and overlays or "fully compliant" claims. It audits a whole app, checks only what a PR touches, fixes what it finds when asked (contrast at the token level), re-checks its sources. Use whenever the user mentions accessibility, a11y, WCAG, contrast, alt text, screen readers, keyboard navigation, focus, overlays, ADA, EAA or NBR 17225, asks to fix colors or make an app accessible, or asks whether an app is compliant or could cause legal trouble, in any language. Privacy, Consent, Contracts, Veracity and Licensing are planned, so say they were not checked, never that they pass.
compatibility: Scripts need Node.js 18+. Rendered-page checks (browse.mjs) also need Playwright with Chromium and axe-core; without them, the static checks still run and the report says what was not verified.
---

# Ma'at

Ma'at was the Egyptian goddess of truth, justice and order. At the judgment of the dead, the heart was weighed against her feather after the 42 "negative confessions": "I have not lied", "I have not stolen". Here every control is a declaration the app must prove before the scale. **Ma'at weighs the evidence; the user decides.**

## Pick the job

| The user wants | Read |
|---|---|
| a full check: "is my app accessible?", "can this app get me in legal trouble?" | `references/core/audit.md`, then the area files of each live niche |
| only what a PR, branch or diff changes | `references/core/diff.md` |
| to know if the rules Ma'at cites are still current | `references/core/sources.md` |
| contrast, colors, dark mode, design tokens (ACS-01) | `references/accessibility/contrast.md` |
| alt text, form labels, button and link names, page language or title (ACS-02, 04, 05, 06) | `references/accessibility/labels.md` |
| keyboard use, focus order, focus outline, traps, sticky content over focus (ACS-03) | `references/accessibility/keyboard.md` |
| an accessibility widget or overlay, or a "fully compliant" claim (ACS-07) | `references/accessibility/overlays.md` |

A single control runs the same way as an audit, with only that control: the verdict is the one the full audit would give.

## For every job

- **Evidence protocol:** read `references/core/protocol.md` once per conversation. Five verdicts (`fail`, `pass`, `human`, `unverified`, `na`), evidence for each, a dated source for each rule, a second look before a fail or a high-severity pass, no single score, drafts before changes.
- **Profile:** what the product is decides what applies; `references/core/profile.md` says what to ask and which law each control answers to (`references/jurisdictions/`).
- **Scripts:** run them from this skill's directory. `scan.mjs` (static, file and line), `contrast.mjs` (ratios, tokens, suggested fixes), `browse.mjs` (rendered page: axe-core and a keyboard walk; exit 3 means Playwright or axe-core is missing, so mark those checks `unverified`), `report.mjs` (checks the verdicts against the protocol and renders the report).
- **Language:** answer and render the report in the user's language (`--lang pt-BR` or `en`); files, IDs and verdict codes stay in English.
- **Fixes:** when the user asked to fix, change the code and re-measure; otherwise show the fixes as a draft and wait for a yes. Never publish or push without one.
- **Honest scope:** automated tools find a part of the barriers. Every report says what was checked automatically and what still needs a person (a screen reader pass, the critical flows by keyboard).

## Self-check

```bash
node scripts/contrast.mjs --self-test && node scripts/scan.mjs --self-test && node scripts/report.mjs --self-test && node scripts/browse.mjs --self-test && node scripts/is-main.mjs --self-test
```

`node scripts/browse.mjs --self-test --browser` also drives a real browser when Playwright and axe-core are installed.
