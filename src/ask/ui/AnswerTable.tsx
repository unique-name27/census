/**
 * A table in an answer: the app's DataTable (sortable, numbers right-aligned in tabular figures),
 * a cell linked to records opens them in the drill panel, a row about an employee opens their
 * card, and the table downloads as CSV or Excel or copies, with names (the file stays on this
 * computer). Pay amounts never reach an answer, so there are no pay columns to drop. Exports are
 * stamped with the scope the answer was calculated for, not the filters on screen now.
 */
import type { Block } from '@/ask/engine'
import { DataTable } from '@/charts/DataTable'
import type { Column, ExportMeta } from '@/charts/types'
import { IconCopy, IconDownload, IconFile } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, Menu } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { openPerson } from '@/drill/store'
import { fmt } from '@/lib/format'
import { useAnswerCtx } from './answerContext'
import { answerTable, PERSON_KEY, REF_KEY } from './model'

type Row = Record<string, unknown>

/** At most this many characters of the question title an exported table. */
const TITLE_MAX = 120

export function AnswerTable({ block, index }: { block: Extract<Block, { type: 'table' }>; index: number }) {
  const ctx = useAnalytics()
  const { conversation, question, turnNo, exportScope } = useAnswerCtx()
  const person = (t: string) => conversation.person(t)
  const model = answerTable(block, person)
  const refOf = (row: Row, key: string): string | null =>
    (row[REF_KEY] as Record<string, string> | undefined)?.[key] ?? null
  const columns: Column<Row>[] = model.columns.map((c) => ({
    key: c.key,
    label: c.label,
    format: c.format,
    drill: (row: Row) => {
      const ref = refOf(row, c.key)
      return ref ? conversation.records(ref) : null
    },
  }))
  const employeeOf = (row: Row): string | null => {
    const token = row[PERSON_KEY]
    return typeof token === 'string' ? (conversation.person(token)?.employeeId ?? null) : null
  }
  const rowsOpen = model.rows.some((r) => employeeOf(r))

  const title = question.length > TITLE_MAX ? `${question.slice(0, TITLE_MAX - 1).trimEnd()}…` : question
  // The scope, period and standard the answer was calculated for (read when exporting).
  const metaNow = (): ExportMeta => {
    const s = exportScope?.() ?? {
      scope: ctx.scopeLabel,
      window: ctx.window.label,
      asOf: ctx.asOf,
      isSample: ctx.isSample,
      standard: ctx.standard,
    }
    return {
      view: 'Ask Census',
      viewKey: 'ask',
      scope: s.scope,
      window: s.window,
      asOf: s.asOf,
      isSample: s.isSample,
      company: s.isSample ? SAMPLE_COMPANY : 'Company data',
      standard: s.standard,
    }
  }
  // "answer 3 table 1": each answer's tables get their own file names.
  const name = turnNo ? `answer ${turnNo} table ${index}` : `answer table ${index}`
  const exportTable = {
    name,
    title,
    subtitle: `Ask Census answer, table ${index}`,
    columns: model.columns.map((c) => ({ key: c.key, label: c.label, format: c.format })),
    rows: model.rows,
  }
  const opts = { showPay: false }
  const onCsv = async () => {
    const m = await import('@/lib/export')
    const meta = metaNow()
    m.downloadCsv(exportTable, meta, { ...opts, fileName: m.fileStem(meta, name), preamble: true })
  }
  const onXlsx = async () => {
    try {
      const m = await import('@/lib/export')
      const meta = metaNow()
      await m.downloadXlsx([exportTable], meta, { ...opts, fileName: m.fileStem(meta, name) })
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-end">
        <Menu
          width={200}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              icon={<IconDownload />}
              caret
              aria-label={`Export table ${index}`}
            >
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
      <div className="rounded-sheet bg-sheet">
        <DataTable
          columns={columns}
          rows={model.rows}
          maxRows={50}
          caption={`Table ${index} of the answer to: ${title}`}
          onRowClick={
            rowsOpen
              ? (r) => {
                  const id = employeeOf(r)
                  if (id) openPerson(id)
                }
              : undefined
          }
          rowClickable={(r) => !!employeeOf(r)}
          emptyText="No rows."
        />
      </div>
    </div>
  )
}
