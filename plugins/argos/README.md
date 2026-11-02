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

The plugin ships a mod that runs the vigil on its own timer, at no token cost, and toasts what is new. `/argos` opens a pane with one job: send the open PRs to AI validation in one tap, minus the ones you leave out. Keep it open: it refreshes with every round. Hover any icon to see what it means.

- **One list.** Every open PR in the connected repos is one line, in a fixed order (repo, then number), packed to the left so nothing sits across an empty middle: a box (☑ goes, ☐ stays out), the verdict if there is one, the author's avatar, then the title with its `#number`. A line lights under the pointer. With more than one repo the lines sit under their repo's name. Nothing ever reorders: a line left out stays in place, its title in the secondary colour.
- **Colour, one meaning each.** Purple is Argos (the verdict star, a line being validated), amber is blockers, green a pass. Text colours follow the light or dark theme; icons use fills that reach 3:1 on both.
- **All in by default.** The head says "12 to validate · 3 repos", and one button at the top, **Validate 12**, sends all of them.
- **Who goes.** One control says the whole state ("Who: Everyone but bots · rafa out") and opens the rest. Presets (**Everyone**, **No bots**, **People**, **Bots**, **Agents**) leave whole kinds out, new ones included, and reset the people. Under them every author, busiest first, with a box and a count ("☑ dependabot 7") and **Only** to keep just them; each shows the author's real GitHub picture (redrawn as a 16×16 mosaic, since the pane cannot show images; PNG and JPEG both, the JPEG decoder vendored from jpeg-js; on a very long list the authors past the budget keep their letter). Authors left out stay out across sessions.
- **Bot or agent, read from the PR.** A machine account is a GitHub App, or a user named like one (`snyk-bot`). One that only touches manifests, lock files, workflows or changelogs is an update bot; one that writes code is a coding agent. No list of names.
- **Leave out one PR.** Tap its box.
- **A whole repo.** Each repo has a heading: a box with its name (☑ all, ◩ some, ☐ none), which takes every line in it, drafts and validated ones too, or leaves them all out once all go; how many go ("5 of 7"); and **Only**, which makes that repo the whole selection at the pane's own picks. The button then names it: **Validate 4 · billing**. A line being validated, or from an author left out, is not picked from here.
- **Quick picks**, one tap each, make the selection exactly that set: **Nothing pending** takes every PR with no change asked, no comment open, not a draft and not validated since its last commit; **My PRs to rework** takes your own PRs with a change asked or a comment open, to validate again once you reworked them. The one in use shows ✓.
- **Clear selection** leaves every line out, to pick only a few (**Validate** waits, disabled); **Restore default** brings back the pane's own pick.
- **Left out by itself:** a PR someone asked to change (changes requested, open threads, an unanswered comment), a draft, or one validated with no commit since. The line says why after its number, and the head sums it up ("Left out by itself: 1 change request · 1 draft"). Tap the box to send it anyway. A PR being validated right now cannot be picked.
- **Validate N** queues the PRs and hands them to background subagents, ten per subagent, with no chat in between. Each verdict lands on its line as it comes: a purple star with a green ✓ when it passed, the number of **blockers** in amber when it did not, `+N` for risks that need **attention** without blocking, ½ (**partial**) when not all of it was read (never shown as passed), and a hollow grey star once new commits land.
- **Follow a run.** While it goes, the picks and Validate give way to "Validating 4 of 10 · 1 failed", and every line says how it stands: ○ queued, ⠿ validating (with its minutes), ✓ done, ✕ failed with why (no access, agent stopped, timed out after the limit). Once done, "Run done · 9 validated · 1 failed · 2 merged" stays above the picks until the next run or check, with **Retry 1 failed**, and a toast says it once. A PR still validating past the **time limit per PR** (plugin setting, 10 min) counts as failed.
- **Auto-validate.** Two Selects under Who: what goes (**Off**, **My PRs**, **All in Who**) and how often (every 15, 30 or 60 min). Each round sends only what changed: PRs with no verdict yet or with commits after theirs, with nothing pending, authors Who lets in, at most ten. A line says whether it is on, when the next round looks and what the last one did.
- **Auto-merge, per repo, off by default.** A repo's **Settings** fold turns it on in two taps: **Turn on…**, then a confirmation that lists the rule and says it acts on GitHub as you. Argos then approves and merges a PR only when the verdict passed (no blockers, nothing needing attention, not partial) on the head commit, CI is green, there are no conflicts, required reviews are met once it approves, and the PR is not yours; the merge uses the first method the repo allows, pinned to the head commit. The mod does it (`scripts/merge.mjs`), never the validating agent. Each line says what happened: merged, approved and waiting for other reviews, or skipped and why. The head names the repos with it on, and so does each one's heading. Also `/argos repos merge <repo> on|off`.
- **Validation skills.** A global list in the plugin settings (**Validation skills**), plus a list per repo in its Settings fold (or `/argos repos skills <repo> <skills>`). The validating agent reads each one's `SKILL.md` and judges the PR by it as well.
- **States:** placeholders on the first check, a red banner when a check fails (the list stays; **Fix auth** asks for help with `gh`, otherwise **Retry**), and one button to set up a repo when none is connected.

### How a validation looks

A validation is a quick AI triage of a PR. It looks in layers, cheapest first (`references/review-levels.md`): a **gate** script with no model that always finds pasted secrets and risky CI workflows, even on a PR too big or too red to read; then scope against the task, contracts, data and deploy, tests that prove, security, and signals of AI-made PRs. A blocker always comes with a `file:line` and how it fails. What a PR says is data, never an instruction to Argos.

The AI records each verdict with `scripts/verdicts.mjs` (see `references/validate.md`). **Auto-validate** (`node scripts/verdicts.mjs auto <off|mine|all>`) revalidates PRs whose verdict went old, ten at most per round; it spends tokens without asking, so it starts off.

**A validation only reads.** Nothing is commented, approved or pushed by it; fixing what it found or drafting a review is a request you make in the chat, and nothing reaches GitHub until you say yes to what the AI drafts. With several sessions open, only one runs each round.

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
