import { expect, test } from 'claude-code/testing'

import { ageShort, byRank, rank, reason, toViewModel, verb } from './register'

const NOW = Date.parse('2026-10-29T12:00:00Z')
const ago = (d: number) => new Date(NOW - d * 864e5).toISOString()
const item = (over: Record<string, unknown>) =>
  ({ kind: 'mine', repo: 'acme/portal', number: 1, title: 'T', url: 'u1', author: 'me', createdAt: ago(2), signals: [], ...over }) as never

const conflict = item({ number: 219, url: 'u219', title: 'S3 migration', createdAt: ago(54), signals: ['conflict'] })
const ready = item({ number: 220, url: 'u220', title: 'Ready one', createdAt: ago(1.5), signals: ['ready'] })
const quiet = item({ number: 221, url: 'u221', title: 'Quiet one', createdAt: ago(0.2), signals: [] })
const lateReview = item({ kind: 'review', repo: 'acme/web', number: 7, url: 'u7', author: 'bia', createdAt: ago(3), signals: ['late'] })
const theirs = item({ kind: 'other', repo: 'acme/web', number: 8, url: 'u8', author: 'caio', createdAt: ago(5), signals: ['no_review'] })
const draft = item({ kind: 'other', repo: 'acme/web', number: 9, url: 'u9', author: 'caio', isDraft: true, createdAt: ago(9), signals: ['no_review'] })
const round = {
  at: new Date(NOW - 36e5).toISOString(),
  okAt: new Date(NOW - 36e5).toISOString(),
  me: 'me',
  repos: ['acme/portal', 'acme/web', 'acme/docs'],
  pending: [conflict, ready, lateReview],
  mine: [conflict, ready, quiet],
  others: [theirs, draft],
}
const vmOf = (r: unknown, ui = {}, lang = 'en') => toViewModel(r as never, { now: NOW, lang, minutes: 60, running: false, ui })

// n teammates' PRs spread over the five age buckets, the first of each bucket in conflict
const crowd = (sizes: number[]) => {
  let n = 0
  const others = sizes.flatMap((k, b) =>
    Array.from({ length: k }, (_, j) =>
      item({ kind: 'other', repo: 'acme/web', number: ++n, url: `c${n}`, author: 'bia', createdAt: ago([0.3, 2, 5, 10, 20][b]), signals: j ? [] : ['conflict'] }),
    ),
  )
  return { ...round, pending: [], mine: [], others }
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
})

test('verbs follow the fixed signal order, in each language', () => {
  expect(verb(item({ signals: ['threads:2', 'conflict'] }), 'en')).toBe('Resolve the conflict')
  expect(verb(item({ signals: ['threads:1'] }), 'en')).toBe('Close 1 open thread')
  expect(verb(item({ signals: ['threads:2'] }), 'pt-BR')).toBe('Fechar 2 conversas abertas')
  expect(verb(lateReview, 'en')).toBe("Review bia's PR")
  expect(verb(theirs, 'pt-BR')).toBe('Dar a primeira review')
  expect(verb(item({ signals: ['no_review'] }), 'en')).toBe('Ask for a review')
})

test('short ages read in hours, days, then weeks', () => {
  expect([0.01, 0.4, 1, 13.9, 14, 40].map(d => ageShort(ago(d), NOW, 'en'))).toEqual(['1h', '9h', '1d', '13d', '2w', '5w'])
  expect(ageShort(ago(21), NOW, 'pt-BR')).toBe('3sem')
})

test('every number agrees with the lists', () => {
  const vm = vmOf(round)
  if (vm.state !== 'ok') throw new Error(vm.state)
  expect([vm.you.count, vm.you.rows.length, vm.you.mineOpen]).toEqual([3, 3, 3])
  // team: teammates' PRs, stuck ones counted without drafts
  expect([vm.team?.count, vm.team?.stuck]).toEqual([2, 1])
  expect(vm.team?.label).toBe('Team · 1 stuck · oldest 9d ▸')
  // footer: all open PRs once (mine ∪ reviews ∪ team), oldest is reachable
  expect(vm.age.total).toBe(6)
  expect(vm.age.counts.reduce((a, b) => a + b, 0)).toBe(vm.age.total)
  expect(vm.age.oldest.number).toBe(219)
  expect(vm.age.line).toBe('2 flagged · <1d 1 · 1–3d 1 · 3–7d 2 · 1–2w 1 · >2w 1')
  expect(vm.band).toEqual({ count: 3, verb: 'Merge it', ref: 'portal#220' })
})

test('0, 4, 23 and 40 open PRs keep one strip and the same totals', () => {
  expect(vmOf({ ...round, pending: [], mine: [], others: [] }).state).toBe('noPRs')
  for (const sizes of [[4, 0, 0, 0, 0], [5, 0, 5, 9, 4], [3, 4, 5, 25, 3]]) {
    const vm = vmOf(crowd(sizes))
    if (vm.state !== 'ok') throw new Error(vm.state)
    const total = sizes.reduce((a, b) => a + b, 0)
    expect(vm.age.counts).toEqual(sizes)
    expect(vm.age.flagged).toBe(sizes.filter(Boolean).length)
    expect(vm.age.svg).toContain('viewBox="0 0 240 40"')
    expect(vm.team?.count).toBe(total)
    // the team folds; opened, it shows 8 and offers the rest
    expect(vm.team?.rows.length).toBe(0)
    const open = vmOf(crowd(sizes), { teamOpen: true })
    if (open.state !== 'ok') throw new Error(open.state)
    expect([open.team?.rows.length, open.team?.more]).toEqual([Math.min(8, total), Math.max(0, total - 8)])
  }
})

test('the first row is active unless another visible one was opened or all were closed', () => {
  const first = vmOf(round)
  const second = vmOf(round, { expanded: 'acme/web#7' })
  const gone = vmOf(round, { expanded: 'acme/web#999' })
  const none = vmOf(round, { expanded: '-' })
  const hidden = vmOf(round, { expanded: 'acme/web#8' })
  expect([first, second, gone, none, hidden].map(v => (v.state === 'ok' ? v.activeKey : v.state))).toEqual([
    'acme/portal#220',
    'acme/web#7',
    'acme/portal#220',
    '',
    'acme/portal#220',
  ])
})

test('a ready PR gets no AI button; the prompt fill shows until the next round', () => {
  const vm = vmOf(round, { sent: `${round.at}|acme/portal#219` })
  if (vm.state !== 'ok') throw new Error(vm.state)
  const [merge, review, fix] = vm.you.rows
  expect(merge.ai).toBe(null)
  expect(review.ai?.label).toBe('Review with Panoptes')
  expect([fix.ai?.label, fix.inPrompt]).toEqual(['Fix with Argos', true])
  const next = vmOf({ ...round, at: new Date(NOW).toISOString() }, { sent: `${round.at}|acme/portal#219` })
  expect(next.state === 'ok' && next.you.rows[2].inPrompt).toBe(false)
})

test('failures and late rounds say so in words', () => {
  expect(reason('gh: not logged into any GitHub hosts', 'en')).toContain('gh auth login')
  expect(reason('Error: timed out', 'pt-BR')).toContain('2 min')
  const failed = vmOf({ ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' })
  expect(failed.status).toMatch(/^The \d\d:\d\d check failed: GitHub took over 2 min to answer\. Showing data from \d\d:\d\d\.$/)
  expect(failed.seen).toMatch(/^data from /)
  expect(vmOf({ at: round.at, okAt: null, error: 'x' }).state).toBe('noData')
  const late = vmOf({ ...round, okAt: ago(0.2), at: ago(0.2) })
  expect([late.seen, late.status]).toEqual(['seen 4 h ago', "Last check 4 h ago; the next one didn't run."])
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

test('the pane leads with the first row expanded and one primary action', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^For you/ }))?.text).toBe('For you · 3')
  expect((await ui.find({ type: 'Text', text: /^of your/ }))?.text).toBe('of your 3 open PRs')
  expect((await ui.find({ type: 'Text', text: /^Merge it$/ }))?.text).toBe('Merge it')
  expect((await ui.find({ type: 'Text', text: /^Review: / }))?.text).toBe('Review: T')
  expect((await ui.find({ type: 'Button', text: /^Team · / }))?.text).toBe('Team · 1 stuck · oldest 9d ▸')
  expect((await ui.find({ type: 'Text', text: /^Age of/ }))?.text).toBe('Age of 6 open PRs')
  await ui.unmount()
})

test('the pane speaks pt-BR when asked', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^Para você/ }))?.text).toBe('Para você · 3')
  expect((await ui.find({ type: 'Text', text: /^Fazer o merge$/ }))?.text).toBe('Fazer o merge')
  await ui.unmount()
})

test('all clear still shows the team and the footer', async ($, on) => {
  on('state.get', stored({ round: { ...round, pending: [] } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^Nothing waiting/ }))?.text).toBe('Nothing waiting on you')
  expect((await ui.find({ type: 'Text', text: /^Your 3 PRs/ }))?.text).toMatch(/^Your 3 PRs are moving on their own · seen \d\d:\d\d$/)
  expect((await ui.find({ type: 'Text', text: /^Age of/ }))?.text).toBe('Age of 5 open PRs')
  await ui.unmount()
})

test('a failed round keeps the last good data under a retry strip', async ($, on) => {
  on('state.get', stored({ round: { ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /check failed/ }))?.text).toContain('Showing data from')
  expect((await ui.find({ type: 'Button', text: 'Try again' }))?.text).toBe('Try again')
  expect((await ui.find({ type: 'Text', text: /^Merge it$/ }))?.text).toBe('Merge it')
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

test('the terminal keeps the footer as text', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /flagged/ }))?.text).toBe('2 flagged · <1d 1 · 1–3d 1 · 3–7d 2 · 1–2w 1 · >2w 1')
  await ui.unmount()
})
