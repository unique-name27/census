/**
 * Lineage: the dataset fields behind every number in the HR ops view.
 *
 * A KPI, figure or finding takes the lowest tier among the fields it lists (docs/DATA-TIERS.md),
 * so each list names every field the number reads: the fields it measures, the fields that pick
 * its population (the opened date for "cases opened in the period") and the fields that supply a
 * fallback (a case's category supplies its default target, team and process).
 *
 * A KPI or finding is one number, so it lists its fields even when a column is missing (its tier
 * is then "no data", matching its "—"). A figure that shows several measures leaves out the
 * optional columns that are absent from the file, because those cells are "—" and the rest of
 * the figure does not depend on them.
 */
import type { KnownFieldRef } from '@/data/quality'
// Runtime imports stay limited to './catalog' (plain data): the view's metric registry
// (../metrics.ts) builds each metric's `uses` from these groups and must not pull in the engine.
import { LEVEL_CLOCKS, SERVICE_LEVELS, type ServiceLevelId } from './catalog'
import type { CaseColumns } from './facts'
import type { LevelRow, ProcessRow } from './levels'

export type Refs = readonly KnownFieldRef[]

/** The groups' fields in first-seen order, each once. */
export const union = (...groups: readonly Refs[]): Refs => [...new Set(groups.flat())]

/** The group when `flag` holds, otherwise nothing. */
export const when = (flag: unknown, ...groups: readonly Refs[]): Refs => (flag ? union(...groups) : [])

/** The field groups the case and transaction measures are built from. */
export interface Lineage {
  /** Cases opened in a period or month. */
  opened: Refs
  /** Open at the as-of date: by the resolved time, or by status when the file has no resolved times. */
  open: Refs
  /** Cases resolved in a period, and the hours from opened to resolved. */
  resolved: Refs
  category: Refs
  /** A case's resolution target, defaulted from its category. */
  resolutionTarget: Refs
  responseTarget: Refs
  resolutionSla: Refs
  responseSla: Refs
  /** The owning team, defaulted from the category. */
  team: Refs
  /** The Atlas process, defaulted from the category. */
  process: Refs
  channel: Refs
  csat: Refs
  reopen: Refs
  escalate: Refs
  /** Where a case problem concentrates: the requester's location, business unit or department. */
  segment: Refs
  assignee: Refs
  /** Transactions due in a period or month. */
  due: Refs
  onTime: Refs
  txType: Refs
  /** The transaction's Atlas process, defaulted from its type. */
  txProcess: Refs
  /** The employee's site in the roster, and through it the jurisdiction and region. */
  site: Refs
  /** The leaver's exit type in the roster. */
  exitType: Refs
  retro: Refs
}

/** The field groups for a cases file with these columns. */
export function lineage(cols: Pick<CaseColumns, 'resolvedAt'>): Lineage {
  const opened: Refs = ['cases.openedAt']
  const open: Refs = cols.resolvedAt
    ? ['cases.openedAt', 'cases.resolvedAt', 'cases.status']
    : ['cases.openedAt', 'cases.status']
  const resolved: Refs = ['cases.openedAt', 'cases.resolvedAt']
  const category: Refs = ['cases.category']
  const resolutionTarget: Refs = ['cases.resolutionTargetHours', 'cases.category']
  const responseTarget: Refs = ['cases.responseTargetHours', 'cases.category']
  const due: Refs = ['transactions.dueDate']
  return {
    opened,
    open,
    resolved,
    category,
    resolutionTarget,
    responseTarget,
    resolutionSla: union(opened, ['cases.resolvedAt'], open, resolutionTarget),
    // A case resolved without a logged reply counts its resolution as the reply (via `open`).
    responseSla: union(opened, ['cases.firstResponseAt'], open, responseTarget),
    team: ['cases.team', 'cases.category'],
    process: ['cases.processId', 'cases.category'],
    channel: ['cases.channel'],
    csat: union(resolved, ['cases.csat']),
    reopen: union(opened, ['cases.resolvedAt', 'cases.reopened']),
    escalate: union(opened, ['cases.escalated']),
    segment: ['cases.requesterId', 'employees.location', 'employees.businessUnit', 'employees.department'],
    assignee: ['cases.assignee'],
    due,
    onTime: union(due, ['transactions.completedDate']),
    txType: ['transactions.type'],
    txProcess: ['transactions.processId', 'transactions.type'],
    site: ['transactions.employeeId', 'employees.location'],
    exitType: ['transactions.employeeId', 'employees.terminationType'],
    retro: union(['transactions.type'], due, ['transactions.retro']),
  }
}

/** The fields one Atlas measure in the scorecard reads. */
export function levelUses(id: ServiceLevelId, L: Lineage): Refs {
  const clock = LEVEL_CLOCKS[id]
  if (clock)
    return union(
      L.opened,
      L.category,
      L.open,
      clock.stop === 'responded' ? ['cases.firstResponseAt'] : ['cases.resolvedAt'],
    )
  if (id === 'er02-median-days') return union(L.resolved, L.category)
  if (id === 'ds01-retro-share') return L.retro
  return union(L.onTime, L.txType)
}

/* ───────────── leave and return ───────────── */

/** The field groups behind the Leave & return measures. */
export interface LeaveLineage {
  /** Leave start and Return from leave transactions, paired per person by date. */
  leaves: Refs
  /** Whether the person was still employed: the roster's termination date. */
  exit: Refs
  /** The Atlas leave category on the leave start. */
  reason: Refs
  /** The planned return date on the leave start. */
  expected: Refs
  /** Whether the return from leave was processed (LV-03). */
  processed: Refs
  unit: Refs
  department: Refs
  exitType: Refs
  /** On leave at a date: started, not back and still employed. */
  onLeave: Refs
  /** Days from leave start to return. */
  length: Refs
  /** Open leaves with a planned return in the next days. */
  returnsSoon: Refs
  /** The LV-03 check on those returns. */
  systemsReady: Refs
  /** Leaves that ended in a return, of those that ended in a return or an exit. */
  returnRate: Refs
  /** Still employed a set time after returning. */
  retention: Refs
  /** Left soon after returning, or during a leave. */
  exits: Refs
}

const LEAVES: Refs = ['transactions.type', 'transactions.effectiveDate', 'transactions.employeeId']
const EXIT: Refs = ['employees.terminationDate']

export const LEAVE: LeaveLineage = {
  leaves: LEAVES,
  exit: EXIT,
  reason: ['transactions.leaveReason'],
  expected: ['transactions.expectedReturnDate'],
  processed: ['transactions.completedDate'],
  unit: ['employees.businessUnit'],
  department: ['employees.department'],
  exitType: ['employees.terminationType'],
  onLeave: union(LEAVES, EXIT),
  length: LEAVES,
  returnsSoon: union(LEAVES, EXIT, ['transactions.expectedReturnDate']),
  systemsReady: union(LEAVES, EXIT, ['transactions.expectedReturnDate', 'transactions.completedDate']),
  returnRate: union(LEAVES, EXIT),
  retention: union(LEAVES, EXIT),
  exits: union(LEAVES, EXIT),
}

/** The Leave & return figures. */
export const LEAVE_FIGURE_IDS = [
  'services-leave-on-leave-trend',
  'services-leave-on-leave',
  'services-leave-length',
  'services-leave-return-rate',
  'services-leave-returns-soon',
  'services-leave-survey',
  'services-leave-retention',
  'services-leave-exits',
] as const

export type LeaveFigureId = (typeof LEAVE_FIGURE_IDS)[number]

/** The fields of the Return to work survey number when Listening gives none. */
export const SURVEY_FALLBACK_USES: Refs = [
  'surveyResponses.survey',
  'surveyResponses.respondentKey',
  'surveyResponses.score',
]

/**
 * The fields behind each Leave & return figure. The reason cuts name the leave reason only when
 * the file has reasons (without them the figures show no reason split).
 */
export function leaveFigureUses(x: {
  hasReasons: boolean
  surveyUses?: Refs | null
}): Record<LeaveFigureId, Refs> {
  const r = when(x.hasReasons, LEAVE.reason)
  return {
    'services-leave-on-leave-trend': LEAVE.onLeave,
    'services-leave-on-leave': union(LEAVE.onLeave, LEAVE.unit, r),
    'services-leave-length': union(LEAVE.length, r),
    'services-leave-return-rate': LEAVE.returnRate,
    'services-leave-returns-soon': union(LEAVE.systemsReady, LEAVE.unit),
    'services-leave-survey': x.surveyUses?.length ? x.surveyUses : SURVEY_FALLBACK_USES,
    'services-leave-retention': union(LEAVE.retention, r),
    'services-leave-exits': union(LEAVE.exits, LEAVE.exitType),
  }
}

/** Every case and transaction figure in the view, by its Figure id. */
export const CASE_TX_FIGURE_IDS = [
  'services-cases-open-trend',
  'services-cases-per-100',
  'services-tx-on-time-heatmap',
  'services-cases-by-month',
  'services-sla-by-month',
  'services-cases-by-category',
  'services-backlog-by-age',
  'services-tx-on-time-by-month',
  'services-sla-by-category',
  'services-time-to-resolve',
  'services-arrivals',
  'services-csat-by-channel',
  'services-reopen-escalate',
  'services-team-workload',
  'services-aged-cases',
  'services-tx-on-time-by-type',
  'services-tx-days-early-late',
  'services-final-pay',
  'services-retro-by-month',
  'services-scorecard',
  'services-gap-to-target',
  'services-response-by-category',
  'services-atlas-processes',
] as const

/** Every figure in the view, by its Figure id. */
export const FIGURE_IDS = [...CASE_TX_FIGURE_IDS, ...LEAVE_FIGURE_IDS] as const

export type CaseTxFigureId = (typeof CASE_TX_FIGURE_IDS)[number]
export type ServicesFigureId = (typeof FIGURE_IDS)[number]

export interface FigureInputs {
  caseCols: CaseColumns
  levels: readonly LevelRow[]
  processes: readonly ProcessRow[]
  /** Some listed aged case names an assignee. */
  assignee: boolean
  /** Some leaver with a final pay transaction has an exit type in the roster. */
  exitTypes: boolean
}

const CASE_SLA = new Map(SERVICE_LEVELS.map((d) => [d.id, d.caseCategory ?? null]))

/**
 * The scorecard's fields: the measures with data and, on case rows, the category's resolution
 * SLA. With nothing measured, every measure's fields (so the figure reads "no data").
 */
function scorecardUses(rows: readonly LevelRow[], L: Lineage, unit?: LevelRow['unit']): Refs {
  const mine = rows.filter((r) => !unit || r.unit === unit)
  const measured = mine.filter((r) => (r.records?.rows.length ?? 0) > 0)
  const caseSla = unit ? [] : mine.filter((r) => r.caseSla != null && CASE_SLA.get(r.id))
  if (!measured.length && !caseSla.length) return union(...mine.map((r) => levelUses(r.id, L)))
  return union(...measured.map((r) => levelUses(r.id, L)), when(caseSla.length, L.resolutionSla, L.category))
}

/** The processes table's fields: cases when it counts any, transactions when it counts any. */
function processUses(rows: readonly ProcessRow[], L: Lineage): Refs {
  const cases = rows.some((r) => r.caseRecords.length)
  const tx = rows.some((r) => r.txRecords.length)
  if (!cases && !tx) return union(L.opened, L.process, L.due, L.txProcess)
  return union(when(cases, L.opened, L.process), when(tx, L.due, L.txProcess))
}

/** The fields behind each figure, given which optional columns the files carry. */
export function figureUses(L: Lineage, x: FigureInputs): Record<CaseTxFigureId, Refs> {
  const c = x.caseCols
  const reopenCols = c.reopened || c.escalated
  return {
    'services-cases-open-trend': L.open,
    'services-cases-per-100': union(L.opened, [
      'cases.requesterId',
      'employees.businessUnit',
      'employees.hireDate',
      'employees.terminationDate',
      'employees.employmentType',
    ]),
    'services-tx-on-time-heatmap': union(L.onTime, L.txType),
    'services-cases-by-month': union(L.opened, L.category),
    'services-sla-by-month': union(L.resolutionSla, when(c.firstResponseAt, L.responseSla)),
    'services-cases-by-category': union(
      L.opened,
      L.category,
      L.process,
      L.team,
      L.open,
      when(c.resolvedAt, L.resolutionSla),
    ),
    'services-backlog-by-age': L.open,
    'services-tx-on-time-by-month': L.onTime,
    'services-sla-by-category': union(
      L.resolutionSla,
      L.category,
      L.process,
      when(c.firstResponseAt, L.responseSla),
    ),
    'services-time-to-resolve': union(L.resolved, L.category, L.resolutionTarget),
    'services-arrivals': L.opened,
    'services-csat-by-channel': union(L.csat, L.channel, L.opened, when(c.resolvedAt, L.resolutionSla)),
    // With neither column the figure is empty, so it lists both (no data).
    'services-reopen-escalate': union(
      L.opened,
      L.category,
      when(c.reopened || !reopenCols, L.reopen),
      when(c.escalated || !reopenCols, L.escalate),
    ),
    'services-team-workload': union(
      L.opened,
      L.team,
      L.open,
      when(c.resolvedAt, L.resolutionSla, L.resolved),
      when(c.csat, L.csat),
      // First-contact resolution: resolved, at Tier 0 or 1, not reopened, not escalated.
      when(c.tier, L.resolved, ['cases.tier']),
      when(c.tier && c.reopened, ['cases.reopened']),
      when(c.tier && c.escalated, ['cases.escalated']),
    ),
    'services-aged-cases': union(
      L.open,
      L.category,
      L.process,
      L.team,
      L.resolutionTarget,
      when(x.assignee, L.assignee),
    ),
    'services-tx-on-time-by-type': union(L.onTime, L.txType, L.txProcess),
    'services-tx-days-early-late': L.onTime,
    'services-final-pay': union(L.onTime, L.txType, L.site, when(x.exitTypes, L.exitType)),
    'services-retro-by-month': L.retro,
    'services-scorecard': scorecardUses(x.levels, L),
    'services-gap-to-target': scorecardUses(x.levels, L, 'share'),
    'services-response-by-category': union(L.responseSla, L.category, L.process),
    'services-atlas-processes': processUses(x.processes, L),
  }
}
