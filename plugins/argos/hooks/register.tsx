// Argos mod: the peacock's eyes inside Claude. A timer runs one Argos round over
// the connected repos. The band above the prompt shows the most urgent PR; /argos opens
// the pane, an inbox: what needs me, what is ready, what waits on others, my drafts and
// the team's PRs, each PR a tinted box of two lines with icons, labels and one action, a
// picker to narrow to a repo, and a batch bar for the PRs picked for the AI. Words and
// numbers come from toViewModel (view.ts); colours and icons from look.ts.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../scripts/i18n.mjs'
import { DEMO_ROUND } from './demo-round'
import { C, I, TINT, rgba } from './look'
import { UI, mentions, toViewModel } from './view'
import type { Round } from '../types'

export { action, byRank, rank, reason, sectionOf, tags, toViewModel, tone, verb } from './view'

const PANE = 'argos'
const ROUND = { plugin: 'argos', key: 'round' } as const
const HIDDEN = { plugin: 'argos', key: 'isHidden' } as const
const RUNNING = { plugin: 'argos', key: 'isRunning' } as const
// /argos demo shows a sample round; rounds and loads wait until a plain /argos
const DEMO = { plugin: 'argos', key: 'isDemo' } as const
const round = atom(ROUND, null)
const isHidden = atom(HIDDEN, false)
const isRunning = atom(RUNNING, false)
const selected = atom({ plugin: 'argos', key: 'selected' } as const, UI.selected)
const open = atom({ plugin: 'argos', key: 'open' } as const, UI.open)
// prompt requests being filled right now: a second press of the same one waits for nothing
const busy = new Set<string>()
const filter = atom({ plugin: 'argos', key: 'filter' } as const, UI.filter)

// The KL · Akasha mark (brand/kl/final): the face centred in a full L-coloured frame,
// on its own dark ground so it reads in both themes.
const GLYPH =
  '<path fill="#7E5CC0" d="M104 96L160 40A56 56 0 0 1 160 152Z"/><path fill="#A98BE0" d="M160 40L104 96L160 152L122 96Z"/>' +
  '<path fill="#F3EEFB" d="M172 68L178 90L200 96L178 102L172 124L166 102L144 96L166 90Z"/>'
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="56" fill="#1E1430"/>' +
  '<rect x="22" y="22" width="212" height="212" rx="40" fill="none" stroke="#51408A" stroke-width="18"/>' +
  `<g transform="translate(128 128) scale(1.25) translate(-160 -96)">${GLYPH}</g></svg>`


const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 60),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '').split(/\s+/).filter(Boolean),
  lang: String(options.language ?? 'en'),
})

async function roundFile($: any) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return `${home}/.claude/kl-akasha/argos/last-round.json`
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

async function openPane($: any, options: PluginOptions) {
  await load($)
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
    if (fresh?.notify) {
      $.ui.toast(fresh.notify)
      await $.state.set(HIDDEN, false)
    }
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
    // The plugin's skill already owns /argos (argos:argos); the hook below answers it. Registering
    // only matters where no skill holds the name, so a refusal is expected and harmless.
    await $.command.register({ name: 'argos', description: t(lang, 'ui_command') }).catch(() => {})
    $.clock.every(minutes * 6e4, () => void tick($, options, false))
    $.clock.after(5_000, () => void tick($, options, false))
    return started
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
    // a sample round with several repos and every signal, to look at the pane without one
    if (args[0] === 'demo') {
      const at = new Date(await $.clock.now()).toISOString()
      await $.state.set(DEMO, true)
      await $.state.set(ROUND, { ...DEMO_ROUND, at, okAt: at })
      await $.ui.open({ id: PANE, title: 'Argos' })
      return { text: t(lang, 'ui_demo') }
    }
    // leaving the demo drops its sample, so the next load shows the real round
    if ((await $.state.get(DEMO)).value) {
      await $.state.set(ROUND, null)
      await update($, selected, () => [])
    }
    await $.state.set(DEMO, false)
    await openPane($, options)
    void tick($, options, true)
    return { text: t(lang, 'ui_opened') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [running, last, hidden, now] = await Promise.all([read($, isRunning), read($, round), read($, isHidden), $.clock.now()])
    const vm = toViewModel(last, { now, lang, minutes, running })
    const band = vm.state === 'ok' ? vm.band : null
    if (e.props.hasSurvey || hidden || (!running && !band && !vm.failed && !vm.isLate)) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    return (
      <Box>
        {e.surface !== 'terminal' && <ui.Svg source={ICON} alt="KL · Akasha" width={16} height={16} />}
        <Text> Argos </Text>
        {running && <Text dimColor>{t(lang, 'ui_checking')} </Text>}
        {!running && (vm.failed || vm.isLate) && <Text>{t(lang, 'ui_failed')} · </Text>}
        {!running && band && (
          <Text>
            {t(lang, 'ui_needs', band.count)} · {band.verb}: {band.ref}{' '}
          </Text>
        )}
        <Button key="open" onPress={() => void openPane($, options)}>
          {t(lang, 'ui_see')}
        </Button>
        <Button key="hide" role="dismiss" onPress={() => void update($, isHidden, () => true)}>
          {t(lang, 'ui_hide')}
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // the terminal is the one surface without Svg: icons fall back to their text marks
    const hasSvg = e.surface !== 'terminal'
    const [running, last, picks, opened, narrowed, box] = await Promise.all([
      read($, isRunning),
      read($, round),
      read($, selected),
      read($, open),
      read($, filter),
      $.prompt.read().catch(() => ({ text: '' })),
    ])
    const vm = toViewModel(last, { now: await $.clock.now(), lang, minutes, running, ui: { selected: picks, open: opened, filter: narrowed }, prompt: box.text })
    // tick returns at once while a round runs, so pressing twice does nothing
    const checkNow = () => void tick($, options, true)
    // a picker where the surface has one
    const Select = (ui as { Select?: any }).Select
    const icon = (svg: string, text: string, w = 16) => (hasSvg ? <ui.Svg source={svg} alt={text} width={w} height={16} /> : <Text>{text}</Text>)
    // Puts one request in the prompt without sending it: appended on a new line when there
    // is a draft, never twice. Two quick presses meet one lock, and a request whose PRs are
    // all in the prompt already adds nothing.
    const fillPrompt = async (request: string, urls: string[]) => {
      if (busy.has(request)) return
      busy.add(request)
      try {
        const { text } = await $.prompt.read()
        if (!urls.length || !urls.every(u => mentions(text, u)))
          await $.prompt.fill(text.trim() ? { text: `\n${request}`, mode: 'append' } : { text: request, mode: 'replace' })
        $.ui.invalidate('ui.render')
      } finally {
        busy.delete(request)
      }
    }

    // The head: "Pull requests" and Check now; under it what needs me and when Argos last
    // looked (a failed check in red); then one Select to narrow to a repo.
    const needLine = vm.failed ? t(lang, 'in_failed') : vm.state === 'ok' ? vm.need : ''
    const checked = vm.state === 'noRepos' ? '' : vm.checked
    const head = (withCheck: boolean) => (
      <Box key="head" flexDirection="column" gap="xs">
        <Box flexDirection="row" alignItems="center" gap="sm">
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
        {(needLine || checked) && (
          <Box flexDirection="row" alignItems="center" flexWrap="wrap" columnGap="xs">
            {needLine && (
              <Text weight="semibold" color={vm.failed ? C.error : C.text}>
                {needLine}
              </Text>
            )}
            {checked && (
              <Text size="caption" color={C.subtle}>
                {needLine ? `· ${checked}` : checked}
              </Text>
            )}
          </Box>
        )}
        {vm.state === 'ok' && vm.repos.length > 0 && Select && (
          <Select
            key="repo"
            label={t(lang, 'in_all_repos')}
            value={vm.filter || 'all'}
            options={vm.repos.map(r => ({ value: r.id || 'all', label: r.name }))}
            onSelect={(v: string) => void update($, filter, () => (v === 'all' ? '' : v))}
          />
        )}
      </Box>
    )
    // A banner in a state's colour: clear (green), check failed (red), no repo (neutral).
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
    const failedBanner =
      vm.error &&
      banner(
        'failed',
        { bg: rgba(C.error, TINT + 0.01), border: rgba(C.error, 0.35) },
        I.error,
        t(lang, 'in_err_title'),
        vm.error.why,
        vm.error.isAuth ? { label: t(lang, 'in_fix_auth'), onPress: () => void fillPrompt(t(lang, 'p_auth', vm.error!.why), []) } : { label: t(lang, 'in_retry'), onPress: checkNow },
      )

    // The first check: static placeholders sized like real rows, so nothing jumps.
    if (vm.state === 'loading' || vm.state === 'never')
      return frame(
        head(vm.state === 'never'),
        <Box key="skeleton" flexDirection="column" gap="xs">
          {[
            ['78%', '42%'],
            ['64%', '50%'],
            ['72%', '36%'],
          ].map(([a, b], i) => (
            <Box key={`sk${i}`} flexDirection="column" gap="sm" padding="sm" borderStyle="round" borderColor="rgba(255,255,255,0.06)" backgroundColor="rgba(255,255,255,0.03)">
              <Box height={8} width={a} backgroundColor="#2E2E2C" />
              <Box height={8} width={b} backgroundColor="#2A2A28" />
            </Box>
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

    // a failed check keeps the stale rows, dimmed; their actions still work
    const dim = vm.failed
    const toggle = (key: string) => void update($, selected, () => (vm.keep.includes(key) ? vm.keep.filter(k => k !== key) : [...vm.keep, key]))
    type Pr = (typeof vm.sections)[number]['prs'][number]
    // One PR on two lines. Line 1 says what it is and how long it waited; line 2 why it is
    // here (icons, colour) and what to do: a pick and one button. The box is tinted where I act.
    const row = (p: Pr) => (
      <Box key={p.key} flexDirection="column" gap="xs" paddingX="sm" paddingY="sm" borderStyle="round" borderColor={p.box.border} backgroundColor={p.box.bg}>
        <Box flexDirection="row" alignItems="center" gap="xs" minWidth={0}>
          {icon(p.glyph, '⑂')}
          {/* the ref and the wait never wrap or shrink; the title takes what is left */}
          <Box flexShrink={0}>
            <Text size="caption" color={C.subtle} dimColor={dim}>
              {p.ref}
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text weight="medium" color={C.text} dimColor={dim} wrap="truncate">
              {p.title}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text size="caption" color={p.isOld ? C.text : C.subtle} weight={p.isOld ? 'bold' : 'regular'} dimColor={dim}>
              {p.wait}
            </Text>
          </Box>
        </Box>
        <Box flexDirection="row" alignItems="center" flexWrap="wrap" gap="xs">
          <Box flexDirection="row" alignItems="center" gap="xs" minWidth={0}>
            {p.tags.map((tg, i) => (
              <Box key={`t${i}`} flexDirection="row" alignItems="center">
                {tg.svg ? icon(tg.svg, tg.text, tg.w) : null}
                {tg.count && (hasSvg || !tg.svg) && (
                  <Text size="caption" weight="semibold" color={tg.color}>
                    {tg.count}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
          {/* grows into the space left, so the buttons sit right; on a narrow pane they wrap to their own line */}
          <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap="xs" flexGrow={1}>
            <Button key={`pick:${p.key}`} plain={true} onPress={() => toggle(p.key)}>
              {p.isPicked ? '✓' : '+'}
            </Button>
            <Button key={`act:${p.key}`} variant="secondary" onPress={() => void fillPrompt(p.prompt, [p.url])}>
              {p.act}
            </Button>
          </Box>
        </Box>
      </Box>
    )
    // A section: its name and count, Show/Hide on the folded Team; empty sections are hidden.
    const section = (s: (typeof vm.sections)[number]) =>
      s.count > 0 && (
        <Box key={`sec:${s.id}`} flexDirection="column" gap="xs">
          <Box flexDirection="row" alignItems="center" gap="xs">
            <Text size="caption" weight="semibold" color={C.subtle}>
              {s.title}
            </Text>
            <Box flexGrow={1}>
              <Text size="caption" weight="semibold" color={C.text}>
                {String(s.count)}
              </Text>
            </Box>
            {s.canFold && (
              <Button key={`fold:${s.id}`} plain={true} onPress={() => void update($, open, o => (o === s.id ? '' : s.id))}>
                {t(lang, s.isFolded ? 'in_show' : 'in_hide')}
              </Button>
            )}
          </Box>
          {!s.isFolded && s.prs.map(row)}
        </Box>
      )
    const clearBanner = vm.clear !== null && banner('clear', { bg: rgba(C.success, TINT + 0.01), border: rgba(C.success, 0.35) }, I.approved, t(lang, 'in_clear'), vm.clear)
    // The batch: what is picked, each row's action, and the pane's one primary button.
    const batch = vm.batch && (
      <Box key="batch" flexDirection="column" gap="sm" padding="sm" borderStyle="round" borderColor={rgba(C.claude, 0.55)} backgroundColor={rgba(C.claude, 0.1)}>
        <Box flexDirection="row" alignItems="center" gap="xs">
          <Box flexGrow={1}>
            <Text weight="semibold" color={C.text}>
              {vm.batch.count}
            </Text>
          </Box>
          <Button key="clear" plain={true} onPress={() => void update($, selected, () => [])}>
            {t(lang, 'ui_clear')}
          </Button>
        </Box>
        <Text size="caption" color={C.subtle} wrap="truncate">
          {vm.batch.detail}
        </Text>
        <Box flexDirection="row" justifyContent="flex-end">
          <Button
            key="send"
            variant="primary"
            onPress={async () => {
              await fillPrompt(vm.batch!.prompt, vm.batch!.urls)
              await update($, selected, () => [])
            }}
          >
            {t(lang, 'in_add')}
          </Button>
        </Box>
      </Box>
    )
    return frame(head(true), failedBanner, clearBanner, ...vm.sections.map(section), batch)
  })
}
