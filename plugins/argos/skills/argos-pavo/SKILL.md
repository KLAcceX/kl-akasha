---
name: argos-pavo
description: Keep watching the user's pull requests on a schedule and tell them only what changed, and manage which repositories Argos watches. Use whenever the user wants PRs watched automatically, wants to be notified about new comments, reviews or review requests, wants to connect, list or disconnect a repository or folder from Argos, wants Argos in another language, or when a scheduled task asks for an Argos round. Portuguese requests count too, such as "conecta essa pasta no Argos", "me avisa quando alguém comentar nos meus PRs", "deixa o Argos em inglês". Not for a one-off look at PRs (use argos-ward).
compatibility: Needs the GitHub CLI and Node.js. The Argos mod that ships with this plugin runs the same rounds inside Claude.
---

# Argos Pavo

Watch the connected repositories round after round and surface only what is new. The Argos mod already does this inside Claude on a timer, at no token cost, with a band above the prompt and `/argos` for the pane; reach for a scheduled task only when the user wants rounds while no Claude session is open.

The vigil watches **only connected repositories**. With none, a round searches nothing, so an account's other repositories are never read by accident.

| The user wants | Do |
|---|---|
| to watch a folder or repo, or see what is watched | Connect repositories |
| another language | Change the language |
| a round now, or a scheduled task asked for one | Run a round |
| rounds with no session open | Set up a scheduled task |

## Connect repositories

From this skill's directory:

```bash
node scripts/repos.mjs add <folder>          # reads the folder's git origin; SSH host aliases work
node scripts/repos.mjs remove <owner/repo>    # or the folder
node scripts/repos.mjs list
```

Run `add` once per folder named and report what each line says. A folder whose origin is not on GitHub is refused; tell the user. The mod's `/argos repos` uses the same script, and the list lives in `~/.claude/kl-akasha/argos/repos.json`.

## Change the language

The mod follows the plugin option `language` (`en` or `pt-BR`), set in `/config` under the argos plugin. Scripts take `--lang pt-BR` (default `en`). Signals are stored as codes, so switching never shows old PRs as new.

## Run a round

```bash
node scripts/pavo.mjs --account <gh login> --lang <en|pt-BR>
```

Use the account that owns the connected repos (see `../../references/sources.md`). The first line tells what happened:

| First line says | Do |
|---|---|
| no repository connected | tell the user to connect one; no notification |
| nothing new | one line; no notification |
| a count of new items | send the `NOTIFY:` text (without the prefix) with the PushNotification tool, then list the PRs oldest first |

A round only reports; it never replies, pushes or merges.

## Set up a scheduled task

1. Ask in one message, with defaults: when (hourly, 9h–18h, Monday to Friday → `0 9-18 * * 1-5`), the account, the language.
2. `create_scheduled_task` with taskId `argos-pavo`, the cron, and a self-contained prompt: "Use the argos-pavo skill to run one Argos round. gh account: <login>. Language: <en|pt-BR>. Notify me only if something is new."
3. Tell the user tasks run only while the Claude app is open.
