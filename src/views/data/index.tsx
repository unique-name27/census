/**
 * The Data room (route #data): what data is loaded, how complete it is, and how to replace the
 * sample with your own files. The upload dialog and the spreadsheet reader load on first use.
 */
import { lazy, Suspense, useEffect, useMemo } from 'react'
import type { ExportMeta } from '@/charts/types'
import { IconDownload } from '@/components/icons'
import { Grid, Section } from '@/components/Section'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { buildManifest, manifestSummary, VIEW_COUNT_TEXT } from './engine/manifest'
import { useImportLogs } from './state/importLog'
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

export function DataRoom() {
  const ctx = useAnalytics()
  const phase = useImportSession((s) => s.phase)
  const loadLogs = useImportLogs((s) => s.load)
  const picker = useFilePicker()
  const { isBusy, run } = useBusy()
  const rows = useMemo(
    () => buildManifest({ data: ctx.all, sources: ctx.sources, asOf: ctx.asOf }),
    [ctx.all, ctx.sources, ctx.asOf],
  )
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
    <div>
      <DataRoomHeader summary={summary} />
      <div className="pt-5">
        <Grid>
          <DropZone />
          <AsOfPanel />
        </Grid>
        <Section
          className="mt-10"
          title="Datasets"
          dek={`Ten datasets feed the ${VIEW_COUNT_TEXT}. Replace any one with your own export; the others keep running on the sample. Open a row to see each field.`}
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
        </Section>
      </div>
      {picker.input}
      {phase === 'review' && (
        <Suspense fallback={null}>
          <ImportDialog />
        </Suspense>
      )}
    </div>
  )
}
