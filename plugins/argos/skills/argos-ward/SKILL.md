---
name: argos-ward
description: Watch over the user's own pull requests. (1) Report which PRs need the user now, oldest first, covering their PRs with comments, change requests, failing CI or conflicts, PRs waiting for their review, and teammates' PRs that need a look. (2) Fix one of their PRs after review, so gather what reviewers said, triage it, change the code in the local clone with commits in the project's style, and draft a reply per thread; nothing is pushed or posted without a yes. Use whenever the user asks what to do about their PRs, whether a PR got feedback, what reviewers asked for, to address review comments or fix the CI or a conflict on their PR, or picks Resolve, Reply, Address or Fix CI in the Argos pane, even with just a PR link. Portuguese requests count too, such as "algum PR meu precisa de mim?", "tem review pra eu fazer?", "o que pediram no review?", "corrigir meu PR", "arruma o CI do meu PR". Not for reviewing someone else's PR (use argos-panoptes).
compatibility: The bundled scripts and the Argos mod need the GitHub CLI. Without it, use a GitHub connector and compute the same signals and plan.
---

# Argos Ward

Two jobs on the user's own PRs: **what needs me** (a queue, oldest first, because the oldest weighs most on stale time) and **fix my PR** (turn review feedback into code changes and replies). A request about one PR that got feedback, or the pane's "Resolve / Reply / Address / Fix CI" buttons and its "My PRs, to fix with argos-ward:" prompt, is the second job; anything about the queue is the first.

## Sources and scope

Read `../../references/sources.md` and check what is available. Watch only repositories the user connected or named: `node ../argos-pavo/scripts/repos.mjs list --json` gives `{repo, path}` per connected repo (`path` is the local clone, when there is one). With none, ask which repos to watch (argos-pavo connects them) instead of searching all of GitHub.

Use the account that owns the repo: `GH_TOKEN=$(gh auth token -u <login>)` for that command only, or `--account <login>` where a script takes it. Never `gh auth switch`.

## Job 1: what needs me

From this skill's directory, one `repo:` qualifier per repository:

```bash
node scripts/ward.mjs repo:acme/api repo:acme/web --lang en     # or --lang pt-BR, or --json
```

Without `gh`, use the GitHub connector: list open PRs by the user, PRs requesting their review, and other open PRs in the scoped repos, then apply the signals below.

| Code | Means | Suggest |
|---|---|---|
| `changes_requested` | a reviewer asked for changes | job 2 |
| `threads:N` | N unresolved threads where someone else spoke last | job 2 |
| `new_reviews:N` | review comments after the last push | job 2 |
| `unanswered` | the last conversation comment is someone else's | job 2 |
| `ci_failed` | the last commit's checks failed | job 2 (CI) |
| `conflict` | merge conflict with the base | job 2 (conflict) |
| `ready` | approved, nothing blocking | merge, or ping whoever merges |
| `no_review` | nobody reviewed for over a day | mine: ping reviewers; a teammate's: review it |
| `late` | a review request older than a day | review it now |

Bots never count as someone waiting; teammates' drafts stay quiet. Report the tables oldest first, then one line per PR needing action with its next step, and offer job 2 for the ones that have feedback.

## Job 2: fix my PR

Details, commands and reply style: `references/address.md`. The evidence behind them: `references/evidence.md`.

1. **Facts.** `node scripts/feedback.mjs <pr-url | owner/repo#n> --account <login> --json`. It returns every review, thread and comment classified (blocking, question, suggestion, nit, fyi, praise, already-addressed) and grouped by file, plus CI failures and merge state. Items with `labeled: false` were classified by wording: read them yourself. Several PRs: one at a time, oldest first.
2. **Project rules.** `node ../argos-panoptes/scripts/rules.mjs <owner/repo> --ref <base> --json` finds CONTRIBUTING, the PR template, CODEOWNERS, AGENTS.md, CLAUDE.md. Read what it found; in the local clone also read `CLAUDE.md`/`AGENTS.md` and `git log --oneline -15` for the commit style. The project's rules win; `references/evidence.md` is the default only where the project is silent.
3. **Plan, shown to the user.** Blocking first, then questions, then suggestions and nits; per item: `file:line`, reviewer, what was asked, and the proposed action (change code, reply, push back with the reason, or ask the reviewer to clarify). Then CI and conflicts. Disagreeing is fine when the reviewer is wrong on facts or the request is out of scope; say why. Already-addressed items get one line at the end.
4. **Code.** In the local clone, on the PR branch, up to date, with a clean tree (if the user has uncommitted work there, stop and say so). Small focused commits, one concern each, in the project's style; no reformatting mixed with fixes. Run the project's checks for what you touched. No clone: show diffs in chat and offer to clone.
5. **Draft replies.** One per thread or comment, in the reviewer's language: what changed and in which commit, or why not. Show them as a table with the commits made.
6. **Wait for the yes.** Pushing, replying, resolving threads and re-requesting review change the PR for everyone. Ask once, listing what will happen. On a yes: push, then post exactly the replies the user saw (as they edited them), then re-request review once if they agreed. Leave thread resolution to the reviewer unless the user or the project says otherwise.
