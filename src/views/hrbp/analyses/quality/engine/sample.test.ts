/**
 * Quality of hire on the sample company (docs/ANALYSES.md, 2.2, 2.10 and 7.2): every number
 * recounted from the raw rows with the sample's own reading of the definitions
 * (`src/data/sample/outcomes.ts`, written apart from this engine), the planted stories, the
 * readout, suppression, and finite-or-null everywhere.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { BARTON_CREEK, COYOTE_VALLEY, VRISHABHA_HILLS } from '@/data/sample/education'
import { expectedScore, groupScore, type HireOutcome, hireOutcomes } from '@/data/sample/outcomes'
import { SOURCES } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { isActiveAt } from '@/lib/people'
import { metricsWith } from '@/metrics/testing'
import { sampleCtx } from '@/views/hrbp/engine/fixtures'
import { analysisModel, analysisSummary } from '../../registry'
import type { GroupScore } from './groups'
import { QID } from './metrics'
import type { QualityModel } from './model'

let ctx: AnalyticsContext
let m: QualityModel
let ref: HireOutcome[]
beforeAll(() => {
  ctx = sampleCtx()
  m = analysisModel<QualityModel>(ctx, 'quality')
  const d = ctx.all
  ref = hireOutcomes(d.employees, d.reviews, d.jobChanges, ctx.asOf)
}, 60_000)

const near = (a: number | null | undefined, b: number | null | undefined, digits = 9) => {
  expect(a).not.toBeNull()
  expect(a as number).toBeCloseTo(b as number, digits)
}
const group = (rows: readonly GroupScore[], label: string) =>
  rows.find((g) => g.label === label) as GroupScore
const refOf = (pred: (h: HireOutcome) => boolean) => ref.filter(pred)
const kpi = (id: string) => m.kpis.find((k) => k.id === id)

describe('recounted from the raw rows', () => {
  it('the cohort, its parts and the company score', () => {
    expect(m.counts).toMatchObject({
      cohort: 488,
      scored: 488,
      rated: 448,
      leftBeforeReview: 40,
      notScored: 0,
    })
    const c = groupScore(ref)
    near(m.scope.q, c.Q)
    near(m.scope.p, c.P)
    near((m.scope.r as number) * 100, c.R)
    near(m.scope.low, c.low)
    near(m.scope.high, c.high)
    expect(m.scope.q as number).toBeCloseTo(66.9, 1)
    expect(m.scope.p as number).toBeCloseTo(54.2, 1)
    expect(m.scope.r as number).toBeCloseTo(0.842, 3)
    // The cohort is every employee hired 1 Oct 2023 to 30 Sep 2025, from the raw rows.
    const raw = ctx.all.employees.filter(
      (e) => e.employmentType === 'Employee' && e.hireDate >= '2023-10-01' && e.hireDate <= '2025-09-30',
    )
    expect(m.hires.map((h) => h.e.employeeId).sort()).toEqual(raw.map((e) => e.employeeId).sort())
    // Stayed a year from the raw rows: active 12 months after hire, less reductions in force and
    // regretted exits in the second year.
    const stayed = raw.filter(
      (e) =>
        e.terminationReason !== 'Reduction in force' &&
        isActiveAt(e, addMonths(e.hireDate, 12)) &&
        !(
          e.regrettable &&
          e.terminationDate &&
          e.terminationDate <= ctx.asOf &&
          e.terminationDate <= addMonths(e.hireDate, 24)
        ),
    )
    const scored = raw.filter((e) => !(e.terminationReason === 'Reduction in force' && e.terminationDate))
    expect(stayed.length / scored.length).toBeCloseTo(m.scope.r as number, 12)
  })

  it('every university, degree level and field of study, with its interval and expected score', () => {
    for (const [rows, key] of [
      [m.cuts.university, 'university'],
      [m.cuts.degree, 'degreeLevel'],
    ] as const) {
      for (const g of rows) {
        if (g.kind !== 'value') continue
        const hs = refOf((h) => h.e[key] === g.label)
        const r = groupScore(hs)
        expect(g.n, g.label).toBe(r.n)
        near(g.q, r.Q)
        near(g.low, r.low)
        near(g.high, r.high)
        near(g.p, r.P)
        near(g.expected, expectedScore(hs, ref))
      }
    }
    const coyote = group(m.cuts.university, COYOTE_VALLEY)
    near(
      coyote.expected,
      expectedScore(
        refOf((h) => h.e.university === COYOTE_VALLEY),
        ref,
      ),
    )
  })

  it('the KPI strip', () => {
    expect(kpi('quality-score')?.value).toBe(m.scope.q)
    expect(kpi('quality-retention')?.value).toBe(m.scope.r)
    expect(kpi('quality-performance')?.value).toBe(m.scope.p)
    expect(kpi('quality-cohort')).toMatchObject({
      value: 488,
      note: '40 left before a first review; 0 not scored',
    })
    const recorded = m.hires.filter((h) => h.e.university || h.e.degreeLevel).length
    expect(kpi('quality-education')?.value).toBeCloseTo(recorded / 488, 12)
    expect(kpi('quality-education')?.value as number).toBeCloseTo(0.88, 1)
    expect(kpi('quality-score')?.note).toBe('Hires 1 Oct 2023 to 30 Sep 2025')
    for (const k of m.kpis) {
      expect(k.metricId, k.id).toMatch(/^hrbp\.quality\./)
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(k.drill, k.id).toBeTruthy()
      expect(k.definition, k.id).toBe(ctx.metrics.def(k.metricId as string)?.definition)
    }
  })
})

describe('the planted stories', () => {
  it('Coyote Valley University is clearly above the company and its expected score', () => {
    const g = group(m.cuts.university, COYOTE_VALLEY)
    expect(g.n).toBeGreaterThanOrEqual(35)
    expect(g.n).toBeLessThanOrEqual(45)
    expect(g.status).toBe('above')
    expect((g.q as number) - (m.company.q as number)).toBeGreaterThanOrEqual(9)
    expect(g.gap as number).toBeGreaterThanOrEqual(8)
  })

  it('Vrishabha Hills has the strongest first reviews of any school shown, and stays like Bengaluru', () => {
    const g = group(m.cuts.university, VRISHABHA_HILLS)
    for (const o of m.cuts.university)
      if (o !== g && o.kind === 'value') expect(o.p as number).toBeLessThan(g.p as number)
    expect(g.r as number).toBeLessThanOrEqual(0.7)
    expect(Math.abs(g.gap as number)).toBeLessThanOrEqual(3)
    expect(g.status).toBe('unclear')
  })

  it('Barton Creek Polytechnic is well below, but its interval crosses the company line', () => {
    const g = group(m.cuts.university, BARTON_CREEK)
    expect(g.n).toBeGreaterThanOrEqual(10)
    expect((m.company.q as number) - (g.q as number)).toBeGreaterThanOrEqual(8)
    expect(g.status).toBe('unclear')
    expect(m.findings.some((f) => f.title.includes(BARTON_CREEK))).toBe(false)
  })

  it('folds 12 or more small schools into Other universities, and Not recorded stays last', () => {
    const rows = m.cuts.university
    const other = rows.find((g) => g.kind === 'other') as GroupScore
    expect(other.folded.length).toBeGreaterThanOrEqual(12)
    expect(other.label).toBe(`Other universities (${other.folded.length})`)
    expect(rows.at(-1)?.kind).toBe('none')
    for (const g of rows) if (g.kind === 'value') expect(g.n).toBeGreaterThanOrEqual(10)
  })

  it("degree levels: Master's above Bachelor's, PhD strongest first reviews, Associate small", () => {
    const d = (l: string) => group(m.cuts.degree, l)
    expect((d("Master's").q as number) - (d("Bachelor's").q as number)).toBeGreaterThanOrEqual(4)
    expect(d('PhD').n).toBeGreaterThanOrEqual(18)
    expect(d('PhD').n).toBeLessThanOrEqual(30)
    for (const l of ['Associate', "Bachelor's", "Master's", 'Other'])
      expect(d(l).p as number).toBeLessThan(d('PhD').p as number)
    expect(d('Associate').n).toBeGreaterThanOrEqual(8)
    expect(m.cuts.degree.map((g) => g.label)).toEqual([
      'Associate',
      "Bachelor's",
      "Master's",
      'PhD',
      'Other',
      'Not recorded',
    ])
  })

  it("computer science bachelor's sit well below electrical engineering, company-wide and in Silicon Engineering", () => {
    const cell = (mm: QualityModel, field: string) =>
      mm.cells.find((c) => c.field === field && c.degree === "Bachelor's")
    const cs = cell(m, 'Computer Science')
    const ee = cell(m, 'Electrical Engineering')
    expect((ee?.q as number) - (cs?.q as number)).toBeGreaterThanOrEqual(6)
    const se = analysisModel<QualityModel>(sampleCtx({ businessUnit: ['Silicon Engineering'] }), 'quality')
    // The planted gap holds in Silicon Engineering (17 and 50 hires)...
    const mean = (c: QualityModel['cells'][number] | undefined) =>
      (c?.scored ?? []).reduce((n, h) => n + (h.Q as number), 0) / (c?.scored.length ?? 1)
    expect(
      mean(cell(se, 'Electrical Engineering')) - mean(cell(se, 'Computer Science')),
    ).toBeGreaterThanOrEqual(12)
    // ...but there the computer science row is 17 bachelor's and 3 master's, and the field figure
    // shows the row's mean, so showing the bachelor's cell would give away the 3 master's hires'
    // mean. The cell is withheld, and finding 3 names the next lowest cell.
    expect(cell(se, 'Computer Science')).toMatchObject({ n: 17, q: null, p: null, r: null })
    const f = se.findings.find((x) => x.id.startsWith('hrbp-quality-cell-'))
    expect(f?.title).toBe(
      "Bachelor's hires in electrical engineering score 56 in this scope, against 67 for the company.",
    )
    expect(f?.detail).toBe(
      '50 hires: 68% stayed a year and their first reviews averaged 52. 13 of them work in Design Verification, more than anywhere else.',
    )
  })

  it('says where the computer science hires work only as far as it is true, company-wide', () => {
    const f = m.findings.find((x) => x.id.startsWith('hrbp-quality-cell-'))!
    // 32 hires: Design RTL 9, then Software, Firmware and Design Verification tied at 6. Only 15 of
    // 32 are in RTL design or verification, so the finding names the largest with its count and
    // none of the three tied functions.
    const cs = m.cells.find((c) => c.field === 'Computer Science' && c.degree === "Bachelor's")!
    const byFn = new Map<string, number>()
    for (const h of cs.scored) byFn.set(h.e.jobFunction ?? '', (byFn.get(h.e.jobFunction ?? '') ?? 0) + 1)
    expect(cs.n).toBe(32)
    expect(byFn.get('Design RTL')).toBe(9)
    expect(f.detail).toBe(
      '32 hires: 72% stayed a year and their first reviews averaged 38. 9 of them work in Design RTL, more than anywhere else.',
    )
    expect(f.detail).not.toMatch(/Most work/)
    expect(f.action).toBe('Check that role scope and onboarding for computer science graduates are clear.')
  })
})

describe('the readout', () => {
  it('names the four planted stories, groups only, ranked by severity', () => {
    const titles = m.findings.map((f) => f.title)
    expect(titles.slice(0, 4)).toEqual([
      'Hires from Vrishabha Hills Institute of Technology have the strongest first reviews (75), but only 68% stayed a year.',
      "Bachelor's hires in computer science score 51, against 58 for electrical engineering.",
      // Corporate (69.8%) is lower than Go-to-Market (70.3%); both round to 70%, so both are named.
      'Education is recorded for 88% of hires in the cohort; Corporate and Go-to-Market are at 70%.',
      'Hires from Coyote Valley University score 80 on quality of hire, 13 points above the company.',
    ])
    const [vh, , cov, cv] = m.findings
    expect(vh).toMatchObject({
      severity: 'warning',
      detail: 'Their quality of hire, 68, matches other Bengaluru hires at the same levels (67).',
      action: 'Treat this as a Bengaluru retention question: see Attrition in People stats.',
      tab: 'attrition',
      filter: { location: ['Bengaluru'] },
    })
    expect(cov).toMatchObject({ severity: 'info', filter: { businessUnit: ['Corporate', 'Go-to-Market'] } })
    expect(cv).toMatchObject({
      severity: 'good',
      detail:
        '38 hires. 97% stayed a year and their first reviews averaged 63. Hires at the same sites and levels score 66.',
    })
    for (const f of m.findings) {
      expect(f.people ?? [], f.id).toEqual([])
      expect(f.metricId, f.id).toMatch(/^hrbp\.quality\./)
      expect(f.uses?.length, f.id).toBeGreaterThan(0)
      expect(f.drill, f.id).toBeTruthy()
      expect(`${f.title} ${f.detail} ${f.action}`, f.id).not.toMatch(/hire more|avoid|—|!/i)
    }
    // The summary Ask reads is the same objects.
    expect(analysisSummary(ctx, 'quality')).toEqual({ kpis: m.kpis, findings: m.findings })
  })

  it('follows the gap worth a finding', () => {
    const wide = analysisModel<QualityModel>(sampleCtx({}, metricsGap(15)), 'quality')
    expect(wide.findings.some((f) => f.id.startsWith('hrbp-quality-above-'))).toBe(false)
  })
})

describe('privacy and suppression', () => {
  it('hides every mean under the anonymity minimum and keeps every value finite or null', () => {
    const scopes = [sampleCtx({ location: ['Boulder'] }), sampleCtx({ businessUnit: ['Go-to-Market'] }), ctx]
    for (const c of scopes) {
      const mm = analysisModel<QualityModel>(c, 'quality')
      const all = [mm.scope, ...Object.values(mm.cuts).flat()]
      for (const g of all) {
        if (g.n < 5) expect([g.q, g.low, g.high, g.expected], g.label).toEqual([null, null, null, null])
        if (g.rated.length < 5) expect(g.p, g.label).toBeNull()
        if (g.retained.length < 5) expect(g.r, g.label).toBeNull()
        for (const v of [g.q, g.low, g.high, g.p, g.r, g.expected, g.gap])
          expect(v == null || Number.isFinite(v), g.label).toBe(true)
      }
      for (const cell of mm.cells) if (cell.n < mm.s.minCellHires) expect(cell.q).toBeNull()
      for (const k of mm.kpis) expect(k.value == null || Number.isFinite(k.value), k.id).toBe(true)
    }
  })

  it('shows only the sources Recruiting knows, each with at least 10 scored hires', () => {
    const known = new Set<string>(SOURCES)
    const rows = m.cuts.source
    for (const g of rows.filter((x) => x.kind === 'value')) {
      expect(known.has(g.key), g.label).toBe(true)
      expect(g.scored.length, g.label).toBeGreaterThanOrEqual(10)
    }
    // The messy extract's own spelling of Careers site is not a source of its own.
    expect(rows.some((g) => /careers page/i.test(g.label))).toBe(false)
  })
})

describe('complementary suppression', () => {
  it('no cut or heatmap line lets hidden hires under the minimum be worked out from the totals shown', () => {
    const scopes = [
      ctx,
      sampleCtx({ businessUnit: ['Silicon Engineering'] }),
      sampleCtx({ businessUnit: ['Go-to-Market'] }),
      sampleCtx({ location: ['Bengaluru'] }),
      sampleCtx({ location: ['Austin'] }),
    ]
    for (const c of scopes) {
      const mm = analysisModel<QualityModel>(c, 'quality')
      const min = mm.s.minGroup
      if (mm.scope.q == null) continue
      // Each cut's rows add up to the scope, whose means the KPI strip shows.
      for (const [key, rows] of Object.entries(mm.cuts)) {
        const sum = (pick: (g: GroupScore) => boolean, pop: (g: GroupScore) => number) =>
          rows.filter((g) => pick(g) && pop(g) > 0).reduce((n, g) => n + pop(g), 0)
        expect(
          rows.reduce((n, g) => n + g.hires.length, 0),
          key,
        ).toBe(mm.scope.hires.length)
        for (const [held, what] of [
          [
            sum(
              (g) => g.q == null,
              (g) => g.n,
            ),
            'quality of hire',
          ],
          [
            sum(
              (g) => g.p == null,
              (g) => g.rated.length,
            ),
            'first review',
          ],
          [
            sum(
              (g) => g.r == null,
              (g) => g.retained.length,
            ),
            'stayed a year',
          ],
        ] as const)
          expect(held === 0 || held >= min, `${c.scopeLabel}, ${key}, ${what}: ${held} hidden`).toBe(true)
      }
      // The heatmap's rows add up to the field figure's groups, its columns to the degree figure's.
      const lines = [
        ...mm.cuts.field
          .filter((g) => g.kind !== 'none' && g.q != null)
          .map((g) => ({ total: g, cells: mm.cells.filter((x) => x.field === g.label) })),
        ...mm.cuts.degree
          .filter((g) => g.kind === 'value' && g.q != null)
          .map((g) => ({ total: g, cells: mm.cells.filter((x) => x.degree === g.label) })),
      ]
      for (const { total, cells } of lines) {
        const outside = total.n - cells.reduce((n, x) => n + x.n, 0)
        const held = cells.filter((x) => x.q == null).reduce((n, x) => n + x.n, 0) + outside
        expect(held === 0 || held >= min, `${c.scopeLabel}, ${total.label}: ${held} hidden`).toBe(true)
      }
    }
  })

  it("the reviewer's case: one Business hire with an associate degree cannot be worked out", () => {
    // Business: 36 hires; Bachelor's 14, Master's 21, Associate 1, every one with a degree level.
    const business = m.cells.filter((x) => x.field === 'Business')
    expect(business.find((x) => x.degree === 'Associate')).toMatchObject({ n: 1, q: null })
    // The bachelor's cell is withheld with it, so the 1 hire's score is not the remainder.
    expect(business.find((x) => x.degree === "Bachelor's")).toMatchObject({ n: 14, q: null })
    expect(business.find((x) => x.degree === "Master's")?.q).not.toBeNull()
  })
})

function metricsGap(minGap: number) {
  return metricsWith({ [QID.findings]: { minGap } })
}
