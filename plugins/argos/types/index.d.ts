export type Item = {
  kind: 'mine' | 'review' | 'other'
  repo: string
  number: number
  title: string
  url: string
  author?: string
  createdAt: string
  signals: string[]
}

// What pavo.mjs writes to last-round.json.
export type Round = {
  at: string
  me?: string
  repos?: string[]
  pending?: Item[]
  others?: Item[]
  notify?: string | null
  error?: string
}

// What the pane shows: what I must fix, teammates' PRs, or both.
export type View = 'fix' | 'others' | 'all'

declare module 'claude-code' {
  interface PluginState {
    argos: {
      round: Round | null
      isHidden: boolean
      isRunning: boolean
      view: View
      author: string
    }
  }
}
