---
name: argos-panoptes
description: Use when the user asks to review a teammate's pull request, wants a review sized to how critical the task is, wants a PR checked against its Jira task or Gherkin scenarios, or picks a PR from the Argos pane to look at.
---

# Argos Panoptes

Panoptes, "the all-seeing": Argos opens from a few to all hundred eyes depending on how critical the task is. **Argos sees; the user judges.** The review is a draft for the user, never something posted on their behalf.

## 1. Facts

From this skill's base directory:

```bash
node scripts/facts.mjs <pr-url | owner/repo#n> [--account <gh login>]
```

It returns the PR's size, files, labels, the task key (Jira style, from branch, title or body), risk signals, and a first level. Use the account the user works with for that repo; never run `gh auth switch`.

## 2. Task

With a task key and a Jira or issue tool available, read the task: summary, acceptance criteria, Gherkin scenarios, and the field that holds its priority. Then run `facts.mjs` again with `--priority <value>` so the level follows the task.

No tool, or no key: ask the user once to paste the task (or say "skip"). Never invent the task.

## 3. Level

Read `references/criticality.md`. Open the review with one line: the level, where it came from, and what raised it. When the result says `presumed`, say so, and after the review offer once to save a rubric entry for that repo.

## 4. Review

Read `references/review-levels.md` and review at that level. When `parts` is present, review part by part.

Check out nothing and run nothing in the user's repo unless they ask: read the diff with `gh pr diff <n> -R <repo>` and the surrounding files with `gh api repos/<repo>/contents/<path>?ref=<branch>`.

## 5. Draft

Write the draft in the user's language, in this order:

1. **Header:** PR link, author, level and its source, size (lines, files, parts).
2. **Verdict:** one line: what you would do (approve, comment, request changes) and why. The user decides.
3. **Scenarios:** one row per Gherkin scenario: covered, partly or not found, with `file:line`.
4. **Findings:** by severity (Blocker, Important, Suggestion), each with `file:line`, what is wrong and the smallest fix.
5. **Suggested tasks:** follow-ups worth their own task: missing scenarios for the QA, debt found on the way.

## 6. Publish only on a yes

Ask whether to post. On a clear yes, post exactly the draft the user saw (edited as they asked):

```bash
gh pr review <n> -R <repo> --comment --body-file <draft.md>   # or --approve / --request-changes, as the user chose
```

Without that yes, nothing leaves the chat.

## Self-check

`node scripts/facts.mjs --self-test`
