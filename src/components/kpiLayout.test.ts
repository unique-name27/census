/**
 * KPI tiles on phones (docs/DESIGN-REFRESH.md 5.2, "KPI values aligned"): in a two-up row one
 * tile's value and trend could wrap while its neighbour's did not, which pushed the neighbour's
 * value 28px down its shared subgrid track. The value row packs its lines to the top and phones
 * always stack the trend under the value, so every tile in a row has the same structure. Checked
 * in the browser at 375 (no DOM library here); this keeps the classes from drifting.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./KpiStrip.tsx', import.meta.url)), 'utf8')

describe('KPI value row', () => {
  const row = /ROW\.value,\s*'([^']+)'/.exec(src)?.[1] ?? ''

  it('packs wrapped lines to the top of the shared track', () => {
    expect(row).toContain('content-start')
  })

  it('stacks the value and its trend on phones', () => {
    expect(row).toContain('max-sm:flex-col')
    expect(row).toContain('max-sm:items-start')
  })
})

/**
 * KPI labels in narrow tiles (about 160px: six tiles in a 1005px area with Ask docked, or two a
 * row on phones): the label shrank to about 53px beside the tier medal and broke words in the
 * middle ("Decline d offers"). Labels wrap at spaces only and keep their longest word whole; the
 * medal and info button wrap under the label instead. Checked in the browser at 1005 and 375.
 */
describe('KPI label row', () => {
  const row = /ROW\.label,\s*'([^']+)'/.exec(src)?.[1] ?? ''
  const labels = [...src.matchAll(/className="([^"]*text-meta[^"]*text-ink-2[^"]*)"/g)].map((m) => m[1])

  it('lets the medal and info button wrap under the label', () => {
    expect(row).toContain('flex-wrap')
    expect(src).toMatch(/className="ml-auto flex shrink-0/)
  })

  it('never breaks a label word in the middle', () => {
    expect(labels.length).toBeGreaterThanOrEqual(2)
    for (const c of labels) {
      expect(c).not.toMatch(/\bbreak-(words|all)\b/)
      expect(c).toContain('break-normal')
      // The label is never narrower than its longest word.
      expect(c).toContain('min-w-min')
      expect(c).not.toMatch(/\bmin-w-0\b/)
    }
  })
})
