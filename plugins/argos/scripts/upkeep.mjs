// What an update bot touches: manifests, lock files, workflows, Dockerfiles, changelogs.
export const UPKEEP =
  /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|requirements[^/]*\.txt|Pipfile(\.lock)?|poetry\.lock|pyproject\.toml|uv\.lock|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|build\.gradle(\.kts)?|gradle\.lockfile|[^/]*\.csproj|packages\.lock\.json|Directory\.Packages\.props|mix\.(exs|lock)|pubspec\.(yaml|lock)|Podfile(\.lock)?|Package\.resolved|\.terraform\.lock\.hcl|Dockerfile|CHANGELOG[^/]*|\.release-please-manifest\.json)$|^\.github\/workflows\//i;

// A PR that touches nothing else, by its file paths. No files says nothing, so it does not count.
export const onlyUpkeep = (paths = []) => paths.length > 0 && paths.every((f) => UPKEEP.test(f));
