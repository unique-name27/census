/**
 * Head of the Data room: the name, the privacy statement, where the loaded data stands, and the
 * actions that cover every dataset at once. "Reset everything" asks for confirmation in place.
 */
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { rovingIndex } from '@/app/keyboard'
import { IconDownload, IconFile, IconLock, IconReset, IconWarning } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { type DatasetKey, datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { AboutViewLink } from '@/help/ui/AboutViewLink'
import { fmt } from '@/lib/format'
import type { ManifestSummary } from '../engine/manifest'
import { DATA_TABS, type DataTab, tabRoute } from '../links'
import { useImportLogs } from '../state/importLog'
import { downloadSampleWorkbook, downloadTemplate } from './downloads'
import { useBusy } from './useBusy'

const COUNT_WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
]

/**
 * "Fourteen datasets, 68,387 rows. Compensation was left out because pay amounts are off; … This is the
 * clean sample, …". The workbook is the clean sample; the app shows the messy one.
 */
export function sampleToastText(done: {
  rows: number
  datasets: readonly DatasetKey[]
  leftOut: readonly DatasetKey[]
}): string {
  const n = done.datasets.length
  const head = `${done.leftOut.length ? (COUNT_WORDS[n] ?? fmt(n, 'int')) : `All ${COUNT_WORDS[n]?.toLowerCase() ?? fmt(n, 'int')}`} datasets, ${fmt(done.rows, 'int')} rows.`
  const clean = 'This is the clean sample, so some numbers and tiers differ from the ones on screen.'
  if (!done.leftOut.length) return `${head} ${clean}`
  const names = done.leftOut.map((k) => datasetDef(k).label).join(' and ')
  const were = done.leftOut.length === 1 ? `${names} was` : `${names} were`
  return `${head} ${were} left out because pay amounts are off; switch them on to include ${done.leftOut.length === 1 ? 'it' : 'them'}. ${clean}`
}

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
          This removes {what.join(' and ')} from this browser. Saved column choices are kept.
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

export const DATA_BODY_ID = 'data-room-body'

/** Datasets and Categories & mapping, as underline tabs like a view's sub-tabs. */
function DataTabs({ active }: { active: DataTab }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = rovingIndex(e.key, i, DATA_TABS.length)
    if (next == null) return
    e.preventDefault()
    refs.current[next]?.focus()
    goTo('data', DATA_TABS[next].route)
  }
  return (
    <div
      role="tablist"
      aria-label="Data room sections"
      data-tour="data-tabs"
      className="-mx-(--gutter) flex gap-6 overflow-x-auto px-(--gutter) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {DATA_TABS.map((t, i) => {
        const selected = t.key === active
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`subtab-data-${t.key}`}
            aria-selected={selected}
            aria-controls={DATA_BODY_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => goTo('data', t.route)}
            onKeyDown={onKeyDown(i)}
            className={cx(
              'relative h-10 shrink-0 text-[13px] whitespace-nowrap transition-colors focus-visible:-outline-offset-2',
              selected
                ? 'font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink'
                : 'font-medium text-ink-2 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function DataRoomHeader({ summary, tab }: { summary: ManifestSummary; tab: DataTab }) {
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
          <p className="mt-1 text-[13px] text-ink-2">{summary.text}</p>
          <p className="mt-1">
            <AboutViewLink view="data" tab={tabRoute(tab)} label="About this page" />
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
                  const done = await downloadSampleWorkbook(ctx.showPay)
                  toast('Sample workbook downloaded', {
                    tone: 'good',
                    description: sampleToastText(done),
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
      <div className="mt-4 border-b border-rule">
        <DataTabs active={tab} />
      </div>
    </div>
  )
}
