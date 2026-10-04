/**
 * Raw: the sheet of the current version exactly as it came in, with its original headers. Cells
 * the import could not read or filled by a default are marked (icon, wash and the importer's
 * sentence), rows it skipped are tagged. Searchable, paged, and exportable as CSV or Excel.
 */
import { useDeferredValue, useId, useState } from 'react'
import { IconCritical, IconDownload, IconInfoFilled, IconSearch } from '@/components/icons'
import { Button, cx, Menu, Segmented, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { type DatasetVersion, type QualityIndex, type RawRecord, rowKeyOf } from '@/data/quality'
import { type Datasets, datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { fmt } from '@/lib/format'
import { cellText } from '../../engine/flow'
import type { ManifestRow } from '../../engine/manifest'
import {
  cellKey,
  filterRawRows,
  hiddenText,
  logFromRaw,
  pageOf,
  type RawFilter,
  type RawFlags,
  rawColumns,
  rawExportTable,
  rawFlags,
  type UnrecognizedValues,
} from '../../engine/rawGrid'
import { logFor, useImportLogs } from '../../state/importLog'
import { downloadRaw } from '../downloads'
import { roomMeta } from '../meta'
import { useBusy } from '../useBusy'
import { LastImport } from './LastImport'
import { INPUT } from './MappingPanel'

/** Loaded values outside their field's list (kept as they were), by row key, per field. */
function unrecognizedNow(
  quality: QualityIndex,
  key: ManifestRow['key'],
  data: Datasets,
): UnrecognizedValues[] {
  const rows = data[key] as readonly object[]
  return quality
    .fields(key)
    .filter((f) => f.invalid > 0)
    .map((f) => {
      const keys = new Set<string>()
      for (const i of quality.fieldRows(f.ref, 'invalid')) {
        const k = rows[i] ? rowKeyOf(key, rows[i] as Record<string, unknown>) : null
        if (k) keys.add(k)
      }
      return { field: f.ref.slice(f.ref.indexOf('.') + 1), label: f.label, keys }
    })
}

function Missing({ text }: { text: string }) {
  return <p className="max-w-[70ch] text-[13px] text-ink-2">{text}</p>
}

function Grid({
  raw,
  headers,
  fieldOf,
  flags,
  rows,
}: {
  raw: RawRecord
  headers: readonly string[]
  fieldOf: ReadonlyMap<string, string>
  flags: RawFlags
  rows: readonly number[]
}) {
  const { sheet } = raw
  return (
    <div className="scroll-x max-h-[560px] overflow-y-auto rounded-control shadow-[inset_0_0_0_1px_var(--rule)]">
      <table className="w-max min-w-full border-collapse text-[12px]">
        <caption className="sr-only">Raw sheet rows as uploaded</caption>
        <thead className="sticky top-0 z-10 bg-sheet-2">
          <tr className="text-left">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-sheet-2 px-2 py-1.5 text-right font-semibold text-ink-2"
            >
              Row
            </th>
            {headers.map((h) => (
              <th key={h} scope="col" className="max-w-[240px] px-2 py-1.5 align-bottom font-semibold">
                <span className="block truncate" title={h}>
                  {h}
                </span>
                <span className="block truncate text-[11px] font-normal text-muted">
                  {fieldOf.get(h) ? `To ${fieldOf.get(h)}` : 'Not used'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const r = sheet.rows[i]
            const skipped = flags.skipped.get(i)
            return (
              <tr key={i} className={cx('border-t border-rule', skipped && 'text-muted')}>
                <th
                  scope="row"
                  className="sticky left-0 bg-sheet px-2 py-1 text-right align-top font-mono font-normal text-ink-2"
                >
                  <span className="flex items-center justify-end gap-1.5">
                    {skipped && (
                      <span title={skipped}>
                        <Tag>Skipped</Tag>
                        <span className="sr-only">: {skipped}</span>
                      </span>
                    )}
                    {sheet.rowNumbers[i] ?? i + 2}
                  </span>
                </th>
                {headers.map((h) => {
                  const f = flags.cells.get(cellKey(i, h))
                  const text = cellText(r[h])
                  return (
                    <td
                      key={h}
                      title={f?.text}
                      className={cx(
                        'max-w-[240px] px-2 py-1 align-top',
                        f?.kind === 'invalid' && 'bg-critical-wash',
                        f?.kind === 'defaulted' && 'bg-warning-wash',
                      )}
                    >
                      <span className="flex items-start gap-1">
                        {f?.kind === 'invalid' && (
                          <IconCritical className="mt-px size-3 shrink-0 text-critical" />
                        )}
                        {f?.kind === 'defaulted' && (
                          <IconInfoFilled className="mt-px size-3 shrink-0 text-ink-2" />
                        )}
                        <span className="truncate">
                          {text || (f ? <span className="text-muted">blank</span> : '')}
                        </span>
                        {f && <span className="sr-only">. {f.text}</span>}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RawSheet({
  row,
  raw,
  version,
  data,
}: {
  row: ManifestRow
  raw: RawRecord
  version: DatasetVersion
  data: Datasets
}) {
  const ctx = useAnalytics()
  const showPay = useCensus((s) => s.showPay)
  const { isBusy, run } = useBusy()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RawFilter>('all')
  const [page, setPage] = useState(0)
  const deferred = useDeferredValue(query)
  const { sheet } = raw
  const def = datasetDef(row.key)
  const flags = rawFlags(sheet, raw.issues, version.mapping, {
    rowKey: def.rowKey,
    values: unrecognizedNow(ctx.quality, row.key, data),
  })
  const cols = rawColumns(row.key, sheet.headers, version.mapping, showPay)
  const fieldOf = new Map<string, string>()
  for (const [field, m] of Object.entries(version.mapping))
    if (m.header) fieldOf.set(m.header, def.fields.find((f) => f.key === field)?.label ?? field)
  const matching = filterRawRows(sheet, cols.visible, deferred, filter, flags)
  const shown = pageOf(matching, page)
  const narrowed = matching.length !== sheet.rows.length
  const sheetLabel = [
    version.fileName,
    version.sheetName && version.sheetName !== version.fileName ? version.sheetName : null,
  ]
    .filter(Boolean)
    .join(' › ')
  const exportRows = (which: readonly number[] | undefined, format: 'csv' | 'xlsx') =>
    run(
      'raw',
      () =>
        downloadRaw({
          key: row.key,
          sheetLabel: sheetLabel || sheet.name,
          table: rawExportTable(sheet, cols.visible, flags, which),
          meta: roomMeta(ctx),
          format,
        }),
      'The raw sheet could not be exported.',
    )
  const c = flags.counts
  const invalidText = `${fmt(c.invalid, 'int')} ${c.invalid === 1 ? 'cell' : 'cells'} could not be read or recognized`
  const defaultedText = `${fmt(c.defaulted, 'int')} ${c.defaulted === 1 ? 'cell was' : 'cells were'} filled by a default`
  const skippedText = `${fmt(c.skipped, 'int')} ${c.skipped === 1 ? 'row was' : 'rows were'} skipped`

  return (
    <div>
      <p className="text-[13px]">
        <span className="font-semibold">{sheetLabel || sheet.name}</span>
        <span className="text-ink-2">
          {' '}
          · {fmt(sheet.rows.length, 'int')} {sheet.rows.length === 1 ? 'row' : 'rows'},{' '}
          {fmt(sheet.headers.length, 'int')} columns · headers on row {fmt(sheet.headerRow + 1, 'int')}
        </span>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {c.invalid + c.defaulted + c.skipped === 0 ? (
          'Every cell was read as it stood.'
        ) : (
          <>
            {c.invalid > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex size-4 items-center justify-center rounded-[3px] bg-critical-wash">
                  <IconCritical className="size-3 text-critical" />
                </span>
                {invalidText}
              </span>
            )}
            {c.defaulted > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex size-4 items-center justify-center rounded-[3px] bg-warning-wash">
                  <IconInfoFilled className="size-3 text-ink-2" />
                </span>
                {defaultedText}
              </span>
            )}
            {c.skipped > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Tag>Skipped</Tag>
                {skippedText}
              </span>
            )}
          </>
        )}
      </p>
      {cols.hidden.length > 0 && (
        <p className="mt-1 text-[12px] text-muted">{hiddenText(cols.hidden).join(' ')}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={searchId} className="relative min-w-0 flex-1 basis-[220px] sm:max-w-[320px]">
          <span className="sr-only">Search the raw sheet</span>
          <IconSearch className="pointer-events-none absolute top-2 left-2 size-4 text-muted" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Search values or a row number"
            className={cx(INPUT, 'w-full pl-8')}
          />
        </label>
        <Segmented<RawFilter>
          label="Rows to show"
          value={filter}
          onChange={(v) => {
            setFilter(v)
            setPage(0)
          }}
          options={[
            { value: 'all', label: 'All rows' },
            { value: 'flagged', label: `With notes (${fmt(flags.flaggedRows.length, 'int')})` },
          ]}
        />
        <span className="ml-auto">
          <Menu
            width={260}
            trigger={
              <Button size="sm" variant="ghost" icon={<IconDownload />} caret disabled={isBusy('raw')}>
                Download
              </Button>
            }
            items={[
              { heading: 'Raw sheet' },
              {
                label: 'All rows',
                hint: '.csv',
                icon: <IconDownload />,
                onSelect: () => void exportRows(undefined, 'csv'),
              },
              {
                label: 'All rows',
                hint: '.xlsx',
                icon: <IconDownload />,
                onSelect: () => void exportRows(undefined, 'xlsx'),
              },
              ...(narrowed && matching.length
                ? [
                    {
                      label: `The ${fmt(matching.length, 'int')} rows shown`,
                      hint: '.csv',
                      icon: <IconDownload />,
                      onSelect: () => void exportRows(matching, 'csv'),
                    },
                  ]
                : []),
            ]}
          />
        </span>
      </div>

      <div className="mt-3">
        {shown.total ? (
          <Grid raw={raw} headers={cols.visible} fieldOf={fieldOf} flags={flags} rows={shown.items} />
        ) : (
          <p className="rounded-control bg-sheet-2 px-3 py-4 text-[13px] text-ink-2">
            {deferred.trim() ? `No row contains “${deferred.trim()}”.` : 'No rows with notes.'}
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-2" aria-live="polite">
        <span className="tnum">
          {shown.total
            ? `Rows ${fmt(shown.from, 'int')}–${fmt(shown.to, 'int')} of ${fmt(shown.total, 'int')}${narrowed ? ` (${fmt(sheet.rows.length, 'int')} in the sheet)` : ''}`
            : `0 of ${fmt(sheet.rows.length, 'int')} rows`}
        </span>
        {shown.pages > 1 && (
          <span className="ml-auto flex gap-1">
            <Button size="sm" disabled={shown.page === 0} onClick={() => setPage(shown.page - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              disabled={shown.page >= shown.pages - 1}
              onClick={() => setPage(shown.page + 1)}
            >
              Next
            </Button>
          </span>
        )}
      </div>
      <ImportSummary row={row} raw={raw} version={version} data={data} />
    </div>
  )
}

/** What the import changed: the upload's own log, or for the sample the issues kept with its sheet. */
function ImportSummary({
  row,
  raw,
  version,
  data,
}: {
  row: ManifestRow
  raw: RawRecord
  version: DatasetVersion
  data: Datasets
}) {
  const logs = useImportLogs((s) => s.logs)
  const source = useCensus((s) => s.sources[row.key])
  const log = logFor(logs, row.key, source) ?? logFromRaw(version, raw.issues)
  return (
    <div className="mt-6 max-w-[760px] border-t border-rule pt-4">
      <LastImport
        row={row}
        log={log}
        data={data}
        heading={version.source === 'sample' ? 'What the import changed' : 'Last upload'}
      />
    </div>
  )
}

export function RawPanel({
  row,
  version,
  raw,
  loading,
  data,
}: {
  row: ManifestRow
  version: DatasetVersion
  raw: RawRecord | null
  loading: boolean
  data: Datasets
}) {
  if (!version.hasRaw)
    return (
      <Missing
        text={
          version.source === 'sample'
            ? 'The generated sample was not read from a file, so there is no raw sheet to show.'
            : 'This version was loaded before Census kept original sheets. Upload the file again to keep its raw sheet here.'
        }
      />
    )
  if (loading) return <Missing text="Reading the stored sheet…" />
  if (!raw) return <Missing text="The stored sheet could not be read in this browser." />
  return <RawSheet key={raw.versionId} row={row} raw={raw} version={version} data={data} />
}
