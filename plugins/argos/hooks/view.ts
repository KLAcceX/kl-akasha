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

// 5h, 12d, 3w: hours under a day, days under two weeks, then weeks.
export function ageShort(iso: string, now: number, lang: string): string {
  const h = Math.max(0, (now - Date.parse(iso)) / 36e5)
  if (h < 24) return t(lang, 'u_h', Math.max(1, Math.floor(h)))
  const d = Math.floor(h / 24)
  return d < 14 ? t(lang, 'u_d', d) : t(lang, 'u_w', Math.floor(d / 7))
}

// The one or two words on a PR's action button: what the press asks the AI to do.
export function act(p: Item, lang: string): string {
  if (p.kind === 'review') return t(lang, 'a_review')
  const k = top(p)?.split(':')[0]
  return t(lang, k ? `a_${k}` : 'a_open')
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
// The column that names a PR's or a repo's colour: blocked, then review, then the rest.
const WEIGHT: Column[] = ['blocked', 'review', 'comments', 'changed']
export const tone = (c: Counts): Column => WEIGHT.find(k => c[k] > 0) ?? 'comments'
// More PRs than this in one send gets a warning: the AI works through them in order.
export const MANY = 10

export function reason(error: string, lang: string) {
  if (/gh auth|not logged/i.test(error)) return t(lang, 'err_gh_auth')
  if (/timed out|ETIMEDOUT|timeoutMs/i.test(error)) return t(lang, 'err_timeout')
  return t(lang, 'err_generic')
}

// The pane's own state: the PRs picked for the AI (repo#number), the repo opened to show
// its PRs, and the last selection put in the prompt (`${round.at}|repo#n,repo#n`).
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
  const picks = new Set(ui.selected)
  const repos = names.map(repo => {
    const prs = all.filter(p => p.repo === repo && counts(p)).sort(byRank)
    const sum = Object.fromEntries(COLUMNS.map(c => [c, prs.reduce((n, p) => n + cells(p)[c], 0)])) as Counts
    const chosen = prs.filter(p => picks.has(keyOf(p))).length
    return {
      repo,
      name: shortRepo(repo),
      counts: sum,
      // the repo's checkbox: all of its PRs picked, some, or none
      pick: chosen === 0 ? ('none' as const) : chosen === prs.length ? ('all' as const) : ('some' as const),
      keys: prs.map(keyOf),
      isOpen: ui.open === repo,
      prs: prs.map(p => ({
        key: keyOf(p),
        url: p.url,
        number: p.number,
        title: p.title,
        verb: verb(p, lang),
        act: act(p, lang),
        tone: tone(cells(p)),
        age: ageShort(p.createdAt, now, lang),
        isPicked: picks.has(keyOf(p)),
        // its own request, for the action button on its line
        prompt: prompt([p], lang),
      })),
      items: prs,
    }
  })
  // blocked first, then what waits on me, then the rest
  const weight = (c: Counts) => [c.blocked, c.review, c.comments, c.changed]
  const busy = repos
    .filter(x => x.prs.length)
    .sort((a, b) => {
      const [wa, wb] = [weight(a.counts), weight(b.counts)]
      return wb.map((n, i) => n - wa[i]!).find(Boolean) ?? a.name.localeCompare(b.name)
    })
  // The top line's tally of the work: every open PR once, mine, and the others split by
  // whether I already reviewed them. The four always add up.
  const others = all.filter(p => p.kind !== 'mine')
  const reviewed = others.filter(p => p.reviewed).length
  const tally = { open: all.length, mine: all.length - others.length, reviewed, unreviewed: others.length - reviewed }
  const items = busy.flatMap(x => x.items).filter(p => picks.has(keyOf(p)))
  const fix = items.filter(p => p.kind === 'mine').length
  const sendKey = `${r.at}|${items.map(keyOf).join(',')}`
  // What the send button checks before it fills the prompt, worst first.
  const block = !items.length ? t(lang, 'ui_send_none') : o.running ? t(lang, 'ui_send_wait') : null
  const warn = r.error || isLate ? t(lang, 'ui_send_stale', okAt ? hhmm(okAt) : '') : items.length > MANY ? t(lang, 'ui_send_many', items.length) : null
  const allKeys = busy.flatMap(x => x.keys)

  return {
    ...head,
    state: 'ok' as const,
    counts: tally,
    repos: busy.map(({ items, ...x }) => x),
    clean: repos.length - busy.length,
    allKeys,
    allSelected: allKeys.length > 0 && allKeys.every(k => picks.has(k)),
    send: {
      count: items.length,
      prompt: prompt(items, lang),
      key: sendKey,
      inPrompt: items.length > 0 && ui.sent === sendKey,
      summary: items.length ? t(lang, 'ui_send_summary', fix, items.length - fix) : '',
      block,
      warn,
    },
    band: pending[0] ? { count: pending.length, verb: verb(pending[0], lang), ref: `${shortRepo(pending[0].repo)}#${pending[0].number}` } : null,
  }
}
export type ViewModel = ReturnType<typeof toViewModel>
