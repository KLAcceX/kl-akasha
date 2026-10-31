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

One skill, `argos`, does every PR job. Ask in plain language, in any language.

| Job | Ask like | What it does |
|---|---|---|
| **What needs me** | "any PR of mine need me?", "anything for me to review?" | Watches my open PRs (comments, reviews, change requests, CI, conflicts), the PRs waiting for my review, and teammates' PRs in the connected repos. Oldest first, because the oldest weighs most on stale time. |
| **Fix my PR** | "address the review on my PR", "fix the CI on my PR" | Gathers what reviewers said, triages it, changes the code in the local clone and drafts a reply per thread. |
| **Review** | "review this PR", "is this PR safe to merge?" | Reviews a teammate's PR with as many eyes as the task deserves. It reads the task (Jira key from the branch), sets the level from its priority (raised by risky paths or labels, never lowered), follows the project's own review rules, checks the Gherkin scenarios and splits reviews over 400 lines. It drafts findings by severity plus suggested tasks, and approves or merges only after that review. |
| **Lessons** | "what do reviewers keep asking me?", "is my PR ready for review?" | Reads my merged PRs in a repo and finds what reviewers keep asking (tests, naming, a rule of theirs), then keeps it as a personal checklist. Before I ask for review, it checks the PR against that list, so the same ask does not cost another round. |
| **Vigil** | "watch my PRs", "connect this folder to Argos" | Runs a round over the connected repos and reports only what changed. Connects and disconnects repos, and can run on a schedule while the app is open. |

## The eyes inside Claude

The plugin ships a mod that runs the vigil on its own timer, at no token cost. It shows a band above the prompt with the next action, toasts what is new, and `/argos` opens a pane built for a narrow sidebar: an inbox sorted by your next move.

- **Head:** "Argos", what needs you ("3 need you · 1 ready · 2 waiting"), when Argos last checked, and **Check now**.
- **Send bar**, right under the head and always in the same place, so the list never jumps: with nothing picked it says how to use it; with picks it says what will go ("1 to fix, 2 to review"), names any pick that left the list since, and **Add N to prompt** puts them all in the prompt. It is the pane's one accent.
- **Repo chips:** All, then every connected repo with its open PRs, zeros included. A chip narrows the inbox to that repo; past six repos a picker takes their place.
- **Sections**, each shown only when it holds something, longest wait first:

  | Section | Holds |
  |---|---|
  | **Your move** | reviews asked of you, and your PRs that came back: changes requested, open threads, a failed CI, a conflict, no reviewer asked |
  | **Ready to merge** | your approved PRs with nothing blocking |
  | **Waiting on others** | your PRs on someone else's desk, with how long they have waited |
  | **Drafts** | your PRs not out yet |
  | **Team** | teammates' PRs nobody asked you about; folded until you open it, and never folded while it holds a pick |

- **Each PR takes two lines**, so nothing gets squeezed in a narrow pane. The first line is the title. The second has its number, how long it has waited (a review: since you were asked), whose it is and where, plus **L** or **XL** past 400 or 1,000 changed lines (where review quality drops) and **AI** for a PR opened by a coding agent.
- **One action per PR**, on the right, naming its reason, with a dot in its colour: **Fix conflict**, **Fix CI**, **Address changes**, **Reply to 2**, **Review**, **Review again**, **Find a reviewer**, **Nudge**, **Merge**, or **Pre-check** (checks a draft against your lessons). A PR with nothing to do says where it stands ("Waiting for review").
- **In prompt ✓:** once a PR's request is in the prompt, its action says so instead of asking twice. It reads the prompt itself, so deleting the request brings the action back.
- **Batch picks** in Your move and Team: a box picks a PR or a whole section, and picks survive narrowing to a repo.

**Every action only puts a request in the prompt.** Two quick presses add it once, a PR already in the prompt is not added again, and nothing reaches GitHub until you send it and say yes to what the AI drafts. Stale data or a big batch is flagged before you press. With several sessions open, only one runs each round.

| Command | Does |
|---|---|
| `/argos` | opens the pane |
| `/argos demo` | fills the pane with a sample round; a plain `/argos` goes back to your data |
| `/argos repos` | lists the connected repos and the account each is read as |
| `/argos repos add <folder or owner/name>` | connects one (a folder's git remote is read, SSH host aliases included); a bare `add` connects the session's folder. Add `--account <gh login>` for a repo only another account can see |
| `/argos repos remove <owner/name>` | disconnects one |
| `/argos <anything else>` | goes to the skill, such as `/argos review <PR link>` |

The vigil watches **only connected repos**: with none, it searches nothing. Each repo is read as the `gh` account it was connected with, so work and personal repos can sit in one inbox.

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
node scripts/queue.mjs --self-test
node scripts/lessons.mjs --self-test
claude plugin test .
```

Icons are from [Tabler Icons](https://tabler.io/icons) (MIT).
