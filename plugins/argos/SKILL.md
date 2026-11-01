---
name: argos
description: Watch pull requests so none goes stale. Reports which of the user's PRs need them now (comments, change requests, failing CI, conflicts) and which PRs wait for their review; fixes the user's own PR after review (code changes and draft replies); reviews a teammate's PR with depth matched to how critical its task is, against the task's acceptance criteria and Gherkin scenarios and the project's own review rules, and approves or merges it only after that review; learns what reviewers keep asking the user in each repo and checks the next PR against those lessons before review; validates many PRs in one go and keeps a verdict on each; runs the vigil on a schedule and connects or disconnects the repositories it watches. Drafts first: nothing is pushed, posted, approved or merged without the user's yes. Use whenever the user mentions PRs, reviews, review comments, CI on a PR, approving or merging, watching repos, or picks anything in the Argos pane, even with just a PR link. Requests in any language count.
compatibility: The bundled scripts and the Argos mod need the GitHub CLI and Node.js. Without the CLI, use a GitHub connector and compute the same signals.
---

# Argos

Argos Panoptes, the hundred-eyed giant, never closed all his eyes at once. Here he watches PRs: he opens a few eyes or all hundred, depending on how critical the task is. **Argos sees; the user judges.**

## Pick the job

| The user wants | Read |
|---|---|
| what needs them now, across their PRs and their review queue | `references/mine.md`, "Job 1" |
| to fix their own PR: review comments, a failing CI, a conflict | `references/mine.md`, "Job 2", and `references/address.md` |
| what reviewers keep asking them, or whether their PR is ready for review | `references/lessons.md` |
| to review, approve or merge a teammate's PR | `references/review.md` |
| to validate PRs in a batch and keep a verdict on each row (pane: Validate N, auto-validate), or to fix what a validation found | `references/validate.md`; then `references/address.md` to fix, `references/review.md` to draft a review |
| to connect, list or remove a repository, change the language, run a round, or have PRs watched on a schedule | `references/vigil.md` |

## For every job

- **Sources:** read `references/sources.md` once per conversation, to learn what this machine has for PRs and tasks.
- **Scope:** watch only connected or named repositories. `node scripts/repos.mjs list --json` lists them; never search all of GitHub.
- **Accounts:** use the account that owns the repo: `GH_TOKEN=$(gh auth token -u <login>)` for that command only, or `--account <login>` where a script takes one. Never `gh auth switch`.
- **Scripts:** run them from this skill's directory.
- **Nothing leaves the chat without a yes:** that covers pushes, replies, reviews, approvals and merges. A request the person sends from the pane is their ask, not that yes: the yes still comes after the draft.

## Self-check

```bash
node scripts/queue.mjs --self-test && node scripts/round.mjs --self-test && node scripts/avatars.mjs --self-test && node scripts/facts.mjs --self-test && node scripts/lessons.mjs --self-test && node scripts/verdicts.mjs --self-test && node scripts/gate.mjs --self-test
```
