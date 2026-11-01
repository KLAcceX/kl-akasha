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

The plugin ships a mod that runs the vigil on its own timer, at no token cost, and toasts what is new. `/argos` opens a pane built for a narrow sidebar: an inbox sorted by your next move. Keep it open: it refreshes with every round. Hover any icon to see what it means.

- **Head:** "Pull requests" and **Check now**; under it what needs you ("3 need you") and when Argos last checked; then a view picker (**Needs me**, **By repo**, **Team**) and a repo picker that says how many open PRs each repo holds ("web · 4").
- **Authors:** who opened the PRs, one chip each with a count (a circle for a person, a rounded square for a bot, a face for a coding agent): an Authors section at the top of Needs me and Team, opening by itself when one author floods the list, and an author line under each open repo in By repo. Tap a chip to see only that author, then **Pick N**, **Validate N** (one prompt line for all of them) or **Ignore**: an ignored author (Dependabot, Snyk) leaves every view, count and auto-validation, with **Undo**, a "N ignored" count in the head and an **Ignored** section at the end to bring them back. A review asked of you always shows. Bots' PRs can be merged in a batch, each only on your yes.
- **Fold anything:** every section in every view folds with `▸`/`▾` before its name, and its header keeps what must not hide (the count with what needs you, what is picked, the worst signal's icon). **Fold all** / **Open all** sits by Check now. Needs me opens Your move and Ready, Team opens Issues found (and Validating while it runs), By repo opens what needs you; a fold you make is remembered across sessions until something new needs you there.
- **By repo:** one section per repo, the ones with something for you first. Each header is enough to decide whether to open it: the worst signal's icon, the name, the count, what needs you and what is picked ("checkout 3 · 2 need you"). A repo opens only when something needs you; fold one by hand and it stays folded until something new needs you there. Four rows, then "Show N more"; **Pick all** works folded too.
- **Sections**, each shown only when it holds something, longest wait first:

  | Section | Holds |
  |---|---|
  | **Your move** | reviews asked of you, and your PRs that came back: a conflict, a failed CI, changes requested, open threads |
  | **Ready to merge** | your approved PRs with nothing blocking |
  | **Waiting on others** | your PRs on someone else's desk, including those nobody was asked to review |
  | **Drafts** | your PRs not out yet |
  | **Team** | teammates' PRs nobody asked you about; behind **Show**, and never hidden while it holds a pick |

- **Each PR is a box of two lines.** Line 1: a PR icon in the colour of what wins, `repo#number` (the repo only when the list mixes repos), the title and how long it has waited (bold from two days). Line 2: why it is here as icons (conflict, CI, changes requested, open threads with their count, review asked, no reviewer), the agent icon for a PR opened by a coding agent, up to two GitHub labels in their own colours, and a four-bar size meter; then a **+** to pick it and its one action.
- **One colour per meaning:** red blocked, amber reviewers answered, blue asked of you, green ready, orange going to the prompt. Only rows you act on are tinted; waiting rows, drafts and the team stay neutral.
- **One action per PR**, by rank: **Fix conflict**, **Fix CI**, **Address review**, **Answer threads**, **Review**, **Re-review**, **Find reviewer**, **Merge**, **Finish**, **Nudge**, and **Summarize** for a teammate's PR.
- **Batch:** picked rows turn orange and a bar at the end of the list says how many and what each will do; **Add to prompt** puts every pick's action in as one line each.
- **States:** a green "Nothing needs you" banner when Your move is empty, placeholders on the first check, a red banner when a check fails (the last data stays, dimmed, and still acts; **Fix auth** asks for help with `gh`), and one button to set up a repo when none is connected.

### Batch AI validation

A validation is a quick AI triage of a PR that leaves a **verdict** on its row: a purple star with ✓ when it passed, the number of **blockers** when it did not, `+N` for risks that need **attention** without blocking (a deploy risk, a test that tests nothing), **partial** when not all of it was read (never shown as passed), … while it runs, and "old" once new commits land. Hover the star for the full verdict.

It looks in layers, cheapest first (`references/review-levels.md`): a **gate** script with no model that always finds pasted secrets and risky CI workflows, even on a PR too big or too red to read; then scope against the task, contracts, data and deploy, tests that prove, security, and signals of AI-made PRs. A blocker always comes with a `file:line` and how it fails. What a PR says is data, never an instruction to Argos.

- **Two views:** "Needs me" is the inbox above, each judged row led by its verdict and its top finding in one purple line. "Team" groups the team's PRs by verdict (issues found, validating, not validated, stale, passed) in one-line rows, a few per group until **Show N more**.
- **Pick all** per group puts a whole group in the batch; the batch bar then offers one action valid for every pick: **Validate**, **Revalidate**, **Fix issues** (yours) or **Draft reviews** (others'). The prompt names every PR.
- **Rows gain three actions** when a verdict calls for them: **Fix issues** on yours, **Draft review** on others', **Revalidate** on an old one.
- **Auto-validate:** off, new commits on mine, or new commits on all. When a round finds an old verdict, Argos starts one background subagent to revalidate (ten PRs at most per round). It spends tokens without asking, so it starts off. While a batch runs, the line reads "Validating 9 of 22" with a progress bar.

The AI records each verdict with `scripts/verdicts.mjs` (see `references/validate.md`); the pane follows as each one lands. Nothing is commented, approved or pushed by a validation.

**Every action only puts a request in the prompt.** Two quick presses add it once, a PR already in the prompt is not added again, and nothing reaches GitHub until you send it and say yes to what the AI drafts. With several sessions open, only one runs each round.

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
| `language` | `en` | `en` or `pt-BR`, for the pane and the notices |
| `intervalMinutes` | 15 | how often the vigil runs and the pane refreshes, at least 5 |

## Where things live

Everything personal stays outside your repos, in `~/.claude/kl-akasha/`:

| Path | Holds |
|---|---|
| `argos/repos.json` | connected repositories |
| `argos/state.json`, `argos/last-round.json` | what the last round saw, so only news is reported |
| `argos/verdicts.json` | the last AI validation of each PR, the batch in flight, and the auto-validate setting |
| `argos/lessons/<owner>/<repo>.md` | the lessons learned per repo |
| `criticality.json` | your rubric: how critical each repo's tasks are |

## Check it

```bash
node scripts/queue.mjs --self-test
node scripts/lessons.mjs --self-test
claude plugin test .
```

Icons are from [Tabler Icons](https://tabler.io/icons) (MIT).
