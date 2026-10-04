/**
 * Data room downloads: the sample workbook, blank templates and a dataset's current rows, all
 * written by the import library's template writer so every file can be uploaded again as is.
 * The libraries load on first use.
 */
import type { ExportMeta } from '@/charts'
import type { ImportIssue } from '@/data/import'
import { ISSUE_COLUMNS, issueTableRows } from '@/data/import/issues'
import { generateSample, SAMPLE_COMPANY } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import { todayISO } from '@/lib/dates'
import { toCsv } from '@/lib/export/csv'
import { downloadBlob, MIME } from '@/lib/export/download'
import { slug } from '@/lib/export/names'
import { sampleWorkbookDatasets } from '../engine/flow'
import {
  COVERAGE_COLUMNS,
  coverageExportRows,
  MANIFEST_COLUMNS,
  type ManifestRow,
  manifestExportRows,
} from '../engine/manifest'
import { loadImportLib } from '../state/session'

/** Every row of every dataset of the sample company, in the upload layout. */
export async function downloadSampleWorkbook(
  includePay: boolean,
): Promise<{ rows: number; datasets: DatasetKey[]; leftOut: DatasetKey[] }> {
  // Let the button show that the workbook is being prepared before the heavy writing starts.
  await new Promise((r) => setTimeout(r, 30))
  const lib = await loadImportLib()
  const sample = generateSample()
  const datasets = sampleWorkbookDatasets(includePay)
  const blob = await lib.buildTemplateWorkbook({
    sample,
    datasets,
    sampleRows: Number.MAX_SAFE_INTEGER,
    includePay,
  })
  downloadBlob(blob, `census-sample-${slug(SAMPLE_COMPANY)}.xlsx`)
  return {
    rows: datasets.reduce((a, k) => a + sample[k].length, 0),
    datasets,
    leftOut: DATASET_KEYS.filter((k) => !datasets.includes(k)),
  }
}

/** Headers, dropdowns and help sheets with no rows; all ten datasets, or one. */
export async function downloadTemplate(key?: DatasetKey): Promise<void> {
  const lib = await loadImportLib()
  const blob = await lib.buildTemplateWorkbook(key ? { datasets: [key] } : {})
  downloadBlob(blob, key ? `census-template-${slug(datasetDef(key).sheet)}.xlsx` : 'census-template.xlsx')
}

/** A dataset's loaded rows in the upload layout. Pay amounts only when they are switched on. */
export async function downloadCurrent<K extends DatasetKey>(
  key: K,
  rows: Datasets[K],
  includePay: boolean,
): Promise<void> {
  const lib = await loadImportLib()
  const blob = await lib.exportDatasetWorkbook(key, rows, { includePay })
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
