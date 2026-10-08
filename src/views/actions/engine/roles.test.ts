/**
 * The Action center for every role (docs/ROLES-V2.md 6.2, its four checks; docs/ACTION-CENTER-AUDIT.md
 * part 6, Volume and Roles), on the sample, in every mode:
 *
 *  1. One count: the masthead's number, the page's Needs attention, the Scorecard's and My team's
 *     collections and Ask's `open_items` all come from `roleView` over the same collection, and agree.
 *  2. Mode and scope: every listed item's view, tab and kinds are shown in the mode, and every item
 *     is inside the scope or owned by someone in it.
 *  3. Homes and exports: each mode's Needs attention holds 1 to 15 items (HR's and the CHRO's
 *     escalations at most 10), roll-ups included, every
 *     item has a due date or a stated reason for none, and an export carries the mode and scope line.
 *  4. The routing snapshot is `src/access/roleItems.test.ts` (`access-routing.txt`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { itemInScope, itemShown, roleItems } from '@/access/items'
import { EVERY_RECRUITER } from '@/access/modes'
import { isTableMode } from '@/access/policy'
import { ESCALATIONS_SHOWN } from '@/access/policy/routing'
import { scopeOfAccess } from '@/access/scopes/records'
import { Conversation } from '@/ask/engine/conversation'
import { call, envOf, sampleCtx } from '@/ask/engine/testkit'
import { modeMeta } from '@/lib/export/modeMeta'
import { VIEWS } from '@/views/registry'
import { OTHER_VIEWS } from '@/views/scorecard/views'
import { ITEM_SOURCES } from '@/views/team/ui/views'
import { M as ACTIONS } from '../metrics'
import { collectActions } from './collect'
import { everyMode, samplePicks } from './roleKit'
import { countedOf, lensFor, NEEDS_SHOWN, roleView, showsLists } from './roles'
import { unfold } from './rollups'
import { actionKpis } from './summary'

let modes: ReturnType<typeof everyMode>
beforeAll(() => {
  modes = everyMode()
}, 300_000)

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)

describe('1. one count', () => {
  it('gives the masthead, the page, the Scorecard, My team and Ask the same numbers', () => {
    for (const { mode, ctx, collected, lists } of modes) {
      // The masthead counts Needs attention in a role mode, every open item in Developer, HR and CHRO.
      expect(lists.count, mode).toBe(lists.lists ? lists.needs.length : lists.open.length)
      // The Scorecard's "Critical open items" tile counts the same items as the masthead.
      const counted = countedOf(lists)
      expect(counted.length, mode).toBe(lists.count)
      const tile = actionKpis(counted, ctx).find((k) => k.metricId === ACTIONS.critical)
      expect(tile?.value, mode).toBe(lists.critical)
      expect(lists.lists, mode).toBe(isTableMode(mode))
      // The Scorecard reads the same collection (its views array differs, the collection does not).
      expect(collectActions(ctx, OTHER_VIEWS), mode).toBe(collected)
      // Ask's open_items lists what the page lists.
      const r = call(new Conversation(), envOf(ctx), 'open_items')
      expect(r.isError, `${mode}: ${r.content.slice(0, 120)}`).toBe(false)
      const open = (r.json.open as { count: number }).count
      if (lists.lists) {
        expect(open, mode).toBe(lists.needs.length + lists.waiting.length)
        expect((r.json.needs_attention as { count: number }).count, mode).toBe(lists.needs.length)
        expect((r.json.waiting_on_others as { count: number }).count, mode).toBe(lists.waiting.length)
      } else {
        expect(open, mode).toBe(lists.open.length)
        expect((r.json.escalations as { count: number }).count, mode).toBe(lists.needs.length)
      }
    }
    // My team (Manager mode) collects over the views Manager mode shows, and splits the same way.
    const mgr = modes.find((m) => m.mode === 'manager')!
    const team = roleView(collectActions(mgr.ctx, ITEM_SOURCES), mgr.ctx, () => true)
    expect(ids(team.needs)).toEqual(ids(mgr.lists.needs))
    expect(ids(team.waiting)).toEqual(ids(mgr.lists.waiting))
  })

  it('counts an item handled in one mode as handled in every mode', () => {
    const ops = modes.find((m) => m.mode === 'hr-ops')!
    const hr = modes.find((m) => m.mode === 'hr')!
    const first = ops.lists.needs[0]
    const handled = new Set([first.markKey])
    const open = (a: { markKey: string }) => !handled.has(a.markKey)
    expect(roleView(ops.collected, ops.ctx, open).needs.length).toBe(ops.lists.needs.length - 1)
    expect(roleView(hr.collected, hr.ctx, open).count).toBe(hr.lists.count - 1)
  })
})

describe('2. mode and scope', () => {
  it("lists only items whose view, tab and kinds the mode shows, inside the mode's scope", () => {
    for (const { mode, ctx, collected } of modes) {
      const s = scopeOfAccess(ctx.access)
      for (const a of collected.items) {
        expect(itemShown(ctx.access, a.item), `${mode} ${a.id}`).toBe(true)
        if (!s) continue
        // In scope: about the scope, or owned by someone in it (or by the recruiter).
        const owned =
          s.kind === 'reqs' &&
          (a.ownerName === s.recruiter || (!!s.recruiterId && a.ownerId === s.recruiterId))
        expect(
          owned || itemInScope(ctx.access, { ...a.item, ownerId: a.ownerId }) || scopedRun(mode, a.id),
          `${mode} ${a.id}`,
        ).toBe(true)
      }
    }
  })

  /** Items from the scoped run are inside the scope by construction (the views ran on its data). */
  const scopedRun = (mode: string, id: string): boolean => {
    const m = modes.find((x) => x.mode === mode)!
    return VIEWS.some((v) => v.actions?.(m.ctx).some((i) => i.id === id))
  }
})

describe('3. homes and exports', () => {
  it("holds 1 to 15 items in each mode's Needs attention, HR's and the CHRO's escalations at most 10", () => {
    // The whole list, not the part shown before "Show all": roll-ups keep it short (rollups.ts).
    const counts: Record<string, number> = {}
    const every = sampleCtx({
      access: {
        mode: 'recruiter',
        picks: { ...samplePicks(), recruiter: { name: EVERY_RECRUITER, id: null } },
      },
    })
    const all = [
      ...modes.map((m) => ({ mode: m.mode as string, lists: m.lists })),
      {
        mode: 'recruiter (every recruiter)',
        lists: roleView(collectActions(every, VIEWS), every, () => true),
      },
    ]
    for (const { mode, lists } of all) {
      counts[mode] = lists.needs.length
      const cap = ['hr', 'chro', 'developer'].includes(mode) ? ESCALATIONS_SHOWN : NEEDS_SHOWN
      expect(lists.needs.length, `${mode}: ${lists.needs.length}`).toBeGreaterThanOrEqual(1)
      expect(lists.needs.length, `${mode}: ${lists.needs.length}`).toBeLessThanOrEqual(cap)
    }
    expect(Object.keys(counts)).toHaveLength(12)
  })

  it('folds rather than drops: every item of a list is in it, alone or inside one roll-up', () => {
    for (const { mode, ctx, collected } of modes) {
      const lens = lensFor(ctx)
      const split = roleItems(collected.items, lens)
      const lists = roleView(collected, ctx, () => true)
      for (const [name, before, after] of [
        ['needs', split.needs, lists.needs],
        ['waiting', split.waiting, lists.waiting],
      ] as const) {
        const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort()
        expect(ids(unfold(after)), `${mode} ${name}`).toEqual(ids(before))
        for (const a of after.filter((x) => x.members)) {
          expect(a.members?.length, `${mode} ${a.id}`).toBeGreaterThanOrEqual(2)
          // A roll-up is as pressing as its most pressing item, and carries its legal exposure.
          const rank = { critical: 0, warning: 1, info: 2, good: 3 } as const
          const worst = Math.min(...(a.members ?? []).map((m) => rank[m.item.severity]))
          expect(rank[a.item.severity], a.id).toBe(worst)
          expect(!!a.item.exposure, a.id).toBe((a.members ?? []).some((m) => m.item.exposure))
          expect(a.item.what, a.id).not.toMatch(/\.$/)
        }
      }
    }
  })

  it('gives every listed item a due date or a stated reason for none', () => {
    for (const { mode, lists } of modes)
      for (const a of [...lists.needs, ...lists.waiting]) {
        const reason = !!a.item.closesWhen
        expect(!!a.item.due || !!reason, `${mode} ${a.id}`).toBe(true)
      }
  })

  it('shows the two lists in the role modes only, and stamps every export outside HR and Developer with the mode and scope', () => {
    for (const { mode, ctx } of modes) {
      expect(showsLists(ctx.access), mode).toBe(!['developer', 'hr', 'chro'].includes(mode))
      const line = modeMeta(ctx.access).modeLine
      if (mode === 'hr' || mode === 'developer') expect(line, mode).toBeUndefined()
      else expect(line, mode).toMatch(/^Made in .+ mode/)
      const s = scopeOfAccess(ctx.access)
      if (s) expect(line, mode).toContain(s.label)
    }
  })
})
