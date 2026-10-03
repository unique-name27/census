/**
 * Census data model.
 *
 * Ten datasets, each one Excel sheet. Employee-keyed datasets join to the roster by `employeeId`
 * and inherit its org dimensions (business unit, department, location, level, manager chain) for
 * filtering. Dates are ISO strings: `YYYY-MM-DD` for dates and `YYYY-MM-DDTHH:mm` for case
 * timestamps. Enumerated values are stored in the canonical spellings defined below; importers
 * normalize free text into them.
 *
 * Privacy posture (carried over from the user's earlier tools):
 *  - no gender or other protected-class fields anywhere;
 *  - pay amounts are opt-in on screen and in exports (compa-ratio and range position are not);
 *  - any people group smaller than MIN_GROUP is shown as "—" (hidden to protect anonymity).
 */

export type ISODate = string
export type ISODateTime = string

export const MIN_GROUP = 5

/* ───────────────────────── vocabularies ───────────────────────── */

export const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'M1', 'M2', 'E1', 'E2', 'E3'] as const
export type Level = (typeof LEVELS)[number]
export const LEVEL_LABELS: Record<Level, string> = {
  L1: 'L1 Entry',
  L2: 'L2 Developing',
  L3: 'L3 Career',
  L4: 'L4 Senior',
  L5: 'L5 Staff',
  L6: 'L6 Principal',
  M1: 'M1 Manager',
  M2: 'M2 Director',
  E1: 'E1 Vice president',
  E2: 'E2 Senior VP',
  E3: 'E3 Executive',
}
export type LevelTrack = 'Individual contributor' | 'Manager' | 'Executive'
export const levelTrack = (l: Level): LevelTrack =>
  l.startsWith('L') ? 'Individual contributor' : l.startsWith('M') ? 'Manager' : 'Executive'
export const levelIndex = (l: string): number => LEVELS.indexOf(l as Level)

export const REGIONS = ['Americas', 'EMEA', 'APAC'] as const
export type Region = (typeof REGIONS)[number]

/** Work sites. `jurisdiction` ids match the Hire-to-Retire Atlas (us-ca, de, in, ...). */
export interface Site {
  location: string
  country: string
  jurisdiction: string
  region: Region
  currency: string
}
export const SITES: Site[] = [
  {
    location: 'San Jose',
    country: 'United States',
    jurisdiction: 'us-ca',
    region: 'Americas',
    currency: 'USD',
  },
  {
    location: 'Austin',
    country: 'United States',
    jurisdiction: 'us-tx',
    region: 'Americas',
    currency: 'USD',
  },
  {
    location: 'Raleigh',
    country: 'United States',
    jurisdiction: 'us-nc',
    region: 'Americas',
    currency: 'USD',
  },
  {
    location: 'Boulder',
    country: 'United States',
    jurisdiction: 'us-co',
    region: 'Americas',
    currency: 'USD',
  },
  {
    location: 'Seattle',
    country: 'United States',
    jurisdiction: 'us-wa',
    region: 'Americas',
    currency: 'USD',
  },
  { location: 'Toronto', country: 'Canada', jurisdiction: 'ca', region: 'Americas', currency: 'CAD' },
  { location: 'Vancouver', country: 'Canada', jurisdiction: 'ca', region: 'Americas', currency: 'CAD' },
  { location: 'Munich', country: 'Germany', jurisdiction: 'de', region: 'EMEA', currency: 'EUR' },
  { location: 'Haifa', country: 'Israel', jurisdiction: 'il', region: 'EMEA', currency: 'ILS' },
  { location: 'Bengaluru', country: 'India', jurisdiction: 'in', region: 'APAC', currency: 'INR' },
  { location: 'Hsinchu', country: 'Taiwan', jurisdiction: 'tw', region: 'APAC', currency: 'TWD' },
  { location: 'Shanghai', country: 'China', jurisdiction: 'cn', region: 'APAC', currency: 'CNY' },
  { location: 'Ho Chi Minh City', country: 'Vietnam', jurisdiction: 'vn', region: 'APAC', currency: 'VND' },
]
export const siteByLocation = new Map(SITES.map((s) => [s.location, s]))

export const EMPLOYMENT_TYPES = ['Employee', 'Contractor', 'Intern'] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const TERMINATION_TYPES = ['Voluntary', 'Involuntary'] as const
export type TerminationType = (typeof TERMINATION_TYPES)[number]

/** Voluntary exit reasons: the 12-reason taxonomy from the Atlas exit survey (maps 1:1 to the HRIS picklist). */
export const VOLUNTARY_REASONS = [
  'Career growth or promotion',
  'Base salary',
  'Equity, bonus or total rewards',
  'My manager',
  'Confidence in company direction',
  'The work itself',
  'Workload or burnout',
  'Flexibility or location',
  'Team culture',
  'Recognition',
  'Job security',
  'Relocation, family or personal',
  'Other',
] as const
export const INVOLUNTARY_REASONS = [
  'Performance',
  'Conduct',
  'Reduction in force',
  'End of contract',
] as const

export const CHANGE_TYPES = ['Promotion', 'Transfer', 'Lateral move', 'Demotion', 'Manager change'] as const
export type ChangeType = (typeof CHANGE_TYPES)[number]

/* recruiting */
export const STAGES = ['Applied', 'Screen', 'Hiring manager', 'Onsite', 'Offer', 'Hired'] as const
export type Stage = (typeof STAGES)[number]
export const stageIndex = (s: string): number => STAGES.indexOf(s as Stage)
/** Per-stage entry-date field on Candidate for every stage after Applied. */
export const STAGE_DATE_FIELD: Record<Stage, keyof Candidate> = {
  Applied: 'appliedDate',
  Screen: 'screenDate',
  'Hiring manager': 'hmDate',
  Onsite: 'onsiteDate',
  Offer: 'offerDate',
  Hired: 'hiredDate',
}
export const CANDIDATE_STATUSES = ['Active', 'Rejected', 'Withdrawn', 'Declined', 'Hired'] as const
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]
export const SOURCES = [
  'Referral',
  'Sourced',
  'Careers site',
  'Job board',
  'Agency',
  'University',
  'Internal',
] as const
export const REQ_STATUSES = ['Open', 'On hold', 'Filled', 'Cancelled'] as const
export type ReqStatus = (typeof REQ_STATUSES)[number]
export const REQ_TYPES = ['New', 'Backfill'] as const
export const REQ_PRIORITIES = ['Critical', 'High', 'Standard'] as const

/* employee services */
export const CASE_STATUSES = [
  'New',
  'In progress',
  'Waiting on employee',
  'Waiting on third party',
  'Resolved',
  'Closed',
] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]
export const CASE_OPEN_STATUSES: CaseStatus[] = [
  'New',
  'In progress',
  'Waiting on employee',
  'Waiting on third party',
]
export const CASE_CHANNELS = ['Portal', 'Email', 'Chat', 'Phone', 'Walk-in'] as const
export const CASE_PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const
export const CASE_TIERS = ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3'] as const

/**
 * Case categories, each tied to the Hire-to-Retire Atlas process that governs it and a default
 * service level (calendar hours). Imported cases without SLA columns fall back to these.
 */
export interface CaseCategory {
  category: string
  processId: string
  team: string
  responseHours: number
  resolutionHours: number
}
export const CASE_CATEGORIES: CaseCategory[] = [
  { category: 'Payroll', processId: 'PY-05', team: 'Payroll', responseHours: 8, resolutionHours: 48 },
  { category: 'Benefits', processId: 'BN-03', team: 'Benefits', responseHours: 24, resolutionHours: 120 },
  {
    category: 'Leave & accommodation',
    processId: 'LV-01',
    team: 'Leave & accommodation',
    responseHours: 24,
    resolutionHours: 168,
  },
  {
    category: 'Onboarding',
    processId: 'ON-01',
    team: 'People operations',
    responseHours: 8,
    resolutionHours: 48,
  },
  {
    category: 'Offboarding',
    processId: 'OF-05',
    team: 'People operations',
    responseHours: 8,
    resolutionHours: 72,
  },
  {
    category: 'Employment verification',
    processId: 'DS-07',
    team: 'People operations',
    responseHours: 24,
    resolutionHours: 48,
  },
  { category: 'HR data & records', processId: 'DS-01', team: 'HRIS', responseHours: 24, resolutionHours: 72 },
  { category: 'Systems access', processId: 'DS-04', team: 'HRIS', responseHours: 8, resolutionHours: 48 },
  {
    category: 'Compensation & equity',
    processId: 'EQ-01',
    team: 'Total rewards',
    responseHours: 24,
    resolutionHours: 120,
  },
  {
    category: 'Immigration & mobility',
    processId: 'MV-06',
    team: 'Global mobility',
    responseHours: 24,
    resolutionHours: 240,
  },
  {
    category: 'Policy question',
    processId: 'ER-01',
    team: 'People operations',
    responseHours: 24,
    resolutionHours: 72,
  },
  {
    category: 'Employee relations',
    processId: 'ER-02',
    team: 'Employee relations',
    responseHours: 24,
    resolutionHours: 720,
  },
]
export const caseCategoryByName = new Map(CASE_CATEGORIES.map((c) => [c.category, c]))

export const TRANSACTION_TYPES = [
  'New hire',
  'Termination',
  'Job change',
  'Compensation change',
  'Leave start',
  'Return from leave',
  'Location change',
  'Personal data change',
] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]
export const TRANSACTION_PROCESS: Record<TransactionType, string> = {
  'New hire': 'ON-03',
  Termination: 'OF-05',
  'Job change': 'MV-05',
  'Compensation change': 'CO-02',
  'Leave start': 'LV-01',
  'Return from leave': 'LV-03',
  'Location change': 'MV-04',
  'Personal data change': 'DS-01',
}

/* talent */
export const RATING_LABELS: Record<number, string> = {
  1: 'Does not meet',
  2: 'Partially meets',
  3: 'Meets',
  4: 'Exceeds',
  5: 'Far exceeds',
}
/** Guideline distribution used for calibration (share of rated employees). */
export const RATING_GUIDELINE: Record<number, number> = { 1: 0.03, 2: 0.1, 3: 0.52, 4: 0.25, 5: 0.1 }
export const POTENTIALS = ['Low', 'Moderate', 'High'] as const
export type Potential = (typeof POTENTIALS)[number]
export const READINESS = ['Ready now', 'Ready in 1-2 years', 'Ready in 3+ years'] as const
export type Readiness = (typeof READINESS)[number]
export const LEARNING_CATEGORIES = [
  'Compliance',
  'Security',
  'Leadership',
  'Technical',
  'Onboarding',
] as const

/* ───────────────────────── record types ───────────────────────── */

export interface Employee {
  employeeId: string
  name: string
  jobTitle: string
  jobFamily?: string | null
  businessUnit: string
  department: string
  location: string
  country: string
  /** Null when an imported value could not be recognized (logged by the importer). */
  level: Level | null
  managerId?: string | null
  hireDate: ISODate
  terminationDate?: ISODate | null
  terminationType?: TerminationType | null
  terminationReason?: string | null
  regrettable?: boolean | null
  /** Null when an imported value could not be recognized; such rows are left out of headcount. */
  employmentType: EmploymentType | null
  hrbp?: string | null
  costCenter?: string | null
}

export interface JobChange {
  employeeId: string
  effectiveDate: ISODate
  changeType: ChangeType
  fromLevel?: Level | null
  toLevel?: Level | null
  fromDepartment?: string | null
  toDepartment?: string | null
  fromManagerId?: string | null
  toManagerId?: string | null
}

export interface Requisition {
  reqId: string
  jobTitle: string
  businessUnit: string
  department: string
  location: string
  level: Level | null
  hiringManagerId?: string | null
  hiringManager?: string | null
  recruiter?: string | null
  openedDate: ISODate
  targetStartDate?: ISODate | null
  /** Date the req's (last) offer was accepted; time to fill ends here. */
  filledDate?: ISODate | null
  closedDate?: ISODate | null
  status: ReqStatus
  reqType: (typeof REQ_TYPES)[number] | null
  priority: (typeof REQ_PRIORITIES)[number] | null
  openings: number
}

export interface Candidate {
  applicationId: string
  candidateId?: string | null
  candidateName: string
  reqId: string
  source: string
  recruiter?: string | null
  coordinator?: string | null
  currentStage: Stage
  status: CandidateStatus
  appliedDate: ISODate
  screenDate?: ISODate | null
  hmDate?: ISODate | null
  onsiteDate?: ISODate | null
  offerDate?: ISODate | null
  hiredDate?: ISODate | null
  /** Date the current stage was entered (falls back to the stage date, then appliedDate). */
  stageEnteredDate?: ISODate | null
  /** Exit date for rejected, withdrawn and declined candidates. */
  rejectedDate?: ISODate | null
  rejectionReason?: string | null
  /** Next scheduled interview or event. Past date + no stage change = awaiting feedback. */
  nextEventDate?: ISODate | null
  lastActivityDate?: ISODate | null
}

export interface HrCase {
  caseId: string
  openedAt: ISODateTime
  firstResponseAt?: ISODateTime | null
  resolvedAt?: ISODateTime | null
  status: CaseStatus
  category: string
  subcategory?: string | null
  processId?: string | null
  channel: string
  priority: (typeof CASE_PRIORITIES)[number] | null
  tier: (typeof CASE_TIERS)[number] | null
  team: string
  assignee?: string | null
  requesterId?: string | null
  /** Requester's site when the requester is not in the roster (e.g. a former employee). */
  location?: string | null
  responseTargetHours?: number | null
  resolutionTargetHours?: number | null
  csat?: number | null
  reopened?: boolean | null
  escalated?: boolean | null
}

export interface HrTransaction {
  transactionId: string
  type: TransactionType
  employeeId: string
  submittedDate: ISODate
  effectiveDate: ISODate
  /** Deadline from the governing process (e.g. final pay by jurisdiction, new hire by Day -3). */
  dueDate: ISODate
  completedDate?: ISODate | null
  processId?: string | null
  /** Processed after the payroll cut-off for the effective period, so it needed a retro adjustment. */
  retro?: boolean | null
}

export interface Review {
  employeeId: string
  cycle: string
  cycleDate: ISODate
  rating: number
  preCalibrationRating?: number | null
  potential?: Potential | null
  reviewerId?: string | null
}

export interface SuccessionPlan {
  roleId: string
  roleTitle: string
  incumbentId: string
  criticality: 'Critical' | 'Key'
  successorId?: string | null
  readiness?: Readiness | null
  incumbentRiskOfLoss?: 'High' | 'Medium' | 'Low' | null
  updatedDate?: ISODate | null
}

export interface LearningRecord {
  employeeId: string
  course: string
  category: string
  required: boolean
  assignedDate: ISODate
  dueDate?: ISODate | null
  completedDate?: ISODate | null
  hours?: number | null
}

export interface CompRecord {
  employeeId: string
  currency: string
  /** Annual base in local currency, full-time equivalent. */
  baseSalary: number
  rangeMin: number
  rangeMid: number
  rangeMax: number
  /** USD per one unit of local currency; null when unknown (amount totals then skip the row). */
  fxToUsd: number | null
  targetBonusPct?: number | null
  /** Last bonus payout as a fraction of target (1 = 100%). */
  bonusPayoutPct?: number | null
  /** Annualized equity grant value in USD. */
  annualEquityUsd?: number | null
  marketP50?: number | null
  lastIncreaseDate?: ISODate | null
  lastIncreasePct?: number | null
  /** Current cycle proposals, as fractions (0.035 = 3.5%). */
  meritPct?: number | null
  promotionPct?: number | null
}

export interface Datasets {
  employees: Employee[]
  jobChanges: JobChange[]
  requisitions: Requisition[]
  candidates: Candidate[]
  cases: HrCase[]
  transactions: HrTransaction[]
  reviews: Review[]
  succession: SuccessionPlan[]
  learning: LearningRecord[]
  comp: CompRecord[]
}
export type DatasetKey = keyof Datasets
export const DATASET_KEYS: DatasetKey[] = [
  'employees',
  'jobChanges',
  'requisitions',
  'candidates',
  'cases',
  'transactions',
  'reviews',
  'succession',
  'learning',
  'comp',
]

/* ───────────────────────── field definitions (import, templates, exports) ───────────────────────── */

export type FieldType =
  | 'string'
  | 'id'
  | 'date'
  | 'datetime'
  | 'number'
  | 'percent'
  | 'money'
  | 'boolean'
  | 'enum'
  | 'level'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** Unlocks analyses; shown amber when missing. */
  recommended?: boolean
  /** Header aliases (normalized: lowercase, punctuation to spaces). */
  synonyms: string[]
  /** Allowed canonical values for enum fields. */
  values?: readonly string[]
  description: string
  /** Hidden from exports unless pay amounts are switched on. */
  pay?: boolean
}

export interface DatasetDef {
  key: DatasetKey
  label: string
  /** Sheet name used in templates and multi-sheet workbooks. */
  sheet: string
  description: string
  /** Views that read this dataset. */
  usedBy: ViewKey[]
  /** Fields that identify a row, for de-duplication. */
  rowKey: string[]
  fields: FieldDef[]
}

export type ViewKey = 'recruiting' | 'hrbp' | 'org' | 'services' | 'talent' | 'comp'

const f = (
  key: string,
  label: string,
  type: FieldType,
  synonyms: string[],
  description: string,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, label, type, synonyms, description, ...extra })

export const DATASETS: DatasetDef[] = [
  {
    key: 'employees',
    label: 'Employees',
    sheet: 'Employees',
    description:
      'Roster of current and former workers. One row per person; leavers keep their termination fields.',
    usedBy: ['hrbp', 'org', 'talent', 'comp', 'services', 'recruiting'],
    rowKey: ['employeeId'],
    fields: [
      f(
        'employeeId',
        'Employee ID',
        'id',
        ['employee id', 'emp id', 'employee number', 'worker id', 'person id', 'employee no', 'emp no', 'id'],
        'Unique worker identifier.',
        { required: true },
      ),
      f(
        'name',
        'Name',
        'string',
        ['name', 'full name', 'employee name', 'display name', 'legal name', 'preferred name', 'worker'],
        'Display name.',
        { recommended: true },
      ),
      f(
        'jobTitle',
        'Job title',
        'string',
        ['job title', 'title', 'business title', 'position', 'role'],
        'Current or last job title.',
      ),
      f(
        'jobFamily',
        'Job family',
        'string',
        ['job family', 'discipline', 'job function', 'family', 'function'],
        'Discipline, e.g. Design verification.',
      ),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'segment', 'organization', 'org'],
        'Top-level organization.',
        { recommended: true },
      ),
      f(
        'department',
        'Department',
        'string',
        ['department', 'dept', 'team', 'org unit', 'supervisory organization', 'sub department'],
        'Department or team.',
        { recommended: true },
      ),
      f(
        'location',
        'Location',
        'string',
        ['location', 'site', 'office', 'work location', 'city'],
        'Work site.',
        { recommended: true },
      ),
      f('country', 'Country', 'string', ['country', 'work country', 'nation'], 'Country of employment.'),
      f(
        'level',
        'Level',
        'level',
        ['level', 'job level', 'grade', 'career level', 'pay grade', 'management level'],
        'Career level, normalized to L1–L6, M1–M2, E1–E3.',
        { recommended: true },
      ),
      f(
        'managerId',
        'Manager ID',
        'id',
        ['manager id', 'manager employee id', 'supervisor id', 'reports to id', 'reports to', 'manager'],
        'Employee ID (or name) of the direct manager.',
        { recommended: true },
      ),
      f(
        'hireDate',
        'Hire date',
        'date',
        ['hire date', 'start date', 'original hire date', 'date of joining', 'doj', 'date hired'],
        'First day of employment. Rows without it are left out of headcount.',
        { required: true },
      ),
      f(
        'terminationDate',
        'Termination date',
        'date',
        ['termination date', 'term date', 'end date', 'exit date', 'last day', 'separation date'],
        'Last day of employment; blank for current workers.',
      ),
      f(
        'terminationType',
        'Termination type',
        'enum',
        ['termination type', 'term type', 'exit type', 'separation type', 'voluntary involuntary'],
        'Voluntary or Involuntary.',
        { values: TERMINATION_TYPES },
      ),
      f(
        'terminationReason',
        'Termination reason',
        'string',
        ['termination reason', 'term reason', 'exit reason', 'reason for leaving', 'separation reason'],
        'Reason code from the HRIS picklist.',
      ),
      f(
        'regrettable',
        'Regrettable',
        'boolean',
        ['regrettable', 'regretted', 'regret', 'regrettable loss'],
        'Whether the exit was a regrettable loss.',
      ),
      f(
        'employmentType',
        'Employment type',
        'enum',
        ['employment type', 'worker type', 'employee type', 'emp type', 'worker category'],
        'Employee, Contractor or Intern. Only employees count in headcount and rates.',
        { values: EMPLOYMENT_TYPES },
      ),
      f(
        'hrbp',
        'HR business partner',
        'string',
        ['hrbp', 'hr business partner', 'hr partner', 'people partner'],
        'Assigned HR business partner.',
      ),
      f('costCenter', 'Cost center', 'string', ['cost center', 'cost centre', 'cc'], 'Cost center code.'),
    ],
  },
  {
    key: 'jobChanges',
    label: 'Job changes',
    sheet: 'Job changes',
    description: 'Job history events: promotions, transfers, lateral moves, demotions and manager changes.',
    usedBy: ['hrbp', 'talent'],
    rowKey: ['employeeId', 'effectiveDate', 'changeType'],
    fields: [
      f(
        'employeeId',
        'Employee ID',
        'id',
        ['employee id', 'emp id', 'worker id', 'id'],
        'Worker the change applies to.',
        { required: true },
      ),
      f(
        'effectiveDate',
        'Effective date',
        'date',
        ['effective date', 'effective', 'change date', 'action date'],
        'Date the change took effect.',
        { required: true },
      ),
      f(
        'changeType',
        'Change type',
        'enum',
        ['change type', 'action', 'action type', 'reason', 'event type', 'movement type'],
        'Promotion, Transfer, Lateral move, Demotion or Manager change.',
        { required: true, values: CHANGE_TYPES },
      ),
      f(
        'fromLevel',
        'From level',
        'level',
        ['from level', 'prior level', 'old level', 'previous level'],
        'Level before the change.',
      ),
      f('toLevel', 'To level', 'level', ['to level', 'new level'], 'Level after the change.'),
      f(
        'fromDepartment',
        'From department',
        'string',
        ['from department', 'prior department', 'old department'],
        'Department before the change.',
      ),
      f(
        'toDepartment',
        'To department',
        'string',
        ['to department', 'new department'],
        'Department after the change.',
      ),
      f(
        'fromManagerId',
        'From manager ID',
        'id',
        ['from manager', 'prior manager', 'old manager id'],
        'Manager before the change.',
      ),
      f(
        'toManagerId',
        'To manager ID',
        'id',
        ['to manager', 'new manager', 'new manager id'],
        'Manager after the change.',
      ),
    ],
  },
  {
    key: 'requisitions',
    label: 'Requisitions',
    sheet: 'Requisitions',
    description: 'Job requisitions from the ATS. Time to fill runs from opened date to filled date.',
    usedBy: ['recruiting'],
    rowKey: ['reqId'],
    fields: [
      f(
        'reqId',
        'Req ID',
        'id',
        ['req id', 'requisition id', 'job id', 'requisition', 'req', 'job req id', 'opening id'],
        'Requisition identifier; candidates link to it.',
        { required: true },
      ),
      f(
        'jobTitle',
        'Job title',
        'string',
        ['job title', 'job name', 'title', 'position', 'job'],
        'Posted job title.',
        { recommended: true },
      ),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'organization'],
        'Hiring organization.',
      ),
      f('department', 'Department', 'string', ['department', 'dept', 'team'], 'Hiring department.', {
        recommended: true,
      }),
      f('location', 'Location', 'string', ['location', 'office', 'site', 'work location'], 'Work site.'),
      f('level', 'Level', 'level', ['level', 'job level', 'grade'], 'Career level of the role.'),
      f(
        'hiringManagerId',
        'Hiring manager ID',
        'id',
        ['hiring manager id', 'hm id', 'hiring manager employee id'],
        'Employee ID of the hiring manager.',
      ),
      f(
        'hiringManager',
        'Hiring manager',
        'string',
        ['hiring manager', 'hm', 'hiring manager name'],
        'Hiring manager name.',
      ),
      f(
        'recruiter',
        'Recruiter',
        'string',
        ['recruiter', 'recruiter name', 'credited to'],
        'Owning recruiter.',
      ),
      f(
        'openedDate',
        'Opened date',
        'date',
        ['opened date', 'open date', 'date opened', 'created date', 'opened', 'approved date'],
        'Date the req was approved and opened.',
        { required: true },
      ),
      f(
        'targetStartDate',
        'Target start date',
        'date',
        ['target start date', 'target start', 'target hire date', 'needed by'],
        'When the hiring team wants the person to start.',
      ),
      f(
        'filledDate',
        'Filled date',
        'date',
        ['filled date', 'date filled', 'offer accepted date', 'fill date'],
        'Date the offer was accepted.',
      ),
      f(
        'closedDate',
        'Closed date',
        'date',
        ['closed date', 'date closed', 'close date', 'cancelled date'],
        'Date the req was closed or cancelled.',
      ),
      f(
        'status',
        'Status',
        'enum',
        ['status', 'req status', 'job status', 'requisition status'],
        'Open, On hold, Filled or Cancelled.',
        { required: true, values: REQ_STATUSES },
      ),
      f(
        'reqType',
        'Req type',
        'enum',
        ['req type', 'type', 'requisition type', 'new or backfill', 'reason for hire'],
        'New or Backfill.',
        { values: REQ_TYPES },
      ),
      f(
        'priority',
        'Priority',
        'enum',
        ['priority', 'req priority', 'urgency'],
        'Critical, High or Standard.',
        { values: REQ_PRIORITIES },
      ),
      f(
        'openings',
        'Openings',
        'number',
        ['openings', 'headcount', 'number of openings', 'positions'],
        'Number of hires the req allows.',
      ),
    ],
  },
  {
    key: 'candidates',
    label: 'Candidates',
    sheet: 'Candidates',
    description: 'One row per application, with the date each stage was reached.',
    usedBy: ['recruiting'],
    rowKey: ['applicationId'],
    fields: [
      f(
        'applicationId',
        'Application ID',
        'id',
        ['application id', 'app id', 'application', 'id'],
        'Unique application identifier.',
        { required: true },
      ),
      f(
        'candidateId',
        'Candidate ID',
        'id',
        ['candidate id', 'person id'],
        'Candidate identifier (a candidate can apply to several reqs).',
      ),
      f(
        'candidateName',
        'Candidate name',
        'string',
        ['candidate name', 'candidate', 'name', 'full name'],
        'Candidate name.',
        { recommended: true },
      ),
      f(
        'reqId',
        'Req ID',
        'id',
        ['req id', 'requisition id', 'job id', 'requisition', 'job req id'],
        'Requisition the application belongs to.',
        { required: true },
      ),
      f(
        'source',
        'Source',
        'string',
        ['source', 'source name', 'candidate source', 'channel', 'source type'],
        'Where the candidate came from.',
        { recommended: true },
      ),
      f(
        'recruiter',
        'Recruiter',
        'string',
        ['recruiter', 'recruiter name'],
        'Recruiter credited with the application.',
      ),
      f(
        'coordinator',
        'Coordinator',
        'string',
        ['coordinator', 'recruiting coordinator', 'interview coordinator'],
        'Scheduling coordinator.',
      ),
      f(
        'currentStage',
        'Current stage',
        'enum',
        ['current stage', 'stage', 'stage name', 'pipeline stage', 'milestone'],
        'Applied, Screen, Hiring manager, Onsite, Offer or Hired.',
        { required: true, values: STAGES },
      ),
      f(
        'status',
        'Status',
        'enum',
        ['status', 'application status', 'state', 'outcome'],
        'Active, Rejected, Withdrawn, Declined (offer declined) or Hired.',
        { required: true, values: CANDIDATE_STATUSES },
      ),
      f(
        'appliedDate',
        'Applied date',
        'date',
        ['applied date', 'application date', 'date applied', 'applied at', 'created at', 'submitted at'],
        'Date of application.',
        { required: true },
      ),
      f(
        'screenDate',
        'Screen date',
        'date',
        ['screen date', 'recruiter screen date', 'phone screen date'],
        'Date the candidate reached the screen.',
      ),
      f(
        'hmDate',
        'Hiring manager date',
        'date',
        ['hiring manager date', 'hm screen date', 'hm date', 'hiring manager screen date'],
        'Date the candidate reached the hiring manager interview.',
      ),
      f(
        'onsiteDate',
        'Onsite date',
        'date',
        ['onsite date', 'onsite', 'panel date', 'final round date', 'interview date'],
        'Date the candidate reached the onsite.',
      ),
      f(
        'offerDate',
        'Offer date',
        'date',
        ['offer date', 'offer extended date', 'offer sent date', 'offer extended'],
        'Date the offer was extended.',
      ),
      f(
        'hiredDate',
        'Hired date',
        'date',
        ['hired date', 'hire date', 'offer accepted date', 'accepted date', 'hired at'],
        'Date the offer was accepted.',
      ),
      f(
        'stageEnteredDate',
        'Stage entered date',
        'date',
        ['stage entered date', 'entered current stage', 'last stage change', 'stage change date'],
        'Date the current stage was entered.',
      ),
      f(
        'rejectedDate',
        'Exit date',
        'date',
        ['rejected date', 'rejection date', 'withdrawn date', 'closed date', 'exit date'],
        'Date the application was rejected, withdrawn or declined.',
      ),
      f(
        'rejectionReason',
        'Rejection reason',
        'string',
        ['rejection reason', 'reject reason', 'reason', 'disposition reason'],
        'Why the application ended.',
      ),
      f(
        'nextEventDate',
        'Next event date',
        'date',
        ['next event date', 'next interview', 'scheduled interview', 'interview scheduled', 'next event'],
        'Next scheduled interview or event.',
        { recommended: true },
      ),
      f(
        'lastActivityDate',
        'Last activity date',
        'date',
        ['last activity date', 'last activity', 'updated at', 'last updated'],
        'Most recent activity on the application.',
      ),
    ],
  },
  {
    key: 'cases',
    label: 'HR cases',
    sheet: 'HR cases',
    description: 'Employee service cases from the HR help desk.',
    usedBy: ['services'],
    rowKey: ['caseId'],
    fields: [
      f(
        'caseId',
        'Case ID',
        'id',
        ['case id', 'ticket id', 'case number', 'ticket number', 'incident id', 'id'],
        'Unique case identifier.',
        { required: true },
      ),
      f(
        'openedAt',
        'Opened',
        'datetime',
        ['opened', 'opened at', 'created', 'created at', 'open date', 'date opened', 'submitted'],
        'When the case was opened.',
        { required: true },
      ),
      f(
        'firstResponseAt',
        'First response',
        'datetime',
        ['first response', 'first response at', 'first reply', 'responded at', 'acknowledged at'],
        'First reply from the HR team.',
      ),
      f(
        'resolvedAt',
        'Resolved',
        'datetime',
        ['resolved', 'resolved at', 'closed at', 'resolution date', 'date resolved', 'closed'],
        'When the case was resolved.',
      ),
      f(
        'status',
        'Status',
        'enum',
        ['status', 'case status', 'state', 'ticket status'],
        'New, In progress, Waiting on employee, Waiting on third party, Resolved or Closed.',
        { required: true, values: CASE_STATUSES },
      ),
      f(
        'category',
        'Category',
        'string',
        ['category', 'case category', 'topic', 'type', 'case type', 'service'],
        'Service category.',
        { required: true },
      ),
      f(
        'subcategory',
        'Subcategory',
        'string',
        ['subcategory', 'sub category', 'subtopic', 'case subtype'],
        'More specific topic.',
      ),
      f(
        'processId',
        'Process ID',
        'id',
        ['process id', 'process', 'atlas id'],
        'Hire-to-Retire Atlas process that governs the case.',
      ),
      f(
        'channel',
        'Channel',
        'string',
        ['channel', 'contact channel', 'source', 'origin'],
        'Portal, Email, Chat, Phone or Walk-in.',
      ),
      f('priority', 'Priority', 'enum', ['priority', 'severity', 'urgency'], 'P1 to P4.', {
        values: CASE_PRIORITIES,
      }),
      f(
        'tier',
        'Tier',
        'enum',
        ['tier', 'support tier', 'level'],
        'Tier 0 (self-service) to Tier 3 (specialist).',
        { values: CASE_TIERS },
      ),
      f(
        'team',
        'Team',
        'string',
        ['team', 'assigned team', 'assignment group', 'queue', 'group'],
        'Team that owns the case.',
      ),
      f(
        'assignee',
        'Assignee',
        'string',
        ['assignee', 'assigned to', 'owner', 'agent'],
        'Person working the case.',
      ),
      f(
        'requesterId',
        'Requester ID',
        'id',
        ['requester id', 'employee id', 'requested by id', 'requester', 'emp id'],
        'Employee ID of the person who raised it.',
      ),
      f(
        'location',
        'Requester location',
        'string',
        ['location', 'requester location', 'site', 'country'],
        'Site of the requester when not in the roster.',
      ),
      f(
        'responseTargetHours',
        'Response target (hours)',
        'number',
        ['response target', 'response sla', 'first response sla', 'response target hours'],
        'Service level for the first response.',
      ),
      f(
        'resolutionTargetHours',
        'Resolution target (hours)',
        'number',
        ['resolution target', 'resolution sla', 'sla hours', 'resolution target hours'],
        'Service level for resolution.',
      ),
      f(
        'csat',
        'Satisfaction (1-5)',
        'number',
        ['csat', 'satisfaction', 'survey score', 'rating', 'csat score'],
        'Requester satisfaction score.',
      ),
      f(
        'reopened',
        'Reopened',
        'boolean',
        ['reopened', 'reopen', 'was reopened', 'reopen count'],
        'The case was reopened after resolution.',
      ),
      f(
        'escalated',
        'Escalated',
        'boolean',
        ['escalated', 'escalation', 'was escalated'],
        'The case was escalated to a higher tier.',
      ),
    ],
  },
  {
    key: 'transactions',
    label: 'HR transactions',
    sheet: 'HR transactions',
    description: 'HR system transactions with the deadline the governing process sets.',
    usedBy: ['services'],
    rowKey: ['transactionId'],
    fields: [
      f(
        'transactionId',
        'Transaction ID',
        'id',
        ['transaction id', 'txn id', 'request id', 'action id', 'id'],
        'Unique transaction identifier.',
        { required: true },
      ),
      f(
        'type',
        'Type',
        'enum',
        ['type', 'transaction type', 'action', 'action type', 'event'],
        'New hire, Termination, Job change, Compensation change, Leave start, Return from leave, Location change or Personal data change.',
        { required: true, values: TRANSACTION_TYPES },
      ),
      f(
        'employeeId',
        'Employee ID',
        'id',
        ['employee id', 'emp id', 'worker id'],
        'Worker the transaction applies to.',
        { required: true },
      ),
      f(
        'submittedDate',
        'Submitted date',
        'date',
        ['submitted date', 'submitted', 'requested date', 'initiated date', 'created date'],
        'When the request reached HR operations.',
        { required: true },
      ),
      f(
        'effectiveDate',
        'Effective date',
        'date',
        ['effective date', 'effective', 'action date'],
        'When the change takes effect.',
        { required: true },
      ),
      f(
        'dueDate',
        'Due date',
        'date',
        ['due date', 'deadline', 'sla date', 'target date'],
        'Deadline set by the process (final pay rule, Day -3 for new hires, payroll cut-off).',
        { recommended: true },
      ),
      f(
        'completedDate',
        'Completed date',
        'date',
        ['completed date', 'completed', 'processed date', 'date processed', 'closed date'],
        'When the transaction was fully processed.',
      ),
      f(
        'processId',
        'Process ID',
        'id',
        ['process id', 'process', 'atlas id'],
        'Hire-to-Retire Atlas process ID.',
      ),
      f(
        'retro',
        'Retro adjustment',
        'boolean',
        ['retro', 'retro adjustment', 'retroactive', 'late entry'],
        'Processed after payroll cut-off and corrected retroactively.',
      ),
    ],
  },
  {
    key: 'reviews',
    label: 'Performance reviews',
    sheet: 'Reviews',
    description: 'Calibrated performance ratings and potential, one row per person per cycle.',
    usedBy: ['talent', 'comp', 'hrbp'],
    rowKey: ['employeeId', 'cycle'],
    fields: [
      f('employeeId', 'Employee ID', 'id', ['employee id', 'emp id', 'worker id', 'id'], 'Reviewed worker.', {
        required: true,
      }),
      f(
        'cycle',
        'Cycle',
        'string',
        ['cycle', 'review cycle', 'review period', 'performance cycle'],
        'Review cycle name, e.g. 2026 Mid-year.',
        { required: true },
      ),
      f(
        'cycleDate',
        'Cycle date',
        'date',
        ['cycle date', 'review date', 'cycle end date', 'period end'],
        'Date the cycle closed.',
        { required: true },
      ),
      f(
        'rating',
        'Rating',
        'number',
        ['rating', 'final rating', 'performance rating', 'calibrated rating', 'overall rating', 'score'],
        'Final calibrated rating, 1-5. Text labels such as "Exceeds" are converted.',
        { required: true },
      ),
      f(
        'preCalibrationRating',
        'Pre-calibration rating',
        'number',
        ['pre calibration rating', 'manager rating', 'proposed rating', 'initial rating'],
        'Manager-proposed rating before calibration.',
      ),
      f(
        'potential',
        'Potential',
        'enum',
        ['potential', 'potential rating', 'growth potential'],
        'Low, Moderate or High.',
        { values: POTENTIALS },
      ),
      f(
        'reviewerId',
        'Reviewer ID',
        'id',
        ['reviewer id', 'manager id', 'reviewer'],
        'Manager who wrote the review.',
      ),
    ],
  },
  {
    key: 'succession',
    label: 'Succession plans',
    sheet: 'Succession',
    description: 'Critical and key roles with named successors, one row per successor.',
    usedBy: ['talent'],
    rowKey: ['roleId', 'successorId'],
    fields: [
      f(
        'roleId',
        'Role ID',
        'id',
        ['role id', 'position id', 'critical role id', 'id'],
        'Identifier of the role being planned.',
        { required: true },
      ),
      f(
        'roleTitle',
        'Role title',
        'string',
        ['role title', 'position', 'role', 'critical role'],
        'Title of the role.',
      ),
      f(
        'incumbentId',
        'Incumbent ID',
        'id',
        ['incumbent id', 'incumbent', 'employee id', 'holder id'],
        'Current holder of the role.',
        { required: true },
      ),
      f(
        'criticality',
        'Criticality',
        'enum',
        ['criticality', 'role criticality', 'tier'],
        'Critical or Key.',
        { values: ['Critical', 'Key'] },
      ),
      f(
        'successorId',
        'Successor ID',
        'id',
        ['successor id', 'successor', 'successor employee id'],
        'Named successor; blank when none is identified.',
      ),
      f(
        'readiness',
        'Readiness',
        'enum',
        ['readiness', 'successor readiness', 'ready'],
        'Ready now, Ready in 1-2 years or Ready in 3+ years.',
        { values: READINESS },
      ),
      f(
        'incumbentRiskOfLoss',
        'Incumbent risk of loss',
        'enum',
        ['risk of loss', 'incumbent risk', 'flight risk', 'retention risk'],
        'High, Medium or Low.',
        { values: ['High', 'Medium', 'Low'] },
      ),
      f(
        'updatedDate',
        'Updated date',
        'date',
        ['updated date', 'last reviewed', 'review date', 'as of'],
        'When the plan was last reviewed.',
      ),
    ],
  },
  {
    key: 'learning',
    label: 'Learning',
    sheet: 'Learning',
    description: 'Training assignments and completions.',
    usedBy: ['talent'],
    rowKey: ['employeeId', 'course', 'assignedDate'],
    fields: [
      f(
        'employeeId',
        'Employee ID',
        'id',
        ['employee id', 'emp id', 'learner id', 'user id', 'id'],
        'Learner.',
        { required: true },
      ),
      f(
        'course',
        'Course',
        'string',
        ['course', 'course title', 'training', 'learning item', 'module'],
        'Course title.',
        { required: true },
      ),
      f(
        'category',
        'Category',
        'string',
        ['category', 'course category', 'type', 'training type'],
        'Compliance, Security, Leadership, Technical or Onboarding.',
      ),
      f(
        'required',
        'Required',
        'boolean',
        ['required', 'mandatory', 'is required', 'compliance required'],
        'Assigned as mandatory.',
      ),
      f(
        'assignedDate',
        'Assigned date',
        'date',
        ['assigned date', 'assigned', 'enrolled date', 'registration date'],
        'When it was assigned.',
        { required: true },
      ),
      f('dueDate', 'Due date', 'date', ['due date', 'due', 'deadline'], 'Completion deadline.'),
      f(
        'completedDate',
        'Completed date',
        'date',
        ['completed date', 'completion date', 'completed', 'date completed'],
        'When it was completed.',
      ),
      f(
        'hours',
        'Hours',
        'number',
        ['hours', 'duration', 'credit hours', 'learning hours'],
        'Learning hours credited.',
      ),
    ],
  },
  {
    key: 'comp',
    label: 'Compensation',
    sheet: 'Compensation',
    description: 'Current pay, salary range and cycle proposals for active employees.',
    usedBy: ['comp'],
    rowKey: ['employeeId'],
    fields: [
      f('employeeId', 'Employee ID', 'id', ['employee id', 'emp id', 'worker id', 'id'], 'Paid worker.', {
        required: true,
      }),
      f(
        'currency',
        'Currency',
        'string',
        ['currency', 'currency code', 'ccy', 'pay currency'],
        'ISO currency code of the salary.',
      ),
      f(
        'baseSalary',
        'Base salary',
        'money',
        ['base salary', 'annual base', 'base pay', 'salary', 'annual salary', 'current salary'],
        'Annual base salary in local currency.',
        { required: true, pay: true },
      ),
      f(
        'rangeMin',
        'Range minimum',
        'money',
        ['range min', 'range minimum', 'band min', 'salary min', 'grade min', 'minimum'],
        'Salary range minimum.',
        { recommended: true, pay: true },
      ),
      f(
        'rangeMid',
        'Range midpoint',
        'money',
        ['range mid', 'range midpoint', 'band mid', 'midpoint', 'salary mid', 'grade mid'],
        'Salary range midpoint; compa-ratio = base / midpoint.',
        { required: true, pay: true },
      ),
      f(
        'rangeMax',
        'Range maximum',
        'money',
        ['range max', 'range maximum', 'band max', 'salary max', 'grade max', 'maximum'],
        'Salary range maximum.',
        { recommended: true, pay: true },
      ),
      f(
        'fxToUsd',
        'FX to USD',
        'number',
        ['fx to usd', 'fx rate', 'exchange rate', 'rate to usd', 'conversion rate'],
        'US dollars per one unit of local currency.',
      ),
      f(
        'targetBonusPct',
        'Target bonus %',
        'percent',
        ['target bonus', 'target bonus pct', 'bonus target', 'sti target', 'target incentive'],
        'Target bonus as a share of base.',
      ),
      f(
        'bonusPayoutPct',
        'Bonus payout % of target',
        'percent',
        ['bonus payout', 'payout pct', 'bonus attainment', 'payout of target'],
        'Last bonus paid as a share of target.',
      ),
      f(
        'annualEquityUsd',
        'Annual equity (USD)',
        'money',
        ['annual equity', 'equity value', 'lti value', 'rsu value', 'equity target', 'lti target'],
        'Annualized equity grant value in USD.',
        { pay: true },
      ),
      f(
        'marketP50',
        'Market median',
        'money',
        ['market p50', 'market median', 'market 50th', 'benchmark median', 'survey median'],
        'Market median base for the job, local currency.',
        { pay: true },
      ),
      f(
        'lastIncreaseDate',
        'Last increase date',
        'date',
        ['last increase date', 'last raise date', 'last comp change', 'date of last increase'],
        'Date of the last base increase.',
      ),
      f(
        'lastIncreasePct',
        'Last increase %',
        'percent',
        ['last increase pct', 'last increase', 'prior increase', 'last raise'],
        'Size of the last base increase.',
      ),
      f(
        'meritPct',
        'Merit %',
        'percent',
        ['merit pct', 'merit', 'merit increase', 'proposed merit', 'merit increase pct'],
        'Proposed merit increase this cycle.',
      ),
      f(
        'promotionPct',
        'Promotion %',
        'percent',
        ['promotion pct', 'promotion increase', 'promo increase', 'promo pct'],
        'Proposed promotion increase this cycle.',
      ),
    ],
  },
]
export const datasetDef = (key: DatasetKey): DatasetDef => DATASETS.find((d) => d.key === key)!
