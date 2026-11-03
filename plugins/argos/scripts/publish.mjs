#!/usr/bin/env node
// Argos publish: keeps one comment on a PR saying what its last validation found, as the account
// that owns the repo. The person sends it from the pane, having read it, or turns it on per repo
// (`repos.mjs publish <repo> on`). The mod runs this, never the agent that validated: the validation
// stays read-only, and the report it wrote read the PR's own text, so it is treated as untrusted here.
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
// Mentions, images and HTML comments are defused, so a report talked into them pings nobody, loads
// nothing and fakes no marker.
//
// Usage:
//   node publish.mjs <pr-url>...   those PRs, from the pane's button
//   node publish.mjs sweep         every verdict with no outcome yet, in repos with auto-publish on
//   node publish.mjs --self-test
// Each outcome lands on the verdict (published: { state: posted | skipped | failed, why, sha, at }) and
// prints as JSON. A skip stands until the next validation; a failure (the network, say) goes again.
// Env: ARGOS_STATE, as the other scripts.
import assert from "node:assert/strict";
import { hasSecret } from "./gate.mjs";
import { add as addHistory } from "./history.mjs";
import { isMain } from "./is-main.mjs";
import { asAccount, lines, passes, repoOf, sameSha } from "./merge.mjs";
import { read as readRepos } from "./repos.mjs";
import { read, withLock, write } from "./verdicts.mjs";

// Past this a sweep stops and the next round goes on: the mod kills it at 120 s.
const SWEEP_MS = 60_000;

const MARK = "<!-- argos:";
const markerOf = (sha) => `${MARK}${sha} -->`;
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

export const bodyOf = (report, sha) => `${defuse(report)}\n\n<sub>Argos · AI validation of ${sha.slice(0, 7)}</sub>\n${markerOf(sha)}`;
export const closingOf = (sha) => bodyOf(`No findings on \`${sha.slice(0, 7)}\`.`, sha);

// The account's own Argos comments on the PR, oldest first.
const ownComments = (run, url, me) =>
  lines(run(["api", "--paginate", `repos/${repoOf(url)}/issues/${url.split("/").at(-1)}/comments`, "-q", ".[] | {id, body, user: {login: .user.login}}"])).filter(
    (c) => c.user?.login?.toLowerCase() === me.toLowerCase() && c.body?.includes(MARK),
  );

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
  const body = `body=${passes(verdict) ? closingOf(pr.headRefOid) : bodyOf(verdict.report, pr.headRefOid)}`;
  if (last) run(["api", "-X", "PATCH", `repos/${repoOf(url)}/issues/comments/${last.id}`, "-f", body]);
  else run(["api", "-X", "POST", `repos/${repoOf(url)}/issues/${url.split("/").at(-1)}/comments`, "-f", body]);
  return { state: "posted", why: "" };
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
  assert.ok(body.includes("AI validation of abc1234<"));
  assert.ok(body.endsWith(markerOf("abc1234def")));
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--self-test") selfTest();
  else if (cmd === "sweep") console.log(JSON.stringify(sweep()));
  else if (cmd && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(cmd)) console.log(JSON.stringify(publish([cmd, ...rest])));
  else {
    console.error("usage: publish.mjs <pr-url>... | sweep | --self-test");
    process.exit(1);
  }
}
