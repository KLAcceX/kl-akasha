---
name: argos-panoptes
description: Review a teammate's pull request with depth matched to how critical its task is, checked against the task's acceptance criteria and Gherkin scenarios, drafted for the user to approve before anything is posted. Use whenever the user asks to review, look at, check or approve someone else's PR, wants to know if a PR is safe to merge, or picks a PR from the Argos pane, even if they only paste a PR link. Portuguese requests count too, such as "revisa o PR da Bia", "dá uma olhada nesse PR antes de eu aprovar", "esse PR tá ok pra merge?". Not for the user's own PRs that need attention (use argos-ward) or for writing code.
compatibility: Works with the GitHub CLI or a GitHub connector, and with the Atlassian CLI, an Atlassian connector, another tracker, or a pasted task. The bundled script needs the GitHub CLI.
---

# Argos Panoptes

Review a PR the way a careful senior teammate would: deep where the task is critical, light where it is not, and always tied to what the task asked for. The result is a **draft for the user**. They judge; nothing is posted without their yes.

## 1. Sources

Read `../../references/sources.md` and check what this machine has for PRs and for tasks. That decides how every step below gets its data.

## 2. PR facts

With `gh`, from this skill's directory:

```bash
node scripts/facts.mjs <pr-url | owner/repo#n> [--account <gh login>] [--priority <value>]
```

It returns size, files, labels, a task key found in the branch, title or body, path and label **risk hints**, and review parts for big critical PRs. Without `gh`, gather the same facts through whatever source sections 1 found.

## 3. Task

Read the task with the best available source (sources.md, "Tasks"). Keep: summary, acceptance criteria, Gherkin scenarios, priority or any urgency signal, labels. If no source works, ask once for the pasted task or a "skip". Never invent one.

## 4. Level

Read `references/criticality.md`. **You** decide the level (low, normal, critical); the script's `suggestedLevel` and hints are input, not the answer. Weigh the task's priority through the rubric, what the diff actually touches, and what the task text says ("customer blocked", "hotfix"). Risk only raises the level. Open the review with one line: the level and why. When it was presumed, say so and, after the review, offer once to save a rubric entry for the repo.

## 5. Review

Read `references/review-levels.md` and review at that depth. Read the diff and, at critical level, the code around it (callers, consumers, migrations) through the PR source; don't check out or run anything in the user's repo unless asked. When `parts` exist, go part by part.

## 6. Draft

In the user's language, in this order:

1. **Header:** PR link, author, level and why, size, and any source you could not read.
2. **Verdict:** one line: approve, comment or request changes, and the reason. The user decides.
3. **Scenarios:** one row per Gherkin scenario (or acceptance criterion): covered, partly or not found, with `file:line`.
4. **Findings:** Blocker, Important, Suggestion; each with `file:line`, what is wrong, and the smallest fix.
5. **Suggested tasks:** follow-ups worth their own task, such as scenarios for the QA or debt found on the way.

## 7. Publish only on a yes

Offer to post. On a clear yes, post what the user saw, as they edited it, with the review type they chose (`gh pr review <n> -R <repo> --comment|--approve|--request-changes --body-file <file>`, or the GitHub connector's review tool). No yes, nothing leaves the chat.
