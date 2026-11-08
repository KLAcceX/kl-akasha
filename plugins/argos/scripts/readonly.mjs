// What a validating agent may do. It reads the PRs of others with nobody watching, and what it reads
// can try to talk it into acting, so "read only" is held here, by its PreToolUse hook (readonly-guard.mjs), and not only
// asked for in its prompt. An allowlist: what is not known to read is refused, and the refusal says
// what to use, so the worst case is a retry or a partial verdict.
// ponytail: a hook on the command's text is friction, not a sandbox (no OS isolation on native
// Windows); an allowed reader's odd flag (sed's `w`, `sort -o`) still writes. Only the agent's own
// tools are held: it never runs the PR's code, and network goes through gh alone.

const TOOLS = new Set(["Read", "Grep", "Glob", "Bash", "PowerShell", "ToolSearch", "Skill", "TodoWrite"]);
const SHELLS = new Set(["Bash", "PowerShell"]);
// A connector's tool that changes something, by the verb in its name.
const MCP_WRITE = /(^|_)(create|update|delete|remove|add|set|post|comment|reply|merge|push|edit|write|send|transition|close|approve|assign|upload)/i;
// Credentials on the machine: nothing in a PR needs them. A template of a .env is fine.
const SECRET_PATH = /(^|[\\/\s'"=~])(\.ssh|\.aws|\.gnupg|\.netrc|\.npmrc|\.pypirc|\.config[\\/]gh|\.env(?!\.(example|sample|template)\b))(?![\w-])/i;

const READERS = new Set(
  `cat head tail grep rg sed wc sort uniq cut tr jq ls find echo printf cd pwd test [ true false export date basename dirname nl base64 sleep mkdir
   get-content gc select-string sls get-childitem gci ls dir select-object select foreach-object where-object measure-object sort-object
   convertfrom-json convertto-json write-output out-string get-item test-path get-location set-location join-path resolve-path`.split(/\s+/),
);
const GH = { pr: /^(view|diff|checks|list|status)$/, issue: /^(view|list)$/, repo: /^(view|list)$/, run: /^(view|list)$/, auth: /^(token|status)$/, search: /./ };
const GIT = /^(log|show|diff|status|rev-parse|ls-files|ls-tree|cat-file|grep|blame|merge-base|shortlog|describe)$/;
// The plugin's scripts that only read, or the subcommands of those that record the verdict.
const SCRIPTS = { gate: null, facts: null, rules: null, lessons: null, feedback: null, verdicts: /^(start|set|fail|list)?$/, repos: /^list$/ };

// Where it may keep what it read, such as a long diff: a temp or scratchpad folder, by its literal path.
const TEMP = /(^|[\\/])(te?mp|scratchpad)[\\/]/i;
const isTemp = (path) => TEMP.test(path) && !path.includes("..");
const unquote = (x = "") => x.replace(/^["']|["']$/g, "").replace(/\\/g, "/");

const no = (what) => `Argos validates read only, so ${what} is refused. Read with Read, Grep, Glob, gh pr view|diff|checks and gh api (GET), and record with verdicts.mjs. Never run the PR's code.`;

// Why this one command may not run, or null.
function commandRefused(words, raw, scripts, here) {
  const name = words[0].toLowerCase();
  if (name === "gh") {
    const [, area, sub] = words;
    if (area === "api") {
      const method = /(?:^|\s)(?:-X\s*|--method[=\s]+)(\S+)/i.exec(words.join(" "))?.[1];
      if (method) return /^get$/i.test(method) ? null : `gh api ${method}`;
      if (!words.some((w) => /^(-f|-F|--field|--raw-field|--input)(=|$)/.test(w))) return null;
      return sub === "graphql" && !/\bmutation\b/i.test(raw) ? null : "gh api with fields (a POST)";
    }
    return GH[area]?.test(sub ?? "") ? null : `gh ${[area, sub].filter(Boolean).join(" ")}`;
  }
  if (name === "git") {
    let at = 1;
    while (words[at] === "--no-pager" || words[at] === "-C") at += words[at] === "-C" ? 2 : 1;
    if (!GIT.test(words[at] ?? "")) return `git ${words[at] ?? ""}`.trim();
    return words.some((w) => /^--(output|open-files-in-pager|ext-diff)/.test(w)) ? `git ${words[at]} with a flag that writes or runs` : null;
  }
  if (name === "node") {
    const given = unquote(words[1]);
    const path = /^([a-z]:)?\//i.test(given) ? given : `${here}/${given}`; // relative only after a cd we saw
    const root = `${scripts.replace(/\\/g, "/").replace(/\/$/, "")}/`;
    const script = path.toLowerCase().startsWith(root.toLowerCase()) ? /^([\w-]+)\.mjs$/.exec(path.slice(root.length))?.[1] : null;
    if (!script || !Object.hasOwn(SCRIPTS, script)) return `node ${words[1] ?? ""} (only ${root}<script>.mjs, by its full path)`.trim();
    return !SCRIPTS[script] || SCRIPTS[script].test(words[2] ?? "") ? null : `${script}.mjs ${words[2] ?? ""}`.trim();
  }
  if (!READERS.has(name)) return words[0];
  if (name === "mkdir" && !words.slice(1).every((w) => w.startsWith("-") || isTemp(unquote(w)))) return "mkdir outside a temp folder";
  if (name === "find" && words.some((w) => /^-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)/.test(w))) return "find with a flag that writes or runs";
  if (name === "sed" && words.some((w) => /^(-[a-zA-Z]*i|--in-place)/.test(w))) return "sed -i";
  return null;
}

// Why this shell line may not run, or null. Quoted text and heredocs are data, not commands: a
// finding that quotes `gh pr merge` must get through.
function shellRefused(command, scripts) {
  const noData = command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2[ \t]*(?=\n|$)/g, "")
    .replace(/@'[\s\S]*?'@|@"[\s\S]*?"@/g, "")
    .replace(/'[^']*'|"(?:[^"\\`$]|\\.)*"/g, (q) => (/[;&|<>\n`()]/.test(q) ? '""' : q));
  const inner = [];
  let text = noData;
  for (let was; was !== text; ) {
    was = text;
    text = text.replace(/\$\(([^()]*)\)|`([^`]*)`/g, (_, a, b) => (inner.push(a ?? b), "X"));
  }
  const lines = [text, ...inner].map((l) => l.replace(/\d?>&\d|\d?>>?\s*(\/dev\/null|\$null|NUL)\b/gi, ""));
  for (const l of lines)
    for (const [, target] of l.matchAll(/>>?\s*("[^"]*"|'[^']*'|[^\s;&|]*)/g))
      if (!isTemp(unquote(target))) return `writing to ${target || "a file"} (only a temp or scratchpad folder, by its literal path)`;
  let here = "";
  for (const part of lines.flatMap((l) => l.split(/;|&&|\|\||\||&|\n/))) {
    const bare = part
      .replace(/^\s*(?:(?:do|then|else|if|while|until|\{|\()\s+)*/, "")
      .replace(/^(?:\w+=(?:"[^"]*"|'[^']*'|\S*)\s*)+/, "")
      .replace(/^\$[\w:]+\s*=\s*\(?/, "")
      .trim();
    const words = bare.split(/\s+/).filter(Boolean);
    if (!words.length || /^(for|do|then|else|done|fi|\}|\))$/.test(words[0])) continue;
    if (/^(cd|set-location)$/i.test(words[0])) here = unquote(words[1]);
    const refused = commandRefused(words, command, scripts, here);
    if (refused) return refused;
  }
  return null;
}

// Why a validating agent may not make this call, as what it is told, or null. `input` is the tool
// call as the hook sees it, `scripts` the plugin's scripts folder.
export function refused(tool, input, scripts) {
  if (tool.startsWith("mcp__ccd_turn__")) return null; // the session's own task list
  if (tool.startsWith("mcp__")) return MCP_WRITE.test(tool.split("__").pop()) ? no(tool) : null;
  if (!TOOLS.has(tool)) return no(`the ${tool} tool`);
  const reads = [input.file_path, input.path, input.command].filter((x) => typeof x === "string");
  const clean = (x) => x.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2[ \t]*(?=\n|$)/g, "");
  if (reads.some((x) => SECRET_PATH.test(clean(x)))) return no("reading a credential file");
  if (!SHELLS.has(tool)) return null;
  const why = shellRefused(input.command ?? "", scripts);
  return why ? no(why) : null;
}
