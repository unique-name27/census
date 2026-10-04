/**
 * Collects every view's open items (`ViewDef.actions`) for the Action center, once per analytics
 * context:
 *
 *  - each view runs on its own; one that throws is listed in `errors` and the rest still show;
 *  - items whose data falls below the data standard are left out and counted, with the field or
 *    dataset that holds them back (docs/DATA-TIERS.md);
 *  - owners named only by name are matched to the roster, so one person is one owner across views;
 *  - "My team" mode is the leader filter: the leader's org scopes every view as usual, and items
 *    anywhere in the company owned by the leader or someone in their org are added, so an HR
 *    leader sees their recruiters' and partners' items too;
 *  - an employee relations item is left out when the scope holds fewer people than the anonymity
 *    minimum, so a small team never learns that one of them has an open case.
 *
 * Pure: no React. Results are cached per context.
 */
import { gateFor, subjectOf } from '@/components/tier/tierModel'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Tier } from '@/data/quality/tier'
import { CASE_CATEGORIES, type DatasetKey, ONBOARDING_OWNERS, type ViewKey } from '@/data/schema'
import { hasOrgFilter, scopeDatasets, scopeLabel, subtreeIds } from '@/data/scope'
import { headcountAt } from '@/lib/people'
import { minGroupOf } from '@/metrics/privacy'
import { ownerLookup } from '@/views/hrbp/engine/owners'
import { ACTION_OWNER_LABEL, ACTION_OWNER_ROLES, type ActionItem, type ActionOwnerRole } from '@/views/types'

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

/** One open item with what the page shows beside it. */
export interface OpenAction {
  item: ActionItem
  id: string
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
}

/** Items the data standard leaves out, by what holds them back. */
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
  /** Items shown under the data standard, most severe and earliest due first. */
  items: OpenAction[]
  /** Items the data standard leaves out. */
  hidden: { count: number; reasons: HiddenReason[] }
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

/** Owner names that are a team or a role rather than a person. */
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
 * names a person. Its id still carries the case ID, which is never shown or exported.
 */
export const isPrivateItem = (i: ActionItem): boolean =>
  i.view === 'services' && i.subject.kind === 'none' && i.id.startsWith('services:case:')

/** Subject kinds whose id is an employee ID. */
const PERSON_KINDS = new Set(['employees', 'comp', 'rightToWork', 'learning', 'reviews'])

/** The context without the leader filter (other filters kept): where items owned by the leader's org are found. */
const unled = new WeakMap<AnalyticsContext, AnalyticsContext>()
export function withoutLeader(ctx: AnalyticsContext): AnalyticsContext {
  if (!ctx.filters.leaderId) return ctx
  let out = unled.get(ctx)
  if (!out) {
    const filters = { ...ctx.filters, leaderId: null }
    out = {
      ...ctx,
      filters,
      data: scopeDatasets(ctx.all, filters, ctx.org),
      isCompany: !hasOrgFilter(filters),
      scopeLabel: scopeLabel(filters, ctx.org),
    }
    unled.set(ctx, out)
  }
  return out
}

interface Run {
  items: ActionItem[]
  errors: CollectError[]
}

/** Every view's items for one context; a view that throws is reported, not fatal. */
function runViews(ctx: AnalyticsContext, views: readonly ViewSource[]): Run {
  const items: ActionItem[] = []
  const errors: CollectError[] = []
  for (const v of views) {
    if (!v.actions) continue
    try {
      items.push(...v.actions(ctx))
    } catch (err) {
      console.error(`Action center: items from ${v.label} could not be computed`, err)
      errors.push({ view: v.key, label: v.label, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { items, errors }
}

const runs = new WeakMap<AnalyticsContext, WeakMap<readonly ViewSource[], Run>>()
function runCached(ctx: AnalyticsContext, views: readonly ViewSource[]): Run {
  let byViews = runs.get(ctx)
  if (!byViews) {
    byViews = new WeakMap()
    runs.set(ctx, byViews)
  }
  let r = byViews.get(views)
  if (!r) {
    r = runViews(ctx, views)
    byViews.set(views, r)
  }
  return r
}

export function compareActions(a: OpenAction, b: OpenAction): number {
  return (
    SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] ||
    (a.item.due ?? '9999').localeCompare(b.item.due ?? '9999') ||
    a.ownerName.localeCompare(b.ownerName) ||
    a.id.localeCompare(b.id)
  )
}

const cache = new WeakMap<AnalyticsContext, WeakMap<readonly ViewSource[], Collected>>()

/** Every open item in scope that the data standard shows, with owners resolved. Cached per context. */
export function collectActions(ctx: AnalyticsContext, views: readonly ViewSource[]): Collected {
  let byViews = cache.get(ctx)
  if (!byViews) {
    byViews = new WeakMap()
    cache.set(ctx, byViews)
  }
  let out = byViews.get(views)
  if (!out) {
    out = collectUncached(ctx, views)
    byViews.set(views, out)
  }
  return out
}

export function collectUncached(ctx: AnalyticsContext, views: readonly ViewSource[]): Collected {
  const byKey = new Map(views.map((v) => [v.key, v]))
  const look = ownerLookup(ctx.all.employees, ctx.asOf)
  const leaderId =
    ctx.filters.leaderId && ctx.org.byId.has(ctx.filters.leaderId) ? ctx.filters.leaderId : null
  const subtree = leaderId ? subtreeIds(ctx.org, leaderId) : null

  const resolve = (i: ActionItem): string | null => i.ownerId ?? look(i.ownerName)

  // In scope, then (in "My team" mode) anything owned by the leader or their org elsewhere.
  const scoped = runCached(ctx, views)
  const raw: ActionItem[] = [...scoped.items]
  const errors = [...scoped.errors]
  if (subtree) {
    const wide = runCached(withoutLeader(ctx), views)
    for (const i of wide.items) {
      const id = resolve(i)
      if (id && subtree.has(id)) raw.push(i)
    }
    for (const e of wide.errors) if (!errors.some((x) => x.view === e.view)) errors.push(e)
  }

  // A small scope never shows that one of its people has an employee relations case.
  const tooSmall = !ctx.isCompany && headcountAt(ctx.data.employees, ctx.asOf) < minGroupOf(ctx.metrics)

  const seen = new Set<string>()
  const items: OpenAction[] = []
  const hidden = new Map<string, HiddenReason>()
  let hiddenCount = 0
  for (const i of raw) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    if (tooSmall && isPrivateItem(i)) continue
    const view = byKey.get(i.view)
    const gate = gateFor(ctx.quality, ctx.standard, i.uses, view?.datasets ?? [])
    if (gate && !gate.shown) {
      hiddenCount++
      const subject = subjectOf(gate.limiting) ?? 'The data behind it'
      const k = `${subject}|${gate.tier}`
      const r = hidden.get(k)
      if (r) r.count++
      else hidden.set(k, { subject, dataset: gate.limiting.dataset, tier: gate.tier, count: 1 })
      continue
    }
    items.push(openAction(i, view, resolve(i), ctx, leaderId, subtree))
  }
  items.sort(compareActions)
  const leader = leaderId ? { id: leaderId, name: ctx.org.byId.get(leaderId)?.name || leaderId } : null
  return {
    items,
    hidden: { count: hiddenCount, reasons: [...hidden.values()].sort((a, b) => b.count - a.count) },
    smallScope: tooSmall,
    errors,
    leader,
    sources: views.filter((v) => v.actions).length,
  }
}

function openAction(
  i: ActionItem,
  view: ViewSource | undefined,
  ownerId: string | null,
  ctx: AnalyticsContext,
  leaderId: string | null,
  subtree: Set<string> | null,
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
  }
}

/** The fields a set of items reads, for the tier of a count over them. */
export function usesOf(items: readonly OpenAction[]): FieldRef[] {
  const out = new Set<FieldRef>()
  for (const a of items) for (const u of a.item.uses ?? []) out.add(u)
  return [...out]
}
