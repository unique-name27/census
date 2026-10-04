/**
 * The "Definitions" rows of every HR ops figure. A metric's row is its dictionary entry
 * (`ctx.metrics.def(id)`: name, definition and formula, with your wording), plus a sentence with
 * the target or threshold in force where the figure shows one. Glossary rows that are not metrics
 * (business days, jurisdiction, small groups) live here too, with the anonymity minimum and the
 * targets in force written in. Pure, so tests can read exactly what a figure shows.
 */
import type { Definition } from '@/charts/types'
import type { MetricDefinition } from '@/metrics/api'
import { formatParamNumber } from '@/metrics/params'
import type { MetricsApi } from '@/metrics/types'
import { M } from '../metrics'
import { pctWords, type ServicesSettings } from './settings'

/** A metric's wording from the registry as a definitions row, with an optional extra sentence. */
export function metricDefinition(
  m: Pick<MetricsApi, 'def'>,
  id: string,
  extra?: string | null,
): MetricDefinition {
  const d = m.def(id)
  if (!d) throw new Error(`Metric "${id}" is not registered.`)
  const text = extra ? `${d.definition} ${extra}` : d.definition
  return d.formula
    ? { term: d.name, text, formula: d.formula, metricId: id }
    : { term: d.name, text, metricId: id }
}

/** "48 h" up to 48 hours, "7 d" above (the way the case targets are written). */
const hours = (h: number | undefined): string =>
  h == null
    ? '—'
    : h <= 48
      ? formatParamNumber(h, { type: 'number', format: 'hours' })
      : formatParamNumber(h / 24, { type: 'days' })

/** Every definitions row the view's figures use, from the registry and the settings in force. */
export function servicesDefinitions(m: Pick<MetricsApi, 'def'>, cfg: ServicesSettings) {
  const k = cfg.minGroup
  const def = (id: string, extra?: string | null) => metricDefinition(m, id, extra)
  const of05 = pctWords(cfg.levelTargets['of05-final-pay'])
  const on03 = pctWords(cfg.levelTargets['on03-hire-day-minus-3'])
  const ds01 = pctWords(cfg.levelTargets['ds01-retro-share'])
  const payroll = hours(cfg.caseTargets.resolution.get('Payroll'))
  const leave = hours(cfg.caseTargets.resolution.get('Leave & accommodation'))
  const bands = cfg.atRisk
  return {
    opened: def(M.opened),
    backlog: def(M.backlog),
    aged: def(M.aged),
    resolutionSla: def(M.resolutionSla, `Target ${pctWords(cfg.resolutionTarget)}.`),
    responseSla: def(M.responseSla),
    timeToResolve: def(M.timeToResolve),
    resolveVsTarget: def(M.resolveVsTarget, 'The table view has the days.'),
    csat: def(M.csat),
    reopen: def(M.reopenRate),
    escalation: def(M.escalationRate),
    firstContact: def(M.firstContact),
    arrivals: def(M.arrivals),
    onTime: def(M.onTime, `Target ${pctWords(cfg.onTimeTarget)}.`),
    daysVsDue: def(M.daysVsDue),
    finalPay: def(
      M.finalPay,
      `Target ${of05} (Atlas OF-05). Under ${pctWords(cfg.finalPay.floor)} is marked critical, as in the readout.`,
    ),
    newHireReady: def(M.newHireReady, `Target ${on03} (Atlas ON-03).`),
    retro: def(
      M.retroShare,
      `Atlas DS-01 target: under ${ds01} of changes. The counts are in the table view.`,
    ),
    levelStatus: def(
      M.levelStatus,
      `At risk means within ${formatParamNumber(bands.pts, { type: 'percent', format: 'pts' })} below a percentage target, within ${pctWords(bands.daysShare)} above a day target, or within ${pctWords(bands.ceilingShare)} of the target above a ceiling. No status below ${k} cases or transactions, or ${k} people.`,
    ),
    levelGap: def(M.levelGap),
    processVolume: def(M.processVolume),
    anonymity: {
      term: 'Small groups',
      text: `A rate, median or average needs at least ${k} cases, transactions or responses from at least ${k} different people; otherwise it shows as "—" (hidden to protect anonymity). Breakdowns fold groups behind fewer than ${k} people into "Other (k)", where k is the number of groups folded.`,
    },
    otherCategories: {
      term: 'Other',
      text: `Every category outside the five with the most cases over these 24 months, and any category behind fewer than ${k} people.`,
    },
    statusMark: {
      term: 'Status mark',
      text: `Shown beside the count when the category's resolution SLA is under the ${pctWords(cfg.resolutionTarget)} target: warning under target, critical 10 pts or more under it (the same marks as on the Cases tab).`,
    },
    withOutcome: {
      term: 'Cases with an outcome',
      text: 'Cases resolved, plus open cases already past their target. Open cases still inside their target have no outcome yet.',
    },
    employeeRelations: {
      term: 'Employee relations',
      text: 'Employee relations cases are reported as counts and timeliness only, so they never appear row by row here or in detail exports.',
    },
    jurisdiction: {
      term: 'Jurisdiction',
      text: `From the leaver's site in the roster (San Jose is California, Bengaluru is India, and so on). Jurisdictions with fewer than ${k} leavers are folded into Other.`,
    },
    businessDays: {
      term: 'Business days',
      text: 'Monday to Friday between the opened date and the resolved (or first response) date, with no holiday calendar. Counted by date, not by hour. A case still open past the clock counts as missed.',
      formula: 'business days(opened, resolved) ≤ target',
    },
    caseSla: {
      term: 'Case SLA (calendar hours)',
      text: `The help desk's own resolution target for the category, in calendar hours from the opened time, as on the Cases tab and in the readout (Payroll ${payroll}, Leave ${leave}). The Atlas clocks count business days between dates, so they can be more lenient: a payroll case opened Thursday afternoon and resolved Monday morning is within 2 business days but can be past the payroll target in hours. That is why PY-05 can be Met while Payroll misses the ${pctWords(cfg.resolutionTarget)} case SLA.`,
      formula: 'resolvedAt − openedAt ≤ category target (hours)',
    },
    txOnTime: {
      term: 'On time (transactions)',
      text: "A transaction is on time when it was completed on or before its due date (Day −3 for new hires, the final pay deadline for exits, the payroll cut-off for changes, the return date for returns from leave). Each row's target is in its Target column.",
      formula: 'completedDate ≤ dueDate',
    },
    atlasProcess: {
      term: 'Atlas process',
      text: 'Each case category and transaction type maps to one process in the Hire-to-Retire Atlas. Uploaded cases keep their own process ID when they carry one.',
    },
    hiddenCounts: {
      term: 'Hidden counts',
      text: `A count of cases or transactions behind fewer than ${k} people shows as "—", so a small scope cannot show that one of its members had, say, an immigration case.`,
    },
  } satisfies Record<string, Definition>
}

export type ServicesDefinitions = ReturnType<typeof servicesDefinitions>
