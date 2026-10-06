/** Time budgets for the Org chart engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { sampleCtx } from './fixtures'
import { layoutTree, visibleTree } from './layout'
import { buildOrgModel } from './model'

const ctx = sampleCtx()

describe('Org chart engine on the sample company', () => {
  it('builds the tree, flags and default layout in under 150 ms', () => {
    const ms = bestCostMs(() => {
      const m = buildOrgModel(ctx)
      const expanded = new Set([m.rootId, ...(m.tree.children.get(m.rootId) ?? [])])
      layoutTree(visibleTree(m.tree, m.rootId, expanded, { reqs: m.reqs }))
    })
    expect(ms).toBeLessThan(150)
  })

  it('lays out the whole company expanded in under 150 ms', () => {
    const m = buildOrgModel(ctx)
    const all = new Set(m.tree.people.keys())
    expect(bestCostMs(() => layoutTree(visibleTree(m.tree, m.rootId, all)))).toBeLessThan(150)
  })
})
