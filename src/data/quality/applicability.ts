/**
 * Which rows each field applies to, in one table.
 *
 * A field's coverage counts only the rows it applies to: a termination type only exists for
 * leavers, an offer date only for candidates who reached the offer stage. Fields not listed here
 * apply to every row. `blankOk` marks fields whose blanks are normal even among those rows (no
 * interview booked yet, no successor named), so their coverage never lowers the tier.
 */
import { type DatasetKey, type Stage, stageIndex } from '../schema'

type Row = Record<string, unknown>

export interface Applicability {
  /** Built once per dataset: which rows the field applies to. */
  applies: (rows: readonly Row[]) => (row: Row) => boolean
  /** Shown under the field name, e.g. "Leavers". */
  scope: string
  /** Blanks are normal among the rows it applies to, so coverage does not cap the tier. */
  blankOk?: boolean
}

/** The importer's placeholder for a value it could not fill responsibly; it counts as blank. */
export const UNKNOWN_VALUE = 'Unknown'

/** A value that counts as filled: not blank, not NaN, not the importer's "Unknown" placeholder. */
export function isFilled(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'string') {
    const t = v.trim()
    return t !== '' && t !== UNKNOWN_VALUE
  }
  return true
}

const has = (v: unknown) => v != null && v !== ''
const each =
  (test: (row: Row) => boolean): Applicability['applies'] =>
  () =>
    test

const INTERVIEW_STAGES = new Set<string>(['Screen', 'Hiring manager', 'Onsite'])
const LEFT_PROCESS = new Set<string>(['Rejected', 'Withdrawn', 'Declined'])
const RESOLVED = new Set<string>(['Resolved', 'Closed'])

/** A stage date applies to candidates whose current stage is that stage or a later one. */
const reached = (stage: Stage): Applicability => ({
  applies: each((r) => stageIndex(String(r.currentStage)) >= stageIndex(stage)),
  scope: stage === 'Hired' ? 'Hired candidates' : `Candidates who reached ${stage}`,
})

/** A leaver: someone with a termination date. */
const isLeaver = (r: Row) => has(r.terminationDate)

/**
 * Everyone but the top of the organization: the person with no manager who heads the largest
 * reporting tree. Only one person is left out, so managers cleared on import still count as gaps.
 */
export function notTopOfOrg(rows: readonly Row[]): (row: Row) => boolean {
  const children = new Map<string, string[]>()
  for (const r of rows) {
    const m = r.managerId
    const id = r.employeeId
    if (typeof m !== 'string' || !m || typeof id !== 'string') continue
    const list = children.get(m)
    if (list) list.push(id)
    else children.set(m, [id])
  }
  let top: Row | null = null
  let topSize = 0
  for (const r of rows) {
    if (has(r.managerId) || typeof r.employeeId !== 'string' || !children.has(r.employeeId)) continue
    const seen = new Set<string>([r.employeeId])
    const queue = [r.employeeId]
    while (queue.length) {
      for (const c of children.get(queue.pop() as string) ?? []) {
        if (seen.has(c)) continue
        seen.add(c)
        queue.push(c)
      }
    }
    if (seen.size > topSize) {
      topSize = seen.size
      top = r
    }
  }
  return (row) => row !== top
}

/** Rows whose `group` value has at least one row with `field` filled (e.g. cycles that rate potential). */
function groupsWithValue(group: string, field: string): Applicability['applies'] {
  return (rows) => {
    const groups = new Set<unknown>()
    for (const r of rows) if (has(r[field])) groups.add(r[group])
    return (r) => groups.has(r[group])
  }
}

const levelChange = new Set<string>(['Promotion', 'Demotion'])
const managerChange = new Set<string>(['Manager change', 'Transfer'])

export const APPLICABILITY: Partial<Record<DatasetKey, Record<string, Applicability>>> = {
  employees: {
    managerId: { applies: notTopOfOrg, scope: 'Everyone except the top of the organization' },
    // A date that stays blank until someone leaves: it applies to rows that say they left.
    terminationDate: {
      applies: each((r) => has(r.terminationType) || has(r.terminationReason)),
      scope: 'Rows with a termination type or reason',
    },
    terminationType: { applies: each(isLeaver), scope: 'Leavers' },
    terminationReason: { applies: each(isLeaver), scope: 'Leavers' },
    regrettable: {
      applies: each((r) => isLeaver(r) && r.terminationType === 'Voluntary'),
      scope: 'Voluntary leavers',
    },
  },
  jobChanges: {
    fromLevel: {
      applies: each((r) => levelChange.has(String(r.changeType))),
      scope: 'Promotions and demotions',
    },
    toLevel: {
      applies: each((r) => levelChange.has(String(r.changeType))),
      scope: 'Promotions and demotions',
    },
    fromDepartment: { applies: each((r) => r.changeType === 'Transfer'), scope: 'Transfers' },
    toDepartment: { applies: each((r) => r.changeType === 'Transfer'), scope: 'Transfers' },
    fromManagerId: {
      applies: each((r) => managerChange.has(String(r.changeType))),
      scope: 'Manager changes and transfers',
    },
    toManagerId: {
      applies: each((r) => managerChange.has(String(r.changeType))),
      scope: 'Manager changes and transfers',
    },
  },
  requisitions: {
    targetStartDate: { applies: each((r) => r.status !== 'Cancelled'), scope: 'Requisitions not cancelled' },
    filledDate: { applies: each((r) => r.status === 'Filled'), scope: 'Filled requisitions' },
    closedDate: {
      applies: each((r) => r.status === 'Filled' || r.status === 'Cancelled'),
      scope: 'Filled or cancelled requisitions',
    },
  },
  candidates: {
    // Coordinators schedule interviews from the hiring manager stage on.
    coordinator: reached('Hiring manager'),
    screenDate: reached('Screen'),
    hmDate: reached('Hiring manager'),
    onsiteDate: reached('Onsite'),
    offerDate: reached('Offer'),
    hiredDate: reached('Hired'),
    rejectedDate: {
      applies: each((r) => LEFT_PROCESS.has(String(r.status))),
      scope: 'Rejected, withdrawn or declined candidates',
    },
    rejectionReason: {
      applies: each((r) => LEFT_PROCESS.has(String(r.status))),
      scope: 'Rejected, withdrawn or declined candidates',
    },
    nextEventDate: {
      applies: each((r) => r.status === 'Active' && INTERVIEW_STAGES.has(String(r.currentStage))),
      scope: 'Active candidates in interview stages',
      blankOk: true,
    },
  },
  cases: {
    // Self-service (Tier 0) cases are closed without a person working them.
    assignee: { applies: each((r) => r.tier !== 'Tier 0'), scope: 'Cases above Tier 0' },
    firstResponseAt: { applies: each((r) => r.status !== 'New'), scope: 'Cases past the New status' },
    resolvedAt: { applies: each((r) => RESOLVED.has(String(r.status))), scope: 'Resolved or closed cases' },
    csat: {
      applies: each((r) => RESOLVED.has(String(r.status))),
      scope: 'Resolved or closed cases',
      blankOk: true,
    },
    // The case's own site is only needed when the requester is not named.
    location: { applies: each((r) => !has(r.requesterId)), scope: 'Cases without a requester ID' },
    // Employee relations keeps the category level only (privacy rule), so its blank topic is no gap.
    subcategory: {
      applies: each((r) => r.category !== 'Employee relations'),
      scope: 'Cases outside employee relations',
    },
  },
  transactions: {
    completedDate: { applies: each(() => true), scope: 'All transactions', blankOk: true },
    // Only payroll-affecting types track retro adjustments: the types that have any value.
    retro: {
      applies: groupsWithValue('type', 'retro'),
      scope: 'Transaction types that track retro adjustments',
    },
  },
  reviews: {
    // Potential is assessed in some cycles only (usually the annual one).
    potential: { applies: groupsWithValue('cycle', 'potential'), scope: 'Cycles that assess potential' },
  },
  succession: {
    successorId: { applies: each(() => true), scope: 'All roles', blankOk: true },
    readiness: { applies: each((r) => has(r.successorId)), scope: 'Roles with a named successor' },
  },
  learning: {
    completedDate: { applies: each(() => true), scope: 'All assignments', blankOk: true },
    hours: { applies: each((r) => has(r.completedDate)), scope: 'Completed assignments' },
  },
  comp: {
    // Blank for people hired after the last payout.
    bonusPayoutPct: { applies: each(() => true), scope: 'All employees', blankOk: true },
    // Null for people hired after the cycle cut-off or without a rating.
    meritPct: { applies: each(() => true), scope: 'All employees', blankOk: true },
    promotionPct: { applies: each(() => true), scope: 'All employees', blankOk: true },
    lastIncreaseDate: { applies: each(() => true), scope: 'All employees', blankOk: true },
    lastIncreasePct: { applies: each(() => true), scope: 'All employees', blankOk: true },
  },
}

/** The rule for one field, or undefined when it applies to every row. */
export const applicabilityOf = (dataset: DatasetKey, field: string): Applicability | undefined =>
  APPLICABILITY[dataset]?.[field]

/** Which rows a field applies to, decided once per dataset; null when it applies to every row. */
export function appliesTo(
  dataset: DatasetKey,
  field: string,
  rows: readonly object[],
): ((row: object) => boolean) | null {
  const rule = applicabilityOf(dataset, field)
  if (!rule) return null
  const test = rule.applies(rows as readonly Row[])
  return (row) => test(row as Row)
}
