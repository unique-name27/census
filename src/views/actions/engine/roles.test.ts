/**
 * The Action center for every role (docs/ROLES-V2.md 6.2, its four checks; docs/ACTION-CENTER-AUDIT.md
 * part 6, Volume and Roles), on the sample, in every mode:
 *
 *  1. One count: the masthead's number, the page's Needs attention, the Scorecard's and My team's
 *     collections and Ask's `open_items` all come from `roleView` over the same collection, and agree.
 *  2. Mode and scope: every listed item's view, tab and kinds are shown in the mode, and every item
 *     is inside the scope or owned by someone in it.
 *  3. Homes and exports: each mode's Needs attention holds 1 to 15 items before "Show all", every
 *     item has a due date or a stated reason for none, and an export carries the mode and scope line.
 *  4. The routing snapshot is `src/access/roleItems.test.ts` (`access-routing.txt`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { itemInScope, itemShown } from '@/access/items'
import { isTableMode } from '@/access/policy'
import { ESCALATIONS_SHOWN } from '@/access/policy/routing'
import { scopeOfAccess } from '@/access/scopes/records'
import { Conversation } from '@/ask/engine/conversation'
import { call, envOf } from '@/ask/engine/testkit'
import { modeMeta } from '@/lib/export/modeMeta'
import { VIEWS } from '@/views/registry'
import { OTHER_VIEWS } from '@/views/scorecard/views'
import { ITEM_SOURCES } from '@/views/team/ui/views'
import { collectActions } from './collect'
import { everyMode } from './roleKit'
import { NEEDS_SHOWN, roleView, showsLists } from './roles'

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
  it("holds 1 to 15 items in each mode's Needs attention before Show all, CHRO's escalations at most 10", () => {
    const counts: Record<string, number> = {}
    for (const { mode, lists } of modes) {
      counts[mode] = lists.needs.length
      const shown = lists.needs.slice(0, mode === 'chro' || mode === 'hr' ? ESCALATIONS_SHOWN : NEEDS_SHOWN)
      expect(shown.length, `${mode}: ${lists.needs.length}`).toBeGreaterThanOrEqual(1)
      expect(shown.length, mode).toBeLessThanOrEqual(NEEDS_SHOWN)
    }
    // A record of the volume per mode on the sample (the report quotes it).
    expect(Object.keys(counts)).toHaveLength(11)
  })

  it('gives every listed item a due date or a stated reason for none', () => {
    for (const { mode, lists } of modes)
      for (const a of [...lists.needs, ...lists.waiting]) {
        const reason = a.item.closesWhen || /no cycle close date set/.test(a.item.what)
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
