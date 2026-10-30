# Review levels: how many eyes open

Argos sees; the user judges. Every level reads the whole diff. What changes is how deep each look goes and which findings are worth the reader's time. AI-generated PRs get no discount: they carry more issues on average, not fewer.

## Findings by severity

| Severity | Meaning | low | normal | critical |
|---|---|---|---|---|
| **Blocker** | Wrong behaviour, data loss, security hole, broken contract | report | report | report |
| **Important** | Missing error handling, missing test for a changed path, scenario not covered, risky pattern | only if obvious | report | report |
| **Suggestion** | Clarity, naming, duplication, smaller refactor | skip | at most 3 | at most 5 |
| **Nit** | Style a linter or formatter should catch | skip | skip | skip |

A generic reviewer that flags everything is noise. If a finding needs a paragraph to justify, it is probably a suggestion, not a blocker.

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

When `facts.mjs` returns `parts`, the PR is critical and above 400 changed lines. Review one part at a time and report findings per part. Past about 400 lines, or 60 to 90 minutes of review, detection drops sharply.

## Gherkin scenarios

The task's scenarios cover the happy path only; the QA writes the rest later. Map each scenario to where the code handles it: covered, partly covered (say what is missing) or not found. Scenarios you think are missing go to *suggested tasks*, not to findings.
