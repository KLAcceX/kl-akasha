// Argos mod: the peacock's eyes inside Claude. A timer runs one Argos round over
// the connected repos. The band above the prompt shows the most urgent PR; /argos opens
// the pane, an inbox: what needs me, what is ready, what waits on others, my drafts and
// the team's PRs, each PR on two lines with its one action, chips to narrow to a repo, a
// way to add one, and a send bar for the PRs picked for the AI. Words and numbers come from
// toViewModel (view.ts).
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../scripts/i18n.mjs'
import { UI, toViewModel } from './view'
import type { Round } from '../types'

export { act, byRank, prompt, rank, reason, sectionOf, sizeTag, toViewModel, tone, verb } from './view'

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
const sent = atom({ plugin: 'argos', key: 'sent' } as const, UI.sent)
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
const RED = '#E5384A'

const LAYER = 'rgba(127, 127, 127, 0.10)'
const PICKED = 'rgba(217, 119, 87, 0.12)'

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

// Shows what the last round (from any session) wrote.
async function load($: any): Promise<Round | null> {
  if ((await $.state.get(DEMO)).value) return (await $.state.get(ROUND)).value
  try {
    const last: Round = JSON.parse(await $.fs.read(await roundFile($)))
    await $.state.set(ROUND, last)
    return last
  } catch {
    return null
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
    const { value } = await $.state.get(ROUND)
    // keep okAt: the data on screen is still from the last round that worked
    await $.state.set(ROUND, { ...(value ?? {}), at: new Date(now).toISOString(), okAt: value?.okAt ?? null, error: String(err) })
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
      const sample: Round = JSON.parse(await $.fs.read(`${$.plugin.root}/hooks/demo-round.json`))
      const at = new Date(await $.clock.now()).toISOString()
      await $.state.set(DEMO, true)
      await $.state.set(ROUND, { ...sample, at, okAt: at })
      await $.ui.open({ id: PANE, title: 'Argos' })
      return { text: t(lang, 'ui_demo') }
    }
    await $.state.set(DEMO, false)
    await openPane($, options)
    void tick($, options, true)
    return { text: t(lang, 'ui_opened') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const running = await read($, isRunning)
    const vm = toViewModel(await read($, round), { now: await $.clock.now(), lang, minutes, running })
    const band = vm.state === 'ok' ? vm.band : null
    if (e.props.hasSurvey || (await read($, isHidden)) || (!running && !band && !vm.status)) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    return (
      <Box>
        {e.surface !== 'terminal' && <ui.Svg source={ICON} alt="KL · Akasha" width={16} height={16} />}
        <Text> Argos </Text>
        {running && <Text dimColor>{t(lang, 'ui_checking')} </Text>}
        {!running && vm.status && <Text>{t(lang, 'ui_failed')} · </Text>}
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
    const { Box, Button, Text, Link, Code } = ui
    // the terminal is the one surface without Svg (its table still carries the name)
    const hasSvg = e.surface !== 'terminal'
    const running = await read($, isRunning)
    const vm = toViewModel(await read($, round), {
      now: await $.clock.now(),
      lang,
      minutes,
      running,
      ui: { selected: await read($, selected), open: await read($, open), sent: await read($, sent), filter: await read($, filter) },
    })
    // tick returns at once while a round runs, so pressing twice does nothing
    const checkNow = () => void tick($, options, true)
    const fill = (color: string) => (hasSvg ? color : undefined)

    // The head: the mark, "Argos", what needs me and when Argos last looked; Check now on
    // the right as an icon, named for screen readers; while it runs the icon dims and the line
    // under the title says so, so the head never changes width.
    const top = (summary?: string) => (
      <Box key="top" flexDirection="row" alignItems="center" gap="sm">
        {hasSvg && <ui.Svg source={ICON} alt="KL · Akasha" width={28} height={28} />}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="heading" weight="semibold">
            Argos
          </Text>
          {summary && <Text size="caption">{summary}</Text>}
          {(running || vm.seen) && (
            <Text size="caption" dimColor>
              {running ? t(lang, 'ui_checking') : vm.seen}
            </Text>
          )}
        </Box>
        <Button key="check" variant="secondary" dimColor={running} label={t(lang, running ? 'ui_checking' : 'ui_check')} onPress={checkNow}>
          ↻
        </Button>
      </Box>
    )
    const status = vm.status && (
      <Box borderStyle="round" borderColor={RED} paddingX="sm" flexDirection="column" gap="xs">
        <Text>{vm.status}</Text>
        <Box flexDirection="row">
          <Button key="retry" plain={true} onPress={checkNow}>
            {vm.isLate ? t(lang, 'ui_check') : t(lang, 'ui_retry')}
          </Button>
        </Box>
      </Box>
    )
    // a part a state does not have is left out, so no gap is spent on it
    const frame = (first: any, ...body: any[]) => (
      <Box flexDirection="column" gap="lg" paddingX="md" paddingY="md">
        {[first, status, ...body].filter(Boolean)}
      </Box>
    )
    // Every state but the list leads with the bare head; the list adds its summary.
    const page = (...body: any[]) => frame(top(), ...body)

    if (vm.state === 'loading') return page(<Text key="b">{t(lang, 'ui_loading')}</Text>)
    if (vm.state === 'never') return page(<Text key="b">{t(lang, 'ui_never')}</Text>)
    if (vm.state === 'noData') return page(<Text key="b">{t(lang, 'ui_no_data')}</Text>)
    if (vm.state === 'noRepos')
      return page(
        <Box key="b" flexDirection="column" gap="sm">
          <Text size="heading" weight="semibold">
            {t(lang, 'ui_no_repos_title')}
          </Text>
          <Text>{t(lang, 'ui_no_repos_body')}</Text>
          <Code source="/argos repos add <folder or owner/name>" />
          <Box flexDirection="row">
            <Button key="connect" variant="primary" onPress={() => void addRepo($)}>
              {t(lang, 'ui_connect')}
            </Button>
          </Box>
        </Box>,
      )
    // narrows vm for TypeScript; every other state returned above
    if (vm.state !== 'ok') return page()

    const toggle = (keys: string[], pick: boolean) =>
      void update($, selected, list => (pick ? [...new Set([...list, ...keys])] : list.filter(k => !keys.includes(k))))
    // A checkbox is a one-glyph button: the kit's own way to a control that is only a mark,
    // so the box itself takes the press (focus and pointer invert it). The terminal writes
    // brackets.
    const GLYPH = hasSvg ? { all: '☑', some: '⊟', none: '☐' } : { all: '[x]', some: '[-]', none: '[ ]' }
    const check = (key: string, state: 'all' | 'some' | 'none', onPress: () => void) => (
      <Button key={key} plain={true} hover={{ color: 'claude' }} onPress={onPress}>
        <Text color={state === 'none' ? undefined : 'claude'}>{GLYPH[state]}</Text>
      </Button>
    )
    // Puts one request in the prompt without sending it: appended on a new line when there
    // is a draft, never twice.
    const fillPrompt = async (request: string) => {
      const { text } = await $.prompt.read()
      if (!text.includes(request)) await $.prompt.fill(text.trim() ? { text: `\n${request}`, mode: 'append' } : { text: request, mode: 'replace' })
    }

    type Section = (typeof vm.sections)[number]
    type Pr = Section['prs'][number]
    // One PR on two lines, so it fits a narrow sidebar: the title, then where it lives, how
    // long it has waited, whose it is, a size or AI mark when one applies, and on the right
    // the one action that puts this PR in the prompt, in the colour of what it asks.
    const prRow = (p: Pr, canPick: boolean) => (
      <Box
        key={p.key}
        flexDirection="row"
        alignItems="flex-start"
        gap="sm"
        paddingX="sm"
        paddingY="xs"
        backgroundColor={p.isPicked ? fill(PICKED) : undefined}
        borderStyle={hasSvg && p.isPicked ? 'round' : undefined}
        borderColor={p.isPicked ? fill(PICKED) : undefined}
      >
        {canPick && check(`box:${p.key}`, p.isPicked ? 'all' : 'none', () => toggle([p.key], !p.isPicked))}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate">{p.title}</Text>
          {/* The number and the wait never shrink; whose it is and where truncate; when the
              action does not fit beside them, it drops to its own line instead of squeezing. */}
          <Box flexDirection="row" alignItems="center" flexWrap="wrap" justifyContent="space-between" columnGap="sm">
            <Box flexDirection="row" alignItems="center" columnGap="xs" flexShrink={1} minWidth={0}>
              <Box flexShrink={0}>
                <Link href={p.url} label={`#${p.number}`} />
              </Box>
              <Box flexShrink={0}>
                <Text size="caption" dimColor tabular>
                  {`· ${p.wait}`}
                </Text>
              </Box>
              {(p.owner || p.repo) && (
                <Box flexShrink={1} minWidth={0}>
                  <Text size="caption" dimColor wrap="truncate">
                    {['', p.owner, p.repo].filter(x => x !== null).join(' · ')}
                  </Text>
                </Box>
              )}
              {p.size && (
                <Text size="caption" color="warning" weight="semibold">
                  {p.size}
                </Text>
              )}
              {p.isAI && (
                <Text size="caption" color="claude" weight="semibold">
                  {t(lang, 'ui_ai')}
                </Text>
              )}
            </Box>
            {p.act && p.prompt && (
              // a button draws its own text colour, so the signal's colour rides on a dot beside it
              <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap="xs" flexGrow={1} flexShrink={0}>
                {p.tone && (
                  <Text size="caption" color={p.tone}>
                    ●
                  </Text>
                )}
                <Button key={`act:${p.key}`} plain={true} hover={{ color: 'claude' }} onPress={() => void fillPrompt(p.prompt!)}>
                  <Text size="caption" weight="semibold">
                    {`${p.act} ›`}
                  </Text>
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    )
    // One section: its title and count (a box that picks them all where a batch makes sense,
    // a fold on the team's), then its PRs. An empty section is left out, except "Your move",
    // which says nothing needs me.
    const section = (s: Section) => {
      if (s.id === 'move' && !s.count)
        return (
          <Text key="calm" dimColor>
            {t(lang, 'ui_calm')}
          </Text>
        )
      if (!s.count) return null
      const title = `${s.title} · ${s.count}`
      return (
        <Box key={`sec:${s.id}`} flexDirection="column" gap="xs">
          <Box flexDirection="row" alignItems="center" gap="sm" paddingX="sm">
            {s.canPick && !s.isFolded && check(`box:${s.id}`, s.pick, () => toggle(s.keys, s.pick !== 'all'))}
            {s.id === 'team' ? (
              <Button key="fold:team" plain={true} hover={{ color: 'claude' }} onPress={() => void update($, open, o => (o === s.id ? '' : s.id))}>
                <Text size="caption" weight="semibold" dimColor>
                  {`${title}  ${s.isFolded ? '▾' : '▴'}`}
                </Text>
              </Button>
            ) : (
              <Text size="caption" weight="semibold" dimColor>
                {title}
              </Text>
            )}
          </Box>
          {!s.isFolded && s.prs.map(p => prRow(p, s.canPick))}
        </Box>
      )
    }

    // Narrowing to one repo, when there is more than one: the active chip a real button,
    // the others plain and dim. Picks survive; the send bar counts the ones elsewhere.
    const repoChips = vm.repos.length > 0 && (
      <Box key="repos" flexDirection="row" alignItems="center" flexWrap="wrap" gap="xs">
        {vm.repos.map(f =>
          f.isActive ? (
            <Button key={`repo:${f.id || 'all'}`} variant="secondary" onPress={() => {}}>
              {f.label}
            </Button>
          ) : (
            <Button key={`repo:${f.id || 'all'}`} plain={true} dimColor={true} onPress={() => void update($, filter, () => f.id)}>
              {f.label}
            </Button>
          ),
        )}
      </Box>
    )
    const addRow = (
      <Box key="add-repo-row" flexDirection="row" paddingX="sm">
        <Button key="add-repo" plain={true} hover={{ color: 'claude' }} onPress={() => void addRepo($)}>
          <Text color="claude">{t(lang, 'ui_add_repo')}</Text>
        </Button>
      </Box>
    )

    // The send bar shows only once something is picked: what will go, and the one button
    // that puts it in the prompt (never sends it).
    const { send } = vm
    const sendNow = async () => {
      if (send.block) return
      await fillPrompt(send.prompt)
      await update($, sent, () => send.key)
    }
    const footer = send.count > 0 && (
      <Box
        key="send-bar"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap="sm"
        backgroundColor={fill(LAYER)}
        borderStyle={hasSvg ? 'round' : undefined}
        borderColor={fill(LAYER)}
        paddingX="md"
        paddingY="sm"
      >
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="caption">{send.block ?? send.summary}</Text>
          {send.warn && !send.block && (
            <Text size="caption" color="warning">
              {send.warn}
            </Text>
          )}
        </Box>
        <Button key="clear" plain={true} dimColor={true} onPress={() => void update($, selected, () => [])}>
          {t(lang, 'ui_clear')}
        </Button>
        <Button key="send" variant={send.block ? 'secondary' : 'primary'} dimColor={Boolean(send.block)} onPress={() => void sendNow()}>
          {send.inPrompt ? t(lang, 'ui_in_prompt') : t(lang, 'ui_send', send.count)}
        </Button>
      </Box>
    )

    return frame(top(vm.summary), repoChips, ...vm.sections.map(section), addRow, footer)
  })
}
