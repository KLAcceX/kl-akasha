// Argos mod: the peacock's eyes inside Claude. A timer runs one Argos round over the connected
// repos, and /argos opens the pane, built to take PR review off the person's back: every open PR
// is one line, all of them go to validation unless the person leaves some out (an author with one
// tap, a repo or a line), and one button validates the rest in the background, the verdicts filling in
// on the lines. Words and numbers come from toViewModel (view.ts); colours and icons from look.ts.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../scripts/i18n.mjs'
import { DEMO_ROUND, DEMO_VERDICTS } from './demo-round'
import { C, HEX, HOVER, I, LOGO, PANEL, SPACE, STARS, TINT, rgba, titled } from './look'
import { UI, authorOf, kindOf, outOf, runOf, toViewModel, verdictOf } from './view'
import type { RepoCfg, Round, Verdicts } from '../types'

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
const round = atom(ROUND, null)
const isRunning = atom(RUNNING, false)
// PRs the person left out by hand, and PRs left out by the pane that the person brought back
const out = atom({ plugin: 'argos', key: 'out' } as const, UI.out)
const back = atom({ plugin: 'argos', key: 'back' } as const, UI.back)
// authors left out everywhere, kept across sessions in $.store
// update bots stay out of validation until the person lets them in (Who, in Settings)
const NO_BOTS = ['kind:bot']
const ignored = atom(IGNORED, NO_BOTS)
const authorsOpen = atom({ plugin: 'argos', key: 'authorsOpen' } as const, false)
// what verdicts.mjs last wrote: the AI's validations, read by the lines
const verdicts = atom(VERDICTS, null)
// the connected repos as repos.json keeps them (auto-merge, prompt), and which repo's Settings
// fold is open, or asking to confirm auto-merge
const repos = atom(REPOS, [] as RepoCfg[])
const page = atom({ plugin: 'argos', key: 'page' } as const, 'home')
// the presses still at work (Turning on…, Saving…), so their buttons say so
const pending = atom({ plugin: 'argos', key: 'pending' } as const, [] as string[])
const confirmMerge = atom({ plugin: 'argos', key: 'confirmMerge' } as const, null as string | null)
const agentRuns = atom(AGENT_RUNS, {} as Record<string, string[]>)
const fixRuns = atom(FIX_RUNS, {} as Record<string, string[]>)
// what was typed in each repo's prompt field, by repo; outside the atoms so typing redraws nothing
const promptDrafts = new Map<string, string>()
// how each repo's last prompt save went (true saved, false failed), and why turning auto-merge on
// failed, by repo; shown until the next edit or try
const promptSaved = new Map<string, boolean>()
const mergeErrors = new Map<string, string>()
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
// PRs by the local clone their agent runs in: an agent started in a repo's clone loads that
// repo's CLAUDE.md and rules as a session opened there would; a repo without one runs in the
// session's folder.
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
  if (!urls.length) return
  await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'queue', ...urls])
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
      const lines = [...ask, `Scripts: ${scripts}`, ...[...rules].map(([repo, text]) => t(lang, 'b_rules', repo, text)), ...part.map(u => `- ${u}`)]
      const { agentId } = await $.agent.spawn({
        prompt: lines.join('\n'),
        description: `Argos validate · ${part.length} PRs`,
        ...(cwd && { cwd }),
      })
      if (agentId) await update($, agentRuns, runs => ({ ...runs, [agentId]: part }))
    }
}

// Fixes the person's own PRs in the background: one agent per repo, in its local clone, takes
// them one at a time (they share the clone), turns each review into commits and replies, pushes and answers on its own, and
// skips a PR it cannot fix safely (no clone, uncommitted work, conflicts). It ends with one line
// the pane shows as a toast. The person's own prompt replaces Argos's job only in how to fix.
async function fix($: any, urls: string[], lang: string, prompt: Prompt) {
  if (!urls.length) return
  const list = await loadRepos($)
  const ask = compose(prompt, [t(lang, 'b_fix'), `Job: ${$.plugin.root}/references/mine.md (Job 2, in the background)`], text => [text, t(lang, 'b_fix_rules')])
  for (const [cwd, group] of byClone(list, urls)) {
    const lines = [...ask, `Scripts: ${$.plugin.root}/scripts`, ...group.map(u => (cwd ? `- ${u} (clone: ${cwd})` : `- ${u}`))]
    const { agentId } = await $.agent.spawn({
      prompt: lines.join('\n'),
      description: `Argos fix · ${group.length} PRs`,
      ...(cwd && { cwd }),
    })
    if (agentId) await update($, fixRuns, runs => ({ ...runs, [agentId]: group }))
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
  const all = [...(r.pending ?? []), ...(r.mine ?? []), ...(r.others ?? [])].filter(p => !skip.has(authorOf(p)) && !skip.has(`kind:${kindOf(p)}`))
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
async function addRepo($: any) {
  const { text } = await $.prompt.read()
  if (!text.includes('/argos repos add')) await $.prompt.fill({ text: '/argos repos add ', mode: 'replace' })
}

async function openPane($: any) {
  await load($)
  await loadVerdicts($)
  await loadRepos($)
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
    const argv = ['node', `${$.plugin.root}/scripts/round.mjs`, ...qualifiers, '--lang', lang, '--json']
    if (account) argv.push('--account', account)
    await $.process.run(argv, { timeoutMs: 120_000 })
    const fresh = await load($)
    if (fresh?.notify) $.ui.toast(fresh.notify)
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

  // A fixing agent's last line ("Fixed 2 · skipped 1: uncommitted work") comes back as a toast.
  on('turn.complete', async ($, e, next) => {
    const runs = ((await $.state.get(FIX_RUNS)).value ?? {}) as Record<string, string[]>
    if (e.agentId && runs[e.agentId]) {
      const { [e.agentId]: _, ...rest } = runs
      await $.state.set(FIX_RUNS, rest)
      const last = e.answer.trim().split('\n').at(-1)?.trim()
      $.ui.toast(`Argos: ${last || t(config(options).lang, 'fix_ended')}`)
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
    if (args.length && !['repos', 'demo'].includes(args[0])) return next(e)
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
      await update($, out, () => [])
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
    const [running, last, left, brought, judged, authorsOut, isOpen, repoList, where, confirming, fixing, validating, busyKeys] = await Promise.all([
      read($, isRunning),
      read($, round),
      read($, out),
      read($, back),
      read($, verdicts),
      read($, ignored),
      read($, authorsOpen),
      read($, repos),
      read($, page),
      read($, confirmMerge),
      read($, fixRuns),
      read($, agentRuns),
      read($, pending),
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
      <Box key="head" flexDirection="column" gap={SPACE.line}>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline} rowGap={SPACE.row}>
          {hasSvg && <ui.Svg source={LOGO} alt="Argos" width={16} height={16} />}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text size="heading" weight="semibold" color={C.text}>
              {t(lang, 'in_title')}
            </Text>
          </Box>
          {withCheck && (
            <Button key="check" variant="secondary" dimColor={running} onPress={running ? () => undefined : checkNow}>
              {running ? t(lang, 'ui_checking') : t(lang, 'ui_check')}
            </Button>
          )}
          {vm.state === 'ok' && (
            <Button key="settings-page" variant="secondary" onPress={() => void update($, page, () => 'settings')}>
              {t(lang, 'settings')}
            </Button>
          )}
        </Box>
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
        { bg: rgba(HEX.error, TINT + 0.01), border: rgba(HEX.error, 0.35) },
        I.error,
        t(lang, 'in_err_title'),
        vm.error.why,
        vm.error.isAuth ? { label: t(lang, 'in_fix_auth'), onPress: () => void fixAuth() } : { label: t(lang, 'in_retry'), onPress: checkNow },
      )

    // The first check: static placeholders one line tall (a height counts lines), so nothing jumps.
    if (vm.state === 'loading' || vm.state === 'never')
      return frame(
        head(vm.state === 'never'),
        <Box key="skeleton" flexDirection="column" gap={SPACE.row}>
          {['78%', '64%', '72%'].map((w, i) => (
            <Box key={`sk${i}`} height={1} width={w} backgroundColor="rgba(128,128,128,0.18)" />
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
        banner('norepo', { bg: 'rgba(128,128,128,0.05)', border: 'rgba(128,128,128,0.25)' }, I.pr(HEX.grey), t(lang, 'in_norepo_title'), t(lang, 'in_norepo_body'), {
          label: t(lang, 'in_setup'),
          onPress: () => void addRepo($),
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
    const goTo = (to: string) => void update($, page, () => to)
    const repoCmd = async (...args: string[]) => {
      const r = await $.process.run(['node', `${$.plugin.root}/scripts/repos.mjs`, ...args, '--lang', lang])
      await loadRepos($)
      return r as { exitCode?: number; stderr?: string } | undefined
    }
    const setAuto = async (mode: string, every: number) => {
      await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'auto', mode, '--every', String(every)])
      await loadVerdicts($)
    }
    const busy = Boolean(vm.run?.isRunning)
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
    // what the run holds: a Validate whose PRs are in it says Validating…, the rest only dim
    const inRun = new Set(vm.run?.isRunning ? vm.run.urls : [])
    const runs = (urls: string[]) => urls.some(u => inRun.has(u))
    // a page's path: "Pull requests / billing", the first part the way back to the dashboard
    const bar = (title: string) => (
      <Box key="bar" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={SPACE.inline} rowGap={SPACE.row}>
        <Button key="back" variant="secondary" onPress={() => void (goTo('home'), update($, confirmMerge, () => null))}>
          {t(lang, 'in_title')}
        </Button>
        <Text size="heading" color={C.subtle}>
          /
        </Text>
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
      <Box key="run" flexDirection="row" alignItems="center" gap={SPACE.row}>
        {icon(I.spin, '⠿', 14, 14, t(lang, 'cd_validating'))}
        <Box flexDirection="row" flexWrap="wrap" columnGap={SPACE.row}>
          <Text size="caption" weight="semibold" color={C.text}>
            {t(lang, 'in_validating', vm.run.total - vm.rows.filter(x => x.mark.glyph === '○').length, vm.run.total)}
          </Text>
          {vm.run.failed > 0 && (
            <Text size="caption" weight="semibold" color={C.error}>
              {`· ${t(lang, 'run_failed', vm.run.failed)}`}
            </Text>
          )}
        </Box>
      </Box>
    )
    // what the last run came to, until the next run or check; Retry on its own row under it
    const doneLine = vm.run && !vm.run.isRunning && (
      <Box key="run" flexDirection="column" gap={SPACE.row}>
        <Box flexDirection="row" alignItems="center" gap={SPACE.row}>
          {!vm.run.failed && icon(I.check, '✓', 14, 14)}
          <Box flexDirection="row" flexWrap="wrap" columnGap={SPACE.row}>
            <Text size="caption" weight="semibold" color={C.text}>
              {`${t(lang, 'run_done')} · ${t(lang, 'run_validated', vm.run.validated)}`}
            </Text>
            {vm.run.failed > 0 && (
              <Text size="caption" weight="semibold" color={C.error}>
                {`· ${t(lang, 'run_failed', vm.run.failed)}`}
              </Text>
            )}
            {(vm.run.merged > 0 || vm.run.approved > 0) && (
              <Text size="caption" color={C.text}>
                {['', vm.run.merged ? t(lang, 'run_merged', vm.run.merged) : '', vm.run.approved ? t(lang, 'run_approved', vm.run.approved) : '']
                  .filter((x, i) => !i || x)
                  .join(' · ')}
              </Text>
            )}
          </Box>
        </Box>
        {vm.run.retry.length > 0 && (
          <Box flexDirection="row">
            <Button key="retry" variant="secondary" onPress={once('retry', () => validate($, vm.run!.retry, lang, prompts.validate))}>
              {t(lang, 'run_retry', vm.run.retry.length)}
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
              <Button key={`stop:${a.id}`} variant="secondary" onPress={once(`stop:${a.id}`, () => stopAgent($, a.id))}>
                {t(lang, 'ag_stop')}
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
    }
    const card = (key: string, title: string, body: string, btn?: Action) => (
      <Box key={key} flexDirection="column" flexGrow={1} flexShrink={1} minWidth={24} {...PANEL}>
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
            <Button key={btn.key} variant={btn.primary && !btn.isOff ? 'primary' : 'secondary'} dimColor={btn.isOff} onPress={btn.isOff ? noop : btn.onPress}>
              {btn.label}
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
                onPress: once('validate-clean', () => validate($, vm.clean, lang, prompts.validate)),
              }
            : undefined,
        )}
        {card(
          'card:mine',
          t(lang, 'cd_mine_title', vm.rework.length),
          isFixing ? t(lang, 'cd_mine_fixing') : vm.rework.length ? t(lang, 'cd_mine_body') : t(lang, 'cd_mine_none'),
          vm.rework.length || isFixing
            ? {
                key: 'fix',
                label: isFixing ? t(lang, 'cd_fixing') : t(lang, 'fix_n', vm.rework.length),
                isOff: isFixing,
                onPress: once('fix', () => fix($, vm.rework, lang, prompts.fix)),
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
          vm.auto.line,
          vm.auto.mode === 'off'
            ? {
                key: 'auto-on',
                label: t(lang, 'cd_auto_on'),
                onPress: once('auto', () => setAuto('mine', vm.auto.every)),
              }
            : {
                key: 'auto-off',
                label: t(lang, 'cd_auto_off'),
                onPress: once('auto', () => setAuto('off', vm.auto.every)),
              },
        )}
      </Box>
    )

    // The repos: each its name (opens its page) and Validate on one line, its counts under it.
    const sectionTitle = (title: string) => (
      <Text size="heading" weight="semibold" color={C.text}>
        {title}
      </Text>
    )
    const repoRows = (
      <Box key="repos" flexDirection="column" gap={SPACE.block}>
        {sectionTitle(t(lang, 'rl_title'))}
        <Box flexDirection="column" gap={SPACE.block}>
          {vm.groups.map(g => (
            <Box key={`repo-row:${g.repo}`} flexDirection="column" gap={SPACE.line}>
              <Box flexDirection="row" alignItems="center" gap={SPACE.inline}>
                <Button key={`open:${g.repo}`} variant="secondary" onPress={() => goTo(g.repo)}>
                  {clip(g.name)}
                </Button>
                <Box flexGrow={1} />
                {(g.go.length > 0 || busy) && (
                  <Button
                    key={`validate:${g.repo}`}
                    variant="secondary"
                    dimColor={busy}
                    onPress={busy ? noop : once(`validate:${g.repo}`, () => validate($, g.go, lang, prompts.validate))}
                  >
                    {runs(g.rows.map(x => x.url)) ? t(lang, 'cd_validating') : t(lang, 'in_validate_n', g.go.length)}
                  </Button>
                )}
              </Box>
              <Text size="caption" color={C.subtle}>
                {[
                  t(lang, 'rl_prs', g.rows.length),
                  g.go.length ? t(lang, 'rl_go', g.go.length) : '',
                  g.issues ? t(lang, 'rl_issues', g.issues) : '',
                  g.merge ? t(lang, 'rl_merge') : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
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
        await update($, out, list => [...new Set([...list, ...g.keys.filter(k => !reasons.has(k))])])
        await update($, back, list => list.filter(k => !reasons.has(k)))
      } else {
        await update($, out, list => list.filter(k => !keys.has(k)))
        await update($, back, list => [...new Set([...list, ...g.reasonKeys])])
      }
    }
    type Row = (typeof vm.rows)[number]
    const toggle = (x: Row) => {
      if (!x.canToggle) return
      if (x.isAuto) void update($, back, list => [...list, x.key])
      else void update($, out, list => (list.includes(x.key) ? list.filter(k => k !== x.key) : [...list, x.key]))
    }
    // the boxes' numbers padded to one width with figure spaces, so every box is as wide
    const padNum = (num: string, w: number) => '\u2007'.repeat(Math.max(0, w - num.length)) + num
    const line = (x: Row, numW: number) => (
      <Box key={x.key} flexDirection="row" alignItems="center" gap={SPACE.inline} hover={{ backgroundColor: HOVER }}>
        {/* the box names its PR and stays through a run, dimmed, so the focus and the column never
            move; a line that cannot be picked here (its author left out in Who, or Argos at work
            on it) keeps it dimmed too, and the line says why */}
        <Button key={`pick:${x.key}`} variant="secondary" dimColor={busy || !x.canToggle || x.isRunning} onPress={busy || !x.canToggle || x.isRunning ? noop : () => toggle(x)}>
          {`${x.isIn ? BOX.on : BOX.off} ${padNum(x.num, numW)}`}
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
        {/* one line tall whatever the state: the title gives way, its reason stays */}
        <Box flexDirection="row" alignItems="center" gap={SPACE.row} flexGrow={1} flexShrink={1} minWidth={0}>
          <Box flexShrink={1} minWidth={0}>
            <Text size="caption" color={x.isIn || x.isRunning ? C.text : C.subtle} wrap="truncate">
              {x.title}
            </Text>
          </Box>
          {/* in the last run, how it ended: the word first, its colour only repeats it */}
          {x.status ? (
            <Box flexShrink={0}>
              <Text size="caption" color={x.status.color}>
                {`· ${x.status.text}`}
              </Text>
            </Box>
          ) : (
            (x.why || x.mergeNote) && (
              <Box flexShrink={0}>
                <Text size="caption" color={C.subtle}>
                  {`· ${[x.why, x.mergeNote].filter(Boolean).join(' · ')}`}
                </Text>
              </Box>
            )
          )}
        </Box>
      </Box>
    )
    const repoPage = (g: Group) => {
      const going = g.rows.filter(x => x.isIn)
      return frame(
        bar(g.name),
        agents,
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
            {g.rows.map(x => line(x, Math.max(...g.rows.map(r => r.num.length))))}
          </Box>
        </Box>,
        <Box key="repo-go" flexDirection="row" flexWrap="wrap" alignItems="center" gap={SPACE.inline}>
          <Button
            key="validate"
            variant="primary"
            dimColor={busy || !going.length}
            onPress={
              busy || !going.length
                ? noop
                : once(`validate:${g.repo}`, () =>
                    validate(
                      $,
                      going.map(x => x.url),
                      lang,
                      prompts.validate,
                    ),
                  )
            }
          >
            {busy ? t(lang, 'cd_validating') : going.length ? t(lang, 'in_validate_n', going.length) : t(lang, 'in_validate')}
          </Button>
          <Button
            key="clear"
            variant="secondary"
            dimColor={busy || !going.length}
            onPress={busy || !going.length ? noop : () => void update($, out, list => [...new Set([...list, ...going.map(x => x.key)])])}
          >
            {t(lang, 'in_clear')}
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
      if (r && r.exitCode) return void mergeErrors.set(repo, (r.stderr ?? '').trim() || t(lang, 'mg_failed'))
      mergeErrors.delete(repo)
      await update($, confirmMerge, () => null)
    }
    // what the person typed in a prompt field, kept outside the drawing so typing redraws nothing
    const drafts = promptDrafts
    const savePrompt = async (repo: string, text: string) => {
      const r = await repoCmd('prompt', repo, text.trim())
      promptSaved.set(repo, !r?.exitCode)
      if (!r?.exitCode) drafts.delete(repo)
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
            <Box flexDirection="row" alignItems="center" gap={SPACE.inline}>
              <Text size="caption" color={C.subtle}>
                {t(lang, 'auto_what')}
              </Text>
              <Select
                key="auto-mode"
                label={t(lang, 'auto_what')}
                options={['off', 'mine', 'all'].map(m => ({
                  value: m,
                  label: t(lang, `auto_mode_${m}`),
                }))}
                value={vm.auto.mode}
                onSelect={(m: string) => void setAuto(m, vm.auto.every)}
              />
            </Box>
          )}
          {Select && vm.auto.mode !== 'off' && (
            <Box flexDirection="row" alignItems="center" gap={SPACE.inline}>
              <Text size="caption" color={C.subtle}>
                {t(lang, 'auto_how_often')}
              </Text>
              <Select
                key="auto-every"
                label={t(lang, 'auto_how_often')}
                options={[15, 30, 60].map(n => ({
                  value: String(n),
                  label: t(lang, 'auto_every', n),
                }))}
                value={String(vm.auto.every)}
                onSelect={(n: string) => void setAuto(vm.auto.mode, Number(n))}
              />
            </Box>
          )}
        </Box>
        <Text size="caption" color={C.subtle}>
          {vm.auto.line}
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
                    : () => void update($, confirmMerge, () => g.repo)
              }
            >
              {t(lang, g.merge ? 'mg_turn_off' : 'mg_turn_on')}
            </Button>
          </Box>
          <Text size="caption" color={C.subtle}>
            {g.merge ? t(lang, 'mg_on_note') : t(lang, 'mg_off_note', g.name)}
          </Text>
        </Box>
        {confirming === g.repo && (
          // an action on GitHub: the confirmation opens under its button, in the warning look
          <Box flexDirection="column" gap={SPACE.block} padding="sm" borderStyle="round" borderColor={rgba(HEX.warning, 0.35)} backgroundColor={rgba(HEX.warning, TINT)}>
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
            {mergeErrors.get(g.repo) && (
              <Text size="caption" color={C.error}>
                {mergeErrors.get(g.repo)}
              </Text>
            )}
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
                onPress={isWorking(`merge:${g.repo}`) ? noop : () => void update($, confirmMerge, () => null)}
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
              submitLabel={t(lang, 'rp_save')}
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
              {isWorking(`prompt:${g.repo}`) ? t(lang, 'rp_saving') : t(lang, 'rp_save')}
            </Button>
            {promptSaved.has(g.repo) ? (
              <Text size="caption" color={promptSaved.get(g.repo) ? C.success : C.error}>
                {t(lang, promptSaved.get(g.repo) ? 'rp_saved' : 'rp_failed')}
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
      </Box>
    )
    const settingsPage = () =>
      frame(
        bar(t(lang, 'settings')),
        whoSection,
        autoSection,
        section(
          'repo-settings',
          t(lang, 'rl_title'),
          <Text key="rp-base" size="caption" color={C.subtle}>
            {t(lang, prompts.validate.mode === 'mine' && prompts.validate.text ? 'rp_base_mine' : 'rp_base')}
          </Text>,
          ...vm.groups.map(repoSettings),
        ),
        <Text key="prompts-note" size="caption" color={C.subtle}>
          {t(lang, 'se_prompts')}
        </Text>,
      )

    const opened = vm.groups.find(g => g.repo === where)
    if (where === 'settings') return settingsPage()
    if (opened) return repoPage(opened)
    return frame(head(true), failedBanner, agents, cards, repoRows)
  })
}
