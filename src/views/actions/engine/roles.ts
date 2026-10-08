/**
 * Each mode's two lists over the Action center's collection (docs/ROLES-V2.md 6.1 and 6.2):
 * "Needs attention" (the role's own items) and "Waiting on others" (its area, owned by someone
 * else), split by `roleItems` and the routing table (`src/access/policy/routing.ts`). One function
 * for every reader, so the masthead count, the page, the homes and Ask agree for one context.
 *
 * Developer, HR and CHRO list every item in the owner sheets (no two lists); their Needs attention
 * is the escalations: legal exposure, critical roles at high risk of loss, regretted exit clusters
 * and critical items overdue more than the escalation days. Pure.
 */
import { lensOf, type RoleLens, roleItems } from '@/access/items'
import { isTableMode } from '@/access/policy'
import { ROUTING } from '@/access/policy/routing'
import { scopeOfAccess } from '@/access/scopes/records'
import type { AnalyticsContext } from '@/data/context'
import { formatDate } from '@/lib/dates'
import type { Collected, OpenAction } from './collect'
import { foldRoleLists } from './rollups'
import { settingsOf } from './settings'

/** Items Needs attention lists before "Show all" (docs/ACTION-CENTER-AUDIT.md part 6, volume). */
export const NEEDS_SHOWN = 15

type Ctx = Pick<AnalyticsContext, 'access' | 'asOf' | 'metrics'>

/** The lens for a context: its mode, its person and the escalation days in force. */
export const lensFor = (ctx: Ctx): RoleLens =>
  lensOf(ctx.access, ctx.asOf, settingsOf(ctx.metrics).escalationDays)

/** The mode shows "Needs attention" and "Waiting on others" (every allowlist mode). */
export const showsLists = (access: Ctx['access']): boolean =>
  isTableMode(access.mode) && access.can('ui:attention-lists')

export interface RoleView {
  /** The mode shows the two lists; false in Developer, HR and CHRO (every item in owner sheets). */
  lists: boolean
  /** Every open item the mode lists (its full list in Developer, HR and CHRO), never rolled up. */
  open: OpenAction[]
  /** Needs attention, most pressing first (escalations by their reason first), with its roll-ups. */
  needs: OpenAction[]
  /** Waiting on others, with its roll-ups (HRBP modes). */
  waiting: OpenAction[]
  /** Roll-ups marked handled or snoozed in this browser (for the Handled and snoozed list). */
  parked: OpenAction[]
  /** Open items the mode lists in neither list (said as a count). */
  left: number
  /** The masthead's number: Needs attention in a role mode, every open item in Developer, HR and CHRO. */
  count: number
  /** The critical items among them, for the masthead's tooltip. */
  critical: number
}

/**
 * The two lists over the open items of a collection (`isOpen` says which are open in this
 * browser), with each mode's roll-ups (`rollups.ts`): a roll-up holds the open items it folds, and
 * is itself open unless it was marked (and has not changed since).
 */
export function roleView(
  collected: Collected,
  ctx: Ctx & Pick<AnalyticsContext, 'scopeLabel'>,
  isOpen: (a: OpenAction) => boolean,
): RoleView {
  const lens = lensFor(ctx)
  const split = roleItems(collected.items.filter(isOpen), lens)
  const folded = foldRoleLists(split, lens, ctx)
  const parked = [...folded.needs, ...folded.waiting].filter((a) => a.members && !isOpen(a))
  const needs = folded.needs.filter((a) => !a.members || isOpen(a))
  const waiting = folded.waiting.filter((a) => !a.members || isOpen(a))
  const lists = showsLists(ctx.access)
  const counted = countedOf({ lists, needs, open: split.listed })
  return {
    lists,
    open: split.listed,
    needs,
    waiting,
    parked,
    left: split.left,
    count: counted.length,
    critical: counted.filter((a) => a.item.severity === 'critical').length,
  }
}

/**
 * What a mode's counts count: Needs attention in a role mode (the masthead's number), every open
 * item in Developer, HR and CHRO. The Scorecard's "Critical open items" tile reads it too.
 */
export const countedOf = (v: Pick<RoleView, 'lists' | 'needs' | 'open'>): OpenAction[] =>
  v.lists ? v.needs : v.open

/* ───────── wording ───────── */

/** Who Needs attention is for: "Total rewards", "HR business partners", the manager or recruiter by name. */
export function practiceOf(ctx: Ctx): string {
  const me = lensFor(ctx).me
  return me?.name ?? ROUTING[ctx.access.mode].practice
}

/** Where: "across the company", "in Silicon Engineering", "on Maya Chen's reqs". */
export function whereOf(ctx: Ctx): string {
  const s = scopeOfAccess(ctx.access)
  if (!s) return ctx.access.mode === 'recruiter' ? "on every recruiter's reqs" : 'across the company'
  return s.kind === 'reqs' ? `on ${s.label}` : `in ${s.label}`
}

/** The header line in a role mode: "Open items for Total rewards, as of 30 Sep 2026", "Open items in APAC, …". */
export function listHeader(ctx: Ctx): string {
  const s = scopeOfAccess(ctx.access)
  const head =
    s || ctx.access.mode === 'recruiter' ? `Open items ${whereOf(ctx)}` : `Open items for ${practiceOf(ctx)}`
  return `${head}, as of ${formatDate(ctx.asOf)}`
}

/**
 * What the two lists hold, after the header line. A regional HR business partner named in Settings
 * also holds the region's site matters (what the surveys say about its sites, whoever holds them),
 * so their Needs attention says so (policy/routing.ts, `REGIONAL_OWNER`).
 */
export function listsLine(ctx: Ctx): string {
  const s = scopeOfAccess(ctx.access)
  const mine =
    s?.kind === 'region' && s.owner
      ? "Needs attention is yours, with what the surveys say about your region's sites"
      : 'Needs attention is yours'
  return `${mine}; Waiting on others is in your area, with someone else.`
}

/** "Nothing is waiting on Total rewards across the company." */
export const nothingWaiting = (ctx: Ctx): string =>
  `Nothing is waiting on ${practiceOf(ctx)} ${whereOf(ctx)}.`
