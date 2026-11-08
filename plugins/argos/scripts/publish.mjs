#!/usr/bin/env node
// Argos publish: leaves a PR what its last validation found, as the account that owns the repo: a brief
// first, the detail of each finding on its line, a list last. The person sends it from the pane, having
// read it, or turns it on per repo (`repos.mjs publish <repo> on`). The mod runs this, never the agent
// that validated: the validation stays read-only, and the report it wrote read the PR's own text, so it
// is treated as untrusted here.
//
// The rule, all of it:
//   - the verdict found something (a blocker or something to look at) and carries its report; a pass
//     posts nothing
//   - it is someone else's PR: the person fixes their own, nobody needs to be told
//   - the verdict is on the head commit, the PR is open and not a draft
//   - the PR was not left to humans
//   - the report holds no secret shape: a comment is public, and rotating a key is the author's job
//   - what goes, in GitHub's order, which is the order of creation; an edit does not move anything:
//       the brief, in the body of the first review: what was found, and the one whole "it can be wrong"
//       a thread on each finding with a line in the diff, once, in a review that only comments: it can
//         carry a suggestion to apply, and is signed, since the Files tab shows it alone
//       the list, in a comment: kind and place of each, a place with a thread leading to it
//   - a new commit edits the brief and the list where they stand, so five pushes are not five of each,
//     and adds only the new threads, in a review with no body. New threads would land below the list,
//     so then the list goes again after them: it stays the last thing, and those threads notify anyway.
//     A finding gone from the report keeps its old thread: GitHub marks it outdated once the line changes.
//     ponytail: an edit may notify nobody (GitHub's docs do not say), so new findings with no line can go unnoticed unless the author
//     looks; post anew on a higher blocker count if that bites
//   - a line that does not show the code its title starts from gets no thread: the finding goes in the brief, by file
//   - nothing to put on a line, or a comment there before this format: the one comment holds it all
//   - a pass turns the brief into "no findings" and takes the list away
//   - GitHub is asked through a marker in the brief and the list, only in the account's own, so a lost
//     record or a second press never posts twice and nobody else's text can stop a post. The list goes
//     last and says the work is done: a failure before it loses nothing, the next try finds what is on
//     the lines by their markers.
// Mentions, images and HTML comments are defused, so a report talked into them pings nobody, loads
// nothing and fakes no marker. A suggestion is code in a fence, inert, and applied as it is, so it is
// left alone.
//
// Usage:
//   node publish.mjs <pr-url>...       those PRs, from the pane's button
//   node publish.mjs sweep             every verdict with no outcome yet, in repos with auto-publish on
//   node publish.mjs preview <pr-url>  prints what would go, as JSON, and posts nothing
//   node publish.mjs --self-test
// Each outcome lands on the verdict (published: { state: posted | skipped | failed, why, sha, at }) and
// prints as JSON. A skip stands until the next validation; a failure (the network, say) goes again.
// Env: ARGOS_STATE, as the other scripts.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { briefOf, fenceOf, fits, footerOf, inlineOf, keyOf, langOf, listOf, noneOf, placed, signOf } from "./findings.mjs";
import { hasSecret } from "./gate.mjs";
import { add as addHistory } from "./history.mjs";
import { isMain } from "./is-main.mjs";
import { asAccount, lines, passes, repoOf, sameSha } from "./merge.mjs";
import { read as readRepos } from "./repos.mjs";
import { read, withLock, write } from "./verdicts.mjs";

// Past this a sweep stops and the next round goes on: the mod kills it at 120 s.
const SWEEP_MS = 60_000;

export const MARK = "<!-- argos:";
const markerOf = (sha) => `${MARK}${sha} -->`;
export const LINE_MARK = "<!-- argos-line:";
export const found = (v) => v?.state === "done" && Boolean(v.report) && Boolean(v.issues || v.attention);
// A verdict with no outcome yet, or one that failed; a skip waits for the next validation. A pass
// waits too: it may have a comment to close.
export const waiting = (v) => (found(v) || passes(v)) && (!v.published || v.published.state === "failed");

// Why this verdict does not go on this PR, or null.
export function whyNot(pr, verdict, me) {
  if (!found(verdict) && !passes(verdict)) return "nothing to publish";
  if (pr.author?.login?.toLowerCase() === me.toLowerCase()) return "your PR";
  if (pr.state !== "OPEN" || pr.isDraft) return "not open";
  if (!sameSha(pr.headRefOid, verdict.sha)) return "new commits";
  if (verdict.report && hasSecret(verdict.report)) return "secret in the report";
  return null;
}

export const defuse = (report) =>
  report
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/!\[/g, "[")
    .replace(/<img\b/gi, "&lt;img")
    .replace(/(^|[^\w`/.-])@(?=[A-Za-z0-9])/gm, "$1@​")
    .trim();

export const bodyOf = (report, sha, r) => `${defuse(report)}\n\n${footerOf(r, sha)}\n${markerOf(sha)}`;
// In the language of what it replaces.
export const closingOf = (sha, before) => {
  const r = { lang: langOf(before) };
  return bodyOf(noneOf(r, sha), sha, r);
};
// The list says nothing but the list: the marker is all it adds.
const listBodyOf = (list, sha) => `${defuse(list)}\n${markerOf(sha)}`;
// The text, the fence as it is, the rest of the text.
export const lineBodyOf = (r, f) => {
  const [lead, ...rest] = inlineOf(r, f).map(defuse);
  return [lead, fenceOf(f), ...rest, signOf(r)].filter(Boolean).join("\n\n") + `\n${LINE_MARK}${keyOf(f)} -->`;
};
export const reviewOf = (r, fresh, sha, body) => ({
  commit_id: sha,
  event: "COMMENT",
  ...(body && { body }),
  comments: fresh.map((f) => ({ path: f.path, line: f.line, side: "RIGHT", ...(f.startLine < f.line && { start_line: f.startLine, start_side: "RIGHT" }), body: lineBodyOf(r, f) })),
});

const pullApi = (url) => `repos/${repoOf(url)}/pulls/${url.split("/").at(-1)}`;
// The account's own Argos comments on the PR, oldest first, and the same on its lines and its reviews.
const own = (run, path, mark, me) =>
  lines(run(["api", "--paginate", path, "-q", ".[] | {id, body, html_url, user: {login: .user.login}}"])).filter((c) => c.user?.login?.toLowerCase() === me.toLowerCase() && c.body?.includes(mark));
const ownComments = (run, url, me) => own(run, `repos/${repoOf(url)}/issues/${url.split("/").at(-1)}/comments`, MARK, me);
const ownThreads = (run, url, me) => own(run, `${pullApi(url)}/comments`, LINE_MARK, me);
const ownBriefs = (run, url, me) => own(run, `${pullApi(url)}/reviews`, MARK, me);
const threadOf = (threads, f) => threads.find((c) => c.body.includes(`${LINE_MARK}${keyOf(f)} `));

// What this verdict leaves on the PR, given the brief and the comment already there: the brief's new
// text (null: leave it), the review to post, the comment's text once the threads are known (null: take
// it away), and the text that replaces all of it if GitHub refuses the review.
function planOf(run, url, verdict, sha, me, first, last) {
  if (passes(verdict)) return { brief: first ? closingOf(sha, first.body) : null, review: null, comment: () => (first ? null : closingOf(sha, last?.body)), threads: [] };
  if (!verdict.findings) return { brief: null, review: null, comment: () => bodyOf(verdict.report, sha), threads: [] };
  const files = lines(run(["api", "--paginate", `${pullApi(url)}/files`, "-q", ".[] | {path: .filename, patch}"]));
  const r = { ...verdict.findings, findings: verdict.findings.findings.map((f) => placed(f, files)) };
  const threads = ownThreads(run, url, me);
  const onLine = (f) => fits(f, files);
  const fresh = r.findings.filter((f) => onLine(f) && !threadOf(threads, f));
  const brief = bodyOf(briefOf(r, onLine), sha, r);
  const full = bodyOf(briefOf(r), sha, r);
  const list = (known) =>
    listOf(r, (f) => (onLine(f) ? threadOf(known, f)?.html_url : null));
  // The brief lives in a review when this one opens the PR, or an earlier one did.
  if (first || (!last && fresh.length))
    return { brief: first ? brief : null, review: fresh.length ? reviewOf(r, fresh, sha, first ? "" : brief) : null, comment: (known) => listBodyOf(list(known), sha), threads, full, moves: Boolean(first && fresh.length) };
  const hasLines = r.findings.some(onLine);
  return { brief: null, review: fresh.length ? reviewOf(r, fresh, sha, "") : null, comment: (known) => (hasLines ? bodyOf(`${briefOf(r, onLine)}\n\n${list(known)}`, sha, r) : full), threads, full };
}

function postReview(run, url, review) {
  const dir = mkdtempSync(join(tmpdir(), "argos-review-"));
  try {
    const file = join(dir, "review.json");
    writeFileSync(file, JSON.stringify(review));
    run(["api", "-X", "POST", `${pullApi(url)}/reviews`, "--input", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// It may have gone: GitHub never said. Publishing again only updates the same comment.
export const noAnswer = (err, said) => err.code === "ETIMEDOUT" || Boolean(err.killed) || /timeout|timed out|connection|EOF|HTTP 50[234]/i.test(said);

function publishOne(repos, url, verdict) {
  return publishAs(asAccount(repos, url), url, verdict);
}

function publishAs(run, url, verdict) {
  const me = run(["api", "user", "-q", ".login"]);
  const pr = JSON.parse(run(["pr", "view", url, "--json", "state,isDraft,headRefOid,author"]));
  const why = whyNot(pr, verdict, me);
  if (why) return { state: "skipped", why };
  const last = ownComments(run, url, me).at(-1);
  const first = ownBriefs(run, url, me)[0];
  const marker = markerOf(pr.headRefOid);
  // GitHub knows what the record may have lost: a kill, or a validation run again on this commit
  if (last?.body.includes(marker) || (passes(verdict) && !last && first?.body.includes(marker))) return { state: "posted", why: "" };
  // a pass has nothing to say, unless something on the PR says otherwise by now
  if (passes(verdict) && !last && !first) return { state: "skipped", why: "nothing to publish" };
  const plan = planOf(run, url, verdict, pr.headRefOid, me, first, last);
  let brief = plan.brief;
  let comment = plan.comment;
  let threads = plan.threads;
  let moves = plan.moves;
  if (plan.review)
    try {
      postReview(run, url, plan.review);
      threads = ownThreads(run, url, me);
    } catch (err) {
      // GitHub refused a line, and with it the whole review: the text carries it all instead
      if (!String(err.message ?? err).includes("422")) throw err;
      moves = false;
      if (first) brief = plan.full;
      else comment = () => plan.full;
    }
  if (brief !== null) run(["api", "-X", "PUT", `${pullApi(url)}/reviews/${first.id}`, "-f", `body=${brief}`]);
  const text = comment(threads);
  const at = `repos/${repoOf(url)}/issues`;
  // Gone first: a failure before the new one leaves none, and the next try posts it. Two would stay two.
  if (last && (text === null || moves)) run(["api", "-X", "DELETE", `${at}/comments/${last.id}`]);
  if (text === null) return { state: "posted", why: "" };
  if (last && !moves) run(["api", "-X", "PATCH", `${at}/comments/${last.id}`, "-f", `body=${text}`]);
  else run(["api", "-X", "POST", `${at}/${url.split("/").at(-1)}/comments`, "-f", `body=${text}`]);
  return { state: "posted", why: "" };
}

function preview(url) {
  const run = asAccount(readRepos(), url);
  const pr = JSON.parse(run(["pr", "view", url, "--json", "headRefOid"]));
  const verdict = read().prs[url];
  if (!verdict) throw new Error("no verdict for that PR");
  const me = run(["api", "user", "-q", ".login"]);
  const plan = planOf(run, url, verdict, pr.headRefOid, me, ownBriefs(run, url, me)[0], ownComments(run, url, me).at(-1));
  return { brief: plan.brief, review: plan.review, comment: plan.comment(plan.threads) };
}

function publish(urls, until = Infinity) {
  const repos = readRepos();
  const done = [];
  for (const url of urls) {
    if (Date.now() > until) break;
    const v = read();
    const verdict = v.prs[url];
    if (!verdict) {
      done.push({ url, state: "skipped", why: "nothing to publish" });
      continue;
    }
    let outcome;
    try {
      outcome = v.human?.includes(url) ? { state: "skipped", why: "left to humans" } : publishOne(repos, url, verdict);
    } catch (err) {
      const said = String(err.stderr || err.message || err).trim();
      outcome = { state: "failed", why: said.split("\n")[0].slice(0, 80), ...(noAnswer(err, said) && { unconfirmed: true }) };
    }
    // read again: a validation may have landed while GitHub answered
    withLock(() => {
      const now = read();
      if (now.prs[url]?.sha === verdict.sha) write({ ...now, prs: { ...now.prs, [url]: { ...now.prs[url], published: { ...outcome, sha: verdict.sha, at: new Date().toISOString() } } } });
    });
    if (outcome.state !== "skipped") addHistory({ kind: "published", url, sha: verdict.sha, state: outcome.state, why: outcome.why, at: new Date().toISOString() });
    done.push({ url, ...outcome });
  }
  return done;
}

function sweep() {
  const on = readRepos().filter((r) => r.publish);
  const isOn = (url) => on.some((r) => r.repo.toLowerCase() === repoOf(url).toLowerCase());
  const v = read();
  return publish(
    Object.keys(v.prs).filter((url) => isOn(url) && waiting(v.prs[url]) && !v.human?.includes(url)),
    Date.now() + SWEEP_MS,
  );
}

// The whole flow against a fake GitHub that keeps what it is told, in order.
function flowTest() {
  const url = "https://github.com/acme/web/pull/7";
  const reports = (...findings) => ({ state: "done", sha: "head", issues: 1, attention: 1, report: "- x", findings: { lang: "pt-BR", summary: "s", notes: [], findings } });
  const blocker = { severity: "blocker", type: "bug", path: "a.js", line: 2, startLine: 2, title: "`a` fails", effect: "e", fix: "x" };
  const warning = { severity: "warning", type: "tests", path: "b.js", line: 3, startLine: 3, title: "`b` fails", effect: "e", fix: "x" };
  const apart = { severity: "blocker", type: "security", where: "description", title: "Text for reviewers", effect: "e", fix: "x" };
  const patch = "@@ -1,3 +1,3 @@\n a\n+b\n c";
  const github = (seed = {}) => {
    const g = { head: "head1234", comments: [], reviews: [], threads: [], calls: [], refuse: false, ...seed };
    g.run = (args) => {
      const [, a, b, c, d] = args;
      const verb = a === "-X" ? b : "GET";
      const path = a === "-X" ? c : a === "--paginate" ? b : a;
      const body = d === "-f" ? args[5].slice(5) : undefined;
      if (a === "user") return "me";
      if (args[0] === "pr") return JSON.stringify({ state: "OPEN", isDraft: false, headRefOid: g.head, author: { login: "bia" } });
      const row = (c) => JSON.stringify({ ...c, user: { login: "me" } });
      if (verb === "GET") {
        if (path.endsWith("/files")) return ["a.js", "b.js"].map((p) => JSON.stringify({ path: p, patch })).join("\n");
        if (path.endsWith("/reviews")) return g.reviews.map(row).join("\n");
        if (path.endsWith("/pulls/7/comments")) return g.threads.map(row).join("\n");
        return g.comments.map(row).join("\n");
      }
      g.calls.push(`${verb} ${path.replace("repos/acme/web/", "")}`);
      if (verb === "POST" && path.endsWith("/reviews")) {
        if (g.refuse) throw new Error("HTTP 422");
        const sent = JSON.parse(readFileSync(args[5], "utf8"));
        const id = g.reviews.length + 1;
        if (sent.body) g.reviews.push({ id, body: sent.body });
        for (const t of sent.comments) g.threads.push({ id: 100 + g.threads.length, body: t.body, html_url: `${url}#discussion_r${100 + g.threads.length}` });
        return "{}";
      }
      if (verb === "PUT") g.reviews.find((x) => path.endsWith(`/reviews/${x.id}`)).body = body;
      if (verb === "POST") g.comments.push({ id: 50 + g.calls.length, body });
      if (verb === "PATCH") g.comments.find((x) => path.endsWith(`/${x.id}`)).body = body;
      if (verb === "DELETE") g.comments = g.comments.filter((x) => !path.endsWith(`/${x.id}`));
      return "{}";
    };
    return g;
  };
  const send = (g, verdict) => publishAs(g.run, url, { ...verdict, sha: g.head });
  const verbs = (g) => g.calls.map((c) => c.split(" ")[0] + (c.includes("/reviews") ? " review" : " comment"));

  // first time: the brief opens with the threads, the list closes, each thread linked, the warning once
  const g = github();
  const v = reports(blocker, warning);
  assert.deepEqual(send(g, v), { state: "posted", why: "" });
  assert.deepEqual(verbs(g), ["POST review", "POST comment"]);
  const brief = g.reviews[0].body;
  assert.ok(brief.includes("🔴 `a` fails\n🟡 `b` fails") && brief.includes("não é revisão humana") && brief.includes(markerOf("head1234")));
  const list = g.comments[0].body;
  assert.ok(list.startsWith("| Severidade | Tipo | Onde |"));
  assert.ok(list.includes(`[\`a.js:2\`](${url}#discussion_r100)`) && list.includes(`[\`b.js:3\`](${url}#discussion_r101)`));
  assert.ok(!list.includes("pode errar") && !list.includes("[!") && !list.includes("`a` fails") && list.endsWith(markerOf("head1234")));

  // the same commit again: nothing moves
  g.calls = [];
  assert.equal(send(g, v).state, "posted");
  assert.deepEqual(g.calls, []);

  // a new commit with nothing new on a line: both edited where they stand
  g.head = "edit1111";
  g.calls = [];
  const listId = g.comments[0].id;
  send(g, reports(blocker, warning));
  assert.deepEqual(verbs(g), ["PUT review", "PATCH comment"]);
  assert.equal(g.comments[0].id, listId);

  // a new commit with a new thread: alone in a review with no body, and the list goes after it, last again
  g.head = "next5678";
  g.calls = [];
  const third = { ...warning, path: "a.js", line: 1, startLine: 1, title: "`c` fails" };
  send(g, reports(blocker, warning, third));
  assert.deepEqual(verbs(g), ["POST review", "PUT review", "DELETE comment", "POST comment"]);
  assert.notEqual(g.comments[0].id, listId);
  assert.equal(g.reviews.length, 1);
  assert.equal(g.comments.length, 1);
  assert.ok(g.reviews[0].body.includes("`c` fails") && g.reviews[0].body.includes(markerOf("next5678")));
  assert.equal(g.threads.length, 3);
  assert.ok(g.comments[0].body.includes(`[\`a.js:1\`](${url}#discussion_r102)`) && g.comments[0].body.includes(markerOf("next5678")));

  // a pass: the brief closes first, then the list goes; a second try changes nothing; the next findings come back
  g.head = "pass9999";
  g.calls = [];
  const pass = { state: "done", sha: "x", issues: 0, attention: 0, partial: false };
  send(g, pass);
  assert.deepEqual(verbs(g), ["PUT review", "DELETE comment"]);
  assert.ok(g.reviews[0].body.startsWith("Nenhum achado em `pass999`.") && g.reviews[0].body.includes("pode errar"));
  assert.deepEqual(g.comments, []);
  g.calls = [];
  assert.equal(send(g, pass).state, "posted");
  assert.deepEqual(g.calls, []);
  g.head = "back0000";
  send(g, reports(blocker));
  assert.deepEqual(verbs(g), ["PUT review", "POST comment"]);

  // a list that never went, then a pass: the brief still closes
  const lost = github({ reviews: [{ id: 1, body: `old${markerOf("older")}` }] });
  send(lost, pass);
  assert.deepEqual(verbs(lost), ["PUT review"]);

  // a failure between the review and the list: the next try posts no thread twice
  const broken = github();
  const realRun = broken.run;
  broken.run = (args) => {
    if (args.includes(`repos/acme/web/issues/7/comments`) && args[1] === "-X") throw new Error("HTTP 502");
    return realRun(args);
  };
  assert.throws(() => send(broken, v));
  broken.run = realRun;
  broken.calls = [];
  send(broken, v);
  assert.deepEqual(verbs(broken), ["PUT review", "POST comment"]);
  assert.equal(broken.threads.length, 2);

  // a line that does not show its title: no thread, in the brief by file, with no number
  const astray = github();
  send(astray, reports({ ...blocker, title: "`findById` reads with no filter" }, warning));
  assert.equal(astray.threads.length, 1);
  assert.ok(astray.reviews[0].body.includes("`a.js`: `findById` reads with no filter") && !astray.reviews[0].body.includes("a.js:2"));
  assert.ok(astray.comments[0].body.includes("`a.js` |") && astray.comments[0].body.includes("[`b.js:3`]"));

  // nothing on a line: one comment, in full, with no list and no review
  const alone = github();
  send(alone, reports(apart));
  assert.deepEqual(verbs(alone), ["POST comment"]);
  assert.ok(alone.comments[0].body.includes("**Ajuste:**") && !alone.comments[0].body.includes("| Tipo |") && alone.comments[0].body.includes("pode errar"));

  // a comment from before this format: it stays the one comment, brief and list, and threads go with no body
  const old = github({ comments: [{ id: 50, body: `old${markerOf("older")}` }] });
  send(old, v);
  assert.deepEqual(verbs(old), ["POST review", "PATCH comment"]);
  assert.deepEqual(old.reviews, []);
  assert.ok(old.comments[0].body.includes("🔴 `a` fails") && old.comments[0].body.includes("| Tipo |") && old.comments[0].body.includes("pode errar"));

  // GitHub refuses a line: the one comment carries it all, or the brief where there is one
  const refused = github({ refuse: true });
  send(refused, v);
  assert.deepEqual(verbs(refused), ["POST review", "POST comment"]);
  assert.ok(refused.comments[0].body.includes("**Ajuste:**") && refused.comments[0].body.includes("pode errar"));
  const later = github({ refuse: true, reviews: [{ id: 1, body: `old${markerOf("older")}` }] });
  send(later, v);
  assert.deepEqual(verbs(later), ["POST review", "PUT review", "POST comment"]);
  assert.ok(later.reviews[0].body.includes("**Ajuste:**") && later.comments[0].body.startsWith("| Severidade |"));
}

function selfTest() {
  assert.equal(noAnswer({}, "HTTP 502: Bad Gateway"), true);
  assert.equal(noAnswer({ code: "ETIMEDOUT" }, ""), true);
  assert.equal(noAnswer({}, "HTTP 403: Resource not accessible (acme/web/pull/502)"), false);
  const pr = { state: "OPEN", isDraft: false, headRefOid: "abc1234def", author: { login: "bia" } };
  const v = { state: "done", sha: "abc1234", issues: 1, attention: 0, report: "- `a.js:1`: wrong" };
  const pass = { state: "done", sha: "abc1234", issues: 0, attention: 0, partial: false };
  assert.equal(whyNot(pr, v, "me"), null);
  assert.equal(whyNot(pr, { ...v, issues: 0, attention: 2 }, "me"), null);
  // a pass may close a comment
  assert.equal(whyNot(pr, pass, "me"), null);
  // findings with no report, partial with nothing found, a validation that failed: nothing to say
  assert.equal(whyNot(pr, { ...v, report: undefined }, "me"), "nothing to publish");
  assert.equal(whyNot(pr, { ...pass, partial: true }, "me"), "nothing to publish");
  assert.equal(whyNot(pr, { state: "failed" }, "me"), "nothing to publish");
  assert.equal(whyNot(pr, v, "BIA"), "your PR");
  assert.equal(whyNot({ ...pr, state: "MERGED" }, v, "me"), "not open");
  assert.equal(whyNot({ ...pr, isDraft: true }, v, "me"), "not open");
  assert.equal(whyNot({ ...pr, headRefOid: "fff9999" }, v, "me"), "new commits");
  assert.equal(whyNot(pr, { ...v, report: `key ${"AKIA"}ABCDEFGHIJKLMNOP` }, "me"), "secret in the report");
  assert.equal(whyNot(pr, { ...v, report: 'password = "hunter2hunter2"' }, "me"), "secret in the report");
  // a skip stands until the next validation; a failure goes again; posted is done
  assert.equal(waiting(v), true);
  assert.equal(waiting(pass), true);
  assert.equal(waiting({ ...v, published: { state: "failed" } }), true);
  assert.equal(waiting({ ...v, published: { state: "skipped" } }), false);
  assert.equal(waiting({ ...v, published: { state: "posted" } }), false);
  // a report talked into a mention, an image or a fake marker does none of it
  assert.equal(defuse("ask @bia and @acme/team"), "ask @​bia and @​acme/team");
  assert.equal(defuse("mail a@b.co, `@code`"), "mail a@b.co, `@code`");
  assert.equal(defuse("![x](http://evil/?q=1) <img src=x>"), "[x](http://evil/?q=1) &lt;img src=x>");
  assert.equal(defuse(`ok${markerOf("abc")} done<!-- open`), "ok done");
  const body = bodyOf("- `a.js:1`: wrong", "abc1234def");
  assert.ok(body.startsWith("- `a.js:1`: wrong\n\n"));
  assert.ok(body.includes("AI validation of abc1234 · not a human review"));
  assert.ok(bodyOf("x", "abc1234def", { lang: "pt-BR" }).includes("não é revisão humana"));
  assert.ok(body.endsWith(markerOf("abc1234def")));
  // on a line: the comment's text is defused, the code to apply is not, and only a range has a start
  const r = { lang: "en", summary: "s", notes: [], findings: [] };
  const f = { severity: "blocker", type: "bug", path: "a.js", line: 3, startLine: 3, title: "ask @bia", effect: "e", fix: "x", suggestion: "@Override\nrun();", why: "w" };
  const inline = lineBodyOf(r, f);
  assert.ok(inline.startsWith("🔴 **Blocker · bug**: ask @​bia\ne\n\n```suggestion\n@Override\nrun();\n```\n\n<details>"));
  assert.ok(inline.includes("</details>\n\n<sub>Argos · AI"));
  assert.ok(inline.endsWith(`${LINE_MARK}${keyOf(f)} -->`));
  assert.ok(!inline.includes(MARK));
  assert.ok(!lineBodyOf(r, { ...f, suggestion: undefined }).includes("suggestion"));
  assert.ok(inline.includes("<sub>Argos · AI</sub>") && !inline.includes("can be wrong"));
  const review = reviewOf(r, [f, { ...f, startLine: 1, title: "t" }], "abc1234def", "the brief");
  assert.deepEqual([review.commit_id, review.event, review.body], ["abc1234def", "COMMENT", "the brief"]);
  assert.ok(!("body" in reviewOf(r, [f], "abc1234def", "")));
  assert.deepEqual([review.comments[0].line, review.comments[0].side, review.comments[0].start_line], [3, "RIGHT", undefined]);
  assert.deepEqual([review.comments[1].start_line, review.comments[1].start_side], [1, "RIGHT"]);
  flowTest();
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--self-test") selfTest();
  else if (cmd === "sweep") console.log(JSON.stringify(sweep()));
  else if (cmd === "preview") console.log(JSON.stringify(preview(rest[0]), null, 2));
  else if (cmd && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(cmd)) console.log(JSON.stringify(publish([cmd, ...rest])));
  else {
    console.error("usage: publish.mjs <pr-url>... | sweep | preview <pr-url> | --self-test");
    process.exit(1);
  }
}
