// Argos mod: the peacock's eyes inside Claude. A timer runs one argos-pavo
// round, a band above the prompt shows what needs action, a toast announces
// what is new and /argos opens the full list in a pane.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import type { Item, Round } from '../types'

const PANE = 'argos'
const TITLE = 'Argos: vigília dos PRs'
const ROUND = { plugin: 'argos', key: 'round' } as const
const HIDDEN = { plugin: 'argos', key: 'isHidden' } as const
const round = atom(ROUND, null)
const isHidden = atom(HIDDEN, false)
let isRunning = false

const describe = (p: Item) =>
  p.kind === 'review' ? ['pede sua revisão', ...p.signals].join(', ') : p.signals.join(', ')

const days = (iso: string, now: number) => Math.floor((now - Date.parse(iso)) / 864e5)

const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 60),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '').split(/\s+/).filter(Boolean),
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
  if (isRunning) return
  const { minutes, account, qualifiers } = config(options)
  const last = await load($)
  const now = await $.clock.now()
  if (!force && last && now - Date.parse(last.at) < minutes * 6e4 - 3e4) return
  isRunning = true
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
    isRunning = false
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'argos', description: 'Argos: PRs que pedem ação (roda uma vigília agora)' })
    $.clock.every(config(options).minutes * 6e4, () => void tick($, options, false))
    $.clock.after(5_000, () => void tick($, options, false))
    return started
  })

  on('command.run', { command: 'argos' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await tick($, options, true)
    return { text: 'Argos: vigília rodada, painel aberto.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, round)
    const list = r?.pending ?? []
    if (e.props.hasSurvey || (await read($, isHidden)) || (!list.length && !r?.error)) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const first = list[0]
    return (
      <Box>
        {r?.error && <Text color="red">Argos: a vigília falhou. </Text>}
        {first && (
          <Text>
            👁 Argos: {list.length} PR(s) pedem ação · {first.repo.split('/')[1]}#{first.number} {describe(first)}{' '}
          </Text>
        )}
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
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, round)
    const now = await $.clock.now()
    const list = r?.pending ?? []

    return (
      <Box flexDirection="column">
        <Text dimColor>{r ? `Última vigília: ${new Date(r.at).toLocaleString()}` : 'Nenhuma vigília ainda. Rode /argos.'}</Text>
        {r?.error && <Text color="red">Erro: {r.error}</Text>}
        {r && !list.length && !r.error && <Text>Nenhum PR pede ação. 👁</Text>}
        {list.map(p => (
          <Text>
            {days(p.createdAt, now)}d · {p.repo}#{p.number} · {describe(p)} · {p.title}
          </Text>
        ))}
      </Box>
    )
  })
}
