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

// The queue tabs: what is for me, or my teammates' PRs.
export type View = 'you' | 'team'
export type Sort = 'rank' | 'oldest' | 'repo'

declare module 'claude-code' {
  interface PluginState {
    argos: {
      round: Round | null
      isHidden: boolean
      isRunning: boolean
      view: View
      author: string
      repo: string
      sort: Sort
      signal: string
      expanded: string
      copied: string
      details: boolean
    }
  }
}
