#!/usr/bin/env node
// argos-ward: lists my open PRs and the PRs waiting for my review, oldest first,
// with the signals that say a PR needs action.
//
// Usage:
//   node ward.mjs [extra search qualifiers...] [--json] [--lang pt-BR|en]
//   node ward.mjs repo:acme/api repo:acme/web --lang en
//   node ward.mjs --self-test
// Signals are stable codes (see i18n.mjs); text output translates them.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { label, langArg, t } from "./i18n.mjs";

const QUERY = `
query($q: String!) {
  search(type: ISSUE, query: $q, first: 50) {
    issueCount
    nodes {
      ... on PullRequest {
        number title url isDraft createdAt updatedAt reviewDecision mergeable
        repository { nameWithOwner }
        author { login }
        commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
        reviewThreads(first: 50) { nodes { isResolved comments(last: 1) { nodes { author { login __typename } } } } }
        comments(last: 1) { nodes { createdAt author { login __typename } } }
        latestReviews(first: 20) { nodes { state submittedAt author { login __typename } } }
      }
    }
  }
}`;

const isBot = (a) => !a || a.__typename === "Bot" || /\[bot\]$/.test(a.login);
const isOther = (a, me) => a && !isBot(a) && a.login !== me;

// Google eng-practices: answer a review request within one business day.
// ponytail: 24 wall-clock hours, use business days if weekends cause false alarms.
const PICKUP_MS = 24 * 36e5;
const isLate = (pr, now) => now - Date.parse(pr.createdAt) > PICKUP_MS;

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
  // Pickup is where PRs wait longest: nobody has looked yet, so ping the reviewers.
  const anyReview = pr.latestReviews.nodes.some((r) => isOther(r.author, me));
  if (!s.length && !pr.isDraft && !anyReview && isLate(pr, now)) s.push("no_review");
  return s;
}

// Signals for a PR waiting for my review.
export const reviewSignals = (pr, now = Date.now()) => (isLate(pr, now) ? ["late"] : []);

// Signals for a teammate's PR nobody asked me to review: where a proactive look helps.
export function othersSignals(pr, now = Date.now()) {
  if (pr.isDraft) return [];
  const author = pr.author?.login;
  const s = [];
  if (pr.reviewDecision === "CHANGES_REQUESTED") s.push("changes_requested");
  if (["FAILURE", "ERROR"].includes(pr.commits.nodes[0]?.commit?.statusCheckRollup?.state)) s.push("ci_failed");
  if (pr.mergeable === "CONFLICTING") s.push("conflict");
  const anyReview = pr.latestReviews.nodes.some((r) => isOther(r.author, author));
  if (!anyReview && isLate(pr, now)) s.push("no_review");
  return s;
}

function search(q) {
  const out = execFileSync("gh", ["api", "graphql", "-f", `query=${QUERY}`, "-f", `q=${q}`], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const { search } = JSON.parse(out).data;
  // ponytail: first 50 per list only; paginate if someone really has 50+ open PRs.
  if (search.issueCount > 50) console.error(`aviso: ${search.issueCount} PRs, mostrando 50`);
  return search.nodes.filter((n) => n.url);
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
    author: pr.author?.login ?? "",
    signals: { mine: () => mySignals(pr, me), review: () => reviewSignals(pr), other: () => othersSignals(pr) }[kind](),
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
  assert.deepEqual(reviewSignals(pr({}), day1), []);
  assert.deepEqual(reviewSignals(pr({}), day3), ["late"]);
  // teammates' PRs: the author's own review never counts, drafts stay quiet
  const theirs = (over) => pr({ author: user("bia"), ...over });
  assert.deepEqual(othersSignals(theirs({}), day1), []);
  assert.deepEqual(othersSignals(theirs({}), day3), ["no_review"]);
  assert.deepEqual(othersSignals(theirs({ isDraft: true }), day3), []);
  const byAuthor = { nodes: [{ state: "COMMENTED", submittedAt: "2026-10-01T01:00:00Z", author: user("bia") }] };
  assert.deepEqual(othersSignals(theirs({ latestReviews: byAuthor }), day3), ["no_review"]);
  assert.deepEqual(othersSignals(theirs({ latestReviews: reviewed }), day3), []);
  assert.deepEqual(othersSignals(theirs({ reviewDecision: "CHANGES_REQUESTED", latestReviews: reviewed }), day3), ["changes_requested"]);

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
  // no commits/checks yet must not throw
  assert.deepEqual(mySignals(pr({ commits: { nodes: [] } }), me, day1), []);
  assert.equal(age("2026-10-01T00:00:00Z", Date.parse("2026-10-01T05:00:00Z")), "5h");
  assert.equal(age("2026-10-01T00:00:00Z", Date.parse("2026-10-04T01:00:00Z")), "3d");
  // codes read as words in either language; unknown languages fall back to pt-BR
  assert.equal(label("pt-BR", "threads:2"), "2 thread(s) sem resposta");
  assert.equal(label("en", "threads:2"), "2 unanswered thread(s)");
  assert.equal(label("en", "no_review"), "no review > 1 day");
  assert.equal(label("xx", "conflict"), "conflito");
  assert.equal(langArg(["repo:a/b", "--lang", "en"]), "en");
  assert.equal(langArg([]), "pt-BR");
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
