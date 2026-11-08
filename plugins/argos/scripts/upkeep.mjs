// What an update bot touches: manifests, lock files, workflows, Dockerfiles, changelogs.
export const UPKEEP =
  /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|requirements[^/]*\.txt|Pipfile(\.lock)?|poetry\.lock|pyproject\.toml|uv\.lock|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|build\.gradle(\.kts)?|gradle\.lockfile|[^/]*\.csproj|packages\.lock\.json|Directory\.Packages\.props|mix\.(exs|lock)|pubspec\.(yaml|lock)|Podfile(\.lock)?|Package\.resolved|\.terraform\.lock\.hcl|Dockerfile|CHANGELOG[^/]*|\.release-please-manifest\.json)$|^\.github\/workflows\//i;

// A PR that touches nothing else, by its file paths. No files says nothing, so it does not count.
export const onlyUpkeep = (paths = []) => paths.length > 0 && paths.every((f) => UPKEEP.test(f));

// Of those, the files that only pin versions. The rest run on install, build or CI (a Dockerfile, a
// workflow, a Gemfile, a pom.xml) or point at another source (a requirements --index-url, a go.mod
// replace), so auto-merge never takes them from a bot. Python and Go bumps wait for a person.
// ponytail: a lock line can still point at another source; there the verdict is the only check. Read
// each format if a bot ever abuses that.
const PINS =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lock|Pipfile\.lock|poetry\.lock|uv\.lock|go\.sum|Cargo\.lock|Gemfile\.lock|composer\.lock|gradle\.lockfile|packages\.lock\.json|mix\.lock|pubspec\.lock|Podfile\.lock|Package\.resolved|\.terraform\.lock\.hcl|CHANGELOG[^/]*|\.release-please-manifest\.json)$/i;
// These hold versions and scripts side by side: only the diff tells which changed.
const SCRIPTED = /(^|\/)(package|composer)\.json$/i;
const PIN_LINE = /^[+-]\s*"([^"]+)":\s*"[\^~<>=]*v?\d[\w.+-]*",?\s*$/;

// A diff that moves versions of names already there: no new name, no script, no URL. No diff says
// nothing (GitHub leaves it out of a big file), so it does not count.
export const onlyBump = (patch) => {
  if (typeof patch !== "string") return false;
  const lines = patch.split("\n").filter((l) => /^[+-]/.test(l));
  const pins = lines.map((l) => l.match(PIN_LINE));
  if (!lines.length || pins.some((m) => !m)) return false;
  const names = (sign) => pins.filter((m) => m[0][0] === sign).map((m) => m[1]).sort().join("\n");
  return names("+") === names("-");
};

// A file from `pulls/<n>/files`, as { path, patch }.
export const pinsOnly = ({ path, patch }) => PINS.test(path) || (SCRIPTED.test(path) && onlyBump(patch));
