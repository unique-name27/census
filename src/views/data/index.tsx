/**
 * The Data room (route #data): what data is loaded, how complete it is, and how to replace the
 * sample with your own files. The upload dialog and the spreadsheet reader load on first use.
 */
import { lazy, Suspense, useEffect, useMemo } from 'react'
import { type Definition, type ExportMeta, Figure } from '@/charts'
import { type CurrentView, CurrentViewProvider } from '@/components/currentView'
import { IconDownload } from '@/components/icons'
import { Grid } from '@/components/Section'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { summarizeIssues } from '@/data/import/issues'
import { SAMPLE_COMPANY } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { VIEWS } from '@/views/registry'
import {
  buildManifest,
  COVERAGE_COLUMNS,
  coverageExportRows,
  feedsFromViews,
  MANIFEST_COLUMNS,
  manifestExportRows,
  manifestSummary,
  type UploadFacts,
  VIEW_COUNT_TEXT,
} from './engine/manifest'
import { logFor, useImportLogs } from './state/importLog'
import { useImportSession } from './state/session'
import { AsOfPanel } from './ui/AsOfPanel'
import { DropZone } from './ui/DropZone'
import { downloadManifest } from './ui/downloads'
import { DataRoomHeader } from './ui/Header'
import { Manifest } from './ui/Manifest'
import { useBusy } from './ui/useBusy'
import { useFilePicker } from './ui/useFilePicker'

const loadDialog = () => import('./ui/import/ImportDialog')
const ImportDialog = lazy(loadDialog)

/** Which views read each dataset, as the views declare it. */
const FEEDS = feedsFromViews(VIEWS)

/** Labels figure exports "Data room" (the shell provides this for the six views only). */
const CURRENT: CurrentView = { key: 'data', label: 'Data room', tabs: [], tab: '' }

const DEFINITIONS: Definition[] = [
  {
    term: 'Field coverage',
    text: 'Mean share of rows filled across a dataset’s required and recommended fields. A field that only applies to some rows (Termination type applies to leavers) counts only those rows. Values the importer set to Unknown or filled by a default count as blank.',
    formula: 'mean over fields of (rows filled ÷ rows the field applies to)',
  },
  {
    term: 'Feeds',
    text: 'The views that read the dataset. Replacing it changes the numbers in those views.',
  },
  {
    term: 'Issues',
    text: 'Checks on the loaded rows: fields blank in every row, fields the attrition metrics need, rows that refer to people or requisitions missing from the linked dataset, and data that stops well before the as-of date.',
  },
]

export function DataRoom() {
  const ctx = useAnalytics()
  const phase = useImportSession((s) => s.phase)
  const logs = useImportLogs((s) => s.logs)
  const loadLogs = useImportLogs((s) => s.load)
  const picker = useFilePicker()
  const { isBusy, run } = useBusy()
  const uploads = useMemo(() => {
    const out: Partial<Record<DatasetKey, UploadFacts | null>> = {}
    for (const k of DATASET_KEYS) {
      const log = logFor(logs, k, ctx.sources[k])
      out[k] = log ? { fills: log.fills ?? null, changeKinds: summarizeIssues(log.issues).length } : null
    }
    return out
  }, [logs, ctx.sources])
  const rows = useMemo(
    () => buildManifest({ data: ctx.all, sources: ctx.sources, asOf: ctx.asOf, feeds: FEEDS, uploads }),
    [ctx.all, ctx.sources, ctx.asOf, uploads],
  )
  const exportRows = useMemo(() => manifestExportRows(rows), [rows])
  const summary = manifestSummary(rows)

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])
  useEffect(() => {
    // Fetch the dialog while the files are being read, so it opens without a pause.
    if (phase === 'reading') void loadDialog()
  }, [phase])

  const meta: ExportMeta = {
    view: 'Data room',
    scope: 'All datasets',
    window: '',
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    company: ctx.isSample ? SAMPLE_COMPANY : 'Company data',
  }

  return (
    <CurrentViewProvider value={CURRENT}>
      <DataRoomHeader summary={summary} />
      <div className="pt-5">
        <Grid>
          <DropZone />
          <AsOfPanel />
        </Grid>
        <Grid className="mt-10">
          <Figure
            id="data-manifest"
            title="Datasets"
            subtitle={`Ten datasets feed the ${VIEW_COUNT_TEXT}. Replace any one with your own export; the others keep running on the sample. Open a row to see each field.`}
            data={exportRows}
            columns={MANIFEST_COLUMNS}
            definitions={DEFINITIONS}
            image={false}
            detail={{
              label: 'Field coverage',
              columns: COVERAGE_COLUMNS,
              rows: () => coverageExportRows(rows),
            }}
            table={{ maxRows: 10 }}
            actions={
              <Button
                size="sm"
                variant="ghost"
                icon={<IconDownload />}
                disabled={isBusy('manifest')}
                onClick={() =>
                  run(
                    'manifest',
                    () => downloadManifest(rows, meta, ctx.showPay),
                    'The manifest could not be exported.',
                  )
                }
              >
                Download manifest
              </Button>
            }
          >
            <Manifest rows={rows} onUpload={(key) => picker.open(key)} />
          </Figure>
        </Grid>
      </div>
      {picker.input}
      {phase === 'review' && (
        <Suspense fallback={null}>
          <ImportDialog />
        </Suspense>
      )}
    </CurrentViewProvider>
  )
}
