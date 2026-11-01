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
  // opened by a coding agent (Copilot, Devin...)
  isAI?: boolean
  // opened by a bot account (Dependabot, Snyk, Renovate)
  isBot?: boolean
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
export type Verdict = { state: 'running' | 'done'; sha?: string; issues?: number; attention?: number; partial?: boolean; finding?: string; at: string }
export type Verdicts = { auto: 'off' | 'mine' | 'all'; batch: { urls: string[]; at: string | null }; prs: Record<string, Verdict> }
// What round.mjs writes to last-round.json.
export type Round = {
  at: string
  okAt?: string | null
  me?: string
  repos?: string[]
  pending?: Item[]
  mine?: Item[]
  others?: Item[]
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
      // authors left out everywhere (kept in $.store across sessions)
      ignored: string[]
      // what verdicts.mjs last wrote
      verdicts: Verdicts | null
    }
  }
}
