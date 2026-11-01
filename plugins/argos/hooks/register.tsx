// Argos mod: the peacock's eyes inside Claude. A timer runs one Argos round over
// the connected repos and the pane follows it; /argos opens the pane, an inbox the person
// keeps open: what needs me, what is ready, what waits on others, my drafts and
// the team's PRs, each PR a tinted box of two lines with icons, labels and one action, a
// picker to narrow to a repo, and a batch bar for the PRs picked for the AI. Words and
// numbers come from toViewModel (view.ts); colours and icons from look.ts.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { t } from '../scripts/i18n.mjs'
import { DEMO_ROUND, DEMO_VERDICTS } from './demo-round'
import { BOTMARK, C, I, LOGO, STARS, TINT, rgba, titled } from './look'
import { UI, authorOf, mentions, toViewModel, verdictOf } from './view'
import type { Round, Verdicts } from '../types'

export { action, byRank, rank, reason, sectionOf, tags, toViewModel, tone, verdictOf, verdictTag } from './view'

const PANE = 'argos'
const ROUND = { plugin: 'argos', key: 'round' } as const
const RUNNING = { plugin: 'argos', key: 'isRunning' } as const
// /argos demo shows a sample round; rounds and loads wait until a plain /argos
const DEMO = { plugin: 'argos', key: 'isDemo' } as const
const VERDICTS = { plugin: 'argos', key: 'verdicts' } as const
const round = atom(ROUND, null)
const isRunning = atom(RUNNING, false)
const selected = atom({ plugin: 'argos', key: 'selected' } as const, UI.selected)
// prompt requests being filled right now: a second press of the same one waits for nothing
const busy = new Set<string>()
const filter = atom({ plugin: 'argos', key: 'filter' } as const, UI.filter)
const view = atom({ plugin: 'argos', key: 'view' } as const, UI.view)
const more = atom({ plugin: 'argos', key: 'more' } as const, UI.more)
const batchAct = atom({ plugin: 'argos', key: 'act' } as const, UI.act)
const FOLDS = { plugin: 'argos', key: 'folds' } as const
// the author the lists are filtered to; the authors ignored everywhere (kept across sessions);
// the last ignore, offered back until the next tap
const author = atom({ plugin: 'argos', key: 'author' } as const, UI.author)
const IGNORED = { plugin: 'argos', key: 'ignored' } as const
const ignored = atom(IGNORED, [] as string[])
const undo = atom({ plugin: 'argos', key: 'undo' } as const, null as { author: string; hidden: number } | null)
const folds = atom(FOLDS, UI.folds)
// what verdicts.mjs last wrote: the AI's validations, read by the rows
const verdicts = atom({ plugin: 'argos', key: 'verdicts' } as const, null)

const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 15),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '').split(/\s+/).filter(Boolean),
  lang: String(options.language ?? 'en'),
})

async function stateDir($: any) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return `${home}/.claude/kl-akasha/argos`
}
const roundFile = async ($: any) => `${await stateDir($)}/last-round.json`

// The verdicts the AI wrote with verdicts.mjs; none yet is an empty file.
async function loadVerdicts($: any): Promise<Verdicts | null> {
  if ((await $.state.get(DEMO)).value) return (await $.state.get(VERDICTS)).value ?? null
  try {
    const v: Verdicts = JSON.parse(await $.fs.read(`${await stateDir($)}/verdicts.json`))
    if (!v?.prs) throw new Error('not a verdicts file')
    await $.state.set(VERDICTS, v)
    return v
  } catch {
    return (await $.state.get(VERDICTS)).value ?? null
  }
}

// Auto-validate: after a round, PRs whose verdict is old (new commits since) go to one
// background subagent with the validate job: the user's own with "mine", every watched PR
// with "all". It is marked running first, so the next round does not start it twice.
// ponytail: ten per round, so one burst of commits never spends a fortune at once.
async function autoValidate($: any, r: Round | null, lang: string) {
  const v = await loadVerdicts($)
  if (!r || !v || v.auto === 'off') return
  const skip = new Set(((await $.state.get(IGNORED)).value as string[] | undefined) ?? [])
  const all = [...(r.pending ?? []), ...(r.mine ?? []), ...(r.others ?? [])].filter(p => !skip.has(authorOf(p)) || p.kind === 'review')
  const urls = [
    ...new Set(
      all.filter(p => (v.auto === 'all' || p.kind === 'mine') && verdictOf(p, v.prs[p.url]).state === 'stale').map(p => p.url),
    ),
  ].slice(0, 10)
  if (!urls.length) return
  await $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'start', ...urls])
  await loadVerdicts($)
  await $.agent.spawn({
    prompt: [t(lang, 'b_auto'), `Job: ${$.plugin.root}/references/validate.md`, `Scripts: ${$.plugin.root}/scripts`, ...urls.map(u => `- ${u}`)].join('\n'),
    description: 'Argos auto-validate',
  })
}

// Shows what the last round (from any session) wrote, unless what is on screen is newer
// (a failure this session saw that the file does not know about).
async function load($: any): Promise<Round | null> {
  const shown: Round | null = (await $.state.get(ROUND)).value ?? null
  if ((await $.state.get(DEMO)).value) return shown
  try {
    const last: Round = JSON.parse(await $.fs.read(await roundFile($)))
    if (shown && Date.parse(shown.at) > Date.parse(last.at)) return shown
    await $.state.set(ROUND, last)
    return last
  } catch {
    return shown
  }
}

// Puts "/argos repos add " in the prompt for the person to finish with a folder or
// owner/name, unless it is already there.
async function addRepo($: any) {
  const { text } = await $.prompt.read()
  if (!text.includes('/argos repos add')) await $.prompt.fill({ text: '/argos repos add ', mode: 'replace' })
}

async function openPane($: any, options: PluginOptions) {
  await load($)
  await loadVerdicts($)
  await $.ui.open({ id: PANE, title: 'Argos' })
}

// One round. Open sessions share last-round.json: a session skips the round
// when another one ran it within the interval, and only shows it.
async function tick($: any, options: PluginOptions, force: boolean) {
  if ((await $.state.get(RUNNING)).value || (await $.state.get(DEMO)).value) return
  const { minutes, account, qualifiers, lang } = config(options)
  const last = await load($)
  const now = await $.clock.now()
  if (!force && last && now - Date.parse(last.at) < minutes * 6e4 - 3e4) return
  await $.state.set(RUNNING, true)
  try {
    const argv = ['node', `${$.plugin.root}/scripts/round.mjs`, ...qualifiers, '--lang', lang, '--json']
    if (account) argv.push('--account', account)
    await $.process.run(argv, { timeoutMs: 120_000 })
    const fresh = await load($)
    if (fresh?.notify) {
      $.ui.toast(fresh.notify)
    }
    await autoValidate($, fresh, lang).catch(() => {})
  } catch (err) {
    // round.mjs writes the real reason (gh auth, a timeout) before it fails; use it when it is
    // this attempt's. Only a run that died before writing (killed at the time limit) gets the
    // wrapper's message. Either way okAt stays the last round that worked.
    const fresh = await load($)
    if (!fresh?.error || Date.parse(fresh.at) < now) {
      const { value } = await $.state.get(ROUND)
      await $.state.set(ROUND, { ...(value ?? {}), at: new Date(now).toISOString(), okAt: value?.okAt ?? null, error: String(err) })
    }
  } finally {
    await $.state.set(RUNNING, false)
  }
}

export const register: Register = (on, options) => {
  const { lang, minutes, account } = config(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await load($)
    await loadVerdicts($)
    // the person's folds, by view and section, outlive the session
    const saved = await $.store.get('folds').catch(() => undefined)
    if (saved && typeof saved === 'object') await $.state.set(FOLDS, saved as Record<string, { open: boolean; needs: string[] }>)
    const hidden = await $.store.get('ignored').catch(() => undefined)
    if (Array.isArray(hidden)) await $.state.set(IGNORED, hidden.filter((x): x is string => typeof x === 'string'))
    // The plugin's skill already owns /argos (argos:argos); the hook below answers it. Registering
    // only matters where no skill holds the name, so a refusal is expected and harmless.
    await $.command.register({ name: 'argos', description: t(lang, 'ui_command') }).catch(() => {})
    $.clock.every(minutes * 6e4, () => void tick($, options, false))
    $.clock.after(5_000, () => void tick($, options, false))
    return started
  })

  // The AI records verdicts with verdicts.mjs from Bash; the rows follow as each one lands.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (e.command.includes('verdicts.mjs')) await loadVerdicts($)
    return result
  })

  // /argos opens the pane; /argos repos [add <folder | owner/name> | remove <repo>] goes
  // through repos.mjs, the same command the AI uses from the argos skill. A bare
  // `add` connects the session's folder, named here so it never falls to the mod's own; a
  // name is checked as the vigil's account. Anything else after /argos (a PR link, a question)
  // goes on to the skill.
  on('command.run', async ($, e, next) => {
    if (e.command !== 'argos' && e.command !== 'argos:argos') return next(e)
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    if (args.length && !['repos', 'demo'].includes(args[0])) return next(e)
    if (args[0] === 'repos') {
      if (args.length === 2 && args[1] === 'add') args.push(await $.session.cwd())
      const { stdout, stderr } = await $.process.run([
        'node',
        `${$.plugin.root}/scripts/repos.mjs`,
        ...(args.length > 1 ? args.slice(1) : ['list']),
        '--lang',
        lang,
        ...(account ? ['--account', account] : []),
      ])
      if (args[1] === 'add' || args[1] === 'remove') void tick($, options, true)
      return { text: (stdout || stderr).trim() }
    }
    // a sample round with several repos and every signal, to look at the pane without one
    if (args[0] === 'demo') {
      const at = new Date(await $.clock.now()).toISOString()
      await $.state.set(DEMO, true)
      await $.state.set(ROUND, { ...DEMO_ROUND, at, okAt: at })
      await $.state.set(VERDICTS, DEMO_VERDICTS)
      // the demo opens By repo: its repos show every kind of header at once
      await update($, view, () => 'repos')
      await $.ui.open({ id: PANE, title: 'Argos' })
      return { text: t(lang, 'ui_demo') }
    }
    // leaving the demo drops its sample, so the next load shows the real round
    if ((await $.state.get(DEMO)).value) {
      await $.state.set(ROUND, null)
      await $.state.set(VERDICTS, null)
      await update($, selected, () => [])
      await update($, view, () => '')
      await update($, folds, () => ({}))
    }
    await $.state.set(DEMO, false)
    await openPane($, options)
    void tick($, options, true)
    return { text: t(lang, 'ui_opened') }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // the terminal is the one surface without Svg: icons fall back to their text marks
    const hasSvg = e.surface !== 'terminal'
    const [running, last, picks, narrowed, shownView, shownMore, act, judged, folded, who, hiddenAuthors, lastIgnore, box] = await Promise.all([
      read($, isRunning),
      read($, round),
      read($, selected),
      read($, filter),
      read($, view),
      read($, more),
      read($, batchAct),
      read($, verdicts),
      read($, folds),
      read($, author),
      read($, ignored),
      read($, undo),
      $.prompt.read().catch(() => ({ text: '' })),
    ])
    const vm = toViewModel(last, {
      now: await $.clock.now(),
      lang,
      minutes,
      running,
      ui: { selected: picks, filter: narrowed, view: shownView, more: shownMore, act, folds: folded, author: who },
      ignored: hiddenAuthors,
      undo: lastIgnore,
      prompt: box.text,
      verdicts: judged,
    })
    // tick returns at once while a round runs, so pressing twice does nothing
    const checkNow = () => void tick($, options, true)
    // a picker where the surface has one
    const Select = (ui as { Select?: any }).Select
    // An icon says what it means on hover: its tip as the SVG's title, drawn interactive (no
    // script, just the hover); the terminal draws its text mark instead.
    const icon = (svg: string, text: string, w = 16, tall = 16, tip?: string) =>
      hasSvg ? <ui.Svg source={titled(svg, tip)} alt={tip ?? text} width={w} height={tall} isInteractive={tip ? true : undefined} /> : <Text>{text}</Text>
    // Puts one request in the prompt without sending it: appended on a new line when there
    // is a draft, never twice. Two quick presses meet one lock, and a request whose PRs are
    // all in the prompt already adds nothing.
    const fillPrompt = async (request: string, urls: string[]) => {
      if (busy.has(request)) return
      busy.add(request)
      try {
        const { text } = await $.prompt.read()
        if (!urls.length || !urls.every(u => mentions(text, u)))
          await $.prompt.fill(text.trim() ? { text: `\n${request}`, mode: 'append' } : { text: request, mode: 'replace' })
        $.ui.invalidate('ui.render')
      } finally {
        busy.delete(request)
      }
    }

    // A fold by hand (or Fold all / Open all) is the person's choice for those sections: kept in the
    // session's state for the pane and in $.store across sessions, with what needed them then.
    const setFolds = async (targets: { foldKey: string; needKeys: string[] }[], isOpen: boolean) => {
      await update($, undo, () => null)
      let next: Record<string, { open: boolean; needs: string[] }> = {}
      await update($, folds, f => (next = { ...f, ...Object.fromEntries(targets.map(x => [x.foldKey, { open: isOpen, needs: x.needKeys }])) }))
      await $.store.set('folds', next).catch(() => {})
    }

    // The head: "Pull requests" and Check now; under it what needs me and when Argos last
    // looked (a failed check in red); then one Select to narrow to a repo.
    const needLine = vm.failed ? t(lang, 'in_failed') : vm.state === 'ok' ? vm.need : ''
    const checked =
      vm.state === 'noRepos'
        ? ''
        : vm.state === 'ok'
          ? [vm.teamCount ? t(lang, 'in_team_n', vm.teamCount) : '', vm.ignoredCount ? t(lang, 'in_ignored_n', vm.ignoredCount) : '', vm.checked].filter(Boolean).join(' · ')
          : vm.checked
    const pick = (key: string, value: string, options: { id: string; name: string }[], onSelect: (v: string) => void, grow = 1) =>
      Select && (
        <Box key={`${key}-box`} flexGrow={grow} flexShrink={1} minWidth={0}>
          <Select key={key} value={value || 'all'} options={options.map(o => ({ value: o.id || 'all', label: o.name }))} onSelect={(v: string) => onSelect(v === 'all' ? '' : v)} />
        </Box>
      )
    const head = (withCheck: boolean) => (
      <Box key="head" flexDirection="column" gap="xs">
        <Box flexDirection="row" alignItems="center" gap="sm">
          {hasSvg && <ui.Svg source={LOGO} alt="Argos" width={16} height={16} />}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text size="heading" weight="semibold" color={C.text}>
              {t(lang, 'in_title')}
            </Text>
          </Box>
          {withCheck && vm.state === 'ok' && vm.foldAll && (
            <Button key="fold-all" plain={true} dimColor={true} onPress={() => void setFolds(vm.foldAll!.targets, vm.foldAll!.open)}>
              {vm.foldAll.label}
            </Button>
          )}
          {withCheck && (
            <Button key="check" plain={true} dimColor={running} onPress={checkNow}>
              {t(lang, 'ui_check')}
            </Button>
          )}
        </Box>
        {(needLine || checked) && (
          <Box flexDirection="row" alignItems="center" flexWrap="wrap" columnGap="xs">
            {needLine && (
              <Text weight="semibold" color={vm.failed ? C.error : C.text}>
                {needLine}
              </Text>
            )}
            {checked && (
              <Text size="caption" color={C.subtle}>
                {needLine ? `· ${checked}` : checked}
              </Text>
            )}
          </Box>
        )}
        {vm.state === 'ok' && (vm.views.length > 0 || vm.repos.length > 0) && (
          <Box flexDirection="row" gap="xs">
            {vm.views.length > 0 && pick('view', vm.view, vm.views, v => void update($, view, () => v), 3)}
            {vm.repos.length > 0 && vm.view !== 'repos' && pick('repo', vm.filter, vm.repos, v => void update($, filter, () => v), 2)}
          </Box>
        )}
        {vm.state === 'ok' && (
          <Box flexDirection="row" alignItems="center" gap="xs">
            {icon(vm.progress ? STARS.run : STARS.done, '✦', 14, 14, vm.auto.tip)}
            {vm.progress && (
              <Box flexShrink={0}>
                <Text size="caption" weight="semibold" color={C.merged}>
                  {vm.progress.label}
                </Text>
              </Box>
            )}
            {vm.progress ? (
              // static progress: done of the batch, in purple
              <Box flexGrow={1} height={4} backgroundColor="#2E2E2C">
                <Box height={4} width={vm.progress.pct} backgroundColor={C.merged} />
              </Box>
            ) : (
              pick('auto', vm.auto.value === 'off' ? 'off' : vm.auto.value, vm.auto.options, v =>
                void $.process.run(['node', `${$.plugin.root}/scripts/verdicts.mjs`, 'auto', v || 'off']).then(() => loadVerdicts($)),
              )
            )}
          </Box>
        )}
      </Box>
    )
    // A banner in a state's colour: clear (green), check failed (red), no repo (neutral).
    const banner = (key: string, look: { bg?: string; border: string }, svg: string, title: string, sub: string, btn?: { label: string; onPress: () => void }) => (
      <Box key={key} flexDirection="row" gap="sm" padding="sm" borderStyle="round" borderColor={look.border} backgroundColor={look.bg}>
        {icon(svg, '●')}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text weight="semibold" color={C.text}>
            {title}
          </Text>
          {sub && (
            <Text size="caption" color={C.subtle}>
              {sub}
            </Text>
          )}
          {btn && (
            <Box flexDirection="row" justifyContent="flex-end" marginTop="xs">
              <Button key={`${key}-btn`} variant="secondary" onPress={btn.onPress}>
                {btn.label}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    )
    const frame = (...body: any[]) => (
      <Box flexDirection="column" gap="md" padding="md">
        {body.filter(Boolean)}
      </Box>
    )
    const failedBanner =
      vm.error &&
      banner(
        'failed',
        { bg: rgba(C.error, TINT + 0.01), border: rgba(C.error, 0.35) },
        I.error,
        t(lang, 'in_err_title'),
        vm.error.why,
        vm.error.isAuth ? { label: t(lang, 'in_fix_auth'), onPress: () => void fillPrompt(t(lang, 'p_auth', vm.error!.why), []) } : { label: t(lang, 'in_retry'), onPress: checkNow },
      )

    // The first check: static placeholders sized like real rows, so nothing jumps.
    if (vm.state === 'loading' || vm.state === 'never')
      return frame(
        head(vm.state === 'never'),
        <Box key="skeleton" flexDirection="column" gap="xs">
          {[
            ['78%', '42%'],
            ['64%', '50%'],
            ['72%', '36%'],
          ].map(([a, b], i) => (
            <Box key={`sk${i}`} flexDirection="column" gap="sm" padding="sm" borderStyle="round" borderColor="rgba(255,255,255,0.06)" backgroundColor="rgba(255,255,255,0.03)">
              <Box height={8} width={a} backgroundColor="#2E2E2C" />
              <Box height={8} width={b} backgroundColor="#2A2A28" />
            </Box>
          ))}
          <Text size="caption" color={C.subtle}>
            {t(lang, 'in_first')}
          </Text>
        </Box>,
      )
    if (vm.state === 'noData') return frame(head(true), failedBanner)
    if (vm.state === 'noRepos')
      return frame(
        head(false),
        banner('norepo', { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.10)' }, I.pr(C.subtle), t(lang, 'in_norepo_title'), t(lang, 'in_norepo_body'), {
          label: t(lang, 'in_setup'),
          onPress: () => void addRepo($),
        }),
      )
    if (vm.state !== 'ok') return frame(head(true))

    // a failed check keeps the stale rows, dimmed; their actions still work
    const dim = vm.failed
    const toggle = (key: string) => void update($, selected, () => (vm.keep.includes(key) ? vm.keep.filter(k => k !== key) : [...vm.keep, key]))
    type Pr = (typeof vm.sections)[number]['prs'][number]
    // One PR on two lines. Line 1 says what it is and how long it waited; line 2 why it is
    // here (icons, colour) and what to do: a pick and one button. The box is tinted where I act.
    const row = (p: Pr) => (
      <Box key={p.key} flexDirection="column" gap="xs" paddingX="sm" paddingY="sm" borderStyle="round" borderColor={p.box.border} backgroundColor={p.box.bg}>
        <Box flexDirection="row" alignItems="center" gap="xs" minWidth={0}>
          {icon(p.glyph, '⑂', 16, 16, p.glyphTip)}
          {/* the ref and the wait never wrap or shrink; the title takes what is left */}
          <Box flexShrink={0}>
            <Text size="caption" color={C.subtle} dimColor={dim}>
              {p.ref}
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text weight="medium" color={C.text} dimColor={dim} wrap="truncate">
              {p.title}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text size="caption" color={p.isOld ? C.text : C.subtle} weight={p.isOld ? 'bold' : 'regular'} dimColor={dim}>
              {p.wait}
            </Text>
          </Box>
        </Box>
        {p.finding && (
          <Box flexDirection="row" gap="xs" minWidth={0} paddingLeft="lg">
            <Text size="caption" color={C.merged} wrap="truncate" dimColor={dim}>
              {p.finding}
            </Text>
          </Box>
        )}
        <Box flexDirection="row" alignItems="center" flexWrap="wrap" gap="xs">
          <Box flexDirection="row" alignItems="center" gap="xs" minWidth={0}>
            {p.tags.map((tg, i) => (
              <Box key={`t${i}`} flexDirection="row" alignItems="center">
                {tg.svg ? icon(tg.svg, tg.text, tg.w, 16, tg.tip) : null}
                {tg.count && (hasSvg || !tg.svg) && (
                  <Text size="caption" weight="semibold" color={tg.color}>
                    {tg.count}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
          {/* grows into the space left, so the buttons sit right; on a narrow pane they wrap to their own line */}
          <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap="xs" flexGrow={1}>
            <Button key={`pick:${p.key}`} plain={true} onPress={() => toggle(p.key)}>
              {p.isPicked ? '✓' : '+'}
            </Button>
            <Button key={`act:${p.key}`} variant="secondary" onPress={() => void fillPrompt(p.prompt, [p.url])}>
              {p.act}
            </Button>
          </Box>
        </Box>
      </Box>
    )
    // One section header for every view (design 00c): "▸ name" or "▾ name" is the toggle (the
    // arrows are the same width, so the label never shifts); then the count merged with what needs
    // me, what is picked in orange, Pick all, and the worst signal's glyph at the right edge. The
    // header is the same folded or open, apart from the arrow.
    type Head = { foldKey: string; label: string; tally: string; isUrgent: boolean; picked: string; glyph: string; glyphTip: string; isOpen: boolean; keys: string[]; needKeys: string[]; allPicked: boolean }
    const sectionHead = (g: Head, pickAll: string | null) => (
      <Box flexDirection="row" alignItems="center" gap="xs">
        <Button key={`fold:${g.foldKey}`} plain={true} onPress={() => void setFolds([{ foldKey: g.foldKey, needKeys: g.needKeys }], !g.isOpen)}>
          {`${g.isOpen ? '▾' : '▸'} ${g.label}`}
        </Button>
        <Box flexDirection="row" alignItems="center" flexGrow={1} flexShrink={1} minWidth={0} gap="xs">
          <Text size="caption" weight={g.isUrgent ? 'semibold' : 'regular'} color={g.isUrgent ? C.text : C.subtle} wrap="truncate">
            {g.tally}
          </Text>
          {g.picked && (
            <Box flexShrink={0}>
              <Text size="caption" weight="semibold" color={C.claude}>
                {g.picked}
              </Text>
            </Box>
          )}
        </Box>
        {pickAll && (
          <Button
            key={`all:${g.foldKey}`}
            plain={true}
            onPress={() => void update($, selected, () => (g.allPicked ? vm.keep.filter(k => !g.keys.includes(k)) : [...new Set([...vm.keep, ...g.keys])]))}
          >
            {pickAll}
          </Button>
        )}
        {icon(g.glyph, '⑂', 16, 16, g.glyphTip)}
      </Box>
    )
    const pickAllOf = (g: Head) => t(lang, g.allPicked ? 'in_unpick_all' : 'in_pick_all')
    // Needs me: a section per next move; empty sections are hidden.
    const section = (s: (typeof vm.sections)[number]) =>
      s.count > 0 && (
        <Box key={`sec:${s.id}`} flexDirection="column" gap="xs">
          {sectionHead(s, pickAllOf(s))}
          {s.isOpen && s.prs.map(row)}
        </Box>
      )
    // The team view: verdict groups of compact one-line rows, "Pick all" per group.
    type Group = (typeof vm.groups)[number]
    const crow = (r: Group['rows'][number]) => (
      <Box key={r.key} flexDirection="row" alignItems="center" gap="xs" paddingLeft="sm" borderStyle={r.isPicked ? 'round' : undefined} borderColor={r.box.border} backgroundColor={r.box.bg}>
        {icon(r.glyph, '⑂', 16, 16, r.glyphTip)}
        <Box flexShrink={0}>
          <Text size="caption" color={C.subtle}>
            {r.ref}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="caption" color={C.text} wrap="truncate">
            {r.title}
          </Text>
        </Box>
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          {r.verdict.svg ? icon(r.verdict.svg, r.verdict.text, 14, 14, r.verdict.tip) : null}
          {r.verdict.count && (
            <Text size="caption" weight="semibold" color={r.verdict.color}>
              {r.verdict.count}
            </Text>
          )}
        </Box>
        <Button key={`pick:${r.key}`} plain={true} onPress={() => toggle(r.key)}>
          {r.isPicked ? '✓' : '+'}
        </Button>
      </Box>
    )
    const group = (g: Group) =>
      g.count > 0 && (
        <Box key={`grp:${g.id}`} flexDirection="column" gap="xs">
          {sectionHead(g, g.pickAll)}
          {g.rows.map(crow)}
          {g.more && (
            <Box flexDirection="row">
              <Button key={`more:${g.id}`} plain={true} onPress={() => void update($, more, m => [...m, g.id])}>
                {g.more}
              </Button>
            </Box>
          )}
        </Box>
      )
    const clearBanner = vm.clear !== null && banner('clear', { bg: rgba(C.success, TINT + 0.01), border: rgba(C.success, 0.35) }, I.approved, t(lang, 'in_clear'), vm.clear)
    // The batch: what is picked, each row's action, and the pane's one primary button.
    const batch = vm.batch && (
      <Box key="batch" flexDirection="column" gap="sm" padding="sm" borderStyle="round" borderColor={rgba(C.claude, 0.55)} backgroundColor={rgba(C.claude, 0.1)}>
        <Box flexDirection="row" alignItems="center" gap="xs">
          <Box flexGrow={1}>
            <Text weight="semibold" color={C.text}>
              {vm.batch.count}
            </Text>
          </Box>
          <Button key="clear" plain={true} onPress={() => void update($, selected, () => [])}>
            {t(lang, 'ui_clear')}
          </Button>
        </Box>
        <Text size="caption" color={C.subtle} wrap="truncate">
          {vm.batch.detail}
        </Text>
        <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap="xs">
          {vm.batch.acts.length > 0 && pick('act', vm.batch.act, vm.batch.acts, v => void update($, batchAct, () => v))}
          <Button
            key="send"
            variant="primary"
            onPress={async () => {
              await fillPrompt(vm.batch!.prompt, vm.batch!.urls)
              await update($, selected, () => [])
            }}
          >
            {t(lang, 'in_add')}
          </Button>
        </Box>
      </Box>
    )
    // Authors (design 00d). A chip: the avatar (its shape says person, bot or coding agent), a bot
    // mark, and a plain button "name N" (a button holds only text, so the avatar sits beside it);
    // a tap filters every list to that author, a second tap clears it.
    type Chip = (typeof vm.repoSections)[number]['authors'][number]
    const setAuthor = async (name: string) => {
      await update($, undo, () => null)
      await update($, author, () => name)
    }
    const chips = (list: Chip[], prefix = '') => (
      <Box flexDirection="row" flexWrap="wrap" gap="xs">
        {list.map(a => (
          <Box
            key={`chip:${prefix}${a.name}`}
            flexDirection="row"
            alignItems="center"
            gap="xs"
            paddingX="xs"
            borderStyle="round"
            borderColor={a.isActive ? C.text : 'rgba(255,255,255,0.12)'}
            backgroundColor="rgba(255,255,255,0.04)"
          >
            {icon(a.svg, a.name.slice(0, 1).toUpperCase(), 18, 18, a.tip)}
            {a.kind === 'bot' && icon(BOTMARK, '⚙', 12, 12, a.tip)}
            <Button key={`who:${prefix}${a.name}`} plain={true} onPress={() => void setAuthor(a.isActive ? '' : a.name)}>
              {`${a.name} ${a.count}`}
            </Button>
          </Box>
        ))}
      </Box>
    )
    const authorsSection = vm.authorsSection && (
      <Box key="authors" flexDirection="column" gap="xs">
        {sectionHead(vm.authorsSection, null)}
        {vm.authorsSection.isOpen && chips(vm.authorsSection.chips)}
      </Box>
    )
    // Filtered to one author: pick them all, validate them all in one prompt line, or ignore the
    // author everywhere (Undo stays until the next tap).
    const ignore = async (name: string, hidden: number) => {
      let next: string[] = []
      await update($, ignored, list => (next = [...new Set([...list, name])]))
      await $.store.set('ignored', next).catch(() => {})
      await update($, author, () => '')
      await update($, undo, () => ({ author: name, hidden }))
    }
    const unignore = async (name: string) => {
      let next: string[] = []
      await update($, ignored, list => (next = list.filter(x => x !== name)))
      await $.store.set('ignored', next).catch(() => {})
      await update($, undo, () => null)
    }
    const line = vm.authorLine
    const authorLine = line && (
      <Box key="author-line" flexDirection="row" alignItems="center" flexWrap="wrap" gap="xs">
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text weight="semibold" color={C.text} wrap="truncate">
            {`${line.name} · ${line.count}`}
          </Text>
        </Box>
        <Button key="author-pick" variant="secondary" onPress={() => void update($, selected, () => [...new Set([...vm.keep, ...line.keys])])}>
          {line.pick}
        </Button>
        <Button key="author-validate" variant="secondary" onPress={() => void fillPrompt(line.prompt, line.urls)}>
          {line.validate}
        </Button>
        <Button key="author-ignore" plain={true} dimColor={true} onPress={() => void ignore(line.name, line.hidden)}>
          {t(lang, 'in_ignore')}
        </Button>
        <Button key="author-clear" plain={true} onPress={() => void setAuthor('')}>
          {t(lang, 'in_all_authors')}
        </Button>
      </Box>
    )
    const undoLine = vm.undo && (
      <Box key="undo" flexDirection="row" alignItems="center" gap="xs">
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="caption" color={C.subtle} wrap="truncate">
            {vm.undo.label}
          </Text>
        </Box>
        <Button key="undo-ignore" plain={true} onPress={() => void unignore(vm.undo!.author)}>
          {t(lang, 'in_undo')}
        </Button>
      </Box>
    )
    // Ignored: last in every view, folded, with Unignore per author; nothing is lost.
    const ignoredSection = vm.ignoredSection && (
      <Box key="ignored" flexDirection="column" gap="xs">
        {sectionHead(vm.ignoredSection, null)}
        {vm.ignoredSection.isOpen &&
          vm.ignoredSection.chips.map(a => (
            <Box key={`ign:${a.name}`} flexDirection="row" alignItems="center" gap="xs" paddingLeft="sm">
              {icon(a.svg, a.name.slice(0, 1).toUpperCase(), 18, 18, a.tip)}
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text color={C.subtle} wrap="truncate">
                  {`${a.name} · ${a.count}`}
                </Text>
              </Box>
              <Button key={`unignore:${a.name}`} plain={true} onPress={() => void unignore(a.name)}>
                {t(lang, 'in_unignore')}
              </Button>
            </Box>
          ))}
      </Box>
    )

    // By repo: the same header per repo; four rows, then Show N more.
    type RepoSection = (typeof vm.repoSections)[number]
    const repoSection = (g: RepoSection) => (
      <Box key={`repo:${g.repo}`} flexDirection="column" gap="xs">
        {sectionHead(g, pickAllOf(g))}
        {g.isOpen && g.authors.length > 0 && chips(g.authors, `${g.repo}:`)}
        {g.prs.map(row)}
        {g.more && (
          <Box flexDirection="row">
            <Button key={`more:repo:${g.repo}`} plain={true} onPress={() => void update($, more, m => [...m, `repo:${g.repo}`])}>
              {g.more}
            </Button>
          </Box>
        )}
      </Box>
    )
    if (vm.view === 'repos') return frame(head(true), failedBanner, authorLine, undoLine, ...vm.repoSections.map(repoSection), ignoredSection, batch)
    if (vm.view === 'team') return frame(head(true), failedBanner, authorLine, undoLine, authorsSection, ...vm.groups.map(group), ignoredSection, batch)
    return frame(head(true), failedBanner, authorLine, undoLine, clearBanner, authorsSection, ...vm.sections.map(section), ignoredSection, batch)
  })
}
