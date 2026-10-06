/**
 * Exclude in Ask's tool filters (docs/FILTERS.md, part 3): the same modes as the filter row, read
 * by `resolveFilters`, described by `get_context` and every result's scope; and Ask's privacy rules
 * still hold: an excluded leader passes the same leader checks, leaving out fewer people than the
 * anonymity minimum is refused, and the scope-size and differencing checks apply after exclusions.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import type { Employee } from '@/data/schema'
import { DEFAULT_FILTERS, isActiveAt, isEmployee } from '@/data/scope'
import { minGroupOf } from '@/metrics/privacy'
import { VIEWS } from '@/views/registry'
import { DIFFERENCING } from './audit'
import { Conversation } from './conversation'
import { contextFor, resolveFilters, scopeWords } from './scope'
import { call, envOf, expectClean, sampleCtx } from './testkit'
import { TOOL_DEFINITIONS } from './tools'
import { num } from './tools/shared'

type QRow = { count: number | null; people?: number | null; hidden?: string } & Record<string, unknown>

let ctx: AnalyticsContext
let min: number
beforeAll(() => {
  ctx = sampleCtx()
  min = minGroupOf(ctx.metrics)
}, 60_000)

const active = (c: AnalyticsContext): Employee[] =>
  c.all.employees.filter((e) => isEmployee(e) && isActiveAt(e, c.asOf))

/** Values of a dimension with their active headcount, largest first. */
function sizes(c: AnalyticsContext, dim: 'businessUnit' | 'department' | 'location' | 'level') {
  const n = new Map<string, number>()
  for (const e of active(c)) {
    const v = e[dim]
    if (v) n.set(v, (n.get(v) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1])
}

function tokenFor(conv: Conversation, c: AnalyticsContext, id: string): string {
  conv.tokens.index(c)
  return conv.tokens.forEmployee(id)
}

describe('exclude in tool filters', () => {
  it('reads exclude like the filter row: everyone except the values', () => {
    const conv = new Conversation()
    const [bu] = sizes(ctx, 'businessUnit')[0]
    const r = resolveFilters(ctx, { business_unit: [bu], exclude: ['business_unit'] }, conv.tokens)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.filters.modes).toEqual({ businessUnit: 'exclude' })
    expect(scopeWords(r.filters, conv.tokens)).toBe(`Whole company except ${bu}`)
    const scoped = contextFor(ctx, r.filters)
    expect(scoped.data.employees.every((e) => e.businessUnit !== bu)).toBe(true)
    expect(scoped.data.employees.length).toBe(ctx.all.employees.filter((e) => e.businessUnit !== bu).length)
    // The cache keys on modes: the same values included are another scope.
    const inc = resolveFilters(ctx, { business_unit: [bu] }, conv.tokens)
    expect(inc.ok && contextFor(ctx, inc.filters)).not.toBe(scoped)
  })

  it('needs values for each filter it names, and only filter names', () => {
    const conv = new Conversation()
    const none = resolveFilters(ctx, { exclude: ['location'] }, conv.tokens)
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.error).toMatch(/no location is given/)
    const bad = resolveFilters(ctx, { location: ['Bengaluru'], exclude: ['city'] }, conv.tokens)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/exclude takes/)
  })

  it('is in the tool schema, and get_context and every result describe it', () => {
    const vs = TOOL_DEFINITIONS.find((t) => t.name === 'view_summary')
    const schema = vs?.input_schema.properties as
      | Record<string, { properties?: Record<string, unknown> }>
      | undefined
    const props = schema?.filters?.properties
    expect(props && 'exclude' in props).toBe(true)
    const conv = new Conversation()
    const g = call(conv, envOf(ctx), 'get_context')
    expect(JSON.stringify(g.json.notes)).toMatch(/exclude/)
    expect((g.json.filters as { exclude: unknown }).exclude).toEqual([])
    const [loc] = sizes(ctx, 'location')[0]
    const r = call(conv, envOf(ctx), 'view_summary', {
      view: 'hrbp',
      filters: { location: [loc], exclude: ['location'] },
    })
    expect(r.isError).toBe(false)
    expect(r.json.scope).toBe(`Whole company except ${loc}`)
    expect((r.json.filters as { exclude: unknown }).exclude).toEqual(['location'])
    // The same numbers as the view's own engine on that scope.
    const own = VIEWS.find((v) => v.key === 'hrbp')?.summary?.(
      sampleCtx({ filters: { location: [loc], modes: { location: 'exclude' } } }),
    )
    const kpis = r.json.key_figures as { id: string; value: number | null }[]
    for (const k of own?.kpis ?? [])
      expect(kpis.find((x) => x.id === k.id)?.value, k.id).toBe(k.suppressed ? null : num(k.value))
    expectClean(r.content, 'exclusion summary')
  })

  it('follows the user’s own exclusions when a tool gives no filters', () => {
    const [loc] = sizes(ctx, 'location')[0]
    const own = sampleCtx({ filters: { location: [loc], modes: { location: 'exclude' } } })
    const r = call(new Conversation(), envOf(own), 'view_summary', { view: 'hrbp' })
    expect(r.json.scope).toBe(`Whole company except ${loc}`)
  })
})

describe('Ask’s privacy rules hold with exclusions', () => {
  it('an excluded leader passes the same leader checks', () => {
    const conv = new Conversation()
    const ic = active(ctx).find((e) => !ctx.org.children.get(e.employeeId)?.length) as Employee
    const r = resolveFilters(
      ctx,
      { leader: tokenFor(conv, ctx, ic.employeeId), exclude: ['leader'] },
      conv.tokens,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/is not a leader/)
    const small = leaderOptions(ctx.org, ctx.asOf).find((l) => l.size < min)
    expect(small).toBeDefined()
    if (small) {
      const s = resolveFilters(
        ctx,
        { leader: tokenFor(conv, ctx, small.id), exclude: ['leader'] },
        conv.tokens,
      )
      expect(s.ok).toBe(false)
      if (!s.ok) expect(s.error).toMatch(/anonymity minimum/)
    }
    const big = leaderOptions(ctx.org, ctx.asOf).find((l) => l.size >= 20 && l.size < 200) as { id: string }
    const ok = resolveFilters(ctx, { leader: tokenFor(conv, ctx, big.id), exclude: ['leader'] }, conv.tokens)
    expect(ok.ok).toBe(true)
    if (ok.ok)
      expect(scopeWords(ok.filters, conv.tokens)).toMatch(/^Whole company except \{\{P\d+\}\}'s org$/)
  })

  it('refuses leaving out fewer people than the minimum (the difference would single them out)', () => {
    const conv = new Conversation()
    const tiny = sizes(ctx, 'level').find(([, n]) => n > 0 && n < min)
    expect(tiny).toBeDefined()
    if (!tiny) return
    const r = resolveFilters(ctx, { level: [tiny[0]], exclude: ['level'] }, conv.tokens)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/fewer than 5 people/)
    // Within another scope, what counts is who the exclusion removes from that scope.
    const [bu] = sizes(ctx, 'businessUnit').find(([b]) =>
      active(ctx).some((e) => e.businessUnit === b && e.level === tiny[0]),
    ) ?? [null]
    expect(bu).not.toBeNull()
    if (bu) {
      const inside = resolveFilters(
        ctx,
        { business_unit: [bu], level: [tiny[0]], exclude: ['level'] },
        conv.tokens,
      )
      expect(inside.ok).toBe(false)
    }
    // Leaving out a value nobody in scope has removes no one, and is fine.
    const call0 = resolveFilters(ctx, { level: [sizes(ctx, 'level')[0][0]], exclude: ['level'] }, conv.tokens)
    expect(call0.ok).toBe(true)
  })

  it('applies the scope-size check after exclusions', () => {
    // A group to keep and a group to leave out of it that removes at least the minimum and leaves
    // a handful behind.
    type Dim = 'businessUnit' | 'department' | 'location' | 'level'
    const ARG: Record<Dim, string> = {
      businessUnit: 'business_unit',
      department: 'department',
      location: 'location',
      level: 'level',
    }
    let pick: { keep: Dim; keepValue: string; out: Dim; outValue: string } | null = null
    const dims: Dim[] = ['department', 'businessUnit', 'location', 'level']
    search: for (const keep of dims)
      for (const out of dims) {
        if (out === keep) continue
        for (const [keepValue, n] of sizes(ctx, keep)) {
          const people = active(ctx).filter((e) => e[keep] === keepValue)
          const by = new Map<string, number>()
          for (const e of people) if (e[out]) by.set(e[out] as string, (by.get(e[out] as string) ?? 0) + 1)
          for (const [outValue, k] of by) {
            const left = n - k
            if (k >= min && left > 0 && left < min) {
              pick = { keep, keepValue, out, outValue }
              break search
            }
          }
        }
      }
    expect(pick).not.toBeNull()
    if (!pick) return
    const r = call(new Conversation(), envOf(ctx), 'query_records', {
      dataset: 'employees',
      filters: {
        [ARG[pick.keep]]: [pick.keepValue],
        [ARG[pick.out]]: [pick.outValue],
        exclude: [ARG[pick.out]],
      },
    })
    expect(r.isError).toBe(true)
    expect(r.json.error).toMatch(/fewer than 5 people, the anonymity minimum/)
  })

  it('applies the differencing check to the rows left after exclusions', () => {
    const [dept] = sizes(ctx, 'department')[0]
    const filters = { department: [dept], exclude: ['department'] }
    const scoped = sampleCtx({
      filters: { ...DEFAULT_FILTERS, department: [dept], modes: { department: 'exclude' } },
    })
    const cycle = ctx.all.reviews[0]?.cycle as string
    const rated = new Set(scoped.data.reviews.filter((r) => r.cycle === cycle).map((r) => r.employeeId))
    // A level held by one to four rated people in that scope.
    const byLevel = new Map<string, number>()
    for (const e of scoped.data.employees)
      if (rated.has(e.employeeId)) byLevel.set(e.level ?? '', (byLevel.get(e.level ?? '') ?? 0) + 1)
    const lone = [...byLevel].find(([l, n]) => l && n > 0 && n < min)?.[0]
    expect(lone).toBeDefined()
    if (!lone) return
    const conv = new Conversation()
    const where = [{ field: 'cycle', op: 'eq', value: cycle }]
    const all = call(conv, envOf(ctx), 'query_records', {
      dataset: 'reviews',
      filters,
      where,
      measures: [{ op: 'mean', field: 'rating' }],
    })
    const minus = call(conv, envOf(ctx), 'query_records', {
      dataset: 'reviews',
      filters,
      where: [...where, { field: 'org.level', op: 'ne', value: lone }],
      measures: [{ op: 'mean', field: 'rating' }],
    })
    const a = all.json.total as QRow
    const b = minus.json.total as QRow
    expect(a.mean_rating == null || b.mean_rating == null).toBe(true)
    if (a.mean_rating != null) expect(b.hidden).toBe(DIFFERENCING(min))
  })
})
