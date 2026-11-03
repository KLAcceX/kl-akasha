# Measure the impact

Whether review waits changed in a repo since Argos began commenting there. Formatting a comment well proves nothing on its own: the studies on AI review disagree on speed (`evidence-review.md`, "AI-written comments"), so each repo has to measure itself.

```bash
node scripts/impact.mjs <owner/repo> [--since <YYYY-MM-DD>] [--all] [--json]
```

It only reads, one repo at a time, and only a repo the user named or connected. Before Argos comments anywhere it shows the baseline: run it early, since nothing else keeps that number.

## What it counts

Both sides hold the same number of days and every PR opened in them, with a comment or not, leaving out drafts, the account's own PRs and bots' PRs. A PR opened before the start and commented on since counts on neither side. Times run from the PR's opening, on the clock, nights and weekends included.

| Line | Says | Better means |
|---|---|---|
| First feedback | the wait for anything from someone else, Argos included | lower; Argos alone can move this one |
| First human feedback | the wait for a person; the number the team feels | lower; if it rises, people wait for Argos or skip it |
| To merge | opening to merge, merged PRs only | lower, with the reverts flat |
| Commits after feedback | how much rework follows feedback | lower can be less rework or less reading; never read alone |
| No feedback yet | PRs still with nobody's word | lower |
| Reverts | PRs whose title starts with "Revert" | flat; the guard on going faster |
| Comments on lines | on how many PRs, how many had their line change after, how many were answered, how many suggestions were applied | a low share of changed or answered lines means noise |

## How to read it

- **Report the median and the p75 together,** with `n`: a median hides the stale tail, and the p75 is what people remember.
- **"Too few to compare" means say nothing about the change.** Give the numbers as they are, and the count still missing.
- **A change is not its cause.** A new teammate, a release freeze or a holiday moves the same numbers. Ask what else changed in that time before crediting Argos, and say so in the report.
- **A line changed is not a comment accepted,** and an applied suggestion can be undone later. They show the comment was not ignored, not that it was right. Suggestions applied with a person's own edit are not counted.
- **Never make these a team's target,** and never compare people or repos with them: a measure that becomes a target stops measuring (`evidence-review.md`, "Metrics and their traps").
- **Slower can be the right result.** If waits rise and reverts fall, say both, and let the user judge.

Report in the user's language: one short table per repo, then what it can and cannot say.
