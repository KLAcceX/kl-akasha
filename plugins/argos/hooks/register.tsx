// Argos mod: the peacock's eyes inside Claude. A timer runs one Argos round over the connected
// repos, and /argos opens the pane, built to take PR review off the person's back: every open PR
// is one line, all of them go to validation unless the person leaves some out (an author with one
// tap, a repo or a line), and one button validates the rest in the background, the verdicts filling in
// on the lines. Words and numbers come from toViewModel (view.ts); colours and icons from look.ts.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../scripts/i18n.mjs'
import { DEMO_ROUND, DEMO_VERDICTS } from './demo-round'
import { C, EDGE, HEX, I, LOGO, PANEL, SKELETON, SPACE, TINT, rgba, titled } from './look'
import { UI, authorOf, hhmm, kindOf, outOf, runOf, toViewModel, verdictOf } from './view'
import type { RepoCfg, Round, SetupInfo, Verdicts } from '../types'

export { outOf, reason, toViewModel, verdictOf, verdictTag } from './view'

const PANE = 'argos'
const ROUND = { plugin: 'argos', key: 'round' } as const
const RUNNING = { plugin: 'argos', key: 'isRunning' } as const
// /argos demo shows a sample round; rounds and loads wait until a plain /argos
const DEMO = { plugin: 'argos', key: 'isDemo' } as const
const VERDICTS = { plugin: 'argos', key: 'verdicts' } as const
const IGNORED = { plugin: 'argos', key: 'ignored' } as const
const ANNOUNCED = { plugin: 'argos', key: 'announced' } as const
const REPOS = { plugin: 'argos', key: 'repos' } as const
// the validating agents this mod started, each with its PRs; and the ones the person stopped
const AGENT_RUNS = { plugin: 'argos', key: 'agentRuns' } as const
const STOPPED = { plugin: 'argos', key: 'stopped' } as const
// the fixing agents this mod started, each with the person's PRs it fixes
const FIX_RUNS = { plugin: 'argos', key: 'fixRuns' } as const
// how the last fixing agent ended, in its own last line
const FIX_RESULT = { plugin: 'argos', key: 'fixResult' } as const
const fixResult = atom(FIX_RESULT, null as string | null)
const round = atom(ROUND, null)
const isRunning = atom(RUNNING, false)
// PRs the person left out by hand, which stay with humans: no validation, no auto-merge, across
// sessions ($.store, and verdicts.json for merge.mjs). And PRs the pane left out that they brought back
const OUT = { plugin: 'argos', key: 'out' } as const
const out = atom(OUT, UI.out)
const back = atom({ plugin: 'argos', key: 'back' } as const, UI.back)
// authors left out everywhere, kept across sessions in $.store
// update bots stay out of validation until the person lets them in (Who, in Settings)
const NO_BOTS = ['kind:bot']
const ignored = atom(IGNORED, NO_BOTS)
// what verdicts.mjs last wrote: the AI's validations, read by the lines
const verdicts = atom(VERDICTS, null)
// the connected repos as repos.json keeps them (auto-merge, prompt), and which repo's Settings
// fold is open, or asking to confirm auto-merge
const repos = atom(REPOS, [] as RepoCfg[])
const PAGE = { plugin: 'argos', key: 'page' } as const
const page = atom(PAGE, 'home')
// the presses still at work (Turning on…, Saving…), so their buttons say so
const pending = atom({ plugin: 'argos', key: 'pending' } as const, [] as string[])
// what setup.mjs found: gh, its accounts, repos to suggest
const SETUP = { plugin: 'argos', key: 'setup' } as const
// whether the first setup was finished (kept in $.store, read into the pane when it opens)
const SETUP_DONE = { plugin: 'argos', key: 'setupDone' } as const
const setupDoneAtom = atom(SETUP_DONE, false)
const setupInfo = atom(SETUP, null as SetupInfo | null)
const confirmMerge = atom({ plugin: 'argos', key: 'confirmMerge' } as const, null as string | null)
const agentRuns = atom(AGENT_RUNS, {} as Record<string, string[]>)
const fixRuns = atom(FIX_RUNS, {} as Record<string, string[]>)
// what was typed in each repo's prompt field, by repo; outside the atoms so typing redraws nothing
const promptDrafts = new Map<string, string>()
// how each repo's last prompt save went (true saved, false failed), and why turning auto-merge on
// failed, by repo; shown until the next edit or try
const promptSaved = new Map<string, boolean>()
const mergeErrors = new Map<string, string>()
const promptErrors = new Map<string, string>()
// why connecting a repo failed, by the button that tried
const connectErrors = new Map<string, string>()
// setup: the login command was copied; what was typed as another repo; the accounts asked for
const copiedLogin = new Set<boolean>()
const otherDraft = new Map<string, string>()
const wantedAccount: string[] = []
// why changing the schedule failed; repos waiting for the second tap on Disconnect
const autoErrors = new Map<string, string>()
const confirmDisconnect = new Set<string>()
const humanErrors = new Map<string, string>()
// The PRs nothing automatic may touch, as merge.mjs reads them: left to humans by hand, or by an
// author left out in Who.
function humanUrls(r: Round | null, hand: string[], ignored: string[]) {
  const left = new Set(hand)
  const skip = new Set(ignored)
  const all = [...(r?.pending ?? []), ...(r?.mine ?? []), ...(r?.others ?? [])]
  return [...new Set(all.filter(p => left.has(`${p.repo}#${p.number}`) || skip.has(authorOf(p)) || skip.has(`kind:${kindOf(p)}`)).map(p => p.url))]
}
// Writes that list; says why when it could not.
async function writeHuman($: any, urls: string[]) {
  try {
    const r = await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'human', ...urls])
    return r.exitCode ? (r.stderr ?? '').trim() || 'verdicts.mjs failed' : ''
  } catch (err) {
    return String((err as Error)?.message ?? err).split('\n')[0] ?? ''
  }
}
// one box at a time: two ticks in a row must not overwrite each other
let outChain: Promise<unknown> = Promise.resolve()
// what is left to humans, as kept: another session may have changed it since this one loaded
async function freshOut($: any): Promise<string[]> {
  const kept = await $.store.get('out').catch(() => undefined)
  if (Array.isArray(kept)) return kept.filter((x): x is string => typeof x === 'string')
  return ((await $.state.get(OUT)).value as string[] | undefined) ?? []
}
// the sample round from /argos demo acts on nothing: no agent, no write, no token spent
async function demoBlocks($: any, lang: string) {
  if (!(await $.state.get(DEMO)).value) return false
  $.ui.toast(`Argos: ${t(lang, 'demo_blocked')}`)
  return true
}
// A press runs once: a second press while the first is still at work is dropped.
const inflight = new Set<string>()
const once = (key: string, fn: () => Promise<unknown>) => () => {
  if (inflight.has(key)) return
  inflight.add(key)
  void fn().finally(() => inflight.delete(key))
}
// A native button cannot cut its text: a long name is cut before it gets there.
const clip = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 15),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '')
    .split(/\s+/)
    .filter(Boolean),
  lang: String(options.language ?? 'en'),
  // minutes a PR may stay "validating" before it counts as failed
  limit: Math.max(2, Number(options.runLimitMinutes) || 10),
  // the prompts behind Validate and Fix: Argos's own, the person's, or both
  prompts: {
    validate: {
      mode: promptMode(options.validatePromptMode),
      text: String(options.validatePrompt ?? '').trim(),
    },
    fix: {
      mode: promptMode(options.fixPromptMode),
      text: String(options.fixPrompt ?? '').trim(),
    },
  },
})
type Prompt = { mode: 'argos+mine' | 'argos' | 'mine'; text: string }
function promptMode(x: unknown): Prompt['mode'] {
  return x === 'argos' || x === 'mine' ? x : 'argos+mine'
}
// Argos's prompt, the person's added to it, or theirs alone; theirs alone with none written falls
// back to Argos's, so a button never sends an empty ask.
export const compose = (p: Prompt, argos: string[], mine: (text: string) => string[]) =>
  p.mode === 'argos' || !p.text ? argos : p.mode === 'mine' ? mine(p.text) : [...argos, p.text]

async function stateDir($: any) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return `${home}/.claude/kl-akasha/argos`
}
const roundFile = async ($: any) => `${await stateDir($)}/last-round.json`

// The verdicts the AI wrote with verdicts.mjs; none yet is an empty file.
async function loadVerdicts($: any): Promise<Verdicts | null> {
  if ((await $.state.get(DEMO)).value) return (await $.state.get(VERDICTS)).value ?? null
  try {
    const v: Verdicts = JSON.parse(await $.fs.read(`${await stateDir($)}/verdicts.json`))
    if (!v?.prs) throw new Error('not a verdicts file')
    await $.state.set(VERDICTS, v)
    return v
  } catch {
    return (await $.state.get(VERDICTS)).value ?? null
  }
}

// The connected repos as repos.json keeps them, read into the pane's state.
async function loadRepos($: any): Promise<RepoCfg[]> {
  try {
    const list: RepoCfg[] = JSON.parse(await $.fs.read(`${await stateDir($)}/repos.json`))
    if (!Array.isArray(list)) throw new Error('not a repos file')
    await $.state.set(REPOS, list)
    return list
  } catch {
    return (await $.state.get(REPOS)).value ?? []
  }
}

// A PR's connected repo, as repos.json keeps it.
const repoOf = (list: RepoCfg[], url: string) => list.find(r => url.toLowerCase().includes(`github.com/${r.repo.toLowerCase()}/pull/`))
// A repo's own validation prompt, added to Argos's job for its PRs. An older repos.json kept a
// list of skills instead: it reads as a prompt to use them.
const promptOf = (r: RepoCfg | undefined) => r?.prompt ?? (r?.skills?.length ? `Read the skills ${r.skills.join(', ')} and judge by their rules.` : '')
// PRs by the local clone their agent runs in; a repo without one runs in the session's folder. The
// engine gives an agent the CLAUDE.md above the session's folder, not above its cwd, so a prompt
// names the clone (b_env): the folders above it hold the person's environment rules, whatever
// folder the session opened in, and the repo's own rules come from its base (rules.mjs).
const byClone = (list: RepoCfg[], urls: string[]) => {
  const groups = new Map<string, string[]>()
  for (const u of urls) {
    const path = repoOf(list, u)?.path ?? ''
    groups.set(path, [...(groups.get(path) ?? []), u])
  }
  return [...groups]
}

// Validates PRs in the background: queues them, then hands them to subagents with the validate
// job, ten each so a long list runs side by side; each agent marks a PR started as it reaches it.
// No chat is opened, the verdicts land on the lines as each one finishes. Each PR carries the
// rules of its repo, the repo's own prompt, once per repo in the batch.
// The person's own prompt replaces Argos's job only in what to look for: the verdicts are still
// recorded with verdicts.mjs, or the pane could not show them.
async function validate($: any, urls: string[], lang: string, prompt: Prompt) {
  if (!urls.length || (await demoBlocks($, lang))) return
  const queued = await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'queue', ...urls])
  if (queued?.exitCode) {
    $.ui.toast(`Argos: ${t(lang, 'queue_failed', (queued.stderr ?? '').trim())}`)
    return
  }
  await loadVerdicts($)
  const list = await loadRepos($)
  const scripts = `${$.plugin.root}/scripts`
  const ask = compose(prompt, [t(lang, 'b_auto'), `Job: ${$.plugin.root}/references/validate.md`], text => [text, t(lang, 'b_record', scripts)])
  for (const [cwd, group] of byClone(list, urls))
    for (let i = 0; i < group.length; i += 10) {
      const part = group.slice(i, i + 10)
      const rules = new Map(
        part
          .map(u => repoOf(list, u))
          .filter(r => r && promptOf(r))
          .map(r => [r!.repo, promptOf(r)]),
      )
      const lines = [...ask, ...(cwd ? [t(lang, 'b_env', cwd)] : []), `Scripts: ${scripts}`, ...[...rules].map(([repo, text]) => t(lang, 'b_rules', repo, text)), ...part.map(u => `- ${u}`)]
      try {
        const { agentId, deny } = await $.agent.spawn({
          prompt: lines.join('\n'),
          description: `Argos validate · ${part.length} PRs`,
          ...(cwd && { cwd }),
        })
        // a refusal answers instead of throwing: the person's hooks or rules may say no
        if (deny) throw new Error(deny)
        if (agentId) await update($, agentRuns, runs => ({ ...runs, [agentId]: part }))
      } catch (err) {
        // no agent will reach them: they fail now, with why, instead of waiting an hour
        const why = String((err as Error)?.message ?? err).split('\n')[0]
        for (const u of part) await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'fail', u, '--reason', why]).catch(() => {})
        await loadVerdicts($)
      }
    }
}

// Fixes the person's own PRs in the background: one agent per repo, in its local clone, takes
// them one at a time (they share the clone), turns each review into commits and replies, pushes and answers on its own, and
// skips a PR it cannot fix safely (no clone, uncommitted work, conflicts). It ends with one line
// the pane shows as a toast. The person's own prompt replaces Argos's job only in how to fix.
async function fix($: any, urls: string[], lang: string, prompt: Prompt) {
  if (!urls.length || (await demoBlocks($, lang))) return
  await $.state.set(FIX_RESULT, null)
  const list = await loadRepos($)
  const ask = compose(prompt, [t(lang, 'b_fix'), `Job: ${$.plugin.root}/references/mine.md (Job 2, in the background)`], text => [text, t(lang, 'b_fix_rules')])
  for (const [cwd, group] of byClone(list, urls)) {
    const lines = [...ask, ...(cwd ? [t(lang, 'b_env', cwd)] : []), `Scripts: ${$.plugin.root}/scripts`, ...group.map(u => (cwd ? `- ${u} (clone: ${cwd})` : `- ${u}`))]
    try {
      const { agentId, deny } = await $.agent.spawn({
        prompt: lines.join('\n'),
        description: `Argos fix · ${group.length} PRs`,
        ...(cwd && { cwd }),
      })
      if (deny) throw new Error(deny)
      if (agentId) await update($, fixRuns, runs => ({ ...runs, [agentId]: group }))
    } catch (err) {
      await $.state.set(FIX_RESULT, t(lang, 'fix_failed', String((err as Error)?.message ?? err).split('\n')[0]))
    }
  }
}

// Stops a validating agent the mod started: from now on every tool it calls is refused, so it
// ends, and its PRs not yet validated are marked failed, ready for Retry.
async function stopAgent($: any, id: string) {
  await $.state.set(STOPPED, [...(((await $.state.get(STOPPED)).value as string[] | undefined) ?? []), id])
  const urls: string[] = ((await $.state.get(AGENT_RUNS)).value ?? {})[id] ?? []
  const v = await loadVerdicts($)
  for (const u of urls.filter(u => ['queued', 'running'].includes(v?.prs[u]?.state ?? '')))
    await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'fail', u, '--reason', 'stopped'])
  await loadVerdicts($)
}

// Auto-validate: after a round, once its interval has passed since the last automatic round, only
// what changed goes, in the background: PRs with no verdict yet or with commits after theirs,
// among those with nothing pending (no change asked, not a draft), the user's own with "mine",
// every watched PR with "all"; authors left out stay out. A failed one waits for Retry. Each round
// is recorded, sent or not, so the pane can say when it looked. ponytail: ten per round, so a
// burst never spends a fortune at once.
async function autoValidate($: any, r: Round | null, lang: string, prompt: Prompt) {
  const v = await loadVerdicts($)
  if (!r || !v || v.auto === 'off') return
  const now = await $.clock.now()
  if (v.lastAuto && now - Date.parse(v.lastAuto.at) < (v.autoEvery ?? 30) * 6e4 - 3e4) return
  const skip = new Set(((await $.state.get(IGNORED)).value as string[] | undefined) ?? NO_BOTS)
  const humanOnly = new Set(await freshOut($))
  const all = [...(r.pending ?? []), ...(r.mine ?? []), ...(r.others ?? [])].filter(
    p => !skip.has(authorOf(p)) && !skip.has(`kind:${kindOf(p)}`) && !humanOnly.has(`${p.repo}#${p.number}`),
  )
  const mine = (p: (typeof all)[number]) => p.kind === 'mine' || (Boolean(r.me) && p.author === r.me)
  const changed = (p: (typeof all)[number]) => {
    const verdict = verdictOf(p, v.prs[p.url], now)
    return (verdict.state === 'none' || verdict.state === 'stale') && outOf(p, verdict) === null
  }
  const urls = [...new Set(all.filter(p => (v.auto === 'all' || mine(p)) && changed(p)).map(p => p.url))].slice(0, 10)
  await validate($, urls, lang, prompt)
  await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'ran', String(urls.length)])
  await loadVerdicts($)
}

// After verdicts land: auto-merge looks at the passing ones (merge.mjs does nothing for a repo
// that did not opt in), and once a run has nothing left running, one toast says what it came to.
// One sweep at a time: verdicts landing together would otherwise approve the same PR twice.
let sweeping: Promise<unknown> | null = null
async function afterVerdicts($: any, lang: string, limit: number) {
  if ((await $.state.get(DEMO)).value) return
  sweeping ??= $.process
    .run(['node', `${$.plugin.root}/scripts/merge.mjs`, 'sweep'], {
      timeoutMs: 120_000,
    })
    .catch(() => {})
    .finally(() => (sweeping = null))
  await sweeping
  const v = await loadVerdicts($)
  const run = runOf(v, await $.clock.now(), lang, limit)
  if (!run || run.isRunning || (await $.state.get(ANNOUNCED)).value === run.at) return
  await $.state.set(ANNOUNCED, run.at)
  $.ui.toast(`Argos: ${run.label}`)
}

// Shows what the last round (from any session) wrote, unless what is on screen is newer
// (a failure this session saw that the file does not know about).
async function load($: any): Promise<Round | null> {
  const shown: Round | null = (await $.state.get(ROUND)).value ?? null
  if ((await $.state.get(DEMO)).value) return shown
  try {
    const last: Round = JSON.parse(await $.fs.read(await roundFile($)))
    if (shown && Date.parse(shown.at) > Date.parse(last.at)) return shown
    await $.state.set(ROUND, last)
    return last
  } catch {
    return shown
  }
}

// Puts "/argos repos add " in the prompt for the person to finish with a folder or
// owner/name, unless it is already there.
// First setup's facts (setup.mjs): gh, its accounts, repos to suggest. Run when the pane opens with
// no repo connected, and from the setup page's buttons; never while drawing.
async function checkSetup($: any, account?: string, lang = 'en') {
  if ((await $.state.get(DEMO)).value) return
  if (account) wantedAccount.push(account)
  if (inflight.has('setup-check')) return
  inflight.add('setup-check')
  try {
    await update($, pending, list => [...list, 'setup-check'])
    let asked: string | undefined
    let info: SetupInfo
    // the person may pick another account while a check runs: check again for the last one picked
    do {
      asked = wantedAccount.at(-1) ?? account
      const at = new Date(await $.clock.now()).toISOString()
      try {
        const cwd = await $.session.cwd().catch(() => '')
        const r = await $.process.run(['node', `${$.plugin.root}/scripts/setup.mjs`, ...(asked ? ['--account', asked] : []), ...(cwd ? ['--cwd', cwd] : []), '--json'], {
          timeoutMs: 60_000,
        })
        info = { ...JSON.parse(r.stdout), at }
      } catch (e) {
        // a check that failed says so; it never claims gh is missing
        info = { gh: 'error', accounts: [], account: null, suggestions: [], error: String((e as Error)?.message ?? e).split('\n')[0], at }
      }
    } while (wantedAccount.at(-1) && wantedAccount.at(-1) !== asked)
    wantedAccount.length = 0
    // a re-check that fixed gh says so, since its fix box goes away
    const before = (await $.state.get(SETUP)).value as SetupInfo | null
    if (before && before.gh !== 'ok' && info!.gh === 'ok') $.ui.toast(`Argos: ${t(lang, 'su_gh_ready')}`)
    await update($, setupInfo, () => info)
    await update($, pending, list => list.filter(k => k !== 'setup-check'))
  } catch {
    // the session went away mid-check: nothing to show it to
  } finally {
    inflight.delete('setup-check')
  }
}

async function openPane($: any) {
  await load($)
  await loadVerdicts($)
  const list = await loadRepos($)
  const done = (await $.store.get('setupDone').catch(() => undefined)) === true
  await $.state.set(SETUP_DONE, done)
  // a first run stays on the setup page through its steps, even once a repo is connected
  if (!list.length && !done) await $.state.set(PAGE, 'setup')
  if (!list.length && !done && !(await $.state.get(SETUP)).value) void checkSetup($)
  await $.ui.open({ id: PANE, title: 'Argos' })
}

// One round. Open sessions share last-round.json: a session skips the round
// when another one ran it within the interval, and only shows it.
async function tick($: any, options: PluginOptions, force: boolean) {
  if ((await $.state.get(RUNNING)).value || (await $.state.get(DEMO)).value) return
  const { minutes, account, qualifiers, lang, limit, prompts } = config(options)
  const last = await load($)
  const now = await $.clock.now()
  if (!force && last && now - Date.parse(last.at) < minutes * 6e4 - 3e4) return
  await $.state.set(RUNNING, true)
  try {
    await $.state.set(OUT, await freshOut($))
    const argv = ['node', `${$.plugin.root}/scripts/round.mjs`, ...qualifiers, '--lang', lang, '--json']
    if (account) argv.push('--account', account)
    await $.process.run(argv, { timeoutMs: 120_000 })
    const fresh = await load($)
    if (fresh?.notify) $.ui.toast(fresh.notify)
    await writeHuman($, humanUrls(fresh, await freshOut($), ((await $.state.get(IGNORED)).value as string[] | undefined) ?? NO_BOTS))
    await autoValidate($, fresh, lang, prompts.validate).catch(() => {})
    await afterVerdicts($, lang, limit).catch(() => {})
  } catch (err) {
    // round.mjs writes the real reason (gh auth, a timeout) before it fails; use it when it is
    // this attempt's. Only a run that died before writing (killed at the time limit) gets the
    // wrapper's message. Either way okAt stays the last round that worked.
    const fresh = await load($)
    if (!fresh?.error || Date.parse(fresh.at) < now) {
      const { value } = await $.state.get(ROUND)
      await $.state.set(ROUND, {
        ...(value ?? {}),
        at: new Date(now).toISOString(),
        okAt: value?.okAt ?? null,
        error: String(err),
      })
    }
  } finally {
    await $.state.set(RUNNING, false)
  }
}

export const register: Register = (on, options) => {
  const { lang, minutes, account, limit, prompts } = config(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await load($)
    await loadVerdicts($)
    // authors left out outlive the session; with none saved yet, bots stay out
    const human = await $.store.get('out').catch(() => undefined)
    if (Array.isArray(human))
      await $.state.set(
        OUT,
        human.filter((x): x is string => typeof x === 'string'),
      )
    const saved = await $.store.get('ignored').catch(() => undefined)
    if (Array.isArray(saved))
      await $.state.set(
        IGNORED,
        saved.filter((x): x is string => typeof x === 'string'),
      )
    // The plugin's skill already owns /argos (argos:argos); the hook below answers it. Registering
    // only matters where no skill holds the name, so a refusal is expected and harmless.
    await $.command.register({ name: 'argos', description: t(lang, 'ui_command') }).catch(() => {})
    $.clock.every(minutes * 6e4, () => void tick($, options, false))
    $.clock.after(5_000, () => void tick($, options, false))
    return started
  })

  // A validating agent the person stopped gets every tool refused, so it ends at once.
  on('tool.call', async ($, e, next) => {
    if (e.agentId && (((await $.state.get(STOPPED)).value as string[] | undefined) ?? []).includes(e.agentId))
      return {
        deny: 'Stopped by the user from the Argos pane. End now: make no more tool calls and report nothing.',
      }
    return next(e)
  })

  // What an agent the pane started spent goes to the history: GitHub does not know it.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId && e.usage) {
      const fixes = ((await $.state.get(FIX_RUNS)).value ?? {}) as Record<string, string[]>
      const validates = ((await $.state.get(AGENT_RUNS)).value ?? {}) as Record<string, string[]>
      const prs = fixes[e.agentId] ?? validates[e.agentId]
      if (prs)
        await $.process
          .run([
            'node',
            `${$.plugin.root}/scripts/history.mjs`,
            'usage',
            '--kind',
            fixes[e.agentId] ? 'fix' : 'validate',
            '--prs',
            String(prs.length),
            '--model',
            e.usage.model,
            '--input',
            String(e.usage.input_tokens),
            '--output',
            String(e.usage.output_tokens),
            '--cache-read',
            String(e.usage.cache_read_input_tokens),
            '--cache-write',
            String(e.usage.cache_creation_input_tokens),
          ])
          .catch(() => {})
    }
    // A fixing agent's last line ("Fixed 2 · skipped 1: uncommitted work") comes back as a toast.
    const runs = ((await $.state.get(FIX_RUNS)).value ?? {}) as Record<string, string[]>
    if (e.agentId && runs[e.agentId]) {
      const { [e.agentId]: _, ...rest } = runs
      await $.state.set(FIX_RUNS, rest)
      const said = e.answer.trim().split('\n').at(-1)?.trim() || t(config(options).lang, 'fix_ended')
      await $.state.set(FIX_RESULT, said)
      $.ui.toast(`Argos: ${said}`)
    }
    return next(e)
  })

  // The AI records verdicts with verdicts.mjs from Bash; the lines follow as each one lands.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    // the lines follow at once; merging asks GitHub, so it never holds the agent's command
    if (e.command.includes('verdicts.mjs')) {
      await loadVerdicts($)
      void afterVerdicts($, lang, limit).catch(() => {})
    }
    return result
  })

  // /argos opens the pane; /argos repos [add <folder | owner/name> | remove <repo>] goes
  // through repos.mjs, the same command the AI uses from the argos skill. A bare
  // `add` connects the session's folder, named here so it never falls to the mod's own; a
  // name is checked as the vigil's account. Anything else after /argos (a PR link, a question)
  // goes on to the skill.
  on('command.run', async ($, e, next) => {
    if (e.command !== 'argos' && e.command !== 'argos:argos') return next(e)
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    if (args.length && !['repos', 'demo', 'stats'].includes(args[0])) return next(e)
    if (args[0] === 'stats') {
      const { stdout, stderr } = await $.process.run(['node', `${$.plugin.root}/scripts/history.mjs`, 'stats', '--lang', lang])
      return { text: (stdout || stderr).trim() }
    }
    if (args[0] === 'repos') {
      if (args.length === 2 && args[1] === 'add') args.push(await $.session.cwd())
      const { stdout, stderr } = await $.process.run([
        'node',
        `${$.plugin.root}/scripts/repos.mjs`,
        ...(args.length > 1 ? args.slice(1) : ['list']),
        '--lang',
        lang,
        ...(account ? ['--account', account] : []),
      ])
      if (args[1] === 'add' || args[1] === 'remove') void tick($, options, true)
      return { text: (stdout || stderr).trim() }
    }
    // a sample round with several repos, authors and verdicts, to look at the pane without one
    if (args[0] === 'demo') {
      const at = new Date(await $.clock.now()).toISOString()
      await $.state.set(DEMO, true)
      await $.state.set(ROUND, { ...DEMO_ROUND, at, okAt: at })
      await $.state.set(VERDICTS, DEMO_VERDICTS)
      await $.ui.open({ id: PANE, title: 'Argos' })
      return { text: t(lang, 'ui_demo') }
    }
    // leaving the demo drops its sample and its picks, so the next load shows the real round
    if ((await $.state.get(DEMO)).value) {
      await $.state.set(ROUND, null)
      await $.state.set(VERDICTS, null)
      const kept = await freshOut($)
      await update($, out, () => kept)
      await update($, back, () => [])
    }
    await $.state.set(DEMO, false)
    await openPane($)
    void tick($, options, true)
    return { text: t(lang, 'ui_opened') }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // the terminal is the one surface without Svg: icons fall back to their text marks; the mobile
    // app has no fields, so there the automatic mode and the repo prompts are only said
    const hasSvg = e.surface !== 'terminal'
    const Select = 'Select' in ui ? ui.Select : null
    const Input = 'Input' in ui ? ui.Input : null
    const [running, last, left, brought, judged, authorsOut, repoList, where, confirming, fixing, validating, busyKeys, setupData, setupDone, lastFix] = await Promise.all([
      read($, isRunning),
      read($, round),
      read($, out),
      read($, back),
      read($, verdicts),
      read($, ignored),
      read($, repos),
      read($, page),
      read($, confirmMerge),
      read($, fixRuns),
      read($, agentRuns),
      read($, pending),
      read($, setupInfo),
      read($, setupDoneAtom),
      read($, fixResult),
    ])
    // the agents at work first: a line a fixing agent holds says so
    const working = (await $.agent.list().catch(() => []))
      .filter((a: { spawnedBy?: string; status: string }) => a.spawnedBy === 'argos' && ['pending', 'running', 'waiting'].includes(a.status))
      .map((a: { id: string; description: string; status: string }) => ({
        id: a.id,
        description: a.description,
        status: a.status,
      }))
    const vm = toViewModel(last, {
      now: await $.clock.now(),
      lang,
      minutes,
      running,
      ui: { out: left, back: brought },
      verdicts: judged,
      ignored: authorsOut,
      limit,
      repos: repoList,
      fixing: working.flatMap(a => fixing[a.id] ?? []),
    })
    // a box per line, per author and per repo; the terminal draws them in brackets
    const BOX = hasSvg ? { on: '☑', mixed: '◩', off: '☐' } : { on: '[x]', mixed: '[-]', off: '[ ]' }
    // tick returns at once while a round runs, so pressing twice does nothing
    const checkNow = () => void tick($, options, true)
    // An icon says what it means on hover: its tip as the SVG's title, drawn interactive; the
    // terminal draws its text mark instead.
    const icon = (svg: string, text: string, w = 16, tall = 16, tip?: string) =>
      hasSvg ? <ui.Svg source={titled(svg, tip)} alt={tip ?? text} width={w} height={tall} isInteractive={tip ? true : undefined} /> : <Text>{text}</Text>

    // The head: the mark, "Pull requests" and Check now; under it how many go to validation and
    // when Argos last looked.
    const head = (withCheck: boolean) => (
      <Box key="head" flexDirection="column" gap={SPACE.row}>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline} rowGap={SPACE.row}>
          <Box flexDirection="row" alignItems="center" gap={SPACE.inline} flexGrow={1} flexShrink={1} minWidth={0}>
            {hasSvg && <ui.Svg source={LOGO} alt="Argos" width={16} height={16} />}
            <Text size="heading" weight="semibold" color={C.text}>
              {t(lang, 'in_title')}
            </Text>
          </Box>
          <Box flexDirection="row" alignItems="center" gap={SPACE.inline}>
            {withCheck && (
              <Button key="check" variant="secondary" dimColor={running} onPress={running ? () => undefined : checkNow}>
                {running ? t(lang, 'ui_checking') : t(lang, 'ui_check')}
              </Button>
            )}
            {vm.state === 'ok' && (
              <Button key="settings-page" variant="secondary" onPress={() => void update($, page, () => 'settings')}>
                {t(lang, 'open_settings')}
              </Button>
            )}
          </Box>
        </Box>
        <Box flexDirection="column" gap={SPACE.line}>
          <Box flexDirection="row" alignItems="center" flexWrap="wrap" columnGap={SPACE.row}>
            {vm.state === 'ok' && (
              <Text weight="semibold" color={vm.failed ? C.error : C.text}>
                {vm.failed ? t(lang, 'in_failed') : vm.summary}
              </Text>
            )}
            {vm.checked && (
              <Text size="caption" color={C.subtle}>
                {vm.state === 'ok' ? `· ${vm.checked}` : vm.checked}
              </Text>
            )}
          </Box>
          {vm.state === 'ok' && vm.mergeLine && (
            <Text size="caption" color={C.subtle}>
              {vm.mergeLine}
            </Text>
          )}
        </Box>
      </Box>
    )
    // A banner: check failed (red), no repo (neutral).
    const banner = (key: string, look: { bg?: string; border: string }, svg: string, title: string, sub: string, btn?: { label: string; onPress: () => void }) => (
      <Box key={key} flexDirection="row" gap={SPACE.inline} padding="sm" borderStyle="round" borderColor={look.border} backgroundColor={look.bg}>
        {icon(svg, '●')}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text weight="semibold" color={C.text}>
            {title}
          </Text>
          {sub && (
            <Text size="caption" color={C.subtle}>
              {sub}
            </Text>
          )}
          {btn && (
            <Box flexDirection="row" justifyContent="flex-end" marginTop="xs">
              <Button key={`${key}-btn`} variant="secondary" onPress={btn.onPress}>
                {btn.label}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    )
    // Space goes between Boxes, never between lines of Text: lines of one thought sit at 0, blocks
    // of a region md apart, regions lg apart, and stacked rows of Buttons xs apart.
    const frame = (...body: any[]) => (
      <Box flexDirection="column" gap={SPACE.region} padding="md">
        {body.filter(Boolean)}
      </Box>
    )
    const fixAuth = async () => {
      const { text } = await $.prompt.read()
      const ask = t(lang, 'p_auth', vm.error?.why ?? '')
      if (!text.includes(ask)) await $.prompt.fill(text.trim() ? { text: `\n${ask}`, mode: 'append' } : { text: ask, mode: 'replace' })
    }
    const failedBanner =
      vm.error &&
      banner(
        'failed',
        { bg: rgba(HEX.error, TINT), border: rgba(HEX.error, EDGE) },
        I.error,
        t(lang, 'in_err_title'),
        vm.error.why,
        vm.error.isAuth ? { label: t(lang, 'in_fix_auth'), onPress: () => void fixAuth() } : { label: t(lang, 'in_retry'), onPress: checkNow },
      )

    const noop = () => undefined
    // a press that takes a while: once, and shown as at work until it ends
    const work = (key: string, fn: () => Promise<unknown>) =>
      once(key, async () => {
        await update($, pending, list => [...list, key])
        try {
          await fn()
        } finally {
          await update($, pending, list => list.filter(k => k !== key))
        }
      })
    const isWorking = (key: string) => busyKeys.includes(key)
    const setAuto = async (mode: string, every: number) => {
      if (await demoBlocks($, lang)) return
      autoErrors.delete('auto')
      try {
        const r = await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'auto', mode, '--every', String(every)])
        if (r.exitCode) autoErrors.set('auto', (r.stderr ?? '').trim())
      } catch (err) {
        autoErrors.set('auto', String((err as Error)?.message ?? err).split('\n')[0])
      }
      await loadVerdicts($)
    }
    const autoSays = () => (autoErrors.has('auto') ? t(lang, 'auto_failed', autoErrors.get('auto') ?? '') : vm.state === 'ok' ? vm.auto.line : '')

    // First setup: with no repo connected and the setup never finished, the pane opens on three
    // steps (the GitHub CLI, the account, the repos), each saying where it stands and the one thing
    // that moves it on, then the defaults it starts with. A mark says only what really stands: a
    // step waiting on an earlier one is never shown done. What needs a terminal (logging gh in)
    // is copied for the person to run; everything else happens here. Settings brings it back.
    // a repo counts as connected once repos.json or the last round names it
    const repoCount = Math.max(repoList.length, last?.repos?.length ?? 0)
    if (where === 'setup' || (!setupDone && !repoCount)) {
      const s = setupData
      const checking = isWorking('setup-check')
      const ghOk = s?.gh === 'ok'
      const account = s?.account ?? ''
      const connected = new Set(repoList.map(r => r.repo.toLowerCase()))
      const connect = (target: string, key: string) =>
        work(key, async () => {
          // the first connection must not drop the page: the steps after it are still to come
          await update($, page, () => 'setup')
          const r = await $.process.run(['node', `${$.plugin.root}/scripts/repos.mjs`, 'add', target, ...(account ? ['--account', account] : []), '--lang', lang])
          await loadRepos($)
          if (r.exitCode) {
            connectErrors.set(key, (r.stderr || r.stdout || '').trim() || t(lang, 'su_connect_failed_why'))
            $.ui.toast(`Argos: ${connectErrors.get(key)}`)
          } else connectErrors.delete(key)
        })
      // another repo by name: only owner/name goes to repos.mjs; anything else says how to write it
      const connectOther = (text: string) => {
        const name = text.trim()
        if (!/^[\w.-]+\/[\w.-]+$/.test(name)) return void (connectErrors.set('connect-other', t(lang, 'su_other_bad')), update($, pending, list => [...list]))
        connectErrors.delete('connect-other')
        connect(name, 'connect-other')()
      }
      const finish = async () => {
        await $.store.set('setupDone', true).catch(() => {})
        await update($, setupDoneAtom, () => true)
        await update($, page, () => 'home')
        await tick($, options, true)
      }
      const MARK = {
        done: { svg: I.check, word: t(lang, 'su_mark_done') },
        now: { svg: I.queued, word: t(lang, 'su_mark_now') },
        wait: { svg: I.queued, word: t(lang, 'su_mark_wait') },
        blocked: { svg: I.cross, word: t(lang, 'su_mark_blocked') },
      }
      type Mark = keyof typeof MARK
      // a step: its mark (named in words) and number, what stands now, then its actions under it
      const step = (key: string, n: number, title: string, state: Mark, ...body: any[]) => (
        <Box key={key} flexDirection="column" gap={SPACE.row}>
          <Box flexDirection="row" alignItems="center" gap={SPACE.inline}>
            {icon(MARK[state].svg, MARK[state].word, 16, 16)}
            <Text weight="semibold" color={C.text}>
              {`${n} · ${title}`}
            </Text>
          </Box>
          <Box flexDirection="column" gap={SPACE.inline} marginLeft={3}>
            {body.filter(Boolean)}
          </Box>
        </Box>
      )
      const note = (text: string, color: string = C.subtle) => (
        <Text size="caption" color={color}>
          {text}
        </Text>
      )
      const checkedAt = s?.at ? t(lang, 'su_checked_at', hhmm(Date.parse(s.at))) : ''
      const ghProblem = s && !ghOk ? (s.gh === 'error' ? 'error' : s.gh === 'missing' ? 'missing' : 'none') : null
      const ghStep = step(
        'su-gh',
        1,
        t(lang, 'su_gh'),
        !s ? 'now' : ghOk ? 'done' : 'blocked',
        !s ? (
          note(t(lang, 'su_gh_checking'))
        ) : ghOk ? (
          note(t(lang, 'su_gh_ok', s.accounts.length))
        ) : (
          <Box key="gh-fix" flexDirection="column" gap={SPACE.line}>
            {note(ghProblem === 'error' ? t(lang, 'su_gh_error', s.error ?? '') : t(lang, ghProblem === 'missing' ? 'su_gh_missing' : 'su_gh_none'), C.error)}
            {note(t(lang, ghProblem === 'missing' ? 'su_gh_missing_fix' : ghProblem === 'none' ? 'su_gh_none_fix' : 'su_gh_error_fix'), C.text)}
          </Box>
        ),
        s && !ghOk && (
          <Box key="gh-actions" flexDirection="column" gap={SPACE.row}>
            {ghProblem === 'none' && (
              <Box flexDirection="column" gap={SPACE.line}>
                <Box flexDirection="row">
                  <Button
                    key="copy-login"
                    variant={copiedLogin.size ? 'secondary' : 'primary'}
                    onPress={work('copy-login', async () => {
                      await $.ui.copy({ text: 'gh auth login' })
                      copiedLogin.add(true)
                    })}
                  >
                    {copiedLogin.size ? t(lang, 'su_copied_login') : t(lang, 'su_copy_login')}
                  </Button>
                </Box>
                {copiedLogin.size > 0 && note(t(lang, 'su_copied_note'))}
              </Box>
            )}
            <Box flexDirection="column" gap={SPACE.line}>
              <Box flexDirection="row">
                <Button
                  key="check-gh"
                  variant={ghProblem !== 'none' || copiedLogin.size ? 'primary' : 'secondary'}
                  dimColor={checking}
                  onPress={checking ? noop : () => void checkSetup($, account || undefined, lang)}
                >
                  {checking ? t(lang, 'su_gh_checking') : t(lang, 'su_check_gh')}
                </Button>
              </Box>
              {!checking && checkedAt && note(checkedAt)}
            </Box>
          </Box>
        ),
      )
      const accountStep = step(
        'su-account',
        2,
        t(lang, 'su_account'),
        ghOk ? 'done' : 'wait',
        !ghOk ? (
          note(t(lang, 'su_after_gh'))
        ) : s!.accounts.length > 1 && Select ? (
          <Select
            key="setup-account"
            label={t(lang, 'su_account_pick')}
            options={s!.accounts.map(a => ({ value: a.login, label: a.login }))}
            value={wantedAccount.at(-1) ?? account}
            onSelect={(login: string) => void checkSetup($, login, lang)}
          />
        ) : (
          note(t(lang, 'su_account_one', account))
        ),
      )
      // the folder Claude runs in, when it is a GitHub repo
      const here = s?.here ?? null
      const repoStep = step(
        'su-repos',
        3,
        t(lang, 'su_repos'),
        !ghOk ? 'wait' : repoCount ? 'done' : 'now',
        !ghOk && note(t(lang, 'su_after_gh')),
        ghOk && note(checking ? t(lang, 'su_loading_repos', wantedAccount.at(-1) ?? account) : repoCount ? t(lang, 'su_repos_n', repoCount) : t(lang, 'su_repos_none')),
        ghOk && s!.suggestions.length > 0 && (
          <Box key="suggest" flexDirection="column" gap={SPACE.block}>
            {note(t(lang, 'su_suggest', account))}
            {s!.suggestions.map(x => {
              const key = `connect:${x.repo}`
              const isIn = connected.has(x.repo.toLowerCase())
              const off = checking || isIn || isWorking(key)
              const name = clip(x.repo.split('/')[1] ?? x.repo, 16)
              return (
                <Box key={`sug:${x.repo}`} flexDirection="column" gap={SPACE.line}>
                  <Box flexDirection="row" alignItems="center" gap={SPACE.inline}>
                    <Box flexDirection="column" gap={SPACE.line} flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text weight="semibold" color={C.text}>
                        {x.repo}
                      </Text>
                      {note(t(lang, 'su_open_prs', x.prs))}
                    </Box>
                    <Box flexShrink={0}>
                      <Button key={key} variant="secondary" dimColor={off} onPress={off ? noop : connect(x.repo, key)}>
                        {isIn ? t(lang, 'su_connected', name) : isWorking(key) ? t(lang, 'su_connecting') : t(lang, 'su_connect', name)}
                      </Button>
                    </Box>
                  </Box>
                  {connectErrors.get(key) && note(`${connectErrors.get(key)} ${t(lang, 'su_connect_fix')}`, C.error)}
                </Box>
              )
            })}
          </Box>
        ),
        ghOk && s?.error && note(t(lang, 'su_suggest_failed', s.error), C.warning),
        // other ways in: this folder, or a repo by name
        ghOk && here && (
          <Box key="here" flexDirection="column" gap={SPACE.line}>
            <Box flexDirection="row">
              <Button
                key="connect-here"
                variant="secondary"
                dimColor={checking || connected.has(here.toLowerCase()) || isWorking('connect-here')}
                // by folder, not by name: the repo then knows its clone, which agents run in
                onPress={checking || connected.has(here.toLowerCase()) || isWorking('connect-here') ? noop : async () => connect(await $.session.cwd(), 'connect-here')()}
              >
                {connected.has(here.toLowerCase())
                  ? t(lang, 'su_here_connected')
                  : isWorking('connect-here')
                    ? t(lang, 'su_connecting')
                    : t(lang, 'su_connect_here', clip(here, 28))}
              </Button>
            </Box>
            {connectErrors.get('connect-here') && note(`${connectErrors.get('connect-here')} ${t(lang, 'su_connect_fix')}`, C.error)}
          </Box>
        ),
        ghOk && Input && (
          <Box key="other" flexDirection="column" gap={SPACE.row}>
            <Input
              key="connect-other"
              label={t(lang, 'su_other')}
              placeholder="acme/web"
              submitLabel={t(lang, 'su_connect_repo')}
              onInput={(text: string) => void otherDraft.set('v', text)}
              onSubmit={(text: string) => connectOther(text)}
            />
            <Box flexDirection="row">
              <Button
                key="connect-other-btn"
                variant="secondary"
                dimColor={checking || isWorking('connect-other')}
                onPress={checking || isWorking('connect-other') ? noop : () => connectOther(otherDraft.get('v') ?? '')}
              >
                {isWorking('connect-other') ? t(lang, 'su_connecting') : t(lang, 'su_connect_repo')}
              </Button>
            </Box>
            {connectErrors.get('connect-other') && note(connectErrors.get('connect-other')!, C.error)}
          </Box>
        ),
      )
      // what Argos starts with, not steps: who goes and the automatic mode, each changeable later
      const autoOn = (judged?.auto ?? 'off') !== 'off'
      const defaults = (
        <Box key="su-defaults" flexDirection="column" gap={SPACE.row}>
          <Text weight="semibold" color={C.text}>
            {t(lang, 'su_defaults')}
          </Text>
          <Box flexDirection="column" gap={SPACE.inline}>
            {note(`${t(lang, 'su_who')}: ${vm.state === 'ok' ? vm.who.label.replace(/^[^:]+:\s*/, '') : t(lang, 'su_who_default')}`)}
            {note(`${t(lang, 'auto_label')}: ${autoOn ? t(lang, 'su_auto_on') : t(lang, 'su_auto_off')}`)}
            <Box flexDirection="row">
              <Button
                key="su-auto"
                variant="secondary"
                dimColor={!repoCount || isWorking('su-auto')}
                onPress={!repoCount || isWorking('su-auto') ? noop : work('su-auto', () => setAuto(autoOn ? 'off' : 'mine', judged?.autoEvery ?? 30))}
              >
                {isWorking('su-auto') ? t(lang, autoOn ? 'auto_turning_off' : 'auto_turning_on') : t(lang, autoOn ? 'cd_auto_off' : 'cd_auto_on')}
              </Button>
            </Box>
          </Box>
        </Box>
      )
      return frame(
        <Box key="su-head" flexDirection="column" gap={SPACE.line}>
          <Box flexDirection="row" alignItems="center" gap={SPACE.inline}>
            {hasSvg && <ui.Svg source={LOGO} alt="Argos" width={16} height={16} />}
            <Text size="heading" weight="semibold" color={C.text}>
              {t(lang, 'su_title')}
            </Text>
          </Box>
          {note(t(lang, 'su_sub'))}
        </Box>,
        ghStep,
        accountStep,
        repoStep,
        defaults,
        <Box key="su-finish" flexDirection="column" gap={SPACE.line}>
          <Box flexDirection="row">
            <Button key="setup-finish" variant={repoCount ? 'primary' : 'secondary'} dimColor={!repoCount} onPress={repoCount ? () => void finish() : noop}>
              {t(lang, 'su_finish')}
            </Button>
          </Box>
          {!repoCount && note(t(lang, ghOk ? 'su_finish_needs' : 'su_finish_needs_gh'))}
        </Box>,
      )
    }

    // The first check: static placeholders one line tall (a height counts lines), so nothing jumps.
    if (vm.state === 'loading' || vm.state === 'never')
      return frame(
        head(vm.state === 'never'),
        <Box key="skeleton" flexDirection="column" gap={SPACE.row}>
          {['78%', '64%', '72%'].map((w, i) => (
            <Box key={`sk${i}`} height={1} width={w} backgroundColor={SKELETON} />
          ))}
          <Text size="caption" color={C.subtle}>
            {t(lang, 'in_first')}
          </Text>
        </Box>,
      )
    if (vm.state === 'noData') return frame(head(true), failedBanner)
    if (vm.state === 'noRepos')
      return frame(
        head(false),
        banner('norepo', { bg: PANEL.backgroundColor, border: PANEL.borderColor }, I.pr(HEX.grey), t(lang, 'in_norepo_title'), t(lang, 'in_norepo_body'), {
          label: t(lang, 'in_setup'),
          onPress: () => void (update($, page, () => 'setup'), checkSetup($, undefined, lang)),
        }),
      )
    if (vm.state !== 'ok') return frame(head(true))

    // Three pages: the dashboard (what stands, one tap per flow, the repos), a repo's own page (its
    // lines, picked one by one) and Settings (who goes, the schedule, each repo's auto-merge and
    // prompt). The dashboard stays short so the flow reads at a glance.
    // Every control is a native button with its shape (primary or secondary): nothing pressable is
    // bare text. A control never disappears while a run goes: it dims, says so ("Validating…") and
    // does nothing until the run ends. A press runs once: a second press while the first one is
    // still at work is dropped.
    const focus = (key: string) => void $.ui.focus({ requestId: PANE, key }).catch(() => {})
    const goTo = (to: string) => void update($, page, () => to).then(() => focus(to === 'home' ? (where === 'settings' ? 'settings-page' : `open:${where}`) : 'back'))
    // a box unticked by hand leaves the PR to humans: nothing automatic touches it, and it stays so
    const setOut = (fn: (list: string[]) => string[]) =>
      (outChain = outChain.then(async () => {
        if ((await $.state.get(DEMO)).value) return void (await update($, out, list => fn(list)))
        // another session may have changed it: start from what is kept
        const before = await freshOut($)
        const next = fn(before)
        await update($, out, () => next)
        await $.store.set('out', next).catch(() => {})
        const failed = await writeHuman($, humanUrls(last, next, authorsOut))
        if (!failed) return void humanErrors.delete('human')
        // merge.mjs would not know: the box goes back to what it was, and says why
        await update($, out, () => before)
        await $.store.set('out', before).catch(() => {})
        humanErrors.set('human', failed)
        $.ui.toast(`Argos: ${t(lang, 'human_failed', failed)}`)
      }))
    const repoCmd = async (...args: string[]) => {
      if (await demoBlocks($, lang)) return { exitCode: 0 }
      let r: { exitCode?: number; stderr?: string } | undefined
      try {
        r = await $.process.run(['node', `${$.plugin.root}/scripts/repos.mjs`, ...args, '--lang', lang])
      } catch (err) {
        r = { exitCode: 1, stderr: String((err as Error)?.message ?? err) }
      }
      await loadRepos($)
      return r
    }
    const busy = Boolean(vm.run?.isRunning)
    // what the run holds: a Validate whose PRs are in it says Validating…, the rest only dim
    const inRun = new Set(vm.run?.isRunning ? vm.run.urls : [])
    const runs = (urls: string[]) => urls.some(u => inRun.has(u))
    // a sub-page's top: Back, a verb with where it goes, then the page's name as its heading
    const bar = (title: string) => (
      <Box key="bar" flexDirection="column" gap={SPACE.block}>
        <Box flexDirection="row">
          <Button key="back" variant="secondary" onPress={() => void (goTo('home'), update($, confirmMerge, () => null))}>
            {t(lang, 'back_home')}
          </Button>
        </Box>
        <Text size="heading" weight="semibold" color={C.text}>
          {clip(title)}
        </Text>
      </Box>
    )

    // The agents at work and the runs, in one block: a validating agent is its run, so its line
    // carries how far it got ("4 of 7 · 1 failed") and the one Stop. Stop refuses its tools from
    // then on, so it ends.
    const progressOf = (id: string) => {
      const urls = validating[id]
      if (!urls) return null
      const states = urls.map(u => judged?.prs[u]?.state)
      return {
        done: states.filter(s => s === 'done' || s === 'failed').length,
        total: urls.length,
        failed: states.filter(s => s === 'failed').length,
      }
    }
    const isFixing = working.some(a => fixing[a.id])
    // the run line stays only when no validating agent stands for the run (a run the chat started)
    const runLine = vm.run?.isRunning && !working.some(a => validating[a.id]) && (
      <Box key="run" flexDirection="column" gap={SPACE.row}>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline}>
          {icon(I.spin, '⠿', 14, 14, t(lang, 'cd_validating'))}
          <Text size="caption" weight="semibold" color={C.text}>
            {t(lang, 'in_validating', vm.run.total - vm.rows.filter(x => x.mark.glyph === '○').length, vm.run.total)}
          </Text>
          {vm.run.failed > 0 && (
            <Text size="caption" weight="semibold" color={C.error}>
              {t(lang, 'run_failed', vm.run.failed)}
            </Text>
          )}
        </Box>
        {/* no agent holds this run (it died with its session): the way out of the wait */}
        <Box flexDirection="row">
          <Button
            key="stop-run"
            variant="secondary"
            dimColor={isWorking('stop-run')}
            onPress={
              isWorking('stop-run')
                ? noop
                : work('stop-run', async () => {
                    for (const u of vm.run!.urls.filter(u => ['queued', 'running'].includes(judged?.prs[u]?.state ?? '')))
                      await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'fail', u, '--reason', t(lang, 'run_stopped')]).catch(() => {})
                    await loadVerdicts($)
                  })
            }
          >
            {isWorking('stop-run') ? t(lang, 'run_stopping') : t(lang, 'run_stop')}
          </Button>
        </Box>
      </Box>
    )
    // what the last run came to, until the next run; what failed stays, with why, until handled
    const doneLine = vm.run && !vm.run.isRunning && (
      <Box key="run" flexDirection="column" gap={SPACE.row}>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline}>
          {!vm.run.failed && icon(I.check, '✓', 14, 14)}
          <Text size="caption" weight="semibold" color={C.text}>
            {`${t(lang, 'run_done')} · ${t(lang, 'run_validated', vm.run.validated)}`}
          </Text>
          {vm.run.failed > 0 && (
            <Text size="caption" weight="semibold" color={C.error}>
              {t(lang, 'run_failed', vm.run.failed)}
            </Text>
          )}
          {vm.run.merged > 0 && (
            <Text size="caption" color={C.text}>
              {t(lang, 'run_merged', vm.run.merged)}
            </Text>
          )}
          {vm.run.approved > 0 && (
            <Text size="caption" color={C.text}>
              {t(lang, 'run_approved', vm.run.approved)}
            </Text>
          )}
        </Box>
        {vm.failedLines.length > 0 && (
          <Box flexDirection="column" gap={SPACE.line}>
            {vm.failedLines.map(x => (
              <Text key={`failed:${x.key}`} size="caption" color={C.error}>
                {`${x.where}: ${x.why}`}
              </Text>
            ))}
          </Box>
        )}
        {vm.run.retry.length > 0 && (
          <Box flexDirection="row">
            <Button
              key="retry"
              variant="secondary"
              dimColor={isWorking('retry')}
              onPress={isWorking('retry') ? noop : work('retry', () => validate($, vm.run!.retry, lang, prompts.validate))}
            >
              {isWorking('retry') ? t(lang, 'cd_queuing', vm.run.retry.length) : t(lang, 'run_retry', vm.run.retry.length)}
            </Button>
          </Box>
        )}
      </Box>
    )
    const agents = (working.length > 0 || runLine || doneLine) && (
      <Box key="agents" flexDirection="column" gap={SPACE.row}>
        {working.length > 0 && (
          <Text size="caption" weight="semibold" color={C.text}>
            {t(lang, 'ag_title', working.length)}
          </Text>
        )}
        {working.map(a => {
          const p = progressOf(a.id)
          return (
            <Box key={`agent:${a.id}`} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline} rowGap={SPACE.row}>
              {icon(I.spin, '⠿', 14, 14, t(lang, `ag_${a.status}`))}
              <Text size="caption" color={C.text}>
                {a.description}
              </Text>
              {p && (
                <Text size="caption" color={C.text}>
                  {t(lang, 'ag_progress', p.done, p.total)}
                </Text>
              )}
              {p && p.failed > 0 && (
                <Text size="caption" color={C.error}>
                  {`· ${t(lang, 'run_failed', p.failed)}`}
                </Text>
              )}
              <Text size="caption" color={C.subtle}>
                {t(lang, `ag_${a.status}`)}
              </Text>
              <Button
                key={`stop:${a.id}`}
                variant="secondary"
                dimColor={isWorking(`stop:${a.id}`)}
                onPress={isWorking(`stop:${a.id}`) ? noop : work(`stop:${a.id}`, () => stopAgent($, a.id))}
              >
                {isWorking(`stop:${a.id}`) ? t(lang, 'ag_stopping') : t(lang, 'ag_stop')}
              </Button>
            </Box>
          )
        })}
        {runLine}
        {doneLine}
      </Box>
    )

    // A dashboard card: what stands, in a number and a line, and the one flow it starts. Its button
    // stays while a run goes, dimmed, so nothing moves.
    type Action = {
      key: string
      label: string
      onPress: () => void
      primary?: boolean
      isOff?: boolean
      // what it says while its press runs
      working?: string
    }
    const card = (key: string, title: string, body: string, btn?: Action) => (
      <Box key={key} flexDirection="column" flexGrow={1} flexShrink={1} width="48%" minWidth={28} {...PANEL}>
        <Box flexDirection="column" gap={SPACE.line}>
          <Text weight="semibold" color={C.text}>
            {title}
          </Text>
          <Text size="caption" color={C.subtle}>
            {body}
          </Text>
        </Box>
        {btn && (
          <Box flexDirection="row">
            <Button
              key={btn.key}
              variant={btn.primary && !btn.isOff && !isWorking(btn.key) ? 'primary' : 'secondary'}
              dimColor={btn.isOff || isWorking(btn.key)}
              onPress={btn.isOff || isWorking(btn.key) ? noop : btn.onPress}
            >
              {isWorking(btn.key) && btn.working ? btn.working : btn.label}
            </Button>
          </Box>
        )}
      </Box>
    )
    type Group = (typeof vm.groups)[number]
    const worst = [...vm.groups].sort((a, b) => b.issues - a.issues)[0]
    const cards = (
      <Box key="cards" flexDirection="row" flexWrap="wrap" gap={SPACE.block}>
        {card(
          'card:clean',
          t(lang, 'cd_clean_title', vm.clean.length),
          vm.clean.length ? t(lang, 'cd_clean_body') : t(lang, 'cd_clean_none'),
          vm.clean.length || busy
            ? {
                key: 'validate-clean',
                label: runs(vm.clean) ? t(lang, 'cd_validating') : t(lang, 'in_validate_n', vm.clean.length),
                primary: true,
                isOff: busy,
                working: t(lang, 'cd_queuing', vm.clean.length),
                onPress: work('validate-clean', () => validate($, vm.clean, lang, prompts.validate)),
              }
            : undefined,
        )}
        {card(
          'card:mine',
          t(lang, 'cd_mine_title', vm.rework.length),
          isFixing ? t(lang, 'cd_mine_fixing') : lastFix ? lastFix : vm.rework.length ? t(lang, 'cd_mine_body') : t(lang, 'cd_mine_none'),
          vm.rework.length || isFixing
            ? {
                key: 'fix',
                label: isFixing ? t(lang, 'cd_fixing') : t(lang, 'fix_n', vm.rework.length),
                isOff: isFixing,
                working: t(lang, 'cd_starting_fix'),
                onPress: work('fix', () => fix($, vm.rework, lang, prompts.fix)),
              }
            : undefined,
        )}
        {card(
          'card:issues',
          t(lang, 'cd_issues_title', vm.issues),
          vm.issues ? t(lang, 'cd_issues_body') : t(lang, 'cd_issues_none'),
          vm.issues && worst?.issues
            ? {
                key: 'open-issues',
                label: t(lang, 'cd_issues_open', clip(worst.name), worst.issues),
                onPress: () => goTo(worst.repo),
              }
            : undefined,
        )}
        {card(
          'card:auto',
          t(lang, 'auto_label'),
          autoSays(),
          vm.auto.mode === 'off'
            ? {
                key: 'auto-on',
                label: t(lang, 'cd_auto_on'),
                working: t(lang, 'auto_turning_on'),
                onPress: work('auto-on', () => setAuto('mine', vm.auto.every)),
              }
            : {
                key: 'auto-off',
                label: t(lang, 'cd_auto_off'),
                working: t(lang, 'auto_turning_off'),
                onPress: work('auto-off', () => setAuto('off', vm.auto.every)),
              },
        )}
      </Box>
    )

    const sectionTitle = (title: string) => (
      <Text weight="semibold" color={C.text}>
        {title}
      </Text>
    )
    // What waits on the person, oldest first: the first thing the dashboard answers. The title opens
    // the PR; sending it to the AI comes after, from the cards and the repo pages.
    const NEEDS_SHOWN = 6
    const needs = (
      <Box key="needs" flexDirection="column" gap={SPACE.block}>
        {sectionTitle(t(lang, 'nd_title', vm.needs.length))}
        {vm.needs.length === 0 && (
          <Text size="caption" color={C.subtle}>
            {t(lang, 'nd_none')}
          </Text>
        )}
        {vm.needs.slice(0, NEEDS_SHOWN).map(x => (
          <Box key={`need:${x.key}`} flexDirection="column" gap={SPACE.line}>
            <ui.Link href={x.url}>{x.title}</ui.Link>
            <Text size="caption" color={C.subtle}>
              {x.line}
            </Text>
          </Box>
        ))}
        {vm.needs.length > NEEDS_SHOWN && (
          <Text size="caption" color={C.subtle}>
            {t(lang, 'nd_more', vm.needs.length - NEEDS_SHOWN)}
          </Text>
        )}
      </Box>
    )
    // The repos, as a list: each its name in semibold with its counts under it, always in one order
    // (PRs, to validate, with issues, zeros left out), and on the right the button that opens its
    // page. Its words never change during a run, so the target stays still; only the counts move.
    const repoRows = (
      <Box key="repos" flexDirection="column" gap={SPACE.block}>
        {sectionTitle(t(lang, 'rl_title'))}
        <Box flexDirection="column" gap={SPACE.block}>
          {vm.groups.map(g => (
            <Box key={`repo-row:${g.repo}`} flexDirection="row" alignItems="center" gap={SPACE.inline}>
              <Box flexDirection="column" gap={SPACE.line} flexGrow={1} flexShrink={1} minWidth={0}>
                <Text weight="semibold" color={C.text} wrap="truncate">
                  {g.name}
                </Text>
                <Box flexDirection="row" flexWrap="wrap" columnGap={SPACE.inline}>
                  <Text size="caption" color={C.subtle}>
                    {g.rows.length ? t(lang, 'rl_prs', g.rows.length) : t(lang, 'rl_none')}
                  </Text>
                  {g.go.length > 0 && (
                    <Text size="caption" color={C.subtle}>
                      {t(lang, 'rl_go', g.go.length)}
                    </Text>
                  )}
                  {g.issues > 0 && (
                    <Text size="caption" color={C.warning}>
                      {t(lang, 'rl_issues', g.issues)}
                    </Text>
                  )}
                  {g.failed > 0 && (
                    <Text size="caption" color={C.error}>
                      {t(lang, 'run_failed', g.failed)}
                    </Text>
                  )}
                </Box>
              </Box>
              <Box flexShrink={0}>
                <Button key={`open:${g.repo}`} variant="secondary" onPress={() => goTo(g.repo)}>
                  {t(lang, 'rl_open', clip(g.name, 16))}
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    )

    // A repo's page: one line per PR, packed to the left so the eye never crosses an empty middle:
    // its box with its number (a button with its shape, so it reads as one and names its PR), its
    // verdict, who opened it, the title, and why the pane left it out. A running line shows Argos's
    // spinner instead of its box. The heading's box takes or leaves the whole repo.
    const VERDICT_W = 4
    // a line's mark in a run, as the view names it
    const MARKS: Record<string, string> = {
      '○': I.queued,
      '⠿': I.spin,
      '✓': I.check,
      '✕': I.cross,
    }
    // Taking the repo brings back what the pane left out too; leaving it hands those back to the
    // pane (they keep their reason) and leaves the rest out by hand.
    const pickRepo = async (g: Group) => {
      const keys = new Set(g.keys)
      const reasons = new Set(g.reasonKeys)
      if (g.isAll) {
        await setOut(list => [...new Set([...list, ...g.keys.filter(k => !reasons.has(k))])])
        await update($, back, list => list.filter(k => !reasons.has(k)))
      } else {
        await setOut(list => list.filter(k => !keys.has(k)))
        await update($, back, list => [...new Set([...list, ...g.reasonKeys])])
      }
    }
    type Row = (typeof vm.rows)[number]
    const toggle = (x: Row) => {
      if (!x.canToggle) return
      if (x.isAuto) void update($, back, list => [...list, x.key])
      else void setOut(list => (list.includes(x.key) ? list.filter(k => k !== x.key) : [...list, x.key]))
    }
    // the boxes' numbers padded to one width with figure spaces, so every box is as wide
    const padNum = (num: string, w: number) => '\u2007'.repeat(Math.max(0, w - num.length)) + num
    const line = (x: Row, numW: number) => (
      <Box key={x.key} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline} rowGap={SPACE.row}>
        {/* the box names its PR and stays through a run, dimmed, so the focus and the column never
            move; a line that cannot be picked here (its author left out in Who, or Argos at work
            on it) keeps it dimmed too, and the line says why */}
        <Button key={`pick:${x.key}`} variant="secondary" dimColor={busy || !x.canToggle || x.isRunning} onPress={busy || !x.canToggle || x.isRunning ? noop : () => toggle(x)}>
          {`${x.isIn ? BOX.on : x.isAuto ? BOX.mixed : BOX.off} ${padNum(x.num, numW)}`}
        </Button>
        {/* the verdict keeps one width, filled or not, so the avatars and titles line up; in a run
            the line's mark takes it */}
        <Box flexDirection="row" alignItems="center" flexShrink={0} width={VERDICT_W}>
          {x.isRunning
            ? icon(I.spin, '⠿', 14, 14, t(lang, 'cd_validating'))
            : busy && x.mark.glyph
              ? icon(MARKS[x.mark.glyph] ?? I.queued, x.mark.glyph, 14, 14)
              : x.verdict && icon(x.verdict.svg!, x.verdict.text, 14, 14, x.verdict.tip)}
          {!x.isRunning && !(busy && x.mark.glyph) && x.verdict?.count && (
            <Text size="caption" weight="semibold" color={x.verdict.color}>
              {x.verdict.count}
            </Text>
          )}
        </Box>
        {icon(x.avatar, x.author.slice(0, 1).toUpperCase(), 16, 16, x.authorTip)}
        {/* two lines, whatever the state, so the row never changes height: the title opens the PR;
            under it its age, then how it stands in words, its colour only repeating them */}
        <Box flexDirection="column" gap={SPACE.line} flexGrow={1} flexShrink={1} width="40%" minWidth={24}>
          <Text size="caption" color={x.isIn || x.isRunning || x.vstate === 'issues' ? C.text : C.subtle}>
            <ui.Link href={x.url}>{x.title}</ui.Link>
          </Text>
          <Box flexDirection="row" flexWrap="wrap" columnGap={SPACE.inline}>
            <Text size="caption" color={C.subtle}>
              {x.age}
            </Text>
            {x.status ? (
              <Text size="caption" color={x.status.color}>
                {x.status.text}
              </Text>
            ) : (
              x.said.map(n => (
                <Text key={n.text} size="caption" color={n.color}>
                  {n.text}
                </Text>
              ))
            )}
          </Box>
        </Box>
      </Box>
    )
    const repoPage = (g: Group) => {
      const going = g.rows.filter(x => x.isIn)
      return frame(
        bar(g.name),
        agents,
        humanErrors.has('human') && (
          <Text key="human-failed" size="caption" color={C.error}>
            {t(lang, 'human_failed', humanErrors.get('human') ?? '')}
          </Text>
        ),
        <Box key="repo-head" flexDirection="column" gap={SPACE.block}>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline} rowGap={SPACE.row}>
            <Button key={`repo:${g.repo}`} variant="secondary" dimColor={busy || !g.keys.length} onPress={busy || !g.keys.length ? noop : () => void pickRepo(g)}>
              {`${BOX[g.mark]} ${t(lang, g.isAll ? 'rh_clear' : 'rh_select')} · ${g.count}`}
            </Button>
            {g.merge && (
              <Text size="caption" color={C.subtle}>
                {t(lang, 'rh_merge')}
              </Text>
            )}
          </Box>
          <Box flexDirection="column" gap={SPACE.row}>
            {g.rows.length === 0 && (
              <Text size="caption" color={C.subtle}>
                {t(lang, 'rl_none')}
              </Text>
            )}
            {g.rows.map(x => line(x, Math.max(...g.rows.map(r => r.num.length))))}
          </Box>
        </Box>,
        <Box key="repo-go" flexDirection="row" flexWrap="wrap" alignItems="center" gap={SPACE.inline}>
          <Button
            key="validate"
            variant={busy || !going.length || isWorking(`validate:${g.repo}`) ? 'secondary' : 'primary'}
            dimColor={busy || !going.length || isWorking(`validate:${g.repo}`)}
            onPress={
              busy || !going.length || isWorking(`validate:${g.repo}`)
                ? noop
                : work(`validate:${g.repo}`, () =>
                    validate(
                      $,
                      going.map(x => x.url),
                      lang,
                      prompts.validate,
                    ),
                  )
            }
          >
            {isWorking(`validate:${g.repo}`)
              ? t(lang, 'cd_queuing', going.length)
              : busy
                ? t(lang, 'cd_validating')
                : going.length
                  ? t(lang, 'in_validate_n', going.length)
                  : t(lang, 'in_validate')}
          </Button>
          <Button
            key="clear"
            variant="secondary"
            dimColor={busy || !going.length}
            onPress={busy || !going.length ? noop : () => void setOut(list => [...new Set([...list, ...going.map(x => x.key)])])}
          >
            {t(lang, 'in_clear', going.length)}
          </Button>
        </Box>,
      )
    }

    // Settings: who goes (presets leave whole kinds out, new bots too, and reset the people; an
    // author's box takes or leaves that person; authors left out outlive the session), the
    // automatic schedule, and per repo its auto-merge (two taps to turn on, the second naming what
    // it will do on GitHub; one to turn off) and its own validation prompt.
    const setIgnored = async (fn: (list: string[]) => string[]) => {
      let next: string[] = []
      await update($, ignored, list => (next = fn(list)))
      await $.store.set('ignored', next).catch(() => {})
      if ((await $.state.get(DEMO)).value) return
      const failed = await writeHuman($, humanUrls(last, left, next))
      if (failed) $.ui.toast(`Argos: ${t(lang, 'human_failed', failed)}`)
    }
    // an author out with their whole kind comes back alone: the kind turns into its other names
    const toggleAuthor = (a: (typeof vm.authors)[number]) =>
      setIgnored(list =>
        list.includes(a.name)
          ? list.filter(x => x !== a.name)
          : list.includes(`kind:${a.kind}`)
            ? [...list.filter(x => x !== `kind:${a.kind}`), ...vm.authors.filter(b => b.kind === a.kind && b.name !== a.name).map(b => b.name)]
            : [...list, a.name],
      )
    // Turning auto-merge on acts on GitHub: the confirmation stays open until repos.mjs says it is
    // done, and says why when it is not.
    const setMerge = async (repo: string, isOn: boolean) => {
      const r = await repoCmd('merge', repo, isOn ? 'on' : 'off')
      if (r && r.exitCode) {
        mergeErrors.set(repo, (r.stderr ?? '').trim())
        return void $.ui.toast(`Argos: ${t(lang, isOn ? 'mg_failed_off' : 'mg_failed_on')}`)
      }
      mergeErrors.delete(repo)
      await update($, confirmMerge, () => null)
    }
    // what the person typed in a prompt field, kept outside the drawing so typing redraws nothing
    const drafts = promptDrafts
    const savePrompt = async (repo: string, text: string) => {
      const r = await repoCmd('prompt', repo, text.trim())
      promptSaved.set(repo, !r?.exitCode)
      if (r?.exitCode) {
        promptErrors.set(repo, (r.stderr ?? '').trim() || t(lang, 'rp_cmd_failed'))
        $.ui.toast(`Argos: ${t(lang, 'rp_failed', promptErrors.get(repo) ?? '')}`)
      } else drafts.delete(repo), promptErrors.delete(repo)
    }
    const section = (key: string, title: string, ...body: any[]) => (
      <Box key={key} flexDirection="column" gap={SPACE.block}>
        {sectionTitle(title)}
        {body.filter(Boolean)}
      </Box>
    )
    const whoSection = section(
      'who',
      vm.who.label,
      <Box key="presets" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline} rowGap={SPACE.row}>
        <Text size="caption" color={C.subtle}>
          {t(lang, 'who_set')}
        </Text>
        {vm.who.presets.map(p => (
          <Button key={`set:${p.id}`} variant="secondary" onPress={() => void setIgnored(() => p.kinds.map(k => `kind:${k}`))}>
            {p.isOn ? `✓ ${p.label}` : p.label}
          </Button>
        ))}
      </Box>,
      <Box key="authors" flexDirection="row" flexWrap="wrap" alignItems="center" rowGap={SPACE.row} columnGap={SPACE.block}>
        {vm.authors.map(a => (
          <Box key={`author:${a.name}`} flexDirection="row" alignItems="center" gap={SPACE.row}>
            {icon(a.svg, a.name.slice(0, 1).toUpperCase(), 16, 16, a.tip)}
            <Button key={`who:${a.name}`} variant="secondary" onPress={once(`who:${a.name}`, () => toggleAuthor(a))}>
              {`${a.isOut ? BOX.off : BOX.on} ${clip(a.name)} ${a.count}`}
            </Button>
          </Box>
        ))}
      </Box>,
    )
    // Automatic mode: what goes and how often, each Select with its label, then when the next round
    // looks and what the last one did.
    const autoSection = section(
      'auto',
      t(lang, 'auto_label'),
      <Box key="auto-controls" flexDirection="column" gap={SPACE.row}>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.block} rowGap={SPACE.row}>
          {Select && (
            <Select
              key="auto-mode"
              label={t(lang, 'auto_what')}
              options={['off', 'mine', 'all'].map(m => ({
                value: m,
                label: t(lang, `auto_mode_${m}`),
              }))}
              value={vm.auto.mode}
              onSelect={(m: string) => work('auto-schedule', () => setAuto(m, vm.auto.every))()}
            />
          )}
          {Select && vm.auto.mode !== 'off' && (
            <Select
              key="auto-every"
              label={t(lang, 'auto_how_often')}
              options={[15, 30, 60].map(n => ({
                value: String(n),
                label: t(lang, 'auto_every', n),
              }))}
              value={String(vm.auto.every)}
              onSelect={(n: string) => work('auto-schedule', () => setAuto(vm.auto.mode, Number(n)))()}
            />
          )}
        </Box>
        <Text size="caption" color={autoErrors.has('auto') ? C.error : C.subtle}>
          {isWorking('auto-schedule') ? t(lang, 'auto_saving') : autoSays()}
        </Text>
      </Box>,
    )
    // a repo's settings, in one panel: its auto-merge, then its own validation prompt
    const repoSettings = (g: Group) => (
      <Box key={`repo-settings:${g.repo}`} flexDirection="column" {...PANEL}>
        <Text weight="semibold" color={C.text}>
          {g.repo}
        </Text>
        <Box flexDirection="column" gap={SPACE.row}>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={SPACE.inline}>
            <Text size="caption" weight="semibold" color={C.text}>
              {t(lang, g.merge ? 'mg_on' : 'mg_off')}
            </Text>
            <Button
              key={`merge:${g.repo}`}
              variant="secondary"
              dimColor={confirming === g.repo || isWorking(`merge:${g.repo}`)}
              onPress={
                confirming === g.repo || isWorking(`merge:${g.repo}`)
                  ? noop
                  : g.merge
                    ? work(`merge:${g.repo}`, () => setMerge(g.repo, false))
                    : () => void update($, confirmMerge, () => g.repo).then(() => focus(`merge-yes:${g.repo}`))
              }
            >
              {isWorking(`merge:${g.repo}`) ? t(lang, g.merge ? 'mg_turning_off' : 'mg_turning_on') : t(lang, g.merge ? 'mg_turn_off' : 'mg_turn_on', clip(g.name, 16))}
            </Button>
          </Box>
          {g.merge && (
            <Text size="caption" color={C.subtle}>
              {t(lang, 'mg_on_note')}
            </Text>
          )}
          {mergeErrors.get(g.repo) !== undefined && (
            <Box flexDirection="column" gap={SPACE.line}>
              {mergeErrors.get(g.repo) && (
                <Text size="caption" color={C.error}>
                  {mergeErrors.get(g.repo)}
                </Text>
              )}
              <Text size="caption" color={C.text}>
                {t(lang, g.merge ? 'mg_failed_on' : 'mg_failed_off')}
              </Text>
            </Box>
          )}
        </Box>
        {confirming === g.repo && (
          // an action on GitHub: the confirmation opens under its button, in the warning look
          <Box flexDirection="column" gap={SPACE.block} padding="sm" borderStyle="round" borderColor={rgba(HEX.warning, EDGE)} backgroundColor={rgba(HEX.warning, TINT)}>
            <Box flexDirection="column" gap={SPACE.line}>
              <Text weight="semibold" color={C.text}>
                {t(lang, 'mg_confirm_title', g.repo)}
              </Text>
              <Text size="caption" color={C.text}>
                {t(lang, 'mg_confirm_body', last?.me ?? '')}
              </Text>
            </Box>
            <Box flexDirection="column" gap={SPACE.line}>
              {(t(lang, 'mg_rules') as string[]).map((rule, i) => (
                <Box key={`rule:${i}`} flexDirection="row">
                  <Box flexShrink={0} width={2}>
                    <Text size="caption" color={C.text}>
                      •
                    </Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text size="caption" color={C.text}>
                      {rule}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Box>
            <Text size="caption" color={C.subtle}>
              {t(lang, 'mg_method')}
            </Text>
            <Box flexDirection="row" flexWrap="wrap" gap={SPACE.inline}>
              <Button
                key={`merge-yes:${g.repo}`}
                variant={isWorking(`merge:${g.repo}`) ? 'secondary' : 'primary'}
                dimColor={isWorking(`merge:${g.repo}`)}
                onPress={isWorking(`merge:${g.repo}`) ? noop : work(`merge:${g.repo}`, () => setMerge(g.repo, true))}
              >
                {isWorking(`merge:${g.repo}`) ? t(lang, 'mg_turning_on') : t(lang, 'mg_yes', clip(g.name))}
              </Button>
              <Button
                key={`merge-cancel:${g.repo}`}
                variant="secondary"
                dimColor={isWorking(`merge:${g.repo}`)}
                onPress={isWorking(`merge:${g.repo}`) ? noop : () => void update($, confirmMerge, () => null).then(() => focus(`merge:${g.repo}`))}
              >
                {t(lang, 'cancel')}
              </Button>
            </Box>
          </Box>
        )}
        <Box flexDirection="column" gap={SPACE.row}>
          {Input && (
            <Input
              key={`prompt:${g.repo}`}
              label={t(lang, 'rp_label', g.name)}
              placeholder={t(lang, 'rp_placeholder')}
              rows={3}
              value={drafts.get(g.repo) ?? g.prompt}
              submitLabel={t(lang, 'rp_save', clip(g.name, 16))}
              onInput={(text: string) => void (drafts.set(g.repo, text), promptSaved.delete(g.repo))}
              onSubmit={(text: string) => work(`prompt:${g.repo}`, () => savePrompt(g.repo, text))()}
            />
          )}
          <Text size="caption" color={C.subtle}>
            {t(lang, 'rp_note', g.name)}
          </Text>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={SPACE.inline}>
            <Button
              key={`prompt-save:${g.repo}`}
              variant="secondary"
              dimColor={isWorking(`prompt:${g.repo}`)}
              onPress={isWorking(`prompt:${g.repo}`) ? noop : work(`prompt:${g.repo}`, () => savePrompt(g.repo, drafts.get(g.repo) ?? g.prompt))}
            >
              {isWorking(`prompt:${g.repo}`) ? t(lang, 'rp_saving') : t(lang, 'rp_save', clip(g.name, 16))}
            </Button>
            {promptSaved.has(g.repo) ? (
              <Text size="caption" color={promptSaved.get(g.repo) ? C.success : C.error}>
                {promptSaved.get(g.repo) ? t(lang, 'rp_saved') : t(lang, 'rp_failed', promptErrors.get(g.repo) ?? '')}
              </Text>
            ) : (
              drafts.has(g.repo) &&
              drafts.get(g.repo) !== g.prompt && (
                <Text size="caption" color={C.warning}>
                  {t(lang, 'rp_unsaved')}
                </Text>
              )
            )}
          </Box>
        </Box>
        <Box flexDirection="row">
          <Button
            key={`disconnect:${g.repo}`}
            variant="secondary"
            dimColor={isWorking(`disconnect:${g.repo}`)}
            onPress={
              isWorking(`disconnect:${g.repo}`)
                ? noop
                : confirmDisconnect.has(g.repo)
                  ? work(`disconnect:${g.repo}`, async () => {
                      confirmDisconnect.delete(g.repo)
                      await repoCmd('remove', g.repo)
                      await tick($, options, true)
                    })
                  : work(`ask:${g.repo}`, async () => void confirmDisconnect.add(g.repo))
            }
          >
            {isWorking(`disconnect:${g.repo}`) ? t(lang, 'rp_disconnecting') : t(lang, confirmDisconnect.has(g.repo) ? 'rp_disconnect_sure' : 'rp_disconnect', clip(g.name, 16))}
          </Button>
        </Box>
      </Box>
    )
    const settingsPage = () =>
      frame(
        bar(t(lang, 'settings')),
        whoSection,
        autoSection,
        section('repo-settings', t(lang, 'rl_title'), ...vm.groups.map(repoSettings)),
        <Text key="prompts-note" size="caption" color={C.subtle}>
          {t(lang, 'se_prompts')}
        </Text>,
        <Box key="setup-again" flexDirection="row">
          <Button key="setup-again" variant="secondary" onPress={() => void (goTo('setup'), checkSetup($, undefined, lang))}>
            {t(lang, 'se_setup')}
          </Button>
        </Box>,
      )

    const opened = vm.groups.find(g => g.repo === where)
    if (where === 'settings') return settingsPage()
    if (opened) return repoPage(opened)
    return frame(head(true), failedBanner, needs, agents, cards, repoRows)
  })
}
