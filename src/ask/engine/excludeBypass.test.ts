/**
 * Ask's exclusion rule (docs/ASK.md, privacy rules): leaving out fewer people than the anonymity
 * minimum is refused, and it can't be got around by leaving out a large value with the small one,
 * by using the user's own scope, or by grouping the results inside an exclusion scope.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import type { Employee } from '@/data/schema'
import { isActiveAt, isEmployee, subtreeIds } from '@/data/scope'
import { minGroupOf } from '@/metrics/privacy'
import { Conversation } from './conversation'
import { resolveFilters } from './scope'
import { call, envOf, sampleCtx } from './testkit'
import { GROUP_EXCLUSION } from './tools/summary'

let ctx: AnalyticsContext
let min: number
let active: Employee[]
beforeAll(() => {
  ctx = sampleCtx()
  min = minGroupOf(ctx.metrics)
  active = ctx.all.employees.filter((e) => isEmployee(e) && isActiveAt(e, ctx.asOf))
}, 60_000)

/** Values of a dimension with their active headcount, largest first. */
function sizes(dim: 'department' | 'location' | 'level') {
  const n = new Map<string, number>()
  for (const e of active) {
    const v = e[dim]
    if (v) n.set(v, (n.get(v) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1])
}

/** A leader whose org passes the leader checks, and a location where 1 to min − 1 of the org work. */
function leaderWithSmallSite(): { id: string; site: string; emptySite: string } {
  const sites = sizes('location').map(([s]) => s)
  for (const l of leaderOptions(ctx.org, ctx.asOf).filter((x) => x.size >= 20 && x.size < 150)) {
    const sub = subtreeIds(ctx.org, l.id)
    const bySite = new Map<string, number>()
    for (const e of active)
      if (sub.has(e.employeeId)) bySite.set(e.location, (bySite.get(e.location) ?? 0) + 1)
    const site = [...bySite].find(([, n]) => n > 0 && n < min)?.[0]
    const emptySite = sites.find((s) => !bySite.has(s))
    if (site && emptySite) return { id: l.id, site, emptySite }
  }
  throw new Error('The sample has no leader with a small site')
}

describe('leaving out fewer people than the minimum', () => {
  it('is checked value by value: a large value can’t carry a small one', () => {
    const conv = new Conversation()
    const levels = sizes('level')
    const tiny = levels.find(([, n]) => n > 0 && n < min)
    expect(tiny).toBeDefined()
    if (!tiny) return
    const big = levels[0][0]
    expect(resolveFilters(ctx, { level: [big], exclude: ['level'] }, conv.tokens).ok).toBe(true)
    const both = resolveFilters(ctx, { level: [big, tiny[0]], exclude: ['level'] }, conv.tokens)
    expect(both.ok).toBe(false)
    if (!both.ok)
      expect(both.error).toMatch(new RegExp(`^Leaving out ${tiny[0]} removes fewer than ${min} people`))
  })

  it('holds for the user’s own scope: tools without filters refuse, and get_context says why', () => {
    const tiny = sizes('level').find(([, n]) => n > 0 && n < min)
    if (!tiny) throw new Error('no small level')
    const own = sampleCtx({ filters: { level: [tiny[0]], modes: { level: 'exclude' } } })
    const conv = new Conversation()
    const r = call(conv, envOf(own), 'view_summary', { view: 'hrbp' })
    expect(r.isError).toBe(true)
    expect(String(r.json.error)).toMatch(/^The user's scope leaves out .* fewer than 5 people/)
    // Given filters, another scope is fine.
    const other = call(conv, envOf(own), 'view_summary', { view: 'hrbp', filters: {} })
    expect(other.isError).toBe(false)
    expect(other.json.scope).toBe('Whole company')
    const g = call(conv, envOf(own), 'get_context')
    expect(g.json.scope_usable).toBe(false)
    expect(String(g.json.scope_problem)).toMatch(/leaves out/)
    // A scope that leaves out enough people is the user's to use.
    const fine = sampleCtx({ filters: { level: [sizes('level')[0][0]], modes: { level: 'exclude' } } })
    expect(call(new Conversation(), envOf(fine), 'view_summary', { view: 'hrbp' }).isError).toBe(false)
    expect(call(new Conversation(), envOf(fine), 'get_context').json.scope_usable).toBeUndefined()
  })
})

describe('groups inside an exclusion scope', () => {
  it('compare_groups hides a group the exclusion cuts by a few people', () => {
    const { id, site, emptySite } = leaderWithSmallSite()
    const conv = new Conversation()
    conv.tokens.index(ctx)
    const leader = conv.tokens.forEmployee(id)
    const r = call(conv, envOf(ctx), 'compare_groups', {
      view: 'hrbp',
      kpi: 'voluntary',
      by: 'location',
      values: [site, emptySite],
      filters: { leader, exclude: ['leader'] },
    })
    expect(r.json.error ?? null).toBeNull()
    const groups = r.json.groups as {
      group: string
      headcount: number | null
      value: unknown
      hidden?: string
    }[]
    const cut = groups.find((g) => g.group === site)
    expect(cut).toMatchObject({ headcount: null, value: null, hidden: GROUP_EXCLUSION(min) })
    // The org has nobody at the other site: the exclusion removes no one there, so it shows.
    const whole = groups.find((g) => g.group === emptySite)
    expect(whole?.headcount).toBeGreaterThan(0)
    expect(whole?.hidden ?? null).toBeNull()
    // Without the exclusion the same group shows as usual.
    const plain = call(conv, envOf(ctx), 'compare_groups', {
      view: 'hrbp',
      kpi: 'voluntary',
      by: 'location',
      values: [site],
    })
    expect((plain.json.groups as { headcount: number | null }[])[0].headcount).toBeGreaterThan(0)
  })

  it('query_records leaves out a group the exclusion cuts by a few people', () => {
    const { id, site, emptySite } = leaderWithSmallSite()
    const conv = new Conversation()
    conv.tokens.index(ctx)
    const leader = conv.tokens.forEmployee(id)
    const r = call(conv, envOf(ctx), 'query_records', {
      dataset: 'employees',
      group_by: ['location'],
      filters: { leader, exclude: ['leader'] },
      limit: 50,
    })
    expect(r.isError).toBe(false)
    const rows = r.json.rows as { group: { location: string } }[]
    const shown = rows.map((x) => x.group.location)
    expect(shown).not.toContain(site)
    expect(shown).toContain(emptySite)
    expect(JSON.stringify(r.json.notes)).toMatch(
      /left out: the scope's exclusions remove fewer than 5 people/,
    )
    // The same grouping without an exclusion lists the site.
    const plain = call(conv, envOf(ctx), 'query_records', {
      dataset: 'employees',
      group_by: ['location'],
      limit: 50,
    })
    expect((plain.json.rows as { group: { location: string } }[]).map((x) => x.group.location)).toContain(
      site,
    )
  })
})
