/**
 * The open state of a manifest row: what each field's fill rate is, the checks in full, what the
 * last upload changed (with its log as CSV) and how the importer fills gaps for this dataset.
 */
import { useState } from 'react'
import { Meter } from '@/charts'
import { IconDownload, IconGood } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, SeverityIcon, Tag } from '@/components/ui'
import { DOCUMENTED_DEFAULTS } from '@/data/import/defaults'
import { summarizeIssues } from '@/data/import/issues'
import { datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { coverageText, type FieldCoverage, REQUIREMENT_LABEL } from '../engine/coverage'
import { actionSeverity, issuesFileStem, redactPayIssues } from '../engine/flow'
import type { ManifestRow } from '../engine/manifest'
import { type ImportLog, logFor, useImportLogs } from '../state/importLog'
import { useSavedChoices } from '../state/savedChoices'
import { loadImportLib } from '../state/session'
import { downloadIssuesCsv } from './downloads'

function RequirementTag({ f }: { f: FieldCoverage }) {
  if (f.requirement === 'required') return <Tag tone="outline">{REQUIREMENT_LABEL.required}</Tag>
  if (f.requirement === 'recommended') return <Tag>{REQUIREMENT_LABEL.recommended}</Tag>
  return <span className="text-[12px] text-muted">{REQUIREMENT_LABEL.optional}</span>
}

const RANK = { required: 0, recommended: 1, optional: 2 } as const

/** Required fields first, then recommended, then optional; schema order within each group. */
const byRequirement = (fields: readonly FieldCoverage[]) =>
  fields
    .map((f, i) => ({ f, i }))
    .sort((a, b) => RANK[a.f.requirement] - RANK[b.f.requirement] || a.i - b.i)
    .map((x) => x.f)

/** Where a field's values came from, when the last upload says: no column, or some defaults. */
function FillNote({ f }: { f: FieldCoverage }) {
  if (f.inFile === false)
    return (
      <span className="block text-[11px] text-muted">
        Not in the file{f.filled > 0 ? '; derived from other columns' : ''}
        {f.defaulted > 0 ? `; ${fmt(f.defaulted, 'int')} set by default` : ''}
      </span>
    )
  if (f.defaulted > 0)
    return (
      <span className="block text-[11px] text-muted">
        {fmt(f.defaulted, 'int')} {f.defaulted === 1 ? 'row' : 'rows'} set by default, counted as blank
      </span>
    )
  return null
}

function CoverageTable({ row }: { row: ManifestRow }) {
  return (
    <div className="scroll-x">
      {/* Below sm the share and counts sit under the field name, so nothing scrolls sideways. */}
      <table className="w-full border-collapse text-[13px] sm:min-w-[460px]">
        <caption className="sr-only">Field coverage for {row.label}</caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className="eyebrow py-1.5 pr-3 font-semibold">
              Field
            </th>
            <th scope="col" className="eyebrow hidden py-1.5 pr-3 font-semibold sm:table-cell">
              Needed
            </th>
            <th scope="col" className="eyebrow w-[28%] py-1.5 font-semibold sm:w-[38%] sm:pr-3">
              Filled
            </th>
            <th scope="col" className="eyebrow hidden py-1.5 text-right font-semibold sm:table-cell">
              Rows
            </th>
          </tr>
        </thead>
        <tbody>
          {byRequirement(row.coverage.fields).map((f) => {
            const share = coverageText(f.share)
            const counts = `${fmt(f.filled, 'int')} of ${fmt(f.expected, 'int')}`
            // A date that is blank until something happens: a count of events, not a gap.
            const event = f.event ? `${fmt(f.filled, 'int')} ${f.event}` : null
            return (
              <tr key={f.key} className="border-b border-rule last:border-b-0">
                <td className="py-1.5 pr-3 align-top">
                  {f.label}
                  {f.scope && <span className="block text-[11px] text-muted">{f.scope}</span>}
                  {f.event && <span className="block text-[11px] text-muted">Blank until it happens</span>}
                  <FillNote f={f} />
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:hidden">
                    <RequirementTag f={f} />
                    <span className="tnum text-[12px] text-ink-2">{event ?? `${share} · ${counts}`}</span>
                  </span>
                </td>
                <td className="hidden py-1.5 pr-3 align-top sm:table-cell">
                  <RequirementTag f={f} />
                </td>
                <td className="py-1.5 pr-0 align-top sm:pr-3">
                  {event ? (
                    <span className="hidden h-5 items-center text-[12px] text-ink-2 sm:flex">{event}</span>
                  ) : (
                    <span className="flex h-5 items-center gap-2">
                      <Meter
                        value={f.share}
                        tone={
                          f.share != null && f.requirement !== 'optional' && f.share < 0.8
                            ? 'warning'
                            : 'default'
                        }
                        label={`${f.label} filled, ${share}`}
                        className="max-w-[140px]"
                      />
                      <span className="tnum hidden w-11 shrink-0 text-right text-[12px] text-ink-2 sm:inline">
                        {share}
                      </span>
                    </span>
                  )}
                </td>
                <td className="tnum hidden py-1.5 text-right align-top text-[12px] text-ink-2 sm:table-cell">
                  {counts}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LastImport({ row, log }: { row: ManifestRow; log: ImportLog }) {
  const showPay = useCensus((s) => s.showPay)
  const def = datasetDef(row.key)
  const issues = redactPayIssues(log.issues, def, showPay)
  const summaries = summarizeIssues(issues)
  const s = log.stats
  const facts = [
    `${fmt(s.rowsIn, 'int')} rows read`,
    `${fmt(s.rowsOut, 'int')} imported`,
    s.skippedMissingRequired ? `${fmt(s.skippedMissingRequired, 'int')} skipped` : null,
    s.duplicates
      ? `${fmt(s.duplicates, 'int')} ${s.duplicates === 1 ? 'duplicate' : 'duplicates'} merged`
      : null,
    s.defaulted
      ? `${fmt(s.defaulted, 'int')} ${s.defaulted === 1 ? 'value' : 'values'} filled by a default`
      : null,
  ].filter(Boolean)
  return (
    <div>
      <h4 className="eyebrow">Last upload</h4>
      <p className="mt-1.5 text-[13px]">
        {log.fileName}
        {log.sheetName ? ` › ${log.sheetName}` : ''}
        <span className="text-muted"> · {formatDate(log.importedAt.slice(0, 10))}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-ink-2">{facts.join(' · ')}</p>
      {summaries.length ? (
        <ul className="mt-2 space-y-1">
          {summaries.slice(0, 5).map((m) => (
            <li key={`${m.code}|${m.field}|${m.action}`} className="flex gap-2 text-[13px]">
              <SeverityIcon severity={actionSeverity(m.action)} className="mt-0.5 size-3.5 shrink-0" />
              <span>{m.message}</span>
            </li>
          ))}
          {summaries.length > 5 && (
            <li className="pl-5.5 text-[12px] text-muted">
              {summaries.length - 5} more kinds of change in the log.
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
          <IconGood className="size-3.5 text-good" />
          Every row imported as it was.
        </p>
      )}
      {issues.length > 0 && (
        <Button
          size="sm"
          className="mt-2.5"
          icon={<IconDownload />}
          onClick={() => downloadIssuesCsv(issues, issuesFileStem(row.label, log.sheetName || log.fileName))}
        >
          Download issues (CSV)
        </Button>
      )}
      {log.truncated > 0 && (
        <p className="mt-1.5 text-[12px] text-muted">
          The first {fmt(issues.length, 'int')} issues are kept; {fmt(log.truncated, 'int')} more were not
          stored.
        </p>
      )}
    </div>
  )
}

export function DatasetDetail({ row, id }: { row: ManifestRow; id: string }) {
  const logs = useImportLogs((s) => s.logs)
  const source = useCensus((s) => s.sources[row.key])
  const log = logFor(logs, row.key, source)
  const defaults = DOCUMENTED_DEFAULTS[row.key]
  const [forgotten, setForgotten] = useState<string | null>(null)
  async function forgetMapping(fp: string) {
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
    <div
      id={id}
      className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-rule px-4 pt-4 pb-5 lg:grid-cols-12"
    >
      <div className="min-w-0 lg:col-span-7">
        <p className="max-w-[70ch] text-[13px] text-ink-2">{row.description}</p>
        <h4 className="eyebrow mt-4">Field coverage</h4>
        <p className="mt-1 text-[12px] text-muted">
          Share of the rows each field applies to that hold a value. Values the importer set to Unknown or
          filled by a default count as blank.
        </p>
        <div className="mt-2">
          <CoverageTable row={row} />
        </div>
      </div>
      <div className="min-w-0 space-y-5 lg:col-span-5">
        <div>
          <h4 className="eyebrow">Checks</h4>
          {row.checks.length ? (
            <ul className="mt-1.5 space-y-1.5">
              {row.checks.map((c) => (
                <li key={`${c.kind}|${c.text}`} className="flex gap-2 text-[13px]">
                  <SeverityIcon severity={c.severity} className="mt-0.5 size-3.5 shrink-0" />
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-2">
              <IconGood className="size-3.5 text-good" />
              Rows link up, fields are filled and the data reaches the as-of date.
            </p>
          )}
        </div>
        {log && <LastImport row={row} log={log} />}
        {defaults.length > 0 && (
          <div>
            <h4 className="eyebrow">How blanks are filled on upload</h4>
            <ul className="mt-1.5 space-y-1 text-[13px] text-ink-2">
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
        {row.profileFingerprint && (
          <div>
            <h4 className="eyebrow">Saved column choices</h4>
            <p className="mt-1.5 text-[13px] text-ink-2">
              Files with the same columns as {row.source.label} are mapped the same way next time, without
              asking.
            </p>
            {forgotten === row.profileFingerprint ? (
              <p className="mt-1 text-[13px] text-muted">
                Forgotten. The next upload asks about every column again.
              </p>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="-ml-2.5 mt-1"
                onClick={() => void forgetMapping(row.profileFingerprint ?? '')}
              >
                Forget saved column choices
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
