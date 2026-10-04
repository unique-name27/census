/**
 * The drill panel: a sheet that slides in from the right with the records behind a number
 * (sortable, searchable, exportable) and, one click further, a person's card. Counts inside it
 * (a manager's org, a req's applications, a person's open cases) open their records on top, and
 * Back walks out again. Only rows that lead somewhere are clickable. The header shows the tier of
 * the drilled number when the spec names its fields, otherwise the tier of the records' dataset,
 * labeled as such. Mounted once by the app shell; opened with openDrill(spec) / openPerson(id)
 * from anywhere.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { DataTable } from '@/charts/DataTable'
import { useExportMeta } from '@/charts/useExportMeta'
import { IconChevronRight, IconClose, IconCopy, IconDownload, IconFile } from '@/components/icons'
import { TierBadge } from '@/components/tier/TierBadge'
import { toast } from '@/components/toast'
import { Button, Menu } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { datasetDef } from '@/data/schema'
import { fmt } from '@/lib/format'
import { DrillNesting } from './Drill'
import { PersonCard } from './PersonCard'
import { buildDrillTable, DRILLS_KEY, drillNoun, drillTableHint, ROW_KEY, rowPerson } from './records'
import { useDrillStore } from './store'
import { drillTier } from './tier'
import { type DrillSpec, drillDataset } from './types'

/**
 * The tier of the drilled number (from the spec's `uses`), or of the dataset the records come
 * from, said so; a click opens the Quality panel of the dataset that sets it.
 */
function RecordsTier({ spec }: { spec: DrillSpec }) {
  const { quality } = useAnalytics()
  const t = drillTier(quality, spec)
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {t.ofDataset && (
        <span className="text-[12px] text-muted">{datasetDef(drillDataset(spec.kind)).label} data</span>
      )}
      <TierBadge tier={t.tier} explain={t.explain} dataset={t.dataset} />
    </span>
  )
}

export function DrillPanel() {
  const stack = useDrillStore((s) => s.stack)
  const close = useDrillStore((s) => s.close)
  const back = useDrillStore((s) => s.back)
  const top = stack[stack.length - 1]
  const below = stack.at(-2)
  // When a list or card opens on top (or Back is used), focus its title so keyboard and screen
  // reader users land on what just opened instead of losing focus with the control they used.
  const depth = useRef(0)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const was = depth.current
    depth.current = stack.length
    if (was && stack.length) body.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }, [stack.length])
  // Closing returns focus to the control that opened the panel. Base UI's own choice skips a
  // control inside another open dialog (a count in Settings), which left focus behind that dialog.
  const open = stack.length > 0
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [open])
  return (
    <BDialog.Root open={stack.length > 0} onOpenChange={(o) => !o && close()}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup
          finalFocus={() => (opener.current?.isConnected ? opener.current : true)}
          className="fixed top-0 right-0 bottom-0 z-50 flex w-[min(820px,100vw)] flex-col bg-page text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
        >
          <div className="flex items-center gap-2 border-b border-rule px-5 pt-3 pb-2.5">
            {stack.length > 1 && (
              <Button variant="ghost" size="sm" onClick={back} className="-ml-2">
                <span className="rotate-180">
                  <IconChevronRight />
                </span>
                Back
              </Button>
            )}
            <span className="eyebrow min-w-0 flex-1 truncate">
              {top?.type === 'person' ? 'Person' : 'Records behind the number'}
            </span>
            {top?.type === 'records' && <RecordsTier spec={top.spec} />}
            <BDialog.Close
              aria-label="Close"
              className="inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose />
            </BDialog.Close>
          </div>
          {/* Keyed by depth: what opens on top starts at the top, with its own sort and search. */}
          <div ref={body} key={stack.length} className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
            <DrillNesting>
              {top?.type === 'records' && (
                <RecordsView spec={top.spec} from={below?.type === 'person' ? below.employeeId : null} />
              )}
              {top?.type === 'person' && <PersonCard employeeId={top.employeeId} />}
            </DrillNesting>
          </div>
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  )
}

/**
 * One list of records. `from` is the person whose card opened it: their own rows don't reopen
 * them.
 */
function RecordsView({ spec, from }: { spec: DrillSpec; from: string | null }) {
  const ctx = useAnalytics()
  const meta = useExportMeta()
  const openPerson = useDrillStore((s) => s.openPerson)
  const table = useMemo(() => buildDrillTable(spec, ctx), [spec, ctx])
  const target = (r: Record<string, unknown>) => {
    const id = rowPerson(ctx, r)
    return id && id !== from ? id : null
  }
  const rowsOpen = table.rows.some((r) => target(r))
  const hint = drillTableHint(spec.kind, {
    rowsOpen,
    cellsOpen: table.rows.some((r) => r[DRILLS_KEY]) || table.columns.some((c) => c.drill),
  })
  const exportTable = {
    name: spec.title,
    title: spec.title,
    subtitle: spec.subtitle,
    note: spec.note,
    columns: table.columns,
    rows: table.rows,
    tier: drillTier(ctx.quality, spec).tier,
  }
  const opts = { showPay: ctx.showPay }

  const onCsv = async () => {
    const m = await import('@/lib/export')
    m.downloadCsv(exportTable, meta, { ...opts, fileName: m.fileStem(meta, spec.title), preamble: true })
  }
  const onXlsx = async () => {
    try {
      const m = await import('@/lib/export')
      await m.downloadXlsx([exportTable], meta, { ...opts, fileName: m.fileStem(meta, spec.title) })
    } catch {
      toast('The workbook could not be created', { tone: 'critical' })
    }
  }
  const onCopy = async () => {
    try {
      const m = await import('@/lib/export')
      const n = await m.copyTable(exportTable, opts)
      toast(`Copied ${fmt(n, 'int')} rows`, { tone: 'good', description: 'Paste into Excel or Sheets.' })
    } catch {
      toast('The browser blocked copying. Download a CSV instead.', { tone: 'critical' })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <BDialog.Title tabIndex={-1} className="cut-head text-[22px] leading-tight font-semibold">
            {spec.title}
          </BDialog.Title>
          <BDialog.Description className="mt-1 text-[13px] text-ink-2">
            {spec.noun
              ? `${fmt(table.rows.length, 'int')} ${table.rows.length === 1 ? spec.noun[0] : spec.noun[1]}`
              : drillNoun(spec.kind, table.rows.length)}
            {spec.subtitle ? ` · ${spec.subtitle}` : ''}
          </BDialog.Description>
          {spec.note && <p className="mt-1 max-w-[70ch] text-[12px] text-muted">{spec.note}</p>}
        </div>
        <Menu
          width={220}
          trigger={
            <Button icon={<IconDownload />} caret disabled={!table.rows.length}>
              Export
            </Button>
          }
          items={[
            { label: 'Download CSV', icon: <IconFile />, onSelect: () => void onCsv() },
            { label: 'Download Excel', icon: <IconFile />, onSelect: () => void onXlsx() },
            { label: 'Copy table', icon: <IconCopy />, onSelect: () => void onCopy() },
          ]}
        />
      </div>
      {!ctx.showPay && spec.kind === 'comp' && (
        <p className="text-[12px] text-muted">
          Pay amounts are hidden. Switch on "Show pay amounts" in Settings or in Compensation to include them.
        </p>
      )}
      {!ctx.showImmigration && spec.kind === 'rightToWork' && (
        <p className="text-[12px] text-muted">
          Authorization types are hidden. Switch on "Show immigration details" in Settings, Privacy to include
          them for this session.
        </p>
      )}
      {(spec.kind === 'surveyGroups' || spec.kind === 'surveyResponses') && (
        <p className="text-[12px] text-muted">
          Survey results open as groups, never as one person's answers. Groups under the anonymity minimum
          show counts only.
        </p>
      )}
      {spec.kind === 'leaveGroups' && (
        <p className="text-[12px] text-muted">
          Leave numbers by reason open as groups, never as named people, so a leave reason is never shown
          beside a name. Groups under the anonymity minimum show no counts.
        </p>
      )}
      <DataTable
        columns={table.columns}
        rows={table.rows}
        search={table.rows.length > 8 ? 'Search these records' : false}
        maxRows={200}
        maxHeight={9999}
        rowKey={(r, i) => String(r[ROW_KEY] ?? i)}
        onRowClick={
          rowsOpen
            ? (r) => {
                const id = target(r)
                if (id) openPerson(id)
              }
            : undefined
        }
        rowClickable={(r) => !!target(r)}
        emptyText="No records behind this number."
        caption={spec.title}
      />
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  )
}
