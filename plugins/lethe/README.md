# Lethe: what crosses, forgets

Souls drank from the Lethe before being reborn, and crossed without the memory of the life before. Content does the same here: it goes from A to B and arrives without what B must not know, still usable.

## Install

```bash
claude plugin marketplace add KLAcceX/kl-akasha
claude plugin install lethe@kl-akasha
```

Inside Claude Code, `/plugin marketplace add KLAcceX/kl-akasha` and `/plugin install lethe@kl-akasha` do the same.

**Needs:**
- **Cleaning content:** Python 3.9 or newer.
- **Publishing a repo:** also [git-filter-repo](https://github.com/newren/git-filter-repo) and the [GitHub CLI](https://cli.github.com).

## What it does

One skill, `lethe`. Ask in plain language, in any language: "clean this before I send it", "remove the names from this transcript", "is this safe to share?", "publish".

| Job | What it does |
|---|---|
| **Clean content** | Takes a text, file, folder, transcript or log from A to B. Secrets, tokens, e-mails, phones, CPF/CNPJ, local paths, machine-only commands and private IPs become stable tags (`[e-mail 1]`). The AI reads for what no pattern sees (people, clients, codenames) and writes it into a private rules file, so `[person 1]` stays the same person everywhere and the content still reads. B is then read back for anything left. The source is never touched. |
| **Publish a repo** | Carries a private repo to its public mirror as **releases**: one commit per release, holding the current files with forgotten words rewritten and private paths dropped, whose message is the newest `CHANGELOG.md` entry, tagged `v<version>`. The private history, branches and work in progress never cross. It drafts the entry from the commits since the last release, scans every file and the message, checks the mirror's protections (including that no branch but `main` can be created there), and pushes only on your yes. |

**The model finds; the script replaces and checks.** Patterns catch what has a shape. A name, a client or a detail that gives someone away only shows up by reading, so that part is the AI's, and it shows you what it found.

## The rules

The rules hold what must be forgotten, so they never travel with B:

| Job | Rules live in | Holds |
|---|---|---|
| Clean content | `~/.claude/kl-akasha/lethe/<job>.json` | `replace` (real name → tag), `deny` (must never reach B), `allow` (may stay) |
| Publish a repo | the private repo's `.claude/lethe/` | `config.json` (with the `author` who signs releases), `replace.txt`, `strip.txt`, `deny.txt`, `allow.txt`. `strip.txt` must drop `.claude/lethe/` itself, or nothing is published. |

## By hand

```bash
python scripts/redact.py scan <A>
python scripts/redact.py apply <A> <B> --rules <rules.json>
python scripts/publish.py draft     # from the private checkout: commits since the last release
python scripts/publish.py check     # builds the release from CHANGELOG.md; changes nothing
python scripts/publish.py push      # checks again, then pushes the release and its tag
```

## Check it

```bash
python scripts/redact.py --self-test
python scripts/publish.py --self-test
```
