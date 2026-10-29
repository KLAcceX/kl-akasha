export type Item = {
  kind: 'mine' | 'review'
  repo: string
  number: number
  title: string
  url: string
  createdAt: string
  signals: string[]
}

// What pavo.mjs writes to last-round.json.
export type Round = {
  at: string
  pending?: Item[]
  notify?: string | null
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    argos: { round: Round | null; isHidden: boolean }
  }
}
