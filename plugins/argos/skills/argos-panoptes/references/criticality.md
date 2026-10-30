# Criticality rubric

The review level comes from the task, never from the PR alone. `scripts/facts.mjs` applies this rubric; this file explains it.

## Order of precedence

1. **Personal rubric** for the repo, in `~/.claude/kl-akasha/criticality.json` (outside any repo, so team repositories are never touched).
2. **Default rubric**: the Jira `Priority` field.
3. **Nothing found**: `normal`, flagged as *presumed* at the top of the review.

Risk signals then raise the level by one step. They never lower it.

## Default rubric (Jira Priority)

| Priority | Level |
|---|---|
| Highest, High | critical |
| Medium | normal |
| Low, Lowest | low |

## Risk signals

- **Labels:** `hotfix`, `security`, `incident`, `urgent`, `critical`, `p0`, `sev0`, `sev1`.
- **Paths with a large blast radius:** auth, sessions, permissions, tokens, secrets, crypto, payments and billing, migrations and schemas, middleware, env files, CI workflows, infrastructure.

## Personal rubric format

One entry per `owner/repo`. `map` turns the value the team uses (lower-cased) into a level:

```json
{
  "acme/portal": { "source": "Jira Priority", "map": { "blocker": "critical", "major": "normal", "minor": "low" } },
  "acme/web": { "source": "label", "map": { "p0": "critical", "p1": "critical", "p2": "normal", "p3": "low" } }
}
```

`source` is a note for people: where the value comes from (a field, a label, another tracker). Pass that value to `facts.mjs` with `--priority`.

When a review had to presume the level, offer once to save an entry for that repo, then write it on a yes.
