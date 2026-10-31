// Argos mod: the peacock's eyes inside Claude. A timer runs one Argos round over
// the connected repos. The band above the prompt shows the most urgent PR; /argos opens
// the pane: filters over the list, one row per repo with what it holds (open comments,
// changed since my review, blocked, review requested), a box to pick it, a way to add a
// repo, and one button that sends the picked PRs to the AI. Words and numbers come from
// toViewModel (view.ts).
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../scripts/i18n.mjs'
import { COLUMNS, UI, toViewModel } from './view'
import type { Column } from './view'
import type { Round } from '../types'

export { byRank, cells, prompt, rank, reason, toViewModel, verb } from './view'

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

// One theme colour per column, used on its count alone: red for blocked, amber for a
// review waiting on you, blue for comments, purple for changed.
const TONE: Record<Column, 'error' | 'warning' | 'suggestion' | 'merged'> = {
  blocked: 'error',
  review: 'warning',
  comments: 'suggestion',
  changed: 'merged',
}
// Translucent fills, so one value reads on the light and the dark theme alike: each count's
// pill takes its colour faintly; cards, the summary and the send bar sit on a neutral
// layer; a picked card takes the accent faintly. The terminal draws none of them.
const TINT: Record<Column, string> = {
  blocked: 'rgba(229, 72, 77, 0.16)',
  review: 'rgba(226, 163, 58, 0.18)',
  comments: 'rgba(80, 140, 230, 0.16)',
  changed: 'rgba(150, 110, 230, 0.16)',
}
// Icons: Tabler Icons outlines (MIT, tabler.io/icons) drawn as Svg, which a Button
// cannot hold, so each sits beside the text control it belongs to. Colours that read on
// both themes; the terminal draws none and keeps its words.
const GREY = '#8C8A83'
const HUE: Record<Column, string> = { blocked: '#E5484D', review: '#E2A33A', comments: '#508CE6', changed: '#966EE6' }
const stroke = (paths: string, color = GREY) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
const REFRESH = '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>'
const GLYPHS: Record<Column, string> = {
  blocked: '<path d="M8.7 3h6.6l4.7 4.7v6.6l-4.7 4.7h-6.6l-4.7 -4.7v-6.6z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  review:
    '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>',
  comments:
    '<path d="M3 20l1.3 -3.9c-2.3 -3.4 -1.4 -7.9 2.1 -10.4c3.5 -2.5 8.6 -2.3 11.8 .5c3.3 2.8 3.7 7.3 1 10.5c-2.7 3.2 -7.6 4.2 -11.6 2.3l-4.6 1"/>',
  changed: REFRESH,
}
const ICONS = {
  elbow: stroke('<path d="M9 0v11a3 3 0 0 0 3 3h9"/>'),
  refresh: stroke(REFRESH),
  pr: stroke(
    '<path d="M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M16 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>' +
      '<path d="M6 8v8"/><path d="M11 6h5a2 2 0 0 1 2 2v8"/><path d="M14 9l-3 -3l3 -3"/>',
  ),
  ...(Object.fromEntries(Object.entries(GLYPHS).map(([c, d]) => [c, stroke(d, HUE[c as Column])])) as Record<Column, string>),
}
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

    // The head of the dashboard. Left: the mark and the title, the tally of open PRs under
    // them. Right: when Argos last looked, then Check now as a real button, so it reads as
    // pressable. Wraps on a narrow pane, the right group going below.
    type Tally = { open: number; mine: number; reviewed: number; unreviewed: number }
    const TALLY = [
      ['mine', 'tally_mine'],
      ['reviewed', 'tally_reviewed'],
      ['unreviewed', 'tally_todo'],
    ] as const
    const tallyLine = (tally: Tally) => (
      <Box key="tally" flexDirection="row" alignItems="center" flexWrap="wrap" gap="xs">
        {TALLY.map(([k, word], i) => (
          <Box key={`tally:${k}`} flexDirection="row" alignItems="center" gap="xs">
            {i > 0 && (
              <Text size="caption" dimColor>
                ·
              </Text>
            )}
            <Text size="caption" weight="semibold" tabular dimColor={tally[k] === 0}>
              {String(tally[k])}
            </Text>
            <Text size="caption" dimColor>
              {t(lang, word)}
            </Text>
          </Box>
        ))}
      </Box>
    )
    const top = (tally?: Tally) => (
      <Box key="top" flexDirection="row" alignItems="center" flexWrap="wrap" columnGap="md" rowGap="sm">
        <Box flexDirection="row" alignItems="center" gap="sm" flexGrow={1}>
          {hasSvg && <ui.Svg source={ICON} alt="KL · Akasha" width={32} height={32} />}
          <Box flexDirection="column">
            <Text size="heading" weight="semibold">
              Argos
            </Text>
            {tally && tallyLine(tally)}
          </Box>
        </Box>
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Text size="caption" dimColor>
            {vm.seen}
          </Text>
          <Button key="check" variant="secondary" dimColor={running} onPress={checkNow}>
            {running ? t(lang, 'ui_checking') : `↻  ${t(lang, 'ui_check')}`}
          </Button>
        </Box>
      </Box>
    )
    const svgIcon = (name: keyof typeof ICONS, alt: string, size = 14) =>
      hasSvg && <ui.Svg source={ICONS[name]} alt={alt} width={size} height={size} />
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
      <Box flexDirection="column" gap="lg" paddingX="lg" paddingY="md">
        {[first, status, ...body].filter(Boolean)}
      </Box>
    )
    // Every state but the list leads with the bare top row; the list puts it in its summary.
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

    const fill = (color: string) => (hasSvg ? color : undefined)
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

    type Repo = (typeof vm.repos)[number]
    // A count in a fixed slot, so the columns line up from row to row; a zero leaves the
    // slot empty. The terminal has no icons, so it writes the word and takes its width.
    const count = (id: string, c: Column, n: number) => (
      <Box key={`${id}:${c}`} flexDirection="row" alignItems="center" gap="xs" width={hasSvg ? 4 : undefined}>
        {n > 0 && svgIcon(c, t(lang, `chip_${c}`, n), 13)}
        {n > 0 && (
          <Text color={TONE[c]} weight="semibold" tabular>
            {hasSvg ? String(n) : t(lang, `chip_${c}`, n)}
          </Text>
        )}
      </Box>
    )
    // Puts one request in the prompt without sending it: appended on a new line when there
    // is a draft, never twice.
    const fillPrompt = async (request: string) => {
      const { text } = await $.prompt.read()
      if (!text.includes(request)) await $.prompt.fill(text.trim() ? { text: `\n${request}`, mode: 'append' } : { text: request, mode: 'replace' })
    }
    // One repo. Its line: the checkbox (the control that picks it), the name, the
    // counts in their slots, and the expand control: "2 PRs" with a chevron in the accent,
    // one button. Opened, each PR hangs under the repo on a tree elbow: its checkbox, its
    // title in the quieter caption size (the repo leads), its age and number, and at the
    // far right a short action in the signal's colour that puts that one PR in the prompt;
    // someone else's PR also offers Approve and Approve and merge, requests the person
    // sends from the prompt, so nothing reaches GitHub without them.
    // A repo is tinted only when all its PRs are picked; a partial pick shows in its box.
    const row = (x: Repo) => (
      <Box
        key={x.repo}
        flexDirection="column"
        justifyContent="center"
        backgroundColor={fill(x.pick === 'all' ? PICKED : LAYER)}
        borderStyle={hasSvg ? 'round' : undefined}
        borderColor={fill(x.pick === 'all' ? PICKED : LAYER)}
        paddingX="md"
        paddingY="sm"
      >
        <Box flexDirection="row" alignItems="center" gap="sm">
          {x.prs.length > 0 ? check(`box:${x.repo}`, x.pick, () => toggle(x.keys, x.pick !== 'all')) : <Text dimColor>{hasSvg ? '☐' : '[ ]'}</Text>}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text key={`name:${x.repo}`} weight="semibold" dimColor={x.prs.length === 0} wrap="truncate">
              {x.name}
            </Text>
          </Box>
          <Box flexDirection="row" alignItems="center" gap="xs">
            {COLUMNS.map(c => (!hasSvg && x.counts[c] === 0 ? null : count(x.repo, c, x.counts[c])))}
          </Box>
          <Box flexDirection="row" justifyContent="flex-end" marginLeft="md" width={hasSvg ? 9 : undefined}>
            {x.prs.length ? (
              <Button key={`open:${x.repo}`} plain={true} hover={{ color: 'claude' }} onPress={() => void update($, open, o => (o === x.repo ? '' : x.repo))}>
                <Text dimColor={!x.isOpen}>{t(lang, 'ui_prs', x.prs.length)}</Text>
                <Text color="claude" weight="semibold">{x.isOpen ? '  ▴' : '  ▾'}</Text>
              </Button>
            ) : (
              <Text dimColor>{t(lang, 'ui_prs', 0)}</Text>
            )}
          </Box>
        </Box>
        {x.isOpen ? (
          <Box flexDirection="column" gap="xs" paddingTop="sm">
            {x.prs.map(p => (
              <Box key={p.key} flexDirection="row" alignItems="center" gap="sm">
                {hasSvg ? <ui.Svg source={ICONS.elbow} alt={t(lang, 'ui_alt_in', x.name)} width={16} height={16} /> : <Text dimColor>└</Text>}
                {check(`box:${p.key}`, p.isPicked ? 'all' : 'none', () => toggle([p.key], !p.isPicked))}
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Button key={`pick:${p.key}`} plain={true} dimColor={true} hover={{ color: 'claude' }} onPress={() => toggle([p.key], !p.isPicked)}>
                    <Text size="caption" wrap="truncate">
                      {p.title}
                    </Text>
                  </Button>
                </Box>
                <Text size="caption" color={p.isMine ? 'claude' : undefined} dimColor={!p.isMine}>
                  {t(lang, 'ui_by', p.owner)}
                </Text>
                <Text size="caption" dimColor tabular>
                  {p.age}
                </Text>
                <Link href={p.url} label={`#${p.number}`} />
                {p.act && p.tone && (
                  <Button key={`act:${p.key}`} plain={true} hover={{ color: 'claude' }} onPress={() => void fillPrompt(p.prompt)}>
                    <Text size="caption" color={TONE[p.tone]} weight="semibold">
                      {`${p.act} ›`}
                    </Text>
                  </Button>
                )}
                {p.approve && (
                  <Button key={`approve:${p.key}`} plain={true} hover={{ color: 'claude' }} onPress={() => void fillPrompt(p.approve!)}>
                    <Text size="caption" color="success" weight="semibold">
                      {`${t(lang, 'ui_approve')} ›`}
                    </Text>
                  </Button>
                )}
                {p.approveMerge && (
                  <Button key={`merge:${p.key}`} plain={true} hover={{ color: 'claude' }} onPress={() => void fillPrompt(p.approveMerge!)}>
                    <Text size="caption" color="success" weight="semibold">
                      {`${t(lang, 'ui_approve_merge')} ›`}
                    </Text>
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
    )

    // The send bar: what will go (or why nothing can), and the one button of the pane.
    // The button stays pressable; with nothing picked it is secondary and the line beside
    // it says what to do. The prompt is filled, never sent.
    const { send } = vm
    const sendNow = async () => {
      if (send.block) return
      await fillPrompt(send.prompt)
      await update($, sent, () => send.key)
    }
    const footer = (
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
          <Text size="caption" dimColor={Boolean(send.block)}>
            {send.block ?? send.summary}
          </Text>
          {send.warn && !send.block && (
            <Text size="caption" color="warning">
              {send.warn}
            </Text>
          )}
        </Box>
        {vm.allKeys.length > 1 && (
          <Button key="pick-all" plain={true} dimColor={true} onPress={() => void update($, selected, () => (vm.allSelected ? [] : vm.allKeys))}>
            {vm.allSelected ? t(lang, 'ui_pick_none') : t(lang, 'ui_pick_all')}
          </Button>
        )}
        {running ? (
          <Button key="send" plain={true} dimColor={true} onPress={() => {}}>
            {t(lang, 'ui_checking')}
          </Button>
        ) : (
          <Button key="send" variant={send.block ? 'secondary' : 'primary'} onPress={() => void sendNow()}>
            {send.inPrompt ? t(lang, 'ui_in_prompt') : t(lang, 'ui_send', send.count)}
          </Button>
        )}
      </Box>
    )

    // The filters under the head, each with its count: the active one a real button, the
    // others plain and dim. Picks survive a switch; the send bar counts the hidden ones.
    const filters = (
      <Box key="filters" flexDirection="row" alignItems="center" flexWrap="wrap" gap="sm">
        {vm.filters.map(f =>
          f.isActive ? (
            <Button key={`filter:${f.id}`} variant="secondary" onPress={() => {}}>
              {f.label}
            </Button>
          ) : (
            <Button key={`filter:${f.id}`} plain={true} dimColor={true} onPress={() => void update($, filter, () => f.id)}>
              {f.label}
            </Button>
          ),
        )}
      </Box>
    )
    // The list ends with a way to watch one more repo: the same request as the empty state.
    const addRow = (
      <Box key="add-repo-row" flexDirection="row" alignItems="center" flexWrap="wrap" gap="sm" paddingX="md">
        <Button key="add-repo" plain={true} hover={{ color: 'claude' }} onPress={() => void addRepo($)}>
          <Text color="claude">{t(lang, 'ui_add_repo')}</Text>
        </Button>
        <Text size="caption" dimColor>
          {t(lang, 'ui_add_repo_hint')}
        </Text>
      </Box>
    )

    return frame(
      top(vm.counts),
      filters,
      <Box key="list" flexDirection="column" gap="sm">
        {vm.repos.map(row)}
        {addRow}
      </Box>,
      footer,
    )
  })
}
