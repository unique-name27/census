/**
 * Enum and level vocabularies: how free text from HR systems maps onto the canonical spellings in
 * `schema.ts`. Every normalizer takes `normText(raw)` and returns a canonical value or null.
 * Null means "not recognized": the importer reports it and never guesses a default.
 */
import { CANDIDATE_STATUSES, type DatasetKey, type Level, type Stage } from '../schema'
import { normText } from './text'

type Normalizer = (t: string) => string | null

/** Ordered rules: the first pattern that matches decides. */
type Rule = readonly [RegExp, string]

/** Any of the phrases as whole words; a trailing `*` lets the word continue ("promot*"). */
function words(...phrases: string[]): RegExp {
  return new RegExp(`\\b(?:${phrases.map((p) => p.replace(/\*$/, '\\w*')).join('|')})\\b`)
}

/** Any of the fragments anywhere in the text ("withdr" covers withdrew and withdrawn). */
const fragments = (...parts: string[]): RegExp => new RegExp(parts.join('|'))

const firstMatch =
  (rules: readonly Rule[]): Normalizer =>
  (t) => {
    for (const [re, value] of rules) if (re.test(t)) return value
    return null
  }

/** The canonical value whose normalized text equals `t`. */
export function matchCanonical(values: readonly string[], t: string): string | null {
  for (const v of values) if (normText(v) === t) return v
  return null
}

/* ───────────── people ───────────── */

const LEVEL_WORDS = firstMatch([
  [
    words(
      'svp',
      'evp',
      'senior vice president',
      'executive vice president',
      'senior vp',
      'executive vp',
      'sr vp',
    ),
    'E2',
  ],
  [words('vp', 'vice president', 'avp'), 'E1'],
  [
    words(
      'ceo',
      'cfo',
      'coo',
      'cto',
      'cio',
      'cpo',
      'chro',
      'cxo',
      'chief',
      'c suite',
      'csuite',
      'c level',
      'clevel',
      'president',
    ),
    'E3',
  ],
  [words('director', 'dir'), 'M2'],
  [words('manager', 'mgr', 'supervisor', 'people manager', 'management'), 'M1'],
  [words('executive'), 'E3'],
  [words('principal', 'distinguished', 'fellow'), 'L6'],
  [words('staff'), 'L5'],
  [words('senior', 'sr'), 'L4'],
  [words('junior', 'jr', 'entry', 'associate', 'intern', 'graduate', 'trainee', 'apprentice'), 'L1'],
])

/**
 * Career level from codes, numbers or title words. Codes first (L1-L6, M1-M2, E1-E3, and IC/P/T
 * 1-6 as L levels), then words from most to least senior so "Senior manager" lands on M1 and
 * "Senior staff" on L5.
 */
export function normalizeLevel(raw: unknown): Level | null {
  if (typeof raw === 'number')
    return Number.isInteger(raw) && raw >= 1 && raw <= 6 ? (`L${raw}` as Level) : null
  const t = normText(raw)
  if (!t) return null
  const compact = t.replace(/\s+/g, '')
  let m = /^(?:level|lvl|grade)?(l|ic|p|t)?([1-6])$/.exec(compact)
  if (m) return `L${m[2]}` as Level
  m = /^(?:l|ic|p|t)\s?([1-6])\b/.exec(t) ?? /^level\s?([1-6])$/.exec(t)
  if (m) return `L${m[1]}` as Level
  m = /^m\s?([12])\b/.exec(t)
  if (m) return `M${m[1]}` as Level
  m = /^e\s?([1-3])\b/.exec(t)
  if (m) return `E${m[1]}` as Level
  return LEVEL_WORDS(t) as Level | null
}

/** Contractor words are checked before employee words: "Contract employee" is a contractor. */
const employmentType = firstMatch([
  [
    words('intern', 'interns', 'internship', 'co op', 'coop', 'student', 'apprentice*', 'trainee', 'summer'),
    'Intern',
  ],
  [
    words(
      'contractor',
      'contract',
      'contingent',
      'temp',
      'temporary',
      'consult*',
      'vendor',
      'agency',
      'freelance*',
      'outsourced',
      '1099',
      'c2c',
      'cwr',
    ),
    'Contractor',
  ],
  [
    words(
      'fte',
      'regular',
      'full time',
      'fulltime',
      'part time',
      'parttime',
      'permanent',
      'employee',
      'salaried',
      'hourly',
      'exempt',
      'non exempt',
      'w2',
      'ft',
      'pt',
      'staff',
      'direct hire',
    ),
    'Employee',
  ],
])

/** Involuntary is checked first: "Terminated", "Layoff" and "RIF" must never read as voluntary. */
const terminationType = firstMatch([
  [/\binvol/, 'Involuntary'],
  [/\bvol/, 'Voluntary'],
  [
    words(
      'layoff',
      'laid off',
      'rif',
      'reduction in force',
      'redundan*',
      'dismiss*',
      'fired',
      'for cause',
      'misconduct',
      'conduct',
      'performance',
      'terminated',
      'termination',
      'eliminated',
      'position eliminated',
      'end of contract',
      'let go',
    ),
    'Involuntary',
  ],
  [
    words(
      'resign*',
      'quit',
      'retire*',
      'relocation',
      'personal',
      'better opportunity',
      'career',
      'left',
      'mutual',
      'new job',
      'family',
    ),
    'Voluntary',
  ],
])

const changeType = firstMatch([
  [words('demot*', 'downgrade*'), 'Demotion'],
  [words('promot*', 'promo', 'upgrade*'), 'Promotion'],
  [words('lateral'), 'Lateral move'],
  [
    words(
      'manager change',
      'change manager',
      'supervisor change',
      'change supervisor',
      'reports to',
      'new manager',
      'manager',
    ),
    'Manager change',
  ],
  [
    words(
      'transfer*',
      'department change',
      'change department',
      'org change',
      'organization change',
      'reorg*',
      'move',
    ),
    'Transfer',
  ],
  [words('job change', 'change job', 'role change', 'title change', 'position change'), 'Lateral move'],
])

/* ───────────── recruiting ───────────── */

const STAGE_ALIASES: Record<string, Stage> = {
  application: 'Applied',
  new: 'Applied',
  'new application': 'Applied',
  'application review': 'Applied',
  review: 'Applied',
  'resume review': 'Applied',
  screening: 'Screen',
  'phone screen': 'Screen',
  'recruiter screen': 'Screen',
  'hr screen': 'Screen',
  'phone interview': 'Screen',
  'recruiter call': 'Screen',
  'hm screen': 'Hiring manager',
  'hiring manager screen': 'Hiring manager',
  'hiring manager interview': 'Hiring manager',
  'hm interview': 'Hiring manager',
  'technical screen': 'Hiring manager',
  'technical phone screen': 'Hiring manager',
  onsite: 'Onsite',
  'on site': 'Onsite',
  'onsite interview': 'Onsite',
  panel: 'Onsite',
  'panel interview': 'Onsite',
  'final round': 'Onsite',
  'final interview': 'Onsite',
  'interview loop': 'Onsite',
  'face to face': 'Onsite',
  interview: 'Onsite',
  'offer extended': 'Offer',
  'offer stage': 'Offer',
  hire: 'Hired',
  accepted: 'Hired',
  'offer accepted': 'Hired',
  start: 'Hired',
  started: 'Hired',
}

/** Later stages are checked first, so "Hiring manager screen" is the hiring manager stage. */
const STAGE_WORDS = firstMatch([
  [words('hired', 'hire', 'onboard*', 'pre ?boarding', 'start*', 'accepted'), 'Hired'],
  [/\boffer/, 'Offer'],
  [
    words(
      'onsite',
      'on site',
      'panel',
      'final',
      'loop',
      'face to face',
      'f2f',
      'in person',
      'super ?day',
      'reference*',
    ),
    'Onsite',
  ],
  [
    words(
      'hiring manager',
      'hm',
      'technical',
      'tech',
      'assessment',
      'take home',
      'coding',
      'case study',
      'exercise',
      'manager',
    ),
    'Hiring manager',
  ],
  [words('screen*', 'phone', 'call', 'recruiter', 'intro*', 'prelim*'), 'Screen'],
  [
    words('appl*', 'new', 'review', 'resume', 'cv', 'lead', 'prospect', 'inbound', 'sourced', 'submitted'),
    'Applied',
  ],
  [/\binterview/, 'Onsite'],
])

export const normalizeStage: Normalizer = (t) => STAGE_ALIASES[t] ?? STAGE_WORDS(t)

const HIRED = words('hired', 'hire', 'started', 'onboarded', 'onboarding', 'converted', 'offer accepted')

const CANDIDATE_STATUS_WORDS = firstMatch([
  [
    fragments(
      'declined offer',
      'decline offer',
      'offer declined',
      'offer rejected',
      'turned down',
      'accepted other',
      'accepted another',
      'other offer',
      'competing offer',
      'counter offer',
      'reneged',
    ),
    'Declined',
  ],
  [
    fragments(
      'withdr',
      'no longer interested',
      'not interested',
      'unresponsive',
      'no response',
      'ghost',
      'declined interview',
      'candidate declined',
      'self selected out',
      'dropped out',
    ),
    'Withdrawn',
  ],
  [
    fragments(
      'reject',
      'archived',
      'not selected',
      'no fit',
      'not a fit',
      'declined by',
      'disqualif',
      'disposition',
      'unsuccessful',
      'not moving forward',
      'closed',
      'lost',
      'did not pass',
      'failed',
    ),
    'Rejected',
  ],
  [
    words(
      'active',
      'in process',
      'in progress',
      'open',
      'pending',
      'new',
      'review*',
      'scheduled',
      'interview*',
      'screen*',
      'offer',
      'on hold',
      'lead',
      'prospect',
    ),
    'Active',
  ],
])

/** Keyword priority from the pipeline tool: hired > declined > withdrawn > rejected > active. */
export const normalizeCandidateStatus: Normalizer = (t) => {
  const exact = matchCanonical(CANDIDATE_STATUSES, t)
  if (exact) return exact
  if (!/\bnot\b/.test(t) && (HIRED.test(t) || t === 'accepted')) return 'Hired'
  return CANDIDATE_STATUS_WORDS(t)
}

/** "Closed - filled" is checked before "Closed", which on its own means cancelled. */
const reqStatus = firstMatch([
  [words('closed filled', 'filled', 'closed hired', 'hired'), 'Filled'],
  [words('on hold', 'hold', 'paused', 'pause', 'frozen', 'freeze', 'suspended'), 'On hold'],
  [words('cancel*', 'closed', 'withdrawn', 'abandoned', 'eliminated'), 'Cancelled'],
  [
    words(
      'open',
      'opened',
      'approved',
      'sourcing',
      'active',
      'posted',
      'interviewing',
      'in progress',
      'reopened',
      'live',
    ),
    'Open',
  ],
])

const reqType = firstMatch([
  [words('backfill', 'replacement', 'replace', 'attrition'), 'Backfill'],
  [
    words('new', 'net new', 'growth', 'incremental', 'addition', 'additional', 'expansion', 'budgeted'),
    'New',
  ],
])

const reqPriority = firstMatch([
  [words('critical', 'urgent', 'p0', 'p1', 'hot', 'top', 'highest'), 'Critical'],
  [words('high', 'p2', 'important'), 'High'],
  [words('standard', 'normal', 'medium', 'low', 'regular', 'routine', 'moderate', 'p3', 'p4'), 'Standard'],
])

/* ───────────── HR ops ───────────── */

const caseStatus = firstMatch([
  [words('closed', 'cancel*'), 'Closed'],
  [words('resolved', 'solved', 'fixed', 'completed', 'complete', 'done', 'fulfilled'), 'Resolved'],
  [
    words('third party', 'vendor', 'carrier', 'external', 'provider', 'supplier', 'insurer'),
    'Waiting on third party',
  ],
  [words('waiting', 'awaiting', 'pending', 'on hold', 'hold'), 'Waiting on employee'],
  [
    words(
      'in progress',
      'work in progress',
      'wip',
      'assigned',
      'working',
      'active',
      'investigating',
      'under review',
    ),
    'In progress',
  ],
  [words('new', 'open', 'submitted', 'logged', 'unassigned', 'received'), 'New'],
])

const CASE_PRIORITY_WORDS = firstMatch([
  [words('critical', 'urgent', 'emergency'), 'P1'],
  [words('high'), 'P2'],
  [words('medium', 'moderate', 'normal', 'standard'), 'P3'],
  [words('low', 'planning'), 'P4'],
])

const casePriority: Normalizer = (t) => {
  const m = /^p?\s?([1-4])\b/.exec(t)
  return m ? `P${m[1]}` : CASE_PRIORITY_WORDS(t)
}

const CASE_TIER_WORDS = firstMatch([
  [words('self ?service', 'portal', 'knowledge'), 'Tier 0'],
  [words('front ?line', 'generalist', 'service center', 'help ?desk'), 'Tier 1'],
  [words('escalat*'), 'Tier 2'],
  [words('specialist', 'coe', 'center of excellence', 'expert'), 'Tier 3'],
])

const caseTier: Normalizer = (t) => {
  const m = /^(?:tier|t|level|l)?\s?([0-3])$/.exec(t) ?? /\b(?:tier|t|level|l)\s?([0-3])\b/.exec(t)
  return m ? `Tier ${m[1]}` : CASE_TIER_WORDS(t)
}

/** "Return from leave" before "Leave"; job events last, since many types mention a job. */
const transactionType = firstMatch([
  [words('return', 'rtw', 'end leave', 'back from leave'), 'Return from leave'],
  [words('leave', 'loa', 'absence'), 'Leave start'],
  [words('new hire', 'hire', 'hiring', 'onboard*', 'rehire'), 'New hire'],
  [words('terminat*', 'separation', 'offboard*', 'exit', 'resignation'), 'Termination'],
  [
    words('comp', 'compensation', 'salary', 'pay change', 'merit', 'bonus', 'wage', 'base pay', 'allowance'),
    'Compensation change',
  ],
  [words('location', 'relocat*', 'work site', 'office change'), 'Location change'],
  [
    words(
      'personal',
      'address',
      'name change',
      'bank',
      'contact',
      'emergency',
      'marital',
      'dependent',
      'tax',
    ),
    'Personal data change',
  ],
  [
    words(
      'job',
      'promot*',
      'transfer',
      'title',
      'position',
      'demot*',
      'lateral',
      'reorg',
      'manager change',
      'org change',
    ),
    'Job change',
  ],
])

/* ───────────── talent ───────────── */

const potential = firstMatch([
  [words('high', 'hipo', 'hi po', 'top', 'exceptional'), 'High'],
  [/^3$/, 'High'],
  [words('medium', 'moderate', 'mid', 'average', 'growth', 'promotable', 'solid'), 'Moderate'],
  [/^2$/, 'Moderate'],
  [words('low', 'limited'), 'Low'],
  [/^1$/, 'Low'],
])

const readiness = firstMatch([
  [/^ready$/, 'Ready now'],
  [words('now', 'immediate', 'immediately'), 'Ready now'],
  [fragments('0 1 year', 'less than 1', '< ?1 year', 'under 1 year', 'within 1 year'), 'Ready now'],
  [
    fragments(
      '1 2',
      'one to two',
      '1 to 2',
      '12 24',
      'near term',
      'short term',
      '\\bsoon\\b',
      '\\b1 year\\b',
      '\\b2 years?\\b',
      'next year',
    ),
    'Ready in 1-2 years',
  ],
  [
    fragments(
      '\\b3\\b',
      'three',
      'long term',
      'future',
      'later',
      'longer',
      '\\b5\\b',
      'developing',
      'emerging',
    ),
    'Ready in 3+ years',
  ],
])

const criticality = firstMatch([
  [words('critical', 'mission', 'essential', 'tier 1'), 'Critical'],
  [/^(?:1|high)$/, 'Critical'],
  [words('key', 'important', 'core', 'tier 2'), 'Key'],
  [/^(?:2|medium)$/, 'Key'],
])

const riskOfLoss = firstMatch([
  [words('high', 'severe', 'significant'), 'High'],
  [/^(?:h|3)$/, 'High'],
  [words('medium', 'med', 'moderate'), 'Medium'],
  [/^(?:m|2)$/, 'Medium'],
  [words('low', 'minimal'), 'Low'],
  [/^(?:l|1)$/, 'Low'],
])

/* ───────────── leave, onboarding, right to work, surveys ───────────── */

/**
 * Leave category from HRIS leave types. Workers' compensation before medical ("work injury"),
 * parental before family care ("family leave for birth"). Anything finer than the category
 * (a diagnosis, a condition) is never read: it either names a category or is not recognized.
 */
const leaveReason = firstMatch([
  [
    words(
      'workers comp*',
      'workmans comp*',
      'work injury',
      'work related',
      'occupational',
      'workplace injury',
      'wc',
    ),
    "Workers' compensation",
  ],
  [
    words(
      'parental',
      'maternity',
      'paternity',
      'adoption',
      'adoptive',
      'bonding',
      'birth',
      'foster',
      'surrogacy',
      'baby bonding',
      'childbirth',
    ),
    'Parental',
  ],
  [
    words('military', 'uniformed service*', 'reserve*', 'national guard', 'userra', 'armed forces'),
    'Military',
  ],
  [words('bereavement', 'funeral', 'compassionate', 'death'), 'Bereavement'],
  [words('jury', 'civic', 'voting', 'witness', 'court', 'election'), 'Civic duty'],
  [words('sabbatical', 'career break', 'study', 'education*', 'academic'), 'Sabbatical'],
  [
    words(
      'family care',
      'caregiv*',
      'carer*',
      'elder care',
      'family member',
      'care of family',
      'family medical',
    ),
    'Family care',
  ],
  [
    words(
      'medical',
      'sick*',
      'illness',
      'health',
      'disability',
      'std',
      'ltd',
      'short term',
      'long term',
      'surgery',
    ),
    'Medical',
  ],
  [words('personal', 'unpaid', 'lwop', 'without pay', 'leave of absence'), 'Personal'],
])

/** "Not started" before "Done" so "not done" lands right; waived and not applicable first. */
const onboardingStatus = firstMatch([
  [/^(?:n a|na|n\/a)$/, 'Not needed'],
  [
    words(
      'not needed',
      'not applicable',
      'not required',
      'waived',
      'exempt',
      'skipped',
      'n a',
      'cancelled',
      'canceled',
    ),
    'Not needed',
  ],
  [
    words(
      'not started',
      'not done',
      'to do',
      'todo',
      'open',
      'new',
      'assigned',
      'not complete*',
      'incomplete',
    ),
    'Not started',
  ],
  [/^(?:no|false|0)$/, 'Not started'],
  [
    words('blocked', 'on hold', 'hold', 'stuck', 'issue', 'escalated', 'waiting', 'failed', 'flagged'),
    'Blocked',
  ],
  [
    words(
      'in progress',
      'started',
      'ongoing',
      'wip',
      'pending',
      'submitted',
      'initiated',
      'in review',
      'scheduled',
      'ordered',
    ),
    'In progress',
  ],
  [
    words(
      'done',
      'complete*',
      'closed',
      'finished',
      'cleared',
      'approved',
      'shipped',
      'delivered',
      'signed',
      'yes',
      'true',
      'ready',
    ),
    'Done',
  ],
  [/^1$/, 'Done'],
])

/**
 * Work authorization categories. Immigration programs are read into broad categories only, and
 * citizens and permanent residents both become "Permanent (no expiry)": nationality and
 * citizenship are never kept.
 */
const authorizationType = firstMatch([
  [
    fragments('\\bh ?4\\b', '\\bl ?2\\b', '\\bdependa?ent', '\\bspouse', '\\bspousal', '\\be ?3d\\b'),
    'Dependent work authorization',
  ],
  [
    fragments(
      '\\bopt\\b',
      '\\bcpt\\b',
      '\\bstem\\b',
      '\\bf ?1\\b',
      '\\bj ?1\\b',
      'student',
      'practical training',
    ),
    'Student work authorization',
  ],
  [
    fragments(
      '\\bead\\b',
      'employment authori[sz]ation',
      '\\bi ?766\\b',
      '\\bc ?0?9\\b',
      'work authori[sz]ation card',
    ),
    'Employment authorization document',
  ],
  [fragments('\\bl ?1 ?[ab]?\\b', 'intra ?company', '\\bict\\b'), 'Intra-company transfer'],
  [
    fragments(
      '\\bh ?1 ?b ?1?\\b',
      '\\be ?3\\b',
      '\\btn\\b',
      '\\bo ?1 ?[ab]?\\b',
      '\\be ?2\\b',
      'sponsor',
      'skilled worker',
      'work visa',
      'employment pass',
      'tier 2',
      'critical skills',
      'visa',
    ),
    'Employer-sponsored visa',
  ],
  [
    fragments('blue card', 'work permit', 'residence permit', 'permit', 'gold card', 'work pass'),
    'Work permit',
  ],
  [
    fragments(
      'citizen',
      '\\bnational\\b',
      'permanent',
      'green card',
      '\\blpr\\b',
      '\\bpr\\b',
      'indefinite',
      'settled',
      'no expiry',
      'no expiration',
      'unrestricted',
      'not required',
      '^n a$',
    ),
    'Permanent (no expiry)',
  ],
  [fragments('temporary', '\\btps\\b', 'parole', '\\bother\\b', 'time limited'), 'Other time-limited'],
])

const exportLicenseStatus = firstMatch([
  [
    words(
      'not needed',
      'not required',
      'n a',
      'na',
      'exempt',
      'none',
      'no license required',
      'nlr',
      'ear99',
      'no',
    ),
    'Not needed',
  ],
  [words('expired', 'lapsed'), 'Expired'],
  [words('denied', 'rejected', 'refused', 'declined', 'returned without action', 'rwa'), 'Denied'],
  [
    words(
      'pending',
      'applied',
      'submitted',
      'in progress',
      'under review',
      'filed',
      'requested',
      'in review',
    ),
    'Pending',
  ],
  [words('approved', 'granted', 'issued', 'active', 'valid', 'licensed', 'yes'), 'Approved'],
])

/** Survey programs. Specific names first: "Onboarding pulse day 30" before plain "pulse". */
const surveyType = firstMatch([
  [fragments('hiring manager', '\\bhm\\b', 'intake satisfaction', 'req fill'), 'Hiring manager satisfaction'],
  [
    fragments('candidate', '\\bcx\\b', '\\bcnps\\b', 'interview experience', 'applicant'),
    'Candidate experience',
  ],
  [fragments('\\b30\\b', 'thirty'), 'Onboarding pulse day 30'],
  [fragments('\\b90\\b', 'ninety'), 'Onboarding pulse day 90'],
  [fragments('stay'), 'Stay interview'],
  [fragments('\\bexit', 'leaver', 'separation', 'offboarding'), 'Exit survey'],
  [fragments('return to work', '\\brtw\\b', 'back from leave', 'return from leave'), 'Return to work'],
  [
    fragments(
      'upward',
      'manager feedback',
      'manager effectiveness',
      'manager survey',
      '\\b180\\b',
      'leader feedback',
    ),
    'Manager feedback',
  ],
  [
    fragments('hr service', '\\bcase', 'ticket', 'help ?desk', 'csat', 'service survey', 'people services'),
    'HR service survey',
  ],
  [
    fragments('training', 'course', 'learning', 'smile sheet', 'level 1', 'kirkpatrick'),
    'Training evaluation',
  ],
  [fragments('engagement', 'enps', 'pulse', 'culture', 'annual survey', 'opinion'), 'Engagement'],
])

const surveyScale = firstMatch([
  [
    fragments(
      '\\b0 ?(?:to )?10\\b',
      '\\b11 ?point',
      '\\bnps\\b',
      '\\bltr\\b',
      '^10$',
      'ten point',
      'recommend',
    ),
    '0-10',
  ],
  [fragments('\\b1 ?(?:to )?5\\b', '\\b5 ?point', '^5$', 'five point', 'likert'), '1-5'],
])

/** Field-specific normalizers for every enum field in `DATASETS`, keyed `dataset.field`. */
export const ENUM_NORMALIZERS: Record<string, Normalizer> = {
  'employees.terminationType': terminationType,
  'employees.employmentType': employmentType,
  'jobChanges.changeType': changeType,
  'requisitions.status': reqStatus,
  'requisitions.reqType': reqType,
  'requisitions.priority': reqPriority,
  'candidates.currentStage': normalizeStage,
  'candidates.status': normalizeCandidateStatus,
  'cases.status': caseStatus,
  'cases.priority': casePriority,
  'cases.tier': caseTier,
  'transactions.type': transactionType,
  'reviews.potential': potential,
  'succession.criticality': criticality,
  'succession.readiness': readiness,
  'succession.incumbentRiskOfLoss': riskOfLoss,
  'transactions.leaveReason': leaveReason,
  'hiringPlan.reqType': reqType,
  'onboardingTasks.status': onboardingStatus,
  'rightToWork.authorizationType': authorizationType,
  'rightToWork.exportLicenseStatus': exportLicenseStatus,
  'surveyResponses.survey': surveyType,
  'surveyResponses.scale': surveyScale,
  'surveyItems.survey': surveyType,
  'surveyItems.scale': surveyScale,
}

/** Canonical value for an enum field: exact spelling first, then the field's own vocabulary. */
export function normalizeEnumValue(
  dataset: DatasetKey,
  field: string,
  values: readonly string[],
  raw: unknown,
): string | null {
  const t = normText(raw)
  if (!t) return null
  const exact = matchCanonical(values, t)
  if (exact) return exact
  const fn = ENUM_NORMALIZERS[`${dataset}.${field}`]
  const v = fn ? fn(t) : null
  return v && values.includes(v) ? v : null
}
