#!/usr/bin/env python3
"""Lethe publish: carry a private repo's history to its public mirror. Every commit drinks
from the river first: replace.txt rewrites what must be forgotten, mailmap.txt rewrites who
wrote it, strip.txt drops private paths. The result is scanned for secrets, leaks and things
that only exist on this machine, checked to be a fast-forward of the public branch, and
pushed only with `push`.

The rules live in the private repo, in .claude/lethe/ (config.json, replace.txt, mailmap.txt,
strip.txt, deny.txt, allow.txt), and strip.txt must drop them.

Usage (from anywhere inside the private checkout):
  python publish.py check     build, scan, compare with public; changes nothing
  python publish.py push      the same, then push to public when every check passes
  python publish.py push --force   replace a diverged public branch, only on the user's yes:
                              no leak may be found; the rule that stops force pushes is
                              paused for the push and always restored
  python publish.py protect   apply the public repo's missing protections
The same rules always give the same SHAs, so the public history only ever grows. A rule
that rewrites a commit already public breaks that on purpose: check reports it.
"""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from redact import BAD_FILE, PROFILES, scan as find

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or ".")
RULES = ROOT / ".claude" / "lethe"
MB = 1024 * 1024
PATTERNS = {**PROFILES["security"], **PROFILES["people"]}


def lines(name):
    p = RULES / name
    return [l for l in p.read_text(encoding="utf8").splitlines() if l.strip() and not l.startswith("#")] if p.exists() else []


def config():
    if not (RULES / "config.json").exists():
        sys.exit(f"lethe: no {RULES / 'config.json'}; this checkout has no publish rules.")
    return json.loads((RULES / "config.json").read_text(encoding="utf8"))


def sh(*args, cwd=None, env=None, check=True):
    r = subprocess.run(args, cwd=cwd, env=env, capture_output=True)
    if check and r.returncode:
        sys.exit(f"lethe: {' '.join(args[:3])} failed: {r.stderr.decode('utf8', 'replace').strip()}")
    return r.stdout.decode("utf8", "replace")


def scan(text, where, deny, allow, found):
    find(text, where, PATTERNS, deny, allow, found)


def build(cfg, env):
    """Clone the private branch and sanitize it. Returns the checkout root and the clone's path."""
    root = str(ROOT)
    branch = cfg["branch"]
    if not any(".claude/lethe/".startswith(s) for s in lines("strip.txt")):
        sys.exit("lethe: strip.txt does not drop .claude/lethe/; the rules would be published.")
    if sh("git", "status", "--porcelain", cwd=root).strip():
        sys.exit("lethe: the checkout has uncommitted changes; commit and push them to the private repo first.")
    git = ["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
    sh(*git, "fetch", "-q", cfg["private"], cwd=root, env=env)
    if sh("git", "rev-parse", branch, cwd=root) != sh("git", "rev-parse", f"{cfg['private']}/{branch}", cwd=root):
        sys.exit(f"lethe: {branch} differs from {cfg['private']}/{branch}; push it to the private repo first, so the private repo holds what gets published.")
    out = Path(tempfile.mkdtemp(prefix="lethe-")) / "repo"
    sh("git", "clone", "-q", "--no-local", "--single-branch", "--branch", branch, root, str(out))
    sh("git", "filter-repo", "--force", "--replace-text", str(RULES / "replace.txt"), "--replace-message", str(RULES / "replace.txt"),
       "--mailmap", str(RULES / "mailmap.txt"), "--invert-paths", "--paths-from-file", str(RULES / "strip.txt"), cwd=out)
    sh("git", "fetch", "-q", root, f"{branch}:refs/lethe/private", cwd=out)
    sh(*git, "fetch", "-q", sh("git", "remote", "get-url", cfg["public"], cwd=root).strip(), f"+{branch}:refs/lethe/public", cwd=out, env=env, check=False)
    return root, out


def audit(out, deny, allow):
    """Scan every commit, message and file reachable in the sanitized clone."""
    found = {}
    paths = {}
    # HEAD only: refs/lethe/private holds the unsanitized history, kept for the diff
    for line in sh("git", "rev-list", "--objects", "HEAD", cwd=out).splitlines():
        sha, _, path = line.partition(" ")
        if path:
            paths.setdefault(sha, path)
    # one cat-file for every object; each answer is a header line, the body, a newline
    raw = subprocess.run(["git", "cat-file", "--batch"], cwd=out, input=("\n".join(paths) + "\n").encode(), capture_output=True, check=True).stdout
    i = 0
    while i < len(raw):
        nl = raw.index(b"\n", i)
        sha, kind, size = raw[i:nl].decode().split()
        body, i = raw[nl + 1 : nl + 1 + int(size)], nl + 2 + int(size)
        if kind != "blob":
            continue
        path = paths[sha]
        if BAD_FILE.search(path):
            found.setdefault(("private file", path), set()).add(path)
        if int(size) > MB:
            found.setdefault(("file over 1 MB", path), set()).add(path)
        scan(body.decode("utf8", "replace"), path, deny, allow, found)
    for c in sh("git", "log", "--format=%h%x01%an <%ae>%n%cn <%ce>%n%B%x02", "HEAD", cwd=out).split("\x02"):
        sha, _, text = c.strip().partition("\x01")
        if sha:
            scan(text, f"commit {sha}", deny, allow, found)
    return found


def protections(cfg, env):
    """What the public repo is missing, as a list of names."""
    repo = cfg["repo"]
    r = json.loads(sh("gh", "api", f"repos/{repo}", env=env))
    rules = {x["type"] for x in json.loads(sh("gh", "api", f"repos/{repo}/rules/branches/{cfg['branch']}", env=env))}
    push = r.get("security_and_analysis", {}).get("secret_scanning_push_protection", {}).get("status")
    want = {
        "public": r["visibility"] == "public",
        "only collaborators open PRs": r.get("pull_request_creation_policy") == "collaborators_only",
        "main cannot be deleted": "deletion" in rules,
        "main cannot be force-pushed": "non_fast_forward" in rules,
        "secret push protection": push == "enabled",
        "license": bool((r.get("license") or {}).get("spdx_id")),
    }
    return [k for k, ok in want.items() if not ok]


def protect(cfg, env):
    repo = cfg["repo"]
    sh("gh", "api", "-X", "PATCH", f"repos/{repo}", "-f", "pull_request_creation_policy=collaborators_only", env=env)
    sh("gh", "api", "-X", "PATCH", f"repos/{repo}", "-F", "security_and_analysis[secret_scanning][status]=enabled",
       "-F", "security_and_analysis[secret_scanning_push_protection][status]=enabled", env=env, check=False)
    rules = {x["type"] for x in json.loads(sh("gh", "api", f"repos/{repo}/rules/branches/{cfg['branch']}", env=env))}
    if not {"deletion", "non_fast_forward"} <= rules:
        body = {"name": "protect main", "target": "branch", "enforcement": "active",
                "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
                "rules": [{"type": "deletion"}, {"type": "non_fast_forward"}]}
        subprocess.run(["gh", "api", "-X", "POST", f"repos/{repo}/rulesets", "--input", "-"], input=json.dumps(body).encode(), env=env, check=True, capture_output=True)
    print("lethe: protections applied; missing now:", protections(cfg, env) or "none")


# The rulesets that stop a force push to the branch, paused while --force replaces it.
def no_force_rulesets(cfg, env):
    repo = cfg["repo"]
    found = []
    for r in json.loads(sh("gh", "api", f"repos/{repo}/rulesets", env=env)):
        full = json.loads(sh("gh", "api", f"repos/{repo}/rulesets/{r['id']}", env=env))
        if full.get("enforcement") == "active" and any(x["type"] == "non_fast_forward" for x in full.get("rules", [])):
            found.append(full["id"])
    return found


def set_enforcement(cfg, env, ids, value):
    for i in ids:
        sh("gh", "api", "-X", "PUT", f"repos/{cfg['repo']}/rulesets/{i}", "-f", f"enforcement={value}", env=env)


def main(cmd, force=False):
    cfg = config()
    env = {**os.environ, "GH_TOKEN": sh("gh", "auth", "token", "-u", cfg["account"]).strip()}
    if cmd == "protect":
        return protect(cfg, env)
    root, out = build(cfg, env)
    try:
        found = audit(out, lines("deny.txt"), lines("allow.txt"))
        has_public = sh("git", "rev-parse", "-q", "--verify", "refs/lethe/public", cwd=out, check=False).strip()
        ff = not has_public or not subprocess.run(["git", "merge-base", "--is-ancestor", "refs/lethe/public", "HEAD"], cwd=out).returncode
        new = sh("git", "log", "--format=  %h %s", *(["refs/lethe/public..HEAD"] if has_public else ["HEAD"]), cwd=out).rstrip()
        stripped = lines("strip.txt")
        changed = [p for p in sh("git", "diff", "--name-only", "refs/lethe/private", "HEAD", cwd=out).split()
                   if not any(p == s.rstrip("/") or p.startswith(s) for s in stripped)]
        missing = protections(cfg, env)

        print(f"lethe: {cfg['private']} → {cfg['repo']} ({cfg['branch']})")
        print(f"to publish:\n{new}" if new else "to publish: nothing new")
        print("rewritten by the rules: " + (", ".join(changed) if changed else "nothing in the current tree"))
        print("leaks: " + ("none" if not found else ""))
        for (kind, hit), where in sorted(found.items()):
            print(f"  [{kind}] {hit!r} in {', '.join(sorted(where)[:3])}{' …' if len(where) > 3 else ''}")
        print("history: " + ("fast-forward of public" if ff else "DIVERGED from public: a rule rewrote a published commit, or public got its own commits"))
        print("protections missing: " + (", ".join(missing) if missing else "none"))
        ok = not found and ff and not missing
        # --force replaces a diverged public branch: a leak still stops it, and a license the
        # public repo lacks only because its branch is empty comes with the push
        forced = cmd == "push" and force and not found and set(missing) <= {"license", "main cannot be force-pushed"}
        if cmd == "push" and ((ok and new) or forced):
            git = ["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
            url = sh("git", "remote", "get-url", cfg["public"], cwd=root).strip()
            paused = no_force_rulesets(cfg, env) if forced and not ff else []
            try:
                set_enforcement(cfg, env, paused, "disabled")
                sh(*git, "push", "-q", *(["--force"] if forced and not ff else []), url, f"HEAD:{cfg['branch']}", cwd=out, env=env)
            finally:
                set_enforcement(cfg, env, paused, "active")
            sh(*git, "fetch", "-q", "--force", cfg["public"], cwd=root, env=env)
            print(f"pushed: {sh('git', 'rev-parse', '--short', 'HEAD', cwd=out).strip()}" + (" (forced; protections restored)" if paused else ""))
            ok = True
        elif cmd == "push":
            print("not pushed: " + ("nothing new" if ok else "fix what is listed above first"))
        sys.exit(0 if ok else 1)
    finally:
        shutil.rmtree(out.parent, ignore_errors=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1] if len(sys.argv) > 1 else "check", force="--force" in sys.argv)
