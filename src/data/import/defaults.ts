/**
 * Documented defaults: how the importer fills blanks it can fill responsibly. Defaults only ever
 * fill an empty value. Derivations that can't mislead (country from a known site, the SLA from
 * the case category) are counted silently; anything that is a judgment call ("Unknown", "treated
 * as Employee") is also written to the exceptions log.
 */

import { fnv } from '@/lib/stats'
import { isValidScore } from '@/lib/surveys'
import {
  caseCategoryByName,
  type DatasetKey,
  type Employee,
  type ISODate,
  levelIndex,
  onboardingTaskByName,
  STAGE_DATE_FIELD,
  type Stage,
  type SurveyScale,
  siteByLocation,
  TRANSACTION_PROCESS,
  type TransactionType,
} from '../schema'
import { describeRelativeDay, isPendingRelative, resolveRelativeDay } from './relative'
import { normText } from './text'
import type { IssueAction, IssueCode } from './types'

export const UNKNOWN = 'Unknown'
export const DEFAULT_HOURS_PER_YEAR = 2080

/**
 * Approximate USD per unit of local currency, used only when a non-USD row has no FX column.
 * The log names the rate used; supply an "FX to USD" column for exact conversions.
 */
export const REFERENCE_FX_TO_USD: Record<string, number> = {
  USD: 1,
  CAD: 0.73,
  EUR: 1.1,
  GBP: 1.3,
  CHF: 1.15,
  SEK: 0.095,
  NOK: 0.093,
  DKK: 0.147,
  PLN: 0.25,
  ILS: 0.27,
  INR: 0.0118,
  TWD: 0.032,
  CNY: 0.14,
  HKD: 0.128,
  JPY: 0.0068,
  KRW: 0.00074,
  SGD: 0.76,
  MYR: 0.22,
  VND: 0.000039,
  PHP: 0.018,
  THB: 0.029,
  AUD: 0.66,
  MXN: 0.054,
  BRL: 0.18,
}

/** Plain-English list of the defaults, for the Data room's "How gaps are filled" note. */
export const DOCUMENTED_DEFAULTS: Record<DatasetKey, string[]> = {
  employees: [
    'Employment type blank: treated as Employee.',
    'Country blank: taken from the work site when it is a known site.',
    'Name blank: built from first and last name columns, else the employee ID.',
    'Job title, business unit, department or location blank: set to Unknown.',
    'Manager given as a name: matched to a unique person in the roster.',
  ],
  jobChanges: ['Change type blank: inferred from the before and after level, department or manager.'],
  requisitions: [
    'Openings blank: 1.',
    'Req type blank: New. Priority blank: Standard.',
    'Hiring manager ID blank: matched from the hiring manager name when a roster is loaded.',
    'Job title, business unit, department or location blank: set to Unknown.',
  ],
  candidates: [
    'Stage entered date blank: the date of the current stage.',
    'Status blank: Hired when there is a hired date, Rejected when there is an exit date, else Active.',
    'Current stage blank: the latest stage that has a date.',
    'Application ID blank: built from the candidate and the req.',
    'Source blank: set to Unknown.',
  ],
  cases: [
    'Process ID, team and service levels blank: taken from the case category.',
    'Channel blank: set to Unknown. Priority blank: P3. Tier blank: Tier 1.',
  ],
  transactions: ['Process ID blank: taken from the transaction type.', 'Due date blank: the effective date.'],
  reviews: ['Cycle date blank: taken from the cycle name (mid-year is 30 June, annual is 31 December).'],
  succession: [],
  learning: ['Required blank: not required.', 'Category blank: set to Unknown.'],
  comp: [
    'Currency blank: the currency of the employee’s work site, else USD.',
    'FX to USD blank: 1 for USD, else a reference rate named in the log.',
    'Hourly pay: annualized at 2,080 hours when a pay basis column says hourly, or when the base is under 1,000 and no basis column exists.',
  ],
  hiringPlan: [
    'Planned hires blank: 1 (one row per planned role).',
    'Period: a full date or a month such as Nov 2026, kept as the first day of the month.',
    'The same plan line twice: its planned hires are added together.',
  ],
  onboardingTasks: [
    'Task names such as "BGC" or "Laptop" are matched to the Atlas onboarding checklist.',
    'Owner and process ID blank: the checklist’s default for the task.',
    'Status blank: Done when there is a completed date, else Not started.',
    'Due date written as "Day -3": converted using the start date (the hire date, or the accepted candidate’s start date).',
    'Due date blank: the checklist’s default (for example 3 days before the start) when the start date is known.',
    'Rows need an employee ID or an application ID.',
  ],
  rightToWork: [
    'Authorization types are read into broad categories; nationality and citizenship are never kept.',
    'Export license status blank: Not needed when no license is required.',
    'Export license required blank: Yes when a license is pending, approved, denied or expired.',
  ],
  surveyResponses: [
    'Wave blank: the response month.',
    'Scale blank: 0-10 when the score is above 5 or the item asks about recommending, else 1-5.',
    'Agreement words (Strongly agree to Strongly disagree) read as 5 to 1.',
    'A score outside its scale: the row is skipped.',
    'Free-text comments are never imported.',
  ],
  surveyItems: [],
}

/** How a default is reported. */
export type FillMode = 'silent' | 'logged' | 'logged-if-unmapped'

export interface RowFill {
  rec: Record<string, unknown>
  raw: Record<string, unknown>
  /** Fill `key` when it is blank. `what` completes "…, so it was ___" in the log. */
  fill: (key: string, value: unknown, mode?: FillMode, what?: string) => void
  /** Log something about this row's `key` without filling it. */
  note: (key: string, issue: string, code: IssueCode, action: IssueAction) => void
  /**
   * Count a conversion made on this row, reported once for the sheet ("Due dates written as days
   * from the start were converted for 412 rows."). `what` is that sentence's subject and verb.
   */
  tally?: (key: string, what: string) => void
}

export interface SheetContext {
  /** Headers holding first and last names, when the name field itself is unmapped. */
  nameParts: [string, string] | null
  roster: ReadonlyMap<string, Employee> | null
  hourly: { hours: number; basisHeader: string | null } | null
  /** Accepted candidates' expected start dates by application ID (onboarding due dates). */
  starts?: ReadonlyMap<string, ISODate> | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

function composeName(ctx: SheetContext, raw: Record<string, unknown>): string | null {
  if (!ctx.nameParts) return null
  const [f, l] = ctx.nameParts
  const name = [raw[f], raw[l]]
    .filter((x) => x != null && String(x).trim())
    .map((x) => String(x).trim())
    .join(' ')
  return name || null
}

const STAGE_ORDER_DESC: Stage[] = ['Hired', 'Offer', 'Onsite', 'Hiring manager', 'Screen', 'Applied']

/** The furthest stage that has a date. */
export function inferStage(rec: Record<string, unknown>): Stage | null {
  return STAGE_ORDER_DESC.find((s) => str(rec[STAGE_DATE_FIELD[s]])) ?? null
}

export function inferCandidateStatus(rec: Record<string, unknown>): string {
  if (str(rec.hiredDate) || rec.currentStage === 'Hired') return 'Hired'
  if (str(rec.rejectedDate)) return 'Rejected'
  return 'Active'
}

/** "2026 Mid-year" → 2026-06-30; "FY25 annual" → 2025-12-31; "2026 Q1" → 2026-03-31. */
export function cycleDateFromName(cycle: string): string | null {
  const t = normText(cycle)
  const full = /\b(19|20)\d{2}\b/.exec(t)?.[0]
  const fy = /\bfy\s?(\d{2})\b/.exec(t)?.[1]
  const y = full ?? (fy ? `20${fy}` : null)
  if (!y) return null
  const q = /\bq([1-4])\b/.exec(t)?.[1]
  if (q) return `${y}-${['03-31', '06-30', '09-30', '12-31'][+q - 1]}`
  if (/\b(mid|midyear|mid year|h1|first half|half 1)\b/.test(t)) return `${y}-06-30`
  return `${y}-12-31`
}

export function inferChangeType(rec: Record<string, unknown>): string | null {
  const from = str(rec.fromLevel)
  const to = str(rec.toLevel)
  if (from && to && levelIndex(to) > levelIndex(from)) return 'Promotion'
  if (from && to && levelIndex(to) < levelIndex(from)) return 'Demotion'
  if (str(rec.fromDepartment) && str(rec.toDepartment) && rec.fromDepartment !== rec.toDepartment)
    return 'Transfer'
  if (str(rec.fromManagerId) && str(rec.toManagerId) && rec.fromManagerId !== rec.toManagerId)
    return 'Manager change'
  return null
}

const fmt0 = (n: number) => Math.round(n).toLocaleString('en-US')

/** Dataset-specific defaults for one row. */
export function fillDefaults(dataset: DatasetKey, r: RowFill, ctx: SheetContext): void {
  const { rec, fill } = r
  switch (dataset) {
    case 'employees': {
      fill('name', composeName(ctx, r.raw))
      fill('name', rec.employeeId, 'logged', 'filled from the employee ID')
      for (const k of ['jobTitle', 'businessUnit', 'department', 'location'])
        fill(k, UNKNOWN, 'logged', 'set to Unknown')
      const site = str(rec.location) ? siteByLocation.get(rec.location as string) : undefined
      fill('country', site?.country ?? null)
      fill('country', UNKNOWN, 'logged', 'set to Unknown')
      fill('employmentType', 'Employee', 'logged', 'treated as Employee')
      return
    }
    case 'jobChanges':
      fill('changeType', inferChangeType(rec), 'logged', 'inferred from the before and after values')
      return
    case 'requisitions':
      for (const k of ['jobTitle', 'businessUnit', 'department', 'location'])
        fill(k, UNKNOWN, 'logged', 'set to Unknown')
      fill('openings', 1)
      fill('reqType', 'New', 'logged', 'treated as New')
      fill('priority', 'Standard', 'logged', 'treated as Standard')
      return
    case 'candidates': {
      fill('candidateName', composeName(ctx, r.raw))
      fill(
        'candidateName',
        rec.candidateId ?? rec.applicationId,
        'logged',
        'filled from the candidate or application ID',
      )
      fill('currentStage', inferStage(rec), 'logged', 'inferred from the stage dates')
      fill('status', inferCandidateStatus(rec), 'logged', 'inferred from the hired and exit dates')
      const who = str(rec.candidateId) ?? str(rec.candidateName)
      if (who && str(rec.reqId))
        fill(
          'applicationId',
          `APP-${fnv(`${who}|${rec.reqId}|${rec.appliedDate ?? ''}`)
            .toString(36)
            .toUpperCase()}`,
          'logged',
          'built from the candidate and the req',
        )
      fill('source', UNKNOWN, 'logged', 'set to Unknown')
      const stage = str(rec.currentStage) as Stage | null
      if (stage) fill('stageEnteredDate', rec[STAGE_DATE_FIELD[stage]])
      return
    }
    case 'cases': {
      const cat = str(rec.category) ? caseCategoryByName.get(rec.category as string) : undefined
      if (cat) {
        fill('processId', cat.processId)
        fill('team', cat.team)
        fill('responseTargetHours', cat.responseHours)
        fill('resolutionTargetHours', cat.resolutionHours)
      }
      fill('team', UNKNOWN, 'logged', 'set to Unknown')
      fill('channel', UNKNOWN, 'logged', 'set to Unknown')
      fill('priority', 'P3', 'logged', 'treated as P3')
      fill('tier', 'Tier 1', 'logged', 'treated as Tier 1')
      return
    }
    case 'transactions':
      if (str(rec.type)) fill('processId', TRANSACTION_PROCESS[rec.type as TransactionType])
      fill('dueDate', rec.effectiveDate, 'logged', 'set to the effective date')
      return
    case 'reviews':
      if (str(rec.cycle))
        fill('cycleDate', cycleDateFromName(rec.cycle as string), 'logged', 'taken from the cycle name')
      return
    case 'succession':
      return
    case 'learning':
      fill('required', false, 'logged-if-unmapped', 'treated as not required')
      fill('category', UNKNOWN, 'logged', 'set to Unknown')
      return
    case 'comp':
      fillComp(r, ctx)
      return
    case 'hiringPlan': {
      fill('plannedHires', 1, 'logged-if-unmapped', 'set to 1 (one row per planned role)')
      const n = rec.plannedHires
      if (typeof n === 'number' && n < 0) {
        r.note(
          'plannedHires',
          `Planned hires ${n} is below zero, so it was left blank.`,
          'out-of-range',
          'left-blank',
        )
        rec.plannedHires = null
      }
      return
    }
    case 'onboardingTasks':
      fillOnboarding(r, ctx)
      return
    case 'rightToWork': {
      const status = str(rec.exportLicenseStatus)
      if (rec.exportLicenseRequired === false) fill('exportLicenseStatus', 'Not needed')
      if (status) fill('exportLicenseRequired', status !== 'Not needed')
      return
    }
    case 'surveyResponses':
      fillSurvey(r)
      return
    case 'surveyItems':
      return
  }
}

/** When this person starts: the roster's hire date, else the accepted candidate's start date. */
function startOf(rec: Record<string, unknown>, ctx: SheetContext): ISODate | null {
  const emp = str(rec.employeeId) ? ctx.roster?.get(rec.employeeId as string) : undefined
  if (emp?.hireDate) return emp.hireDate
  return (str(rec.applicationId) && ctx.starts?.get(rec.applicationId as string)) || null
}

function fillOnboarding(r: RowFill, ctx: SheetContext): void {
  const { rec, fill } = r
  const def = str(rec.task) ? onboardingTaskByName.get(rec.task as string) : undefined
  if (def) {
    fill('processId', def.processId)
    fill('owner', def.owner, 'logged-if-unmapped', 'taken from the checklist’s owner for the task')
  }
  fill(
    'status',
    str(rec.completedDate) ? 'Done' : 'Not started',
    'logged-if-unmapped',
    'inferred from the completed date',
  )
  const start = startOf(rec, ctx)
  const due = rec.dueDate
  if (isPendingRelative(due)) {
    const rel = due.__relative
    if (start) {
      rec.dueDate = resolveRelativeDay(start, rel)
      r.tally?.(
        'dueDate',
        'due dates written as days from the start (such as "Day -3") were converted with the start date',
      )
    } else {
      rec.dueDate = null
      r.note(
        'dueDate',
        `"${rel.text}" means ${describeRelativeDay(rel)}, but this person's start date is not known, so it was left blank.`,
        'unreadable',
        'left-blank',
      )
    }
  } else if (def && def.dueDay != null && start)
    fill(
      'dueDate',
      resolveRelativeDay(start, { offset: def.dueDay, business: !!def.businessDays }),
      'logged',
      `set to the checklist’s default, ${describeRelativeDay({ offset: def.dueDay, business: !!def.businessDays })}`,
    )
}

/** The scale a blank scale most likely is: 0-10 for scores above 5 or recommend items. */
export function guessScale(rec: Record<string, unknown>): SurveyScale {
  const score = rec.score
  const words = normText(`${rec.item ?? ''} ${rec.driver ?? ''}`)
  if (
    (typeof score === 'number' && (score > 5 || score === 0)) ||
    /\b(?:nps|enps|recommend|ltr|likelihood)\b/.test(words)
  )
    return '0-10'
  return '1-5'
}

function fillSurvey(r: RowFill): void {
  const { rec, fill } = r
  if (str(rec.responseDate))
    fill('wave', (rec.responseDate as string).slice(0, 7), 'logged-if-unmapped', 'set to the response month')
  const scale = guessScale(rec)
  fill('scale', scale, 'logged', `set to ${scale}`)
  const score = rec.score
  const s = str(rec.scale) as SurveyScale | null
  if (typeof score === 'number' && s && !isValidScore(score, s)) {
    r.note('score', `Score ${score} is outside the ${s} scale.`, 'out-of-range', 'left-blank')
    rec.score = null
  }
}

function fillComp(r: RowFill, ctx: SheetContext): void {
  const { rec, fill } = r
  const emp = str(rec.employeeId) ? ctx.roster?.get(rec.employeeId as string) : undefined
  const site = emp ? siteByLocation.get(emp.location) : undefined
  fill('currency', site?.currency ?? null, 'logged-if-unmapped', 'taken from the employee’s work site')
  fill('currency', 'USD', 'logged', 'treated as USD')
  const ccy = str(rec.currency)
  if (ccy === 'USD') fill('fxToUsd', 1)
  else if (ccy && rec.fxToUsd == null) {
    const rate = REFERENCE_FX_TO_USD[ccy]
    if (rate) fill('fxToUsd', rate, 'logged', `set to the reference rate for ${ccy} (${rate} USD)`)
    else
      r.note(
        'fxToUsd',
        `No reference FX rate for ${ccy}; add an FX to USD column to convert this pay.`,
        'unknown-value',
        'left-blank',
      )
  }

  const hourly = ctx.hourly
  const base = rec.baseSalary
  if (!hourly || typeof base !== 'number') return
  const basis = hourly.basisHeader ? normText(r.raw[hourly.basisHeader]) : null
  const isHourly = hourly.basisHeader ? !!basis && basis.startsWith('hour') : base < 1000
  if (!isHourly) return
  for (const k of ['baseSalary', 'rangeMin', 'rangeMid', 'rangeMax', 'marketP50']) {
    const v = rec[k]
    if (typeof v === 'number' && v < 1000) rec[k] = Math.round(v * hourly.hours * 100) / 100
  }
  r.note(
    'baseSalary',
    `Hourly rate ${base} annualized to ${fmt0(rec.baseSalary as number)} (${fmt0(hourly.hours)} hours a year).`,
    'converted',
    'converted',
  )
}
