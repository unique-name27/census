/**
 * `open_items`: the Action center's counts (its own engine: `collectActions`, the marks kept in
 * this browser, the same owner groups and due buckets) by owner group, severity and source view,
 * and the owners with the most pressing items as tokens. Every count has a ref to its items.
 * Employee relations items never name a person (the Action center's rule), and the data standard
 * leaves out what it leaves out on the page.
 */

import {
  collectActions,
  countActions,
  dueBucket,
  isOpen,
  itemsDrill,
  type OpenAction,
  ownerTableRows,
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
  const collected = collectActions(ctx, rt.env.views)
  const now = rt.env.now ?? Date.now()
  const marks = rt.env.marks ?? {}
  const { dueSoonDays } = settingsOf(ctx.metrics)
  let open: OpenAction[] = collected.items.filter((a) => isOpen(a.id, marks, now))
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
    hidden_by_data_standard: collected.hidden.count
      ? {
          items: collected.hidden.count,
          reasons: collected.hidden.reasons.map((r) => ({ what: r.subject, tier: r.tier, items: r.count })),
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
