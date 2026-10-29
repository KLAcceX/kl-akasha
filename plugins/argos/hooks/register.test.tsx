import { expect, test } from 'claude-code/testing'

const BAND = { plugin: 'argos', component: 'AbovePrompt', props: { hasSurvey: false } } as const

const round = {
  at: '2026-10-29T12:00:00.000Z',
  pending: [
    {
      kind: 'mine',
      repo: 'acme/portal',
      number: 219,
      title: 'S3 migration',
      url: 'https://github.com/acme/portal/pull/219',
      createdAt: '2026-09-05T00:00:00Z',
      signals: ['conflito'],
    },
    {
      kind: 'review',
      repo: 'acme/web',
      number: 7,
      title: 'Login fix',
      url: 'https://github.com/acme/web/pull/7',
      createdAt: '2026-10-27T00:00:00Z',
      signals: ['atrasada > 1 dia'],
    },
  ],
}

const stored = (key: string, value: unknown) => (_: unknown, e: { key: string }) =>
  e.key === key ? { value: { value, version: 1 } } : { value: { value: undefined, version: 0 } }

test('the band shows how many PRs need action and the oldest one', async ($, on) => {
  on('state.get', stored('round', round))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const line = await ui.find({ type: 'Text', text: /Argos/ })
    expect(line?.text).toContain('2 PR(s) pedem ação')
    expect(line?.text).toContain('portal#219 conflito')
    await ui.unmount()
  }
})

test('the band stays out of the way when nothing needs action', async ($, on) => {
  on('state.get', stored('round', { at: round.at, pending: [] }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the pane lists every pending PR, review requests named as such', async ($, on) => {
  on('state.get', stored('round', round))
  on('clock.now', () => ({ value: Date.parse('2026-10-29T12:00:00Z') }))

  const ui = await $.ui.mount({
    plugin: 'argos',
    component: 'Pane',
    requestId: 'argos',
    surface: 'desktop',
    props: { title: 'Argos', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /portal#219/ }))?.text).toContain('conflito')
  expect((await ui.find({ type: 'Text', text: /web#7/ }))?.text).toContain('pede sua revisão, atrasada > 1 dia')
  await ui.unmount()
})
