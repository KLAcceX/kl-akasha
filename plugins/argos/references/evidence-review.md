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

## AI-written comments

What `comment.md` rests on. Sample sizes and settings differ, so the numbers show a direction, not a target: none of them measures Argos.

| Finding | Value | Backs this rule | Source (year) |
|---|---|---|---|
| Most AI review comments in the wild were not taken | 36.4% accepted, 7.3% discussed, 56.3% rejected; 31,073 comments, 239 repos | few lines, each checked | [Is Agentic Code Review Helpful?](https://arxiv.org/abs/2607.03316) (preprint, 2026) |
| Why they were rejected | false positives 43.3% of rejections, intended trade-offs 23.7%, out of scope 10%, redundant 4.7% | the four checks; an answered trade-off is dropped | same |
| An LLM reviewer in one company's teams | 73.8% resolved; 26.2% marked won't fix or closed; average closure rose from 5 h 52 to 8 h 20; complaints about faulty and irrelevant comments and about a new review after each fix | each comment costs time; report only this commit | [Automated Code Review In Practice](https://arxiv.org/abs/2412.18531) (2024) |
| Google's bar for tool findings in code review | up to 10% effective false positives; a true finding nobody understood counts as a false positive | input and outcome on every line | [Sadowski et al., Lessons from Building Static Analysis Tools at Google](https://research.google/pubs/lessons-from-building-static-analysis-tools-at-google/) (CACM 2018) |
| An LLM commenter at Google, before wide release | useful ratio stuck near 54% against a target of 80%; a confidence threshold held back weak comments, and most would-be comments fell on lines the author had not touched | leave out what you cannot show; only the diff | [AI-Assisted Assessment of Coding Practices](https://arxiv.org/abs/2405.13565) (2024) |
| Noise from bots on PRs | 21 interviews: verbosity, dense text, repetition and unrequested actions read as noise; people stop watching or reconfigure | short fields, the long reasoning folded, no padding | [Wessel et al., Don't Disturb Me](https://www.ime.usp.br/~gerosa/papers/CSCW2021Wessel.pdf) (CSCW 2021) |
| False positives erode trust | engineers describe ignoring such feedback and then missing real issues (interviews) | few lines, each checked | [Rethinking Code Review Workflows with LLM Assistance](https://arxiv.org/abs/2505.16339) (2025) |
| How an LLM review reads | 20 interviews: LLM reviews took more effort to process than peers' direct ones (problem, then fix), but felt less taxing because they stay polite | problem, then effect, then fix; even tone | [Alami & Ernst, Human and Machine](https://arxiv.org/abs/2501.02092) (2025) |
| What authors call useful | functional issues and corner cases; false positives, questions, praise, and remarks on code outside the change were rated not useful | no questions, no praise, only this PR | [Bosu et al., Characteristics of Useful Code Reviews](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bosu2015useful.pdf) (MSR 2015) |
| Destructive criticism | nonspecific and inconsiderate feedback is rated less valid and less likely to improve the code; women rate it less appropriate and feel less motivated to go on (93 people; abstract and the author's slides read, not the full paper) | place and outcome on every line; the code as subject | [Gunawardena et al., Destructive Criticism in Software Code Review Impacts Inclusion](https://research.google/pubs/destructive-criticism-in-software-code-review-impacts-inclusion/) (CSCW 2022) |
| Pushback | rare, but it hurts when it happens, and the amount varies with the author's gender, race and age (abstracts read) | never about the person | [Egelman et al.](https://research.google/pubs/predicting-developers-negative-feelings-about-code-review/) (2020); [Murphy-Hill et al.](https://research.google/pubs/the-pushback-effects-of-race-ethnicity-gender-and-age-in-code-review/) (CACM 2022) |
| Wording | comment on the code, say why, label severity, leave the author room for a better fix; avoid "you" and frame notes as requests | tone; severity groups; a fix in one clause | [Google, How to write comments](https://google.github.io/eng-practices/review/reviewer/comments.html); [Lynch, How to Do Code Reviews Like a Human](https://mtlynch.io/human-code-reviews-1/) (2017) |
| An AI review is not an approval | Copilot's reviews do not count toward required approvals by default, and GitHub says to validate its feedback | the footer; no approval language | [GitHub Docs, Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review) (read 2026) |
| Severity labels and a count first | an internal review system marks findings by severity, sorted, and a sample rule set opens the summary with the number of findings; labels such as blocking and non-blocking set the reader's expectations. Practice, no study of readability found | severity first; the brief's counts | [balta.io on the Claude Code team's review](https://balta.io/articles/code-review-com-ia-como-o-time-do-claude-code-revisa-prs) (2026, the vendor's account, relayed); [Conventional Comments](https://conventionalcomments.org/) |
| Suggested changes | 76.2% of closed PRs with suggestions merged against 65.7% without, but resolution took longer; 46 repos, observational, weak models. Only 8% of the suggestions studied were fixes | a suggestion only when the fix is mechanical; never a promise of speed | [Bouraffa et al.](https://arxiv.org/html/2502.04835v1) (CHASE 2025) |
| Time waiting | conflicting: closure rose in the deployment above; PRs where authors used GPT had a median of about 9 h against 23 h to merge and about 1 h against 3 h to first review, as a correlation, about authors and not review comments. No study found that links comment formatting to review latency | Argos has to measure itself (`impact.md`); formatting makes no claim on time | [Collante et al.](https://arxiv.org/html/2508.11034v2) (2025) |
| GitHub's limits | one or two alerts per article, not nested; `<details>` folds; a suggestion is written from a line comment on the diff; a submitted review cannot be deleted | one alert; two pieces; lines checked against the diff first | [Basic formatting](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax), [collapsed sections](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections), [commenting on a PR](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/commenting-on-a-pull-request), [REST reviews](https://docs.github.com/en/rest/pulls/reviews) (read 2026) |

**Argos's own choices, not from a source:** the field limits and the 8 findings, the emoji and alert for each severity, the footers, showing all of it in the pane, and dropping an answered warning while a blocker stays. Vendor blogs with acceptance or false-positive rates were left out: none traces to data that could be checked.

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
