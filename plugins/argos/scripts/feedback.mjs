#!/usr/bin/env node
// Argos feedback: everything reviewers said on one of my PRs, classified and grouped by
// file into a plan (blocking first). Read-only: it never replies, resolves or pushes.
//
// Usage:
//   node feedback.mjs <pr-url | owner/repo#n> [--account <gh login>] [--json]
//   node feedback.mjs --self-test
// Classes follow Conventional Comments (see references/evidence-fix.md, "Triage the comments").
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { isMain } from "./is-main.mjs";

// The PR fields build() reads; lessons.mjs asks for the same through search.
export const PR_FIELDS = `
      number title url state isDraft headRefName baseRefName mergeable reviewDecision
      author { login }
      commits(last: 1) { nodes { commit { oid committedDate statusCheckRollup { state contexts(first: 50) { nodes {
        __typename
        ... on CheckRun { name conclusion detailsUrl }
        ... on StatusContext { context state targetUrl }
      } } } } } }
      latestReviews(first: 30) { nodes { id state body submittedAt url author { login __typename } } }
      reviewThreads(first: 100) { nodes { id isResolved isOutdated path line originalLine startLine originalStartLine
        comments(first: 50) { nodes { body createdAt url author { login __typename } } } } }
      comments(last: 50) { nodes { id body createdAt url author { login __typename } } }`;

const QUERY = `
query($owner: String!, $name: String!, $n: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $n) {${PR_FIELDS}
    }
  }
}`;

export const parsePr = (ref) => {
  const url = ref.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (url) return { repo: url[1], number: Number(url[2]) };
  const short = ref.match(/^([^/\s]+\/[^#\s]+)#(\d+)$/);
  return short ? { repo: short[1], number: Number(short[2]) } : null;
};

const isBot = (a) => !a || a.__typename === "Bot" || /\[bot\]$/.test(a.login);

// Conventional Comments labels (plus Google's Nit/Optional/FYI) → class.
const LABELS = {
  issue: "blocking", todo: "blocking", chore: "blocking",
  question: "question",
  suggestion: "suggestion", optional: "suggestion",
  nit: "nit", nitpick: "nit", typo: "nit", polish: "nit", quibble: "nit",
  praise: "praise",
  thought: "fyi", note: "fyi", fyi: "fyi",
};
// "nit:", "**nit:**", "**nit**:", "issue (blocking):"
const LABEL_RE = new RegExp(`^\\s*\\**\\s*(${Object.keys(LABELS).join("|")})\\s*(?:\\(([^)]*)\\))?\\s*\\**\\s*:`, "i");
const PRAISE_RE = /^(lgtm|looks good|nice|great|good catch|well done|thanks|thank you|boa|ótimo|otimo|show|massa|perfeito|valeu)\b/i;
const QUESTION_RE = /^(why|what|how|when|where|which|who|is|are|does|do|did|should|shouldn't|isn't|por que|porque|o que|como|quando|onde|qual|isso|é|precisa mesmo)\b/i;
const MUST_RE = /\b(must|blocking|required|needs? to|has to|have to|please fix|breaks?|broken|bug|security|vulnerab\w*|precisa|tem que|obrigat[oó]ri\w*|bloque\w*|quebra\w*)\b/i;
const REQUEST_RE = /\b(can|could|would) you\b|\bpode(ria)? (trocar|mudar|renomear|remover|tirar|adicionar|usar|extrair|mover|separar)\b/i;

export const RANK = ["blocking", "question", "suggestion", "nit", "fyi", "praise", "already-addressed"];

// What the comment asks for. Unlabeled comments read as mandatory to authors (Google), but we
// only call one blocking with a reason: strong wording, or a reviewer who requested changes.
// ponytail: keyword heuristics; `labeled: false` tells the AI to re-read the comment itself.
export function classify(body, { requestedChanges = false } = {}) {
  const text = (body ?? "").trim();
  const m = text.match(LABEL_RE);
  if (m) {
    const deco = (m[2] ?? "").toLowerCase();
    let cls = LABELS[m[1].toLowerCase()];
    if (/\bnon-blocking\b/.test(deco) && cls === "blocking") cls = "suggestion";
    else if (/\bblocking\b/.test(deco.replace("non-blocking", ""))) cls = "blocking";
    return { class: cls, label: m[0].replace(/[*:\s]+$/g, "").replace(/^[*\s]+/, "").toLowerCase(), labeled: true };
  }
  const first = text.split(/\n/)[0];
  const cls = /```suggestion\b/.test(text)
    ? "suggestion"
    : PRAISE_RE.test(text) && text.length < 80 && !text.includes("?")
      ? "praise"
      : QUESTION_RE.test(first) && text.includes("?")
        ? "question"
        : MUST_RE.test(text) || requestedChanges
          ? "blocking"
          : text.includes("?") && !REQUEST_RE.test(text)
            ? "question"
            : "suggestion";
  return { class: cls, label: null, labeled: false };
}

const ACTION = {
  blocking: "change code",
  question: "reply",
  suggestion: "change code or push back with reason",
  nit: "change code",
  fyi: "reply",
  praise: "reply",
  "already-addressed": "none",
};

const excerpt = (s, n = 600) => ((s ?? "").length > n ? `${s.slice(0, n)}…` : (s ?? ""));

// Raw GraphQL pullRequest → the plan. Pure, so the self-test can feed it fixtures.
export function build(pr, repo) {
  const me = pr.author?.login;
  const last = pr.commits.nodes[0]?.commit;
  const lastPush = last?.committedDate ?? null;
  const pushedAfter = (at) => Boolean(lastPush && lastPush > at);
  const changesBy = new Set(pr.latestReviews.nodes.filter((r) => r.state === "CHANGES_REQUESTED").map((r) => r.author?.login));
  // My replies in the conversation tab answer reviews and top-level comments posted before them.
  const myConversation = pr.comments.nodes.filter((c) => c.author?.login === me).map((c) => c.createdAt);
  const answeredInConversation = (at) => myConversation.some((t) => t > at);

  const item = (base, body, { requestedChanges, resolved = false, answered }) => {
    const c = classify(body, { requestedChanges });
    const addressed = resolved || (answered && pushedAfter(base.at));
    const cls = addressed ? "already-addressed" : c.class;
    return { ...base, resolved, answered, pushedAfter: pushedAfter(base.at), labeled: c.labeled, label: c.label, class: cls, ...(addressed && { was: c.class }), action: ACTION[cls], ask: excerpt(body) };
  };

  const items = [];
  for (const r of pr.latestReviews.nodes) {
    if (r.author?.login === me || !r.body?.trim()) continue; // empty bodies only wrap inline threads
    const base = { kind: "review", id: r.id, url: r.url, by: r.author?.login, bot: isBot(r.author), at: r.submittedAt, path: null, line: null, state: r.state };
    const it = item(base, r.body, { requestedChanges: r.state === "CHANGES_REQUESTED", answered: answeredInConversation(r.submittedAt) });
    if (r.state === "CHANGES_REQUESTED" && it.class !== "already-addressed") Object.assign(it, { class: "blocking", action: ACTION.blocking });
    items.push(it);
  }
  for (const t of pr.reviewThreads.nodes) {
    const cs = t.comments.nodes;
    const opener = cs[0];
    if (!opener || opener.author?.login === me) {
      // a thread I opened only matters once someone else answered in it
      if (!cs.some((c) => c.author?.login !== me)) continue;
    }
    const others = cs.filter((c) => c.author?.login !== me);
    const lastOther = others.at(-1);
    const ask = opener.author?.login === me ? lastOther : opener;
    const base = {
      kind: "thread", id: t.id, url: ask.url, by: ask.author?.login, bot: isBot(ask.author), at: lastOther.createdAt,
      path: t.path, line: t.line ?? t.originalLine, startLine: t.startLine ?? t.originalStartLine ?? null, outdated: t.isOutdated,
      last: cs.slice(1).slice(-3).map((c) => ({ by: c.author?.login, at: c.createdAt, body: excerpt(c.body, 300) })),
    };
    const answered = cs.some((c) => c.author?.login === me && c.createdAt > lastOther.createdAt);
    items.push(item(base, ask.body, { requestedChanges: changesBy.has(ask.author?.login), resolved: t.isResolved, answered }));
  }
  for (const c of pr.comments.nodes) {
    // ponytail: bot conversation comments (deploy previews, coverage) are skipped as noise;
    // bot review threads (e.g. Copilot) are kept above. Include bots here if CI bots carry the fix.
    if (c.author?.login === me || isBot(c.author)) continue;
    const base = { kind: "comment", id: c.id, url: c.url, by: c.author?.login, bot: false, at: c.createdAt, path: null, line: null };
    items.push(item(base, c.body, { requestedChanges: changesBy.has(c.author?.login), answered: answeredInConversation(c.createdAt) }));
  }

  const rank = (i) => RANK.indexOf(i.class);
  items.sort((a, b) => rank(a) - rank(b) || (a.path ?? "").localeCompare(b.path ?? "") || (a.line ?? 0) - (b.line ?? 0));
  const plan = [];
  for (const i of items) {
    const file = i.path ?? "(conversation)";
    const group = plan.find((g) => g.file === file) ?? plan[plan.push({ file, items: [] }) - 1];
    group.items.push(i);
  }
  const contexts = last?.statusCheckRollup?.contexts?.nodes ?? [];
  const failing = contexts
    .map((x) => (x.__typename === "CheckRun" ? { name: x.name, state: x.conclusion, url: x.detailsUrl } : { name: x.context, state: x.state, url: x.targetUrl }))
    .filter((x) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(x.state));

  return {
    repo, number: pr.number, url: pr.url, title: pr.title, author: me, state: pr.state, isDraft: pr.isDraft,
    branch: pr.headRefName, base: pr.baseRefName, headSha: last?.oid ?? null, lastPush,
    reviewDecision: pr.reviewDecision, mergeable: pr.mergeable,
    ci: { state: last?.statusCheckRollup?.state ?? null, failing },
    reviewers: pr.latestReviews.nodes.filter((r) => r.author?.login !== me).map((r) => ({ login: r.author?.login, state: r.state, at: r.submittedAt, bot: isBot(r.author) })),
    counts: Object.fromEntries(RANK.map((k) => [k, items.filter((i) => i.class === k).length])),
    plan,
  };
}

const cell = (s) => s.replace(/```suggestion[\s\S]*?```/g, "(suggestion block)").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function render(f) {
  const ci = f.ci.state ? `CI ${f.ci.state.toLowerCase()}${f.ci.failing.length ? ` (${f.ci.failing.map((x) => x.name).join(", ")})` : ""}` : "no CI";
  const head = [
    `## [${f.repo}#${f.number}](${f.url}) ${f.title}`,
    "",
    `${f.state.toLowerCase()}${f.isDraft ? ", draft" : ""} · review: ${(f.reviewDecision ?? "none").toLowerCase().replace(/_/g, " ")} · ${ci} · ${String(f.mergeable).toLowerCase()} · branch \`${f.branch}\``,
    "",
  ];
  const n = f.plan.reduce((s, g) => s + g.items.length, 0);
  if (!n) return [...head, "_No reviewer feedback yet._"].join("\n");
  const rows = f.plan.flatMap((g) =>
    g.items.map((i) => `| ${g.file}${i.line ? `:${i.line}` : ""} | ${i.class}${i.was ? ` (was ${i.was})` : ""} | @${i.by} | ${short(cell(i.ask))} | ${i.action} |`),
  );
  const counts = RANK.filter((k) => f.counts[k]).map((k) => `${f.counts[k]} ${k}`).join(", ");
  return [...head, "| Where | Class | By | Asked | Action |", "|---|---|---|---|---|", ...rows, "", counts].join("\n");
}

function main(args) {
  const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const pr = parsePr(args.find((a) => !a.startsWith("--") && a !== opt("--account")) ?? "");
  if (!pr) {
    console.error("usage: node feedback.mjs <pr-url | owner/repo#n> [--account <login>] [--json]");
    process.exit(2);
  }
  const env = { ...process.env };
  if (opt("--account")) env.GH_TOKEN = execFileSync("gh", ["auth", "token", "-u", opt("--account")], { encoding: "utf8" }).trim();
  const [owner, name] = pr.repo.split("/");
  // ponytail: first 100 threads, 50 comments each, last 50 conversation comments; paginate if a PR outgrows that.
  const out = execFileSync("gh", ["api", "graphql", "-f", `query=${QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `n=${pr.number}`], {
    encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024,
  });
  const node = JSON.parse(out).data.repository?.pullRequest;
  if (!node) {
    console.error(`${pr.repo}#${pr.number} not found, or this gh account cannot see it`);
    process.exit(1);
  }
  const f = build(node, pr.repo);
  console.log(args.includes("--json") ? JSON.stringify(f, null, 2) : render(f));
}

function selfTest() {
  const cls = (b, o) => classify(b, o).class;
  // Conventional Comments labels and decorations
  assert.equal(cls("nit: trailing space"), "nit");
  assert.equal(cls("**nit:** trailing space"), "nit");
  assert.equal(cls("**nitpick**: rename"), "nit");
  assert.equal(cls("question: why a Map here?"), "question");
  assert.equal(cls("suggestion: extract a helper"), "suggestion");
  assert.equal(cls("suggestion (blocking): this leaks the handle"), "blocking");
  assert.equal(cls("issue (blocking): null deref on empty cart"), "blocking");
  assert.equal(cls("issue (non-blocking): could be faster"), "suggestion");
  assert.equal(cls("issue: wrong total"), "blocking");
  assert.equal(cls("praise: clean split"), "praise");
  assert.equal(cls("thought: we may want caching later"), "fyi");
  assert.equal(cls("Nit: blank line"), "nit");
  assert.equal(cls("Optional: use const"), "suggestion");
  assert.equal(cls("FYI: the API changes next sprint"), "fyi");
  assert.deepEqual(classify("issue (blocking): x"), { class: "blocking", label: "issue (blocking)", labeled: true });
  // unlabeled: suggestion blocks, praise, questions, strong wording, a reviewer who requested changes
  assert.equal(cls("```suggestion\nconst total = 0;\n```"), "suggestion");
  assert.equal(cls("LGTM, thanks!"), "praise");
  assert.equal(cls("Why not reuse parsePr here?"), "question");
  assert.equal(cls("Por que não usar o helper?"), "question");
  assert.equal(cls("This breaks when the cart is empty."), "blocking");
  assert.equal(cls("Isso precisa de teste."), "blocking");
  assert.equal(cls("Could you rename this to total?"), "suggestion");
  assert.equal(cls("Maybe rename to total."), "suggestion");
  assert.equal(cls("Maybe rename to total.", { requestedChanges: true }), "blocking");
  assert.equal(classify("Maybe rename").labeled, false);

  // build: answered, resolved, pushed after, grouping and order
  const u = (login) => ({ login, __typename: "User" });
  const c = (login, body, createdAt) => ({ body, createdAt, url: `u/${createdAt}`, author: u(login) });
  const pr = {
    number: 6, title: "t", url: "u", state: "OPEN", isDraft: false, headRefName: "feat", baseRefName: "main",
    mergeable: "MERGEABLE", reviewDecision: "CHANGES_REQUESTED", author: u("me"),
    commits: { nodes: [{ commit: { oid: "abc", committedDate: "2026-10-05T00:00:00Z", statusCheckRollup: { state: "FAILURE", contexts: { nodes: [
      { __typename: "CheckRun", name: "test", conclusion: "FAILURE", detailsUrl: "ci" },
      { __typename: "CheckRun", name: "lint", conclusion: "SUCCESS", detailsUrl: "ci2" },
    ] } } } }] },
    latestReviews: { nodes: [
      { id: "R1", state: "CHANGES_REQUESTED", body: "Please handle the empty cart.", submittedAt: "2026-10-06T00:00:00Z", url: "r1", author: u("ana") },
      { id: "R2", state: "APPROVED", body: "", submittedAt: "2026-10-02T00:00:00Z", url: "r2", author: u("bia") },
    ] },
    reviewThreads: { nodes: [
      { id: "T1", isResolved: false, isOutdated: false, path: "src/cart.ts", line: 10, comments: { nodes: [c("ana", "Rename to total.", "2026-10-01T00:00:00Z")] } },
      { id: "T2", isResolved: true, isOutdated: false, path: "src/cart.ts", line: 3, comments: { nodes: [c("bia", "nit: space", "2026-10-01T00:00:00Z")] } },
      { id: "T3", isResolved: false, isOutdated: false, path: "src/a.ts", line: 1, comments: { nodes: [c("bia", "question: why?", "2026-10-01T00:00:00Z"), c("me", "Because X; changed it.", "2026-10-02T00:00:00Z")] } },
      { id: "T4", isResolved: false, isOutdated: false, path: "src/a.ts", line: 9, comments: { nodes: [c("me", "Note to self", "2026-10-01T00:00:00Z")] } },
    ] },
    comments: { nodes: [
      { id: "C1", ...c("bia", "LGTM", "2026-10-01T00:00:00Z") },
      { id: "C2", body: "Deploy preview ready", createdAt: "2026-10-01T00:00:00Z", url: "x", author: { login: "vercel[bot]", __typename: "Bot" } },
    ] },
  };
  const f = build(pr, "acme/shop");
  const all = f.plan.flatMap((g) => g.items);
  const byId = Object.fromEntries(all.map((i) => [i.id, i]));
  assert.equal(byId.R1.class, "blocking"); // changes requested, after the last push
  assert.equal(byId.T1.class, "blocking"); // unlabeled, from the reviewer who requested changes
  assert.equal(byId.T2.class, "already-addressed");
  assert.equal(byId.T2.was, "nit");
  assert.equal(byId.T3.class, "already-addressed"); // I replied and pushed after
  assert.equal(byId.T3.answered, true);
  assert.equal(byId.T4, undefined); // my own note with no answer is not feedback
  assert.equal(byId.C1.class, "praise");
  assert.equal(byId.R2, undefined); // empty approval body
  assert.equal(all.some((i) => i.by === "vercel[bot]"), false);
  assert.deepEqual(f.plan.map((g) => g.file), ["(conversation)", "src/cart.ts", "src/a.ts"]);
  assert.equal(f.plan[1].items[0].id, "T1"); // blocking before addressed in the same file
  assert.deepEqual(f.ci.failing, [{ name: "test", state: "FAILURE", url: "ci" }]);
  assert.equal(f.counts.blocking, 2);
  assert.deepEqual(f.reviewers.map((r) => r.state), ["CHANGES_REQUESTED", "APPROVED"]);
  const md = render(f);
  assert.match(md, /\| src\/cart\.ts:10 \| blocking \| @ana \| Rename to total\. \| change code \|/);
  assert.match(md, /CI failure \(test\)/);
  assert.match(render({ ...f, plan: [] }), /No reviewer feedback yet/);

  assert.deepEqual(parsePr("https://github.com/acme/api/pull/42"), { repo: "acme/api", number: 42 });
  assert.deepEqual(parsePr("acme/api#7"), { repo: "acme/api", number: 7 });
  console.log("self-test ok");
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  args.includes("--self-test") ? selfTest() : main(args);
}
