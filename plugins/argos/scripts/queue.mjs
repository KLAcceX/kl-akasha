#!/usr/bin/env node
// Argos queue: lists my open PRs and the PRs waiting for my review, oldest first,
// with the signals that say a PR needs action.
//
// Usage:
//   node queue.mjs [extra search qualifiers...] [--json] [--lang pt-BR|en]
//   node queue.mjs repo:acme/api repo:acme/web --lang en
//   node queue.mjs --self-test
// Signals are stable codes (see i18n.mjs); text output translates them.
import { UPKEEP } from "./upkeep.mjs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { label, langArg, t } from "./i18n.mjs";

const QUERY = `
query($q: String!, $after: String) {
  search(type: ISSUE, query: $q, first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url isDraft createdAt updatedAt reviewDecision mergeable additions deletions headRefOid
        repository { nameWithOwner }
        author { login __typename avatarUrl(size: 16) }
        files(first: 50) { nodes { path } }
        reviewRequests { totalCount }
        labels(first: 10) { nodes { name color } }
        commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
        reviewThreads(first: 50) { nodes { isResolved comments(last: 1) { nodes { author { login __typename } } } } }
        comments(last: 1) { nodes { createdAt author { login __typename } } }
        latestReviews(first: 20) { nodes { state submittedAt author { login __typename } } }
        timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 10) {
          nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } } }
        }
      }
    }
  }
}`;

const isBot = (a) => !a || a.__typename === "Bot" || /\[bot\]$/.test(a.login);
const isOther = (a, me) => a && !isBot(a) && a.login !== me;
// A machine account: a GitHub App, or a user account named as one (snyk-bot is a plain user).
export const isMachine = (a) => Boolean(a) && (isBot(a) || /(^|[-_.])bot$/i.test(a.login));
// A machine that writes code is a coding agent (Copilot, Devin...); one that only touches
// upkeep files is an update bot (Dependabot, Snyk, Renovate). Read from the PR, not from a list.
export const isAI = (a, files = []) => isMachine(a) && files.some((f) => !UPKEEP.test(f));
// The last commit's checks as pass, fail or pending; none when the repo runs no checks.
const paths = (pr) => (pr.files?.nodes ?? []).map((f) => f.path);
export const ci = (state) =>
  ({ SUCCESS: "pass", FAILURE: "fail", ERROR: "fail", PENDING: "pending", EXPECTED: "pending" })[state] ?? undefined;
// Nobody was asked to review and nobody did: the PR has no owner on the other side.
// Unknown (no reviewRequests in the answer) never counts.
const noOwner = (pr, author) =>
  !pr.isDraft && pr.reviewRequests?.totalCount === 0 && !pr.latestReviews.nodes.some((r) => isOther(r.author, author));

// Google eng-practices: answer a review request within one business day.
// ponytail: 24 wall-clock hours, use business days if weekends cause false alarms.
const PICKUP_MS = 24 * 36e5;
const isLate = (since, now) => now - Date.parse(since) > PICKUP_MS;

// When I was asked to review, so a PR opened long ago and handed to me today is not late
// yet. A team request counts as mine; with no event left, the PR's own age.
export const askedAt = (pr, me) =>
  (pr.timelineItems?.nodes ?? []).filter((e) => e.createdAt && [me, undefined].includes(e.requestedReviewer?.login)).at(-1)
    ?.createdAt ?? pr.createdAt;

// Signals for a PR I authored. Empty list = nothing for me to do right now.
export function mySignals(pr, me, now = Date.now()) {
  const s = [];
  const last = pr.commits.nodes[0]?.commit;
  const lastPush = last?.committedDate ?? pr.createdAt;

  if (pr.reviewDecision === "CHANGES_REQUESTED") s.push("changes_requested");
  const openThreads = pr.reviewThreads.nodes.filter(
    (t) => !t.isResolved && isOther(t.comments.nodes[0]?.author, me),
  ).length;
  if (openThreads) s.push(`threads:${openThreads}`);
  const newReviews = pr.latestReviews.nodes.filter(
    (r) => isOther(r.author, me) && r.state === "COMMENTED" && r.submittedAt > lastPush,
  ).length;
  if (newReviews) s.push(`new_reviews:${newReviews}`);
  if (isOther(pr.comments.nodes[0]?.author, me)) s.push("unanswered");
  if (["FAILURE", "ERROR"].includes(last?.statusCheckRollup?.state)) s.push("ci_failed");
  if (pr.mergeable === "CONFLICTING") s.push("conflict");
  if (!s.length && pr.reviewDecision === "APPROVED") s.push("ready");
  // Pickup is where PRs wait longest: nobody asked means nobody will look; asked and a day
  // without a review means ping the reviewers.
  const anyReview = pr.latestReviews.nodes.some((r) => isOther(r.author, me));
  if (!s.length && noOwner(pr, me)) s.push("no_owner");
  else if (!s.length && !pr.isDraft && !anyReview && isLate(pr.createdAt, now)) s.push("no_review");
  return s;
}

// My last review is older than the last push: the PR changed and needs another look.
// ponytail: committedDate is the author's clock; use the push event if rebases cause false alarms.
const changedSince = (pr, me) => {
  const mine = pr.latestReviews.nodes.find((r) => r.author?.login === me);
  const pushed = pr.commits.nodes[0]?.commit?.committedDate;
  return Boolean(mine && pushed && pushed > mine.submittedAt);
};

// Signals for a PR waiting for my review.
export const reviewSignals = (pr, me, now = Date.now()) => [
  ...(changedSince(pr, me) ? ["changed"] : []),
  ...(isLate(askedAt(pr, me), now) ? ["late"] : []),
];

// Signals for a teammate's PR nobody asked me to review: where a proactive look helps.
export function othersSignals(pr, me, now = Date.now()) {
  if (pr.isDraft) return [];
  const author = pr.author?.login;
  const s = [];
  if (changedSince(pr, me)) s.push("changed");
  if (pr.reviewDecision === "CHANGES_REQUESTED") s.push("changes_requested");
  if (["FAILURE", "ERROR"].includes(pr.commits.nodes[0]?.commit?.statusCheckRollup?.state)) s.push("ci_failed");
  if (pr.mergeable === "CONFLICTING") s.push("conflict");
  const anyReview = pr.latestReviews.nodes.some((r) => isOther(r.author, author));
  if (noOwner(pr, author)) s.push("no_owner");
  else if (!anyReview && isLate(pr.createdAt, now)) s.push("no_review");
  return s;
}

// Every page of the search (GitHub stops at 1000 results), so many connected repos with
// many PRs each are all listed.
function search(q) {
  const nodes = [];
  let after;
  do {
    const out = execFileSync("gh", ["api", "graphql", "-f", `query=${QUERY}`, "-f", `q=${q}`, ...(after ? ["-f", `after=${after}`] : [])], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const { search } = JSON.parse(out).data;
    nodes.push(...search.nodes.filter((n) => n.url));
    after = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : undefined;
  } while (after);
  return nodes;
}

const age = (iso, now = Date.now()) => {
  const h = Math.floor((now - Date.parse(iso)) / 36e5);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};
const byAge = (a, b) => a.createdAt.localeCompare(b.createdAt);

function row(p, lang) {
  const draft = p.isDraft ? " _(draft)_" : "";
  const title = p.title.replace(/\|/g, "\\|");
  const by = p.kind === "other" ? ` · @${p.author}` : "";
  const signals = p.signals.map((c) => label(lang, c)).join(", ") || t(lang, `idle_${p.kind}`);
  return `| ${age(p.createdAt)} | [${p.repo}#${p.number}](${p.url}) ${title}${draft}${by} | ${signals} |`;
}

function main(args) {
  const json = args.includes("--json");
  const lang = langArg(args);
  const l = args.indexOf("--lang");
  const extra = args.filter((a, i) => a !== "--json" && (l < 0 || (i !== l && i !== l + 1))).join(" ");
  const me = JSON.parse(execFileSync("gh", ["api", "user"], { encoding: "utf8" })).login;

  const shape = (kind) => (pr) => ({
    kind,
    repo: pr.repository.nameWithOwner,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    isDraft: pr.isDraft,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    // how long it has waited on whoever holds it: my review since I was asked, else since it opened
    since: kind === "review" ? askedAt(pr, me) : pr.createdAt,
    // lines changed: review quality drops past about 400
    size: (pr.additions ?? 0) + (pr.deletions ?? 0),
    isAI: isAI(pr.author, paths(pr)),
    // an update bot (Dependabot, Snyk, Renovate): what the pane lets the person leave out in bulk
    isBot: isMachine(pr.author) && !isAI(pr.author, paths(pr)),
    // the author's picture, drawn by the round as a vector mosaic
    avatarUrl: pr.author?.avatarUrl,
    // the head commit: a verdict made on another one is out of date
    sha: pr.headRefOid,
    labels: (pr.labels?.nodes ?? []).map((l) => ({ name: l.name, color: l.color })),
    ci: ci(pr.commits.nodes[0]?.commit?.statusCheckRollup?.state),
    author: pr.author?.login ?? "",
    // someone else's PR I already left a review on: the pane counts what is left to look at
    reviewed: kind !== "mine" && pr.latestReviews.nodes.some((r) => r.author?.login === me),
    signals: { mine: () => mySignals(pr, me), review: () => reviewSignals(pr, me), other: () => othersSignals(pr, me) }[kind](),
  });
  const mine = search(`is:pr is:open archived:false author:${me} ${extra}`).map(shape("mine")).sort(byAge);
  const toReview = search(`is:pr is:open archived:false review-requested:${me} ${extra}`)
    .map(shape("review"))
    .sort(byAge);
  // Teammates' PRs only make sense inside named repos (repo: qualifiers), never all of GitHub.
  const asked = new Set(toReview.map((p) => p.url));
  const others = /\brepo:/.test(extra)
    ? search(`is:pr is:open archived:false -author:${me} ${extra}`)
        .map(shape("other"))
        .filter((p) => !asked.has(p.url))
        .sort(byAge)
    : [];

  if (json) return console.log(JSON.stringify({ me, mine, toReview, others }, null, 2));

  const head = `| ${t(lang, "col_age")} | PR | ${t(lang, "col_signals")} |\n|---|---|---|`;
  const table = (list) => (list.length ? [head, ...list.map((p) => row(p, lang))].join("\n") : `_${t(lang, "none")}_`);
  const needs = mine.filter((p) => p.signals.length).length;
  console.log(`## ${t(lang, "h_mine", mine.length, needs)}\n`);
  console.log(table(mine));
  console.log(`\n## ${t(lang, "h_review", toReview.length)}\n`);
  console.log(table(toReview));
  if (!/\brepo:/.test(extra)) return;
  console.log(`\n## ${t(lang, "h_others", others.length)}\n`);
  console.log(table(others));
}

function selfTest() {
  const me = "me";
  const user = (login) => ({ login, __typename: "User" });
  const base = {
    createdAt: "2026-10-01T00:00:00Z",
    reviewDecision: null,
    mergeable: "MERGEABLE",
    commits: { nodes: [{ commit: { committedDate: "2026-10-02T00:00:00Z", statusCheckRollup: { state: "SUCCESS" } } }] },
    reviewThreads: { nodes: [] },
    comments: { nodes: [] },
    latestReviews: { nodes: [] },
  };
  const pr = (over) => ({ ...base, ...over });
  const day1 = Date.parse("2026-10-01T12:00:00Z");
  const day3 = Date.parse("2026-10-03T12:00:00Z");

  // pickup: nobody reviewed for more than a day
  assert.deepEqual(mySignals(pr({}), me, day1), []);
  assert.deepEqual(mySignals(pr({}), me, day3), ["no_review"]);
  assert.deepEqual(mySignals(pr({ isDraft: true }), me, day3), []);
  const reviewed = { nodes: [{ state: "APPROVED", submittedAt: "2026-10-01T01:00:00Z", author: user("ana") }] };
  assert.deepEqual(mySignals(pr({ latestReviews: reviewed }), me, day3), []);
  assert.deepEqual(reviewSignals(pr({}), me, day1), []);
  assert.deepEqual(reviewSignals(pr({}), me, day3), ["late"]);
  // teammates' PRs: the author's own review never counts, drafts stay quiet
  const theirs = (over) => pr({ author: user("bia"), ...over });
  assert.deepEqual(othersSignals(theirs({}), me, day1), []);
  assert.deepEqual(othersSignals(theirs({}), me, day3), ["no_review"]);
  assert.deepEqual(othersSignals(theirs({ isDraft: true }), me, day3), []);
  const byAuthor = { nodes: [{ state: "COMMENTED", submittedAt: "2026-10-01T01:00:00Z", author: user("bia") }] };
  assert.deepEqual(othersSignals(theirs({ latestReviews: byAuthor }), me, day3), ["no_review"]);
  assert.deepEqual(othersSignals(theirs({ latestReviews: reviewed }), me, day3), []);
  assert.deepEqual(othersSignals(theirs({ reviewDecision: "CHANGES_REQUESTED", latestReviews: reviewed }), me, day3), ["changes_requested"]);
  // a push after my review asks for another look; one before it does not
  const myReview = (submittedAt) => ({ nodes: [{ state: "COMMENTED", submittedAt, author: user(me) }] });
  assert.deepEqual(othersSignals(theirs({ latestReviews: myReview("2026-10-01T06:00:00Z") }), me, day1), ["changed"]);
  assert.deepEqual(othersSignals(theirs({ latestReviews: myReview("2026-10-02T06:00:00Z") }), me, day1), []);
  assert.deepEqual(reviewSignals(pr({ latestReviews: myReview("2026-10-01T06:00:00Z") }), me, day3), ["changed", "late"]);
  // late counts from my review request (a team request too), not from when the PR opened
  const asked = (login, createdAt) => ({ createdAt, requestedReviewer: login ? { login } : {} });
  assert.deepEqual(reviewSignals(pr({ timelineItems: { nodes: [asked(me, "2026-10-03T06:00:00Z")] } }), me, day3), []);
  assert.deepEqual(reviewSignals(pr({ timelineItems: { nodes: [asked(null, "2026-10-03T06:00:00Z")] } }), me, day3), []);
  assert.deepEqual(reviewSignals(pr({ timelineItems: { nodes: [asked("ana", "2026-10-03T06:00:00Z")] } }), me, day3), ["late"]);

  assert.deepEqual(mySignals(pr({}), me, day1), []);
  assert.deepEqual(mySignals(pr({ reviewDecision: "APPROVED" }), me, day1), ["ready"]);
  assert.deepEqual(mySignals(pr({ reviewDecision: "CHANGES_REQUESTED" }), me, day1), ["changes_requested"]);
  // unresolved thread: counts only when someone else spoke last
  const thread = (login, isResolved = false) => ({ isResolved, comments: { nodes: [{ author: user(login) }] } });
  assert.deepEqual(mySignals(pr({ reviewThreads: { nodes: [thread("ana"), thread(me), thread("bia", true)] } }), me, day1), [
    "threads:1",
  ]);
  // review comments only count after my last push
  const review = (submittedAt) => ({ state: "COMMENTED", submittedAt, author: user("ana") });
  assert.deepEqual(mySignals(pr({ latestReviews: { nodes: [review("2026-10-01T12:00:00Z")] } }), me, day1), []);
  assert.deepEqual(mySignals(pr({ latestReviews: { nodes: [review("2026-10-03T00:00:00Z")] } }), me, day1), ["new_reviews:1"]);
  // bots never count as someone waiting for me
  const bot = { login: "sonar[bot]", __typename: "Bot" };
  assert.deepEqual(mySignals(pr({ comments: { nodes: [{ author: bot }] } }), me, day1), []);
  assert.deepEqual(mySignals(pr({ comments: { nodes: [{ author: user("ana") }] } }), me, day1), ["unanswered"]);
  // CI and conflict block "ready to merge"
  const failing = { nodes: [{ commit: { committedDate: base.createdAt, statusCheckRollup: { state: "FAILURE" } } }] };
  assert.deepEqual(mySignals(pr({ reviewDecision: "APPROVED", commits: failing }), me, day1), ["ci_failed"]);
  assert.deepEqual(mySignals(pr({ mergeable: "CONFLICTING" }), me, day1), ["conflict"]);
  // nobody asked to review: no_owner at once; asked, no review for a day: no_review
  const asks = (n) => ({ reviewRequests: { totalCount: n } });
  assert.deepEqual(mySignals(pr(asks(0)), me, day1), ["no_owner"]);
  assert.deepEqual(mySignals(pr(asks(1)), me, day3), ["no_review"]);
  assert.deepEqual(mySignals(pr({ ...asks(0), isDraft: true }), me, day3), []);
  assert.deepEqual(mySignals(pr({ ...asks(0), latestReviews: reviewed }), me, day3), []);
  assert.deepEqual(othersSignals(theirs(asks(0)), me, day1), ["no_owner"]);
  // a machine writing code is an agent, one bumping versions an update bot, whatever its name
  const code = ["src/app.ts", "package.json"];
  const bump = ["package.json", "package-lock.json", ".github/workflows/ci.yml"];
  assert.equal(isAI({ login: "Copilot", __typename: "Bot" }, code), true);
  assert.equal(isAI({ login: "some-new-agent[bot]" }, code), true);
  assert.equal(isAI({ login: "dependabot[bot]" }, bump), false);
  assert.equal(isAI({ login: "snyk-bot", __typename: "User" }, ["requirements.txt"]), false);
  assert.equal(isMachine({ login: "snyk-bot", __typename: "User" }), true);
  assert.equal(isMachine({ login: "abbot", __typename: "User" }), false);
  assert.equal(isAI(user("ana"), code), false);
  // no commits/checks yet must not throw
  assert.deepEqual(mySignals(pr({ commits: { nodes: [] } }), me, day1), []);
  assert.equal(age("2026-10-01T00:00:00Z", Date.parse("2026-10-01T05:00:00Z")), "5h");
  assert.equal(age("2026-10-01T00:00:00Z", Date.parse("2026-10-04T01:00:00Z")), "3d");
  // codes read as words in either language; unknown languages fall back to en
  assert.equal(label("pt-BR", "threads:2"), "2 threads sem resposta");
  assert.equal(label("en", "threads:2"), "2 unanswered threads");
  assert.equal(label("en", "no_review"), "no review > 1 day");
  assert.equal(label("xx", "conflict"), "conflict");
  assert.equal(langArg(["repo:a/b", "--lang", "en"]), "en");
  assert.equal(langArg([]), "en");
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
