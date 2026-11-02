import { expect, test } from 'claude-code/testing'

import { compose, reason, toViewModel, verdictOf, verdictTag } from './register'

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
  // a repo with a draft or a change request left out is not "all": its heading box is mixed
  expect(vm.groups.map(g => [g.name, g.rows.length, g.count, g.mark])).toEqual([
    ['api', 1, '1 of 1', 'on'],
    ['portal', 4, '2 of 4', 'mixed'],
    ['web', 2, '2 of 2', 'on'],
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

test('photos fit the pane budget: an author has theirs on every line or on none', () => {
  // me: 4 lines + a switch = 5 uses; caio: 2 uses; at 20000 chars each, me (100000) fits, caio would pass 120000
  const big = 'M0 0h1v1H0z'.repeat(1818) + 'M0'
  const vm = ok(vmOf({ ...round, avatars: { me: big, caio: big, bia: 'M0 0h1v1H0z' } }))
  const photo = (who: string) => [...new Set(vm.rows.filter(x => x.author === who).map(x => x.avatar.includes('M0 0h1v1H0z')))]
  expect([photo('me'), photo('caio'), photo('bia')]).toEqual([[true], [false], [true]])
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
    u8: V({ state: 'running', at: new Date(NOW - 5 * 6e4).toISOString() }),
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
  // an old verdict is a hollow star with no word, and the PR goes again
  expect([at('acme/api#9').isIn, at('acme/api#9').verdict?.text, at('acme/api#9').verdict?.count]).toEqual([true, '☆', undefined])
  // blockers are amber, a pass green: purple only says Argos looked
  expect([at('acme/web#7').verdict?.color, verdictTag(verdictOf(shaOn(item({})), V({}) as never), 'en').color]).toEqual(['warning', 'success'])
  // both started: one done, one validating
  expect(vm.run?.label).toBe('Validating 2 of 2')
})

test('a run: failed ones say why and go again; a line stuck past the limit counts as failed', () => {
  const vs = (prs: Record<string, unknown>) => ({ ...judged, batch: { urls: ['u8', 'u9', 'u7'], at: round.at }, prs: { ...judged.prs, ...prs } }) as never
  // the run line stays until the next check: this round looked before the run ended
  const before = { ...vround, okAt: ago(2) }
  const stuck = ok(toViewModel(before as never, { now: NOW, lang: 'en', minutes: 60, running: false, verdicts: vs({ u8: V({ state: 'running', at: ago(1) }) }) }))
  expect([stuck.run?.isRunning, stuck.run?.label, stuck.run?.retry]).toEqual([false, '2 validated · 1 failed', ['u8']])
  // a failed line is picked again by default, says why on its line, its verdict a red ✕
  const row = stuck.rows.find(x => x.key === 'acme/web#8')!
  expect([row.isIn, row.verdict?.count, row.status?.text, row.status?.color]).toEqual([true, '✕', 'failed · timed out after 10 min', 'error'])
  // its verdict is on an older commit than the head, and says so
  expect(stuck.rows.find(x => x.key === 'acme/api#9')?.status?.text).toBe('validated · new commits since')
  // a newer check takes the run line and the words off
  expect(ok(toViewModel(vround as never, { now: NOW, lang: 'en', minutes: 60, running: false, verdicts: vs({ u8: V({ state: 'running', at: ago(1) }) }) })).run).toBe(null)
  const merged = ok(
    toViewModel(before as never, {
      now: NOW,
      lang: 'en',
      minutes: 60,
      running: false,
      repos: [{ repo: 'acme/web', merge: true }, { repo: 'acme/api', merge: true }],
      verdicts: vs({ u8: V({ state: 'failed', reason: 'no access' }), u7: { ...V({ issues: 0 }), merge: { state: 'approved', why: 'needs more reviews', sha: 'abc1234', at: round.at } }, u9: V({ attention: 1 }) }),
    }),
  )
  const status = (k: string) => merged.rows.find(x => x.key === k)?.status?.text
  expect([merged.run?.label, merged.run?.retry, status('acme/web#7'), status('acme/web#8'), status('acme/api#9'), merged.mergeLine]).toEqual([
    '2 validated · 1 failed · 1 approved, awaiting reviews',
    ['u8'],
    'approved · needs more reviews',
    'failed · no access',
    // a repo with auto-merge says why a verdict that did not pass was not merged
    'skipped · attention 1',
    'Auto-merge on in api, web',
  ])
})

test('the pane: the count, who goes, one Validate button and one line per PR', async ($, on) => {
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
  // Who opens the authors: one tap leaves one out, the line stays where it was
  expect((await ui.find({ key: 'who' }))?.text).toBe('Who: Everyone ▸')
  await ui.press({ key: 'who' })
  expect((await ui.find({ key: 'who:me' }))?.text).toBe('☑ me 4')
  await ui.press({ key: 'who:me' })
  expect([(await ui.find({ key: 'who:me' }))?.text, (await ui.find({ key: 'who' }))?.text]).toEqual(['☐ me 4', 'Who: Everyone · me out ▾'])
  expect((await ui.find({ key: 'validate' }))?.text).toBe('Validate 3')
  // the box of an author left out opens Who, where they come back, and leaves the line as it was
  await ui.press({ key: 'who' })
  await ui.press({ key: 'pick:acme/portal#220' })
  expect([(await ui.find({ key: 'who' }))?.text, (await ui.find({ key: 'validate' }))?.text]).toEqual(['Who: Everyone · me out ▾', 'Validate 3'])
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
  expect(runs.find(a => a.includes('queue'))?.length).toBe(3 + 12)
  expect(spawns.map(s => s.prompt.split('\n').filter(l => l.startsWith('- ')).length)).toEqual([10, 2])
  await ui.unmount()
})

test('a repo heading takes or leaves its whole repo, Only keeps just it; Clear leaves everything out, Restore brings the default back', async ($, on) => {
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : next(e),
  )
  on('clock.now', clock)
  on('store.set', () => ({ value: undefined }))
  const ui = await $.ui.mount(PANE)
  const text =async (key: string) => (await ui.find({ key }))?.text
  // portal goes 2 of 4 (a draft and a change request left out): its box takes those too
  expect(await text('repo:acme/portal')).toBe('◩ portal')
  await ui.press({ key: 'repo:acme/portal' })
  expect([await text('repo:acme/portal'), await text('validate')]).toEqual(['☑ portal', 'Validate 7'])
  // and leaves them: the draft and the change request go back to the pane, the rest out by hand
  await ui.press({ key: 'repo:acme/portal' })
  expect([await text('repo:acme/portal'), await text('validate')]).toEqual(['☐ portal', 'Validate 3'])
  expect((await ui.find({ type: 'Text', text: /^Left out by itself/ }))?.text).toBe('Left out by itself: 1 change request · 1 draft')
  await ui.press({ key: 'pick:acme/portal#220' })
  await ui.press({ key: 'pick:acme/portal#221' })
  expect(await text('validate')).toBe('Validate 5')
  await ui.press({ key: 'clear' })
  expect([await text('validate'), await text('clear')]).toEqual(['Validate', 'Restore default'])
  await ui.press({ key: 'clear' })
  expect([await text('validate'), await text('clear')]).toEqual(['Validate 5', 'Clear selection'])
  // Only: that repo at the pane's own picks, every other repo left out, and Validate says where
  await ui.press({ key: 'only:acme/portal' })
  expect([await text('validate'), await text('repo:acme/web')]).toEqual(['Validate 2 · portal', '☐ web'])
  await ui.unmount()
})

test('quick picks: everything with nothing pending, or my PRs with something asked of me', async ($, on) => {
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : next(e),
  )
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  const text = async (key: string) => (await ui.find({ key }))?.text
  expect([await text('quick:clean'), await text('quick:rework')]).toEqual(['Nothing pending 5 ✓', 'My PRs to rework 1'])
  // my S3 migration has open threads: the pane left it out, the pick brings it alone
  await ui.press({ key: 'quick:rework' })
  expect([await text('validate'), await text('quick:rework'), await text('quick:clean')]).toEqual(['Validate 1 · portal', 'My PRs to rework 1 ✓', 'Nothing pending 5'])
  await ui.press({ key: 'quick:clean' })
  expect([await text('validate'), await text('pick:acme/portal#219')]).toEqual(['Validate 5', '☐'])
  await ui.unmount()
})

test('automatic mode, a repo\'s auto-merge (two taps on, one off) and its own prompt, from the pane', async ($, on) => {
  const runs: string[][] = []
  // the seeded values, and the pane's own writes read back
  const seeded: Record<string, unknown> = { round, verdicts: { ...judged, auto: 'off', batch: { urls: [], at: null } }, repos: [{ repo: 'acme/web' }] }
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) => (e.key in seeded ? { value: { value: seeded[e.key], version: 1 } } : next(e)))
  on('clock.now', clock)
  on('env.get', () => ({ value: 'C:/home' }))
  on('fs.read', () => {
    throw new Error('no file')
  })
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    runs.push([...e.argv.slice(2)])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const ui = await $.ui.mount(PANE)
  const text = async (key: string) => (await ui.find({ key }))?.text
  expect((await ui.find({ type: 'Text', text: /^Off ·/ }))?.text).toBe('Off · no rounds scheduled')
  await ui.select({ key: 'auto-mode', value: 'mine' })
  expect(runs.at(-1)).toEqual(['auto', 'mine', '--every', '30'])
  // auto-merge: Settings opens the fold; Turn on asks first, naming what it will do on GitHub
  await ui.press({ key: 'settings:acme/web' })
  expect(await text('merge:acme/web')).toBe('Turn on…')
  await ui.press({ key: 'merge:acme/web' })
  expect([await text('merge-yes:acme/web'), (await ui.find({ type: 'Text', text: /^Argos will approve/ }))?.text]).toEqual([
    'Yes, auto-merge web',
    'Argos will approve and merge PRs on GitHub as you (@me), only when all of these hold:',
  ])
  await ui.press({ key: 'merge-cancel:acme/web' })
  expect(runs.some(a => a.includes('merge'))).toBe(false)
  await ui.press({ key: 'merge:acme/web' })
  await ui.press({ key: 'merge-yes:acme/web' })
  expect(runs.at(-1)).toEqual(['merge', 'acme/web', 'on', '--lang', 'en'])
  // this repo's prompt, saved on Enter
  await ui.input({ key: 'prompt:acme/web', text: ' Check the ledger invariants first ' })
  expect(runs.at(-1)).toEqual(['prompt', 'acme/web', 'Check the ledger invariants first', '--lang', 'en'])
  await ui.unmount()
})

test('while a run goes the lines are locked and say how each stands; Validate waits', async ($, on) => {
  const at = (m: number) => new Date(NOW - m * 6e4).toISOString()
  const going = { ...judged, batch: { urls: ['u9', 'u220', 'u7'], at: at(5) }, prs: { u9: V({ state: 'running', at: at(3) }), u220: { state: 'queued', at: at(5) }, u7: V({ state: 'failed', reason: 'no access', at: at(2) }) } }
  on('state.get', stored({ round: vround, verdicts: going }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect([await ui.find({ key: 'validate' }), await ui.find({ key: 'pick:acme/api#9' })]).toEqual([undefined, undefined])
  expect((await ui.find({ type: 'Text', text: /^Validating/ }))?.text).toBe('Validating 2 of 3')
  expect((await ui.find({ type: 'Text', text: /validating · / }))?.text).toBe('· validating · 3m')
  expect((await ui.find({ type: 'Text', text: /· queued/ }))?.text).toBe('· queued')
  await ui.unmount()
})

test('a prompt: the Argos one, it plus your own, or yours alone (the Argos one when you wrote none)', () => {
  const mine = (text: string) => [text, 'record verdicts']
  expect(compose({ mode: 'argos+mine', text: 'check i18n' }, ['job'], mine)).toEqual(['job', 'check i18n'])
  expect(compose({ mode: 'argos', text: 'check i18n' }, ['job'], mine)).toEqual(['job'])
  expect(compose({ mode: 'mine', text: 'check i18n' }, ['job'], mine)).toEqual(['check i18n', 'record verdicts'])
  expect(compose({ mode: 'mine', text: '' }, ['job'], mine)).toEqual(['job'])
})

test('the agents at work are listed with Stop; Fix my PRs runs in the background and says when done', async ($, on) => {
  const runs: string[][] = []
  const spawned: { prompt: string; description: string }[] = []
  const seeded: Record<string, unknown> = {
    round,
    verdicts: { ...judged, batch: { urls: ['u9'], at: round.at }, prs: { u9: V({ state: 'running', at: new Date(NOW - 6e4).toISOString() }) } },
    agentRuns: { a1: ['u9'] },
  }
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) => (e.key in seeded ? { value: { value: seeded[e.key], version: 1 } } : next(e)))
  on('clock.now', clock)
  on('env.get', () => ({ value: 'C:/home' }))
  on('fs.read', () => {
    throw new Error('no file')
  })
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'Argos validate · 1 PRs', type: 'general-purpose', status: 'running', spawnedBy: 'argos' }] }))
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    runs.push([...e.argv.slice(2)])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('agent.spawn', (_: unknown, e: { prompt: string; description: string }) => {
    spawned.push(e)
    return { agentId: 'f1', model: 'm' }
  })
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /agent working$/ }))?.text).toBe('1 agent working')
  // the agent is its run: its line says how far it got, with the one Stop
  expect((await ui.find({ type: 'Text', text: /^\d+ of \d+$/ }))?.text).toBe('0 of 1')
  // Stop: its PRs not yet validated fail, ready for Retry; its tools are refused from then on
  await ui.press({ key: 'stop:a1' })
  expect(runs.at(-1)).toEqual(['fail', 'u9', '--reason', 'stopped'])
  await ui.unmount()

  // Fix my PRs: the S3 migration has open threads; one agent fixes, pushes and replies on its own
  seeded.verdicts = { ...judged, batch: { urls: [], at: null } }
  const fix = await $.ui.mount(PANE)
  expect((await fix.find({ key: 'fix' }))?.text).toBe('Fix my 1 with Argos')
  await fix.press({ key: 'fix' })
  expect(spawned.at(-1)?.description).toBe('Argos fix · 1 PRs')
  expect(spawned.at(-1)?.prompt).toMatch(/push and reply without asking me/)
  expect(spawned.at(-1)?.prompt.split('\n').at(-1)).toBe('- u219')
  await fix.unmount()

  // while it works, its line says fixing and the button is gone
  seeded.fixRuns = { a1: ['u219'] }
  const busy = await $.ui.mount(PANE)
  expect(await busy.find({ key: 'fix' })).toBeFalsy()
  expect(await busy.find({ type: 'Text', text: /fixing/ })).toBeTruthy()
  await busy.unmount()
})

test('who: presets leave kinds out, the label always says the whole state', async ($, on) => {
  expect(ok(vmOf(round, {}, 'en', ['kind:agent'])).validate.count).toBe(4)
  expect(ok(vmOf(round)).who.presets.map(p => p.id)).toEqual(['everyone', 'people', 'agents'])
  expect(ok(vmOf(round, {}, 'en', ['kind:bot', 'kind:agent'])).who.label).toBe('Who: People only')
  expect(ok(vmOf(round, {}, 'en', ['me', 'bia', 'caio'])).who.label).toBe('Who: only Copilot')
  expect(ok(vmOf(round, {}, 'en', ['kind:agent', 'bia'])).who.label).toBe('Who: 2 of 4 authors')
  const many = Array.from({ length: 8 }, (_, i) => item({ kind: 'other', number: 500 + i, url: `u5${i}`, author: `dev${i}`, signals: [] }))
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: { ...round, pending: [], mine: [], others: [...many, theirs] }, version: 1 } } : next(e),
  )
  on('clock.now', clock)
  on('store.set', () => ({ value: undefined }))
  const ui = await $.ui.mount(PANE)
  const text = async (key: string) => (await ui.find({ key }))?.text
  expect(await ui.find({ key: 'who:dev3' })).toBeUndefined()
  await ui.press({ key: 'who' })
  await ui.press({ key: 'who:dev3' })
  expect(await text('who')).toBe('Who: Everyone · dev3 out ▾')
  await ui.press({ key: 'only:dev5' })
  expect([await text('who'), await text('validate')]).toEqual(['Who: only dev5 ▾', 'Validate 1 · portal'])
  // a preset resets the people
  await ui.press({ key: 'set:people' })
  expect([await text('who'), await text('validate'), await text('set:people')]).toEqual(['Who: People only ▾', 'Validate 8 · portal', 'People ✓'])
  // an author out with their kind comes back alone; the rest of the preset stays
  await ui.press({ key: 'who:Copilot' })
  expect([await text('who'), await text('validate')]).toEqual(['Who: Everyone but bots ▾', 'Validate 9'])
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
  // only what changed among my PRs with nothing pending: two with no verdict yet; the old one has
  // open threads (pending), the draft waits, the teammate's old verdict waits for "all"
  expect(runs.find(a => a.includes('queue'))?.slice(2)).toEqual(['queue', 'u220', 'u221'])
  expect(spawns).toHaveLength(1)
  expect(spawns[0]?.prompt).toContain('references/validate.md')
  expect(spawns[0]?.prompt).toContain('- u220')
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
