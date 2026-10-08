/**
 * The records panel and the person card in every mode (docs/ROLES-V2.md 2.7, 3.2, 4.12): numbers
 * whose kind the mode does not list are plain, rows outside the scope are left out and said so,
 * the person card is shaped by the mode, Finance's employee lists carry no ratings, exits or pay,
 * and Filter to keeps to the scope or Finance's business unit rule. On the sample.
 */
import { describe, expect, it } from 'vitest'
import type { AccessContext } from '@/access/context'
import { FINANCE_EXPORT_LINE } from '@/access/copy'
import { emptyRegionScope } from '@/access/scopes/region'
import { sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { modeMeta } from '@/lib/export/modeMeta'
import { groupScopes } from './filter'
import { immigrationNote, kindHiddenLine, payAmountsNote, recordsOutsideLine } from './guard'
import { ALL_DRILL_KINDS, drillTarget, listsEveryKind } from './kinds'
import { PREHIRE_ONLY, personCardPlan, personSummary } from './person'
import { buildDrillTable, DRILL_KINDS } from './records'
import { drillSpec } from './types'

const SE = 'Silicon Engineering'
const RECRUITER = 'Agnieszka Nielsen'
const hr = sampleCtx()
const unit = sampleCtx({ access: { mode: 'hrbp-unit', picks: { unit: SE } } })
const region = sampleCtx({ access: { mode: 'hrbp-region', picks: { region: 'APAC' } } })
const rec = sampleCtx({ access: { mode: 'recruiter', picks: { recruiter: { name: RECRUITER, id: null } } } })
const fin = sampleCtx({ access: { mode: 'finance' } })
const boss = [...hr.org.children.entries()].sort((a, b) => b[1].length - a[1].length)[1][0]
const mgr = sampleCtx({ access: { mode: 'manager', picks: { managerId: boss } } })

/**
 * The context with some decisions overridden, so the tests read the card's own rules, not the
 * role tables (the Policies agent's), which change on their own schedule.
 */
function withDecisions(ctx: AnalyticsContext, shown: Record<string, boolean>): AnalyticsContext {
  const base = ctx.access
  const can = (s: string) => shown[s] ?? base.can(s)
  const access: AccessContext = { ...base, can }
  return { ...ctx, access }
}
/** Every person-card surface shown (an HR-like table) in a mode, with these left hidden. */
const allShownBut = (ctx: AnalyticsContext, hide: readonly string[] = []) =>
  withDecisions(
    ctx,
    Object.fromEntries(
      [
        'person:compa-ratio',
        'person:ratings',
        'person:open-cases',
        'person:focus',
        'person:org-chart',
        'pay:amounts',
        'drill:cases',
        'drill:learning',
        'drill:jobChanges',
        'drill:succession',
        'drill:employees',
        'metric:hrbp.attrition.exitReasons',
      ].map((s) => [s, !hide.includes(s)]),
    ),
  )

const someone = (ctx: AnalyticsContext, pick: (id: string) => boolean) => {
  const e = ctx.all.employees.find((x) => !x.terminationDate && x.hireDate <= ctx.asOf && pick(x.employeeId))
  if (!e) throw new Error('no such person in the sample')
  return e
}

describe('hidden-kind numbers', () => {
  const spec = drillSpec({ kind: 'cases', title: 'Open cases', rows: hr.all.cases.slice(0, 3) })
  const only = (kinds: readonly string[]) => ({ can: (s: string) => kinds.some((k) => s === `drill:${k}`) })

  it('keeps every source as given in a mode that lists every kind', () => {
    const dev = sampleCtx({ access: { mode: 'developer' } })
    expect(listsEveryKind(dev.access)).toBe(true)
    const lazy = () => spec
    expect(drillTarget(dev.access, lazy)).toBe(lazy)
    expect(drillTarget(null, lazy)).toBe(lazy)
    expect(drillTarget(dev.access, null)).toBeNull()
    // HR lists every kind too, the Action center's included (docs/ROLES-V2.md 6.3).
    expect(listsEveryKind(hr.access)).toBe(true)
    expect(drillTarget(hr.access, lazy)).toBe(lazy)
  })

  it('makes a number plain when its kind is not listed, and opens it when it is', () => {
    expect(drillTarget(only(['employees']), () => spec)).toBeNull()
    expect(drillTarget(only(['cases']), () => spec)).toBe(spec)
    expect(drillTarget(only(['cases']), () => null)).toBeNull()
    expect(drillTarget(only(['employees']), spec)).toBeNull()
    // A source that fails to build stays a button rather than breaking the page.
    const broken = () => {
      throw new Error('no rows')
    }
    expect(drillTarget(only(['employees']), broken)).toBe(broken)
  })

  it('names every drill kind the records panel knows', () => {
    expect([...ALL_DRILL_KINDS].sort()).toEqual([...DRILL_KINDS].sort())
  })
})

describe('the records guard per scope', () => {
  it('says how many records outside the scope are left out', () => {
    expect(recordsOutsideLine(unit.access, 12)).toBe(`12 records outside ${SE} are not listed.`)
    expect(recordsOutsideLine(region.access, 1)).toBe('1 record outside APAC is not listed.')
    expect(recordsOutsideLine(rec.access, 3)).toBe(`3 records outside ${RECRUITER}'s reqs are not listed.`)
    expect(recordsOutsideLine(mgr.access, 2)).toBe(
      `2 records outside ${hr.org.byId.get(boss)?.name}'s org are not listed.`,
    )
    expect(recordsOutsideLine({ scope: emptyRegionScope(null) }, 4)).toBe(
      '4 records are not listed until a region is picked.',
    )
    expect(recordsOutsideLine(hr.access, 5)).toBeNull()
    expect(recordsOutsideLine(unit.access, 0)).toBeNull()
  })

  it('words the hidden kind and the pay and immigration notes for the mode', () => {
    expect(kindHiddenLine(fin.access)).toBe('These records are not shown in Finance mode.')
    expect(payAmountsNote(hr.access)).toMatch(/Switch on "Show pay amounts"/)
    expect(payAmountsNote(withDecisions(unit, { 'pay:switch': false }).access)).toBe(
      'Pay amounts are not shown in HRBP mode. Ratios such as compa-ratio still show.',
    )
    expect(immigrationNote(hr.access)).toMatch(/Switch on "Show immigration details"/)
    expect(immigrationNote(unit.access)).toBe(
      'Authorization types are not shown in HRBP mode. Counts by type still show.',
    )
  })
})

describe('the person card per mode', () => {
  it('gives HR the whole card, with pay amounts only while the switch is on', () => {
    const e = someone(hr, () => true)
    const plan = personCardPlan(hr, e)
    expect(plan.shape).toBe('full')
    expect(plan).toMatchObject({
      compaRatio: true,
      ratings: true,
      openCases: true,
      pay: false,
      costCenter: false,
    })
    const on = sampleCtx({ showPay: true })
    expect(personCardPlan(on, e).pay).toBe(true)
    const p = personSummary(on, e.employeeId)
    if (on.all.comp.some((c) => c.employeeId === e.employeeId)) expect(p?.pay?.baseSalary).toBeGreaterThan(0)
    expect(personSummary(hr, e.employeeId)?.pay ?? null).toBeNull()
  })

  it('keeps Manager mode as it was: no compa-ratio, no open HR cases, outside names limited', () => {
    const lock = mgr.access.lock
    if (!lock) throw new Error('no lock')
    const inside = someone(mgr, (id) => lock.orgIds.has(id) && id !== boss)
    const p = personSummary(mgr, inside.employeeId)
    expect(p?.limited).toBe(true)
    expect(p?.compaRatio).toBeNull()
    expect(p?.card.courses).toBe(true)
    const out = someone(mgr, (id) => !lock.orgIds.has(id))
    const o = personSummary(mgr, out.employeeId)
    expect(o?.outside).toBe(true)
    expect(o?.card.outsideLine).toBe(`Outside ${hr.org.byId.get(boss)?.name}'s org.`)
  })

  it('gives someone outside a business unit or region the limited card', () => {
    const outU = someone(unit, (id) => hr.org.byId.get(id)?.businessUnit !== SE)
    expect(personCardPlan(unit, outU)).toMatchObject({ shape: 'outside', outsideLine: `Outside ${SE}.` })
    const inU = someone(unit, (id) => hr.org.byId.get(id)?.businessUnit === SE)
    expect(personCardPlan(allShownBut(unit), inU).shape).toBe('full')
    const sites = region.access.scope?.kind === 'region' ? region.access.scope.sites : []
    const outR = someone(region, (id) => !sites.includes(hr.org.byId.get(id)?.location ?? ''))
    const card = personSummary(region, outR.employeeId)
    expect(card?.outside).toBe(true)
    expect(card?.card.outsideLine).toBe('Outside APAC.')
    expect(card?.reviews).toEqual([])
    expect(card?.chain).toEqual([])
  })

  it('opens only matched pre-hires in Recruiter mode, with their start', () => {
    const scope = rec.access.scope
    if (scope?.kind !== 'reqs') throw new Error('no reqs scope')
    const startId = [...scope.startIds][0]
    if (startId) {
      const p = personSummary(rec, startId)
      expect(p?.card.shape).toBe('prehire')
      expect(p?.preHire?.startDate).toBe(hr.org.byId.get(startId)?.hireDate)
      expect(p?.reviews).toEqual([])
      expect(p?.compaRatio).toBeNull()
      const r = p?.preHire?.readiness
      expect((r?.done ?? 0) + (r?.overdue ?? 0) + (r?.blocked ?? 0)).toBeLessThanOrEqual(r?.total ?? 0)
    }
    const active = someone(rec, () => true)
    expect(personCardPlan(rec, active)).toMatchObject({
      shape: 'outside',
      outsideLine: `Outside ${RECRUITER}'s reqs.`,
    })
    // Every recruiter: no reqs to name, only people about to start open.
    const every = sampleCtx({ access: { mode: 'recruiter', picks: { recruiter: { name: '*', id: null } } } })
    expect(personCardPlan(every, active).outsideLine).toBe(PREHIRE_ONLY)
  })

  it("gives Finance the reporting facts and nothing about a person's pay, ratings or history", () => {
    const e = someone(fin, () => true)
    const plan = personCardPlan(allShownBut(fin), e)
    expect(plan).toMatchObject({
      shape: 'finance',
      costCenter: true,
      compaRatio: false,
      pay: false,
      ratings: false,
      openCases: false,
      courses: false,
      jobHistory: false,
      succession: false,
      exitDetail: false,
    })
    // Focus on their org would set a leader filter, which Finance clears: never offered.
    expect(plan.focus).toBe(false)
    const p = personSummary(
      allShownBut(sampleCtx({ access: { mode: 'finance' }, showPay: true })),
      e.employeeId,
    )
    expect(p?.pay ?? null).toBeNull()
    expect(p?.reviews).toEqual([])
    expect(p?.jobChanges).toEqual([])
  })

  it('leaves out each part its decision hides', () => {
    const e = someone(hr, () => true)
    const plan = personCardPlan(
      allShownBut(hr, ['person:compa-ratio', 'person:open-cases', 'drill:learning', 'person:ratings']),
      e,
    )
    expect(plan).toMatchObject({ compaRatio: false, openCases: false, courses: false, ratings: false })
    const p = personSummary(allShownBut(hr, ['person:ratings', 'drill:jobChanges']), e.employeeId)
    expect(p?.reviews).toEqual([])
    expect(p?.jobChanges).toEqual([])
  })
})

describe('Finance employee lists', () => {
  const leavers = hr.all.employees.filter((e) => e.terminationDate && e.terminationReason).slice(0, 20)
  const spec = drillSpec({ kind: 'employees', title: 'Leavers', rows: leavers })

  it('lists ID, name, cost center, department, level, location, worker type and hire date only', () => {
    const t = buildDrillTable(spec, fin)
    const keys = t.columns.map((c) => c.key)
    for (const k of keys)
      expect([
        'employeeId',
        'name',
        'costCenter',
        'department',
        'level',
        'location',
        'employmentType',
        'hireDate',
      ]).toContain(k)
    expect(keys).toContain('costCenter')
    expect(keys).not.toContain('terminationReason')
  })

  it('keeps HR and Manager lists as they were, without the cost center', () => {
    const keys = buildDrillTable(spec, hr).columns.map((c) => c.key)
    expect(keys).toContain('terminationReason')
    expect(keys).not.toContain('costCenter')
    const exitsHidden = withDecisions(hr, { 'metric:hrbp.attrition.exitReasons': false })
    const trimmed = buildDrillTable(spec, exitsHidden).columns.map((c) => c.key)
    expect(trimmed).not.toContain('terminationReason')
    expect(trimmed).not.toContain('regrettable')
  })

  it('stamps its exports with the cost line', () => {
    expect(modeMeta(fin.access).costLine).toBe(FINANCE_EXPORT_LINE)
  })
})

describe('successors outside an HRBP scope', () => {
  it('names them with their business unit, as plain text', () => {
    const plan = hr.all.succession.find((s) => {
      const inc = hr.org.byId.get(s.incumbentId)
      const suc = s.successorId ? hr.org.byId.get(s.successorId) : undefined
      return inc?.businessUnit === SE && suc && suc.businessUnit !== SE
    })
    if (!plan?.successorId) return
    const t = buildDrillTable(drillSpec({ kind: 'succession', title: 'Roles', rows: [plan] }), unit)
    const suc = hr.org.byId.get(plan.successorId)
    expect(t.rows[0].successor).toBe(`${suc?.name}, ${suc?.businessUnit}`)
  })
})

describe('Filter to and Leave out keep to the mode', () => {
  const both = (ctx: AnalyticsContext) =>
    withDecisions(ctx, { 'focus:filter-to': true, 'focus:leave-out': true, 'focus:leave-out-leader': true })

  it('offers Finance business unit groups only, and never Leave out', () => {
    const f = both(fin)
    expect(groupScopes(f, { businessUnit: ['Go-to-Market'] }).filterTo?.businessUnit).toEqual([
      'Go-to-Market',
    ])
    expect(groupScopes(f, { businessUnit: ['Go-to-Market'] }).leaveOut).toBeNull()
    expect(groupScopes(f, { location: ['Bengaluru'] })).toEqual({ filterTo: null, leaveOut: null })
  })

  it('keeps an HRBP inside the unit', () => {
    const u = both(unit)
    expect(groupScopes(u, { businessUnit: ['Corporate'] }).filterTo).toBeNull()
    const dept = unit.data.employees[0]?.department
    if (dept) expect(groupScopes(u, { department: [dept] }).filterTo?.businessUnit).toEqual([SE])
  })

  it("follows the mode's focus decisions", () => {
    const off = withDecisions(hr, { 'focus:filter-to': false, 'focus:leave-out': false })
    expect(groupScopes(off, { location: ['Bengaluru'] })).toEqual({ filterTo: null, leaveOut: null })
  })
})
