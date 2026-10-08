/**
 * Workforce pyramid by level (docs/ANALYSES.md, part 5): its definition for the Special analyses
 * shell and its model. `pyramidModel(ctx)` is pure; the shell computes it once per context
 * through `analysisModel(ctx, 'pyramid')`, never from `computeHrbp`.
 */
import type { ChartNote } from '@/charts/core/notes'
import type { Finding } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Level } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { ID } from '@/views/hrbp/metrics'
import { NO_HISTORY } from '../../../engine/base'
import { loaded, present } from '../../fields'
import type { AnalysisDef, AnalysisModel, AnalysisTable, Missing, Readiness } from '../../types'
import { pyramidFindings, thinnestWords } from './findings'
import { PYRAMID_FIGURES as F } from './ids'
import { pyramidKpis } from './kpis'
import { FLOW, PYRAMID as PYRAMID_FIELDS } from './lineage'
import { PYRAMID_SET } from './metrics'
import { INDIVIDUAL_LEVELS, type PyramidData, pyramidData } from './model'

export function pyramidReady(ctx: AnalyticsContext): Readiness {
  if (!present(ctx, 'employees.level'))
    return { ready: false, message: 'Add Level to Employees to see the pyramid.', dataRoom: true }
  return { ready: true }
}

export function pyramidMissing(ctx: AnalyticsContext): Missing[] {
  const out: Missing[] = []
  if (!loaded(ctx, 'jobChanges'))
    out.push({
      id: 'jobChanges',
      what: 'Job changes',
      message: 'Add Job changes to compare with a year ago.',
      refs: ['jobChanges.fromLevel', 'jobChanges.toLevel', 'jobChanges.effectiveDate'],
      figures: [F.flow],
    })
  if (!present(ctx, 'employees.terminationDate'))
    out.push({
      id: 'terminationDate',
      what: 'Termination date',
      message: `${NO_HISTORY}.`,
      refs: ['employees.terminationDate'],
      figures: [F.flow],
    })
  if (!present(ctx, 'employees.managerId'))
    out.push({
      id: 'managerId',
      what: 'Manager ID',
      message: 'Add Manager ID to Employees to see spans at each management level.',
      refs: ['employees.managerId'],
      figures: [F.spans],
    })
  return out
}

export interface PyramidModel extends AnalysisModel {
  data: PyramidData
  /** Up to two notes for the pyramid, from the bulge and thin level findings ("+31% in a year"). */
  notes: ChartNote[]
}

/** The pyramid's notes (5.5.1): the strongest bulge's growth, then the thin level against the one above. */
function chartNotes(data: PyramidData, findings: readonly Finding[]): ChartNote[] {
  const notes: ChartNote[] = []
  const at = new Map(data.main.rows.map((r) => [r.level, r]))
  const levelOf = (f: Finding | undefined) => f?.filter?.level?.[0] as Level | undefined
  const bulge = at.get(levelOf(findings.find((f) => f.id.startsWith('hrbp-pyramid-bulge-'))) as Level)
  if (bulge?.growth != null)
    notes.push({
      at: bulge.level,
      text: `${bulge.growth > 0 ? '+' : ''}${fmt(bulge.growth, 'pct0')} in a year`,
    })
  const thin = at.get(levelOf(findings.find((f) => f.id === 'hrbp-pyramid-thin')) as Level)
  const above = thin ? at.get(INDIVIDUAL_LEVELS[INDIVIDUAL_LEVELS.indexOf(thin.level) + 1]) : undefined
  if (thin && above?.today)
    notes.push({
      at: thin.level,
      text: `${thinnestWords(thin.today / above.today, data.prep.ctx.metrics.num(PYRAMID_SET.thinRatio.metricId, PYRAMID_SET.thinRatio.key))} of ${above.level}`,
    })
  return notes.slice(0, 2)
}

/** What Ask's `view_summary` returns beyond the tiles: the shape by level and the 12-month flow. */
function askTables(d: PyramidData): AnalysisTable[] {
  const p = d.prep
  const levels: AnalysisTable = {
    id: 'levels',
    title: 'Employees at each level',
    columns: {
      level: 'Level code and name',
      today: 'Employees at the level on the as-of date',
      share: 'Share of employees with a level (a fraction)',
      a_year_ago: 'Employees at the level 12 months earlier, at the level held then',
      change: 'today minus a year ago',
      growth: 'change ÷ a year ago (a fraction), null on a base under the anonymity minimum',
      median_span: 'Median active direct reports of the managers at the level',
    },
    rows: d.main.rows.map((r) => ({
      level: r.label,
      today: r.today,
      share: r.share,
      a_year_ago: r.yearAgo,
      change: r.change,
      growth: r.growth,
      median_span: d.spanByLevel.get(r.level)?.median ?? null,
    })),
    uses: p.uses(PYRAMID_FIELDS),
  }
  if (!d.flow.length) return [levels]
  const flow: AnalysisTable = {
    id: 'flow',
    title: 'How each level changed in 12 months',
    columns: {
      level: 'Level code and name',
      a_year_ago: 'Employees at the level 12 months earlier',
      hired: 'Hired at the level',
      promoted_in: 'Promoted into the level',
      promoted_out: 'Promoted out of the level',
      left: 'Left from the level',
      other_changes: 'Other moves in (+) or out (−): demotions, corrections',
      today:
        'Employees at the level today; a year ago + hired + promoted in − promoted out − left + other = today',
    },
    rows: d.flow.map((f) => ({
      level: f.label,
      a_year_ago: f.yearAgo,
      hired: f.hired,
      promoted_in: f.promotedIn,
      promoted_out: f.promotedOut,
      left: f.left,
      other_changes: f.other,
      today: f.today,
    })),
    uses: p.uses(FLOW),
  }
  return [levels, flow]
}

export function pyramidModel(ctx: AnalyticsContext): PyramidModel {
  const data = pyramidData(ctx)
  const findings = pyramidFindings(data)
  return {
    kpis: pyramidKpis(data),
    findings,
    data,
    notes: chartNotes(data, findings),
    tables: askTables(data),
  }
}

export const PYRAMID: AnalysisDef<PyramidModel> = {
  key: 'pyramid',
  label: 'Level pyramid',
  short: 'Pyramid',
  title: 'Workforce pyramid by level',
  dek: (ctx) =>
    `What shape is the workforce across levels, and what changed in a year? Headcount on ${formatDate(ctx.asOf)} against 12 months earlier.`,
  // Headcount on the as-of date against 12 months earlier, whatever the period.
  window: (ctx) => ({
    start: null,
    end: ctx.asOf,
    label: `Headcount on ${formatDate(ctx.asOf)} and 12 months earlier`,
    ignoresPeriod: true,
  }),
  leadMetric: ID.headcount,
  leadFigure: F.pyramid,
  figures: Object.values(F),
  ready: pyramidReady,
  missing: pyramidMissing,
  model: pyramidModel,
}
