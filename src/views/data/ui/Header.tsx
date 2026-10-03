/**
 * Head of the Data room: the name, the privacy statement, where the loaded data stands, and the
 * actions that cover every dataset at once. "Reset everything" asks for confirmation in place.
 */
import { useEffect, useRef, useState } from 'react'
import { IconDownload, IconFile, IconLock, IconReset, IconWarning } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ManifestSummary } from '../engine/manifest'
import { useImportLogs } from '../state/importLog'
import { downloadSampleWorkbook, downloadTemplate } from './downloads'
import { useBusy } from './useBusy'

function ResetConfirm({ uploaded, onDone }: { uploaded: number; onDone: () => void }) {
  const resetAll = useCensus((s) => s.resetAllToSample)
  const asOfOverride = useCensus((s) => s.asOfOverride)
  const clearLogs = useImportLogs((s) => s.clearAll)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [working, setWorking] = useState(false)
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])
  const what = [
    uploaded ? `${uploaded} uploaded ${uploaded === 1 ? 'dataset' : 'datasets'}` : null,
    asOfOverride ? 'the as-of date you set' : null,
  ].filter(Boolean)
  async function confirm() {
    setWorking(true)
    await resetAll()
    await clearLogs()
    setWorking(false)
    onDone()
    toast('Everything is back on the sample company', { tone: 'good' })
  }
  return (
    <fieldset className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-sheet bg-sheet px-4 py-3">
      <legend className="sr-only">Confirm reset</legend>
      <IconWarning className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 basis-[320px] text-[13px]">
        <span className="font-semibold">Reset everything to the sample company?</span>{' '}
        <span className="text-ink-2">
          This removes {what.join(' and ')} from this browser. Saved column mappings are kept.
        </span>
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button ref={confirmRef} variant="primary" disabled={working} onClick={() => void confirm()}>
          {working ? 'Resetting…' : 'Reset everything'}
        </Button>
      </div>
    </fieldset>
  )
}

export function DataRoomHeader({ summary }: { summary: ManifestSummary }) {
  const ctx = useAnalytics()
  const asOfOverride = useCensus((s) => s.asOfOverride)
  const { isBusy, run } = useBusy()
  const [confirming, setConfirming] = useState(false)
  const canReset = summary.uploaded > 0 || !!asOfOverride
  return (
    <div className="pt-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[420px]">
          <h1 className="cut-head text-[28px] leading-[1.1] font-[650] tracking-[-0.01em]">Data room</h1>
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-ink">
            <IconLock className="mt-0.5 size-3.5 shrink-0 text-ink-2" />
            Files you add stay in this browser. Census reads them on this device and never sends them
            anywhere.
          </p>
          <p className="mt-1 text-[13px] text-ink-2">
            {summary.text} · {fmt(summary.totalRows, 'int')} rows · as of {formatDate(ctx.asOf)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<IconDownload />}
            disabled={isBusy('sample')}
            onClick={() =>
              run(
                'sample',
                async () => {
                  const rows = await downloadSampleWorkbook(ctx.showPay)
                  toast('Sample workbook downloaded', {
                    tone: 'good',
                    description: `All ten datasets, ${fmt(rows, 'int')} rows${ctx.showPay ? '' : ', pay amounts left blank'}.`,
                  })
                },
                'The sample workbook could not be prepared. Try again.',
              )
            }
          >
            {isBusy('sample') ? 'Preparing workbook…' : 'Download sample workbook'}
          </Button>
          <Button
            icon={<IconFile />}
            disabled={isBusy('template')}
            onClick={() =>
              run('template', () => downloadTemplate(), 'The template could not be prepared. Try again.')
            }
          >
            Download blank template
          </Button>
          <Button
            variant="ghost"
            icon={<IconReset />}
            disabled={!canReset || confirming}
            onClick={() => setConfirming(true)}
          >
            Reset everything to sample
          </Button>
        </div>
      </div>
      {confirming && <ResetConfirm uploaded={summary.uploaded} onDone={() => setConfirming(false)} />}
      <div className="mt-4 border-b border-rule" />
    </div>
  )
}
