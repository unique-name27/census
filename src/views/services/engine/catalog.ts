/**
 * The Hire-to-Retire Atlas processes behind HR ops, and the measurable targets the
 * Service levels scorecard tracks.
 *
 * Process names, owners and service-level wording are quoted from the Atlas process library
 * (data/proc-*.json). Final pay rules are condensed from each jurisdiction's
 * terminationDeepDive.finalPayTiming (data/country-*.json). Where Census measures something close
 * to, but not exactly, what the Atlas KPI says, the row says how it was adapted.
 */
import type { TransactionType } from '@/data/schema'

export interface AtlasProcess {
  id: string
  /** Short name used in sentences: "Review the PY-05 payroll correction steps". */
  short: string
  name: string
  /** The accountable function, first in the Atlas owner field. */
  owner: string
  /** The process service level, as the Atlas writes it. */
  sla: string
}

const processes: AtlasProcess[] = [
  {
    id: 'PY-05',
    short: 'payroll correction',
    name: 'Payroll error correction & overpayment recovery',
    owner: 'Payroll',
    sla: 'Underpayments paid within 2 business days of confirmation (via PY-02); overpayment notice to the employee within 5 business days of confirmation',
  },
  {
    id: 'BN-03',
    short: 'life event',
    name: 'Qualifying life events',
    owner: 'Benefits',
    sla: 'Employee reports within 30 days (60 days for Medicaid/CHIP events); processed within 5 business days of complete documentation',
  },
  {
    id: 'LV-01',
    short: 'leave',
    name: 'Leave of absence',
    owner: 'Benefits, Leave & Accommodation team',
    sla: 'Eligibility/rights notice within 5 business days of the request; designation within 5 business days of complete certification; pay set up before the first affected payroll',
  },
  {
    id: 'LV-03',
    short: 'return to work',
    name: 'Return to work',
    owner: 'Benefits, Leave & Accommodation team',
    sla: 'Return confirmed 10 business days ahead; systems active on the return day; 30-day check-in',
  },
  {
    id: 'ON-01',
    short: 'preboarding',
    name: 'Preboarding (accept to Day 1)',
    owner: 'People Ops',
    sla: 'Start date at least 10 business days after acceptance (15 for export-flagged roles, longer where notice periods apply, e.g. India 60-90 days); all contingencies cleared by Day -3',
  },
  {
    id: 'ON-03',
    short: 'hire entry',
    name: 'Hire transaction & HRIS setup',
    owner: 'People Ops',
    sla: 'Hire entered and approved by Day -3, and always before the input cut-off of the first pay period',
  },
  {
    id: 'OF-05',
    short: 'final pay',
    name: 'Final pay, benefits & equity at exit',
    owner: 'Payroll',
    sla: 'Per jurisdiction: CA immediate on discharge (72 hours on resignation without notice); India 2 working days; BC 48 hours (terminated) or 6 days (quit); ON later of 7 days or next payday; Taiwan immediate; China at termination.',
  },
  {
    id: 'DS-01',
    short: 'data change',
    name: 'Employee data changes & data quality',
    owner: 'People Ops (HRIS data steward)',
    sla: 'Changes entered at least 3 business days before payroll cut-off; reconciliation exceptions resolved within 5 business days',
  },
  {
    id: 'DS-04',
    short: 'HRIS access',
    name: 'HRIS access & segregation of duties',
    owner: 'People Ops (HRIS role owner)',
    sla: 'Access provisioned within 2 business days of approval; leaver access removed same day; UAR completed within 15 business days of quarter-end',
  },
  {
    id: 'DS-07',
    short: 'verification',
    name: 'Employment verification requests',
    owner: 'People Ops (verification desk)',
    sla: 'Third-party verifications 2 business days; employee letters 3 business days; statutory certificates by local deadline (Karnataka 7 days from request; China at termination)',
  },
  {
    id: 'EQ-01',
    short: 'equity administration',
    name: 'Equity grant administration',
    owner: 'Stock Admin',
    sla: 'Grants made on the first scheduled grant date after start or approval; recorded within 1 business day; Form 4 within 2 business days; agreements accepted within 90 days',
  },
  {
    id: 'CO-02',
    short: 'compensation change',
    name: 'Annual compensation review',
    owner: 'Total Rewards',
    sla: "About 12 weeks from budget approval to letters; pay changes reconciled on the first payroll after each country's effective date",
  },
  {
    id: 'MV-04',
    short: 'location change',
    name: 'Remote work & work-location change',
    owner: 'HRBP',
    sla: 'Decision within 10 business days; payroll registration completed before the first pay date in the new location',
  },
  {
    id: 'MV-05',
    short: 'job change',
    name: 'Status & classification change',
    owner: 'Total Rewards',
    sla: 'Analysis within 10 business days; implemented within one pay period of approval',
  },
  {
    id: 'MV-06',
    short: 'immigration',
    name: 'Immigration maintenance & green cards',
    owner: 'Immigration',
    sla: 'Extension filings at least 90 days before expiry (180-day alert); amendments filed before the change takes effect; PERM filed within 9 months of sponsorship approval',
  },
  {
    id: 'ER-01',
    short: 'intake',
    name: 'Speak-up intake & triage',
    owner: 'Ethics & Compliance',
    sla: 'Log within 1 business day; acknowledge within 2 bd; triage and assign within 3 bd (Severity 1 same day)',
  },
  {
    id: 'ER-02',
    short: 'investigation',
    name: 'Workplace investigation',
    owner: 'Employee Relations',
    sla: 'Plan within 3 business days of assignment; standard investigations closed within 30 calendar days, complex within 60; statutory deadlines override (e.g., India IC 90 days)',
  },
]

export const ATLAS_PROCESSES: ReadonlyMap<string, AtlasProcess> = new Map(processes.map((p) => [p.id, p]))

/** "PY-05 Payroll error correction & overpayment recovery", or the bare ID when it is not in the Atlas. */
export function processLabel(id: string | null | undefined): string {
  if (!id) return '—'
  const p = ATLAS_PROCESSES.get(id)
  return p ? `${p.id} ${p.name}` : id
}

/* ───────────── service-level scorecard ───────────── */

export type ServiceLevelId =
  | 'py05-payroll-2bd'
  | 'ds07-verification-2bd'
  | 'lv01-leave-response-1bd'
  | 'lv01-leave-designation-5bd'
  | 'on03-hire-day-minus-3'
  | 'of05-final-pay'
  | 'ds01-retro-share'
  | 'ds04-access-2bd'
  | 'er02-median-days'
  | 'bn03-benefits-5bd'
  | 'mv06-immigration-response-1bd'
  | 'mv04-location-cutoff'
  | 'mv05-job-change-cutoff'
  | 'lv03-return-ready'

export interface ServiceLevelDef {
  id: ServiceLevelId
  processId: string
  /** What Census measures, in plain words. */
  measure: string
  /** The target as a reader sees it. */
  targetText: string
  target: number
  /** 'min': the actual must reach the target. 'max': it must stay at or under it. */
  direction: 'min' | 'max'
  /** For 'max' targets written as "below": the actual must be strictly under the target. */
  strict?: boolean
  unit: 'share' | 'days'
  /** The Atlas KPI or service level this row tracks, quoted. */
  atlas: string
  basis: 'Atlas KPI' | 'Atlas service level' | 'Census target'
  /** How the measure differs from the Atlas wording, when it does. */
  adaptation?: string
  /** Team that owns the work. */
  team: string
  /**
   * For case measures: the case category, so the scorecard can show the help desk's own
   * resolution SLA (calendar hours, as on the Cases tab and in the readout) beside the Atlas clock.
   */
  caseCategory?: string
}

export const SERVICE_LEVELS: readonly ServiceLevelDef[] = [
  {
    id: 'py05-payroll-2bd',
    processId: 'PY-05',
    measure: 'Payroll cases resolved within 2 business days',
    targetText: '≥ 95%',
    target: 0.95,
    direction: 'min',
    unit: 'share',
    atlas: 'Underpayments corrected within 2 business days: ≥ 98%',
    basis: 'Census target',
    adaptation:
      'The Atlas KPI covers underpayments only; Census measures every payroll case, so the target is 95%.',
    team: 'Payroll',
    caseCategory: 'Payroll',
  },
  {
    id: 'ds07-verification-2bd',
    processId: 'DS-07',
    measure: 'Employment verification cases resolved within 2 business days',
    targetText: '≥ 95%',
    target: 0.95,
    direction: 'min',
    unit: 'share',
    atlas: 'Third-party verifications within 2 business days: ≥ 95%',
    basis: 'Atlas KPI',
    team: 'People operations',
    caseCategory: 'Employment verification',
  },
  {
    id: 'lv01-leave-response-1bd',
    processId: 'LV-01',
    measure: 'Leave cases with a first response within 1 business day',
    targetText: '≥ 98%',
    target: 0.98,
    direction: 'min',
    unit: 'share',
    atlas: 'Notice timeliness: ≥ 98% within 5 business days',
    basis: 'Census target',
    adaptation:
      'Cases do not record when the rights notice went out, so Census measures the first response on a 1 business day clock.',
    team: 'Leave & accommodation',
    caseCategory: 'Leave & accommodation',
  },
  {
    id: 'lv01-leave-designation-5bd',
    processId: 'LV-01',
    measure: 'Leave cases resolved within 5 business days',
    targetText: '≥ 95%',
    target: 0.95,
    direction: 'min',
    unit: 'share',
    atlas: 'Designation within 5 business days of complete certification',
    basis: 'Census target',
    adaptation:
      'Cases do not record when certification was complete, so Census measures opened to resolved on a 5 business day clock, against a 95% target.',
    team: 'Leave & accommodation',
    caseCategory: 'Leave & accommodation',
  },
  {
    id: 'on03-hire-day-minus-3',
    processId: 'ON-03',
    measure: 'New hires entered and approved by Day −3',
    targetText: '100%',
    target: 1,
    direction: 'min',
    unit: 'share',
    atlas: 'Hire entered and approved by Day -3, and always before the input cut-off of the first pay period',
    basis: 'Atlas service level',
    team: 'People operations',
  },
  {
    id: 'of05-final-pay',
    processId: 'OF-05',
    measure: "Final pay on time by the jurisdiction's deadline",
    targetText: '100%',
    target: 1,
    direction: 'min',
    unit: 'share',
    atlas: 'Final pay on time: 100%',
    basis: 'Atlas KPI',
    team: 'Payroll',
  },
  {
    id: 'ds01-retro-share',
    processId: 'DS-01',
    measure: 'Job and pay changes processed after the payroll cut-off (retro)',
    targetText: '< 2% of changes',
    target: 0.02,
    direction: 'max',
    strict: true,
    unit: 'share',
    atlas: 'Retro transactions (changes after cut-off): < 2% of changes',
    basis: 'Atlas KPI',
    team: 'HRIS',
  },
  {
    id: 'ds04-access-2bd',
    processId: 'DS-04',
    measure: 'Systems access cases resolved within 2 business days',
    targetText: '≥ 98%',
    target: 0.98,
    direction: 'min',
    unit: 'share',
    atlas: 'Access provisioned within 2 business days of approval',
    basis: 'Atlas service level',
    team: 'HRIS',
    caseCategory: 'Systems access',
  },
  {
    id: 'er02-median-days',
    processId: 'ER-02',
    measure: 'Median calendar days from opened to closed, employee relations cases',
    targetText: '≤ 30 d',
    target: 30,
    direction: 'max',
    unit: 'days',
    atlas: 'Median days assignment to closure letter: ≤ 30 calendar days standard; ≤ 60 complex',
    basis: 'Atlas KPI',
    adaptation: 'Cases record when they were opened, not assigned, so the clock starts at intake.',
    team: 'Employee relations',
    caseCategory: 'Employee relations',
  },
  {
    id: 'bn03-benefits-5bd',
    processId: 'BN-03',
    measure: 'Benefits cases resolved within 5 business days',
    targetText: '≥ 95%',
    target: 0.95,
    direction: 'min',
    unit: 'share',
    atlas: 'Processing time from complete proof: ≤ 5 business days for 95% of events',
    basis: 'Atlas KPI',
    team: 'Benefits',
    caseCategory: 'Benefits',
  },
  {
    id: 'mv06-immigration-response-1bd',
    processId: 'MV-06',
    measure: 'Immigration cases with a first response within 1 business day',
    targetText: '≥ 95%',
    target: 0.95,
    direction: 'min',
    unit: 'share',
    atlas:
      'Extension filings at least 90 days before expiry (180-day alert); amendments filed before the change takes effect',
    basis: 'Census target',
    adaptation:
      'The Atlas MV-06 KPIs (status lapses, filing lead times) need filing data that cases do not carry, so Census tracks the first response.',
    team: 'Global mobility',
    caseCategory: 'Immigration & mobility',
  },
  {
    id: 'mv04-location-cutoff',
    processId: 'MV-04',
    measure: 'Location changes processed by the payroll cut-off',
    targetText: '100%',
    target: 1,
    direction: 'min',
    unit: 'share',
    atlas: 'Location changes registered before the first pay date: 100%',
    basis: 'Atlas KPI',
    team: 'Payroll',
  },
  {
    id: 'mv05-job-change-cutoff',
    processId: 'MV-05',
    measure: 'Job changes processed by the payroll cut-off',
    targetText: '100%',
    target: 1,
    direction: 'min',
    unit: 'share',
    atlas: 'Changes implemented within one pay period of approval: 100%',
    basis: 'Atlas KPI',
    team: 'People operations',
  },
  {
    id: 'lv03-return-ready',
    processId: 'LV-03',
    measure: 'Returns from leave processed by the return date',
    targetText: '≥ 98%',
    target: 0.98,
    direction: 'min',
    unit: 'share',
    atlas: 'Systems and access ready on return day: ≥ 98% of returns',
    basis: 'Atlas KPI',
    team: 'Leave & accommodation',
  },
]

/** Case-level service-level targets in Census (the KPI strip and the figures use these). */
export const RESOLUTION_SLA_TARGET = 0.9
export const TRANSACTION_ON_TIME_TARGET = 0.98
/** "At risk" band for percentage targets (points below the target). */
export const AT_RISK_PTS = 0.05
/** "At risk" band for day targets (share above the target). */
export const AT_RISK_DAYS_SHARE = 0.1
/**
 * "At risk" band for ceiling targets on a share ("under 2%"): up to 25% above the target. A fixed
 * 5-point band would call a retro rate 3.5 times the target "at risk", so ceilings use a relative band.
 */
export const AT_RISK_CEILING_SHARE = 0.25

/* ───────────── final pay rules by jurisdiction ───────────── */

export interface FinalPayRule {
  jurisdiction: string
  /** Jurisdiction name as the Atlas writes it. */
  name: string
  /** The rule in one line. */
  rule: string
  /** The deadline as it reads inside a sentence. */
  phrase: string
}

/** Condensed from the Atlas terminationDeepDive.finalPayTiming for each jurisdiction. */
export const FINAL_PAY_RULES: ReadonlyMap<string, FinalPayRule> = new Map(
  [
    {
      jurisdiction: 'us-ca',
      name: 'California',
      rule: 'Same day for involuntary, last day for voluntary (72 hours without notice)',
      phrase: 'the same day for involuntary exits, the last day for voluntary ones',
    },
    {
      jurisdiction: 'us-tx',
      name: 'Texas',
      rule: 'By the 6th calendar day for involuntary, next regular payday for voluntary',
      phrase: 'the 6th calendar day for involuntary exits, the next regular payday for voluntary ones',
    },
    {
      jurisdiction: 'us-co',
      name: 'Colorado',
      rule: 'Immediately for involuntary, next regular payday for voluntary',
      phrase: 'immediately for involuntary exits, the next regular payday for voluntary ones',
    },
    {
      jurisdiction: 'us-nc',
      name: 'North Carolina',
      rule: 'Next regular payday for every separation',
      phrase: 'the next regular payday',
    },
    {
      jurisdiction: 'us-wa',
      name: 'Washington',
      rule: 'End of the established pay period',
      phrase: 'the end of the pay period',
    },
    {
      jurisdiction: 'ca',
      name: 'Canada',
      rule: 'Ontario: later of 7 days or the next payday. British Columbia: 48 hours if terminated, 6 days if the employee quits',
      phrase: 'the later of 7 days or the next payday in Ontario; 48 hours or 6 days in British Columbia',
    },
    {
      jurisdiction: 'de',
      name: 'Germany',
      rule: 'Normal pay date (no accelerated deadline)',
      phrase: 'the normal pay date',
    },
    {
      jurisdiction: 'il',
      name: 'Israel',
      rule: 'Regular payday, by the 9th of the following month',
      phrase: 'the regular payday, by the 9th of the following month',
    },
    {
      jurisdiction: 'in',
      name: 'India',
      rule: 'Within 2 working days of the last day',
      phrase: '2 working days after the last day',
    },
    {
      jurisdiction: 'tw',
      name: 'Taiwan',
      rule: 'Immediately on termination',
      phrase: 'the day of termination',
    },
    { jurisdiction: 'cn', name: 'China', rule: 'In full on termination', phrase: 'the day of termination' },
    {
      jurisdiction: 'vn',
      name: 'Vietnam',
      rule: 'Within 14 working days of termination',
      phrase: '14 working days after termination',
    },
  ].map((r) => [r.jurisdiction, r]),
)

/** Process that governs each transaction type, with the deadline in words. */
export const TRANSACTION_DEADLINES: Record<TransactionType, string> = {
  'New hire': 'Day −3: three business days before the start date',
  Termination: "Final pay deadline for the leaver's jurisdiction and exit type",
  'Job change': 'Payroll cut-off for the effective month',
  'Compensation change': 'Payroll cut-off for the effective month',
  'Leave start': 'The leave start date',
  'Return from leave': 'The return date',
  'Location change': 'Payroll cut-off for the effective month',
  'Personal data change': '2 business days after submission',
}
