/**
 * The one clamp per scope kind (docs/ROLES-V2.md 2.3 and 8.8 test 3), on the sample: `org`, `unit`,
 * `region` and `reqs`, and Finance's restriction. The clamp keeps each kind's rule, is idempotent,
 * and returns the same object when nothing changes, for every filter a reader can build.
 */
import { describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { sampleCtx } from '@/ask/engine/testkit'
import { contextDepartmentParents } from '@/data/context'
import { EMPTY_LISTS } from '@/data/lists/edit'
import {
  DEFAULT_FILTERS,
  FILTER_DIMENSIONS,
  type FilterModes,
  type Filters,
  isActiveAt,
  isEmployee,
  isExcluded,
  subtreeIds,
} from '@/data/scope'
import type { Mode } from '../modes'
import { clampFilters, clampReason, FILTER_DIMS_OF } from './clamp'
import { orgScope } from './org'
import { regionScope } from './region'
import { regionIndex } from './regions'
import { reqsScope } from './reqs'
import type { ScopeLock } from './types'
import { emptyUnitScope, NOBODY, unitScope } from './unit'

const hr = sampleCtx()
const { all, org, asOf } = hr
const parents = contextDepartmentParents(EMPTY_LISTS, all, hr.sources)
const SE = 'Silicon Engineering'
const unit = unitScope(all.employees, asOf, SE, { departmentParents: parents })
const regions = regionIndex(null, all)
const apac = regionScope(all.employees, asOf, 'APAC', regions)
const recruiter = reqsScope(all, asOf, { name: 'Agnieszka Nielsen', id: null })
const leaders = leaderOptions(org, asOf, 3)
const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && org.byId.get(l.id)?.managerId)!
const manager = orgScope(org, asOf, mid.id)!

const f = (patch: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })

/** Departments by the unit most of their people are in. */
const deptsOf = (bu: string) => [
  ...new Set(all.employees.filter((e) => e.businessUnit === bu).map((e) => e.department)),
]
const seDept = deptsOf(SE).find((d) => !unit.otherDepartments.has(d))!
const corpDept = deptsOf('Corporate').find((d) => unit.otherDepartments.has(d))!

/** A leader with active people in the unit, and one whose whole org is outside it. */
const activeIn = (id: string, bu: string) =>
  [...subtreeIds(org, id)].some((x) => {
    const e = org.byId.get(x)
    return !!e && e.businessUnit === bu && isEmployee(e) && isActiveAt(e, asOf)
  })
const seLeader = leaders.find((l) => activeIn(l.id, SE))!
const outsideLeader = leaders.find((l) => !activeIn(l.id, SE))!

describe('the sample has what these tests need', () => {
  it('has a unit, a region, a recruiter, departments on both sides and leaders on both sides', () => {
    expect(unit.size).toBeGreaterThan(100)
    expect(apac.sites).toEqual(['Bengaluru', 'Ho Chi Minh City', 'Hsinchu', 'Shanghai'])
    expect(recruiter.reqIds.size).toBeGreaterThan(10)
    expect(seDept && corpDept && seLeader && outsideLeader && manager).toBeTruthy()
  })
})

describe('unit', () => {
  it('pins the business unit, include only, and keeps the other filters with their modes', () => {
    for (const asked of [
      f(),
      f({ businessUnit: ['Corporate'] }),
      f({ businessUnit: [SE, 'Corporate'] }),
      f({ businessUnit: [SE], modes: { businessUnit: 'exclude' } }),
      f({ businessUnit: ['Corporate'], modes: { businessUnit: 'exclude' } }),
    ]) {
      const c = clampFilters(asked, unit)
      expect(c.businessUnit).toEqual([SE])
      expect(isExcluded(c, 'businessUnit')).toBe(false)
    }
    const narrow = f({
      location: ['Munich'],
      level: ['L4'],
      period: 't6m',
      modes: { location: 'exclude' },
      businessUnit: [SE],
    })
    expect(clampFilters(narrow, unit)).toBe(narrow)
  })

  it('drops departments of other units and leaders whose org has nobody active in the unit', () => {
    const c = clampFilters(f({ businessUnit: [SE], department: [seDept, corpDept] }), unit)
    expect(c.department).toEqual([seDept])
    const out = clampFilters(
      f({ businessUnit: [SE], department: [corpDept], modes: { department: 'exclude' } }),
      unit,
    )
    expect(out.department).toEqual([])
    expect(isExcluded(out, 'department')).toBe(false)
    expect(clampFilters(f({ businessUnit: [SE], leaderId: outsideLeader.id }), unit).leaderId).toBeNull()
    const kept = f({ businessUnit: [SE], leaderId: seLeader.id, modes: { leaderId: 'exclude' } })
    expect(clampFilters(kept, unit)).toBe(kept)
  })

  it('pins a value no record has while no unit is picked', () => {
    expect(clampFilters(f({ businessUnit: [SE] }), emptyUnitScope(null)).businessUnit).toEqual([NOBODY])
  })
})

describe('region', () => {
  it("keeps the region's sites the filter names, else every site, always include", () => {
    expect(clampFilters(f(), apac).location).toEqual(apac.sites)
    const two = f({ location: ['Hsinchu', 'Bengaluru'] })
    expect(clampFilters(two, apac)).toBe(two)
    expect(clampFilters(f({ location: ['Hsinchu', 'Munich'] }), apac).location).toEqual(['Hsinchu'])
    expect(clampFilters(f({ location: ['Munich'] }), apac).location).toEqual(apac.sites)
    const ex = clampFilters(f({ location: ['Hsinchu'], modes: { location: 'exclude' } }), apac)
    expect(ex.location).toEqual(['Bengaluru', 'Ho Chi Minh City', 'Shanghai'])
    expect(isExcluded(ex, 'location')).toBe(false)
    const exAll = clampFilters(f({ location: [...apac.sites], modes: { location: 'exclude' } }), apac)
    expect(exAll.location).toEqual(apac.sites)
    expect(isExcluded(exAll, 'location')).toBe(false)
  })

  it('keeps leader, business unit, department and level with their modes', () => {
    const asked = f({
      location: ['Bengaluru'],
      leaderId: mid.id,
      businessUnit: ['Corporate'],
      department: [corpDept],
      level: ['L3'],
      modes: { leaderId: 'exclude', businessUnit: 'exclude', level: 'exclude' },
    })
    expect(clampFilters(asked, apac)).toBe(asked)
  })
})

describe('reqs and org', () => {
  it('never changes the filters in a reqs scope', () => {
    for (const asked of [
      f(),
      f({ leaderId: mid.id }),
      f({ location: ['Munich'], modes: { location: 'exclude' } }),
    ])
      expect(clampFilters(asked, recruiter)).toBe(asked)
  })

  it("keeps Manager mode's org rule", () => {
    expect(clampFilters(f(), manager).leaderId).toBe(mid.id)
    expect(clampFilters(f({ leaderId: outsideLeader.id }), manager).leaderId).toBe(mid.id)
    const ex = clampFilters(f({ leaderId: mid.id, modes: { leaderId: 'exclude' } }), manager)
    expect(ex.leaderId).toBe(mid.id)
    expect(isExcluded(ex, 'leaderId')).toBe(false)
    const inside = f({ leaderId: mid.id, location: ['Bengaluru'] })
    expect(clampFilters(inside, manager)).toBe(inside)
  })
})

describe('Finance', () => {
  it('filters by business unit and period only', () => {
    const asked = f({
      period: 'ytd',
      leaderId: mid.id,
      businessUnit: [SE, 'Corporate'],
      department: [seDept],
      location: ['Munich'],
      level: ['L4'],
      modes: { location: 'exclude' },
    })
    expect(clampFilters(asked, null, 'finance')).toEqual(
      f({ period: 'ytd', businessUnit: [SE, 'Corporate'] }),
    )
    expect(
      clampFilters(f({ businessUnit: [SE], modes: { businessUnit: 'exclude' } }), null, 'finance'),
    ).toEqual(f())
    const ok = f({ period: 't6m', businessUnit: [SE] })
    expect(clampFilters(ok, null, 'finance')).toBe(ok)
    expect(FILTER_DIMS_OF.finance).toEqual(['businessUnit'])
  })

  it('changes nothing in the modes without a scope or a restriction', () => {
    const asked = f({ leaderId: mid.id, location: ['Munich'], modes: { location: 'exclude' } })
    for (const mode of ['hr', 'chro', 'compensation', 'talent-management', 'hr-ops', 'developer'] as Mode[])
      expect(clampFilters(asked, null, mode), mode).toBe(asked)
  })
})

describe('every kind', () => {
  /** A deterministic spread of filters: every dimension, values inside and outside, both modes. */
  function* filters(): Generator<Filters> {
    const values: Record<string, string[][]> = {
      businessUnit: [[], [SE], ['Corporate'], [SE, 'Go-to-Market']],
      department: [[], [seDept], [corpDept], [seDept, corpDept]],
      location: [[], ['Hsinchu'], ['Munich'], ['Bengaluru', 'Munich']],
      level: [[], ['L4'], ['L3', 'M2']],
    }
    let i = 0
    for (const bu of values.businessUnit)
      for (const dept of values.department)
        for (const loc of values.location)
          for (const lvl of values.level)
            for (const leader of [null, mid.id, seLeader.id, outsideLeader.id]) {
              i++
              const modes: FilterModes = {}
              for (const [k, d] of FILTER_DIMENSIONS.entries()) if ((i >> k) & 1) modes[d] = 'exclude'
              yield f({
                period: i % 3 ? 't12m' : 'ytd',
                businessUnit: bu,
                department: dept,
                location: loc,
                level: lvl,
                leaderId: leader,
                modes,
              })
            }
  }

  const cases: [string, ScopeLock | null, Mode][] = [
    ['org', manager, 'manager'],
    ['unit', unit, 'hrbp-unit'],
    ['region', apac, 'hrbp-region'],
    ['reqs', recruiter, 'recruiter'],
    ['finance', null, 'finance'],
  ]

  for (const [name, scope, mode] of cases)
    it(`is idempotent and keeps the same object when nothing changes (${name})`, () => {
      let n = 0
      for (const asked of filters()) {
        const once = clampFilters(asked, scope, mode)
        expect(clampFilters(once, scope, mode)).toBe(once)
        if (once !== asked) expect(once).not.toEqual(asked)
        // The period never changes.
        expect([once.period, once.customStart, once.customEnd]).toEqual([
          asked.period,
          asked.customStart,
          asked.customEnd,
        ])
        n++
      }
      expect(n).toBeGreaterThan(500)
    })
})

describe('the toast a changed link gets', () => {
  it('names the scope, worded for the mode', () => {
    const asked = f({ businessUnit: ['Corporate'] })
    expect(clampReason('hrbp-unit', unit, asked, clampFilters(asked, unit))).toBe(
      "HRBP mode shows Silicon Engineering, so the link's other business units were left out.",
    )
    const loc = f({ location: ['Munich'] })
    expect(clampReason('hrbp-region', apac, loc, clampFilters(loc, apac), 'view')).toBe(
      "HRBP mode shows APAC, so the saved view's other locations were left out.",
    )
    const many = f({ location: ['Munich'] })
    expect(clampReason('finance', null, many, clampFilters(many, null, 'finance'))).toBe(
      "Finance mode filters by business unit and period, so the link's other filters were left out.",
    )
    const same = f({ businessUnit: [SE] })
    expect(clampReason('hrbp-unit', unit, same, clampFilters(same, unit))).toBeNull()
  })
})
