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
  signals: string[]
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
  notify?: string | null
  error?: string
  needsRepos?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    argos: {
      round: Round | null
      isHidden: boolean
      isRunning: boolean
      // showing the sample round from /argos demo
      isDemo: boolean
      // PRs picked to send to the AI (owner/name#number)
      selected: string[]
      // the folded section the person opened ('team'); '' = none
      open: string
      // `${round.at}|repo,repo` of the last selection put in the prompt
      sent: string
      // the repo the list is narrowed to (owner/name); '' = every connected repo
      filter: string
    }
  }
}
