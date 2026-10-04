/**
 * Card flags carried over from the old org chart tool's hotspot rules, aligned with the HR business
 * partners view's org design definitions:
 *
 *  - wide span: 12 or more direct reports;
 *  - narrow span: exactly 1 direct report;
 *  - single-report chain: exactly 1 direct report who leads 5 or more people (an extra layer above
 *    a whole team);
 *  - new manager with a large team: managing for under 12 months, with 8 or more direct reports.
 *    "Managing since" is the move from an individual contributor level to a manager level in Job
 *    changes, otherwise the hire date;
 *  - new hire: joined in the last 90 days;
 *  - placement: the data's manager is not active on the as-of date, or the data had a reporting loop.
 *
 * Spans count active reports of every worker type.
 */
import type { Severity } from '@/components/types'
import type { Employee, ISODate, JobChange } from '@/data/schema'
import { addDays, addMonths, daysBetween, formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
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
  severity: Severity
  /** Short label for a pill: "14 direct reports". */
  label: string
  /** One plain sentence with the facts. */
  detail: string
}

export const FLAG_LABELS: Record<FlagKind, string> = {
  'wide-span': 'Wide span (12+)',
  'narrow-span': 'Span of 1',
  'single-report-chain': 'Single-report chain',
  'new-manager-large-team': 'New manager, large team',
  'new-hire': 'New hire (90 days)',
  placement: 'Reporting line note',
}

export const WIDE_SPAN = 12
export const CHAIN_MIN_BELOW = 5
export const NEW_MANAGER_MONTHS = 12
export const LARGE_TEAM = 8
export const NEW_HIRE_DAYS = 90

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

export function computeFlags(tree: OrgTree, jobChanges: readonly JobChange[] = []): Map<string, Flag[]> {
  const out = new Map<string, Flag[]>()
  const add = (id: string, f: Flag) => {
    const arr = out.get(id)
    if (arr) arr.push(f)
    else out.set(id, [f])
  }
  const asOf = tree.asOf
  const became = becameManagerDates(jobChanges)
  const newMgrCutoff = addMonths(asOf, -NEW_MANAGER_MONTHS)
  const newHireCutoff = addDays(asOf, -NEW_HIRE_DAYS)
  const nameOf = (id: string) => tree.people.get(id)?.name ?? id

  for (const [id, e] of tree.people) {
    const n = tree.directs.get(id) ?? 0
    if (n >= WIDE_SPAN) {
      add(id, {
        kind: 'wide-span',
        severity: 'warning',
        label: `${n} direct reports`,
        detail: `${e.name} has ${n} direct reports, at or above the ${WIDE_SPAN} where time per person gets thin.`,
      })
    }
    if (n === 1) {
      const only = tree.children.get(id)![0]
      const below = tree.total.get(only) ?? 0
      add(id, {
        kind: 'narrow-span',
        severity: 'info',
        label: '1 direct report',
        detail: `${e.name} has one direct report, ${nameOf(only)}.`,
      })
      if (below >= CHAIN_MIN_BELOW) {
        add(id, {
          kind: 'single-report-chain',
          severity: 'warning',
          label: 'Single-report chain',
          detail: `${e.name} manages only ${nameOf(only)}, who leads ${plural(below, 'person', 'people')}. This adds a layer above a whole team.`,
        })
      }
    }
    if (n >= LARGE_TEAM) {
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
  const pick = ids ? [...ids] : [...flags.keys()]
  for (const id of pick)
    for (const f of flags.get(id) ?? []) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1)
  return (Object.keys(FLAG_LABELS) as FlagKind[])
    .filter((k) => counts.has(k))
    .map((k) => ({ kind: k, label: FLAG_LABELS[k], people: counts.get(k)! }))
}
