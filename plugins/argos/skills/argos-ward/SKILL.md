---
name: argos-ward
description: Use when the user asks which of their pull requests need attention, whether their PRs got comments, reviews or change requests, which PRs are waiting for their review, what teammates' PRs need a look, or wants to fight PR stale time. Also used by argos-pavo on each round.
---

# Argos Ward

Argos guarded what Hera entrusted to him. This skill guards the user's PRs: every open PR they wrote or must review, and their teammates' PRs in the connected repositories, oldest first, with what each one needs.

## Run

Only on repositories the user connected or named. Get the connected ones with `node ../argos-pavo/scripts/repos.mjs list --json` (from this skill's base directory), then pass one `repo:` qualifier per repository:

```bash
node scripts/ward.mjs repo:acme/api repo:acme/web --lang en
node scripts/ward.mjs repo:acme/api --json          # machine output
```

With no repository connected or named, do not run it: ask which repositories to watch, then connect them with argos-pavo.

The script uses the **active `gh` account**. When the user has more than one and the active one is wrong, run it with that account's token for this command only: `GH_TOKEN=$(gh auth token -u <login>) node scripts/ward.mjs ...`. Never run `gh auth switch`.

## Signals

Signals are stable codes; the text output translates them (`--lang pt-BR|en`).

| Code | pt-BR | en | Suggest |
|---|---|---|---|
| `changes_requested` | mudanças pedidas | changes requested | Address them, re-request review |
| `threads:N` | N thread(s) sem resposta | N unanswered thread(s) | Reply or fix, then resolve |
| `new_reviews:N` | N review(s) novo(s) | N new review(s) | Read and answer |
| `unanswered` | comentário sem resposta | unanswered comment | Reply |
| `ci_failed` | CI falhou | CI failed | Look at the failing check |
| `conflict` | conflito | conflict | Update the branch |
| `ready` | aprovado: pronto pra merge | approved: ready to merge | Merge, or ping whoever merges |
| `no_review` | sem review > 1 dia | no review > 1 day | Mine: ping reviewers. Teammate's: review it proactively |
| `late` | atrasada > 1 dia | late > 1 day | Review it now |

Bots never count as someone waiting. Teammates' drafts stay quiet.

## Report

Show the tables as printed (oldest first: the oldest PR weighs most on stale time). Then one line per PR that needs action, with the suggested step, oldest first.

The ward only looks. Replying, pushing, re-requesting review or merging changes the PR for everyone: offer it, and do it only when the user says so.

## Limits

- First 50 PRs per list; the script warns when there are more.
- `review-requested` lists only pending review requests.
- Self-check: `node scripts/ward.mjs --self-test`.
