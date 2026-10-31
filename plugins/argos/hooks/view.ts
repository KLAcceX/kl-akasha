// Round → ViewModel: every word and number the pane and the band show comes from here,
// so the counts and the prompt sent to the AI always agree. No mod runtime, so Node can
// import this file.
import { t } from '../scripts/i18n.mjs'
import type { Item, Round } from '../types'

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
// Sections the person can send to the AI in a batch; the others take one action per PR.
const BATCH: Section[] = ['move', 'team']
// Folded until opened: the rest of the team's work is context, not a to-do.
export const FOLDED: Section[] = ['team']

export function sectionOf(p: Item): Section {
  if (p.kind === 'review') return p.isDraft ? 'team' : 'move'
  if (p.kind !== 'mine') return 'team'
  if (p.isDraft) return 'drafts'
  if (has(p, 'ready')) return 'ready'
  if (has(p, 'conflict', 'ci_failed', 'changes_requested', 'threads', 'unanswered', 'new_reviews', 'no_owner')) return 'move'
  return 'waiting'
}

// The colour of a PR's action, by what it asks: red when blocked, amber when someone
// waits, blue for a conversation, purple for a changed PR, green to merge.
export type Tone = 'error' | 'warning' | 'suggestion' | 'merged' | 'success'
export function tone(p: Item): Tone | null {
  if (p.kind === 'review') return has(p, 'changed') ? 'merged' : 'warning'
  if (has(p, 'conflict', 'ci_failed', 'changes_requested')) return p.kind === 'mine' ? 'error' : null
  if (has(p, 'threads', 'unanswered', 'new_reviews')) return 'suggestion'
  if (has(p, 'ready')) return 'success'
  if (has(p, 'changed')) return 'merged'
  if (has(p, 'no_owner', 'no_review')) return 'warning'
  return null
}

// The one or two words on a PR's action, and the request that press puts in the prompt.
// A teammate's PR only offers a review, and only when it waits on one.
export function act(p: Item, lang: string): { label: string; prompt: string } | null {
  const s = sectionOf(p)
  if (s === 'drafts') return { label: t(lang, 'a_draft'), prompt: t(lang, 'prompt_ready', p.url) }
  if (s === 'ready') return { label: t(lang, 'a_ready'), prompt: t(lang, 'prompt_merge', p.url) }
  if (p.kind === 'mine' && has(p, 'no_owner') && !has(p, 'conflict', 'ci_failed', 'changes_requested', 'threads', 'unanswered', 'new_reviews'))
    return { label: t(lang, 'a_no_owner'), prompt: t(lang, 'prompt_owner', p.url) }
  if (s === 'waiting') return has(p, 'no_review') ? { label: t(lang, 'a_no_review'), prompt: t(lang, 'prompt_nudge', p.url) } : null
  if (p.kind === 'review') return { label: t(lang, has(p, 'changed') ? 'a_changed' : 'a_review'), prompt: prompt([p], lang) }
  if (p.kind === 'other') return has(p, 'changed', 'no_owner', 'no_review') ? { label: t(lang, has(p, 'changed') ? 'a_changed' : 'a_review'), prompt: prompt([p], lang) } : null
  const [k, n] = top(p)?.split(':') ?? []
  return k ? { label: t(lang, `a_${k}`, Number(n)), prompt: prompt([p], lang) } : null
}

// Review quality drops past about 400 changed lines; past 1,000, most defects go unseen.
export const sizeTag = (n?: number) => (n === undefined ? null : n >= 1000 ? 'XL' : n >= 400 ? 'L' : null)
// More PRs than this in one send gets a warning: the AI works through them in order.
export const MANY = 10

export function reason(error: string, lang: string) {
  if (/gh auth|not logged/i.test(error)) return t(lang, 'err_gh_auth')
  if (/timed out|ETIMEDOUT|timeoutMs/i.test(error)) return t(lang, 'err_timeout')
  return t(lang, 'err_generic')
}

// The pane's own state: the PRs picked for the AI (repo#number), the folded section opened,
// and the repo the list is narrowed to ('' = all).
export type Ui = { selected: string[]; open: string; filter: string }
export const UI: Ui = { selected: [], open: '', filter: '' }

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

// prompt: what the prompt holds now, so a PR already asked for there shows "In prompt ✓".
type Opts = { now: number; lang: string; minutes: number; running: boolean; ui?: Partial<Ui>; prompt?: string }

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

  // Repos by short name, unless two share it: then owner/name, so they never look alike.
  const names = [...new Set([...connected, ...all.map(p => p.repo)])]
  const short = (repo: string) => (names.filter(n => shortRepo(n) === shortRepo(repo)).length > 1 ? repo : shortRepo(repo))
  const scope = names.includes(ui.filter) ? ui.filter : ''
  const inScope = all.filter(p => !scope || p.repo === scope)
  const picks = new Set(ui.selected)
  // a PR names its repo only when the list mixes repos
  const showRepo = names.length > 1 && !scope

  const asked = (url: string) => mentions(o.prompt, url)
  const row = (p: Item) => {
    const a = act(p, lang)
    const picked = picks.has(keyOf(p))
    return {
      key: keyOf(p),
      url: p.url,
      number: p.number,
      title: p.title,
      repo: showRepo ? short(p.repo) : null,
      wait: ageShort(since(p), now, lang),
      // who opened it, when it is not mine
      owner: p.kind === 'mine' ? null : (p.author || '?').replace(/\[bot\]$/, ''),
      size: sizeTag(p.size),
      isAI: Boolean(p.isAI),
      act: a?.label ?? null,
      prompt: a?.prompt ?? null,
      tone: a ? tone(p) : null,
      // a PR with nothing to do says where it stands instead
      status: a ? null : verb(p, lang),
      // already asked for in the prompt: the action says so instead of asking twice
      inPrompt: asked(p.url),
      isPicked: picked,
    }
  }
  const sections = SECTIONS.map(id => {
    const prs = inScope.filter(p => sectionOf(p) === id).sort(byRank)
    const canPick = BATCH.includes(id)
    const chosen = canPick ? prs.filter(p => picks.has(keyOf(p))).length : 0
    const title = t(lang, `s_${id}`)
    const pick = chosen === 0 ? ('none' as const) : chosen === prs.length ? ('all' as const) : ('some' as const)
    // a folded section never hides a pick: it stays open while it holds one
    const isFolded = FOLDED.includes(id) && ui.open !== id && chosen === 0
    return {
      id,
      title,
      count: prs.length,
      canPick,
      picked: chosen,
      pick,
      keys: canPick ? prs.map(keyOf) : [],
      isFolded,
      canFold: FOLDED.includes(id) && chosen === 0,
      prs: prs.map(row),
    }
  })
  const n = (id: Section) => sections.find(s => s.id === id)!.count
  // The line under the title: what needs me, then what is ready and what waits, zeros left out.
  const summary = [
    n('move') ? t(lang, 'sum_move', n('move')) : t(lang, 'sum_calm'),
    ...(n('ready') ? [t(lang, 'sum_ready', n('ready'))] : []),
    ...(n('waiting') ? [t(lang, 'sum_waiting', n('waiting'))] : []),
  ].join(' · ')

  // Narrowing chips, only when there is more than one repo to narrow to: every connected repo
  // with its open PRs, zeros included.
  const repos =
    names.length > 1
      ? [
          { id: '', name: t(lang, 'f_all'), count: all.length, isActive: !scope },
          ...names.map(repo => ({ id: repo, name: short(repo), count: all.filter(p => p.repo === repo).length, isActive: scope === repo })),
        ]
      : []

  // Send carries every pick, also one outside the narrowed repo; the summary says how many,
  // and how many picks left the list (merged, closed) since they were made.
  const items = all.filter(p => BATCH.includes(sectionOf(p)) && picks.has(keyOf(p)))
  const fix = items.filter(p => p.kind === 'mine').length
  const hidden = items.filter(p => scope && p.repo !== scope).length
  const known = new Set(all.map(keyOf))
  const gone = ui.selected.filter(k => !known.has(k)).length
  const block = o.running ? t(lang, 'ui_send_wait') : !items.length ? t(lang, 'ui_send_idle') : null
  const warn = r.error || isLate ? t(lang, 'ui_send_stale', okAt ? hhmm(okAt) : '') : items.length > MANY ? t(lang, 'ui_send_many', items.length) : null

  return {
    ...head,
    state: 'ok' as const,
    summary,
    counts: Object.fromEntries(SECTIONS.map(id => [id, n(id)])) as Record<Section, number>,
    repos,
    sections,
    send: {
      count: items.length,
      // a PR already asked for in the prompt is not asked for twice
      prompt: prompt(items.some(p => !asked(p.url)) ? items.filter(p => !asked(p.url)) : items, lang),
      urls: items.map(p => p.url),
      inPrompt: items.length > 0 && items.every(p => asked(p.url)),
      summary: [
        items.length ? t(lang, 'ui_send_summary', fix, items.length - fix) : '',
        hidden ? t(lang, 'ui_send_hidden', hidden) : '',
        gone ? t(lang, 'ui_send_gone', gone) : '',
      ]
        .filter(Boolean)
        .join(' '),
      // the picks that still mean something, for a press to keep
      keep: ui.selected.filter(k => known.has(k)),
      block,
      warn,
    },
    // the band names what needs me first, the same count as Your move
    band: (() => {
      const move = all.filter(p => sectionOf(p) === 'move').sort(byRank)
      return move[0] ? { count: move.length, verb: verb(move[0], lang), ref: `${shortRepo(move[0].repo)}#${move[0].number}` } : null
    })(),
  }
}
export type ViewModel = ReturnType<typeof toViewModel>
