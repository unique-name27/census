/**
 * Step 3 for a sheet: what applying it would do. Rows in and out, what was skipped, merged,
 * defaulted or left blank, one sentence per kind of change, and the full exceptions log as a
 * searchable table and a CSV.
 */
import { DataTable } from '@/charts'
import { IconDownload, IconGood, IconInfoFilled } from '@/components/icons'
import { Button, cx, SeverityIcon } from '@/components/ui'
import { type ImportResult, ISSUE_COLUMNS, issueTableRows, summarizeIssues } from '@/data/import'
import { type DatasetDef, datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { fmt } from '@/lib/format'
import { actionSeverity, issueCounts, issuesFileStem, redactPayIssues } from '../../engine/flow'
import { sourceInfo } from '../../engine/manifest'
import { type Draft, type SessionSheet, useImportSession } from '../../state/session'
import { downloadIssuesCsv } from '../downloads'

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'attention' }) {
  return (
    <div className="min-w-0 bg-sheet px-4 py-3">
      <div
        className={cx(
          'cut-head text-[22px] leading-none font-[650]',
          tone === 'attention' && value > 0 && 'text-bad-text',
        )}
      >
        {fmt(value, 'int')}
      </div>
      <div className="mt-1 text-[12px] text-ink-2">{label}</div>
    </div>
  )
}

function Stats({ result }: { result: ImportResult }) {
  const s = result.stats
  const counts = issueCounts(result.issues)
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control bg-rule shadow-[0_0_0_1px_var(--rule)] sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Rows in the sheet" value={s.rowsIn} />
      <Stat label="Rows to import" value={s.rowsOut} />
      <Stat label="Skipped, required value missing" value={s.skippedMissingRequired} tone="attention" />
      <Stat label="Duplicates merged" value={s.duplicates} />
      <Stat label="Blanks filled by a default" value={s.defaulted} />
      <Stat
        label="Values left blank"
        value={counts.byAction['left-blank'] + counts.byAction.cleared}
        tone="attention"
      />
    </div>
  )
}

function ReplaceNote({ def }: { def: DatasetDef }) {
  const current = useCensus((s) => s.data[def.key].length)
  const source = useCensus((s) => s.sources[def.key])
  const info = sourceInfo(source)
  return (
    <p className="text-[13px] text-ink-2">
      Applying replaces the {fmt(current, 'int')} rows now in {def.label}
      {info.kind === 'sample' ? ', which are sample data' : `, from ${info.label}`}. Other datasets don’t
      change.
    </p>
  )
}

export function CheckStep({
  item,
  draft,
  result,
  pending,
}: {
  item: SessionSheet
  draft: Draft
  result: ImportResult | null
  pending: boolean
}) {
  const update = useImportSession((s) => s.update)
  const sheets = useImportSession((s) => s.sheets)
  const status = useImportSession((s) => s.status)
  const showPay = useCensus((s) => s.showPay)
  if (!draft.dataset) return null
  const def = datasetDef(draft.dataset)
  const rosterPending =
    def.key !== 'employees' &&
    sheets.some((s) => s.id !== item.id && s.dataset === 'employees' && status[s.id] === 'pending')

  const profileNote = draft.fromProfile && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-sheet-2 px-3 py-2 text-[13px]">
      <IconInfoFilled className="size-3.5 shrink-0 text-s1" />
      <span className="min-w-0 flex-1">Using the mapping you saved for this layout.</span>
      <Button size="sm" variant="ghost" onClick={() => update(item.id, () => ({ step: 'columns' }))}>
        Edit mapping
      </Button>
    </div>
  )

  if (pending || !result)
    return (
      <div className="space-y-5">
        {profileNote}
        <p aria-live="polite" className="text-[13px] text-ink-2">
          Checking {fmt(item.rows, 'int')} rows…
        </p>
      </div>
    )

  const issues = redactPayIssues(result.issues, def, showPay)
  const summaries = summarizeIssues(issues)
  const managers = result.stats.managers
  const tableRows = issueTableRows(issues)

  return (
    <div className="space-y-5">
      {profileNote}
      <Stats result={result} />
      <div className="space-y-1.5">
        {result.rows.length === 0 ? (
          <p className="text-[13px] font-medium">
            No rows can be imported from this sheet. Check the columns or skip it.
          </p>
        ) : (
          <ReplaceNote def={def} />
        )}
        {managers && (
          <p className="text-[13px] text-ink-2">
            Managers: {fmt(managers.byId, 'int')} linked by ID, {fmt(managers.byName, 'int')} by name,{' '}
            {fmt(managers.cleared, 'int')} cleared, {fmt(managers.topLevel, 'int')} at the top of the
            organization.
          </p>
        )}
        {rosterPending && (
          <p className="text-[13px] text-ink-2">
            The Employees sheet in this upload is not applied yet, so people are checked against the roster
            loaded now.
          </p>
        )}
      </div>
      <div>
        <h3 className="cut-head text-[16px] font-semibold">What changes on the way in</h3>
        {summaries.length ? (
          <ul className="mt-2 space-y-1.5">
            {summaries.map((m) => (
              <li key={`${m.code}|${m.field}|${m.action}`} className="flex gap-2 text-[13px]">
                <SeverityIcon severity={actionSeverity(m.action)} className="mt-0.5 size-3.5 shrink-0" />
                <span>{m.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
            <IconGood className="size-3.5 text-good" />
            No issues. Every row imports as it is in the file.
          </p>
        )}
      </div>
      {issues.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 className="cut-head flex-1 text-[16px] font-semibold">
              Issues by row <span className="font-normal text-muted">· {fmt(issues.length, 'int')}</span>
            </h3>
            <Button
              size="sm"
              icon={<IconDownload />}
              onClick={() => downloadIssuesCsv(issues, issuesFileStem(def.label, item.sheetName))}
            >
              Download issues (CSV)
            </Button>
          </div>
          <DataTable
            columns={ISSUE_COLUMNS}
            rows={tableRows}
            search="Search issues"
            maxRows={50}
            maxHeight={360}
            caption={`Import issues for ${def.label}`}
          />
        </div>
      )}
    </div>
  )
}
