export type Item = {
  kind: 'mine' | 'review' | 'other'
  repo: string
  number: number
  title: string
  url: string
  author?: string
  isDraft?: boolean
  createdAt: string
  signals: string[]
}

// What pavo.mjs writes to last-round.json.
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
      // the open row's repo#number; '' = the first row, '-' = none
      expanded: string
      teamOpen: boolean
      youLimit: number
      teamLimit: number
      // `${round.at}|${repo#number}` of the last request put in the prompt
      sent: string
      copied: string
    }
  }
}
