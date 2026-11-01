// Round → ViewModel: every word and number the pane shows comes from here,
// so the counts and the prompt sent to the AI always agree. No mod runtime, so Node can
// import this file.
import { t } from '../scripts/i18n.mjs'
import type { Item, Round, Verdict, Verdicts } from '../types'
import { C, I, NEUTRAL, PICKED, STARS, bars, byPriority, fit, pill, sig, tint, type Tag, type Tone } from './look'

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

// A PR's verdict from the last validation: none, running, old (new commits since), blockers
// found, partly read (never a pass), or passed. Attention counts risks that do not block, so a
// pass with them never looks clean.
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
// The verdict as the first tag: the star and ✓, the issue count, … or "old".
export function verdictTag(v: ReturnType<typeof verdictOf>, lang: string): Tag {
  const purple = { color: C.merged }
  const more = v.attention ? `+${v.attention}` : ''
  if (v.state === 'pass') return { k: 'sig', svg: STARS.done, w: 16, count: `✓${more}`, ...purple, text: `✦✓${more}`, tip: t(lang, 'tip_v_pass', v.attention) }
  if (v.state === 'issues') return { k: 'sig', svg: STARS.done, w: 16, count: `${v.issues}${more}`, ...purple, text: `✦${v.issues}${more}`, tip: t(lang, 'tip_v_issues', v.issues, v.attention) }
  if (v.state === 'partial') return { k: 'sig', svg: STARS.stale, w: 16, count: t(lang, 'vd_partial'), color: C.subtle, text: `☆${t(lang, 'vd_partial')}`, tip: t(lang, 'tip_v_partial', v.attention) }
  if (v.state === 'run') return { k: 'sig', svg: STARS.run, w: 16, count: '…', color: C.subtle, text: '◌…', tip: t(lang, 'tip_v_run') }
  if (v.state === 'stale') return { k: 'sig', svg: STARS.stale, w: 16, count: t(lang, 'vd_old'), color: C.subtle, text: `☆${t(lang, 'vd_old')}`, tip: t(lang, 'tip_v_stale') }
  return { k: 'sig', svg: STARS.none, w: 16, text: '✧', tip: t(lang, 'tip_v_none') }
}

// The one action a PR offers, highest rank first: blockers before feedback (CI reruns after a
// rebase, so the conflict comes before CI), then my review, a reviewer, merging, drafts,
// nudges; a teammate's PR nobody asked me about is read, not acted on.
// A verdict adds three: Fix issues on mine after CI, Draft review on another's before my review,
// Revalidate on an old verdict before the quiet actions.
export function action(p: Item, lang: string, v = verdictOf(p)): { label: string; prompt: string } {
  const go = (k: string, ...args: unknown[]) => ({ label: t(lang, `x_${k}`), prompt: t(lang, `p_${k}`, p.url, ...args) })
  const threads = Number(p.signals.find(s => base(s) === 'threads')?.split(':')[1] ?? 0)
  if (p.kind !== 'mine') {
    if (v.state === 'issues') return go('draft', v.issues)
    if (p.kind === 'review') return has(p, 'changed') ? go('rereview') : go('review', (p.author || '?').replace(/\[bot\]$/, ''))
    return v.state === 'stale' ? go('revalidate') : go('summary')
  }
  if (p.isDraft) return go('finish')
  if (has(p, 'conflict')) return go('conflict')
  if (has(p, 'ci_failed')) return go('ci')
  if (v.state === 'issues') return go('fix')
  if (has(p, 'changes_requested')) return go('changes')
  if (has(p, 'threads', 'unanswered', 'new_reviews')) return go('threads', threads)
  if (v.state === 'stale') return go('revalidate')
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
export function tags(p: Item, lang: string, w = 300): Tag[] {
  const tip = (k: string, ...a: unknown[]) => t(lang, `tip_${k}`, ...a)
  const out: Tag[] = []
  for (const s of p.signals) {
    const [k, n] = s.split(':')
    if (k === 'conflict') out.push(sig(I.conflict, '◆', tip('conflict')))
    if (k === 'ci_failed') out.push(sig(I.ciFail, '✕', tip('ci_fail')))
    if (k === 'changes_requested') out.push(sig(I.changes, '±', tip('changes')))
    if (k === 'threads') out.push(sig(I.threads, `¶${n}`, tip('threads', Number(n)), Number(n), C.warning))
    if ((k === 'unanswered' || k === 'new_reviews') && !has(p, 'threads')) out.push(sig(I.threads, '¶', tip('threads', 0), Number(n) || undefined, C.warning))
    if (k === 'no_owner') out.push(sig(I.noOwner, '?', tip('no_owner')))
  }
  if (p.kind === 'review') out.unshift(has(p, 'changed') ? sig(I.eye(C.subtle), '◎', tip('rereview')) : sig(I.eye(C.suggestion), '◉', tip('review')))
  if (has(p, 'ready')) out.unshift(...(p.ci === 'pass' ? [sig(I.ciPass, '✓', tip('ci_pass'))] : []), sig(I.approved, '✓', tip('approved')))
  if (p.kind === 'mine' && !p.isDraft && p.ci === 'pending') out.push(sig(I.ciPending, '◌', tip('ci_pending')))
  if (p.isAI) out.push({ k: 'ai', svg: I.ai, w: 16, text: '¤', tip: tip('ai') })
  for (const l of [...(p.labels ?? [])].sort(byPriority)) out.push({ k: 'label', ...pill(l.name, l.color), text: `(${l.name})`, tip: tip('label', l.name) })
  if (p.size !== undefined) out.push({ k: 'size', svg: I.size(bars(p.size)), w: 16, text: '▂▄▆█'.slice(0, bars(p.size)), tip: tip('size', ['S', 'M', 'L', 'XL'][bars(p.size) - 1], p.size) })
  return fit(out, w, n => tip('more', n))
}

// The row's state glyph: the PR icon in the winning colour, dashed for a draft; its tip says
// what the colour means.
const glyph = (p: Item) => (p.isDraft ? I.draft : I.pr(C[tone(p) ?? 'subtle']))
const glyphTip = (p: Item, lang: string) => t(lang, `tip_g_${p.isDraft ? 'draft' : p.kind === 'other' ? 'team' : (tone(p) ?? 'waiting')}`)

export function reason(error: string, lang: string) {
  if (/gh auth|not logged/i.test(error)) return t(lang, 'err_gh_auth')
  if (/timed out|ETIMEDOUT|timeoutMs/i.test(error)) return t(lang, 'err_timeout')
  return t(lang, 'err_generic')
}

// The pane's own state: the PRs picked for the AI (repo#number), the folded section opened,
// and the repo the list is narrowed to ('' = all).
// view: '' the inbox of what needs me, 'team' the team's PRs grouped by verdict; more: the
// verdict groups shown in full; act: the batch action picked in the team view.
// folds: a repo the person opened or folded by hand in the By repo view, with the PRs that needed
// them then; a new one that needs them reopens a folded repo.
export type Fold = { open: boolean; needs: string[] }
export type Ui = { selected: string[]; open: string; filter: string; view: string; more: string[]; act: string; folds: Record<string, Fold> }
export const UI: Ui = { selected: [], open: '', filter: '', view: '', more: [], act: '', folds: {} }

// The team view: the team's PRs by verdict, a few rows each until "Show N more".
export const GROUPS = ['issues', 'partial', 'run', 'none', 'stale', 'pass'] as const
const SHOWN: Record<(typeof GROUPS)[number], number> = { issues: 3, partial: 2, run: 3, none: 4, stale: 2, pass: 99 }
// The batch actions, offered only when valid for every pick.
export const BATCH_ACTS = ['validate', 'revalidate', 'fix', 'draft'] as const

// prompt: what the prompt holds now, so a request already there is never added twice.
type Opts = { now: number; lang: string; minutes: number; running: boolean; ui?: Partial<Ui>; prompt?: string; verdicts?: Verdicts | null }

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

  const vOf = (p: Item) => verdictOf(p, o.verdicts?.prs?.[p.url])
  // bare: under a repo's own header, the ref drops the repo it would repeat
  const row = (p: Item, section: Section, bare = false) => {
    const v = vOf(p)
    const a = action(p, lang, v)
    const isPicked = picks.has(keyOf(p))
    // tint only where I act; a pick overrides it, the glyph keeps the signal colour
    const tn = section === 'move' || section === 'ready' ? tone(p) : null
    return {
      key: keyOf(p),
      url: p.url,
      number: p.number,
      glyph: glyph(p),
      glyphTip: glyphTip(p, lang),
      ref: showRepo && !bare ? `${short(p.repo)}#${p.number}` : `#${p.number}`,
      title: p.title,
      wait: ageShort(since(p), now, lang),
      // two days and more: white and bold; age is weight, so colours stay free
      isOld: now - Date.parse(since(p)) >= 2 * 864e5,
      // a verdict leads the tags and takes a narrower fit; its top finding gets a line of its own
      tags: v.state === 'none' ? tags(p, lang) : [verdictTag(v, lang), ...tags(p, lang, 260)],
      // the top finding: a blocker, or what a pass or a partial read must not hide
      finding: v.finding && ['issues', 'pass', 'partial'].includes(v.state) ? `${v.finding}${v.issues > 1 ? ` · +${v.issues - 1}` : ''}` : '',
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
    return { id: id as string, title: t(lang, `s_${id}`), note: '', count: prs.length, isFolded, canFold: FOLDED.includes(id) && picked === 0, prs: prs.map(p => row(p, id)) }
  })
  const n = (id: Section) => sections.find(s => s.id === id)!.count
  const need = n('move') ? t(lang, 'in_need', n('move')) : ''
  const team = inScope.filter(p => p.kind === 'other')
  // Nothing needs me: a green banner takes Your move's place and says what else there is.
  const clear = n('move')
    ? null
    : [
        ...(n('ready') ? [t(lang, 'in_clear_ready', n('ready'))] : []),
        ...(n('waiting') ? [t(lang, 'in_clear_waiting', n('waiting'))] : []),
        ...(n('drafts') ? [t(lang, 'in_clear_drafts', n('drafts'))] : []),
      ].join(' · ')

  // One Select narrows the list to a repo, when there is more than one; each says how many
  // open PRs it holds.
  // the count follows the view: the rows that view shows for the repo
  const viewed = ui.view === 'team' ? all.filter(p => p.kind === 'other') : all
  const countIn = (repo: string) => viewed.filter(p => p.repo === repo).length
  const repos =
    names.length > 1
      ? [{ id: '', name: `${t(lang, 'in_all_repos')} · ${viewed.length}` }, ...names.map(repo => ({ id: repo, name: `${short(repo)} · ${countIn(repo)}` }))]
      : []
  // By repo: one section per repo with open PRs. Its header is enough to decide whether to open
  // it: the worst signal's glyph (blocked › feedback › asked of me › validator issues › ready ›
  // waiting), the name, the count, how many need me and how many are picked. A repo opens only
  // when something in it needs me; a fold by hand sticks until a new PR needs me there. Inside,
  // what needs me first, four rows, then "Show N more"; refs drop the repo the header names.
  const worst = (p: Item) => {
    const tn = sectionOf(p) === 'team' ? null : tone(p)
    if (tn === 'error') return 0
    if (tn === 'warning') return 1
    if (tn === 'suggestion') return 2
    if (vOf(p).state === 'issues') return 3
    if (tn === 'success') return 4
    return 5
  }
  const WORST = [
    { svg: I.pr(C.error), tip: 'tip_g_error' },
    { svg: I.pr(C.warning), tip: 'tip_g_warning' },
    { svg: I.pr(C.suggestion), tip: 'tip_g_suggestion' },
    { svg: STARS.done, tip: 'tip_g_issues' },
    { svg: I.pr(C.success), tip: 'tip_g_success' },
    { svg: I.pr(C.subtle), tip: 'tip_g_waiting' },
  ]
  const needsMe = (p: Item) => sectionOf(p) === 'move'
  const repoSections = (ui.view === 'repos' ? names : [])
    .map(repo => {
      const prs = all.filter(p => p.repo === repo).sort((a, b) => Number(needsMe(b)) - Number(needsMe(a)) || byRank(a, b))
      const needKeys = prs.filter(needsMe).map(keyOf)
      const rank = Math.min(5, ...prs.map(worst))
      const fold = ui.folds[repo]
      // a hand fold stands until a PR that was not there then needs me
      const isOpen = fold && !(fold.open === false && needKeys.some(k => !fold.needs.includes(k))) ? fold.open : needKeys.length > 0
      const keys = prs.map(keyOf)
      const picked = keys.filter(k => picks.has(k)).length
      const shownAll = ui.more.includes(`repo:${repo}`)
      const shown = isOpen ? (shownAll ? prs : prs.slice(0, 4)) : []
      return {
        repo,
        name: short(repo),
        glyph: WORST[rank]!.svg,
        glyphTip: t(lang, WORST[rank]!.tip),
        count: prs.length,
        needs: needKeys.length,
        need: needKeys.length ? `· ${t(lang, 'in_need', needKeys.length)}` : '',
        needKeys,
        rank,
        picked: picked ? `· ${t(lang, 'in_picked', picked)}` : '',
        allPicked: keys.length > 0 && picked === keys.length,
        keys,
        isOpen,
        prs: shown.map(p => row(p, sectionOf(p), true)),
        more: isOpen && prs.length > shown.length ? t(lang, 'in_more', prs.length - shown.length) : '',
      }
    })
    .filter(s => s.count > 0)
    .sort((a, b) => b.needs - a.needs || a.rank - b.rank || b.count - a.count || a.name.localeCompare(b.name))

  // The batch: every pick, each row's winning action as one line of the prompt; a pick that
  // left the list (merged, closed) is dropped by the next press.
  const items = all.filter(p => picks.has(keyOf(p)))
  const lines = items.map(p => ({ p, a: action(p, lang, vOf(p)) }))
  const fresh = lines.filter(({ p }) => !asked(p.url))
  const isTeam = ui.view === 'team' && team.length > 0
  const valid = {
    validate: true,
    revalidate: items.every(p => ['stale', 'pass', 'issues'].includes(vOf(p).state)),
    fix: items.every(p => p.kind === 'mine' && vOf(p).state === 'issues'),
    draft: items.every(p => p.kind !== 'mine' && vOf(p).state === 'issues'),
  }
  const acts = BATCH_ACTS.filter(k => valid[k])
  const chosen = acts.find(k => k === ui.act) ?? acts[0]!
  const refOf = (p: Item) => `${short(p.repo)}#${p.number}`
  const teamBatch = {
    detail: `${t(lang, `bo_${chosen}`)} ${items.slice(0, 4).map(refOf).join(', ')}${items.length > 4 ? ` +${items.length - 4}` : ''}`,
    prompt: [t(lang, `b_${chosen}`), ...items.map(p => `- ${p.url}`)].join('\n'),
    acts: acts.map(k => ({ id: k, name: t(lang, `bo_${k}`) })),
    act: chosen,
  }

  // The team view: verdict groups, the running one first after issues; Passed is folded.
  const groups = GROUPS.map(id => {
    const prs = team.filter(p => vOf(p).state === id).sort(byRank)
    const isOpen = ui.more.includes(id)
    const isFolded = id === 'pass' && !isOpen
    const shown = isFolded ? [] : isOpen ? prs : prs.slice(0, SHOWN[id])
    const hidden = prs.slice(shown.length)
    const allPicked = prs.length > 0 && prs.every(p => picks.has(keyOf(p)))
    return {
      id,
      title: t(lang, `g_${id}`),
      count: prs.length,
      keys: prs.map(keyOf),
      // picking a whole group is the point of the view; a running one is busy, a passed one done
      pickAll: id === 'run' || id === 'pass' ? null : t(lang, allPicked ? 'in_unpick_all' : 'in_pick_all'),
      allPicked,
      isFolded,
      more: !isFolded && hidden.length ? t(lang, hidden.every(p => picks.has(keyOf(p))) ? 'in_more_picked' : 'in_more', hidden.length) : '',
      rows: shown.map(p => {
        const isPicked = picks.has(keyOf(p))
        return { key: keyOf(p), url: p.url, glyph: I.pr(C.subtle), glyphTip: t(lang, 'tip_g_team'), ref: showRepo ? refOf(p) : `#${p.number}`, title: p.title, verdict: verdictTag(vOf(p), lang), isPicked, box: isPicked ? PICKED : { bg: undefined, border: undefined } }
      }),
    }
  })

  // Auto-validate and the batch in flight: "Validating 9 of 22" while any of it runs.
  const vb = o.verdicts?.batch?.urls ?? []
  const vrun = vb.filter(u => o.verdicts?.prs?.[u]?.state === 'running').length
  const progress = vrun ? { done: vb.length - vrun, total: vb.length, label: t(lang, 'in_validating', vb.length - vrun, vb.length), pct: `${Math.round(((vb.length - vrun) / vb.length) * 100)}%` } : null

  return {
    ...head,
    state: 'ok' as const,
    need,
    teamCount: team.length,
    clear,
    // the views: what needs me, by repo when there is more than one, the team when it has PRs
    views:
      team.length || names.length > 1
        ? [
            { id: '', name: t(lang, 'in_view_needs', n('move')) },
            ...(names.length > 1 ? [{ id: 'repos', name: t(lang, 'in_view_repos', names.filter(r => all.some(p => p.repo === r)).length) }] : []),
            ...(team.length ? [{ id: 'team', name: t(lang, 'in_view_team', team.length) }] : []),
          ]
        : [],
    view: isTeam ? 'team' : ui.view === 'repos' && names.length > 1 ? 'repos' : '',
    repoSections,
    groups,
    auto: { tip: t(lang, 'tip_auto'), value: o.verdicts?.auto ?? 'off', options: ['off', 'mine', 'all'].map(id => ({ id, name: t(lang, `au_${id}`) })) },
    progress,
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
          // the team view sends one action for every pick, chosen from those valid for all
          ...(isTeam ? teamBatch : { acts: [], act: '' }),
        }
      : null,
    keep: ui.selected.filter(k => all.some(p => keyOf(p) === k)),
  }
}
export type ViewModel = ReturnType<typeof toViewModel>
