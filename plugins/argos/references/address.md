# Addressing review on the user's PR

Details for "Fix my PR" in mine.md. Why each step is shaped this way, with sources: [evidence-fix.md](evidence-fix.md).

## Contents

- Reading `feedback.mjs` output
- Classes and what to do
- Changing the code
- Drafting replies
- Fix CI and conflicts
- Posting, only after a yes

## Reading `feedback.mjs` output

`plan` is a list of `{file, items}`, files ordered by their most urgent item; `(conversation)` holds review summaries and top-level comments. Each item has:

| Field | Use |
|---|---|
| `class`, `was` | the triage below; `was` is the class before it became `already-addressed` |
| `labeled`, `label` | `labeled: false` means the class came from wording heuristics: read `ask` yourself and reclassify if the script guessed wrong |
| `path`, `line`, `startLine`, `outdated` | where to look; `outdated` means the code under the thread already changed |
| `ask`, `last` | the request, and the latest replies in the thread |
| `answered`, `pushedAfter`, `resolved` | whether the author already replied, pushed after it, or the thread is closed |
| `id` | thread or comment node id, needed to reply or resolve |

Top level: `branch`, `base`, `headSha`, `reviewDecision`, `mergeable`, `ci.failing` (name, state, url), `reviewers` (latest state per reviewer).

## Classes and what to do

| Class | Default action | Notes |
|---|---|---|
| `blocking` | change code | Changes requested, `issue`/`todo`/`chore`, `(blocking)`, strong wording, or any unlabeled comment from a reviewer who requested changes. If you think it is wrong, push back with facts; do not change code you believe is right. |
| `question` | reply | If the question shows the code is unclear, clarify the code (rename, comment) and say so in the reply. |
| `suggestion` | change code or push back | Take it when it is cheap and better. A GitHub suggestion block is the literal replacement for `startLine..line`. Otherwise reply with the trade-off. |
| `nit` | change code | If trivial. Never argue over a nit. |
| `fyi`, `praise` | reply | A short acknowledgement; no code change. |
| `already-addressed` | none | Mention it in the plan only if `answered` is false (the reviewer still deserves a "done in abc123"). |

Out-of-scope requests: offer a follow-up issue instead of growing the PR, and say so in the reply. Do not promise "I'll clean it up later" for complexity this PR adds.

## Changing the code

1. Find the clone: `node scripts/repos.mjs list --json` gives `{repo, path}`. No clone: show the changes as diffs in chat and offer to clone; do not clone on your own.
2. `git -C <path> status --porcelain`. Uncommitted work there is the user's: stop and tell them, never stash or discard it.
3. Get on the PR branch, current with the remote: `git -C <path> fetch origin <branch>`, then `git switch <branch>` and `git pull --ff-only`. A branch that cannot fast-forward means someone pushed elsewhere: stop and say so.
4. One commit per concern, in the project's commit style (rules.mjs, then `git log --oneline -15` on the base). Fixes only: no reformatting or drive-by refactors in the same commit. If the project squashes on merge, `git commit --fixup=<sha>` is fine.
5. Run the project's own checks that cover the change (test, lint, type check) before calling it done. Say which ones you ran.

## Drafting replies

One reply per thread or comment, in the language the reviewer used, short, specific:

- Changed: what changed and the commit, e.g. "Done in `abc1234`: empty carts now return 0."
- Not changed: the reason and the trade-off, then ask which trade-off they weigh differently.
- Question: the answer; if code changed because of it, the commit.
- Out of scope: the follow-up issue you propose (created only on a yes).

Show the drafts as a table: where (`file:line` or "conversation"), reviewer, reply. Never resolve a reviewer's thread by default; GitHub lets the author do it, but the convention is that the reviewer resolves what they opened unless the project says otherwise.

## Fix CI and conflicts

- **CI:** `gh pr checks <n> -R <repo>` lists checks. For a GitHub Actions run, `gh run view <run-id> -R <repo> --log-failed` shows the failing step (the run id is in the check `url`). Reproduce locally with the project's command, fix, commit. A flaky check is a reply or a re-run the user decides on, not a code change.
- **Conflict:** update from the base the way the project prefers (merge `origin/<base>` by default; rebase only if CONTRIBUTING asks). Rebasing rewrites commits a reviewer saw and needs a force push: ask before that.

## Posting, only after a yes

Use the account that owns the repo: prefix each command with `GH_TOKEN=$(gh auth token -u <login>)`. Post exactly what the user saw, as they edited it.

| Step | Command |
|---|---|
| Push | `git -C <path> push` (never `--force`; `--force-with-lease` only after an explicit yes for a rebase) |
| Reply in a thread | `gh api graphql -f query='mutation($t:ID!,$b:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$t,body:$b}){comment{url}}}' -f t=<thread id> -F b=@reply.md` |
| Reply in the conversation | `gh pr comment <n> -R <repo> --body-file reply.md` |
| Resolve a thread (only if asked) | `gh api graphql -f query='mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}' -f t=<thread id>` |
| Re-request review, once, after all threads are answered | `gh api -X POST repos/<owner>/<repo>/pulls/<n>/requested_reviewers -f 'reviewers[]=<login>'` |

Push before replying, so "done in `abc1234`" points at a commit the reviewer can open.
