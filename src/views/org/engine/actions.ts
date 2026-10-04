/**
 * The Org chart's open items for the Action center (docs/VIEWS.md, view contract). The Org chart
 * has no Scorecard summary (its structure measures are People stats'), only actions:
 *
 *  - single-report chains: a manager whose only direct report leads the team-below number of
 *    people or more (5 by default), an extra layer above a whole team;
 *  - new managers with large teams: managing for less than the new-manager window (12 months)
 *    with the large-team number of direct reports or more (8).
 *
 * Both go to the manager's HR business partner, as polite asks to review with the manager. The
 * flags are the chart's own (`computeFlags`, thresholds from the metric dictionary), kept to the
 * people in scope so the leader filter gives a leader's own list. Pure: no React.
 */
import type { AnalyticsContext } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { firstName, hrbpOwner, ownerLookup } from '../../hrbp/engine/owners'
import type { ActionItem } from '../../types'
import { peopleDrill, scopeLine } from './drill'
import { becameManagerDates, flagName, managingSince } from './flags'
import { orgModel } from './model'
import { flagUses, REPORTING_USES } from './uses'

export function orgActions(ctx: AnalyticsContext): ActionItem[] {
  const m = orgModel(ctx)
  const { tree, flags, rules } = m
  const inScope = new Set(ctx.data.employees.map((e) => e.employeeId))
  const look = ownerLookup(ctx.all.employees, ctx.asOf)
  const became = becameManagerDates(m.flagJobChanges)
  const scope = { label: ctx.isCompany ? 'Whole company' : ctx.scopeLabel, asOf: ctx.asOf }
  const name = (id: string) => tree.people.get(id)?.name ?? id
  const out: ActionItem[] = []
  for (const [id, list] of flags) {
    if (!inScope.has(id)) continue
    const e = tree.people.get(id)
    if (!e) continue
    const owner = { ownerRole: 'hrbp' as const, ...hrbpOwner(e, look) }
    const who = firstName(e.name)
    const directs = tree.directs.get(id) ?? 0
    for (const f of list) {
      if (f.kind === 'single-report-chain') {
        const only = tree.children.get(id)?.[0]
        if (!only) continue
        const below = tree.total.get(only) ?? 0
        out.push({
          id: `org:single-report-chain:${id}`,
          ...owner,
          due: null,
          severity: 'warning',
          what: `${e.name} manages only ${name(only)}, who leads ${plural(below, 'person', 'people')}`,
          subject: { kind: 'employees', id, label: e.name },
          view: 'org',
          tab: 'chart',
          drill: () =>
            peopleDrill(tree, [id, only], {
              title: `${flagName(f.kind, rules)}: ${e.name} and their only direct report`,
              subtitle: scopeLine(scope),
              columns: ['directs', 'totalOrg', 'flags'],
              flags,
              note: `A single direct report who leads ${rules.chainMinBelow} or more people adds a layer above a whole team.`,
            }),
          note: `Could we review with ${who} whether this layer is still needed, or whether ${name(only)} could report one level up?`,
          uses: REPORTING_USES,
        })
      } else if (f.kind === 'new-manager-large-team') {
        const since = managingSince(e, became)
        out.push({
          id: `org:new-manager:${id}`,
          ...owner,
          due: null,
          severity: 'warning',
          what: `${e.name} has managed since ${formatDate(since)} and already leads ${plural(directs, 'direct report')}`,
          subject: { kind: 'employees', id, label: e.name },
          view: 'org',
          tab: 'chart',
          drill: () =>
            peopleDrill(tree, tree.children.get(id) ?? [], {
              title: `Direct reports of ${e.name}, a new manager`,
              subtitle: scopeLine(scope),
              columns: ['directs', 'totalOrg'],
              note: `Managing since ${formatDate(since)}: new means within ${plural(rules.newManagerMonths, 'month')} of the as-of date, with ${rules.largeTeam} or more direct reports.`,
            }),
          note: `Could we set up a monthly check-in with ${who} on team load for their first year as a manager?`,
          uses: flagUses(m.gates.jobChanges.ok),
        })
      }
    }
  }
  return out.sort((x, y) => x.id.localeCompare(y.id))
}
