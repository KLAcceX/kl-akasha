# Sources: where PRs and tasks come from

Argos works with whatever this machine has. Check first, then pick the best path below. Checking is cheap; guessing wrong wastes the user's time or reads with the wrong account.

## Check what is available

- **GitHub CLI:** `gh --version`, then `gh auth status` for the logged-in accounts.
- **GitHub connector:** a tool whose name contains `github` (for example `mcp__…github…`) in your tool list.
- **Atlassian CLI:** `acli --version` (and `acli jira auth status` if present).
- **Atlassian connector:** a tool whose name contains `atlassian` or `jira` in your tool list. A connector listed as needing authentication does not count yet: tell the user it needs `/mcp`.
- **Other trackers:** a Linear, ClickUp, Asana or Notion connector, or the task living in a GitHub issue.

Run the checks once per conversation and remember the result.

## Pull requests

| Available | Use |
|---|---|
| `gh` | `gh pr view`, `gh pr diff`, `gh api`. The bundled scripts need it and are the fastest path. |
| GitHub connector, no `gh` | The connector's pull request, diff and file tools. Compute what the scripts would (size, files, signals) yourself. |
| Neither | Ask for the PR URL and either the diff (`git diff base...head` output or the `.diff` URL contents) or access to the repo. Public PRs can be read with a web fetch of `https://github.com/<owner>/<repo>/pull/<n>.diff`. Say what you could not check. |

**Accounts:** the user may have several `gh` accounts (work and personal). Use the one that owns the repository: pass `GH_TOKEN=$(gh auth token -u <login>)` for that command only. Never run `gh auth switch`; it changes the user's setup for every other tool.

## Tasks

Find the task reference first: a key in the branch, title or body (`ABC-123`, `#42`, a tracker URL), or ask.

| Available | Use |
|---|---|
| Atlassian connector | Its issue tools: summary, description, acceptance criteria, priority, labels, linked issues. |
| `acli` | `acli jira workitem view <KEY> --json` (fields: summary, description, priority, labels). |
| Both | Prefer the connector (structured fields, no shell parsing); fall back to `acli` if the connector errors. |
| Task is a GitHub issue | `gh issue view <n> -R <repo> --json title,body,labels` or the GitHub connector. |
| Other tracker connector | Its issue or ticket read tool. |
| None | Ask the user once to paste the task, or to say "skip". |

Never invent a task, a priority or scenarios. When something could not be read, say so in one line at the top of the result, so the user knows what the review or report did not see.

## Gherkin and acceptance criteria

Scenarios may sit in the description, in a custom field, in a linked test issue or in a pasted block. Take them from wherever they are. If there are none, work from the acceptance criteria and say that no scenarios were found.
