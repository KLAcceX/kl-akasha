# Argos: the PR watcher

A PR-count target means many PRs get opened, and the forgotten ones weigh on *stale time*. Argos exists so no PR sits idle without someone noticing.

Hera set Argos to guard Io. He had a hundred eyes and never closed them all at once. When he fell, Hera set his eyes on the peacock's tail, where they still watch. Here he opens a few eyes or all hundred, depending on how critical the task is. **Argos sees; you judge:** nothing is pushed, posted, approved or merged without your yes.

## Install

```bash
claude plugin marketplace add KLAcceX/kl-akasha
claude plugin install argos@kl-akasha
```

Inside Claude Code, `/plugin marketplace add KLAcceX/kl-akasha` and `/plugin install argos@kl-akasha` do the same.

**Needs:** the [GitHub CLI](https://cli.github.com) (`gh auth login` with every account you use) and Node.js 18 or newer. Without `gh`, the skill falls back to a GitHub connector, but the pane and the vigil need `gh`.

**First steps:**

1. Connect a repository: `/argos repos add <folder>` or `/argos repos add <owner/name>`.
2. Open the pane with `/argos`. `/argos demo` shows it filled with sample data.

## What it does

One skill, `argos`, does every PR job. Ask in plain language, in English or Portuguese.

| Job | Ask like | What it does |
|---|---|---|
| **What needs me** | "any PR of mine need me?", "tem review pra eu fazer?" | Watches my open PRs (comments, reviews, change requests, CI, conflicts), the PRs waiting for my review, and teammates' PRs in the connected repos. Oldest first, because the oldest weighs most on stale time. |
| **Fix my PR** | "address the review on my PR", "arruma o CI do meu PR" | Gathers what reviewers said, triages it, changes the code in the local clone and drafts a reply per thread. |
| **Review** | "review this PR", "esse PR tá ok pra merge?" | Reviews a teammate's PR with as many eyes as the task deserves. It reads the task (Jira key from the branch), sets the level from its priority (raised by risky paths or labels, never lowered), follows the project's own review rules, checks the Gherkin scenarios and splits reviews over 400 lines. It drafts findings by severity plus suggested tasks, and approves or merges only after that review. |
| **Lessons** | "what do reviewers keep asking me?", "meu PR tá pronto pra review?" | Reads my merged PRs in a repo and finds what reviewers keep asking (tests, naming, a rule of theirs), then keeps it as a personal checklist. Before I ask for review, it checks the PR against that list, so the same ask does not cost another round. |
| **Vigil** | "watch my PRs", "conecta essa pasta no Argos" | Runs a round over the connected repos and reports only what changed. Connects and disconnects repos, and can run on a schedule while the app is open. |

## The eyes inside Claude

The plugin ships a mod that runs the vigil on its own timer, at no token cost. It shows a band above the prompt with the next action, toasts what is new, and `/argos` opens a pane that reads at a glance.

**The pane, top to bottom:**

- **Head:** the KL · Akasha mark and "Argos", with a tally of open PRs under them (yours, reviewed, still to review). On the right: when Argos last looked, and a Check now button.
- **Filters:** **All** open PRs, the ones that **Need my help** (teammates' PRs waiting on your review), yours **To fix** (changes requested, open threads, a conflict, a failed CI) and **Mine**, each with its count.
- **Repos:** every connected repo, zeros included, with counts that follow the filter. Each has a checkbox that picks all its PRs, its counts as coloured icons with numbers, and "N PRs" to open them. The colours: red **blocked**, amber **review asked**, blue **comments**, purple **changed since your review**.
- **PRs:** each open PR on its own line, with its checkbox, title, owner, age and number, and a short action in its signal's colour. Someone else's PR also gets **Approve** and **Approve and merge**.
- **Add a repository:** the list ends with this button, which puts `/argos repos add ` in the prompt.

**Every action only puts a request in the prompt.** It is never sent twice, and nothing reaches GitHub until you send it.

- The send bar sends every picked PR: yours to fix, the others to review. Picks survive a filter switch, and the bar says how many the filter hides.
- Stale data or a big batch is flagged before you press.
- With several sessions open, only one runs each round.

| Command | Does |
|---|---|
| `/argos` | opens the pane |
| `/argos demo` | fills the pane with a sample round; a plain `/argos` goes back to your data |
| `/argos repos` | lists the connected repos |
| `/argos repos add <folder or owner/name>` | connects one (a folder's git remote is read, SSH host aliases included); a bare `add` connects the session's folder |
| `/argos repos remove <owner/name>` | disconnects one |

The vigil watches **only connected repos**: with none, it searches nothing. Once a repo is connected, Argos also lists all teammates' open PRs in it, asked for review or not.

## Options

Set them with `/config` under the argos plugin, or `claude plugin configure argos`.

| Option | Default | What |
|---|---|---|
| `account` | the active `gh` account | the `gh` login the vigil uses |
| `qualifiers` | none | extra GitHub search qualifiers, such as `is:draft` |
| `language` | `en` | `en` or `pt-BR`, for the band, the pane and the notices |
| `intervalMinutes` | 60 | how often the vigil runs, at least 5 |

## Where things live

Everything personal stays outside your repos, in `~/.claude/kl-akasha/`:

| Path | Holds |
|---|---|
| `argos/repos.json` | connected repositories |
| `argos/state.json`, `argos/last-round.json` | what the last round saw, so only news is reported |
| `argos/lessons/<owner>/<repo>.md` | the lessons learned per repo |
| `criticality.json` | your rubric: how critical each repo's tasks are |

## Check it

```bash
node skills/argos/scripts/queue.mjs --self-test
node skills/argos/scripts/lessons.mjs --self-test
claude plugin test .
```

Icons are from [Tabler Icons](https://tabler.io/icons) (MIT).
