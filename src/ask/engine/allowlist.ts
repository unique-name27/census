/**
 * The fields `query_records` may read (docs/ASK.md, Allowlist), built from the schema's field
 * definitions (`DATASETS` in src/data/schema.ts) plus an explicit deny list.
 *
 * Allowed: categorical fields (enum, level, and string fields that hold categories), dates,
 * booleans, and number and percent fields that are not pay, plus a few ratios and durations
 * derived from them (compa-ratio, tenure, hours to resolve). Never allowed: `id` fields, person
 * name fields, `money` and `pay: true` fields, free text and job titles, the survey respondent key.
 * Grouping by a manager, recruiter, hiring manager, coordinator, HR business partner or case
 * assignee is allowed and returns person tokens. Right to work (every field) and leave reasons are
 * grouped counts only. Fields that are one person's answer, rating or pay ratio give means and
 * medians over groups at the anonymity minimum and nothing finer; a filter or grouping on one
 * person's rating or assessment (potential, readiness, risk of loss) hides small counts.
 *
 * Datasets about people also offer `org.*` fields: the business unit, department, location, level,
 * job function and manager of the person the row is about (the requisition's for candidates).
 */
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import {
  type Candidate,
  type CompRecord,
  DATASETS,
  type DatasetKey,
  type Employee,
  type FieldDef,
  type HrCase,
  type ISODate,
  type Requisition,
} from '@/data/schema'
import { isActiveAt } from '@/data/scope'
import { hoursBetween } from '@/lib/dates'
import { tenureYears } from '@/lib/people'
import { type RespondentRecord, respondentIndex } from '@/lib/surveys'

/** A schema row read by name. */
export type Row = Readonly<Record<string, unknown>>

export type FieldKind = 'category' | 'person' | 'date' | 'boolean' | 'number'

/** Lookups across datasets for joined fields (built once per loaded data). */
export interface Joins {
  asOf: ISODate
  employee(id: unknown): Employee | undefined
  requisition(id: unknown): Requisition | undefined
  candidate(applicationId: unknown): Candidate | undefined
  respondent(key: unknown): RespondentRecord
}

export interface QueryField {
  /** The name Claude uses: the schema key, or `org.department` for a joined field. */
  name: string
  label: string
  kind: FieldKind
  /** The schema fields it reads, for the data standard. */
  uses: readonly FieldRef[]
  get(row: Row, j: Joins): unknown
  /** Person fields: the value is an employee ID or a name. */
  personBy?: 'id' | 'name'
  /** Grouped counts only: no other measure, counts under the minimum hidden, no records listed. */
  countsOnly?: boolean
  /** One person's answer, rating, assessment or pay ratio: mean and median only; a filter or grouping on it hides small counts. */
  sensitive?: boolean
  /** Grouping by it needs the survey manager-cut minimum. */
  managerCut?: boolean
  /** Employee relations cases are left out whenever it is used. */
  hidesEr?: boolean
  /** The unit of a number: 'fraction' values are shares (0.12 = 12%). */
  unit?: 'fraction' | 'ratio' | 'hours' | 'years' | 'count' | 'score'
}

export interface QueryDataset {
  key: DatasetKey
  label: string
  /** "employee", "application" ... for counts in words. */
  noun: readonly [string, string]
  fields: readonly QueryField[]
  /** The person a row is about (distinct people and the anonymity minimum); null for datasets about no one. */
  person: ((row: Row, j: Joins) => string | null) | null
  /** Fields that exist but are never available, with the reason. */
  denied: ReadonlyMap<string, string>
  /** Grouped counts only, whatever field is used (right to work). */
  countsOnly: boolean
}

/* ───────────── what is never allowed ───────────── */

export const DENY_REASON = {
  id: 'IDs are never sent to Claude.',
  name: 'Names are never sent to Claude. Group by the field instead to get person tokens.',
  pay: 'Pay amounts are never sent to Claude. Ratios such as compaRatio are available.',
  text: 'Free text and job titles are not available in Ask: they can identify one person.',
  respondent: 'Survey respondents are never identified; survey results are grouped only.',
} as const

/** Person name fields: never values, only groups (as tokens) when listed in PERSON_FIELDS. */
const NAME_FIELDS: ReadonlySet<string> = new Set([
  'employees.name',
  'candidates.candidateName',
  'requisitions.hiringManager',
  'requisitions.recruiter',
  'candidates.recruiter',
  'candidates.coordinator',
  'employees.hrbp',
  'cases.assignee',
])

/** Free text and titles: they can name or single out one person. */
const TEXT_FIELDS: ReadonlySet<string> = new Set([
  'employees.jobTitle',
  'requisitions.jobTitle',
  'hiringPlan.jobTitle',
  'succession.roleTitle',
  'surveyItems.text',
])

/** Groupable people: a manager by employee ID, the others by name. */
const PERSON_FIELDS: Readonly<Record<string, 'id' | 'name'>> = {
  'employees.managerId': 'id',
  'employees.hrbp': 'name',
  'requisitions.hiringManager': 'name',
  'requisitions.recruiter': 'name',
  'candidates.recruiter': 'name',
  'candidates.coordinator': 'name',
  'cases.assignee': 'name',
}

/**
 * One person's answer, rating, assessment or pay ratio. Numbers give means and medians only; a
 * filter or a grouping on any of them hides small counts (a team of one with "Low" potential).
 */
const SENSITIVE: ReadonlySet<string> = new Set([
  'reviews.potential',
  'succession.readiness',
  'succession.incumbentRiskOfLoss',
  'reviews.rating',
  'reviews.preCalibrationRating',
  'cases.csat',
  'surveyResponses.score',
  'comp.targetBonusPct',
  'comp.bonusPayoutPct',
  'comp.lastIncreasePct',
  'comp.meritPct',
  'comp.promotionPct',
])

/** Grouped counts only (leave reasons; immigration fields are flagged in the schema). */
const COUNTS_ONLY: ReadonlySet<string> = new Set(['transactions.leaveReason'])

/**
 * Datasets given as grouped counts only, whatever field is used. Every right to work field says
 * something about a person's immigration status (an expiry date means a time-limited permit; a
 * deemed export license means a foreign national), so the whole dataset is immigration in Ask.
 */
const COUNTS_ONLY_DATASETS: ReadonlySet<DatasetKey> = new Set(['rightToWork'])

/** Using these on HR cases leaves employee relations cases out (counts by category only). */
const HIDES_ER: ReadonlySet<string> = new Set(['cases.subcategory', 'cases.assignee', 'cases.location'])

const UNITS: Readonly<Record<string, QueryField['unit']>> = {
  'cases.responseTargetHours': 'hours',
  'cases.resolutionTargetHours': 'hours',
  'cases.csat': 'score',
  'reviews.rating': 'score',
  'reviews.preCalibrationRating': 'score',
  'surveyResponses.score': 'score',
  'surveyItems.target': 'score',
  'learning.hours': 'hours',
  'requisitions.openings': 'count',
  'hiringPlan.plannedHires': 'count',
}

/* ───────────── building the list ───────────── */

const ref = (dataset: DatasetKey, field: string): FieldRef => `${dataset}.${field}`

const dateOf = (v: unknown): string | null =>
  typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null

function fromSchema(dataset: DatasetKey, f: FieldDef): QueryField | string {
  const r = `${dataset}.${f.key}`
  const person = PERSON_FIELDS[r]
  if (f.pay || f.type === 'money') return DENY_REASON.pay
  if (TEXT_FIELDS.has(r)) return DENY_REASON.text
  if (r === 'surveyResponses.respondentKey') return DENY_REASON.respondent
  const base = { name: f.key, label: f.label, uses: [ref(dataset, f.key)] as FieldRef[] }
  if (person) {
    if (r === 'requisitions.hiringManager')
      // The hiring manager's employee ID when there is one (one person, one token), else the name.
      return {
        ...base,
        kind: 'person',
        personBy: 'name',
        uses: [ref(dataset, 'hiringManager'), ref(dataset, 'hiringManagerId')],
        get: (row) => row.hiringManagerId || row.hiringManager || null,
      }
    return {
      ...base,
      label: r === 'employees.managerId' ? 'Manager' : f.label,
      kind: 'person',
      personBy: person,
      ...(HIDES_ER.has(r) ? { hidesEr: true } : {}),
      get: (row) => row[f.key] ?? null,
    }
  }
  if (NAME_FIELDS.has(r)) return DENY_REASON.name
  if (f.type === 'id') return DENY_REASON.id
  const flags = {
    ...(f.immigration || COUNTS_ONLY.has(r) || COUNTS_ONLY_DATASETS.has(dataset) ? { countsOnly: true } : {}),
    ...(SENSITIVE.has(r) ? { sensitive: true } : {}),
    ...(HIDES_ER.has(r) ? { hidesEr: true } : {}),
  }
  switch (f.type) {
    case 'date':
    case 'datetime':
      return { ...base, ...flags, kind: 'date', get: (row) => dateOf(row[f.key]) }
    case 'boolean':
      return {
        ...base,
        ...flags,
        kind: 'boolean',
        get: (row) => (typeof row[f.key] === 'boolean' ? row[f.key] : null),
      }
    case 'number':
    case 'percent':
      return {
        ...base,
        ...flags,
        kind: 'number',
        unit: f.type === 'percent' ? 'fraction' : (UNITS[r] ?? undefined),
        get: (row) => (typeof row[f.key] === 'number' && Number.isFinite(row[f.key]) ? row[f.key] : null),
      }
    default:
      return {
        ...base,
        ...flags,
        kind: 'category',
        get: (row) => {
          const v = row[f.key]
          return typeof v === 'string' && v.trim() ? v : null
        },
      }
  }
}

/** Ratios and durations computed from a row; they read the row's fields, never return an amount. */
function derived(dataset: DatasetKey): QueryField[] {
  switch (dataset) {
    case 'employees':
      return [
        {
          name: 'active',
          label: 'Active on the as-of date',
          kind: 'boolean',
          uses: ['employees.hireDate', 'employees.terminationDate'],
          get: (row, j) => isActiveAt(row as unknown as Employee, j.asOf),
        },
        {
          name: 'tenureYears',
          label: 'Tenure (years, to the as-of date or the exit)',
          kind: 'number',
          unit: 'years',
          uses: ['employees.hireDate', 'employees.terminationDate'],
          get: (row, j) => {
            const e = row as unknown as Employee
            return e.hireDate && e.hireDate <= j.asOf ? tenureYears(e, j.asOf) : null
          },
        },
      ]
    case 'comp': {
      const positive = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
      return [
        {
          name: 'compaRatio',
          label: 'Compa-ratio (base ÷ range midpoint)',
          kind: 'number',
          unit: 'ratio',
          sensitive: true,
          uses: ['comp.baseSalary', 'comp.rangeMid'],
          get: (row) => {
            const c = row as unknown as CompRecord
            const mid = positive(c.rangeMid)
            return mid != null && typeof c.baseSalary === 'number' ? c.baseSalary / mid : null
          },
        },
        {
          name: 'rangePenetration',
          label: 'Range penetration (0 at minimum, 1 at maximum)',
          kind: 'number',
          unit: 'ratio',
          sensitive: true,
          uses: ['comp.baseSalary', 'comp.rangeMin', 'comp.rangeMax'],
          get: (row) => {
            const c = row as unknown as CompRecord
            const min = positive(c.rangeMin)
            const max = positive(c.rangeMax)
            return min != null && max != null && max > min && typeof c.baseSalary === 'number'
              ? (c.baseSalary - min) / (max - min)
              : null
          },
        },
      ]
    }
    case 'cases':
      return [
        {
          name: 'responseHours',
          label: 'Hours to first response',
          kind: 'number',
          unit: 'hours',
          uses: ['cases.openedAt', 'cases.firstResponseAt'],
          get: (row) => {
            const c = row as unknown as HrCase
            return c.openedAt && c.firstResponseAt ? hoursBetween(c.openedAt, c.firstResponseAt) : null
          },
        },
        {
          name: 'resolutionHours',
          label: 'Hours to resolve',
          kind: 'number',
          unit: 'hours',
          uses: ['cases.openedAt', 'cases.resolvedAt'],
          get: (row) => {
            const c = row as unknown as HrCase
            return c.openedAt && c.resolvedAt ? hoursBetween(c.openedAt, c.resolvedAt) : null
          },
        },
      ]
    default:
      return []
  }
}

/** Whose org a row belongs to: the employee it is about, or a candidate's requisition. */
type OrgOf = (row: Row, j: Joins) => { e?: Employee; r?: Requisition; location?: string | null }

const ORG_OF: Partial<Record<DatasetKey, OrgOf>> = {
  jobChanges: (row, j) => ({ e: j.employee(row.employeeId) }),
  transactions: (row, j) => ({ e: j.employee(row.employeeId) }),
  reviews: (row, j) => ({ e: j.employee(row.employeeId) }),
  learning: (row, j) => ({ e: j.employee(row.employeeId) }),
  comp: (row, j) => ({ e: j.employee(row.employeeId) }),
  rightToWork: (row, j) => ({ e: j.employee(row.employeeId) }),
  succession: (row, j) => ({ e: j.employee(row.incumbentId) }),
  cases: (row, j) => ({ e: j.employee(row.requesterId), location: (row.location as string | null) ?? null }),
  candidates: (row, j) => ({ r: j.requisition(row.reqId) }),
  onboardingTasks: (row, j) => {
    const e = j.employee(row.employeeId)
    if (e) return { e }
    const c = j.candidate(row.applicationId)
    return { r: c ? j.requisition(c.reqId) : undefined }
  },
  surveyResponses: (row, j) => {
    const p = j.respondent(row.respondentKey)
    return { e: p.employee, r: p.requisition }
  },
}

function orgFields(dataset: DatasetKey): QueryField[] {
  const of = ORG_OF[dataset]
  if (!of) return []
  const viaReq = dataset === 'candidates' || dataset === 'onboardingTasks' || dataset === 'surveyResponses'
  const viaEmp = dataset !== 'candidates'
  // Cases: ER cases are left out of any cut by the requester's org. Right to work: counts only.
  const flags = {
    ...(dataset === 'cases' ? { hidesEr: true } : {}),
    ...(COUNTS_ONLY_DATASETS.has(dataset) ? { countsOnly: true } : {}),
  }
  const dims = [
    ['businessUnit', 'Business unit'],
    ['department', 'Department'],
    ['location', 'Location'],
    ['level', 'Level'],
  ] as const
  const out: QueryField[] = dims.map(([k, label]) => ({
    name: `org.${k}`,
    label: `${label} of the person`,
    kind: 'category',
    ...flags,
    uses: [
      ...(viaEmp ? [ref('employees', k)] : []),
      ...(viaReq ? [ref('requisitions', k)] : []),
      ...(dataset === 'cases' && k === 'location' ? [ref('cases', 'location')] : []),
    ],
    get: (row, j) => {
      const o = of(row, j)
      const v = o.e?.[k] ?? o.r?.[k] ?? (k === 'location' ? o.location : null)
      return typeof v === 'string' && v ? v : null
    },
  }))
  if (viaEmp)
    out.push({
      name: 'org.jobFunction',
      label: 'Job function of the person',
      kind: 'category',
      ...flags,
      uses: [ref('employees', 'jobFunction')],
      get: (row, j) => of(row, j).e?.jobFunction ?? null,
    })
  out.push({
    name: 'org.manager',
    label: dataset === 'candidates' ? 'Hiring manager of the requisition' : 'Manager of the person',
    kind: 'person',
    personBy: 'id',
    ...flags,
    ...(dataset === 'surveyResponses' ? { managerCut: true } : {}),
    uses: [
      ...(viaEmp ? [ref('employees', 'managerId')] : []),
      ...(viaReq ? [ref('requisitions', 'hiringManagerId')] : []),
    ],
    get: (row, j) => {
      const o = of(row, j)
      return o.e ? (o.e.managerId ?? null) : (o.r?.hiringManagerId ?? null)
    },
  })
  return out
}

const PERSON_OF: Partial<Record<DatasetKey, (row: Row) => string | null>> = {
  employees: (r) => (r.employeeId as string) ?? null,
  jobChanges: (r) => (r.employeeId as string) ?? null,
  transactions: (r) => (r.employeeId as string) ?? null,
  reviews: (r) => (r.employeeId as string) ?? null,
  learning: (r) => (r.employeeId as string) ?? null,
  comp: (r) => (r.employeeId as string) ?? null,
  rightToWork: (r) => (r.employeeId as string) ?? null,
  succession: (r) => (r.incumbentId as string) ?? null,
  cases: (r) => (r.requesterId as string) || `case:${r.caseId as string}`,
  candidates: (r) => ((r.candidateId || r.applicationId) as string) ?? null,
  onboardingTasks: (r) => ((r.employeeId || r.applicationId) as string) ?? null,
  surveyResponses: (r) => (r.respondentKey as string) ?? null,
}

const NOUNS: Partial<Record<DatasetKey, readonly [string, string]>> = {
  employees: ['person', 'people'],
  jobChanges: ['job change', 'job changes'],
  requisitions: ['requisition', 'requisitions'],
  candidates: ['application', 'applications'],
  cases: ['case', 'cases'],
  transactions: ['transaction', 'transactions'],
  reviews: ['review', 'reviews'],
  succession: ['succession row', 'succession rows'],
  learning: ['assignment', 'assignments'],
  comp: ['comp record', 'comp records'],
  hiringPlan: ['plan line', 'plan lines'],
  onboardingTasks: ['task', 'tasks'],
  rightToWork: ['person', 'people'],
  surveyResponses: ['answer', 'answers'],
  surveyItems: ['survey item', 'survey items'],
}

function buildDataset(key: DatasetKey): QueryDataset {
  const def = DATASETS.find((d) => d.key === key)
  const fields: QueryField[] = []
  const denied = new Map<string, string>()
  for (const f of def?.fields ?? []) {
    const q = fromSchema(key, f)
    if (typeof q === 'string') denied.set(f.key, q)
    else fields.push(q)
  }
  fields.push(...derived(key), ...orgFields(key))
  const person = PERSON_OF[key]
  return {
    key,
    label: def?.label ?? key,
    noun: NOUNS[key] ?? ['row', 'rows'],
    fields,
    person: person ? (row) => person(row) : null,
    denied,
    countsOnly: COUNTS_ONLY_DATASETS.has(key),
  }
}

/** Every dataset `query_records` reads, in schema order. */
export const QUERY_DATASETS: readonly QueryDataset[] = DATASETS.map((d) => buildDataset(d.key))

export const queryDataset = (key: string): QueryDataset | undefined =>
  QUERY_DATASETS.find((d) => d.key === key)

/** The fields a dataset can group by (categories, people, dates and booleans). */
export const groupableFields = (d: QueryDataset): QueryField[] => d.fields.filter((f) => f.kind !== 'number')

/* ───────────── joins ───────────── */

const joinCache = new WeakMap<object, Map<string, Joins>>()

/** Lookups over the loaded data (all rows, not just the scope) for joined fields. */
export function joinsFor(ctx: Pick<AnalyticsContext, 'all' | 'org' | 'asOf'>): Joins {
  let byAsOf = joinCache.get(ctx.all)
  if (!byAsOf) {
    byAsOf = new Map()
    joinCache.set(ctx.all, byAsOf)
  }
  let j = byAsOf.get(ctx.asOf)
  if (!j) {
    const reqs = new Map(ctx.all.requisitions.map((r) => [r.reqId, r]))
    const cands = new Map(ctx.all.candidates.map((c) => [c.applicationId, c]))
    const resp = respondentIndex(ctx.all)
    const org = ctx.org
    j = {
      asOf: ctx.asOf,
      employee: (id) => (typeof id === 'string' ? org.byId.get(id) : undefined),
      requisition: (id) => (typeof id === 'string' ? reqs.get(id) : undefined),
      candidate: (id) => (typeof id === 'string' ? cands.get(id) : undefined),
      respondent: (key) => (typeof key === 'string' ? resp(key) : {}),
    }
    byAsOf.set(ctx.asOf, j)
  }
  return j
}
