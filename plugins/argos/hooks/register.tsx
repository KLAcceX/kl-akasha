// Argos mod: the peacock's eyes inside Claude. A timer runs one argos-pavo
// round over the connected repos, a band above the prompt shows what needs
// action (the KL zoom animates while a round runs), a toast announces what is
// new and /argos opens the pane: grouped by repo, filtered by view and author.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import type { Item, Round, View } from '../types'

const PANE = 'argos'
const TITLE = 'Argos · vigília dos PRs'
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

const describe = (p: Item) =>
  p.kind === 'review'
    ? ['pede sua revisão', ...p.signals].join(', ')
    : p.kind === 'other'
      ? p.signals.join(', ') || 'em andamento'
      : p.signals.join(', ')

const days = (iso: string, now: number) => Math.floor((now - Date.parse(iso)) / 864e5)

const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 60),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '').split(/\s+/).filter(Boolean),
})

// "git@github.com:acme/api.git", "https://github.com/acme/api" or an SSH host
// alias such as "git@github-work:acme/api.git" → "acme/api"
export const repoFromRemote = (url: string) =>
  url.trim().match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?[^:/]*github[^:/]*[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/)?.[1]

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

async function dir($: any) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return `${home}/.claude/kl-akasha/argos`
}

async function readRepos($: any): Promise<{ path: string; repo: string }[]> {
  try {
    return JSON.parse(await $.fs.read(`${await dir($)}/repos.json`))
  } catch {
    return []
  }
}

// Shows what the last round (from any session) wrote.
async function load($: any): Promise<Round | null> {
  try {
    const last: Round = JSON.parse(await $.fs.read(`${await dir($)}/last-round.json`))
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
  const { minutes, account, qualifiers } = config(options)
  const last = await load($)
  const now = await $.clock.now()
  if (!force && last && now - Date.parse(last.at) < minutes * 6e4 - 3e4) return
  await $.state.set(RUNNING, true)
  try {
    const argv = ['node', `${$.plugin.root}/skills/argos-pavo/scripts/pavo.mjs`, ...qualifiers, '--json']
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

// /argos repos [add <folder> | remove <owner/repo or folder>]
async function repos($: any, args: string[]) {
  const list = await readRepos($)
  const [verb, ...rest] = args
  const target = rest.join(' ').trim()
  if (verb === 'add' && target) {
    const { exitCode, stdout } = await $.process.run(['git', '-C', target, 'remote', 'get-url', 'origin'])
    const repo = exitCode === 0 ? repoFromRemote(stdout) : undefined
    if (!repo) return `Argos: ${target} não tem um remote origin do GitHub.`
    const next = [...list.filter(r => r.repo !== repo), { path: target, repo }]
    await $.fs.write(`${await dir($)}/repos.json`, JSON.stringify(next, null, 2))
    return `Argos: ${repo} conectado (${next.length} repositório(s)).`
  }
  if (verb === 'remove' && target) {
    const next = list.filter(r => r.repo !== target && r.path !== target)
    await $.fs.write(`${await dir($)}/repos.json`, JSON.stringify(next, null, 2))
    return next.length < list.length ? `Argos: ${target} desconectado.` : `Argos: ${target} não estava conectado.`
  }
  if (!list.length) return 'Argos: nenhum repositório conectado. Use /argos repos add <pasta>.'
  return ['Argos: repositórios conectados', ...list.map(r => `- ${r.repo}  (${r.path})`)].join('\n')
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'argos',
      description: 'Argos: painel dos PRs · /argos repos [add <pasta> | remove <repo>]',
    })
    $.clock.every(config(options).minutes * 6e4, () => void tick($, options, false))
    $.clock.after(5_000, () => void tick($, options, false))
    return started
  })

  on('command.run', { command: 'argos' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    if (args[0] === 'repos') {
      const text = await repos($, args.slice(1))
      if (args[1] === 'add' || args[1] === 'remove') void tick($, options, true)
      return { text }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    void tick($, options, true)
    return { text: 'Argos: painel aberto, vigília rodando.' }
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
        {running && <Text dimColor>vigiando… </Text>}
        {!running && r?.error && <Text color="red">a vigília falhou · </Text>}
        {!running && first && (
          <Text>
            {list.length} pede(m) ação · {first.repo.split('/')[1]}#{first.number} {describe(first)}{' '}
          </Text>
        )}
        {!running && late > 0 && <Text dimColor>· {late} dos outros esperando olhar </Text>}
        <Button key="open" onPress={() => void $.ui.open({ id: PANE, title: TITLE })}>
          Ver
        </Button>
        <Button key="hide" role="dismiss" onPress={() => void update($, isHidden, () => true)}>
          Ocultar
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
    const items = visible(r, v, who)
    const groups = grouped(items, r?.repos ?? [])
    const tab = (id: View, label: string, n: number) => (
      <Button key={id} variant={v === id ? 'primary' : undefined} onPress={() => void update($, view, () => id)}>
        {label} {n}
      </Button>
    )
    const nextAuthor = authors[(authors.indexOf(who) + 1) % (authors.length + 1)] ?? ''

    return (
      <Box flexDirection="column">
        <Box>
          {'Svg' in ui && <ui.Svg source={running ? LOADING : ICON} alt="KL · Akasha" width={28} height={28} isInteractive={running} />}
          <Text bold> Argos </Text>
          <Text dimColor>
            {running ? 'vigiando…' : r ? `última vigília ${new Date(r.at).toLocaleTimeString()}` : 'nenhuma vigília ainda'}
          </Text>
        </Box>
        <Box>
          {tab('fix', 'Pra corrigir', (r?.pending ?? []).length)}
          {tab('others', 'Dos outros', (r?.others ?? []).length)}
          {tab('all', 'Tudo', (r?.pending ?? []).length + (r?.others ?? []).length)}
          <Button key="who" onPress={() => void update($, author, () => nextAuthor)}>
            Autor: {who ? `@${who}` : 'todos'}
          </Button>
        </Box>
        {r?.error && <Text color="red">Erro: {r.error}</Text>}
        {!(r?.repos ?? []).length && <Text dimColor>Nenhum repositório conectado: /argos repos add {'<pasta>'}</Text>}
        {groups.map(g => (
          <Box key={g.repo} flexDirection="column">
            <Text bold>
              {g.repo} · {g.items.length}
            </Text>
            {!g.items.length && <Text dimColor>  nada aqui</Text>}
            {g.items.map(p => (
              <Text>
                {'  '}
                {days(p.createdAt, now)}d · #{p.number} · {p.kind === 'other' ? `@${p.author} · ` : ''}
                {describe(p)} · {p.title}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
