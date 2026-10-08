/**
 * `open_items`: the Action center's counts (its own engine: `collectActions`, the marks kept in
 * this browser, the same owner groups and due buckets) by owner group, severity and source view,
 * and the owners with the most pressing items as tokens. Every count has a ref to its items.
 * The items are the ones the mode's page lists (docs/ROLES-V2.md 7): in a role mode its "Needs
 * attention" and "Waiting on others" (`roleView`, the page's own split), elsewhere every item,
 * with the escalations counted. Employee relations items never name a person (the Action
 * center's rule); items from data below the standard are listed and counted, as on the page.
 */

import {
  cachedCollect,
  collectActions,
  countActions,
  dueBucket,
  isOpen,
  itemsDrill,
  type OpenAction,
  ownerTableRows,
  roleView,
  settingsOf,
  viewRows,
} from '@/views/actions/engine'
import { ownerRows } from '@/views/actions/engine/summary'
import { ACTION_OWNER_LABEL, ACTION_OWNER_ROLES, type ActionOwnerRole } from '@/views/types'
import { scopeOut } from '../scope'
import { fail, inputOf, ok, type ToolOutput, type ToolRuntime, unknownKeys } from './shared'

/** Owners listed by name token (the most pressing first). */
export const MAX_OWNERS = 15

export function openItems(rt: ToolRuntime, raw: unknown): ToolOutput {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['owner_group', 'overdue_only'])
  if (bad) return fail(bad)
  const group = input.owner_group as ActionOwnerRole | undefined
  if (group != null && !ACTION_OWNER_ROLES.includes(group))
    return fail(`owner_group must be one of ${ACTION_OWNER_ROLES.join(', ')}.`)
  if (input.overdue_only != null && typeof input.overdue_only !== 'boolean')
    return fail('overdue_only must be true or false.')
  const ctx = rt.base
  // The page's own collection for the live context when it is ready (the masthead, the Action
  // center and the homes share it), so the counts are the page's; else collected here, with pay
  // amounts and cost totals off. Item text never holds an amount, and nothing here sends one.
  const collected = cachedCollect(rt.env.ctx, rt.env.views) ?? collectActions(ctx, rt.env.views)
  const now = rt.env.now ?? Date.now()
  const marks = rt.env.marks ?? {}
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const lists = roleView(collected, ctx, (a) => isOpen(a, marks, now))
  // What the page lists: a role mode's two lists, else every open item.
  let open: OpenAction[] = lists.lists ? [...lists.needs, ...lists.waiting] : lists.open
  const inOpen = (xs: readonly OpenAction[]) => {
    const keep = new Set(open)
    return xs.filter((a) => keep.has(a))
  }
  if (group) open = open.filter((a) => a.role === group)
  if (input.overdue_only)
    open = open.filter((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays) === 'overdue')
  const c = countActions(open, ctx)
  const ref = (title: string, items: readonly OpenAction[]) =>
    items.length ? rt.refs.add(itemsDrill(ctx, title, items), title) : null
  const owner = (name: string, personId: string | null) =>
    personId ? rt.tokens.forEmployee(personId) : rt.tokens.forName(name)
  return ok({
    ...scopeOut(ctx, rt.tokens),
    as_of: ctx.asOf,
    owner_group: group ? ACTION_OWNER_LABEL[group] : 'All owner groups',
    overdue_only: !!input.overdue_only,
    open: { count: c.open.length, ref: ref('Open items', c.open) },
    ...(lists.lists
      ? {
          needs_attention: {
            count: inOpen(lists.needs).length,
            ref: ref('Needs attention', inOpen(lists.needs)),
          },
          waiting_on_others: {
            count: inOpen(lists.waiting).length,
            ref: ref('Waiting on others', inOpen(lists.waiting)),
          },
        }
      : { escalations: { count: inOpen(lists.needs).length, ref: ref('Escalations', inOpen(lists.needs)) } }),
    overdue: { count: c.overdue.length, ref: ref('Overdue items', c.overdue) },
    critical: { count: c.critical.length, ref: ref('Critical items', c.critical) },
    due_soon: {
      count: c.dueSoon.length,
      within_days: dueSoonDays,
      ref: ref(`Items due within ${dueSoonDays} d`, c.dueSoon),
    },
    owners: c.owners,
    by_severity: c.bySeverity,
    by_owner_group: ownerTableRows(open, ctx).map((r) => ({
      ...r,
      ref: ref(
        `Open items: ${r.group}`,
        open.filter((a) => a.roleLabel === r.group),
      ),
    })),
    by_view: viewRows(open, ctx).map((r) => ({
      view: r.viewKey,
      label: r.view,
      open: r.open,
      overdue: r.overdue,
      critical: r.critical,
      ref: ref(
        `Open items from ${r.view}`,
        open.filter((a) => a.item.view === r.viewKey),
      ),
    })),
    top_owners: ownerRows(open, ctx)
      .slice(0, MAX_OWNERS)
      .map((o) => ({
        owner: owner(o.owner, o.personId),
        owner_group: o.ownerGroup,
        items: o.items,
        overdue: o.overdue,
        critical: o.critical,
        ref: rt.refs.add(o.itemsDrill, `Open items waiting on ${owner(o.owner, o.personId)}`),
      })),
    below_data_standard: collected.below.count
      ? {
          items: collected.below.count,
          note: 'These items are listed, tagged with their tier: workflow shows at every data standard.',
          reasons: collected.below.reasons.map((r) => ({ what: r.subject, tier: r.tier, items: r.count })),
        }
      : null,
    ...(collected.smallScope
      ? {
          note: 'The scope has fewer people than the anonymity minimum, so employee relations items are left out.',
        }
      : {}),
    ...(collected.errors.length
      ? { not_computed: collected.errors.map((e) => `${e.label}: items could not be computed`) }
      : {}),
  })
}
