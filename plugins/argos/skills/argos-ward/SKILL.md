---
name: argos-ward
description: Report which pull requests need the user right now, oldest first, so none goes stale. That covers their own PRs with comments, reviews, change requests, failing CI or conflicts, PRs waiting for their review, and teammates' PRs in the connected repos that need a proactive look. Use whenever the user asks what to do about their PRs, whether a PR got feedback, what is waiting for their review, or about PR stale time, even casually. Portuguese requests count too, such as "algum PR meu precisa de mim?", "tem review pra eu fazer?", "o que os colegas abriram de PR?". Not for reviewing one specific PR in depth (use argos-panoptes).
compatibility: The bundled script and the Argos mod need the GitHub CLI. Without it, use a GitHub connector and compute the same signals.
---

# Argos Ward

Find every open PR that needs the user, say what each one needs, oldest first: the oldest weighs most on stale time.

## Sources and scope

Read `../../references/sources.md` and check what is available. Watch only repositories the user connected or named: get the connected ones with `node ../argos-pavo/scripts/repos.mjs list --json`. With none, ask which repos to watch (argos-pavo connects them) instead of searching all of GitHub, which would read every repo the account can see.

## With the GitHub CLI

From this skill's directory, one `repo:` qualifier per repository:

```bash
node scripts/ward.mjs repo:acme/api repo:acme/web --lang en     # or --lang pt-BR, or --json
```

Use the account that owns those repos: `GH_TOKEN=$(gh auth token -u <login>) node scripts/ward.mjs ...` for that command only, never `gh auth switch`.

## Without it

Use the GitHub connector: list open PRs by the user, PRs requesting their review, and other open PRs in the scoped repos; then apply the signals below yourself.

## Signals

Signals travel as codes; the script translates them.

| Code | Means | Suggest |
|---|---|---|
| `changes_requested` | a reviewer asked for changes | address them, re-request review |
| `threads:N` | N unresolved threads where someone else spoke last | reply or fix, then resolve |
| `new_reviews:N` | review comments after the last push | read and answer |
| `unanswered` | the last conversation comment is someone else's | reply |
| `ci_failed` | the last commit's checks failed | look at the failing check |
| `conflict` | merge conflict with the base | update the branch |
| `ready` | approved, nothing blocking | merge, or ping whoever merges |
| `no_review` | nobody reviewed for over a day | mine: ping reviewers; a teammate's: review it |
| `late` | a review request older than a day | review it now |

Bots never count as someone waiting; teammates' drafts stay quiet.

## Report

The tables oldest first, then one line per PR needing action with its next step. Replying, pushing, re-requesting review or merging changes the PR for everyone: offer it, and do it only when the user says so.
