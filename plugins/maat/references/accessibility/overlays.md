# Overlays

**ACS-07 No overlays and no claims of full compliance.** An accessibility overlay is a script (accessiBe, UserWay, AudioEye and others) that promises to make a site accessible without changing its code. It is a common shortcut in AI-built apps, and it is a risk, not a defence:

- The FTC's final order against accessiBe (April 2025): US$ 1 million and 20 years of reporting, for claiming its tool made any website WCAG-compliant without evidence. [primary]
- Sites that already use a widget keep being sued; one tracker counts lawsuits against them every month. [secondary; the count is unconfirmed]
- The overlay does not change the source, so every finding in the other controls still stands.

A sentence like "100% ADA compliant" or "WCAG certified" on the site is an unsubstantiated claim: there is no such certification, and one failing control makes it false. It belongs to the Veracity niche too (VER-04, once built).

## How to check

`node scripts/scan.mjs <app dir> --json`:

- `overlay-script` (high): scripts or text naming acsbapp/accessiBe, UserWay, AudioEye, EqualWeb, AccessiWay, Max Access.
- `compliance-claim` (high): "ADA compliant", "WCAG 2.1 AA compliant/certified", "Section 508 compliant", "100% accessible", "fully accessible", "totalmente acessível", "em conformidade com a WCAG".

Also look at what a tag manager loads on the rendered page (`browse.mjs axe` does not report scripts; open the page and read the network or the DOM when there is a URL).

## Verdict and fix

- Overlay present: `fail`, with the file and line. Fix: remove it and fix the source; the other controls say where.
- Claim present: `fail`. Fix: replace it with an accessibility statement that says what was checked, against which standard, when, what is known not to work yet and how to report a barrier. Draft it; the user approves the wording.
- Neither: `pass` for what the scan saw, noting that tag-manager scripts need the rendered page.

## Sources

- FTC, final order requiring accessiBe to pay US$ 1 million (April 2025). https://www.ftc.gov/news-events/news/press-releases/2025/04/ftc-approves-final-order-requiring-accessibe-pay-1-million, checked 2026-11-04 [primary]
- FTC Act §5 (deceptive claims). https://www.law.cornell.edu/uscode/text/15/45, checked 2026-11-04 [primary, page not re-opened this round]
- UsableNet lawsuit tracker (suits against sites with widgets). https://info.usablenet.com/ada-website-compliance-lawsuit-tracker, checked 2026-11-04 [to confirm]
