// Round → ViewModel for the pane. The pane exists to take PR review off the person's back: every
// open PR across the connected repos is one line, and all of them go to validation unless the
// person leaves some out (an author, or one PR) or the PR is not ready for it. Nothing reorders
// when something is left out: it dims in place. No mod runtime, so Node can import this file.
import { label, t } from '../scripts/i18n.mjs'
import type { Item, RepoCfg, Round, Verdict, Verdicts } from '../types'
import { AVATAR, C, MOSAIC, STARS, type Tag } from './look'

// characters of mosaic paths one render may carry, about half the pane's tree budget
export const MOSAIC_BUDGET = 120_000

const base = (code: string) => code.split(':')[0] ?? code
const has = (p: Item, ...codes: string[]) => p.signals.some(s => codes.includes(base(s)))
const shortRepo = (repo: string) => repo.split('/')[1] ?? repo
export const keyOf = (p: Item) => `${p.repo}#${p.number}`
// Who opened a PR, as the pane names them, and what kind of author they are.
export const authorOf = (p: Item) => (p.author || '?').replace(/\[bot\]$/, '')
export const kindOf = (p: Item) => (p.isAI ? ('agent' as const) : p.isBot || /\[bot\]$/.test(p.author ?? '') ? ('bot' as const) : ('human' as const))

// A PR's verdict from the last validation: none, queued (a run asked for it), running, failed (it
// could not be validated, it ran past the time limit, or its agent never reached it), old (new
// commits since), blockers found, partly read (never a pass), or passed. Attention counts risks
// that do not block. The limit counts from when the agent started that PR (minutes, a setting).
export const QUEUE_LIMIT = 60 * 6e4
// As merge.mjs writes it.
const OLD_APPROVAL = 'stale approval: dismiss it on GitHub'
export type VerdictState = 'none' | 'queued' | 'run' | 'failed' | 'stale' | 'pass' | 'issues' | 'partial'
// Automatic rounds try a failed validation again this many times, then once a day: what the network
// lost comes back by itself, what cannot be read stops spending. A new commit waits for that day.
export const MAX_TRIES = 3
const RETRY_AFTER = 24 * 36e5
export const retriesNow = (v: Verdict, now: number) => (v.tries ?? 0) < MAX_TRIES || now - Date.parse(v.at) > RETRY_AFTER

// The types a report's lines start with ("- [security] a.js:1: ..."), one per finding.
export const typesOf = (report = '') => report.split('\n').flatMap(l => l.match(/^\s*-\s*\[([a-z]+)\]/)?.[1] ?? [])

// The runs history.jsonl records, newest first: each PR by its last line in that run, with what was
// posted and merged for that commit since. Kept by age, since auto-validate can make dozens a day.
// ponytail: the whole file parsed on each draw of these pages, and failures past the time limit are
// not recorded; both fine at 5000 lines and one person.
export type HistoryLine = { kind: string; url: string; sha?: string; issues?: number; attention?: number; partial?: boolean; finding?: string; report?: string; run?: string; state?: string; why?: string; at: string }
const KEEP_DAYS = 30
export function runsOf(history: HistoryLine[], now?: number) {
  const runs = new Map<string, Map<string, HistoryLine>>()
  const after = new Map<string, HistoryLine>()
  for (const e of history) {
    if ((e.kind === 'verdict' || e.kind === 'failed') && e.run) runs.set(e.run, (runs.get(e.run) ?? new Map()).set(e.url, e))
    if (e.kind === 'published' || e.kind === 'merge') after.set(`${e.kind}:${e.url}@${e.sha}`, e)
  }
  return [...runs]
    .sort(([a], [b]) => b.localeCompare(a))
    .filter(([at]) => !(now && now - Date.parse(at) > KEEP_DAYS * 864e5))
    .map(([at, items]) => ({
      at,
      items: [...items.values()].map(e => ({ ...e, published: after.get(`published:${e.url}@${e.sha}`), merged: after.get(`merge:${e.url}@${e.sha}`) })),
    }))
}

// The runs by local day, newest first.
export function daysOf<R extends { at: string }>(runs: R[], now: number) {
  const dayOf = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const days = new Map<string, R[]>()
  for (const run of runs) days.set(dayOf(Date.parse(run.at)), [...(days.get(dayOf(Date.parse(run.at))) ?? []), run])
  return [...days].map(([key, list]) => ({ key, runs: list, isToday: key === dayOf(now), isYesterday: key === dayOf(now - 864e5) }))
}

// How a report stands, as the person reads it: its first word on the line. Only these three wait on them.
export type ReportState = 'failed' | 'publish' | 'notPublished' | 'notConfirmed' | 'published' | 'outdated' | 'validating' | 'own' | 'partly' | 'quiet' | 'merged' | 'closed'
export type ReportRow = { key: string; url: string; repo: string; where: string; num: string; isOwn: boolean; title: string; state: ReportState; issues: number; attention: number; partial: boolean; text: string; sha: string; why: string; at: string; canPublish: boolean }
export const isWaiting = (x: ReportRow) => x.state === 'publish' || x.state === 'notPublished' || x.state === 'notConfirmed'
const isClean = (x: ReportRow) => x.state !== 'failed' && !x.issues && !x.attention && !x.partial && !x.text
// Severity groups, so publishing never moves a row and the next report never jumps: only how much it
// found orders them, never its state. Other people's PRs only: the person's own have a page of their
// own, since they get no comment and would bury what does.
const byFound = (a: ReportRow, b: ReportRow) => b.issues - a.issues || b.attention - a.attention || a.repo.localeCompare(b.repo) || a.url.localeCompare(b.url, undefined, { numeric: true })
export function reportGroups(rows: ReportRow[]) {
  const theirs = rows.filter(x => !x.isOwn)
  const failed = theirs.filter(x => x.state === 'failed').sort(byFound)
  const blocks = theirs.filter(x => x.state !== 'failed' && x.issues).sort(byFound)
  const look = theirs.filter(x => x.state !== 'failed' && !x.issues && !isClean(x)).sort(byFound)
  const own = rows.filter(x => x.isOwn && !isClean(x)).sort(byFound)
  const walk = [...failed, ...blocks, ...look]
  return { failed, blocks, look, own, clean: rows.filter(isClean).sort(byFound), walk, all: [...walk, ...own] }
}
// Every report in one line of reading, the list's order, both ways: nothing to remember and nowhere to get stuck.
export function nearReports(list: ReportRow[], x: ReportRow) {
  const at = list.findIndex(r => r.url === x.url)
  return { at, prev: at > 0 ? list[at - 1] : undefined, next: list[at + 1] }
}
// A report's lines to draw: a heading, a finding split by its tag and place, or as it came. Nothing
// is hidden, and no count comes from here: those are the verdict's issues and attention.
export function reportLines(text: string) {
  return text
    .split('\n')
    .filter(l => l.trim())
    .map(line => {
      // findings.mjs writes "- [bug] Blocker · `a.js:1`: title"; reports from before it have no severity
      const found = line.match(/^\s*-\s*\[([a-z-]+)\]\s*(?:([^·`]+?)\s*·\s*)?`?([^`:]+(?::\d+)?)`?:\s*(.*)$/)
      if (found) return { kind: 'finding' as const, tag: found[1]!, ...(found[2] && { severity: found[2] }), place: found[3]!, text: found[4]!.replace(/`/g, '') }
      if (/^\S[^.]*:$/.test(line.trim())) return { kind: 'heading' as const, text: line.trim().slice(0, -1) }
      return { kind: 'line' as const, text: line }
    })
}

// What a line says about publish.mjs's outcome; what needs no word (a pass, a PR of the person's) says nothing.
const QUIET_PUBLISH = new Set(['nothing to publish', 'your PR'])
const publishNote = (p: Verdict['published'], lang: string) =>
  !p || (p.state === 'skipped' && QUIET_PUBLISH.has(p.why))
    ? null
    : p.state === 'posted'
      ? { text: t(lang, 'vn_published'), tone: 'success' as const }
      : { text: t(lang, 'pb_failed', t(lang, 'mg_why', p.why)), tone: 'warning' as const }

export function verdictOf(p: Item, v?: Verdict, now?: number, limit = 10): { state: VerdictState; issues: number; attention: number; finding: string } {
  const attention = v?.attention ?? 0
  const idle = now && v ? now - Date.parse(v.at) : 0
  const failed = (finding: string) => ({ state: 'failed' as const, issues: 0, attention: 0, finding })
  if (!v) return { state: 'none', issues: 0, attention: 0, finding: '' }
  if (v.state === 'queued') return idle > QUEUE_LIMIT ? failed('agent stopped') : { state: 'queued', issues: 0, attention: 0, finding: '' }
  if (v.state === 'running') return idle > limit * 6e4 ? failed(`timed out after ${limit} min`) : { state: 'run', issues: 0, attention: 0, finding: '' }
  if (v.state === 'failed') return failed(v.reason || 'failed')
  if (v.sha && p.sha && !p.sha.startsWith(v.sha) && !v.sha.startsWith(p.sha)) return { state: 'stale', issues: v.issues ?? 0, attention, finding: '' }
  const finding = v.finding ?? ''
  if (v.issues) return { state: 'issues', issues: v.issues, attention, finding }
  return { state: v.partial ? 'partial' : 'pass', issues: 0, attention, finding }
}
// The verdict as a purple star (Argos looked) and a count: a green ✓ passed, the number of
// blockers in amber (purple never means a problem), a hollow grey star once new commits land;
// `+N` counts what needs attention without blocking.
export function verdictTag(v: ReturnType<typeof verdictOf>, lang: string): Tag {
  const more = v.attention ? `+${v.attention}` : ''
  if (v.state === 'pass') return { k: 'sig', svg: STARS.done, w: 16, count: `✓${more}`, color: C.success, text: `✦✓${more}`, tip: t(lang, 'tip_v_pass', v.attention) }
  if (v.state === 'issues')
    return { k: 'sig', svg: STARS.done, w: 16, count: `${v.issues}${more}`, color: C.warning, text: `✦${v.issues}${more}`, tip: t(lang, 'tip_v_issues', v.issues, v.attention) }
  if (v.state === 'partial') return { k: 'sig', svg: STARS.stale, w: 16, count: '½', color: C.subtle, text: '☆½', tip: t(lang, 'tip_v_partial', v.attention) }
  if (v.state === 'run' || v.state === 'queued') return { k: 'sig', svg: STARS.run, w: 16, text: '◌', tip: t(lang, 'tip_v_run') }
  if (v.state === 'failed') return { k: 'sig', svg: STARS.stale, w: 16, count: '✕', color: C.error, text: '☆✕', tip: t(lang, 'tip_v_failed', v.finding) }
  if (v.state === 'stale') return { k: 'sig', svg: STARS.stale, w: 16, text: '☆', tip: t(lang, 'tip_v_stale') }
  return { k: 'sig', svg: STARS.none, w: 16, text: '✧', tip: t(lang, 'tip_v_none') }
}

// The last run, from verdicts.json's batch: how far it got (a PR counts as started once its agent
// reached it), what failed, and what auto-merge did; `doneAt` is when its last
// verdict landed. `label` says it in one line, for the toast. Null before the first run.
export function runOf(vs: Verdicts | null | undefined, now: number, lang: string, limit = 10) {
  const urls = vs?.batch?.urls ?? []
  if (!urls.length) return null
  const states = urls.map(url => ({ url, v: verdictOf({ sha: undefined } as Item, vs!.prs[url], now, limit), raw: vs!.prs[url] }))
  const count = (...st: VerdictState[]) => states.filter(s => st.includes(s.v.state)).length
  const queued = count('queued')
  const running = count('run')
  const failed = count('failed')
  const validated = urls.length - queued - running - failed
  const merged = states.filter(s => s.raw?.merge?.state === 'merged').length
  const approved = states.filter(s => s.raw?.merge?.state === 'approved').length
  const isRunning = queued + running > 0
  const parts = [
    isRunning ? t(lang, 'in_validating', urls.length - queued, urls.length) : t(lang, 'run_validated', validated),
    failed ? t(lang, 'run_failed', failed) : '',
    merged ? t(lang, 'run_merged', merged) : '',
    approved ? t(lang, 'run_approved', approved) : '',
  ]
  const doneAt = Math.max(...states.map(s => Date.parse(s.raw?.at ?? '') || 0))
  return {
    isRunning,
    at: vs!.batch.at,
    doneAt,
    urls,
    total: urls.length,
    validated,
    failed,
    merged,
    approved,
    label: parts.filter(Boolean).join(' · '),
  }
}

// What keeps a PR out of a validation by itself: someone asked for changes (changes requested,
// open threads, an unanswered comment), it is a draft, it was validated with no commit since,
// or a validation of it is running now.
export type Out = 'changes' | 'draft' | 'done' | 'running'
export function outOf(p: Item, v: ReturnType<typeof verdictOf>): Out | null {
  if (v.state === 'run' || v.state === 'queued') return 'running'
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
// Who presets: the kinds each leaves out, offered when the kinds it names have authors here.
export const PRESETS = [
  { id: 'everyone', kinds: [], when: [] },
  { id: 'no_bots', kinds: ['bot'], when: ['bot'] },
  { id: 'people', kinds: ['bot', 'agent'], when: ['agent'] },
  { id: 'bots', kinds: ['human', 'agent'], when: ['bot'] },
  { id: 'agents', kinds: ['human', 'bot'], when: ['agent'] },
] as const satisfies readonly { id: string; kinds: readonly string[]; when: readonly string[] }[]
const kindsOut = (out: Set<string>) => [...out].filter(x => x.startsWith('kind:')).map(x => x.slice(5))
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x))
export const UI: Ui = { out: [], back: [] }
// limit: minutes a PR may stay "validating"; repos: auto-merge and prompt per repo (repos.json)
type Opts = {
  now: number
  lang: string
  minutes: number
  running: boolean
  ui?: Partial<Ui>
  verdicts?: Verdicts | null
  ignored?: string[]
  limit?: number
  repos?: RepoCfg[]
  fixing?: string[]
}
// 14:30, the person's own clock: times instead of "in 12 min", so nothing on screen ticks
// How long, short: 45m, 5h, 3d.
export const ageOf = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 6e4))
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`
}
export const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const TONE = { subtle: C.subtle, brand: C.brand, success: C.success, warning: C.warning, error: C.error } as const
type Tone = keyof typeof TONE

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
  // every connected repo, with or without open PRs: one with none must not vanish from the list or
  // from Settings
  const names = [...new Map([...all.map(p => p.repo), ...(r.repos ?? []), ...(o.repos ?? []).map(c => c.repo)].map(n => [n.toLowerCase(), n])).values()].sort((a, b) =>
    a.localeCompare(b),
  )
  const short = (repo: string) => (names.filter(n => shortRepo(n) === shortRepo(repo)).length > 1 ? repo : shortRepo(repo))
  const authorsOut = new Set(o.ignored ?? [])
  // an author is out by name, or with their whole kind (kind:bot, kind:agent)
  const isOut = (name: string, kind: string) => authorsOut.has(name) || authorsOut.has(`kind:${kind}`)
  // the author's real picture as a mosaic when the round drew one; else their letter. A photo
  // takes ~5KB of the pane's text budget (262144 chars) at each line and at its switch, so authors
  // get theirs in list order while MOSAIC_BUDGET lasts, and the rest keep their letter throughout.
  const uses = new Map<string, number>()
  for (const p of all) uses.set(p.author ?? '', (uses.get(p.author ?? '') ?? 0) + 1)
  const withPhoto = new Set<string>()
  let spent = 0
  for (const [login, n] of uses) {
    const cost = (r.avatars?.[login]?.length ?? 0) * (n + 1)
    if (!cost || spent + cost > MOSAIC_BUDGET) continue
    spent += cost
    withPhoto.add(login)
  }
  const pic = (p: Item, kind: 'human' | 'bot' | 'agent', name: string) =>
    withPhoto.has(p.author ?? '') ? MOSAIC(r.avatars![p.author ?? '']!) : kind === 'agent' ? AVATAR.agent : AVATAR[kind](name)
  const byHand = new Set(ui.out)
  const back = new Set(ui.back)
  // An author is an agent if any of their PRs writes code (see queue.mjs), else as their PRs say.
  const kindOfAuthor = new Map<string, 'human' | 'bot' | 'agent'>()
  for (const p of all) if (kindOfAuthor.get(authorOf(p)) !== 'agent') kindOfAuthor.set(authorOf(p), kindOf(p))

  // The last run, while it goes and after, until the next run or check: its lines say how each
  // ended ("validated · passed", "failed · no access", "merged · squash") instead of their reason.
  const limit = o.limit ?? 10
  const run = runOf(o.verdicts, now, lang, limit)
  // the run's summary lasts until the next check; a failed PR keeps saying why on its own line
  const showRun = Boolean(run && (run.isRunning || run.doneAt > Date.parse(okAt ?? '')))
  const inRun = new Set(showRun ? run!.urls : [])
  // the person's PRs a fixing agent holds right now
  const fixingSet = new Set(o.fixing ?? [])
  const cfgOf = (repo: string) => (o.repos ?? []).find(c => c.repo.toLowerCase() === repo.toLowerCase())
  // how a line in the run ended, in words, with the tone of its colour
  const statusOf = (p: Item, v: ReturnType<typeof verdictOf>): { text: string; tone: Tone } | null => {
    if (fixingSet.has(p.url)) return { text: t(lang, 'st_fixing'), tone: 'subtle' }
    if (v.state === 'failed') {
      const gaveUp = o.verdicts?.auto !== 'off' && (o.verdicts?.prs?.[p.url]?.tries ?? 0) >= MAX_TRIES
      return { text: `${t(lang, 'st_failed', v.finding)}${gaveUp ? ` · ${t(lang, 'st_gave_up', MAX_TRIES)}` : ''}`, tone: 'error' }
    }
    if (!inRun.has(p.url)) return null
    const raw = o.verdicts!.prs[p.url]!
    // merge.mjs could not take back its approval: this holds until it does, whatever the verdict
    if (raw.merge?.why === OLD_APPROVAL) return { text: t(lang, 'st_skipped', t(lang, 'mg_why', raw.merge.why)), tone: 'warning' }
    if (v.state === 'queued') return { text: t(lang, 'st_queued'), tone: 'subtle' }
    if (v.state === 'run') return { text: t(lang, 'st_validating', Math.max(1, Math.floor((now - Date.parse(raw.at)) / 6e4))), tone: 'subtle' }
    // commits landed after the verdict: it no longer speaks for the head
    if (v.state === 'stale') return cfgOf(p.repo)?.merge ? { text: t(lang, 'st_skipped', t(lang, 'mg_new')), tone: 'warning' } : { text: t(lang, 'st_stale'), tone: 'subtle' }
    const note = publishNote(raw.published, lang)
    if (note) return note
    if (raw.merge) return { text: t(lang, `st_${raw.merge.state}`, t(lang, 'mg_why', raw.merge.why)), tone: raw.merge.state === 'skipped' ? 'warning' : 'success' }
    // a repo with auto-merge says why a verdict that did not pass was not merged
    if (cfgOf(p.repo)?.merge && (v.state !== 'pass' || v.attention))
      return {
        text: t(lang, 'st_skipped', v.issues ? t(lang, 'mg_blockers', v.issues) : v.attention ? t(lang, 'mg_attention', v.attention) : t(lang, 'mg_partial')),
        tone: 'warning',
      }
    if (v.state === 'issues') return { text: t(lang, 'st_issues', v.issues), tone: 'warning' }
    return v.state === 'partial' ? { text: t(lang, 'st_partial'), tone: 'subtle' } : { text: t(lang, 'st_passed'), tone: 'success' }
  }
  // while a run goes the boxes give way to how each line stands: ○ waiting, ⠿ validating, ✓ done,
  // ✕ failed, nothing for a line outside the run
  const markOf = (p: Item, v: ReturnType<typeof verdictOf>): { glyph: string; tone: Tone } => {
    if (!inRun.has(p.url)) return { glyph: '', tone: 'subtle' }
    if (v.state === 'queued') return { glyph: '○', tone: 'subtle' }
    if (v.state === 'run') return { glyph: '⠿', tone: 'brand' }
    return v.state === 'failed' ? { glyph: '✕', tone: 'error' } : { glyph: '✓', tone: 'success' }
  }

  const rows = all.map(p => {
    const key = keyOf(p)
    const v = verdictOf(p, o.verdicts?.prs?.[p.url], now, limit)
    const auto = outOf(p, v)
    const merged = o.verdicts?.prs?.[p.url]?.merge
    const published = o.verdicts?.prs?.[p.url]?.published
    const pubNote = publishNote(published, lang)
    const status = statusOf(p, v)
    const name = authorOf(p)
    const kind = kindOfAuthor.get(name)!
    // who left it out: the author switch, the person's own tap, or the pane by itself
    const leftBy = isOut(name, kind) ? 'author' : auto === 'running' ? 'running' : byHand.has(key) ? 'hand' : auto && !back.has(key) ? auto : null
    return {
      key,
      url: p.url,
      repo: p.repo,
      num: `#${p.number}`,
      title: p.title,
      author: name,
      avatar: pic(p, kind, name),
      authorTip: t(lang, `tip_who_${kind}`, name),
      verdict: v.state === 'none' ? null : verdictTag(v, lang),
      // the verdict's state, for the dashboard's counts
      vstate: v.state,
      finding: v.finding,
      // how long it has waited on whoever holds it
      age: ageOf(now - Date.parse(p.since ?? p.createdAt)),
      // what stands, in words, each in the colour that repeats it: why the pane left it out, what
      // the verdict said (a blocker with what it found), what auto-merge did
      said: [
        // what is asked, as the dashboard says it, so a PR found from Needs you reads the same here
        ...p.signals.map(code => ({ text: label(lang, code), color: C.subtle })),
        ...(leftBy === 'done' || leftBy === null
          ? []
          : [{ text: leftBy === 'author' ? t(lang, 'why_author') : leftBy === 'hand' ? t(lang, 'why_human') : t(lang, `why_${leftBy}`), color: C.subtle }]),
        ...(v.state === 'issues' ? [{ text: `${t(lang, 'vn_blockers', v.issues)}${v.finding ? `: ${v.finding}` : ''}`, color: C.warning }] : []),
        ...(v.state === 'pass' ? [{ text: t(lang, 'vn_passed'), color: C.success }] : []),
        ...(v.state === 'partial' ? [{ text: t(lang, 'vn_partial'), color: C.subtle }] : []),
        ...(v.state === 'stale' ? [{ text: t(lang, 'st_stale'), color: C.subtle }] : []),
        ...(v.attention ? [{ text: t(lang, 'vn_attention', v.attention), color: C.warning }] : []),
        ...(merged ? [{ text: t(lang, `st_${merged.state}`, merged.why), color: merged.state === 'skipped' ? C.warning : C.success }] : []),
        ...(pubNote ? [{ text: pubNote.text, color: TONE[pubNote.tone] }] : []),
      ],
      isIn: leftBy === null,
      // what would go on the PR, while it can: someone else's, on the current commit, not left to
      // humans, not out yet
      isOwn: p.kind === 'mine' || Boolean(r.me && p.author === r.me),
      report:
        p.kind !== 'mine' && !(r.me && p.author === r.me) && ['issues', 'pass', 'partial'].includes(v.state) && (v.issues || v.attention) && leftBy !== 'hand' && leftBy !== 'author' && (!published || published.state === 'failed')
          ? (o.verdicts?.prs?.[p.url]?.report ?? '')
          : '',
      // why the pane left a line out, said at its end; the person's own choices need no word
      why: leftBy === 'author' ? t(lang, 'why_author') : leftBy === 'hand' ? t(lang, 'why_human') : leftBy === null ? '' : t(lang, `why_${leftBy}`),
      // what auto-merge did with a passing verdict: approved (others must still review), or why not
      mergeNote: merged ? t(lang, `st_${merged.state}`, merged.why) : '',
      // in the last run: how it ended, in words and the colour of its tone; its mark while it runs
      status: status && { text: status.text, color: TONE[status.tone] },
      mark: (m => ({ glyph: m.glyph, color: TONE[m.tone] }))(markOf(p, v)),
      // a running validation and an author left out are not toggled from the line
      canToggle: leftBy !== 'running' && leftBy !== 'author',
      isRunning: leftBy === 'running',
      // the pane would leave it out by itself (a draft, changes asked, already validated)
      hasReason: Boolean(auto) && auto !== 'running',
      // the pane left it out by itself: a tap brings it back rather than leaving it out
      isAuto: leftBy !== null && leftBy !== 'hand' && leftBy !== 'author' && leftBy !== 'running',
      // the person's own PR with a change asked or a comment open: work to redo, then validate
      isRework: (p.kind === 'mine' || (Boolean(r.me) && p.author === r.me)) && has(p, 'changes_requested', 'threads', 'unanswered', 'new_reviews'),
    }
  })

  // Authors as switches: tap to leave one out everywhere, tap again to bring them back. The
  // busiest first, people before bots at a tie.
  const order = { human: 0, agent: 1, bot: 2 }
  const counts = new Map<string, { name: string; kind: 'human' | 'bot' | 'agent'; count: number; p: Item }>()
  for (const p of all) {
    const name = authorOf(p)
    const a = counts.get(name) ?? { name, kind: kindOfAuthor.get(name)!, count: 0, p }
    a.count++
    counts.set(name, a)
  }
  const authors = [...counts.values()]
    .sort((a, b) => b.count - a.count || order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
    .map(({ p, ...a }) => ({ ...a, svg: pic(p, a.kind, a.name), tip: t(lang, `tip_who_${a.kind}`, a.name), isOut: isOut(a.name, a.kind), byName: authorsOut.has(a.name) }))
  // Who goes, as one control: presets leave whole kinds out (new bots too), people go by name.
  // Its label says the whole state, so it never disagrees with the authors under it.
  const present = (kind: string) => authors.some(a => a.kind === kind)
  const preset = PRESETS.find(p => sameSet(p.kinds, kindsOut(authorsOut)))
  const presets = PRESETS.filter(p => p.when.every(present)).map(p => ({ id: p.id, kinds: [...p.kinds], label: t(lang, `set_${p.id}`), isOn: p === preset }))
  const namesOut = authors.filter(a => a.byName && !authorsOut.has(`kind:${a.kind}`)).map(a => a.name)
  const inAuthors = authors.filter(a => !a.isOut)
  const whoText =
    !namesOut.length && preset
      ? t(lang, `who_${preset.id}`)
      : inAuthors.length === 1 && authors.length > 1
        ? t(lang, 'who_only', inAuthors[0]!.name)
        : preset && namesOut.length <= 3
          ? `${t(lang, `who_${preset.id}`)} · ${namesOut.length === 1 ? t(lang, 'who_out', namesOut[0]) : t(lang, 'who_n_out', namesOut.length)}`
          : t(lang, 'who_some', inAuthors.length, authors.length)
  const who = { label: t(lang, 'who', whoText), presets }

  // Lines under their repo, whose heading box says how many go (all, some, none: "5 of 7") and
  // takes every line that can be picked in one tap, drafts and validated ones too, or leaves them
  // all out once all go. A running line and an author left out are not picked from here.
  const groups = names.map(repo => {
    const lines = rows.filter(x => x.repo === repo)
    const free = lines.filter(x => x.canToggle)
    const isAll = free.length > 0 && free.every(x => x.isIn)
    const picked = lines.filter(x => x.isIn).length
    return {
      repo,
      name: short(repo),
      rows: lines,
      keys: free.map(x => x.key),
      reasonKeys: free.filter(x => x.hasReason).map(x => x.key),
      isAll,
      mark: isAll ? ('on' as const) : picked ? ('mixed' as const) : ('off' as const),
      count: t(lang, 'in_of', picked, lines.length),
      merge: Boolean(cfgOf(repo)?.merge),
      publish: Boolean(cfgOf(repo)?.publish),
      toPublish: lines.filter(x => x.report).map(x => x.url),
      prompt: cfgOf(repo)?.prompt ?? '',
      // what its lines going to validation are, and how its verdicts stand
      go: lines.filter(x => x.isIn).map(x => x.url),
      issues: lines.filter(x => x.vstate === 'issues').length,
      failed: lines.filter(x => x.vstate === 'failed').length,
    }
  })

  const toGo = rows.filter(x => x.isIn)
  const goingRepos = [...new Set(toGo.map(x => x.repo))]
  const free = rows.filter(x => x.canToggle)
  // my PRs a fixing agent does not hold yet: the pick and Fix count the same lines
  const reworkRows = free.filter(x => x.isRework && !fixingSet.has(x.url) && !byHand.has(x.key))
  // Automatic mode in one line: off, or when the next round looks and what the last one did.
  const vs = o.verdicts
  const every = vs?.autoEvery ?? 30
  const last = vs?.lastAuto
  const lastWhat = !last
    ? ''
    : !last.count
      ? t(lang, 'auto_nothing')
      : run && Math.abs(Date.parse(run.at ?? '') - Date.parse(last.at)) < 6e4
        ? run.label
        : t(lang, 'auto_sent', last.count)
  const next = run?.isRunning
    ? t(lang, 'auto_after_run')
    : ((at: number) => (at > now ? t(lang, 'auto_next', hhmm(at)) : t(lang, 'auto_next_check')))(
        last ? Date.parse(last.at) + every * 6e4 : Date.parse(okAt ?? '') + o.minutes * 6e4,
      )
  const auto = {
    mode: vs?.auto ?? 'off',
    every,
    line: !vs || vs.auto === 'off' ? t(lang, 'auto_off') : [next, last ? t(lang, 'auto_last', hhmm(Date.parse(last.at)), lastWhat) : ''].filter(Boolean).join(' · '),
  }
  // the repos that approve and merge by themselves, named in the head
  const merging = groups.filter(g => g.merge).map(g => g.name)
  // Every PR with a verdict, as Reports lists it. A report on the person's own PR is read here and
  // never published: toPublish takes only a row's gated report.
  const reports = [...new Map(rows.map(x => [x.url, x])).values()].flatMap((x): ReportRow[] => {
    const v = o.verdicts?.prs?.[x.url]
    if (!v || x.vstate === 'none' || (!v.sha && x.vstate !== 'failed')) return []
    const posted = v.published?.state === 'posted'
    const failedPost = v.published?.state === 'failed'
    const state: ReportState =
      x.vstate === 'failed'
        ? 'failed'
        : x.vstate === 'run' || x.vstate === 'queued'
          ? 'validating'
          : x.vstate === 'stale'
            ? 'outdated'
            : x.isOwn
              ? 'own'
              : posted
                ? 'published'
                : failedPost && x.report
                  ? v.published?.unconfirmed
                    ? 'notConfirmed'
                    : 'notPublished'
                  : x.report
                    ? 'publish'
                    : v.partial
                      ? 'partly'
                      : 'quiet'
    return [
      {
        key: x.key,
        url: x.url,
        repo: x.repo,
        where: `${short(x.repo)} ${x.num}`,
        num: x.num,
        isOwn: x.isOwn,
        title: x.title,
        state,
        issues: v.issues ?? 0,
        attention: v.attention ?? 0,
        partial: Boolean(v.partial),
        text: v.report || v.finding || (state === 'failed' ? x.finding : ''),
        sha: (v.sha ?? '').slice(0, 7),
        why: state === 'failed' ? x.finding : (v.published?.why ?? ''),
        at: v.published?.at ?? v.at,
        canPublish: Boolean(x.report),
      },
    ]
  })

  return {
    ...head,
    state: 'ok' as const,
    summary: t(lang, 'in_to_validate', toGo.length, goingRepos.length),
    authors,
    who,
    rows,
    groups,
    // what waits on the person, oldest first: their PRs with something asked, PRs waiting on their review
    needs: [...new Map((r.pending ?? []).map(p => [p.url, p])).values()]
      .sort((a, b) => Date.parse(a.since ?? a.createdAt) - Date.parse(b.since ?? b.createdAt))
      .map(p => ({
        key: keyOf(p),
        url: p.url,
        title: p.title,
        line: [`${short(p.repo)} #${p.number}`, ...p.signals.map(code => label(lang, code)), ageOf(now - Date.parse(p.since ?? p.createdAt))].join(' · '),
      })),
    // the dashboard's cards: every PR with nothing pending, ready to validate in one tap, and how
    // many verdicts found problems
    // (never one the person left to humans)
    clean: toGo.filter(x => !x.hasReason).map(x => x.url),
    issues: rows.filter(x => x.vstate === 'issues').length,
    // the reviews ready to go on GitHub, each with the text that would go
    toPublish: [...new Map(rows.filter(x => x.report).map(x => [x.url, { key: x.key, url: x.url, repo: x.repo, title: x.title, where: `${short(x.repo)} ${x.num}`, report: x.report }])).values()],
    reports,
    // my PRs with something asked of me, for Fix (Argos turns the review into changes in the chat)
    rework: reworkRows.map(x => x.url),
    run: showRun ? run : null,
    auto,
    mergeLine: merging.length ? t(lang, 'mg_line', merging.join(', ')) : '',
    // all of it in one repo of several says which ("Validate 4 · billing"), so a tap on Only
    // never sends more than the person meant; nothing picked reads "Validate", disabled
    validate: {
      label: !toGo.length
        ? t(lang, 'in_validate')
        : names.length > 1 && goingRepos.length === 1
          ? `${t(lang, 'in_validate_n', toGo.length)} · ${short(goingRepos[0]!)}`
          : t(lang, 'in_validate_n', toGo.length),
      urls: toGo.map(x => x.url),
      count: toGo.length,
    },
  }
}
export type ViewModel = ReturnType<typeof toViewModel>
