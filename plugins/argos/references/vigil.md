# Vigil and repositories

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
node scripts/repos.mjs add <folder>           # reads the folder's git origin; SSH host aliases work
node scripts/repos.mjs add <owner/name>       # no clone needed; checked with gh repo view (--account <login>)
node scripts/repos.mjs add <github URL>       # repo, PR or file link: the owner/name is taken from it
node scripts/repos.mjs add                    # the current working directory
node scripts/repos.mjs remove <owner/name>    # or the URL, or the folder
node scripts/repos.mjs list
```

Work out the repository from what the user gave, then run one `add` per repository:

| The user gives | Pass to `add` |
|---|---|
| a folder path, or "this folder" / "this repo" | the absolute folder path (the session's working directory for "this") |
| `owner/name` | it as is |
| a GitHub link to the repo, a PR, an issue or a file | the link as is |
| a task key or a short name ("connect the api repo") | the `owner/name` it maps to in the conversation (a PR link or repo mentioned earlier); if nothing says, ask which repository, never guess an owner |

A name that is also an existing folder is read as the folder. A name is checked with `gh repo view` as `--account <login>`, or the active `gh` account without it (see `references/sources.md`); when it says not found, the repo may be private to another account, so retry with `--account` set to that account before telling the user. A folder whose origin is not on GitHub is refused; offer to connect it by `owner/name` instead. Report what each line says.

For the user doing it themselves: the pane's **Add a repository** button and `/argos repos add` take a folder or an `owner/name` (or a GitHub link), the same as the script. The list lives in `~/.claude/kl-akasha/argos/repos.json`.

## Change the language

The mod follows the plugin option `language` (`en` or `pt-BR`), set in `/config` under the argos plugin. Scripts take `--lang pt-BR` (default `en`). Signals are stored as codes, so switching never shows old PRs as new.

## Run a round

```bash
node scripts/round.mjs --account <gh login> --lang <en|pt-BR>
```

Use the account that owns the connected repos (see `references/sources.md`). The first line tells what happened:

| First line says | Do |
|---|---|
| no repository connected | tell the user to connect one; no notification |
| nothing new | one line; no notification |
| a count of new items | send the `NOTIFY:` text (without the prefix) with the PushNotification tool, then list the PRs oldest first |

A round only reports; it never replies, pushes or merges.

## Set up a scheduled task

1. Ask in one message, with defaults: when (hourly, 9h–18h, Monday to Friday → `0 9-18 * * 1-5`), the account, the language.
2. `create_scheduled_task` with taskId `argos-vigil`, the cron, and a self-contained prompt: "Use the argos skill to run one Argos round. gh account: <login>. Language: <en|pt-BR>. Notify me only if something is new."
3. Tell the user tasks run only while the Claude app is open.
