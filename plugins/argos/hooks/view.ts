// Round → ViewModel for the pane. The pane exists to take PR review off the person's back: every
// open PR across the connected repos is one line, and all of them go to validation unless the
// person leaves some out (an author, or one PR) or the PR is not ready for it. Nothing reorders
// when something is left out: it dims in place. No mod runtime, so Node can import this file.
import { t } from '../scripts/i18n.mjs'
import type { Item, Round, Verdict, Verdicts } from '../types'
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

// A PR's verdict from the last validation: none, running, failed (it could not be validated, or
// it ran past RUN_LIMIT with no word), old (new commits since), blockers found, partly read (never
// a pass), or passed. Attention counts risks that do not block.
export const RUN_LIMIT = 30 * 6e4
export type VerdictState = 'none' | 'run' | 'failed' | 'stale' | 'pass' | 'issues' | 'partial'
export function verdictOf(p: Item, v?: Verdict, now?: number): { state: VerdictState; issues: number; attention: number; finding: string } {
  const attention = v?.attention ?? 0
  if (!v) return { state: 'none', issues: 0, attention: 0, finding: '' }
  if (v.state === 'running' && now && now - Date.parse(v.at) > RUN_LIMIT) return { state: 'failed', issues: 0, attention: 0, finding: 'timed out' }
  if (v.state === 'running') return { state: 'run', issues: 0, attention: 0, finding: '' }
  if (v.state === 'failed') return { state: 'failed', issues: 0, attention: 0, finding: v.reason || 'failed' }
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
  if (v.state === 'run') return { k: 'sig', svg: STARS.run, w: 16, text: '◌', tip: t(lang, 'tip_v_run') }
  if (v.state === 'failed') return { k: 'sig', svg: STARS.stale, w: 16, count: '✕', color: C.error, text: '☆✕', tip: t(lang, 'tip_v_failed', v.finding) }
  if (v.state === 'stale') return { k: 'sig', svg: STARS.stale, w: 16, text: '☆', tip: t(lang, 'tip_v_stale') }
  return { k: 'sig', svg: STARS.none, w: 16, text: '✧', tip: t(lang, 'tip_v_none') }
}

// The last run, from verdicts.json's batch: how far it got, what failed (and why) to retry, and
// what auto-merge did. A line counts as validated once it has any verdict, failed once it failed
// or ran past RUN_LIMIT. Null before the first run.
export function runOf(vs: Verdicts | null | undefined, now: number, lang: string, items: Item[] = []) {
  const urls = vs?.batch?.urls ?? []
  if (!urls.length) return null
  const title = (url: string) => items.find(p => p.url === url)?.title ?? url.replace(/^https:\/\/github\.com\//, '')
  const states = urls.map(url => ({ url, v: verdictOf({ sha: undefined } as Item, vs!.prs[url], now), merge: vs!.prs[url]?.merge }))
  const running = states.filter(s => s.v.state === 'run').length
  const failed = states.filter(s => s.v.state === 'failed').map(s => ({ url: s.url, title: title(s.url), why: s.v.finding }))
  const validated = urls.length - running - failed.length
  const merged = states.filter(s => s.merge?.state === 'merged').length
  const approved = states.filter(s => s.merge?.state === 'approved').length
  const parts = [
    running ? t(lang, 'in_validating', validated + failed.length, urls.length) : t(lang, 'run_validated', validated),
    failed.length ? t(lang, 'run_failed', failed.length) : '',
    merged ? t(lang, 'run_merged', merged) : '',
    approved ? t(lang, 'run_approved', approved) : '',
  ]
  return { isRunning: running > 0, at: vs!.batch.at, label: parts.filter(Boolean).join(' · '), failed, retry: failed.map(f => f.url) }
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

  const rows = all.map(p => {
    const key = keyOf(p)
    const v = verdictOf(p, o.verdicts?.prs?.[p.url], now)
    const auto = outOf(p, v)
    const merged = o.verdicts?.prs?.[p.url]?.merge
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
      mergeNote: merged ? t(lang, `mg_${merged.state}`, merged.why) : '',
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
  const rework = free.filter(x => x.isRework).map(x => x.key)
  const picks = [pick('clean', free.filter(x => !x.hasReason).map(x => x.key)), ...(rework.length ? [pick('rework', rework)] : [])]
  // The last run: "Validating 3 of 10 · 1 failed" while any of it runs, then what it came to
  // ("9 validated · 1 failed · 2 merged"), with the failed ones ready to go again.
  const run = runOf(o.verdicts, now, lang, all)

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
    run,
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
