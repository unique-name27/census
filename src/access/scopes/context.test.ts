/**
 * What each scope does to every dataset (docs/ROLES-V2.md 2.3, 2.4 and 8.8 test 3), through
 * `buildContext` on the sample: every row of every dataset in `ctx.data` is inside the scope (unit:
 * every employee's business unit; region: every employee's location in the region's sites; reqs:
 * every req's recruiter, every candidate's req, every onboarding task's application or matched
 * pre-hire; the emptied datasets empty); `ctx.all` is untouched; `isCompany` is false; a missing or
 * gone pick holds nobody. Plus the records guard and the pay flags the context sets.
 */
import { describe, expect, it } from 'vitest'
import { sampleCtx, sampleData } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import type { Filters } from '@/data/scope'
import { onboardingBase } from '@/views/onboarding/engine/base'
import type { AccessInput } from '../context'
import { MODES, type Mode, NO_PICKS, PAY_OF } from '../modes'
import { inScope, personInScope, rowsInScope } from './records'
import { recruiterKey } from './reqs'

const SE = 'Silicon Engineering'
const RECRUITER = 'Agnieszka Nielsen'
const hr = sampleCtx()

const ctxFor = (access: AccessInput, filters: Partial<Filters> = {}, showPay = false): AnalyticsContext =>
  sampleCtx({ access, filters, showPay, showImmigration: true })

const unitCtx = ctxFor({ mode: 'hrbp-unit', picks: { unit: SE } })
const regionCtx = ctxFor({ mode: 'hrbp-region', picks: { region: 'APAC' } })
const recCtx = ctxFor({ mode: 'recruiter', picks: { recruiter: { name: RECRUITER, id: null } } })

const APAC = ['Bengaluru', 'Ho Chi Minh City', 'Hsinchu', 'Shanghai']

/** Every dataset has the rows the HR context's `all` has: `all` is never narrowed. */
function expectAllUntouched(ctx: AnalyticsContext): void {
  for (const k of DATASET_KEYS) expect(ctx.all[k], k).toBe(hr.all[k])
}

describe('unit (HRBP for a business unit)', () => {
  const d = unitCtx.data
  const members = new Set(hr.all.employees.filter((e) => e.businessUnit === SE).map((e) => e.employeeId))
  const inUnit = (id: string | null | undefined) => !!id && members.has(id)

  it('holds the unit through the pinned filter', () => {
    expect(unitCtx.access.scope?.kind).toBe('unit')
    expect(unitCtx.access.unset).toBe(false)
    expect(unitCtx.filters.businessUnit).toEqual([SE])
    expect(unitCtx.isCompany).toBe(false)
    expect(unitCtx.scopeLabel).toBe(SE)
    expectAllUntouched(unitCtx)
  })

  it('keeps every row of every dataset inside the unit', () => {
    expect(d.employees.length).toBeGreaterThan(500)
    for (const e of d.employees) expect(e.businessUnit, e.employeeId).toBe(SE)
    for (const k of ['jobChanges', 'reviews', 'learning', 'comp', 'rightToWork', 'transactions'] as const)
      for (const r of d[k] as { employeeId: string }[]) expect(inUnit(r.employeeId), k).toBe(true)
    for (const r of d.requisitions) expect(r.businessUnit, r.reqId).toBe(SE)
    const reqIds = new Set(d.requisitions.map((r) => r.reqId))
    for (const c of d.candidates) expect(reqIds.has(c.reqId), c.applicationId).toBe(true)
    // A case with an unknown requester is left out.
    for (const c of d.cases) expect(inUnit(c.requesterId), c.caseId).toBe(true)
    for (const s of d.succession) expect(inUnit(s.incumbentId)).toBe(true)
    for (const p of d.hiringPlan) expect(p.businessUnit).toBe(SE)
    const apps = new Set(d.candidates.map((c) => c.applicationId))
    for (const t of d.onboardingTasks)
      expect(inUnit(t.employeeId) || apps.has(t.applicationId ?? '')).toBe(true)
    expect(d.surveyItems).toBe(hr.all.surveyItems)
  })

  it('narrows inside the unit and says so on the scope line', () => {
    const c = ctxFor(
      { mode: 'hrbp-unit', picks: { unit: SE } },
      { location: ['Munich'], modes: { location: 'exclude' } },
    )
    expect(c.scopeLabel).toBe(`${SE}, not Munich`)
    for (const e of c.data.employees) expect(e.businessUnit === SE && e.location !== 'Munich').toBe(true)
    // A link for another unit opens inside this one.
    const other = ctxFor({ mode: 'hrbp-unit', picks: { unit: SE } }, { businessUnit: ['Corporate'] })
    expect(other.filters.businessUnit).toEqual([SE])
  })
})

describe('region (HRBP for a region)', () => {
  const d = regionCtx.data
  const at = new Set(APAC)
  const members = new Set(hr.all.employees.filter((e) => at.has(e.location)).map((e) => e.employeeId))

  it('holds the region through the pinned location filter', () => {
    expect(regionCtx.access.scope).toMatchObject({ kind: 'region', region: 'APAC', sites: APAC })
    expect(regionCtx.filters.location).toEqual(APAC)
    expect(regionCtx.isCompany).toBe(false)
    expect(regionCtx.scopeLabel).toBe('APAC')
    expectAllUntouched(regionCtx)
  })

  it('keeps every row of every dataset inside the region', () => {
    expect(d.employees.length).toBeGreaterThan(400)
    for (const e of d.employees) expect(at.has(e.location), e.employeeId).toBe(true)
    for (const k of ['jobChanges', 'reviews', 'learning', 'comp', 'rightToWork', 'transactions'] as const)
      for (const r of d[k] as { employeeId: string }[]) expect(members.has(r.employeeId), k).toBe(true)
    for (const r of d.requisitions) expect(at.has(r.location ?? ''), r.reqId).toBe(true)
    for (const c of d.cases) {
      const known = !!c.requesterId && hr.org.byId.has(c.requesterId)
      expect(known ? members.has(c.requesterId!) : at.has(c.location ?? ''), c.caseId).toBe(true)
    }
    for (const p of d.hiringPlan) expect(at.has(p.location ?? '')).toBe(true)
    for (const s of d.succession) expect(members.has(s.incumbentId)).toBe(true)
  })

  it('narrows to sites and other filters, and names them after the region', () => {
    const c = ctxFor(
      { mode: 'hrbp-region', picks: { region: 'APAC' } },
      { location: ['Bengaluru'], level: ['L4'] },
    )
    expect(c.scopeLabel).toBe('APAC: Bengaluru, L4')
    for (const e of c.data.employees) expect(e.location === 'Bengaluru' && e.level === 'L4').toBe(true)
  })
})

describe('reqs (Recruiter)', () => {
  const s = recCtx.access.scope
  const d = recCtx.data

  it("holds one recruiter's reqs after the filters, with no filter form", () => {
    expect(s?.kind).toBe('reqs')
    if (s?.kind !== 'reqs') return
    expect(s.label).toBe(`${RECRUITER}'s reqs`)
    expect(recCtx.filters).toEqual(hr.filters)
    expect(recCtx.isCompany).toBe(false)
    expect(recCtx.scopeLabel).toBe(`${RECRUITER}'s reqs`)
    expectAllUntouched(recCtx)
    expect(s.openReqs).toBe(d.requisitions.filter((r) => r.status === 'Open').length)
    expect(s.size).toBe(d.candidates.length)
  })

  it("keeps the recruiter's reqs, their candidates, tasks and matched starts, and empties the rest", () => {
    if (s?.kind !== 'reqs') throw new Error('no reqs scope')
    expect(d.requisitions.length).toBeGreaterThan(10)
    for (const r of d.requisitions) expect(recruiterKey(r.recruiter), r.reqId).toBe(recruiterKey(RECRUITER))
    const reqIds = new Set(d.requisitions.map((r) => r.reqId))
    for (const c of d.candidates) expect(reqIds.has(c.reqId), c.applicationId).toBe(true)
    for (const t of d.onboardingTasks)
      expect(s.appIds.has(t.applicationId ?? '') || s.startIds.has(t.employeeId ?? '')).toBe(true)
    for (const e of d.employees) if (e.hireDate > recCtx.asOf) expect(s.startIds.has(e.employeeId)).toBe(true)
    for (const p of d.hiringPlan) expect(reqIds.has(p.reqId ?? '')).toBe(true)
    const kept = new Set<DatasetKey>([
      'employees',
      'requisitions',
      'candidates',
      'onboardingTasks',
      'hiringPlan',
    ])
    for (const k of DATASET_KEYS) if (!kept.has(k)) expect(d[k], k).toEqual([])
    // The roster stays for names (hiring managers, owners).
    expect(d.employees.length).toBeGreaterThan(1000)
  })

  it('every filter works inside the reqs', () => {
    const c = ctxFor(
      { mode: 'recruiter', picks: { recruiter: { name: RECRUITER, id: null } } },
      { location: ['Hsinchu'] },
    )
    for (const r of c.data.requisitions)
      expect(r.location === 'Hsinchu' && recruiterKey(r.recruiter) === recruiterKey(RECRUITER)).toBe(true)
    expect(c.scopeLabel).toBe(`${RECRUITER}'s reqs, Hsinchu`)
  })

  it('"Every recruiter" has no scope: every req', () => {
    const every = ctxFor({ mode: 'recruiter', picks: { recruiter: { name: '*', id: null } } })
    expect(every.access.scope).toBeNull()
    expect(every.access.unset).toBe(false)
    expect(every.data.requisitions).toEqual(hr.data.requisitions)
  })
})

describe('a pick that is missing or gone holds nobody, never the whole company', () => {
  const cases: [Mode, AccessInput['picks'], string][] = [
    ['hrbp-unit', {}, 'No business unit picked'],
    ['hrbp-unit', { unit: 'Quantum Division' }, 'No business unit picked'],
    ['hrbp-region', {}, 'No region picked'],
    ['hrbp-region', { region: 'Antarctica' }, 'No region picked'],
    ['recruiter', {}, 'No recruiter picked'],
    ['recruiter', { recruiter: { name: 'Nobody Here', id: null } }, 'No recruiter picked'],
    ['manager', {}, 'No manager picked'],
  ]
  for (const [mode, picks, label] of cases)
    it(`${mode} ${JSON.stringify(picks)}`, () => {
      const c = ctxFor({ mode, picks })
      expect(c.access.unset).toBe(true)
      expect(c.scopeLabel).toBe(label)
      expect(c.isCompany).toBe(false)
      // Recruiter mode keeps the roster for names; every other scope holds nobody.
      if (mode !== 'recruiter') expect(c.data.employees).toEqual([])
      else expect(c.data.employees.filter((e) => e.hireDate > c.asOf)).toEqual([])
      expect(c.data.requisitions).toEqual([])
      expect(c.data.candidates).toEqual([])
      expectAllUntouched(c)
    })
})

describe('the records guard keeps to every scope', () => {
  const someone = (keep: (id: string) => boolean) => hr.all.employees.find((e) => keep(e.employeeId))!

  it('unit and region: employee-keyed rows by member, reqs by their own fields', () => {
    for (const c of [unitCtx, regionCtx]) {
      const s = c.access.scope!
      if (s.kind !== 'unit' && s.kind !== 'region') throw new Error('scope')
      const inside = someone((id) => s.memberIds.has(id))
      const outside = someone((id) => !s.memberIds.has(id))
      expect(personInScope(inside.employeeId, c.access)).toBe(true)
      expect(personInScope(outside.employeeId, c.access)).toBe(false)
      expect(inScope('employees', inside, c)).toBe(true)
      expect(inScope('employees', outside, c)).toBe(false)
      const spec = { kind: 'employees' as const, title: 'People', rows: hr.all.employees }
      const { rows, leftOut } = rowsInScope(spec, c)
      expect(rows.length).toBe(s.memberIds.size)
      expect(leftOut).toBe(hr.all.employees.length - s.memberIds.size)
      for (const r of hr.all.requisitions)
        expect(inScope('requisitions', r, c)).toBe(c.data.requisitions.includes(r))
      expect(inScope('surveyGroups', {}, c)).toBe(true)
    }
  })

  it('reqs: the reqs, their candidates and matched starts only; other kinds are left out', () => {
    const s = recCtx.access.scope!
    if (s.kind !== 'reqs') throw new Error('scope')
    for (const r of hr.all.requisitions.slice(0, 200))
      expect(inScope('requisitions', r, recCtx)).toBe(s.reqIds.has(r.reqId))
    for (const c of hr.all.candidates.slice(0, 500))
      expect(inScope('candidates', c, recCtx)).toBe(s.reqIds.has(c.reqId))
    expect(inScope('reviews', hr.all.reviews[0], recCtx)).toBe(false)
    expect(inScope('cases', hr.all.cases[0], recCtx)).toBe(false)
    const start = [...s.startIds][0]
    if (start) expect(personInScope(start, recCtx.access)).toBe(true)
    expect(personInScope(hr.all.employees[0].employeeId, recCtx.access)).toBe(
      s.startIds.has(hr.all.employees[0].employeeId),
    )
  })

  it('lets everything through without a scope', () => {
    expect(inScope('reviews', hr.all.reviews[0], hr)).toBe(true)
    expect(personInScope('anyone', hr.access)).toBe(true)
  })
})

describe('pay per mode in the context', () => {
  it('sets showPay only in the switch modes with the switch on, and showCost for those and Finance', () => {
    for (const mode of MODES)
      for (const on of [false, true]) {
        const c = ctxFor({ mode, picks: { ...NO_PICKS, managerId: null, unit: SE, region: 'APAC' } }, {}, on)
        expect(c.showPay, `${mode} ${on}`).toBe(PAY_OF[mode] === 'switch' && on)
        expect(c.showCost, `${mode} ${on}`).toBe((PAY_OF[mode] === 'switch' && on) || mode === 'finance')
        expect(c.access.pay, mode).toBe(PAY_OF[mode])
      }
  })
})

describe("a recruiter's starts are Onboarding's starts", () => {
  it('matches pre-hires to accepted offers on the reqs exactly as Upcoming starts does', () => {
    const s = recCtx.access.scope
    if (s?.kind !== 'reqs') throw new Error('scope')
    const reqIds = s.reqIds
    const fromOnboarding = new Set(
      onboardingBase(hr)
        .upcoming.starts.filter((p) => p.employee && p.candidate && reqIds.has(p.candidate.reqId))
        .map((p) => p.employee!.employeeId),
    )
    expect(s.startIds).toEqual(fromOnboarding)
    expect(fromOnboarding.size).toBeGreaterThan(0)
    // Recruiter mode's own Upcoming starts are those starts and the reqs' accepted offers.
    const own = onboardingBase(recCtx).upcoming.starts
    for (const p of own)
      expect(p.candidate ? reqIds.has(p.candidate.reqId) : s.startIds.has(p.key)).toBe(true)
    expect(sampleData().employees).toBe(hr.all.employees)
  })
})
