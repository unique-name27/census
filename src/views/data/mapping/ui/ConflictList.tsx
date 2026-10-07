/**
 * Where the categories disagree: a status pill, one sentence, the count of people (or
 * requisitions) behind it, which opens them, and the change that would fix it when there is one.
 */
import { useState } from 'react'
import { type Column, Figure, type FigureSpan } from '@/charts'
import { toast } from '@/components/toast'
import { Button, StatusPill } from '@/components/ui'
import type { FieldRef } from '@/data/quality/fieldRef'
import { describeMapping, type NewReferenceMapping } from '@/data/reference'
import type { Datasets } from '@/data/schema'
import { useCensus } from '@/data/store'
import { Drill, type DrillSource } from '@/drill'
import type { Conflict } from '../engine/conflicts'
import { peopleSpec, requisitionSpec } from '../engine/drills'
import { useDraft } from './draft'
import { useYourName } from './hooks'

/** Items shown before "Show all". */
const FIRST = 6

const intText = (n: number) => n.toLocaleString('en-US')
const countText = (c: Conflict) =>
  c.dataset === 'requisitions'
    ? `${intText(c.count)} ${c.count === 1 ? 'req' : 'reqs'}`
    : `${intText(c.count)} ${c.count === 1 ? 'person' : 'people'}`

interface ExportRow {
  status: string
  conflict: string
  count: number
  of: string
  fix: string
}

const COLUMNS: Column<ExportRow>[] = [
  { key: 'status', label: 'Status' },
  { key: 'conflict', label: 'Conflict' },
  { key: 'count', label: 'Count', format: 'int' },
  { key: 'of', label: 'Of' },
  { key: 'fix', label: 'Suggested change' },
]

export function conflictDrill(c: Conflict, data: Datasets, asOf: string): DrillSource {
  return () =>
    c.dataset === 'requisitions'
      ? requisitionSpec({ title: c.text, data, rows: c.rows })
      : peopleSpec({
          title: c.pill,
          asOf,
          employees: data.employees,
          rows: c.rows,
          focus: c.section === 'job' ? 'job' : 'org',
          note: c.text,
        })
}

export function ConflictList({
  id,
  title,
  none,
  conflicts,
  data,
  asOf,
  span,
  uses,
}: {
  id: string
  title: string
  /** What it means when nothing disagrees. */
  none: string
  conflicts: readonly Conflict[]
  data: Datasets
  asOf: string
  span: FigureSpan
  uses: readonly FieldRef[]
}) {
  const [all, setAll] = useState(false)
  const start = useDraft((s) => s.start)
  const add = useCensus((s) => s.addReferenceMapping)
  const undo = useCensus((s) => s.undoReferenceChange)
  const [name] = useYourName()
  const rows: ExportRow[] = conflicts.map((c) => ({
    status: c.pill,
    conflict: c.text,
    count: c.count,
    of: c.dataset === 'requisitions' ? 'Requisitions' : 'Active people',
    fix: c.fixLabel ?? '',
  }))
  const shown = all ? conflicts : conflicts.slice(0, FIRST)
  const warnings = conflicts.filter((c) => c.severity === 'warning').length

  const fix = (c: Conflict) => {
    const f = c.fix
    if (!f) return
    // A fix from the official lists is certain: make the change now, with Undo in the toast.
    if (c.direct && f.kind !== 'merge') {
      const mapping: NewReferenceMapping =
        f.kind === 'move-department'
          ? { kind: f.kind, department: f.department, from: f.from, to: f.to }
          : { kind: f.kind, jobFamily: f.jobFamily, from: f.from, to: f.to }
      const r = add(mapping, name)
      if (!r.ok) {
        toast(r.error, { tone: 'critical' })
        return
      }
      const auditId = r.state.audit[0]?.id
      toast(describeMapping(r.mapping), {
        tone: 'good',
        description: `${countText(c)} now ${c.count === 1 ? 'sits' : 'sit'} under the official ${c.section === 'org' ? 'business unit' : 'job function'}.`,
        action: auditId ? { label: 'Undo', onClick: () => undo(auditId, name) } : undefined,
      })
      return
    }
    if (f.kind === 'move-department')
      start({ kind: f.kind, department: f.department, from: f.from ?? '', to: f.to }, true)
    else if (f.kind === 'move-family')
      start({ kind: f.kind, jobFamily: f.jobFamily, from: f.from ?? '', to: f.to }, true)
    else start({ kind: 'merge', ref: f.ref, values: [...f.from], to: f.to, scope: 'category' }, true)
  }

  return (
    <Figure
      id={id}
      title={title}
      subtitle={
        conflicts.length
          ? `${intText(conflicts.length)} to review${warnings ? `, ${intText(warnings)} that split the structure` : ''}`
          : 'Nothing to review'
      }
      data={rows}
      columns={COLUMNS}
      span={span}
      image={false}
      tableToggle={false}
      uses={uses}
    >
      {conflicts.length === 0 ? (
        <p className="flex items-start gap-2 text-small text-ink-2">
          <StatusPill severity="good" label="None" />
          <span>{none}</span>
        </p>
      ) : (
        <>
          <ul className="divide-y divide-rule">
            {shown.map((c) => (
              <li key={c.id} className="py-2.5 first:pt-0">
                <div className="flex items-start gap-2">
                  <StatusPill severity={c.severity} label={c.pill} />
                  <Drill
                    spec={conflictDrill(c, data, asOf)}
                    label={`Show the ${countText(c)}`}
                    className="ml-auto shrink-0 text-small font-semibold text-ink tnum"
                  >
                    {countText(c)}
                  </Drill>
                </div>
                <p className="mt-1 text-small leading-snug text-ink-2">{c.text}</p>
                {c.fix && c.fixLabel && (
                  <Button size="sm" variant="ghost" className="-ml-2.5 mt-0.5" onClick={() => fix(c)}>
                    {c.fixLabel}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {conflicts.length > FIRST && (
            <Button size="sm" variant="ghost" className="-ml-2.5 mt-1" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${intText(conflicts.length)}`}
            </Button>
          )}
        </>
      )}
    </Figure>
  )
}
