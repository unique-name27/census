/**
 * Census data model.
 *
 * Sixteen datasets, each one Excel sheet. Employee-keyed datasets join to the roster by `employeeId`
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

/* HR ops */
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
    // General pay and equity questions sit with Total Rewards under the annual compensation review
    // (CO-02); EQ-01 is equity grant administration only.
    category: 'Compensation & equity',
    processId: 'CO-02',
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
    // Questions about HR policies go to the policy owners under policy lifecycle governance (DS-08);
    // ER-01 is the speak-up intake for workplace concerns.
    category: 'Policy question',
    processId: 'DS-08',
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

/**
 * Leave reasons: the Hire-to-Retire Atlas's nine leave categories, at category level only. No
 * medical or other detail below the category is ever stored or imported.
 */
export const LEAVE_REASONS = [
  'Parental',
  'Medical',
  'Family care',
  'Military',
  'Bereavement',
  'Civic duty',
  "Workers' compensation",
  'Sabbatical',
  'Personal',
] as const
export type LeaveReason = (typeof LEAVE_REASONS)[number]

/* onboarding */

/** Who does an onboarding task. */
export const ONBOARDING_OWNERS = [
  'People ops',
  'IT',
  'Facilities',
  'Trade compliance',
  'Manager',
  'Recruiter',
  'Payroll',
  'New hire',
] as const
export type OnboardingOwner = (typeof ONBOARDING_OWNERS)[number]

export const ONBOARDING_STATUSES = ['Not started', 'In progress', 'Blocked', 'Done', 'Not needed'] as const
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number]

export type OnboardingPhase = 'Before day 1' | 'First 90 days'

/**
 * One task of the default onboarding checklist (Atlas ON-01 to ON-04). `dueDay` counts from the
 * start date (day 0): -3 is three days before the start. `businessDays` counts working days
 * (Mon-Fri) instead of calendar days. A null `dueDay` has no fixed offset (the probation decision
 * is due 10 business days before the probation period ends, which differs by country).
 */
export interface OnboardingTaskDef {
  task: string
  processId: string
  owner: OnboardingOwner
  phase: OnboardingPhase
  dueDay: number | null
  businessDays?: boolean
  /** Only for starts at a US site (Form I-9). */
  usOnly?: boolean
  /** Counts toward day-one readiness (every pre-start task done by day 0, Atlas ON-01). */
  readiness?: boolean
  /** Other spellings the importer recognizes (normalized: lowercase, punctuation to spaces). */
  aliases: string[]
}

export const ONBOARDING_TASKS: OnboardingTaskDef[] = [
  {
    task: 'Background check cleared',
    processId: 'ON-01',
    owner: 'People ops',
    phase: 'Before day 1',
    dueDay: -3,
    readiness: true,
    aliases: [
      'background check',
      'bgc',
      'background verification',
      'bgv',
      'contingencies cleared',
      'contingency',
    ],
  },
  {
    task: 'Export-control screening',
    processId: 'ON-01',
    owner: 'Trade compliance',
    phase: 'Before day 1',
    dueDay: -3,
    readiness: true,
    aliases: [
      'export control',
      'export control screening',
      'export screening',
      'trade compliance screening',
      'deemed export',
    ],
  },
  {
    task: 'Laptop shipped',
    processId: 'ON-01',
    owner: 'IT',
    phase: 'Before day 1',
    dueDay: -3,
    readiness: true,
    aliases: ['laptop', 'hardware', 'equipment', 'it equipment', 'computer', 'laptop delivered'],
  },
  {
    task: 'Accounts created',
    processId: 'ON-01',
    owner: 'IT',
    phase: 'Before day 1',
    dueDay: -3,
    readiness: true,
    aliases: [
      'accounts',
      'it accounts',
      'system access',
      'email account',
      'access provisioned',
      'provisioning',
    ],
  },
  {
    task: 'Badge ready',
    processId: 'ON-01',
    owner: 'Facilities',
    phase: 'Before day 1',
    dueDay: -2,
    readiness: true,
    aliases: ['badge', 'access badge', 'security badge', 'building access', 'id card'],
  },
  {
    task: 'Benefits packet sent',
    processId: 'ON-01',
    owner: 'People ops',
    phase: 'Before day 1',
    dueDay: -3,
    readiness: true,
    aliases: ['benefits', 'benefits packet', 'benefits enrollment packet', 'welcome packet'],
  },
  {
    task: 'Orientation booked',
    processId: 'ON-01',
    owner: 'People ops',
    phase: 'Before day 1',
    dueDay: -3,
    readiness: true,
    aliases: ['orientation', 'new hire orientation', 'nho', 'induction', 'orientation scheduled'],
  },
  {
    task: 'Manager welcome',
    processId: 'ON-01',
    owner: 'Manager',
    phase: 'Before day 1',
    dueDay: -1,
    readiness: true,
    aliases: ['welcome', 'manager welcome email', 'welcome call', 'buddy assigned', 'first week plan'],
  },
  {
    task: 'Day -1 readiness check',
    processId: 'ON-01',
    owner: 'People ops',
    phase: 'Before day 1',
    dueDay: -1,
    readiness: true,
    aliases: ['readiness check', 'day 1 readiness', 'pre start check', 'day minus 1 check'],
  },
  {
    task: 'I-9 Section 1',
    processId: 'ON-02',
    owner: 'New hire',
    phase: 'Before day 1',
    dueDay: 0,
    usOnly: true,
    readiness: true,
    aliases: ['i9 section 1', 'i 9 section 1', 'form i9 section 1', 'i9 s1'],
  },
  {
    task: 'I-9 Section 2',
    processId: 'ON-02',
    owner: 'People ops',
    phase: 'First 90 days',
    dueDay: 3,
    businessDays: true,
    usOnly: true,
    aliases: ['i9 section 2', 'i 9 section 2', 'form i9 section 2', 'i9 s2', 'i9 verification'],
  },
  {
    task: 'Policy acknowledgments',
    processId: 'ON-04',
    owner: 'New hire',
    phase: 'First 90 days',
    dueDay: 5,
    businessDays: true,
    aliases: [
      'policy acknowledgment',
      'policy acknowledgement',
      'policy acknowledgements',
      'code of conduct',
      'policies signed',
    ],
  },
  {
    task: '30-day check-in',
    processId: 'ON-04',
    owner: 'Manager',
    phase: 'First 90 days',
    dueDay: 30,
    aliases: ['30 day check in', '30 day checkin', '30 day review', 'day 30 check in'],
  },
  {
    task: '60-day check-in',
    processId: 'ON-04',
    owner: 'Manager',
    phase: 'First 90 days',
    dueDay: 60,
    aliases: ['60 day check in', '60 day checkin', '60 day review', 'day 60 check in'],
  },
  {
    task: '90-day check-in',
    processId: 'ON-04',
    owner: 'Manager',
    phase: 'First 90 days',
    dueDay: 90,
    aliases: ['90 day check in', '90 day checkin', '90 day review', 'day 90 check in'],
  },
  {
    task: 'Probation decision',
    processId: 'ON-04',
    owner: 'Manager',
    phase: 'First 90 days',
    dueDay: null,
    aliases: ['probation', 'probation review', 'probation confirmation', 'confirmation of employment'],
  },
]
export const onboardingTaskByName = new Map(ONBOARDING_TASKS.map((t) => [t.task, t]))

/* compliance and right to work */

/**
 * Work authorization as broad categories that never reveal nationality or citizenship: citizens
 * and permanent residents alike are "Permanent (no expiry)". Shown only in aggregate unless
 * "Show immigration details" is on for the session.
 */
export const AUTHORIZATION_TYPES = [
  'Permanent (no expiry)',
  'Employer-sponsored visa',
  'Intra-company transfer',
  'Employment authorization document',
  'Student work authorization',
  'Dependent work authorization',
  'Work permit',
  'Other time-limited',
] as const
export type AuthorizationType = (typeof AUTHORIZATION_TYPES)[number]

export const EXPORT_LICENSE_STATUSES = ['Pending', 'Approved', 'Denied', 'Expired', 'Not needed'] as const
export type ExportLicenseStatus = (typeof EXPORT_LICENSE_STATUSES)[number]

/* listening */

/** Every survey program Census reads (docs/ROADMAP.md, Listening). */
export const SURVEY_TYPES = [
  'Candidate experience',
  'Hiring manager satisfaction',
  'Onboarding pulse day 30',
  'Onboarding pulse day 90',
  'Stay interview',
  'Exit survey',
  'Manager feedback',
  'HR service survey',
  'Return to work',
  'Training evaluation',
  'Engagement',
] as const
export type SurveyType = (typeof SURVEY_TYPES)[number]

export const SURVEY_SCALES = ['1-5', '0-10'] as const
export type SurveyScale = (typeof SURVEY_SCALES)[number]

/** Who answers: employees (respondent key = employee ID) or candidates (= application ID). */
export type SurveyRespondent = 'employee' | 'candidate'

/** The Listening sub-tab a survey lives on. */
export type SurveyArea = 'candidates' | 'onboarding' | 'stay-exit' | 'managers' | 'services'

export interface SurveyProgram {
  survey: SurveyType
  respondent: SurveyRespondent
  area: SurveyArea
  /** When it is sent, in plain words. */
  when: string
  /** What it tells you. */
  purpose: string
  /** The scale most of its items use. */
  scale: SurveyScale
  /** Where its headline result also shows, as one number that links to Listening. */
  alsoIn: { view: ViewKey; tab: string } | null
  /** Cuts by manager need the larger survey minimum (10 respondents over four quarters). */
  managerCuts?: boolean
  /** Off unless the engagement surveys switch is on (Settings > Privacy). */
  offByDefault?: boolean
}

export const SURVEY_PROGRAMS: SurveyProgram[] = [
  {
    survey: 'Candidate experience',
    respondent: 'candidate',
    area: 'candidates',
    when: 'After each interview stage and after a decline',
    purpose: 'Candidate NPS by stage, source and recruiter, and why candidates declined.',
    scale: '0-10',
    alsoIn: { view: 'recruiting', tab: 'sources' },
  },
  {
    survey: 'Hiring manager satisfaction',
    respondent: 'employee',
    area: 'candidates',
    when: 'When a req is filled',
    purpose: 'Satisfaction with speed, slate quality and communication, by recruiter.',
    scale: '1-5',
    alsoIn: { view: 'recruiting', tab: 'requisitions' },
  },
  {
    survey: 'Onboarding pulse day 30',
    respondent: 'employee',
    area: 'onboarding',
    when: '30 days after the start',
    purpose: 'Week-1 readiness ("I had what I needed"), role clarity and manager support.',
    scale: '1-5',
    alsoIn: { view: 'onboarding', tab: 'first90' },
  },
  {
    survey: 'Onboarding pulse day 90',
    respondent: 'employee',
    area: 'onboarding',
    when: '90 days after the start',
    purpose: 'Role clarity, manager support and whether the job matches what was offered.',
    scale: '1-5',
    alsoIn: { view: 'onboarding', tab: 'first90' },
  },
  {
    survey: 'Stay interview',
    respondent: 'employee',
    area: 'stay-exit',
    when: 'Twice a year for key talent',
    purpose: 'What keeps people and what would make them leave.',
    scale: '1-5',
    alsoIn: { view: 'talent', tab: 'retention' },
  },
  {
    survey: 'Exit survey',
    respondent: 'employee',
    area: 'stay-exit',
    when: 'At notice of resignation',
    purpose:
      'Primary reason for leaving, driver gaps between regretted and other leavers, and whether they would return.',
    scale: '1-5',
    alsoIn: { view: 'hrbp', tab: 'attrition' },
  },
  {
    survey: 'Manager feedback',
    respondent: 'employee',
    area: 'managers',
    when: 'Twice a year',
    purpose: 'Manager effectiveness themes from the people who report to them.',
    scale: '1-5',
    alsoIn: { view: 'hrbp', tab: 'org' },
    managerCuts: true,
  },
  {
    survey: 'HR service survey',
    respondent: 'employee',
    area: 'services',
    when: 'When a case is resolved',
    purpose: 'Satisfaction and effort by case category and channel.',
    scale: '1-5',
    alsoIn: { view: 'services', tab: 'cases' },
  },
  {
    survey: 'Return to work',
    respondent: 'employee',
    area: 'services',
    when: '30 days after returning from leave',
    purpose: 'Whether the return was smooth: systems ready and a manager check-in.',
    scale: '1-5',
    alsoIn: { view: 'services', tab: 'leave' },
  },
  {
    survey: 'Training evaluation',
    respondent: 'employee',
    area: 'services',
    when: 'After a course',
    purpose: 'Course usefulness and relevance, by course.',
    scale: '1-5',
    alsoIn: { view: 'talent', tab: 'learning' },
  },
  {
    survey: 'Engagement',
    respondent: 'employee',
    area: 'managers',
    when: 'Quarterly pulse',
    purpose: 'Engagement and eNPS by org.',
    scale: '1-5',
    alsoIn: null,
    managerCuts: true,
    offByDefault: true,
  },
]
export const surveyProgramOf = new Map(SURVEY_PROGRAMS.map((p) => [p.survey, p]))

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
/**
 * Job families, the broad groups of related jobs; each contains job functions. These are the sample's
 * six, in order, and the suggested values for the move form. Uploaded data may use its own. The
 * functions of each family live in the sample (`src/data/sample/jobs.ts`); a test keeps the two in step.
 */
export const JOB_FAMILIES = [
  'Silicon Engineering',
  'Systems & Software Engineering',
  'Product & Test Operations',
  'Go-to-Market',
  'Corporate',
  'Executive',
] as const
export const LEARNING_CATEGORIES = [
  'Compliance',
  'Security',
  'Leadership',
  'Technical',
  'Onboarding',
] as const

/* education (docs/ANALYSES.md, 2.3): the highest degree only, never a graduation year */
export const DEGREE_LEVELS = ['Associate', "Bachelor's", "Master's", 'PhD', 'Other'] as const
export type DegreeLevel = (typeof DEGREE_LEVELS)[number]
/** Census's starting list of fields of study; your own spellings can be added to the official list. */
export const FIELDS_OF_STUDY = [
  'Electrical Engineering',
  'Computer Engineering',
  'Computer Science',
  'Physics',
  'Materials Science',
  'Mechanical Engineering',
  'Chemical Engineering',
  'Mathematics',
  'Business',
  'Other',
] as const

/* chip development stages (docs/ANALYSES.md, 4.3) */
export const CHIP_STAGE_KEYS = [
  'architecture',
  'rtl',
  'ams',
  'verification',
  'dft',
  'physical',
  'signoff',
  'postSilicon',
  'productTest',
  'software',
  'shared',
] as const
export type ChipStageKey = (typeof CHIP_STAGE_KEYS)[number]
export type ChipPhase =
  | 'Pre-silicon, front end'
  | 'Pre-silicon, back end'
  | 'Post-silicon'
  | 'Across the lifecycle'
export interface ChipStage {
  key: ChipStageKey
  /** The name Census shows and the value the Job functions list stores. */
  label: string
  phase: ChipPhase
  /** Position in the flow, 1 to 11: the nine lifecycle stages, then the two that run across it. */
  order: number
  /** Software and firmware, Shared engineering: drawn after the nine, past a hairline. */
  acrossLifecycle: boolean
  what: string
}
const chipStage = (
  key: ChipStageKey,
  label: string,
  phase: ChipPhase,
  what: string,
): Omit<ChipStage, 'order' | 'acrossLifecycle'> => ({ key, label, phase, what })
/**
 * The stages of chip development in lifecycle order (a fabless company: fabrication and assembly
 * are the foundry's and the assembly partner's, so they are not staffed stages here).
 */
export const CHIP_STAGES: readonly ChipStage[] = [
  chipStage(
    'architecture',
    'Architecture and spec',
    'Pre-silicon, front end',
    'Product and system architecture, micro-architecture, performance and power modeling, the specification.',
  ),
  chipStage(
    'rtl',
    'RTL design',
    'Pre-silicon, front end',
    'Digital logic design in RTL, IP integration, synthesis-ready design.',
  ),
  chipStage(
    'ams',
    'Analog and mixed-signal design',
    'Pre-silicon, front end',
    'Analog, mixed-signal and SerDes circuit design and analog layout. It runs beside RTL design, with its own talent pool and hiring market.',
  ),
  chipStage(
    'verification',
    'Design verification',
    'Pre-silicon, front end',
    'Functional verification (UVM), formal, emulation and FPGA prototyping.',
  ),
  chipStage('dft', 'DFT', 'Pre-silicon, front end', 'Scan, BIST, ATPG and test insertion.'),
  chipStage(
    'physical',
    'Physical design',
    'Pre-silicon, back end',
    'Floorplan, place and route, clock tree, timing closure.',
  ),
  chipStage(
    'signoff',
    'Signoff and tape-out',
    'Pre-silicon, back end',
    'Static timing, power and IR signoff, physical verification (DRC, LVS), package co-design, tape-out.',
  ),
  chipStage(
    'postSilicon',
    'Post-silicon validation and bring-up',
    'Post-silicon',
    'First silicon bring-up, validation, characterization, evaluation and validation boards.',
  ),
  chipStage(
    'productTest',
    'Product and test engineering',
    'Post-silicon',
    'Production test programs (ATE), yield, qualification, quality and reliability.',
  ),
  chipStage(
    'software',
    'Software and firmware',
    'Across the lifecycle',
    'Firmware, drivers, compilers and SDKs: pre-silicon on emulation, then on silicon.',
  ),
  chipStage(
    'shared',
    'Shared engineering',
    'Across the lifecycle',
    'EDA and CAD, methodology, engineering program management, engineering leadership.',
  ),
].map((s, i) => ({ ...s, order: i + 1, acrossLifecycle: s.phase === 'Across the lifecycle' }))
export const chipStageByKey: ReadonlyMap<ChipStageKey, ChipStage> = new Map(
  CHIP_STAGES.map((s) => [s.key, s]),
)

/* offer declines (docs/ANALYSES.md, 3.2) */
export const OFFER_DECLINE_THEMES = [
  'Competition',
  'Pay',
  'Role',
  'Logistics',
  'Process',
  'Personal',
  'Other',
] as const
export type OfferDeclineTheme = (typeof OFFER_DECLINE_THEMES)[number]
export interface OfferDeclineReason {
  reason: string
  theme: OfferDeclineTheme
  /** Who owns the next step for declines with this reason; null when nobody does. */
  owner: string | null
}
/** Why candidates decline an offer, each in a theme. Anything not recognized sits under Other. */
export const OFFER_DECLINE_REASONS: readonly OfferDeclineReason[] = [
  {
    reason: 'Accepted competing offer',
    theme: 'Competition',
    owner: 'Talent acquisition and hiring managers',
  },
  {
    reason: 'Counteroffer from current employer',
    theme: 'Competition',
    owner: 'Talent acquisition and hiring managers',
  },
  { reason: 'Compensation below expectations', theme: 'Pay', owner: 'Total rewards' },
  { reason: 'Equity, bonus or total rewards', theme: 'Pay', owner: 'Total rewards' },
  { reason: 'Role or level', theme: 'Role', owner: 'Hiring managers' },
  { reason: 'Team or manager', theme: 'Role', owner: 'Hiring managers' },
  { reason: 'Location or relocation', theme: 'Logistics', owner: 'Talent acquisition and global mobility' },
  { reason: 'Start date or notice period', theme: 'Logistics', owner: 'Talent acquisition' },
  { reason: 'Process took too long', theme: 'Process', owner: 'Talent acquisition' },
  { reason: 'Personal reasons', theme: 'Personal', owner: null },
  { reason: 'Other', theme: 'Other', owner: null },
]

/* ───────────────────────── record types ───────────────────────── */

export interface Employee {
  employeeId: string
  name: string
  jobTitle: string
  /** Broad group of related jobs (Silicon Engineering). Contains job functions. */
  jobFamily?: string | null
  /** Discipline within the job family (Design RTL). */
  jobFunction?: string | null
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
  /** School of the highest degree, as the HRIS records it. Never with a graduation year. */
  university?: string | null
  degreeLevel?: DegreeLevel | null
  /** Subject of the highest degree (Electrical Engineering). */
  fieldOfStudy?: string | null
  /** Share of a full-time schedule: 1 full time, 0.5 half. Blank counts as 1. */
  fte?: number | null
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
  /**
   * Expected first day for an accepted offer ("Start Date" in Greenhouse). `hiredDate` is the
   * offer-accepted date, so without this the start is unknown. A renege is an accepted offer
   * (`hiredDate` set) later marked Withdrawn.
   */
  startDate?: ISODate | null
  /** The candidate told us they held another offer when this one was made or decided. */
  competingOffer?: boolean | null
  /** We improved the offer after it was first extended. */
  offerRevised?: boolean | null
  /** Where the offered base sat in the role's range: 0 at the minimum, 1 at the maximum. A ratio, never an amount. */
  offerPositionInRange?: number | null
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
  /** Leave start only: the Atlas leave category (category level only, never medical detail). */
  leaveReason?: LeaveReason | null
  /** Leave start only: the planned return date. */
  expectedReturnDate?: ISODate | null
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

/**
 * One line of the hiring plan: one planned role, or a count for a month and org. Both shapes work
 * in the same sheet; identical lines are added together on import.
 */
export interface HiringPlanLine {
  /** First day of the month the hires are planned to start (YYYY-MM-01). */
  period: ISODate
  businessUnit: string
  department: string
  /** Planned starts on this line (1 for a line per role). */
  plannedHires: number
  location?: string | null
  level?: Level | null
  jobTitle?: string | null
  reqType?: (typeof REQ_TYPES)[number] | null
  /** Links the plan line to a requisition. */
  reqId?: string | null
  /** Position or plan line identifier from the planning tool. */
  positionId?: string | null
  /** e.g. "FY27 v2"; the views read the latest version when several are loaded. */
  planVersion?: string | null
}

/**
 * One line of the headcount and cost budget (docs/ROLES-V2.md, "Decisions made"): a month and an
 * org, either a whole business unit, a department or a cost center, with the headcount and the
 * cost budgeted for it. Headcount counts employees at the month end (contractors and interns are
 * not headcount). The cost is a pay-type amount: Finance sees it only as totals over groups of 5
 * or more people (docs/ROLES-V2.md 3.2), and every other mode only with "Show pay amounts" on.
 */
export interface BudgetLine {
  /** First day of the budgeted month (YYYY-MM-01). */
  period: ISODate
  businessUnit: string
  /** Blank for a line that budgets the whole business unit. */
  department?: string | null
  /** Blank for a line that budgets a whole department or business unit. */
  costCenter?: string | null
  /** Employees budgeted at the month end. */
  budgetHeadcount: number
  /**
   * The month's budgeted workforce cost in `currency`: employees' base pay and target bonus, and
   * contractors. One month's cost, not the year's.
   */
  budgetCost?: number | null
  /** ISO code of `budgetCost`'s currency; blank reads as USD. */
  currency?: string | null
  /** e.g. "FY27 budget"; the views read the latest version when several are loaded. */
  planVersion?: string | null
}

/**
 * One onboarding task for one person: a pre-hire or new employee (`employeeId`) or an accepted
 * candidate who is not in the roster yet (`applicationId`). At least one of the two is set.
 */
export interface OnboardingTask {
  employeeId?: string | null
  applicationId?: string | null
  /** Canonical task name from ONBOARDING_TASKS when recognized; other tasks are kept as written. */
  task: string
  owner?: string | null
  dueDate?: ISODate | null
  completedDate?: ISODate | null
  status?: OnboardingStatus | null
  processId?: string | null
}

/**
 * Right to work and export control, one row per employee. Never holds nationality or
 * citizenship (protected characteristics).
 */
export interface RightToWork {
  employeeId: string
  authorizationType?: AuthorizationType | null
  /** Blank for authorization with no expiry. */
  expiryDate?: ISODate | null
  /** When reverification of an expiring authorization started (target: 90 days or more ahead). */
  reverificationStartedDate?: ISODate | null
  /** US starts: Form I-9 Section 1 (by day 1) and Section 2 (within 3 business days). */
  i9Section1Date?: ISODate | null
  i9Section2Date?: ISODate | null
  exportLicenseRequired?: boolean | null
  exportLicenseStatus?: ExportLicenseStatus | null
  exportLicenseExpiry?: ISODate | null
}

/**
 * One answer to one survey item (long format: a row per answer). `respondentKey` is an employee
 * ID, or an application ID for candidate surveys. It is used only to join org, stage or req
 * attributes for grouped results and is never displayed; no view shows one person's answers.
 */
export interface SurveyResponse {
  survey: SurveyType
  /** The wave or cycle, e.g. "2026 Q3" or "2026-09". */
  wave: string
  responseDate: ISODate
  respondentKey: string
  /** Question code or short text. */
  item: string
  driver?: string | null
  score: number
  scale: SurveyScale
  /** A chosen reason (exit reason, decline reason), category level. Free-text comments are never imported. */
  reason?: string | null
  /** What the answer is about: the req, case or course (joins category, recruiter or course). */
  subjectKey?: string | null
  /** The touchpoint for candidate surveys, e.g. the interview stage. */
  touchpoint?: string | null
}

/** Optional reference sheet: what each survey item measures and its target. */
export interface SurveyItem {
  item: string
  driver: string
  survey?: SurveyType | null
  /** The question as asked. */
  text?: string | null
  scale?: SurveyScale | null
  /** Target mean on the item's scale (e.g. 4.0 on 1-5). */
  target?: number | null
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
  hiringPlan: HiringPlanLine[]
  onboardingTasks: OnboardingTask[]
  rightToWork: RightToWork[]
  surveyResponses: SurveyResponse[]
  surveyItems: SurveyItem[]
  budget: BudgetLine[]
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
  'hiringPlan',
  'onboardingTasks',
  'rightToWork',
  'surveyResponses',
  'surveyItems',
  'budget',
]

/**
 * Datasets added for Onboarding, Compliance, Listening and Finance's budget. The sample may leave
 * them empty.
 */
export const OPTIONAL_DATASETS: readonly DatasetKey[] = [
  'hiringPlan',
  'onboardingTasks',
  'rightToWork',
  'surveyResponses',
  'surveyItems',
  'budget',
]

/** Every dataset with no rows. */
export function emptyDatasets(): Datasets {
  return Object.fromEntries(DATASET_KEYS.map((k) => [k, []])) as unknown as Datasets
}

/**
 * The datasets with every key present: rows loaded before a dataset existed (or a partial test
 * fixture) get an empty list for it, so engines never meet `undefined`.
 */
export function withAllDatasets(data: Partial<Datasets>): Datasets {
  if (DATASET_KEYS.every((k) => Array.isArray(data[k]))) return data as Datasets
  const out = { ...data } as Record<DatasetKey, unknown[]>
  for (const k of DATASET_KEYS) if (!Array.isArray(out[k])) out[k] = []
  return out as unknown as Datasets
}

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
  /** Immigration detail: shown per person only while "Show immigration details" is on. */
  immigration?: boolean
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
  /**
   * Rows with the same row key are one line whose `sum` field adds up (a hiring plan lists the
   * same role twice for two hires), instead of duplicates where one row is kept.
   */
  mergeDuplicates?: { sum: string }
  /** At least one of these fields must be filled for a row to import (e.g. employee or application ID). */
  requireOneOf?: string[]
  fields: FieldDef[]
}

export type ViewKey =
  | 'home'
  | 'team'
  | 'scorecard'
  | 'recruiting'
  | 'onboarding'
  | 'hrbp'
  | 'org'
  | 'services'
  | 'talent'
  | 'comp'
  | 'compliance'
  | 'listening'
  | 'ai'

/** Folder-tab labels, in folder-tab order. */
export const VIEW_LABEL: Record<ViewKey, string> = {
  // The role homes (docs/ROLES-V2.md, part 5): CHRO and the practice and partner roles open here.
  home: 'Home',
  team: 'My team',
  scorecard: 'Scorecard',
  recruiting: 'Recruiting',
  onboarding: 'Onboarding',
  hrbp: 'People stats',
  org: 'Org chart',
  services: 'HR ops',
  talent: 'Talent',
  comp: 'Compensation',
  compliance: 'Compliance',
  listening: 'Listening',
  ai: 'AI in HR',
}
export const VIEW_KEYS = Object.keys(VIEW_LABEL) as ViewKey[]

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
    usedBy: [
      'home',
      'team',
      'scorecard',
      'onboarding',
      'hrbp',
      'org',
      'services',
      'talent',
      'comp',
      'compliance',
      'listening',
    ],
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
        ['job family', 'family', 'functional area'],
        'Broad group of related jobs, e.g. Silicon Engineering. Each job family contains job functions.',
      ),
      f(
        'jobFunction',
        'Job function',
        'string',
        ['job function', 'function', 'job function name', 'discipline'],
        'Discipline within a job family, e.g. Design RTL.',
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
      f(
        'university',
        'University',
        'string',
        [
          'university',
          'school',
          'college',
          'institution',
          'alma mater',
          'school name',
          'university name',
          'education institution',
        ],
        'School of the highest degree, as the HRIS records it.',
      ),
      f(
        'degreeLevel',
        'Degree level',
        'enum',
        [
          'degree level',
          'degree',
          'highest degree',
          'education level',
          'highest education',
          'qualification',
          'degree type',
        ],
        "Associate, Bachelor's, Master's, PhD or Other.",
        { values: DEGREE_LEVELS },
      ),
      f(
        'fieldOfStudy',
        'Field of study',
        'string',
        [
          'field of study',
          'major',
          'area of study',
          'degree subject',
          'specialization',
          'specialisation',
          'degree field',
          'concentration',
        ],
        'The subject of the highest degree, e.g. Electrical Engineering.',
      ),
      f(
        'fte',
        'FTE',
        'number',
        [
          'fte',
          'full time equivalent',
          'fte pct',
          'fte percent',
          'work percentage',
          'scheduled hours percent',
          'standard hours percent',
        ],
        'Share of a full-time schedule: 1 is full time, 0.5 half. Values above 1.5 are read as percentages (80 is 0.8). Blank counts as 1.',
      ),
    ],
  },
  {
    key: 'jobChanges',
    label: 'Job changes',
    sheet: 'Job changes',
    description: 'Job history events: promotions, transfers, lateral moves, demotions and manager changes.',
    usedBy: ['home', 'team', 'scorecard', 'onboarding', 'hrbp', 'org', 'talent', 'comp'],
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
    usedBy: ['home', 'team', 'scorecard', 'recruiting', 'onboarding', 'org', 'comp', 'listening'],
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
    usedBy: ['home', 'team', 'scorecard', 'recruiting', 'onboarding', 'listening'],
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
        ['requisition id', 'req id', 'requisition', 'job req id', 'job id'],
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
      f(
        'startDate',
        'Start date',
        'date',
        ['start date', 'expected start date', 'anticipated start date', 'planned start date', 'first day'],
        'Expected first day for an accepted offer.',
      ),
      f(
        'competingOffer',
        'Competing offer',
        'boolean',
        [
          'competing offer',
          'other offer',
          'has competing offer',
          'competitive offer',
          'competing offer flag',
        ],
        'The candidate told us they held another offer when this one was made or decided.',
      ),
      f(
        'offerRevised',
        'Offer revised',
        'boolean',
        ['offer revised', 'revised offer', 'offer improved', 'renegotiated', 'counter made'],
        'We improved the offer after it was first extended.',
      ),
      f(
        'offerPositionInRange',
        'Offer position in range',
        'percent',
        ['position in range', 'offer position in range', 'offer range position', 'range position'],
        "Where the offered base sat in the role's pay range: 0 at the minimum, 1 at the maximum. A ratio, never an amount.",
      ),
    ],
  },
  {
    key: 'cases',
    label: 'HR cases',
    sheet: 'HR cases',
    description: 'Employee service cases from the HR help desk.',
    usedBy: ['home', 'scorecard', 'services', 'listening'],
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
    usedBy: ['home', 'scorecard', 'onboarding', 'services', 'listening'],
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
      f(
        'leaveReason',
        'Leave reason',
        'enum',
        ['leave reason', 'leave type', 'absence type', 'leave category', 'loa type', 'absence reason'],
        'Leave start only: the leave category (Parental, Medical, Family care, …). Category level only.',
        { values: LEAVE_REASONS },
      ),
      f(
        'expectedReturnDate',
        'Expected return date',
        'date',
        [
          'expected return date',
          'expected return',
          'planned return date',
          'estimated return date',
          'estimated return',
        ],
        'Leave start only: the planned return date.',
      ),
    ],
  },
  {
    key: 'reviews',
    label: 'Performance reviews',
    sheet: 'Reviews',
    description: 'Calibrated performance ratings and potential, one row per person per cycle.',
    usedBy: ['home', 'team', 'scorecard', 'hrbp', 'org', 'talent', 'comp'],
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
    usedBy: ['home', 'team', 'scorecard', 'talent'],
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
    usedBy: ['home', 'team', 'scorecard', 'onboarding', 'talent', 'compliance'],
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
    usedBy: ['home', 'scorecard', 'talent', 'comp'],
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
  {
    key: 'hiringPlan',
    label: 'Hiring plan',
    sheet: 'Hiring plan',
    description:
      'Planned starts by month and org: one row per planned role, or one row per month and department with a count.',
    usedBy: ['home', 'scorecard', 'recruiting', 'onboarding'],
    rowKey: [
      'planVersion',
      'period',
      'businessUnit',
      'department',
      'location',
      'level',
      'jobTitle',
      'reqType',
      'reqId',
      'positionId',
    ],
    mergeDuplicates: { sum: 'plannedHires' },
    fields: [
      f(
        'period',
        'Period',
        'date',
        [
          'period',
          'month',
          'plan month',
          'target start',
          'target start date',
          'target start month',
          'planned start',
          'planned start month',
          'start month',
          'hire month',
        ],
        'Month the hires are planned to start. A full date or a month such as "Nov 2026" or "2026-11".',
        { required: true },
      ),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'division', 'organization'],
        'Organization the hires join.',
        { required: true },
      ),
      f(
        'department',
        'Department',
        'string',
        ['department', 'dept', 'team', 'cost center name', 'org unit'],
        'Department the hires join.',
        { required: true },
      ),
      f(
        'plannedHires',
        'Planned hires',
        'number',
        [
          'planned hires',
          'plan hc',
          'plan headcount',
          'approved headcount',
          'approved hc',
          'hires',
          'headcount',
          'count',
          'planned starts',
        ],
        'Planned starts on this line. Blank means 1 (one row per role).',
        { required: true },
      ),
      f(
        'location',
        'Location',
        'string',
        ['location', 'site', 'office', 'work location'],
        'Planned work site.',
      ),
      f('level', 'Level', 'level', ['level', 'job level', 'grade', 'band'], 'Planned career level.'),
      f(
        'jobTitle',
        'Job title',
        'string',
        ['job title', 'title', 'role', 'position title', 'job'],
        'Planned role.',
      ),
      f(
        'reqType',
        'Req type',
        'enum',
        ['req type', 'type', 'new or backfill', 'hire type', 'reason for hire'],
        'New or Backfill.',
        { values: REQ_TYPES },
      ),
      f(
        'reqId',
        'Req ID',
        'id',
        ['req id', 'req', 'requisition id', 'requisition', 'job req id'],
        'Requisition opened for this plan line, when there is one.',
      ),
      f(
        'positionId',
        'Position ID',
        'id',
        ['position id', 'position', 'position number', 'plan line id', 'line id'],
        'Position or plan line identifier from the planning tool.',
      ),
      f(
        'planVersion',
        'Plan version',
        'string',
        ['plan version', 'version', 'scenario', 'plan name', 'plan'],
        'Name of the plan, e.g. FY27 v2.',
      ),
    ],
  },
  {
    key: 'onboardingTasks',
    label: 'Onboarding tasks',
    sheet: 'Onboarding tasks',
    description:
      'One row per person per onboarding task (Atlas ON-01 to ON-04), for pre-hires, accepted candidates and new starters.',
    usedBy: ['home', 'team', 'scorecard', 'onboarding', 'compliance', 'listening'],
    rowKey: ['employeeId', 'applicationId', 'task'],
    requireOneOf: ['employeeId', 'applicationId'],
    fields: [
      f(
        'employeeId',
        'Employee ID',
        'id',
        ['employee id', 'emp id', 'worker id', 'new hire id', 'pre hire id', 'person id'],
        'The new starter, when they are in the roster (pre-hire or employee).',
      ),
      f(
        'applicationId',
        'Application ID',
        'id',
        ['application id', 'app id', 'candidate application id', 'application'],
        'The accepted candidate, when they are not in the roster yet.',
      ),
      f(
        'task',
        'Task',
        'string',
        ['task', 'task name', 'activity', 'checklist item', 'step', 'item'],
        'Task name, e.g. Laptop shipped or I-9 Section 2.',
        { required: true },
      ),
      f(
        'owner',
        'Owner',
        'string',
        ['owner', 'task owner', 'assigned to', 'responsible', 'owner team', 'assignee'],
        'Who does it: People ops, IT, Facilities, Trade compliance, Manager, Recruiter, Payroll or New hire.',
      ),
      f(
        'dueDate',
        'Due date',
        'date',
        ['due date', 'due', 'deadline', 'target date', 'due day'],
        'When it is due. "Day -3" (3 days before the start) is converted using the start date.',
      ),
      f(
        'completedDate',
        'Completed date',
        'date',
        ['completed date', 'completed', 'completion date', 'done date', 'date completed'],
        'When it was done.',
      ),
      f(
        'status',
        'Status',
        'enum',
        ['status', 'task status', 'state'],
        'Not started, In progress, Blocked, Done or Not needed.',
        { values: ONBOARDING_STATUSES },
      ),
      f(
        'processId',
        'Process ID',
        'id',
        ['process id', 'process', 'atlas id'],
        'Hire-to-Retire Atlas process (ON-01 to ON-04).',
      ),
    ],
  },
  {
    key: 'rightToWork',
    label: 'Right to work',
    sheet: 'Right to work',
    description:
      'Work authorization expiry, Form I-9 dates and export-control license status, one row per employee. Never nationality or citizenship.',
    usedBy: ['home', 'scorecard', 'compliance'],
    rowKey: ['employeeId'],
    fields: [
      f('employeeId', 'Employee ID', 'id', ['employee id', 'emp id', 'worker id', 'id'], 'The employee.', {
        required: true,
      }),
      f(
        'authorizationType',
        'Authorization type',
        'enum',
        [
          'authorization type',
          'work authorization',
          'work authorization type',
          'visa type',
          'permit type',
          'immigration status',
          'work permit type',
        ],
        'Broad category such as Permanent (no expiry) or Employer-sponsored visa. Shown per person only when immigration details are on.',
        { values: AUTHORIZATION_TYPES, immigration: true },
      ),
      f(
        'expiryDate',
        'Authorization expiry',
        'date',
        [
          'expiry date',
          'authorization expiry',
          'work authorization expiry',
          'visa expiry',
          'permit expiry',
          'expiration date',
          'ead expiry',
        ],
        'When the work authorization ends; blank when it has no expiry.',
      ),
      f(
        'reverificationStartedDate',
        'Reverification started',
        'date',
        [
          'reverification started',
          'reverification start date',
          'renewal started',
          'extension filed',
          'renewal filed',
        ],
        'When renewal or reverification began.',
      ),
      f(
        'i9Section1Date',
        'I-9 Section 1 date',
        'date',
        ['i9 section 1', 'i 9 section 1', 'i9 section 1 date', 'section 1 date', 'i9 s1 date'],
        'US starts: date Form I-9 Section 1 was completed.',
      ),
      f(
        'i9Section2Date',
        'I-9 Section 2 date',
        'date',
        [
          'i9 section 2',
          'i 9 section 2',
          'i9 section 2 date',
          'section 2 date',
          'i9 s2 date',
          'i9 verified date',
        ],
        'US starts: date Form I-9 Section 2 was completed (due within 3 business days of the start).',
      ),
      f(
        'exportLicenseRequired',
        'Export license required',
        'boolean',
        [
          'export license required',
          'license required',
          'deemed export license required',
          'export control flag',
        ],
        'Yes when the role needs an export-control license before the person can access controlled technology.',
      ),
      f(
        'exportLicenseStatus',
        'Export license status',
        'enum',
        ['export license status', 'license status', 'deemed export status', 'export control status'],
        'Pending, Approved, Denied, Expired or Not needed.',
        { values: EXPORT_LICENSE_STATUSES },
      ),
      f(
        'exportLicenseExpiry',
        'Export license expiry',
        'date',
        ['export license expiry', 'license expiry', 'license expiration', 'export license expiration'],
        'When the export-control license ends.',
      ),
    ],
  },
  {
    key: 'surveyResponses',
    label: 'Survey responses',
    sheet: 'Survey responses',
    description:
      'One row per answer from any survey tool (long format). Respondent keys only join org, stage or req attributes; no one’s answers are ever shown.',
    usedBy: ['home', 'scorecard', 'onboarding', 'listening'],
    rowKey: ['survey', 'wave', 'respondentKey', 'item', 'subjectKey'],
    fields: [
      f(
        'survey',
        'Survey',
        'enum',
        ['survey', 'survey name', 'program', 'survey program', 'survey type', 'questionnaire'],
        'Which survey: Candidate experience, Exit survey, Onboarding pulse day 30 and so on.',
        { required: true, values: SURVEY_TYPES },
      ),
      f(
        'wave',
        'Wave',
        'string',
        ['wave', 'cycle', 'survey wave', 'period', 'round', 'pulse'],
        'Wave or cycle, e.g. 2026 Q3. Blank: the response month.',
        { required: true },
      ),
      f(
        'responseDate',
        'Response date',
        'date',
        ['response date', 'submitted', 'submitted at', 'completed at', 'date', 'response time'],
        'When the answer was given.',
        { required: true },
      ),
      f(
        'respondentKey',
        'Respondent key',
        'id',
        ['respondent key', 'respondent id', 'employee id', 'application id', 'participant id', 'external id'],
        'Employee ID, or application ID for candidates. Used only to group answers; never shown.',
        { required: true },
      ),
      f(
        'item',
        'Item',
        'string',
        ['item', 'question', 'question id', 'question code', 'item code', 'item id'],
        'Question code or short text.',
        { required: true },
      ),
      f(
        'driver',
        'Driver',
        'string',
        ['driver', 'factor', 'theme', 'dimension', 'category'],
        'What the item measures, e.g. Manager support. Blank: taken from the Survey items sheet.',
        { recommended: true },
      ),
      f(
        'score',
        'Score',
        'number',
        ['score', 'answer', 'response', 'rating', 'value', 'response value'],
        'The answer on its scale.',
        { required: true },
      ),
      f(
        'scale',
        'Scale',
        'enum',
        ['scale', 'response scale', 'answer scale', 'scale type'],
        '1-5 or 0-10. Blank: 0-10 for likelihood-to-recommend items, else 1-5.',
        { required: true, values: SURVEY_SCALES },
      ),
      f(
        'reason',
        'Reason',
        'string',
        ['reason', 'primary reason', 'reason code', 'decline reason', 'exit reason'],
        'A chosen reason, category level. Free-text comments are never imported.',
      ),
      f(
        'subjectKey',
        'Subject',
        'id',
        ['subject', 'subject id', 'req id', 'case id', 'course', 'course id', 'ticket id'],
        'What the answer is about: the req, case or course.',
      ),
      f(
        'touchpoint',
        'Touchpoint',
        'string',
        ['touchpoint', 'stage', 'interview stage', 'trigger', 'moment'],
        'For candidate surveys, the stage after which it was sent.',
      ),
    ],
  },
  {
    key: 'surveyItems',
    label: 'Survey items',
    sheet: 'Survey items',
    description: 'Optional reference: the driver each survey item measures and its target.',
    usedBy: ['home', 'scorecard', 'onboarding', 'listening'],
    rowKey: ['survey', 'item'],
    fields: [
      f(
        'item',
        'Item',
        'string',
        ['item', 'question id', 'question code', 'item code', 'item id', 'question'],
        'Question code, as in the responses.',
        { required: true },
      ),
      f(
        'driver',
        'Driver',
        'string',
        ['driver', 'factor', 'theme', 'dimension', 'category'],
        'What the item measures.',
        { required: true },
      ),
      f(
        'survey',
        'Survey',
        'enum',
        ['survey', 'survey name', 'program', 'survey type'],
        'The survey the item belongs to; blank for items shared by every survey.',
        { values: SURVEY_TYPES },
      ),
      f(
        'text',
        'Question text',
        'string',
        ['question text', 'text', 'wording', 'item text', 'statement'],
        'The question as asked.',
      ),
      f('scale', 'Scale', 'enum', ['scale', 'response scale'], '1-5 or 0-10.', { values: SURVEY_SCALES }),
      f(
        'target',
        'Target',
        'number',
        ['target', 'goal', 'benchmark', 'target score'],
        'Target mean on the item’s scale, e.g. 4.0 on 1-5.',
      ),
    ],
  },
  {
    key: 'budget',
    label: 'Headcount and cost budget',
    sheet: 'Budget',
    description:
      'Optional: budgeted headcount and cost by month, for each business unit, department or cost center. Finance sees the cost as totals only.',
    usedBy: ['home', 'scorecard', 'comp'],
    rowKey: ['planVersion', 'period', 'businessUnit', 'department', 'costCenter'],
    fields: [
      f(
        'period',
        'Period',
        'date',
        [
          'period',
          'month',
          'budget month',
          'budget period',
          'fiscal month',
          'fiscal period',
          'posting period',
          'plan month',
          'period start',
          'month start',
        ],
        'Budgeted month. A full date or a month such as "Nov 2026" or "2026-11".',
        { required: true },
      ),
      f(
        'businessUnit',
        'Business unit',
        'string',
        ['business unit', 'bu', 'business group', 'division', 'organization', 'segment'],
        'Business unit the line budgets.',
        { required: true },
      ),
      f(
        'department',
        'Department',
        'string',
        ['department', 'dept', 'team', 'org unit', 'function'],
        'Department the line budgets. Blank for a line that budgets the whole business unit.',
      ),
      f(
        'costCenter',
        'Cost center',
        'string',
        [
          'cost center',
          'cost centre',
          'cc',
          'cost center code',
          'cost centre code',
          'cost center id',
          'cc code',
          'cost object',
        ],
        'Cost center code, as in Employees. Blank for a line that budgets a whole department or business unit.',
      ),
      f(
        'budgetHeadcount',
        'Budget headcount',
        'number',
        [
          'budget headcount',
          'budgeted headcount',
          'headcount budget',
          'budget hc',
          'budgeted hc',
          'hc budget',
          'budget fte',
          'budgeted fte',
          'headcount',
          'hc',
        ],
        'Employees budgeted at the month end. Contractors and interns are not headcount.',
        { required: true },
      ),
      f(
        'budgetCost',
        'Budget cost',
        'money',
        [
          'budget cost',
          'budgeted cost',
          'cost budget',
          'budget amount',
          'budget',
          'personnel cost',
          'personnel cost budget',
          'people cost',
          'workforce cost',
          'labor cost',
          'labour cost',
          'compensation budget',
          'salary budget',
        ],
        'The month’s budgeted cost of the line: employees’ base pay and target bonus, and contractors. One month, not the year, in the currency of the Currency column.',
        { recommended: true, pay: true },
      ),
      f(
        'currency',
        'Currency',
        'string',
        ['currency', 'currency code', 'ccy', 'curr', 'budget currency', 'reporting currency'],
        'ISO currency code of the budget cost, such as USD. Blank reads as USD.',
      ),
      f(
        'planVersion',
        'Plan version',
        'string',
        ['plan version', 'version', 'budget version', 'scenario', 'plan name', 'budget name'],
        'Budget version, such as "FY27 budget". When several are loaded, the latest is read.',
      ),
    ],
  },
]
export const datasetDef = (key: DatasetKey): DatasetDef => DATASETS.find((d) => d.key === key)!
