import { describe, expect, it } from 'vitest'
import type { ExportMeta } from '@/charts/types'
import { orgSlideText } from './slideFooter'

const meta: ExportMeta = {
  view: 'Org chart',
  scope: 'Whole company',
  window: 'Last 12 months',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
  standard: 'bronze',
}
const plan = { subtitle: 'Ana Ruiz and her direct org', note: '' }

describe('org slide footer', () => {
  it('states the data standard and the org chart tier on every slide', () => {
    const t = orgSlideText(plan, meta, 3, { tier: 'gold' })
    expect(t.left).toEqual([
      'Company confidential · Sample data',
      'Data standard: Everything (bronze and up) · Tier: Gold',
    ])
    expect(t.right).toBe('Census · Org chart · Whole company · As of 30 Sep 2026  ·  3')
    expect(t.notes).toContain('Data standard: Everything (bronze and up) · Tier: Gold')
  })

  it('says when the standard holds the chart back', () => {
    const t = orgSlideText(plan, { ...meta, standard: 'gold' }, 1, { tier: 'silver', withheld: true })
    expect(t.left[1]).toBe(
      'Data standard: Production (gold only) · Tier: Silver, not shown under this standard',
    )
  })

  it('keeps the slide note first and leaves out a data line nobody set', () => {
    const t = orgSlideText({ ...plan, note: 'Shows direct reports.' }, { ...meta, standard: undefined }, 1)
    expect(t.left).toEqual(['Shows direct reports.'])
    expect(t.notes).toBe(
      'Ana Ruiz and her direct org\nShows direct reports.\nCompany confidential · Sample data',
    )
  })
})
