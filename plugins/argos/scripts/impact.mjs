#!/usr/bin/env node
// Argos impact: whether review waits changed in a repo since Argos began commenting there, from what
// GitHub knows. Read only. Same repo, before against since, so teams are not blended; both sides count
// every PR, with a comment or not, since PRs with findings are slower by nature and comparing only those
// would blame Argos for them. It shows a change, never why: references/impact.md says how to read it.
//
// Usage:
//   node impact.mjs <owner/repo> [--since <YYYY-MM-DD>] [--all] [--json]
//     since: when it began, for a repo where it validated before it commented; default: its first
//     comment there, and with none only the baseline shows
//     all: also the account's own PRs and bots' PRs, left out because Argos does not comment on the
//     former and the latter merge by rule
//   node impact.mjs --self-test
// Env: ARGOS_STATE, as the other scripts.
import assert from "node:assert/strict";
import { isMain } from "./is-main.mjs";
import { asAccount, lines } from "./merge.mjs";
import { LINE_MARK, MARK } from "./publish.mjs";
import { read as readRepos, repoFromArg } from "./repos.mjs";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Each side as long as Argos has been there, within these: a shorter one is mostly noise, and a longer
// one measures the team's other changes too.
const MIN_DAYS = 30;
const MAX_DAYS = 90;
const LIMIT = 300;
const PAGE = 25;
// ponytail: below this a median moves with one PR; a guess, not a test. Add a real test if a decision hangs on it.
const ENOUGH = 20;
// Its own query: `gh pr list` with commits asks GitHub for more nodes than it allows.
const QUERY = `query($owner: String!, $name: String!, $after: String) { repository(owner: $owner, name: $name) { pullRequests(first: ${PAGE}, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
  pageInfo { hasNextPage endCursor }
  nodes { number title createdAt mergedAt isDraft author { __typename login }
    comments(first: 100) { nodes { createdAt body author { __typename login } } }
    reviews(first: 100) { nodes { submittedAt body author { __typename login } } }
    commits(last: 100) { nodes { commit { committedDate authors(first: 5) { nodes { user { login } } } } } } } } } }`;
// Only what tells Argos apart: the rest of a long thread would only fill the pipe.
const SHAPE = '.data.repository.pullRequests | (.nodes[].comments.nodes[].body, .nodes[].reviews.nodes[].body) |= (if contains("Argos") or contains("argos") then . else "" end)';
// A deleted account has no author, and nobody can wait on it.
const isBot = (a) => !a || a.__typename === "Bot" || /\[bot\]$/.test(a.login);
const isArgos = (e) => e.body?.includes(MARK) || e.body?.includes("<sub>Argos · AI");
const hours = (from, to) => Math.max(0, new Date(to) - new Date(from)) / HOUR;

// One PR, as QUERY gives it.
export function measure(pr, me) {
  const author = pr.author?.login;
  const events = [
    ...(pr.comments?.nodes ?? []).map((c) => ({ at: c.createdAt, who: c.author, body: c.body })),
    ...(pr.reviews?.nodes ?? []).filter((r) => r.submittedAt).map((r) => ({ at: r.submittedAt, who: r.author, body: r.body })),
  ]
    .filter((e) => !isBot(e.who) && e.who.login !== author)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const first = events[0];
  const human = events.find((e) => !isArgos(e));
  const argos = events.find(isArgos);
  const commits = (pr.commits?.nodes ?? []).map((n) => n.commit);
  return {
    number: pr.number,
    createdAt: pr.createdAt,
    argosAt: argos?.at ?? null,
    firstFeedback: first ? hours(pr.createdAt, first.at) : null,
    firstHuman: human ? hours(pr.createdAt, human.at) : null,
    toMerge: pr.mergedAt ? hours(pr.createdAt, pr.mergedAt) : null,
    commitsAfter: first ? commits.filter((c) => new Date(c.committedDate) > new Date(first.at)).length : null,
    // GitHub adds whoever suggested as an author of the commit that applies it
    applied: argos && author !== me ? commits.filter((c) => new Date(c.committedDate) > new Date(argos.at) && c.authors?.nodes.some((a) => a.user?.login === me)).length : 0,
    reverts: /^revert\b/i.test(pr.title ?? ""),
  };
}

export const counted = (pr, me, all) => !pr.isDraft && (all || (!isBot(pr.author) && pr.author?.login !== me));

export function quantile(xs, q) {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}
const round = (x) => (x === null ? null : Math.round(x * 10) / 10);
const stat = (xs) => ({ n: xs.length, median: round(quantile(xs, 0.5)), p75: round(quantile(xs, 0.75)) });
const known = (ms, key) => ms.map((m) => m[key]).filter((x) => x !== null);

export const summaryOf = (ms) => ({
  prs: ms.length,
  firstFeedback: stat(known(ms, "firstFeedback")),
  firstHuman: stat(known(ms, "firstHuman")),
  toMerge: stat(known(ms, "toMerge")),
  commitsAfter: stat(known(ms, "commitsAfter")),
  noFeedback: ms.filter((m) => m.firstFeedback === null).length,
  reverts: ms.filter((m) => m.reverts).length,
});

// Before and since, each side as long as the other: a PR opened earlier than that says nothing, and
// one opened before but commented on since, as the very first always is, belongs to neither.
export function compare(ms, since, now) {
  const began = since ?? ms.map((m) => m.argosAt).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] ?? null;
  const span = began ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.ceil((now - new Date(began)) / DAY))) : MAX_DAYS;
  const end = began ? new Date(began).getTime() : now;
  const before = ms.filter((m) => !m.argosAt && new Date(m.createdAt) < end && new Date(m.createdAt) >= end - span * DAY);
  const after = began ? ms.filter((m) => new Date(m.createdAt) >= end) : [];
  const a = summaryOf(before);
  const b = summaryOf(after);
  return { began, days: span, from: new Date(end - span * DAY).toISOString(), before: a, after: b, comparable: a.firstHuman.n >= ENOUGH && b.firstHuman.n >= ENOUGH };
}

// What came of the comments on lines: code moved under it, or someone answered. Neither proves it was right.
export function outcomeOf(comments) {
  const own = comments.filter((c) => c.body?.includes(LINE_MARK));
  const ids = new Set(own.map((c) => c.id));
  const answered = new Set(comments.filter((c) => ids.has(c.in_reply_to_id)).map((c) => c.in_reply_to_id));
  return { onLines: own.length, lineChanged: own.filter((c) => c.position === null).length, answered: answered.size };
}

function prsOf(run, repo) {
  const [owner, name] = repo.split("/");
  const prs = [];
  for (let after = null, more = true; more && prs.length < LIMIT; ) {
    const page = JSON.parse(run(["api", "graphql", "-f", `query=${QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`, ...(after ? ["-F", `after=${after}`] : []), "-q", SHAPE]));
    prs.push(...page.nodes);
    after = page.pageInfo.endCursor;
    more = page.pageInfo.hasNextPage;
  }
  return prs;
}

function impact(repo, { since, all }) {
  const run = asAccount(readRepos(), `https://github.com/${repo}/pull/0`);
  const me = run(["api", "user", "-q", ".login"]);
  const prs = prsOf(run, repo);
  const ms = prs.filter((pr) => counted(pr, me, all)).map((pr) => measure(pr, me));
  const result = compare(ms, since, Date.now());
  const withArgos = ms.filter((m) => m.argosAt);
  const outcome = { onLines: 0, lineChanged: 0, answered: 0, prs: withArgos.length, applied: withArgos.reduce((sum, m) => sum + m.applied, 0) };
  for (const m of withArgos) {
    const got = outcomeOf(lines(run(["api", "--paginate", `repos/${repo}/pulls/${m.number}/comments`, "-q", ".[] | {id, body, position, in_reply_to_id}"])));
    for (const k of ["onLines", "lineChanged", "answered"]) outcome[k] += got[k];
  }
  // the list comes newest first, so what it cut is the oldest: the baseline is short of PRs
  const cut = prs.length >= LIMIT && new Date(prs.at(-1).createdAt) > new Date(result.from);
  return { repo, ...result, outcome, cut };
}

function textOf(r) {
  const cell = (s) => (s.n ? `${s.median} h, p75 ${s.p75} h (n=${s.n})` : "none");
  const row = (name, key) => `${name}: before ${cell(r.before[key])} · since ${r.began ? cell(r.after[key]) : "-"}`;
  return [
    `${r.repo} · ${r.began ? `Argos began ${r.began.slice(0, 10)}, ${r.days} days each side` : `no Argos comment yet: baseline of the last ${r.days} days`} · ${r.before.prs} PRs before, ${r.after.prs} since`,
    row("First feedback", "firstFeedback"),
    row("First human feedback", "firstHuman"),
    row("To merge", "toMerge"),
    `Commits after feedback: before ${r.before.commitsAfter.median ?? "-"} · since ${r.after.commitsAfter.median ?? "-"}`,
    `No feedback yet: before ${r.before.noFeedback} · since ${r.after.noFeedback}`,
    `Reverts: before ${r.before.reverts} · since ${r.after.reverts}`,
    `Comments on lines: ${r.outcome.onLines} on ${r.outcome.prs} PRs · line changed after ${r.outcome.lineChanged} · answered ${r.outcome.answered} · suggestions applied ${r.outcome.applied}`,
    r.comparable ? "Enough PRs on both sides to compare. A change here is not proof of its cause." : `Too few to compare: it takes ${ENOUGH} PRs with human feedback on each side.`,
    ...(r.cut ? [`Only the last ${LIMIT} PRs were read, so the baseline is short.`] : []),
  ].join("\n");
}

function selfTest() {
  const at = (h) => new Date(Date.UTC(2026, 0, 1) + h * HOUR).toISOString();
  const commit = (h, ...who) => ({ commit: { committedDate: at(h), authors: { nodes: who.map((login) => ({ user: { login } })) } } });
  const argos = { author: { login: "me" }, createdAt: at(1), body: `found\n${MARK}abc -->` };
  const pr = {
    number: 7,
    title: "Add x",
    author: { login: "bia" },
    createdAt: at(0),
    mergedAt: at(20),
    comments: { nodes: [argos, { author: { login: "github-actions", __typename: "Bot" }, createdAt: at(0.1), body: "ci" }, { author: null, createdAt: at(0.15), body: "gone" }, { author: { login: "bia" }, createdAt: at(0.2), body: "self" }] },
    reviews: { nodes: [{ author: { login: "caio" }, submittedAt: at(10), body: "" }, { author: { login: "caio" }, submittedAt: null, body: "pending" }] },
    commits: { nodes: [commit(0, "bia"), commit(2, "bia", "me"), commit(12, "bia")] },
  };
  // a bot and the author are no feedback; Argos is feedback but not a human's
  const m = measure(pr, "me");
  assert.deepEqual([m.firstFeedback, m.firstHuman, m.toMerge, m.commitsAfter, m.applied, m.argosAt, m.reverts], [1, 10, 20, 2, 1, at(1), false]);
  // a review footer counts as Argos too, and a PR nobody spoke on waits
  assert.equal(measure({ ...pr, comments: { nodes: [] }, reviews: { nodes: [{ author: { login: "me" }, submittedAt: at(3), body: "<sub>Argos · AI validation of a</sub>" }] } }, "me").firstHuman, null);
  const quiet = measure({ number: 8, title: 'Revert "x"', author: { login: "bia" }, createdAt: at(0) }, "me");
  assert.deepEqual([quiet.firstFeedback, quiet.toMerge, quiet.commitsAfter, quiet.reverts], [null, null, null, true]);
  // only what Argos comments on, unless asked
  assert.equal(counted({ author: { login: "bia" } }, "me"), true);
  assert.equal(counted({ author: { login: "me" } }, "me"), false);
  assert.equal(counted({ author: { login: "dependabot", __typename: "Bot" } }, "me"), false);
  assert.equal(counted({ author: { login: "bia" }, isDraft: true }, "me"), false);
  assert.equal(counted({ author: { login: "me" } }, "me", true), true);
  // nearest rank: a real PR's value, never one in between
  assert.deepEqual([quantile([], 0.5), quantile([5], 0.5), quantile([4, 1, 3, 2], 0.5), quantile([4, 1, 3, 2], 0.75)], [null, 5, 2, 3]);
  // before and since, the same length, whatever is older stays out
  const day = (d, over = {}) => ({ createdAt: at(d * 24), argosAt: null, firstFeedback: 1, firstHuman: 2, toMerge: 3, commitsAfter: 0, reverts: false, ...over });
  const now = new Date(at(100 * 24)).getTime();
  const ms = [day(0), day(60), day(69, { firstHuman: null, firstFeedback: null }), day(70, { argosAt: at(70 * 24) }), day(95, { reverts: true })];
  const r = compare(ms, undefined, now);
  assert.deepEqual([r.began, r.days, r.before.prs, r.after.prs, r.before.noFeedback, r.after.reverts, r.comparable], [at(70 * 24), 30, 2, 2, 1, 1, false]);
  // the first comment fell on a PR opened earlier: it taints no side
  const first = compare([day(60), day(65, { argosAt: at(70 * 24) }), day(75)], undefined, now);
  assert.deepEqual([first.began, first.before.prs, first.after.prs], [at(70 * 24), 1, 1]);
  // a date given stands; no date and no comment is only the baseline
  assert.equal(compare(ms, at(50 * 24), now).after.prs, 4);
  const base = compare([day(95)], undefined, now);
  assert.deepEqual([base.began, base.before.prs, base.after.prs], [null, 1, 0]);
  // twenty a side is enough
  assert.equal(compare([...Array(20).fill(day(60)), ...Array(20).fill(day(75))], at(70 * 24), now).comparable, true);
  // a span has a floor and a ceiling
  assert.equal(compare(ms, at(99 * 24), now).days, 30);
  assert.equal(compare(ms, at(0), now).days, 90);
  // what came of the line comments: other people's comments and a second answer do not count again
  const own = `x\n${LINE_MARK}a -->`;
  assert.deepEqual(outcomeOf([{ id: 1, body: own, position: null }, { id: 2, body: own, position: 3 }, { id: 3, body: "no", in_reply_to_id: 1, position: 1 }, { id: 4, body: "no more", in_reply_to_id: 1, position: 1 }, { id: 5, body: "other", position: null }]), { onLines: 2, lineChanged: 1, answered: 1 });
  const text = textOf({ repo: "acme/web", ...base, outcome: { onLines: 0, lineChanged: 0, answered: 0, prs: 0, applied: 0 }, cut: false });
  assert.ok(text.includes("no Argos comment yet") && text.includes("Too few to compare"));
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();
  else {
    const flag = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
    const since = flag("since");
    const repo = args[0] && !args[0].startsWith("--") ? repoFromArg(args[0]) : null;
    if (!repo || (since !== undefined && Number.isNaN(new Date(since).getTime()))) {
      console.error("usage: impact.mjs <owner/repo> [--since <YYYY-MM-DD>] [--all] [--json] | --self-test");
      process.exit(1);
    }
    try {
      const out = impact(repo, { since, all: args.includes("--all") });
      console.log(args.includes("--json") ? JSON.stringify(out, null, 2) : textOf(out));
    } catch (err) {
      console.error(String(err.stderr ?? err.message ?? err).trim().split("\n")[0]);
      process.exit(1);
    }
  }
}
