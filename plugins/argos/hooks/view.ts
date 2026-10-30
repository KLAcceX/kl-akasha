// Round → ViewModel: every word and number the pane and the band show comes from here,
// so the counts and the prompt sent to the AI always agree. No mod runtime, so Node can
// import this file.
import { t } from '../skills/argos-ward/scripts/i18n.mjs'
import type { Item, Round } from '../types'

const base = (code: string) => code.split(':')[0]
const has = (p: Item, ...codes: string[]) => p.signals.some(s => codes.includes(base(s)))
const num = (p: Item, code: string) => Number(p.signals.find(s => base(s) === code)?.split(':')[1] ?? 0)
const shortRepo = (repo: string) => repo.split('/')[1] ?? repo
export const keyOf = (p: Item) => `${p.repo}#${p.number}`
export const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// What to do first: merge, then a late review that blocks a teammate, then unblock mine,
// answer, review on time, ask for review; teammates' PRs after, drafts last.
export function rank(p: Item): number {
  if (p.kind === 'mine') {
    if (has(p, 'ready')) return 1
    if (has(p, 'conflict', 'ci_failed', 'changes_requested')) return 3
    if (has(p, 'threads', 'unanswered', 'new_reviews')) return 4
    if (has(p, 'no_review')) return 6
    return 9
  }
  if (p.kind === 'review') return has(p, 'late') ? 2 : 5
  if (p.isDraft) return 10
  if (has(p, 'no_review')) return 7
  return p.signals.length ? 8 : 9
}
export const byRank = (a: Item, b: Item) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt)

// The signal that names the verb, in a fixed order.
const ORDER = ['conflict', 'ci_failed', 'changes_requested', 'unanswered', 'threads', 'new_reviews', 'ready', 'changed', 'no_review', 'late']
const top = (p: Item) => ORDER.map(k => p.signals.find(s => base(s) === k)).find(Boolean)

export function verb(p: Item, lang: string): string {
  if (p.kind === 'review') return t(lang, 'v_review', p.author || '?')
  const code = top(p)
  if (!code) return t(lang, 'v_idle')
  const [k, n] = code.split(':')
  if (k === 'no_review' && p.kind === 'mine') return t(lang, 'v_ask_review')
  return t(lang, `v_${k}`, Number(n))
}

// The four columns of a repo row, in this order everywhere (icons, legend, tests).
export const COLUMNS = ['comments', 'changed', 'blocked', 'review'] as const
export type Column = (typeof COLUMNS)[number]
type Counts = Record<Column, number>

// What a PR adds to its repo's columns. Comments and blocked count my PRs (the AI fixes
// them); changed and review count the PRs I review (the AI drafts the review).
export function cells(p: Item): Counts {
  const mine = p.kind === 'mine'
  return {
    comments: mine ? num(p, 'threads') + num(p, 'new_reviews') + (has(p, 'unanswered') ? 1 : 0) : 0,
    changed: !mine && has(p, 'changed') ? 1 : 0,
    blocked: mine && has(p, 'conflict', 'ci_failed', 'changes_requested') ? 1 : 0,
    review: p.kind === 'review' ? 1 : 0,
  }
}
const counts = (p: Item) => Object.values(cells(p)).some(Boolean)

export function reason(error: string, lang: string) {
  if (/gh auth|not logged/i.test(error)) return t(lang, 'err_gh_auth')
  if (/timed out|ETIMEDOUT|timeoutMs/i.test(error)) return t(lang, 'err_timeout')
  return t(lang, 'err_generic')
}

// The pane's own state: the repos picked for the AI, the repo opened to show its PRs,
// and the last selection put in the prompt (`${round.at}|repo,repo`).
export type Ui = { selected: string[]; open: string; sent: string }
export const UI: Ui = { selected: [], open: '', sent: '' }

// The request the send button puts in the prompt: my PRs to fix, the others to review.
export function prompt(prs: Item[], lang: string) {
  const fix = prs.filter(p => p.kind === 'mine').map(p => `- ${p.url}: ${verb(p, lang)}`)
  const review = prs.filter(p => p.kind !== 'mine').map(p => `- ${p.url}`)
  return [
    t(lang, 'prompt_batch'),
    ...(fix.length ? [t(lang, 'prompt_fix'), ...fix] : []),
    ...(review.length ? [t(lang, 'prompt_review'), ...review] : []),
  ].join('\n')
}

type Opts = { now: number; lang: string; minutes: number; running: boolean; ui?: Partial<Ui> }

export function toViewModel(r: Round | null, o: Opts) {
  const { now, lang } = o
  const ui = { ...UI, ...o.ui }
  const okAt = r?.okAt ?? (r?.error ? null : r?.at) ?? null
  const agoH = okAt ? Math.floor((now - Date.parse(okAt)) / 36e5) : 0
  // a scheduled round should have run by now (interval + 15 min) and none did
  const isLate = Boolean(okAt && !r?.error && now - Date.parse(okAt) > (o.minutes + 15) * 6e4)
  const seen = !okAt ? '' : r?.error ? t(lang, 'ui_data_from', hhmm(okAt)) : isLate ? t(lang, 'ui_seen_ago', agoH) : t(lang, 'ui_seen', hhmm(okAt))
  const status = r?.error
    ? t(lang, 'ui_error', hhmm(r.at), reason(r.error, lang), okAt && hhmm(okAt))
    : isLate
      ? t(lang, 'ui_stale', agoH)
      : null
  const head = { running: o.running, seen, status, isLate }

  if (!r) return { ...head, state: o.running ? ('loading' as const) : ('never' as const) }
  if (r.error && !okAt) return { ...head, state: 'noData' as const }
  const connected = r.repos ?? []
  if (r.needsRepos || !connected.length) return { ...head, state: 'noRepos' as const }

  const pending = [...(r.pending ?? [])].sort(byRank)
  const seenUrl = new Set<string>()
  const all = [...pending, ...(r.mine ?? []), ...(r.others ?? [])].filter(p => !seenUrl.has(p.url) && Boolean(seenUrl.add(p.url)))
  if (!all.length) return { ...head, state: 'noPRs' as const, repos: connected.length }

  const names = [...new Set([...connected, ...all.map(p => p.repo)])]
  const repos = names.map(repo => {
    const prs = all.filter(p => p.repo === repo && counts(p)).sort(byRank)
    const sum = Object.fromEntries(COLUMNS.map(c => [c, prs.reduce((n, p) => n + cells(p)[c], 0)])) as Counts
    return {
      repo,
      name: shortRepo(repo),
      counts: sum,
      isSelected: ui.selected.includes(repo),
      isOpen: ui.open === repo,
      prs: prs.map(p => ({ key: keyOf(p), url: p.url, number: p.number, title: p.title, verb: verb(p, lang) })),
      items: prs,
    }
  })
  // blocked first, then what waits on me, then the rest
  const weight = (c: Counts) => [c.blocked, c.review, c.comments, c.changed]
  const busy = repos
    .filter(x => x.prs.length)
    .sort((a, b) => {
      const [wa, wb] = [weight(a.counts), weight(b.counts)]
      return wb.map((n, i) => n - wa[i]).find(Boolean) ?? a.name.localeCompare(b.name)
    })
  const picked = busy.filter(x => x.isSelected)
  const sendKey = `${r.at}|${picked.map(x => x.repo).join(',')}`

  return {
    ...head,
    state: 'ok' as const,
    repos: busy.map(({ items, ...x }) => x),
    clean: repos.length - busy.length,
    send: {
      count: picked.length,
      prompt: prompt(picked.flatMap(x => x.items), lang),
      key: sendKey,
      inPrompt: picked.length > 0 && ui.sent === sendKey,
    },
    band: pending[0] ? { count: pending.length, verb: verb(pending[0], lang), ref: `${shortRepo(pending[0].repo)}#${pending[0].number}` } : null,
  }
}
export type ViewModel = ReturnType<typeof toViewModel>
