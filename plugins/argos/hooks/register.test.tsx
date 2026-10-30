import { expect, test } from 'claude-code/testing'

import { action, ageDots, ageText, buckets, byRank, errorText, grouped, rank, summary, visible } from './register'

const NOW = Date.parse('2026-10-29T12:00:00Z')
const ago = (d: number) => new Date(NOW - d * 864e5).toISOString()
const item = (over: Record<string, unknown>) =>
  ({ kind: 'mine', repo: 'acme/portal', number: 1, title: 'T', url: 'u1', author: 'me', createdAt: ago(2), signals: [], ...over }) as never

const conflict = item({ number: 219, url: 'u219', title: 'S3 migration', createdAt: ago(54), signals: ['conflict'] })
const ready = item({ number: 220, url: 'u220', title: 'Ready one', createdAt: ago(1.5), signals: ['ready'] })
const lateReview = item({ kind: 'review', repo: 'acme/web', number: 7, url: 'u7', author: 'bia', createdAt: ago(3), signals: ['late'] })
const theirs = item({ kind: 'other', repo: 'acme/web', number: 8, url: 'u8', author: 'caio', createdAt: ago(5), signals: ['no_review'] })
const draft = item({ kind: 'other', repo: 'acme/web', number: 9, url: 'u9', author: 'caio', isDraft: true, signals: [] })
const round = {
  at: new Date(NOW - 36e5).toISOString(),
  okAt: new Date(NOW - 36e5).toISOString(),
  me: 'me',
  repos: ['acme/portal', 'acme/web', 'acme/docs'],
  pending: [conflict, ready, lateReview],
  mine: [conflict, ready],
  others: [theirs, draft],
}

const stored = (values: Record<string, unknown>) => (_: unknown, e: { key: string }) =>
  e.key in values ? { value: { value: values[e.key], version: 1 } } : { value: { value: undefined, version: 0 } }
const PANE = {
  plugin: 'argos',
  component: 'Pane',
  requestId: 'argos',
  surface: 'desktop',
  props: { title: 'Argos', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const
const BAND = { plugin: 'argos', component: 'AbovePrompt', props: { hasSurvey: false } } as const
const clock = () => ({ value: NOW })

test('rank puts merge first, then a late review, then unblocking mine; oldest breaks ties', () => {
  expect([conflict, lateReview, ready].sort(byRank).map(p => (p as { number: number }).number)).toEqual([220, 7, 219])
  expect(rank(theirs)).toBe(7)
  expect(rank(draft)).toBe(10)
  const older = item({ url: 'old', createdAt: ago(9), signals: ['conflict'] })
  expect([conflict, older].sort(byRank).map(p => (p as { url: string }).url)).toEqual(['u219', 'old'])
})

test('actions read as verbs in each language', () => {
  expect(action(conflict, 'en', NOW)).toBe('Resolve the conflict')
  expect(action(item({ signals: ['threads:2', 'conflict'] }), 'pt-BR', NOW)).toBe('Resolva o conflito')
  expect(action(item({ signals: ['threads:2'] }), 'pt-BR', NOW)).toBe('Responda 2 thread(s)')
  expect(action(lateReview, 'en', NOW)).toBe('Review it: waiting 3d')
  expect(action(theirs, 'pt-BR', NOW)).toBe('Dê uma olhada: sem review há 5d')
})

test('buckets split at 1, 3, 7 and 14 days, and the chart caps a column with +n', () => {
  const b = buckets([0.5, 1, 2.9, 3, 6.9, 7, 13.9, 14, 40].map((d, i) => item({ url: `b${i}`, createdAt: ago(d) })), NOW)
  expect(b.map(c => c.length)).toEqual([1, 2, 2, 2, 2])
  const crowd = [buckets(Array.from({ length: 20 }, (_, i) => item({ url: `c${i}`, createdAt: ago(0.2) })), NOW)[0], [], [], [], []]
  expect(ageDots(crowd, ['a', 'b', 'c', 'd', 'e'], NOW)).toContain('+4')
  expect(ageText(crowd, ['a', 'b', 'c', 'd', 'e'])).toContain('+4')
})

test('summary counts once, skips teammates drafts and copes with empty rounds', () => {
  const s = summary(round as never, NOW)
  expect([s.you, s.mine, s.reviews, s.teamStuck, s.team]).toEqual([3, 2, 1, 1, 1])
  expect((s.oldest as { number: number }).number).toBe(219)
  expect(s.bySignal.map(([c]) => c).sort()).toEqual(['conflict', 'late', 'no_review', 'ready'])
  const empty = summary({ at: round.at } as never, NOW)
  expect([empty.you, empty.teamStuck, empty.oldest]).toEqual([0, 0, null])
  expect(summary({ ...round, okAt: new Date(NOW - 5 * 36e5).toISOString() } as never, NOW, 60).isStale).toBe(true)
})

test('queue filters by tab, author, repo and signal; grouping keeps empty connected repos', () => {
  expect(visible(round as never, 'you').length).toBe(3)
  expect(visible(round as never, 'team', 'caio').length).toBe(2)
  expect(visible(round as never, 'you', '', 'acme/web').map(p => (p as { number: number }).number)).toEqual([7])
  expect(visible(round as never, 'you', '', '', 'conflict').map(p => (p as { number: number }).number)).toEqual([219])
  expect(grouped([conflict], ['acme/docs']).map(g => `${g.repo}:${g.items.length}`)).toEqual(['acme/docs:0', 'acme/portal:1'])
})

test('known errors read in words', () => {
  expect(errorText('gh: not logged into any GitHub hosts', 'en')).toContain('gh auth login')
  expect(errorText('Error: timed out', 'pt-BR')).toContain('demorou demais')
  expect(errorText('something odd', 'en')).toBe("The vigil couldn't read your PRs.")
})

test('the band shows the most urgent PR with its verb', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /for you/ }))?.text).toContain('3 for you · Merge it: portal#220')
  await ui.unmount()
})

test('the band stays out of the way when nothing needs action', async ($, on) => {
  on('state.get', stored({ round: { at: round.at, pending: [], others: [] } }))
  on('clock.now', clock)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the pane opens with the portrait: do this now and three numbers', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /DO THIS NOW/ }))?.text).toContain('DO THIS NOW')
  expect((await ui.find({ type: 'Text', text: /^Merge it$/ }))?.text).toBe('Merge it')
  expect((await ui.find({ type: 'Text', text: /mine · .* reviews/ }))?.text).toBe('2 mine · 1 reviews')
  expect((await ui.find({ type: 'Text', text: /^54d$/ }))?.text).toBe('54d')
  await ui.unmount()
})

test('the pane speaks pt-BR when asked', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /FAÇA AGORA/ }))?.text).toContain('FAÇA AGORA')
  expect((await ui.find({ type: 'Text', text: /^Faça o merge$/ }))?.text).toBe('Faça o merge')
  await ui.unmount()
})

test('a failed round says so and keeps the last good data', async ($, on) => {
  on('state.get', stored({ round: { ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /vigil failed/ }))?.text).toMatch(/The .* vigil failed\. Showing the one from /)
  expect((await ui.find({ type: 'Text', text: /DO THIS NOW/ }))?.text).toContain('DO THIS NOW')
  await ui.unmount()
})

test('no connected repo shows how to connect one', async ($, on) => {
  on('state.get', stored({ round: { at: round.at, okAt: round.at, repos: [], pending: [], others: [], needsRepos: true } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /No repository connected/ }))?.text).toBe('No repository connected')
  await ui.unmount()
})

test('the first vigil shows only the loading mark', async ($, on) => {
  on('state.get', stored({ isRunning: true }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /First vigil/ }))?.text).toBe('First vigil: reading your PRs…')
  await ui.unmount()
})

test('the terminal gets the age chart as text, with ● for you and ○ for the team', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /●/ }))?.text).toMatch(/<1d.*●.*>2wk/)
  await ui.unmount()
})

test('by-repository order groups the queue, empty connected repos included', async ($, on) => {
  on('state.get', stored({ round, sort: 'repo' }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^acme\/docs · 0$/ }))?.text).toBe('acme/docs · 0')
  await ui.unmount()
})
