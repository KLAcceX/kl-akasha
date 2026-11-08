# Diff

Check only what a change touches: a pull request, a branch or the working tree. Problems enter a little at a time, so this is the cheapest way to keep a clean app clean.

## Steps

1. Get the changed files: `git diff --name-only <base>...HEAD` (or the PR's file list).
2. Map them to controls:

| The change touches | Run |
|---|---|
| CSS, design tokens, `tailwind.config.*`, theme files | ACS-01 contrast (`contrast.mjs tokens`), ACS-03 focus styles |
| Components or pages (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`) | `scan.mjs` on the changed files: ACS-02, ACS-03, ACS-04, ACS-05, ACS-06 |
| `<head>`, layout, `index.html`, tag managers, third-party scripts | ACS-06, ACS-07 (overlays) |
| Marketing copy, landing pages | ACS-07 (compliance claims) |

3. Report only findings on changed lines, plus any control the change made worse (a token now failing). Use the same five verdicts; a control the diff does not touch is not part of the result.

Argos can ask for this job when it validates a PR; the output is the same verdicts, ready to become review comments.
