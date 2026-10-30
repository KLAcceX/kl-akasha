// Argos mod: the peacock's eyes inside Claude. A timer runs one argos-pavo round over
// the connected repos. The band above the prompt shows the most urgent PR; /argos opens
// the pane: a portrait at the top (do this now, three numbers, the age of open PRs,
// signal chips) and a queue below with tabs, selects and per-PR actions.
// Words come from the skills' i18n.mjs, in the plugin's `language` option.
import { atom, read, update } from 'claude-code'
import type { PluginOptions, Register } from 'claude-code'

import { label, t } from '../skills/argos-ward/scripts/i18n.mjs'
import type { Item, Round, Sort, View } from '../types'

const PANE = 'argos'
const ROUND = { plugin: 'argos', key: 'round' } as const
const HIDDEN = { plugin: 'argos', key: 'isHidden' } as const
const RUNNING = { plugin: 'argos', key: 'isRunning' } as const
const round = atom(ROUND, null)
const isHidden = atom(HIDDEN, false)
const isRunning = atom(RUNNING, false)
const view = atom({ plugin: 'argos', key: 'view' } as const, 'you' as View)
const author = atom({ plugin: 'argos', key: 'author' } as const, '')
const repoFilter = atom({ plugin: 'argos', key: 'repo' } as const, '')
const sort = atom({ plugin: 'argos', key: 'sort' } as const, 'rank' as Sort)
const signal = atom({ plugin: 'argos', key: 'signal' } as const, '')
const expanded = atom({ plugin: 'argos', key: 'expanded' } as const, '')
const copied = atom({ plugin: 'argos', key: 'copied' } as const, '')
const details = atom({ plugin: 'argos', key: 'details' } as const, false)

// The KL · Akasha mark (brand/kl/final). The icon is the face centred in a full
// L-coloured frame; the loading one travels from the whole mark to the face and back.
const GLYPH =
  '<path fill="#7E5CC0" d="M104 96L160 40A56 56 0 0 1 160 152Z"/><path fill="#A98BE0" d="M160 40L104 96L160 152L122 96Z"/>' +
  '<path fill="#F3EEFB" d="M172 68L178 90L200 96L178 102L172 124L166 102L144 96L166 90Z"/>'
const MARK =
  '<g transform="translate(-6 0)"><path fill="#51408A" d="M40 40H96V136Q96 160 120 160H200A28 28 0 0 1 200 216H40Z"/>' +
  `${GLYPH}</g>`
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="56" fill="#1E1430"/>' +
  '<rect x="22" y="22" width="212" height="212" rx="40" fill="none" stroke="#51408A" stroke-width="18"/>' +
  `<g transform="translate(128 128) scale(1.25) translate(-160 -96)">${GLYPH}</g></svg>`
const LOADING =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><animate attributeName="viewBox" values="0 0 256 256;66 20 156 156;0 0 256 256" dur="1.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.65 0 0.35 1;0.65 0 0.35 1"/>' +
  `<rect x="-200" y="-200" width="656" height="656" rx="48" fill="#1E1430"/>${MARK}</svg>`

const DAY = 864e5
const base = (code: string) => code.split(':')[0]
const has = (p: Item, ...codes: string[]) => p.signals.some(s => codes.includes(base(s)))
// Signals that block a PR: shown with ▲ (never colour alone) and ringed in the chart.
const ALERT = new Set(['conflict', 'ci_failed', 'changes_requested'])
const stuck = (p: Item) => has(p, 'conflict', 'ci_failed', 'changes_requested', 'late', 'no_review')

export const days = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY))

// What to do first: merge, then a late review that blocks a teammate, then unblock mine,
// answer, review on time, ask for review; teammates' PRs after, drafts last.
export function rank(p: Item): number {
  if (p.kind === 'mine') {
    if (has(p, 'ready')) return 1
    if (has(p, 'conflict', 'ci_failed', 'changes_requested')) return 3
    if (has(p, 'threads', 'unanswered', 'new_reviews')) return 4
    if (has(p, 'no_review')) return 6
    return 9
  }
  if (p.kind === 'review') return has(p, 'late') ? 2 : 5
  if (p.isDraft) return 10
  if (has(p, 'no_review')) return 7
  return p.signals.length ? 8 : 9
}
export const byRank = (a: Item, b: Item) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt)
export const byAge = (a: Item, b: Item) => a.createdAt.localeCompare(b.createdAt)

// The verb for a PR: what the user does about it, from its most urgent signal.
const ACTION_ORDER = ['ready', 'conflict', 'ci_failed', 'changes_requested', 'threads', 'unanswered', 'new_reviews', 'no_review']
export function action(p: Item, lang: string, now: number) {
  const d = days(p.createdAt, now)
  if (p.kind === 'review') return has(p, 'late') ? t(lang, 'act_review_late', d) : t(lang, 'act_review')
  if (p.kind === 'other') return has(p, 'no_review') ? t(lang, 'act_team_look', d) : p.signals.map(c => label(lang, c)).join(', ') || t(lang, 'idle_other')
  const code = ACTION_ORDER.map(k => p.signals.find(s => base(s) === k)).find(Boolean)
  if (!code) return t(lang, 'idle_mine')
  const [k, n] = code.split(':')
  return n === undefined ? t(lang, `act_${k}`) : t(lang, `act_${k}`, Number(n))
}

// Open PRs by age: <1d, 1–3d, 3–7d, 1–2 weeks, over 2 weeks.
const LIMITS = [1, 3, 7, 14]
export function buckets(items: Item[], now: number): Item[][] {
  const b: Item[][] = [[], [], [], [], []]
  for (const p of items) {
    const i = LIMITS.findIndex(l => (now - Date.parse(p.createdAt)) / DAY < l)
    b[i < 0 ? 4 : i].push(p)
  }
  return b
}

// The portrait's numbers, all from one place: the pane, the chart and the band agree.
export function summary(r: Round | null, now: number, minutes = 60) {
  const pending = r?.pending ?? []
  const mine = r?.mine ?? pending.filter(p => p.kind === 'mine')
  const reviews = pending.filter(p => p.kind === 'review')
  const team = (r?.others ?? []).filter(p => !p.isDraft)
  const teamStuck = team.filter(p => p.signals.length)
  const seen = new Set<string>()
  const open = [...mine, ...reviews, ...team].filter(p => !seen.has(p.url) && Boolean(seen.add(p.url)))
  const counts = new Map<string, number>()
  for (const p of [...pending, ...teamStuck]) for (const c of new Set(p.signals.map(base))) counts.set(c, (counts.get(c) ?? 0) + 1)
  const okAt = r?.okAt ?? (r?.error ? null : r?.at)
  const ageH = okAt ? (now - Date.parse(okAt)) / 36e5 : 0
  return {
    you: pending.length,
    mine: pending.filter(p => p.kind === 'mine').length,
    reviews: reviews.length,
    teamStuck: teamStuck.length,
    team: team.length,
    oldest: [...open].sort(byAge)[0] ?? null,
    buckets: buckets(open, now),
    bySignal: [...counts].sort((a, b) => b[1] - a[1]),
    okAt,
    isStale: Boolean(okAt) && ageH > (2 * minutes) / 60,
    ageH: Math.floor(ageH),
  }
}

// The signature: one dot per open PR in five age columns. Light = for you, lilac = a teammate's
// PR with a signal, purple = a teammate's without; ringed = stuck. At most 16 dots, then +n.
const MAX_DOTS = 16
export function ageDots(b: Item[][], labels: string[], now: number) {
  const cols = b.map((col, i) => {
    const x0 = i * 60
    const dots = col.slice(0, MAX_DOTS).map((p, j) => {
      const fill = p.kind !== 'other' ? '#F3EEFB' : p.signals.length ? '#A98BE0' : '#7E5CC0'
      const ring = stuck(p) ? ` stroke="${p.kind !== 'other' ? '#A98BE0' : '#F3EEFB'}" stroke-width="1.5"` : ''
      return `<circle cx="${x0 + 15 + (j % 4) * 10}" cy="${50 - Math.floor(j / 4) * 10}" r="3.5" fill="${fill}"${ring}><title>#${p.number} · ${days(p.createdAt, now)}d</title></circle>`
    })
    const more = col.length > MAX_DOTS ? `<text x="${x0 + 30}" y="12" font-size="9" fill="#F3EEFB" text-anchor="middle">+${col.length - MAX_DOTS}</text>` : ''
    return `${dots.join('')}${more}<text x="${x0 + 30}" y="68" font-size="9" fill="#A98BE0" text-anchor="middle">${labels[i]}</text>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 72"><rect width="300" height="72" rx="10" fill="#1E1430"/>${cols.join('')}</svg>`
}
// The same chart as text for surfaces without Svg: ● for you, ○ for the team.
export const ageText = (b: Item[][], labels: string[]) =>
  b
    .map((col, i) => `${labels[i]} ${col.slice(0, MAX_DOTS).map(p => (p.kind !== 'other' ? '●' : '○')).join('')}${col.length > MAX_DOTS ? ` +${col.length - MAX_DOTS}` : ''}`)
    .join('  ')

// What a queue tab shows; author, repo and signal narrow it.
export function visible(r: Round | null, v: View, who = '', repo = '', sig = '') {
  const list = v === 'team' ? (r?.others ?? []) : (r?.pending ?? [])
  const me = r?.me ?? ''
  return list.filter(p => (!who || (p.author || me) === who) && (!repo || p.repo === repo) && (!sig || p.signals.some(s => base(s) === sig)))
}

// The same items in repo groups, connected repos first even when empty.
export function grouped(items: Item[], repos: string[]) {
  const names = [...new Set([...repos, ...items.map(p => p.repo)])]
  return names.map(repo => ({ repo, items: items.filter(p => p.repo === repo) }))
}

const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const shortRepo = (repo: string) => repo.split('/')[1] ?? repo

const config = (options: PluginOptions) => ({
  minutes: Math.max(5, Number(options.intervalMinutes) || 60),
  account: String(options.account ?? '').trim(),
  qualifiers: String(options.qualifiers ?? '').split(/\s+/).filter(Boolean),
  lang: String(options.language ?? 'en'),
})

// A known failure in words; the raw text stays behind "Details".
export function errorText(error: string, lang: string) {
  if (/gh auth|not logged/i.test(error)) return t(lang, 'ui_err_gh_auth')
  if (/timed out|ETIMEDOUT|timeoutMs/i.test(error)) return t(lang, 'ui_err_timeout')
  return t(lang, 'ui_err_generic')
}

async function roundFile($: any) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return `${home}/.claude/kl-akasha/argos/last-round.json`
}

// Shows what the last round (from any session) wrote.
async function load($: any): Promise<Round | null> {
  try {
    const last: Round = JSON.parse(await $.fs.read(await roundFile($)))
    await $.state.set(ROUND, last)
    return last
  } catch {
    return null
  }
}

// One round. Open sessions share last-round.json: a session skips the round
// when another one ran it within the interval, and only shows it.
async function tick($: any, options: PluginOptions, force: boolean) {
  if ((await $.state.get(RUNNING)).value) return
  const { minutes, account, qualifiers, lang } = config(options)
  const last = await load($)
  const now = await $.clock.now()
  if (!force && last && now - Date.parse(last.at) < minutes * 6e4 - 3e4) return
  await $.state.set(RUNNING, true)
  try {
    const argv = ['node', `${$.plugin.root}/skills/argos-pavo/scripts/pavo.mjs`, ...qualifiers, '--lang', lang, '--json']
    if (account) argv.push('--account', account)
    await $.process.run(argv, { timeoutMs: 120_000 })
    const fresh = await load($)
    if (fresh?.notify) {
      $.ui.toast(fresh.notify)
      await $.state.set(HIDDEN, false)
    }
  } catch (err) {
    const { value } = await $.state.get(ROUND)
    // keep okAt: the data on screen is still from the last round that worked
    await $.state.set(ROUND, { ...(value ?? {}), at: new Date(now).toISOString(), okAt: value?.okAt ?? null, error: String(err) })
  } finally {
    await $.state.set(RUNNING, false)
  }
}

export const register: Register = (on, options) => {
  const { lang, minutes } = config(options)
  const title = t(lang, 'ui_title')

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'argos', description: t(lang, 'ui_command') })
    $.clock.every(minutes * 6e4, () => void tick($, options, false))
    $.clock.after(5_000, () => void tick($, options, false))
    return started
  })

  // /argos opens the pane; /argos repos [add <folder> | remove <repo>] goes through repos.mjs,
  // the same command the AI uses from the argos-pavo skill.
  on('command.run', { command: 'argos' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    if (args[0] === 'repos') {
      const { stdout, stderr } = await $.process.run([
        'node',
        `${$.plugin.root}/skills/argos-pavo/scripts/repos.mjs`,
        ...(args.length > 1 ? args.slice(1) : ['list']),
        '--lang',
        lang,
      ])
      if (args[1] === 'add' || args[1] === 'remove') void tick($, options, true)
      return { text: (stdout || stderr).trim() }
    }
    await $.ui.open({ id: PANE, title })
    void tick($, options, true)
    return { text: t(lang, 'ui_opened') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, round)
    const running = await read($, isRunning)
    const now = await $.clock.now()
    const list = [...(r?.pending ?? [])].sort(byRank)
    const late = (r?.others ?? []).filter(p => !p.isDraft && p.signals.length).length
    if (e.props.hasSurvey || (await read($, isHidden)) || (!running && !list.length && !late && !r?.error)) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const mark =
      e.surface !== 'terminal' ? (
        <ui.Svg source={running ? LOADING : ICON} alt="KL · Akasha" width={18} height={18} isInteractive={running} />
      ) : (
        <Text color="magenta">◆ </Text>
      )
    const first = list[0]
    return (
      <Box>
        {mark}
        <Text> Argos </Text>
        {running && <Text dimColor>{t(lang, 'ui_running')} </Text>}
        {!running && r?.error && <Text>{t(lang, 'ui_failed')} · </Text>}
        {!running && first && (
          <Text>
            {t(lang, 'ui_needs', list.length)} · {action(first, lang, now)}: {shortRepo(first.repo)}#{first.number}{' '}
          </Text>
        )}
        {!running && late > 0 && <Text dimColor>· {t(lang, 'ui_others', late)} </Text>}
        <Button key="open" onPress={() => void $.ui.open({ id: PANE, title })}>
          {t(lang, 'ui_see')}
        </Button>
        <Button key="hide" role="dismiss" onPress={() => void update($, isHidden, () => true)}>
          {t(lang, 'ui_hide')}
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text, Select, Link, Code } = ui
    // the terminal is the one surface without Svg (its table still carries the name)
    const hasSvg = e.surface !== 'terminal'
    const r = await read($, round)
    const running = await read($, isRunning)
    const now = await $.clock.now()

    // States with nothing to portray yet
    if (!r && running)
      return (
        <Box flexDirection="column" alignItems="center" gap={8} padding={12}>
          {hasSvg && <ui.Svg source={LOADING} alt="KL · Akasha" width={56} height={56} isInteractive />}
          <Text dimColor>{t(lang, 'ui_first_vigil')}</Text>
        </Box>
      )
    const refresh = () => void tick($, options, true)
    if (!r)
      return (
        <Box flexDirection="column" gap={8} padding={12}>
          <Text>{t(lang, 'ui_never')}</Text>
          <Button key="first" variant="primary" onPress={refresh}>
            {t(lang, 'ui_refresh')}
          </Button>
        </Box>
      )
    const fillPrompt = async (ask: string) => {
      const { text } = await $.prompt.read()
      await $.prompt.fill(text.trim() ? { text: `\n${ask}`, mode: 'append' } : { text: ask, mode: 'replace' })
    }
    if (!(r.repos ?? []).length || r.needsRepos)
      return (
        <Box flexDirection="column" gap={8} padding={12}>
          <Text weight="bold">{t(lang, 'ui_no_repos_title')}</Text>
          <Text>{t(lang, 'ui_no_repos_body')}</Text>
          <Code source="/argos repos add <folder>" />
          <Button key="connect" variant="primary" onPress={() => void fillPrompt('/argos repos add ')}>
            {t(lang, 'ui_connect')}
          </Button>
        </Box>
      )

    const v = await read($, view)
    const who = await read($, author)
    const repo = await read($, repoFilter)
    const order = await read($, sort)
    const sig = await read($, signal)
    const open = await read($, expanded)
    const copiedUrl = await read($, copied)
    const showDetails = await read($, details)
    const s = summary(r, now, minutes)
    const me = r.me ?? ''
    const hasFilter = Boolean(who || repo || sig)
    const hero = [...(r.pending ?? [])].sort(byRank)[0] ?? [...(r.others ?? [])].filter(p => !p.isDraft && has(p, 'no_review')).sort(byRank)[0]

    const status = running
      ? t(lang, 'ui_running')
      : s.isStale
        ? t(lang, 'ui_stale', s.ageH)
        : s.okAt
          ? t(lang, 'ui_status', hhmm(Date.parse(s.okAt)), hhmm(Date.parse(s.okAt) + minutes * 6e4))
          : ''

    const copy = (p: Item) => async (press: any) => {
      const res = await $.ui.copy({ text: p.url, surface: press.surface })
      await update($, copied, () => (res.isCopied ? p.url : `fail:${p.url}`))
      $.clock.after(2_000, () => void update($, copied, () => ''))
    }
    const copyLabel = (p: Item) =>
      copiedUrl === p.url ? t(lang, 'ui_copied') : copiedUrl === `fail:${p.url}` ? t(lang, 'ui_copy_failed') : t(lang, 'ui_copy')
    const aiButton = (p: Item, primary = false) => (
      <Button
        key={`ai:${p.url}`}
        variant={primary ? 'primary' : undefined}
        onPress={() =>
          void fillPrompt(p.kind === 'mine' ? t(lang, 'prompt_ward', p.url, action(p, lang, now)) : t(lang, 'prompt_panoptes', p.url))
        }
      >
        {p.kind === 'mine' ? t(lang, 'ui_ward') : t(lang, 'ui_panoptes')}
      </Button>
    )
    const kpi = (key: string, name: string, value: string | number, sub?: any) => (
      <Box key={key} flexDirection="column">
        <Text size="caption" dimColor>
          {name}
        </Text>
        <Text size="title" weight="bold" tabular>
          {String(value)}
        </Text>
        {sub}
      </Box>
    )
    const signals = (p: Item) => p.signals.map(c => `${ALERT.has(base(c)) ? '▲ ' : ''}${label(lang, c)}`).join(' · ')
    const row = (p: Item) => (
      <Box key={p.url} flexDirection="column" gap={2}>
        <Box flexDirection="row" gap={6} alignItems="center">
          <Text tabular dimColor>
            {days(p.createdAt, now)}d
          </Text>
          <Link href={p.url} label={`#${p.number} ${p.title}`} />
          <Box flexGrow={1} />
          <Button key={`more:${p.url}`} plain={true} onPress={() => void update($, expanded, cur => (cur === p.url ? '' : p.url))}>
            {open === p.url ? '−' : '⋯'}
          </Button>
        </Box>
        <Text size="caption" dimColor wrap="truncate">
          {order === 'repo' ? '' : `${shortRepo(p.repo)} · `}
          {p.kind !== 'mine' ? `@${p.author || '?'} · ` : ''}
          {p.isDraft ? `${t(lang, 'ui_draft')} · ` : ''}
          {signals(p) || (p.kind === 'other' ? t(lang, 'idle_other') : '')}
        </Text>
        {open === p.url && (
          <Box flexDirection="column" gap={4} marginLeft={12}>
            <Text weight="bold">{action(p, lang, now)}</Text>
            {!hasSvg && <Text dimColor>{p.url}</Text>}
            <Box flexDirection="row" gap={8}>
              {aiButton(p)}
              <Button key={`copy:${p.url}`} onPress={copy(p)}>
                {copyLabel(p)}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    )

    const pool = visible(r, v, who, repo, sig)
    const items = [...pool].sort(order === 'oldest' ? byAge : byRank)
    const all = [...(r.pending ?? []), ...(r.others ?? [])]
    const authors = [...new Set(all.map(p => p.author || me).filter(Boolean))].sort()
    const count = (f: (p: Item) => boolean) => all.filter(f).length
    const authorOptions = [
      { value: '', label: t(lang, 'opt_everyone') },
      ...authors.map(a => ({ value: a, label: `${a === me ? t(lang, 'opt_me', a) : `@${a}`} (${count(p => (p.author || me) === a)})` })),
    ]
    const repoOptions = [
      { value: '', label: t(lang, 'opt_all_repos') },
      ...(r.repos ?? []).map(n => ({ value: n, label: `${n} (${count(p => p.repo === n)})` })),
    ]
    const orderOptions = [
      { value: 'rank', label: t(lang, 'opt_rank') },
      { value: 'oldest', label: t(lang, 'opt_oldest') },
      { value: 'repo', label: t(lang, 'opt_by_repo') },
    ]
    const tab = (id: View, word: string) => (
      <Button key={`tab:${id}`} plain={true} onPress={() => void update($, view, () => id)}>
        {v === id ? `● ${word}` : word}
      </Button>
    )
    const ageLabels = t(lang, 'age_buckets') as unknown as string[]

    return (
      <Box flexDirection="column" gap={12} padding={12}>
        {/* 1 · Header */}
        <Box flexDirection="row" alignItems="center" gap={8}>
          {hasSvg ? (
            <ui.Svg source={running ? LOADING : ICON} alt="KL · Akasha" width={24} height={24} isInteractive={running} />
          ) : (
            <Text color="magenta">◆</Text>
          )}
          <Text weight="bold" size="heading">
            Argos
          </Text>
          <Text dimColor tabular>
            {status}
          </Text>
          <Box flexGrow={1} />
          <Button key="refresh" hotkey="r" plain={true} dimColor={running} onPress={refresh}>
            {running ? t(lang, 'ui_running') : t(lang, 'ui_refresh')}
          </Button>
        </Box>

        {/* Failed round: say so, keep the last good data */}
        {r.error && (
          <Box flexDirection="column" gap={4}>
            <Text weight="bold">
              {s.okAt ? t(lang, 'ui_err_title', hhmm(Date.parse(r.at)), hhmm(Date.parse(s.okAt))) : errorText(r.error, lang)}
            </Text>
            {s.okAt && <Text dimColor>{errorText(r.error, lang)}</Text>}
            <Box flexDirection="row" gap={8}>
              <Button key="retry" onPress={refresh}>
                {t(lang, 'ui_retry')}
              </Button>
              <Button key="details" plain={true} onPress={() => void update($, details, d => !d)}>
                {t(lang, 'ui_details')}
              </Button>
            </Box>
            {showDetails && <Code source={r.error} />}
          </Box>
        )}

        {/* 2 · Do this now */}
        {hero ? (
          <Box flexDirection="column" gap={4}>
            <Text size="caption" weight="bold" backgroundColor="#51408A" color="#F3EEFB">
              {` ${t(lang, 'ui_now')} `}
            </Text>
            <Text size="heading" weight="bold" dimColor={s.isStale || Boolean(r.error)}>
              {s.isStale ? t(lang, 'act_check') : action(hero, lang, now)}
            </Text>
            <Link href={hero.url} label={`${shortRepo(hero.repo)}#${hero.number} ${hero.title}`} />
            <Text dimColor tabular>
              {days(hero.createdAt, now)}d{hero.kind !== 'mine' ? ` · @${hero.author || '?'}` : ''}
            </Text>
            <Box flexDirection="row" gap={8}>
              <Link href={hero.url} label={`${t(lang, 'ui_open_github')} →`} />
              {aiButton(hero, true)}
              <Button key="hero-copy" plain={true} onPress={copy(hero)}>
                {copyLabel(hero)}
              </Button>
            </Box>
          </Box>
        ) : (
          <Text>{t(lang, 'ui_all_clear')}</Text>
        )}

        {/* 3 · Three numbers */}
        <Box flexDirection="row" gap={16}>
          {kpi('you', t(lang, 'kpi_you'), s.you, <Text size="caption" dimColor>{t(lang, 'kpi_you_split', s.mine, s.reviews)}</Text>)}
          {kpi('team', t(lang, 'kpi_team'), s.teamStuck)}
          {kpi(
            'oldest',
            t(lang, 'kpi_oldest'),
            s.oldest ? `${days(s.oldest.createdAt, now)}d` : '–',
            s.oldest && <Link href={s.oldest.url} label={`#${s.oldest.number}`} />,
          )}
        </Box>

        {/* 4 · Age of open PRs (the signature) */}
        {hasSvg ? (
          <ui.Svg
            source={ageDots(s.buckets, ageLabels, now)}
            alt={t(lang, 'age_alt', s.buckets.map(c => c.length))}
            width={300}
            height={72}
            isInteractive
          />
        ) : (
          <Text tabular>{ageText(s.buckets, ageLabels)}</Text>
        )}

        {/* 5 · Signals, which are also filters */}
        {s.bySignal.length > 0 && (
          <Box flexDirection="row" gap={6} flexWrap="wrap">
            {s.bySignal.map(([code, n]) => (
              <Button key={`sig:${code}`} plain={true} onPress={() => void update($, signal, cur => (cur === code ? '' : code))}>
                {`${sig === code ? '✓ ' : ALERT.has(code) ? '▲ ' : ''}${label(lang, code).replace(/^\d+\s*/, '')} ${n}`}
              </Button>
            ))}
          </Box>
        )}

        {/* Queue controls */}
        <Box flexDirection="row" gap={8}>
          {tab('you', t(lang, 'tab_you', s.you))}
          {tab('team', t(lang, 'tab_team', s.team))}
        </Box>
        <Box flexDirection="row" gap={8} flexWrap="wrap">
          <Select key="author" label={t(lang, 'sel_author')} value={who} options={authorOptions} onSelect={(val: string) => void update($, author, () => val)} />
          {(r.repos ?? []).length > 1 && (
            <Select key="repo" label={t(lang, 'sel_repo')} value={repo} options={repoOptions} onSelect={(val: string) => void update($, repoFilter, () => val)} />
          )}
          <Select key="sort" label={t(lang, 'sel_order')} value={order} options={orderOptions} onSelect={(val: string) => void update($, sort, () => val as Sort)} />
        </Box>
        {hasFilter && (
          <Button
            key="clear"
            plain={true}
            onPress={() => {
              void update($, author, () => '')
              void update($, repoFilter, () => '')
              void update($, signal, () => '')
            }}
          >
            {t(lang, 'ui_clear')}
          </Button>
        )}

        {/* Queue */}
        {items.length === 0 ? (
          <Text dimColor>{hasFilter ? t(lang, 'ui_filter_empty') : t(lang, 'ui_queue_empty')}</Text>
        ) : order === 'repo' ? (
          grouped(items, r.repos ?? []).map(g => (
            <Box key={g.repo} flexDirection="column" gap={4}>
              <Text weight="bold">
                {g.repo} · {g.items.length}
              </Text>
              {g.items.length ? g.items.map(row) : <Text key={`${g.repo}:empty`} dimColor>{t(lang, 'ui_empty')}</Text>}
            </Box>
          ))
        ) : (
          items.map(row)
        )}
      </Box>
    )
  })
}
