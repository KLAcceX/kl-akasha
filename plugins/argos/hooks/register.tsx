// Argos mod: the peacock's eyes inside Claude. A timer runs one Argos round over the connected
// repos, and /argos opens the pane, built to take PR review off the person's back: every open PR
// is one line, all of them go to validation unless the person leaves some out (an author with one
// tap, a repo or a line), and one button validates the rest in the background, the verdicts filling in
// on the lines. Words and numbers come from toViewModel (view.ts); colours and icons from look.ts.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../scripts/i18n.mjs'
import { DEMO_ROUND, DEMO_VERDICTS } from './demo-round'
import { C, HEX, HOVER, I, LOGO, STARS, TINT, rgba, titled } from './look'
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
const round = atom(ROUND, null)
const isRunning = atom(RUNNING, false)
// PRs the person left out by hand, and PRs left out by the pane that the person brought back
const out = atom({ plugin: 'argos', key: 'out' } as const, UI.out)
const back = atom({ plugin: 'argos', key: 'back' } as const, UI.back)
// authors left out everywhere, kept across sessions in $.store
const ignored = atom(IGNORED, [] as string[])
const authorsOpen = atom({ plugin: 'argos', key: 'authorsOpen' } as const, false)
// what verdicts.mjs last wrote: the AI's validations, read by the lines
const verdicts = atom(VERDICTS, null)
// the connected repos as repos.json keeps them (auto-merge, skills), and which repo's Settings
// fold is open, or asking to confirm auto-merge
const repos = atom(REPOS, [] as RepoCfg[])
const settingsOpen = atom({ plugin: 'argos', key: 'settingsOpen' } as const, null as string | null)
const confirmMerge = atom({ plugin: 'argos', key: 'confirmMerge' } as const, null as string | null)
const agentRuns = atom(AGENT_RUNS, {} as Record<string, string[]>)
// what was typed in each repo's skills field, by repo; outside the atoms so typing redraws nothing
const skillDrafts = new Map<string, string>()

const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 15),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '').split(/\s+/).filter(Boolean),
  lang: String(options.language ?? 'en'),
  skills: String(options.skills ?? '').split(',').map(s => s.trim()).filter(Boolean),
  // minutes a PR may stay "validating" before it counts as failed
  limit: Math.max(2, Number(options.runLimitMinutes) || 10),
  // the prompts behind Validate and Fix: Argos's own, the person's, or both
  prompts: {
    validate: { mode: promptMode(options.validatePromptMode), text: String(options.validatePrompt ?? '').trim() },
    fix: { mode: promptMode(options.fixPromptMode), text: String(options.fixPrompt ?? '').trim() },
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

// The skills a PR's validation reads as references: the plugin's own list, then its repo's.
async function skillsOf($: any, global: string[]) {
  const list = await loadRepos($)
  return (url: string) => {
    const own = list.find(r => url.toLowerCase().includes(`github.com/${r.repo.toLowerCase()}/pull/`))?.skills ?? []
    return [...new Set([...global, ...own])]
  }
}

// Validates PRs in the background: queues them, then hands them to subagents with the validate
// job, ten each so a long list runs side by side; each agent marks a PR started as it reaches it.
// No chat is opened, the verdicts land on the lines as each one finishes. Each PR carries the
// skills its validation reads.
// The person's own prompt replaces Argos's job only in what to look for: the verdicts are still
// recorded with verdicts.mjs, or the pane could not show them.
async function validate($: any, urls: string[], lang: string, skills: string[], prompt: Prompt) {
  if (!urls.length) return
  await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'queue', ...urls])
  await loadVerdicts($)
  const of = await skillsOf($, skills)
  const line = (u: string) => (of(u).length ? `- ${u} (skills: ${of(u).join(', ')})` : `- ${u}`)
  const scripts = `${$.plugin.root}/scripts`
  const ask = compose(prompt, [t(lang, 'b_auto'), `Job: ${$.plugin.root}/references/validate.md`], text => [text, t(lang, 'b_record', scripts)])
  for (let i = 0; i < urls.length; i += 10) {
    const part = urls.slice(i, i + 10)
    const { agentId } = await $.agent.spawn({ prompt: [...ask, `Scripts: ${scripts}`, ...part.map(line)].join('\n'), description: `Argos validate · ${part.length} PRs` })
    if (agentId) await update($, agentRuns, runs => ({ ...runs, [agentId]: part }))
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
async function autoValidate($: any, r: Round | null, lang: string, skills: string[], prompt: Prompt) {
  const v = await loadVerdicts($)
  if (!r || !v || v.auto === 'off') return
  const now = await $.clock.now()
  if (v.lastAuto && now - Date.parse(v.lastAuto.at) < (v.autoEvery ?? 30) * 6e4 - 3e4) return
  const skip = new Set(((await $.state.get(IGNORED)).value as string[] | undefined) ?? [])
  const all = [...(r.pending ?? []), ...(r.mine ?? []), ...(r.others ?? [])].filter(p => !skip.has(authorOf(p)) && !skip.has(`kind:${kindOf(p)}`))
  const mine = (p: (typeof all)[number]) => p.kind === 'mine' || (Boolean(r.me) && p.author === r.me)
  const changed = (p: (typeof all)[number]) => {
    const verdict = verdictOf(p, v.prs[p.url], now)
    return (verdict.state === 'none' || verdict.state === 'stale') && outOf(p, verdict) === null
  }
  const urls = [...new Set(all.filter(p => (v.auto === 'all' || mine(p)) && changed(p)).map(p => p.url))].slice(0, 10)
  await validate($, urls, lang, skills, prompt)
  await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'ran', String(urls.length)])
  await loadVerdicts($)
}

// After verdicts land: auto-merge looks at the passing ones (merge.mjs does nothing for a repo
// that did not opt in), and once a run has nothing left running, one toast says what it came to.
// One sweep at a time: verdicts landing together would otherwise approve the same PR twice.
let sweeping: Promise<unknown> | null = null
async function afterVerdicts($: any, lang: string, limit: number) {
  if ((await $.state.get(DEMO)).value) return
  sweeping ??= $.process.run(['node', `${$.plugin.root}/scripts/merge.mjs`, 'sweep'], { timeoutMs: 120_000 }).catch(() => {}).finally(() => (sweeping = null))
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
  const { minutes, account, qualifiers, lang, skills, limit, prompts } = config(options)
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
    await autoValidate($, fresh, lang, skills, prompts.validate).catch(() => {})
    await afterVerdicts($, lang, limit).catch(() => {})
  } catch (err) {
    // round.mjs writes the real reason (gh auth, a timeout) before it fails; use it when it is
    // this attempt's. Only a run that died before writing (killed at the time limit) gets the
    // wrapper's message. Either way okAt stays the last round that worked.
    const fresh = await load($)
    if (!fresh?.error || Date.parse(fresh.at) < now) {
      const { value } = await $.state.get(ROUND)
      await $.state.set(ROUND, { ...(value ?? {}), at: new Date(now).toISOString(), okAt: value?.okAt ?? null, error: String(err) })
    }
  } finally {
    await $.state.set(RUNNING, false)
  }
}

export const register: Register = (on, options) => {
  const { lang, minutes, account, skills, limit, prompts } = config(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await load($)
    await loadVerdicts($)
    // authors left out outlive the session
    const saved = await $.store.get('ignored').catch(() => undefined)
    if (Array.isArray(saved)) await $.state.set(IGNORED, saved.filter((x): x is string => typeof x === 'string'))
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
      return { deny: 'Stopped by the user from the Argos pane. End now: make no more tool calls and report nothing.' }
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
    // app has no fields, so there the automatic mode and the skills are only said
    const hasSvg = e.surface !== 'terminal'
    const Select = 'Select' in ui ? ui.Select : null
    const Input = 'Input' in ui ? ui.Input : null
    const [running, last, left, brought, judged, authorsOut, isOpen, repoList, openSettings, confirming] = await Promise.all([
      read($, isRunning),
      read($, round),
      read($, out),
      read($, back),
      read($, verdicts),
      read($, ignored),
      read($, authorsOpen),
      read($, repos),
      read($, settingsOpen),
      read($, confirmMerge),
    ])
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
    })
    // the validating agents this mod started that are still at work, as the session lists them
    const working = (await $.agent.list().catch(() => []))
      .filter((a: { spawnedBy?: string; status: string }) => a.spawnedBy === 'argos' && ['pending', 'running', 'waiting'].includes(a.status))
      .map((a: { id: string; description: string; status: string }) => ({ id: a.id, description: a.description, status: a.status }))
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
      <Box key="head" flexDirection="column" gap="xs">
        <Box flexDirection="row" alignItems="center" gap="sm">
          {hasSvg && <ui.Svg source={LOGO} alt="Argos" width={16} height={16} />}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text size="heading" weight="semibold" color={C.text}>
              {t(lang, 'in_title')}
            </Text>
          </Box>
          {withCheck && (
            <Button key="check" plain={true} dimColor={running} onPress={checkNow}>
              {t(lang, 'ui_check')}
            </Button>
          )}
        </Box>
        <Box flexDirection="row" alignItems="center" flexWrap="wrap" columnGap="xs">
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
      </Box>
    )
    // A banner: check failed (red), no repo (neutral).
    const banner = (key: string, look: { bg?: string; border: string }, svg: string, title: string, sub: string, btn?: { label: string; onPress: () => void }) => (
      <Box key={key} flexDirection="row" gap="sm" padding="sm" borderStyle="round" borderColor={look.border} backgroundColor={look.bg}>
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
    const frame = (...body: any[]) => (
      <Box flexDirection="column" gap="md" padding="md">
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
        <Box key="skeleton" flexDirection="column" gap="xs">
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

    // Who goes, in one control: its label says the whole state ("Who: Everyone but bots · rafa
    // out"), and it opens the presets and every author. A preset leaves whole kinds out, new bots
    // too, and resets the people; an author's box takes or leaves that person, and Only keeps just
    // them. Authors left out outlive the session. Nothing moves: their lines stay, unpicked.
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
    // Automatic mode: two native Selects (what goes, how often; the second only while on) and one
    // line saying whether it is on, when the next round looks and what the last one did.
    const setAuto = async (mode: string, every: number) => {
      await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'auto', mode, '--every', String(every)])
      await loadVerdicts($)
    }
    const auto = (
      <Box key="auto" flexDirection="column" gap="xs">
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="sm">
          <Text size="caption" color={C.text}>
            {t(lang, 'auto_label')}
          </Text>
          {Select && (
            <Select
              key="auto-mode"
              options={['off', 'mine', 'all'].map(m => ({ value: m, label: t(lang, `auto_mode_${m}`) }))}
              value={vm.auto.mode}
              onSelect={(m: string) => void setAuto(m, vm.auto.every)}
            />
          )}
          {Select && vm.auto.mode !== 'off' && (
            <Select
              key="auto-every"
              options={[15, 30, 60].map(n => ({ value: String(n), label: t(lang, 'auto_every', n) }))}
              value={String(vm.auto.every)}
              onSelect={(n: string) => void setAuto(vm.auto.mode, Number(n))}
            />
          )}
        </Box>
        <Text size="caption" color={C.subtle}>
          {vm.auto.line}
        </Text>
      </Box>
    )
    const who = (
      <Box key="who-box" flexDirection="column" gap="xs">
        <Box flexDirection="row">
          <Button key="who" plain={true} onPress={() => void update($, authorsOpen, x => !x)}>
            {`${vm.who.label} ${isOpen ? '▾' : '▸'}`}
          </Button>
        </Box>
        {isOpen && (
          <Box flexDirection="column" gap="xs" paddingX="xs">
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="sm">
              <Text size="caption" color={C.subtle}>
                {t(lang, 'who_set')}
              </Text>
              {vm.who.presets.map(p => (
                <Button key={`set:${p.id}`} plain={true} onPress={() => void setIgnored(() => p.kinds.map(k => `kind:${k}`))}>
                  {p.isOn ? `${p.label} ✓` : p.label}
                </Button>
              ))}
            </Box>
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="md">
              {vm.authors.map(a => (
                <Box key={`author:${a.name}`} flexDirection="row" alignItems="center" gap="xs">
                  {icon(a.svg, a.name.slice(0, 1).toUpperCase(), 16, 16, a.tip)}
                  <Button key={`who:${a.name}`} plain={true} onPress={() => void toggleAuthor(a)}>
                    {`${a.isOut ? BOX.off : BOX.on} ${a.name} ${a.count}`}
                  </Button>
                  <Button key={`only:${a.name}`} plain={true} onPress={() => void setIgnored(() => vm.authors.filter(b => b.name !== a.name).map(b => b.name))}>
                    {t(lang, 'in_only')}
                  </Button>
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {auto}
        {vm.mergeLine && (
          <Text size="caption" weight="semibold" color={C.text}>
            {vm.mergeLine}
          </Text>
        )}
        {vm.autoLine && (
          <Text size="caption" color={C.subtle}>
            {vm.autoLine}
          </Text>
        )}
      </Box>
    )
    // Clear leaves out every line in; Restore (keys null) drops the person's picks.
    const clearAll = async (keys: string[] | null) => {
      await update($, out, list => (keys ? [...new Set([...list, ...keys])] : []))
      await update($, back, () => [])
    }
    // A quick pick makes the selection exactly its lines: the rest are left out by hand, or handed
    // back to the pane when it would leave them out anyway.
    const pickOnly = async (keys: string[]) => {
      const want = new Set(keys)
      const free = vm.rows.filter(x => x.canToggle)
      const freeKeys = new Set(free.map(x => x.key))
      await update($, out, list => [...list.filter(k => !freeKeys.has(k)), ...free.filter(x => !want.has(x.key) && !x.hasReason).map(x => x.key)])
      await update($, back, list => [...list.filter(k => !freeKeys.has(k)), ...free.filter(x => want.has(x.key) && x.hasReason).map(x => x.key)])
    }
    // Fix my PRs: their review turned into changes and replies is not background work (it edits
    // code and pushes), so it goes to the chat as a prompt the person reads and sends.
    const fixMine = async (urls: string[]) => {
      const list = urls.map(u => `- ${u}`)
      const ask = compose(prompts.fix, [`/argos ${t(lang, 'b_fix')}`, ...list], text => [text, ...list])
      await $.prompt.fill({ text: ask.join('\n'), mode: 'replace' })
    }
    // The agents at work, each with Stop: its tools are refused from then on, so it ends.
    const agents = working.length > 0 && (
      <Box key="agents" flexDirection="column" gap="xs">
        <Text size="caption" weight="semibold" color={C.text}>
          {t(lang, 'ag_title', working.length)}
        </Text>
        {working.map(a => (
          <Box key={`agent:${a.id}`} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="sm" paddingX="xs">
            <Text color={C.brand}>⠿</Text>
            <Text size="caption" color={C.text}>
              {a.description}
            </Text>
            <Text size="caption" color={C.subtle}>
              {t(lang, `ag_${a.status}`)}
            </Text>
            <Button key={`stop:${a.id}`} plain={true} onPress={() => void stopAgent($, a.id)}>
              {t(lang, 'ag_stop')}
            </Button>
          </Box>
        ))}
      </Box>
    )
    // One button validates everything left in, in the background; the stars fill in on the lines.
    const go = (
      <Box key="go" flexDirection="column" gap="xs">
        {agents}
        {/* The last run, in words: while it goes, how far ("Validating 4 of 10 · 1 failed") in
            place of the picks and Validate; once done, what it came to, above them, until the next
            run or check, with Retry on the failed ones. How each line ended is on its line. */}
        {vm.run?.isRunning && (
          <Box key="run" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="xs">
            <Text color={C.brand}>⠿</Text>
            <Text size="caption" weight="semibold" color={C.text}>
              {t(lang, 'in_validating', vm.run.total - vm.rows.filter(x => x.mark.glyph === '○').length, vm.run.total)}
            </Text>
            {vm.run.failed > 0 && (
              <Text size="caption" weight="semibold" color={C.error}>
                {`· ${t(lang, 'run_failed', vm.run.failed)}`}
              </Text>
            )}
          </Box>
        )}
        {vm.run && !vm.run.isRunning && (
          <Box key="run" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="xs">
            {!vm.run.failed && <Text color={C.success}>✓</Text>}
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
                {['', vm.run.merged ? t(lang, 'run_merged', vm.run.merged) : '', vm.run.approved ? t(lang, 'run_approved', vm.run.approved) : ''].filter((x, i) => !i || x).join(' · ')}
              </Text>
            )}
            {vm.run.retry.length > 0 && (
              <Button key="retry" plain={true} onPress={() => void validate($, vm.run!.retry, lang, skills, prompts.validate)}>
                {t(lang, 'run_retry', vm.run.retry.length)}
              </Button>
            )}
          </Box>
        )}
        {!vm.run?.isRunning && (
          <Box flexDirection="column" gap="xs">
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="md">
              {vm.picks.map(p => (
                <Button key={`quick:${p.id}`} plain={true} onPress={() => void pickOnly(p.keys)}>
                  {p.label}
                </Button>
              ))}
              {vm.rework.length > 0 && (
                <Button key="fix" plain={true} onPress={() => void fixMine(vm.rework)}>
                  {t(lang, 'fix_n', vm.rework.length)}
                </Button>
              )}
            </Box>
            <Box flexDirection="row" alignItems="center" gap="sm">
              <Button
                key="validate"
                variant={vm.validate.count ? 'primary' : 'secondary'}
                dimColor={!vm.validate.count}
                onPress={() => (vm.validate.count ? void validate($, vm.validate.urls, lang, skills, prompts.validate) : undefined)}
              >
                {vm.validate.label}
              </Button>
              {vm.clear && (
                <Button key="clear" plain={true} onPress={() => void clearAll(vm.clear!.keys)}>
                  {vm.clear.label}
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Box>
    )
    // One line per PR, packed to the left so the eye never crosses an empty middle: a box to leave
    // it out (or bring back one the pane left out), its verdict, who opened it, the title with its
    // number and why the pane left it out, all on one line. A running line shows ⠿: Argos holds it.
    // With more than one repo the lines sit under a heading per repo: its box takes or leaves the
    // whole repo, and Only makes the selection that repo alone.
    const VERDICT_W = 4
    type Group = (typeof vm.groups)[number]
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
    // Only: this repo goes back to the pane's own picks, every other repo's lines are left out.
    const onlyRepo = async (g: Group) => {
      const mine = new Set(g.rows.map(x => x.key))
      const others = vm.groups.filter(o => o.repo !== g.repo).flatMap(o => o.keys)
      const otherSet = new Set(others)
      await update($, out, list => [...new Set([...list.filter(k => !mine.has(k)), ...others])])
      await update($, back, list => list.filter(k => !mine.has(k) && !otherSet.has(k)))
    }
    const MARK = { on: BOX.on, mixed: BOX.mixed, off: BOX.off }
    const header = (g: Group) => (
      <Box key={`group:${g.repo}`} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="sm" paddingX="xs" marginTop="md">
        {g.keys.length ? (
          <Button key={`repo:${g.repo}`} plain={true} onPress={() => void pickRepo(g)}>
            {`${MARK[g.mark]} ${g.name}`}
          </Button>
        ) : (
          <Text weight="semibold" color={C.text}>
            {g.name}
          </Text>
        )}
        <Text size="caption" color={C.subtle}>
          {g.count}
        </Text>
        {g.merge && (
          <Text size="caption" weight="semibold" color={C.text}>
            {t(lang, 'mg_heading')}
          </Text>
        )}
        {vm.groups.length > 1 && g.keys.length > 0 && (
          <Button key={`only:${g.repo}`} plain={true} onPress={() => void onlyRepo(g)}>
            {t(lang, 'in_only')}
          </Button>
        )}
        <Button key={`settings:${g.repo}`} plain={true} onPress={() => void toggleSettings(g.repo)}>
          {`${t(lang, 'settings')} ${openSettings === g.repo ? '▾' : '▸'}`}
        </Button>
      </Box>
    )
    // A repo's Settings fold: its auto-merge (two taps to turn on, the second naming what it will
    // do on GitHub; one to turn off) and its own validation skills beside the global ones.
    const toggleSettings = async (repo: string) => {
      await update($, settingsOpen, x => (x === repo ? null : repo))
      await update($, confirmMerge, () => null)
    }
    const repoCmd = async (...args: string[]) => {
      await $.process.run(['node', `${$.plugin.root}/scripts/repos.mjs`, ...args, '--lang', lang])
      await loadRepos($)
    }
    const setMerge = async (repo: string, isOn: boolean) => {
      await repoCmd('merge', repo, isOn ? 'on' : 'off')
      await update($, confirmMerge, () => null)
    }
    // what the person typed in a skills field, kept outside the drawing so typing redraws nothing
    const drafts = skillDrafts
    const saveSkills = (repo: string, text: string) => repoCmd('skills', repo, ...text.split(',').map(x => x.trim()).filter(Boolean))
    const fold = (g: Group) => (
      <Box key={`fold:${g.repo}`} flexDirection="column" gap="sm" paddingX="lg">
        {confirming === g.repo ? (
          <Box flexDirection="column" gap="xs">
            <Text weight="semibold" color={C.text}>
              {t(lang, 'mg_confirm_title', g.repo)}
            </Text>
            <Text size="caption" color={C.text}>
              {t(lang, 'mg_confirm_body', last?.me ?? '')}
            </Text>
            {(t(lang, 'mg_rules') as string[]).map((rule, i) => (
              <Text key={`rule:${i}`} size="caption" color={C.text}>
                {`· ${rule}`}
              </Text>
            ))}
            <Text size="caption" color={C.subtle}>
              {t(lang, 'mg_method')}
            </Text>
            <Box flexDirection="row" gap="sm">
              <Button key={`merge-yes:${g.repo}`} variant="primary" onPress={() => void setMerge(g.repo, true)}>
                {t(lang, 'mg_yes', g.name)}
              </Button>
              <Button key={`merge-cancel:${g.repo}`} variant="secondary" onPress={() => void update($, confirmMerge, () => null)}>
                {t(lang, 'cancel')}
              </Button>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column" gap="xs">
            <Box flexDirection="row" alignItems="center" gap="sm">
              <Text size="caption" weight="semibold" color={C.text}>
                {t(lang, g.merge ? 'mg_on' : 'mg_off')}
              </Text>
              <Button
                key={`merge:${g.repo}`}
                plain={true}
                onPress={() => void (g.merge ? setMerge(g.repo, false) : update($, confirmMerge, () => g.repo))}
              >
                {t(lang, g.merge ? 'mg_turn_off' : 'mg_turn_on')}
              </Button>
            </Box>
            <Text size="caption" color={C.subtle}>
              {g.merge ? t(lang, 'mg_on_note') : t(lang, 'mg_off_note', g.name)}
            </Text>
          </Box>
        )}
        <Box flexDirection="column" gap="xs">
          <Text size="caption" weight="semibold" color={C.text}>
            {t(lang, 'skills_title')}
          </Text>
          {skills.length > 0 && (
            <Text size="caption" color={C.subtle}>
              {t(lang, 'skills_global', skills.join(', '))}
            </Text>
          )}
          <Box flexDirection="row" alignItems="center" gap="sm">
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              {Input && (
                <Input
                  key={`skills:${g.repo}`}
                  label={t(lang, 'skills_label', g.name)}
                  value={g.skills.join(', ')}
                  submitLabel={t(lang, 'skills_save')}
                  onInput={(text: string) => void drafts.set(g.repo, text)}
                  onSubmit={(text: string) => void saveSkills(g.repo, text)}
                />
              )}
            </Box>
            <Button key={`skills-save:${g.repo}`} plain={true} onPress={() => void saveSkills(g.repo, drafts.get(g.repo) ?? g.skills.join(', '))}>
              {t(lang, 'skills_save')}
            </Button>
          </Box>
          <Text size="caption" color={C.subtle}>
            {t(lang, 'skills_note', g.name)}
          </Text>
        </Box>
      </Box>
    )
    type Row = (typeof vm.rows)[number]
    const toggle = (x: Row) => {
      if (!x.canToggle) return
      if (x.isAuto) void update($, back, list => [...list, x.key])
      else void update($, out, list => (list.includes(x.key) ? list.filter(k => k !== x.key) : [...list, x.key]))
    }
    // while a run goes every line is locked: its mark is text in a fixed column (text, unlike a
    // Button, does not clip), so the column lines up
    const locked = Boolean(vm.run?.isRunning)
    const line = (x: Row) => (
      <Box key={x.key} flexDirection="row" alignItems="center" gap="xs" paddingX="xs" hover={{ backgroundColor: HOVER }}>
        {locked ? (
          <Box flexShrink={0} width={2}>
            <Text color={x.mark.color}>{x.mark.glyph || ' '}</Text>
          </Box>
        ) : (
          // every line's box is the same native button, unboxed (a width clips it), so they all
          // line up; an author left out opens Who, where they come back
          <Button
            key={`pick:${x.key}`}
            plain={true}
            dimColor={!x.canToggle}
            onPress={() => (x.canToggle ? toggle(x) : x.isRunning ? undefined : void update($, authorsOpen, () => true))}
          >
            {x.isRunning ? '⠿' : x.isIn ? BOX.on : BOX.off}
          </Button>
        )}
        {/* the verdict keeps one width, filled or not, so the avatars and titles line up */}
        <Box flexDirection="row" alignItems="center" flexShrink={0} width={VERDICT_W}>
          {x.verdict && icon(x.verdict.svg!, x.verdict.text, 14, 14, x.verdict.tip)}
          {x.verdict?.count && (
            <Text size="caption" weight="semibold" color={x.verdict.color}>
              {x.verdict.count}
            </Text>
          )}
        </Box>
        {icon(x.avatar, x.author.slice(0, 1).toUpperCase(), 16, 16, x.authorTip)}
        {/* one line tall whatever the state: the title gives way, its number and reason stay */}
        <Box flexDirection="row" alignItems="center" gap="xs" flexGrow={1} flexShrink={1} minWidth={0}>
          <Box flexShrink={1} minWidth={0}>
            <Text size="caption" color={x.isIn || x.isRunning ? C.text : C.subtle} wrap="truncate">
              {x.title}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text size="caption" color={C.subtle}>
              {x.status ? x.num : [x.num, x.why, x.mergeNote].filter(Boolean).join(' · ')}
            </Text>
          </Box>
          {/* in the last run, how it ended: the word first, its colour only repeats it */}
          {x.status && (
            <Box flexShrink={0}>
              <Text size="caption" color={x.status.color}>
                {`· ${x.status.text}`}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    )
    return frame(
      head(true),
      failedBanner,
      who,
      go,
      <Box key="lines" flexDirection="column">
        {vm.groups.length > 1 || openSettings
          ? vm.groups.flatMap(g => [header(g), ...(openSettings === g.repo ? [fold(g)] : []), ...g.rows.map(line)])
          : vm.rows.map(line)}
      </Box>,
    )
  })
}
