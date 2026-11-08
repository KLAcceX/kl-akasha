#!/usr/bin/env python3
"""Lethe publish: carry a private repo to its public mirror as releases. The public repo never
gets the private history: each publish is one commit holding the private branch's current files,
sanitized, with the newest CHANGELOG.md entry as its message and a v<version> tag. Before it
crosses, the tree drinks from the river: replace.txt rewrites what must be forgotten and
strip.txt drops private paths. The result is scanned for secrets, leaks and things that only
exist on this machine, and pushed only with `push`.

The rules live in the private repo, in .claude/lethe/ (config.json, replace.txt, strip.txt,
deny.txt, allow.txt), and strip.txt must drop them.

CHANGELOG.md, at the private repo's root, is published with the release. Its newest entry is a
heading `## [<version>] - <YYYY-MM-DD>` (an `## [Unreleased]` section above it is skipped) and
the lines under it, which become the release commit's message.

Usage (from anywhere inside the private checkout):
  python publish.py draft     the private commits since the last release, to write the entry from
  python publish.py check     build the release, scan it, compare with public; changes nothing
  python publish.py push      the same, then push the release commit and its tag
  python publish.py push --reset   replace the public history with this release as its only
                              commit, and delete public branches and tags that are not releases;
                              only on the user's yes. No leak may be found; the rule that stops
                              force pushes is paused for the push and always restored
  python publish.py protect   apply the public repo's missing protections
  python publish.py --self-test
After a push the private branch gets a release/v<version> tag, so `draft` knows where the next
release starts.
"""
import fnmatch, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from redact import BAD_FILE, PROFILES, scan as find

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or ".")
RULES = ROOT / ".claude" / "lethe"
MB = 1024 * 1024
PATTERNS = {**PROFILES["security"], **PROFILES["people"]}
CHANGELOG = "CHANGELOG.md"
RELEASE = "Release "
HEADING = re.compile(r"^## \[(?P<v>\d+\.\d+\.\d+)\](?: - (?P<d>\d{4}-\d{2}-\d{2}))?\s*$", re.M)


def lines(name):
    p = RULES / name
    return [l for l in p.read_text(encoding="utf8").splitlines() if l.strip() and not l.startswith("#")] if p.exists() else []


# Whether a strip.txt rule drops the path, read the way git filter-repo reads it: a path or a
# folder prefix, `glob:` (where * also crosses /) or `regex:` (searched in the path).
def drops(path, rules):
    for s in rules:
        if s.startswith("glob:"):
            hit = fnmatch.fnmatchcase(path, s[5:])
        elif s.startswith("regex:"):
            hit = re.search(s[6:], path)
        else:
            hit = path == s.rstrip("/") or path.startswith(s)
        if hit:
            return True
    return False


def config():
    if not (RULES / "config.json").exists():
        sys.exit(f"lethe: no {RULES / 'config.json'}; this checkout has no publish rules.")
    return json.loads((RULES / "config.json").read_text(encoding="utf8"))


def sh(*args, cwd=None, env=None, check=True, input=None):
    r = subprocess.run(args, cwd=cwd, env=env, capture_output=True, input=input.encode() if input else None)
    if check and r.returncode:
        sys.exit(f"lethe: {' '.join(args[:3])} failed: {r.stderr.decode('utf8', 'replace').strip()}")
    return r.stdout.decode("utf8", "replace")


def scan(text, where, deny, allow, found):
    find(text, where, PATTERNS, deny, allow, found)


def version(v):
    return tuple(int(x) for x in v.split("."))


def entry(text):
    """The newest released entry of a CHANGELOG: (version, date, body), or None."""
    m = HEADING.search(text or "")
    if not m:
        return None
    rest = text[m.end():]
    nxt = re.search(r"^## ", rest, re.M)
    return m["v"], m["d"], (rest[: nxt.start()] if nxt else rest).strip()


def message(v, d, body):
    return f"{RELEASE}{v}" + (f" ({d})" if d else "") + "\n\n" + body.strip() + "\n"


def identity(cfg):
    """Author and committer of release commits, from config.json "author": "Name <e-mail>"."""
    m = re.fullmatch(r"\s*(.+?)\s*<([^>]+)>\s*", cfg.get("author", ""))
    if not m:
        sys.exit('lethe: config.json needs "author": "Name <e-mail>" for the release commits (a GitHub noreply e-mail).')
    n, e = m.groups()
    return {"GIT_AUTHOR_NAME": n, "GIT_AUTHOR_EMAIL": e, "GIT_COMMITTER_NAME": n, "GIT_COMMITTER_EMAIL": e}


def build(cfg, env):
    """Sanitize the private branch's current files into a one-commit clone. Returns the checkout
    root, the clone's path and the sanitized tree."""
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
    sh("git", "init", "-q", "-b", "lethe", str(out))
    # only the current files cross: one parentless commit, no history
    sh("git", "fetch", "-q", "--depth", "1", Path(root).as_uri(), f"{branch}:refs/lethe/private", cwd=out)
    ids = {**os.environ, **identity(cfg)}
    one = sh("git", "commit-tree", "refs/lethe/private^{tree}", "-m", "lethe", cwd=out, env=ids).strip()
    sh("git", "update-ref", "refs/heads/lethe", one, cwd=out)
    sh("git", "filter-repo", "--force", "--refs", "lethe", "--replace-text", str(RULES / "replace.txt"),
       "--invert-paths", "--paths-from-file", str(RULES / "strip.txt"), cwd=out)
    sh(*git, "fetch", "-q", sh("git", "remote", "get-url", cfg["public"], cwd=root).strip(), f"+{branch}:refs/lethe/public", "+refs/tags/*:refs/lethe/tags/*", cwd=out, env=env, check=False)
    return root, out, sh("git", "rev-parse", "lethe^{tree}", cwd=out).strip()


def audit(out, tree, text, deny, allow):
    """Scan every file in the sanitized tree and the release message."""
    found = {}
    paths = {}
    for line in sh("git", "ls-tree", "-r", tree, cwd=out).splitlines():
        meta, _, path = line.partition("\t")
        paths.setdefault(meta.split()[2], path)
    # one cat-file for every blob; each answer is a header line, the body, a newline
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
    scan(text, "release message", deny, allow, found)
    return found


def draft(cfg):
    """The private commits since the last release, grouped by scope, to write the entry from."""
    root, branch = str(ROOT), cfg["branch"]
    tags = [t for t in sh("git", "tag", "--list", "release/v*", cwd=root).split() if re.fullmatch(r"release/v\d+\.\d+\.\d+", t)]
    last = max(tags, key=lambda t: version(t[9:]), default=None)
    log = sh("git", "log", "--reverse", "--no-merges", "--format=%h%x01%s", *([f"{last}..{branch}"] if last else [branch]), cwd=root)
    groups = {}
    for row in log.splitlines():
        sha, _, subject = row.partition("\x01")
        m = re.match(r"(\w+)(?:\(([^)]+)\))?!?: (.*)", subject)
        kind, scope, text = (m.group(1), m.group(2) or "repo", m.group(3)) if m else ("other", "repo", subject)
        groups.setdefault(scope, []).append(f"  {sha} {kind}: {text}")
    now = entry((ROOT / CHANGELOG).read_text(encoding="utf8")) if (ROOT / CHANGELOG).exists() else None
    print(f"lethe: commits on {branch} since " + (last or "the start") + (f"; {CHANGELOG} is at {now[0]}" if now else f"; no released entry in {CHANGELOG} yet"))
    for scope, rows in sorted(groups.items()):
        print(f"{scope} ({len(rows)}):")
        print("\n".join(rows))
    if not groups:
        print("nothing since the last release")


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
        "only main can be created": "creation" in {x["type"] for x in json.loads(sh("gh", "api", f"repos/{repo}/rules/branches/lethe-probe", env=env))},
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
    if "creation" not in {x["type"] for x in json.loads(sh("gh", "api", f"repos/{repo}/rules/branches/lethe-probe", env=env))}:
        # the public repo holds releases only: no branch but main can be created there
        body = {"name": "only main", "target": "branch", "enforcement": "active",
                "conditions": {"ref_name": {"include": ["~ALL"], "exclude": ["~DEFAULT_BRANCH"]}},
                "rules": [{"type": "creation"}]}
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


def main(cmd, reset=False):
    cfg = config()
    if cmd == "draft":
        return draft(cfg)
    env = {**os.environ, "GH_TOKEN": sh("gh", "auth", "token", "-u", cfg["account"]).strip()}
    if cmd == "protect":
        return protect(cfg, env)
    root, out, tree = build(cfg, env)
    try:
        log = sh("git", "show", f"{tree}:{CHANGELOG}", cwd=out, check=False)
        new = entry(log)
        has_public = sh("git", "rev-parse", "-q", "--verify", "refs/lethe/public", cwd=out, check=False).strip()
        old = entry(sh("git", "show", f"refs/lethe/public:{CHANGELOG}", cwd=out, check=False)) if has_public else None
        subjects = sh("git", "log", "--format=%s", "refs/lethe/public", cwd=out).splitlines() if has_public else []
        releases_only = all(s.startswith(RELEASE) for s in subjects)
        same = bool(has_public) and sh("git", "rev-parse", "refs/lethe/public^{tree}", cwd=out).strip() == tree
        stripped = lines("strip.txt")
        changed = [p for p in sh("git", "diff", "--name-only", "refs/lethe/private", tree, cwd=out).split()
                   if not drops(p, stripped)]
        files = sh("git", "diff", "--shortstat", "refs/lethe/public", tree, cwd=out).strip() if has_public else "first release"
        remote = sh("git", "remote", "get-url", cfg["public"], cwd=root).strip()
        heads = [l.split("refs/heads/")[1] for l in sh("git", "ls-remote", "--heads", remote, cwd=root, env=env, check=False).splitlines() if "refs/heads/" in l]
        tags = [l.split("refs/tags/")[1] for l in sh("git", "ls-remote", "--tags", "--refs", remote, cwd=root, env=env, check=False).splitlines() if "refs/tags/" in l]
        if cfg["branch"] in heads and not has_public:
            sys.exit(f"lethe: could not fetch {cfg['branch']} from {cfg['public']}; nothing was checked against public.")
        stray = [f"branch {h}" for h in heads if h != cfg["branch"]] + [f"tag {t}" for t in tags if not re.fullmatch(r"v\d+\.\d+\.\d+", t)]
        text = message(*new) if new else ""
        found = audit(out, tree, text, lines("deny.txt"), lines("allow.txt"))
        missing = protections(cfg, env)

        problems = []
        if not new:
            problems.append(f"{CHANGELOG} has no released entry (## [x.y.z] - YYYY-MM-DD); write one from `draft`")
        elif old and version(new[0]) <= version(old[0]) and not reset:
            problems.append(f"{CHANGELOG}'s newest entry is {new[0]}, public already has {old[0]}; add an entry for this release")
        if new and f"v{new[0]}" in tags and not reset:
            problems.append(f"public already has the tag v{new[0]}")
        if not releases_only and not reset:
            problems.append(f"public holds {len(subjects)} commits that are not releases; replacing them takes push --reset, on the user's yes")
        if same and not reset:
            problems.append("public already holds these files")

        print(f"lethe: {cfg['private']} → {cfg['repo']} ({cfg['branch']})")
        print("release: " + (f"{new[0]}" + (f" ({new[1]})" if new[1] else "") if new else "none") + (f", public has {old[0]}" if old else ", public has no release yet"))
        if new:
            print("changelog:\n" + "\n".join("  " + l for l in new[2].splitlines()))
        print("files: " + (files or "no change"))
        print("rewritten by the rules: " + (", ".join(changed) if changed else "nothing in the current tree"))
        print("leaks: " + ("none" if not found else ""))
        for (kind, hit), where in sorted(found.items()):
            print(f"  [{kind}] {hit!r} in {', '.join(sorted(where)[:3])}{' …' if len(where) > 3 else ''}")
        print("history: " + ("one release on top of public" if releases_only else f"public holds {len(subjects)} commits that are not releases") + (" → reset to this release alone" if reset else ""))
        if stray:
            print("not releases on public: " + ", ".join(stray) + (" → deleted by --reset" if reset else ""))
        print("protections missing: " + (", ".join(missing) if missing else "none"))
        for p in problems:
            print(f"  stop: {p}")
        ok = not found and not missing and not problems
        # --reset replaces the public history: a leak still stops it, and a license the public
        # repo lacks only because its branch is empty comes with the push
        if cmd == "push" and reset and not found and new and set(missing) <= {"license", "main cannot be force-pushed", "only main can be created"}:
            ok = True
        if cmd == "push" and ok:
            ids = {**os.environ, **identity(cfg)}
            parent = [] if reset or not has_public else ["-p", "refs/lethe/public"]
            commit = sh("git", "commit-tree", tree, *parent, "-F", "-", cwd=out, env=ids, input=text).strip()
            git = ["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
            paused = no_force_rulesets(cfg, env) if reset and has_public else []
            try:
                set_enforcement(cfg, env, paused, "disabled")
                sh(*git, "push", "-q", *(["--force"] if reset else []), remote, f"{commit}:refs/heads/{cfg['branch']}", f"{commit}:refs/tags/v{new[0]}", cwd=out, env=env)
                if reset and (heads or tags):
                    gone = [f"refs/heads/{h}" for h in heads if h != cfg["branch"]] + [f"refs/tags/{t}" for t in tags if t != f"v{new[0]}"]
                    if gone:
                        sh(*git, "push", "-q", "--delete", remote, *gone, cwd=out, env=env)
            finally:
                set_enforcement(cfg, env, paused, "active")
            sh("git", "tag", "-f", f"release/v{new[0]}", cfg["branch"], cwd=root)
            sh(*git, "push", "-q", "--force", cfg["private"], f"refs/tags/release/v{new[0]}", cwd=root, env=env)
            sh(*git, "fetch", "-q", "--force", "--prune", "--no-tags", cfg["public"], cwd=root, env=env, check=False)
            print(f"pushed: {RELEASE}{new[0]} as {commit[:7]}, tag v{new[0]}" + (" (public history replaced; protections restored)" if reset else ""))
        elif cmd == "push":
            print("not pushed: fix what is listed above first")
        sys.exit(0 if ok else 1)
    finally:
        shutil.rmtree(out.parent, ignore_errors=True)


def self_test():
    log = "# Changelog\n\n## [Unreleased]\n\n- wip\n\n## [0.2.0] - 2026-11-08\n\n### Added\n\n- Ma'at\n\n## [0.1.0] - 2026-11-01\n\n- first\n"
    assert entry(log) == ("0.2.0", "2026-11-08", "### Added\n\n- Ma'at"), entry(log)
    assert entry("## [Unreleased]\n- x\n") is None and entry("") is None
    assert entry("## [1.0.0]\n\nonly\n") == ("1.0.0", None, "only")
    assert message("0.2.0", "2026-11-08", "- a") == "Release 0.2.0 (2026-11-08)\n\n- a\n"
    assert version("0.10.0") > version("0.9.1")
    rules = ["docs/", "CLAUDE.md", ".gitignore", "glob:*.test.*", r"regex:^plugins/[^/]+/evals/"]
    for p in ["docs/a.md", "CLAUDE.md", ".gitignore", "plugins/argos/hooks/register.test.tsx", "plugins/maat/evals/x/case.yaml"]:
        assert drops(p, rules), p
    for p in ["plugins/argos/hooks/register.tsx", "plugins/argos/README.md", "plugins/maat/scripts/evals.mjs"]:
        assert not drops(p, rules), p
    assert identity({"author": "KLAcceX <36262767+KLAcceX@users.noreply.github.com>"})["GIT_AUTHOR_EMAIL"] == "36262767+KLAcceX@users.noreply.github.com"
    print("self-test ok")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if "--self-test" in sys.argv:
        self_test()
    else:
        main(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "check", reset="--reset" in sys.argv)
