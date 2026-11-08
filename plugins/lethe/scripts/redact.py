#!/usr/bin/env python3
"""Lethe redact: carry content from A to B without what must be forgotten.

The model finds what no pattern can (people, companies, codenames) and writes it into a
rules file. This script swaps those, and every secret, e-mail, phone, ID or local path the
profiles know, for stable tags ("[person 1]" is the same person in every file), writes B,
then reads B back for anything left.

Usage:
  python redact.py scan <path>... [--profile security,people] [--rules rules.json]
  python redact.py apply <A> <B> [--profile security,people] [--rules rules.json]
  python redact.py --self-test

rules.json holds the real names, so it lives outside B and outside any repo that goes public:
  {"replace": {"Maria Silva": "[person 1]", "Maria": "[person 1]", "regex:(?i)acme\\s*corp": "[client 1]"},
   "deny": ["(?i)project falcon"], "allow": ["noreply@example\\.com"]}
Literal keys match whole words, ignoring case, longest first; "regex:" keys are used as is.
"deny" lists what must never reach B (a hit fails the run); "allow" lists hits that may stay.
"""
import argparse, json, re, sys, tempfile
from collections import Counter
from pathlib import Path

PROFILES = {
    "security": {
        "github token": r"\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})",
        "api key": r"\b(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{35})",
        "aws key": r"\b(AKIA|ASIA)[A-Z0-9]{16}\b",
        "slack token": r"\bxox[abprs]-[A-Za-z0-9-]{10,}",
        "private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
        "jwt": r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
        "secret value": r"(?i)\b(password|passwd|secret|api[_-]?key|client[_-]?secret|token)\s*[:=]\s*['\"][^'\"\s$]{8,}['\"]",
        "url with credentials": r"\b[a-z+]+://[^/\s:@]+:[^/\s@]+@",
        "e-mail": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}",
        "local path": r"(?i)\b[a-z]:[\\/]+(users|projects|tmp|windows|program files)\b[^\s'\"`)]*|/Users/[\w.-]+|/home/(?!me\b)[\w.-]+",
        # bracketed so this file does not match itself
        "machine-only": r"(?i)%app[d]ata%|\$app[d]ata|app[d]ata[\\/]|\bdev-m[o]ds\b|scratchpad[\\/]|\.exe\"?\s+plugin\b",
        "private network": r"\b(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b",
        "internal host": r"(?i)\b[\w-]+(\.[\w-]+)*\.(internal|corp|lan|intra)\b|atlassian\.net|\.slack\.com",
        "ssh host alias": r"git@github-[\w-]+:",
    },
    "people": {
        "e-mail": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}",
        "phone": r"(?<![\w.])(\+\d{1,3}[\s.-]?)?\(?\d{2,3}\)?[\s.-]?\d{3,5}[\s.-]\d{4}(?![\w.])",
        "cpf": r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b",
        "cnpj": r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b",
    },
}
# Files that never cross, by name.
BAD_FILE = re.compile(r"(^|/)(\.env(\.[\w.-]+)?|[^/]+\.(pem|key|p12|pfx|keystore|jks)|id_(rsa|dsa|ecdsa|ed25519)|\.npmrc|\.pypirc|credentials(\.json)?)$")


def patterns(names):
    out = {}
    for n in names.split(","):
        out.update(PROFILES[n.strip()])
    return out


def load_rules(path):
    try:
        r = json.loads(Path(path).read_text(encoding="utf8")) if path else {}
    except json.JSONDecodeError as e:
        sys.exit(f"lethe: {path} is not valid JSON: {e}")
    return r.get("replace", {}), r.get("deny", []), r.get("allow", [])


def scan(text, where, pats, deny, allow, found):
    """Every hit in text, minus the allowed ones, into found[(kind, hit)] = {where}."""
    for kind, rx in [*pats.items(), *(("denied term", d) for d in deny)]:
        for m in re.finditer(rx, text):
            hit = m.group(0)
            if not any(re.fullmatch(a, hit) for a in allow):
                found.setdefault((kind, hit[:80]), set()).add(where)


def compile_replace(replace):
    return [(re.compile(k[6:]) if k.startswith("regex:") else re.compile(r"(?<!\w)" + re.escape(k) + r"(?!\w)", re.I), tag)
            for k, tag in sorted(replace.items(), key=lambda kv: -len(kv[0]))]


def redact(text, rules, pats, allow, tags, counts):
    """text with every pattern hit and rule swapped for its tag. tags keeps auto tags stable across files.
    Patterns go first, so a name rule never eats the local part of an e-mail."""
    for kind, rx in pats.items():
        def swap(m, kind=kind):
            hit = m.group(0)
            if any(re.fullmatch(a, hit) for a in allow):
                return hit
            tag = tags.setdefault((kind, hit), f"[{kind} {sum(k == kind for k, _ in tags) + 1}]")
            counts[tag] += 1
            return tag
        text = re.sub(rx, swap, text)
    for rx, tag in rules:
        text, n = rx.subn(lambda m: tag, text)
        counts[tag] += n
    return text


def walk(src):
    """(file, path relative to src) for src itself or every file under it, .git excluded."""
    if src.is_file():
        return [(src, Path(src.name))]
    return [(p, p.relative_to(src)) for p in sorted(src.rglob("*")) if p.is_file() and ".git" not in p.relative_to(src).parts]


def read(path):
    try:
        return path.read_bytes().decode("utf8")
    except UnicodeDecodeError:
        return None


def report(found):
    for (kind, hit), where in sorted(found.items()):
        print(f"  [{kind}] {hit!r} in {', '.join(sorted(map(str, where))[:3])}{' …' if len(where) > 3 else ''}")


def do_scan(paths, pats, replace, deny, allow):
    found, skipped = {}, []
    for src in map(Path, paths):
        for path, rel in walk(src):
            if BAD_FILE.search(rel.as_posix()):
                found.setdefault(("private file", rel.as_posix()), set()).add(rel)
            text = read(path)
            if text is None:
                skipped.append(rel.as_posix())
            else:
                scan(text, rel, pats, deny, allow, found)
    print("hits: " + ("none" if not found else ""))
    report(found)
    if skipped:
        print("not read (not UTF-8 text): " + ", ".join(skipped))
    return 1 if found else 0


def do_apply(a, b, rules_path, pats, replace, deny, allow):
    a, b = Path(a).resolve(), Path(b).resolve()
    if b == a or (a.is_dir() and a in b.parents):
        sys.exit("lethe: B must be outside A; redact never writes over the source.")
    if rules_path and (Path(rules_path).resolve() == b or b in Path(rules_path).resolve().parents):
        sys.exit("lethe: the rules file is inside B; it holds what must be forgotten, keep it out.")
    rules, tags, counts, left = compile_replace(replace), {}, Counter(), []
    for path, rel in walk(a):
        text = None if BAD_FILE.search(rel.as_posix()) else read(path)
        if text is None:
            left.append(f"{rel.as_posix()} ({'private file' if BAD_FILE.search(rel.as_posix()) else 'not UTF-8 text'})")
            continue
        out = b if a.is_file() else b / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(redact(text, rules, pats, allow, tags, counts).encode("utf8"))
    # read B back: no pattern hit, denied term or forgotten value may be left
    forgotten = [k[6:] if k.startswith("regex:") else r"(?i)(?<!\w)" + re.escape(k) + r"(?!\w)" for k in replace]
    found = {}
    if b.exists():
        for path, rel in walk(b):
            text = read(path)
            if text is not None:
                scan(text, rel, pats, deny + forgotten, allow, found)
    print(f"lethe: {a} → {b}")
    print("replaced: " + (", ".join(f"{t} ×{n}" for t, n in sorted(counts.items()) if n) or "nothing"))
    print("left behind: " + (", ".join(left) or "nothing"))
    print("left in B: " + ("none" if not found else ""))
    report(found)
    return 1 if found else 0


def self_test():
    found = {}
    allow = [r"36262767\+KLAcceX@users\.noreply\.github\.com"]
    pats = patterns("security,people")
    # fixtures are built at run time, so this file never matches its own patterns
    scan("token = 'ghp_" + "a" * 36 + "'", "a", pats, [], allow, found)
    scan("by maria" + "@acme.example and 36262767+KLAcceX" + "@users.noreply.github.com", "b", pats, [], allow, found)
    scan('run "C:' + r'\Users\bob\App' + r'Data\Roaming\x\claude.exe' + '" plugin validate', "c", pats, [], allow, found)
    scan("call (11) 9" + "8765-4321, cpf 123.456" + ".789-09, host 10.0." + "0.12", "d", pats, [], allow, found)
    scan("ACME Corp internal", "e", pats, [r"(?i)acme corp"], allow, found)
    kinds = {k for k, _ in found}
    assert {"github token", "secret value", "e-mail", "local path", "machine-only", "phone", "cpf", "private network", "denied term"} <= kinds, kinds
    assert not any("KLAcceX" in h for _, h in found)
    for text in ["release 2026-10-31", "id 1730000000", "v1.2.3", "10.0.0"]:
        f = {}
        scan(text, "x", PROFILES["people"], [], [], f)
        assert not f, (text, f)

    rules = compile_replace({"Maria Silva": "[person 1]", "Maria": "[person 1]", "regex:(?i)acme\\s*corp": "[client 1]"})
    tags, counts = {}, Counter()
    mail = "maria" + "@acme.example"
    out = redact(f"Maria Silva told MARIA and Mariana at Acme  Corp; write {mail} or {mail}, cc bob" + "@acme.example",
                 rules, pats, [], tags, counts)
    assert out == "[person 1] told [person 1] and Mariana at [client 1]; write [e-mail 1] or [e-mail 1], cc [e-mail 2]", out
    assert counts["[person 1]"] == 2 and counts["[e-mail 1]"] == 2

    with tempfile.TemporaryDirectory() as tmp:
        a, b = Path(tmp) / "a", Path(tmp) / "b"
        (a / "notes").mkdir(parents=True)
        (a / "notes" / "call.txt").write_text("Maria Silva: send it to " + mail + "\n", encoding="utf8")
        (a / ".env").write_text("API=1\n", encoding="utf8")
        (a / "logo.png").write_bytes(b"\x89PNG\xff\xfe")
        rules_file = Path(tmp) / "rules.json"
        rules_file.write_text(json.dumps({"replace": {"Maria Silva": "[person 1]"}, "deny": ["(?i)falcon"]}), encoding="utf8")
        replace, deny, allow = load_rules(rules_file)
        assert do_apply(a, b, rules_file, pats, replace, deny, allow) == 0
        assert (b / "notes" / "call.txt").read_text(encoding="utf8") == "[person 1]: send it to [e-mail 1]\n"
        assert not (b / ".env").exists() and not (b / "logo.png").exists()
        (a / "notes" / "plan.txt").write_text("Project Falcon starts Monday\n", encoding="utf8")
        assert do_apply(a, b, rules_file, pats, replace, deny, allow) == 1  # a denied term reached B
        for bad_b in [a, a / "out", rules_file.parent]:
            try:
                do_apply(a, bad_b, rules_file, pats, replace, deny, allow)
                raise AssertionError(bad_b)
            except SystemExit:
                pass
    for bad in [".env", "a/.env.local", "certs/x.pem", "id_ed25519", "x/.npmrc"]:
        assert BAD_FILE.search(bad), bad
    for good in ["envoy.md", "keys.md", "README.md"]:
        assert not BAD_FILE.search(good), good
    print("self-test ok")


def main():
    ap = argparse.ArgumentParser(description="Carry content from A to B without what must be forgotten.")
    ap.add_argument("cmd", choices=["scan", "apply"])
    ap.add_argument("paths", nargs="+", help="scan: files or folders; apply: A then B")
    ap.add_argument("--profile", default="security,people", help="comma list of: " + ", ".join(PROFILES))
    ap.add_argument("--rules", help="rules.json with replace, deny and allow")
    args = ap.parse_args()
    pats, (replace, deny, allow) = patterns(args.profile), load_rules(args.rules)
    if args.cmd == "scan":
        return do_scan(args.paths, pats, replace, deny, allow)
    if len(args.paths) != 2:
        ap.error("apply takes A and B")
    return do_apply(*args.paths, args.rules, pats, replace, deny, allow)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        sys.exit(main())
