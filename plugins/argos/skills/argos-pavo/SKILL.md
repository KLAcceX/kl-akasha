---
name: argos-pavo
description: Use when the user wants their pull requests watched automatically on a schedule, wants to be notified when a PR gets comments, reviews, change requests or a review request, or when a scheduled task asks for an Argos vigil round.
---

# Argos Pavo

When Argos fell, Hera set his eyes on the peacock's tail, where they still watch. This skill keeps watching the user's PRs when the user is not looking: a scheduled task runs one vigil round, and the user hears only about what changed.

Two jobs. Pick by who is asking:

- **A scheduled task asked for a vigil round** → Run a round.
- **The user wants the vigil set up, changed or stopped** → Set up.

## Run a round

From this skill's base directory, with the qualifiers and account given in the task prompt:

```bash
GH_TOKEN=$(gh auth token -u <login>) node scripts/pavo.mjs org:acme
```

Leave out `GH_TOKEN=...` when the prompt names no account (it then uses the active `gh` account). Never run `gh auth switch`.

The output's first line decides the rest:

| First line | Do |
|---|---|
| `ARGOS_PAVO: nada novo` | Nothing. End with one line: "Argos: nada novo." No notification. |
| `ARGOS_PAVO: N novidade(s)` | Send the `NOTIFY:` line's text (without the `NOTIFY:` prefix) with the PushNotification tool. Then end with the listed PRs as a short list, oldest first. |

A round only reports. It never replies, pushes or merges. For the full picture the user can run argos-ward.

State is kept in `~/.claude/kl-akasha/argos/pavo-state.json`. A PR counts as new when it starts needing action, when its signals change, or when it lands in the review queue. The first round reports everything that is already pending, once.

## Set up

1. Ask, in one message, and offer the defaults:
   - **When:** default every hour, 9h–18h, Monday to Friday → cron `0 9-18 * * 1-5` (local time).
   - **Where:** GitHub search qualifiers that limit the round (e.g. `org:acme`). Default: none.
   - **Account:** which `gh` login, when `gh auth status` shows more than one.
2. Create it with the scheduled-tasks tool `create_scheduled_task`:
   - `taskId`: `argos-pavo`
   - `title`: `Argos: vigília dos PRs`
   - `cronExpression`: from step 1
   - `prompt` (self-contained, fill in the brackets):
     > Use the argos-pavo skill to run one vigil round. Qualifiers: `[org:acme]`. gh account: `[login]`. Notify me only if there is something new.
3. Tell the user two things:
   - Tasks run only while the Claude app is open. A missed run happens at the next launch.
   - If the first run stops on a permission prompt for `node`, they should allow it once for the task.

To change or stop the vigil, use `list_scheduled_tasks` to find `argos-pavo`, then `update_scheduled_task`.

## Self-check

`node scripts/pavo.mjs --self-test`
