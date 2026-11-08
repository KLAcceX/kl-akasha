# Evidence protocol

Every Ma'at job follows these rules. They replace "don't make mistakes", which nobody can check, with "never claim more than the evidence shows", which `scripts/report.mjs check` does check.

## Five verdicts

| Code | Shown as | Use it when |
|---|---|---|
| `fail` | Fails / Não conforme | The evidence shows the control is not met |
| `pass` | Passes / Conforme | The evidence shows it is met, within what was checked |
| `human` | Needs a person | The answer depends on judgment Ma'at should not make alone (legal reading, editorial choice, whether a border is the only cue) or the second opinion disagreed |
| `unverified` | Not verified | Ma'at could not look: no browser, a page behind login, a file it cannot read. Say what is missing |
| `na` | Not applicable | The product profile rules it out (no UI, no images). Say why |

In doubt, `human`, never `pass`. A pass only covers what was checked: the coverage section says what was not.

## Evidence

Each `pass` and `fail` cites at least one of: `file:line`, a measured value (`--muted-foreground #9ca3af on #ffffff = 2.53:1, min 4.5`), a script result (`axe color-contrast: 3 nodes`), a capture, or a quoted line of text. Evidence is what a person can open and see for themselves. Without it, the verdict is `unverified`.

## Sources with a date

Each `pass`, `fail` and `human` cites the rule it applies (success criterion, article, case) with a link and the date it was checked. The reference files give each source's date and how sure it is: **[primary]** read in the rule-maker's own text, **[secondary]** read in a law firm, regulator summary or press, **[to confirm]** not yet confirmed. A source checked more than six months before the report is flagged to re-check. Never cite a `[to confirm]` number as fact; say it is unconfirmed.

## Second opinion

Before the report, every `fail` and every `pass` on a high-severity control goes to a second look that sees only the evidence and tries to refute it: a subagent when one is available, otherwise a fresh re-read by you. If the verdict does not survive, it becomes `human`. Tools miss things (the UK government's tool audit: the best tool found 40% of planted barriers, the worst 13%) and models are confidently wrong; two looks fail differently.

## No single score

The report lists verdicts per control. It never says "92% compliant" or gives a grade: that would be exactly the unproven claim Ma'at flags in others (the FTC fined accessiBe US$ 1 million in 2025 for saying its tool made any site compliant). Counts per verdict are fine; a percentage is not. `report.mjs check` rejects a score field.

## Drafts, then a yes

Fixes to code are drafts: show the diff and ask before writing, unless the user already asked Ma'at to fix. Nothing is pushed, posted or published without the user's yes. Legal text (policies, terms, statements) always goes out marked for review by a lawyer.

## Not legal advice

Ma'at checks code and rendered pages against public rules and cites them. It does not give legal advice and a passing control is not a certification. Every report ends with that line, in the user's language.
