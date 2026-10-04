/**
 * Metric wording on screen, from the dictionary: the KPI info popovers and the figure definition
 * rows read the registry entry (your wording when you changed it), then add the settings in force
 * as one plain sentence, so a changed setting shows wherever the metric is explained. Pure.
 */
import type { Definition } from '@/charts/types'
import { formatParam, formatParamNumber } from '@/metrics/params'
import type { MetricsApi } from '@/metrics/types'
import { type RecruitingMetricId, RM } from '../metrics'

type Api = Pick<MetricsApi, 'def' | 'param' | 'paramDef'>

/** A multiple as settings show it: "1.5×", "2×". */
export const timesText = (v: number): string => formatParamNumber(v, { type: 'number', format: 'times' })

/** One setting's value with its unit: "1.5×", "5 d", "10 pts", "3 months". */
export function settingText(m: Api, id: RecruitingMetricId, key: string): string {
  const def = m.paramDef(id, key)
  return def ? formatParam(def, m.param(id, key)) : '—'
}

type Sentence = (v: (key: string) => string, m: Api) => string

/** The settings of each metric with any, in one sentence. */
const SETTINGS: Partial<Record<RecruitingMetricId, Sentence>> = {
  [RM.lackingNextStep]: (v) =>
    `Settings: no step booked past ${v('watchMultiple')} the usual days for the stage (overdue past ${v('overdueMultiple')}), a decision pending past ${v('decisionWatchDays')} (overdue past ${v('decisionOverdueDays')}), an offer out past ${v('offerWatchDays')} (overdue past ${v('offerOverdueDays')}), or a step booked more than ${v('farOutMultiple')} the usual days away.`,
  [RM.timeToFill]: (_, m) =>
    m.param(RM.timeToFill, 'endEvent') === 'start'
      ? 'Settings: the clock stops at the hire’s start date when the Employees data has it, otherwise on the date the offer was accepted.'
      : 'Settings: the clock stops on the date the offer was accepted.',
  [RM.offerAcceptance]: (v) =>
    `Settings: a change from the prior period is colored from ${v('materialPts')}, with at least ${v('minOffers')} offers in each period.`,
  [RM.emptyFunnel]: (v) => `Settings: empty-funnel age ${v('days')}.`,
  [RM.reqAge]: (v) => `Settings: an open req is old past ${v('oldDays')}.`,
  [RM.slowFill]: (v) =>
    `Settings: slow at ${v('factor')} the overall median or more, once ${v('minFilled')} reqs are filled.`,
  [RM.bottleneck]: (v) =>
    `Settings: at least ${v('factor')} the comparison and ${v('minGapDays')} longer, over the last ${v('recentMonths')} with ${v('minSteps')} completed steps to measure; critical from ${v('criticalFactor')} (over at least ${v('minCriticalSteps')} steps in one group).`,
  [RM.withdrawals]: (v) =>
    `Settings: flagged at ${v('flagShare')} of exits or a rise of ${v('risePts')}, with ${v('minExits')} exits to measure.`,
  [RM.sourceDryingUp]: (v) =>
    `Settings: a drop of ${v('drop')} or more and ${v('gapPts')} more than other sources, for sources with ${v('minPrior')} prior applications and ${v('minPriorShare')} of the prior total.`,
  [RM.bestSource]: (v) =>
    `Settings: at least ${v('factor')} the overall rate, with ${v('minApplications')} applications and ${v('minHires')} hires, over a period of ${v('minMonths')} or more.`,
  [RM.sourceApplications]: (v) =>
    `Settings: a source is highlighted only with ${v('minPrior')} applications in the prior period.`,
  [RM.acceptanceByLocation]: (v) => `Settings: marked amber ${v('gapPts')} or more below the company.`,
  [RM.acceptanceDrop]: (v) =>
    `Settings: a fall of ${v('dropPts')} or more, critical from ${v('criticalPts')}, with ${v('minOffers')} offers on each side.`,
  [RM.offersWaiting]: (_, m) =>
    `Settings: offers out past ${settingText(m, RM.lackingNextStep, 'offerWatchDays')} (critical past ${settingText(m, RM.lackingNextStep, 'offerOverdueDays')}), listed from ${settingText(m, RM.offersWaiting, 'minOffers')} offers.`,
  [RM.recruiterLoad]: (v) => `Settings: flagged above ${v('flagFactor')} the team median.`,
  [RM.reqMatch]: (v) => `Settings: req health is read from ${v('minShare')} matching.`,
}

/** The settings in force for a metric, in one sentence; null for a metric without settings. */
export function settingsSentence(m: Api, id: RecruitingMetricId): string | null {
  const f = SETTINGS[id]
  return f ? f((key) => settingText(m, id, key), m) : null
}

const join = (...parts: (string | null | undefined)[]): string => parts.filter(Boolean).join(' ')

/** A KPI's info popover: the registry definition, then its settings. */
export function kpiDefinition(m: Api, id: RecruitingMetricId): string {
  return join(m.def(id)?.definition, settingsSentence(m, id))
}

export interface MetricDefinitionOptions {
  /** The row's term; the metric's name by default. */
  term?: string
  /** A figure-specific sentence after the definition and settings. */
  extra?: string
  /** Show the formula note (default true). */
  formula?: boolean
  /** Add the settings sentence (default true); off where the settings don't bear on the figure. */
  settings?: boolean
}

/**
 * A figure's definition row for a metric: the registry name (or `term`), definition and formula,
 * then its settings and any figure-specific sentence (`extra`).
 */
export function metricDefinition(
  m: Api,
  id: RecruitingMetricId,
  o: MetricDefinitionOptions = {},
): Definition {
  const d = m.def(id)
  const term = o.term ?? d?.name ?? id
  const text = join(d?.definition, o.settings === false ? null : settingsSentence(m, id), o.extra)
  // A registered metric's row carries its id, so the datasheet links to it ("Edit definition").
  const link = d ? { metricId: id } : {}
  return d?.formula && o.formula !== false
    ? { term, text, formula: d.formula, ...link }
    : { term, text, ...link }
}
