/**
 * Mapping: where each field of the current version came from (source column, conversion, match
 * confidence, review), Confirm mapping to record a review, and Re-map to open the mapping step
 * again on the stored raw sheet. Also how the importer fills blanks and the saved column choices.
 */
import { useId, useState } from 'react'
import { IconCheck, IconDownload, IconGood, IconPencil, IconWarning } from '@/components/icons'
import { TABLE_HEAD } from '@/components/styles'
import { toast } from '@/components/toast'
import { Button, cx, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { DOCUMENTED_DEFAULTS } from '@/data/import/defaults'
import type { DatasetVersion, RawRecord } from '@/data/quality'
import { rawSpellings } from '@/data/reference/spellings'
import { datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { fmt } from '@/lib/format'
import {
  CONFIDENCE_LABEL,
  hasLineage,
  type LineageRow,
  lineageRows,
  lineageSummary,
  mappingStatusText,
  SOURCE_LABEL,
} from '../../engine/lineage'
import type { ManifestRow } from '../../engine/manifest'
import { loadReviewerName, saveReviewerName } from '../../state/room'
import { useSavedChoices } from '../../state/savedChoices'
import { loadImportLib, useImportSession } from '../../state/session'
import { downloadLineage } from '../downloads'
import { roomMeta } from '../meta'
import { useBusy } from '../useBusy'

export const INPUT =
  'h-8 min-w-0 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]'

const CONFIDENCE_DOT: Record<string, string> = { high: 'bg-good', medium: 'bg-warning', low: 'bg-serious' }

function Confidence({ r }: { r: LineageRow }) {
  if (!r.confidence) return <span className="text-muted">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={cx('size-2 rounded-full', CONFIDENCE_DOT[r.confidence])} />
      {CONFIDENCE_LABEL[r.confidence]}
    </span>
  )
}

function LineageTable({ rows, label }: { rows: readonly LineageRow[]; label: string }) {
  const th = `${TABLE_HEAD} py-1.5 pr-3`
  return (
    <div className="scroll-x">
      <table className="w-full border-collapse text-small sm:min-w-[640px]">
        <caption className="sr-only">Column mapping for {label}</caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className={th}>
              Field
            </th>
            <th scope="col" className={th}>
              Source column
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Conversion
            </th>
            <th scope="col" className={`${th} hidden sm:table-cell`}>
              Match
            </th>
            <th scope="col" className={`${TABLE_HEAD} py-1.5`}>
              Reviewed
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field} className="border-b border-rule last:border-b-0">
              <td className="py-1.5 pr-3 align-top">
                {r.label}
                {r.requirement !== 'optional' && (
                  <span className="block text-label text-muted">
                    {r.requirement === 'required' ? 'Required' : 'Recommended'}
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-3 align-top">
                {r.header ? (
                  <span className="font-mono text-meta break-all">{r.header}</span>
                ) : (
                  <span
                    className={
                      r.source === 'none' && r.requirement !== 'optional' ? 'text-ink' : 'text-muted'
                    }
                  >
                    {SOURCE_LABEL[r.source]}
                  </span>
                )}
                {/* The conversion sits under the column on narrow screens. */}
                {r.conversions.length > 0 && (
                  <span className="block text-label text-ink-2 md:hidden">{r.conversions.join('. ')}</span>
                )}
              </td>
              <td className="hidden py-1.5 pr-3 align-top text-ink-2 md:table-cell">
                {r.conversions.length ? (
                  <ul className="space-y-0.5">
                    {r.conversions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">{r.header ? 'Read as is' : '—'}</span>
                )}
              </td>
              <td className="hidden py-1.5 pr-3 align-top sm:table-cell">
                <Confidence r={r} />
              </td>
              <td className="py-1.5 align-top">
                {r.confirmed ? (
                  <span className="inline-flex items-center gap-1 text-ink">
                    <IconCheck className="size-3.5 text-good" />
                    Yes
                  </span>
                ) : (
                  <span className="text-muted">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Name and confirm, in place. */
function ConfirmForm({ row, onDone }: { row: ManifestRow; onDone: () => void }) {
  const confirmMapping = useCensus((s) => s.confirmMapping)
  const [name, setName] = useState(loadReviewerName)
  const id = useId()
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2 rounded-control bg-sheet-2 px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        saveReviewerName(name)
        confirmMapping(row.key, name)
        toast(`${row.label} mapping confirmed`, {
          tone: 'good',
          description:
            'Recorded in this browser for the current version. Re-mapping or a new upload asks again.',
        })
        onDone()
      }}
    >
      <label htmlFor={id} className="block min-w-0 flex-1 basis-[200px]">
        <span className="block text-meta font-medium text-ink-2">Your name</span>
        <input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Shown as “you” when blank"
          autoComplete="name"
          className={cx(INPUT, 'mt-1 w-full')}
        />
      </label>
      <Button type="submit" variant="primary">
        Confirm mapping
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  )
}

function SavedChoices({ row }: { row: ManifestRow }) {
  const [forgotten, setForgotten] = useState<string | null>(null)
  if (!row.profileFingerprint) return null
  async function forget(fp: string) {
    const lib = await loadImportLib()
    await lib.deleteProfile(row.key, fp)
    lib.forgetLearnedSynonyms(row.key)
    setForgotten(fp)
    void useSavedChoices.getState().refresh()
    toast(`Saved column choices for ${row.label} were forgotten`, {
      description: 'The next upload is matched from its column names again.',
    })
  }
  return (
    <div>
      <h4 className="eyebrow">Saved column choices</h4>
      <p className="mt-1.5 text-small text-ink-2">
        Files with the same columns as {row.source.label} are mapped the same way next time, without asking.
      </p>
      {forgotten === row.profileFingerprint ? (
        <p className="mt-1 text-small text-muted">
          Forgotten. The next upload asks about every column again.
        </p>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 -ml-2.5"
          onClick={() => void forget(row.profileFingerprint ?? '')}
        >
          Forget saved column choices
        </Button>
      )}
    </div>
  )
}

export function MappingPanel({
  row,
  version,
  raw,
  rawLoading,
}: {
  row: ManifestRow
  version: DatasetVersion
  raw: RawRecord | null
  rawLoading: boolean
}) {
  const ctx = useAnalytics()
  const remap = useImportSession((s) => s.remap)
  const sessionIdle = useImportSession((s) => s.phase === 'idle')
  const { isBusy, run } = useBusy()
  const [confirming, setConfirming] = useState(false)
  const def = datasetDef(row.key)
  const filled = Object.fromEntries(ctx.quality.fields(row.key).map((f) => [f.ref.split('.')[1], f.filled]))
  // The stored sheet's spellings show which values the importer standardized on its own.
  const spellings = raw
    ? Object.fromEntries(
        Object.entries(rawSpellings(row.key, raw.sheet, version.mapping, version.applyOptions)).map(
          ([ref, list]) => [ref.slice(ref.indexOf('.') + 1), list ?? []],
        ),
      )
    : undefined
  const rows = lineageRows(def, version, filled, spellings)
  const known = hasLineage(version)
  const summary = lineageSummary(rows)
  const refYear = ctx.asOf.slice(0, 4)
  const confirmed = !!version.mappingConfirmedAt
  const defaults = DOCUMENTED_DEFAULTS[row.key]
  const remapWhy = !version.hasRaw
    ? version.source === 'sample'
      ? 'The generated sample was not read from a file, so there is no sheet to re-map.'
      : 'This version was loaded before Census kept original sheets. Upload the file again to re-map it.'
    : rawLoading
      ? 'Reading the stored sheet…'
      : !raw
        ? 'The stored sheet could not be read in this browser.'
        : !sessionIdle
          ? 'Finish the upload in progress first.'
          : null

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-8">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 basis-[300px]">
            <p className="flex items-center gap-2 text-body">
              {confirmed ? (
                <IconGood className="size-3.5 shrink-0 text-good" />
              ) : (
                <IconWarning className="size-3.5 shrink-0 text-warning" />
              )}
              <span className="font-semibold">Mapping: {mappingStatusText(version, refYear)}</span>
            </p>
            <p className="mt-1 text-small text-ink-2">
              {known
                ? `${fmt(summary.fromFile, 'int')} of ${fmt(summary.fields, 'int')} fields read from ${version.fileName ?? 'the file'}.${summary.lowUnreviewed ? ` ${fmt(summary.lowUnreviewed, 'int')} low-confidence ${summary.lowUnreviewed === 1 ? 'match needs' : 'matches need'} a look.` : ''}${summary.missingNeeded ? ` ${fmt(summary.missingNeeded, 'int')} required or recommended ${summary.missingNeeded === 1 ? 'field has' : 'fields have'} no column.` : ''}`
                : 'The generated sample was not read from a file, so it has no column mapping. Confirming records that you reviewed it as it is.'}
            </p>
            {!confirmed && (
              <p className="mt-1 text-meta text-muted">
                Confirming is a local record in this browser, not a sign-in. Silver also needs the checks in
                the Quality panel to pass.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!confirmed && !confirming && (
              <Button variant="primary" icon={<IconCheck />} onClick={() => setConfirming(true)}>
                Confirm mapping
              </Button>
            )}
            <Tip content="Open the mapping step again on the stored sheet, without uploading. Applying it makes a new version.">
              <Button
                icon={<IconPencil />}
                disabled={!!remapWhy}
                onClick={() => {
                  if (raw) void remap({ key: row.key, sheet: raw.sheet, version })
                }}
              >
                Re-map
              </Button>
            </Tip>
            {known && (
              <Button
                variant="ghost"
                icon={<IconDownload />}
                disabled={isBusy('lineage')}
                onClick={() =>
                  run(
                    'lineage',
                    () => downloadLineage(row.key, rows, roomMeta(ctx)),
                    'The mapping could not be exported.',
                  )
                }
              >
                Download
              </Button>
            )}
          </div>
        </div>
        {confirming && <ConfirmForm row={row} onDone={() => setConfirming(false)} />}
        {remapWhy && !rawLoading && <p className="mt-2 text-meta text-muted">{remapWhy}</p>}
        {known && (
          <div className="mt-4">
            <LineageTable rows={rows} label={row.label} />
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-5 lg:col-span-4">
        {defaults.length > 0 && (
          <div>
            <h4 className="eyebrow">How blanks are filled on upload</h4>
            <ul className="mt-1.5 space-y-1 text-small text-ink-2">
              {defaults.map((d) => (
                <li key={d} className="relative pl-3.5">
                  <span
                    aria-hidden="true"
                    className="absolute top-[0.6em] left-0 size-1 rounded-full bg-muted"
                  />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
        <SavedChoices row={row} />
      </div>
    </div>
  )
}
