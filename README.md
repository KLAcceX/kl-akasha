<div align="center">

# KL · Akasha

**The record of all knowledge: a personal skill library for AI.**

![Status](https://img.shields.io/badge/status-in%20progress-orange)
![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-D97757?logo=anthropic&logoColor=white)
![Plugins](https://img.shields.io/badge/plugins-1-blue)
![Skills](https://img.shields.io/badge/skills-3-blue)
![Languages](https://img.shields.io/badge/UI-en%20%7C%20pt--BR-green)

</div>

---

## At a glance

| | |
|---|---|
| **What** | A collection of Claude Code skills, grouped by domain and installable as plugins |
| **For** | My own work and any other project where I use AI |
| **First domain** | Pull requests: watch, review and never let a PR go stale |
| **Format** | A Claude Code plugin marketplace: one domain = one plugin, each with its skills |

---

## Why "Akasha"

In Sanskrit, *ākāśa* is the ether, the space that holds everything. Many traditions later took up the idea of the **Akashic records**: a cosmic library holding all knowledge that ever existed.

That is what this repository aims to be: the place where every "how to" worth teaching an AI is kept.

It is a sibling of `kl-ouroboros`, the serpent that eats its own tail.

---

## Pantheon

Each domain takes the name of an entity, from any mythology, whose nature fits the domain's job.

| Plugin | Domain | Name origin | Status |
|---|---|---|---|
| **Argos** | Pull requests | Argos Panoptes, the hundred-eyed giant who never fully slept | 🚧 in progress |
| **Anubis** | Triangulation: weighs what the task asks against what was built and what the PR says | Anubis, who weighs the heart against the feather of truth | 💭 planned |
| *tbd* | Code quality | | 💭 planned |
| *tbd* | Security | | 💭 planned |

**Reserved:** **Janus**, god of doorways, for merge, release and deploy; **Thoth**, the scribe who records the weighing, for tech-debt and task logging.

> Every name goes through the council before it lands here.

### Argos: the PR watcher

A PR-count target means many PRs get opened, and the forgotten ones weigh on *stale time*. Argos exists so no PR sits idle without someone noticing.

Hera set Argos to guard Io. He had a hundred eyes and never closed them all at once. When he fell, Hera set his eyes on the peacock's tail, where they still watch.

| Skill | Myth | What it does |
|---|---|---|
| `argos-ward` | What lies under his guard | Watches my open PRs (comments, reviews, change requests, CI, conflicts), the PRs waiting for my review, and teammates' PRs in the connected repos. Oldest first, because the oldest weighs most on stale time. |
| `argos-pavo` | The eyes on the peacock, watching while he is away | Runs a vigil round over the connected repos and reports only what changed. Also connects and disconnects repos when asked in plain language. |
| `argos-panoptes` | "The all-seeing" | Reviews a teammate's PR with as many eyes as the task deserves: reads the task (Jira key from the branch), sets the level from its priority (raised by risky paths or labels, never lowered), checks the Gherkin scenarios, splits reviews over 400 lines, and drafts findings by severity plus suggested tasks. **Argos sees, you judge:** nothing is posted without your yes. |

**The eyes inside Claude.** The plugin ships a mod that runs the vigil on its own timer, at no token cost. It shows a band above the prompt with the KL · Akasha mark and the next action, toasts what is new, and `/argos` opens a pane that reads at a glance. Its head carries the KL · Akasha mark and "Argos" with a tally of open PRs under them (yours, reviewed, still to review), and on the right when Argos last looked beside a Check now button. Under the head, filters switch the list between **All** open PRs, the ones that **Need my help** (teammates' PRs waiting on your review), yours **To fix** (changes requested, open threads, a conflict, a failed CI) and **Mine**, each with its count. Below, every connected repo, zeros included, its counts following the filter: a checkbox that picks all its PRs, its counts as coloured icons with numbers (red **blocked**, amber **review asked**, blue **comments**, purple **changed since your review**), and "N PRs" to open them. Each open PR then hangs on its own line with its checkbox, title, owner, age and number, a short action in its signal's colour, and on someone else's PR **Approve** and **Approve and merge**. The list ends with **Add a repository**, which puts `/argos repos add ` in the prompt for a local folder or an owner/name. Picks survive a filter switch: the send bar sends them all and says how many the filter hides. Every action, like the send bar's button for the picked PRs (yours to fix with argos-ward, the others to review with Panoptes), only puts a request in the prompt, never twice, and nothing reaches GitHub until you send it. Stale data or a big batch is flagged before you press. Icons are from [Tabler Icons](https://tabler.io/icons) (MIT). `/argos demo` fills the pane with a sample round (several repos, every signal) to look at it without real PRs; a plain `/argos` goes back to your data. With several sessions open, only one runs each round.

**Connected repositories.** `/argos repos add <folder>` reads the folder's git remote (SSH host aliases included) and connects it; `/argos repos` lists them and `/argos repos remove <owner/repo>` drops one. Asking the AI works too ("connect folder X to Argos"). The vigil watches only connected repos: with none, it searches nothing. Once connected, it also lists **all teammates' open PRs**, asked for review or not.

**Language.** The plugin's `language` option (`en` or `pt-BR`) switches the words of the band, the pane and the notices. Signals are stored as codes, so switching never shows old PRs as new.

---

## Layout

```
kl-akasha/
├── .claude-plugin/
│   └── marketplace.json        # catalog: every plugin in this repo
├── plugins/
│   └── argos/                  # one domain = one plugin = one entity
│       ├── .claude-plugin/
│       │   └── plugin.json     # name, version, options
│       ├── hooks/              # the in-Claude mod (band, pane, timer)
│       ├── types/              # the mod's state contract
│       └── skills/
│           ├── argos-ward/
│           │   ├── SKILL.md
│           │   └── scripts/    # ward.mjs, i18n.mjs
│           ├── argos-pavo/
│           │   ├── SKILL.md
│           │   └── scripts/    # pavo.mjs, repos.mjs
│           └── argos-panoptes/
│               ├── SKILL.md
│               ├── scripts/    # facts.mjs
│               └── references/ # criticality rubric, review levels
└── README.md
```

Personal state and settings live **outside** the repo, in `~/.claude/kl-akasha/`, so nothing touches team repositories.

### Rules

1. **One domain, one plugin.** Code quality, security and tasks each get their own folder under `plugins/`. Looking for something about PRs? Go to `plugins/argos/` and nowhere else.
2. **Skills carry the entity's prefix.** `argos-ward`, not `ward`: no clashes across plugins, and the origin is clear when invoking.
3. **Each plugin stands alone.** Claude Code copies only the plugin's folder on install, so nothing may depend on files outside it.
4. **Keep `SKILL.md` lean.** Long checklists and references go in supporting files, loaded only when needed.
5. **Install only what you need.** Each domain is a plugin, so a project can take Argos without the rest.

## Contributing

This is a personal library with a single maintainer, so it does not take pull requests from outside. Forks are welcome under the license below.

## License

[MIT](LICENSE) © 2026 KLAcceX. The Argos pane's icons are from [Tabler Icons](https://tabler.io/icons), also MIT.

---

<div align="center">

*Usage and installation: coming soon.*

</div>
