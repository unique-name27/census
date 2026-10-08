/**
 * Finance's home shows the workforce cost metrics (`comp.cost.*`: headcount and cost against
 * budget, the contractor estimate, target cash cost), so the dictionary lists Home among their
 * views. A metric is judged by its views (docs/ROLES-V2.md 8.3): listed on Home too, it stays on
 * Finance's home when an override hides Compensation for Finance, while Compensation's own
 * measures go with the view. Who may see them does not change: cost totals stay with Developer,
 * HR, CHRO, Compensation and Finance.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import { overridesOf, resetPolicyState } from '@/access/overrides'
import { decide, setPolicyOverrides } from '@/access/policy'
import { BUDGET_METRICS } from '@/lib/budget'
import { CATALOG, metricsOfView } from '@/metrics/catalog'
import { M as COMP } from '@/views/comp/metrics'

afterEach(() => resetPolicyState())

const COST = [BUDGET_METRICS.headcount, BUDGET_METRICS.cost, BUDGET_METRICS.contractors, COMP.costTargetCash]
const metricViews = (id: string) => CATALOG.byId.get(id)?.views
const shown = (mode: (typeof MODES)[number], id: string) =>
  decide(mode, `metric:${id}`, undefined, { metricViews }).access !== 'hidden'

describe("the cost metrics on Finance's home", () => {
  it('list Home among their views, after Compensation', () => {
    for (const id of COST) expect(CATALOG.byId.get(id)?.views, id).toEqual(['comp', 'home'])
    const onHome = metricsOfView('home').map((d) => d.id)
    for (const id of COST) expect(onHome, id).toContain(id)
  })

  it('show where cost totals show, and nowhere else', () => {
    const where = ['hr', 'chro', 'compensation', 'finance', 'developer']
    for (const id of COST) for (const m of MODES) expect(shown(m, id), `${id} ${m}`).toBe(where.includes(m))
  })

  it("stay on Finance's home when an override hides Compensation for Finance", () => {
    setPolicyOverrides(
      overridesOf([
        {
          role: 'finance',
          surface: 'view:comp',
          decision: 'hidden',
          reason: 'Cost from the home only',
          by: 'QA',
          at: '2026-10-08T09:00:00.000Z',
        },
      ]),
    )
    expect(decide('finance', 'view:comp').access).toBe('hidden')
    for (const id of COST) expect(shown('finance', id), id).toBe(true)
    // A Compensation measure that is not on Finance's home goes with the view.
    expect(shown('finance', COMP.costPerHead)).toBe(false)
  })
})
