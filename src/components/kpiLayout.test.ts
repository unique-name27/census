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
