# Review a teammate's PR

Review a PR the way a careful senior teammate on **that project** would: by the project's own rules first, deep where the task is critical, light where it is not, and always tied to what the task asked for. The result is a **draft for the user**. They judge; nothing is posted without their yes.

`references/evidence-review.md` holds the published data behind Argos' defaults (size, order, labels, tone). Use it to explain a judgement, never to grade a teammate.

## 1. Sources

Read `references/sources.md` and check what this machine has for PRs and for tasks. That decides how every step below gets its data.

## 2. PR facts

With `gh`, from this skill's directory:

```bash
node scripts/facts.mjs <pr-url | owner/repo#n> [--account <gh login>] [--priority <value>]
```

It returns size, files, base branch, labels, a task key found in the branch, title or body, path and label **risk hints**, and review parts for big critical PRs. Without `gh`, gather the same facts through whatever source section 1 found.

## 3. Project rules

Each team reviews its own way; respect it. Find their rules on the PR's base branch:

```bash
node scripts/rules.mjs <owner/repo> --ref <baseBranch> --account <gh login> --json
```

It lists CONTRIBUTING, PR templates, CODEOWNERS, AGENTS.md, CLAUDE.md, `.github/copilot-instructions.md` and any `*review*` file under `.github/` or `docs/`, each with an excerpt; it never fails on a missing file. Read the full text of the ones that bear on review (`gh api -H "Accept: application/vnd.github.raw" "repos/<o>/<r>/contents/<path>?ref=<base>"`) so you can cite `path:line` or a section. When the diff sits in a package with its own AGENTS.md or CLAUDE.md, read that too: the closest file wins.

- **The project's rules lead.** Their checklist, conventions, required tests, size limits and comment style come before anything in Argos' references. A PR template's checklist is something the PR body should answer; CODEOWNERS (last matching pattern wins) tells who must approve the touched paths.
- **Argos' references fill the gaps.** Apply `review-levels.md`, `criticality.md` and `evidence-review.md` only where the project is silent, and mark those findings **Argos recommendation**.
- **Never override a project rule with ours.** If the project allows what Argos would flag, don't flag it.
- **No rules at all:** Argos' references apply; say so in one line in the header.

Without `gh`, look for the same paths with the GitHub connector's file tool, or say the rules were not checked.

## 4. Task

Read the task with the best available source (sources.md, "Tasks"). Keep: summary, acceptance criteria, Gherkin scenarios, priority or any urgency signal, labels. If no source works, ask once for the pasted task or a "skip". Never invent one.

## 5. Level

Read `references/criticality.md`. **You** decide the level (low, normal, critical); the script's `suggestedLevel` and hints are input, not the answer. Weigh the task's priority through the rubric, what the diff actually touches, and what the task text says ("customer blocked", "hotfix"). Risk only raises the level. Open the review with one line: the level and why. When it was presumed, say so and, after the review, offer once to save a rubric entry for the repo.

## 6. Review

Read `references/review-levels.md` and review at that depth, in its order: premise and task first, the main file next, design problems surfaced at once, then functionality, complexity, tests, naming, comments, style. Read the diff and, at critical level, the code around it (callers, consumers, migrations) through the PR source; don't check out or run anything in the user's repo unless asked. When `parts` exist, go part by part: big PRs are split to keep the review accurate, not to go faster.

Don't invent blockers. Most review value is not bug-finding, and a clean review is a fine result. Something you suspect but can't show is a question.

## 7. Draft

In the user's language, in this order:

1. **Header:** PR link, author, level and why, size, project rules used (paths) or "No project review rules found; Argos recommendations apply", and any source you could not read.
2. **Verdict:** one line: approve, comment or request changes, and the reason. Request changes only for a blocker. The user decides.
3. **Scenarios:** one row per Gherkin scenario (or acceptance criterion): covered, partly or not found, with `file:line`.
4. **Findings:** grouped Blocker, Important, Suggestion. Each one: its comment label (`issue (blocking):`, `suggestion (non-blocking):`, `question:`...), `file:line`, what is wrong, the smallest fix, and its basis: the project rule (`CONTRIBUTING.md:23` or its section), the task scenario, or **Argos recommendation**.
5. **Suggested tasks:** follow-ups worth their own task, such as scenarios for the QA or debt found on the way.

## 8. Publish only on a yes

Offer to post. On a clear yes, post what the user saw, as they edited it, labels included, with the review type they chose (`gh pr review <n> -R <repo> --comment|--approve|--request-changes --body-file <file>`, or the GitHub connector's review tool). No yes, nothing leaves the chat.

## 9. Approve, or approve and merge

The Argos pane's **Approve** and **Approve and merge** buttons send prompts such as "Approve `<url>` on GitHub (gh pr review --approve). Approve only, no merge." or "...and merge it once checks pass (gh pr review --approve, then gh pr merge)." The user typing "approve" or "approve and merge" means the same.

1. **Review first.** Run sections 2 to 6 at the task's level. Without a task, a small PR (about 100 changed lines or less) gets a quick low-level look; a bigger one asks once for the task as in section 4. Show the verdict in a few lines: level, project rules used, blockers, and how many other findings.
2. **Stop on a blocker.** If the review finds a blocker (or a broken project rule that blocks), don't approve: show it and offer the request-changes draft from section 7. Also stop when the PR is a draft, closed, or the user's own.
3. **Approve.** Otherwise the sent prompt is the yes: `gh pr review <n> -R <repo> --approve` with the repo owner's account (sources.md, "Accounts"). Approve without a body; non-blocking findings are posted only if the user says yes to them (section 8).
4. **Merge** (only when asked). Merge when the checks pass and the PR is approved: `gh pr checks <n> -R <repo> --watch` waits for running checks; any failure stops it, and you report which. Check `gh pr view <n> -R <repo> --json reviewDecision,mergeStateStatus` (approved, not blocked). Pick the method the repo allows: `gh repo view <repo> --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`. Use the one the project's rules name, or the only one allowed; if several are allowed and no rule picks, ask once. Then `gh pr merge <n> -R <repo> --merge|--squash|--rebase`. Never `--admin`, never delete the branch unless asked.
5. Report what was done, with the PR link.
