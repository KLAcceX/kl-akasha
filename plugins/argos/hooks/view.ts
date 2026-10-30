// Round → ViewModel: every word and number the pane and the band show comes from here,
// so the counts, the lists and the age strip always agree. No mod runtime, so Node can
// import this file to preview the strip.
import { t } from '../skills/argos-ward/scripts/i18n.mjs'
import type { Item, Round } from '../types'

const DAY = 864e5
const base = (code: string) => code.split(':')[0]
const has = (p: Item, ...codes: string[]) => p.signals.some(s => codes.includes(base(s)))
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

// A teammate's PR waiting on someone; drafts never count.
const stuck = (p: Item) => !p.isDraft && has(p, 'no_review', 'late')
// What puts the red mark over an age bar.
const ALERT = ['conflict', 'ci_failed', 'late']

// The signal that names the verb, in a fixed order.
const ORDER = ['conflict', 'ci_failed', 'changes_requested', 'unanswered', 'threads', 'new_reviews', 'ready', 'no_review', 'late']
const top = (p: Item) => ORDER.map(k => p.signals.find(s => base(s) === k)).find(Boolean)

export function verb(p: Item, lang: string): string {
  if (p.kind === 'review') return t(lang, 'v_review', p.author || '?')
  const code = top(p)
  if (!code) return t(lang, 'v_idle')
  const [k, n] = code.split(':')
  if (k === 'no_review' && p.kind === 'mine') return t(lang, 'v_ask_review')
  return t(lang, `v_${k}`, Number(n))
}
function signalWord(p: Item, lang: string) {
  if (p.kind === 'review') return [t(lang, 'm_review'), ...(has(p, 'late') ? [t(lang, 'm_late')] : [])].join(' · ')
  const code = top(p)
  if (!code) return ''
  const [k, n] = code.split(':')
  return t(lang, `m_${k}`, Number(n))
}

// 5h, 12d, 3w: hours under a day, days under two weeks, then weeks.
export function ageShort(iso: string, now: number, lang: string): string {
  const h = Math.max(0, (now - Date.parse(iso)) / 36e5)
  if (h < 24) return t(lang, 'u_h', Math.max(1, Math.floor(h)))
  const d = Math.floor(h / 24)
  return d < 14 ? t(lang, 'u_d', d) : t(lang, 'u_w', Math.floor(d / 7))
}

// Open PRs by age: <1d, 1–3d, 3–7d, 1–2 weeks, over 2 weeks.
const LIMITS = [1, 3, 7, 14]
const bucket = (p: Item, now: number) => {
  const i = LIMITS.findIndex(l => (now - Date.parse(p.createdAt)) / DAY < l)
  return i < 0 ? 4 : i
}

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// The age strip, 240 × 40: five bars scaled to the fullest bucket, on its own dark
// background so it reads in both themes. Red mark = a bucket holds a blocked PR.
// Everything it shows is also in the text line beside it.
export function ageStrip(counts: number[], alerts: boolean[], labels: string[], title: string) {
  const max = Math.max(1, ...counts)
  const cols = counts.map((n, i) => {
    const x = 10 + i * 46
    const h = n ? Math.max(3, Math.round((18 * n) / max)) : 0
    const bar = n
      ? `<rect x="${x}" y="${26 - h}" width="36" height="${h}" rx="2" fill="${i === 4 ? '#F3EEFB' : '#A98BE0'}"/>`
      : `<rect x="${x}" y="25" width="36" height="1" fill="#51408A"/>`
    const alert = n && alerts[i] ? `<rect x="${x + 12}" y="${21 - h}" width="12" height="2" rx="1" fill="#E5384A"/>` : ''
    return `${bar}${alert}<text x="${x + 18}" y="37" font-size="9" text-anchor="middle" fill="#A98BE0">${xml(labels[i])}</text>`
  })
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 40" width="240" height="40" font-family="system-ui, -apple-system, Segoe UI, sans-serif">' +
    `<title>${xml(title)}</title><rect width="240" height="40" rx="6" fill="#1E1430"/>${cols.join('')}</svg>`
  )
}

// The pane's own state: which row is open ('' = the first one, '-' = none), the team
// section, how many rows each section shows, and the last prompt fill and copy.
export type Ui = { expanded: string; teamOpen: boolean; youLimit: number; teamLimit: number; sent: string; copied: string }
export const UI: Ui = { expanded: '', teamOpen: false, youLimit: 8, teamLimit: 8, sent: '', copied: '' }
export const STEP = 8

export function reason(error: string, lang: string) {
  if (/gh auth|not logged/i.test(error)) return t(lang, 'err_gh_auth')
  if (/timed out|ETIMEDOUT|timeoutMs/i.test(error)) return t(lang, 'err_timeout')
  return t(lang, 'err_generic')
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
  const head = { running: o.running, seen, seenTime: okAt ? hhmm(okAt) : '', status, isLate }

  if (!r) return { ...head, state: o.running ? ('loading' as const) : ('never' as const) }
  if (r.error && !okAt) return { ...head, state: 'noData' as const }
  const repos = r.repos ?? []
  if (r.needsRepos || !repos.length) return { ...head, state: 'noRepos' as const }

  const pending = [...(r.pending ?? [])].sort(byRank)
  const asked = new Set(pending.map(p => p.url))
  // teammates' PRs: stuck first, then oldest first
  const team = (r.others ?? [])
    .filter(p => !asked.has(p.url))
    .sort((a, b) => Number(stuck(b)) - Number(stuck(a)) || a.createdAt.localeCompare(b.createdAt))
  const mine = r.mine ?? pending.filter(p => p.kind === 'mine')
  const seenUrl = new Set<string>()
  const open = [...mine, ...pending, ...team].filter(p => !seenUrl.has(p.url) && Boolean(seenUrl.add(p.url)))
  if (!open.length) return { ...head, state: 'noPRs' as const, repos: repos.length }

  const youShown = pending.slice(0, ui.youLimit)
  const teamShown = ui.teamOpen ? team.slice(0, ui.teamLimit) : []
  const visible = new Set([...youShown, ...teamShown].map(keyOf))
  const activeKey = ui.expanded === '-' ? '' : visible.has(ui.expanded) ? ui.expanded : youShown[0] ? keyOf(youShown[0]) : ''

  const row = (p: Item) => {
    const key = keyOf(p)
    const isMine = p.kind === 'mine'
    const age = ageShort(p.createdAt, now, lang)
    const who = isMine ? t(lang, 'm_you') : p.author || '?'
    const draft = p.isDraft ? [t(lang, 'm_draft')] : []
    const ref = `${shortRepo(p.repo)} #${p.number}`
    const v = verb(p, lang)
    // a ready PR is merged on GitHub; there is nothing for the AI to fix
    const ai = !isMine
      ? { label: t(lang, 'ui_review'), prompt: t(lang, 'prompt_panoptes', p.url) }
      : top(p) && !has(p, 'ready')
        ? { label: t(lang, 'ui_fix'), prompt: t(lang, 'prompt_ward', p.url, v) }
        : null
    return {
      key,
      url: p.url,
      number: p.number,
      ref,
      title: p.kind === 'review' ? `${t(lang, 'ui_review_prefix')}${p.title}` : p.title,
      fullTitle: p.title,
      verb: v,
      age: age.padStart(4),
      meta: [ref, signalWord(p, lang), ...(isMine ? [] : [who]), ...draft].filter(Boolean).join(' · '),
      metaLong: [ref, t(lang, 'm_opened', age), who, ...draft].join(' · '),
      ai,
      inPrompt: ui.sent === `${r.at}|${key}`,
      copyLabel: ui.copied === key ? t(lang, 'ui_copied') : ui.copied === `fail:${key}` ? t(lang, 'ui_copy_failed') : t(lang, 'ui_copy'),
      isActive: key === activeKey,
    }
  }

  const oldestOf = (list: Item[]) => list.reduce<Item | null>((o, p) => (!o || p.createdAt < o.createdAt ? p : o), null)
  const teamStuck = team.filter(stuck).length
  const teamOldest = oldestOf(team)

  const counts = [0, 0, 0, 0, 0]
  const alerts = [false, false, false, false, false]
  let flagged = 0
  for (const p of open) {
    const i = bucket(p, now)
    counts[i]++
    if (has(p, ...ALERT)) {
      alerts[i] = true
      flagged++
    }
  }
  const labels = t(lang, 'age_buckets') as unknown as string[]
  const line = [t(lang, 'ui_flagged', flagged), ...labels.map((l, i) => `${l} ${counts[i]}`)].join(' · ')
  const oldest = oldestOf(open) as Item

  return {
    ...head,
    state: 'ok' as const,
    at: r.at,
    activeKey,
    you: {
      count: pending.length,
      mineOpen: mine.length,
      rows: youShown.map(row),
      more: pending.length - youShown.length,
    },
    team: team.length
      ? {
          count: team.length,
          stuck: teamStuck,
          label: t(lang, 'ui_team_head', teamStuck, team.length, teamOldest ? ageShort(teamOldest.createdAt, now, lang) : '', ui.teamOpen),
          isOpen: ui.teamOpen,
          rows: teamShown.map(row),
          more: ui.teamOpen ? team.length - teamShown.length : 0,
        }
      : null,
    age: {
      total: open.length,
      counts,
      flagged,
      line,
      svg: ageStrip(counts, alerts, labels, line),
      oldest: { age: ageShort(oldest.createdAt, now, lang), number: oldest.number, url: oldest.url, repo: shortRepo(oldest.repo) },
    },
    band: pending[0] ? { count: pending.length, verb: verb(pending[0], lang), ref: `${shortRepo(pending[0].repo)}#${pending[0].number}` } : null,
  }
}
export type ViewModel = ReturnType<typeof toViewModel>
