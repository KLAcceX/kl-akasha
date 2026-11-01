// Round → ViewModel for the pane. The pane exists to take PR review off the person's back: every
// open PR across the connected repos is one line, and all of them go to validation unless the
// person leaves some out (an author, or one PR) or the PR is not ready for it. Nothing reorders
// when something is left out: it dims in place. No mod runtime, so Node can import this file.
import { t } from '../scripts/i18n.mjs'
import type { Item, Round, Verdict, Verdicts } from '../types'
import { AVATAR, C, STARS, type Tag } from './look'

const base = (code: string) => code.split(':')[0] ?? code
const has = (p: Item, ...codes: string[]) => p.signals.some(s => codes.includes(base(s)))
const shortRepo = (repo: string) => repo.split('/')[1] ?? repo
export const keyOf = (p: Item) => `${p.repo}#${p.number}`
// Who opened a PR, as the pane names them, and what kind of author they are.
export const authorOf = (p: Item) => (p.author || '?').replace(/\[bot\]$/, '')
const kindOf = (p: Item) => (p.isAI ? ('agent' as const) : p.isBot || /\[bot\]$/.test(p.author ?? '') ? ('bot' as const) : ('human' as const))

// A PR's verdict from the last validation: none, running, old (new commits since), blockers
// found, partly read (never a pass), or passed. Attention counts risks that do not block.
export type VerdictState = 'none' | 'run' | 'stale' | 'pass' | 'issues' | 'partial'
export function verdictOf(p: Item, v?: Verdict): { state: VerdictState; issues: number; attention: number; finding: string } {
  const attention = v?.attention ?? 0
  if (!v) return { state: 'none', issues: 0, attention: 0, finding: '' }
  if (v.state === 'running') return { state: 'run', issues: 0, attention: 0, finding: '' }
  if (v.sha && p.sha && !p.sha.startsWith(v.sha) && !v.sha.startsWith(p.sha)) return { state: 'stale', issues: v.issues ?? 0, attention, finding: '' }
  const finding = v.finding ?? ''
  if (v.issues) return { state: 'issues', issues: v.issues, attention, finding }
  return { state: v.partial ? 'partial' : 'pass', issues: 0, attention, finding }
}
// The verdict as a star and a count: ✓ passed, the number of blockers, … while it runs, "old"
// once new commits land; `+N` counts what needs attention without blocking.
export function verdictTag(v: ReturnType<typeof verdictOf>, lang: string): Tag {
  const purple = { color: C.merged }
  const more = v.attention ? `+${v.attention}` : ''
  if (v.state === 'pass') return { k: 'sig', svg: STARS.done, w: 16, count: `✓${more}`, ...purple, text: `✦✓${more}`, tip: t(lang, 'tip_v_pass', v.attention) }
  if (v.state === 'issues') return { k: 'sig', svg: STARS.done, w: 16, count: `${v.issues}${more}`, ...purple, text: `✦${v.issues}${more}`, tip: t(lang, 'tip_v_issues', v.issues, v.attention) }
  if (v.state === 'partial') return { k: 'sig', svg: STARS.stale, w: 16, count: '½', color: C.subtle, text: '☆½', tip: t(lang, 'tip_v_partial', v.attention) }
  if (v.state === 'run') return { k: 'sig', svg: STARS.run, w: 16, count: '…', color: C.subtle, text: '◌…', tip: t(lang, 'tip_v_run') }
  if (v.state === 'stale') return { k: 'sig', svg: STARS.stale, w: 16, count: t(lang, 'vd_old'), color: C.subtle, text: `☆${t(lang, 'vd_old')}`, tip: t(lang, 'tip_v_stale') }
  return { k: 'sig', svg: STARS.none, w: 16, text: '✧', tip: t(lang, 'tip_v_none') }
}

// What keeps a PR out of a validation by itself: someone asked for changes (changes requested,
// open threads, an unanswered comment), it is a draft, it was validated with no commit since,
// or a validation of it is running now.
export type Out = 'changes' | 'draft' | 'done' | 'running'
export function outOf(p: Item, v: ReturnType<typeof verdictOf>): Out | null {
  if (v.state === 'run') return 'running'
  if (p.isDraft) return 'draft'
  if (has(p, 'changes_requested', 'threads', 'unanswered', 'new_reviews')) return 'changes'
  if (v.state === 'pass' || v.state === 'issues' || v.state === 'partial') return 'done'
  return null
}

export function reason(error: string, lang: string) {
  if (/gh auth|not logged/i.test(error)) return t(lang, 'err_gh_auth')
  if (/timed out|ETIMEDOUT|timeoutMs/i.test(error)) return t(lang, 'err_timeout')
  return t(lang, 'err_generic')
}

// 5m, 5h, 12d, 3w: minutes under an hour, hours under a day, days under two weeks, then weeks.
export function ago(iso: string, now: number, lang: string): string {
  const m = Math.max(0, (now - Date.parse(iso)) / 6e4)
  if (m < 60) return t(lang, 'in_u_m', Math.max(1, Math.floor(m)))
  const h = m / 60
  if (h < 24) return t(lang, 'u_h', Math.floor(h))
  const d = Math.floor(h / 24)
  return d < 14 ? t(lang, 'u_d', d) : t(lang, 'u_w', Math.floor(d / 7))
}

// The pane's own choices: PRs left out by hand, and PRs the pane left out by itself that the
// person brought back. Authors left out are kept apart (`ignored`), across sessions.
export type Ui = { out: string[]; back: string[] }
export const UI: Ui = { out: [], back: [] }
type Opts = { now: number; lang: string; minutes: number; running: boolean; ui?: Partial<Ui>; verdicts?: Verdicts | null; ignored?: string[] }

export function toViewModel(r: Round | null, o: Opts) {
  const { now, lang } = o
  const ui = { ...UI, ...o.ui }
  const okAt = r?.okAt ?? (r?.error ? null : r?.at) ?? null
  // a scheduled round should have run by now (interval + 15 min) and none did
  const isLate = Boolean(okAt && !r?.error && now - Date.parse(okAt) > (o.minutes + 15) * 6e4)
  const failed = Boolean(r?.error)
  const checked = o.running ? t(lang, 'ui_checking') : !okAt ? '' : t(lang, failed ? 'in_data_from' : 'in_checked', ago(okAt, now, lang))
  const error = r?.error ? { why: reason(r.error, lang), isAuth: /gh auth|not logged/i.test(r.error) } : null
  const head = { running: o.running, checked, failed, error, isLate }

  if (!r) return { ...head, state: o.running ? ('loading' as const) : ('never' as const) }
  if (r.error && !okAt) return { ...head, state: 'noData' as const }
  const connected = r.repos ?? []
  if (r.needsRepos || !connected.length) return { ...head, state: 'noRepos' as const }

  // Every open PR once, in a fixed order (repo, then number), so the list never jumps.
  const seen = new Set<string>()
  const all = [...(r.pending ?? []), ...(r.mine ?? []), ...(r.others ?? [])]
    .filter(p => !seen.has(p.url) && Boolean(seen.add(p.url)))
    .sort((a, b) => a.repo.localeCompare(b.repo) || a.number - b.number)
  const names = [...new Set(all.map(p => p.repo))]
  const short = (repo: string) => (names.filter(n => shortRepo(n) === shortRepo(repo)).length > 1 ? repo : shortRepo(repo))
  const authorsOut = new Set(o.ignored ?? [])
  const byHand = new Set(ui.out)
  const back = new Set(ui.back)

  const rows = all.map(p => {
    const key = keyOf(p)
    const v = verdictOf(p, o.verdicts?.prs?.[p.url])
    const auto = outOf(p, v)
    const name = authorOf(p)
    const kind = kindOf(p)
    // who left it out: the author switch, the person's own tap, or the pane by itself
    const leftBy = authorsOut.has(name) ? 'author' : auto === 'running' ? 'running' : byHand.has(key) ? 'hand' : auto && !back.has(key) ? auto : null
    return {
      key,
      url: p.url,
      repo: p.repo,
      ref: names.length > 1 ? `${short(p.repo)}#${p.number}` : `#${p.number}`,
      title: p.title,
      author: name,
      avatar: kind === 'agent' ? AVATAR.agent : AVATAR[kind](name),
      authorTip: t(lang, `tip_who_${kind}`, name),
      verdict: v.state === 'none' ? null : verdictTag(v, lang),
      isIn: leftBy === null,
      // why the pane left a line out, said at its end; the person's own choices need no word
      why: leftBy === null || leftBy === 'hand' || leftBy === 'author' ? '' : t(lang, `why_${leftBy}`),
      // a running validation and an author left out are not toggled from the line
      canToggle: leftBy !== 'running' && leftBy !== 'author',
      // the pane left it out by itself: a tap brings it back rather than leaving it out
      isAuto: leftBy !== null && leftBy !== 'hand' && leftBy !== 'author' && leftBy !== 'running',
    }
  })

  // Authors as switches: tap to leave one out everywhere, tap again to bring them back. The
  // busiest first, people before bots at a tie.
  const order = { human: 0, agent: 1, bot: 2 }
  const counts = new Map<string, { name: string; kind: 'human' | 'bot' | 'agent'; count: number }>()
  for (const p of all) {
    const name = authorOf(p)
    const a = counts.get(name) ?? { name, kind: kindOf(p), count: 0 }
    a.count++
    counts.set(name, a)
  }
  const authors = [...counts.values()]
    .sort((a, b) => b.count - a.count || order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
    .map(a => ({ ...a, svg: a.kind === 'agent' ? AVATAR.agent : AVATAR[a.kind](a.name), tip: t(lang, `tip_who_${a.kind}`, a.name), isOut: authorsOut.has(a.name) }))

  // What the pane left out by itself, in one line.
  const autoOut = (['changes', 'draft', 'done'] as const)
    .map(why => [why, rows.filter(x => x.isAuto && x.why === t(lang, `why_${why}`)).length] as const)
    .filter(([, n]) => n > 0)
    .map(([why, n]) => t(lang, `out_${why}`, n))
    .join(' · ')

  const going = rows.filter(x => x.isIn)
  // Validation in flight: "Validating 9 of 22" while any of it runs.
  const vb = o.verdicts?.batch?.urls ?? []
  const vrun = vb.filter(u => o.verdicts?.prs?.[u]?.state === 'running').length
  const progress = vrun ? { label: t(lang, 'in_validating', vb.length - vrun, vb.length), pct: `${Math.round(((vb.length - vrun) / vb.length) * 100)}%` } : null

  return {
    ...head,
    state: 'ok' as const,
    summary: t(lang, 'in_to_validate', going.length, new Set(going.map(x => x.repo)).size),
    autoLine: autoOut ? t(lang, 'in_auto_out', autoOut) : '',
    authors,
    rows,
    progress,
    validate: { label: t(lang, 'in_validate_n', going.length), urls: going.map(x => x.url), count: going.length },
  }
}
export type ViewModel = ReturnType<typeof toViewModel>
