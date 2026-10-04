/**
 * What the import of the current upload changed, from its log: rows read and imported, values
 * filled by a default, and each kind of change with the loaded rows it is about. The log
 * downloads as CSV.
 */
import { type ReactNode, useMemo } from 'react'
import { IconDownload, IconGood } from '@/components/icons'
import { Button, SeverityIcon } from '@/components/ui'
import { summarizeIssues } from '@/data/import/issues'
import { type Datasets, datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { Drill } from '@/drill/Drill'
import type { DrillKind, DrillRecordMap } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { actionSeverity, issuesFileStem, redactPayIssues } from '../../engine/flow'
import type { ManifestRow } from '../../engine/manifest'
import { issueGroupKey, issueRecordsByGroup } from '../../engine/records'
import type { ImportLog } from '../../state/importLog'
import { DrillSentence } from '../DrillSentence'
import { downloadIssuesCsv } from '../downloads'
import { issueSpec, rowsSpec } from '../drillSpecs'

const rowsWord = (n: number) => (n === 1 ? 'row' : 'rows')

type Rec = DrillRecordMap[DrillKind]

interface Fact {
  key: string
  node: ReactNode
}

export function LastImport({
  row,
  log,
  data,
  heading = 'Last upload',
}: {
  row: ManifestRow
  log: ImportLog
  data: Datasets
  heading?: string
}) {
  const showPay = useCensus((s) => s.showPay)
  const def = datasetDef(row.key)
  const rows: readonly Rec[] = data[row.key]
  // The log's lines and the loaded rows each one is about, matched once per upload.
  const { issues, matched } = useMemo(() => {
    const redacted = redactPayIssues(log.issues, def, showPay)
    return { issues: redacted, matched: issueRecordsByGroup(def, rows, redacted) }
  }, [log, def, rows, showPay])
  const summaries = summarizeIssues(issues)
  const s = log.stats
  const imported = `${fmt(s.rowsOut, 'int')} imported`
  const listed: (Fact | null)[] = [
    { key: 'read', node: `${fmt(s.rowsIn, 'int')} rows read` },
    {
      key: 'imported',
      // Still the rows loaded now, unless they were changed since.
      node:
        s.rowsOut > 0 && s.rowsOut === rows.length ? (
          <Drill spec={() => rowsSpec(row, data)} label={`Show the ${imported} rows`}>
            {imported}
          </Drill>
        ) : (
          imported
        ),
    },
    s.skippedMissingRequired
      ? { key: 'skipped', node: `${fmt(s.skippedMissingRequired, 'int')} skipped` }
      : null,
    s.duplicates
      ? {
          key: 'dupes',
          node: `${fmt(s.duplicates, 'int')} ${s.duplicates === 1 ? 'duplicate' : 'duplicates'} merged`,
        }
      : null,
    s.defaulted
      ? {
          key: 'defaulted',
          node: `${fmt(s.defaulted, 'int')} ${s.defaulted === 1 ? 'value' : 'values'} filled by a default`,
        }
      : null,
  ]
  const facts = listed.filter((f): f is Fact => f != null)
  return (
    <div>
      <h4 className="eyebrow">{heading}</h4>
      <p className="mt-1.5 text-[13px]">
        {log.fileName}
        {log.sheetName ? ` › ${log.sheetName}` : ''}
        {log.importedAt && <span className="text-muted"> · {formatDate(log.importedAt.slice(0, 10))}</span>}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-2">
        {facts.map((f, i) => (
          <span key={f.key}>
            {i > 0 && ' · '}
            {f.node}
          </span>
        ))}
      </p>
      {summaries.length ? (
        <ul className="mt-2 space-y-1">
          {summaries.slice(0, 5).map((m) => {
            const found = matched.get(issueGroupKey(m))
            const n = found?.records.length ?? 0
            const rowsText = `${fmt(n, 'int')} ${rowsWord(n)}`
            return (
              <li key={issueGroupKey(m)} className="flex gap-2 text-[13px]">
                <SeverityIcon severity={actionSeverity(m.action)} className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <DrillSentence
                    text={m.message}
                    // The count is underlined in place only when every logged row is still loaded.
                    figure={n === m.count ? m.count.toLocaleString('en-US') : null}
                    spec={n ? () => issueSpec(row, log, m, found) : null}
                    label={`Show the ${rowsText} this is about`}
                    link={`${rowsText} still loaded`}
                  />
                </span>
              </li>
            )
          })}
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
