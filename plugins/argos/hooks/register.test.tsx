import { expect, test } from 'claude-code/testing'

import { act, byRank, rank, reason, sectionOf, sizeTag, toViewModel, tone, verb } from './register'

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

test('each PR lands in the section of its next move, with one action in the colour of what it asks', () => {
  expect([conflict, ready, quiet, draft, lateReview, changed, theirs].map(sectionOf)).toEqual(['move', 'ready', 'waiting', 'drafts', 'move', 'team', 'team'])
  const a = (p: never) => [act(p, 'en')?.label ?? null, tone(p)]
  expect(a(conflict)).toEqual(['Fix conflict', 'error'])
  expect(act(item({ signals: ['threads:2'] }), 'en')?.label).toBe('Reply to 2')
  expect(a(ready)).toEqual(['Merge', 'success'])
  expect(a(quiet)).toEqual([null, null])
  expect(a(item({ signals: ['no_review'] }))).toEqual(['Nudge', 'warning'])
  expect(a(item({ signals: ['no_owner'] }))).toEqual(['Find a reviewer', 'warning'])
  expect(a(draft)).toEqual(['Pre-check', null])
  expect(a(lateReview)).toEqual(['Review', 'warning'])
  expect(a(changed)).toEqual(['Review again', 'merged'])
  // a teammate's PR that waits on nobody asks nothing of me
  expect(a(item({ kind: 'other', signals: ['conflict'] }))).toEqual([null, null])
  expect(act(ready, 'en')?.prompt).toBe('Merge u220 with Argos once its checks pass: check it first, and merge only on my yes.')
  expect(act(draft, 'pt-BR')?.prompt).toBe('Confira u222 contra as minhas lições do repo com o Argos antes de eu pedir review.')
  expect([sizeTag(120), sizeTag(400), sizeTag(1000), sizeTag(undefined)]).toEqual([null, 'L', 'XL', null])
})

test('the inbox: sections in order, the longest wait first, a summary of what needs me', () => {
  const vm = ok(vmOf(round))
  expect(shape(vm)).toEqual([
    ['move', [7, 219]],
    ['ready', [220]],
    ['waiting', [221]],
    ['drafts', [222]],
    ['team', [9, 8]],
  ])
  expect(vm.summary).toBe('2 need you · 1 ready · 1 waiting')
  expect(vm.sections.find(s => s.id === 'team')?.isFolded).toBe(true)
  expect(ok(vmOf(round, { open: 'team' })).sections.find(s => s.id === 'team')?.isFolded).toBe(false)
  const [review, mine] = vm.sections[0]!.prs
  // a review waits since I was asked; mine since it opened
  expect([review?.wait, review?.owner, mine?.wait, mine?.owner, mine?.size]).toEqual(['1d', 'bia', '7w', null, 'XL'])
  expect(vm.sections.find(s => s.id === 'team')?.prs[0]).toMatchObject({ owner: 'Copilot', isAI: true, act: 'Review' })
  // the band counts what Your move counts, and names its first PR
  expect(vm.band).toEqual({ count: 2, verb: "Review bia's PR", ref: 'web#7' })
  // a PR names its repo only when the list mixes repos
  expect(review?.repo).toBe('web')
  expect(ok(vmOf(round, { filter: 'acme/web' })).sections[0]?.prs[0]?.repo).toBeNull()
  expect(ok(vmOf({ ...round, repos: ['acme/portal'], pending: [conflict], mine: [conflict], others: [] })).sections[0]?.prs[0]?.repo).toBeNull()
  expect(ok(vmOf({ ...round, pending: [], mine: [quiet], others: [] })).summary).toBe('nothing needs you · 1 waiting')
})

test('repo chips narrow the inbox, zeros included; twin short names show their owner', () => {
  const vm = ok(vmOf(round, { filter: 'acme/web' }))
  expect(vm.repos.map(r => [r.name, r.count, r.isActive])).toEqual([
    ['All', 7, false],
    ['portal', 4, false],
    ['web', 2, true],
    ['api', 1, false],
    ['docs', 0, false],
  ])
  expect(shape(vm)).toEqual([
    ['move', [7]],
    ['ready', []],
    ['waiting', []],
    ['drafts', []],
    ['team', [8]],
  ])
  // an unknown repo falls back to all; one repo gets no chips
  expect(ok(vmOf(round, { filter: 'help' })).repos[0]?.isActive).toBe(true)
  expect(ok(vmOf({ ...round, repos: ['acme/portal'], pending: [conflict], mine: [conflict], others: [] })).repos).toEqual([])
  const twins = ok(vmOf({ ...round, repos: ['acme/api', 'beta/api'], pending: [], mine: [item({ repo: 'beta/api' })], others: [] }))
  expect(twins.repos.map(r => r.name)).toEqual(['All', 'acme/api', 'beta/api'])
})

test('the send bar carries the picks of the batch sections: mine to fix, the others to review', () => {
  expect(ok(vmOf(round)).send.count).toBe(0)
  const vm = ok(vmOf(round, { selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8', 'acme/portal#220', 'acme/gone#1'] }))
  // a ready PR is not batch work; it has its own Merge
  expect(vm.send.count).toBe(3)
  expect(vm.send.prompt).toBe(
    [
      'Work on these PRs with Argos.',
      'My PRs, to fix with Argos:',
      '- u219: Resolve the conflict',
      'To review with Argos (draft only, nothing is posted without my yes):',
      '- u7',
      '- u8',
    ].join('\n'),
  )
  expect(vm.sections[0]?.pick).toBe('all')
  expect(ok(vmOf(round, { selected: ['acme/web#7'] })).sections[0]?.pick).toBe('some')
  // picks outlive narrowing; the summary counts the ones elsewhere
  expect(ok(vmOf(round, { filter: 'acme/web', selected: ['acme/portal#219', 'acme/web#7'] })).send.summary).toBe(
    'Going to the AI: 1 to fix, 1 to review. 1 of them is from another repo.',
  )
  // a pick that left the list is named, and the next press drops it
  expect(vm.send.summary).toBe('Going to the AI: 1 to fix, 2 to review. 1 picked PR left the list.')
  expect(vm.send.keep).not.toContain('acme/gone#1')
  // "In prompt ✓" reads the prompt itself: delete the request and the button comes back
  const asked = ok(vmOf(round, { selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8'] }, 'en', 'see u219 and u7 and u8'))
  expect(asked.send.inPrompt).toBe(true)
  expect(asked.sections[0]?.prs.map(p => p.inPrompt)).toEqual([true, true])
  expect(ok(vmOf(round, { selected: ['acme/web#7'] }, 'en', 'u219')).send.inPrompt).toBe(false)
  // a partial batch adds only what the prompt does not hold yet
  expect(ok(vmOf(round, { selected: ['acme/portal#219', 'acme/web#7'] }, 'en', 'u219')).send.prompt).not.toContain('u219')
  // pull/1 is not pull/12: a request for #12 leaves #1's action alone
  const one = item({ number: 1, url: 'https://github.com/acme/portal/pull/1', signals: ['conflict'] })
  const twelve = { ...round, pending: [one], mine: [one], others: [] }
  expect(ok(vmOf(twelve, {}, 'en', 'fix https://github.com/acme/portal/pull/12 now')).sections[0]?.prs[0]?.inPrompt).toBe(false)
  expect(ok(vmOf(twelve, {}, 'en', 'fix https://github.com/acme/portal/pull/1/files')).sections[0]?.prs[0]?.inPrompt).toBe(true)
  expect(ok(vmOf(round)).sections.find(s => s.id === 'waiting')?.prs[0]?.status).toBe('Waiting for review')
  // a folded section never hides a pick
  const team = ok(vmOf(round, { selected: ['acme/web#8'] })).sections.find(s => s.id === 'team')
  expect([team?.isFolded, team?.canFold, team?.picked]).toEqual([false, false, 1])
  // every control names the PR it acts on
  expect(vm.sections[0]?.prs[0]?.pickLabel).toBe('Unpick #7 T')
  expect(vm.sections[0]?.prs[1]?.actLabel).toBe('Fix conflict: #219 S3 migration. Puts a request in the prompt.')
})

test('the send checks wait for a running check and warn on stale data or a big batch', () => {
  expect(ok(vmOf(round)).send.block).toBe('Pick PRs to add them to the prompt together.')
  const running = ok(toViewModel(round as never, { now: NOW, lang: 'en', minutes: 60, running: true, ui: { selected: ['acme/web#7'] } }))
  expect(running.send.block).toBe('Wait for the check to finish.')
  const stale = ok(vmOf({ ...round, okAt: ago(0.2), at: ago(0.2) }, { selected: ['acme/web#7'] }))
  expect(stale.send.warn).toMatch(/^The data is from \d\d:\d\d\. Check again before sending\.$/)
  const many = Array.from({ length: 11 }, (_, i) => item({ kind: 'review', repo: 'acme/web', number: 100 + i, url: `m${i}` }))
  const keys = many.map(p => `acme/web#${(p as { number: number }).number}`)
  expect(ok(vmOf({ ...round, pending: many }, { selected: keys })).send.warn).toBe('11 PRs at once: the AI works through them by priority.')
})

test('failures and late rounds say so in words', () => {
  expect(reason('gh: not logged into any GitHub hosts', 'en')).toContain('gh auth login')
  expect(reason('Error: timed out', 'pt-BR')).toContain('2 min')
  const failed = vmOf({ ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' })
  expect(failed.status).toMatch(/^The \d\d:\d\d check failed: GitHub took over 2 min to answer\. Showing data from \d\d:\d\d\.$/)
  expect(vmOf({ at: round.at, okAt: null, error: 'x' }).state).toBe('noData')
  const late = vmOf({ ...round, okAt: ago(0.2), at: ago(0.2) })
  expect([late.seen, late.status]).toEqual(['checked 4 h ago', "Last check 4 h ago; the next one didn't run."])
})

test('the band shows the most urgent PR with its verb', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /for you/ }))?.text).toContain("2 for you · Review bia's PR: web#7")
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

test('a narrow pane: the summary under the title, an icon to check, sections with two-line PRs', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /need you/ }))?.text).toBe('2 need you · 1 ready · 1 waiting')
  expect((await ui.find({ key: 'check' }))?.text).toBe('↻')
  expect((await ui.find({ type: 'Text', text: /^Your move/ }))?.text).toBe('Your move · 2')
  expect((await ui.find({ key: 'act:acme/portal#219' }))?.text).toBe('Fix conflict ›')
  expect((await ui.find({ key: 'act:acme/portal#220' }))?.text).toBe('Merge ›')
  // marks ride in the truncated meta text, cut before the action ever drops a line
  expect((await ui.find({ type: 'Text', text: / · XL$/ }))?.text).toBe(' · portal · XL')
  // the team is folded; the send bar keeps its place under the head and says how to use it
  expect(await ui.find({ key: 'act:acme/web#8' })).toBeUndefined()
  expect((await ui.find({ key: 'send' }))?.text).toBe('Add to prompt')
  expect((await ui.find({ type: 'Text', text: /^Pick PRs/ }))?.text).toBe('Pick PRs to add them to the prompt together.')
  await ui.unmount()
})

test('Check now is an icon at any width', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...PANE, viewport: { columns: 200, rows: 40 }, props: { ...PANE.props, bodyColumns: 120 } })
  expect((await ui.find({ key: 'check' }))?.text).toBe('↻')
  await ui.unmount()
})

test('picked PRs bring the send bar; the team unfolds', { options: { language: 'pt-BR' } }, async ($, on) => {
  on('state.get', stored({ round, selected: ['acme/portal#219', 'acme/web#7', 'acme/web#8'], open: 'team' }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'send' }))?.text).toBe('Pôr 3 no prompt')
  expect((await ui.find({ type: 'Text', text: /^Vai para a IA/ }))?.text).toBe('Vai para a IA: 1 para corrigir, 2 para revisar.')
  expect((await ui.find({ key: 'act:acme/web#8' }))?.text).toBe('Revisar de novo ›')
  expect((await ui.find({ key: 'box:move' }))?.text).toBe('☑')
  await ui.unmount()
})

test('the terminal draws boxes in brackets', async ($, on) => {
  on('state.get', stored({ round, selected: ['acme/portal#219'] }))
  on('clock.now', clock)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 36, rows: 30 } })
  expect((await ui.find({ key: 'box:move' }))?.text).toBe('[-]')
  expect((await ui.find({ key: 'box:acme/portal#219' }))?.text).toBe('[x]')
  await ui.unmount()
})

test('with nothing for me the inbox says so calmly', async ($, on) => {
  on('state.get', stored({ round: { ...round, pending: [], mine: [], others: [] } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^Nothing needs you/ }))?.text).toBe('Nothing needs you right now.')
  expect(await ui.find({ type: 'Text', text: /^Ready to merge/ })).toBeUndefined()
  await ui.unmount()
})

test('a failed round keeps the last good data under a retry strip', async ($, on) => {
  on('state.get', stored({ round: { ...round, at: new Date(NOW).toISOString(), error: 'Error: timed out' } }))
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /check failed/ }))?.text).toContain('Showing data from')
  expect((await ui.find({ type: 'Button', text: 'Try again' }))?.text).toBe('Try again')
  expect((await ui.find({ key: 'act:acme/portal#219' }))?.text).toBe('Fix conflict ›')
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
  expect((await ui.find({ key: 'check' }))?.text).toBe('↻')
  expect((await ui.find({ type: 'Text', text: 'Checking…' }))?.text).toBe('Checking…')
  await ui.unmount()
})

test('a chip narrows to its repo, an action fills the prompt, and the list ends with a way to add a repo', async ($, on) => {
  const fills: unknown[] = []
  // the round from here, the pane's own atoms from the real store, so a press shows
  on('state.get', ($: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'round' ? { value: { value: round, version: 1 } } : next(e),
  )
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_: unknown, e: { text: string }) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  on('clock.now', clock)
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ key: 'repo:all' }))?.text).toMatch(/^All ?7$/)
  await ui.press({ key: 'repo:acme/web' })
  expect((await ui.find({ key: 'repo:acme/web' }))?.text).toMatch(/^web ?2$/)
  expect(await ui.find({ key: 'act:acme/portal#219' })).toBeUndefined()
  expect((await ui.find({ key: 'act:acme/web#7' }))?.text).toBe('Review ›')
  // two quick presses meet one lock: the request goes in once
  await Promise.all([ui.press({ key: 'act:acme/web#7' }), ui.press({ key: 'act:acme/web#7' })])
  await ui.press({ key: 'fold:team' })
  expect((await ui.find({ key: 'act:acme/web#8' }))?.text).toBe('Review again ›')
  await ui.press({ key: 'add-repo' })
  expect(fills).toEqual([
    ['Work on these PRs with Argos.', 'To review with Argos (draft only, nothing is posted without my yes):', '- u7'].join('\n'),
    '/argos repos add ',
  ])
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

test('an action already asked for in the prompt says so instead of asking twice', async ($, on) => {
  on('state.get', stored({ round }))
  on('clock.now', clock)
  on('prompt.read', () => ({ value: { text: 'Fix it: u219', cursor: 0 } }))
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: 'In prompt ✓' }))?.text).toBe('In prompt ✓')
  expect(await ui.find({ key: 'act:acme/portal#219' })).toBeUndefined()
  expect((await ui.find({ key: 'act:acme/web#7' }))?.text).toBe('Review ›')
  await ui.unmount()
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
  await $.command.run({ command: 'argos', args: '' })
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /check failed/ }))?.text).toContain('gh auth login')
  await ui.unmount()
})
