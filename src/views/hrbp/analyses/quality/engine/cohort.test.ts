/**
 * Quality of hire's definitions on hand-built hires (docs/ANALYSES.md, 2.2 and 7.1): the cohort
 * window, the first full review, both performance scorings, the retention outcome and every row
 * of the scoring table, the weights, intervals and the "clearly" test, the expected score with
 * its fallback, the university fold and the drills.
 */
import { describe, expect, it } from 'vitest'
import { readUniversity, universityNames } from '@/data/lists/universities'
import type { Employee, Review } from '@/data/schema'
import { metricsWith } from '@/metrics/testing'
import { ctxOf, emp, review } from '@/views/hrbp/engine/fixtures'
import { cellsOf, type Hire } from './cohort'
import { HIRE_COLUMNS, hiresSpec } from './drill'
import { CUTS, scoreGroup } from './groups'
import { QID, QSET } from './metrics'
import { type QualityModel, qualityModel } from './model'
import { qualitySettings } from './settings'
import { clearly, meanInterval, mixBenchmark } from './stats'

/** A hire on `hireDate` with a fresh id. */
let n = 0
const hire = (hireDate: string, patch: Partial<Employee> = {}): Employee =>
  emp({ employeeId: `Q${String(++n).padStart(4, '0')}`, name: `Hire ${n}`, hireDate, ...patch })

/** Someone who left long ago, so the roster has termination dates (retention is known). */
const oldLeaver = () => hire('2015-01-05', { terminationDate: '2016-01-05', terminationType: 'Voluntary' })

const model = (
  employees: Employee[],
  reviews: Review[] = [],
  params: Parameters<typeof metricsWith>[0] = {},
): QualityModel =>
  qualityModel(ctxOf({ employees: [...employees, oldLeaver()], reviews }, {}, undefined, metricsWith(params)))

const byId = (m: QualityModel, e: Employee): Hire | undefined => m.hires.find((h) => h.e === e)

describe('the cohort', () => {
  it('holds employees hired in the 24 months ending 12 months before the as-of date', () => {
    const last = hire('2025-09-30')
    const elevenMonths = hire('2025-10-31')
    const first = hire('2023-10-01')
    const before = hire('2023-09-30')
    const contractor = hire('2024-05-06', { employmentType: 'Contractor' })
    const intern = hire('2024-05-06', { employmentType: 'Intern' })
    // A recent early leaver is out, even though their outcome is known: their stayers are not.
    const recentLeaver = hire('2026-01-05', { terminationDate: '2026-03-02', terminationType: 'Voluntary' })
    const m = model([last, elevenMonths, first, before, contractor, intern, recentLeaver])
    expect(m.hires.map((h) => h.e)).toEqual([first, last])
    expect(m.window).toEqual({ start: '2023-10-01', end: '2025-09-30' })
    expect(m.windowText).toBe('1 Oct 2023 to 30 Sep 2025')
  })

  it('follows the hire window and retention window settings', () => {
    const a = hire('2024-12-02')
    const b = hire('2025-12-01')
    expect(model([a, b]).hires.map((h) => h.e)).toEqual([a])
    const shorter = model([a, b], [], { [QID.score]: { retentionMonths: 6, cohortMonths: 12 } })
    expect(shorter.window).toEqual({ start: '2025-04-01', end: '2026-03-31' })
    expect(shorter.hires.map((h) => h.e)).toEqual([b])
  })
})

describe('the first full review', () => {
  it('is the earliest review at least 180 days after hire and within 24 months', () => {
    const a = hire('2024-09-02')
    const b = hire('2023-10-02')
    const reviews = [
      review(a.employeeId, '2024-12-15', 5), // 104 days: too early
      review(a.employeeId, '2025-06-30', 4),
      review(a.employeeId, '2025-12-15', 2),
      review(b.employeeId, '2025-12-15', 3), // more than 24 months after hire
      review(oldLeaver().employeeId, '2024-12-15', 3),
    ]
    const m = model([a, b], reviews)
    expect(byId(m, a)?.review?.cycleDate).toBe('2025-06-30')
    expect(byId(m, a)?.P).toBe(75)
    expect(byId(m, b)?.review).toBeNull()
    // The review rule follows its settings.
    const sooner = model([a, b], reviews, { [QID.score]: { firstReviewMinDays: 90 } })
    expect(byId(sooner, a)?.review?.cycleDate).toBe('2024-12-15')
    const longer = model([a, b], reviews, { [QID.score]: { firstReviewWithinMonths: 36 } })
    expect(byId(longer, b)?.review?.cycleDate).toBe('2025-12-15')
  })

  it('marks the earliest review on record when the Reviews data starts after the first eligible cycle', () => {
    const early = hire('2023-11-01')
    const later = hire('2024-09-02')
    const reviews = [review(early.employeeId, '2024-12-15', 3), review(later.employeeId, '2025-06-30', 3)]
    const m = model([early, later], reviews)
    expect(byId(m, early)?.earliestOnRecord).toBe(true)
    expect(byId(m, later)?.earliestOnRecord).toBe(false)
  })

  it('scores each rating on the scale, or as a percentile within its cycle', () => {
    const hs = [1, 2, 3, 4, 5].map(() => hire('2024-03-04'))
    const reviews = hs.map((h, i) => review(h.employeeId, '2024-12-15', i + 1))
    const scale = model(hs, reviews)
    expect(hs.map((h) => byId(scale, h)?.P)).toEqual([0, 25, 50, 75, 100])
    // Percentile: below + half of equal, over everyone rated in the cycle company-wide.
    const more = [hire('2024-03-04'), hire('2024-03-04'), hire('2024-03-04')]
    const cycle = [
      ...reviews,
      review(more[0].employeeId, '2024-12-15', 3),
      review(more[1].employeeId, '2024-12-15', 3),
      review(more[2].employeeId, '2024-12-15', 5),
    ]
    const pct = model([...hs, ...more], cycle, { [QID.score]: { scoring: 'percentile' } })
    // 8 rated: 1 (×1), 2 (×1), 3 (×3), 4 (×1), 5 (×2).
    expect(byId(pct, hs[0])?.P).toBeCloseTo((100 * 0.5) / 8, 10)
    expect(byId(pct, hs[2])?.P).toBeCloseTo((100 * (2 + 1.5)) / 8, 10)
    expect(byId(pct, hs[4])?.P).toBeCloseTo((100 * (6 + 1)) / 8, 10)
  })
})

describe('staying a year and the score', () => {
  const at = '2024-03-04'
  const left = (date: string, patch: Partial<Employee> = {}) =>
    hire(at, { terminationDate: date, terminationType: 'Voluntary', regrettable: false, ...patch })

  it('reads every outcome: stayed, each exit type, the mark itself, the second year and reductions in force', () => {
    const stayed = hire(at)
    const voluntary = left('2025-02-03')
    const involuntary = left('2025-02-03', { terminationType: 'Involuntary', regrettable: null })
    const onMark = left('2025-03-04')
    const regrettedLater = left('2025-09-01', { regrettable: true })
    const notRegrettedLater = left('2025-09-01')
    const rif = left('2024-09-02', {
      terminationType: 'Involuntary',
      terminationReason: 'Reduction in force',
    })
    const all = [stayed, voluntary, involuntary, onMark, regrettedLater, notRegrettedLater, rif]
    const m = model(all)
    const r = (e: Employee, mm = m) => [byId(mm, e)?.outcome, byId(mm, e)?.R]
    expect(r(stayed)).toEqual(['stayed', 100])
    expect(r(voluntary)).toEqual(['left', 0])
    expect(r(involuntary)).toEqual(['left', 0])
    expect(r(onMark)).toEqual(['left', 0])
    expect(r(regrettedLater)).toEqual(['secondYear', 0])
    expect(r(notRegrettedLater)).toEqual(['stayed', 100])
    expect(r(rif)).toEqual(['rif', null])
    const off = model(all, [], { [QID.score]: { regrettedSecondYear: false, rifExcluded: false } })
    expect(r(regrettedLater, off)).toEqual(['stayed', 100])
    expect(r(rif, off)).toEqual(['left', 0])
    // Under "any exit flagged regrettable" an involuntary regretted exit in year two counts too.
    const flagged = left('2025-09-01', { terminationType: 'Involuntary', regrettable: true })
    expect(r(flagged, model([flagged]))).toEqual(['stayed', 100])
    expect(r(flagged, model([flagged], [], { 'hrbp.attrition.regretted': { rule: 'anyFlagged' } }))).toEqual([
      'secondYear',
      0,
    ])
  })

  it('scores every row of the table in 2.2', () => {
    const ratedStayed = hire(at)
    const ratedLeft = left('2025-01-06')
    const leftBeforeReview = left('2024-07-01')
    const rifRated = left('2025-01-06', {
      terminationType: 'Involuntary',
      terminationReason: 'Reduction in force',
    })
    const rifUnrated = left('2024-07-01', {
      terminationType: 'Involuntary',
      terminationReason: 'Reduction in force',
    })
    const unrated = hire(at)
    const reviews = [
      review(ratedStayed.employeeId, '2024-12-15', 4),
      review(ratedLeft.employeeId, '2024-12-15', 2),
      review(rifRated.employeeId, '2024-12-15', 3),
    ]
    const m = model([ratedStayed, ratedLeft, leftBeforeReview, rifRated, rifUnrated, unrated], reviews)
    const q = (e: Employee) => byId(m, e)?.Q
    expect(q(ratedStayed)).toBe((75 + 100) / 2)
    expect(q(ratedLeft)).toBe((25 + 0) / 2)
    expect(q(leftBeforeReview)).toBe(0)
    expect(byId(m, leftBeforeReview)?.leftBeforeReview).toBe(true)
    expect(q(rifRated)).toBe(50)
    expect(q(rifUnrated)).toBeNull()
    expect(q(unrated)).toBeNull()
    expect(m.counts).toMatchObject({ cohort: 6, scored: 4, notScored: 2, leftBeforeReview: 1, rated: 3 })
    // Stayed a year counts every hire with a retention score, scored or not; reductions in force are out.
    expect(m.counts.retained).toBe(4)
    expect(m.scope.r).toBeNull() // 4 is under the anonymity minimum
  })

  it('weights the parts by their settings: 100/0 is the first review, 0/100 is retention, 0/0 is half each', () => {
    const a = hire(at)
    const b = left('2025-01-06')
    const reviews = [review(a.employeeId, '2024-12-15', 4), review(b.employeeId, '2024-12-15', 3)]
    const q = (params: Parameters<typeof metricsWith>[0]) => {
      const m = model([a, b], reviews, params)
      return [byId(m, a)?.Q, byId(m, b)?.Q]
    }
    expect(q({ [QID.score]: { performanceWeight: 1, retentionWeight: 0 } })).toEqual([75, 50])
    expect(q({ [QID.score]: { performanceWeight: 0, retentionWeight: 1 } })).toEqual([100, 0])
    expect(q({ [QID.score]: { performanceWeight: 0.7, retentionWeight: 0.3 } })).toEqual([
      0.7 * 75 + 0.3 * 100,
      0.7 * 50,
    ])
    const zero = { [QID.score]: { performanceWeight: 0, retentionWeight: 0 } }
    expect(q(zero)).toEqual([87.5, 25])
    expect(qualitySettings(metricsWith(zero)).weightsDefaulted).toBe(true)
  })

  it('is unknown without leavers anywhere, never 100%, and null without Reviews', () => {
    const a = hire(at)
    const noLeavers = qualityModel(ctxOf({ employees: [a, hire(at), hire(at), hire(at), hire(at)] }))
    expect(noLeavers.hires.every((h) => h.R == null && h.Q == null && h.outcome === 'unknown')).toBe(true)
    expect(noLeavers.kpis.find((k) => k.id === 'quality-retention')?.value).toBeNull()
    const noReviews = model([a, hire(at), hire(at), hire(at), hire(at)])
    expect(noReviews.scope.q).toBeNull()
    expect(noReviews.scope.r).toBe(1)
    expect(noReviews.kpis.find((k) => k.id === 'quality-score')?.note).toBe(
      'Upload Reviews to score the first full review',
    )
  })
})

describe('group scores', () => {
  it('give a mean with its interval, null under the anonymity minimum', () => {
    const i = meanInterval([60, 70, 80, 90, 100], 1.645, 5)
    const sd = Math.sqrt(250)
    expect(i.mean).toBe(80)
    expect(i.sd).toBeCloseTo(sd, 12)
    expect(i.low).toBeCloseTo(80 - (1.645 * sd) / Math.sqrt(5), 12)
    expect(i.high).toBeCloseTo(80 + (1.645 * sd) / Math.sqrt(5), 12)
    expect(clearly(i, 60)).toBe('above')
    expect(clearly(i, 95)).toBe('below')
    expect(clearly(i, 80)).toBe('unclear')
    expect(meanInterval([60, 70, 80, 90], 1.645, 5)).toMatchObject({ mean: null, low: null, high: null })
  })

  it('widen with the interval setting', () => {
    const s = (v: string) => qualitySettings(metricsWith({ [QID.score]: { interval: v } })).z
    expect([s('0.8'), s('0.9'), s('0.95')]).toEqual([1.28, 1.645, 1.96])
  })

  it('expect each hire to score like the company in their site and level cell, falling back to the site and the company', () => {
    type X = { cells: string[]; v: number }
    const x = (cells: string[], v: number): X => ({ cells, v })
    const company = [
      ...Array.from({ length: 10 }, () => x(['A|L1-L2', 'A', ''], 50)),
      ...Array.from({ length: 3 }, () => x(['A|L5-L6', 'A', ''], 90)),
      ...Array.from({ length: 4 }, () => x(['B|L1-L2', 'B', ''], 70)),
    ]
    const mix = mixBenchmark(
      company,
      (c) => c.v,
      (c) => c.cells,
      10,
    )
    expect(mix.cellMean(company[0])).toBe(50)
    // A cell of 3: its site, A, holds 13.
    expect(mix.cellMean(company[10])).toBeCloseTo((10 * 50 + 3 * 90) / 13, 12)
    // Site B holds 4: the company.
    expect(mix.cellMean(company[13])).toBeCloseTo((10 * 50 + 3 * 90 + 4 * 70) / 17, 12)
    expect(mix.expected([company[0], company[10]])).toBeCloseTo((50 + (10 * 50 + 3 * 90) / 13) / 2, 12)
    expect(cellsOf({ site: 'Austin', band: 'L3-L4' } as Hire)).toEqual(['Austin|L3-L4', 'Austin', ''])
  })

  it('fold universities under the smallest shown into Other, never Not recorded', () => {
    const at = '2024-03-04'
    const hs = [
      ...Array.from({ length: 12 }, () => hire(at, { university: 'Coyote Valley University' })),
      ...Array.from({ length: 7 }, () => hire(at, { university: 'East Reed University' })),
      ...Array.from({ length: 3 }, () => hire(at, { university: 'Mission Peak University' })),
      ...Array.from({ length: 2 }, () => hire(at)),
    ]
    const reviews = hs.map((h) => review(h.employeeId, '2024-12-15', 3))
    const labels = (m: QualityModel) => m.cuts.university.map((g) => `${g.label} ${g.n}`)
    expect(labels(model(hs, reviews))).toEqual([
      'Coyote Valley University 12',
      'Other universities (2) 10',
      'Not recorded 2',
    ])
    // At 5, Mission Peak alone (3) would make an Other row under the anonymity minimum, which the
    // scope and the rows shown would give away, so it takes East Reed (the smallest shown) too.
    expect(labels(model(hs, reviews, { [QID.score]: { minUniversityHires: 5 } }))).toEqual([
      'Coyote Valley University 12',
      'Other universities (2) 10',
      'Not recorded 2',
    ])
    // Not recorded keeps its row, and its mean is hidden under the anonymity minimum; alone, it
    // could be worked out from the scope, so the smallest row shown (Other) is withheld too.
    const rows = model(hs, reviews).cuts.university
    expect(rows.at(-1)).toMatchObject({ kind: 'none', q: null })
    expect(rows[1]).toMatchObject({ kind: 'other', n: 10, q: null, p: null, r: null })
    expect(rows[0].q).not.toBeNull()
    // The setting cannot go under the anonymity minimum.
    expect(() => metricsWith({ [QSET.minUniversityHires.metricId]: { minUniversityHires: 4 } })).toThrow()
  })

  it('read a university as the Universities list names it', () => {
    const names = universityNames([
      { value: 'Coyote Valley University' },
      { value: 'Coyote Valley Univ.', retired: true, replacedBy: 'Coyote Valley University' },
    ])
    expect(readUniversity('Coyote Valley Univ.', names)).toBe('Coyote Valley University')
    expect(readUniversity('  coyote valley   university ', names)).toBe('Coyote Valley University')
    expect(readUniversity('Unlisted Institute', names)).toBe('Unlisted Institute')
    expect(readUniversity('  ', names)).toBeNull()
  })

  it('size groups by scored hires, or by hires with a retention score without Reviews', () => {
    const m = model(
      Array.from({ length: 6 }, (_, i) => hire('2024-03-04', { location: i < 3 ? 'Austin' : 'San Jose' })),
      [],
    )
    const none = mixBenchmark<Hire>(
      [],
      () => null,
      () => [],
      10,
    )
    const g = scoreGroup('x', 'x', 'value', [], { s: m.s, sized: 'scored', companyQ: 60, mix: none })
    expect(g).toMatchObject({ n: 0, q: null, expected: null, gap: null, status: 'unclear' })
    // Without Reviews nobody is scored: groups are sized by hires with a retention score, so the
    // retention figures still show by site and business unit.
    const sites = (sized: 'scored' | 'retained') =>
      CUTS.location(m.hires, { s: { ...m.s, minGroup: 3 }, sized, companyQ: null, mix: none }).map(
        (r) => r.label,
      )
    expect(sites('retained')).toEqual(['Austin', 'San Jose'])
    expect(sites('scored')).toEqual(['Other (2)'])
    expect(m.cuts.location.map((r) => [r.label, r.r])).toEqual([['Other (2)', 1]])
  })
})

describe('the drills', () => {
  it('list the inputs of the score, never the score, in hire-date order', () => {
    const hs = [
      hire('2025-05-05'),
      hire('2024-01-08'),
      hire('2024-07-01', { terminationDate: '2024-10-01', terminationType: 'Voluntary' }),
    ]
    const m = model(hs, [review(hs[0].employeeId, '2025-12-15', 4)])
    const spec = hiresSpec(m.drill, 'Hires', [...m.hires].reverse())
    expect(spec?.rows.map((e) => e.hireDate)).toEqual(['2024-01-08', '2024-07-01', '2025-05-05'])
    const keys = [...HIRE_COLUMNS.map((c) => c.key), ...(spec?.extra?.columns.map((c) => c.key) ?? [])]
    for (const k of keys) expect(k.toLowerCase()).not.toMatch(/score|quality/)
    for (const c of spec?.extra?.columns ?? []) expect(c.label.toLowerCase()).not.toMatch(/score|quality/)
    const values = spec?.rows.map((e) => spec.extra?.values(e))
    expect(values?.map((v) => v?.stayedYear)).toEqual(['Yes', 'No', 'Yes'])
    expect(values?.[1]?.firstReview).toBe('Left before a first review')
    expect(values?.[0]?.firstReview).toBe('No first full review')
    for (const v of values ?? []) expect(Object.values(v ?? {})).not.toContain(byId(m, hs[0])?.Q)
    expect(hiresSpec(m.drill, 'None', [])).toBeNull()
  })
})
