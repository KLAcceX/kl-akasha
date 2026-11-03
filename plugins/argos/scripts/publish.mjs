#!/usr/bin/env node
// Argos publish: keeps one comment on a PR saying what its last validation found, with the detail of
// each finding on its line, as the account that owns the repo. The person sends it from the pane, having
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
//   - one comment per PR: a new commit updates it, so five pushes are not five comments, and a pass
//     closes it. GitHub is asked through a marker in the comment, only in the account's own comments,
//     so a lost record or a second press never posts twice and nobody else's text can stop a post.
//     ponytail: an edit notifies nobody, so new findings on a later commit go unnoticed unless the
//     author looks; post anew on a higher blocker count if that bites
//   - a finding on a line of the diff also goes there, once, in a review that only comments: it can
//     carry a suggestion to apply. A new commit adds only what is new, and a finding gone from the
//     report keeps its old line comment: GitHub marks it outdated once the line changes. Whatever has
//     no line in the diff stays in full in the comment. The review goes first, so a failure in
//     between loses nothing: the next try finds what is on the lines by their markers.
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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { briefOf, fenceOf, fits, inlineOf, keyOf } from "./findings.mjs";
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

// The account is a person's, so the footer says who wrote this. A fixed English: nothing here knows the PR's language.
const footerOf = (sha) => `<sub>Argos · AI validation of ${sha.slice(0, 7)} · not a human review, and it can be wrong</sub>`;
export const bodyOf = (report, sha) => `${defuse(report)}\n\n${footerOf(sha)}\n${markerOf(sha)}`;
export const closingOf = (sha) => bodyOf(`No findings on \`${sha.slice(0, 7)}\`.`, sha);
// The text, the fence as it is, the rest of the text. Each line comment says who wrote it on its own.
export const lineBodyOf = (r, f) => {
  const [lead, ...rest] = inlineOf(r, f).map(defuse);
  return [lead, fenceOf(f), ...rest, "<sub>Argos · AI, and it can be wrong</sub>"].filter(Boolean).join("\n\n") + `\n${LINE_MARK}${keyOf(f)} -->`;
};
export const reviewOf = (r, fresh, sha) => ({
  commit_id: sha,
  event: "COMMENT",
  body: footerOf(sha),
  comments: fresh.map((f) => ({ path: f.path, line: f.line, side: "RIGHT", ...(f.startLine < f.line && { start_line: f.startLine, start_side: "RIGHT" }), body: lineBodyOf(r, f) })),
});

const pullApi = (url) => `repos/${repoOf(url)}/pulls/${url.split("/").at(-1)}`;
// The account's own Argos comments on the PR, oldest first, and the same on its lines.
const own = (run, path, mark, me) =>
  lines(run(["api", "--paginate", path, "-q", ".[] | {id, body, user: {login: .user.login}}"])).filter((c) => c.user?.login?.toLowerCase() === me.toLowerCase() && c.body?.includes(mark));
const ownComments = (run, url, me) => own(run, `repos/${repoOf(url)}/issues/${url.split("/").at(-1)}/comments`, MARK, me);

// What this verdict leaves on the PR: the comment's text, and the line comments not there yet.
function planOf(run, url, verdict, sha, me) {
  const r = verdict.findings;
  if (passes(verdict)) return { body: closingOf(sha), review: null };
  if (!r) return { body: bodyOf(verdict.report, sha), review: null };
  const files = lines(run(["api", "--paginate", `${pullApi(url)}/files`, "-q", ".[] | {path: .filename, patch}"]));
  const onLine = own(run, `${pullApi(url)}/comments`, LINE_MARK, me).map((c) => c.body);
  const fresh = r.findings.filter((f) => fits(f, files) && !onLine.some((b) => b.includes(`${LINE_MARK}${keyOf(f)} `)));
  return { body: bodyOf(briefOf(r, (f) => fits(f, files)), sha), full: bodyOf(briefOf(r), sha), review: fresh.length ? reviewOf(r, fresh, sha) : null };
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

function publishOne(repos, url, verdict) {
  const run = asAccount(repos, url);
  const me = run(["api", "user", "-q", ".login"]);
  const pr = JSON.parse(run(["pr", "view", url, "--json", "state,isDraft,headRefOid,author"]));
  const why = whyNot(pr, verdict, me);
  if (why) return { state: "skipped", why };
  const last = ownComments(run, url, me).at(-1);
  // GitHub knows what the record may have lost: a kill, or a validation run again on this commit
  if (last?.body.includes(markerOf(pr.headRefOid))) return { state: "posted", why: "" };
  // a pass has nothing to say, unless a comment says otherwise by now
  if (passes(verdict) && !last) return { state: "skipped", why: "nothing to publish" };
  const plan = planOf(run, url, verdict, pr.headRefOid, me);
  let text = plan.body;
  if (plan.review)
    try {
      postReview(run, url, plan.review);
    } catch (err) {
      // GitHub refused a line, and with it the whole review: the comment carries it all instead
      if (!String(err.message ?? err).includes("422")) throw err;
      text = plan.full;
    }
  const body = `body=${text}`;
  if (last) run(["api", "-X", "PATCH", `repos/${repoOf(url)}/issues/comments/${last.id}`, "-f", body]);
  else run(["api", "-X", "POST", `repos/${repoOf(url)}/issues/${url.split("/").at(-1)}/comments`, "-f", body]);
  return { state: "posted", why: "" };
}

function preview(url) {
  const run = asAccount(readRepos(), url);
  const pr = JSON.parse(run(["pr", "view", url, "--json", "headRefOid"]));
  const verdict = read().prs[url];
  if (!verdict) throw new Error("no verdict for that PR");
  return planOf(run, url, verdict, pr.headRefOid, run(["api", "user", "-q", ".login"]));
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
      outcome = { state: "failed", why: String(err.message ?? err).split("\n")[0].slice(0, 80) };
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

function selfTest() {
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
  const review = reviewOf(r, [f, { ...f, startLine: 1, title: "t" }], "abc1234def");
  assert.deepEqual([review.commit_id, review.event], ["abc1234def", "COMMENT"]);
  assert.ok(review.body.includes("not a human review"));
  assert.deepEqual([review.comments[0].line, review.comments[0].side, review.comments[0].start_line], [3, "RIGHT", undefined]);
  assert.deepEqual([review.comments[1].start_line, review.comments[1].start_side], [1, "RIGHT"]);
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
