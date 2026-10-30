// Argos mod: the peacock's eyes inside Claude. A timer runs one argos-pavo round over
// the connected repos. The band above the prompt shows the most urgent PR; /argos opens
// the pane: one work list in two sections ("For you" open, "Team" folded), the first
// row expanded as the next action, and the age of open PRs in the footer.
// Words and numbers come from toViewModel (view.ts), in the plugin's `language` option.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../skills/argos-ward/scripts/i18n.mjs'
import { STEP, UI, toViewModel } from './view'
import type { Round } from '../types'

export { ageShort, ageStrip, byRank, rank, reason, toViewModel, verb } from './view'

const PANE = 'argos'
const ROUND = { plugin: 'argos', key: 'round' } as const
const HIDDEN = { plugin: 'argos', key: 'isHidden' } as const
const RUNNING = { plugin: 'argos', key: 'isRunning' } as const
const round = atom(ROUND, null)
const isHidden = atom(HIDDEN, false)
const isRunning = atom(RUNNING, false)
const expanded = atom({ plugin: 'argos', key: 'expanded' } as const, UI.expanded)
const teamOpen = atom({ plugin: 'argos', key: 'teamOpen' } as const, UI.teamOpen)
const youLimit = atom({ plugin: 'argos', key: 'youLimit' } as const, UI.youLimit)
const teamLimit = atom({ plugin: 'argos', key: 'teamLimit' } as const, UI.teamLimit)
const sent = atom({ plugin: 'argos', key: 'sent' } as const, UI.sent)
const copied = atom({ plugin: 'argos', key: 'copied' } as const, UI.copied)

// The KL · Akasha mark (brand/kl/final): the face centred in a full L-coloured frame,
// on its own dark ground so it reads in both themes.
const GLYPH =
  '<path fill="#7E5CC0" d="M104 96L160 40A56 56 0 0 1 160 152Z"/><path fill="#A98BE0" d="M160 40L104 96L160 152L122 96Z"/>' +
  '<path fill="#F3EEFB" d="M172 68L178 90L200 96L178 102L172 124L166 102L144 96L166 90Z"/>'
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="56" fill="#1E1430"/>' +
  '<rect x="22" y="22" width="212" height="212" rx="40" fill="none" stroke="#51408A" stroke-width="18"/>' +
  `<g transform="translate(128 128) scale(1.25) translate(-160 -96)">${GLYPH}</g></svg>`
const PURPLE = '#7E5CC0'
const RED = '#E5384A'

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
    const stuck = vm.state === 'ok' ? (vm.team?.stuck ?? 0) : 0
    if (e.props.hasSurvey || (await read($, isHidden)) || (!running && !band && !stuck && !vm.status)) return next(e)

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
        {!running && stuck > 0 && <Text dimColor>· {t(lang, 'ui_others', stuck)} </Text>}
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
    const running = await read($, isRunning)
    const vm = toViewModel(await read($, round), {
      now: await $.clock.now(),
      lang,
      minutes,
      running,
      ui: {
        expanded: await read($, expanded),
        teamOpen: await read($, teamOpen),
        youLimit: await read($, youLimit),
        teamLimit: await read($, teamLimit),
        sent: await read($, sent),
        copied: await read($, copied),
      },
    })
    // tick returns at once while a round runs, so pressing twice does nothing
    const checkNow = () => void tick($, options, true)

    const header = (
      <Box flexDirection="row" alignItems="center" gap="sm">
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

    type Row = (typeof vm.you.rows)[number]
    // Puts the request in the prompt without sending it: appended on a new line when
    // there is a draft, never twice. The label says "In prompt ✓" until the next round.
    const putInPrompt = async (row: Row) => {
      if (!row.ai) return
      const { text } = await $.prompt.read()
      if (!text.includes(row.ai.prompt))
        await $.prompt.fill(text.trim() ? { text: `\n${row.ai.prompt}`, mode: 'append' } : { text: row.ai.prompt, mode: 'replace' })
      await update($, sent, () => `${vm.at}|${row.key}`)
    }
    const copy = (row: Row) => async (press: any) => {
      const res = await $.ui.copy({ text: row.url, surface: press.surface })
      await update($, copied, () => (res.isCopied ? row.key : `fail:${row.key}`))
      $.clock.after(2_000, () => void update($, copied, () => ''))
    }

    // The active row: the one with a border, a heading and the only primary button.
    const active = (row: Row) => (
      <Box key={row.key} flexDirection="column" gap="sm" padding="md" borderStyle="round" borderColor={PURPLE}>
        <Text size="heading" weight="semibold">
          {row.verb}
        </Text>
        <Text>{row.fullTitle}</Text>
        <Text size="caption" dimColor>
          {row.metaLong}
        </Text>
        {!hasSvg && <Text dimColor>{row.url}</Text>}
        <Box flexDirection="row" flexWrap="wrap" gap="sm" alignItems="center">
          {row.ai && (
            <Button key={`ai:${row.key}`} variant="primary" onPress={() => void putInPrompt(row)}>
              {row.inPrompt ? t(lang, 'ui_in_prompt') : row.ai.label}
            </Button>
          )}
          <Link href={row.url} label={t(lang, 'ui_open_github')} />
          <Button key={`copy:${row.key}`} plain={true} onPress={copy(row)}>
            {row.copyLabel}
          </Button>
          <Button key={`close:${row.key}`} plain={true} dimColor={true} onPress={() => void update($, expanded, () => '-')}>
            {t(lang, 'ui_close')}
          </Button>
        </Box>
      </Box>
    )
    const line = (row: Row) =>
      row.isActive ? (
        active(row)
      ) : (
        <Box key={row.key} flexDirection="row" alignItems="center" gap="sm">
          <Text mono tabular dimColor>
            {row.age}
          </Text>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text wrap="truncate">{row.title}</Text>
            <Text size="caption" dimColor wrap="truncate">
              {row.meta}
            </Text>
          </Box>
          <Button key={`open:${row.key}`} plain={true} onPress={() => void update($, expanded, () => row.key)}>
            {t(lang, 'ui_actions')}
          </Button>
        </Box>
      )
    const more = (id: string, n: number, onPress: () => void) =>
      n > 0 && (
        <Box key={`more:${id}`} flexDirection="row">
          <Button plain={true} onPress={onPress}>
            {t(lang, 'ui_show_more', n)}
          </Button>
        </Box>
      )
    const { you, team, age } = vm

    return page(
      <Box key="you" flexDirection="column" gap="sm">
        <Box flexDirection="row" gap="sm">
          <Text size="caption" weight="semibold">
            {t(lang, 'ui_for_you', you.count)}
          </Text>
          <Box flexGrow={1} />
          <Text size="caption" dimColor>
            {t(lang, 'ui_of_mine', you.mineOpen)}
          </Text>
        </Box>
        {you.count === 0 ? (
          <Box flexDirection="column" gap="xs">
            <Text size="heading" weight="semibold">
              {t(lang, 'ui_all_clear')}
            </Text>
            <Text size="caption" dimColor>
              {t(lang, 'ui_all_clear_sub', you.mineOpen, vm.seenTime)}
            </Text>
          </Box>
        ) : (
          you.rows.map(line)
        )}
        {more('you', you.more, () => void update($, youLimit, l => l + STEP))}
      </Box>,
      team && (
        <Box key="team" flexDirection="column" gap="sm">
          <Box flexDirection="row">
            <Button plain={true} onPress={() => void update($, teamOpen, o => !o)}>
              {team.label}
            </Button>
          </Box>
          {team.rows.map(line)}
          {more('team', team.more, () => void update($, teamLimit, l => l + STEP))}
        </Box>
      ),
      <Box key="age" flexDirection="row" flexWrap="wrap" gap="md" alignItems="center">
        {hasSvg && <ui.Svg source={age.svg} alt={age.line} width={240} height={40} isInteractive={false} />}
        <Box flexDirection="column" gap="xs" flexGrow={1}>
          <Text size="caption">{t(lang, 'ui_age_of', age.total)}</Text>
          <Box flexDirection="row" gap="xs" flexWrap="wrap" alignItems="center">
            <Text size="caption">{t(lang, 'ui_oldest', age.oldest.age)}</Text>
            <Link href={age.oldest.url} label={`#${age.oldest.number}`} />
            <Text size="caption">· {age.oldest.repo}</Text>
          </Box>
          <Text size="caption" dimColor tabular>
            {age.line}
          </Text>
        </Box>
      </Box>,
    )
  })
}
