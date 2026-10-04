/**
 * Turns raw drill rows into display tables: standard, readable columns per record kind, names
 * resolved from the roster, and a hidden person key so any row can open that person's card.
 * Pure (no React); tested in records.test.ts.
 */
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import type {
  Candidate,
  CompRecord,
  Employee,
  HrCase,
  HrTransaction,
  JobChange,
  LearningRecord,
  Requisition,
  Review,
  SuccessionPlan,
} from '@/data/schema'
import { caseCategoryByName, LEVEL_LABELS } from '@/data/schema'
import { isActiveAt } from '@/data/scope'
import { daysBetween, hoursBetween } from '@/lib/dates'
import { tenureYears } from '@/lib/people'
import type { DrillKind, DrillRecordMap, DrillSpec } from './types'

/** Hidden keys on every display row. */
export const PERSON_KEY = '__person'
export const ROW_KEY = '__key'

export type DrillContext = Pick<AnalyticsContext, 'org' | 'asOf' | 'all' | 'showPay'>

export interface DrillTable {
  columns: Column[]
  rows: Record<string, unknown>[]
}

type Row = Record<string, unknown>

const reqIndex = new WeakMap<readonly Requisition[], Map<string, Requisition>>()
function reqsById(ctx: DrillContext): Map<string, Requisition> {
  let m = reqIndex.get(ctx.all.requisitions)
  if (!m) {
    m = new Map(ctx.all.requisitions.map((r) => [r.reqId, r]))
    reqIndex.set(ctx.all.requisitions, m)
  }
  return m
}

const nameOf = (ctx: DrillContext, id: string | null | undefined): string | null =>
  id ? (ctx.org.byId.get(id)?.name ?? id) : null

const levelText = (l: string | null | undefined) =>
  l ? (LEVEL_LABELS[l as keyof typeof LEVEL_LABELS] ?? l) : null

const C = (key: string, label: string, extra: Partial<Column> = {}): Column => ({ key, label, ...extra })

/* ───────── per kind ───────── */

const EMPLOYEE_COLUMNS: Column[] = [
  C('employeeId', 'Employee ID'),
  C('name', 'Name'),
  C('jobTitle', 'Job title'),
  C('department', 'Department'),
  C('location', 'Location'),
  C('level', 'Level'),
  C('manager', 'Manager'),
  C('hireDate', 'Hire date', { format: 'date' }),
  C('tenure', 'Tenure', { format: 'years' }),
  C('status', 'Status'),
  C('terminationDate', 'Exit date', { format: 'date' }),
  C('terminationType', 'Exit type'),
  C('terminationReason', 'Exit reason'),
  C('regrettable', 'Regrettable'),
  C('employmentType', 'Worker type'),
]
function employeeRow(ctx: DrillContext, e: Employee): Row {
  const left = !!e.terminationDate && e.terminationDate <= ctx.asOf
  return {
    employeeId: e.employeeId,
    name: e.name,
    jobTitle: e.jobTitle,
    department: e.department,
    location: e.location,
    level: levelText(e.level),
    manager: nameOf(ctx, e.managerId),
    hireDate: e.hireDate,
    tenure: tenureYears(e, ctx.asOf),
    status: left ? 'Left' : isActiveAt(e, ctx.asOf) ? 'Active' : 'Not started',
    terminationDate: e.terminationDate ?? null,
    terminationType: e.terminationType ?? null,
    terminationReason: e.terminationReason ?? null,
    regrettable: e.regrettable == null ? null : e.regrettable ? 'Yes' : 'No',
    employmentType: e.employmentType,
    [PERSON_KEY]: e.employeeId,
    [ROW_KEY]: e.employeeId,
  }
}

const personCols = (ctx: DrillContext, id: string | null | undefined): Row => {
  const e = id ? ctx.org.byId.get(id) : undefined
  return {
    name: e?.name ?? id ?? null,
    department: e?.department ?? null,
    level: levelText(e?.level),
    location: e?.location ?? null,
  }
}

const JOB_CHANGE_COLUMNS: Column[] = [
  C('employeeId', 'Employee ID'),
  C('name', 'Name'),
  C('department', 'Department'),
  C('effectiveDate', 'Effective date', { format: 'date' }),
  C('changeType', 'Change'),
  C('fromLevel', 'From level'),
  C('toLevel', 'To level'),
  C('fromDepartment', 'From department'),
  C('toDepartment', 'To department'),
]
const jobChangeRow = (ctx: DrillContext, j: JobChange, i: number): Row => ({
  employeeId: j.employeeId,
  ...personCols(ctx, j.employeeId),
  effectiveDate: j.effectiveDate,
  changeType: j.changeType,
  fromLevel: j.fromLevel ?? null,
  toLevel: j.toLevel ?? null,
  fromDepartment: j.fromDepartment ?? null,
  toDepartment: j.toDepartment ?? null,
  [PERSON_KEY]: j.employeeId,
  [ROW_KEY]: `${j.employeeId}-${j.effectiveDate}-${i}`,
})

const REQ_COLUMNS: Column[] = [
  C('reqId', 'Req ID'),
  C('jobTitle', 'Job title'),
  C('department', 'Department'),
  C('location', 'Location'),
  C('level', 'Level'),
  C('priority', 'Priority'),
  C('status', 'Status'),
  C('hiringManager', 'Hiring manager'),
  C('recruiter', 'Recruiter'),
  C('openedDate', 'Opened', { format: 'date' }),
  C('filledDate', 'Filled', { format: 'date' }),
  C('daysOpen', 'Days open', { format: 'days' }),
]
function reqRow(ctx: DrillContext, r: Requisition): Row {
  const end = r.filledDate ?? r.closedDate ?? ctx.asOf
  return {
    reqId: r.reqId,
    jobTitle: r.jobTitle,
    department: r.department,
    location: r.location,
    level: r.level,
    priority: r.priority,
    status: r.status,
    hiringManager: r.hiringManager ?? nameOf(ctx, r.hiringManagerId),
    recruiter: r.recruiter ?? null,
    openedDate: r.openedDate,
    filledDate: r.filledDate ?? null,
    daysOpen: daysBetween(r.openedDate, end < ctx.asOf ? end : ctx.asOf),
    [PERSON_KEY]: r.hiringManagerId ?? null,
    [ROW_KEY]: r.reqId,
  }
}

const CANDIDATE_COLUMNS: Column[] = [
  C('applicationId', 'Application ID'),
  C('candidateName', 'Candidate'),
  C('reqId', 'Req ID'),
  C('jobTitle', 'Job title'),
  C('department', 'Department'),
  C('source', 'Source'),
  C('currentStage', 'Stage'),
  C('status', 'Status'),
  C('appliedDate', 'Applied', { format: 'date' }),
  C('stageEnteredDate', 'In stage since', { format: 'date' }),
  C('nextEventDate', 'Next event', { format: 'date' }),
  C('rejectionReason', 'Reason'),
  C('recruiter', 'Recruiter'),
]
function candidateRow(ctx: DrillContext, c: Candidate): Row {
  const r = reqsById(ctx).get(c.reqId)
  return {
    applicationId: c.applicationId,
    candidateName: c.candidateName,
    reqId: c.reqId,
    jobTitle: r?.jobTitle ?? null,
    department: r?.department ?? null,
    source: c.source,
    currentStage: c.currentStage,
    status: c.status,
    appliedDate: c.appliedDate,
    stageEnteredDate: c.stageEnteredDate ?? null,
    nextEventDate: c.nextEventDate ?? null,
    rejectionReason: c.rejectionReason ?? null,
    recruiter: c.recruiter ?? r?.recruiter ?? null,
    [PERSON_KEY]: null,
    [ROW_KEY]: c.applicationId,
  }
}

const CASE_COLUMNS: Column[] = [
  C('caseId', 'Case ID'),
  C('category', 'Category'),
  C('subcategory', 'Topic'),
  C('status', 'Status'),
  C('priority', 'Priority'),
  C('team', 'Team'),
  C('assignee', 'Assignee'),
  C('requester', 'Requester'),
  C('openedAt', 'Opened', { format: 'date' }),
  C('resolvedAt', 'Resolved', { format: 'date' }),
  C('hoursToResolve', 'Hours to resolve', { format: 'hours' }),
  C('withinTarget', 'Within target'),
  C('csat', 'Satisfaction', { format: 'num1' }),
]
function caseRow(ctx: DrillContext, c: HrCase): Row {
  const cat = caseCategoryByName.get(c.category)
  const target = c.resolutionTargetHours ?? cat?.resolutionHours ?? null
  const hours = c.resolvedAt ? hoursBetween(c.openedAt, c.resolvedAt) : null
  return {
    caseId: c.caseId,
    category: c.category,
    // Employee relations: category level only (privacy rule).
    subcategory: c.category === 'Employee relations' ? null : (c.subcategory ?? null),
    status: c.status,
    priority: c.priority,
    team: c.team,
    assignee: c.assignee ?? null,
    requester: nameOf(ctx, c.requesterId),
    openedAt: c.openedAt,
    resolvedAt: c.resolvedAt ?? null,
    hoursToResolve: hours,
    withinTarget: hours == null || target == null ? null : hours <= target ? 'Yes' : 'No',
    csat: c.csat ?? null,
    [PERSON_KEY]: c.requesterId ?? null,
    [ROW_KEY]: c.caseId,
  }
}

const TRANSACTION_COLUMNS: Column[] = [
  C('transactionId', 'Transaction ID'),
  C('type', 'Type'),
  C('name', 'Employee'),
  C('location', 'Location'),
  C('submittedDate', 'Submitted', { format: 'date' }),
  C('effectiveDate', 'Effective', { format: 'date' }),
  C('dueDate', 'Due', { format: 'date' }),
  C('completedDate', 'Completed', { format: 'date' }),
  C('daysLate', 'Days late', { format: 'days' }),
  C('processId', 'Process'),
]
function transactionRow(ctx: DrillContext, t: HrTransaction): Row {
  const p = personCols(ctx, t.employeeId)
  const done = t.completedDate ?? null
  const late = done
    ? daysBetween(t.dueDate, done)
    : t.dueDate < ctx.asOf
      ? daysBetween(t.dueDate, ctx.asOf)
      : null
  return {
    transactionId: t.transactionId,
    type: t.type,
    name: p.name,
    location: p.location,
    submittedDate: t.submittedDate,
    effectiveDate: t.effectiveDate,
    dueDate: t.dueDate,
    completedDate: done,
    daysLate: late != null && late > 0 ? late : 0,
    processId: t.processId ?? null,
    [PERSON_KEY]: t.employeeId,
    [ROW_KEY]: t.transactionId,
  }
}

const REVIEW_COLUMNS: Column[] = [
  C('employeeId', 'Employee ID'),
  C('name', 'Name'),
  C('department', 'Department'),
  C('level', 'Level'),
  C('cycle', 'Cycle'),
  C('rating', 'Rating', { format: 'int' }),
  C('preCalibrationRating', 'Before calibration', { format: 'int' }),
  C('potential', 'Potential'),
]
const reviewRow = (ctx: DrillContext, r: Review): Row => ({
  employeeId: r.employeeId,
  ...personCols(ctx, r.employeeId),
  cycle: r.cycle,
  rating: r.rating,
  preCalibrationRating: r.preCalibrationRating ?? null,
  potential: r.potential ?? null,
  [PERSON_KEY]: r.employeeId,
  [ROW_KEY]: `${r.employeeId}-${r.cycle}`,
})

const SUCCESSION_COLUMNS: Column[] = [
  C('roleId', 'Role ID'),
  C('roleTitle', 'Role'),
  C('incumbent', 'Incumbent'),
  C('criticality', 'Criticality'),
  C('incumbentRiskOfLoss', 'Risk of loss'),
  C('successor', 'Successor'),
  C('readiness', 'Readiness'),
]
const successionRow = (ctx: DrillContext, s: SuccessionPlan, i: number): Row => ({
  roleId: s.roleId,
  roleTitle: s.roleTitle,
  incumbent: nameOf(ctx, s.incumbentId),
  criticality: s.criticality,
  incumbentRiskOfLoss: s.incumbentRiskOfLoss ?? null,
  successor: nameOf(ctx, s.successorId) ?? 'None named',
  readiness: s.readiness ?? null,
  [PERSON_KEY]: s.incumbentId,
  [ROW_KEY]: `${s.roleId}-${s.successorId ?? 'none'}-${i}`,
})

const LEARNING_COLUMNS: Column[] = [
  C('employeeId', 'Employee ID'),
  C('name', 'Name'),
  C('department', 'Department'),
  C('location', 'Location'),
  C('course', 'Course'),
  C('category', 'Category'),
  C('required', 'Required'),
  C('assignedDate', 'Assigned', { format: 'date' }),
  C('dueDate', 'Due', { format: 'date' }),
  C('completedDate', 'Completed', { format: 'date' }),
  C('state', 'Status'),
]
function learningRow(ctx: DrillContext, l: LearningRecord, i: number): Row {
  const state = l.completedDate
    ? l.dueDate && l.completedDate > l.dueDate
      ? 'Completed late'
      : 'Completed'
    : l.dueDate && l.dueDate < ctx.asOf
      ? 'Overdue'
      : 'Open'
  return {
    employeeId: l.employeeId,
    ...personCols(ctx, l.employeeId),
    course: l.course,
    category: l.category,
    required: l.required ? 'Yes' : 'No',
    assignedDate: l.assignedDate,
    dueDate: l.dueDate ?? null,
    completedDate: l.completedDate ?? null,
    state,
    [PERSON_KEY]: l.employeeId,
    [ROW_KEY]: `${l.employeeId}-${l.course}-${l.assignedDate}-${i}`,
  }
}

const COMP_COLUMNS: Column[] = [
  C('employeeId', 'Employee ID'),
  C('name', 'Name'),
  C('department', 'Department'),
  C('level', 'Level'),
  C('location', 'Location'),
  C('compaRatio', 'Compa-ratio', { format: 'num2' }),
  C('penetration', 'Range position', { format: 'pct0' }),
  C('meritPct', 'Merit', { format: 'pct' }),
  C('currency', 'Currency'),
  C('baseSalary', 'Base salary', { format: 'int', pay: true }),
  C('rangeMid', 'Range midpoint', { format: 'int', pay: true }),
  C('lastIncreaseDate', 'Last increase', { format: 'date' }),
]
const compRow = (ctx: DrillContext, c: CompRecord): Row => ({
  employeeId: c.employeeId,
  ...personCols(ctx, c.employeeId),
  compaRatio: c.rangeMid > 0 ? c.baseSalary / c.rangeMid : null,
  penetration: c.rangeMax > c.rangeMin ? (c.baseSalary - c.rangeMin) / (c.rangeMax - c.rangeMin) : null,
  meritPct: c.meritPct ?? null,
  currency: c.currency,
  baseSalary: c.baseSalary,
  rangeMid: c.rangeMid,
  lastIncreaseDate: c.lastIncreaseDate ?? null,
  [PERSON_KEY]: c.employeeId,
  [ROW_KEY]: c.employeeId,
})

/* ───────── dispatch ───────── */

type RowFn<K extends DrillKind> = (ctx: DrillContext, r: DrillRecordMap[K], i: number) => Row

const KINDS: { [K in DrillKind]: { columns: Column[]; row: RowFn<K>; noun: [string, string] } } = {
  employees: { columns: EMPLOYEE_COLUMNS, row: employeeRow, noun: ['person', 'people'] },
  jobChanges: { columns: JOB_CHANGE_COLUMNS, row: jobChangeRow, noun: ['job change', 'job changes'] },
  requisitions: { columns: REQ_COLUMNS, row: reqRow, noun: ['requisition', 'requisitions'] },
  candidates: { columns: CANDIDATE_COLUMNS, row: candidateRow, noun: ['application', 'applications'] },
  cases: { columns: CASE_COLUMNS, row: caseRow, noun: ['case', 'cases'] },
  transactions: { columns: TRANSACTION_COLUMNS, row: transactionRow, noun: ['transaction', 'transactions'] },
  reviews: { columns: REVIEW_COLUMNS, row: reviewRow, noun: ['review', 'reviews'] },
  succession: {
    columns: SUCCESSION_COLUMNS,
    row: successionRow,
    noun: ['succession row', 'succession rows'],
  },
  learning: { columns: LEARNING_COLUMNS, row: learningRow, noun: ['assignment', 'assignments'] },
  comp: { columns: COMP_COLUMNS, row: compRow, noun: ['person', 'people'] },
}

export function drillNoun(kind: DrillKind, n: number): string {
  const [one, many] = KINDS[kind].noun
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/** Display table for a drill: standard columns for the kind, minus hidden ones, plus extras. */
export function buildDrillTable(spec: DrillSpec, ctx: DrillContext): DrillTable {
  const kind = KINDS[spec.kind] as { columns: Column[]; row: RowFn<DrillKind> }
  const hide = new Set(spec.hide ?? [])
  const columns = [...kind.columns.filter((c) => !hide.has(c.key)), ...(spec.extra?.columns ?? [])]
  const values = spec.extra?.values as ((r: unknown) => Record<string, unknown>) | undefined
  const rows = spec.rows.map((r, i) => {
    const base = kind.row(ctx, r as DrillRecordMap[DrillKind], i)
    return values ? { ...base, ...values(r) } : base
  })
  // Drop standard columns that are empty in every row (e.g. exit fields on an active list).
  const used = columns.filter(
    (c) => (spec.extra?.columns ?? []).includes(c) || rows.some((r) => r[c.key] != null && r[c.key] !== ''),
  )
  return { columns: used.length ? used : columns, rows }
}
