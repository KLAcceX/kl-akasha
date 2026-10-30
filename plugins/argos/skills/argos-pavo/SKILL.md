---
name: argos-pavo
description: Use when the user wants their pull requests watched automatically, wants to connect, list or disconnect the repositories Argos watches, wants Argos in another language, wants to be notified about PR comments, reviews, change requests or review requests, or when a scheduled task asks for an Argos vigil round.
---

# Argos Pavo

When Argos fell, Hera set his eyes on the peacock's tail, where they still watch. This skill keeps watching the user's PRs when the user is not looking: one vigil round at a time, and the user hears only about what changed.

**The Argos mod already runs the vigil inside Claude.** It ships with this plugin, runs a round on its own timer, shows a band above the prompt, toasts what is new, and `/argos` opens the pane. It costs no tokens. Use a scheduled task only when the user wants rounds while no Claude session is open.

**The vigil only watches connected repositories.** With none connected, a round searches nothing. Never point it at a repository the user did not ask for.

Pick the job by what is asked:

| The user… | Do |
|---|---|
| names folders or repos to watch, or asks what is watched | Connect repositories |
| asks for another language | Change the language |
| or a scheduled task asks for a vigil round | Run a round |
| wants rounds with no session open | Set up a scheduled task |

## Connect repositories

From this skill's base directory:

```bash
node scripts/repos.mjs add <folder>          # reads the folder's git origin (SSH aliases work)
node scripts/repos.mjs remove <owner/repo>    # or the folder
node scripts/repos.mjs list
```

Run `add` once per folder the user named. Report each line the script prints. A folder whose origin is not on GitHub is refused: tell the user. The list lives in `~/.claude/kl-akasha/argos/repos.json`; the mod's `/argos repos` uses the same script.

## Change the language

The mod's words follow the plugin option `language` (`pt-BR` or `en`): tell the user to set it in `/config` under the argos plugin. For scripts, pass `--lang en` (default `pt-BR`). Signals are stored as codes, so switching language never shows old PRs as new.

## Run a round

From this skill's base directory, with the account given in the task prompt:

```bash
node scripts/pavo.mjs --account <login> --lang <pt-BR|en>
```

Leave out `--account` when none is named (it then uses the active `gh` account). Never run `gh auth switch`.

| First line | Do |
|---|---|
| `ARGOS_PAVO:` saying no repository is connected | Tell the user to connect one. No notification. |
| `ARGOS_PAVO:` saying nothing is new | End with one line. No notification. |
| `ARGOS_PAVO:` with a count of new items | Send the `NOTIFY:` line's text (without the prefix) with the PushNotification tool, then list the PRs, oldest first. |

A round only reports. It never replies, pushes or merges.

State is kept in `~/.claude/kl-akasha/argos/`. A PR counts as new when it starts needing action, when its signals change, when it lands in the review queue, or when a teammate's PR starts needing a look.

## Set up a scheduled task

1. Ask, in one message, with defaults: **when** (every hour, 9h–18h, Monday to Friday → `0 9-18 * * 1-5`), **account** (when `gh auth status` shows more than one), **language**.
2. Create it with `create_scheduled_task`: `taskId` `argos-pavo`, `title` `Argos: vigília dos PRs`, the cron, and a self-contained prompt:
   > Use the argos-pavo skill to run one vigil round. gh account: `[login]`. Language: `[pt-BR|en]`. Notify me only if there is something new.
3. Tell the user tasks run only while the Claude app is open.

## Self-check

`node scripts/pavo.mjs --self-test` and `node scripts/repos.mjs --self-test`
