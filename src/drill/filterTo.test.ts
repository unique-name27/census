/**
 * "Filter to this" (docs/FILTERS.md, part 4): Focus on's merge, the records panel's narrowing and
 * when it offers its actions, the action labels, the chart-kit helper, and the invariant on the
 * example producers (People stats headcount by department, location and level; Recruiting time to
 * fill by department), from the default scope and from inside other filters.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { byGroup, withFilter } from '@/charts/kit/groupDrill'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { activeEmployees, peopleIn } from '@/data/exclusion'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Employee } from '@/data/schema'
import { buildOrgIndex, DEFAULT_FILTERS, type Filters, LIST_DIMENSIONS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { minGroupOf } from '@/metrics/privacy'
import { hrbpModel } from '@/views/hrbp/engine'
import { headcountDrill } from '@/views/hrbp/ui/drill'
import { computeRecruiting } from '@/views/recruiting/engine'
import { ttfGroupDrill } from '@/views/recruiting/engine/drills'
import { resolveDrill } from './Drill'
import {
  canLeaveOut,
  filterActionLabels,
  filterInData,
  groupFilter,
  groupScopes,
  mergeFilter,
  namedScopeLabel,
  narrowFilters,
  periodFilter,
} from './filter'
import { expectFilterTo, expectLeaveOut, rescopeContext } from './testing'
import { drillSpec } from './types'

const f = (patch: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })

describe('Focus on', () => {
  it('replaces the dimension’s values and mode and keeps the other filters', () => {
    const cur = f({
      period: 't6m',
      businessUnit: ['Silicon Engineering'],
      location: ['Hsinchu', 'Munich'],
      modes: { location: 'exclude' },
    })
    const to = mergeFilter(cur, { location: ['Bengaluru'] }, 'include')
    expect(to).toMatchObject({
      period: 't6m',
      businessUnit: ['Silicon Engineering'],
      location: ['Bengaluru'],
    })
    expect(to.modes).toEqual({})
    // A leader replaces the leader; a period replaces the period.
    const lead = mergeFilter(f({ leaderId: 'E1', modes: { leaderId: 'exclude' } }), { leaderId: 'E2' })
    expect(lead).toMatchObject({ leaderId: 'E2', modes: {} })
    const month = mergeFilter(cur, {
      ...groupFilter('department', 'Layout'),
      ...periodFilter('2026-03-01', '2026-03-31'),
    })
    expect(month).toMatchObject({
      period: 'custom',
      customStart: '2026-03-01',
      customEnd: '2026-03-31',
      department: ['Layout'],
      location: ['Hsinchu', 'Munich'],
    })
    // A filter's own modes apply without an explicit mode (findings' "Focus on").
    expect(mergeFilter(cur, { level: ['L1'], modes: { level: 'exclude' } }).modes).toEqual({
      location: 'exclude',
      level: 'exclude',
    })
  })

  it('names the actions after the group, and offers Leave out for one group of one dimension', () => {
    const nameOf = (id: string) => (id === 'E7' ? 'Allison Carter' : undefined)
    expect(filterActionLabels({ location: ['Bengaluru'] }, nameOf)).toEqual({
      filterTo: 'Filter to Bengaluru',
      leaveOut: 'Leave out Bengaluru',
    })
    expect(filterActionLabels({ leaderId: 'E7' }, nameOf)).toEqual({
      filterTo: "Filter to Allison Carter's org",
      leaveOut: "Leave out Allison Carter's org",
    })
    expect(filterActionLabels({ level: ['L4'] }, nameOf).filterTo).toBe('Filter to L4 Senior')
    // A drill's own name for its group wins over its values.
    expect(
      filterActionLabels(
        { location: ['Bengaluru', 'Hsinchu', 'Singapore', 'Tokyo'] },
        nameOf,
        'Asia Pacific',
      ),
    ).toEqual({ filterTo: 'Filter to Asia Pacific', leaveOut: 'Leave out Asia Pacific' })
    expect(filterActionLabels(periodFilter('2026-03-01', '2026-03-31'), nameOf)).toEqual({
      filterTo: 'Filter to Mar 2026',
      leaveOut: null,
    })
    expect(filterActionLabels(periodFilter('2026-01-01', '2026-03-31'), nameOf).filterTo).toBe(
      'Filter to Q1 2026',
    )
    expect(canLeaveOut({ businessUnit: ['A'], department: ['B'] })).toBe(false)
  })

  it('names the group in the new scope when a dimension holds exactly its values', () => {
    const org = buildOrgIndex([])
    const americas = ['Austin', 'Boulder', 'Raleigh', 'San Jose', 'Seattle', 'Toronto', 'Vancouver']
    const out = f({ location: [...americas].reverse(), modes: { location: 'exclude' } })
    expect(namedScopeLabel(out, { location: americas }, org, 'Americas')).toBe(
      'Whole company except Americas',
    )
    expect(namedScopeLabel(out, { location: americas }, org)).toBe('Whole company except Vancouver +6')
    // A region with one of its sites already left out keeps the sites it holds.
    const some = f({ location: ['Bengaluru', 'Tokyo'] })
    expect(namedScopeLabel(some, { location: ['Bengaluru', 'Hsinchu', 'Tokyo'] }, org, 'Asia Pacific')).toBe(
      'Bengaluru, Tokyo',
    )
    // A group of two dimensions reads as one name, after the filters it doesn't touch.
    const band = f({
      businessUnit: ['Silicon Engineering'],
      department: ['Layout'],
      level: ['L1', 'L2', 'L3'],
    })
    expect(
      namedScopeLabel(band, { department: ['Layout'], level: ['L3', 'L2', 'L1'] }, org, 'Layout L1-L3'),
    ).toBe('Silicon Engineering · Layout L1-L3')
  })

  it('makes no filter for rows that are not a group', () => {
    expect(groupFilter('location', 'Other (4)')).toBeUndefined()
    expect(groupFilter('location', 'Not recorded')).toBeUndefined()
    expect(groupFilter('level', '')).toBeUndefined()
    expect(groupFilter('level', null)).toBeUndefined()
    expect(groupFilter('level', ['L1', 'Other'])).toBeUndefined()
    expect(groupFilter('level', ['L1', 'L2'])).toEqual({ level: ['L1', 'L2'] })
    expect(groupFilter('leaderId', 'E1')).toEqual({ leaderId: 'E1' })
  })
})

describe('the records panel narrows the scope you are in', () => {
  // E1 leads E2 and E4; E2 leads E3.
  const org = buildOrgIndex([
    { employeeId: 'E1', managerId: null },
    { employeeId: 'E2', managerId: 'E1' },
    { employeeId: 'E3', managerId: 'E2' },
    { employeeId: 'E4', managerId: 'E1' },
  ] as Employee[])
  const loc = (values: string[], exclude = false) =>
    f({ location: values, modes: exclude ? { location: 'exclude' } : {} })
  const lead = (id: string, exclude = false) =>
    f({ leaderId: id, modes: exclude ? { leaderId: 'exclude' } : {} })

  it('Leave out takes the group away from a list that is already filtered', () => {
    // Included: the value leaves the list; the last one can't (nothing would be left).
    expect(
      narrowFilters(loc(['San Jose', 'Bengaluru']), { location: ['Bengaluru'] }, 'leaveOut', org),
    ).toMatchObject({
      location: ['San Jose'],
      modes: {},
    })
    expect(narrowFilters(loc(['Bengaluru']), { location: ['Bengaluru'] }, 'leaveOut', org)).toBeNull()
    // Excluded: the value joins the excluded ones.
    expect(narrowFilters(loc(['Hsinchu'], true), { location: ['Bengaluru'] }, 'leaveOut', org)).toMatchObject(
      {
        location: ['Hsinchu', 'Bengaluru'],
        modes: { location: 'exclude' },
      },
    )
    // Not filtered yet: everyone except it, other filters kept.
    expect(
      narrowFilters(f({ period: 't6m', level: ['L4'] }), { location: ['Bengaluru'] }, 'leaveOut', org),
    ).toMatchObject({ period: 't6m', level: ['L4'], location: ['Bengaluru'], modes: { location: 'exclude' } })
    // One group of one dimension, and never a period.
    expect(narrowFilters(f(), periodFilter('2026-03-01', '2026-03-31'), 'leaveOut', org)).toBeNull()
    expect(narrowFilters(f(), { businessUnit: ['A'], department: ['B'] }, 'leaveOut', org)).toBeNull()
  })

  it('Filter to keeps what is in both the scope and the group', () => {
    expect(
      narrowFilters(loc(['San Jose', 'Bengaluru']), { location: ['Bengaluru'] }, 'filterTo', org),
    ).toMatchObject({
      location: ['Bengaluru'],
      modes: {},
    })
    // A region's sites with one of them left out keep the others.
    expect(
      narrowFilters(loc(['Hsinchu'], true), { location: ['Bengaluru', 'Hsinchu', 'Tokyo'] }, 'filterTo', org),
    ).toMatchObject({ location: ['Bengaluru', 'Tokyo'], modes: {} })
    expect(narrowFilters(loc(['Hsinchu'], true), { location: ['Hsinchu'] }, 'filterTo', org)).toBeNull()
    expect(narrowFilters(loc(['San Jose']), { location: ['Bengaluru'] }, 'filterTo', org)).toBeNull()
    // A period replaces the period; the other filters stay.
    expect(
      narrowFilters(
        f({ level: ['L4'] }),
        { ...groupFilter('department', 'Layout'), ...periodFilter('2026-03-01', '2026-03-31') },
        'filterTo',
        org,
      ),
    ).toMatchObject({
      period: 'custom',
      customStart: '2026-03-01',
      customEnd: '2026-03-31',
      department: ['Layout'],
      level: ['L4'],
    })
    // A group the filter itself excludes ("not L1") flips the action for that dimension.
    expect(narrowFilters(f(), { level: ['L1'], modes: { level: 'exclude' } }, 'filterTo', org)).toMatchObject(
      {
        level: ['L1'],
        modes: { level: 'exclude' },
      },
    )
  })

  it('keeps to what one leader filter can say', () => {
    // In E1's org: Filter to E2 narrows; Leave out E2 would need "E1's org but not E2's".
    expect(narrowFilters(lead('E1'), { leaderId: 'E2' }, 'filterTo', org)).toMatchObject({
      leaderId: 'E2',
      modes: {},
    })
    expect(narrowFilters(lead('E1'), { leaderId: 'E2' }, 'leaveOut', org)).toBeNull()
    // In E2's org: Filter to E1 changes nothing, E4 is apart (no one), Leave out E1 leaves no one.
    expect(narrowFilters(lead('E2'), { leaderId: 'E1' }, 'filterTo', org)).toMatchObject({ leaderId: 'E2' })
    expect(narrowFilters(lead('E2'), { leaderId: 'E4' }, 'filterTo', org)).toBeNull()
    expect(narrowFilters(lead('E2'), { leaderId: 'E1' }, 'leaveOut', org)).toBeNull()
    // Without E2's org: E4 (apart) is exact; E1 would need "E1's org but not E2's"; E3 is all left out.
    expect(narrowFilters(lead('E2', true), { leaderId: 'E4' }, 'filterTo', org)).toMatchObject({
      leaderId: 'E4',
      modes: {},
    })
    expect(narrowFilters(lead('E2', true), { leaderId: 'E1' }, 'filterTo', org)).toBeNull()
    expect(narrowFilters(lead('E2', true), { leaderId: 'E3' }, 'filterTo', org)).toBeNull()
    // Without E3's org, leaving out E2's covers it; without E2's, leaving out E4 too needs two leaders.
    expect(narrowFilters(lead('E3', true), { leaderId: 'E2' }, 'leaveOut', org)).toMatchObject({
      leaderId: 'E2',
      modes: { leaderId: 'exclude' },
    })
    expect(narrowFilters(lead('E2', true), { leaderId: 'E4' }, 'leaveOut', org)).toBeNull()
  })
})

describe('the chart-kit helper', () => {
  it('sets the filter once for every mark, built on click, and keeps a period the spec sets', () => {
    let built = 0
    const make = byGroup('location', 'site', (d: { site: string; n: number }) => {
      if (!d.n) return null
      return () => {
        built++
        return drillSpec({
          kind: 'employees',
          title: d.site,
          rows: [],
          filter: periodFilter('2026-01-01', '2026-01-31'),
        })
      }
    })
    const src = make({ site: 'Bengaluru', n: 3 })
    expect(built).toBe(0)
    expect(resolveDrill(src)?.filter).toEqual({
      period: 'custom',
      customStart: '2026-01-01',
      customEnd: '2026-01-31',
      location: ['Bengaluru'],
      modes: {},
    })
    expect(make({ site: 'Bengaluru', n: 0 })).toBeNull()
    expect(resolveDrill(make({ site: 'Other (3)', n: 3 }))?.filter).toEqual(
      periodFilter('2026-01-01', '2026-01-31'),
    )
    expect(
      withFilter(drillSpec({ kind: 'employees', title: 'x', rows: [] }), undefined).filter,
    ).toBeUndefined()
  })
})

describe('the invariant on the example producers', () => {
  let ctx: AnalyticsContext
  beforeAll(() => {
    const data = generateSample()
    ctx = buildContext({
      data,
      sources: Object.fromEntries(
        DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
      ) as Record<DatasetKey, SourceMeta>,
      filters: f(),
      asOfOverride: null,
      showPay: false,
    })
  }, 60_000)

  it('People stats headcount by location, department and level: Filter to keeps N, Leave out removes it', () => {
    for (const dim of ['location', 'department', 'level'] as const) {
      const c = {
        name: `headcount by ${dim}`,
        rows: (x: AnalyticsContext) =>
          dim === 'location'
            ? hrbpModel(x).workforce.byLocation
            : dim === 'department'
              ? hrbpModel(x).workforce.byDepartment
              : hrbpModel(x).workforce.byLevel,
        key: (r: { label: string }) => r.label,
        value: (r: { headcount: number }) => r.headcount,
        drill: (r: Parameters<ReturnType<typeof headcountDrill>>[0], x: AnalyticsContext) =>
          headcountDrill(hrbpModel(x).prep, dim)(r),
      }
      expectFilterTo(ctx, c, { sample: 4, variants: true })
      expectLeaveOut(ctx, c, { sample: 2, variants: true })
    }
    // From inside another scope too: the merge keeps the other filters.
    const narrowed = rescopeContext(ctx, f({ period: 't6m', level: ['L1'], modes: { level: 'exclude' } }))
    expectFilterTo(
      narrowed,
      {
        name: 'headcount by location, not L1',
        rows: (x) => hrbpModel(x).workforce.byLocation,
        key: (r) => r.label,
        value: (r) => r.headcount,
        drill: (r, x) => headcountDrill(hrbpModel(x).prep, 'location')(r),
      },
      { sample: 3 },
    )
  })

  it('Recruiting median time to fill by department: Filter to shows the same median and count', () => {
    const drillOf = (x: AnalyticsContext) =>
      byGroup('department', 'group', (d: { group: string; filled: readonly unknown[] }) =>
        d.filled.length ? () => ttfGroupDrill(computeRecruiting(x).base, d as never) : null,
      )
    for (const value of ['days', 'reqs'] as const)
      expectFilterTo(
        ctx,
        {
          name: `time to fill by department (${value})`,
          rows: (x) => computeRecruiting(x).ttfByDepartment,
          key: (r) => r.group,
          value: (r) => r[value],
          drill: (r, x) => drillOf(x)(r),
          kind: 'rate',
        },
        { sample: 4, variants: true },
      )
  })

  it('offers neither action for the whole scope, and no Leave out that singles out a small group', () => {
    const min = minGroupOf(ctx.metrics)
    const people = activeEmployees(ctx.all.employees, ctx.asOf)
    const top = [...ctx.org.byId.values()].find((e) => !e.managerId && !e.terminationDate)
    expect(top).toBeDefined()
    expect(groupScopes(ctx, { leaderId: top?.employeeId })).toEqual({ filterTo: null, leaveOut: null })
    // An org whose leaving out removes 1 to min - 1 active employees: Ask refuses that scope too.
    let small = 0
    for (const id of ctx.org.children.keys()) {
      const removed =
        people.length - peopleIn(people, f({ leaderId: id, modes: { leaderId: 'exclude' } }), ctx.org)
      const scopes = groupScopes(ctx, { leaderId: id })
      if (removed > 0 && removed < min) {
        small++
        expect(scopes.leaveOut, id).toBeNull()
      } else if (removed >= min && removed < people.length) expect(scopes.leaveOut, id).not.toBeNull()
    }
    expect(small).toBeGreaterThan(0)
    for (const dim of LIST_DIMENSIONS)
      for (const v of new Set(people.map((e) => e[dim]).filter((x): x is string => !!x))) {
        const n = people.filter((e) => e[dim] === v).length
        if (n < min) expect(groupScopes(ctx, { [dim]: [v] }).leaveOut, `${dim} ${v}`).toBeNull()
      }
  })

  it('inside a leader’s org, offers Filter to a sub-org and no Leave out; outside one, nothing that brings it back', () => {
    const top = [...ctx.org.byId.values()].find((e) => !e.managerId && !e.terminationDate)
      ?.employeeId as string
    const withOrg = (id: string) =>
      (ctx.org.children.get(id) ?? []).filter((e) => ctx.org.children.has(e.employeeId))
    const [lead] = withOrg(top)
    const [sub] = withOrg(lead.employeeId)
    const inLead = rescopeContext(ctx, f({ leaderId: lead.employeeId }))
    const scopes = groupScopes(inLead, { leaderId: sub.employeeId })
    expect(scopes.filterTo).toMatchObject({ leaderId: sub.employeeId, modes: {} })
    expect(scopes.leaveOut).toBeNull()
    const without = rescopeContext(ctx, f({ leaderId: lead.employeeId, modes: { leaderId: 'exclude' } }))
    expect(groupScopes(without, { leaderId: top }).filterTo).toBeNull()
    expect(groupScopes(without, { leaderId: sub.employeeId }).filterTo).toBeNull()
    // Leaving out the wider org covers the one already left out.
    const withoutSub = rescopeContext(ctx, f({ leaderId: sub.employeeId, modes: { leaderId: 'exclude' } }))
    expect(groupScopes(withoutSub, { leaderId: lead.employeeId }).leaveOut).toMatchObject({
      leaderId: lead.employeeId,
      modes: { leaderId: 'exclude' },
    })
  })

  it('offers no Filter to whose scope would leave a small group out by comparison', () => {
    // Without a large org, Filter to a site where that org has 1 to min - 1 people: comparing the
    // site with and without the exclusion would single them out, so it is not offered.
    const min = minGroupOf(ctx.metrics)
    const people = activeEmployees(ctx.all.employees, ctx.asOf)
    const sites = [...new Set(people.map((e) => e.location).filter((x): x is string => !!x))]
    let found = 0
    for (const id of ctx.org.children.keys()) {
      if (found >= 2) break
      const out = f({ leaderId: id, modes: { leaderId: 'exclude' } })
      const removed = people.length - peopleIn(people, out, ctx.org)
      if (removed < min || removed > people.length / 3) continue
      const scoped = rescopeContext(ctx, out)
      for (const site of sites) {
        const inSite = people.filter((e) => e.location === site).length
        const left = peopleIn(people, { ...out, location: [site] }, ctx.org)
        if (left === 0 || inSite - left <= 0 || inSite - left >= min) continue
        expect(groupScopes(scoped, { location: [site] }).filterTo, `${id} ${site}`).toBeNull()
        found++
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('only offers the actions for values in the loaded data', () => {
    const vocab = { hasLeader: (id: string) => ctx.org.byId.has(id), hasValue: () => false }
    expect(filterInData({ location: ['Atlantis'] }, vocab)).toBe(false)
    expect(filterInData(periodFilter('2026-01-01', '2026-01-31'), vocab)).toBe(true)
  })
})
