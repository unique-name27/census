/**
 * The dataset manifest: all ten datasets on one sheet. Each row says what the dataset feeds,
 * where it came from, how many rows and how well its fields are filled, what needs a look, and
 * offers upload, downloads and reset. A row opens to show its fields and checks in full.
 */
import { useEffect, useRef } from 'react'
import { Meter } from '@/charts'
import { IconChevronRight, IconDownload, IconFile, IconReset, IconUpload } from '@/components/icons'
import { TierBadge } from '@/components/tier/TierBadge'
import { toast } from '@/components/toast'
import { Button, cx, IconButton, Menu, SeverityIcon, Tag, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import type { DatasetKey, Datasets } from '@/data/schema'
import { useCensus } from '@/data/store'
import { Drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import { coverageText } from '../engine/coverage'
import { feedsLine, type ManifestRow } from '../engine/manifest'
import { useRoom } from '../state/room'
import { useImportSession } from '../state/session'
import { DatasetDetail } from './DatasetDetail'
import { CheckSentence } from './DrillSentence'
import { downloadCurrent, downloadTemplate } from './downloads'
import { rowsSpec } from './drillSpecs'
import { useBusy } from './useBusy'

/** Desktop column template; below lg each row stacks into labelled lines. */
const COLS =
  'lg:grid lg:grid-cols-[minmax(0,1.3fr)_92px_minmax(0,1.15fr)_72px_132px_minmax(0,1.6fr)_auto] lg:items-start lg:gap-x-5'

function CellLabel({ children }: { children: string }) {
  return <span className="eyebrow mb-0.5 block lg:hidden">{children}</span>
}

function Source({ row }: { row: ManifestRow }) {
  if (row.source.kind === 'sample')
    return (
      <span className="flex items-center gap-2">
        <Tag>Sample</Tag>
      </span>
    )
  return (
    <span className="block min-w-0">
      <span className="block truncate text-[13px]" title={row.source.label}>
        {row.source.label}
      </span>
      {row.source.detail && (
        <span className="block truncate text-[12px] text-muted">{row.source.detail}</span>
      )}
    </span>
  )
}

/**
 * The coverage meter doubles as the way into the field-by-field table, so it is a real button:
 * keyboard and touch users reach its definition (the tooltip on focus) and the detail alike.
 */
function Coverage({
  row,
  open,
  detailId,
  onToggle,
}: {
  row: ManifestRow
  open: boolean
  detailId: string
  onToggle: () => void
}) {
  const core = row.coverage.fields.filter((f) => f.requirement !== 'optional')
  const text = coverageText(row.coverage.core)
  return (
    <Tip
      content={`Mean share of rows filled across the ${core.length} required and recommended fields, each counted over the rows it applies to. Select to see each field.`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        aria-label={`Field coverage ${text}, mean of ${core.length} required and recommended fields. ${open ? 'Hide' : 'Show'} each field.`}
        onClick={onToggle}
        className="-mx-1 flex w-fit items-center gap-2 rounded-control px-1 py-0.5 hover:bg-hover"
      >
        <Meter
          value={row.coverage.core}
          tone={row.coverage.core != null && row.coverage.core < 0.8 ? 'warning' : 'default'}
          className="w-14 shrink-0"
        />
        <span className="tnum text-[13px]">{text}</span>
      </button>
    </Tip>
  )
}

function Issues({ row, data }: { row: ManifestRow; data: Datasets }) {
  const [first, ...rest] = row.checks
  if (!first) return <span className="text-[13px] text-muted">None</span>
  return (
    <span className="flex min-w-0 gap-2 text-[13px]">
      <SeverityIcon severity={first.severity} className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">
        <span className="line-clamp-2">
          <CheckSentence check={first} row={row} data={data} />
        </span>
        {rest.length > 0 && <span className="text-[12px] text-muted">{rest.length} more in details</span>}
      </span>
    </span>
  )
}

function Actions({ row, onUpload }: { row: ManifestRow; onUpload: (key: DatasetKey) => void }) {
  const showPay = useCensus((s) => s.showPay)
  const resetDataset = useCensus((s) => s.resetDataset)
  const replaceDataset = useCensus((s) => s.replaceDataset)
  const sessionIdle = useImportSession((s) => s.phase === 'idle')
  const { isBusy, run } = useBusy()

  async function reset() {
    const { data, sources } = useCensus.getState()
    const previous = data[row.key]
    const { kind: _kind, rowCount: _rows, ...meta } = sources[row.key]
    await resetDataset(row.key)
    const restored = useCensus.getState().data[row.key].length
    toast(`${row.label} is back on the sample: ${fmt(restored, 'int')} rows`, {
      action: {
        label: 'Undo',
        onClick: () => {
          void replaceDataset(row.key, previous, meta)
        },
      },
    })
  }

  return (
    <span className="flex items-center gap-1">
      <Button size="sm" icon={<IconUpload />} disabled={!sessionIdle} onClick={() => onUpload(row.key)}>
        Upload
      </Button>
      <Menu
        width={250}
        trigger={
          <IconButton size="sm" label={`Download ${row.label}`} disabled={isBusy('download')}>
            <IconDownload />
          </IconButton>
        }
        items={[
          { heading: row.label },
          {
            label: 'Current rows',
            hint: showPay ? '.xlsx with pay' : row.key === 'comp' ? '.xlsx, no pay amounts' : '.xlsx',
            icon: <IconDownload />,
            disabled: row.rows === 0,
            onSelect: () =>
              void run(
                'download',
                async () => {
                  const rows = useCensus.getState().data[row.key]
                  await downloadCurrent(row.key, rows, showPay)
                },
                `${row.label} could not be downloaded. Try again.`,
              ),
          },
          {
            label: 'Blank template',
            hint: '.xlsx',
            icon: <IconFile />,
            onSelect: () =>
              void run(
                'download',
                () => downloadTemplate(row.key),
                'The template could not be prepared. Try again.',
              ),
          },
        ]}
      />
      <IconButton
        size="sm"
        label={
          row.source.kind === 'upload' ? `Reset ${row.label} to sample` : `${row.label} is already the sample`
        }
        disabled={row.source.kind !== 'upload' || !sessionIdle}
        onClick={() => void run('reset', reset)}
      >
        <IconReset />
      </IconButton>
    </span>
  )
}

/** The dataset's tier; selecting it opens the Quality panel below. */
function Tier({ row }: { row: ManifestRow }) {
  const ctx = useAnalytics()
  const show = useRoom((s) => s.show)
  if (!row.tier) return <span className="text-[13px] text-muted">—</span>
  return (
    <TierBadge
      tier={row.tier}
      explain={ctx.quality.explain(row.key)}
      onOpen={() => show(row.key, 'quality')}
      className="-ml-1.5"
    />
  )
}

/** The row count opens the rows themselves (the first 2,000 when there are more). */
function RowCount({ row, data }: { row: ManifestRow; data: Datasets }) {
  const n = fmt(row.rows, 'int')
  if (!row.rows) return <span className="tnum text-[13px]">{n}</span>
  return (
    <Drill
      spec={() => rowsSpec(row, data)}
      label={`Show the ${n} ${row.rows === 1 ? 'row' : 'rows'} loaded in ${row.label}`}
      className="tnum text-[13px]"
    >
      {n}
    </Drill>
  )
}

function Row({
  row,
  data,
  open,
  onToggle,
  onUpload,
}: {
  row: ManifestRow
  data: Datasets
  open: boolean
  onToggle: () => void
  onUpload: (key: DatasetKey) => void
}) {
  const detailId = `data-room-detail-${row.key}`
  const ref = useRef<HTMLLIElement>(null)
  const reveal = useRoom((s) => (s.reveal?.key === row.key ? s.reveal.nonce : null))
  useEffect(() => {
    if (reveal != null) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [reveal])
  return (
    <li ref={ref} className="scroll-mt-4 border-b border-rule last:border-b-0">
      <div className={cx(COLS, 'grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3')}>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <h3>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              onClick={onToggle}
              className="group -mx-1.5 -my-0.5 flex max-w-full items-start gap-1.5 rounded-control px-1.5 py-0.5 text-left hover:bg-hover"
            >
              <IconChevronRight
                className={cx(
                  'mt-[3px] size-3.5 shrink-0 text-muted transition-transform duration-150',
                  open && 'rotate-90',
                )}
              />
              <span className="min-w-0">
                <span className="cut-head block text-[15px] leading-snug font-semibold">{row.label}</span>
                <span className="block text-[12px] leading-snug text-muted">{feedsLine(row.feeds)}</span>
              </span>
            </button>
          </h3>
        </div>
        <div>
          <CellLabel>Tier</CellLabel>
          <Tier row={row} />
        </div>
        <div className="min-w-0">
          <CellLabel>Source</CellLabel>
          <Source row={row} />
        </div>
        <div className="lg:text-right">
          <CellLabel>Rows</CellLabel>
          <RowCount row={row} data={data} />
        </div>
        <div>
          <CellLabel>Field coverage</CellLabel>
          <Coverage row={row} open={open} detailId={detailId} onToggle={onToggle} />
        </div>
        <div className="min-w-0">
          <CellLabel>Issues</CellLabel>
          <Issues row={row} data={data} />
        </div>
        <div className="col-span-2 lg:col-span-1">
          <Actions row={row} onUpload={onUpload} />
        </div>
      </div>
      {open && <DatasetDetail row={row} data={data} id={detailId} />}
    </li>
  )
}

export function Manifest({
  rows,
  data,
  onUpload,
}: {
  rows: readonly ManifestRow[]
  /** The datasets the manifest was built from; numbers open their rows. */
  data: Datasets
  onUpload: (key: DatasetKey) => void
}) {
  const open = useRoom((s) => s.open)
  const toggle = useRoom((s) => s.toggle)
  return (
    // Bleeds to the edges of the Figure it sits in, so row hairlines run sheet-wide.
    <div className="-mx-4 -mb-4 min-w-0 border-t border-rule">
      <div aria-hidden="true" className={cx(COLS, 'hidden border-b border-rule px-4 py-2 lg:grid')}>
        <span className="eyebrow">Dataset</span>
        <span className="eyebrow">Tier</span>
        <span className="eyebrow">Source</span>
        <span className="eyebrow text-right">Rows</span>
        <span className="eyebrow">Field coverage</span>
        <span className="eyebrow">Issues</span>
        <span className="eyebrow w-[132px]">Actions</span>
      </div>
      <ul aria-label="Datasets">
        {rows.map((r) => (
          <Row
            key={r.key}
            row={r}
            data={data}
            open={open.includes(r.key)}
            onToggle={() => toggle(r.key)}
            onUpload={onUpload}
          />
        ))}
      </ul>
    </div>
  )
}
