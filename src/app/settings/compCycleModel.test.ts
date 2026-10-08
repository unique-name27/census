/**
 * Settings > Compensation cycle (docs/ROLES-V2.md 4.6 and "Decisions made"): the cycle's dates are
 * set in the section in every mode that shows it, Compensation mode included (no Data room), and
 * a date set there is the one Compensation's items read (`cycleDatesOf`).
 */
import { describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { metricsApi } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { COMP_CYCLE, cycleDatesOf } from '@/metrics/compCycle'
import { applyEdit, EMPTY_METRICS } from '@/metrics/overrides'
import { compCycleIntro, compCycleRows, cycleDateEdit } from './compCycleModel'

const api = metricsApi(EMPTY_METRICS)
const close = (rows: ReturnType<typeof compCycleRows>) =>
  rows.find((r) => r.key === COMP_CYCLE.closeDate.key)!

describe('Compensation cycle in Settings', () => {
  it('shows the section in Compensation mode, which has no Data room', () => {
    const comp = accessFor('compensation')
    expect(comp.can('settings:compensation')).toBe(true)
    expect(comp.can('page:data')).toBe(false)
  })

  it('sets the dates in the section and keeps the other settings in Metric definitions', () => {
    const inComp = compCycleRows(api, false)
    const dates = inComp.filter((r) => r.edit === 'inline').map((r) => r.key)
    expect(dates).toEqual(['openDate', 'calibrationDate', 'closeDate', 'effectiveDate', 'eligibleHiredBy'])
    expect(inComp.filter((r) => r.edit !== 'inline').every((r) => r.edit === 'read-only')).toBe(true)
    // Where the Data room shows, the other settings open it.
    expect(
      compCycleRows(api, true)
        .filter((r) => r.edit !== 'inline')
        .every((r) => r.edit === 'link'),
    ).toBe(true)
    expect(close(inComp)).toMatchObject({ date: '', text: 'Not set' })
    expect(compCycleIntro(false)).toContain('change them in HR mode')
    expect(compCycleIntro(true)).not.toContain('HR mode')
  })

  it('applies a date typed there to the dictionary, where Compensation reads it, and clears it', () => {
    const row = close(compCycleRows(api, false))
    const set = cycleDateEdit(row, '2026-10-30')
    if (!set.ok) throw new Error(set.error)
    expect(set.done).toBe('Cycle closes: 30 Oct 2026')
    const r = applyEdit(EMPTY_METRICS, CATALOG, set.edit, { by: 'Test' })
    if (!r.ok) throw new Error(r.error)
    const after = metricsApi(r.state)
    expect(cycleDatesOf(after).close).toBe('2026-10-30')
    expect(close(compCycleRows(after, false))).toMatchObject({ date: '2026-10-30', changed: true })

    const clear = cycleDateEdit(row, '')
    if (!clear.ok) throw new Error(clear.error)
    expect(clear.done).toBe('Cycle closes: not set')
    const back = applyEdit(r.state, CATALOG, clear.edit, { by: 'Test' })
    if (!back.ok) throw new Error(back.error)
    expect(cycleDatesOf(metricsApi(back.state)).close).toBeNull()
  })

  it('refuses a value that is not a date', () => {
    const e = cycleDateEdit(close(compCycleRows(api, false)), '30/10/26x')
    expect(e.ok).toBe(false)
  })
})
