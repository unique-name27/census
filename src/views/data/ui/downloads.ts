/**
 * Data room downloads: the sample workbook, blank templates and a dataset's current rows, all
 * written by the import library's template writer so every file can be uploaded again as is.
 * The libraries load on first use.
 */
import type { Column, ExportMeta } from '@/charts'
import type { ImportIssue } from '@/data/import'
import { ISSUE_COLUMNS, issueTableRows } from '@/data/import/issues'
import { templateLists } from '@/data/lists/effective'
import { useLists } from '@/data/lists/store'
import type { Tier } from '@/data/quality/tier'
import { generateSample, SAMPLE_COMPANY } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { todayISO } from '@/lib/dates'
import { toCsv } from '@/lib/export/csv'
import { downloadBlob, MIME } from '@/lib/export/download'
import { slug } from '@/lib/export/names'
import { leftOutNotes, sampleWorkbookDatasets } from '../engine/flow'
import { LINEAGE_COLUMNS, type LineageRow, lineageExportRows } from '../engine/lineage'
import {
  COVERAGE_COLUMNS,
  coverageExportRows,
  MANIFEST_COLUMNS,
  type ManifestRow,
  manifestExportRows,
} from '../engine/manifest'
import { loadImportLib } from '../state/session'

/** Dropdowns for the template columns that have an official list (Settings > Official lists). */
function officialDropdowns() {
  return templateLists(useLists.getState().state, useCensus.getState().sources)
}

/** Every row of every dataset of the sample company, in the upload layout. */
export async function downloadSampleWorkbook(
  includePay: boolean,
): Promise<{ rows: number; datasets: DatasetKey[]; leftOut: DatasetKey[] }> {
  // Let the button show that the workbook is being prepared before the heavy writing starts.
  await new Promise((r) => setTimeout(r, 30))
  const lib = await loadImportLib()
  const sample = generateSample()
  const datasets = sampleWorkbookDatasets(includePay)
  const leftOut = DATASET_KEYS.filter((k) => !datasets.includes(k))
  const blob = await lib.buildTemplateWorkbook({
    sample,
    datasets,
    sampleRows: Number.MAX_SAFE_INTEGER,
    includePay,
    notes: leftOutNotes(leftOut),
    lists: officialDropdowns(),
  })
  downloadBlob(blob, `census-sample-${slug(SAMPLE_COMPANY)}.xlsx`)
  return {
    rows: datasets.reduce((a, k) => a + sample[k].length, 0),
    datasets,
    leftOut,
  }
}

/** Headers, dropdowns and help sheets with no rows; every dataset, or one. */
export async function downloadTemplate(key?: DatasetKey): Promise<void> {
  const lib = await loadImportLib()
  const blob = await lib.buildTemplateWorkbook({
    ...(key ? { datasets: [key] } : {}),
    lists: officialDropdowns(),
  })
  downloadBlob(blob, key ? `census-template-${slug(datasetDef(key).sheet)}.xlsx` : 'census-template.xlsx')
}

/** A dataset's loaded rows in the upload layout. Pay amounts only when they are switched on. */
export async function downloadCurrent<K extends DatasetKey>(
  key: K,
  rows: Datasets[K],
  includePay: boolean,
): Promise<void> {
  const lib = await loadImportLib()
  const blob = await lib.exportDatasetWorkbook(key, rows, { includePay, lists: officialDropdowns() })
  downloadBlob(blob, `census-${slug(datasetDef(key).sheet)}-${todayISO()}.xlsx`)
}

/** The manifest and every field's fill rate, as a two-sheet workbook. */
export async function downloadManifest(
  rows: readonly ManifestRow[],
  meta: ExportMeta,
  showPay: boolean,
): Promise<void> {
  const { downloadXlsx } = await import('@/lib/export')
  await downloadXlsx(
    [
      {
        name: 'Datasets',
        title: 'Datasets loaded',
        subtitle: 'Source, rows, field coverage and checks for each dataset',
        columns: MANIFEST_COLUMNS,
        rows: manifestExportRows(rows),
      },
      {
        name: 'Field coverage',
        title: 'Field coverage',
        subtitle: 'Share of rows with a value, per field. Values themselves are not included.',
        columns: COVERAGE_COLUMNS,
        rows: coverageExportRows(rows),
      },
    ],
    meta,
    { showPay, fileName: `census-data-room-manifest-${slug(meta.asOf)}` },
  )
}

/** The exceptions log of one import as CSV (values of pay fields already redacted by the caller). */
export function downloadIssuesCsv(issues: readonly ImportIssue[], fileStem: string): void {
  const csv = toCsv({ columns: ISSUE_COLUMNS, rows: issueTableRows(issues) }, { showPay: false })
  downloadBlob(new Blob([csv], { type: MIME.csv }), `${fileStem}.csv`)
}

/** A dataset's field-by-field quality and its checks, as a two-sheet workbook. */
export async function downloadQuality(args: {
  key: DatasetKey
  tier: Tier
  fields: { columns: readonly Column[]; rows: readonly Record<string, unknown>[] }
  checks: { columns: readonly Column[]; rows: readonly Record<string, unknown>[] }
  meta: ExportMeta
}): Promise<void> {
  const { downloadXlsx } = await import('@/lib/export')
  const label = datasetDef(args.key).label
  await downloadXlsx(
    [
      {
        name: 'Fields',
        title: `${label}: field quality`,
        subtitle:
          'Fill rate over the rows each field applies to, values not recognized or defaulted, and tier',
        columns: args.fields.columns,
        rows: args.fields.rows,
        tier: args.tier,
      },
      {
        name: 'Checks',
        title: `${label}: checks`,
        subtitle: 'The rules behind the tier, silver gates first',
        columns: args.checks.columns,
        rows: args.checks.rows,
        tier: args.tier,
      },
    ],
    { ...args.meta, tab: label },
    {
      showPay: false,
      fileName: `census-${slug(datasetDef(args.key).sheet)}-quality-${slug(args.meta.asOf)}`,
    },
  )
}

/** Where each field of a version came from, as a workbook. */
export async function downloadLineage(
  key: DatasetKey,
  rows: readonly LineageRow[],
  meta: ExportMeta,
): Promise<void> {
  const { downloadXlsx } = await import('@/lib/export')
  const label = datasetDef(key).label
  await downloadXlsx(
    [
      {
        name: 'Mapping',
        title: `${label}: column mapping`,
        subtitle: 'Source column, conversion, match confidence and review for each field',
        columns: LINEAGE_COLUMNS,
        rows: lineageExportRows(rows),
      },
    ],
    { ...meta, tab: label },
    { showPay: false, fileName: `census-${slug(datasetDef(key).sheet)}-mapping` },
  )
}

/**
 * The stored raw sheet with its original headers (hidden columns already left out by the
 * caller). CSV keeps it machine-readable; Excel adds the title block.
 */
export async function downloadRaw(args: {
  key: DatasetKey
  sheetLabel: string
  table: { columns: readonly Column[]; rows: readonly Record<string, unknown>[] }
  meta: ExportMeta
  format: 'csv' | 'xlsx'
}): Promise<void> {
  const label = datasetDef(args.key).label
  const fileName = `census-${slug(datasetDef(args.key).sheet)}-raw-${slug(args.sheetLabel)}`
  const table = {
    name: 'Raw sheet',
    title: `${label}: raw sheet as uploaded`,
    subtitle: args.sheetLabel,
    columns: args.table.columns,
    rows: args.table.rows,
  }
  if (args.format === 'csv') {
    const csv = toCsv(table, { showPay: false })
    downloadBlob(new Blob([csv], { type: MIME.csv }), `${fileName}.csv`)
    return
  }
  const { downloadXlsx } = await import('@/lib/export')
  await downloadXlsx([table], { ...args.meta, tab: label }, { showPay: false, fileName })
}
