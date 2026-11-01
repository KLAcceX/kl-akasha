// Round → ViewModel: every word and number the pane and the band show comes from here,
// so the counts and the prompt sent to the AI always agree. No mod runtime, so Node can
// import this file.
import { t } from '../scripts/i18n.mjs'
import type { Item, Round } from '../types'
import { C, I, NEUTRAL, PICKED, bars, byPriority, fit, pill, sig, tint, type Tag, type Tone } from './look'

const base = (code: string) => code.split(':')[0]
const has = (p: Item, ...codes: string[]) => p.signals.some(s => codes.includes(base(s)))
const shortRepo = (repo: string) => repo.split('/')[1] ?? repo
export const keyOf = (p: Item) => `${p.repo}#${p.number}`
// Whether text names this PR: its URL not followed by another digit, so .../pull/1 is never
// found inside .../pull/12.
export const mentions = (text: string | undefined, url: string) =>
  Boolean(text) && new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(text!)
export const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// What to do first: merge, then a late review that blocks a teammate, then unblock mine,
// answer, review on time, find a reviewer; teammates' PRs after, drafts last.
export function rank(p: Item): number {
  if (p.kind === 'mine') {
    if (has(p, 'ready')) return 1
    if (has(p, 'conflict', 'ci_failed', 'changes_requested')) return 3
    if (has(p, 'threads', 'unanswered', 'new_reviews')) return 4
    if (has(p, 'no_owner', 'no_review')) return 6
    return 9
  }
  if (p.kind === 'review') return has(p, 'late') ? 2 : 5
  if (p.isDraft) return 10
  if (has(p, 'no_owner', 'no_review')) return 7
  return p.signals.length ? 8 : 9
}
const since = (p: Item) => p.since ?? p.createdAt
export const byRank = (a: Item, b: Item) => rank(a) - rank(b) || since(a).localeCompare(since(b))

// The signal that names the verb, in a fixed order.
const ORDER = ['conflict', 'ci_failed', 'changes_requested', 'unanswered', 'threads', 'new_reviews', 'ready', 'changed', 'no_owner', 'no_review', 'late']
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

// The inbox: one section per next move, in this order. move: what waits on me (reviews I
// was asked for, my PRs that came back); ready: mine to merge; waiting: mine on someone
// else's desk; drafts: mine not out yet; team: teammates' PRs nobody asked me about.
export const SECTIONS = ['move', 'ready', 'waiting', 'drafts', 'team'] as const
export type Section = (typeof SECTIONS)[number]
// Folded until opened: the rest of the team's work is context, not a to-do.
export const FOLDED: Section[] = ['team']

export function sectionOf(p: Item): Section {
  if (p.kind === 'review') return p.isDraft ? 'team' : 'move'
  if (p.kind !== 'mine') return 'team'
  if (p.isDraft) return 'drafts'
  if (has(p, 'ready')) return 'ready'
  if (has(p, 'conflict', 'ci_failed', 'changes_requested', 'threads', 'unanswered', 'new_reviews')) return 'move'
  return 'waiting'
}

// The one action a PR offers, highest rank first: blockers before feedback (CI reruns after a
// rebase, so the conflict comes before CI), then my review, a reviewer, merging, drafts,
// nudges; a teammate's PR nobody asked me about is read, not acted on.
export function action(p: Item, lang: string): { label: string; prompt: string } {
  const go = (k: string, ...args: unknown[]) => ({ label: t(lang, `x_${k}`), prompt: t(lang, `p_${k}`, p.url, ...args) })
  const threads = Number(p.signals.find(s => base(s) === 'threads')?.split(':')[1] ?? 0)
  if (p.kind === 'other') return go('summary')
  if (p.kind === 'review') return has(p, 'changed') ? go('rereview') : go('review', (p.author || '?').replace(/\[bot\]$/, ''))
  if (p.isDraft) return go('finish')
  if (has(p, 'conflict')) return go('conflict')
  if (has(p, 'ci_failed')) return go('ci')
  if (has(p, 'changes_requested')) return go('changes')
  if (has(p, 'threads', 'unanswered', 'new_reviews')) return go('threads', threads)
  if (has(p, 'no_owner')) return go('owner')
  if (has(p, 'ready')) return go('merge')
  return go('nudge')
}

// The colour that wins a row: blocked, then reviewers answered, then asked of me, then ready.
// A row with nothing for me to do has none.
export function tone(p: Item): Tone | null {
  if (p.kind === 'other' || p.isDraft) return null
  if (p.kind === 'review') return 'suggestion'
  if (has(p, 'conflict', 'ci_failed')) return 'error'
  if (has(p, 'changes_requested', 'threads', 'unanswered', 'new_reviews')) return 'warning'
  if (has(p, 'ready')) return 'success'
  return null
}

// A row's tags, before they are fitted: why it is here (signals), then the agent glyph, its
// labels and its size. State, draft and kind are not tags: the glyph and section say them.
export function tags(p: Item): Tag[] {
  const out: Tag[] = []
  for (const s of p.signals) {
    const [k, n] = s.split(':')
    if (k === 'conflict') out.push(sig(I.conflict, '◆'))
    if (k === 'ci_failed') out.push(sig(I.ciFail, '✕'))
    if (k === 'changes_requested') out.push(sig(I.changes, '±'))
    if (k === 'threads') out.push(sig(I.threads, `¶${n}`, Number(n), C.warning))
    if ((k === 'unanswered' || k === 'new_reviews') && !has(p, 'threads')) out.push(sig(I.threads, '¶', Number(n) || undefined, C.warning))
    if (k === 'no_owner') out.push(sig(I.noOwner, '?'))
  }
  if (p.kind === 'review') out.unshift(has(p, 'changed') ? sig(I.eye(C.subtle), '◎') : sig(I.eye(C.suggestion), '◉'))
  if (has(p, 'ready')) out.unshift(...(p.ci === 'pass' ? [sig(I.ciPass, '✓')] : []), sig(I.approved, '✓'))
  if (p.kind === 'mine' && !p.isDraft && p.ci === 'pending') out.push(sig(I.ciPending, '◌'))
  if (p.isAI) out.push({ k: 'ai', svg: I.ai, w: 16, text: '¤' })
  for (const l of [...(p.labels ?? [])].sort(byPriority)) out.push({ k: 'label', ...pill(l.name, l.color), text: `(${l.name})` })
  if (p.size !== undefined) out.push({ k: 'size', svg: I.size(bars(p.size)), w: 16, text: '▂▄▆█'.slice(0, bars(p.size)) })
  return fit(out)
}

// The row's state glyph: the PR icon in the winning colour, dashed for a draft.
const glyph = (p: Item) => (p.isDraft ? I.draft : I.pr(C[tone(p) ?? 'subtle']))

export function reason(error: string, lang: string) {
  if (/gh auth|not logged/i.test(error)) return t(lang, 'err_gh_auth')
  if (/timed out|ETIMEDOUT|timeoutMs/i.test(error)) return t(lang, 'err_timeout')
  return t(lang, 'err_generic')
}

// The pane's own state: the PRs picked for the AI (repo#number), the folded section opened,
// and the repo the list is narrowed to ('' = all).
export type Ui = { selected: string[]; open: string; filter: string }
export const UI: Ui = { selected: [], open: '', filter: '' }

// prompt: what the prompt holds now, so a request already there is never added twice.
type Opts = { now: number; lang: string; minutes: number; running: boolean; ui?: Partial<Ui>; prompt?: string }

// How long ago, in the row's units: minutes under an hour, then ageShort's.
export const ago = (iso: string, now: number, lang: string) => {
  const m = Math.floor((now - Date.parse(iso)) / 6e4)
  return m < 60 ? t(lang, 'in_u_m', Math.max(1, m)) : ageShort(iso, now, lang)
}

export function toViewModel(r: Round | null, o: Opts) {
  const { now, lang } = o
  const ui = { ...UI, ...o.ui }
  const okAt = r?.okAt ?? (r?.error ? null : r?.at) ?? null
  // a scheduled round should have run by now (interval + 15 min) and none did
  const isLate = Boolean(okAt && !r?.error && now - Date.parse(okAt) > (o.minutes + 15) * 6e4)
  // The line under the title: what needs me, then when Argos last looked; a failed check
  // says so in red, with how old the data under it is.
  const failed = Boolean(r?.error)
  const checked = o.running
    ? t(lang, 'ui_checking')
    : !okAt
      ? ''
      : failed
        ? t(lang, 'in_data_from', ago(okAt, now, lang))
        : t(lang, 'in_checked', ago(okAt, now, lang))
  const error = r?.error ? { why: reason(r.error, lang), isAuth: /gh auth|not logged/i.test(r.error) } : null
  const head = { running: o.running, checked, failed, error, isLate }

  if (!r) return { ...head, state: o.running ? ('loading' as const) : ('never' as const), repoCount: 0 }
  if (r.error && !okAt) return { ...head, state: 'noData' as const }
  const connected = r.repos ?? []
  if (r.needsRepos || !connected.length) return { ...head, state: 'noRepos' as const }

  const pending = [...(r.pending ?? [])].sort(byRank)
  const seenUrl = new Set<string>()
  const all = [...pending, ...(r.mine ?? []), ...(r.others ?? [])].filter(p => !seenUrl.has(p.url) && Boolean(seenUrl.add(p.url)))

  // Repos by short name, unless two share it: then owner/name, so they never look alike.
  const names = [...new Set([...connected, ...all.map(p => p.repo)])]
  const short = (repo: string) => (names.filter(n => shortRepo(n) === shortRepo(repo)).length > 1 ? repo : shortRepo(repo))
  const scope = names.includes(ui.filter) ? ui.filter : ''
  const inScope = all.filter(p => !scope || p.repo === scope)
  const picks = new Set(ui.selected)
  // the repo prefix only under All repos, when the list mixes repos
  const showRepo = names.length > 1 && !scope
  const asked = (url: string) => mentions(o.prompt, url)

  const row = (p: Item, section: Section) => {
    const a = action(p, lang)
    const isPicked = picks.has(keyOf(p))
    // tint only where I act; a pick overrides it, the glyph keeps the signal colour
    const tn = section === 'move' || section === 'ready' ? tone(p) : null
    return {
      key: keyOf(p),
      url: p.url,
      number: p.number,
      glyph: glyph(p),
      ref: showRepo ? `${short(p.repo)}#${p.number}` : `#${p.number}`,
      title: p.title,
      wait: ageShort(since(p), now, lang),
      // two days and more: white and bold; age is weight, so colours stay free
      isOld: now - Date.parse(since(p)) >= 2 * 864e5,
      tags: tags(p),
      act: a.label,
      prompt: a.prompt,
      isPicked,
      inPrompt: asked(p.url),
      box: isPicked ? PICKED : tn ? tint(tn) : NEUTRAL,
    }
  }
  const sections = SECTIONS.map(id => {
    const prs = inScope.filter(p => sectionOf(p) === id).sort(byRank)
    const picked = prs.filter(p => picks.has(keyOf(p))).length
    // a folded section never hides a pick: it stays open while it holds one
    const isFolded = FOLDED.includes(id) && ui.open !== id && picked === 0
    return { id, title: t(lang, `s_${id}`), count: prs.length, isFolded, canFold: FOLDED.includes(id) && picked === 0, prs: prs.map(p => row(p, id)) }
  })
  const n = (id: Section) => sections.find(s => s.id === id)!.count
  const need = n('move') ? t(lang, 'in_need', n('move')) : ''
  // Nothing needs me: a green banner takes Your move's place and says what else there is.
  const clear = n('move')
    ? null
    : [
        ...(n('ready') ? [t(lang, 'in_clear_ready', n('ready'))] : []),
        ...(n('waiting') ? [t(lang, 'in_clear_waiting', n('waiting'))] : []),
        ...(n('drafts') ? [t(lang, 'in_clear_drafts', n('drafts'))] : []),
      ].join(' · ')

  // One Select narrows the list to a repo, when there is more than one.
  const repos = names.length > 1 ? [{ id: '', name: t(lang, 'in_all_repos') }, ...names.map(repo => ({ id: repo, name: short(repo) }))] : []

  // The batch: every pick, each row's winning action as one line of the prompt; a pick that
  // left the list (merged, closed) is dropped by the next press.
  const items = all.filter(p => picks.has(keyOf(p)))
  const lines = items.map(p => ({ p, a: action(p, lang) }))
  const fresh = lines.filter(({ p }) => !asked(p.url))

  return {
    ...head,
    state: 'ok' as const,
    need,
    clear,
    counts: Object.fromEntries(SECTIONS.map(id => [id, n(id)])) as Record<Section, number>,
    repos,
    filter: scope,
    sections,
    batch: items.length
      ? {
          count: t(lang, 'in_picked', items.length),
          detail: lines.map(({ p, a }) => `${a.label} #${p.number}`).join(' · '),
          prompt: (fresh.length ? fresh : lines).map(({ a }) => a.prompt).join('\n'),
          urls: items.map(p => p.url),
        }
      : null,
    keep: ui.selected.filter(k => all.some(p => keyOf(p) === k)),
    // the band names what needs me first, the same count as Your move
    band: (() => {
      const move = all.filter(p => sectionOf(p) === 'move').sort(byRank)
      return move[0] ? { count: move.length, verb: verb(move[0], lang), ref: `${shortRepo(move[0].repo)}#${move[0].number}` } : null
    })(),
  }
}
export type ViewModel = ReturnType<typeof toViewModel>
