---
name: argos-ward
description: Use when the user asks which of their pull requests need attention, whether their PRs got comments, reviews or change requests, which PRs are waiting for their review, or wants to fight PR stale time. Also used by argos-pavo on each scheduled run.
---

# Argos Ward

Argos guarded what Hera entrusted to him. This skill guards the user's PRs: it finds every open PR they wrote or must review, oldest first, and says what each one needs.

## Run

From this skill's base directory:

```bash
node scripts/ward.mjs                 # all of GitHub
node scripts/ward.mjs org:acme        # any extra GitHub search qualifier narrows the search
node scripts/ward.mjs org:acme --json # machine output (argos-pavo uses this)
```

The script uses the **active `gh` account**. If the user has more than one account (for example work and personal), check `gh auth status` and, when the active one is wrong, run it with that account's token for this command only:

```bash
GH_TOKEN=$(gh auth token -u <login>) node scripts/ward.mjs
```

Never run `gh auth switch`: it changes the user's setup.

## Signals

| Signal | Meaning | Suggest |
|---|---|---|
| `mudanças pedidas` | A reviewer requested changes | Address them, then re-request review |
| `N thread(s) sem resposta` | Unresolved review threads where someone else spoke last | Reply or fix, then resolve |
| `N review(s) novo(s)` | Review comments after the last push | Read and answer |
| `comentário sem resposta` | Last conversation comment is from someone else | Reply |
| `CI falhou` | Last commit's checks failed | Look at the failing check |
| `conflito` | Merge conflict with the base branch | Update the branch |
| `aprovado: pronto pra merge` | Approved, nothing blocking | Merge, or ping whoever merges |
| `aguardando review` | Nothing for the user to do | Ping reviewers if it is old |

Bots never count as someone waiting for the user.

## Report

Show both tables as the script prints them (oldest first, because the oldest PR weighs most on stale time). Then list, in one line each, the PRs that need action and the suggested next step. Lead with the oldest.

The ward only looks. Replying, pushing, re-requesting review or merging changes the PR for everyone: offer it, and do it only when the user says so.

## Limits

- First 50 PRs per list; the script warns when there are more.
- `review-requested` only lists PRs where the review request is still pending.
- Self-check: `node scripts/ward.mjs --self-test`.
