# Criticality: how deep to look

The level comes from the task first and the change second. `scripts/facts.mjs` suggests one; you decide, because what matters is what the change *does*, which a filename can't tell.

## 1. The task's priority, through a rubric

1. **Personal rubric** for the repo in `~/.claude/kl-akasha/criticality.json` (outside any repo, so team repositories are never touched).
2. **Default rubric** when there is none:

| Priority | Level |
|---|---|
| Highest, High (or Blocker, Critical, P0, P1) | critical |
| Medium (or Major, P2) | normal |
| Low, Lowest (or Minor, Trivial, P3, P4) | low |

3. **No priority field at all:** read the task text. Words like "urgent", "customer blocked", "production down", "hotfix" or a deadline point to critical; a typo or copy change points to low. Otherwise normal, and say it was **presumed**.

## 2. What the change touches can raise it

Raise one step (never lower) when the diff really touches something with a large blast radius:

- authentication, sessions, permissions, roles;
- secrets, tokens, crypto;
- money: payments, billing, prices, discounts, invoices;
- data shape or data loss: migrations, schema changes, deletes and bulk updates;
- shared plumbing: middleware, shared types and contracts, CI, infrastructure, env files.

The script flags these by path and label as **hints**. Confirm by reading the diff: a renamed comment in `auth/` is not a risk; an `UPDATE` without a `WHERE` in a file called `utils.ts` is.

## 3. Say why

The review opens with one line such as: `Level: critical — task priority High (default rubric); also touches discount calculation`. If you presumed or overrode the suggestion, say so.

## Personal rubric format

One entry per `owner/repo`; `map` turns the value the team uses (lower-cased) into a level:

```json
{
  "acme/portal": { "source": "Jira Priority", "map": { "blocker": "critical", "major": "normal", "minor": "low" } },
  "acme/web": { "source": "label", "map": { "p0": "critical", "p1": "critical", "p2": "normal", "p3": "low" } }
}
```

When a review had to presume the level, offer once to save an entry for that repo and write it on a yes.
