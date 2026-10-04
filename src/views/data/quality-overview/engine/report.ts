/**
 * Columns and export rows for every section of the Data quality tab, and the "Data quality report"
 * workbook that puts each section on its own sheet. Pure (the download itself is in the UI).
 */
import type { Column } from '@/charts/types'
import type { QualityRules } from '@/data/quality/rules'
import { TIER_LABEL, type Tier } from '@/data/quality/tier'
import { datasetDef } from '@/data/schema'
import type { ExportTable } from '@/lib/export/types'
import { REQUIREMENT_LABEL } from '../../engine/coverage'
import type { Fix, MetricTierRow } from './impact'
import { shareFormat, withShare } from './share'
import type { CheckRow, DatasetSummaryRow, FieldCell, TrendRow } from './summary'
import { fieldLabelOf } from './summary'

type Row = Record<string, unknown>

/* ───────────── datasets ───────────── */

export const DATASET_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset', width: 20 },
  { key: 'tier', label: 'Tier', width: 9 },
  { key: 'version', label: 'Version', width: 24 },
  { key: 'loaded', label: 'Loaded', format: 'date' },
  { key: 'rows', label: 'Rows', format: 'int' },
  { key: 'mapping', label: 'Mapping', width: 30 },
  { key: 'certification', label: 'Certification', width: 30 },
  { key: 'freshness', label: 'Freshness', width: 20 },
  // Shares read as on the tab: never 0% or 100% when there are rows behind them.
  { key: 'issueRate', label: 'Import error rate', format: shareFormat('issueRate') },
  { key: 'fieldsBelow', label: 'Fields below the dataset', format: 'int' },
  { key: 'failing', label: 'Checks not passing', format: 'int' },
  { key: 'next', label: 'Next tier needs', width: 44 },
]

export function datasetExportRows(rows: readonly DatasetSummaryRow[]): Row[] {
  return rows.map((r) => ({
    key: r.key,
    dataset: r.dataset,
    tier: r.tierLabel,
    version: r.version,
    loaded: r.loaded,
    rows: r.rows,
    mapping: r.mapping,
    certification: r.certification,
    freshness: r.freshness,
    ...withShare('issueRate', r.issueRate),
    fieldsBelow: r.fieldsBelow,
    failing: r.failing,
    next: r.next ?? (r.tier === 'gold' ? 'At gold' : ''),
  }))
}

/* ───────────── fields ───────────── */

export const FIELD_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset', width: 20 },
  { key: 'field', label: 'Field', width: 24 },
  { key: 'requirement', label: 'Needed', width: 12 },
  { key: 'scope', label: 'Which rows count', width: 30 },
  { key: 'applicable', label: 'Rows it applies to', format: 'int' },
  { key: 'coverage', label: 'Filled', format: shareFormat('coverage') },
  { key: 'blank', label: 'Blank', format: 'int' },
  { key: 'invalid', label: 'Not recognized', format: 'int' },
  { key: 'defaulted', label: 'Defaulted', format: 'int' },
  { key: 'remapped', label: 'Remapped', format: 'int' },
  { key: 'tier', label: 'Tier', width: 9 },
  { key: 'why', label: 'Why it falls short', width: 56 },
]

/**
 * One row per field. The fill rate reads as everywhere on the tab: never rounded across the silver
 * bar (`rules`), never 100% with a blank behind it.
 */
export function fieldExportRows(
  cells: readonly FieldCell[],
  rules?: Pick<QualityRules, 'minCoverage'>,
): Row[] {
  return cells.map((c) => ({
    key: c.key,
    ref: c.ref,
    dataset: c.dataset,
    field: c.field,
    requirement: REQUIREMENT_LABEL[c.requirement],
    scope: c.scope ?? 'All rows',
    applicable: c.applicable,
    ...withShare(
      'coverage',
      c.coverage,
      rules && !c.blankOk ? { threshold: rules.minCoverage, side: 'min' } : null,
    ),
    blank: c.blank,
    invalid: c.invalid,
    defaulted: c.defaulted,
    remapped: c.remapped,
    tier: TIER_LABEL[c.tier],
    why: c.why,
  }))
}

/* ───────────── metric impact ───────────── */

export const FIX_COLUMNS: Column[] = [
  { key: 'rank', label: 'Rank', format: 'int' },
  { key: 'fix', label: 'Fix', width: 60 },
  { key: 'dataset', label: 'Dataset', width: 20 },
  { key: 'field', label: 'Field', width: 22 },
  { key: 'rows', label: 'Rows to fix', format: 'int' },
  { key: 'lifted', label: 'Metrics lifted', format: 'int' },
  { key: 'toGold', label: 'To gold', format: 'int' },
  { key: 'toSilver', label: 'To silver', format: 'int' },
  { key: 'toBronze', label: 'To bronze', format: 'int' },
  { key: 'metrics', label: 'Metrics it lifts', width: 60 },
]

const countTo = (f: Fix, t: Tier) => f.lifts.filter((l) => l.to === t).length

export function fixExportRows(fixes: readonly Fix[]): Row[] {
  return fixes.map((f, i) => ({
    id: f.id,
    rank: i + 1,
    fix: f.sentence,
    dataset: datasetDef(f.dataset).label,
    field: f.ref ? fieldLabelOf(f.ref) : '',
    rows: f.rows,
    lifted: f.lifts.length,
    toGold: countTo(f, 'gold'),
    toSilver: countTo(f, 'silver'),
    toBronze: countTo(f, 'bronze'),
    metrics: f.lifts.map((l) => l.name).join(', '),
  }))
}

export const METRIC_COLUMNS: Column[] = [
  { key: 'id', label: 'Metric ID', width: 30 },
  { key: 'metric', label: 'Metric', width: 28 },
  { key: 'view', label: 'View', width: 14 },
  { key: 'tier', label: 'Tier', width: 9 },
  { key: 'limiting', label: 'Limited by', width: 30 },
  { key: 'fields', label: 'Fields it reads', format: 'int' },
  { key: 'why', label: 'Why', width: 60 },
  { key: 'bestFix', label: 'What would lift it', width: 50 },
]

export function metricExportRows(rows: readonly MetricTierRow[]): Row[] {
  return rows.map((r) => ({
    id: r.id,
    metric: r.name,
    view: r.viewLabel,
    tier: TIER_LABEL[r.tier],
    limiting: r.limitingLabel,
    fields: r.fields,
    why: r.why,
    bestFix: r.bestFix ?? (r.tier === 'gold' ? 'At gold' : 'No single fix'),
  }))
}

/* ───────────── checks ───────────── */

export const CHECK_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset', width: 20 },
  { key: 'check', label: 'Check', width: 26 },
  { key: 'needed', label: 'Needed for', width: 12 },
  { key: 'result', label: 'Result', width: 8 },
  { key: 'detail', label: 'Detail', width: 70 },
  { key: 'count', label: 'Rows', format: 'int' },
]

/** Checks about rows; the others (mapping, certification, freshness) have no row count. */
const ROW_CHECKS = new Set<CheckRow['id']>(['issue-rate', 'references', 'dates-in-order', 'no-duplicates'])

export function checkExportRows(rows: readonly CheckRow[]): Row[] {
  return rows.map((r) => ({
    key: r.key,
    id: r.id,
    dataset: r.dataset,
    check: r.check,
    needed: r.needed,
    result: r.result,
    detail: r.detail,
    count: ROW_CHECKS.has(r.id) ? r.count : null,
  }))
}

/* ───────────── trend ───────────── */

export const TREND_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset', width: 20 },
  { key: 'version', label: 'Version', width: 24 },
  { key: 'status', label: 'Status', width: 10 },
  { key: 'loaded', label: 'Loaded', format: 'date' },
  { key: 'rows', label: 'Rows', format: 'int' },
  { key: 'issueRate', label: 'Import error rate', format: shareFormat('issueRate') },
  { key: 'mapping', label: 'Mapping confirmed', width: 10 },
  { key: 'certified', label: 'Certified', width: 10 },
  { key: 'tier', label: 'Tier', width: 9 },
  { key: 'basis', label: 'Tier judged by', width: 22 },
]

export function trendExportRows(rows: readonly TrendRow[]): Row[] {
  return rows.map((r) => ({
    key: r.key,
    versionId: r.versionId,
    dataset: r.dataset,
    version: r.version,
    status: r.current ? 'Current' : 'Earlier',
    loaded: r.loaded,
    rows: r.rows,
    ...withShare('issueRate', r.issueRate),
    mapping: r.mappingConfirmed ? 'Yes' : 'No',
    certified: r.certified ? 'Yes' : 'No',
    tier: r.tierLabel,
    basis: r.basis,
  }))
}

/* ───────────── the workbook ───────────── */

export interface ReportSections {
  /** The rules in force, so fill rates read as on the tab. */
  rules?: Pick<QualityRules, 'minCoverage'>
  datasets: readonly DatasetSummaryRow[]
  fields: readonly FieldCell[]
  fixes: readonly Fix[]
  metrics: readonly MetricTierRow[]
  checks: readonly CheckRow[]
  trend: readonly TrendRow[]
}

/** Sheet names of the report, in order. */
export const REPORT_SHEETS = ['Datasets', 'Fields', 'Metric impact', 'Metrics', 'Checks', 'Trend'] as const

/** Every section of the tab as a sheet of the "Data quality report" workbook. */
export function qualityReportSheets(s: ReportSections): ExportTable[] {
  return [
    {
      name: REPORT_SHEETS[0],
      title: 'Datasets by tier',
      subtitle: 'Tier, version, mapping, certification, freshness and import error rate of each dataset',
      columns: DATASET_COLUMNS,
      rows: datasetExportRows(s.datasets),
    },
    {
      name: REPORT_SHEETS[1],
      title: 'Field quality',
      subtitle: 'Fill rate over the rows each field applies to, values not recognized or defaulted, and tier',
      columns: FIELD_COLUMNS,
      rows: fieldExportRows(s.fields, s.rules),
    },
    {
      name: REPORT_SHEETS[2],
      title: 'What would lift the most metrics',
      subtitle: 'Single fixes ranked by how many metrics each would raise to a higher tier',
      columns: FIX_COLUMNS,
      rows: fixExportRows(s.fixes),
    },
    {
      name: REPORT_SHEETS[3],
      title: 'Metrics by tier',
      subtitle: 'Every registered metric with its tier and the field or dataset limiting it',
      columns: METRIC_COLUMNS,
      rows: metricExportRows(s.metrics),
    },
    {
      name: REPORT_SHEETS[4],
      title: 'Checks',
      subtitle: 'Every rule result across datasets, silver gates first',
      columns: CHECK_COLUMNS,
      rows: checkExportRows(s.checks),
    },
    {
      name: REPORT_SHEETS[5],
      title: 'Tier and import error rate by version',
      subtitle: 'The current version of each dataset and the earlier versions kept',
      columns: TREND_COLUMNS,
      rows: trendExportRows(s.trend),
    },
  ]
}
