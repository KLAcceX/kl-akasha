---
name: lethe
description: Carry content from A to B without what must be forgotten. Cleans text, files, folders, transcripts, logs and git repos of secrets, tokens, e-mails, phones, IDs, local paths, machine-only commands, people's names, client and company names, keeping the content usable through stable tags ("[person 1]" stays the same person). Also publishes a private repo to its public mirror as releases, one sanitized commit per CHANGELOG entry, never the private history, scanned and pushed only on a yes. Use whenever the user wants to clean, sanitize, redact, anonymize or scrub something before sharing, pasting, sending, posting or publishing it, asks to remove names, secrets or personal data, or asks if something is safe to share or go public, or asks to release, publish or write the changelog for a release, in any language.
---

# Lethe

Lethe is the river of forgetting: souls drank from it before being reborn, and crossed without the memory of the life before. Content does the same here: it goes from A to B and arrives without what B must not know.

**The model finds; the script replaces and checks.** Patterns catch secrets, e-mails, phones, IDs and paths. Nothing but reading catches a person's name, a client, a codename or the detail that gives someone away, so that part is yours.

## 1. A, B and what to forget

Settle three things, asking only what the request leaves open:

- **A:** the file, folder or text (save pasted text to a file in the scratchpad first; convert `.docx` and `.pdf` to text first).
- **B:** where the clean copy goes. Never A itself: Lethe keeps the source as it was.
- **What to forget**, as profiles plus rules:

| Profile | Forgets |
|---|---|
| `security` | tokens, API keys, private keys, JWTs, secret values, URLs with credentials, e-mails, local paths, machine-only commands, private IPs, internal hosts, SSH host aliases |
| `people` | e-mails, phones, CPF, CNPJ |

Both are on by default. Names, companies and codenames go in the rules file.

## 2. Scan A

```bash
python <skill-dir>/scripts/redact.py scan <A> [--profile security,people]
```

It lists what the patterns see in A, which files hold private data by name (`.env`, keys, credentials) and which are not text. It changes nothing.

## 3. Read A and write the rules

Read A yourself for what no pattern sees:

- **people**, in every form: full name, first name, nickname, initials, the e-mail user, the `@handle`;
- **companies, clients, products, codenames, internal URLs**;
- **details that identify** by themselves: "the CTO's wife", an exact address. Keep them only if the user's goal needs them.

Write the rules to a JSON file in `~/.claude/kl-akasha/lethe/`, named after the job. It holds the real names, so it never goes in B or in a repo that goes public:

```json
{
  "replace": {
    "Maria Silva": "[person 1]",
    "Maria": "[person 1]",
    "regex:(?i)acme\\s*corp": "[client 1]"
  },
  "deny": ["(?i)project falcon"],
  "allow": ["noreply@example\\.com"]
}
```

- **One tag per entity, across all its forms.** That way the content still reads.
- Write tags in the content's language (a transcript in Portuguese gets Portuguese tags). Keep the role when the user needs it (`[Pessoa 1, PO]`).
- Literal keys match whole words, ignoring case, with longer keys first, so "Maria" never breaks "Mariana".
- `deny` lists what must never reach B. `allow` lists what may stay.

## 4. Write B

```bash
python <skill-dir>/scripts/redact.py apply <A> <B> --rules <rules.json> [--profile security,people]
```

The report shows these lines:

| Line | Meaning |
|---|---|
| `replaced` | each tag and how many times it went in |
| `left behind` | files not copied: private by name, or not UTF-8 text |
| `left in B` | anything denied or forgotten that is still in B. The run then exits 1 |

## 5. Read B back

The script only knows what you told it. Read B as the person who will receive it:

- a name in a form you missed;
- a signature;
- a file name;
- a detail that still points to someone.

Add what you find to the rules and apply again until B is clean. Then tell the user:

- where B is;
- the tags and counts (not the real names, unless they ask);
- what was left behind;
- where the rules file is, which is also what reverses the tags.

## Git repos: publish a private repo to its public mirror

`apply` cleans the files of a checkout, not its history. For a private repo with a public mirror, use `publish.py`. The mirror gets **releases, never the private history**: each publish is one commit holding the private branch's current files, sanitized, whose message is the newest `CHANGELOG.md` entry, tagged `v<version>`. Nothing else goes to the mirror: no branches, no other commits, no other tags.

The rules live in the private repo, in `.claude/lethe/`:

| File | Holds |
|---|---|
| `config.json` | `account` (gh login), `private` and `public` (remote names), `repo` (owner/name of the public mirror), `branch`, and `author` (`Name <GitHub noreply e-mail>`, who signs the release commits) |
| `replace.txt` | `git filter-repo --replace-text` rules, applied to the published files |
| `strip.txt` | paths dropped from every release, one per line: a path or folder, `glob:` or `regex:`, as `git filter-repo` reads them; it must drop `.claude/lethe/` |
| `deny.txt` | regexes that must never appear in public |
| `allow.txt` | hits the scan may find on purpose |

`CHANGELOG.md`, at the private repo's root, is published with each release. Notable changes go under `## [Unreleased]` as they land. A release is the newest `## [x.y.z] - YYYY-MM-DD` heading and the lines under it.

### Write the release entry

```bash
python <skill-dir>/scripts/publish.py draft
```

`draft` lists the private commits since the last release (the `release/v<version>` tag it leaves after each push), grouped by scope. From it, write or finish the entry for the people who install the plugins: what each plugin gained, changed or fixed, in Keep a Changelog sections (Added, Changed, Fixed, Removed), never a list of commits. Pick the version: minor for new jobs or features, patch for fixes. Show the entry to the user, then commit it and push it to the private remote.

### Check and push

From the private checkout, with everything committed and pushed to the private remote:

```bash
python <skill-dir>/scripts/publish.py check
```

`check` builds the release, scans every file and the message, compares with the public branch and reads the public repo's settings. It changes nothing.

| Report line | Meaning | Do |
|---|---|---|
| `release` / `changelog` | the version and entry that will become the commit | show them to the user |
| `files` | what changed since the last public release | show it |
| `rewritten by the rules` | files whose public copy differs from the private one | say which rule did it; a surprise means a rule is too broad |
| `leaks` | anything the scan found that is not allowed | see below; anything listed stops the push |
| `history: public holds N commits that are not releases` | the mirror still has history from before releases | stop and explain; replacing it takes `push --reset` and the user's explicit yes |
| `not releases on public` | branches or tags on the mirror that are not releases | they should not be there; `--reset` deletes them |
| `protections missing` | public repo settings that should be on, including that no branch but main can be created | tell the user, then `publish.py protect` |
| `stop: …` | why this cannot be published yet: no entry, a version already public, the same files | fix it in the private repo |

Handle leaks this way:

- **A leak in the current files:** fix it at the source in the private repo, commit, push and check again.
- **A word that must always be cut:** add it to `replace.txt` (`literal==>replacement` or `regex:...==>...`).
- **A false alarm:** add the exact hit to `allow.txt` and say so. Never allow a secret.

Show the user what will go and ask. Push only on a clear yes:

```bash
python <skill-dir>/scripts/publish.py push
```

`push` builds and checks everything again, then pushes the release commit on top of the public branch with its tag, and tags the private branch `release/v<version>`. Never push to the public remote any other way.

**Once, to move a mirror to releases:** `push --reset` replaces the whole public history with this release as its only commit and deletes public branches and tags that are not releases. It pauses the rule that stops force pushes and always restores it. It rewrites what everyone sees, so ask with those words and run it only on an explicit yes.

## Self-check

`python <skill-dir>/scripts/redact.py --self-test && python <skill-dir>/scripts/publish.py --self-test`
