/**
 * Turns raw drill rows into display tables: standard, readable columns per record kind, names
 * resolved from the roster, and a hidden person key so a row can open that person's card.
 * Counts that lead to more records drill on their own: a manager's direct reports and org, the
 * applications to a requisition. Pure (no React); tested in records.test.ts.
 */
import { personInLock } from '@/access/records'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import type {
  BudgetLine,
  Candidate,
  CompRecord,
  Employee,
  HiringPlanLine,
  HrCase,
  HrTransaction,
  JobChange,
  LearningRecord,
  OnboardingTask,
  Requisition,
  Review,
  RightToWork,
  SuccessionPlan,
  SurveyItem,
  SurveyResponse,
} from '@/data/schema'
import { caseCategoryByName, LEVEL_LABELS } from '@/data/schema'
import { isActiveAt } from '@/data/scope'
import { daysBetween, formatMonth, hoursBetween } from '@/lib/dates'
import type { Format } from '@/lib/format'
import { tenureYears } from '@/lib/people'
import type { SurveyGroupRow } from '@/lib/surveys'
import { timed } from '@/lib/timing'
import type { DrillSource } from './Drill'
import {
  activeDirects,
  activeOrg,
  directsSpec,
  orgSpec,
  reqActive,
  reqActiveSpec,
  reqApplications,
  reqApplicationsSpec,
} from './related'
import type {
  ActionItemRow,
  ActionOwnerRow,
  DrillKind,
  DrillRecordMap,
  DrillSpec,
  LeaveGroupRow,
} from './types'

/** Hidden keys on every display row. */
export const PERSON_KEY = '__person'
export const ROW_KEY = '__key'
/** Hidden key: the records behind a cell, by column key (a manager's org, a req's applications). */
export const DRILLS_KEY = '__drills'

export type DrillContext = Pick<AnalyticsContext, 'org' | 'asOf' | 'all' | 'showPay'> & {
  /** Work authorization types show per person only while immigration details are on. */
  showImmigration?: boolean
  /** The mode: in Manager mode a successor outside the org shows by readiness only, and rows open only the org. */
  access?: AnalyticsContext['access']
}

export interface DrillTable {
  columns: Column[]
  rows: Record<string, unknown>[]
}

type Row = Record<string, unknown>
type CellDrills = Record<string, DrillSource>

const cellDrills = (r: Row): CellDrills | undefined => r[DRILLS_KEY] as CellDrills | undefined

const reqIndex = new WeakMap<readonly Requisition[], Map<string, Requisition>>()
function reqsById(ctx: DrillContext): Map<string, Requisition> {
  let m = reqIndex.get(ctx.all.requisitions)
  if (!m) {
    m = new Map(ctx.all.requisitions.map((r) => [r.reqId, r]))
    reqIndex.set(ctx.all.requisitions, m)
  }
  return m
}

const candIndex = new WeakMap<readonly Candidate[], Map<string, Candidate>>()
function candidatesById(ctx: DrillContext): Map<string, Candidate> {
  let m = candIndex.get(ctx.all.candidates)
  if (!m) {
    m = new Map(ctx.all.candidates.map((c) => [c.applicationId, c]))
    candIndex.set(ctx.all.candidates, m)
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
  // Shown only when a row in the list has one (empty columns are dropped).
  C('jobFamily', 'Job family'),
  C('jobFunction', 'Job function'),
  C('department', 'Department'),
  C('location', 'Location'),
  // Finance mode's employee lists only (`modeColumns`): the cost center a cost total is cut by.
  C('costCenter', 'Cost center'),
  C('level', 'Level'),
  C('manager', 'Manager'),
  C('directReports', 'Direct reports', { format: 'int' }),
  C('orgSize', 'Org size', { format: 'int' }),
  C('hireDate', 'Hire date', { format: 'date' }),
  C('tenure', 'Tenure', { format: 'years' }),
  C('status', 'Status'),
  C('terminationDate', 'Exit date', { format: 'date' }),
  C('terminationType', 'Exit type'),
  C('terminationReason', 'Exit reason'),
  C('regrettable', 'Regrettable'),
  C('employmentType', 'Worker type'),
]
/** Org counts shown only when the list holds a manager (they are 0 for everyone else). */
const MANAGER_COLUMNS = new Set(['directReports', 'orgSize'])

function employeeRow(ctx: DrillContext, e: Employee): Row {
  const left = !!e.terminationDate && e.terminationDate <= ctx.asOf
  const active = isActiveAt(e, ctx.asOf)
  const directs = active ? activeDirects(ctx, e.employeeId).length : null
  const org = directs ? activeOrg(ctx, e.employeeId).length : directs
  const id = e.employeeId
  return {
    employeeId: e.employeeId,
    name: e.name,
    jobTitle: e.jobTitle,
    jobFamily: e.jobFamily ?? null,
    jobFunction: e.jobFunction ?? null,
    department: e.department,
    location: e.location,
    costCenter: e.costCenter ?? null,
    level: levelText(e.level),
    manager: nameOf(ctx, e.managerId),
    directReports: directs,
    orgSize: org,
    hireDate: e.hireDate,
    tenure: tenureYears(e, ctx.asOf),
    status: left ? 'Left' : active ? 'Active' : 'Not started',
    terminationDate: e.terminationDate ?? null,
    terminationType: e.terminationType ?? null,
    terminationReason: e.terminationReason ?? null,
    regrettable: e.regrettable == null ? null : e.regrettable ? 'Yes' : 'No',
    employmentType: e.employmentType,
    [PERSON_KEY]: id,
    [ROW_KEY]: id,
    ...(directs
      ? {
          [DRILLS_KEY]: {
            directReports: () => directsSpec(ctx, id),
            orgSize: () => orgSpec(ctx, id),
          } satisfies CellDrills,
        }
      : {}),
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
  C('applications', 'Applications', { format: 'int' }),
]
function reqRow(ctx: DrillContext, r: Requisition): Row {
  const end = r.filledDate ?? r.closedDate ?? ctx.asOf
  // Without any candidates loaded the count would read as 0 for every req; leave it blank.
  const apps = ctx.all.candidates.length ? reqApplications(ctx, r.reqId).length : null
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
    applications: apps,
    [PERSON_KEY]: r.hiringManagerId ?? null,
    [ROW_KEY]: r.reqId,
    ...(apps
      ? { [DRILLS_KEY]: { applications: () => reqApplicationsSpec(ctx, r) } satisfies CellDrills }
      : {}),
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
  C('startDate', 'Start date', { format: 'date' }),
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
    startDate: c.startDate ?? null,
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
]
function caseRow(ctx: DrillContext, c: HrCase): Row {
  const cat = caseCategoryByName.get(c.category)
  const target = c.resolutionTargetHours ?? cat?.resolutionHours ?? null
  const hours = c.resolvedAt ? hoursBetween(c.openedAt, c.resolvedAt) : null
  // Employee relations: category level only, and never tied to a named person (privacy rule).
  const er = c.category === 'Employee relations'
  return {
    caseId: c.caseId,
    category: c.category,
    subcategory: er ? null : (c.subcategory ?? null),
    status: c.status,
    priority: c.priority,
    team: c.team,
    assignee: c.assignee ?? null,
    requester: er ? null : nameOf(ctx, c.requesterId),
    openedAt: c.openedAt,
    resolvedAt: c.resolvedAt ?? null,
    hoursToResolve: hours,
    withinTarget: hours == null || target == null ? null : hours <= target ? 'Yes' : 'No',
    // No satisfaction score: it is the HR service survey answer, so a case's score is one
    // person's answer and shows only as a group mean (Listening privacy rules).
    [PERSON_KEY]: er ? null : (c.requesterId ?? null),
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
  C('expectedReturnDate', 'Expected return', { format: 'date' }),
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
    // The leave reason is never shown against a named person (health and family detail): it
    // appears only in grouped counts.
    expectedReturnDate: t.expectedReturnDate ?? null,
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
/**
 * The successor cell. Manager mode: a successor outside the org shows by readiness only, never by
 * name. HRBP modes (docs/ROLES-V2.md 2.7): a successor outside the business unit or region shows
 * by name with their unit or site, as plain text ("Ana Ruiz, Data Center Group"); the row opens
 * the incumbent, never them.
 */
function successorText(ctx: DrillContext, s: SuccessionPlan): string {
  if (!s.successorId) return 'None named'
  if (personInLock(s.successorId, ctx.access)) return nameOf(ctx, s.successorId) ?? 'None named'
  const scope = ctx.access?.scope
  if (scope?.kind === 'unit' || scope?.kind === 'region') {
    const p = ctx.org.byId.get(s.successorId)
    const where = scope.kind === 'unit' ? p?.businessUnit : p?.location
    return [p?.name ?? s.successorId, where].filter(Boolean).join(', ')
  }
  return `Outside the org${s.readiness ? `, ${s.readiness.toLowerCase()}` : ''}`
}

const successionRow = (ctx: DrillContext, s: SuccessionPlan, i: number): Row => ({
  roleId: s.roleId,
  roleTitle: s.roleTitle,
  incumbent: nameOf(ctx, s.incumbentId),
  criticality: s.criticality,
  incumbentRiskOfLoss: s.incumbentRiskOfLoss ?? null,
  successor: successorText(ctx, s),
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

const PLAN_COLUMNS: Column[] = [
  C('period', 'Month'),
  C('businessUnit', 'Business unit'),
  C('department', 'Department'),
  C('location', 'Location'),
  C('level', 'Level'),
  C('jobTitle', 'Job title'),
  C('reqType', 'Req type'),
  C('plannedHires', 'Planned hires', { format: 'int' }),
  C('reqId', 'Req ID'),
  C('reqStatus', 'Req status'),
  C('positionId', 'Position ID'),
  C('planVersion', 'Plan version'),
]
function planRow(ctx: DrillContext, p: HiringPlanLine, i: number): Row {
  const req = p.reqId ? reqsById(ctx).get(p.reqId) : undefined
  return {
    period: p.period ? formatMonth(p.period) : null,
    businessUnit: p.businessUnit,
    department: p.department,
    location: p.location ?? null,
    level: levelText(p.level),
    jobTitle: p.jobTitle ?? null,
    reqType: p.reqType ?? null,
    plannedHires: p.plannedHires,
    reqId: p.reqId ?? null,
    reqStatus: p.reqId ? (req?.status ?? 'Not found') : null,
    positionId: p.positionId ?? null,
    planVersion: p.planVersion ?? null,
    [PERSON_KEY]: req?.hiringManagerId ?? null,
    [ROW_KEY]: `${p.planVersion ?? ''}-${p.period}-${p.positionId ?? p.reqId ?? ''}-${i}`,
    ...(req
      ? {
          [DRILLS_KEY]: {
            reqId: () => ({ kind: 'requisitions', title: `Requisition ${req.reqId}`, rows: [req] }),
          } satisfies CellDrills,
        }
      : {}),
  }
}

/**
 * Where an onboarding task stands at the as-of date: Done, Done late, Overdue, Blocked, In
 * progress, Not started or Not needed.
 */
export function taskState(t: OnboardingTask, asOf: string): string {
  if (t.status === 'Not needed') return 'Not needed'
  if (t.completedDate || t.status === 'Done')
    return t.completedDate && t.dueDate && t.completedDate > t.dueDate ? 'Done late' : 'Done'
  if (t.dueDate && t.dueDate < asOf) return 'Overdue'
  if (t.status === 'Blocked') return 'Blocked'
  return t.status === 'In progress' ? 'In progress' : 'Not started'
}

const TASK_COLUMNS: Column[] = [
  C('person', 'Person'),
  C('department', 'Department'),
  C('location', 'Location'),
  C('startDate', 'Start date', { format: 'date' }),
  C('task', 'Task'),
  C('owner', 'Owner'),
  C('dueDate', 'Due', { format: 'date' }),
  C('completedDate', 'Completed', { format: 'date' }),
  C('state', 'Status'),
  C('daysLate', 'Days late', { format: 'days' }),
  C('processId', 'Process'),
]
function taskRow(ctx: DrillContext, t: OnboardingTask, i: number): Row {
  const e = t.employeeId ? ctx.org.byId.get(t.employeeId) : undefined
  const c = !e && t.applicationId ? candidatesById(ctx).get(t.applicationId) : undefined
  const req = c ? reqsById(ctx).get(c.reqId) : undefined
  const state = taskState(t, ctx.asOf)
  const end = t.completedDate ?? (state === 'Overdue' ? ctx.asOf : null)
  const late = end && t.dueDate ? daysBetween(t.dueDate, end) : null
  return {
    person: e?.name ?? c?.candidateName ?? t.employeeId ?? t.applicationId ?? null,
    department: e?.department ?? req?.department ?? null,
    location: e?.location ?? req?.location ?? null,
    startDate: e?.hireDate ?? c?.startDate ?? null,
    task: t.task,
    owner: t.owner ?? null,
    dueDate: t.dueDate ?? null,
    completedDate: t.completedDate ?? null,
    state,
    // Blank (—) when there is nothing to measure yet: open and not yet due, or no due date.
    daysLate: state === 'Not needed' || late == null ? null : Math.max(0, late),
    processId: t.processId ?? null,
    [PERSON_KEY]: e?.employeeId ?? null,
    [ROW_KEY]: `${t.employeeId ?? t.applicationId ?? ''}-${t.task}-${i}`,
  }
}

const RTW_COLUMNS: Column[] = [
  C('employeeId', 'Employee ID'),
  C('name', 'Name'),
  C('department', 'Department'),
  C('location', 'Location'),
  C('authorizationType', 'Authorization type'),
  C('expiryDate', 'Authorization expiry', { format: 'date' }),
  C('daysToExpiry', 'Days to expiry', { format: 'days' }),
  C('reverificationStartedDate', 'Reverification started', { format: 'date' }),
  C('i9Section1Date', 'I-9 Section 1', { format: 'date' }),
  C('i9Section2Date', 'I-9 Section 2', { format: 'date' }),
  C('exportLicenseRequired', 'Export license required'),
  C('exportLicenseStatus', 'License status'),
  C('exportLicenseExpiry', 'License expiry', { format: 'date' }),
]
function rtwRow(ctx: DrillContext, r: RightToWork): Row {
  return {
    employeeId: r.employeeId,
    ...personCols(ctx, r.employeeId),
    // Immigration detail: per person only while "Show immigration details" is on.
    authorizationType: ctx.showImmigration ? (r.authorizationType ?? null) : null,
    expiryDate: r.expiryDate ?? null,
    daysToExpiry: r.expiryDate ? daysBetween(ctx.asOf, r.expiryDate) : null,
    reverificationStartedDate: r.reverificationStartedDate ?? null,
    i9Section1Date: r.i9Section1Date ?? null,
    i9Section2Date: r.i9Section2Date ?? null,
    exportLicenseRequired: r.exportLicenseRequired == null ? null : r.exportLicenseRequired ? 'Yes' : 'No',
    exportLicenseStatus: r.exportLicenseStatus ?? null,
    exportLicenseExpiry: r.exportLicenseExpiry ?? null,
    [PERSON_KEY]: r.employeeId,
    [ROW_KEY]: r.employeeId,
  }
}

/**
 * Survey answers, for the Data room's quality checks only: which survey, wave and item a row
 * belongs to. Never the respondent, the date, the score or the subject, so no row can be tied to
 * a person. Survey numbers in views drill to the surveyGroups kind instead.
 */
const RESPONSE_COLUMNS: Column[] = [
  C('survey', 'Survey'),
  C('wave', 'Wave'),
  C('item', 'Item'),
  C('driver', 'Driver'),
  C('scale', 'Scale'),
  C('touchpoint', 'Touchpoint'),
]
const responseRow = (_ctx: DrillContext, r: SurveyResponse, i: number): Row => ({
  survey: r.survey,
  wave: r.wave,
  item: r.item,
  driver: r.driver ?? null,
  scale: r.scale,
  touchpoint: r.touchpoint ?? null,
  [PERSON_KEY]: null,
  [ROW_KEY]: `response-${i}`,
})

const BUDGET_COLUMNS: Column[] = [
  C('period', 'Month'),
  C('businessUnit', 'Business unit'),
  C('department', 'Department'),
  C('costCenter', 'Cost center'),
  C('budgetHeadcount', 'Budget headcount', { format: 'int' }),
  // One line's cost can be one small team's pay: amounts follow the pay switch, never Finance.
  C('budgetCost', 'Budget cost', { format: 'int', pay: true }),
  C('currency', 'Currency'),
  C('planVersion', 'Plan version'),
]
const budgetRow = (_ctx: DrillContext, b: BudgetLine, i: number): Row => ({
  period: b.period ? formatMonth(b.period) : null,
  businessUnit: b.businessUnit,
  department: b.department ?? null,
  costCenter: b.costCenter ?? null,
  budgetHeadcount: b.budgetHeadcount,
  budgetCost: b.budgetCost ?? null,
  currency: b.budgetCost == null ? null : (b.currency ?? 'USD'),
  planVersion: b.planVersion ?? null,
  [PERSON_KEY]: null,
  [ROW_KEY]: `budget-${b.planVersion ?? ''}-${b.period}-${b.businessUnit}-${b.department ?? ''}-${b.costCenter ?? ''}-${i}`,
})

const ITEM_COLUMNS: Column[] = [
  C('item', 'Item'),
  C('survey', 'Survey'),
  C('driver', 'Driver'),
  C('text', 'Question'),
  C('scale', 'Scale'),
  C('target', 'Target', { format: 'num1' }),
]
const itemRow = (_ctx: DrillContext, r: SurveyItem, i: number): Row => ({
  item: r.item,
  survey: r.survey ?? 'Every survey',
  driver: r.driver,
  text: r.text ?? null,
  scale: r.scale ?? null,
  target: r.target ?? null,
  [PERSON_KEY]: null,
  [ROW_KEY]: `${r.survey ?? ''}-${r.item}-${i}`,
})

/** Grouped survey results: counts and scores per group, never one person's answers. */
const SURVEY_GROUP_COLUMNS: Column[] = [
  C('survey', 'Survey'),
  C('wave', 'Wave'),
  C('groupBy', 'Grouped by'),
  C('group', 'Group'),
  C('driver', 'Driver'),
  C('item', 'Item'),
  C('respondents', 'Respondents', { format: 'int' }),
  C('mean', 'Mean score', { format: 'num2' }),
  C('scale', 'Scale'),
  C('topBox', 'Top box', { format: 'pct0' }),
  C('nps', 'NPS', { format: 'int' }),
  C('shown', 'Shown'),
]
const surveyGroupRow = (_ctx: DrillContext, g: SurveyGroupRow, i: number): Row => ({
  survey: g.survey,
  wave: g.wave ?? 'Several waves',
  groupBy: g.groupBy,
  group: g.group,
  driver: g.driver,
  item: g.item,
  respondents: g.respondents,
  mean: g.suppressed ? null : g.mean,
  scale: g.scale === 'mixed' ? 'Mixed' : g.scale,
  topBox: g.suppressed ? null : g.topBox,
  nps: g.suppressed ? null : g.nps,
  shown: g.suppressed ? 'Hidden to protect anonymity' : 'Yes',
  [PERSON_KEY]: null,
  [ROW_KEY]: `${g.survey}-${g.wave ?? ''}-${g.group}-${g.driver ?? ''}-${g.item ?? ''}-${i}`,
})

/** Grouped leave numbers cut by reason: counts and one measure per group, never a named person. */
const LEAVE_GROUP_COLUMNS: Column[] = [
  C('groupBy', 'Grouped by'),
  C('group', 'Group'),
  C('reason', 'Leave reason'),
  C('people', 'People', { format: 'int' }),
  C('leaves', 'Leaves', { format: 'int' }),
  C('measure', 'Measure'),
  C('value', 'Value', { format: (r: Row) => (r.valueFormat as Format | undefined) ?? 'num1' }),
  C('shown', 'Shown'),
]
const leaveGroupRow = (_ctx: DrillContext, g: LeaveGroupRow, i: number): Row => ({
  groupBy: g.groupBy,
  group: g.group,
  reason: g.reason,
  people: g.suppressed ? null : g.people,
  leaves: g.suppressed ? null : g.leaves,
  measure: g.measure,
  value: g.suppressed ? null : g.value,
  valueFormat: g.format,
  shown: g.suppressed ? 'Hidden to protect anonymity' : 'Yes',
  [PERSON_KEY]: null,
  [ROW_KEY]: `${g.groupBy}-${g.group}-${g.reason ?? ''}-${i}`,
})

/**
 * Action center items: what is open, who it waits on, when it is due and the view it comes from.
 * The About cell opens the item's own records; a row opens the person the item is about.
 */
const ACTION_COLUMNS: Column[] = [
  C('severityLabel', 'Severity'),
  C('what', 'What is open'),
  C('subject', 'About'),
  C('owner', 'Waiting on'),
  C('ownerGroup', 'Owner group'),
  C('due', 'Due date', { format: 'date' }),
  C('dueText', 'Due'),
  C('from', 'From'),
  C('status', 'Status'),
]
const actionRow = (_ctx: DrillContext, r: ActionItemRow, i: number): Row => ({
  severityLabel: r.severityLabel,
  what: r.what,
  subject: r.subject,
  owner: r.owner,
  ownerGroup: r.ownerGroup,
  due: r.due,
  dueText: r.dueText,
  from: r.from,
  status: r.status,
  ...(r.subjectDrill ? { [DRILLS_KEY]: { subject: r.subjectDrill } satisfies CellDrills } : {}),
  [PERSON_KEY]: r.personId,
  // By position: an employee relations item's id carries its case ID, which never reaches a page.
  [ROW_KEY]: `item-${i}`,
})

/** Action center owners: one row per person or team, with the count of items that wait on them. */
const ACTION_OWNER_COLUMNS: Column[] = [
  C('owner', 'Waiting on'),
  C('ownerGroup', 'Owner group'),
  C('items', 'Open items', { format: 'int' }),
  C('overdue', 'Overdue', { format: 'int' }),
  C('critical', 'Critical', { format: 'int' }),
]
const actionOwnerRow = (_ctx: DrillContext, r: ActionOwnerRow, i: number): Row => ({
  owner: r.owner,
  ownerGroup: r.ownerGroup,
  items: r.items,
  overdue: r.overdue,
  critical: r.critical,
  ...(r.itemsDrill ? { [DRILLS_KEY]: { items: r.itemsDrill } satisfies CellDrills } : {}),
  [PERSON_KEY]: r.personId,
  [ROW_KEY]: `owner-${i}`,
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
  hiringPlan: { columns: PLAN_COLUMNS, row: planRow, noun: ['plan line', 'plan lines'] },
  onboardingTasks: { columns: TASK_COLUMNS, row: taskRow, noun: ['task', 'tasks'] },
  rightToWork: { columns: RTW_COLUMNS, row: rtwRow, noun: ['person', 'people'] },
  surveyResponses: { columns: RESPONSE_COLUMNS, row: responseRow, noun: ['answer', 'answers'] },
  surveyItems: { columns: ITEM_COLUMNS, row: itemRow, noun: ['survey item', 'survey items'] },
  budget: { columns: BUDGET_COLUMNS, row: budgetRow, noun: ['budget line', 'budget lines'] },
  surveyGroups: { columns: SURVEY_GROUP_COLUMNS, row: surveyGroupRow, noun: ['group', 'groups'] },
  leaveGroups: { columns: LEAVE_GROUP_COLUMNS, row: leaveGroupRow, noun: ['group', 'groups'] },
  actionItems: { columns: ACTION_COLUMNS, row: actionRow, noun: ['item', 'items'] },
  actionOwners: { columns: ACTION_OWNER_COLUMNS, row: actionOwnerRow, noun: ['owner', 'owners'] },
}

/** Every drill kind, in the order the records panel knows them (the Developer inventory and the access matrix list them). */
export const DRILL_KINDS = Object.keys(KINDS) as DrillKind[]

/** A kind's standard column label ("Exit reason"), or null (the Security center names `column:` surfaces with it). */
export const standardColumnLabel = (kind: string, key: string): string | null =>
  (KINDS as Record<string, { columns: Column[] }>)[kind]?.columns.find((c) => c.key === key)?.label ?? null

export function drillNoun(kind: DrillKind, n: number): string {
  const [one, many] = KINDS[kind].noun
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/**
 * A count a view adds as an extra column that a shared definition can open. The view's column
 * stands in for a standard one (which is then hidden). It opens the shared list for a row only
 * when its count equals the shared count there, so the list is exactly what was counted; a view
 * with its own definition sets `drill` on its column instead.
 */
interface ExtraLink<K extends DrillKind> {
  key: string
  standard: string
  link?: (ctx: DrillContext, record: DrillRecordMap[K], value: unknown) => DrillSource
}

const whenCount = (value: unknown, n: number, src: DrillSource): DrillSource =>
  typeof value === 'number' && value > 0 && value === n ? src : null

const EXTRA_LINKS: { [K in DrillKind]?: readonly ExtraLink<K>[] } = {
  employees: [
    {
      key: 'directs',
      standard: 'directReports',
      link: (ctx, e, v) =>
        whenCount(v, activeDirects(ctx, e.employeeId).length, () => directsSpec(ctx, e.employeeId)),
    },
    {
      key: 'totalOrg',
      standard: 'orgSize',
      link: (ctx, e, v) =>
        whenCount(v, activeOrg(ctx, e.employeeId).length, () => orgSpec(ctx, e.employeeId)),
    },
    // The org chart's own counts (they may describe a reorg scenario): no shared list.
    { key: 'orgDirects', standard: 'directReports' },
    { key: 'orgTotal', standard: 'orgSize' },
  ],
  requisitions: [
    {
      key: 'activeCandidates',
      standard: 'applications',
      link: (ctx, r, v) => whenCount(v, reqActive(ctx, r.reqId).length, () => reqActiveSpec(ctx, r)),
    },
    { key: 'lackingNextStep', standard: 'applications' },
  ],
}

/**
 * Finance mode's employee list (docs/ROLES-V2.md 3.2): the people a headcount or cost total counts,
 * with no ratings, exits or pay.
 */
const FINANCE_EMPLOYEE_COLUMNS: ReadonlySet<string> = new Set([
  'employeeId',
  'name',
  'costCenter',
  'department',
  'level',
  'location',
  'employmentType',
  'hireDate',
])

/**
 * Standard columns the mode leaves out of a kind (docs/ROLES-V2.md 3.2, 4.2): every column whose
 * `column:<kind>.<key>` surface the mode hides (Manager: a leaver's exit reason and regrettable
 * flag, a candidate's reason; the policy tables' `hiddenColumns`); Finance's employee lists keep
 * `FINANCE_EMPLOYEE_COLUMNS`; a mode that hides exit reasons (`hrbp.attrition.exitReasons`) or
 * regretted attrition (`hrbp.attrition.regretted`) lists no leaver's exit reason or regrettable
 * flag either; the cost center shows in Finance only.
 */
export function modeHiddenColumns(kind: DrillKind, access: DrillContext['access']): ReadonlySet<string> {
  const keys = KINDS[kind].columns.map((c) => c.key)
  // Only a listed kind's columns are asked: where the kind itself is hidden its records never list.
  const out = new Set<string>()
  if (access?.can(`drill:${kind}`)) for (const k of keys) if (!access.can(`column:${kind}.${k}`)) out.add(k)
  if (kind !== 'employees') return out.size ? out : NO_KEYS
  if (access?.mode === 'finance') {
    for (const k of keys) if (!FINANCE_EMPLOYEE_COLUMNS.has(k)) out.add(k)
    return out
  }
  out.add('costCenter')
  if (
    access &&
    (!access.can('metric:hrbp.attrition.exitReasons') || !access.can('metric:hrbp.attrition.regretted'))
  ) {
    out.add('terminationReason')
    out.add('regrettable')
  }
  return out
}
const NO_KEYS: ReadonlySet<string> = new Set()

/** Display table for a drill: standard columns for the kind, minus hidden ones, plus extras. */
export const buildDrillTable = (spec: DrillSpec, ctx: DrillContext): DrillTable =>
  timed(`census:drill:${spec.kind}`, () => drillTableOf(spec, ctx))

function drillTableOf(spec: DrillSpec, ctx: DrillContext): DrillTable {
  const kind = KINDS[spec.kind] as { columns: Column[]; row: RowFn<DrillKind> }
  const extraCols = spec.extra?.columns ?? []
  const extraKeys = new Set(extraCols.map((c) => c.key))
  const links = ((EXTRA_LINKS[spec.kind] ?? []) as readonly ExtraLink<DrillKind>[]).filter((l) =>
    extraKeys.has(l.key),
  )
  const hide = new Set([
    ...(spec.hide ?? []),
    ...links.map((l) => l.standard),
    ...modeHiddenColumns(spec.kind, ctx.access),
  ])
  // A view's extra column with a standard column's key takes its place.
  const columns = [...kind.columns.filter((c) => !hide.has(c.key) && !extraKeys.has(c.key)), ...extraCols]
  const values = spec.extra?.values as ((r: unknown) => Record<string, unknown>) | undefined
  const rows = spec.rows.map((r, i) => {
    const record = r as DrillRecordMap[DrillKind]
    const base = kind.row(ctx, record, i)
    const row = values ? { ...base, ...values(r) } : base
    let drills = cellDrills(row)
    for (const l of links) {
      const src = l.link?.(ctx, record, row[l.key])
      if (src) drills = { ...drills, [l.key]: src }
    }
    if (drills) row[DRILLS_KEY] = drills
    return row
  })
  // Drop standard columns that are empty in every row (e.g. exit fields on an active list), and
  // the org counts when nobody listed manages anyone.
  const used = columns.filter((c) => {
    if (extraCols.includes(c)) return true
    if (MANAGER_COLUMNS.has(c.key))
      return rows.some((r) => typeof r[c.key] === 'number' && (r[c.key] as number) > 0)
    return rows.some((r) => r[c.key] != null && r[c.key] !== '')
  })
  // A cell with records behind it opens them; a column's own drill (from the view) wins.
  const linked = (used.length ? used : columns).map((c) =>
    c.drill || !rows.some((r) => cellDrills(r)?.[c.key])
      ? c
      : { ...c, drill: (r: Row) => cellDrills(r)?.[c.key] ?? null },
  )
  return { columns: linked, rows }
}

/**
 * The person a display row opens, when they are in the roster; null when the row opens nothing.
 * In Manager mode only people inside the manager's org open (docs/ROLES.md, 3.12).
 */
export function rowPerson(
  ctx: Pick<DrillContext, 'org'> & Pick<DrillContext, 'access'>,
  row: Row,
): string | null {
  const id = row[PERSON_KEY]
  return typeof id === 'string' && id && ctx.org.byId.has(id) && personInLock(id, ctx.access) ? id : null
}

const ROW_OPENS: Record<DrillKind, string> = {
  employees: 'Select a row to open the person.',
  jobChanges: 'Select a row to open the person.',
  requisitions: 'Select a row to open the hiring manager.',
  candidates: 'Select a hire who has started to open their employee card.',
  cases: 'Select a row to open the person who raised the case.',
  transactions: 'Select a row to open the employee.',
  reviews: 'Select a row to open the person.',
  succession: 'Select a row to open the incumbent.',
  learning: 'Select a row to open the person.',
  comp: 'Select a row to open the person.',
  hiringPlan: 'Select a row to open the hiring manager of its requisition.',
  onboardingTasks: 'Select a row to open the person, once they are in the roster.',
  rightToWork: 'Select a row to open the person.',
  surveyResponses: '',
  surveyItems: '',
  budget: '',
  surveyGroups: '',
  leaveGroups: '',
  actionItems: 'Select a row to open the person it is about, when it names one.',
  actionOwners: 'Select a row to open the person, when the owner is one.',
}

/**
 * What the Developer page's inventory lists about a drill kind: its standard columns, its noun and
 * what selecting a row opens.
 */
export function drillKindFacts(kind: DrillKind): {
  columns: readonly Column[]
  noun: readonly [string, string]
  rowOpens: string
} {
  return { columns: KINDS[kind].columns, noun: KINDS[kind].noun, rowOpens: ROW_OPENS[kind] }
}

/** What selecting a row does, and whether counts in the table open their own records. */
export function drillTableHint(
  kind: DrillKind,
  opts: { rowsOpen: boolean; cellsOpen: boolean },
): string | null {
  const parts = [
    opts.rowsOpen ? ROW_OPENS[kind] || null : null,
    opts.cellsOpen ? 'Underlined counts open their own records.' : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}
