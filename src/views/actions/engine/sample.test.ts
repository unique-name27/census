/**
 * The Action center on the sample company: every view with `actions` contributes, the counts add
 * up, every item's fields are registered on the Action center's metrics, every copied note keeps
 * the tone rules, and no employee relations item names a person.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { VIEWS } from '@/views/registry'
import { ITEM_USES, M } from '../metrics'
import { type Collected, collectUncached, isPrivateItem } from './collect'
import { groupByOwner } from './group'
import { composeNote, NAGGING } from './note'
import { exportRows } from './rows'
import { actionKpis } from './summary'

let sample: Datasets
const ctxWith = (filters: Partial<Filters> = {}): AnalyticsContext =>
  buildContext({
    data: sample,
    sources: Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample[k].length }]),
    ) as Record<DatasetKey, SourceMeta>,
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
  })

let ctx: AnalyticsContext
let all: Collected
beforeAll(() => {
  sample = generateSample()
  ctx = ctxWith()
  all = collectUncached(ctx, VIEWS)
}, 60_000)

describe('the Action center on the sample', () => {
  it('collects items from every view that has them, with none failing', () => {
    expect(all.errors).toEqual([])
    const withActions = VIEWS.filter((v) => v.actions).map((v) => v.key)
    expect(new Set(all.items.map((a) => a.item.view))).toEqual(new Set(withActions))
    const raw = VIEWS.reduce((n, v) => n + (v.actions?.(ctx).length ?? 0), 0)
    expect(all.items.length + all.hidden.count).toBe(raw)
    expect(new Set(all.items.map((a) => a.id)).size).toBe(all.items.length)
  })

  it('registers every field an item reads on the Action center metrics', () => {
    const registered = new Set(ITEM_USES)
    const missing = new Set<string>()
    for (const a of all.items) for (const u of a.item.uses ?? []) if (!registered.has(u)) missing.add(u)
    expect([...missing]).toEqual([])
    for (const id of Object.values(M))
      expect(ctx.metrics.usesOf(id)).toEqual(expect.arrayContaining([...ITEM_USES]))
  })

  it('counts add up and each key figure drills to exactly its items', () => {
    const kpis = actionKpis(all.items, ctx)
    const open = kpis.find((k) => k.id === 'open')
    expect(open?.value).toBe(all.items.length)
    for (const k of kpis.filter((x) => x.id !== 'owners'))
      expect(resolveDrill(k.drill)?.rows.length ?? 0, k.id).toBe(k.value)
    const groups = groupByOwner(all.items, ctx.asOf)
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(all.items.length)
  })

  it('writes every owner a note that keeps the tone rules', () => {
    for (const g of groupByOwner(all.items, ctx.asOf))
      for (const b of g.owners) {
        const text = composeNote({ name: b.name, isTeam: b.isTeam }, b.items, ctx.asOf)
        expect(text, b.name).not.toMatch(NAGGING)
        expect(text, b.name).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
        expect(text.startsWith('Hi') || text.startsWith('Hello'), b.name).toBe(true)
      }
  })

  it('never names a person or a case ID on an employee relations item', () => {
    const er = all.items.filter((a) => isPrivateItem(a.item))
    for (const a of er) {
      expect(a.item.subject).toEqual({ kind: 'none', label: 'Employee relations case' })
      expect(a.item.drill).toBeFalsy()
      expect(a.personId).toBeNull()
      const caseId = a.id.split(':')[2]
      expect(JSON.stringify(exportRows([a], ctx.asOf))).not.toContain(caseId)
      expect(composeNote({ name: a.ownerName, isTeam: a.isTeam }, [a], ctx.asOf)).not.toContain(caseId)
    }
  })

  it('in "My team" mode shows a talent acquisition manager their recruiters\' items', () => {
    const recruiter = all.items.find((a) => a.role === 'recruiter' && a.ownerId)
    const managerId = recruiter && ctx.org.byId.get(recruiter.ownerId!)?.managerId
    expect(managerId).toBeTruthy()
    const team = collectUncached(ctxWith({ leaderId: managerId! }), VIEWS)
    expect(team.leader?.id).toBe(managerId)
    expect(team.items.some((a) => a.id === recruiter!.id && a.team === 'org')).toBe(true)
    expect(team.items.length).toBeLessThan(all.items.length)
  })
})
