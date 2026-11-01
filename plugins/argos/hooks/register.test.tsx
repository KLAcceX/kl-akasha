import { expect, test } from 'claude-code/testing'

import { bars, fit, pill } from './look'
import { action, byRank, rank, reason, sectionOf, tags, toViewModel, tone, verdictOf, verdictTag } from './register'

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
const clock = () => ({ value: NOW })

test('rank puts merge first, then a late review, then unblocking mine; the longest wait breaks ties', () => {
  expect([conflict, lateReview, ready].sort(byRank).map(p => (p as { number: number }).number)).toEqual([220, 7, 219])
  expect(rank(theirs)).toBe(7)
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
  const marks = (p: never) => tags(p, 'en').map(t => t.text)
  expect(marks(conflict)).toEqual(['◆', '¶2', '▂▄▆█'])
  expect(tags(conflict, 'en')[1]?.count).toBe('2')
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
  expect(vm.sections.find(s => s.id === 'team')?.isOpen).toBe(false)
  expect(ok(vmOf(round, { folds: { 'needs:team': { open: true, needs: [] } } })).sections.find(s => s.id === 'team')?.isOpen).toBe(true)
  // under one repo the ref drops its prefix
  expect(ok(vmOf(round, { filter: 'acme/web' })).sections[0]?.prs[0]?.ref).toBe('#7')
  const calm = { ...round, pending: [], mine: [quiet, draft], others: [] }
  expect(ok(vmOf(calm)).clear).toBe('1 waiting on others · 1 draft')
  expect(ok(vmOf(calm, {}, 'pt-BR')).need).toBe('')
})

test('one Select narrows to a repo, each with its open PRs; twin short names show their owner', () => {
  const vm = ok(vmOf(round))
  expect(vm.repos.map(r => [r.id, r.name])).toEqual([
    ['', 'All repos · 7'],
    ['acme/portal', 'portal · 4'],
    ['acme/web', 'web · 2'],
    ['acme/api', 'api · 1'],
    ['acme/docs', 'docs · 0'],
  ])
  expect(ok(vmOf(round, { filter: 'help' })).filter).toBe('')
  expect(ok(vmOf({ ...round, repos: ['acme/portal'], pending: [conflict], mine: [conflict], others: [] })).repos).toEqual([])
  const twins = ok(vmOf({ ...round, repos: ['acme/api', 'beta/api'], pending: [], mine: [], others: [item({ repo: 'beta/api', kind: 'other' })] }))
  expect(twins.repos.map(r => r.name)).toEqual(['All repos · 1', 'acme/api · 0', 'beta/api · 1'])
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
  // a folded section still shows what is picked in it
  expect(ok(vmOf(round, { selected: ['acme/web#8'] })).sections.find(s => s.id === 'team')?.picked).toBe('1 picked')
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
  // every icon says what it means on hover: its tip as the SVG's title, drawn interactive
  const svgs: { props?: { alt?: string; source?: string; isInteractive?: boolean } }[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'Svg') svgs.push(n)
    for (const c of n.children ?? []) walk(c)
  }
  walk(await ui.drawn())
  const svg = (alt: string) => svgs.find(n => n.props?.alt === alt)?.props
  expect([svg('Merge conflict')?.isInteractive, String(svg('Merge conflict')?.source).includes('<title>Merge conflict</title>')]).toEqual([true, true])
  expect(svg('Blocked: conflict or failing CI')?.isInteractive).toBe(true)
  // the team is folded behind Show; no batch bar without picks
  expect(await ui.find({ key: 'act:acme/web#8' })).toBeUndefined()
  expect((await ui.find({ key: 'fold:needs:team' }))?.text).toBe('▸ Team')
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
  on('state.get', stored({ round, selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8'], folds: { 'needs:team': { open: true, needs: [] } } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'send' }))?.text).toBe('Pôr no prompt')
  expect((await ui.find({ type: 'Text', text: /^3 marcados$/ }))?.text).toBe('3 marcados')
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
  await ui.press({ key: 'fold:needs:team' })
  expect((await ui.find({ key: 'act:acme/web#8' }))?.text).toBe('Summarize')
  await ui.press({ key: 'pick:acme/portal#219' })
  await ui.press({ key: 'pick:acme/web#8' })
  expect((await ui.find({ type: 'Text', text: /^2 picked$/ }))?.text).toBe('2 picked')
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
  expect(verdictOf(p, V({ issues: 2, finding: 'x' }) as never)).toEqual({ state: 'issues', issues: 2, attention: 0, finding: 'x' })
  // a partly read PR never passes; a pass with attention never looks clean
  expect(verdictOf(p, V({ partial: true }) as never).state).toBe('partial')
  expect(verdictOf(p, V({ partial: true, issues: 1 }) as never).state).toBe('issues')
  const watch = verdictOf(p, V({ attention: 2, finding: 'deploy: no timeout (api.ts:9)' }) as never)
  expect([watch.state, verdictTag(watch, 'en').count, verdictTag(watch, 'en').tip]).toEqual(['pass', '✓+2', 'AI validation: passed · attention 2'])
  expect(verdictTag(verdictOf(p, V({ issues: 3, attention: 1 }) as never), 'en').tip).toBe('AI validation: blocks 3 · attention 1')
  expect(verdictTag(verdictOf(p, V({ partial: true }) as never), 'en').count).toBe('partial')
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
  expect(vm.views.map(v => v.name)).toEqual(['Needs me (2)', 'By repo (3)', 'Team (2)'])
  expect(vm.progress).toEqual({ done: 1, total: 2, label: 'Validating 1 of 2', pct: '50%' })
})

test('the team view groups by verdict; Pick all, Show more, and one batch action for all picks', () => {
  const at = (ui: object) => ok(toViewModel(vround as never, { now: NOW, lang: 'en', minutes: 60, running: false, verdicts: judged as never, ui }))
  const vm = at({ view: 'team' })
  expect(vm.view).toBe('team')
  expect(vm.groups.filter(g => g.count).map(g => [g.id, g.rows.map(r => r.ref), g.pickAll])).toEqual([
    ['run', ['web#8'], null],
    ['stale', [], 'Pick all'],
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
  on('state.get', stored({ round: vround, verdicts: judged, view: 'team', selected: ['acme/api#9'], folds: { 'team:stale': { open: true, needs: [] } } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'all:team:stale' }))?.text).toBe('Unpick all')
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


test('by repo: the header decides; open only where something needs me, four rows, picks shown folded', () => {
  const many = [1, 2, 3, 4, 5].map(n => item({ number: 300 + n, url: `u3${n}`, title: `P${n}`, createdAt: ago(n), signals: [] }))
  const r2 = { ...round, mine: [conflict, ready, quiet, draft, ...many] }
  const vm = ok(vmOf(r2, { view: 'repos' }))
  expect(vm.view).toBe('repos')
  // what needs me first, then the worst glyph, then the busiest
  expect(vm.repoSections.map(s => [s.label, s.count, s.tally, s.isOpen])).toEqual([
    ['portal', 9, '9 · 1 needs you', true],
    ['web', 2, '2 · 1 needs you', true],
    ['api', 1, '1', false],
  ])
  const portal = vm.repoSections[0]!
  // the blocked PR leads, four rows shown, the rest behind Show N more; refs drop the repo
  expect([portal.prs.map(p => p.ref)[0], portal.prs.length, portal.more, portal.glyphTip]).toEqual(['#219', 4, 'Show 5 more', 'Blocked: conflict or failing CI'])
  // a hand fold sticks until a new PR needs me there
  const folded = ok(vmOf(r2, { view: 'repos', folds: { 'repos:acme/portal': { open: false, needs: ['acme/portal#219'] } } }))
  expect([folded.repoSections[0]?.isOpen, folded.repoSections[0]?.prs.length]).toEqual([false, 0])
  const fresh = ok(vmOf(r2, { view: 'repos', folds: { 'repos:acme/portal': { open: false, needs: [] } } }))
  expect(fresh.repoSections[0]?.isOpen).toBe(true)
  // Pick all works folded; the header keeps the hidden picks visible
  const picked = ok(vmOf(r2, { view: 'repos', selected: ['acme/api#9'] }))
  expect(picked.repoSections.find(s => s.label === 'api')?.picked).toBe('1 picked')
  expect(picked.repoSections.find(s => s.label === 'api')?.allPicked).toBe(true)
  // one repo: nothing to group, so no such view
  expect(ok(vmOf({ ...round, repos: ['acme/portal'], pending: [conflict], mine: [conflict], others: [] }, { view: 'repos' })).view).toBe('')
})

test('the by-repo view draws a header per repo, folds it, and hides the repo picker', async ($, on) => {
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : e.key === 'view' ? { value: { value: 'repos', version: 1 } } : next(e),
  )
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'fold:repos:acme/portal' }))?.text).toBe('▾ portal')
  expect((await ui.find({ type: 'Text', text: '4 · 1 needs you' }))?.text).toBe('4 · 1 needs you')
  expect((await ui.find({ key: 'act:acme/portal#219' }))?.text).toBe('Fix conflict')
  expect(await ui.find({ key: 'repo' })).toBeUndefined()
  await ui.press({ key: 'fold:repos:acme/portal' })
  expect(await ui.find({ key: 'act:acme/portal#219' })).toBeUndefined()
  expect((await ui.find({ key: 'fold:repos:acme/portal' }))?.text).toBe('▸ portal')
  await ui.unmount()
})

test('/argos demo opens in By repo, with its repo sections drawn', async ($, on) => {
  on('clock.now', clock)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  await $.command.run({ command: 'argos', args: 'demo' })
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'view' }))?.props?.value).toBe('repos')
  expect((await ui.find({ key: 'fold:repos:acme/checkout' }))?.text).toBe('▾ checkout')
  await ui.unmount()
})

test('Fold all folds every section of the view, then reads Open all', async ($, on) => {
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : next(e),
  )
  on('clock.now', clock)
  on('store.set', () => ({ value: undefined }))
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'fold-all' }))?.text).toBe('Fold all')
  expect((await ui.find({ key: 'act:acme/portal#219' }))?.text).toBe('Fix conflict')
  await ui.press({ key: 'fold-all' })
  expect(await ui.find({ key: 'act:acme/portal#219' })).toBeUndefined()
  expect((await ui.find({ key: 'fold:needs:move' }))?.text).toBe('▸ Your move')
  expect((await ui.find({ key: 'fold-all' }))?.text).toBe('Open all')
  await ui.unmount()
})
