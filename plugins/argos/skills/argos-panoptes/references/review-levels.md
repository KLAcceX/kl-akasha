# Review levels: how many eyes open

Argos sees; the user judges. Every level reads the whole diff. What changes is how deep each look goes and which findings are worth the reader's time. Everything here is **Argos' recommendation**: when the project's own rules (found by `scripts/rules.mjs`) say something different, theirs win. The data behind these defaults is in `evidence.md`.

## Findings by severity

| Severity | Meaning | low | normal | critical | Comment label |
|---|---|---|---|---|---|
| **Blocker** | Wrong behaviour, data loss, security hole, broken contract, a project rule broken | report | report | report | `issue (blocking):` |
| **Important** | Missing error handling, missing test for a changed path, scenario not covered, risky pattern | only if obvious | report | report | `issue (non-blocking):` |
| **Suggestion** | Clarity, naming, duplication, smaller refactor | skip | at most 3 | at most 5 | `suggestion (non-blocking):` |
| **Nit** | Style a linter or formatter should catch | skip | skip | skip | `nitpick (non-blocking):` (only if the project asks for nits) |

Something you suspect but cannot show is a `question:`, not a finding: ask it. One `praise:` is fine when something is sincerely good; never pad.

Labels are [Conventional Comments](https://conventionalcomments.org/). They matter because an unlabeled comment reads as mandatory, so the author can't tell what blocks the merge. If the project uses its own labels (Google's `Nit:` / `Optional:` / `FYI:`, or a list in CONTRIBUTING), use theirs.

## Don't invent blockers

Most of what review finds is not defects: about 14 to 15% of review comments point to a possible bug (evidence.md, "What to check"). A review with no blocker is a normal result, not a lazy one. A blocker needs a `file:line` and how it fails (input, path, outcome); if you need a paragraph to justify it, it is a suggestion or a question. Never block on personal style that no project rule asks for.

## Order of the look

Follow Google's order, so the expensive problems surface first:

1. **Premise:** the PR description and the task. If the change solves the wrong problem, say so before any line comment.
2. **Main file first:** the one with the most logical change. A design problem goes at the top of the draft at once; the rest may be rewritten anyway.
3. **Functionality** (edge cases, user-visible behaviour, concurrency), then **complexity** (over-engineering, speculative code), then **tests** (would they fail if the code broke?), then **naming**, **comments** (why, not what), **style**.
4. The rest of the files in a logical order; tests first can explain intent.

## What each level checks

**low (a few eyes):** does it do what the task says; any blocker visible in the diff; tests still make sense.

**normal (many eyes):** everything in low, plus:
- each Gherkin scenario of the task is handled by the code (and by a test where the repo tests that layer);
- error paths and empty, null or unexpected input on the changed code;
- names, boundaries and duplication against the code around it;
- breaking changes to APIs, contracts, schemas or shared types.

**critical (all hundred eyes):** everything in normal, plus:
- read the files around the change, not only the diff: callers, consumers, migrations;
- security: input validation at trust boundaries, authz on every new route, secrets, injection;
- data: migrations reversible or safe, no destructive change without a plan, transactions where needed;
- concurrency, idempotency and retries where the change touches them;
- edge cases beyond the Gherkin happy path, listed as suggested scenarios for the QA.

## Size

When `facts.mjs` returns `parts`, the PR is critical and above 400 changed lines: review one part at a time and report findings per part. The reason is **quality, not speed**: past about 400 lines, or 60 to 90 minutes, a reviewer finds markedly fewer defects, while smaller PRs have not been shown to merge faster on their own (evidence.md, "Size and attention").

A very large PR (Google calls ~1,000 lines usually too large) may earn a `suggestion (non-blocking):` to split future work, with that reason. It is not a blocker unless a project rule sets a size limit. When you reviewed only part of the PR, say which part.

## Gherkin scenarios

The task's scenarios cover the happy path only; the QA writes the rest later. Map each scenario to where the code handles it: covered, partly covered (say what is missing) or not found. Scenarios you think are missing go to *suggested tasks*, not to findings.
