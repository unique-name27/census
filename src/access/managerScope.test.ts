/**
 * Manager mode on the sample (docs/ROLES.md, 6.8 test 3): every way the filters change stays inside
 * the manager's org; what the views, the Action center, the records panel, the person card and
 * Talent show keeps to it; and pay, immigration details and engagement surveys are off.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { Conversation } from '@/ask/engine/conversation'
import { resolveFilters } from '@/ask/engine/scope'
import { sampleCtx, sampleData } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { DEFAULT_FILTERS, type Filters, isExcluded } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { personSummary } from '@/drill/person'
import { collectActions } from '@/views/actions/engine'
import { VIEWS } from '@/views/registry'
import { computeTalent } from '@/views/talent/engine'
import { clampFilters, managerLock } from './lock'
import { findingsInMode, kpisInMode } from './numbers'
import { inLock, rowsInLock } from './records'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const hr = sampleCtx()
const leaders = leaderOptions(hr.org, hr.asOf, 3)
/** A mid-size org with a manager above it (so people outside it exist on every side). */
const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && hr.org.byId.get(l.id)?.managerId)!
/** An org under the anonymity minimum (3 or 4 employees with the manager). */
const small = leaders.find((l) => l.size < 5)

const managerCtx = (managerId: string, filters: Partial<Filters> = {}): AnalyticsContext =>
  sampleCtx({
    filters,
    access: { mode: 'manager', managerId },
    showPay: true,
    showImmigration: true,
    engagement: true,
  })

function expectInside(ctx: AnalyticsContext, managerId: string): void {
  const lock = managerLock(ctx.org, ctx.asOf, managerId)!
  expect(lock).not.toBeNull()
  expect(ctx.filters.leaderId && lock.orgIds.has(ctx.filters.leaderId)).toBe(true)
  expect(isExcluded(ctx.filters, 'leaderId')).toBe(false)
  for (const e of ctx.data.employees) expect(lock.orgIds.has(e.employeeId), e.employeeId).toBe(true)
}

describe('the sample has the managers this test needs', () => {
  it('has a mid-size org with a manager above it, and an org under 5', () => {
    expect(mid).toBeDefined()
    expect(small).toBeDefined()
  })
})

describe('every way into the filters keeps to the org (the context and the clamp)', () => {
  const lock = () => managerLock(hr.org, hr.asOf, mid.id)!
  const outside = leaders.find((l) => !lock().orgIds.has(l.id))!

  it('clamps a leader outside, an excluded leader and the defaults', () => {
    for (const f of [
      { leaderId: outside.id },
      { leaderId: mid.id, modes: { leaderId: 'exclude' as const } },
      { leaderId: null },
      {},
      { location: ['Bengaluru'] },
    ]) {
      const ctx = managerCtx(mid.id, f)
      expectInside(ctx, mid.id)
      expect(ctx.isCompany).toBe(false)
    }
    // A leader inside the org stays: a director can narrow to one of their managers.
    const inner = leaders.find((l) => l.id !== mid.id && lock().orgIds.has(l.id))
    if (inner) expect(managerCtx(mid.id, { leaderId: inner.id }).filters.leaderId).toBe(inner.id)
    // Clamping is a no-op on filters already inside.
    const f = { ...DEFAULT_FILTERS, leaderId: mid.id }
    expect(clampFilters(f, lock())).toBe(f)
  })

  it('keeps Ask inside: no leader means the manager; one outside and leaving one out are refused', () => {
    const base = managerCtx(mid.id)
    const conv = new Conversation()
    conv.tokens.index(base)
    const own = resolveFilters(base, undefined, conv.tokens)
    expect(own.ok && own.filters.leaderId).toBe(mid.id)
    const unled = resolveFilters(base, { location: ['Bengaluru'] }, conv.tokens)
    expect(unled.ok && unled.filters.leaderId).toBe(mid.id)
    const out = resolveFilters(base, { leader: conv.tokens.forEmployee(outside.id) }, conv.tokens)
    expect(out.ok).toBe(false)
    if (!out.ok)
      expect(out.error).toMatch(/In Manager mode a leader filter must be someone in \{\{P\d+\}\}'s org/)
    const excl = resolveFilters(
      base,
      { leader: conv.tokens.forEmployee(mid.id), exclude: ['leader'] },
      conv.tokens,
    )
    expect(excl.ok).toBe(false)
  })
})

describe('what Manager mode shows', () => {
  const ctx = managerCtx(mid.id)
  const lock = ctx.access.lock!

  it('turns pay amounts, immigration details and engagement surveys off', () => {
    expect(ctx.access.mode).toBe('manager')
    expect(ctx.showPay).toBe(false)
    expect(ctx.showImmigration).toBe(false)
    expect(ctx.features.engagementSurveys).toBe(false)
    expect(ctx.scopeLabel).toBe(`${lock.managerName}'s org`)
  })

  it("shows only shown metrics from each shown view's summary, each number finite or null", () => {
    for (const v of VIEWS) {
      if (!ctx.access.can(`view:${v.key}`) || !v.summary) continue
      const s = v.summary(ctx)
      for (const k of kpisInMode(ctx.access, s.kpis)) {
        expect(!k.metricId || ctx.access.can(`metric:${k.metricId}`), `${v.key} ${k.id}`).toBe(true)
        expect(k.value == null || Number.isFinite(k.value), `${v.key} ${k.id}`).toBe(true)
      }
      for (const f of findingsInMode(ctx.access, s.findings)) {
        expect(!f.metricId || ctx.access.can(`metric:${f.metricId}`), `${v.key} ${f.id}`).toBe(true)
        for (const p of f.people ?? []) expect(lock.orgIds.has(p.id), `${f.id} ${p.id}`).toBe(true)
      }
      // The hide lists bite: Recruiting's "Hires vs plan" tile (a hiring plan metric) is dropped.
      if (v.key === 'recruiting')
        expect(kpisInMode(ctx.access, s.kpis).some((k) => k.metricId?.startsWith('onboarding.plan.'))).toBe(
          false,
        )
    }
  })

  it("lists only the shown views' Action center items, and no I-9 item", () => {
    const c = collectActions(ctx, VIEWS)
    expect(c.items.length).toBeGreaterThan(0)
    for (const a of c.items) {
      expect(ctx.access.can(`view:${a.item.view}`), a.id).toBe(true)
      expect(a.id.startsWith('onboarding:i9:'), a.id).toBe(false)
    }
    // HR mode lists HR ops and compliance items over the same org.
    const hrItems = collectActions(sampleCtx({ filters: { leaderId: mid.id } }), VIEWS).items
    expect(hrItems.some((a) => !ctx.access.can(`view:${a.item.view}`))).toBe(true)
  })

  it('leaves the company rows out of a "vs company" comparison drill', () => {
    const company = VIEWS.flatMap((v) =>
      v.summary && ctx.access.can(`view:${v.key}`) ? v.summary(ctx).kpis : [],
    )
      .filter((k) => /company/i.test(k.deltaLabel ?? '') && k.deltaDrill)
      .map((k) => resolveDrill(k.deltaDrill))
      .filter((s) => !!s && s.rows.length > 0)
    expect(company.length).toBeGreaterThan(0)
    let left = 0
    for (const spec of company) {
      if (!spec) continue
      const r = rowsInLock(spec, ctx)
      left += r.leftOut
      for (const row of r.rows) expect(inLock(spec.kind, row, ctx)).toBe(true)
    }
    expect(left).toBeGreaterThan(0)
  })

  it('gives someone outside the org the limited person card, and someone inside no pay ratio', () => {
    const boss = ctx.org.byId.get(mid.id)?.managerId as string
    const out = personSummary(ctx, boss)
    expect(out?.outside).toBe(true)
    expect(out?.chain).toEqual([])
    expect(out?.reviews).toEqual([])
    expect(out?.compaRatio).toBeNull()
    const inside = personSummary(ctx, mid.id)
    expect(inside?.outside).toBeFalsy()
    expect(inside?.limited).toBe(true)
    expect(inside?.compaRatio).toBeNull()
    expect(inside?.openCases).toBe(0)
    // HR mode gives the whole card.
    expect(personSummary(hr, boss)?.outside).toBeFalsy()
  })

  it('names no successor outside the org in Talent critical roles', () => {
    const roles = computeTalent(ctx).succession.roles
    const outsideNames = new Set(
      ctx.all.succession
        .filter((s) => s.successorId && !lock.orgIds.has(s.successorId))
        .map((s) => ctx.org.byId.get(s.successorId as string)?.name)
        .filter((n): n is string => !!n),
    )
    for (const r of roles)
      for (const name of r.successorNames.split(', '))
        expect(outsideNames.has(name), `${r.roleId}: ${name}`).toBe(false)
  })
})

describe('an org under the anonymity minimum', () => {
  it('still keeps every scope inside it', () => {
    if (!small) return
    const ctx = managerCtx(small.id, { leaderId: null })
    expectInside(ctx, small.id)
    expect(ctx.access.lock?.size).toBeLessThan(5)
  })
})

/* ───────── through the store: the filter row, Reset, saved views, Filter to ───────── */

describe('through the store guard', () => {
  type Mods = {
    store: typeof import('@/data/store')
    connect: typeof import('./connect')
    modes: typeof import('./store')
    focus: typeof import('@/drill/focus')
    actions: typeof import('@/app/viewActions')
  }
  let m: Mods
  let stop: () => void = () => undefined
  const outsideId = () => leaders.find((l) => !managerLock(hr.org, hr.asOf, mid.id)!.orgIds.has(l.id))!.id

  beforeAll(async () => {
    m = {
      store: await import('@/data/store'),
      connect: await import('./connect'),
      modes: await import('./store'),
      focus: await import('@/drill/focus'),
      actions: await import('@/app/viewActions'),
    }
    await m.store.useCensus.getState().init()
    stop = m.connect.connectAccess({ notify: () => undefined })
    m.modes.useMode.setState({ mode: 'manager', managerId: mid.id })
  }, 60_000)
  afterAll(() => stop())

  const filters = () => m.store.useCensus.getState().filters
  const inside = () => {
    const f = filters()
    const lock = managerLock(hr.org, hr.asOf, mid.id)!
    expect(f.leaderId && lock.orgIds.has(f.leaderId)).toBe(true)
    expect(isExcluded(f, 'leaderId')).toBe(false)
  }

  it('clamps setFilters, an excluded leader and Reset', () => {
    expect(m.store.useCensus.getState().data.employees.length).toBe(sampleData().employees.length)
    inside()
    m.store.useCensus.getState().setFilters({ leaderId: outsideId() })
    inside()
    m.store.useCensus.getState().setFilters({ modes: { leaderId: 'exclude' } })
    inside()
    m.store.useCensus.getState().resetFilters()
    expect(filters().leaderId).toBe(mid.id)
  })

  it('applies a saved view at company scope, and a Focus on from a company finding, inside the org', () => {
    m.actions.applySavedView(
      {
        id: 'v',
        name: 'Company',
        filters: { ...DEFAULT_FILTERS, modes: {} },
        standard: 'bronze',
        lens: false,
        page: null,
      } as never,
      hr,
    )
    inside()
    m.focus.focusScope({ leaderId: outsideId() }, { org: hr.org })
    inside()
    m.focus.focusScope({ level: ['L3'] }, { org: hr.org })
    inside()
    expect(filters().level).toEqual(['L3'])
  })
})
