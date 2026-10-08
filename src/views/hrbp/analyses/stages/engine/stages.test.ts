/**
 * Engineering by stage on small hand-built data (docs/ANALYSES.md, 4.4, 4.7 and 7.1): who counts
 * and in which stage, contractors always apart, FTE, hiring in flight never counted twice, the
 * ratios and their references, inferred req functions, the department fallback, suppression,
 * every setting changing the number it says it changes, and drills that list exactly what was
 * counted.
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import type { Candidate, Datasets, Employee, HiringPlanLine, Requisition } from '@/data/schema'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { metricsWith } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { datasets } from '../../../engine/fixtures'
import { stagesMissing } from '.'
import { fteOf, NOT_MAPPED, stagesBase } from './base'
import { quarterEnds } from './capacity'
import { plannedWindow } from './hiring'
import { priorQuarterEnd } from './kpis'
import { SID } from './metrics'
import { type StagesModel, stagesModelFor } from './model'
import { inSentence } from './wording'

const AS_OF = '2026-09-30'
let seq = 0

function person(patch: Partial<Employee> = {}): Employee {
  seq++
  return {
    employeeId: `S${String(seq).padStart(5, '0')}`,
    name: `Person ${seq}`,
    jobTitle: 'Engineer',
    jobFamily: 'Silicon Engineering',
    jobFunction: 'Design Verification',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'San Jose',
    country: 'United States',
    level: 'L3',
    managerId: null,
    hireDate: '2020-01-06',
    terminationDate: null,
    terminationType: null,
    terminationReason: null,
    regrettable: null,
    employmentType: 'Employee',
    ...patch,
  }
}
const many = (n: number, patch: Partial<Employee> = {}) => Array.from({ length: n }, () => person(patch))

const req = (patch: Partial<Requisition> & Pick<Requisition, 'reqId'>): Requisition => ({
  jobTitle: 'Engineer',
  businessUnit: 'Silicon Engineering',
  department: 'Design Verification',
  location: 'San Jose',
  level: 'L3',
  openedDate: '2026-07-01',
  status: 'Open',
  reqType: 'New',
  priority: null,
  openings: 1,
  ...patch,
})

const line = (patch: Partial<HiringPlanLine> & Pick<HiringPlanLine, 'period'>): HiringPlanLine => ({
  businessUnit: 'Silicon Engineering',
  department: 'Design Verification',
  plannedHires: 1,
  reqId: null,
  ...patch,
})

const cand = (patch: Partial<Candidate> & Pick<Candidate, 'applicationId' | 'reqId'>): Candidate => ({
  candidateName: 'Candidate',
  source: 'Referral',
  currentStage: 'Offer',
  status: 'Hired',
  appliedDate: '2026-06-01',
  ...patch,
})

function ctxOf(partial: Partial<Datasets>, o: { metrics?: MetricsApi; filters?: Partial<Filters> } = {}) {
  const data = datasets(partial)
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: data[k].length }]),
  ) as unknown as Record<DatasetKey, SourceMeta>
  return buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...o.filters },
    asOfOverride: AS_OF,
    showPay: false,
    ...(o.metrics ? { metrics: o.metrics } : {}),
  })
}

/** The company: verification, RTL design, analog layout, physical verification, an unmapped function and sales. */
function company(): Partial<Datasets> {
  seq = 0
  const employees = [
    ...many(6, { location: 'Bengaluru' }),
    person({ location: 'San Jose' }),
    ...many(2, { employmentType: 'Contractor', fte: 0.5 }),
    person({ employmentType: 'Intern' }),
    ...many(5, { jobFunction: 'Design RTL', department: 'Digital Design' }),
    person({ jobFunction: 'Design RTL', department: 'Digital Design', fte: 0.6 }),
    ...many(2, { jobFunction: 'Analog Layout', department: 'Analog & Mixed-Signal' }),
    ...many(3, { jobFunction: 'Physical Verification', department: 'Physical Design' }),
    ...many(5, {
      jobFunction: 'Physical Verification',
      department: 'Physical Design',
      employmentType: 'Contractor',
    }),
    ...many(2, { jobFunction: 'Widgets', department: 'Widgets' }),
    ...many(3, {
      jobFamily: 'Go-to-Market',
      jobFunction: 'Sales',
      department: 'Sales',
      businessUnit: 'Go-to-Market',
    }),
    // A leaver and a pre-hire: neither is in today's capacity.
    person({ terminationDate: '2026-06-01', terminationType: 'Voluntary', regrettable: false }),
    person({ name: 'New Starter', hireDate: '2026-10-12' }),
  ]
  return { employees }
}

const row = (m: StagesModel, key: string) => m.capacity.find((r) => r.key === key)
const kpi = (m: StagesModel, id: string) => m.kpis.find((k) => k.id === id)
const rowsOf = (src: unknown): readonly unknown[] => resolveDrill(src as never)?.rows ?? []

describe('who counts and where', () => {
  it('counts each person in the stage of their job function, contractors apart, interns listed only', () => {
    const m = stagesModelFor(ctxOf(company()), null)
    expect(row(m, 'verification')).toMatchObject({ employees: 7, contractors: 2, interns: 1 })
    expect(row(m, 'rtl')).toMatchObject({ employees: 6, contractors: 0 })
    // Analog layout is analog and mixed-signal design, not physical design.
    expect(row(m, 'ams')).toMatchObject({ employees: 2 })
    // Physical verification is signoff, not design verification.
    expect(row(m, 'signoff')).toMatchObject({ employees: 3, contractors: 5 })
    expect(row(m, 'physical')).toMatchObject({ employees: 0 })
    // A function no keyword places is Not mapped, shown because it has people.
    expect(row(m, NOT_MAPPED)).toMatchObject({ employees: 2, stage: 'Not mapped' })
    // Sales is outside engineering; the leaver and the pre-hire are not active today.
    const total = m.capacity.reduce((s, r) => s + r.employees, 0)
    expect(total).toBe(20)
    // The nine lifecycle stages and the two across it always show, in order.
    expect(m.capacity.slice(0, 11).map((r) => r.key)).toEqual([
      'architecture',
      'rtl',
      'ams',
      'verification',
      'dft',
      'physical',
      'signoff',
      'postSilicon',
      'productTest',
      'software',
      'shared',
    ])
    expect(m.capacity.filter((r) => r.across).map((r) => r.key)).toEqual(['software', 'shared', NOT_MAPPED])
  })

  it('keeps contractors their own series whatever People stats counts in headcount', () => {
    const on = stagesModelFor(
      ctxOf(company(), { metrics: metricsWith({ 'hrbp.headcount.employees': { countContractors: true } }) }),
      null,
    )
    expect(row(on, 'verification')).toMatchObject({ employees: 7, contractors: 2 })
  })

  it('counts interns with employees only when that setting is on', () => {
    const m = stagesModelFor(
      ctxOf(company(), { metrics: metricsWith({ [SID.capacity]: { countInterns: true } }) }),
      null,
    )
    expect(row(m, 'verification')).toMatchObject({ employees: 8, interns: 1 })
    expect(m.kpis[0].definition).toContain('Changed setting: Count interns with employees On (default Off).')
    // The ratios and the share with a saved stage depend on who counts: their definitions say so too.
    for (const id of ['stages-verification-ratio', 'stages-mapped'])
      expect(kpi(m, id)?.definition, id).toContain('Count interns with employees On (default Off)')
    expect(kpi(m, 'stages-fte')?.value).toBe(20.6)
  })

  it('never matches a keyword inside another word', () => {
    const d = company()
    d.employees?.push(...many(5, { jobFunction: 'Staff Tooling', department: 'Tools' }))
    const m = stagesModelFor(ctxOf(d), null)
    // "sta" is not inside "Staff": the function stays Not mapped.
    expect(row(m, NOT_MAPPED)?.employees).toBe(7)
  })

  it('reads FTE with blanks as 1 and percentages as fractions', () => {
    expect(fteOf({ fte: null })).toBe(1)
    expect(fteOf({ fte: undefined })).toBe(1)
    expect(fteOf({ fte: 0.5 })).toBe(0.5)
    expect(fteOf({ fte: 80 })).toBe(0.8)
    expect(fteOf({ fte: 0 })).toBe(1)
    const m = stagesModelFor(ctxOf(company()), null)
    expect(row(m, 'verification')).toMatchObject({ employeeFte: 7, contractorFte: 1 })
    expect(row(m, 'rtl')?.employeeFte).toBeCloseTo(5.6, 10)
    expect(kpi(m, 'stages-fte')?.value).toBeCloseTo(19.6, 10)
    expect(kpi(m, 'stages-fte')?.note).toBe('20 employees, 1 part time')
  })

  it('falls back to engineering departments when no job family counts as engineering', () => {
    seq = 0
    const employees = [
      ...many(6, { jobFamily: null, jobFunction: 'Design Verification', department: 'Design Verification' }),
      ...many(3, {
        jobFamily: null,
        jobFunction: 'Sales',
        department: 'Sales',
        businessUnit: 'Go-to-Market',
      }),
    ]
    const ctx = ctxOf({ employees })
    expect(stagesBase(ctx).fallback).toBe(true)
    const m = stagesModelFor(ctx, null)
    expect(m.fallback).toBe(true)
    expect(row(m, 'verification')?.employees).toBe(6)
    expect(m.capacity.reduce((s, r) => s + r.employees, 0)).toBe(6)
    expect(stagesMissing(ctx).map((x) => x.id)).toContain('engineeringFamily')
    expect(stagesMissing(ctxOf(company())).map((x) => x.id)).not.toContain('engineeringFamily')
  })
})

describe('hiring in flight', () => {
  function withHiring(): Partial<Datasets> {
    const d = company()
    d.requisitions = [
      req({ reqId: 'R1', openings: 2 }),
      req({ reqId: 'R2', status: 'On hold' }),
      req({ reqId: 'R3', department: 'Sales', businessUnit: 'Go-to-Market' }),
      req({ reqId: 'R4', status: 'Filled', filledDate: '2026-09-01', closedDate: '2026-09-01' }),
      req({ reqId: 'R5', department: 'Digital Design', openedDate: '2026-03-01' }),
    ]
    d.candidates = [
      // The pre-hire's accepted offer: one start, not two.
      cand({
        applicationId: 'A1',
        reqId: 'R4',
        candidateName: 'New Starter',
        hiredDate: '2026-09-01',
        startDate: '2026-10-12',
      }),
      // An accepted offer with no pre-hire row: its req's department places it.
      cand({
        applicationId: 'A2',
        reqId: 'R5',
        candidateName: 'Other Person',
        hiredDate: '2026-09-10',
        startDate: '2026-11-02',
      }),
    ]
    d.hiringPlan = [
      line({ period: '2026-11-01', plannedHires: 3 }),
      // On an open req: covered, so not "planned, no req".
      line({ period: '2026-11-01', reqId: 'R1' }),
      line({ period: '2027-06-01', plannedHires: 2 }),
      line({ period: '2026-12-01', department: 'Sales', businessUnit: 'Go-to-Market' }),
    ]
    return d
  }

  it('counts upcoming starts once, openings of open reqs and planned lines with no req', () => {
    const m = stagesModelFor(ctxOf(withHiring()), null)
    const v = m.hiring.find((h) => h.key === 'verification')!
    expect(v).toMatchObject({ accepted: 1, open: 2, planned: 3, total: 6, today: 7 })
    expect(v.ofToday).toBeCloseTo(6 / 7, 12)
    const rtl = m.hiring.find((h) => h.key === 'rtl')!
    expect(rtl).toMatchObject({ accepted: 1, open: 1, planned: 0 })
    // The accepted offer without a pre-hire and the req take their department's job function.
    expect(rtl.records.starts[0].place).toMatchObject({
      jobFunction: 'Design RTL',
      source: 'Inferred from department',
    })
    expect(rtl.records.reqs[0].place).toMatchObject({
      jobFunction: 'Design RTL',
      source: 'Inferred from department',
    })
    // Sales is not engineering; the on-hold req is noted, not counted.
    expect(m.flight.reqs.map((r) => r.req.reqId).sort()).toEqual(['R1', 'R5'])
    expect(m.flight.onHold.map((r) => r.req.reqId)).toEqual(['R2'])
    expect(kpi(m, 'stages-open-reqs')).toMatchObject({ value: 3, note: '1 on hold, not counted' })
    expect(kpi(m, 'stages-planned')).toMatchObject({ value: 3, note: 'Starts Oct 2026 to Mar 2027' })
  })

  it('reads the planned starts window from its setting', () => {
    const ctx = ctxOf(withHiring(), { metrics: metricsWith({ [SID.hiring]: { planMonths: 12 } }) })
    const m = stagesModelFor(ctx, null)
    expect(m.hiring.find((h) => h.key === 'verification')?.planned).toBe(5)
    expect(plannedWindow(AS_OF, 12)).toEqual({ start: '2026-10-01', end: '2027-09-30', months: 12 })
    expect(plannedWindow('2026-09-15', 6)).toEqual({ start: '2026-09-01', end: '2027-02-28', months: 6 })
  })

  it('compares open reqs with the prior quarter end', () => {
    expect(priorQuarterEnd(AS_OF)).toBe('2026-06-30')
    expect(priorQuarterEnd('2026-08-15')).toBe('2026-06-30')
    // R5 was open on 30 Jun; R1 opened in July.
    const m = stagesModelFor(ctxOf(withHiring()), null)
    expect(kpi(m, 'stages-open-reqs')?.delta).toBe(2)
  })

  it('drills each segment to exactly the records it counts', () => {
    const m = stagesModelFor(ctxOf(withHiring()), null)
    for (const k of m.kpis) {
      if (k.value == null || !k.drill || k.format !== 'int') continue
      const spec = resolveDrill(k.drill)
      if (k.id === 'stages-open-reqs')
        expect(
          ((spec?.rows ?? []) as Requisition[]).reduce((s, r) => s + r.openings, 0),
          k.id,
        ).toBe(k.value)
      else if (k.id === 'stages-planned')
        expect(
          ((spec?.rows ?? []) as HiringPlanLine[]).reduce((s, l) => s + l.plannedHires, 0),
          k.id,
        ).toBe(k.value)
      else expect(spec?.rows.length, k.id).toBe(k.value)
    }
  })
})

describe('ratios and references', () => {
  it('counts employees only by default, and contractors in both stages while that setting is on', () => {
    const off = stagesModelFor(ctxOf(company()), null)
    const w = off.ratios.find((r) => r.id === 'verification')!
    expect(w).toMatchObject({ top: 7, bottom: 6, contractorsTop: 2, contractorsBottom: 0, status: 'below' })
    expect(w.value).toBeCloseTo(7 / 6, 12)
    // The ratio with contractors is still there for the detail, the tile note and the table.
    expect(w.withContractors).toBeCloseTo(9 / 6, 12)
    const f = off.findings.find((x) => x.id === 'stages-below-verification')!
    expect(f.detail).toBe(
      '7 engineers in design verification and 2 contractors for 6 in RTL design; 1.5 with contractors.',
    )
    expect(kpi(off, 'stages-verification-ratio')?.note).toBe('Below the 1.5 reference; 1.5 with contractors')
    const on = stagesModelFor(
      ctxOf(company(), { metrics: metricsWith({ [SID.ratios]: { ratioContractors: true } }) }),
      null,
    )
    const v = on.ratios.find((r) => r.id === 'verification')!
    expect(v).toMatchObject({
      top: 9,
      bottom: 6,
      reference: 1.5,
      status: 'near',
      statusLabel: 'Near reference',
    })
    expect(v.value).toBeCloseTo(1.5, 12)
    expect(v.withContractors).toBeCloseTo(1.5, 12)
    expect(kpi(on, 'stages-verification-ratio')?.note).toBe('Reference 1.5')
    // A reference of 0 is none: no tick, no status.
    expect(off.ratios.find((r) => r.id === 'dft')).toMatchObject({ reference: null, status: 'none' })
    // Nobody post-silicon over the pre-silicon stages: 0, not hidden (the denominator is large).
    expect(off.ratios.find((r) => r.id === 'postSilicon')?.value).toBe(0)
  })

  it('says why a ratio has no value: too few below the line, or nobody there', () => {
    const raised = metricsWith({ 'privacy.anonymity': { minGroup: 10 } })
    const few = stagesModelFor(ctxOf(company(), { metrics: raised }), null)
    const v = few.ratios.find((r) => r.id === 'verification')!
    expect(v).toMatchObject({
      value: null,
      withContractors: null,
      status: 'na',
      statusLabel: 'Too few people to compare',
    })
    expect(kpi(few, 'stages-verification-ratio')).toMatchObject({ value: null, suppressed: true })
    expect(few.findings.some((x) => x.id.startsWith('stages-below'))).toBe(false)
    const none = stagesModelFor(ctxOf(company(), { filters: { department: ['Design Verification'] } }), null)
    const n = none.ratios.find((r) => r.id === 'verification')!
    expect(n).toMatchObject({
      bottom: 0,
      value: null,
      status: 'na',
      statusLabel: 'No one in RTL design in this scope',
    })
    expect(kpi(none, 'stages-verification-ratio')).toMatchObject({
      value: null,
      suppressed: false,
      note: 'No one in RTL design in this scope',
    })
  })

  it('flags a ratio below its reference by the below-by share, and not otherwise', () => {
    const off = metricsWith({ [SID.ratios]: { ratioContractors: false } })
    const m = stagesModelFor(ctxOf(company(), { metrics: off }), null)
    const f = m.findings.find((x) => x.id === 'stages-below-verification')
    expect(f?.title).toBe('Design verification has 1.17 engineers per RTL designer, below the 1.5 reference.')
    expect(f?.severity).toBe('warning')
    expect(rowsOf(f?.drill)).toHaveLength(13)
    expect(m.notes.capacity[0]).toEqual({ at: 'verification', text: '1.17 per RTL designer' })
    const wider = metricsWith({ [SID.ratios]: { ratioContractors: false }, [SID.findings]: { belowBy: 0.3 } })
    const n = stagesModelFor(ctxOf(company(), { metrics: wider }), null)
    expect(n.findings.some((x) => x.id === 'stages-below-verification')).toBe(false)
    expect(n.ratios.find((r) => r.id === 'verification')?.status).toBe('near')
    const none = metricsWith({ [SID.ratios]: { ratioContractors: false, verificationReference: 0 } })
    const z = stagesModelFor(ctxOf(company(), { metrics: none }), null)
    expect(z.ratios.find((r) => r.id === 'verification')?.status).toBe('none')
    expect(z.findings.some((x) => x.id.startsWith('stages-below'))).toBe(false)
    const dft = stagesModelFor(
      ctxOf(company(), { metrics: metricsWith({ [SID.ratios]: { dftReference: 0.5 } }) }),
      null,
    )
    expect(dft.ratios.find((r) => r.id === 'dft')).toMatchObject({ reference: 0.5, status: 'below' })
    expect(dft.ratios.find((r) => r.id === 'dft')?.value).toBe(0)
  })

  it('reads every reference from its own setting', () => {
    const refs = {
      physicalReference: 2,
      postSiliconReference: 0.4,
      softwareReference: 0.7,
    }
    const m = stagesModelFor(ctxOf(company(), { metrics: metricsWith({ [SID.ratios]: refs }) }), null)
    expect(m.ratios.find((r) => r.id === 'physical')?.reference).toBe(2)
    expect(m.ratios.find((r) => r.id === 'postSilicon')?.reference).toBe(0.4)
    expect(m.ratios.find((r) => r.id === 'software')?.reference).toBe(0.7)
  })
})

describe('the readout', () => {
  /** Bengaluru: high voluntary attrition, and most of verification. */
  function attrition(): Partial<Datasets> {
    const d = company()
    d.employees?.push(
      ...many(4, {
        jobFunction: 'Sales',
        jobFamily: 'Go-to-Market',
        department: 'Sales',
        location: 'Bengaluru',
      }),
      ...many(3, {
        location: 'Bengaluru',
        hireDate: '2021-03-01',
        terminationDate: '2026-05-04',
        terminationType: 'Voluntary',
        regrettable: false,
      }),
      ...many(30, {
        jobFunction: 'Sales',
        jobFamily: 'Go-to-Market',
        department: 'Sales',
        location: 'Austin',
      }),
    )
    return d
  }

  it('flags a stage concentrated where voluntary attrition is high, with Focus on the site', () => {
    const m = stagesModelFor(ctxOf(attrition()), null)
    const f = m.findings.find((x) => x.id === 'stages-concentrated-Bengaluru')!
    expect(f.title).toMatch(
      /^86% of design verification sits in Bengaluru, where voluntary attrition is \d+(\.\d)?%\.$/,
    )
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
    expect(rowsOf(f.drill)).toHaveLength(6)
    expect(m.notes.capacity).toContainEqual({ at: 'verification', text: '86% in Bengaluru' })
    // Settings that would stop it.
    const high = stagesModelFor(
      ctxOf(attrition(), { metrics: metricsWith({ [SID.findings]: { concentration: 0.9 } }) }),
      null,
    )
    expect(high.findings.some((x) => x.id.startsWith('stages-concentrated'))).toBe(false)
    const gap = stagesModelFor(
      ctxOf(attrition(), { metrics: metricsWith({ [SID.findings]: { attritionGap: 0.5 } }) }),
      null,
    )
    expect(gap.findings.some((x) => x.id.startsWith('stages-concentrated'))).toBe(false)
    // A scope of one site has nothing to compare.
    const one = stagesModelFor(ctxOf(attrition(), { filters: { location: ['Bengaluru'] } }), null)
    expect(one.findings.some((x) => x.id.startsWith('stages-concentrated'))).toBe(false)
  })

  it('notes a contractor-heavy stage, never one with fewer contractors than the minimum', () => {
    const m = stagesModelFor(ctxOf(company()), null)
    const f = m.findings.find((x) => x.id.startsWith('stages-contractors'))
    expect(f?.title).toBe('Contractors are 63% of signoff and tape-out.')
    expect(rowsOf(f?.drill)).toHaveLength(5)
    // Verification's 2 of 9 is 22%, but 2 contractors are under the minimum.
    expect(f?.detail).not.toContain('design verification')
    const high = stagesModelFor(
      ctxOf(company(), { metrics: metricsWith({ [SID.findings]: { contractorShare: 0.7 } }) }),
      null,
    )
    expect(high.findings.some((x) => x.id.startsWith('stages-contractors'))).toBe(false)
  })

  it('notes engineers with no stage, then those whose stage is only proposed', () => {
    const m = stagesModelFor(ctxOf(company()), null)
    const f = m.findings.find((x) => x.id === 'stages-not-mapped')!
    expect(f.title).toBe('2 engineers (10%) are in job functions with no stage: Widgets.')
    expect(f.action).toBe('Confirm or change the stage in Settings, Official lists, Job functions.')
    // Every stage of uploaded data with no official list is proposed: the detail says so.
    expect(f.detail).toMatch(/^18 more engineers are in a stage that is only proposed: /)
    expect(rowsOf(f.drill)).toHaveLength(20)
    const loose = stagesModelFor(
      ctxOf(company(), { metrics: metricsWith({ [SID.findings]: { unmappedShare: 0.5 } }) }),
      null,
    )
    expect(loose.findings.find((x) => x.id === 'stages-not-mapped')?.title).toMatch(
      /^18 engineers are in job functions whose stages are only proposed: /,
    )
  })

  it('ranks warnings first and cites the readout metric with its fields', () => {
    const m = stagesModelFor(
      ctxOf(attrition(), { metrics: metricsWith({ [SID.ratios]: { ratioContractors: false } }) }),
      null,
    )
    const order = m.findings.map((f) => f.severity)
    expect(order.indexOf('info')).toBeGreaterThan(order.lastIndexOf('warning'))
    for (const f of m.findings) {
      expect(f.metricId).toBe(SID.findings)
      expect(f.uses?.length).toBeGreaterThan(0)
      expect(f.title).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]|!/)
    }
  })
})

describe('suppression', () => {
  it('hides shares and ratios over fewer people than the minimum', () => {
    seq = 0
    const ctx = ctxOf({
      employees: [...many(2), ...many(2, { jobFunction: 'Design RTL', department: 'Digital Design' })],
    })
    const m = stagesModelFor(ctx, null)
    expect(row(m, 'verification')?.share).toBeNull()
    expect(row(m, 'verification')?.contractorShare).toBeNull()
    expect(m.ratios.every((r) => r.value == null)).toBe(true)
    expect(kpi(m, 'stages-mapped')).toMatchObject({ value: null, suppressed: true })
    expect(kpi(m, 'stages-verification-ratio')).toMatchObject({ value: null, suppressed: true })
    // A heatmap row under the minimum shows no shares, only counts.
    for (const c of m.where.cells) expect(c.share).toBeNull()
    expect(m.findings.filter((f) => f.id.startsWith('stages-concentrated'))).toEqual([])
  })
})

describe('the figures', () => {
  it('lay out where each stage is staffed by site and business unit, every grouping in the data', () => {
    const m = stagesModelFor(ctxOf(company()), null)
    expect(new Set(m.where.cells.map((c) => c.groupedBy))).toEqual(new Set(['Site', 'Business unit']))
    const v = m.where.cells.filter((c) => c.dim === 'location' && c.stageKey === 'verification')
    // Columns run largest site first (San Jose has the most engineers).
    expect(v.map((c) => [c.group, c.people])).toEqual([
      ['San Jose', 1],
      ['Bengaluru', 6],
    ])
    expect(v.reduce((s, c) => s + (c.share ?? 0), 0)).toBeCloseTo(1, 12)
    for (const c of m.where.cells) expect(c.records).toHaveLength(c.people)
  })

  it('count each stage at the last 8 quarter ends in the current job function', () => {
    expect(quarterEnds(AS_OF)).toEqual([
      '2024-12-31',
      '2025-03-31',
      '2025-06-30',
      '2025-09-30',
      '2025-12-31',
      '2026-03-31',
      '2026-06-30',
      '2026-09-30',
    ])
    const m = stagesModelFor(ctxOf(company()), null)
    const v = m.trend.find((t) => t.key === 'verification')!
    // The leaver of 1 Jun 2026 is in every point before it.
    expect(v.values).toEqual([8, 8, 8, 8, 8, 8, 7, 7])
    for (const t of m.trend)
      t.records.forEach((r, i) => {
        expect(r).toHaveLength(t.values[i])
      })
    expect(m.trend.some((t) => (t.key as string) === NOT_MAPPED)).toBe(false)
  })

  it('list the job functions behind the stages with how each stage was set', () => {
    const m = stagesModelFor(ctxOf(company()), null)
    const by = new Map(m.functions.map((f) => [f.jobFunction, f]))
    expect(by.get('Design Verification')).toMatchObject({
      family: 'Silicon Engineering',
      stage: 'Design verification',
      source: 'Proposed',
      employees: 7,
      contractors: 2,
    })
    expect(by.get('Widgets')).toMatchObject({ stage: '', source: 'Not mapped', employees: 2 })
    expect(by.has('Sales')).toBe(false)
  })

  it('scope everything to one job family', () => {
    const d = company()
    d.employees?.push(
      ...many(5, {
        jobFamily: 'Systems & Software Engineering',
        jobFunction: 'Firmware',
        department: 'Firmware',
      }),
    )
    const ctx = ctxOf(d)
    const all = stagesModelFor(ctx, null)
    expect(all.families.map((f) => f.name)).toEqual(['Silicon Engineering', 'Systems & Software Engineering'])
    const sw = stagesModelFor(ctx, 'Systems & Software Engineering')
    expect(sw.capacity.reduce((s, r) => s + r.employees, 0)).toBe(5)
    expect(row(sw, 'software')?.employees).toBe(5)
    expect(stagesModelFor(ctx, 'Systems & Software Engineering')).toBe(sw)
  })
})

describe('wording', () => {
  it('keeps the capitals of abbreviations inside a sentence', () => {
    expect(inSentence('Design verification')).toBe('design verification')
    expect(inSentence('DFT')).toBe('DFT')
    expect(inSentence('RTL design')).toBe('RTL design')
  })
})
