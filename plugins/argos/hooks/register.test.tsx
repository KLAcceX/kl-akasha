import { expect, test } from 'claude-code/testing'

import { reason, toViewModel, verdictOf, verdictTag } from './register'

const NOW = Date.parse('2026-10-29T12:00:00Z')
const ago = (d: number) => new Date(NOW - d * 864e5).toISOString()
const item = (over: Record<string, unknown>) =>
  ({ kind: 'mine', repo: 'acme/portal', number: 1, title: 'T', url: 'u1', author: 'me', createdAt: ago(2), signals: [], ...over }) as never

const conflict = item({ number: 219, url: 'u219', title: 'S3 migration', createdAt: ago(54), size: 1200, signals: ['conflict', 'threads:2'] })
const ready = item({ number: 220, url: 'u220', title: 'Ready one', createdAt: ago(1.5), signals: ['ready'] })
const quiet = item({ number: 221, url: 'u221', title: 'Quiet one', createdAt: ago(0.2), signals: [] })
const draft = item({ number: 222, url: 'u222', title: 'Draft one', isDraft: true, signals: [] })
const lateReview = item({ kind: 'review', repo: 'acme/web', number: 7, url: 'u7', author: 'bia', createdAt: ago(3), since: ago(1.5), signals: ['late'] })
const changed = item({ kind: 'other', repo: 'acme/web', number: 8, url: 'u8', author: 'caio', createdAt: ago(5), signals: ['changed'] })
const theirs = item({ kind: 'other', repo: 'acme/api', number: 9, url: 'u9', author: 'Copilot', isAI: true, createdAt: ago(9), signals: ['no_owner'] })
const round = {
  at: new Date(NOW - 36e5).toISOString(),
  okAt: new Date(NOW - 36e5).toISOString(),
  me: 'me',
  repos: ['acme/portal', 'acme/web', 'acme/api', 'acme/docs'],
  pending: [conflict, ready, lateReview],
  mine: [conflict, ready, quiet, draft],
  others: [changed, theirs],
}
const vmOf = (r: unknown, ui = {}, lang = 'en', ignored: string[] = []) => toViewModel(r as never, { now: NOW, lang, minutes: 60, running: false, ui, ignored })
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
  viewport: { columns: 40, rows: 40 },
  props: { title: 'Argos', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const
const clock = () => ({ value: NOW })


test('one list: every open PR in a fixed order, all going to validation but what is not ready', () => {
  const vm = ok(vmOf(round))
  expect(vm.rows.map(x => [x.num, x.isIn, x.why])).toEqual([
    ['#9', true, ''],
    ['#219', false, 'changes asked'],
    ['#220', true, ''],
    ['#221', true, ''],
    ['#222', false, 'draft'],
    ['#7', true, ''],
    ['#8', true, ''],
  ])
  // a repo with a draft or a change request left out is not "all": its heading offers Select all
  expect(vm.groups.map(g => [g.name, g.rows.length, g.count, g.action])).toEqual([
    ['api', 1, '1 of 1', 'Deselect all'],
    ['portal', 4, '2 of 4', 'Select all'],
    ['web', 2, '2 of 2', 'Deselect all'],
  ])
  expect(vm.summary).toBe('5 to validate · 3 repos')
  expect(vm.autoLine).toBe('Left out by itself: 1 change request · 1 draft')
  expect(vm.authors.map(a => [a.name, a.kind, a.count])).toEqual([
    ['me', 'human', 4],
    ['bia', 'human', 1],
    ['caio', 'human', 1],
    ['Copilot', 'agent', 1],
  ])
  expect(vm.validate).toEqual({ label: 'Validate 5', urls: ['u9', 'u220', 'u221', 'u7', 'u8'], count: 5 })
})

test('leaving out never moves a line: an author, a line by hand, one the pane left out brought back', () => {
  const keys = (vm: ReturnType<typeof ok>) => vm.rows.map(x => x.key)
  const all = ok(vmOf(round))
  const noMe = ok(vmOf(round, {}, 'en', ['me']))
  expect(keys(noMe)).toEqual(keys(all))
  expect(noMe.validate.count).toBe(3)
  const mine = noMe.rows.find(x => x.key === 'acme/portal#220')!
  expect([mine.isIn, mine.canToggle, mine.why]).toEqual([false, false, ''])
  expect(noMe.authors[0]?.isOut).toBe(true)
  const hand = ok(vmOf(round, { out: ['acme/web#7'] }))
  expect([hand.validate.count, hand.rows.find(x => x.key === 'acme/web#7')?.isIn]).toEqual([4, false])
  expect(keys(hand)).toEqual(keys(all))
  const brought = ok(vmOf(round, { back: ['acme/portal#222'] }))
  expect([brought.validate.count, brought.rows.find(x => x.key === 'acme/portal#222')?.isIn]).toEqual([6, true])
})

test('failures and late rounds say so', () => {
  expect(reason('gh: not logged into any GitHub hosts', 'en')).toContain('gh auth login')
  expect(reason('Error: timed out', 'pt-BR')).toContain('2 min')
  const failed = vmOf({ ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' })
  expect([failed.failed, failed.checked, failed.error?.isAuth]).toEqual([true, 'data from 1h ago', false])
  expect(vmOf({ at: round.at, okAt: null, error: 'x' }).state).toBe('noData')
  expect(vmOf({ ...round, okAt: ago(0.2), at: ago(0.2) }).isLate).toBe(true)
})

// Batch AI validation: a verdict per PR, kept against the head commit it was made on.
const V = (over: Record<string, unknown>) => ({ state: 'done', sha: 'abc1234', issues: 0, finding: '', at: round.at, ...over })
const judged = {
  auto: 'off',
  batch: { urls: ['u8', 'u9'], at: round.at },
  prs: {
    u219: V({ issues: 2, finding: 'No backoff cap' }),
    u7: V({ issues: 3, finding: 'Cursor lost' }),
    u8: V({ state: 'running' }),
    u9: V({ sha: 'old0000' }),
  },
}
const shaOn = (p: never) => ({ ...(p as object), sha: 'abc1234def' }) as never
const vround = { ...round, pending: [conflict, ready, lateReview].map(shaOn), mine: [conflict, ready, quiet, draft].map(shaOn), others: [changed, theirs].map(shaOn) }


test('a verdict: none, running, passed, issues, partial, or old once new commits land', () => {
  const p = shaOn(item({}))
  expect(verdictOf(p).state).toBe('none')
  expect(verdictOf(p, V({ state: 'running' }) as never).state).toBe('run')
  expect(verdictOf(p, V({}) as never).state).toBe('pass')
  expect(verdictOf(p, V({ issues: 2, finding: 'x' }) as never)).toEqual({ state: 'issues', issues: 2, attention: 0, finding: 'x' })
  expect(verdictOf(p, V({ sha: 'fff9999' }) as never).state).toBe('stale')
  expect(verdictOf(p, V({ partial: true }) as never).state).toBe('partial')
  const watch = verdictOf(p, V({ attention: 2 }) as never)
  expect([verdictTag(watch, 'en').count, verdictTag(watch, 'en').tip]).toEqual(['✓+2', 'AI validation: passed · attention 2'])
})

test('a PR validated with no commit since is left out; a running one cannot be picked; an old one goes again', () => {
  const vm = ok(toViewModel(vround as never, { now: NOW, lang: 'en', minutes: 60, running: false, verdicts: judged as never }))
  const at = (k: string) => vm.rows.find(x => x.key === k)!
  expect([at('acme/web#7').isIn, at('acme/web#7').why, at('acme/web#7').verdict?.count]).toEqual([false, 'validated', '3'])
  expect([at('acme/web#8').why, at('acme/web#8').canToggle]).toEqual(['validating', false])
  expect([at('acme/api#9').isIn, at('acme/api#9').verdict?.count]).toEqual([true, 'old'])
  expect(vm.progress?.label).toBe('Validating 1 of 2')
})

test('the pane: the count, the author switches, one Validate button and one line per PR', async ($, on) => {
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : next(e),
  )
  on('clock.now', clock)
  on('store.set', () => ({ value: undefined }))
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /to validate/ }))?.text).toBe('5 to validate · 3 repos')
  expect((await ui.find({ key: 'validate' }))?.text).toBe('Validate 5')
  expect((await ui.find({ key: 'pick:acme/web#7' }))?.text).toBe('☑')
  expect((await ui.find({ key: 'pick:acme/portal#222' }))?.text).toBe('☐')
  // an author switch: one tap leaves them out, the line stays where it was
  await ui.press({ key: 'who:me' })
  expect((await ui.find({ key: 'who:me' }))?.text).toBe('me ✕')
  expect((await ui.find({ key: 'validate' }))?.text).toBe('Validate 3')
  await ui.press({ key: 'pick:acme/web#7' })
  expect((await ui.find({ key: 'validate' }))?.text).toBe('Validate 2')
  await ui.press({ key: 'who:me' })
  // a draft the pane left out, brought back by hand
  await ui.press({ key: 'pick:acme/portal#222' })
  expect((await ui.find({ key: 'pick:acme/portal#222' }))?.text).toBe('☑')
  expect((await ui.find({ key: 'validate' }))?.text).toBe('Validate 5')
  await ui.unmount()
})

test('Validate N marks them running and hands them to background subagents, ten each', async ($, on) => {
  const many = Array.from({ length: 12 }, (_, i) => item({ kind: 'other', number: 400 + i, url: `u4${i}`, author: 'bia', signals: [] }))
  const runs: string[][] = []
  const spawns: { prompt: string }[] = []
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: { ...round, pending: [], mine: [], others: many }, version: 1 } } : next(e),
  )
  on('clock.now', clock)
  on('env.get', () => ({ value: 'C:/home' }))
  on('fs.read', () => {
    throw new Error('no file')
  })
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('agent.spawn', (_: unknown, e: { prompt: string }) => {
    spawns.push(e)
    return { agentId: `a${spawns.length}`, model: 'm' }
  })
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'validate' }))?.text).toBe('Validate 12')
  await ui.press({ key: 'validate' })
  expect(runs.find(a => a.includes('start'))?.length).toBe(3 + 12)
  expect(spawns.map(s => s.prompt.split('\n').filter(l => l.startsWith('- ')).length)).toEqual([10, 2])
  await ui.unmount()
})

test('a repo heading takes or leaves its whole repo; Clear leaves everything out, Restore brings the default back', async ($, on) => {
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : next(e),
  )
  on('clock.now', clock)
  on('store.set', () => ({ value: undefined }))
  const ui = await $.ui.mount(PANE)
  const text =async (key: string) => (await ui.find({ key }))?.text
  // portal goes 2 of 4 (a draft and a change request left out): Select all takes those too
  expect(await text('repo:acme/portal')).toBe('Select all')
  await ui.press({ key: 'repo:acme/portal' })
  expect([await text('repo:acme/portal'), await text('validate')]).toEqual(['Deselect all', 'Validate 7'])
  // Deselect all: the draft and the change request go back to the pane, the rest out by hand
  await ui.press({ key: 'repo:acme/portal' })
  expect([await text('repo:acme/portal'), await text('validate')]).toEqual(['Select all', 'Validate 3'])
  expect((await ui.find({ type: 'Text', text: /^Left out by itself/ }))?.text).toBe('Left out by itself: 1 change request · 1 draft')
  await ui.press({ key: 'pick:acme/portal#220' })
  await ui.press({ key: 'pick:acme/portal#221' })
  expect(await text('validate')).toBe('Validate 5')
  await ui.press({ key: 'clear' })
  expect([await text('validate'), await text('clear')]).toEqual(['Validate 0', 'Restore default'])
  await ui.press({ key: 'clear' })
  expect([await text('validate'), await text('clear')]).toEqual(['Validate 5', 'Clear selection'])
  await ui.unmount()
})

test('the terminal draws the boxes in brackets', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 60, rows: 30 } })
  expect((await ui.find({ key: 'pick:acme/web#7' }))?.text).toBe('[x]')
  expect((await ui.find({ key: 'pick:acme/portal#222' }))?.text).toBe('[ ]')
  await ui.unmount()
})

test('a failed check: a red banner, the list still there', async ($, on) => {
  on('state.get', stored({ round: { ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'Check failed' }))?.text).toBe('Check failed')
  expect((await ui.find({ key: 'failed-btn' }))?.text).toBe('Retry')
  expect((await ui.find({ key: 'validate' }))?.text).toBe('Validate 5')
  await ui.unmount()
})

test('no connected repo: one sentence, one button', async ($, on) => {
  on('state.get', stored({ round: { at: round.at, okAt: round.at, repos: [], pending: [], others: [], needsRepos: true } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'No GitHub repo here' }))?.text).toBe('No GitHub repo here')
  expect((await ui.find({ key: 'norepo-btn' }))?.text).toBe('Set up')
  await ui.unmount()
})

test('the first check shows placeholders and says what is happening', async ($, on) => {
  on('state.get', stored({ isRunning: true }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^First check/ }))?.text).toBe('First check takes a few seconds.')
  expect((await ui.find({ type: 'Text', text: 'Checking…' }))?.text).toBe('Checking…')
  await ui.unmount()
})

test('a bare /argos repos add connects the session folder', async ($, on) => {
  const runs: string[][] = []
  // each add starts a round; a round already running makes it return at once
  let reads = 0
  let settle = () => {}
  const ticked = new Promise<void>(r => (settle = r))
  on('state.get', () => {
    if (++reads === 2) settle()
    return { value: { value: true, version: 1 } }
  })
  on('session.cwd', () => ({ value: 'D:/work/shop' }))
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: 'connected', stderr: '' } }
  })
  await $.command.run({ command: 'argos', args: 'repos add' })
  expect(runs[0]?.slice(2)).toEqual(['add', 'D:/work/shop', '--lang', 'en'])
  await $.command.run({ command: 'argos', args: 'repos add acme/web' })
  expect(runs.find(a => a.includes('acme/web'))?.slice(2)).toEqual(['add', 'acme/web', '--lang', 'en'])
  await ticked
})

test('a failed round shows the reason round.mjs wrote, not the wrapper', async ($, on) => {
  const failed = { ...round, at: new Date(NOW + 1000).toISOString(), error: 'gh: not logged into any GitHub hosts' }
  on('clock.now', clock)
  on('env.get', () => ({ value: 'C:/home' }))
  on('fs.read', () => ({ value: JSON.stringify(failed) }))
  on('process.run', () => {
    throw new Error('exit code 1')
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // the round runs after /argos returns: wait until it is over
  let settle = () => {}
  const over = new Promise<void>(r => (settle = r))
  on('state.set', async ($: unknown, e: { key: string; value: unknown }, next: (e: unknown) => unknown) => {
    const done = await next(e)
    if (e.key === 'isRunning' && e.value === false) settle()
    return done
  })
  await $.command.run({ command: 'argos', args: '' })
  await over
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /gh auth login/ }))?.text).toContain('gh auth login')
  expect((await ui.find({ key: 'failed-btn' }))?.text).toBe('Fix auth')
  await ui.unmount()
})

test('auto-validate sends old verdicts on my PRs to one background subagent after a round', async ($, on) => {
  const fresh = { ...vround, at: new Date(NOW + 1000).toISOString(), okAt: new Date(NOW + 1000).toISOString() }
  const files: Record<string, string> = {
    'last-round.json': JSON.stringify(fresh),
    'verdicts.json': JSON.stringify({ ...judged, auto: 'mine', batch: { urls: [], at: null }, prs: { u219: V({ sha: 'old0000' }), u9: V({ sha: 'old0000' }) } }),
  }
  const runs: string[][] = []
  const spawns: { prompt: string }[] = []
  // the round runs after /argos returns: wait until it is over
  let settle = () => {}
  const over = new Promise<void>(r => (settle = r))
  on('state.set', async ($: unknown, e: { key: string; value: unknown }, next: (e: unknown) => unknown) => {
    const done = await next(e)
    if (e.key === 'isRunning' && e.value === false) settle()
    return done
  })
  on('clock.now', clock)
  on('env.get', () => ({ value: 'C:/home' }))
  // the engine hands the path in the system's own form
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: files[e.path.split(/[\\/]/).at(-1)!] }))
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('agent.spawn', (_: unknown, e: { prompt: string }) => {
    spawns.push(e)
    return { agentId: 'a1', model: 'm' }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'argos', args: '' })
  await over
  // only my PR: the teammate's old verdict waits for "all"
  expect(runs.find(a => a.includes('start'))?.slice(2)).toEqual(['start', 'u219'])
  expect(spawns).toHaveLength(1)
  expect(spawns[0]?.prompt).toContain('references/validate.md')
  expect(spawns[0]?.prompt).toContain('- u219')
})

test('every button shows on a desktop the text it holds', async ($, on) => {
  on('state.get', stored({ round, selected: ['acme/web#7'], open: 'team' }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  const buttons: { props?: { key?: string; label?: string }; children?: unknown[] }[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'Button') buttons.push(n)
    for (const c of n.children ?? []) walk(c)
  }
  walk(await ui.drawn())
  expect(buttons.length).toBeGreaterThan(5)
  for (const b of buttons) {
    const kids = b.children ?? []
    expect([b.props?.key, kids.every(c => typeof c === 'string')]).toEqual([b.props?.key, true])
    // the engine moves the string child into the label, which the desktop shows: a label kept
    // beside a child means the two differ, and the desktop would show the label
    expect([b.props?.key, b.props?.label && kids.length ? 'label beside text' : 'one text']).toEqual([b.props?.key, 'one text'])
  }
  await ui.unmount()
})
