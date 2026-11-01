# Validate PRs in a batch

A validation is a quick AI pass over one PR that leaves a **verdict** on its row in the pane: passed, or how many issues and the top one. It reads; it never comments, approves or pushes. Many PRs go in one request ("Validate these PRs with Argos…"), and the pane may start one by itself when auto-validate is on.

## 1. Mark them as running

Before reading anything, from this skill's directory, with every PR of the request:

```bash
node scripts/verdicts.mjs start <pr-url> <pr-url> ...
```

The pane shows them as validating and counts the batch ("Validating 9 of 22").

## 2. Validate each PR

For each PR, with the account that owns its repo (`node scripts/repos.mjs list --json` names it; `GH_TOKEN=$(gh auth token -u <login>)` for that command only):

1. **Facts:** `gh pr view <url> --json headRefOid,title,body,baseRefName,files` and `gh pr diff <url>`. Keep `headRefOid`: the verdict belongs to that commit.
2. **Rules:** `node scripts/rules.mjs <owner/repo> --ref <baseRefName> --account <login> --json`; the project's rules lead, as in `references/review.md` section 3.
3. **Lessons:** for the user's own PRs, what reviewers keep asking in that repo (`references/lessons.md`).
4. **Check** at the quick level of `references/review-levels.md`: correctness of the change, the project's rules, missing tests for changed behaviour, and the lessons. An issue is something a reviewer would block or ask to change; style the project does not require is not one.

Keep one PR's work short: this is a triage, not the full review of `references/review.md`. A PR too big to read in a few minutes gets a verdict on what was read, and the finding says so.

## 3. Record the verdict

Right after each PR, so the pane fills in as you go:

```bash
node scripts/verdicts.mjs set <pr-url> --sha <headRefOid> --issues <n> --finding "<the top issue, one line>"
```

- `--issues 0` and no finding when it passed.
- The finding is the most serious issue in under 80 characters, with `path:line` when it fits: `Retry loop has no backoff cap (queue.ts:42)`.
- A PR you could not read (no access, closed) gets no verdict; say so in the report.

## 4. Report

One short table in the user's language: PR, verdict, top finding. Then the next step the pane offers: **Fix issues** on the user's PRs, **Draft review** on the others'. Nothing is posted without the user's yes.

## Auto-validate

`node scripts/verdicts.mjs auto <off|mine|all>` sets it; the pane's own picker does the same. When a round finds new commits on a PR whose verdict is now old (only the user's PRs with `mine`, every watched PR with `all`), the mod starts a subagent with this job for them, at most ten at a time. It costs tokens without asking, so it is off until the user turns it on.
