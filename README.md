<div align="center">

# KL · Akasha

**The record of all knowledge: a personal skill library for AI.**

![Status](https://img.shields.io/badge/status-in%20progress-orange)
![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-D97757?logo=anthropic&logoColor=white)
![Plugins](https://img.shields.io/badge/plugins-2-blue)
![Skills](https://img.shields.io/badge/skills-2-blue)
![Languages](https://img.shields.io/badge/UI-en%20%7C%20pt--BR-green)

</div>

---

## At a glance

| | |
|---|---|
| **What** | A collection of Claude Code skills, grouped by domain and installable as plugins |
| **For** | My own work and any other project where I use AI |
| **Domains** | Pull requests (Argos) and redaction (Lethe) |
| **Format** | A Claude Code plugin marketplace: one domain = one plugin = one skill |

---

## Install

Add the marketplace once, then install the plugins you want:

```bash
claude plugin marketplace add KLAcceX/kl-akasha
claude plugin install argos@kl-akasha
claude plugin install lethe@kl-akasha
```

Inside Claude Code, the same commands work as `/plugin marketplace add KLAcceX/kl-akasha` and `/plugin install argos@kl-akasha`.

Get new versions with `claude plugin marketplace update kl-akasha`. Remove a plugin with `claude plugin uninstall <name>@kl-akasha`.

| Plugin | Needs |
|---|---|
| Argos | [GitHub CLI](https://cli.github.com), Node.js 18+ |
| Lethe | Python 3.9+; for publishing a repo, also [git-filter-repo](https://github.com/newren/git-filter-repo) and the GitHub CLI |

Each plugin's README covers its first steps, commands and options.

---

## Pantheon

Each domain takes the name of an entity, from any mythology, whose nature fits the domain's job.

| Plugin | Domain | Name origin | Status |
|---|---|---|---|
| [**Argos**](plugins/argos/README.md) | Pull requests: watch, fix, review, learn from reviews, never let a PR go stale | Argos Panoptes, the hundred-eyed giant who never fully slept | 🚧 in progress |
| [**Lethe**](plugins/lethe/README.md) | Redaction: content goes from A to B without what B must not know | Lethe, the river of forgetting the dead drank from before rebirth | 🚧 in progress |
| **Anubis** | Triangulation: weighs what the task asks against what was built and what the PR says | Anubis, who weighs the heart against the feather of truth | 💭 planned |
| *tbd* | Code quality | | 💭 planned |
| *tbd* | Security | | 💭 planned |

**Reserved:** **Janus**, god of doorways, for merge, release and deploy; **Thoth**, the scribe who records the weighing, for tech-debt and task logging.

> Every name goes through the council before it lands here.

---

## Why "Akasha"

In Sanskrit, *ākāśa* is the ether, the space that holds everything. Many traditions later took up the idea of the **Akashic records**: a cosmic library holding all knowledge that ever existed.

That is what this repository aims to be: the place where every "how to" worth teaching an AI is kept.

It is a sibling of `kl-ouroboros`, the serpent that eats its own tail.

---

## Layout

```
kl-akasha/
├── .claude-plugin/
│   └── marketplace.json        # catalog: every plugin in this repo
├── plugins/
│   ├── argos/                  # one domain = one plugin = one entity
│   │   ├── README.md           # for people: install, jobs, commands, options
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json     # name, version, options
│   │   ├── hooks/              # the in-Claude mod (band, pane, timer)
│   │   ├── types/              # the mod's state contract
│   │   └── skills/
│   │       └── argos/
│   │           ├── SKILL.md    # for the AI: picks the job
│   │           ├── scripts/    # queue, feedback, lessons, facts, rules, round, repos
│   │           └── references/ # one file per job, rubric, review levels, evidence
│   └── lethe/
│       ├── README.md
│       └── skills/
│           └── lethe/
│               ├── SKILL.md
│               └── scripts/    # redact.py (content), publish.py (repo mirror)
└── README.md
```

Personal state and settings live **outside** the repo, in `~/.claude/kl-akasha/`, so nothing touches team repositories.

### Rules

1. **One domain, one plugin.** Code quality, security and tasks each get their own folder under `plugins/`. Looking for something about PRs? Go to `plugins/argos/` and nowhere else.
2. **One entity, one name.** A plugin's skill takes the entity's name and nothing else (`argos`, `lethe`), and its jobs live inside it. Sub-names are hard to remember and tie a skill to a single job.
3. **Each plugin stands alone.** Claude Code copies only the plugin's folder on install, so nothing may depend on files outside it.
4. **README for people, SKILL.md for the AI.** Each plugin has one README: install, jobs, commands, options. `SKILL.md` stays lean; long checklists go in `references/`, loaded only when needed.
5. **Install only what you need.** Each domain is a plugin, so a project can take Argos without the rest.

## Contributing

This is a personal library with a single maintainer, so it does not take pull requests from outside. Forks are welcome under the license below.

## License

[MIT](LICENSE) © 2026 KLAcceX. The Argos pane's icons are from [Tabler Icons](https://tabler.io/icons), also MIT.
