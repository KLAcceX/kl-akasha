#!/usr/bin/env node
// argos-ward: lists my open PRs and the PRs waiting for my review, oldest first,
// with the signals that say a PR needs action.
//
// Usage:
//   node ward.mjs [extra search qualifiers...] [--json]
//   node ward.mjs org:my-company --json
//   node ward.mjs --self-test
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

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

// Signals for a PR I authored. Empty list = nothing for me to do right now.
export function mySignals(pr, me) {
  const s = [];
  const last = pr.commits.nodes[0]?.commit;
  const lastPush = last?.committedDate ?? pr.createdAt;

  if (pr.reviewDecision === "CHANGES_REQUESTED") s.push("mudanças pedidas");
  const openThreads = pr.reviewThreads.nodes.filter(
    (t) => !t.isResolved && isOther(t.comments.nodes[0]?.author, me),
  ).length;
  if (openThreads) s.push(`${openThreads} thread(s) sem resposta`);
  const newReviews = pr.latestReviews.nodes.filter(
    (r) => isOther(r.author, me) && r.state === "COMMENTED" && r.submittedAt > lastPush,
  ).length;
  if (newReviews) s.push(`${newReviews} review(s) novo(s)`);
  if (isOther(pr.comments.nodes[0]?.author, me)) s.push("comentário sem resposta");
  if (["FAILURE", "ERROR"].includes(last?.statusCheckRollup?.state)) s.push("CI falhou");
  if (pr.mergeable === "CONFLICTING") s.push("conflito");
  if (!s.length && pr.reviewDecision === "APPROVED") s.push("aprovado: pronto pra merge");
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

function row(p) {
  const draft = p.isDraft ? " _(draft)_" : "";
  const title = p.title.replace(/\|/g, "\\|");
  return `| ${age(p.createdAt)} | [${p.repo}#${p.number}](${p.url}) ${title}${draft} | ${p.signals.join(", ") || "aguardando review"} |`;
}

function main(args) {
  const json = args.includes("--json");
  const extra = args.filter((a) => a !== "--json").join(" ");
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
    signals: kind === "mine" ? mySignals(pr, me) : [],
  });
  const mine = search(`is:pr is:open archived:false author:${me} ${extra}`).map(shape("mine")).sort(byAge);
  const toReview = search(`is:pr is:open archived:false review-requested:${me} ${extra}`)
    .map(shape("review"))
    .sort(byAge);

  if (json) return console.log(JSON.stringify({ me, mine, toReview }, null, 2));

  const head = "| Idade | PR | Sinais |\n|---|---|---|";
  const needs = mine.filter((p) => p.signals.length).length;
  console.log(`## Meus PRs abertos: ${mine.length} (${needs} pedem ação)\n`);
  console.log(mine.length ? [head, ...mine.map(row)].join("\n") : "_Nenhum._");
  console.log(`\n## Esperando minha revisão: ${toReview.length}\n`);
  console.log(toReview.length ? [head, ...toReview.map(row)].join("\n") : "_Nenhum._");
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

  assert.deepEqual(mySignals(pr({}), me), []);
  assert.deepEqual(mySignals(pr({ reviewDecision: "APPROVED" }), me), ["aprovado: pronto pra merge"]);
  assert.deepEqual(mySignals(pr({ reviewDecision: "CHANGES_REQUESTED" }), me), ["mudanças pedidas"]);
  // unresolved thread: counts only when someone else spoke last
  const thread = (login, isResolved = false) => ({ isResolved, comments: { nodes: [{ author: user(login) }] } });
  assert.deepEqual(mySignals(pr({ reviewThreads: { nodes: [thread("ana"), thread(me), thread("bia", true)] } }), me), [
    "1 thread(s) sem resposta",
  ]);
  // review comments only count after my last push
  const review = (submittedAt) => ({ state: "COMMENTED", submittedAt, author: user("ana") });
  assert.deepEqual(mySignals(pr({ latestReviews: { nodes: [review("2026-10-01T12:00:00Z")] } }), me), []);
  assert.deepEqual(mySignals(pr({ latestReviews: { nodes: [review("2026-10-03T00:00:00Z")] } }), me), ["1 review(s) novo(s)"]);
  // bots never count as someone waiting for me
  const bot = { login: "sonar[bot]", __typename: "Bot" };
  assert.deepEqual(mySignals(pr({ comments: { nodes: [{ author: bot }] } }), me), []);
  assert.deepEqual(mySignals(pr({ comments: { nodes: [{ author: user("ana") }] } }), me), ["comentário sem resposta"]);
  // CI and conflict block "ready to merge"
  const failing = { nodes: [{ commit: { committedDate: base.createdAt, statusCheckRollup: { state: "FAILURE" } } }] };
  assert.deepEqual(mySignals(pr({ reviewDecision: "APPROVED", commits: failing }), me), ["CI falhou"]);
  assert.deepEqual(mySignals(pr({ mergeable: "CONFLICTING" }), me), ["conflito"]);
  // no commits/checks yet must not throw
  assert.deepEqual(mySignals(pr({ commits: { nodes: [] } }), me), []);
  assert.equal(age("2026-10-01T00:00:00Z", Date.parse("2026-10-01T05:00:00Z")), "5h");
  assert.equal(age("2026-10-01T00:00:00Z", Date.parse("2026-10-04T01:00:00Z")), "3d");
  console.log("self-test ok");
}

const args = process.argv.slice(2);
args.includes("--self-test") ? selfTest() : main(args);
