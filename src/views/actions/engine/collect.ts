/**
 * Collects every view's open items (`ViewDef.actions`) for the Action center, once per analytics
 * context (docs/VIEWS.md, Action center; docs/ACTION-CENTER-AUDIT.md part 4):
 *
 *  - each view runs on its own; one that throws is listed in `errors` and the rest still show;
 *  - the mode lists only the items of the views and records it shows (`itemsShown`);
 *  - a scoped mode (an org, a business unit, a region, a recruiter's reqs) and "My team" add the
 *    items anywhere in the company owned by someone in the scope: a wide run over the context
 *    without the scope (`withoutScope`), kept to `itemInScope`;
 *  - items about the same matter from two views ("license:E12069") fold into the one from the
 *    view that owns the matter (Compliance for licenses, I-9s and work authorizations);
 *  - one severity rubric (`severityOf`): legal exposure and a person blocked past the overdue
 *    limit are critical, overdue is Watch, the rest keep their view's thresholds;
 *  - items whose data is below the on-screen standard still show: workflow is not a statistic.
 *    Each is tagged with its tier and counted (`below`), with what holds it back;
 *  - owners named only by name are matched to the roster, so one person is one owner across views;
 *  - an employee relations item is left out when the scope holds fewer people than the anonymity
 *    minimum, so a small team never learns that one of them has an open case.
 *
 * Results are cached per context and per set of source views, so the masthead, the page, the
 * homes and Ask share one collection. `scheduleCollect` runs it in idle time, one view per slice.
 * Pure: no React.
 */
import { itemInScope, itemsShown } from '@/access/items'
import { scopeOfAccess } from '@/access/scopes/records'
import { errorMessage, logDevError } from '@/app/devlog'
import { gateFor, subjectOf } from '@/components/tier/tierModel'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Tier } from '@/data/quality/tier'
import {
  CASE_CATEGORIES,
  type DatasetKey,
  type ISODate,
  ONBOARDING_OWNERS,
  type ViewKey,
} from '@/data/schema'
import {
  type Filters,
  focusLeader,
  hasOrgFilter,
  scopeDatasets,
  scopeLabel,
  subtreeIds,
  withMode,
} from '@/data/scope'
import { headcountAt } from '@/lib/people'
import { minGroupOf } from '@/metrics/privacy'
import { ownerLookup } from '@/views/hrbp/engine/owners'
import { ACTION_OWNER_LABEL, ACTION_OWNER_ROLES, type ActionItem, type ActionOwnerRole } from '@/views/types'
import { daysToDue } from './due'
import { markKeyOf } from './marks'
import { settingsOf } from './settings'
import { severityOf } from './severity'

/** What the Action center needs from a view (a `ViewDef` fits). */
export interface ViewSource {
  key: ViewKey
  label: string
  tabs: readonly { key: string; label: string }[]
  datasets: readonly DatasetKey[]
  actions?: (ctx: AnalyticsContext) => ActionItem[]
}

/** How an item's owner relates to the leader picked in "My team" mode. */
export type TeamRelation = 'leader' | 'org' | 'other'

/** The data behind an item is below the on-screen standard: it is listed, tagged with its tier. */
export interface BelowStandard {
  tier: Tier
  /** What holds it back: "Candidates current stage", "Onboarding tasks". */
  subject: string
  dataset: DatasetKey | null
}

/** One open item with what the page shows beside it. */
export interface OpenAction {
  item: ActionItem
  id: string
  /** The key Mark handled and Snooze keep it under: the id, hashed for an HR case (`markKeyOf`). */
  markKey: string
  role: ActionOwnerRole
  /** The owner group: "Managers", "People operations". */
  roleLabel: string
  /** One owner across groups and views: 'id:E10142', or 'team:<role>:<name>' for a name not on the roster. */
  ownerKey: string
  /** The owner's employee ID: given by the view, or matched by name on the roster. */
  ownerId: string | null
  ownerName: string
  /** The owner is a team or a role ("IT", "People operations"), not a named person. */
  isTeam: boolean
  viewLabel: string
  tabLabel: string | null
  /** "Recruiting · Pipeline". */
  from: string
  /** The person the item is about, when it names one on the roster (opens their card). */
  personId: string | null
  /** "My team" mode: the owner is the leader, someone in their org, or someone else. */
  team: TeamRelation | null
  /** Its data is below the on-screen standard (shown, with its tier); null when it meets it. */
  below: BelowStandard | null
  /** Other views that raised the same matter, folded into this item ("Onboarding · Upcoming"). */
  alsoFrom: readonly string[]
  /**
   * A roll-up's items (`rollups.ts`): a role's list shows one line for them ("Amanda Wright: 15
   * cases past target"), and its About opens them. Absent on an item a view raised.
   */
  members?: readonly OpenAction[]
}

/** Items from data below the standard, by what holds them back. */
export interface HiddenReason {
  /** "Candidates current stage", "Succession". */
  subject: string
  dataset: DatasetKey | null
  tier: Tier
  count: number
}

export interface CollectError {
  view: ViewKey
  label: string
  message: string
}

export interface Collected {
  /** Every listed item, legal exposure first, then the most severe and the most overdue. */
  items: OpenAction[]
  /**
   * Items whose data is below the on-screen standard. They are listed (tagged with their tier)
   * and counted here, by what holds them back ("4 items come from data below your standard").
   */
  below: { count: number; reasons: HiddenReason[] }
  /** Items folded into another item about the same matter. */
  folded: number
  /**
   * The scope holds fewer people than the anonymity minimum, so employee relations items are left
   * out. Said whether or not there are any, so the page never reveals that one exists.
   */
  smallScope: boolean
  /** Views whose items could not be computed. */
  errors: CollectError[]
  /** The "My team" leader (the leader filter), when one is picked. */
  leader: { id: string; name: string } | null
  /** Views that contribute items (have `actions`). */
  sources: number
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, good: 3 } as const

/**
 * Owner names that are a team or a role rather than a person: the owner groups, the HR case
 * teams, the onboarding owners and the team names the views write (`TEAM_OWNER`).
 */
const TEAM_NAMES = new Set(
  [
    ...Object.values(ACTION_OWNER_LABEL),
    ...CASE_CATEGORIES.map((c) => c.team),
    ...ONBOARDING_OWNERS,
    'People ops',
    'Recruiting team',
    'Recruiting',
    'HR business partner',
    'HR operations',
    'HRIS',
  ].map((n) => n.toLowerCase()),
)

export const isTeamName = (name: string): boolean => TEAM_NAMES.has(name.trim().toLowerCase())

/**
 * An employee relations case: HR ops lists it with no subject record (`kind: 'none'`) so it never
 * names a person. Its id still carries the case ID, which is never shown, exported or stored (the
 * mark key is hashed).
 */
export const isPrivateItem = (i: ActionItem): boolean =>
  i.view === 'services' && i.subject.kind === 'none' && i.id.startsWith('services:case:')

/** Subject kinds whose id is an employee ID. */
const PERSON_KINDS = new Set(['employees', 'comp', 'rightToWork', 'learning', 'reviews'])

/* ───────────── the wide run: the context without the scope ───────────── */

/** The context with other filters, rebuilt for the whole company's records under them. */
function rescoped(ctx: AnalyticsContext, filters: Filters): AnalyticsContext {
  return {
    ...ctx,
    filters,
    data: scopeDatasets(ctx.all, filters, ctx.org),
    isCompany: !hasOrgFilter(filters),
    scopeLabel: scopeLabel(filters, ctx.org),
  }
}

/** The context without the leader filter (other filters kept): where items owned by the leader's org are found. */
const unled = new WeakMap<AnalyticsContext, AnalyticsContext>()
export function withoutLeader(ctx: AnalyticsContext): AnalyticsContext {
  // Only "My team" (a leader the scope includes) looks outside the scope; a left-out leader stays left out.
  if (!focusLeader(ctx.filters)) return ctx
  let out = unled.get(ctx)
  if (!out) {
    out = rescoped(ctx, { ...ctx.filters, leaderId: null })
    unled.set(ctx, out)
  }
  return out
}

const wideOf = new WeakMap<AnalyticsContext, AnalyticsContext | null>()

/**
 * The context without its scope (other filters kept): where items owned by someone in the scope
 * are found anywhere in the company. A business unit scope drops the business unit filter, a
 * region the location filter, a recruiter's reqs the narrowing to them, an org (and "My team")
 * the leader. Null when there is nothing outside it (no scope, no leader).
 */
export function withoutScope(ctx: AnalyticsContext): AnalyticsContext | null {
  const hit = wideOf.get(ctx)
  if (hit !== undefined) return hit
  const f = ctx.filters
  const s = scopeOfAccess(ctx.access)
  let out: AnalyticsContext | null = null
  if (s?.kind === 'unit') {
    if (f.businessUnit.length)
      out = rescoped(ctx, { ...f, businessUnit: [], modes: withMode(f.modes, 'businessUnit', 'include') })
  } else if (s?.kind === 'region') {
    if (f.location.length)
      out = rescoped(ctx, { ...f, location: [], modes: withMode(f.modes, 'location', 'include') })
  } else if (s?.kind === 'reqs') out = rescoped(ctx, f)
  else if (focusLeader(f)) out = withoutLeader(ctx)
  wideOf.set(ctx, out)
  return out
}

/* ───────────── one view at a time (cached per context) ───────────── */

export interface ViewRun {
  items: ActionItem[]
  error: CollectError | null
  /** Milliseconds of work. */
  ms: number
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** A User Timing entry, readable in the browser's performance tools. */
function measure(name: string, start: number): void {
  try {
    performance.measure(name, { start, end: clock() })
  } catch {
    /* no User Timing API: nothing to record */
  }
}

const viewRuns = new WeakMap<AnalyticsContext, Map<ViewKey, ViewRun>>()

/** One view's items for one context, cached; a view that throws is reported, not fatal. */
export function runView(ctx: AnalyticsContext, v: ViewSource): ViewRun {
  let byView = viewRuns.get(ctx)
  if (!byView) {
    byView = new Map()
    viewRuns.set(ctx, byView)
  }
  const hit = byView.get(v.key)
  if (hit) return hit
  const start = clock()
  let run: ViewRun
  try {
    run = { items: v.actions?.(ctx) ?? [], error: null, ms: 0 }
  } catch (err) {
    console.error(`Action center: items from ${v.label} could not be computed`, err)
    logDevError({ where: 'actions', view: v.key, tab: null, message: errorMessage(err) })
    run = {
      items: [],
      error: { view: v.key, label: v.label, message: err instanceof Error ? err.message : String(err) },
      ms: 0,
    }
  }
  run.ms = clock() - start
  measure(`census:actions:${v.key}`, start)
  byView.set(v.key, run)
  return run
}

/** Whether a view's run for this context is already done. */
export const hasRun = (ctx: AnalyticsContext, v: ViewSource): boolean => !!viewRuns.get(ctx)?.has(v.key)

/** The views that raise items, and every (context, view) run a collection needs, in order. */
export function collectPlan(
  ctx: AnalyticsContext,
  views: readonly ViewSource[],
): { ctx: AnalyticsContext; view: ViewSource }[] {
  const sources = views.filter((v) => v.actions)
  const wide = withoutScope(ctx)
  return [
    ...sources.map((view) => ({ ctx, view })),
    ...(wide ? sources.map((view) => ({ ctx: wide, view })) : []),
  ]
}

/* ───────────── order ───────────── */

/** How many people or records an item is about (`ActionItem.size`), for the order of undated items. */
export const sizeOf = (i: Pick<ActionItem, 'size'>): number => i.size ?? 0

/**
 * Legal exposure first, then severity, then the most overdue (earliest due); among items with no
 * due date, the one about more people first; then owner.
 */
export function compareActions(a: OpenAction, b: OpenAction): number {
  return (
    (b.item.exposure ? 1 : 0) - (a.item.exposure ? 1 : 0) ||
    SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] ||
    (a.item.due ?? '9999').localeCompare(b.item.due ?? '9999') ||
    (!a.item.due && !b.item.due ? sizeOf(b.item) - sizeOf(a.item) : 0) ||
    a.ownerName.localeCompare(b.ownerName) ||
    a.id.localeCompare(b.id)
  )
}

/* ───────────── same matter, two views ───────────── */

/** The view that owns a matter, by the matter's prefix ("license:E12069"). */
const MATTER_VIEW: Readonly<Record<string, ViewKey>> = {
  license: 'compliance',
  i9: 'compliance',
  'work-auth': 'compliance',
}

interface Folded {
  items: ActionItem[]
  also: Map<ActionItem, ActionItem[]>
  folded: number
}

/** One item per matter: the owning view's (else the most severe), carrying the others' exposure and severity. */
export function foldMatters(items: readonly ActionItem[]): Folded {
  const groups = new Map<string, ActionItem[]>()
  for (const i of items) {
    if (!i.matter) continue
    const g = groups.get(i.matter)
    if (g) g.push(i)
    else groups.set(i.matter, [i])
  }
  const also = new Map<ActionItem, ActionItem[]>()
  const replace = new Map<ActionItem, ActionItem | null>()
  let folded = 0
  for (const [matter, g] of groups) {
    if (g.length < 2) continue
    const owner = MATTER_VIEW[matter.split(':')[0]]
    const ranked = [...g].sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        (a.due ?? '9999').localeCompare(b.due ?? '9999'),
    )
    const keep = g.find((i) => i.view === owner) ?? ranked[0]
    const others = g.filter((i) => i !== keep)
    const worst = ranked[0].severity
    const merged: ActionItem = {
      ...keep,
      severity: SEVERITY_RANK[worst] < SEVERITY_RANK[keep.severity] ? worst : keep.severity,
      ...(g.some((i) => i.exposure) ? { exposure: true } : {}),
      due: keep.due ?? ranked.find((i) => i.due)?.due ?? null,
    }
    replace.set(keep, merged)
    also.set(merged, others)
    for (const o of others) replace.set(o, null)
    folded += others.length
  }
  if (!folded) return { items: [...items], also, folded }
  const out: ActionItem[] = []
  for (const i of items) {
    const r = replace.get(i)
    if (r === null) continue
    out.push(r ?? i)
  }
  return { items: out, also, folded }
}

/* ───────────── collect ───────────── */

const keyOfViews = (views: readonly ViewSource[]): string =>
  views
    .filter((v) => v.actions)
    .map((v) => v.key)
    .join(',')

const cache = new WeakMap<AnalyticsContext, Map<string, Collected>>()

/** The collection for this context when it is already assembled; null while it is not. */
export function cachedCollect(ctx: AnalyticsContext, views: readonly ViewSource[]): Collected | null {
  return cache.get(ctx)?.get(keyOfViews(views)) ?? null
}

/**
 * Every listed item in scope, with owners resolved, folded by matter, rated by the one rubric and
 * tagged by the data standard. Cached per context and set of source views (the masthead, the
 * page, the homes and Ask share one); computed on the spot when not cached.
 */
export function collectActions(ctx: AnalyticsContext, views: readonly ViewSource[]): Collected {
  let byViews = cache.get(ctx)
  if (!byViews) {
    byViews = new Map()
    cache.set(ctx, byViews)
  }
  const key = keyOfViews(views)
  let out = byViews.get(key)
  if (!out) {
    out = collectUncached(ctx, views)
    byViews.set(key, out)
  }
  return out
}

export function collectUncached(ctx: AnalyticsContext, views: readonly ViewSource[]): Collected {
  const byKey = new Map(views.map((v) => [v.key, v]))
  const look = ownerLookup(ctx.all.employees, ctx.asOf)
  const focus = focusLeader(ctx.filters)
  const leaderId = focus && ctx.org.byId.has(focus) ? focus : null
  const subtree = leaderId ? subtreeIds(ctx.org, leaderId) : null
  const scope = scopeOfAccess(ctx.access)
  const settings = settingsOf(ctx.metrics)

  const resolve = (i: ActionItem): string | null => i.ownerId ?? look(i.ownerName)

  // In scope, then anything owned by someone in the scope (or the "My team" leader's org) elsewhere.
  const sources = views.filter((v) => v.actions)
  const raw: ActionItem[] = []
  const errors: CollectError[] = []
  for (const v of sources) {
    const r = runView(ctx, v)
    raw.push(...r.items)
    if (r.error) errors.push(r.error)
  }
  const wide = withoutScope(ctx)
  if (wide) {
    const mine = (i: ActionItem): boolean => {
      const id = resolve(i)
      // "My team" and Manager mode: the leader's org; other scopes: owned by someone in it or about it.
      if (subtree && (!scope || scope.kind === 'org')) return !!id && subtree.has(id)
      if (scope?.kind === 'reqs')
        return (
          (!!scope.recruiterId && id === scope.recruiterId) ||
          i.ownerName.trim().toLowerCase() === scope.recruiter.trim().toLowerCase() ||
          itemInScope(ctx.access, { ...i, ownerId: id })
        )
      return itemInScope(ctx.access, { ...i, ownerId: id })
    }
    for (const v of sources) {
      const r = runView(wide, v)
      for (const i of r.items) if (mine(i)) raw.push(i)
      if (r.error && !errors.some((x) => x.view === r.error?.view)) errors.push(r.error)
    }
  }

  // The mode lists only the items of the views and records it shows (docs/ROLES-V2.md 6.1).
  const listed = ctx.access ? itemsShown(ctx.access, raw) : raw

  // A small scope never shows that one of its people has an employee relations case.
  const tooSmall = !ctx.isCompany && headcountAt(ctx.data.employees, ctx.asOf) < minGroupOf(ctx.metrics)

  const seen = new Set<string>()
  const unique: ActionItem[] = []
  for (const i of listed) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    if (tooSmall && isPrivateItem(i)) continue
    unique.push(i)
  }
  const { items: one, also, folded } = foldMatters(unique)

  const items: OpenAction[] = []
  const below = new Map<string, HiddenReason>()
  let belowCount = 0
  for (const i0 of one) {
    const severity = severityOf(i0, ctx.asOf, settings.blockedDays)
    const i = weekly(severity === i0.severity ? i0 : { ...i0, severity }, ctx.asOf)
    const view = byKey.get(i.view)
    // Workflow is not a statistic: an item below the standard is listed, tagged with its tier.
    const gate = gateFor(ctx.quality, ctx.standard, i.uses, view?.datasets ?? [])
    let tag: BelowStandard | null = null
    if (gate && !gate.shown) {
      belowCount++
      const subject = subjectOf(gate.limiting) ?? 'The data behind it'
      tag = { tier: gate.tier, subject, dataset: gate.limiting.dataset }
      const k = `${subject}|${gate.tier}`
      const r = below.get(k)
      if (r) r.count++
      else below.set(k, { subject, dataset: gate.limiting.dataset, tier: gate.tier, count: 1 })
    }
    const others = also.get(i0) ?? []
    const alsoFrom = [...new Set(others.map((o) => fromOf(o, byKey.get(o.view))))]
    items.push(openAction(i, view, resolve(i), ctx, leaderId, subtree, tag, alsoFrom))
  }
  items.sort(compareActions)
  const leader = leaderId ? { id: leaderId, name: ctx.org.byId.get(leaderId)?.name || leaderId } : null
  return {
    items,
    below: { count: belowCount, reasons: [...below.values()].sort((a, b) => b.count - a.count) },
    folded,
    smallScope: tooSmall,
    errors,
    leader,
    sources: sources.length,
  }
}

/**
 * A breach still in force changes every week: its fingerprint carries the weeks overdue, so an
 * item marked handled comes back while the breach goes on (marks reopen on a new fingerprint).
 */
function weekly(i: ActionItem, asOf: ISODate): ActionItem {
  if (!i.exposure) return i
  const d = daysToDue(i.due, asOf)
  if (d == null || d >= 0) return i
  return { ...i, fingerprint: `${i.fingerprint ? `${i.fingerprint}|` : ''}week ${Math.floor(-d / 7)}` }
}

function fromOf(i: ActionItem, view: ViewSource | undefined): string {
  const viewLabel = view?.label ?? i.view
  const tabLabel = i.tab ? (view?.tabs.find((t) => t.key === i.tab)?.label ?? null) : null
  return tabLabel ? `${viewLabel} · ${tabLabel}` : viewLabel
}

function openAction(
  i: ActionItem,
  view: ViewSource | undefined,
  ownerId: string | null,
  ctx: AnalyticsContext,
  leaderId: string | null,
  subtree: Set<string> | null,
  below: BelowStandard | null,
  alsoFrom: readonly string[],
): OpenAction {
  const role = (ACTION_OWNER_ROLES as readonly string[]).includes(i.ownerRole) ? i.ownerRole : 'hr-ops'
  const ownerName = i.ownerName?.trim() || ACTION_OWNER_LABEL[role]
  const isTeam = !ownerId && isTeamName(ownerName)
  const viewLabel = view?.label ?? i.view
  const tabLabel = i.tab ? (view?.tabs.find((t) => t.key === i.tab)?.label ?? null) : null
  const sid = i.subject.id
  const personId = sid && PERSON_KINDS.has(i.subject.kind) && ctx.org.byId.has(sid) ? sid : null
  return {
    item: i,
    id: i.id,
    markKey: markKeyOf(i.id),
    role,
    roleLabel: ACTION_OWNER_LABEL[role],
    ownerKey: ownerId ? `id:${ownerId}` : `team:${role}:${ownerName.toLowerCase()}`,
    ownerId,
    ownerName,
    isTeam,
    viewLabel,
    tabLabel,
    from: tabLabel ? `${viewLabel} · ${tabLabel}` : viewLabel,
    personId,
    team: !leaderId
      ? null
      : ownerId === leaderId
        ? 'leader'
        : ownerId && subtree?.has(ownerId)
          ? 'org'
          : 'other',
    below,
    alsoFrom,
  }
}

/** The fields a set of items reads, for the tier of a count over them. */
export function usesOf(items: readonly OpenAction[]): FieldRef[] {
  const out = new Set<FieldRef>()
  for (const a of items) for (const u of a.item.uses ?? []) out.add(u)
  return [...out]
}

/* ───────────── in idle time, one view per slice ───────────── */

/** Wait for an idle moment; `timeout` caps the wait where idle callbacks exist. */
export type Idle = (timeout: number) => Promise<void>

/** First wait (let the first paint happen) and the cap on each later one. */
const SLICE_WAIT_MS = 200

export const browserIdle: Idle = (timeout) =>
  new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback
    if (typeof ric === 'function') ric(() => resolve(), { timeout })
    else setTimeout(resolve, timeout)
  })

/** A run stopped because a newer context was asked for on the same channel. */
export class CollectSuperseded extends Error {
  constructor() {
    super('The Action center was asked for a newer context.')
    this.name = 'CollectSuperseded'
  }
}

export const isSuperseded = (err: unknown): boolean => err instanceof CollectSuperseded

const pending = new WeakMap<AnalyticsContext, Map<string, Promise<Collected>>>()
/** The context asked for last, per channel: a run for an older one stops at its next slice. */
const latest = new Map<string, AnalyticsContext>()

/**
 * The collection for this context, computed in idle time: one wait for the first paint, then one
 * view per idle slice (the scoped run, then the wide run). Calls for the same context share one
 * computation. Asking for a newer context on the same channel stops an older run at its next
 * slice (it rejects with `CollectSuperseded`), so a burst of filter changes collects once.
 */
export function scheduleCollect(
  ctx: AnalyticsContext,
  views: readonly ViewSource[],
  opts: { idle?: Idle; channel?: string } = {},
): Promise<Collected> {
  const hit = cachedCollect(ctx, views)
  if (hit) return Promise.resolve(hit)
  const key = keyOfViews(views)
  let byKey = pending.get(ctx)
  if (!byKey) {
    byKey = new Map()
    pending.set(ctx, byKey)
  }
  const running = byKey.get(key)
  if (running) return running
  const idle = opts.idle ?? browserIdle
  const channel = opts.channel ?? 'page'
  latest.set(channel, ctx)
  const run = (async () => {
    try {
      let first = true
      for (const step of collectPlan(ctx, views)) {
        if (hasRun(step.ctx, step.view)) continue
        await idle(SLICE_WAIT_MS)
        if (latest.get(channel) !== ctx) throw new CollectSuperseded()
        runView(step.ctx, step.view)
        first = false
      }
      if (first) await idle(SLICE_WAIT_MS)
      if (latest.get(channel) !== ctx) throw new CollectSuperseded()
      return collectActions(ctx, views)
    } finally {
      byKey.delete(key)
    }
  })()
  byKey.set(key, run)
  return run
}
