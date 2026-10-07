/**
 * The Org chart's wording, read from the metric dictionary (`ctx.metrics.def(id)`) so an edited
 * definition shows on every tile, datasheet and tooltip that uses it. Terms that name a threshold
 * carry the setting in force ("Wide span (12+)"); the definitions say what the default is.
 */
import type { Definition } from '@/charts/types'
import type { MetricDefinition } from '@/metrics/api'
import type { MetricsApi } from '@/metrics/types'
import { ORG_METRIC, type OrgMetricId } from '../metrics'
import { FLAG_KINDS, type FlagKind, flagName, STRUCTURAL } from './flags'
import { monthsText, narrowSpanLabel, type OrgRules } from './rules'

type DefReader = Pick<MetricsApi, 'def'>

/** The metric behind each flag kind. */
export const FLAG_METRIC: Record<FlagKind, OrgMetricId> = {
  'wide-span': ORG_METRIC.wideSpan,
  'narrow-span': ORG_METRIC.narrowSpan,
  'single-report-chain': ORG_METRIC.chain,
  'new-manager-large-team': ORG_METRIC.newManager,
  'new-hire': ORG_METRIC.newHire,
  placement: ORG_METRIC.placement,
}

/** The metric each figure shows (its `metric`), by figure id. */
export const FIGURE_METRIC = {
  'org-chart': ORG_METRIC.reportingLines,
  'org-flags': ORG_METRIC.flagged,
  'org-shape-layers': ORG_METRIC.layers,
  'org-span-by-layer': ORG_METRIC.directReports,
  'org-team-sizes': ORG_METRIC.totalOrg,
  'org-tenure-mix': ORG_METRIC.tenureMix,
  'org-sandbox': ORG_METRIC.reportingLines,
  'org-sandbox-spans': ORG_METRIC.spanChanges,
  'org-sandbox-moves': ORG_METRIC.moves,
} as const satisfies Record<string, OrgMetricId>

/** A metric's definition with your wording; empty when it is not registered. */
export const defText = (m: DefReader, id: OrgMetricId): string => m.def(id)?.definition ?? ''

/** One datasheet row from the registry, under a term of our own when the name needs the setting. */
export function defRow(m: DefReader, id: OrgMetricId, term?: string): Definition | null {
  const d = m.def(id)
  if (!d) return null
  const row: MetricDefinition = { term: term ?? d.name, text: d.definition, metricId: id }
  if (d.formula) row.formula = d.formula
  return row
}

const rows = (list: readonly (Definition | null)[]): Definition[] => list.filter((d): d is Definition => !!d)

/** A flag's datasheet row: its name with the setting in force, the registry's wording. */
export const flagRow = (m: DefReader, kind: FlagKind, rules: OrgRules): Definition | null =>
  defRow(m, FLAG_METRIC[kind], flagName(kind, rules))

/** The org chart's datasheet: who is shown, the counts on the cards, the flags and open roles. */
export function chartDefinitions(
  m: DefReader,
  rules: OrgRules,
  opts: { openRoles?: boolean } = {},
): Definition[] {
  return rows([
    defRow(m, ORG_METRIC.reportingLines),
    defRow(m, ORG_METRIC.directReports),
    defRow(m, ORG_METRIC.totalOrg),
    ...FLAG_KINDS.map((k) => flagRow(m, k, rules)),
    opts.openRoles === false ? null : defRow(m, ORG_METRIC.openRoles),
  ])
}

/** The flags table's datasheet: the count, then each flag it lists. */
export function flagTableDefinitions(m: DefReader, rules: OrgRules): Definition[] {
  return rows([
    defRow(m, ORG_METRIC.flagged),
    ...FLAG_KINDS.filter((k) => STRUCTURAL.has(k) || k === 'placement').map((k) => flagRow(m, k, rules)),
  ])
}

/** The sandbox chart's datasheet: reporting lines, the card counts and the flags it always shows. */
export function sandboxDefinitions(m: DefReader, rules: OrgRules): Definition[] {
  return rows([
    defRow(m, ORG_METRIC.reportingLines),
    defRow(m, ORG_METRIC.directReports),
    defRow(m, ORG_METRIC.totalOrg),
    ...FLAG_KINDS.filter((k) => STRUCTURAL.has(k)).map((k) => flagRow(m, k, rules)),
  ])
}

/** The Team shape figures' datasheets: their own metric first, then what they count with. */
export function teamShapeDefinitions(
  m: DefReader,
  rules: OrgRules,
): Record<'layers' | 'spans' | 'teams' | 'tenure', Definition[]> {
  return {
    layers: rows([
      defRow(m, ORG_METRIC.layers),
      defRow(m, ORG_METRIC.managers),
      defRow(m, ORG_METRIC.people),
    ]),
    spans: rows([
      defRow(m, ORG_METRIC.directReports),
      flagRow(m, 'wide-span', rules),
      flagRow(m, 'narrow-span', rules),
      defRow(m, ORG_METRIC.medianSpan),
    ]),
    teams: rows([defRow(m, ORG_METRIC.totalOrg), defRow(m, ORG_METRIC.openRoles)]),
    tenure: rows([defRow(m, ORG_METRIC.tenureMix), defRow(m, ORG_METRIC.teamTenure)]),
  }
}

/** The span changes table's datasheet. */
export const spanChangeDefinitions = (m: DefReader): Definition[] =>
  rows([defRow(m, ORG_METRIC.spanChanges), defRow(m, ORG_METRIC.directReports)])

/**
 * The structure flags tile's popover: the registry's definition, the thresholds in force, and
 * where "managing since" came from.
 */
export function flaggedDefinition(m: DefReader, rules: OrgRules, jobChanges: boolean): string {
  const settings = `Settings in force: wide span from ${rules.wideSpan} direct reports, ${narrowSpanLabel(rules).toLowerCase()}, a chain above a team of ${rules.chainMinBelow} or more, and new managers under ${monthsText(rules.newManagerMonths)} with ${rules.largeTeam} or more direct reports.`
  const source = jobChanges
    ? ''
    : ' Managing since is the hire date here, because Job changes is not loaded or not at the data standard.'
  return `${defText(m, ORG_METRIC.flagged)} ${settings}${source}`
}
