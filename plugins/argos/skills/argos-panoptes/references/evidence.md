# Evidence: what helps a reviewer

## How to use this

These are recommendations backed by published data, not rules. When the project has its own review rules (CONTRIBUTING.md, a PR template, CODEOWNERS, AGENTS.md or CLAUDE.md, a review checklist), those win. Use the numbers here to explain a judgement ("this PR is 1,400 lines across 40 files, review quality drops past ~400"), never to grade a teammate. Rows marked **unconfirmed** could not be checked against the primary source; do not quote them as fact.

## Size and attention

| Finding | Value | Measures | Source (year) |
|---|---|---|---|
| Review at most 200-400 LOC at a time | beyond ~400 LOC defect finding drops | Cisco team, ~2,500 reviews | [SmartBear, Best Practices for Code Review](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/) (page undated; Cisco study c. 2006, date **unconfirmed**) |
| Expected yield of a careful review | 70-90% of defects in 200-400 LOC over 60-90 min | defect discovery rate | same |
| Inspection rate | defect density drops sharply above 500 LOC/hour | LOC reviewed per hour | same |
| Session length | performance drops after ~60 min | reviewer attention | same |
| Reasonable change size | ~100 lines usually fine; ~1,000 usually too large; 200 lines over 50 files is too large | guideline, reviewer judgement | [Google eng-practices, Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html) (2019) |
| Median change size at Google | 24 lines; >10% change one line; ~90% touch <10 files | 9M reviewed changes | [Sadowski et al., Modern Code Review: A Case Study at Google](https://sback.it/publications/icse2018seip.pdf) (ICSE-SEIP 2018) |
| Comments grow with size | avg comments per change peak ~12 at ~1,250 lines | comments per change | same |
| More files, less useful feedback | share of useful comments falls as files per change rise | 1.5M comments, 5 Microsoft projects | [Bosu, Greiler, Bird, Characteristics of Useful Code Reviews](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bosu2015useful.pdf) (MSR 2015) |
| Small PRs do not merge faster by default | PR size and composition did not relate to time-to-merge | 845,316 GitHub PRs + 401,790 Gerrit/Phabricator reviews | [Kudrjavets, Nagappan, Rastogi, Do Small Code Changes Merge Faster?](https://arxiv.org/abs/2203.05045) (MSR 2022) |

Takeaway: size limits protect **review quality**, not merge speed. A large PR is a reason to review in passes or ask for a split, not to skim.

## Speed and turnaround

| Finding | Value | Measures | Source (year) |
|---|---|---|---|
| Response time target | at most one business day to respond | first response to a review request | [Google eng-practices, Speed of Code Reviews](https://google.github.io/eng-practices/review/reviewer/speed.html) (2019) |
| Time to first feedback at Google | median <1 h for small changes, ~5 h for very large | wait for first comment | [Sadowski et al.](https://sback.it/publications/icse2018seip.pdf) (2018) |
| Whole review latency at Google | median <4 h, all sizes | request to approval | same |
| Microsoft comparison | median time to approval 24 h | cited in Sadowski et al. | same (secondary) |
| Rounds | >80% of Google changes need at most one iteration of resolving comments | iterations per change | same |
| Reviewers per change at Google | median 1; <25% have more than one | reviewer count | same |
| Faster reviews, better delivery | teams with faster code reviews have 50% higher software delivery performance | DORA survey (2023 sample size not checked) | [DORA, Accelerate State of DevOps 2023](https://dora.dev/research/2023/dora-report/) (2023) |
| Nudging overdue PRs | completion time cut >60% (197 h to 77 h avg) | randomized trial, 8,500 PRs, 147 repos | [Maddila et al., Nudge](https://arxiv.org/abs/2011.12468) (TOSEM 2022) |
| Tail matters more than median | satisfaction tracks P75 time in review, not P50 | Meta internal survey + logs | [Meta Engineering, Improving code review time at Meta](https://engineering.fb.com/2022/11/16/culture/meta-code-review-time-improving/) (2022) |
| Stale-diff reminders | avg time in review -7%; diffs waiting >3 days -12% | NudgeBot experiment | same |

Caveat from DORA 2023: fast reviews help only if review is the bottleneck; speed limited elsewhere stays limited.

## What to check, in order

Google's reviewer guide, condensed ([What to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html), [Navigating a CL](https://google.github.io/eng-practices/review/reviewer/navigate.html), 2019):

1. **Does the change make sense?** Read the description and the linked task first. If the premise is wrong, say so before line comments.
2. **Main part first.** Find the file with the most logical change. Send major design problems at once, even before finishing; the rest may be rewritten.
3. **Design** (most important), then **functionality** (edge cases, concurrency, user-visible behaviour), **complexity** (over-engineering, speculative features), **tests** (would they fail if the code broke?), **naming**, **comments** (why, not what), **style**, **docs**.
4. **Rest of the files** in a logical order; reading tests first can explain intent.
5. **Context:** look at the whole file, not just the hunk. Do not accept changes that degrade code health.
6. Review every line you were asked to review; say so if you only reviewed part.

Defects are a minority of what review finds: only 14% of comments were defects (4th of 9 categories); code improvements led at 29% ([Bacchelli & Bird, Expectations, Outcomes, and Challenges of Modern Code Review](https://web.eecs.umich.edu/~weimerw/2018-481/readings/codereview.pdf), ICSE 2013). About 15% of comments indicate a possible defect, fewer a blocking one ([Czerwonka, Greiler, Tilford, Code Reviews Do Not Find Bugs](https://www.microsoft.com/en-us/research/wp-content/uploads/2015/05/PID3556473-1.pdf), ICSE 2015). So a review that only hunts bugs misses most of its value, and a reviewer should not invent blockers to look useful.

## Who gives useful comments

| Finding | Value | Source (year) |
|---|---|---|
| Overall useful-comment share | 64-68% across five Microsoft projects | [Bosu et al.](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bosu2015useful.pdf) (2015) |
| Reviewers who saw the file before | 65-71% useful vs 32-37% for first-time reviewers | same |
| Familiarity over time | first-time reviewers ~33% useful; by third review of the same code ~67% | [Czerwonka et al.](https://www.microsoft.com/en-us/research/wp-content/uploads/2015/05/PID3556473-1.pdf) (2015) |

Implication for Argos: when the user is new to the touched code, say so, spend the extra effort on understanding first, and phrase uncertain points as questions.

## Comment taxonomy and tone

| Label | Blocks merge? | Use for | Source |
|---|---|---|---|
| `issue` / unlabeled required change | yes, unless marked non-blocking | a real problem; pair with a suggestion | [Conventional Comments](https://conventionalcomments.org/) (n.d.) |
| `suggestion` | add `(blocking)` or `(non-blocking)` | an improvement, with what and why | same |
| `question` | no | possible concern you are not sure about | same |
| `nitpick` / `Nit:` | no | minor, preference-based | same; [Google, How to write comments](https://google.github.io/eng-practices/review/reviewer/comments.html) |
| `Optional` / `Consider` | no | good idea, not required | Google, same page |
| `FYI` | no | for the future, not this PR | Google, same page |
| `praise` | no | something sincerely good; no false praise | Conventional Comments |
| `todo`, `chore`, `thought`, `note` | varies | small required task, process step, idea, context | Conventional Comments |

Format: `<label> [decorations]: <subject>` then optional discussion. Decorations include `(blocking)`, `(non-blocking)`, `(if-minor)`. Without labels, authors tend to read every comment as mandatory (Google, How to write comments).

Tone (Google, same page; [GitHub, How to write the perfect pull request](https://github.blog/developer-skills/github/how-to-write-the-perfect-pull-request/), 2015, updated 2022):
- Comment on the code, not the person. Explain the reasoning.
- Balance pointing out the problem with giving direction; the author may find a better fix.
- Ask the author to simplify the code or add a code comment instead of explaining it in the thread.
- Prefer "What do you think about...?" over "Don't...". Say whether a point is preference or principle.
- Do not block on personal style not in the style guide. Do not accept "I'll clean it up later" for new complexity; ask for a filed issue if it truly must wait ([Google, Handling pushback](https://google.github.io/eng-practices/review/reviewer/pushback.html)).

## Respecting the project's own rules

Look for these before applying any default from this file. If one exists, quote it in the review and follow it.

| File | Where GitHub looks | Precedence | Source |
|---|---|---|---|
| `CODEOWNERS` | `.github/`, root, `docs/` (first found, in that order); must be on the PR's base branch | last matching pattern wins | [GitHub Docs, About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) |
| PR template | `pull_request_template.md` in root, `docs/`, or `.github/`; multiple in `PULL_REQUEST_TEMPLATE/` | the PR body should answer its checklist | [GitHub Docs, PR template](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository) |
| `CONTRIBUTING` (any case, any supported extension) | `.github/`, root, `docs/` | `.github` first, then root, then `docs` | [GitHub Docs, Contributor guidelines](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors) |
| `AGENTS.md` | any directory; nested files per package | closest file to the edited path wins; explicit user prompts override | [agents.md](https://agents.md/) |
| `CLAUDE.md` | `./CLAUDE.md` or `./.claude/CLAUDE.md`, plus nested dirs | see Claude Code load order | [Claude Code docs, Memory](https://code.claude.com/docs/en/memory) |
| Branch protection | repo settings (read via API) | may require approvals, code owner review, resolved conversations, or dismiss stale approvals | [GitHub Docs, Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) |

Detect with read-only calls, for example `gh api repos/{o}/{r}/contents/.github/CODEOWNERS` (try each location), and `gh api repos/{o}/{r}/branches/{base}/protection` (needs admin rights; a 403/404 means "unknown", not "none").

## Metrics and their traps

| Metric | What it tells you | Trap | Source (year) |
|---|---|---|---|
| Time to first review / pickup | queue health | rubber-stamping to go faster; Meta paired it with "Eyeball Time" as a guardrail | [Meta](https://engineering.fb.com/2022/11/16/culture/meta-code-review-time-improving/) (2022) |
| P75 time in review | the waits people actually feel | a median hides the stale tail | same |
| DORA five: change lead time, deployment frequency, change fail rate, failed deployment recovery time, deployment rework rate | delivery outcome | measure one service at a time; blending teams misleads | [DORA, software delivery performance metrics](https://dora.dev/guides/dora-metrics-four-keys/) (current) |
| SPACE dimensions (satisfaction, performance, activity, communication, efficiency) | productivity is multi-dimensional | no single metric captures it | [Forsgren et al., The SPACE of Developer Productivity](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/) (ACM Queue 2021) |
| Comments per review, defects found | review depth | counting comments rewards nitpicks | Goodhart's law: a measure that becomes a target stops measuring ([Wikipedia](https://en.wikipedia.org/wiki/Goodhart%27s_law)); DORA 2023 also warns that fixating on metrics drives ineffective behaviour |

Heavyweight external approval (change boards) lowers delivery performance with no evidence of fewer failures; peer review in the platform is the recommended control ([DORA, Streamlining change approval](https://dora.dev/capabilities/streamlining-change-approval/)).

## Unconfirmed (do not cite as fact)

- Google latency tiers "<100 lines under 1 h, 100-500 lines ~4 h, >1,000 lines 24 h+": seen only in third-party blogs, not in Sadowski et al.
- "75% of developers report negative feelings in review": vendor blog only; Egelman et al. 2020 say pushback is relatively rare.
- Vendor benchmarks (LinearB, Graphite, etc.) for "elite" pickup time or PR size: behind a sign-up form; not checked.
