export type Item = {
  kind: 'mine' | 'review' | 'other'
  repo: string
  number: number
  title: string
  url: string
  author?: string
  isDraft?: boolean
  // someone else's PR the user already reviewed
  reviewed?: boolean
  createdAt: string
  // how long it has waited on whoever holds it (my review: since I was asked)
  since?: string
  // lines changed (additions + deletions)
  size?: number
  // opened by a machine that writes code: a coding agent (Copilot, Devin...)
  isAI?: boolean
  // opened by a machine that only touches upkeep files: an update bot (Dependabot, Snyk...)
  isBot?: boolean
  // the author's GitHub picture
  avatarUrl?: string
  // GitHub labels, colour as GitHub's hex without #
  labels?: { name: string; color: string }[]
  // the head commit's SHA
  sha?: string
  // the last commit's checks
  ci?: 'pass' | 'fail' | 'pending'
  signals: string[]
}

// What verdicts.mjs writes to verdicts.json: the last AI validation of each PR.
// issues: blockers; attention: risks that do not block; partial: not all of it was read
// merge.mjs's outcome on a passing verdict, once per head commit, in a repo with auto-merge on
export type MergeOutcome = { state: 'merged' | 'approved' | 'skipped'; why: string; sha: string; at: string }
export type Verdict = {
  state: 'queued' | 'running' | 'done' | 'failed'
  sha?: string
  issues?: number
  attention?: number
  partial?: boolean
  finding?: string
  // why it could not be validated
  reason?: string
  merge?: MergeOutcome
  at: string
}
export type Verdicts = {
  auto: 'off' | 'mine' | 'all'
  // minutes between automatic rounds (15, 30 or 60)
  autoEvery?: number
  // the last automatic round: when it looked, and how many PRs it sent
  lastAuto?: { at: string; count: number } | null
  batch: { urls: string[]; at: string | null }
  // the PRs left to humans: neither auto-validate nor auto-merge touches them
  human?: string[]
  prs: Record<string, Verdict>
}
// A connected repo as repos.json keeps it: auto-merge and its own validation prompt (skills is
// what an older version kept instead, read as a prompt to use them).
export type RepoCfg = { repo: string; account?: string; path?: string; merge?: boolean; prompt?: string; skills?: string[] }
// What setup.mjs finds on a first run: is gh there, its logged-in accounts, the one in use, and
// repos with open PRs for it (error: why they could not be listed).
export type SetupInfo = {
  // error: the check itself failed (timeout, crash), with why in error
  gh: 'ok' | 'missing' | 'none' | 'error'
  accounts: { login: string; active: boolean }[]
  account: string | null
  suggestions: { repo: string; prs: number }[]
  // the session folder's repo, when it has a GitHub remote
  here?: string | null
  error?: string
  // when the check ran
  at?: string
}
// What round.mjs writes to last-round.json.
export type Round = {
  at: string
  okAt?: string | null
  me?: string
  repos?: string[]
  pending?: Item[]
  mine?: Item[]
  others?: Item[]
  // each author's picture as a 16×16 mosaic of SVG paths, by login
  avatars?: Record<string, string>
  notify?: string | null
  error?: string
  needsRepos?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    argos: {
      round: Round | null
      isRunning: boolean
      // showing the sample round from /argos demo
      isDemo: boolean
      // PRs left out of the validation by hand (owner/name#number)
      out: string[]
      // PRs the pane left out by itself that the person brought back
      back: string[]
      // authors left out everywhere, or a whole kind as kind:bot / kind:agent (kept in $.store)
      ignored: string[]
      // what verdicts.mjs last wrote
      verdicts: Verdicts | null
      // the run whose end was already told in a toast (its batch's start time)
      announced: string | null
      // the connected repos as repos.json keeps them (auto-merge, prompt)
      repos: RepoCfg[]
      // how the last fixing agent ended, in its last line
      fixResult: string | null
      // what setup.mjs found on the first run
      setup: SetupInfo | null
      // whether the first setup was finished
      setupDone: boolean
      // the presses still at work, by key, so their buttons say so
      pending: string[]
      // the page the pane shows: home (the dashboard), settings, or a repo by name
      page: string
      // the repo whose auto-merge waits for the person's confirmation
      confirmMerge: string | null
      // the validating agents the mod started, by agent id, each with its PRs
      agentRuns: Record<string, string[]>
      // the agents the person stopped: every tool they call is refused
      stopped: string[]
      // the fixing agents the mod started, by agent id, each with the person's PRs
      fixRuns: Record<string, string[]>
    }
  }
}
