/**
 * Recruiter mode's filter menus come from inside the reqs (docs/ROLES-V2.md 2.5): the leader menu
 * lists the hiring managers of the recruiter's reqs and those above them, and every menu counts
 * reqs, never headcount (People stats and the Org chart are not part of Recruiter mode).
 */
import { describe, expect, it, vi } from 'vitest'
import { sampleCtx } from '@/ask/engine/testkit'
import { headcountAt } from '@/lib/people'
import { orgSizes, reqDimensionOptions, reqsLeaderOptions } from './filterOptions'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const ctx = sampleCtx({
  access: { mode: 'recruiter', picks: { recruiter: { name: 'Agnieszka Nielsen', id: null } } },
})
const scope = ctx.access.scope
const reqs = scope?.kind === 'reqs' ? ctx.all.requisitions.filter((r) => scope.reqIds.has(r.reqId)) : []

describe('Recruiter mode filter menus', () => {
  it('lists the hiring managers of the reqs and those above them, each sized in open reqs', () => {
    expect(reqs.length).toBeGreaterThan(5)
    const opts = reqsLeaderOptions(ctx.org, ctx.asOf, reqs)
    expect(opts.length).toBeGreaterThan(0)
    const managers = new Set(reqs.map((r) => r.hiringManagerId).filter(Boolean))
    for (const m of managers)
      if (ctx.org.byId.get(m as string)) expect(opts.some((o) => o.id === m)).toBe(true)
    // No size is an org's headcount: every size counts open reqs, at most all of them.
    const heads = orgSizes(ctx.org, ctx.asOf)
    const open = reqs.filter((r) => r.status === 'Open')
    for (const o of opts) {
      expect(o.size, o.name).toBeLessThanOrEqual(open.length)
      const own = open.filter((r) => {
        let cur = r.hiringManagerId ? ctx.org.byId.get(r.hiringManagerId) : undefined
        const seen = new Set<string>()
        while (cur && !seen.has(cur.employeeId)) {
          if (cur.employeeId === o.id) return true
          seen.add(cur.employeeId)
          cur = cur.managerId ? ctx.org.byId.get(cur.managerId) : undefined
        }
        return false
      }).length
      expect(o.size, o.name).toBe(own)
    }
    // The top of the company leads 556 people; here it is counted in the recruiter's reqs.
    const top = opts[0]
    expect(top.size).toBeLessThan(heads.get(top.id) ?? 0)
    expect(headcountAt(ctx.all.employees, ctx.asOf)).toBeGreaterThan(top.size)
  })

  it('lists each dimension’s values on the reqs, counted in open reqs', () => {
    for (const key of ['businessUnit', 'department', 'location', 'level'] as const) {
      const opts = reqDimensionOptions(reqs, key)
      const withValue = reqs.filter((r) => !!r[key] && r.status === 'Open').length
      expect(
        opts.reduce((a, o) => a + o.count, 0),
        key,
      ).toBe(withValue)
      for (const o of opts)
        expect(
          reqs.some((r) => r[key] === o.value),
          `${key} ${o.value}`,
        ).toBe(true)
    }
    // Within the rest of the row: every value stays listed, counted inside it.
    const se = (r: { businessUnit: string }) => r.businessUnit === 'Silicon Engineering'
    const loc = reqDimensionOptions(reqs, 'location', [], se)
    expect(loc.map((o) => o.value)).toEqual(reqDimensionOptions(reqs, 'location').map((o) => o.value))
    expect(loc.reduce((a, o) => a + o.count, 0)).toBe(reqs.filter((r) => se(r) && r.status === 'Open').length)
    const top = reqsLeaderOptions(ctx.org, ctx.asOf, reqs, se)[0]
    expect(top.size).toBe(reqs.filter((r) => se(r) && r.status === 'Open' && !!r.hiringManagerId).length)
    // A value picked but on no req stays, at 0, so it can be cleared.
    expect(reqDimensionOptions(reqs, 'location', ['Nowhere']).find((o) => o.value === 'Nowhere')?.count).toBe(
      0,
    )
  })
})
