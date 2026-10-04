/**
 * Your changes: the edit panel, the change list (who, when, rows changed, undo), the mappings in
 * force, and the "Reference mapping" workbook to send to the HRIS team or load back in.
 */
import { useRef, useState } from 'react'
import { type Column, Figure, useExportMeta } from '@/charts'
import { IconDownload, IconUpload } from '@/components/icons'
import { Section } from '@/components/Section'
import { toast } from '@/components/toast'
import { Button, StatusPill } from '@/components/ui'
import { byWho } from '@/data/quality/text'
import { canUndo, describeMapping, type ReferenceAudit, type ReferenceMapping } from '@/data/reference'
import type { Datasets } from '@/data/schema'
import { useCensus } from '@/data/store'
import { Drill, type DrillSource } from '@/drill'
import { fileStem } from '@/lib/export/names'
import { downloadXlsx } from '@/lib/export/xlsx'
import { rowsSpec } from '../engine/drills'
import { rowsChangedBy, whenText } from '../engine/edit'
import {
  AUDIT_COLUMNS,
  auditRows,
  MAPPING_COLUMNS,
  type MappingRow,
  mappingRows,
  newMappings,
  parseMappingSheet,
  pickMappingSheet,
  withoutBy,
} from '../engine/workbook'
import { EditPanel } from './EditPanel'
import { useYourName } from './hooks'
import type { MappingModel } from './model'

const intText = (n: number) => n.toLocaleString('en-US')
const rowsText = (n: number) => `${intText(n)} ${n === 1 ? 'row' : 'rows'}`
const FIRST = 8

/** The columns of the "Mappings in force" table on screen, in this order (the workbook adds the rest). */
const SHOWN = ['order', 'change', 'description', 'rows', 'by', 'status']
const MAPPING_TABLE: Column<MappingRow>[] = SHOWN.map((k) => MAPPING_COLUMNS.find((c) => c.key === k)).filter(
  (c): c is Column<MappingRow> => !!c,
)

/** The rows one mapping changed (in the dataset where it changed most), as they read now. */
function changedDrill(
  imported: Datasets,
  mappings: readonly ReferenceMapping[],
  id: string,
  current: Datasets,
): DrillSource {
  return () => {
    const parts = rowsChangedBy(imported, mappings, id)
    const m = mappings.find((x) => x.id === id)
    if (!parts.length || !m) return null
    const [first, ...rest] = parts
    return rowsSpec({
      kind: first.dataset,
      title: describeMapping(m),
      subtitle: `Rows changed in ${first.label}`,
      data: current,
      rows: first.rows,
      note: rest.length
        ? `It also changed ${rest.map((r) => `${rowsText(r.rows.length)} in ${r.label}`).join(' and ')}.`
        : undefined,
    })
  }
}

export function EditSection({ model }: { model: MappingModel }) {
  const [name, setName] = useYourName()
  const reference = useCensus((s) => s.reference)
  const add = useCensus((s) => s.addReferenceMapping)
  const meta = useExportMeta()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const skipped = model.ctx.reference.skipped
  const rows = mappingRows(reference.mappings, model.perMapping, skipped)
  const imported = useCensus((s) => s.data)
  const ids = reference.mappings.map((m) => m.id)
  const mappingTable: Column<MappingRow>[] = MAPPING_TABLE.map((c) =>
    c.key === 'rows'
      ? {
          ...c,
          drill: (r: MappingRow) =>
            r.rows ? changedDrill(imported, reference.mappings, ids[r.order - 1], model.ctx.all) : null,
        }
      : c,
  )

  const exportWorkbook = async () => {
    setBusy('export')
    try {
      await downloadXlsx(
        [
          {
            name: 'Mappings',
            title: 'Reference mapping',
            subtitle:
              'Changes made in Census to how categories relate, in the order they apply. Census reads this sheet back with Import mapping in Data room, Categories & mapping.',
            columns: MAPPING_COLUMNS,
            rows: rows as unknown as Record<string, unknown>[],
          },
          {
            name: 'Change list',
            title: 'Change list',
            subtitle: 'Every change and undo, newest first',
            columns: AUDIT_COLUMNS,
            rows: auditRows(reference.audit) as unknown as Record<string, unknown>[],
          },
          {
            name: 'Business units',
            title: 'Departments by business unit, after the changes',
            columns: [
              { key: 'businessUnit', label: 'Business unit' },
              { key: 'department', label: 'Department' },
              { key: 'headcount', label: 'Headcount', format: 'int' },
              { key: 'status', label: 'Status' },
            ],
            rows: model.orgRows as unknown as Record<string, unknown>[],
          },
          {
            name: 'Job functions',
            title: 'Job families by function, after the changes',
            columns: [
              { key: 'jobFunction', label: 'Job function' },
              { key: 'jobFamily', label: 'Job family' },
              { key: 'headcount', label: 'Headcount', format: 'int' },
              { key: 'status', label: 'Status' },
            ],
            rows: model.familyRows as unknown as Record<string, unknown>[],
          },
        ],
        meta,
        { showPay: false, fileName: fileStem(meta, 'reference-mapping') },
      )
    } catch (err) {
      console.error('The reference mapping could not be exported', err)
      toast('The reference mapping could not be exported.', { tone: 'critical' })
    } finally {
      setBusy(null)
    }
  }

  const importFile = async (file: File) => {
    setBusy('import')
    try {
      const { readWorkbook } = await import('@/data/import/parse')
      const book = readWorkbook(await file.arrayBuffer(), file.name)
      const sheet = pickMappingSheet(book.sheets)
      if (!sheet) {
        toast(`${file.name} has no Mappings sheet.`, {
          tone: 'critical',
          description:
            'Use a file downloaded with Download reference mapping, or a sheet with a Change column.',
        })
        return
      }
      const parsed = parseMappingSheet(sheet)
      const { add: fresh, duplicates } = newMappings(parsed.mappings, useCensus.getState().reference.mappings)
      const failed = [...parsed.errors]
      let added = 0
      for (const m of fresh) {
        const r = add(withoutBy(m), m.by?.trim() ? m.by : name)
        if (r.ok) added++
        else failed.push({ row: 0, message: r.error })
      }
      const parts = [
        duplicates ? `${intText(duplicates)} already in place` : null,
        failed.length
          ? `${intText(failed.length)} could not be read: ${failed
              .slice(0, 2)
              .map((e) => (e.row ? `row ${e.row}, ${e.message}` : e.message))
              .join(' ')}`
          : null,
      ].filter(Boolean)
      toast(
        added
          ? `Added ${intText(added)} ${added === 1 ? 'change' : 'changes'} from ${file.name}`
          : `No new changes in ${file.name}`,
        {
          tone: failed.length && !added ? 'critical' : added ? 'good' : 'neutral',
          description: parts.join('. ') || undefined,
        },
      )
    } catch (err) {
      console.error('The reference mapping could not be read', err)
      toast(`${file.name} could not be read.`, {
        tone: 'critical',
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Section
      id="data-map-edit"
      title="Your changes"
      dek="Fix how categories relate without changing your files. Changes are kept in this browser, apply before every number in Census, and show in each field’s tier explanation. Send the reference mapping to the HRIS team so the source can be fixed too."
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon={<IconDownload />}
            disabled={busy != null}
            onClick={() => void exportWorkbook()}
          >
            Download reference mapping
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<IconUpload />}
            disabled={busy != null}
            onClick={() => fileRef.current?.click()}
          >
            Import mapping
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="Import a reference mapping file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
            }}
          />
        </>
      }
    >
      <EditPanel model={model} name={name} setName={setName} />
      <ChangeList audit={reference.audit} model={model} name={name} />
      <Figure
        id="data-map-mappings"
        title="Mappings in force"
        subtitle="Applied in this order before every number in Census"
        data={rows}
        columns={mappingTable}
        tableOnly
        uses={[
          'employees.businessUnit',
          'employees.department',
          'employees.jobFunction',
          'employees.jobFamily',
        ]}
        table={{
          rowTone: (r) => (r.status === 'Applied' ? null : 'warning'),
          maxRows: 10,
        }}
        empty={rows.length ? null : 'No changes yet. Census shows your data as it was loaded.'}
      />
    </Section>
  )
}

/** "2 changes in force, 14 rows changed" */
function changeSummary(inForce: number, perMapping: Record<string, number>, entries: number): string {
  if (!entries) return 'Who changed what, and when'
  if (!inForce) return 'No changes in force. Undone changes stay listed and can be restored.'
  const rows = Object.values(perMapping).reduce((s, n) => s + n, 0)
  return `${intText(inForce)} ${inForce === 1 ? 'change' : 'changes'} in force, ${rowsText(rows)} changed`
}

function ChangeList({
  audit,
  model,
  name,
}: {
  audit: readonly ReferenceAudit[]
  model: MappingModel
  name: string
}) {
  const [all, setAll] = useState(false)
  const reference = useCensus((s) => s.reference)
  const undo = useCensus((s) => s.undoReferenceChange)
  const imported = useCensus((s) => s.data)
  const skipped = new Map(model.ctx.reference.skipped.map((s) => [s.id, s.reason]))
  const active = new Set(reference.mappings.map((m) => m.id))
  const shown = all ? audit : audit.slice(0, FIRST)

  return (
    <Figure
      id="data-map-changes"
      title="Change list"
      subtitle={changeSummary(reference.mappings.length, model.perMapping, audit.length)}
      data={auditRows(audit)}
      columns={AUDIT_COLUMNS}
      span={7}
      image={false}
      tableToggle={false}
      uses={['employees.businessUnit', 'employees.jobFunction']}
    >
      {audit.length === 0 ? (
        <p className="text-[13px] text-ink-2">
          No changes yet. Move a department, assign a job family to a function, or merge spellings, and the
          change appears here with who made it and when.
        </p>
      ) : (
        <>
          <ol className="divide-y divide-rule">
            {shown.map((a) => {
              const inForce = a.action === 'add' && active.has(a.mappingId)
              const changed = inForce ? model.perMapping[a.mappingId] : undefined
              const reason = inForce ? skipped.get(a.mappingId) : undefined
              return (
                <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 first:pt-0">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-[13px] leading-snug text-ink">{a.what}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {whenText(a.at)} · by {byWho(a.by)}
                      {changed != null && !reason && (
                        <>
                          {' · '}
                          {changed > 0 ? (
                            <Drill
                              spec={changedDrill(imported, reference.mappings, a.mappingId, model.ctx.all)}
                              label={`Show the ${rowsText(changed)} it changed`}
                            >
                              {rowsText(changed)} changed
                            </Drill>
                          ) : (
                            'no rows changed'
                          )}
                        </>
                      )}
                    </p>
                    {reason && (
                      <p className="mt-1 flex items-start gap-1.5 text-[12px] text-ink-2">
                        <StatusPill severity="warning" label="Not applied" />
                        <span>{reason}</span>
                      </p>
                    )}
                  </div>
                  {canUndo(reference, a.id) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => undo(a.id, name)}
                      aria-label={`${a.action === 'add' ? 'Undo' : 'Restore'}: ${a.what}`}
                    >
                      {a.action === 'add' ? 'Undo' : 'Restore'}
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
          {audit.length > FIRST && (
            <Button size="sm" variant="ghost" className="-ml-2.5 mt-1" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${intText(audit.length)}`}
            </Button>
          )}
        </>
      )}
    </Figure>
  )
}
