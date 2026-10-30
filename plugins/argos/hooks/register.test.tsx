import { expect, test } from 'claude-code/testing'

import { byRank, cells, rank, reason, toViewModel, verb } from './register'

const NOW = Date.parse('2026-10-29T12:00:00Z')
const ago = (d: number) => new Date(NOW - d * 864e5).toISOString()
const item = (over: Record<string, unknown>) =>
  ({ kind: 'mine', repo: 'acme/portal', number: 1, title: 'T', url: 'u1', author: 'me', createdAt: ago(2), signals: [], ...over }) as never

const conflict = item({ number: 219, url: 'u219', title: 'S3 migration', createdAt: ago(54), signals: ['conflict', 'threads:2'] })
const ready = item({ number: 220, url: 'u220', title: 'Ready one', createdAt: ago(1.5), signals: ['ready'] })
const quiet = item({ number: 221, url: 'u221', title: 'Quiet one', createdAt: ago(0.2), signals: [] })
const lateReview = item({ kind: 'review', repo: 'acme/web', number: 7, url: 'u7', author: 'bia', createdAt: ago(3), signals: ['late'] })
const changed = item({ kind: 'other', repo: 'acme/web', number: 8, url: 'u8', author: 'caio', createdAt: ago(5), signals: ['changed'] })
const theirs = item({ kind: 'other', repo: 'acme/api', number: 9, url: 'u9', author: 'caio', createdAt: ago(9), signals: ['no_review'] })
const round = {
  at: new Date(NOW - 36e5).toISOString(),
  okAt: new Date(NOW - 36e5).toISOString(),
  me: 'me',
  repos: ['acme/portal', 'acme/web', 'acme/api', 'acme/docs'],
  pending: [conflict, ready, lateReview],
  mine: [conflict, ready, quiet],
  others: [changed, theirs],
}
const vmOf = (r: unknown, ui = {}, lang = 'en') => toViewModel(r as never, { now: NOW, lang, minutes: 60, running: false, ui })
const ok = (vm: ReturnType<typeof vmOf>) => {
  if (vm.state !== 'ok') throw new Error(vm.state)
  return vm
}

const stored = (values: Record<string, unknown>) => (_: unknown, e: { key: string }) =>
  e.key in values ? { value: { value: values[e.key], version: 1 } } : { value: { value: undefined, version: 0 } }
const PANE = {
  plugin: 'argos',
  component: 'Pane',
  requestId: 'argos',
  surface: 'desktop',
  viewport: { columns: 80, rows: 40 },
  props: { title: 'Argos', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const
const BAND = { plugin: 'argos', component: 'AbovePrompt', props: { hasSurvey: false } } as const
const clock = () => ({ value: NOW })

test('rank puts merge first, then a late review, then unblocking mine; oldest breaks ties', () => {
  expect([conflict, lateReview, ready].sort(byRank).map(p => (p as { number: number }).number)).toEqual([220, 7, 219])
  expect(rank(theirs)).toBe(7)
})

test('verbs follow the fixed signal order, in each language', () => {
  expect(verb(item({ signals: ['threads:2', 'conflict'] }), 'en')).toBe('Resolve the conflict')
  expect(verb(item({ signals: ['threads:2'] }), 'pt-BR')).toBe('Fechar 2 conversas abertas')
  expect(verb(lateReview, 'en')).toBe("Review bia's PR")
  expect(verb(changed, 'pt-BR')).toBe('Revisar de novo')
})

test('each PR adds to the right columns', () => {
  expect(cells(conflict)).toEqual({ comments: 2, changed: 0, blocked: 1, review: 0 })
  expect(cells(item({ signals: ['unanswered', 'new_reviews:3'] }))).toEqual({ comments: 4, changed: 0, blocked: 0, review: 0 })
  expect(cells(lateReview)).toEqual({ comments: 0, changed: 0, blocked: 0, review: 1 })
  expect(cells(item({ kind: 'review', signals: ['changed'] }))).toEqual({ comments: 0, changed: 1, blocked: 0, review: 1 })
  expect(cells(changed)).toEqual({ comments: 0, changed: 1, blocked: 0, review: 0 })
  // a teammate's conflict or a ready PR of mine is nothing for me to do
  expect(Object.values(cells(theirs)).concat(Object.values(cells(ready)))).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
})

test('repos with something pending come first, blocked on top; the rest fold into one line', () => {
  const vm = ok(vmOf(round))
  expect(vm.repos.map(x => [x.name, x.counts])).toEqual([
    ['portal', { comments: 2, changed: 0, blocked: 1, review: 0 }],
    ['web', { comments: 0, changed: 1, blocked: 0, review: 1 }],
  ])
  expect(vm.clean).toBe(2)
  expect(vm.repos[1]?.prs.map(p => p.number)).toEqual([7, 8])
  expect(vm.band).toEqual({ count: 3, verb: 'Merge it', ref: 'portal#220' })
})

test('the send button carries the picked repos: mine to fix, the others to review', () => {
  const none = ok(vmOf(round))
  expect([none.send.count, none.send.inPrompt]).toEqual([0, false])
  const vm = ok(vmOf(round, { selected: ['acme/portal', 'acme/web', 'acme/gone'] }))
  expect(vm.send.count).toBe(2)
  expect(vm.send.prompt).toBe(
    [
      'Work on these PRs with Argos.',
      'My PRs, to fix with argos-ward:',
      '- u219: Resolve the conflict',
      'To review with argos-panoptes (draft only, nothing is posted without my yes):',
      '- u7',
      '- u8',
    ].join('\n'),
  )
  // "In prompt ✓" holds for this selection until the next round
  const sent = ok(vmOf(round, { selected: ['acme/portal', 'acme/web'], sent: vm.send.key }))
  expect(sent.send.inPrompt).toBe(true)
  expect(ok(vmOf({ ...round, at: new Date(NOW).toISOString() }, { selected: ['acme/portal', 'acme/web'], sent: vm.send.key })).send.inPrompt).toBe(false)
})

test('failures and late rounds say so in words', () => {
  expect(reason('gh: not logged into any GitHub hosts', 'en')).toContain('gh auth login')
  expect(reason('Error: timed out', 'pt-BR')).toContain('2 min')
  const failed = vmOf({ ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' })
  expect(failed.status).toMatch(/^The \d\d:\d\d check failed: GitHub took over 2 min to answer\. Showing data from \d\d:\d\d\.$/)
  expect(vmOf({ at: round.at, okAt: null, error: 'x' }).state).toBe('noData')
  const late = vmOf({ ...round, okAt: ago(0.2), at: ago(0.2) })
  expect([late.seen, late.status]).toEqual(['seen 4 h ago', "Last check 4 h ago; the next one didn't run."])
  expect(vmOf({ ...round, pending: [], mine: [], others: [] }).state).toBe('noPRs')
})

test('the band shows the most urgent PR with its verb', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /for you/ }))?.text).toContain('3 for you · Merge it: portal#220')
  await ui.unmount()
})

test('the band stays out of the way when nothing needs action', async ($, on) => {
  on('state.get', stored({ round: { ...round, pending: [], others: [] } }))
  on('clock.now', clock)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the pane lists repos to pick, the legend and a quiet send button', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'pick:acme/portal' }))?.text).toBe('☐ portal')
  expect((await ui.find({ type: 'Text', text: /^Pick the repos/ }))?.text).toBe('Pick the repos to work on')
  expect((await ui.find({ type: 'Text', text: /nothing pending/ }))?.text).toBe('2 repos with nothing pending')
  expect((await ui.find({ type: 'Text', text: 'blocked' }))?.text).toBe('blocked')
  expect((await ui.find({ key: 'send' }))?.text).toBe('Pick a repo to send')
  await ui.unmount()
})

test('picked repos fill the send button; an open repo lists its PRs', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round, selected: ['acme/portal', 'acme/web'], open: 'acme/web' }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'pick:acme/web' }))?.text).toBe('☑ web')
  expect((await ui.find({ key: 'send' }))?.text).toBe('Enviar 2 repos para a IA')
  expect((await ui.find({ type: 'Text', text: /Revisar o PR de bia/ }))?.text).toBe('Revisar o PR de bia · T')
  await ui.unmount()
})

test('the terminal draws letters for icons and boxes in brackets, also when narrow', async ($, on) => {
  on('state.get', stored({ round, selected: ['acme/portal'] }))
  on('clock.now', clock)
  for (const columns of [80, 36]) {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns, rows: 30 } })
    expect((await ui.find({ key: 'pick:acme/portal' }))?.text).toBe('[x] portal')
    expect((await ui.find({ type: 'Text', text: 'B' }))?.text).toBe('B')
    await ui.unmount()
  }
})

test('nothing pending says so and keeps the folded count', async ($, on) => {
  on('state.get', stored({ round: { ...round, pending: [], mine: [quiet], others: [theirs] } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^Nothing pending/ }))?.text).toBe('Nothing pending in your repos')
  expect((await ui.find({ type: 'Text', text: /nothing pending$/ }))?.text).toBe('4 repos with nothing pending')
  await ui.unmount()
})

test('a failed round keeps the last good data under a retry strip', async ($, on) => {
  on('state.get', stored({ round: { ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /check failed/ }))?.text).toContain('Showing data from')
  expect((await ui.find({ type: 'Button', text: 'Try again' }))?.text).toBe('Try again')
  expect((await ui.find({ key: 'pick:acme/portal' }))?.text).toBe('☐ portal')
  await ui.unmount()
})

test('no connected repo shows how to connect one', async ($, on) => {
  on('state.get', stored({ round: { at: round.at, okAt: round.at, repos: [], pending: [], others: [], needsRepos: true } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /No repositories watched/ }))?.text).toBe('No repositories watched')
  await ui.unmount()
})

test('the first check says what is happening', async ($, on) => {
  on('state.get', stored({ isRunning: true }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /First check/ }))?.text).toBe('First check running. It takes a few seconds per repository.')
  expect((await ui.find({ type: 'Button', text: 'Checking…' }))?.text).toBe('Checking…')
  await ui.unmount()
})
