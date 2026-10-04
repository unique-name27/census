/**
 * The HR ops view's metric dictionary entries (docs/METRICS.md): one per KPI, per figure measure
 * and per readout rule, registered with `defineMetrics('services', [...])`. Each entry is the
 * single source of the metric's wording (KPI info popovers and Figure definitions read it through
 * `ctx.metrics.def(id)`) and of the settings the engine calculates with (read through
 * `ctx.metrics.num(id, key)` in engine/settings.ts, never as constants).
 *
 * Wording never quotes a number a setting governs: the target or threshold in force is added
 * where the number is shown, so an edited setting can't leave stale text behind.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'. From the engine it imports only './engine/catalog' and
 * './engine/lineage', which import nothing but plain data.
 */
import { CASE_CATEGORIES, TRANSACTION_PROCESS, TRANSACTION_TYPES } from '@/data/schema'
import { defineMetrics, type MetricInput } from '@/metrics/define'
import type { MetricDef, ParamDef } from '@/metrics/types'
import { LEVEL_CLOCKS, SERVICE_LEVELS, type ServiceLevelDef, type ServiceLevelId } from './engine/catalog'
import {
  LEAVE,
  levelUses,
  lineage,
  type ServicesFigureId,
  SURVEY_FALLBACK_USES,
  union,
} from './engine/lineage'

/** Metric ids, by what the view calls them. */
export const M = {
  opened: 'services.cases.opened',
  backlog: 'services.cases.backlog',
  aged: 'services.cases.aged',
  resolutionSla: 'services.cases.resolutionSla',
  responseSla: 'services.cases.responseSla',
  timeToResolve: 'services.cases.timeToResolve',
  resolveVsTarget: 'services.cases.resolveVsTarget',
  csat: 'services.cases.csat',
  reopenRate: 'services.cases.reopenRate',
  escalationRate: 'services.cases.escalationRate',
  firstContact: 'services.cases.firstContact',
  arrivals: 'services.cases.arrivals',
  onTime: 'services.tx.onTime',
  daysVsDue: 'services.tx.daysVsDue',
  finalPay: 'services.tx.finalPay',
  retroShare: 'services.tx.retroShare',
  levelStatus: 'services.levels.status',
  levelGap: 'services.levels.gap',
  processVolume: 'services.levels.processVolume',
  spike: 'services.readout.volumeSpike',
  slow: 'services.readout.slowCategory',
  finalPayLate: 'services.readout.finalPayLate',
  newHireGap: 'services.readout.newHireReadiness',
  csatGap: 'services.readout.csatGap',
  reopenHotspot: 'services.readout.reopenHotspot',
  agedBacklog: 'services.readout.agedBacklog',
  retroOver: 'services.readout.retroOverTarget',
  strongest: 'services.readout.strongestCategory',
  /* leave and return */
  onLeave: 'services.leave.onLeave',
  leaveLength: 'services.leave.length',
  returnsSoon: 'services.leave.returnsSoon',
  systemsReady: 'services.leave.systemsReady',
  returnRate: 'services.leave.returnRate',
  retention: 'services.leave.retention',
  exitsAfterReturn: 'services.leave.exitsAfterReturn',
  exitsDuringLeave: 'services.leave.exitsDuringLeave',
  returnSurvey: 'services.leave.returnSurvey',
  retentionLow: 'services.readout.retentionAfterReturn',
  returnsNotReady: 'services.readout.returnsNotReady',
  exitCluster: 'services.readout.exitsAfterReturn',
} as const

/** The metric of one Atlas service level in the scorecard: 'services.levels.py05-payroll-2bd'. */
export const levelMetric = (id: ServiceLevelId): string => `services.levels.${id}`

/** The setting key of a case category: 'Leave & accommodation' → 'leaveAccommodation'. */
export function categoryKey(category: string): string {
  const words = category.split(/[^A-Za-z0-9]+/).filter(Boolean)
  return words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('')
}

/** The metric each figure shows (its `metric`, for "Edit definition" and the quality lens). */
export const FIGURE_METRIC: Record<ServicesFigureId, string> = {
  'services-cases-by-month': M.opened,
  'services-sla-by-month': M.resolutionSla,
  'services-cases-by-category': M.opened,
  'services-backlog-by-age': M.backlog,
  'services-tx-on-time-by-month': M.onTime,
  'services-sla-by-category': M.resolutionSla,
  'services-time-to-resolve': M.resolveVsTarget,
  'services-arrivals': M.arrivals,
  'services-csat-by-channel': M.csat,
  'services-reopen-escalate': M.reopenRate,
  'services-team-workload': M.firstContact,
  'services-aged-cases': M.aged,
  'services-tx-on-time-by-type': M.onTime,
  'services-tx-days-early-late': M.daysVsDue,
  'services-final-pay': M.finalPay,
  'services-retro-by-month': M.retroShare,
  'services-scorecard': M.levelStatus,
  'services-gap-to-target': M.levelGap,
  'services-response-by-category': M.responseSla,
  'services-atlas-processes': M.processVolume,
  'services-leave-on-leave': M.onLeave,
  'services-leave-length': M.leaveLength,
  'services-leave-return-rate': M.returnRate,
  'services-leave-returns-soon': M.systemsReady,
  'services-leave-survey': M.returnSurvey,
  'services-leave-retention': M.retention,
  'services-leave-exits': M.exitsAfterReturn,
}

/* ───────────── settings ───────────── */

/** Today's defaults; engine/settings.ts reads the values in force through the registry. */
export const DEFAULTS = {
  resolutionTarget: 0.9,
  onTimeTarget: 0.98,
  agedDays: 14,
  atRiskPts: 0.05,
  atRiskDaysShare: 0.1,
  atRiskCeilingShare: 0.25,
  /** Retention after return from leave (VIEWS.md, Leave & return). */
  retentionTarget: 0.9,
} as const

const share = (
  key: string,
  label: string,
  description: string,
  value: number,
  o: Partial<ParamDef> = {},
): ParamDef => ({
  key,
  label,
  description,
  type: 'percent',
  default: value,
  min: 0,
  max: 1,
  step: 0.005,
  format: 'pct',
  ...o,
})

const count = (
  key: string,
  label: string,
  description: string,
  value: number,
  min = 1,
  max = 1000,
): ParamDef => ({ key, label, description, type: 'number', default: value, min, max, step: 1, format: 'int' })

const times = (
  key: string,
  label: string,
  description: string,
  value: number,
  min = 1,
  max = 10,
): ParamDef => ({
  key,
  label,
  description,
  type: 'number',
  default: value,
  min,
  max,
  step: 0.1,
  format: 'times',
})

const days = (key: string, label: string, description: string, value: number, max = 365): ParamDef => ({
  key,
  label,
  description,
  type: 'days',
  default: value,
  min: 1,
  max,
  step: 1,
})

/**
 * A case category inside a sentence, with its article: "an onboarding case", "a payroll case",
 * "an HR data & records case". Acronyms keep their capitals; other words go lowercase.
 */
export function categoryPhrase(category: string): string {
  const words = category.split(' ').map((w) => (/^[A-Z]{2,}\b/.test(w) ? w : w.toLowerCase()))
  const first = words[0] ?? ''
  // "An" before a vowel sound: a vowel, or an acronym read letter by letter from one (HR, "aitch").
  const vowelSound = /^[aeiou]/i.test(first) || /^[AEFHILMNORSX][A-Z]/.test(first)
  return `${vowelSound ? 'an' : 'a'} ${words.join(' ')} case`
}

/** One calendar-hour target per case category, defaulting to the schema's service levels. */
function categoryTargets(kind: 'response' | 'resolution'): ParamDef[] {
  return CASE_CATEGORIES.map((c) => ({
    key: categoryKey(c.category),
    label: `${c.category} ${kind} target`,
    description:
      kind === 'response'
        ? `Calendar hours from opened to the first reply for ${categoryPhrase(c.category)}. A case whose file gives it a different target of its own keeps that one.`
        : `Calendar hours from opened to resolved for ${categoryPhrase(c.category)}. A case whose file gives it a different target of its own keeps that one.`,
    type: 'number',
    default: kind === 'response' ? c.responseHours : c.resolutionHours,
    min: 1,
    max: 2160,
    step: 1,
    format: 'hours',
  }))
}

/* ───────────── lineage ───────────── */

/** The field groups behind the view's measures, for a cases file with resolved times. */
const L = lineage({ resolvedAt: true })

const OWNER = 'People analytics'
const PERIOD = 'The period picker (default last 12 months).'
const TREND = 'The 24 months to the as-of date, by month; the period picker for the other charts.'
const AS_OF = 'The as-of date.'

/* ───────────── Atlas service levels ───────────── */

const CLOCK_STOP = { resolved: 'resolved', responded: 'first response' } as const

/** The transaction type an Atlas process governs ('ON-03' → 'New hire'). */
const txTypeOf = (processId: string): string =>
  TRANSACTION_TYPES.find((t) => TRANSACTION_PROCESS[t] === processId) ?? 'HR'

/** One scorecard row as a metric: its measure, how Census adapted it, and its target. */
function levelEntry(d: ServiceLevelDef): MetricInput {
  const clock = LEVEL_CLOCKS[d.id]
  const atlas = `Atlas wording: ${d.atlas}.`.replace(/\.\.$/, '.')
  const definition = [`${d.measure}.`, d.adaptation, atlas].filter(Boolean).join(' ')
  const formula = clock
    ? `business days(opened, ${CLOCK_STOP[clock.stop]}) ≤ ${clock.days}, share of cases judged`
    : d.id === 'er02-median-days'
      ? 'median(resolvedAt − openedAt) in calendar days'
      : d.id === 'ds01-retro-share'
        ? 'retro ÷ job and pay changes'
        : 'completed on or before the due date ÷ transactions judged'
  const population = clock
    ? `${clock.category} cases opened in the period. A case still open past the clock counts as missed; one still inside it is left out.`
    : d.id === 'er02-median-days'
      ? 'Employee relations cases closed in the period.'
      : d.id === 'ds01-retro-share'
        ? 'Job and compensation changes due in the period that carry the retro flag.'
        : `${txTypeOf(d.processId)} transactions due in the period. Open ones past due count as late; open ones not yet due are left out.`
  const isDays = d.unit === 'days'
  return {
    id: levelMetric(d.id),
    name: `${d.processId} ${d.measure[0].toLowerCase()}${d.measure.slice(1)}`,
    definition,
    formula,
    population,
    window: PERIOD,
    unit: isDays ? 'days' : 'pct',
    goodDirection: d.direction === 'min' ? 'up' : 'down',
    // The status, the gap and the readout are calculated with this target, so it keeps its direction.
    target: { value: d.target, comparator: d.direction === 'min' ? '>=' : d.strict ? '<' : '<=' },
    targetRequired: true,
    uses: levelUses(d.id, L),
    owner: OWNER,
  }
}

/* ───────────── the entries ───────────── */

const entries: MetricInput[] = [
  /* cases */
  {
    id: M.opened,
    name: 'Cases opened',
    definition: 'Cases opened in the period, by their opened date, every category and channel.',
    formula: 'count of cases with an opened date in the period',
    population: 'Every case in the HR cases data, whatever its status.',
    window: TREND,
    unit: 'int',
    goodDirection: null,
    uses: L.opened,
    owner: OWNER,
  },
  {
    id: M.backlog,
    name: 'Open backlog',
    definition:
      'Cases still open at the end of the as-of date, in any open status. Age runs from the opened date.',
    formula: 'cases opened by the as-of date and not resolved by it',
    population:
      'Cases with no resolved time by the as-of date. Without resolved times in the file, cases in an open status.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: L.open,
    owner: OWNER,
  },
  {
    id: M.aged,
    name: 'Aged open cases',
    definition:
      'Cases still open at the as-of date and older than the age limit, oldest first, with the days past their category resolution target. Employee relations cases are counted, never listed.',
    formula: 'as-of date − opened date > age limit',
    population: 'Open cases at the as-of date.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: union(L.open, L.category, L.process, L.team, L.resolutionTarget),
    owner: OWNER,
    params: [
      days(
        'days',
        'Age limit',
        'Open cases older than this many days are listed in the aging table and counted in the backlog tile note.',
        DEFAULTS.agedDays,
      ),
    ],
  },
  {
    id: M.resolutionSla,
    name: 'Resolution SLA met',
    definition:
      "Share of cases opened in the period resolved within their category's resolution target, in calendar hours. Open cases already past their target count as missed; open cases still inside it are left out.",
    formula: 'resolved within target ÷ (resolved + open past target)',
    population:
      "Cases opened in the period. Each is judged against its category's resolution target set here; a case whose file gives it a target different from the standard one for its category keeps its own.",
    window: TREND,
    unit: 'pct',
    goodDirection: 'up',
    // The share of cases that should meet their resolution target: the target lines, the status
    // marks, the tile and the readout are calculated with it.
    target: { value: DEFAULTS.resolutionTarget, comparator: '>=' },
    targetRequired: true,
    uses: L.resolutionSla,
    owner: OWNER,
    params: categoryTargets('resolution'),
  },
  {
    id: M.responseSla,
    name: 'First response SLA met',
    definition:
      "Share of cases opened in the period with a first reply within their category's response target, in calendar hours. A case resolved without a logged reply counts its resolution as the reply.",
    formula: 'cases with firstResponseAt − openedAt ≤ response target ÷ cases judged',
    population:
      "Cases opened in the period. Each is judged against its category's response target set here; a case whose file gives it a target different from the standard one for its category keeps its own.",
    window: TREND,
    unit: 'pct',
    goodDirection: 'up',
    uses: L.responseSla,
    owner: OWNER,
    params: categoryTargets('response'),
  },
  {
    id: M.timeToResolve,
    name: 'Median time to resolve',
    definition:
      'Median calendar time from opened to resolved, for cases resolved in the period. Medians, not averages, so a few very long cases do not move it. Shown in hours below 48 h and in days above.',
    formula: 'median(resolvedAt − openedAt)',
    population: 'Cases resolved in the period.',
    window: PERIOD,
    unit: 'hours',
    goodDirection: 'down',
    uses: L.resolved,
    owner: OWNER,
  },
  {
    id: M.resolveVsTarget,
    name: 'Time to resolve against target',
    definition:
      "Each case's time to resolve divided by its resolution target, so a long employee relations case and a quick payroll case read on one axis. 100% is on target; past 100% missed it.",
    formula: '(resolvedAt − openedAt) ÷ resolution target',
    population:
      'Cases resolved in the period, by category. A category behind fewer people than the anonymity minimum is left out.',
    window: PERIOD,
    unit: 'pct0',
    goodDirection: 'down',
    uses: union(L.resolved, L.category, L.resolutionTarget),
    owner: OWNER,
  },
  {
    id: M.csat,
    name: 'Satisfaction',
    definition:
      'Mean satisfaction score (1 to 5) on cases resolved in the period. Hidden below the anonymity minimum of responses.',
    formula: 'mean(csat)',
    population: 'Cases resolved in the period with a score from 1 to 5.',
    window: PERIOD,
    unit: 'num1',
    goodDirection: 'up',
    uses: L.csat,
    owner: OWNER,
  },
  {
    id: M.reopenRate,
    name: 'Reopen rate',
    definition: 'Resolved cases opened in the period that were reopened after resolution.',
    formula: 'reopened ÷ resolved',
    population: 'Cases opened in the period and resolved.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    uses: L.reopen,
    owner: OWNER,
  },
  {
    id: M.escalationRate,
    name: 'Escalation rate',
    definition: 'Cases opened in the period that were escalated to a higher tier.',
    formula: 'escalated ÷ opened',
    population: 'Cases opened in the period.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    uses: L.escalate,
    owner: OWNER,
  },
  {
    id: M.firstContact,
    name: 'First-contact resolution',
    definition: 'Resolved cases handled at Tier 0 or Tier 1 that were neither reopened nor escalated.',
    formula: 'resolved cases with ¬reopened ∧ ¬escalated ∧ tier ∈ {0, 1} ÷ cases resolved',
    population: 'Cases resolved in the period, by owning team.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(L.resolved, ['cases.tier', 'cases.reopened', 'cases.escalated']),
    owner: OWNER,
  },
  {
    id: M.arrivals,
    name: 'When cases arrive',
    definition:
      'Cases opened in the period by weekday and by the hour of the opened timestamp as the help desk recorded it (local time of the system). Hours with no cases at either end are trimmed.',
    formula: 'cases opened in the cell ÷ cases opened',
    population: 'Cases opened in the period with an opened time.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: null,
    uses: L.opened,
    owner: OWNER,
  },

  /* transactions */
  {
    id: M.onTime,
    name: 'Transactions on time',
    definition:
      'Share of HR transactions due in the period that were completed on or before their due date. Open transactions past due count as late.',
    formula: 'on time ÷ (on time + completed late + open past due)',
    population: 'Transactions with a due date in the period. Open ones not yet due are left out.',
    window: TREND,
    unit: 'pct',
    goodDirection: 'up',
    // The share of transactions that should be completed by their due date: the target lines, the
    // status marks and the tile are calculated with it.
    target: { value: DEFAULTS.onTimeTarget, comparator: '>=' },
    targetRequired: true,
    uses: L.onTime,
    owner: OWNER,
  },
  {
    id: M.daysVsDue,
    name: 'Days early or late',
    definition:
      'Calendar days between the due date and the completed date, for completed transactions due in the period. On the due date or earlier is on time.',
    formula: 'completedDate − dueDate',
    population: 'Completed transactions due in the period.',
    window: PERIOD,
    unit: 'days',
    goodDirection: null,
    uses: L.onTime,
    owner: OWNER,
  },
  {
    id: M.finalPay,
    name: 'Final pay on time',
    definition:
      "Termination transactions completed on or before the final pay deadline for the leaver's site and exit type (Atlas OF-05). The target is the OF-05 service level's.",
    formula: 'on time ÷ (on time + completed late + open past due), by jurisdiction',
    population:
      "Termination transactions due in the period. The jurisdiction comes from the leaver's site in the roster; jurisdictions behind fewer leavers than the anonymity minimum fold into Other.",
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(L.onTime, L.txType, L.site, L.exitType),
    owner: OWNER,
  },
  {
    id: M.retroShare,
    name: 'Retro adjustments',
    definition:
      "Job and compensation changes processed after the payroll cut-off for their effective month, so pay had to be corrected on a later payslip, as a share of those changes. The ceiling is the DS-01 service level's.",
    formula: 'retro ÷ job and pay changes',
    population: 'Job and compensation changes due in the period that carry the retro flag.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    uses: L.retro,
    owner: OWNER,
  },

  /* the scorecard */
  {
    id: M.levelStatus,
    name: 'Service level status',
    definition:
      'Met when the actual reaches the target. At risk when it misses by no more than the at-risk band for its kind of target; missed otherwise. A ceiling share such as the DS-01 retro share uses a band relative to the target, because a fixed band in points would be several times the target itself. No status without an actual.',
    formula:
      'Met: actual meets target · At risk: miss ≤ the at-risk band (points for percentage targets, a share of the target for day targets and ceilings) · Missed: beyond it',
    population: 'Each Atlas measure in the scorecard, scored on the period.',
    window: PERIOD,
    unit: 'text',
    goodDirection: null,
    uses: union(...SERVICE_LEVELS.map((d) => levelUses(d.id, L))),
    owner: OWNER,
    params: [
      share(
        'atRiskPts',
        'At-risk band, percentage targets',
        'A share this many points or fewer below its target is at risk, not missed.',
        DEFAULTS.atRiskPts,
        { min: 0, max: 0.2, step: 0.005, format: 'pts' },
      ),
      share(
        'atRiskDaysShare',
        'At-risk band, day targets',
        'A day measure up to this share above its target is at risk, not missed.',
        DEFAULTS.atRiskDaysShare,
        { min: 0, max: 1, step: 0.01, format: 'pct0' },
      ),
      share(
        'atRiskCeilingShare',
        'At-risk band, ceilings',
        'A share up to this much above a ceiling target (relative to the target) is at risk, not missed.',
        DEFAULTS.atRiskCeilingShare,
        { min: 0, max: 2, step: 0.05, format: 'pct0' },
      ),
    ],
  },
  {
    id: M.levelGap,
    name: 'Gap to target',
    definition:
      'Actual minus target for "at least" targets, target minus actual for "under" targets, so a positive gap is always better.',
    formula: 'actual − target',
    population: 'Each percentage measure in the scorecard with an actual.',
    window: PERIOD,
    unit: 'pts',
    goodDirection: 'up',
    uses: union(...SERVICE_LEVELS.filter((d) => d.unit === 'share').map((d) => levelUses(d.id, L))),
    owner: OWNER,
  },
  {
    id: M.processVolume,
    name: 'Volume by Atlas process',
    definition:
      'Cases opened and transactions due in the period, by the Hire-to-Retire Atlas process that governs their category or type. Uploaded cases keep their own process ID when they carry one.',
    formula: 'count of cases opened + count of transactions due, by process',
    population:
      'Cases opened and transactions due in the period. A count behind fewer people than the anonymity minimum shows as "—".',
    window: PERIOD,
    unit: 'int',
    goodDirection: null,
    uses: union(L.opened, L.process, L.due, L.txProcess),
    owner: OWNER,
  },
  ...SERVICE_LEVELS.map(levelEntry),

  /* leave and return */
  {
    id: M.onLeave,
    name: 'On leave now',
    definition:
      'People on a leave of absence at the end of the as-of date: a leave start on or before it, no return from leave by then, and still employed. A return entered ahead for a later date does not end the leave yet.',
    formula: 'leave starts on or before the as-of date without a return or an exit by then',
    population:
      'Leave start and Return from leave transactions, each leave start paired with the next return of the same person on or after it. A count behind fewer people than the anonymity minimum shows as "—".',
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: union(LEAVE.onLeave, LEAVE.unit, LEAVE.reason),
    owner: OWNER,
  },
  {
    id: M.leaveLength,
    name: 'Median leave length',
    definition:
      'Median calendar days from the leave start to the return, for people who came back from leave in the period. Medians, so a few very long leaves do not move it.',
    formula: 'median(return date − leave start date)',
    population: 'Returns from leave in the period, paired with their leave start.',
    window: PERIOD,
    unit: 'days',
    goodDirection: null,
    uses: union(LEAVE.length, LEAVE.reason),
    owner: OWNER,
  },
  {
    id: M.returnsSoon,
    name: 'Upcoming returns from leave',
    definition:
      'People on leave whose planned return date falls between the as-of date and the end of the look-ahead. Each is checked against Atlas LV-03: systems and access ready on the return day.',
    formula: 'open leaves with as-of date ≤ expected return ≤ as-of date + look-ahead',
    population: 'People on leave now with a planned return date.',
    window: 'The as-of date and the days after it.',
    unit: 'int',
    goodDirection: null,
    uses: LEAVE.returnsSoon,
    owner: OWNER,
    params: [
      days(
        'aheadDays',
        'Look-ahead',
        'Planned returns within this many days after the as-of date are listed and counted.',
        30,
        120,
      ),
      days(
        'urgentDays',
        'Urgent within',
        'A return this many days away or fewer without systems ready is critical, not a warning.',
        7,
        60,
      ),
    ],
  },
  {
    id: M.systemsReady,
    name: 'Systems ready for return (LV-03)',
    definition:
      'An upcoming return is ready when its Return from leave transaction is entered and processed in the HRIS, so pay and access are active on the day. Not ready when it is entered but not processed, or not entered at all.',
    formula: 'returns with a processed Return from leave ÷ upcoming returns',
    population: 'Upcoming returns from leave within the look-ahead.',
    window: 'The as-of date and the days after it.',
    unit: 'pct',
    goodDirection: 'up',
    uses: LEAVE.systemsReady,
    owner: OWNER,
  },
  {
    id: M.returnRate,
    name: 'Return rate',
    definition:
      'Leaves that ended in a return to work, as a share of the leaves that ended in the period, by a return or by the person leaving the company while on leave.',
    formula: 'returned ÷ (returned + left during leave)',
    population:
      'Leaves that ended in the period. Leaves still open are left out. A rate behind fewer people than the anonymity minimum shows as "—".',
    window: 'The period picker for the tile; the last eight quarters, by quarter, for the chart.',
    unit: 'pct',
    goodDirection: 'up',
    uses: LEAVE.returnRate,
    owner: OWNER,
  },
  {
    id: M.retention,
    name: 'Retention after return',
    definition:
      'People who came back from leave and were still employed a set time after their return, for returns between twice that time and that time before the as-of date, so everyone in the group has had the full time. Split by leave reason when reasons are loaded.',
    formula: 'still employed at return + horizon ÷ people who returned',
    population:
      'Returns from leave in the cohort window, paired with their leave start. A group behind fewer people than the anonymity minimum shows as "—".',
    window: 'A cohort window before the as-of date, set by the horizon.',
    unit: 'pct',
    goodDirection: 'up',
    target: { value: DEFAULTS.retentionTarget, comparator: '>=' },
    targetRequired: true,
    uses: union(LEAVE.retention, LEAVE.reason),
    owner: OWNER,
    params: [
      {
        key: 'months',
        label: 'Horizon',
        description:
          'Months after the return that a person must still be employed. The cohort is the returns between twice this and this many months before the as-of date.',
        type: 'months',
        default: 12,
        min: 3,
        max: 24,
        step: 1,
      },
    ],
  },
  {
    id: M.exitsAfterReturn,
    name: 'Left soon after returning',
    definition:
      'People who left the company in the period within a set number of months of coming back from leave. Shown to HR only, on the Leave & return tab, and never by name in a finding.',
    formula: 'exits in the period with a return from leave in the months before',
    population:
      'Leavers in the period, from the roster, matched to their returns from leave. The count shows when the returners behind it reach the anonymity minimum.',
    window: PERIOD,
    unit: 'int',
    goodDirection: 'down',
    uses: union(LEAVE.exits, LEAVE.exitType),
    owner: OWNER,
    params: [
      {
        key: 'months',
        label: 'Months after return',
        description: 'An exit this many months or fewer after a return from leave counts.',
        type: 'months',
        default: 6,
        min: 1,
        max: 24,
        step: 1,
      },
    ],
  },
  {
    id: M.exitsDuringLeave,
    name: 'Left during leave',
    definition:
      'Leaves that ended in the period because the person left the company before returning. Shown to HR only, on the Leave & return tab.',
    formula: 'leaves ended by an exit in the period',
    population: 'Leaves that ended in the period.',
    window: PERIOD,
    unit: 'int',
    goodDirection: 'down',
    uses: union(LEAVE.exits, LEAVE.exitType),
    owner: OWNER,
  },
  {
    id: M.returnSurvey,
    name: 'Return to work survey',
    definition:
      'The headline result of the Return to work survey, sent 30 days after a return, as Listening reports it, with a link to the full results there. Grouped results only, never one person.',
    formula: 'mean of the 1-5 answers in the latest Return to work wave, as Listening reports it',
    population: 'Respondents to the Return to work survey in its latest waves.',
    window: 'The latest waves on or before the as-of date.',
    unit: 'num1',
    goodDirection: 'up',
    uses: SURVEY_FALLBACK_USES,
    owner: OWNER,
  },

  /* readout rules */
  {
    id: M.spike,
    name: 'Case volume spike',
    definition:
      "Raised when a category's cases in one month of the period reach the spike factor times its usual level (the median of its trailing months) and exceed it by enough cases. A peak that also happened in the same month a year earlier is seasonal and not raised. Critical when that month's resolution SLA fell below the floor or well below the other months.",
    formula: 'cases in the month ÷ median cases in the trailing months',
    population: 'Cases by category and opened month, with at least three trailing months of history.',
    window: PERIOD,
    unit: 'times',
    goodDirection: 'down',
    uses: union(L.opened, L.category, L.resolutionSla, L.segment),
    owner: OWNER,
    params: [
      times(
        'factor',
        'Spike factor',
        'A month at this multiple of the usual level or more is a spike.',
        1.8,
        1.1,
      ),
      count(
        'minExtra',
        'Cases above usual',
        'A spike also needs at least this many cases above the usual level.',
        15,
        0,
      ),
      {
        key: 'baselineMonths',
        label: 'Trailing months',
        description: 'The usual level is the median of this many months before the spike month.',
        type: 'months',
        default: 6,
        min: 3,
        max: 24,
        step: 1,
      },
      count(
        'minBase',
        'Smallest usual level',
        'Categories with a usual level under this many cases a month are not checked.',
        5,
        0,
      ),
      times(
        'seasonalFactor',
        'Seasonal factor',
        'A peak is seasonal, and not raised, when the same month a year earlier reached this multiple of the usual level.',
        1.5,
      ),
      share(
        'slaFloor',
        'Critical below',
        "The spike is critical when that month's resolution SLA is under this share.",
        0.8,
        { min: 0.5 },
      ),
      share(
        'slaDrop',
        'Critical drop',
        "The spike is also critical when that month's resolution SLA is this many points below the other months of the period.",
        0.1,
        { min: 0.01, max: 0.5, step: 0.01, format: 'pts' },
      ),
    ],
  },
  {
    id: M.slow,
    name: 'Category under its resolution SLA',
    definition:
      'Raised for a case category whose resolution SLA, on cases opened in the period, is under the floor, with enough cases to judge and an Atlas process. A category already raised for an aged backlog or a volume spike is not raised again.',
    formula: 'resolution SLA met for the category < floor',
    population: 'Cases opened in the period, by category.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(L.resolutionSla, L.category, L.process, L.segment),
    owner: OWNER,
    params: [
      share(
        'floor',
        'Raise below',
        'A category under this share of cases resolved within target is raised.',
        0.8,
        {
          min: 0.5,
        },
      ),
      share('critical', 'Critical below', 'Under this share the finding is critical, not a warning.', 0.7, {
        min: 0.3,
      }),
      count('minCases', 'Fewest cases', 'A category needs at least this many cases with an outcome.', 20),
    ],
  },
  {
    id: M.finalPayLate,
    name: 'Late final pay',
    definition:
      'Raised, as critical, for a jurisdiction where final pay was on time for less than the floor share of exits due in the period, with enough exits and late payments to judge.',
    formula: 'final pay on time in the jurisdiction < floor',
    population: 'Termination transactions due in the period, by jurisdiction.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(L.onTime, L.txType, L.site, L.exitType),
    owner: OWNER,
    params: [
      share(
        'floor',
        'Raise below',
        'A jurisdiction under this share of final pay on time is raised. The final pay chart marks it critical too.',
        0.95,
        { min: 0.5 },
      ),
      count('minExits', 'Fewest exits', 'A jurisdiction needs at least this many exits judged.', 5),
      count('minLate', 'Fewest late payments', 'A jurisdiction needs at least this many late payments.', 2),
    ],
  },
  {
    id: M.newHireGap,
    name: 'New hire readiness gap',
    definition:
      'Raised for a region where fewer new hires than the region floor were ready by Day −3 and the region trails the other regions by the gap or more, or for a site elsewhere under the site floor. Each needs enough late hires to judge.',
    formula: 'ready by Day −3 in the region or site < floor',
    population: 'New hire transactions due in the period, by region and site.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(L.onTime, L.txType, L.site),
    owner: OWNER,
    params: [
      share(
        'regionFloor',
        'Region floor',
        'A region under this share ready by Day −3 can be raised. Site bars under it are marked warning, and critical 10 pts under it.',
        0.95,
        { min: 0.5 },
      ),
      share(
        'regionGap',
        'Gap to the other regions',
        'A region is raised only when it trails the other regions by at least this many points.',
        0.03,
        { min: 0, max: 0.5, step: 0.005, format: 'pts' },
      ),
      share('siteFloor', 'Site floor', 'A site outside a raised region is raised under this share.', 0.9, {
        min: 0.5,
      }),
      count(
        'siteMinStarts',
        'Fewest starts at a site',
        'A site needs at least this many new hires judged.',
        10,
      ),
      count(
        'minLate',
        'Fewest late hires',
        'A region or site needs at least this many hires entered after Day −3.',
        3,
      ),
    ],
  },
  {
    id: M.csatGap,
    name: 'Channel satisfaction gap',
    definition:
      'Raised for a channel whose mean satisfaction on cases resolved in the period is at least the gap below the other channels, with enough responses on the channel and on the rest.',
    formula: 'mean satisfaction of the other channels − mean of the channel',
    population: 'Cases resolved in the period with a satisfaction score, by channel.',
    window: PERIOD,
    unit: 'num1',
    goodDirection: 'down',
    uses: union(L.csat, L.channel),
    owner: OWNER,
    params: [
      {
        key: 'gap',
        label: 'Gap',
        description: 'Points out of 5 below the other channels that raise a channel.',
        type: 'number',
        default: 0.5,
        min: 0.1,
        max: 4,
        step: 0.1,
        format: 'num1',
      },
      count(
        'minResponses',
        'Fewest responses',
        'The channel and the other channels each need at least this many responses.',
        20,
      ),
    ],
  },
  {
    id: M.reopenHotspot,
    name: 'Reopen hotspot',
    definition:
      'Raised for a category reopened at the multiple of the reopen rate across all cases or more, on cases opened in the period, with enough resolved and reopened cases to judge.',
    formula: 'category reopen rate ÷ reopen rate across all cases',
    population: 'Resolved cases opened in the period, by category.',
    window: PERIOD,
    unit: 'times',
    goodDirection: 'down',
    uses: union(L.reopen, L.category, L.segment),
    owner: OWNER,
    params: [
      times(
        'multiple',
        'Multiple of the overall rate',
        'A category at this multiple of the overall reopen rate or more is raised.',
        2,
        1.1,
      ),
      count(
        'minResolved',
        'Fewest resolved cases',
        'The category, and all cases together, need at least this many resolved cases.',
        20,
      ),
      count('minReopens', 'Fewest reopens', 'A category needs at least this many reopened cases.', 5),
    ],
  },
  {
    id: M.agedBacklog,
    name: 'Aged backlog',
    definition:
      'Raised for a category with several cases still open past the age limit at the as-of date. The aging table marks cases past the limit critical.',
    formula: 'open cases older than the limit, by category',
    population: 'Open cases at the as-of date, by category.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: union(L.open, L.category, L.resolutionSla),
    owner: OWNER,
    params: [
      days('days', 'Age limit', 'Open cases older than this many days count toward the finding.', 30),
      count('minCases', 'Fewest cases', 'A category needs at least this many cases past the limit.', 3),
    ],
  },
  {
    id: M.retroOver,
    name: 'Retro adjustments over target',
    definition:
      'Raised when the share of job and pay changes due in the period that needed a retro adjustment reaches the DS-01 ceiling, with enough changes to judge. A warning from the warning share up; information below it.',
    formula: 'retro ÷ job and pay changes ≥ DS-01 ceiling',
    population: 'Job and compensation changes due in the period that carry the retro flag.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    uses: L.retro,
    owner: OWNER,
    params: [
      count('minChanges', 'Fewest changes', 'The finding needs at least this many job and pay changes.', 20),
      share('warning', 'Warning from', 'From this share the finding is a warning, not information.', 0.04, {
        min: 0.001,
        max: 0.5,
        step: 0.001,
      }),
    ],
  },
  {
    id: M.strongest,
    name: 'Strongest category',
    definition:
      'The one good finding: the category with the highest resolution SLA on cases opened in the period, when it reaches the floor on enough cases.',
    formula: 'highest resolution SLA met among categories ≥ floor',
    population: 'Cases opened in the period, by category.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(L.resolutionSla, L.category, L.resolved),
    owner: OWNER,
    params: [
      share('floor', 'Floor', 'The strongest category is named only at this share or higher.', 0.95, {
        min: 0.5,
      }),
      count('minCases', 'Fewest cases', 'The category needs at least this many cases with an outcome.', 50),
    ],
  },
  {
    id: M.retentionLow,
    name: 'Retention after return under target',
    definition:
      'Raised when the people who came back from parental leave (or from any leave, when the file has no leave reasons) were still employed after the horizon less often than the retention target, with enough returners to judge.',
    formula: 'retention after return for the group < target',
    population: 'Returns from leave in the cohort window, by leave reason.',
    window: 'A cohort window before the as-of date, set by the horizon.',
    unit: 'pct',
    goodDirection: 'up',
    uses: union(LEAVE.retention, LEAVE.reason),
    owner: OWNER,
    params: [
      count(
        'minReturners',
        'Fewest returners',
        'The group needs at least this many returners in the cohort, and never fewer than the anonymity minimum.',
        10,
      ),
    ],
  },
  {
    id: M.returnsNotReady,
    name: 'Returns without systems ready',
    definition:
      'Raised when people due back from leave within the look-ahead have no processed Return from leave transaction (Atlas LV-03). Critical when one of them is due within the urgent window.',
    formula: 'upcoming returns not entered or not processed',
    population: 'Upcoming returns from leave within the look-ahead.',
    window: 'The as-of date and the days after it.',
    unit: 'int',
    goodDirection: 'down',
    uses: LEAVE.systemsReady,
    owner: OWNER,
  },
  {
    id: M.exitCluster,
    name: 'Exits after return concentrated in a department',
    definition:
      'Raised, as a count only, when one department holds a large share of the people who left soon after returning from leave in the period. Never names a person.',
    formula: "department's leavers soon after return ÷ all leavers soon after return",
    population: 'Leavers in the period within the months after return, by department.',
    window: PERIOD,
    unit: 'int',
    goodDirection: 'down',
    uses: union(LEAVE.exits, LEAVE.department),
    owner: OWNER,
    params: [
      share(
        'minShare',
        'Share in one department',
        'The department must hold at least this share of the leavers.',
        0.5,
        { min: 0.2, max: 1, step: 0.05, format: 'pct0' },
      ),
      count(
        'minLeavers',
        'Fewest leavers',
        'The department needs at least this many leavers, and never fewer than the anonymity minimum.',
        5,
      ),
    ],
  },
]

/** Every scorecard row's metric. */
const LEVEL_METRICS = SERVICE_LEVELS.map((d) => levelMetric(d.id))

/**
 * Settings and targets registered on another metric that change a number (its `dependsOn`), so
 * "Definition changed" marks follow them: the category resolution targets and the SLA target
 * drive the case readout, and the scorecard targets the rows that quote them.
 */
const DEPENDS_ON: Readonly<Record<string, readonly string[]>> = {
  [M.backlog]: [M.aged],
  [M.resolveVsTarget]: [M.resolutionSla],
  [M.spike]: [M.resolutionSla],
  [M.slow]: [M.resolutionSla],
  [M.agedBacklog]: [M.resolutionSla],
  [M.strongest]: [M.resolutionSla],
  [M.finalPayLate]: [levelMetric('of05-final-pay')],
  [M.newHireGap]: [levelMetric('on03-hire-day-minus-3')],
  [M.retroOver]: [levelMetric('ds01-retro-share')],
  [M.levelStatus]: LEVEL_METRICS,
  [M.levelGap]: [...LEVEL_METRICS, M.levelStatus],
  [M.systemsReady]: [M.returnsSoon],
  [M.retentionLow]: [M.retention],
  [M.returnsNotReady]: [M.returnsSoon],
  [M.exitCluster]: [M.exitsAfterReturn],
}

export const metrics: MetricDef[] = defineMetrics('services', entries).map((d) =>
  DEPENDS_ON[d.id] ? { ...d, dependsOn: DEPENDS_ON[d.id] } : d,
)
