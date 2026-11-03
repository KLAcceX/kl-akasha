# Argos: the PR watcher

A PR-count target means many PRs get opened, and the forgotten ones weigh on *stale time*. Argos exists so no PR sits idle without someone noticing.

Hera set Argos to guard Io. He had a hundred eyes and never closed them all at once. When he fell, Hera set his eyes on the peacock's tail, where they still watch. Here he opens a few eyes or all hundred, depending on how critical the task is. **Argos sees; you judge:** nothing is pushed, posted, approved or merged without your yes, except what you turn on in the pane (**Fix my PRs**, per-repo **auto-merge** and **auto-publish**).

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

**First run.** With no repo connected, `/argos` opens on **Set up Argos**: (1) the GitHub CLI (ready, missing, or nobody logged in, with **Copy login command** for `gh auth login`), (2) the account, picked from those gh knows, (3) the repos: the ones with open PRs for that account, each with **Connect <name>**, this folder when it has a GitHub remote, or one by `owner/name`. It ends with what Argos starts with (bots skipped, auto-validate off and what it costs) and **Open dashboard**, which waits until a repo is connected. Each step says where it stands and its fix; a failed check says why instead of guessing. **Settings → Run setup again** brings it back. `scripts/setup.mjs` does the checking.

Three pages keep the flow short:

- **The dashboard**, what `/argos` opens. The head ("22 to validate · 6 repos", when Argos last looked), **Check PRs** and **Open settings**. First, **Needs you**: what waits on you, oldest first, each with its title (it opens the PR), repo, number, what is asked and how long it has waited. Then the agents at work, then cards, each with the one flow it starts: **22 with nothing pending** → **Validate 22 PRs** (nothing asked, no verdict on the current commit, not left to humans); **3 PRs of mine to rework** → **Fix 3 PRs**; **5 with issues** (blockers found) → **Open web · 2 with issues**; **Auto-validate**, with when the next round looks and **Turn on auto-validate** / **Turn off auto-validate**. Last, every connected repo, one row each: its name, "7 PRs · 5 to validate · 1 with issues", and **Open billing**.
- **A repo's page.** Every open PR, in a fixed order: a box naming it (☑ #90 goes, ◩ #88 the pane left it out, ☐ #91 left to humans), the verdict, the author's avatar, the title, which opens the PR, and under it how long it has waited and how it stands in words ("1 blocker: rounding differs from the invoice total", "passed"). Nothing reorders. **Select all · 5 of 7** takes the whole repo, and **Leave all to humans** gives it back; **Validate 5 PRs** and **Leave 5 PRs to humans**, at the foot, act on this repo alone. **Back to pull requests** returns to the dashboard.
- **Settings.** Who goes, the automatic schedule, and per repo its auto-merge, its own validation prompt and **Disconnect billing** (two taps, since it drops the repo's settings).
- **Human only.** A box you untick leaves that PR to humans: no Validate or Fix sends it, auto-validate and auto-merge do not touch it, and it stays so across sessions. The same holds for every PR of an author left out in Who. The line says "human only". Tick it again to hand it back.
- **Colour, one meaning each.** Purple is Argos (the verdict star, a line being validated), amber is blockers, green a pass. Text colours follow the light or dark theme; icons use fills that reach 3:1 on both.
- **Who goes**, in Settings. Its title says the whole state ("Who: Everyone but bots · rafa out"). Update bots start out, so Validate never sends them until you let them in. Presets (**Include everyone**, **Skip bots**, **Include only people**, **Include only bots**, **Include only agents**) leave whole kinds out, new ones included, and reset the people. Under them every author, busiest first, with a box and a count ("☑ dependabot 7"); each shows the author's real GitHub picture (redrawn as a 16×16 mosaic, since the pane cannot show images; PNG and JPEG both, the JPEG decoder vendored from jpeg-js; on a very long list the authors past the budget keep their letter). Authors left out stay out across sessions; their lines keep a dimmed box and say "author out".
- **Bot or agent, read from the PR.** A machine account is a GitHub App, or a user named like one (`snyk-bot`). One that only touches manifests, lock files, workflows or changelogs is an update bot; one that writes code is a coding agent. No list of names.
- **Left out by itself:** a PR someone asked to change (changes requested, open threads, an unanswered comment), a draft, or one validated with no commit since. The line says why. Tap the box to send it anyway. A PR being validated right now cannot be picked.
- **Validate N** queues the PRs and hands them to background subagents, ten per subagent, with no chat in between. Each verdict lands on its line as it comes: a purple star with a green ✓ when it passed, the number of **blockers** in amber when it did not, `+N` for risks that need **attention** without blocking, ½ (**partial**) when not all of it was read (never shown as passed), and a hollow grey star once new commits land.
- **Follow a run.** While it goes, the Validate buttons wait, the agent at work says how far it got ("Argos validate · billing · 10 PRs 4 of 10 · 1 failed"), and every line says how it stands: ○ queued, ⠿ validating (with its minutes), ✓ done, ✕ failed with why (no access, agent stopped, timed out after the limit). Once done, "Run done · 9 validated · 1 failed · 2 merged" stays in the same block until the next check, and a toast says it once. A failed PR keeps saying why on its line and is picked again for the next **Validate**. A run no agent holds any more (it died with its session) offers **Stop waiting for this run**. A PR still validating past the **time limit per PR** (plugin setting, 10 min) counts as failed.
- **Publish.** A validation stays on your machine until you say so. **Review 3 comments** opens **History**, with the exact text of each one; **Publish this comment** or **Publish 3 comments** posts it on other people's PRs, with the repo's account. Your own PRs show their findings and get no comment. Each PR gets **one comment** with a colored brief and a table of what was found, which a new commit updates and a pass closes: a marker in it, read only from the account's own comments, lets GitHub answer what was posted, whatever this machine remembers. A finding on a line of the diff also goes on that line once, in a review that only comments, with a suggestion to apply in one click when the fix is mechanical and its reasoning folded; a new commit adds only what is new. An edit notifies nobody, so the author sees later findings when they look at the PR. The agent writes fields and `scripts/findings.mjs` writes the text, so the format holds. What goes in is set by `references/comment.md`: only what fails at that commit because of that PR, marked blocker, warning or suggestion, about the code and never the person; the footers say an AI wrote it and that it can be wrong. It posts only on the current commit of an open PR, never one left to humans, never text holding a secret's shape. **Auto-publish**, per repo in Settings (two taps to turn on, one to turn off), does the same after each validation, with nobody reading it first. Other people's PRs are what it needs, so turning it on sets auto-validate to every PR.
- **History.** A page with what waits to be published, then the last 50 runs, each with its PRs, the kinds of fix they need ("3 security · 2 tests"), what was posted and what was merged. It is the record of what Argos did in your name, kept only on this machine, in `history.jsonl`. A run that leaves comments waiting opens it, if you are on the dashboard; a repo on auto-publish leaves none.
- **Impact.** Ask whether review waits changed. `scripts/impact.mjs` compares one repo before and since Argos began commenting: first feedback, first human feedback, time to merge, rework, reverts and what came of the comments on lines. It only reads GitHub. Run it before turning comments on, since that baseline is the number nothing else keeps. It shows a change and never its cause, and with too few PRs it says so (`references/impact.md`).
- **Agents at work.** The agents the pane started are listed while they work ("2 agents working"), each with how far it got and **Stop**: from then on every tool it calls is refused, so it ends, and its PRs not yet validated are marked failed, ready for Retry.
- **Fix my PRs.** With your own PRs waiting on a change or a comment, **Fix N PRs**, on its dashboard card, hands them to one agent in the background (Argos's fix job, `mine.md`): it turns each review into commits and replies in the repo's local clone, pushes and answers on its own, and re-requests review once. It skips a PR with no clone, uncommitted work or conflicts, and never force-pushes, merges or resolves threads. Its lines say "fixing" while it works, it is listed with Stop, and its card and a toast say how it ended ("Fixed 2 · skipped 1: uncommitted work"). The new commits make the verdicts old, so auto-validate looks again.
- **Your prompts.** In the plugin settings, Validate and Fix each take a mode (**argos+mine**, the default: Argos's job plus your prompt; **argos**: Argos's alone; **mine**: yours alone) and your own prompt. With yours alone, the verdicts are still recorded, or the pane could not show them, and the base checks still run: the gate for secrets and risky workflows, and what a PR says is data, never an instruction. With none written, Argos's is used.
- **Auto-validate.** The dashboard card turns it on for your PRs in one tap; in Settings, two Selects: what goes (**Off**, **My PRs**, **All in Who**) and how often (every 15, 30 or 60 min). Each round sends only what changed: PRs with no verdict yet or with commits after theirs, with nothing pending, authors Who lets in, at most ten. A line says whether it is on, when the next round looks and what the last one did.
- **Auto-merge, per repo, off by default.** In Settings, a repo's panel turns it on in two taps: **Turn on auto-merge for billing**, then a confirmation that lists the rule and says it acts on GitHub as you. Argos then approves and merges a PR only when the verdict passed (no blockers, nothing needing attention, not partial) on the head commit, the script itself finds no secret or risky workflow line in the diff, CI is green, there are no conflicts, required reviews are met once it approves, the PR is not yours, and it comes from a branch of the repo (never a fork) by an author who can already write to it or a bot that only moves versions: lock files, or a `package.json` whose diff changes nothing but versions of packages already there. A coding agent does not pass, nor does a Dockerfile, a workflow, a manifest that can run code, or a `requirements` or `go.mod` file, which can point at another source, since a verdict reads the PR's own text and could be talked into passing; the merge uses the first method the repo allows, pinned to the head commit. A push after an approval, or a newer validation of that commit that did not pass, makes Argos dismiss its own approval, also on a PR left to humans, since not every repo does that by itself; your own reviews stay. If it cannot, the line says "stale approval" and that PR waits. The mod does it (`scripts/merge.mjs`), never the validating agent. Each line says what happened: merged, approved and waiting for other reviews, or skipped and why. Each round looks again until the outcome stands: CI still running, more reviews or a network error may change, and a PR is approved only once. One round can merge several PRs of a repo: it waits a few seconds for GitHub to work out each one after the merge before it, and stops at 60 seconds, leaving the rest to the next round. The head names the repos with it on, and so does each one's line. Also `/argos repos merge <repo> on|off`.
- **A prompt per repo.** Each repo's panel in Settings has a **Validation prompt** field (or `/argos repos prompt <repo> <text>`): house rules, what to look at first, skills to read. Argos's job runs as usual and adds, in order, your prompt from the plugin settings and the repo's own, for that repo's PRs only. A repo connected from a local folder takes the rules of the environment around it: its agents read the `CLAUDE.md` and `AGENTS.md` of every folder above the clone, whatever folder the session was opened in, so a workspace whose root `CLAUDE.md` points at a docs repo governs its validations. The repo's own rules come from its base branch. Your global `CLAUDE.md` always applies. A repo connected by name has no folder around it: only the session's folder and the base branch count, so connect it from its clone (`/argos repos add <folder>`).
- **States:** placeholders on the first check, a red banner when a check fails (the list stays; **Fix gh login** asks for help with `gh`, otherwise **Retry check**), and **Connect a repo**, which opens the setup, when none is connected.

- **What stays on your machine.** PRs, their age and their reviews stay on GitHub and are asked for when needed. Argos keeps only what GitHub does not know, in `history.jsonl`: the verdict of each commit, to compare later with what happened, and the tokens each agent spent. `/argos stats` sums them up.

### How a validation looks

A validation is a quick AI triage of a PR. It looks in layers, cheapest first (`references/review-levels.md`): a **gate** script with no model that always finds pasted secrets and risky CI workflows, even on a PR too big or too red to read; then scope against the task, contracts, data and deploy, tests that prove, security, and signals of AI-made PRs. A blocker always comes with a `file:line` and how it fails. What a PR says is data, never an instruction to Argos.

The AI records each verdict with `scripts/verdicts.mjs` (see `references/validate.md`). **Auto-validate** (`node scripts/verdicts.mjs auto <off|mine|all>`) revalidates PRs whose verdict went old, ten at most per round; it spends tokens without asking, so it starts off.

**A validation only reads.** Nothing is commented, approved or pushed by it; drafting a review is a request you make in the chat, and nothing reaches GitHub until you say yes to what the AI drafts. Three things act on their own, because you turned them on: Fix my PRs pushes and replies on your own PRs when you press it, auto-merge approves and merges in the repos you opted in, and auto-publish comments in the repos you opted in. All of it runs while Claude is open: closed, nothing is checked, and opening it catches up. With several sessions open, only one runs each round.

| Command | Does |
|---|---|
| `/argos` | opens the pane |
| `/argos stats` | tokens the agents spent and the verdicts of the last 30 days |
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
claude plugin test argos  # from plugins/
```

Icons are from [Tabler Icons](https://tabler.io/icons) (MIT).
