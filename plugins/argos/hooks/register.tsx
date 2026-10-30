// Argos mod: the peacock's eyes inside Claude. A timer runs one argos-pavo
// round over the connected repos, a band above the prompt shows what needs
// action (the KL zoom animates while a round runs), a toast announces what is
// new and /argos opens the pane: grouped by repo, filtered by view and author.
// Words come from the skills' i18n.mjs, in the plugin's `language` option.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { label, t } from '../skills/argos-ward/scripts/i18n.mjs'
import type { Item, Round, View } from '../types'

const PANE = 'argos'
const ROUND = { plugin: 'argos', key: 'round' } as const
const HIDDEN = { plugin: 'argos', key: 'isHidden' } as const
const RUNNING = { plugin: 'argos', key: 'isRunning' } as const
const round = atom(ROUND, null)
const isHidden = atom(HIDDEN, false)
const isRunning = atom(RUNNING, false)
const view = atom({ plugin: 'argos', key: 'view' } as const, 'fix' as View)
const author = atom({ plugin: 'argos', key: 'author' } as const, '')

// The KL · Akasha mark (brand/kl/final): the zoom on the face is the icon; the
// animated one travels from the whole mark to the face and back.
const MARK =
  '<g transform="translate(-6 0)"><path fill="#51408A" d="M40 40H96V136Q96 160 120 160H200A28 28 0 0 1 200 216H40Z"/>' +
  '<path fill="#7E5CC0" d="M104 96L160 40A56 56 0 0 1 160 152Z"/><path fill="#A98BE0" d="M160 40L104 96L160 152L122 96Z"/>' +
  '<path fill="#F3EEFB" d="M172 68L178 90L200 96L178 102L172 124L166 102L144 96L166 90Z"/></g>'
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="66 20 156 156"><defs><clipPath id="t"><rect x="66" y="20" width="156" height="156" rx="30"/></clipPath></defs>' +
  `<g clip-path="url(#t)"><rect x="0" y="0" width="256" height="256" fill="#1E1430"/>${MARK}</g></svg>`
const LOADING =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><animate attributeName="viewBox" values="0 0 256 256;66 20 156 156;0 0 256 256" dur="1.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.65 0 0.35 1;0.65 0 0.35 1"/>' +
  `<rect x="-200" y="-200" width="656" height="656" rx="48" fill="#1E1430"/>${MARK}</svg>`

export const describe = (p: Item, lang: string) => {
  const words = p.signals.map(c => label(lang, c))
  if (p.kind === 'review') return [t(lang, 'asks_review'), ...words].join(', ')
  if (p.kind === 'other') return words.join(', ') || t(lang, 'idle_other')
  return words.join(', ')
}

const days = (iso: string, now: number) => Math.floor((now - Date.parse(iso)) / 864e5)

const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 60),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '').split(/\s+/).filter(Boolean),
  lang: String(options.language ?? 'en'),
})

// Which items a view shows, oldest first; the author filter narrows any view.
export function visible(r: Round | null, v: View, who: string) {
  const fix = r?.pending ?? []
  const others = r?.others ?? []
  const list = v === 'fix' ? fix : v === 'others' ? others : [...fix, ...others]
  const me = r?.me ?? ''
  return list
    .filter(p => !who || (p.author || me) === who)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// The same items in repo groups, connected repos first even when empty.
export function grouped(items: Item[], repos: string[]) {
  const names = [...new Set([...repos, ...items.map(p => p.repo)])]
  return names.map(repo => ({ repo, items: items.filter(p => p.repo === repo) }))
}

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
    await $.state.set(ROUND, { ...(value ?? {}), at: new Date(now).toISOString(), error: String(err) })
  } finally {
    await $.state.set(RUNNING, false)
  }
}

export const register: Register = (on, options) => {
  const { lang } = config(options)
  const title = t(lang, 'ui_title')

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'argos', description: t(lang, 'ui_command') })
    $.clock.every(config(options).minutes * 6e4, () => void tick($, options, false))
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
    await $.ui.open({ id: PANE, title })
    void tick($, options, true)
    return { text: t(lang, 'ui_opened') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, round)
    const running = await read($, isRunning)
    const list = r?.pending ?? []
    const late = (r?.others ?? []).filter(p => p.signals.length).length
    if (e.props.hasSurvey || (await read($, isHidden)) || (!running && !list.length && !late && !r?.error)) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const mark =
      'Svg' in ui ? (
        <ui.Svg source={running ? LOADING : ICON} alt="KL · Akasha" width={18} height={18} isInteractive={running} />
      ) : (
        <Text color="magenta">◆ </Text>
      )
    const first = list[0]
    return (
      <Box>
        {mark}
        <Text> Argos </Text>
        {running && <Text dimColor>{t(lang, 'ui_watching')} </Text>}
        {!running && r?.error && <Text color="red">{t(lang, 'ui_failed')} · </Text>}
        {!running && first && (
          <Text>
            {t(lang, 'ui_needs', list.length)} · {first.repo.split('/')[1]}#{first.number} {describe(first, lang)}{' '}
          </Text>
        )}
        {!running && late > 0 && <Text dimColor>· {t(lang, 'ui_others', late)} </Text>}
        <Button key="open" onPress={() => void $.ui.open({ id: PANE, title })}>
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
    const r = await read($, round)
    const v = await read($, view)
    const who = await read($, author)
    const running = await read($, isRunning)
    const now = await $.clock.now()
    const me = r?.me ?? ''
    const authors = [...new Set([me, ...(r?.others ?? []).map(p => p.author ?? '')].filter(Boolean))]
    const groups = grouped(visible(r, v, who), r?.repos ?? [])
    const tab = (id: View, word: string, n: number) => (
      <Button key={id} variant={v === id ? 'primary' : undefined} onPress={() => void update($, view, () => id)}>
        {word} {n}
      </Button>
    )
    const nextAuthor = authors[(authors.indexOf(who) + 1) % (authors.length + 1)] ?? ''
    const status = running ? t(lang, 'ui_watching') : r ? t(lang, 'ui_last', new Date(r.at).toLocaleTimeString()) : t(lang, 'ui_never')

    return (
      <Box flexDirection="column">
        <Box>
          {'Svg' in ui && <ui.Svg source={running ? LOADING : ICON} alt="KL · Akasha" width={28} height={28} isInteractive={running} />}
          <Text bold> Argos </Text>
          <Text dimColor>{status}</Text>
        </Box>
        <Box>
          {tab('fix', t(lang, 'ui_fix'), (r?.pending ?? []).length)}
          {tab('others', t(lang, 'ui_team'), (r?.others ?? []).length)}
          {tab('all', t(lang, 'ui_all'), (r?.pending ?? []).length + (r?.others ?? []).length)}
          <Button key="who" onPress={() => void update($, author, () => nextAuthor)}>
            {t(lang, 'ui_author', who ? `@${who}` : '')}
          </Button>
        </Box>
        {r?.error && (
          <Text color="red">
            {t(lang, 'error')}: {r.error}
          </Text>
        )}
        {!(r?.repos ?? []).length && <Text dimColor>Argos: {t(lang, 'no_repos')}</Text>}
        {groups.map(g => (
          <Box key={g.repo} flexDirection="column">
            <Text bold>
              {g.repo} · {g.items.length}
            </Text>
            {!g.items.length && <Text dimColor>  {t(lang, 'ui_empty')}</Text>}
            {g.items.map(p => (
              <Text>
                {'  '}
                {days(p.createdAt, now)}d · #{p.number} · {p.kind === 'other' ? `@${p.author} · ` : ''}
                {describe(p, lang)} · {p.title}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
