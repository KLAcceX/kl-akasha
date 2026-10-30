// Pure helpers for the Argos pane: PR age, signal tests and the age chart.
// No mod runtime here, so Node can import this file to preview the chart.
import type { Item } from '../types'

export const DAY = 864e5
export const base = (code: string) => code.split(':')[0]
export const has = (p: Item, ...codes: string[]) => p.signals.some(s => codes.includes(base(s)))
// Signals that block a PR: shown with ▲ (never colour alone) and ringed in the chart.
export const ALERT = new Set(['conflict', 'ci_failed', 'changes_requested'])
export const stuck = (p: Item) => has(p, 'conflict', 'ci_failed', 'changes_requested', 'late', 'no_review')

export const days = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY))

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

// The signature: one dot per open PR in five age columns. Light = for you, lilac = a teammate's
// PR with a signal, purple = a teammate's without; ringed = stuck. At most 16 dots, then +n.
const MAX_DOTS = 16
const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// The chart grows with its fullest column (up to 4 rows), so a few PRs never sit in an empty box.
export const ageRows = (b: Item[][]) => Math.max(1, Math.ceil(Math.min(MAX_DOTS, Math.max(0, ...b.map(c => c.length))) / 4))
export const ageHeight = (b: Item[][]) => 12 + ageRows(b) * 13 + 32
export function ageDots(b: Item[][], labels: string[], now: number) {
  const rows = ageRows(b)
  const h = ageHeight(b)
  const floor = 12 + rows * 13 - 6
  const cols = b.map((col, i) => {
    const x0 = i * 60
    const shown = col.slice(0, MAX_DOTS)
    const dots = shown.map((p, j) => {
      const fill = p.kind !== 'other' ? '#F3EEFB' : p.signals.length ? '#A98BE0' : '#7E5CC0'
      const ring = stuck(p) ? ` stroke="#E5384A" stroke-width="2"` : ''
      // each row is centred over the column's count and label
      const inRow = Math.min(4, shown.length - Math.floor(j / 4) * 4)
      const cx = x0 + 30 - ((inRow - 1) * 13) / 2 + (j % 4) * 13
      return `<circle cx="${cx}" cy="${floor - Math.floor(j / 4) * 13}" r="4.5" fill="${fill}"${ring}><title>#${p.number} · ${days(p.createdAt, now)}d</title></circle>`
    })
    const empty = col.length ? '' : `<line x1="${x0 + 22}" y1="${floor}" x2="${x0 + 38}" y2="${floor}" stroke="#51408A" stroke-width="2" stroke-linecap="round"/>`
    const more = col.length > MAX_DOTS ? `<text x="${x0 + 56}" y="10" font-size="10" fill="#F3EEFB" text-anchor="end">+${col.length - MAX_DOTS}</text>` : ''
    const count = `<text x="${x0 + 30}" y="${h - 18}" font-size="12" font-weight="700" fill="${col.length ? '#F3EEFB' : '#51408A'}" text-anchor="middle">${col.length}</text>`
    return `${dots.join('')}${empty}${more}${count}<text x="${x0 + 30}" y="${h - 4}" font-size="10" fill="#A98BE0" text-anchor="middle">${xml(labels[i])}</text>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 ${h}" font-family="system-ui, -apple-system, Segoe UI, sans-serif"><rect width="300" height="${h}" rx="10" fill="#1E1430"/>${cols.join('')}</svg>`
}
// The same chart as text for surfaces without Svg: ● for you, ○ for the team.
export const ageText = (b: Item[][], labels: string[]) =>
  b
    .map((col, i) => `${labels[i]} ${col.slice(0, MAX_DOTS).map(p => (p.kind !== 'other' ? '●' : '○')).join('')}${col.length > MAX_DOTS ? ` +${col.length - MAX_DOTS}` : ''}`)
    .join('  ')

