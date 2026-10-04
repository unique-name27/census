/**
 * Card flags carried over from the old org chart tool's hotspot rules, aligned with the HR business
 * partners view's org design definitions. Every threshold is a setting in the metric dictionary
 * (`OrgRules`, read through `ctx.metrics`); the defaults are in brackets:
 *
 *  - wide span: the wide-span number of direct reports or more (12);
 *  - narrow span: at least one direct report and no more than the narrow-span number (1);
 *  - single-report chain: exactly 1 direct report who leads the team-below number of people or more
 *    (5): an extra layer above a whole team;
 *  - new manager with a large team: managing for under the new-manager window (12 months), with the
 *    large-team number of direct reports or more (8). "Managing since" is the move from an individual
 *    contributor level to a manager level in Job changes, otherwise the hire date;
 *  - new hire: joined within the new-hire window (90 days);
 *  - placement: the data's manager is not active on the as-of date, or the data had a reporting loop.
 *
 * Spans count active reports of every worker type.
 */
import type { Severity } from '@/components/types'
import type { Employee, ISODate, JobChange } from '@/data/schema'
import { addDays, addMonths, daysBetween, formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { defaultOrgRules, narrowSpanLabel, type OrgRules, wideSpanLabel } from './rules'
import type { OrgTree } from './tree'

export type FlagKind =
  | 'wide-span'
  | 'narrow-span'
  | 'single-report-chain'
  | 'new-manager-large-team'
  | 'new-hire'
  | 'placement'

export interface Flag {
  kind: FlagKind
  /** The kind's name with the setting in force, for tables and drills: "Wide span (12+)". */
  name: string
  severity: Severity
  /** Short label for a pill: "14 direct reports". */
  label: string
  /** One plain sentence with the facts. */
  detail: string
}

/** Flag kinds in display order. */
export const FLAG_KINDS: readonly FlagKind[] = [
  'wide-span',
  'narrow-span',
  'single-report-chain',
  'new-manager-large-team',
  'new-hire',
  'placement',
]

/** A kind's name with the settings in force: "Wide span (12+)", "Span of 1", "New hire (90 days)". */
export function flagName(kind: FlagKind, rules: OrgRules = defaultOrgRules()): string {
  switch (kind) {
    case 'wide-span':
      return wideSpanLabel(rules)
    case 'narrow-span':
      return narrowSpanLabel(rules)
    case 'single-report-chain':
      return 'Single-report chain'
    case 'new-manager-large-team':
      return 'New manager, large team'
    case 'new-hire':
      return `New hire (${rules.newHireDays} days)`
    case 'placement':
      return 'Reporting line note'
  }
}

const isIcLevel = (l: string | null | undefined) => !!l && l.startsWith('L')
const isMgrLevel = (l: string | null | undefined) => !!l && (l.startsWith('M') || l.startsWith('E'))

/** Date each person moved from an individual contributor level to a manager level (latest move). */
export function becameManagerDates(jobChanges: readonly JobChange[]): Map<string, ISODate> {
  const out = new Map<string, ISODate>()
  for (const j of jobChanges) {
    if (!isIcLevel(j.fromLevel) || !isMgrLevel(j.toLevel)) continue
    const prev = out.get(j.employeeId)
    if (!prev || j.effectiveDate > prev) out.set(j.employeeId, j.effectiveDate)
  }
  return out
}

/** When someone started managing: their move into a manager level, else their hire date. */
export function managingSince(e: Employee, became: ReadonlyMap<string, ISODate>): ISODate {
  const d = became.get(e.employeeId)
  return d && d > e.hireDate ? d : e.hireDate
}

const PLACEMENT_TEXT = {
  'manager-inactive':
    'Their manager in the data is not active on this date, so they are shown under the next active manager up the chain.',
  'manager-missing': 'Their manager ID is not in the roster, so they are shown at the top level.',
  'cycle-broken': 'The data had a reporting loop here, so this person is shown at the top level to break it.',
  'self-manager': 'They are listed as their own manager, so they are shown at the top level.',
} as const

export function computeFlags(
  tree: OrgTree,
  jobChanges: readonly JobChange[] = [],
  rules: OrgRules = defaultOrgRules(),
): Map<string, Flag[]> {
  const out = new Map<string, Flag[]>()
  const add = (id: string, f: Omit<Flag, 'name'>) => {
    const flag = { ...f, name: flagName(f.kind, rules) }
    const arr = out.get(id)
    if (arr) arr.push(flag)
    else out.set(id, [flag])
  }
  const asOf = tree.asOf
  const became = becameManagerDates(jobChanges)
  const newMgrCutoff = addMonths(asOf, -rules.newManagerMonths)
  const newHireCutoff = addDays(asOf, -rules.newHireDays)
  const nameOf = (id: string) => tree.people.get(id)?.name ?? id

  for (const [id, e] of tree.people) {
    const n = tree.directs.get(id) ?? 0
    if (n >= rules.wideSpan) {
      add(id, {
        kind: 'wide-span',
        severity: 'warning',
        label: `${n} direct reports`,
        detail: `${e.name} has ${n} direct reports, at or above the ${rules.wideSpan} where time per person gets thin.`,
      })
    }
    if (n >= 1 && n <= rules.narrowSpan) {
      add(id, {
        kind: 'narrow-span',
        severity: 'info',
        label: n === 1 ? '1 direct report' : `${n} direct reports`,
        detail:
          n === 1
            ? `${e.name} has one direct report, ${nameOf(tree.children.get(id)![0])}.`
            : `${e.name} has ${n} direct reports, at or below the ${rules.narrowSpan} that counts as a narrow span.`,
      })
    }
    if (n === 1) {
      const only = tree.children.get(id)![0]
      const below = tree.total.get(only) ?? 0
      if (below >= rules.chainMinBelow) {
        add(id, {
          kind: 'single-report-chain',
          severity: 'warning',
          label: 'Single-report chain',
          detail: `${e.name} manages only ${nameOf(only)}, who leads ${plural(below, 'person', 'people')}. This adds a layer above a whole team.`,
        })
      }
    }
    if (n >= rules.largeTeam) {
      const since = managingSince(e, became)
      if (since > newMgrCutoff) {
        add(id, {
          kind: 'new-manager-large-team',
          severity: 'warning',
          label: 'New manager',
          detail: `${e.name} has managed since ${formatDate(since)} and already has ${n} direct reports.`,
        })
      }
    }
    if (e.hireDate > newHireCutoff && e.hireDate <= asOf) {
      const days = daysBetween(e.hireDate, asOf)
      add(id, {
        kind: 'new-hire',
        severity: 'info',
        label: 'New hire',
        detail: `Joined ${formatDate(e.hireDate)}, ${plural(days, 'day')} ago.`,
      })
    }
    const note = tree.notes.get(id)
    if (note) {
      add(id, {
        kind: 'placement',
        severity: note === 'cycle-broken' ? 'warning' : 'info',
        label: note === 'cycle-broken' ? 'Reporting loop' : 'Manager not active',
        detail: PLACEMENT_TEXT[note],
      })
    }
  }
  return out
}

/** Flags that point at a structural question (everything but new hires and placement notes). */
export const STRUCTURAL: ReadonlySet<FlagKind> = new Set([
  'wide-span',
  'narrow-span',
  'single-report-chain',
  'new-manager-large-team',
])

export interface FlagSummaryRow {
  kind: FlagKind
  label: string
  people: number
}

/** Count of people per flag kind, for the toolbar summary and the flags table. */
export function flagSummary(
  flags: ReadonlyMap<string, readonly Flag[]>,
  ids?: Iterable<string>,
): FlagSummaryRow[] {
  const counts = new Map<FlagKind, number>()
  const names = new Map<FlagKind, string>()
  const pick = ids ? [...ids] : [...flags.keys()]
  for (const id of pick)
    for (const f of flags.get(id) ?? []) {
      counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1)
      if (!names.has(f.kind)) names.set(f.kind, f.name)
    }
  return FLAG_KINDS.filter((k) => counts.has(k)).map((k) => ({
    kind: k,
    label: names.get(k)!,
    people: counts.get(k)!,
  }))
}
