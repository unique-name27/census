/**
 * The Data room (route #data): two tabs. Datasets shows what is loaded, each dataset's tier and
 * its Raw, Mapping, Quality and Certify panels, and how to replace the sample with your own files.
 * Categories & mapping (#data.mapping) shows how the categories in the data relate and lets you
 * fix them. The upload dialog, the spreadsheet reader and the mapping tab load on first use.
 */
import { lazy, Suspense, useEffect, useMemo } from 'react'
import { clearDatasetFocus, useDatasetFocus } from '@/app/datasetFocus'
import { type Column, type Definition, Figure } from '@/charts'
import { type CurrentView, CurrentViewProvider } from '@/components/currentView'
import { IconDownload } from '@/components/icons'
import { Grid } from '@/components/Section'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { summarizeIssues } from '@/data/import/issues'
import type { Tier } from '@/data/quality'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { useCensus } from '@/data/store'
import { VIEWS } from '@/views/registry'
import {
  buildManifest,
  COVERAGE_COLUMNS,
  coverageExportRows,
  feedsFromViews,
  MANIFEST_COLUMNS,
  type ManifestRow,
  manifestExportRows,
  manifestSummary,
  type UploadFacts,
  VIEW_COUNT_TEXT,
} from './engine/manifest'
import { DATA_TABS, parseDataTab } from './links'
import { logFor, useImportLogs } from './state/importLog'
import { useRoom } from './state/room'
import { useImportSession } from './state/session'
import { DropZone } from './ui/DropZone'
import { downloadManifest } from './ui/downloads'
import { rowsSpec } from './ui/drillSpecs'
import { DATA_BODY_ID, DataRoomHeader } from './ui/Header'
import { Manifest } from './ui/Manifest'
import { roomMeta } from './ui/meta'
import { ReportingLine } from './ui/ReportingLine'
import { useBusy } from './ui/useBusy'
import { useFilePicker } from './ui/useFilePicker'

const loadDialog = () => import('./ui/import/ImportDialog')
const ImportDialog = lazy(loadDialog)

// The Categories & mapping tab lives in ./mapping and loads on first visit.
const MappingTab = lazy(() => import('./mapping/MappingTab').then((m) => ({ default: m.MappingTab })))

/** Which views read each dataset, as the views declare it. */
const FEEDS = feedsFromViews(VIEWS)

const ROOM_TABS = DATA_TABS.map((t) => ({ key: t.route, label: t.label }))

const DEFINITIONS: Definition[] = [
  {
    term: 'Tier',
    text: 'How far a dataset has come. No data: nothing loaded. Bronze: loaded as it came in, mapping not reviewed. Silver: mapping confirmed and checks pass. Gold: certified by its data owner for this version, reconciled to control totals and fresh.',
  },
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

/** The manifest's table view: a dataset's row count opens its rows, as on the sheet. */
function manifestColumns(rows: readonly ManifestRow[], data: Datasets): Column[] {
  return MANIFEST_COLUMNS.map((c) =>
    c.key === 'rows'
      ? {
          ...c,
          drill: (r: Record<string, unknown>) => {
            const row = rows.find((m) => m.label === r.dataset)
            return row?.rows ? () => rowsSpec(row, data) : null
          },
        }
      : c,
  )
}

/** Requests to show a dataset (tier badges anywhere, `#data.<key>-<panel>` links) open it here. */
function useDatasetRequests(routeTab: string) {
  const show = useRoom((s) => s.show)
  const { key, panel, nonce } = useDatasetFocus()
  useEffect(() => {
    // `nonce` changes on every request, so asking for the same dataset again still shows it.
    if (!key || !nonce) return
    show(key, panel)
    clearDatasetFocus()
  }, [key, panel, nonce, show])
  useEffect(() => {
    const r = parseDataTab(routeTab)
    if (r.dataset) show(r.dataset, r.panel)
  }, [routeTab, show])
}

function DatasetsTab({
  rows,
  summaryRows,
}: {
  rows: readonly ManifestRow[]
  summaryRows: Record<string, unknown>[]
}) {
  const ctx = useAnalytics()
  const picker = useFilePicker()
  const { isBusy, run } = useBusy()
  return (
    <>
      <Grid>
        <ReportingLine />
        <DropZone />
      </Grid>
      <Grid className="mt-10">
        <Figure
          id="data-manifest"
          title="Datasets"
          subtitle={`Ten datasets feed the ${VIEW_COUNT_TEXT}. Replace any one with your own export; the others keep running on the sample. Open a row for its raw sheet, mapping, quality and certification.`}
          data={summaryRows}
          columns={manifestColumns(rows, ctx.all)}
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
                  () => downloadManifest(rows, roomMeta(ctx), ctx.showPay),
                  'The manifest could not be exported.',
                )
              }
            >
              Download manifest
            </Button>
          }
        >
          <Manifest rows={rows} data={ctx.all} onUpload={(key) => picker.open(key)} />
        </Figure>
      </Grid>
      {picker.input}
    </>
  )
}

export function DataRoom() {
  const ctx = useAnalytics()
  const routeTab = useCensus((s) => (s.route.view === 'data' ? s.route.tab : ''))
  const tab = parseDataTab(routeTab).tab
  const phase = useImportSession((s) => s.phase)
  const logs = useImportLogs((s) => s.logs)
  const loadLogs = useImportLogs((s) => s.load)
  const uploads = useMemo(() => {
    const out: Partial<Record<DatasetKey, UploadFacts | null>> = {}
    for (const k of DATASET_KEYS) {
      const log = logFor(logs, k, ctx.sources[k])
      out[k] = log ? { fills: log.fills ?? null, changeKinds: summarizeIssues(log.issues).length } : null
    }
    return out
  }, [logs, ctx.sources])
  const tiers = useMemo(() => {
    const out: Partial<Record<DatasetKey, Tier>> = {}
    for (const k of DATASET_KEYS) out[k] = ctx.quality.datasetTier(k)
    return out
  }, [ctx.quality])
  const rows = useMemo(
    () =>
      buildManifest({
        data: ctx.all,
        sources: ctx.sources,
        asOf: ctx.asOf,
        feeds: FEEDS,
        uploads,
        tiers,
        quality: ctx.quality,
      }),
    [ctx.all, ctx.sources, ctx.asOf, uploads, tiers, ctx.quality],
  )
  const exportRows = useMemo(() => manifestExportRows(rows), [rows])
  const summary = manifestSummary(rows)
  useDatasetRequests(routeTab)

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])
  useEffect(() => {
    // Fetch the dialog while the files are being read, so it opens without a pause.
    if (phase === 'reading') void loadDialog()
  }, [phase])

  const current: CurrentView = {
    key: 'data',
    label: 'Data room',
    tabs: ROOM_TABS,
    tab: tab === 'mapping' ? 'mapping' : '',
  }

  return (
    <CurrentViewProvider value={current}>
      <DataRoomHeader summary={summary} tab={tab} />
      <div id={DATA_BODY_ID} role="tabpanel" aria-labelledby={`subtab-data-${tab}`} className="pt-5">
        {tab === 'mapping' ? (
          <Suspense fallback={<p className="text-[13px] text-muted">Loading categories and mapping…</p>}>
            <MappingTab />
          </Suspense>
        ) : (
          <DatasetsTab rows={rows} summaryRows={exportRows} />
        )}
      </div>
      {phase === 'review' && (
        <Suspense fallback={null}>
          <ImportDialog />
        </Suspense>
      )}
    </CurrentViewProvider>
  )
}
