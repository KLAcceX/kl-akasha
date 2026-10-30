import { expect, test } from 'claude-code/testing'

import { describe, grouped, visible } from './register'

const BAND = { plugin: 'argos', component: 'AbovePrompt', props: { hasSurvey: false } } as const
const PANE = {
  plugin: 'argos',
  component: 'Pane',
  requestId: 'argos',
  surface: 'desktop',
  props: { title: 'Argos', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const mine = {
  kind: 'mine',
  repo: 'acme/portal',
  number: 219,
  title: 'S3 migration',
  url: 'https://github.com/acme/portal/pull/219',
  author: 'me',
  createdAt: '2026-09-05T00:00:00Z',
  signals: ['conflict'],
} as const
const theirs = {
  kind: 'other',
  repo: 'acme/web',
  number: 7,
  title: 'Login fix',
  url: 'https://github.com/acme/web/pull/7',
  author: 'bia',
  createdAt: '2026-10-27T00:00:00Z',
  signals: ['no_review'],
} as const
const round = { at: '2026-10-29T12:00:00.000Z', me: 'me', repos: ['acme/portal', 'acme/web', 'acme/docs'], pending: [mine], others: [theirs] }

const stored = (values: Record<string, unknown>) => (_: unknown, e: { key: string }) =>
  e.key in values ? { value: { value: values[e.key], version: 1 } } : { value: { value: undefined, version: 0 } }

test('the band shows the count, the oldest PR and teammates waiting', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /pede/ }))?.text).toContain('portal#219 conflito')
    expect((await ui.find({ type: 'Text', text: /dos outros/ }))?.text).toContain('1 dos outros')
    await ui.unmount()
  }
})

test('the band speaks English by default', async ($, on) => {
  on('state.get', stored({ round }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /need/ }))?.text).toContain('portal#219 conflict')
  expect((await ui.find({ type: 'Text', text: /teammates/ }))?.text).toContain('1 from teammates')
  await ui.unmount()
})

test('the band says it is watching while a round runs', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round, isRunning: true }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /vigiando/ }))?.text).toContain('vigiando')
  await ui.unmount()
})

test('the band stays out of the way when nothing needs action', async ($, on) => {
  on('state.get', stored({ round: { at: round.at, pending: [], others: [] } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the pane groups by repo, empty connected repos included', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round, view: 'all' }))
  on('clock.now', () => ({ value: Date.parse('2026-10-29T12:00:00Z') }))
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /acme\/portal · 1/ }))?.text).toBe('acme/portal · 1')
  expect((await ui.find({ type: 'Text', text: /acme\/docs · 0/ }))?.text).toBe('acme/docs · 0')
  expect((await ui.find({ type: 'Text', text: /#7/ }))?.text).toContain('@bia · sem review > 1 dia')
  await ui.unmount()
})

test('the pane asks for a repo when none is connected', async ($, on) => {
  on('state.get', stored({ round: { at: round.at, repos: [], pending: [], others: [], needsRepos: true } }))
  on('clock.now', () => ({ value: Date.parse('2026-10-29T12:00:00Z') }))
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /repos add/ }))?.text).toContain('/argos repos add')
  await ui.unmount()
})

test('views and the author filter pick the right PRs', () => {
  expect(visible(round as never, 'fix', '').map(p => p.number)).toEqual([219])
  expect(visible(round as never, 'others', '').map(p => p.number)).toEqual([7])
  expect(visible(round as never, 'all', '').map(p => p.number)).toEqual([219, 7])
  expect(visible(round as never, 'all', 'bia').map(p => p.number)).toEqual([7])
  expect(visible(round as never, 'all', 'me').map(p => p.number)).toEqual([219])
  expect(grouped([mine as never], ['acme/web']).map(g => `${g.repo}:${g.items.length}`)).toEqual(['acme/web:0', 'acme/portal:1'])
})

test('signal codes read as words in each language', () => {
  expect(describe({ ...mine, signals: ['threads:2', 'conflict'] } as never, 'pt-BR')).toBe('2 thread(s) sem resposta, conflito')
  expect(describe({ ...mine, signals: ['threads:2', 'conflict'] } as never, 'en')).toBe('2 unanswered thread(s), conflict')
  expect(describe({ ...theirs, signals: [] } as never, 'en')).toBe('in progress')
})
