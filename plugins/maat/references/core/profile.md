# Profile

What the product is decides which controls apply and which rule each one answers to. Fill the profile before a full audit; for a single control, ask only what that control needs.

## What to find out

Read the code first and ask only what it does not answer.

| Question | Where the code shows it | Changes |
|---|---|---|
| Does it have a user interface? | HTML, JSX/TSX, Vue, Svelte, templates | No UI: every Accessibility control is `na` |
| Who uses it: consumers, businesses, a government body? | Pricing page, sign-up, contracts the user mentions | Public sector buyers bring ADA Title II / Section 508 in by contract; EU consumers bring the EAA |
| Where are the users? | Languages, currencies, domains (`.com.br`, `.de`), legal pages | Picks the jurisdictions (`references/jurisdictions/`) |
| How big is the company? | Ask | The EAA exempts microenterprises that provide services (under 10 staff and up to €2 million turnover) |
| Is it deployed? A URL? | README, `vercel.json`, env files | A URL (or a local build) lets `scripts/browse.mjs` check the rendered page |
| Does it have dark mode? | `.dark`, `prefers-color-scheme`, theme toggles | Contrast is checked in both themes |

Apply rules by where the users are, not where the company is: the GDPR (art. 3(2)) and the LGPD (art. 3) reach companies abroad, and accessibility laws follow the same logic for services offered in their market.

## The standard to measure against

Audit against **WCAG 2.2 level AA**. It is a practical superset of 2.1 AA (2.2 removed only 4.1.1 Parsing) and is also ISO/IEC 40500:2025, so one pass covers every jurisdiction below. Label each finding with the rule that requires it:

| Market | Rule | Technical level |
|---|---|---|
| Brazil | LBI (Lei 13.146/2015) art. 63; ABNT NBR 17225:2025 | NBR 17225 is based on WCAG 2.2 |
| EU | European Accessibility Act (Directive 2019/882), from 28/06/2025 | EN 301 549 V3.2.1 (WCAG 2.1 AA) is the cited standard; V4.1.1 (WCAG 2.2) was published 02/09/2026 and is not yet cited |
| US, private sector | ADA Title III, by case law (*Robles v. Domino's*, 9th Cir. 2019) | WCAG 2.x AA in settlements |
| US, state and local government | ADA Title II rule (28 CFR 35, subpart H) | WCAG 2.1 AA; deadlines moved to 26/04/2027 and 26/04/2028 |
| US federal | Section 508 | WCAG 2.0 AA |

The six criteria new in 2.2 (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8) are required by NBR 17225 and EN 301 549 V4.1.1, not by ADA Title II or Section 508: say so on those findings.
