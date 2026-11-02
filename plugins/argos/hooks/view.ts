// Round → ViewModel for the pane. The pane exists to take PR review off the person's back: every
// open PR across the connected repos is one line, and all of them go to validation unless the
// person leaves some out (an author, or one PR) or the PR is not ready for it. Nothing reorders
// when something is left out: it dims in place. No mod runtime, so Node can import this file.
import { t } from '../scripts/i18n.mjs'
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
export type VerdictState = 'none' | 'queued' | 'run' | 'failed' | 'stale' | 'pass' | 'issues' | 'partial'
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
  if (v.state === 'issues') return { k: 'sig', svg: STARS.done, w: 16, count: `${v.issues}${more}`, color: C.warning, text: `✦${v.issues}${more}`, tip: t(lang, 'tip_v_issues', v.issues, v.attention) }
  if (v.state === 'partial') return { k: 'sig', svg: STARS.stale, w: 16, count: '½', color: C.subtle, text: '☆½', tip: t(lang, 'tip_v_partial', v.attention) }
  if (v.state === 'run' || v.state === 'queued') return { k: 'sig', svg: STARS.run, w: 16, text: '◌', tip: t(lang, 'tip_v_run') }
  if (v.state === 'failed') return { k: 'sig', svg: STARS.stale, w: 16, count: '✕', color: C.error, text: '☆✕', tip: t(lang, 'tip_v_failed', v.finding) }
  if (v.state === 'stale') return { k: 'sig', svg: STARS.stale, w: 16, text: '☆', tip: t(lang, 'tip_v_stale') }
  return { k: 'sig', svg: STARS.none, w: 16, text: '✧', tip: t(lang, 'tip_v_none') }
}

// The last run, from verdicts.json's batch: how far it got (a PR counts as started once its agent
// reached it), what failed (and why) to retry, and what auto-merge did; `doneAt` is when its last
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
    retry: states.filter(s => s.v.state === 'failed').map(s => s.url),
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
// limit: minutes a PR may stay "validating"; repos: auto-merge and skills per repo (repos.json)
type Opts = { now: number; lang: string; minutes: number; running: boolean; ui?: Partial<Ui>; verdicts?: Verdicts | null; ignored?: string[]; limit?: number; repos?: RepoCfg[]; fixing?: string[] }
// 14:30, the person's own clock: times instead of "in 12 min", so nothing on screen ticks
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
  const names = [...new Set(all.map(p => p.repo))]
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
  const showRun = Boolean(run && (run.isRunning || run.doneAt > Date.parse(okAt ?? '')))
  const inRun = new Set(showRun ? run!.urls : [])
  // the person's PRs a fixing agent holds right now
  const fixingSet = new Set(o.fixing ?? [])
  const cfgOf = (repo: string) => (o.repos ?? []).find(c => c.repo.toLowerCase() === repo.toLowerCase())
  // how a line in the run ended, in words, with the tone of its colour
  const statusOf = (p: Item, v: ReturnType<typeof verdictOf>): { text: string; tone: Tone } | null => {
    if (fixingSet.has(p.url)) return { text: t(lang, 'st_fixing'), tone: 'subtle' }
    if (!inRun.has(p.url)) return null
    const raw = o.verdicts!.prs[p.url]!
    if (v.state === 'queued') return { text: t(lang, 'st_queued'), tone: 'subtle' }
    if (v.state === 'run') return { text: t(lang, 'st_validating', Math.max(1, Math.floor((now - Date.parse(raw.at)) / 6e4))), tone: 'subtle' }
    if (v.state === 'failed') return { text: t(lang, 'st_failed', v.finding), tone: 'error' }
    if (raw.merge) return { text: t(lang, `st_${raw.merge.state}`, raw.merge.why), tone: raw.merge.state === 'skipped' ? 'warning' : 'success' }
    // commits landed after the verdict: it no longer speaks for the head
    if (v.state === 'stale') return cfgOf(p.repo)?.merge ? { text: t(lang, 'st_skipped', t(lang, 'mg_new')), tone: 'warning' } : { text: t(lang, 'st_stale'), tone: 'subtle' }
    // a repo with auto-merge says why a verdict that did not pass was not merged
    if (cfgOf(p.repo)?.merge && (v.state !== 'pass' || v.attention))
      return { text: t(lang, 'st_skipped', v.issues ? t(lang, 'mg_blockers', v.issues) : v.attention ? t(lang, 'mg_attention', v.attention) : t(lang, 'mg_partial')), tone: 'warning' }
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
      isIn: leftBy === null,
      // why the pane left a line out, said at its end; the person's own choices need no word
      why: leftBy === null || leftBy === 'hand' || leftBy === 'author' ? '' : t(lang, `why_${leftBy}`),
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

  // What the pane left out by itself, in one line.
  const autoOut = (['changes', 'draft', 'done'] as const)
    .map(why => [why, rows.filter(x => x.isAuto && x.why === t(lang, `why_${why}`)).length] as const)
    .filter(([, n]) => n > 0)
    .map(([why, n]) => t(lang, `out_${why}`, n))
    .join(' · ')

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
      skills: cfgOf(repo)?.skills ?? [],
    }
  })

  const toGo = rows.filter(x => x.isIn)
  const goingRepos = [...new Set(toGo.map(x => x.repo))]
  // Clear leaves every line out; once nothing is left, Restore goes back to the pane's own pick.
  const clear = toGo.length
    ? { label: t(lang, 'in_clear'), keys: toGo.map(x => x.key) }
    : ui.out.length || ui.back.length
      ? { label: t(lang, 'in_restore'), keys: null }
      : null
  // Quick picks, one tap each, the selection becoming exactly that set: every PR with nothing
  // pending (no change asked, no comment open, not a draft, not validated since its last commit),
  // or my PRs with something asked of me, to validate again once reworked. ✓ marks the one in use.
  const free = rows.filter(x => x.canToggle)
  const going = new Set(toGo.map(x => x.key))
  const pick = (id: string, keys: string[]) => {
    const isOn = keys.length > 0 && keys.length === going.size && keys.every(k => going.has(k))
    return { id, keys, label: `${t(lang, `pick_${id}`)} ${keys.length}${isOn ? ' ✓' : ''}` }
  }
  // my PRs a fixing agent does not hold yet: the pick and Fix count the same lines
  const reworkRows = free.filter(x => x.isRework && !fixingSet.has(x.url))
  const rework = reworkRows.map(x => x.key)
  const picks = [pick('clean', free.filter(x => !x.hasReason).map(x => x.key)), ...(rework.length ? [pick('rework', rework)] : [])]
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
  const next = run?.isRunning ? t(lang, 'auto_after_run') : t(lang, 'auto_next', hhmm(last ? Date.parse(last.at) + every * 6e4 : Date.parse(okAt ?? '') + o.minutes * 6e4))
  const auto = {
    mode: vs?.auto ?? 'off',
    every,
    line: !vs || vs.auto === 'off' ? t(lang, 'auto_off') : [next, last ? t(lang, 'auto_last', hhmm(Date.parse(last.at)), lastWhat) : ''].filter(Boolean).join(' · '),
  }
  // the repos that approve and merge by themselves, named in the head
  const merging = groups.filter(g => g.merge).map(g => g.name)

  return {
    ...head,
    state: 'ok' as const,
    summary: t(lang, 'in_to_validate', toGo.length, goingRepos.length),
    autoLine: autoOut ? t(lang, 'in_auto_out', autoOut) : '',
    authors,
    who,
    rows,
    groups,
    clear,
    picks,
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
