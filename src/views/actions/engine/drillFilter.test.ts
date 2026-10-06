/**
 * "Filter to this" on the Action center (docs/FILTERS.md, part 4). Its own numbers count items by
 * owner, owner group, due date, severity and source view, none of them a filter, so none of its
 * drills sets one. An item's own records (the About cell) carry the filter its view set, and that
 * filter always names values in the loaded data.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { vocabularyOf } from '@/data/urlScope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { filterDimensions, filterInData } from '@/drill/filter'
import { VIEWS } from '@/views/registry'
import { type Collected, collectUncached } from './collect'
import { groupByOwner } from './group'
import { itemsDrill } from './rows'
import { actionKpis, ownersDrill, viewRows } from './summary'

let ctx: AnalyticsContext
let all: Collected
beforeAll(() => {
  const sample: Datasets = generateSample()
  ctx = buildContext({
    data: sample,
    sources: Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample[k].length }]),
    ) as Record<DatasetKey, SourceMeta>,
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
  })
  all = collectUncached(ctx, VIEWS)
}, 60_000)

const filterOf = (src: DrillSource) => resolveDrill(src)?.filter

describe('the Action center and "Filter to this"', () => {
  it('sets no filter on its own counts: owners, owner groups, due dates and views are no filters', () => {
    const open = all.items
    expect(open.length).toBeGreaterThan(0)
    for (const k of actionKpis(open, ctx)) expect(filterOf(k.drill), k.id).toBeUndefined()
    const owners = ownersDrill(open, ctx)
    expect(owners.filter).toBeUndefined()
    for (const r of owners.rows) expect(filterOf(r.itemsDrill), r.owner).toBeUndefined()
    for (const g of groupByOwner(open, ctx.asOf)) {
      expect(itemsDrill(ctx, g.label, g.items).filter).toBeUndefined()
      for (const b of g.owners) expect(itemsDrill(ctx, b.name, b.items).filter).toBeUndefined()
    }
    for (const v of viewRows(open, ctx))
      expect(
        itemsDrill(
          ctx,
          v.view,
          open.filter((a) => a.item.view === v.viewKey),
        ).filter,
      ).toBeUndefined()
  })

  it("an item's own records carry only its view's filter, for values in the data", () => {
    const vocab = vocabularyOf(ctx)
    let n = 0
    for (const a of all.items) {
      const filter = filterOf(a.item.drill)
      if (!filter) continue
      n++
      expect(filterDimensions(filter).length + (filter.period ? 1 : 0), a.id).toBeGreaterThan(0)
      expect(filterInData(filter, vocab), `${a.id}: ${JSON.stringify(filter)}`).toBe(true)
    }
    // Listening's stay risk and exit reason items are about one group each.
    expect(n).toBeGreaterThanOrEqual(2)
  })
})
