/**
 * Exclude on each filter (docs/FILTERS.md, part 3): `scopeDatasets` with exclusions, checked
 * against a recount from the raw rows for every dataset, plus the partition rule ("Filter to X"
 * and "Leave out X" split every dataset between them).
 */
import { describe, expect, it } from 'vitest'
import { cachedSample } from './sample'
import type { DatasetKey, Datasets, Employee } from './schema'
import {
  buildOrgIndex,
  DEFAULT_FILTERS,
  employeeMatcher,
  type FilterDimension,
  type Filters,
  normalizeFilters,
  sameFilters,
  scopeDatasets,
  scopeLabel,
  subtreeIds,
} from './scope'

const sample = cachedSample()
const data = sample
const org = buildOrgIndex(data.employees)
const f = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })

/** The biggest value of a dimension among employees, and a leader with a sizeable org. */
const top = (dim: 'businessUnit' | 'department' | 'location' | 'level') => {
  const n = new Map<string, number>()
  for (const e of data.employees) {
    const v = e[dim]
    if (v) n.set(v, (n.get(v) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1])[0][0]
}
const leader = [...org.byId.values()]
  .map((e) => ({ id: e.employeeId, size: subtreeIds(org, e.employeeId).size }))
  .filter((x) => x.size > 30 && x.size < data.employees.length / 3)
  .sort((a, b) => b.size - a.size)[0].id

const PER_DIM: Record<FilterDimension, Partial<Filters>> = {
  leaderId: { leaderId: leader },
  businessUnit: { businessUnit: [top('businessUnit')] },
  department: { department: [top('department')] },
  location: { location: [top('location')] },
  level: { level: [top('level')] },
}

/** Recount: who is in "everyone except X" from the raw rows, by the rules in the spec. */
function recount(filters: Filters, data: Datasets = sample): Datasets {
  const sub = filters.leaderId ? subtreeIds(org, filters.leaderId) : null
  const out = (dim: FilterDimension, v: string | null | undefined): boolean => {
    if (dim === 'leaderId') return !!v && !!sub?.has(v)
    const xs = filters[dim]
    return xs.length > 0 && !!v && xs.includes(v)
  }
  const empIn = (e: Employee | undefined) =>
    !e ||
    !(
      out('leaderId', e.employeeId) ||
      out('businessUnit', e.businessUnit) ||
      out('department', e.department) ||
      out('location', e.location) ||
      out('level', e.level)
    )
  const byEmp = <T extends { employeeId: string }>(rows: T[]) =>
    rows.filter((r) => empIn(org.byId.get(r.employeeId)))
  const reqOut = (r: Datasets['requisitions'][number]) =>
    out('leaderId', r.hiringManagerId) ||
    out('businessUnit', r.businessUnit) ||
    out('department', r.department) ||
    out('location', r.location) ||
    out('level', r.level)
  const reqs = data.requisitions.filter((r) => !reqOut(r))
  // A candidate follows their requisition; one whose requisition is not in the data stays.
  const reqById = new Map(data.requisitions.map((r) => [r.reqId, r]))
  const cands = data.candidates.filter((c) => {
    const r = reqById.get(c.reqId)
    return !r || !reqOut(r)
  })
  // Plan lines by their own org fields; leaving out a leader leaves out the lines linked to their
  // org's requisitions and the lines in a business unit and department where their org works.
  const orgReqs = new Set(
    data.requisitions.filter((r) => out('leaderId', r.hiringManagerId)).map((r) => r.reqId),
  )
  const orgDepts = new Set(
    [...(sub ?? [])].map((id) => {
      const e = org.byId.get(id)
      return e ? `${e.businessUnit}|${e.department}` : ''
    }),
  )
  const plan = data.hiringPlan.filter(
    (p) =>
      !(
        (sub && ((!!p.reqId && orgReqs.has(p.reqId)) || orgDepts.has(`${p.businessUnit}|${p.department}`))) ||
        out('businessUnit', p.businessUnit) ||
        out('department', p.department) ||
        out('location', p.location) ||
        out('level', p.level)
      ),
  )
  const apps = new Set(cands.map((c) => c.applicationId))
  const allApps = new Set(data.candidates.map((c) => c.applicationId))
  const person = (emp: string | null | undefined, app: string | null | undefined) => {
    const e = emp ? org.byId.get(emp) : undefined
    if (e) return empIn(e)
    if (app && allApps.has(app)) return apps.has(app)
    return true
  }
  return {
    employees: data.employees.filter((e) => empIn(e)),
    jobChanges: byEmp(data.jobChanges),
    requisitions: reqs,
    candidates: cands,
    hiringPlan: plan,
    onboardingTasks: data.onboardingTasks.filter((t) => person(t.employeeId, t.applicationId)),
    rightToWork: byEmp(data.rightToWork),
    surveyResponses: data.surveyResponses.filter((r) => person(r.respondentKey, r.respondentKey)),
    surveyItems: data.surveyItems,
    cases: data.cases.filter((c) => {
      const e = c.requesterId ? org.byId.get(c.requesterId) : undefined
      if (e) return empIn(e)
      return !out('location', c.location)
    }),
    transactions: byEmp(data.transactions),
    reviews: byEmp(data.reviews),
    succession: data.succession.filter((s) => empIn(org.byId.get(s.incumbentId))),
    learning: byEmp(data.learning),
    comp: byEmp(data.comp),
  }
}

const KEYS = Object.keys(data) as DatasetKey[]

describe('scopeDatasets with exclusions', () => {
  it('matches a recount from the raw rows for every dataset, one dimension at a time and combined', () => {
    const scopes: Filters[] = [
      ...(Object.keys(PER_DIM) as FilterDimension[]).map((d) =>
        f({ ...PER_DIM[d], modes: { [d]: 'exclude' } }),
      ),
      f({
        ...PER_DIM.location,
        ...PER_DIM.level,
        modes: { location: 'exclude', level: 'exclude' },
      }),
      f({
        ...PER_DIM.leaderId,
        ...PER_DIM.department,
        modes: { leaderId: 'exclude', department: 'exclude' },
      }),
    ]
    for (const filters of scopes) {
      const got = scopeDatasets(data, filters, org)
      const want = recount(filters)
      for (const k of KEYS) {
        expect(got[k].length, `${k} for ${scopeLabel(filters, org)}`).toBe(want[k].length)
        expect(got[k], k).toEqual(want[k])
      }
      // Something was actually left out of the people.
      expect(got.employees.length).toBeLessThan(data.employees.length)
    }
  })

  it('splits every dataset between "Filter to X" and "Leave out X"', () => {
    for (const d of Object.keys(PER_DIM) as FilterDimension[]) {
      const inc = scopeDatasets(data, f(PER_DIM[d]), org)
      const exc = scopeDatasets(data, f({ ...PER_DIM[d], modes: { [d]: 'exclude' } }), org)
      for (const k of KEYS) {
        if (k === 'surveyItems') continue
        const a = new Set<object>(inc[k] as object[])
        const both = (exc[k] as object[]).filter((r) => a.has(r))
        expect(both, `${k} by ${d}`).toEqual([])
        expect(inc[k].length + exc[k].length, `${k} by ${d}`).toBe(data[k].length)
      }
    }
  })

  it('combines with inclusions by AND: "Silicon Engineering, not Bengaluru, not L1"', () => {
    const filters = f({
      businessUnit: ['Silicon Engineering'],
      location: ['Bengaluru'],
      level: ['L1'],
      modes: { location: 'exclude', level: 'exclude' },
    })
    const got = scopeDatasets(data, filters, org).employees
    const want = data.employees.filter(
      (e) => e.businessUnit === 'Silicon Engineering' && e.location !== 'Bengaluru' && e.level !== 'L1',
    )
    expect(got).toEqual(want)
    expect(scopeLabel(filters, org)).toBe('Silicon Engineering · not Bengaluru · not L1')
  })

  it('keeps a candidate whose requisition is not in the data under an exclusion-only scope', () => {
    const orphan = { ...data.candidates[0], applicationId: 'APP-ORPHAN', reqId: 'REQ-NOPE' }
    const withOrphan: Datasets = { ...data, candidates: [...data.candidates, orphan] }
    const loc = top('location')
    const exc = scopeDatasets(withOrphan, f({ location: [loc], modes: { location: 'exclude' } }), org)
    const inc = scopeDatasets(withOrphan, f({ location: [loc] }), org)
    // The scope can't place it: an exclusion keeps it (it is not one of the excluded values), an
    // inclusion can't vouch for it. "Filter to" and "Leave out" still add up to the whole.
    expect(exc.candidates).toContain(orphan)
    expect(inc.candidates).not.toContain(orphan)
    expect(exc.candidates.length + inc.candidates.length).toBe(withOrphan.candidates.length)
    expect(exc.candidates).toEqual(
      recount(f({ location: [loc], modes: { location: 'exclude' } }), withOrphan).candidates,
    )
    // With an inclusion beside the exclusion, it is out.
    const mixed = scopeDatasets(
      withOrphan,
      f({ businessUnit: [top('businessUnit')], location: [loc], modes: { location: 'exclude' } }),
      org,
    )
    expect(mixed.candidates).not.toContain(orphan)
  })

  it('keeps records with a blank value for an excluded dimension', () => {
    const people: Employee[] = [
      { ...data.employees[0], employeeId: 'x1', level: null },
      { ...data.employees[0], employeeId: 'x2', level: 'L3' },
    ]
    const ix = buildOrgIndex(people)
    const m = employeeMatcher(f({ level: ['L3'], modes: { level: 'exclude' } }), ix)
    expect(people.filter((e) => m(e)).map((e) => e.employeeId)).toEqual(['x1'])
    // Someone not on the roster passes an exclusion-only scope, never an include one.
    expect(m(undefined)).toBe(true)
    expect(employeeMatcher(f({ level: ['L3'] }), ix)(undefined)).toBe(false)
  })

  it('labels exclusions in plain words', () => {
    const name = org.byId.get(leader)?.name
    expect(scopeLabel(f({ businessUnit: ['Sales'], modes: { businessUnit: 'exclude' } }), org)).toBe(
      'Whole company except Sales',
    )
    expect(scopeLabel(f({ leaderId: leader, modes: { leaderId: 'exclude' } }), org)).toBe(
      `Whole company except ${name}'s org`,
    )
    expect(
      scopeLabel(
        f({ location: ['Bengaluru'], level: ['L1'], modes: { location: 'exclude', level: 'exclude' } }),
        org,
      ),
    ).toBe('Whole company except Bengaluru and L1')
    expect(
      scopeLabel(
        f({ businessUnit: ['Silicon Engineering'], leaderId: leader, modes: { leaderId: 'exclude' } }),
        org,
      ),
    ).toBe(`Silicon Engineering · not in ${name}'s org`)
  })
})

describe('filters saved before modes', () => {
  it('load as include, and idle modes compare equal', () => {
    const old = {
      period: 't6m',
      leaderId: null,
      businessUnit: ['Sales'],
      department: [],
      location: [],
      level: [],
    }
    const n = normalizeFilters(old)
    expect(n.modes).toEqual({})
    expect(n.businessUnit).toEqual(['Sales'])
    expect(sameFilters(n, { ...n, modes: { location: 'exclude' } })).toBe(true)
    expect(sameFilters(n, { ...n, modes: { businessUnit: 'exclude' } })).toBe(false)
    expect(normalizeFilters({ period: 'nope', modes: { bu: 'exclude', level: 'exclude' } })).toMatchObject({
      period: 't12m',
      modes: { level: 'exclude' },
    })
  })
})
