/**
 * What applies to the whole dictionary: download it as the "Metric dictionary" workbook, import
 * an edited copy (previewed field by field before anything changes), put every metric back to
 * its defaults (confirmed in the page), and the name the change log records.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { useExportMeta } from '@/charts'
import { IconDownload, IconReset, IconUpload, IconWarning } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, StatusPill } from '@/components/ui'
import { useCensus } from '@/data/store'
import { CATALOG } from '@/metrics/catalog'
import { type DictionaryPlan, rejectedText } from '@/metrics/excel'
import { describeChange } from '@/metrics/overrides'
import type { MetricImportReport, MetricsApi } from '@/metrics/types'
import { previewSummary } from '../model'
import { INPUT_BOX } from './fields'

const intText = (n: number) => n.toLocaleString('en-US')
const PREVIEW_ROWS = 12

interface Pending {
  fileName: string
  buffer: ArrayBuffer
  plan: DictionaryPlan
  report: MetricImportReport
}

/** Read an edited dictionary and work out what it would change, without changing anything. */
async function previewFile(file: File, api: MetricsApi): Promise<Pending | { error: string }> {
  const { applyDictionaryPlan, prepareDictionaryImport } = await import('@/metrics/excel')
  const buffer = await file.arrayBuffer()
  const r = await prepareDictionaryImport(buffer, CATALOG)
  if (!r.ok) return { error: r.error }
  const { report } = applyDictionaryPlan(r.plan, api.state, CATALOG)
  return { fileName: file.name, buffer, plan: r.plan, report }
}

function ImportPreview({ pending, by, onDone }: { pending: Pending; by: string; onDone: () => void }) {
  const importDictionary = useCensus((s) => s.importMetricDictionary)
  const [busy, setBusy] = useState(false)
  const [all, setAll] = useState(false)
  const applyRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const { report } = pending
  const changes = report.changed
  const shown = all ? changes : changes.slice(0, PREVIEW_ROWS)

  useEffect(() => {
    applyRef.current?.focus()
  }, [])

  const confirm = async () => {
    setBusy(true)
    try {
      const r = await importDictionary(pending.buffer, by)
      if (r.ok)
        toast(r.report.changed.length ? 'Metric dictionary imported' : 'Nothing changed', {
          tone: r.report.changed.length ? 'good' : 'neutral',
          description: r.report.summary,
        })
      else toast('The dictionary could not be imported', { tone: 'critical', description: r.error })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={titleId} className="mt-4 rounded-sheet bg-sheet px-4 py-3.5">
      <h3 id={titleId} className="cut-head text-[15px] font-semibold text-ink">
        Import {pending.fileName}?
      </h3>
      <p className="mt-0.5 text-[13px] text-ink-2">
        {previewSummary(report)} Nothing changes until you apply it.
      </p>
      {changes.length > 0 && (
        <>
          <p className="eyebrow mt-3">Changes</p>
          <ul className="mt-1 divide-y divide-rule">
            {shown.map((c) => (
              <li key={c.id} className="py-1.5 text-[13px] leading-snug text-ink">
                {describeChange(c, CATALOG)}
              </li>
            ))}
          </ul>
          {changes.length > PREVIEW_ROWS && (
            <Button size="sm" variant="ghost" className="-ml-2.5" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${intText(changes.length)}`}
            </Button>
          )}
        </>
      )}
      {report.rejected.length > 0 && (
        <>
          <p className="eyebrow mt-3">Not applied</p>
          <ul className="mt-1 divide-y divide-rule">
            {report.rejected.map((r, i) => (
              <li key={`${r.sheet}-${r.row}-${r.field}-${i}`} className="flex items-start gap-2 py-1.5">
                <StatusPill severity="warning" label="Not applied" />
                <span className="min-w-0 text-[13px] leading-snug text-ink-2">
                  {rejectedText(r, CATALOG)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {report.unknown.length > 0 && (
        <p className="mt-3 text-[12px] text-muted">
          Not in Census, skipped: <span className="font-mono">{report.unknown.join(', ')}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          ref={applyRef}
          variant="primary"
          disabled={busy || changes.length === 0}
          onClick={() => void confirm()}
        >
          {busy
            ? 'Applying…'
            : `Apply ${intText(changes.length)} ${changes.length === 1 ? 'change' : 'changes'}`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onDone}>
          {changes.length ? 'Cancel' : 'Close'}
        </Button>
      </div>
    </section>
  )
}

function ResetAllConfirm({ count, by, onDone }: { count: number; by: string; onDone: () => void }) {
  const resetAll = useCensus((s) => s.resetAllMetrics)
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])
  return (
    <fieldset className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-sheet bg-sheet px-4 py-3">
      <legend className="sr-only">Confirm reset</legend>
      <IconWarning className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 basis-[320px] text-[13px]">
        <span className="font-semibold">
          {count === 1
            ? 'Put the 1 changed metric back to its defaults?'
            : `Put all ${intText(count)} changed metrics back to their defaults?`}
        </span>{' '}
        <span className="text-ink-2">
          Every view recalculates with the default wording, targets and settings. Each reset is logged and can
          be undone from the change log.
        </span>
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          ref={confirmRef}
          variant="primary"
          onClick={() => {
            resetAll(by)
            onDone()
            toast('Every metric is back to its defaults', { tone: 'good' })
          }}
        >
          Reset all to defaults
        </Button>
      </div>
    </fieldset>
  )
}

export function DictionaryBar({
  api,
  isSample,
  name,
  setName,
}: {
  api: MetricsApi
  isSample: boolean
  name: string
  setName: (n: string) => void
}) {
  const meta = useExportMeta()
  const fileRef = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [confirming, setConfirming] = useState(false)
  const changed = api.changedCount

  const download = async () => {
    setBusy('export')
    try {
      const { downloadMetricDictionary } = await import('@/metrics/excel')
      await downloadMetricDictionary(api, { company: isSample ? meta.company : undefined, isSample })
      toast('Metric dictionary downloaded', {
        tone: 'good',
        description: 'Edit the wording, targets or current values in Excel, then import it here.',
      })
    } catch (err) {
      console.error('The metric dictionary could not be exported', err)
      toast('The metric dictionary could not be exported. Try again.', { tone: 'critical' })
    } finally {
      setBusy(null)
    }
  }

  const pick = async (file: File) => {
    setBusy('import')
    setConfirming(false)
    try {
      const r = await previewFile(file, api)
      if ('error' in r)
        toast(`${file.name} could not be imported`, { tone: 'critical', description: r.error })
      else setPending(r)
    } catch (err) {
      console.error('The metric dictionary could not be read', err)
      toast(`${file.name} could not be read.`, { tone: 'critical' })
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<IconDownload />} disabled={busy != null} onClick={() => void download()}>
            {busy === 'export' ? 'Preparing workbook…' : 'Download metric dictionary'}
          </Button>
          <Button icon={<IconUpload />} disabled={busy != null} onClick={() => fileRef.current?.click()}>
            {busy === 'import' ? 'Reading…' : 'Import dictionary'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            hidden
            aria-label="Import an edited metric dictionary"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pick(f)
            }}
          />
          <Button
            variant="ghost"
            icon={<IconReset />}
            disabled={!changed || confirming}
            onClick={() => {
              setPending(null)
              setConfirming(true)
            }}
          >
            Reset all to defaults
          </Button>
        </div>
        <div className="ml-auto grid gap-1">
          <label htmlFor={nameId} className="text-[12px] font-medium text-ink-2">
            Your name, for the change log
          </label>
          <input
            id={nameId}
            value={name}
            placeholder="Optional"
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            className={`${INPUT_BOX} h-7 w-[220px] max-w-full py-0`}
          />
        </div>
      </div>
      {pending && <ImportPreview pending={pending} by={name} onDone={() => setPending(null)} />}
      {confirming && <ResetAllConfirm count={changed} by={name} onDone={() => setConfirming(false)} />}
    </div>
  )
}
