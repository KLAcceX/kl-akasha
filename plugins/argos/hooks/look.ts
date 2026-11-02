// The pane's look: one meaning per colour, and 16px icons with fixed fills (an Svg has no
// currentColor). No mod runtime, so Node and the tests can import it.

// Text colours are theme keys, so light and dark each get the host's own value. Purple means
// Argos (picked, the verdict star, running), amber a problem, green a pass; never the other way.
export const C = {
  text: 'text',
  subtle: 'subtle',
  brand: 'merged',
  warning: 'warning',
  success: 'success',
  error: 'error',
} as const
// An Svg keeps one fill in both themes, so its colours are picked to reach 3:1 on the dark pane
// (#1f1f1e) and on white: brand 4.1 / 4.0, grey 4.7 / 3.6.
export const HEX = {
  bg: '#1f1f1e',
  brand: '#8E6CD2',
  grey: '#8A8880',
  error: '#F07A72',
  success: '#3A9D66',
  meter: '#4A4945',
} as const
// Spacing tokens: space goes between Boxes, never between lines of Text. Each step has one job,
// so a gap says what it separates; the surface sizes the step names its own way.
export const SPACE = {
  // lines of one thought
  line: 0,
  // stacked rows of Buttons, items inside a row
  row: 'xs',
  // things side by side in a row
  inline: 'sm',
  // blocks of one region
  block: 'md',
  // regions of the pane
  region: 'lg',
} as const
// An open fold (Who, a repo's Settings): one soft panel, spaced as blocks inside.
export const PANEL = {
  gap: SPACE.block,
  padding: 'md',
  borderStyle: 'round',
  borderColor: 'rgba(128,128,128,0.25)',
  backgroundColor: 'rgba(128,128,128,0.05)',
} as const
// a row under the pointer: a faint brand tint, readable under text in both themes
export const HOVER = 'rgba(126,92,192,0.10)'

// The Argos mark. MARK is the app icon (256, used at 28px and up): the brand's own frame
// (ground rx 56, frame rx 40, stroke 18) around the mark the design recentred (58% of the inner
// width, shifted so it reads centred). LOGO is drawn for 16px, where the main one's star turns
// to mush and its frame smears.
export const MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
  '<rect width="256" height="256" rx="56" fill="#1E1430"/>' +
  '<rect x="22" y="22" width="212" height="212" rx="40" fill="none" stroke="#51408A" stroke-width="18"/>' +
  '<path d="M123 72 67 128 123 184Z" fill="#A98BE0"/>' +
  '<path d="M123 72 85 128 123 184A56 56 0 0 0 123 72Z" fill="#7E5CC0"/>' +
  '<path d="M135 100 141 122 163 128 141 134 135 156 129 134 107 128 129 122Z" fill="#F3EEFB"/></svg>'
export const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
  '<rect x=".5" y=".5" width="15" height="15" rx="3.5" fill="#1E1430" stroke="#51408A"/>' +
  '<path d="M7.6 3 2.6 8 7.6 13Z" fill="#A98BE0"/>' +
  '<path d="M7.6 3 4.2 8 7.6 13A5 5 0 0 0 7.6 3Z" fill="#7E5CC0"/>' +
  '<path d="M8.6 5 9.5 7.1 11.6 8 9.5 8.9 8.6 11 7.7 8.9 5.6 8 7.7 7.1Z" fill="#F3EEFB"/></svg>'

// An author's avatar, drawn as Svg (the kit loads no remote picture): the shape says who, in
// greys only so every colour keeps its one meaning. A circle is a person, a rounded square a bot,
// a square with a face a coding agent.
const initial = (name: string) => escText((name.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase())
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const AV_TEXT = (ch: string) => `<text x="9" y="12.7" font-family="-apple-system,system-ui,sans-serif" font-size="10" font-weight="600" text-anchor="middle" fill="#ECEAE4">${ch}</text>`
export const AVATAR = {
  human: (name: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="#45443F"/>${AV_TEXT(initial(name))}</svg>`,
  bot: (name: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><rect x=".75" y=".75" width="16.5" height="16.5" rx="4" fill="#2A2A28" stroke="#9C9A93" stroke-width="1.5"/>${AV_TEXT(initial(name))}</svg>`,
  agent:
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><rect x=".75" y=".75" width="16.5" height="16.5" rx="4" fill="#2A2A28" stroke="#C9C7C0" stroke-width="1.5"/><rect x="4.5" y="6" width="9" height="7" rx="2" fill="none" stroke="#C9C7C0" stroke-width="1.3"/><circle cx="7.3" cy="9.5" r="1" fill="#C9C7C0"/><circle cx="10.7" cy="9.5" r="1" fill="#C9C7C0"/><path d="M9 6V4" stroke="#C9C7C0" stroke-width="1.3" stroke-linecap="round"/></svg>',
}
// An author's real GitHub picture, redrawn by the round as 16×16 cells (avatars.mjs): the
// surface's Svg drops embedded images, so the pane draws the cells themselves.
export const MOSAIC = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges">${paths}</svg>`

const RGB = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
export const rgba = (h: string, a: number) => `rgba(${RGB(h).join(',')},${a})`
// a banner's fill
export const TINT = 0.07

const S = (w: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="16" viewBox="0 0 ${w} 16">${body}</svg>`
const st = (c: string, w = 1.5) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`

export const I = {
  pr: (c: string) =>
    S(
      16,
      `<circle cx="4" cy="3.5" r="1.75" ${st(c)}/><circle cx="4" cy="12.5" r="1.75" ${st(c)}/><circle cx="12" cy="12.5" r="1.75" ${st(c)}/><path d="M4 5.25v5.5M12 10.75V6.5a2 2 0 0 0-2-2H7.5M9 3 7.5 4.5 9 6" ${st(c)}/>`,
    ),
  // how a PR stands in a run: queued, Argos at work (it turns where the surface animates), done,
  // failed; the words beside them say the same
  queued: S(16, `<circle cx="8" cy="8" r="4.5" ${st(HEX.grey, 1.5)}/>`),
  spin: S(
    16,
    `<g><circle cx="8" cy="8" r="5.5" fill="none" stroke="${HEX.brand}" stroke-opacity=".3" stroke-width="2"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" ${st(HEX.brand, 2)}/><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite"/></g>`,
  ),
  check: S(16, `<path d="M3.5 8.5l3 3 6-7" ${st(HEX.success, 1.8)}/>`),
  cross: S(16, `<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" ${st(HEX.error, 1.8)}/>`),
  error: S(16, `<circle cx="8" cy="8" r="7" fill="${HEX.error}"/><path d="M8 4.4v4.4" ${st(HEX.bg, 1.8)}/><circle cx="8" cy="11.4" r="1" fill="${HEX.bg}"/>`),
}

// The validator's star, in purple like the Argos mark: filled when validated, dashed while it
// runs, a grey outline once new commits make it old, a dim solid star when never run.
const STAR = 'M8 1.5 9.7 6.3 14.5 8 9.7 9.7 8 14.5 6.3 9.7 1.5 8 6.3 6.3Z'
export const STARS = {
  done: S(16, `<path d="${STAR}" fill="${HEX.brand}"/>`),
  run: S(16, `<path d="${STAR}" fill="none" stroke="${HEX.brand}" stroke-width="1.3" stroke-linejoin="round" stroke-dasharray="2 1.6"/>`),
  stale: S(16, `<path d="${STAR}" fill="none" stroke="${HEX.grey}" stroke-width="1.3" stroke-linejoin="round"/>`),
  none: S(16, `<path d="${STAR}" fill="${HEX.meter}"/>`),
}

// A verdict as drawn on a line: its SVG, a count after it as text in its colour. `text` stands
// in where no Svg is drawn; `tip` is what it means, shown on hover.
export type Tag = { k: 'sig'; svg?: string; w: number; count?: string; color?: string; text: string; tip?: string }

// An icon with its meaning: the tip as the SVG's <title>, which the surface shows on hover
// when the Svg is drawn interactive.
const escTip = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const titled = (svg: string, tip?: string) => (tip ? svg.replace(/^(<svg[^>]*>)/, `$1<title>${escTip(tip)}</title>`) : svg)
