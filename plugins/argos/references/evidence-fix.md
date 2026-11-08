# Evidence: what helps an author address review feedback

## How to use this

These are recommendations backed by published data, not rules. When the project has its own rules (CONTRIBUTING.md, a PR template, CODEOWNERS, AGENTS.md or CLAUDE.md, branch protection), those win. Use the numbers to decide what to do next on the user's PR, not to judge reviewers. Rows marked **unconfirmed** could not be checked against the primary source.

## What a normal review cycle looks like

| Finding | Value | Measures | Source (year) |
|---|---|---|---|
| Rounds at Google | >80% of changes need at most one iteration of resolving comments | iterations per change | [Sadowski et al., Modern Code Review: A Case Study at Google](https://sback.it/publications/icse2018seip.pdf) (ICSE-SEIP 2018) |
| Rounds in a pushback study sample | median 3 rounds; median 13 min active author time, 4 min active reviewer time | stratified sample of Google reviews | [Egelman et al., Predicting Developers' Negative Feelings about Code Review](https://research.google/pubs/predicting-developers-negative-feelings-about-code-review/) (ICSE 2020) |
| Author effort | ~60 min average active shepherding from sending to submitting | Google, all changes | [Google Research, Resolving code review comments with ML](https://research.google/blog/resolving-code-review-comments-with-ml/) (2023) |
| First feedback | median <1 h for small changes, ~5 h for very large | Google | Sadowski et al. (2018) |
| Response target | reviewers should respond within one business day | guideline | [Google eng-practices, Speed of Code Reviews](https://google.github.io/eng-practices/review/reviewer/speed.html) (2019) |
| When a reviewer goes silent | add another reviewer after 2 working days without response | Chromium author guideline | [Chromium, Code Reviews](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/code_reviews.md) (current) |
| Nudging overdue PRs | completion time cut >60% (197 h to 77 h avg); 73% of nudges resolved positively | randomized trial, 8,500 PRs | [Maddila et al., Nudge](https://arxiv.org/abs/2011.12468) (TOSEM 2022) |
| Stale reminders at Meta | avg time in review -7%; diffs waiting >3 days -12% | NudgeBot experiment | [Meta Engineering, Improving code review time](https://engineering.fb.com/2022/11/16/culture/meta-code-review-time-improving/) (2022) |

So: one round is the common case. A PR on its third or fourth round, or waiting more than a working day or two, is worth flagging to the user. A polite ping or an extra reviewer is evidence-backed, not rude.

## Triage the comments

Sort every open thread before touching code:

| Kind | Signals | Action | Source |
|---|---|---|---|
| Blocking | `issue`, `(blocking)`, "Changes requested" review, no label from a required reviewer | fix in this PR or agree a follow-up with the reviewer | [Conventional Comments](https://conventionalcomments.org/) (n.d.) |
| Question | `question:`, "why...?" | answer; if the reviewer did not understand the code, clarify the code first | Google, below |
| Suggestion | `suggestion`, `Optional`, `Consider` | take it if cheap and better; otherwise reply with the trade-off | Conventional Comments; [Google, comment labels](https://google.github.io/eng-practices/review/reviewer/comments.html) |
| Nit | `nitpick`, `Nit:` | fix if trivial; never argue over it | same |
| FYI / thought / praise | `FYI`, `thought`, `praise` | acknowledge; no code change needed | same |
| `(if-minor)` | decoration | do it only if the change is small | Conventional Comments |

Without labels authors tend to read every comment as mandatory (Google). When a label is missing, treat a comment from a required reviewer as blocking until asked.

Not every comment is useful: authors rated 64-68% of comments useful across five Microsoft projects ([Bosu, Greiler, Bird](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bosu2015useful.pdf), MSR 2015). A comment that is not useful still deserves a short, polite reply.

## Respond well

From [Google eng-practices, How to handle reviewer comments](https://google.github.io/eng-practices/review/developer/handling-comments.html) (2019) and [GitHub, How to write the perfect pull request](https://github.blog/developer-skills/github/how-to-write-the-perfect-pull-request/) (2015, updated 2022):

1. **Do not take it personally.** Read for the constructive point behind a frustrated comment. Never reply in anger; it stays in the record.
2. **Make sure you understand the ask.** If not, ask for clarification before changing code.
3. **Fix the code, not the thread.** If the reviewer did not understand the code, future readers will not either: simplify it or add a code comment. Explain only in the thread when the comment seems pointless.
4. **Respond to every comment**, including the ones you did not act on. Lead with thanks when feedback was mixed.
5. **Disagree collaboratively.** State what you chose, the trade-off, and ask which trade-off the reviewer weighs differently. You may know something about users or the codebase the reviewer does not.
6. **Rude feedback**: raise it privately and kindly first; escalate to a manager only if that fails.

## When to push back

| Situation | Guidance | Source |
|---|---|---|
| Reviewer is wrong on facts or context | push back with the facts; Google tells reviewers to drop the point when the author is right | [Google, Handling pushback](https://google.github.io/eng-practices/review/reviewer/pushback.html) |
| Request is personal style not in the style guide | fine to decline; reviewers should not block on it | [Google, What to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html) |
| Request is out of scope | offer a follow-up issue and link it | Google, Handling pushback |
| "I'll clean it up later" for complexity this PR adds | avoid; experience shows later cleanup rarely happens. File an issue assigned to yourself if it truly must wait | same |
| Consensus fails | follow the project's escalation or the standard of code review; do not resolve the thread yourself | [Google, Handling reviewer comments](https://google.github.io/eng-practices/review/developer/handling-comments.html) |

Pushback that feels hostile is relatively rare but costly when it happens ([Egelman et al.](https://research.google/pubs/predicting-developers-negative-feelings-about-code-review/), 2020).

## Threads, re-requests and approvals on GitHub

| Mechanic | Fact | Source |
|---|---|---|
| Resolve conversation | the PR author or anyone with write access can resolve a thread; resolved threads collapse | [GitHub Docs, Commenting on a PR](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/commenting-on-a-pull-request) |
| Required resolution | branch protection can require all conversations resolved before merge | [GitHub Docs, Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) |
| Stale approvals | protection can dismiss approvals when new commits change the diff; then someone must approve again | same |
| Re-request review | after addressing changes the author can ask the same reviewer to review again | [GitHub Docs, Requesting a PR review](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/requesting-a-pull-request-review) |
| Code owners | owners are requested automatically when their paths change; the CODEOWNERS file must be on the base branch | [GitHub Docs, About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) |

Practice (no study found, convention only): reply to each thread saying what changed (or why not), let the **reviewer** resolve threads they opened unless the project says otherwise, then re-request review once, after all threads are answered, not per fix.

## Keep the follow-up reviewable

| Practice | Why | Source (year) |
|---|---|---|
| Push review fixes as separate commits during review; squash at the end if the project wants clean history | reviewer sees only what changed since the last round | convention; `git commit --fixup` + `git rebase --autosquash` exists for this ([git-commit docs](https://git-scm.com/docs/git-commit)) |
| Do not mix refactors or reformatting with the fix | style changes hide the real change and complicate rollback | [Google, What to look for: Style](https://google.github.io/eng-practices/review/reviewer/looking-for.html) |
| Keep the PR one self-contained change; split if the review grows | small changes are reviewed faster and more thoroughly | [Google, Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html) (2019) |
| Expect size alone not to speed merging | PR size did not relate to time-to-merge across 845k GitHub PRs | [Kudrjavets et al.](https://arxiv.org/abs/2203.05045) (MSR 2022) |
| Avoid force-pushing over commits a reviewer already saw, unless the project asks for it | GitHub may dismiss approvals when the diff changes | GitHub Protected branches |

Help from tooling is real but partial: Google's ML suggested edits address ~52% of comments at 50% target precision, and authors apply 40-50% of previewed suggestions ([Google Research](https://research.google/blog/resolving-code-review-comments-with-ml/), 2023). Treat an auto-generated fix as a draft for the user to check.

## Respecting the project's own rules

Before suggesting any default, look for `CONTRIBUTING*` (`.github/`, root, `docs/`), `pull_request_template.md` (same three places or `PULL_REQUEST_TEMPLATE/`), `CODEOWNERS` (`.github/`, root, `docs/`, first found), `AGENTS.md` (closest to the changed path wins; explicit user prompts override, per [agents.md](https://agents.md/)) and `CLAUDE.md`. If the PR template has a checklist, an unticked box is a pending item for the author.

## Metrics and their traps

Time to first review, rounds, and time in review are useful signals for the user's own queue. Do not turn them into targets: Meta pairs speed with "Eyeball Time" to catch rubber-stamping ([Meta](https://engineering.fb.com/2022/11/16/culture/meta-code-review-time-improving/), 2022); DORA 2023 warns that fixating on metrics drives ineffective behaviour ([DORA 2023](https://dora.dev/research/2023/dora-report/)); productivity has several dimensions and no single metric ([SPACE](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/), 2021).

## Unconfirmed (do not cite as fact)

- "Reply 'Done' on every fixed thread" as a measured best practice: common Gerrit/Chromium habit; no study found.
- Who should resolve a thread (author vs reviewer): GitHub allows both; no study found on which works better.
