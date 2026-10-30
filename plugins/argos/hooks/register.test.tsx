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

test('every connected repo is listed with its open PRs, blocked first, zeros included', () => {
  const vm = ok(vmOf(round))
  expect(vm.repos.map(x => [x.name, x.counts, x.prs.length])).toEqual([
    ['portal', { comments: 2, changed: 0, blocked: 1, review: 0 }, 3],
    ['web', { comments: 0, changed: 1, blocked: 0, review: 1 }, 2],
    ['api', { comments: 0, changed: 0, blocked: 0, review: 0 }, 1],
    ['docs', { comments: 0, changed: 0, blocked: 0, review: 0 }, 0],
  ])
  // every open PR is listed, the ones that need something first, with their owner
  expect(vm.repos[0]?.prs.map(p => [p.number, p.act, p.owner])).toEqual([
    [219, 'Resolve', 'you'],
    [220, null, 'you'],
    [221, null, 'you'],
  ])
  // only someone else's PR offers approve; mine never does
  expect(vm.repos[0]?.prs.every(p => p.approve === null)).toBe(true)
  expect(vm.repos[1]?.prs[0]?.approveMerge).toBe('Approve u7 on GitHub and merge it once checks pass (gh pr review --approve, then gh pr merge).')
  expect(vm.repos[1]?.prs.map(p => [p.number, p.owner])).toEqual([
    [7, 'bia'],
    [8, 'caio'],
  ])
  expect(vm.band).toEqual({ count: 3, verb: 'Merge it', ref: 'portal#220' })
})

test('the send button carries the picked PRs: mine to fix, the others to review', () => {
  const none = ok(vmOf(round))
  expect([none.send.count, none.send.inPrompt]).toEqual([0, false])
  const vm = ok(vmOf(round, { selected: [...['acme/portal#219', 'acme/web#7', 'acme/web#8'], 'acme/gone#1'] }))
  expect(vm.send.count).toBe(3)
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
  // a repo's checkbox reads all, some or none of its PRs
  const some = ok(vmOf(round, { selected: ['acme/web#7'] }))
  expect(some.repos.map(x => x.pick)).toEqual(['none', 'some', 'none', 'none'])
  expect(vm.repos.map(x => x.pick)).toEqual(['some', 'all', 'none', 'none'])
  expect(vm.allSelected).toBe(false)
  // "In prompt ✓" holds for this selection until the next round
  const sent = ok(vmOf(round, { selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8'], sent: vm.send.key }))
  expect(sent.send.inPrompt).toBe(true)
  expect(ok(vmOf({ ...round, at: new Date(NOW).toISOString() }, { selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8'], sent: vm.send.key })).send.inPrompt).toBe(false)
})

test('failures and late rounds say so in words', () => {
  expect(reason('gh: not logged into any GitHub hosts', 'en')).toContain('gh auth login')
  expect(reason('Error: timed out', 'pt-BR')).toContain('2 min')
  const failed = vmOf({ ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' })
  expect(failed.status).toMatch(/^The \d\d:\d\d check failed: GitHub took over 2 min to answer\. Showing data from \d\d:\d\d\.$/)
  expect(vmOf({ at: round.at, okAt: null, error: 'x' }).state).toBe('noData')
  const late = vmOf({ ...round, okAt: ago(0.2), at: ago(0.2) })
  expect([late.seen, late.status]).toEqual(['seen 4 h ago', "Last check 4 h ago; the next one didn't run."])
  expect(ok(vmOf({ ...round, pending: [], mine: [], others: [] })).counts).toEqual({ open: 0, mine: 0, reviewed: 0, unreviewed: 0 })
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

test('the send checks block an empty pick or a running check, and warn on stale data or a big batch', () => {
  expect(ok(vmOf(round)).send.block).toBe('Pick a repo or a PR to send.')
  const picked = ok(vmOf(round, { selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8'] }))
  expect([picked.send.block, picked.send.warn, picked.send.summary]).toEqual([null, null, 'Going to the AI: 1 to fix, 2 to review.'])
  const running = ok(toViewModel(round as never, { now: NOW, lang: 'en', minutes: 60, running: true, ui: { selected: ['acme/web#7'] } }))
  expect(running.send.block).toBe('Wait for the check to finish.')
  const stale = ok(vmOf({ ...round, okAt: ago(0.2), at: ago(0.2) }, { selected: ['acme/web#7'] }))
  expect(stale.send.warn).toMatch(/^The data is from \d\d:\d\d\. Check again before sending\.$/)
  const many = Array.from({ length: 11 }, (_, i) => item({ kind: 'review', repo: 'acme/web', number: 100 + i, url: `m${i}` }))
  const web = ok(vmOf({ ...round, pending: many })).repos.find(x => x.name === 'web')?.keys ?? []
  expect(ok(vmOf({ ...round, pending: many }, { selected: web })).send.warn).toBe('12 PRs at once: the AI works through them by priority.')
})

test('the top line tallies every open PR once: mine, reviewed and still to review', () => {
  const vm = ok(vmOf({ ...round, others: [{ ...(changed as object), reviewed: true }, theirs] }))
  expect(vm.counts).toEqual({ open: 6, mine: 3, reviewed: 1, unreviewed: 2 })
  expect(ok(vmOf(round)).counts).toEqual({ open: 6, mine: 3, reviewed: 0, unreviewed: 3 })
})

test('the top line leads with the tally; each repo is one line with its checkbox and its PRs', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'to review' }))?.text).toBe('to review')
  expect((await ui.find({ key: 'tally:mine' }))?.text).toBe('3yours')
  expect((await ui.find({ key: 'check' }))?.text).toBe('↻  Check now')
  expect((await ui.find({ type: 'Text', text: 'portal' }))?.text).toBe('portal')
  expect((await ui.find({ key: 'open:acme/portal' }))?.text).toBe('3 PRs  ▾')
  expect((await ui.find({ type: 'Text', text: /^Pick a repo/ }))?.text).toBe('Pick a repo or a PR to send.')
  expect((await ui.find({ key: 'send' }))?.text).toBe('Send to the AI')
  expect((await ui.find({ key: 'pick-all' }))?.text).toBe('Pick all')
  await ui.unmount()
})

test('picked PRs fill the send button; an open repo lists its PRs one per line', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round, selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8'], open: 'acme/web' }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'send' }))?.text).toBe('Enviar 3 PRs para a IA')
  expect((await ui.find({ type: 'Text', text: /^Vai para a IA/ }))?.text).toBe('Vai para a IA: 1 para corrigir, 2 para revisar.')
  expect((await ui.find({ key: 'act:acme/web#7' }))?.text).toBe('Revisar ›')
  expect((await ui.find({ key: 'approve:acme/web#7' }))?.text).toBe('Aprovar ›')
  expect((await ui.find({ key: 'merge:acme/web#7' }))?.text).toBe('Aprovar e mergear ›')
  expect((await ui.find({ key: 'open:acme/web' }))?.text).toBe('2 PRs  ▴')
  expect((await ui.find({ key: 'pick-all' }))?.text).toBe('Marcar todos')
  await ui.unmount()
})

test('the terminal draws boxes in brackets, also when narrow', async ($, on) => {
  on('state.get', stored({ round, selected: ['acme/portal#219'] }))
  on('clock.now', clock)
  for (const columns of [80, 36]) {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns, rows: 30 } })
    expect((await ui.find({ key: 'box:acme/portal' }))?.text).toBe('[-]')
    expect((await ui.find({ type: 'Text', text: /^1 blocked$/ }))?.text).toBe('1 blocked')
    await ui.unmount()
  }
})

test('with no open PR the repos stay listed, at zero', async ($, on) => {
  on('state.get', stored({ round: { ...round, pending: [], mine: [], others: [] } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'docs' }))?.text).toBe('docs')
  expect((await ui.find({ key: 'tally:mine' }))?.text).toBe('0yours')
  expect(await ui.find({ key: 'open:acme/docs' })).toBeUndefined()
  await ui.unmount()
})

test('a failed round keeps the last good data under a retry strip', async ($, on) => {
  on('state.get', stored({ round: { ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /check failed/ }))?.text).toContain('Showing data from')
  expect((await ui.find({ type: 'Button', text: 'Try again' }))?.text).toBe('Try again')
  expect((await ui.find({ type: 'Text', text: 'portal' }))?.text).toBe('portal')
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

test('a round in progress turns the send button into Checking; a partial pick shows only in the box', async ($, on) => {
  on('state.get', stored({ round, isRunning: true, selected: ['acme/web#7'] }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'send' }))?.text).toBe('Checking…')
  expect((await ui.find({ key: 'box:acme/web' }))?.text).toBe('⊟')
  expect((await ui.find({ key: 'box:acme/portal' }))?.text).toBe('☐')
  await ui.unmount()
})
