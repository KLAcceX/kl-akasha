// Argos mod: the peacock's eyes inside Claude. A timer runs one Argos round over the connected
// repos, and /argos opens the pane, built to take PR review off the person's back: every open PR
// is one line, all of them go to validation unless the person leaves some out (an author with one
// tap, or a line), and one button validates the rest in the background, the verdicts filling in
// on the lines. Words and numbers come from toViewModel (view.ts); colours and icons from look.ts.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../scripts/i18n.mjs'
import { DEMO_ROUND, DEMO_VERDICTS } from './demo-round'
import { BOTMARK, C, I, LOGO, STARS, TINT, rgba, titled } from './look'
import { UI, authorOf, toViewModel, verdictOf } from './view'
import type { Round, Verdicts } from '../types'

export { outOf, reason, toViewModel, verdictOf, verdictTag } from './view'

const PANE = 'argos'
const ROUND = { plugin: 'argos', key: 'round' } as const
const RUNNING = { plugin: 'argos', key: 'isRunning' } as const
// /argos demo shows a sample round; rounds and loads wait until a plain /argos
const DEMO = { plugin: 'argos', key: 'isDemo' } as const
const VERDICTS = { plugin: 'argos', key: 'verdicts' } as const
const IGNORED = { plugin: 'argos', key: 'ignored' } as const
const round = atom(ROUND, null)
const isRunning = atom(RUNNING, false)
// PRs the person left out by hand, and PRs left out by the pane that the person brought back
const out = atom({ plugin: 'argos', key: 'out' } as const, UI.out)
const back = atom({ plugin: 'argos', key: 'back' } as const, UI.back)
// authors left out everywhere, kept across sessions in $.store
const ignored = atom(IGNORED, [] as string[])
// what verdicts.mjs last wrote: the AI's validations, read by the lines
const verdicts = atom(VERDICTS, null)

const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 15),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '').split(/\s+/).filter(Boolean),
  lang: String(options.language ?? 'en'),
})

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

// Validates PRs in the background: marks them running, then hands them to subagents with the
// validate job, ten each so a long list runs side by side; no chat is opened, the verdicts land on
// the lines as each one finishes.
async function validate($: any, urls: string[], lang: string) {
  if (!urls.length) return
  await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'start', ...urls])
  await loadVerdicts($)
  for (let i = 0; i < urls.length; i += 10)
    await $.agent.spawn({
      prompt: [t(lang, 'b_auto'), `Job: ${$.plugin.root}/references/validate.md`, `Scripts: ${$.plugin.root}/scripts`, ...urls.slice(i, i + 10).map(u => `- ${u}`)].join('\n'),
      description: 'Argos validate',
    })
}

// Auto-validate: after a round, PRs whose verdict is old (new commits since) are validated again
// in the background: the user's own with "mine", every watched PR with "all"; authors left out
// stay out. ponytail: ten per round, so one burst of commits never spends a fortune at once.
async function autoValidate($: any, r: Round | null, lang: string) {
  const v = await loadVerdicts($)
  if (!r || !v || v.auto === 'off') return
  const skip = new Set(((await $.state.get(IGNORED)).value as string[] | undefined) ?? [])
  const all = [...(r.pending ?? []), ...(r.mine ?? []), ...(r.others ?? [])].filter(p => !skip.has(authorOf(p)))
  const urls = [...new Set(all.filter(p => (v.auto === 'all' || p.kind === 'mine') && verdictOf(p, v.prs[p.url]).state === 'stale').map(p => p.url))].slice(0, 10)
  await validate($, urls, lang)
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
  await $.ui.open({ id: PANE, title: 'Argos' })
}

// One round. Open sessions share last-round.json: a session skips the round
// when another one ran it within the interval, and only shows it.
async function tick($: any, options: PluginOptions, force: boolean) {
  if ((await $.state.get(RUNNING)).value || (await $.state.get(DEMO)).value) return
  const { minutes, account, qualifiers, lang } = config(options)
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
    await autoValidate($, fresh, lang).catch(() => {})
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
  const { lang, minutes, account } = config(options)

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

  // The AI records verdicts with verdicts.mjs from Bash; the lines follow as each one lands.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (e.command.includes('verdicts.mjs')) await loadVerdicts($)
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
    // the terminal is the one surface without Svg: icons fall back to their text marks
    const hasSvg = e.surface !== 'terminal'
    const [running, last, left, brought, judged, authorsOut] = await Promise.all([
      read($, isRunning),
      read($, round),
      read($, out),
      read($, back),
      read($, verdicts),
      read($, ignored),
    ])
    const vm = toViewModel(last, { now: await $.clock.now(), lang, minutes, running, ui: { out: left, back: brought }, verdicts: judged, ignored: authorsOut })
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
        { bg: rgba(C.error, TINT + 0.01), border: rgba(C.error, 0.35) },
        I.error,
        t(lang, 'in_err_title'),
        vm.error.why,
        vm.error.isAuth ? { label: t(lang, 'in_fix_auth'), onPress: () => void fixAuth() } : { label: t(lang, 'in_retry'), onPress: checkNow },
      )

    // The first check: static placeholders sized like real lines, so nothing jumps.
    if (vm.state === 'loading' || vm.state === 'never')
      return frame(
        head(vm.state === 'never'),
        <Box key="skeleton" flexDirection="column" gap="xs">
          {['78%', '64%', '72%'].map((w, i) => (
            <Box key={`sk${i}`} height={8} width={w} backgroundColor="#2E2E2C" />
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
        banner('norepo', { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.10)' }, I.pr(C.subtle), t(lang, 'in_norepo_title'), t(lang, 'in_norepo_body'), {
          label: t(lang, 'in_setup'),
          onPress: () => void addRepo($),
        }),
      )
    if (vm.state !== 'ok') return frame(head(true))

    // Authors are switches: one tap leaves an author out everywhere (and across sessions), one
    // more brings them back. Nothing moves: the chip dims, its lines dim in place.
    const toggleAuthor = async (name: string) => {
      let next: string[] = []
      await update($, ignored, list => (next = list.includes(name) ? list.filter(x => x !== name) : [...list, name]))
      await $.store.set('ignored', next).catch(() => {})
    }
    const authors = (
      <Box key="authors" flexDirection="column" gap="xs">
        <Text size="caption" color={C.subtle}>
          {t(lang, 'in_leave_out')}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" gap="xs">
          {vm.authors.map(a => (
            <Box key={`chip:${a.name}`} flexDirection="row" alignItems="center" gap="xs" paddingX="xs" borderStyle="round" borderColor={a.isOut ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.14)'}>
              {icon(a.svg, a.name.slice(0, 1).toUpperCase(), 18, 18, a.tip)}
              {a.kind === 'bot' && icon(BOTMARK, '⚙', 12, 12, a.tip)}
              <Button key={`who:${a.name}`} plain={true} dimColor={a.isOut} onPress={() => void toggleAuthor(a.name)}>
                {a.isOut ? `${a.name} ✕` : `${a.name} ${a.count}`}
              </Button>
            </Box>
          ))}
        </Box>
        {vm.autoLine && (
          <Text size="caption" color={C.subtle}>
            {vm.autoLine}
          </Text>
        )}
      </Box>
    )
    // One button validates everything left in, in the background; the stars fill in on the lines.
    const go = (
      <Box key="go" flexDirection="column" gap="xs">
        {vm.progress && (
          <Box flexDirection="row" alignItems="center" gap="xs">
            {icon(STARS.run, '✦', 14, 14)}
            <Box flexShrink={0}>
              <Text size="caption" weight="semibold" color={C.merged}>
                {vm.progress.label}
              </Text>
            </Box>
            <Box flexGrow={1} height={4} backgroundColor="#2E2E2C">
              <Box height={4} width={vm.progress.pct} backgroundColor={C.merged} />
            </Box>
          </Box>
        )}
        <Box flexDirection="row">
          <Button
            key="validate"
            variant={vm.validate.count ? 'primary' : 'secondary'}
            dimColor={!vm.validate.count}
            onPress={() => (vm.validate.count ? void validate($, vm.validate.urls, lang) : undefined)}
          >
            {vm.validate.label}
          </Button>
        </Box>
      </Box>
    )
    // One line per PR, in a fixed order: a box to leave it out (or bring back one the pane left
    // out), where it lives, its title, why it is out, its verdict and who opened it.
    const BOX = hasSvg ? { on: '☑', off: '☐' } : { on: '[x]', off: '[ ]' }
    type Row = (typeof vm.rows)[number]
    const toggle = (x: Row) => {
      if (!x.canToggle) return
      if (x.isAuto) void update($, back, list => [...list, x.key])
      else void update($, out, list => (list.includes(x.key) ? list.filter(k => k !== x.key) : [...list, x.key]))
    }
    const line = (x: Row) => (
      <Box key={x.key} flexDirection="row" alignItems="center" gap="xs">
        <Button key={`pick:${x.key}`} plain={true} dimColor={!x.canToggle} onPress={() => toggle(x)}>
          {x.isIn ? BOX.on : BOX.off}
        </Button>
        <Box flexShrink={0}>
          <Text size="caption" color={C.subtle} dimColor={!x.isIn}>
            {x.ref}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="caption" color={C.text} dimColor={!x.isIn} wrap="truncate">
            {x.title}
          </Text>
        </Box>
        {x.why && (
          <Box flexShrink={0}>
            <Text size="caption" color={C.subtle}>
              {x.why}
            </Text>
          </Box>
        )}
        {x.verdict && (
          <Box flexDirection="row" alignItems="center" flexShrink={0}>
            {icon(x.verdict.svg!, x.verdict.text, 14, 14, x.verdict.tip)}
            {x.verdict.count && (
              <Text size="caption" weight="semibold" color={x.verdict.color}>
                {x.verdict.count}
              </Text>
            )}
          </Box>
        )}
        {icon(x.avatar, x.author.slice(0, 1).toUpperCase(), 16, 16, x.authorTip)}
      </Box>
    )
    return frame(
      head(true),
      failedBanner,
      authors,
      go,
      <Box key="lines" flexDirection="column">
        {vm.rows.map(line)}
      </Box>,
    )
  })
}
