---
name: lethe
description: Carry content from A to B without what must be forgotten. Cleans text, files, folders, transcripts, logs and whole git histories of secrets, tokens, e-mails, phones, IDs, local paths, machine-only commands, people's names, client and company names, keeping the content usable through stable tags ("[person 1]" stays the same person). Also publishes a private repo to its public mirror, sanitized, scanned and pushed only on a yes. Use whenever the user wants to clean, sanitize, redact, anonymize or scrub something before sharing, pasting, sending, posting or publishing it, asks to remove names, secrets or personal data, or asks if something is safe to share or go public, even if they only say "limpa isso", "tira os nomes", "anonimiza esse transcrito", "posso mandar isso?", "publica", "manda pro público" or "pode subir?".
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
- Write tags in the content's language (`[Pessoa 1]` in a Portuguese transcript). Keep the role when the user needs it (`[Pessoa 1, PO]`).
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

`apply` cleans the files of a checkout, not its history. Every old commit still holds what was removed. For a private repo with a public mirror, use `publish.py`. It runs `git filter-repo`, so history, commit messages and authors are cleaned too.

The rules live in the private repo, in `.claude/lethe/`:

| File | Holds |
|---|---|
| `config.json` | `account` (gh login), `private` and `public` (remote names), `repo` (owner/name of the public mirror) and `branch` |
| `replace.txt` | `git filter-repo --replace-text` rules, applied to files and commit messages |
| `mailmap.txt` | personal e-mail → GitHub noreply |
| `strip.txt` | paths dropped from every commit; it must drop `.claude/lethe/` |
| `deny.txt` | regexes that must never appear in public |
| `allow.txt` | hits the scan may find on purpose |

From the private checkout, with everything committed and pushed to the private remote, run:

```bash
python <skill-dir>/scripts/publish.py check
```

`check` builds the sanitized clone and scans every commit, message and file. It also compares the result with the public branch and reads the public repo's settings. It changes nothing.

| Report line | Meaning | Do |
|---|---|---|
| `to publish` | commits the public repo does not have yet | show them to the user |
| `rewritten by the rules` | files whose public copy differs from the private one | say which rule did it; a surprise means a rule is too broad |
| `leaks` | anything the scan found that is not allowed | see below; anything listed stops the push |
| `history: DIVERGED` | a rule rewrote a commit already public, or the public repo got its own commits | stop and explain; a force push needs the user's explicit yes |
| `protections missing` | public repo settings that should be on | tell the user, then `publish.py protect` |

Handle leaks this way:

- **A leak in the current files:** fix it at the source in the private repo, commit, push and check again.
- **A leak only in old commits, or a word that must always be cut:** add it to `replace.txt` (`literal==>replacement` or `regex:...==>...`). That changes the SHAs it touches; if those commits are already public, the check reports DIVERGED, so ask the user first.
- **A false alarm:** add the exact hit to `allow.txt` and say so. Never allow a secret.

Show the user what will go and ask. Push only on a clear yes:

```bash
python <skill-dir>/scripts/publish.py push
```

`push` builds and checks everything again, and pushes only when every line passes. Never push to the public remote any other way.

## Self-check

`python <skill-dir>/scripts/redact.py --self-test`
