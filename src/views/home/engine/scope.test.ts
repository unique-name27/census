/**
 * Test 4 of docs/ROLES-V2.md 8.8: homes never show out-of-scope rows. For every scoped home on the
 * sample (HRBP for Silicon Engineering, HRBP for APAC, a recruiter's reqs): every home figure's
 * records, every Needs attention and Waiting on others item (its subject, the owner rule and its
 * drill rows) and every My list row pass the records guard (`inScope`); "vs company" comparisons
 * open nothing; and the measures behind the hero open records inside the scope only.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { itemInScope } from '@/access/items'
import type { Mode } from '@/access/modes'
import { inScope, personInScope, rowsInScope } from '@/access/scopes/records'
import type { AnalyticsContext } from '@/data/context'
import { resolveDrill } from '@/drill/Drill'
import type { DrillKind } from '@/drill/types'
import { type Collected, collectActions, type RoleView, roleView } from '@/views/actions/engine'
import { modeCtx } from '@/views/actions/engine/roleKit'
import { hrbpModel } from '@/views/hrbp/engine'
import { attritionTrailing, COMPANY_LINE } from '@/views/hrbp/engine/trends'
import { computeOnboarding } from '@/views/onboarding/engine'
import { countdownRows } from '@/views/onboarding/engine/upcoming'
import { computeRecruiting } from '@/views/recruiting/engine'
import { reqAgeDots } from '@/views/recruiting/engine/reqs'
import { VIEWS } from '@/views/registry'
import { scorecardNow } from '@/views/scorecard/engine/schedule'
import { OTHER_VIEWS } from '@/views/scorecard/views'
import { talentModel } from '@/views/talent/engine'
import { comparisonOpens } from './compare'
import { groupAttrition, hrbpLists } from './hrbp'
import { lackingParts, queueRows } from './rec'

const SCOPED: readonly Mode[] = ['hrbp-unit', 'hrbp-region', 'recruiter']

interface Run {
  mode: Mode
  ctx: AnalyticsContext
  collected: Collected
  lists: RoleView
}

let runs: Run[]
beforeAll(() => {
  runs = SCOPED.map((mode) => {
    const ctx = modeCtx(mode)
    const collected = collectActions(ctx, VIEWS)
    return { mode, ctx, collected, lists: roleView(collected, ctx, () => true) }
  })
}, 300_000)

const outside = (ctx: AnalyticsContext, kind: DrillKind, rows: readonly unknown[]): unknown[] =>
  rows.filter((r) => !inScope(kind, r, ctx))

describe('test 4: homes never show out-of-scope rows', () => {
  it('runs on a scope that holds people and reqs', () => {
    for (const { mode, ctx } of runs) {
      expect(ctx.access.scope, mode).toBeTruthy()
      expect(ctx.access.unset, mode).toBe(false)
      expect(ctx.access.scope?.size ?? 0, mode).toBeGreaterThan(5)
    }
  })

  it('lists Needs attention and Waiting on others items about the scope or owned in it, their records inside it', () => {
    for (const { mode, ctx, lists } of runs) {
      const s = ctx.access.scope!
      expect(lists.lists, mode).toBe(true)
      expect(lists.needs.length + lists.waiting.length, mode).toBeGreaterThan(0)
      for (const a of [...lists.needs, ...lists.waiting]) {
        const about = itemInScope(ctx.access, { ...a.item, ownerId: null })
        const owned =
          (!!a.ownerId && personInScope(a.ownerId, ctx.access)) ||
          (s.kind === 'reqs' && a.ownerName.trim().toLowerCase() === s.recruiter.trim().toLowerCase())
        const scopedRun = VIEWS.some((v) => v.actions?.(ctx).some((i) => i.id === a.id))
        expect(about || owned || scopedRun, `${mode} ${a.id}`).toBe(true)
        // An item about the scope opens records inside it (one found by its owner may reach outside,
        // and the records panel then lists only what is inside).
        if (!about && !scopedRun) continue
        const spec = resolveDrill(a.item.drill)
        if (!spec) continue
        expect(rowsInScope(spec, ctx).leftOut, `${mode} ${a.id}: ${spec.title}`).toBe(0)
      }
    }
  })

  it('keeps the HRBP lists and figures inside the business unit or region', () => {
    for (const { mode, ctx } of runs.filter((r) => r.mode !== 'recruiter')) {
      const m = hrbpModel(ctx)
      const { leaders, sites } = hrbpLists(ctx)
      if (mode === 'hrbp-unit') expect(leaders.length).toBeGreaterThan(0)
      else expect(sites.length).toBeGreaterThan(0)
      for (const r of leaders) {
        expect(
          personInScope(r.id, ctx.access) || inScope('employees', ctx.org.byId.get(r.id), ctx),
          r.leader,
        ).toBe(true)
        for (const list of [r.active, r.voluntaryLeavers, r.regrettedLeavers, r.joined, r.left])
          expect(outside(ctx, 'employees', list), `${mode} ${r.leader}`).toEqual([])
        expect(outside(ctx, 'requisitions', r.reqs), `${mode} ${r.leader} reqs`).toEqual([])
        expect(outside(ctx, 'jobChanges', r.promotions), `${mode} ${r.leader} promotions`).toEqual([])
      }
      for (const r of sites) {
        expect(ctx.access.scope?.kind === 'region' && ctx.access.scope.sites.includes(r.site), r.site).toBe(
          true,
        )
        expect(outside(ctx, 'employees', r.active), r.site).toEqual([])
        expect(outside(ctx, 'requisitions', r.reqs), r.site).toEqual([])
        expect(
          outside(
            ctx,
            'cases',
            r.cases.map((f) => f.record),
          ),
          r.site,
        ).toEqual([])
        expect(
          outside(ctx, 'rightToWork', [...r.expiring.map((x) => x.r), ...r.i9.map((x) => x.r)]),
          r.site,
        ).toEqual([])
      }
      for (const dim of ['department', 'location'] as const)
        for (const g of groupAttrition(m, dim).rows)
          expect(outside(ctx, 'employees', g.leavers), `${mode} ${g.group}`).toEqual([])
      const people = talentModel(ctx).retention.keyTalent.map((r) => ctx.org.byId.get(r.employeeId))
      expect(outside(ctx, 'employees', people), `${mode} key talent`).toEqual([])
      const b = computeRecruiting(ctx).base
      expect(
        outside(
          ctx,
          'requisitions',
          reqAgeDots(b.req.rows).map((d) => d.row.req),
        ),
        `${mode} req risk`,
      ).toEqual([])
      expect(
        outside(
          ctx,
          'candidates',
          b.actives.map((x) => x.app.raw),
        ),
        `${mode} pipeline`,
      ).toEqual([])
      // The trailing attrition line: the scope's points open its leavers; the company's open nothing.
      const t = attritionTrailing(m.prep)
      for (const pt of t.voluntary) {
        if (pt.series === COMPANY_LINE) expect(comparisonOpens(ctx.access)).toBe(false)
        else expect(outside(ctx, 'employees', pt.records), `${mode} ${pt.date}`).toEqual([])
      }
    }
  }, 120_000)

  it("keeps the recruiter's lists and figures on the recruiter's reqs", () => {
    const { ctx } = runs.find((r) => r.mode === 'recruiter')!
    const s = ctx.access.scope!
    expect(s.kind).toBe('reqs')
    const b = computeRecruiting(ctx).base
    expect(b.req.rows.length).toBeGreaterThan(0)
    expect(
      outside(
        ctx,
        'requisitions',
        b.req.rows.map((r) => r.req),
      ),
    ).toEqual([])
    const parts = lackingParts(b.actives)
    expect(
      outside(
        ctx,
        'candidates',
        parts.flatMap((p) => p.items.map((x) => x.app.raw)),
      ),
    ).toEqual([])
    expect(
      outside(
        ctx,
        'candidates',
        queueRows(b.actives, String).map((r) => r.item.app.raw),
      ),
    ).toEqual([])
    const o = computeOnboarding(ctx)
    for (const r of countdownRows(o.upcoming.rows, o.base.settings.readinessHorizonDays, o.base.masked)) {
      const start = r.row.start
      const onReqs =
        (!!start.candidate && inScope('candidates', start.candidate, ctx)) ||
        (!!start.employee && personInScope(start.employee.employeeId, ctx.access))
      expect(onReqs, start.name).toBe(true)
    }
  })

  it('opens the measures behind the hero inside the scope only', () => {
    for (const { mode, ctx } of runs.filter((r) => r.mode !== 'recruiter')) {
      const model = scorecardNow(ctx, OTHER_VIEWS)
      let opened = 0
      for (const row of model.rows) {
        const spec = resolveDrill(row.kpi.drill)
        if (!spec) continue
        opened++
        expect(rowsInScope(spec, ctx).leftOut, `${mode} ${row.id}: ${spec.title}`).toBe(0)
      }
      expect(opened, mode).toBeGreaterThan(5)
    }
  }, 120_000)

  it('makes "vs company" comparisons open nothing in a scope, and open them without one', () => {
    for (const { mode, ctx } of runs) {
      expect(comparisonOpens(ctx.access), mode).toBe(false)
      expect(ctx.access.can('ui:kpi-delta-company'), mode).toBe(false)
    }
    expect(comparisonOpens(modeCtx('chro').access)).toBe(true)
  })
})
