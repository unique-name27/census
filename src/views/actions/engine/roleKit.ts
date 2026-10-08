/**
 * The sample company in every mode, for the Action center's readiness tests (docs/ROLES-V2.md 6.2;
 * docs/ACTION-CENTER-AUDIT.md part 6): one context per mode with a pick for every scoped mode
 * (Silicon Engineering, APAC, a recruiter and a manager who own items), cached. Not imported by
 * the app.
 */
import { MODES, type Mode, type ModePicks } from '@/access/modes'
import { sampleCtx, sampleData } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { VIEWS } from '@/views/registry'
import { type Collected, collectActions } from './collect'
import { type RoleView, roleView } from './roles'

let picks: ModePicks | null = null

/**
 * The picks the tests use: Silicon Engineering, APAC, the recruiter and the manager who own the
 * most items on the sample (a manager leading 3 or more people).
 */
export function samplePicks(): ModePicks {
  if (picks) return picks
  const hr = sampleCtx()
  const items = collectActions(hr, VIEWS).items
  const count = (pred: (a: Collected['items'][number]) => string | null) => {
    const n = new Map<string, number>()
    for (const a of items) {
      const k = pred(a)
      if (k) n.set(k, (n.get(k) ?? 0) + 1)
    }
    return [...n.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
  }
  const reports = new Map<string, number>()
  for (const e of sampleData().employees)
    if (e.managerId && !e.terminationDate) reports.set(e.managerId, (reports.get(e.managerId) ?? 0) + 1)
  const manager = count((a) =>
    a.role === 'manager' && a.ownerId && (reports.get(a.ownerId) ?? 0) >= 3 ? a.ownerId : null,
  )[0]?.[0]
  const recruiter = count((a) =>
    a.role === 'recruiter' && a.ownerId && !a.isTeam ? a.ownerName : null,
  )[0]?.[0]
  picks = {
    managerId: manager ?? null,
    unit: 'Silicon Engineering',
    region: 'APAC',
    recruiter: recruiter ? { name: recruiter, id: null } : null,
  }
  return picks
}

const contexts = new Map<Mode, AnalyticsContext>()

/** The sample in a mode, with the test picks. */
export function modeCtx(mode: Mode): AnalyticsContext {
  let c = contexts.get(mode)
  if (!c) {
    c = sampleCtx({ access: { mode, picks: samplePicks() } })
    contexts.set(mode, c)
  }
  return c
}

/** Every mode's collection and lists on the sample (nothing marked in this browser). */
export function everyMode(): { mode: Mode; ctx: AnalyticsContext; collected: Collected; lists: RoleView }[] {
  return MODES.map((mode) => {
    const ctx = modeCtx(mode)
    const collected = collectActions(ctx, VIEWS)
    return { mode, ctx, collected, lists: roleView(collected, ctx, () => true) }
  })
}
