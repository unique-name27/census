import { describe, expect, it } from 'vitest'
import { metricsWith } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { M } from '../metrics'
import { buildBase, isUsPerson, jurisdictionsOf } from './base'
import { computeI9 } from './i9'
import { emp, fixtureContext, rtw } from './testkit'

// As of Wed 30 Sep 2026. Section 2 is due three business days after the start.
const P1 = emp({ name: 'P1', hireDate: '2026-09-28' })
const P2 = emp({ name: 'P2', hireDate: '2026-09-25' })
const P3 = emp({ name: 'P3', hireDate: '2026-06-01' })
const P4 = emp({ name: 'P4', hireDate: '2026-06-01' })
const P5 = emp({ name: 'P5', hireDate: '2026-05-04' })
const P6 = emp({ name: 'P6', hireDate: '2026-05-04', location: 'Munich', country: 'Germany' })
const P7 = emp({ name: 'P7', hireDate: '2026-05-04', employmentType: 'Contractor' })
const P8 = emp({ name: 'P8', hireDate: '2025-06-02' })
const P9 = emp({ name: 'P9', hireDate: '2026-04-01', location: 'Austin' })
const employees = [P1, P2, P3, P4, P5, P6, P7, P8, P9]
const rightToWork = [
  rtw(P1, { i9Section1Date: '2026-09-28', i9Section2Date: '2026-09-29' }),
  rtw(P2),
  rtw(P3, { i9Section1Date: '2026-06-02', i9Section2Date: '2026-06-05' }),
  rtw(P4),
  rtw(P5, { i9Section2Date: '2026-05-07' }),
  rtw(P6),
  rtw(P7, { i9Section2Date: '2026-05-20' }),
  rtw(P8, { i9Section2Date: '2025-06-03' }),
  rtw(P9, { i9Section2Date: '2026-04-01' }),
]

function i9(metrics?: MetricsApi) {
  const ctx = fixtureContext({ employees, rightToWork }, { metrics })
  return computeI9(buildBase(ctx), ctx.window, ctx.prior)
}
const names = (xs: readonly { e: { name: string } }[]) => xs.map((x) => x.e.name).sort()

describe('I-9 Section 2 within 3 business days', () => {
  it('judges US employee starts in the period once the deadline has passed or Section 2 is done', () => {
    const m = i9()
    // P2's deadline is today and nothing is recorded yet: not judged. Munich and contractors never count.
    expect(names(m.current.judged)).toEqual(['P1', 'P3', 'P4', 'P5', 'P9'])
    expect(names(m.current.onTime)).toEqual(['P1', 'P5', 'P9'])
    expect(m.current.rate).toBe(0.6)
    expect(names(m.prior.judged)).toEqual(['P8'])
    expect(m.prior.rate).toBeNull()
  })

  it('counts business days, so a Friday start is due on Wednesday', () => {
    const m = i9()
    const p3 = m.current.judged.find((x) => x.e.name === 'P3')!
    expect(p3.deadline).toBe('2026-06-04')
    expect(p3.businessDays).toBe(4)
    expect(p3.onTime).toBe(false)
  })

  it('lists people still here whose Section 2 is past due and not done', () => {
    expect(names(i9().open)).toEqual(['P4'])
  })

  it('shows sites, hiding a rate under the anonymity minimum', () => {
    const sites = i9().bySite
    expect(sites.map((r) => [r.site, r.judged, r.late, r.rate])).toEqual([
      ['San Jose', 4, 2, null],
      ['Austin', 1, 0, null],
    ])
  })

  it('measures Section 1 against the start date', () => {
    const s1 = i9().section1
    expect(s1.judged).toHaveLength(5)
    expect(names(s1.onTime)).toEqual(['P1'])
    expect(s1.rate).toBe(0.2)
  })

  it('reads the business days allowed from the dictionary', () => {
    const m = i9(metricsWith({ [M.i9Section2]: { businessDays: 5 } }))
    expect(names(m.current.onTime)).toEqual(['P1', 'P3', 'P5', 'P9'])
    expect(m.current.rate).toBe(0.8)
  })
})

describe('sites and jurisdictions', () => {
  it('knows US sites, and falls back to the country for an unknown site', () => {
    expect(isUsPerson({ location: 'Austin', country: 'United States' })).toBe(true)
    expect(isUsPerson({ location: 'Munich', country: 'Germany' })).toBe(false)
    expect(isUsPerson({ location: 'Remote', country: 'United States' })).toBe(true)
    expect(jurisdictionsOf({ location: 'San Jose', country: 'United States' })).toEqual(['us', 'us-ca'])
    expect(jurisdictionsOf({ location: 'Bengaluru', country: 'India' })).toEqual(['in'])
    expect(jurisdictionsOf({ location: 'Remote', country: 'Canada' })).toEqual(['ca'])
    expect(jurisdictionsOf({ location: 'Remote', country: 'France' })).toEqual([])
  })
})
