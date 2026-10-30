// Argos mod: the peacock's eyes inside Claude. A timer runs one argos-pavo round over
// the connected repos. The band above the prompt shows the most urgent PR; /argos opens
// the pane: one row per repo with what it holds (open comments, changed since my review,
// blocked, review requested), a box to pick it, and one button that sends the picked
// repos' PRs to the AI. Words and numbers come from toViewModel (view.ts).
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../skills/argos-ward/scripts/i18n.mjs'
import { COLUMNS, UI, toViewModel } from './view'
import type { Column } from './view'
import type { Round } from '../types'

export { byRank, cells, prompt, rank, reason, toViewModel, verb } from './view'

const PANE = 'argos'
const ROUND = { plugin: 'argos', key: 'round' } as const
const HIDDEN = { plugin: 'argos', key: 'isHidden' } as const
const RUNNING = { plugin: 'argos', key: 'isRunning' } as const
const round = atom(ROUND, null)
const isHidden = atom(HIDDEN, false)
const isRunning = atom(RUNNING, false)
const selected = atom({ plugin: 'argos', key: 'selected' } as const, UI.selected)
const open = atom({ plugin: 'argos', key: 'open' } as const, UI.open)
const sent = atom({ plugin: 'argos', key: 'sent' } as const, UI.sent)

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

// Column icons: Tabler Icons outlines (MIT, tabler.io/icons), a mid grey that reads in
// both themes; the octagon is the one in colour. The terminal draws the letter instead.
const PATHS: Record<Column, string> = {
  comments:
    '<path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"/>',
  changed: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
  blocked:
    '<path d="M8.7 3h6.6l4.7 4.7v6.6l-4.7 4.7h-6.6l-4.7 -4.7v-6.6z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  review:
    '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>',
}
const svgIcon = (c: Column) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c === 'blocked' ? RED : '#8A8F98'}" ` +
  `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[c]}</svg>`
const LETTER: Record<Column, string> = { comments: 'C', changed: 'A', blocked: 'B', review: 'R' }
// Below this many cells a repo's counts go on their own line under its name.
const NARROW = 52

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
  try {
    const last: Round = JSON.parse(await $.fs.read(await roundFile($)))
    await $.state.set(ROUND, last)
    return last
  } catch {
    return null
  }
}

// One round. Open sessions share last-round.json: a session skips the round
// when another one ran it within the interval, and only shows it.
async function tick($: any, options: PluginOptions, force: boolean) {
  if ((await $.state.get(RUNNING)).value) return
  const { minutes, account, qualifiers, lang } = config(options)
  const last = await load($)
  const now = await $.clock.now()
  if (!force && last && now - Date.parse(last.at) < minutes * 6e4 - 3e4) return
  await $.state.set(RUNNING, true)
  try {
    const argv = ['node', `${$.plugin.root}/skills/argos-pavo/scripts/pavo.mjs`, ...qualifiers, '--lang', lang, '--json']
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
  const { lang, minutes } = config(options)
  const title = t(lang, 'ui_title')

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await load($)
    await $.command.register({ name: 'argos', description: t(lang, 'ui_command') })
    $.clock.every(minutes * 6e4, () => void tick($, options, false))
    $.clock.after(5_000, () => void tick($, options, false))
    return started
  })

  // /argos opens the pane; /argos repos [add <folder> | remove <repo>] goes through repos.mjs,
  // the same command the AI uses from the argos-pavo skill.
  on('command.run', { command: 'argos' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    if (args[0] === 'repos') {
      const { stdout, stderr } = await $.process.run([
        'node',
        `${$.plugin.root}/skills/argos-pavo/scripts/repos.mjs`,
        ...(args.length > 1 ? args.slice(1) : ['list']),
        '--lang',
        lang,
      ])
      if (args[1] === 'add' || args[1] === 'remove') void tick($, options, true)
      return { text: (stdout || stderr).trim() }
    }
    await load($)
    await $.ui.open({ id: PANE, title })
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
        <Button key="open" onPress={() => void load($).then(() => $.ui.open({ id: PANE, title }))}>
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
    const isNarrow = (e.viewport?.columns ?? 80) < NARROW
    const running = await read($, isRunning)
    const vm = toViewModel(await read($, round), {
      now: await $.clock.now(),
      lang,
      minutes,
      running,
      ui: { selected: await read($, selected), open: await read($, open), sent: await read($, sent) },
    })
    // tick returns at once while a round runs, so pressing twice does nothing
    const checkNow = () => void tick($, options, true)

    const header = (
      <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
        {hasSvg && <ui.Svg source={ICON} alt="KL · Akasha" width={16} height={16} />}
        <Text weight="semibold">Argos</Text>
        <Text size="caption" dimColor wrap="truncate">
          {vm.seen}
        </Text>
        <Box flexGrow={1} />
        <Button key="check" plain={true} hotkey="r" dimColor={running} onPress={checkNow}>
          {running ? t(lang, 'ui_checking') : t(lang, 'ui_check')}
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
    const page = (...body: any[]) => (
      <Box flexDirection="column" gap="md" padding="md">
        {header}
        {status}
        {body}
      </Box>
    )

    if (vm.state === 'loading') return page(<Text key="b">{t(lang, 'ui_loading')}</Text>)
    if (vm.state === 'never') return page(<Text key="b">{t(lang, 'ui_never')}</Text>)
    if (vm.state === 'noData') return page(<Text key="b">{t(lang, 'ui_no_data')}</Text>)
    if (vm.state === 'noPRs') return page(<Text key="b">{t(lang, 'ui_no_prs', vm.repos)}</Text>)
    if (vm.state === 'noRepos')
      return page(
        <Box key="b" flexDirection="column" gap="sm">
          <Text size="heading" weight="semibold">
            {t(lang, 'ui_no_repos_title')}
          </Text>
          <Text>{t(lang, 'ui_no_repos_body')}</Text>
          <Code source="/argos repos add <folder>" />
          <Box flexDirection="row">
            <Button
              key="connect"
              variant="primary"
              onPress={async () => {
                const { text } = await $.prompt.read()
                if (!text.includes('/argos repos add')) await $.prompt.fill({ text: '/argos repos add ', mode: 'replace' })
              }}
            >
              {t(lang, 'ui_connect')}
            </Button>
          </Box>
        </Box>,
      )
    // narrows vm for TypeScript; every other state returned above
    if (vm.state !== 'ok') return page()

    const icon = (c: Column) =>
      hasSvg ? (
        <ui.Svg source={svgIcon(c)} alt={t(lang, `ui_col_${c}`)} width={14} height={14} />
      ) : (
        <Text color={c === 'blocked' ? RED : undefined} dimColor={c !== 'blocked'}>
          {LETTER[c]}
        </Text>
      )
    // One count: icon and number, in a fixed slot so the columns line up; a zero leaves
    // the slot empty, so the eye only meets what is there.
    const cell = (repo: string, c: Column, n: number, slot: boolean) =>
      n > 0 ? (
        <Box key={`${repo}:${c}`} flexDirection="row" alignItems="center" gap="xs" width={slot ? 6 : undefined}>
          {icon(c)}
          <Text tabular color={c === 'blocked' ? RED : undefined} weight={c === 'blocked' ? 'semibold' : undefined}>
            {String(n)}
          </Text>
        </Box>
      ) : (
        slot && <Box key={`${repo}:${c}`} width={6} />
      )
    const toggle = (repo: string) => () =>
      void update($, selected, list => (list.includes(repo) ? list.filter(x => x !== repo) : [...list, repo]))

    type Repo = Extract<typeof vm, { state: 'ok' }>['repos'][number]
    const repoRow = (x: Repo) => {
      const box = hasSvg ? (x.isSelected ? '☑' : '☐') : x.isSelected ? '[x]' : '[ ]'
      const name = (
        <Box key="name" flexDirection="row" alignItems="center" gap="xs" flexGrow={1} flexShrink={1} minWidth={0}>
          <Button key={`pick:${x.repo}`} plain={true} onPress={toggle(x.repo)}>
            {`${box} ${x.name}`}
          </Button>
          <Button key={`open:${x.repo}`} plain={true} dimColor={true} onPress={() => void update($, open, o => (o === x.repo ? '' : x.repo))}>
            {x.isOpen ? '▾' : '▸'}
          </Button>
        </Box>
      )
      const prs = x.isOpen && (
        <Box key="prs" flexDirection="column" gap="xs" paddingLeft="lg">
          {x.prs.map(p => (
            <Box key={p.key} flexDirection="row" alignItems="center" gap="sm">
              <Link href={p.url} label={`#${p.number}`} />
              <Text wrap="truncate">
                {p.verb} · {p.title}
              </Text>
            </Box>
          ))}
        </Box>
      )
      return isNarrow ? (
        <Box key={x.repo} flexDirection="column" gap="xs">
          {name}
          <Box flexDirection="row" flexWrap="wrap" gap="md" paddingLeft="lg">
            {COLUMNS.map(c => cell(x.repo, c, x.counts[c], false))}
          </Box>
          {prs}
        </Box>
      ) : (
        <Box key={x.repo} flexDirection="column" gap="xs">
          <Box flexDirection="row" alignItems="center" gap="sm">
            {name}
            {COLUMNS.map(c => cell(x.repo, c, x.counts[c], true))}
          </Box>
          {prs}
        </Box>
      )
    }

    // Puts the picked repos' PRs in the prompt without sending: appended on a new line
    // when there is a draft, never twice. The button says "In prompt ✓" until the next round.
    const { send } = vm
    const sendNow = async () => {
      if (!send.count) return
      const { text } = await $.prompt.read()
      if (!text.includes(send.prompt))
        await $.prompt.fill(text.trim() ? { text: `\n${send.prompt}`, mode: 'append' } : { text: send.prompt, mode: 'replace' })
      await update($, sent, () => send.key)
    }

    return page(
      vm.repos.length === 0 ? (
        <Text key="clear" size="heading" weight="semibold">
          {t(lang, 'ui_nothing')}
        </Text>
      ) : (
        <Box key="list" flexDirection="column" gap="sm">
          <Text size="caption" dimColor>
            {t(lang, 'ui_pick')}
          </Text>
          {vm.repos.map(repoRow)}
        </Box>
      ),
      vm.clean > 0 && (
        <Text key="clean" size="caption" dimColor>
          {t(lang, 'ui_clean', vm.clean)}
        </Text>
      ),
      vm.repos.length > 0 && (
        <Box key="legend" flexDirection="row" flexWrap="wrap" columnGap="md" rowGap="xs">
          {COLUMNS.map(c => (
            <Box key={c} flexDirection="row" alignItems="center" gap="xs">
              {icon(c)}
              <Text size="caption" dimColor>
                {t(lang, `ui_col_${c}`)}
              </Text>
            </Box>
          ))}
        </Box>
      ),
      vm.repos.length > 0 && (
        <Box key="send" flexDirection="row">
          {send.count ? (
            <Button key="send" variant="primary" onPress={() => void sendNow()}>
              {send.inPrompt ? t(lang, 'ui_in_prompt') : t(lang, 'ui_send', send.count)}
            </Button>
          ) : (
            <Button key="send" plain={true} dimColor={true} onPress={() => {}}>
              {t(lang, 'ui_send', 0)}
            </Button>
          )}
        </Box>
      ),
    )
  })
}
