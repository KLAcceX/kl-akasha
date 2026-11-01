import { expect, test } from 'claude-code/testing'

import { bars, fit, pill } from './look'
import { action, byRank, rank, reason, sectionOf, tags, toViewModel, tone, verb, verdictOf } from './register'

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
const vmOf = (r: unknown, ui = {}, lang = 'en', prompt = '') => toViewModel(r as never, { now: NOW, lang, minutes: 60, running: false, ui, prompt })
const ok = (vm: ReturnType<typeof vmOf>) => {
  if (vm.state !== 'ok') throw new Error(vm.state)
  return vm
}
const shape = (vm: ReturnType<typeof ok>) => vm.sections.map(s => [s.id, s.prs.map(p => p.number)])

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
const BAND = { plugin: 'argos', component: 'AbovePrompt', props: { hasSurvey: false } } as never
const clock = () => ({ value: NOW })

test('rank puts merge first, then a late review, then unblocking mine; the longest wait breaks ties', () => {
  expect([conflict, lateReview, ready].sort(byRank).map(p => (p as { number: number }).number)).toEqual([220, 7, 219])
  expect(rank(theirs)).toBe(7)
})

test('verbs follow the fixed signal order, in each language', () => {
  expect(verb(item({ signals: ['threads:2', 'conflict'] }), 'en')).toBe('Resolve the conflict')
  expect(verb(item({ signals: ['threads:2'] }), 'pt-BR')).toBe('Fechar 2 conversas abertas')
  expect(verb(lateReview, 'en')).toBe("Review bia's PR")
  expect(verb(changed, 'pt-BR')).toBe('Revisar de novo')
})

test('each PR lands in the section of its next move, with one action and the colour that wins', () => {
  expect([conflict, ready, quiet, draft, lateReview, changed, theirs].map(sectionOf)).toEqual(['move', 'ready', 'waiting', 'drafts', 'move', 'team', 'team'])
  const a = (p: never) => [action(p, 'en').label, tone(p)]
  expect([conflict, ready, quiet, draft, lateReview, changed, theirs].map(a)).toEqual([
    ['Fix conflict', 'error'],
    ['Merge', 'success'],
    ['Nudge', null],
    ['Finish', null],
    ['Review', 'suggestion'],
    ['Summarize', null],
    ['Summarize', null],
  ])
  // blockers outrank feedback: CI reruns after a rebase
  expect(action(item({ signals: ['threads:2', 'ci_failed'] }), 'en').label).toBe('Fix CI')
  expect(a(item({ signals: ['changes_requested'] }))).toEqual(['Address review', 'warning'])
  expect(action(item({ signals: ['threads:2'] }), 'en').prompt).toBe('Respond to the 2 open threads on PR u1')
  expect(action(lateReview, 'en').prompt).toBe('Review PR u7 by @bia')
  expect(action(item({ kind: 'review', signals: ['changed'] }), 'pt-BR').label).toBe('Revisar de novo')
  // nobody asked to review: it waits on others, and the button finds someone
  const lonely = item({ signals: ['no_owner'] })
  expect([sectionOf(lonely), action(lonely, 'en').label]).toEqual(['waiting', 'Find reviewer'])
})

test('tags: signals, the agent glyph, labels by risk, the size meter; five at most', () => {
  const marks = (p: never) => tags(p).map(t => t.text)
  expect(marks(conflict)).toEqual(['◆', '¶2', '▂▄▆█'])
  expect(tags(conflict)[1]?.count).toBe('2')
  expect(marks(theirs)).toEqual(['?', '¤'])
  expect(marks(item({ signals: ['ready'], ci: 'pass' }))).toEqual(['✓', '✓'])
  expect(marks(item({ ci: 'pending', size: 10 }))).toEqual(['◌', '▂'])
  const busy = item({
    signals: ['conflict', 'ci_failed', 'changes_requested'],
    isAI: true,
    size: 500,
    labels: [
      { name: 'zeta', color: 'cccccc' },
      { name: 'ui', color: 'a2eeef' },
      { name: 'bug', color: 'd73a4a' },
    ],
  })
  // two signals then "+1" (outside the five), the agent, labels by risk then a–z; size goes first
  expect(marks(busy)).toEqual(['◆', '✕', '+1', '¤', '(bug)', '(ui)'])
  expect(bars(49)).toBe(1)
  expect(bars(1000)).toBe(4)
  expect(fit(Array.from({ length: 4 }, () => ({ k: 'label' as const, w: 10, text: 'l' })))).toHaveLength(2)
  expect(pill('a-very-long-label', 'd73a4a').svg).toContain('a-very-lo…')
})

test('the inbox: sections in order, what needs me, tinted rows where I act', () => {
  const vm = ok(vmOf(round))
  expect(shape(vm)).toEqual([
    ['move', [7, 219]],
    ['ready', [220]],
    ['waiting', [221]],
    ['drafts', [222]],
    ['team', [9, 8]],
  ])
  expect([vm.need, vm.checked, vm.clear]).toEqual(['2 need you', 'checked 1h ago', null])
  const [review, blocked] = vm.sections[0]!.prs
  expect([review?.ref, review?.act, blocked?.ref, blocked?.isOld]).toEqual(['web#7', 'Review', 'portal#219', true])
  expect(blocked?.box).toEqual({ bg: 'rgba(240,122,114,0.07)', border: 'rgba(240,122,114,0.35)' })
  expect(vm.sections[2]!.prs[0]?.box.bg).toBeUndefined()
  expect(vm.sections.find(s => s.id === 'team')?.isFolded).toBe(true)
  expect(ok(vmOf(round, { open: 'team' })).sections.find(s => s.id === 'team')?.isFolded).toBe(false)
  // under one repo the ref drops its prefix
  expect(ok(vmOf(round, { filter: 'acme/web' })).sections[0]?.prs[0]?.ref).toBe('#7')
  const calm = { ...round, pending: [], mine: [quiet, draft], others: [] }
  expect(ok(vmOf(calm)).clear).toBe('1 waiting on others · 1 draft')
  expect(ok(vmOf(calm, {}, 'pt-BR')).need).toBe('')
})

test('one Select narrows to a repo; twin short names show their owner', () => {
  const vm = ok(vmOf(round))
  expect(vm.repos.map(r => [r.id, r.name])).toEqual([
    ['', 'All repos'],
    ['acme/portal', 'portal'],
    ['acme/web', 'web'],
    ['acme/api', 'api'],
    ['acme/docs', 'docs'],
  ])
  expect(ok(vmOf(round, { filter: 'help' })).filter).toBe('')
  expect(ok(vmOf({ ...round, repos: ['acme/portal'], pending: [conflict], mine: [conflict], others: [] })).repos).toEqual([])
  const twins = ok(vmOf({ ...round, repos: ['acme/api', 'beta/api'], pending: [], mine: [], others: [item({ repo: 'beta/api', kind: 'other' })] }))
  expect(twins.repos.map(r => r.name)).toEqual(['All repos', 'acme/api', 'beta/api'])
})

test('the batch: each pick sends its winning action as one line; gone picks drop', () => {
  expect(ok(vmOf(round)).batch).toBeNull()
  const vm = ok(vmOf(round, { selected: ['acme/portal#219', 'acme/web#7', 'acme/gone#1'] }))
  expect(vm.batch?.count).toBe('2 picked')
  expect(vm.batch?.detail).toBe('Review #7 · Fix conflict #219')
  expect(vm.batch?.prompt).toBe('Review PR u7 by @bia\nResolve the merge conflict in PR u219')
  expect(vm.keep).toEqual(['acme/portal#219', 'acme/web#7'])
  expect(vm.sections[0]?.prs.map(p => [p.isPicked, p.box.border])).toEqual([
    [true, 'rgba(224,138,104,0.7)'],
    [true, 'rgba(224,138,104,0.7)'],
  ])
  // a request already in the prompt is not asked for twice
  expect(ok(vmOf(round, { selected: ['acme/portal#219', 'acme/web#7'] }, 'en', 'see u7')).batch?.prompt).toBe('Resolve the merge conflict in PR u219')
  // pull/1 is not pull/12
  const one = item({ number: 1, url: 'https://github.com/acme/portal/pull/1', signals: ['conflict'] })
  const twelve = { ...round, pending: [one], mine: [one], others: [] }
  expect(ok(vmOf(twelve, {}, 'en', 'fix https://github.com/acme/portal/pull/12 now')).sections[0]?.prs[0]?.inPrompt).toBe(false)
  expect(ok(vmOf(twelve, {}, 'en', 'fix https://github.com/acme/portal/pull/1/files')).sections[0]?.prs[0]?.inPrompt).toBe(true)
  // a folded section never hides a pick
  expect(ok(vmOf(round, { selected: ['acme/web#8'] })).sections.find(s => s.id === 'team')?.isFolded).toBe(false)
})

test('failures and late rounds say so', () => {
  expect(reason('gh: not logged into any GitHub hosts', 'en')).toContain('gh auth login')
  expect(reason('Error: timed out', 'pt-BR')).toContain('2 min')
  const failed = vmOf({ ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' })
  expect([failed.failed, failed.checked, failed.error?.isAuth]).toEqual([true, 'data from 1h ago', false])
  expect(vmOf({ ...round, error: 'gh: not logged into any GitHub hosts' }).error?.isAuth).toBe(true)
  expect(vmOf({ at: round.at, okAt: null, error: 'x' }).state).toBe('noData')
  const late = vmOf({ ...round, okAt: ago(0.2), at: ago(0.2) })
  expect([late.isLate, late.checked]).toEqual([true, 'checked 4h ago'])
})

test('the band shows the most urgent PR with its verb', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // the 16px logo leads the name, then what needs me and the first item
  expect((await ui.find({ type: 'Svg' }))?.props?.width).toBe(16)
  expect((await ui.find({ type: 'Text', text: 'Argos' }))?.text).toBe('Argos')
  expect((await ui.find({ type: 'Text', text: /need you/ }))?.text).toBe('2 need you')
  expect((await ui.find({ type: 'Text', text: /^·/ }))?.text).toBe("· Review bia's PR:")
  expect((await ui.find({ type: 'Text', text: 'web#7' }))?.text).toBe('web#7')
  await ui.unmount()
})

test('the band stays out of the way when nothing needs action', async ($, on) => {
  on('state.get', stored({ round: { ...round, pending: [], mine: [quiet, ready], others: [] } }))
  on('clock.now', clock)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the pane: Pull requests, what needs me, two-line rows with a pick and one button', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'Pull requests' }))?.text).toBe('Pull requests')
  // the 16px logo leads the title
  expect([(await ui.find({ type: 'Svg' }))?.props?.alt, (await ui.find({ type: 'Svg' }))?.props?.width]).toEqual(['Argos', 16])
  expect((await ui.find({ type: 'Text', text: /need you/ }))?.text).toBe('2 need you')
  expect((await ui.find({ key: 'check' }))?.text).toBe('Check now')
  expect((await ui.find({ key: 'act:acme/portal#219' }))?.text).toBe('Fix conflict')
  expect((await ui.find({ key: 'act:acme/portal#220' }))?.text).toBe('Merge')
  expect((await ui.find({ key: 'pick:acme/portal#219' }))?.text).toBe('+')
  // the team is folded behind Show; no batch bar without picks
  expect(await ui.find({ key: 'act:acme/web#8' })).toBeUndefined()
  expect((await ui.find({ key: 'fold:team' }))?.text).toBe('Show')
  expect(await ui.find({ key: 'send' })).toBeUndefined()
  await ui.unmount()
})

// A desktop draws a Button as a native button whose text is its label or its string child, so
// a label apart from the text, or an element child, would show something else than the tests see.
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

test('picked PRs bring the batch bar; the team unfolds', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round, selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8'], open: 'team' }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'send' }))?.text).toBe('Pôr no prompt')
  expect((await ui.find({ type: 'Text', text: /marcados$/ }))?.text).toBe('3 marcados')
  expect((await ui.find({ key: 'act:acme/web#8' }))?.text).toBe('Resumir')
  expect((await ui.find({ key: 'pick:acme/web#8' }))?.text).toBe('✓')
  await ui.unmount()
})

test('the terminal draws icons as their text marks', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 36, rows: 30 } })
  expect((await ui.find({ type: 'Text', text: '◆' }))?.text).toBe('◆')
  expect((await ui.find({ type: 'Text', text: '¶2' }))?.text).toBe('¶2')
  await ui.unmount()
})

test('with nothing for me a green banner takes the place of Your move', async ($, on) => {
  on('state.get', stored({ round: { ...round, pending: [], mine: [quiet], others: [] } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'Nothing needs you' }))?.text).toBe('Nothing needs you')
  expect((await ui.find({ type: 'Text', text: '1 waiting on others' }))?.text).toBe('1 waiting on others')
  expect(await ui.find({ type: 'Text', text: 'Your move' })).toBeUndefined()
  await ui.unmount()
})

test('a failed check: a red banner, the stale rows still act', async ($, on) => {
  on('state.get', stored({ round: { ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'Check failed' }))?.text).toBe('Check failed')
  expect((await ui.find({ type: 'Text', text: "Couldn't reach GitHub" }))?.text).toBe("Couldn't reach GitHub")
  expect((await ui.find({ key: 'failed-btn' }))?.text).toBe('Retry')
  expect((await ui.find({ key: 'act:acme/portal#219' }))?.text).toBe('Fix conflict')
  await ui.unmount()
})

test('no connected repo: one sentence, one button', async ($, on) => {
  on('state.get', stored({ round: { at: round.at, okAt: round.at, repos: [], pending: [], others: [], needsRepos: true } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'No GitHub repo here' }))?.text).toBe('No GitHub repo here')
  expect((await ui.find({ key: 'norepo-btn' }))?.text).toBe('Set up')
  expect(await ui.find({ key: 'check' })).toBeUndefined()
  await ui.unmount()
})

test('the first check shows placeholders and says what is happening', async ($, on) => {
  on('state.get', stored({ isRunning: true }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^First check/ }))?.text).toBe('First check takes a few seconds.')
  expect((await ui.find({ type: 'Text', text: 'Checking…' }))?.text).toBe('Checking…')
  expect(await ui.find({ key: 'check' })).toBeUndefined()
  await ui.unmount()
})

test('an action fills the prompt once; picks and the batch go in as lines', async ($, on) => {
  const fills: unknown[] = []
  let box = ''
  // the round from here, the pane's own atoms from the real store, so a press shows
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : next(e),
  )
  on('prompt.read', () => ({ value: { text: box, cursor: 0 } }))
  on('prompt.fill', (_: unknown, e: { text: string; mode: string }) => {
    fills.push(e.text)
    box = e.mode === 'append' ? box + e.text : e.text
    return { isFilled: true }
  })
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  // two quick presses meet one lock: the request goes in once
  await Promise.all([ui.press({ key: 'act:acme/web#7' }), ui.press({ key: 'act:acme/web#7' })])
  // already in the prompt: a third press adds nothing
  await ui.press({ key: 'act:acme/web#7' })
  await ui.press({ key: 'fold:team' })
  expect((await ui.find({ key: 'act:acme/web#8' }))?.text).toBe('Summarize')
  await ui.press({ key: 'pick:acme/portal#219' })
  await ui.press({ key: 'pick:acme/web#8' })
  expect((await ui.find({ type: 'Text', text: /picked$/ }))?.text).toBe('2 picked')
  await ui.press({ key: 'send' })
  expect(fills).toEqual(['Review PR u7 by @bia', '\nResolve the merge conflict in PR u219\nSummarize PR u8'])
  // the batch went in: the picks clear
  expect(await ui.find({ key: 'send' })).toBeUndefined()
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
  // hidden before the check: a failure brings the band back
  let hidden = true
  // the round runs after /argos returns: wait until it is over
  let settle = () => {}
  const over = new Promise<void>(r => (settle = r))
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'isHidden' ? { value: { value: hidden, version: 1 } } : next(e),
  )
  on('state.set', async ($: unknown, e: { key: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.key === 'isHidden') hidden = Boolean(e.value)
    const done = await next(e)
    if (e.key === 'isRunning' && e.value === false) settle()
    return done
  })
  await $.command.run({ command: 'argos', args: '' })
  await over
  expect(hidden).toBe(false)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /gh auth login/ }))?.text).toContain('gh auth login')
  expect((await ui.find({ key: 'failed-btn' }))?.text).toBe('Fix auth')
  await ui.unmount()
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

test('a verdict: none, running, passed, issues, or old once new commits land', () => {
  const p = shaOn(item({}))
  expect(verdictOf(p).state).toBe('none')
  expect(verdictOf(p, V({ state: 'running' }) as never).state).toBe('run')
  expect(verdictOf(p, V({}) as never).state).toBe('pass')
  expect(verdictOf(p, V({ issues: 2, finding: 'x' }) as never)).toEqual({ state: 'issues', issues: 2, finding: 'x' })
  expect(verdictOf(p, V({ sha: 'fff9999' }) as never).state).toBe('stale')
  // a verdict adds Fix issues on mine, Draft review on another's, Revalidate when old
  expect(action(conflict, 'en', verdictOf(p, V({ issues: 1 }) as never)).label).toBe('Fix conflict')
  expect(action(quiet, 'en', { state: 'issues', issues: 1, finding: '' }).label).toBe('Fix issues')
  expect(action(lateReview, 'en', { state: 'issues', issues: 3, finding: '' }).prompt).toBe('Turn the 3 findings on PR u7 into review comments')
  expect(action(quiet, 'en', { state: 'stale', issues: 0, finding: '' }).label).toBe('Revalidate')
  expect(action(changed, 'en', { state: 'stale', issues: 0, finding: '' }).label).toBe('Revalidate')
})

test('the inbox leads each judged row with its verdict and its top finding', () => {
  const vm = ok(toViewModel(vround as never, { now: NOW, lang: 'en', minutes: 60, running: false, verdicts: judged as never }))
  const [review, blocked] = vm.sections[0]!.prs
  expect([review?.tags[0]?.count, review?.finding, review?.act]).toEqual(['3', 'Cursor lost · +2', 'Draft review'])
  expect([blocked?.tags[0]?.count, blocked?.finding, blocked?.act]).toEqual(['2', 'No backoff cap · +1', 'Fix conflict'])
  // never validated: no star at all
  expect(vm.sections[1]!.prs[0]?.tags[0]?.text).toBe('✓')
  expect(vm.views.map(v => v.name)).toEqual(['Needs me (2)', 'Team (2)'])
  expect(vm.progress).toEqual({ done: 1, total: 2, label: 'Validating 1 of 2', pct: '50%' })
})

test('the team view groups by verdict; Pick all, Show more, and one batch action for all picks', () => {
  const at = (ui: object) => ok(toViewModel(vround as never, { now: NOW, lang: 'en', minutes: 60, running: false, verdicts: judged as never, ui }))
  const vm = at({ view: 'team' })
  expect(vm.view).toBe('team')
  expect(vm.groups.filter(g => g.count).map(g => [g.id, g.rows.map(r => r.ref), g.pickAll])).toEqual([
    ['run', ['web#8'], null],
    ['stale', ['api#9'], 'Pick all'],
  ])
  const picked = at({ view: 'team', selected: ['acme/api#9'] })
  expect(picked.groups.find(g => g.id === 'stale')?.pickAll).toBe('Unpick all')
  // old verdicts can be revalidated; a teammate's PR is never "Fix issues"
  expect(picked.batch?.acts.map(a => a.id)).toEqual(['validate', 'revalidate'])
  expect(picked.batch?.detail).toBe('Validate api#9')
  expect(at({ view: 'team', selected: ['acme/api#9'], act: 'revalidate' }).batch?.prompt).toBe(
    'Revalidate these PRs against their new commits with Argos and record each verdict:\n- u9',
  )
  // a team with nothing to show has no team view
  expect(ok(vmOf({ ...round, others: [] }, { view: 'team' })).view).toBe('')
})

test('the team view draws compact rows, Pick all and the batch picker', async ($, on) => {
  on('state.get', stored({ round: vround, verdicts: judged, view: 'team', selected: ['acme/api#9'] }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'all:stale' }))?.text).toBe('Unpick all')
  expect((await ui.find({ key: 'pick:acme/api#9' }))?.text).toBe('✓')
  expect((await ui.find({ type: 'Text', text: 'Validating 1 of 2' }))?.text).toBe('Validating 1 of 2')
  expect((await ui.find({ key: 'send' }))?.text).toBe('Add to prompt')
  expect(await ui.find({ key: 'act:acme/portal#219' })).toBeUndefined()
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

// The band in every state: never a false one, a failure always in words.
const bandText = async ($: any, on: any, values: Record<string, unknown>) => {
  on('state.get', stored(values))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const texts: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'Text') texts.push((n.children ?? []).join(''))
    for (const c of n.children ?? []) walk(c)
  }
  walk(await ui.drawn())
  await ui.unmount()
  return texts
}

test('the band while a check runs says so, with no item', async ($, on) => {
  expect(await bandText($, on, { round, isRunning: true })).toEqual(['Argos', 'Checking…'])
})

test('a failed check with old data keeps what needs me and says it failed', async ($, on) => {
  const texts = await bandText($, on, { round: { ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' } })
  expect(texts).toEqual(['Argos', '2 need you', "· Review bia's PR:", 'web#7', '· Check failed'])
})

test('a failed check with nothing to show says it failed, in words', async ($, on) => {
  const texts = await bandText($, on, { round: { ...round, pending: [], mine: [quiet], others: [], at: new Date(NOW).toISOString(), error: 'Error: timed out' } })
  expect(texts).toEqual(['Argos', 'Check failed'])
})

test('a late check is not a failed one: it says when Argos last looked', async ($, on) => {
  const late = { ...round, pending: [], mine: [quiet], others: [], okAt: ago(0.2), at: ago(0.2) }
  expect(await bandText($, on, { round: late })).toEqual(['Argos', 'checked 4h ago'])
})

test('Hide is a quiet word: it hides the band and says how to get it back', async ($, on) => {
  const toasts: string[] = []
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : next(e),
  )
  on('clock.now', clock)
  on('ui.toast', (_: unknown, e: { text?: string; message?: string }) => {
    toasts.push(String(e.text ?? e.message ?? ''))
    return { value: undefined }
  })
  // once hidden the band passes on: this stands for the engine's own drawing
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const hide = await ui.find({ key: 'hide' })
  expect([hide?.text, hide?.props?.plain, hide?.props?.variant]).toEqual(['Hide', true, undefined])
  expect((await ui.find({ key: 'open' }))?.props?.variant).toBe('secondary')
  await ui.press({ key: 'hide' })
  expect(toasts).toEqual(['Hidden until something new · /argos opens the pane'])
  expect(await ui.find({ key: 'hide' })).toBeUndefined()
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
