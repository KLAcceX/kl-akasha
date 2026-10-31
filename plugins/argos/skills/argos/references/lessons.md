# Lessons

What reviewers keep asking on the user's PRs, learned once per repo and checked before the next review. Every repeat ask a PR avoids is one review round less, and rounds are what keep a PR open.

Lessons are personal: one file per repo in `~/.claude/kl-akasha/argos/lessons/<owner>/<repo>.md`, never in the repo, never posted.

## Learn

1. **Gather.** From this skill's directory:

   ```bash
   node scripts/lessons.mjs <owner/repo> --account <login> [--since <date>] [--limit 20]
   ```

   It reads the user's latest merged PRs in the repo and lists every human ask: what it was before being addressed (blocking, question, suggestion, nit), who asked and where. It also counts them by class, by reviewer and by folder. Bots and praise are left out. With a lessons file already there, pass `--since` with its "Read up to" date, so only new PRs are read.

2. **Group.** Read the asks and find what repeats: the same ask on two or more PRs, or from the same reviewer twice. Group by meaning, not by words: "missing a test for X" and "isso precisa de teste" are one lesson.

   Write each lesson so it can be checked against a diff. "Every new branch in `src/cart/` gets a unit test" works; "write better tests" cannot be checked.

   A single ask is not a lesson yet, unless it was a blocker about a rule of the project (cite the rule).

3. **Write the file.** Merge with what is there. Raise the counts of lessons that came back, add the new ones, and keep the old ones. Lessons are paraphrased; never copy a reviewer's words, which stay on GitHub.

   ```markdown
   # Lessons: acme/shop
   Read up to: 2026-10-31 (20 merged PRs)

   | Lesson | Asked | By | Where | Last seen |
   |---|---|---|---|---|
   | Every new branch in cart code gets a unit test | 4× in 3 PRs (#12, #15, #19) | @ana | src/cart/ | 2026-10-20 |
   | Error messages go through `t()`, never a literal | 2× in 2 PRs (#15, #21) | @bia | src/ui/ | 2026-10-28 |
   ```

4. **Tell the user** in a few lines:
   - the lessons, top ones first;
   - which reviewer asks for what;
   - where the file is.

## Check before review

When the user is about to open a PR or ask for review ("meu PR tá pronto?", "posso pedir review?"), or asks to check one:

1. Read the repo's lessons file. Without one, offer to learn first (it takes seconds).
2. Get the diff:
   - in the local clone, `git diff <base>...HEAD`;
   - without a clone, `gh pr diff <n> -R <repo>`.
3. Check every lesson against the diff, then the project's own rules (`node scripts/rules.mjs <owner/repo> --ref <base> --json`, mainly the PR template's checklist).
4. Report one row per lesson that applies:

   | Lesson | Status | Where |
   |---|---|---|
   | … | kept, needs a look, or does not apply | `file:line` |

   Then one line: ready for review, or what to fix first.
5. Fix only on a yes, the way Job 2 of `references/mine.md` changes code: small commits in the project's style, nothing pushed without a yes.

## Keep it fresh

Offer once to refresh a repo's lessons:
- after a Job 2 on one of its PRs;
- when its file's "Read up to" is more than two weeks old.

Refreshing only reads PRs merged since that date.
