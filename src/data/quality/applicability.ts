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

/** An employee row (not a contractor or intern); a blank type counts, so its gaps still show. */
const isEmployeeRow = (r: Row) => r.employmentType !== 'Contractor' && r.employmentType !== 'Intern'

/** A candidate who was made an offer: an offer date, or a stage at Offer or beyond. */
const hadOffer = (r: Row) => has(r.offerDate) || stageIndex(String(r.currentStage)) >= stageIndex('Offer')

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
    // Education is optional (docs/ANALYSES.md, 2.3): its gaps never lower the tier, and Quality of
    // hire reports how much of the cohort has it. Contractors and interns are not hires there.
    university: {
      applies: each(isEmployeeRow),
      scope: 'Employees (not contractors or interns)',
      blankOk: true,
    },
    degreeLevel: {
      applies: each(isEmployeeRow),
      scope: 'Employees (not contractors or interns)',
      blankOk: true,
    },
    fieldOfStudy: {
      applies: each(isEmployeeRow),
      scope: 'Employees (not contractors or interns)',
      blankOk: true,
    },
    // Blank counts as full time.
    fte: { applies: each(() => true), scope: 'All workers', blankOk: true },
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
    // Accepted offers; many ATS exports leave it out, which the Onboarding numbers then say.
    startDate: { applies: each((r) => r.status === 'Hired' || has(r.hiredDate)), scope: 'Accepted offers' },
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
    // Offer details many ATS exports leave out; Offer declines says which figure needs which.
    competingOffer: { applies: each(hadOffer), scope: 'Candidates with an offer', blankOk: true },
    offerRevised: { applies: each(hadOffer), scope: 'Candidates with an offer', blankOk: true },
    offerPositionInRange: { applies: each(hadOffer), scope: 'Candidates with an offer', blankOk: true },
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
    leaveReason: { applies: each((r) => r.type === 'Leave start'), scope: 'Leave starts' },
    expectedReturnDate: { applies: each((r) => r.type === 'Leave start'), scope: 'Leave starts' },
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
  hiringPlan: {
    // A planned role often has no requisition or position number yet.
    reqId: { applies: each(() => true), scope: 'All plan lines', blankOk: true },
    positionId: { applies: each(() => true), scope: 'All plan lines', blankOk: true },
    planVersion: { applies: each(() => true), scope: 'All plan lines', blankOk: true },
  },
  onboardingTasks: {
    // One of the two names the person: the other is blank by design.
    employeeId: { applies: each((r) => !has(r.applicationId)), scope: 'Tasks without an application ID' },
    applicationId: { applies: each((r) => !has(r.employeeId)), scope: 'Tasks without an employee ID' },
    dueDate: { applies: each((r) => r.status !== 'Not needed'), scope: 'Tasks that are needed' },
    completedDate: { applies: each((r) => r.status === 'Done'), scope: 'Tasks marked done' },
  },
  rightToWork: {
    // Permanent authorization has no expiry; time-limited authorization must have one.
    expiryDate: {
      applies: each((r) => has(r.authorizationType) && r.authorizationType !== 'Permanent (no expiry)'),
      scope: 'Time-limited authorizations',
    },
    reverificationStartedDate: {
      applies: each((r) => has(r.expiryDate)),
      scope: 'Authorizations with an expiry',
      blankOk: true,
    },
    // Form I-9 is US only; the roster's work site decides, which this table can't see.
    i9Section1Date: { applies: each(() => true), scope: 'US employees', blankOk: true },
    i9Section2Date: { applies: each(() => true), scope: 'US employees', blankOk: true },
    exportLicenseStatus: {
      applies: each((r) => r.exportLicenseRequired === true),
      scope: 'Roles that need a license',
    },
    exportLicenseExpiry: {
      applies: each((r) => r.exportLicenseStatus === 'Approved'),
      scope: 'Approved licenses',
    },
  },
  surveyResponses: {
    // The Survey items sheet can name the driver instead.
    driver: { applies: each(() => true), scope: 'All answers', blankOk: true },
    reason: { applies: each(() => true), scope: 'All answers', blankOk: true },
    subjectKey: { applies: each(() => true), scope: 'All answers', blankOk: true },
    touchpoint: {
      applies: each((r) => r.survey === 'Candidate experience'),
      scope: 'Candidate experience answers',
    },
  },
  surveyItems: {
    survey: { applies: each(() => true), scope: 'All items', blankOk: true },
    text: { applies: each(() => true), scope: 'All items', blankOk: true },
    target: { applies: each(() => true), scope: 'All items', blankOk: true },
  },
  budget: {
    // A line can budget a whole business unit or department: blank by design.
    department: { applies: each(() => true), scope: 'All budget lines', blankOk: true },
    costCenter: { applies: each(() => true), scope: 'All budget lines', blankOk: true },
    // A currency only means something next to a cost.
    currency: { applies: each((r) => has(r.budgetCost)), scope: 'Lines with a budget cost', blankOk: true },
    planVersion: { applies: each(() => true), scope: 'All budget lines', blankOk: true },
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
