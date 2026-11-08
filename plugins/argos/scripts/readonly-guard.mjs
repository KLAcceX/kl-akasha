// The validating agent's PreToolUse hook: holds each of its calls to what readonly.mjs allows.
// usage: node readonly-guard.mjs <scripts folder>, with the hook's JSON on stdin.
// A check that fails refuses, so a broken guard never frees an agent; the import is inside it
// because a hook that merely crashes lets the call through.

let why;
try {
  const { refused } = await import("./readonly.mjs");
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const { tool_name, tool_input } = JSON.parse(raw);
  why = refused(tool_name, tool_input ?? {}, process.argv[2]);
} catch {
  why = "Argos could not check this call, so it is refused.";
}
if (why)
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: why } }));
