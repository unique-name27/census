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
