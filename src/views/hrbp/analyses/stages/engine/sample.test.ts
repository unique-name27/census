/**
 * Engineering by stage on the sample company (docs/ANALYSES.md, 4.4, 4.10 and 7.2): every count
 * recounted from the raw rows with the sample's own job architecture, the planted stories, the
 * findings that fire and the one that does not, drills that list exactly the number clicked,
 * "Filter to" on the heatmap's sites and business units, Manager mode, and every value finite or
 * null with nothing under the minimum carrying a share.
 */
import { describe, expect, it, vi } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { ENGINEERING_OF_FAMILY, STAGE_OF_FUNCTION } from '@/data/sample/jobs'
import type { ChipStageKey, Employee, HiringPlanLine, Requisition } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { expectFilterTo, expectLeaveOut } from '@/drill/testing'
import { metricsWith } from '@/metrics/testing'
import { analysisModel } from '../../registry'
import { NOT_MAPPED, type StageKey } from './base'
import type { WhereCell } from './capacity'
import { capacityDrill, functionDrill, hiringDrill, ratioDrill, trendDrill, whereDrill } from './figureDrills'
import { SID } from './metrics'
import { familyMenuLabel, type StagesModel, stagesModel, stagesModelFor } from './model'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const ctx = sampleCtx()
const m = stagesModel(ctx)
const AS_OF = ctx.asOf

const rowsOf = (src: unknown): readonly unknown[] => resolveDrill(src as never)?.rows ?? []
const cap = (k: StageKey) => m.capacity.find((r) => r.key === k)!

/* ───────── an independent count from the raw rows ───────── */

const active = (e: Employee, d = AS_OF) => e.hireDate <= d && (!e.terminationDate || e.terminationDate > d)

/** The sample's stage of a job function: saved on its list, or Packaging's proposed Signoff and tape-out. */
function stageOfRow(fn: string | null | undefined, family: string | null | undefined): StageKey | null {
  if (!fn) return null
  const saved = STAGE_OF_FUNCTION.get(fn)
  if (saved) return saved
  if (family && ENGINEERING_OF_FAMILY.get(family) === 'Yes')
    return fn === 'Packaging' ? 'signoff' : NOT_MAPPED
  return null
}

function rawCounts(type: Employee['employmentType']): Map<StageKey, number> {
  const out = new Map<StageKey, number>()
  for (const e of ctx.all.employees) {
    if (e.employmentType !== type || !active(e)) continue
    const s = stageOfRow(e.jobFunction, e.jobFamily)
    if (s) out.set(s, (out.get(s) ?? 0) + 1)
  }
  return out
}

/** Each department's most common job function among its active employees. */
function deptFunctions(): Map<string, string> {
  const c = new Map<string, Map<string, number>>()
  for (const e of ctx.all.employees) {
    if (e.employmentType !== 'Employee' || !active(e) || !e.jobFunction) continue
    const d = c.get(e.department) ?? new Map<string, number>()
    d.set(e.jobFunction, (d.get(e.jobFunction) ?? 0) + 1)
    c.set(e.department, d)
  }
  return new Map(
    [...c].map(([dept, fns]) => [
      dept,
      [...fns].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    ]),
  )
}
const DEPT_FN = deptFunctions()
const familyOfFn = new Map<string, string>()
for (const e of ctx.all.employees)
  if (e.jobFunction && e.jobFamily) familyOfFn.set(e.jobFunction, e.jobFamily)
const stageOfDept = (dept: string): StageKey | null => {
  const fn = DEPT_FN.get(dept)
  return fn ? stageOfRow(fn, familyOfFn.get(fn)) : null
}

describe('counts recounted from the raw rows', () => {
  it('capacity: employees and contractors per stage', () => {
    const emps = rawCounts('Employee')
    const cons = rawCounts('Contractor')
    const interns = rawCounts('Intern')
    for (const r of m.capacity) {
      expect(r.employees, r.stage).toBe(emps.get(r.key) ?? 0)
      expect(r.contractors, r.stage).toBe(cons.get(r.key) ?? 0)
      expect(r.interns, r.stage).toBe(interns.get(r.key) ?? 0)
    }
    expect(m.capacity.some((r) => r.key === NOT_MAPPED)).toBe(false)
    expect(m.capacity.reduce((s, r) => s + r.employees, 0)).toBe(1018)
  })

  it('FTE: blanks count as 1', () => {
    for (const r of m.capacity) {
      const fte = r.people.employees.reduce((s, p) => s + (p.e.fte ?? 1), 0)
      expect(r.employeeFte, r.stage).toBeCloseTo(fte, 6)
    }
  })

  it('open openings and planned starts with no req, by the department’s job function', () => {
    const open = new Map<StageKey, number>()
    for (const q of ctx.all.requisitions as Requisition[]) {
      if (q.status !== 'Open' || q.openedDate > AS_OF) continue
      const s = stageOfDept(q.department)
      if (s) open.set(s, (open.get(s) ?? 0) + q.openings)
    }
    const reqIds = new Set(ctx.all.requisitions.map((q) => q.reqId))
    const versions = [...new Set(ctx.all.hiringPlan.map((l) => l.planVersion).filter(Boolean))].sort()
    const latest = versions[versions.length - 1] ?? null
    const planned = new Map<StageKey, number>()
    for (const l of ctx.all.hiringPlan as HiringPlanLine[]) {
      if (latest && l.planVersion !== latest) continue
      if (l.reqId && reqIds.has(l.reqId)) continue
      if (l.period < '2026-10-01' || l.period > '2027-03-31') continue
      const s = stageOfDept(l.department)
      if (s) planned.set(s, (planned.get(s) ?? 0) + l.plannedHires)
    }
    for (const r of m.hiring) {
      expect(r.open, r.stage).toBe(open.get(r.key) ?? 0)
      expect(r.planned, r.stage).toBe(planned.get(r.key) ?? 0)
    }
  })

  it('upcoming starts: each in its own job function’s stage, or its req department’s', () => {
    for (const r of m.hiring)
      for (const s of r.records.starts) {
        const expected = s.start.employee
          ? stageOfRow(s.start.employee.jobFunction, s.start.employee.jobFamily)
          : stageOfDept(s.start.req?.department ?? '')
        expect(expected, s.start.name).toBe(r.key)
      }
    // Silicon Engineering's 13 accepted offers (Onboarding story 1).
    expect(stagesModelFor(ctx, 'Silicon Engineering').hiring.reduce((s, r) => s + r.accepted, 0)).toBe(13)
  })

  it('where each stage is staffed: people per site and business unit', () => {
    for (const c of m.where.cells.filter((x) => !x.other)) {
      const n = ctx.all.employees.filter(
        (e) =>
          e.employmentType === 'Employee' &&
          active(e) &&
          stageOfRow(e.jobFunction, e.jobFamily) === c.stageKey &&
          (e[c.dim] || 'Not recorded') === c.group,
      ).length
      expect(c.people, `${c.stage} ${c.group}`).toBe(n)
    }
  })

  it('stage headcount at each quarter end', () => {
    for (const t of m.trend)
      t.periods.forEach((d, i) => {
        const n = ctx.all.employees.filter(
          (e) =>
            e.employmentType === 'Employee' &&
            active(e, d) &&
            stageOfRow(e.jobFunction, e.jobFamily) === t.key,
        ).length
        expect(t.values[i], `${t.name} ${d}`).toBe(n)
      })
  })
})

describe('the planted stories (docs/ANALYSES.md, 4.10)', () => {
  it('design verification against RTL design, under the 1.5 reference', () => {
    expect(cap('verification')).toMatchObject({ employees: 149, contractors: 21 })
    expect(cap('rtl')).toMatchObject({ employees: 128, contractors: 0 })
    // Employees only by default (industry references count employees), so the gap shows.
    const v = m.ratios.find((r) => r.id === 'verification')!
    expect(v.value).toBeCloseTo(149 / 128, 12)
    expect(v.withContractors).toBeCloseTo(170 / 128, 12)
    expect(v).toMatchObject({ contractorsTop: 21, contractorsBottom: 0, status: 'below' })
    const f = m.findings.find((x) => x.id === 'stages-below-verification')!
    expect(f.title).toBe('Design verification has 1.16 engineers per RTL designer, below the 1.5 reference.')
    expect(f.detail).toMatch(
      /^149 engineers in design verification and 21 contractors for 128 in RTL design; 1\.33 with contractors\./,
    )
    const tile = m.kpis.find((k) => k.id === 'stages-verification-ratio')!
    expect(tile.note).toBe('Below the 1.5 reference; 1.33 with contractors')
    // Counting contractors in ratios: 1.33 is 11% under the reference, near it, and neutral.
    const on = stagesModel(sampleCtx({ metrics: metricsWith({ [SID.ratios]: { ratioContractors: true } }) }))
    const w = on.ratios.find((r) => r.id === 'verification')!
    expect(w.value).toBeCloseTo(170 / 128, 12)
    expect(w.withContractors).toBeCloseTo(170 / 128, 12)
    expect(w.status).toBe('near')
    expect(on.findings.some((x) => x.id === 'stages-below-verification')).toBe(false)
    // Contractors are 12% of verification, the most of any stage.
    expect(cap('verification').contractorShare).toBeCloseTo(21 / 170, 12)
  })

  it('Bengaluru holds at least 40% of verification and DFT', () => {
    const at = (k: StageKey, site: string) =>
      m.where.cells.find((c) => c.dim === 'location' && c.stageKey === k && c.group === site)!
    expect(at('verification', 'Bengaluru')).toMatchObject({ people: 64 })
    expect(at('dft', 'Bengaluru')).toMatchObject({ people: 23 })
    expect(at('verification', 'Bengaluru').share).toBeGreaterThanOrEqual(0.4)
    expect(at('dft', 'Bengaluru').share).toBeCloseTo(0.46, 12)
    const f = m.findings.find((x) => x.id === 'stages-concentrated-Bengaluru')!
    expect(f.title).toBe(
      '43% of design verification and 46% of DFT sit in Bengaluru, where voluntary attrition is 18.8%.',
    )
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
    expect(rowsOf(f.drill)).toHaveLength(87)
  })

  it('verification holds the most open engineering openings', () => {
    const most = [...m.hiring].sort((a, b) => b.open - a.open)[0]
    expect(most.key).toBe('verification')
    expect(most.open).toBe(22)
    expect(m.hiring.reduce((s, r) => s + r.open, 0)).toBe(103)
  })

  it('the planned roles with no req match Hiring plan story 2', () => {
    const sil = stagesModelFor(ctx, 'Silicon Engineering')
    const planned = Object.fromEntries(sil.hiring.filter((r) => r.planned).map((r) => [r.key, r.planned]))
    expect(planned).toEqual({ architecture: 1, rtl: 1, verification: 4, dft: 1, physical: 2 })
    expect(m.kpis.find((k) => k.id === 'stages-planned')?.value).toBe(20)
    expect(m.findings.find((f) => f.id === 'stages-planned-no-req')?.title).toBe(
      'Software and firmware has 6 planned starts in the next 6 months with no req yet, and design verification 4.',
    )
  })

  it('Packaging is the one function whose stage is only proposed', () => {
    const proposed = m.functions.filter((f) => f.source !== 'Saved')
    expect(proposed.map((f) => [f.jobFunction, f.stage, f.source, f.employees])).toEqual([
      ['Packaging', 'Signoff and tape-out', 'Proposed', 11],
    ])
    expect(m.kpis.find((k) => k.id === 'stages-mapped')?.value).toBeCloseTo(1007 / 1018, 12)
    expect(m.findings.find((f) => f.id === 'stages-not-mapped')?.title).toBe(
      '11 engineers are in a job function whose stage is only proposed: Packaging.',
    )
    // Product engineering, test and quality, and EDA & CAD, count through their saved stages.
    expect(cap('productTest').employees).toBe(124)
    expect(cap('shared').employees).toBe(8)
    // The capacity bar says how much of Signoff and tape-out is only proposed, and drills to them.
    const signoff = cap('signoff')
    expect(signoff.proposed).toBeGreaterThanOrEqual(11)
    expect(signoff.proposedShare).toBeCloseTo(
      signoff.proposed / (signoff.employees + signoff.contractors),
      12,
    )
    expect(rowsOf(capacityDrill(m, signoff, 'proposed'))).toHaveLength(signoff.proposed)
    for (const r of m.capacity) if (r.key !== 'signoff') expect(r.proposed, r.key).toBe(0)
    // The job family control says which functions count in a family not marked engineering.
    const corp = m.families.find((f) => f.name === 'Corporate')!
    expect(corp).toMatchObject({ engineering: false, functions: ['EDA & CAD Infrastructure'] })
    expect(familyMenuLabel(corp)).toBe('Corporate (EDA & CAD Infrastructure)')
    expect(familyMenuLabel(m.families.find((f) => f.name === 'Silicon Engineering')!)).toBe(
      'Silicon Engineering',
    )
  })

  it('FTE: 9 part-time engineering employees (verification 3, RTL design 2, software and firmware 4)', () => {
    const part = (k: StageKey) => cap(k).people.employees.filter((p) => p.fte < 1).length
    expect([part('verification'), part('rtl'), part('software')]).toEqual([3, 2, 4])
    expect(m.capacity.reduce((s, r) => s + r.people.employees.filter((p) => p.fte < 1).length, 0)).toBe(9)
    expect(m.kpis.find((k) => k.id === 'stages-fte')?.note).toBe('1,018 employees, 9 part time')
  })

  it('the contractor-heavy finding does not fire (12% at most)', () => {
    expect(m.findings.some((f) => f.id.startsWith('stages-contractors'))).toBe(false)
    expect(m.findings.map((f) => f.id)).toEqual([
      'stages-below-verification',
      'stages-concentrated-Bengaluru',
      'stages-planned-no-req',
      'stages-not-mapped',
    ])
  })
})

describe('every number', () => {
  const numbers = (x: StagesModel): unknown[] => [
    ...x.kpis.flatMap((k) => [k.value, k.delta]),
    ...x.capacity.flatMap((r) => [
      r.employees,
      r.contractors,
      r.share,
      r.contractorShare,
      r.employeeFte,
      r.change,
    ]),
    ...x.hiring.flatMap((r) => [r.accepted, r.open, r.planned, r.ofToday]),
    ...x.ratios.map((r) => r.value),
    ...x.where.cells.flatMap((c) => [c.people, c.share]),
    ...x.trend.flatMap((t) => t.values),
  ]

  it.each([
    ['the company', {}],
    ['Bengaluru', { location: ['Bengaluru'] }],
    ['Go-to-Market', { businessUnit: ['Go-to-Market'] }],
  ])('is finite or null in %s, with no share under the minimum', (_, filters) => {
    const x = stagesModel(sampleCtx({ filters }))
    for (const v of numbers(x)) expect(v == null || Number.isFinite(v as number)).toBe(true)
    for (const c of x.where.cells) if (c.stageTotal < 5) expect(c.share).toBeNull()
    for (const r of x.capacity) if (r.employees + r.contractors < 5) expect(r.contractorShare).toBeNull()
    for (const r of x.ratios) if (r.bottom < 5) expect(r.value).toBeNull()
  })

  it('opens exactly the records it counts', () => {
    for (const k of m.kpis) {
      if (k.value == null || k.format === 'pct' || k.format === 'num2' || k.format === 'num1') continue
      const rows = rowsOf(k.drill)
      if (k.id === 'stages-open-reqs')
        expect((rows as Requisition[]).reduce((s, q) => s + q.openings, 0)).toBe(k.value)
      else if (k.id === 'stages-planned')
        expect((rows as HiringPlanLine[]).reduce((s, l) => s + l.plannedHires, 0)).toBe(k.value)
      else expect(rows, k.id).toHaveLength(k.value)
    }
    for (const r of m.capacity) {
      expect(rowsOf(capacityDrill(m, r, 'employees')), r.stage).toHaveLength(r.employees)
      expect(rowsOf(capacityDrill(m, r, 'contractors')), r.stage).toHaveLength(r.contractors)
      expect(rowsOf(capacityDrill(m, r, 'both')), r.stage).toHaveLength(r.employees + r.contractors)
      expect(rowsOf(capacityDrill(m, r, 'yearAgo')), r.stage).toHaveLength(r.yearAgo ?? 0)
    }
    for (const r of m.hiring) {
      expect(rowsOf(hiringDrill(m, r, 'accepted')), r.stage).toHaveLength(r.accepted)
      const reqs = rowsOf(hiringDrill(m, r, 'open')) as Requisition[]
      expect(
        reqs.reduce((s, q) => s + q.openings, 0),
        r.stage,
      ).toBe(r.open)
      const lines = rowsOf(hiringDrill(m, r, 'planned')) as HiringPlanLine[]
      expect(
        lines.reduce((s, l) => s + l.plannedHires, 0),
        r.stage,
      ).toBe(r.planned)
    }
    for (const r of m.ratios) expect(rowsOf(ratioDrill(m, r)), r.label).toHaveLength(r.top + r.bottom)
    for (const c of m.where.cells) expect(rowsOf(whereDrill(m, c))).toHaveLength(c.people)
    for (const t of m.trend)
      t.values.forEach((v, i) => {
        expect(rowsOf(trendDrill(m, t.name, i))).toHaveLength(v)
      })
    for (const f of m.functions) {
      expect(rowsOf(functionDrill(m, f, 'employees'))).toHaveLength(f.employees)
      expect(rowsOf(functionDrill(m, f, 'contractors'))).toHaveLength(f.contractors)
    }
  })

  it('sets Filter to only on a site or business unit', () => {
    for (const r of m.capacity) expect(resolveDrill(capacityDrill(m, r, 'both'))?.filter).toBeUndefined()
    for (const r of m.hiring) expect(resolveDrill(hiringDrill(m, r, 'open'))?.filter).toBeUndefined()
    for (const r of m.ratios) expect(resolveDrill(ratioDrill(m, r))?.filter).toBeUndefined()
    const other = m.where.cells.find((c) => c.other && c.people > 0)!
    expect(resolveDrill(whereDrill(m, other))?.filter).toBeUndefined()
  })
})

describe('Filter to this on the heatmap', () => {
  const cells = (c: AnalyticsContext, dim: WhereCell['dim'], stage: ChipStageKey) =>
    // Other columns too: they carry no filter, and the cells of a stage add up to it.
    stagesModel(c).where.cells.filter((x) => x.dim === dim && x.stageKey === stage)

  it.each([
    ['site', 'location', 'verification'],
    ['business unit', 'businessUnit', 'software'],
  ] as const)('keeps a %s cell’s count', (_, dim, stage) => {
    const c = {
      name: `${stage} by ${dim}`,
      rows: (x: AnalyticsContext) => cells(x, dim, stage),
      key: (r: WhereCell) => r.group,
      value: (r: WhereCell) => r.people,
      drill: (r: WhereCell, x: AnalyticsContext) => whereDrill(stagesModel(x), r),
      kind: 'count' as const,
    }
    expectFilterTo(ctx, c, { variants: true })
    expectLeaveOut(ctx, c)
  })
})

describe('Manager mode', () => {
  const leaders = leaderOptions(ctx.org, ctx.asOf, 3)
  const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && ctx.org.byId.get(l.id)?.managerId)!
  const mgr = sampleCtx({ access: { mode: 'manager', managerId: mid.id } })

  it('leaves planned starts out of the strip, the figures and the readout', () => {
    const x = analysisModel<StagesModel>(mgr, 'stages')
    expect(x.showPlanned).toBe(false)
    expect(x.flight.planned).toBeNull()
    expect(x.kpis.some((k) => k.metricId === SID.planned)).toBe(false)
    expect(x.hiring.every((r) => r.planned == null)).toBe(true)
    expect(x.functions.every((r) => r.planned == null)).toBe(true)
    expect(x.findings.some((f) => f.id === 'stages-planned-no-req')).toBe(false)
  })

  it('counts only people inside the org', () => {
    const x = stagesModel(mgr)
    const org = new Set(mgr.data.employees.map((e) => e.employeeId))
    for (const p of x.people) expect(org.has(p.e.employeeId)).toBe(true)
    expect(x.people.length).toBeLessThan(m.people.length)
  })
})
