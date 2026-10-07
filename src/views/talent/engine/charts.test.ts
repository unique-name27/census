/**
 * The Talent charts added in the design refresh: each number recounts from the raw rows, each mark
 * opens exactly what it counts, and shares over fewer people than the anonymity minimum are null.
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import type { SuccessionPlan } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { isActiveAt, isEmployee, monthPoints } from '@/lib/people'
import { buildBase } from './base'
import {
  annualCycles,
  overdueMonthDrill,
  overdueTrend,
  ratingByReviewer,
  ratingChange,
  ratingChangeDrill,
  reviewerDrill,
  successionExposure,
} from './charts'
import { computeTalent } from './index'
import { computeSuccession } from './succession'
import { AS_OF, course, ctxFor, emp, review, sourcesFor } from './test-fixtures'

const plan = (
  o: Partial<SuccessionPlan> & Pick<SuccessionPlan, 'roleId' | 'incumbentId'>,
): SuccessionPlan => ({
  roleTitle: `Role ${o.roleId}`,
  criticality: 'Critical',
  successorId: null,
  readiness: null,
  incumbentRiskOfLoss: 'Low',
  ...o,
})

describe('succession exposure', () => {
  const employees = [
    ...['I1', 'I2', 'I3', 'I4', 'I5'].map((id) => emp(id, { level: 'M2' })),
    emp('S1', { level: 'M1' }),
    emp('S2', { level: 'M1', terminationDate: '2026-05-01', terminationType: 'Voluntary' }),
  ]
  const succession = [
    plan({
      roleId: 'R1',
      incumbentId: 'I1',
      successorId: 'S1',
      readiness: 'Ready now',
      incumbentRiskOfLoss: 'High',
    }),
    // The only successor left: no successor.
    plan({
      roleId: 'R2',
      incumbentId: 'I2',
      successorId: 'S2',
      readiness: 'Ready now',
      incumbentRiskOfLoss: 'High',
    }),
    plan({ roleId: 'R3', incumbentId: 'I3', incumbentRiskOfLoss: 'High' }),
    plan({ roleId: 'R4', incumbentId: 'I4', criticality: 'Key', incumbentRiskOfLoss: 'High' }),
    plan({ roleId: 'R5', incumbentId: 'I5', incumbentRiskOfLoss: null }),
  ]
  const ctx = ctxFor({ employees, succession })
  const base = buildBase(ctx)
  const roles = computeSuccession(base, new Map()).roles

  it('counts roles by risk of loss and best successor still employed', () => {
    const ex = successionExposure(roles, 'All')
    const at = (readiness: string, risk: string) =>
      ex.cells.find((c) => c.readiness === readiness && c.risk === risk)!
    expect(ex.total).toBe(5)
    expect(at('Ready now', 'High').roles).toBe(1)
    expect(at('No successor', 'High').roles).toBe(3)
    expect(at('No successor', 'Not rated').roles).toBe(1)
    expect(ex.exposed).toBe(3)
    expect(ex.notRated).toBe(1)
    // Every cell, zeros included, and the counts add up.
    expect(ex.cells).toHaveLength(16)
    expect(ex.cells.reduce((a, c) => a + c.roles, 0)).toBe(5)
  })

  it('counts critical roles only when asked', () => {
    const ex = successionExposure(roles, 'Critical')
    expect(ex.total).toBe(4)
    expect(ex.exposed).toBe(2)
  })

  it('opens one plan row per role in the cell', () => {
    const m = computeTalent(ctx)
    const cell = m.charts.exposure.All.cells.find((c) => c.readiness === 'No successor' && c.risk === 'High')!
    const spec = resolveDrill(m.drill.roles(cell.list, 'x'))!
    expect(spec.kind).toBe('succession')
    expect(spec.rows).toHaveLength(3)
  })
})

describe('rating change since the last annual cycle', () => {
  const ids = Array.from({ length: 9 }, (_, i) => `P${i + 1}`)
  const employees = [...ids.map((id) => emp(id)), emp('X1')]
  // Prior annual: 6 people at 3, 3 at 4. Latest: of the 3s, 4 stay, 2 rise; of the 4s, 1 falls to 2.
  const prior = [3, 3, 3, 3, 3, 3, 4, 4, 4]
  const latest = [3, 3, 3, 3, 4, 5, 4, 4, 2]
  const reviews = [
    ...ids.map((id, i) => review(id, '2024 Annual', '2024-12-15', prior[i], { potential: 'Moderate' })),
    ...ids.map((id, i) => review(id, '2025 Annual', '2025-12-15', latest[i], { potential: 'Moderate' })),
    // A mid-year cycle in between is not an annual cycle.
    ...ids.map((id) => review(id, '2025 Mid-year', '2025-06-30', 5)),
    // Rated only in the latest annual cycle: not counted.
    review('X1', '2025 Annual', '2025-12-15', 3, { potential: 'Moderate' }),
  ]
  const ctx = ctxFor({ employees, reviews })
  const base = buildBase(ctx)
  const rc = ratingChange(base)
  const cell = (p: number, v: number) => rc.cells.find((c) => c.priorRating === p && c.latestRating === v)!

  it('picks the last two annual cycles', () => {
    expect(annualCycles(base).map((c) => c.cycle)).toEqual(['2024 Annual', '2025 Annual'])
    expect(rc.prior?.cycle).toBe('2024 Annual')
    expect(rc.latest?.cycle).toBe('2025 Annual')
  })

  it('counts people rated in both, by earlier and later rating', () => {
    expect(rc.people).toBe(9)
    expect(cell(3, 3).people).toBe(4)
    expect(cell(3, 4).people).toBe(1)
    expect(cell(3, 5).people).toBe(1)
    expect(cell(4, 2).people).toBe(1)
    expect([rc.same, rc.up, rc.down]).toEqual([6, 2, 1])
    expect(rc.cells).toHaveLength(25)
  })

  it('hides the row share when the earlier rating has fewer than 5 people', () => {
    expect(cell(3, 3).rowShare).toBeCloseTo(4 / 6, 10)
    expect(cell(4, 4).people).toBe(2)
    expect(cell(4, 4).rowShare).toBeNull()
  })

  it('opens one latest review per person in the cell, with the earlier rating beside it', () => {
    const spec = ratingChangeDrill(base, rc, cell(3, 3))!
    expect(spec.kind).toBe('reviews')
    expect(spec.rows).toHaveLength(4)
    expect(spec.rows.every((r) => r.cycle === '2025 Annual')).toBe(true)
    expect(spec.extra?.values(spec.rows[0])).toEqual({ priorRating: 3, ratingChange: 'Same' })
    expect(ratingChangeDrill(base, rc, cell(1, 1))).toBeNull()
  })
})

describe('share rated 4-5 by reviewer', () => {
  const mgrA = emp('MA', { name: 'Ana Ruiz', businessUnit: 'Go-to-Market', level: 'M1' })
  const mgrB = emp('MB', { name: 'Ben Ito', businessUnit: 'Engineering', level: 'M1' })
  const mgrC = emp('MC', { name: 'Cy Park', businessUnit: 'Engineering', level: 'M1' })
  const a = Array.from({ length: 6 }, (_, i) => emp(`A${i}`))
  const b = Array.from({ length: 5 }, (_, i) => emp(`B${i}`))
  const c = Array.from({ length: 3 }, (_, i) => emp(`C${i}`))
  const cyc = (id: string, rating: number, reviewerId: string) =>
    review(id, '2026 Mid-year', '2026-06-30', rating, { reviewerId })
  const reviews = [
    ...a.map((e, i) => cyc(e.employeeId, i < 4 ? 4 : 3, 'MA')),
    ...b.map((e, i) => cyc(e.employeeId, i < 1 ? 5 : 3, 'MB')),
    ...c.map((e) => cyc(e.employeeId, 5, 'MC')),
  ]
  const ctx = ctxFor({ employees: [mgrA, mgrB, mgrC, ...a, ...b, ...c], reviews })
  const base = buildBase(ctx)
  const r = ratingByReviewer(base, base.latest)

  it('places each reviewer with enough people rated, and leaves the rest out', () => {
    expect(r.dots.map((d) => d.reviewer)).toEqual(['Ana Ruiz', 'Ben Ito'])
    expect(r.dots[0]).toMatchObject({ businessUnit: 'Go-to-Market', rated: 6, high: 4 })
    expect(r.dots[0].share).toBeCloseTo(4 / 6, 10)
    expect(r.dots[1].share).toBeCloseTo(1 / 5, 10)
    expect(r.left).toBe(1)
    expect(r.units).toEqual(['Go-to-Market', 'Engineering'])
  })

  it('marks a reviewer only when the share is further from the guideline than chance explains', () => {
    // 4 of 6 against a 35% guideline is within two standard errors for six people.
    expect(r.dots.map((d) => d.unusual)).toEqual([false, false])
    const d = Array.from({ length: 20 }, (_, i) => emp(`D${i}`))
    const mgrD = emp('MD', { name: 'Dee Lim', businessUnit: 'Engineering', level: 'M1' })
    const all = ctxFor({
      employees: [mgrD, ...d],
      reviews: d.map((e) => review(e.employeeId, '2026 Mid-year', '2026-06-30', 5, { reviewerId: 'MD' })),
    })
    const ab = buildBase(all)
    expect(ratingByReviewer(ab, ab.latest).dots[0].unusual).toBe(true)
  })

  it('opens exactly the reviews behind a dot', () => {
    const spec = reviewerDrill(base, r, r.dots[0])!
    expect(spec.rows).toHaveLength(6)
    expect(spec.rows.every((x) => x.reviewerId === 'MA')).toBe(true)
  })

  it('says so when no review names a reviewer', () => {
    const none = ctxFor({
      employees: a,
      reviews: a.map((e) => review(e.employeeId, '2026 Mid-year', '2026-06-30', 3)),
    })
    const nb = buildBase(none)
    const x = ratingByReviewer(nb, nb.latest)
    expect(x.hasReviewer).toBe(false)
    expect(x.dots).toEqual([])
  })
})

describe('required training overdue at each month end', () => {
  const employees = [
    emp('E1'),
    emp('E2'),
    emp('E3', { terminationDate: '2026-09-10', terminationType: 'Voluntary' }),
    emp('C1', { employmentType: 'Contractor' }),
  ]
  const learning = [
    // Due 26 Aug, finished 15 Sep: overdue at the end of August only.
    course('E1', 'Export control', { completedDate: '2026-09-15' }),
    // Never finished: overdue at the end of August and September.
    course('E2', 'Export control'),
    // Left on 10 Sep: overdue at the end of August, not counted at the end of September.
    course('E3', 'Code of conduct'),
    // Contractors are not counted.
    course('C1', 'Code of conduct'),
    // Optional training is not counted.
    course('E2', 'Python', { required: false }),
  ]
  const ctx = ctxFor({ employees, learning })
  const base = buildBase(ctx)
  const t = overdueTrend(base)
  const total = (month: string) => t.totals.find((x) => x.month === month)!.overdue

  it('recounts the assignments overdue at each month end', () => {
    expect(t.totals.map((x) => x.date)).toEqual(monthPoints(AS_OF, 12))
    expect(total('2026-07')).toBe(0)
    expect(total('2026-08')).toBe(3)
    expect(total('2026-09')).toBe(1)
    expect(t.courses).toEqual(['Export control', 'Code of conduct'])
  })

  it('ends on the overdue-now count', () => {
    const m = computeTalent(ctx)
    expect(t.totals.at(-1)!.overdue).toBe(m.learning.overdue.length)
  })

  it('opens the assignments behind a segment and a whole month', () => {
    expect(overdueMonthDrill(base, t, '2026-08', 'Export control')!.rows).toHaveLength(2)
    expect(overdueMonthDrill(base, t, '2026-08', null)!.rows).toHaveLength(3)
    expect(overdueMonthDrill(base, t, '2026-07', null)).toBeNull()
  })

  it('folds the smaller courses into Other past the first five', () => {
    const many = Array.from({ length: 8 }, (_, i) => course('E2', `Course ${i}`))
    const x = overdueTrend(buildBase(ctxFor({ employees, learning: many })))
    expect(x.courses).toHaveLength(6)
    expect(x.courses.at(-1)).toBe('Other (3)')
    expect(x.folded).toHaveLength(3)
    const sep = x.rows.filter((r) => r.month === '2026-09')
    expect(sep.reduce((a, r) => a + r.overdue, 0)).toBe(8)
  })
})

describe('on the sample company', () => {
  const data = generateSample()
  const ctx = buildContext({
    data,
    sources: sourcesFor(data, 'sample'),
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
  })
  const m = computeTalent(ctx)

  it('finds the four exposed roles: high risk of loss, no successor', () => {
    const ex = m.charts.exposure.All
    const cell = ex.cells.find((c) => c.readiness === 'No successor' && c.risk === 'High')!
    expect(cell.list.map((r) => r.roleId).sort()).toEqual(['SP-001', 'SP-002', 'SP-003', 'SP-004'])
    expect(ex.total).toBe(m.succession.roles.length)
  })

  it('recounts the rating change from the raw reviews', () => {
    const rc = m.charts.ratingChange
    expect([rc.prior?.cycle, rc.latest?.cycle]).toEqual(['2024 Annual', '2025 Annual'])
    const before = new Map(
      data.reviews.filter((r) => r.cycle === '2024 Annual').map((r) => [r.employeeId, Math.round(r.rating)]),
    )
    const both = data.reviews.filter((r) => r.cycle === '2025 Annual' && before.has(r.employeeId))
    expect(rc.people).toBe(both.length)
    for (const c of rc.cells) {
      const n = both.filter(
        (r) => before.get(r.employeeId) === c.priorRating && Math.round(r.rating) === c.latestRating,
      ).length
      expect(c.people, `${c.prior} to ${c.latest}`).toBe(n)
      expect(ratingChangeDrill({ ctx }, rc, c)?.rows.length ?? 0).toBe(n)
    }
  })

  it('places Go-to-Market reviewers to the right of the guideline', () => {
    const b = m.charts.byReviewer
    expect(b.dots.length).toBeGreaterThan(20)
    expect(b.dots.every((d) => d.rated >= m.settings.minGroup)).toBe(true)
    const gtm = b.dots.filter((d) => d.businessUnit === 'Go-to-Market')
    const rest = b.dots.filter((d) => d.businessUnit !== 'Go-to-Market')
    const avg = (xs: typeof b.dots) => xs.reduce((a, d) => a + d.share, 0) / xs.length
    expect(avg(gtm)).toBeGreaterThan(m.settings.highGuideline)
    expect(avg(gtm)).toBeGreaterThan(avg(rest))
    for (const d of b.dots)
      expect(reviewerDrill({ ctx, settings: m.settings }, b, d)?.rows.length).toBe(d.rated)
  })

  it('recounts overdue training at each month end and peaks after the August campaign', () => {
    const t = m.charts.overdueTrend
    for (const p of t.totals) {
      const n = data.learning.filter((l) => {
        if (!l.required || !l.dueDate || l.dueDate >= p.date) return false
        if (l.completedDate && l.completedDate <= p.date) return false
        const e = ctx.org.byId.get(l.employeeId)
        return !!e && isEmployee(e) && isActiveAt(e, p.date)
      }).length
      expect(p.overdue, p.date).toBe(n)
      expect(overdueMonthDrill({ ctx }, t, p.month, null)?.rows.length ?? 0).toBe(n)
    }
    const peak = t.totals.reduce((a, b) => (b.overdue > a.overdue ? b : a))
    expect(peak.month).toBe('2026-08')
    expect(t.totals.at(-1)!.overdue).toBe(m.learning.overdue.length)
  })
})
