// The pane's look, from the PR inbox spec: one meaning per colour, 16px icons with fixed
// fills (an Svg has no currentColor), GitHub labels as SVG pills, and the rule that fits a
// row's tags in a narrow pane. No mod runtime, so Node and the tests can import it.

export const C = {
  bg: '#1f1f1e',
  text: '#ECEAE4',
  subtle: '#9C9A93',
  // blocked: conflict, CI failing, check failed
  error: '#F07A72',
  // reviewers answered: changes requested, open threads
  warning: '#E6B450',
  // ready: approved, CI passing
  success: '#6CCB8F',
  // asked of you: your review is requested
  suggestion: '#82AAF5',
  // going to the prompt: picked rows, batch bar, the primary button
  claude: '#E08A68',
  // AI validation
  merged: '#B794F4',
  meter: '#4A4945',
  bot: '#C9C7C0',
} as const
export type Tone = 'error' | 'warning' | 'suggestion' | 'success'

const RGB = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
export const rgba = (h: string, a: number) => `rgba(${RGB(h).join(',')},${a})`
// a tone's row: fill at 7%, border at 35%
export const TINT = 0.07
export const tint = (tone: Tone) => ({ bg: rgba(C[tone], TINT), border: rgba(C[tone], 0.35) })
export const NEUTRAL = { bg: undefined, border: 'rgba(255,255,255,0.08)' }
export const PICKED = { bg: rgba(C.claude, 0.1), border: rgba(C.claude, 0.7) }

const S = (w: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="16" viewBox="0 0 ${w} 16">${body}</svg>`
const st = (c: string, w = 1.5) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`

export const I = {
  pr: (c: string) =>
    S(
      16,
      `<circle cx="4" cy="3.5" r="1.75" ${st(c)}/><circle cx="4" cy="12.5" r="1.75" ${st(c)}/><circle cx="12" cy="12.5" r="1.75" ${st(c)}/><path d="M4 5.25v5.5M12 10.75V6.5a2 2 0 0 0-2-2H7.5M9 3 7.5 4.5 9 6" ${st(c)}/>`,
    ),
  draft: S(
    16,
    `<circle cx="4" cy="3.5" r="1.75" ${st(C.subtle)}/><circle cx="4" cy="12.5" r="1.75" ${st(C.subtle)}/><circle cx="12" cy="12.5" r="1.75" ${st(C.subtle)}/><path d="M4 5.25v5.5" ${st(C.subtle)}/><path d="M12 10V3" ${st(C.subtle)} stroke-dasharray="1.5 2.2"/>`,
  ),
  ciPass: S(16, `<circle cx="8" cy="8" r="7" fill="${C.success}"/><path d="M4.8 8.2l2.1 2.1 4.3-4.6" ${st(C.bg, 1.8)}/>`),
  ciFail: S(16, `<circle cx="8" cy="8" r="7" fill="${C.error}"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" ${st(C.bg, 1.8)}/>`),
  ciPending: S(16, `<circle cx="8" cy="8" r="6.25" ${st(C.subtle)} stroke-dasharray="2.4 2.1"/><circle cx="8" cy="8" r="2" fill="${C.subtle}"/>`),
  conflict: S(16, `<path d="M3.5 1.5v3.5L8 9.5M12.5 1.5v3.5L8 9.5v5" ${st(C.error, 1.7)}/><circle cx="8" cy="9.5" r="1.6" fill="${C.error}"/>`),
  changes: S(16, `<rect x="2.5" y="1.5" width="11" height="13" rx="2" ${st(C.warning)}/><path d="M8 4.5v4M6 6.5h4M6 11.2h4" ${st(C.warning)}/>`),
  threads: S(16, `<path d="M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v5.5A1.5 1.5 0 0 1 12 11H7l-3 2.5V11A1.5 1.5 0 0 1 2.5 9.5z" ${st(C.warning)}/>`),
  approved: S(16, `<path d="M2.8 8.6l3.4 3.4L13.2 4.4" ${st(C.success, 2)}/>`),
  eye: (c: string) => S(16, `<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" ${st(c)}/><circle cx="8" cy="8" r="2" fill="${c}"/>`),
  noOwner: S(16, `<circle cx="8" cy="5" r="2.5" ${st(C.subtle)}/><path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" ${st(C.subtle)} stroke-dasharray="2 2"/>`),
  ai: S(
    16,
    `<rect x="2.5" y="4.5" width="11" height="9" rx="2.5" ${st(C.bot)}/><circle cx="6" cy="9" r="1.1" fill="${C.bot}"/><circle cx="10" cy="9" r="1.1" fill="${C.bot}"/><path d="M8 4.5V2" ${st(C.bot)}/>`,
  ),
  size: (n: number) =>
    S(16, [0, 1, 2, 3].map(i => `<rect x="${1.5 + i * 3.5}" y="${14.5 - (4 + i * 3)}" width="2.5" height="${4 + i * 3}" rx=".8" fill="${i < n ? C.bot : C.meter}"/>`).join('')),
  error: S(16, `<circle cx="8" cy="8" r="7" fill="${C.error}"/><path d="M8 4.4v4.4" ${st(C.bg, 1.8)}/><circle cx="8" cy="11.4" r="1" fill="${C.bg}"/>`),
}

// The validator's star, in purple like the Argos mark: filled when validated, dashed while it
// runs, a grey outline once new commits make it old, a dim solid star when never run.
const STAR = 'M8 1.5 9.7 6.3 14.5 8 9.7 9.7 8 14.5 6.3 9.7 1.5 8 6.3 6.3Z'
export const STARS = {
  done: S(16, `<path d="${STAR}" fill="${C.merged}"/>`),
  run: S(16, `<path d="${STAR}" fill="none" stroke="${C.merged}" stroke-width="1.3" stroke-linejoin="round" stroke-dasharray="2 1.6"/>`),
  stale: S(16, `<path d="${STAR}" fill="none" stroke="${C.subtle}" stroke-width="1.3" stroke-linejoin="round"/>`),
  none: S(16, `<path d="${STAR}" fill="${C.meter}"/>`),
}

// A label's ink: its GitHub colour lifted 55% toward white, so a dark label still reads.
const mixW = (h: string, t: number) => '#' + RGB(h).map(v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// The label as a pill: its GitHub hex at 18% fill and 55% stroke; past 10 characters cut.
export function pill(name: string, color: string) {
  const hex = /^#?[0-9a-f]{6}$/i.test(color) ? `#${color.replace('#', '')}` : C.subtle
  const n = name.length > 10 ? name.slice(0, 9) + '…' : name
  const w = Math.round(12 + n.length * 6.1)
  return {
    w,
    svg: S(
      w,
      `<rect x=".5" y=".5" width="${w - 1}" height="15" rx="7.5" fill="${hex}" fill-opacity=".18" stroke="${hex}" stroke-opacity=".55"/><text x="${w / 2}" y="11.4" font-family="-apple-system,system-ui,sans-serif" font-size="10.5" font-weight="600" text-anchor="middle" fill="${mixW(hex, 0.55)}">${esc(n)}</text>`,
    ),
  }
}

// A tag on a row's second line: a signal, the agent glyph, a label or the size meter, each an
// SVG; a count rides after it as text in its colour. `text` stands in where no Svg is drawn.
export type Tag = { k: 'sig' | 'ai' | 'label' | 'size' | 'more'; svg?: string; w: number; count?: string; color?: string; text: string }
export const sig = (svg: string, text: string, count?: number, color?: string): Tag => ({ k: 'sig', svg, w: 16, text, ...(count ? { count: String(count), color } : {}) })

// Size by changed lines: S <50, M <300, L <1000, XL past that, as 1 to 4 bars.
export const bars = (lines: number) => (lines < 50 ? 1 : lines < 300 ? 2 : lines < 1000 ? 3 : 4)

// Labels that say risk go first, then the rest alphabetically.
const PRIORITY = ['security', 'breaking', 'bug']
export const byPriority = (a: { name: string }, b: { name: string }) => {
  const r = (n: string) => {
    const i = PRIORITY.findIndex(p => n.toLowerCase().includes(p))
    return i < 0 ? 99 : i
  }
  return r(a.name) - r(b.name) || a.name.localeCompare(b.name)
}

// Up to 5 tags at 300px (4 at 260, 3 at 240), left to right: signals (2, a third and on
// become "+N"), the agent glyph, labels (2), the size meter. Under 300px the size meter goes
// and one label stays. Over the cap they go in this order: size, the second label, the agent
// glyph, the last label, then the second signal becomes "+1".
export function fit(tags: Tag[], w = 300): Tag[] {
  const max = w >= 300 ? 5 : w >= 260 ? 4 : 3
  let s = tags.filter(t => t.k === 'sig')
  let extra = Math.max(0, s.length - 2)
  s = s.slice(0, 2)
  let labels = tags.filter(t => t.k === 'label').slice(0, 2)
  let size = tags.find(t => t.k === 'size')
  let ai = tags.find(t => t.k === 'ai')
  if (w < 300) {
    size = undefined
    labels = labels.slice(0, 1)
  }
  const out = () => [...s, ...(ai ? [ai] : []), ...labels, ...(size ? [size] : [])]
  const drop = [
    () => (size = undefined),
    () => (labels = labels.slice(0, 1)),
    () => (ai = undefined),
    () => (labels = []),
    () => {
      if (s.length > 1) {
        extra++
        s = s.slice(0, 1)
      }
    },
  ]
  let i = 0
  while (out().length > max && i < drop.length) drop[i++]!()
  const res = out()
  if (extra) res.splice(s.length, 0, { k: 'more', w: 0, count: `+${extra}`, color: C.subtle, text: `+${extra}` })
  return res
}
