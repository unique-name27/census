/**
 * Values the views can't place: values of a field with a known list that are not in it. Each one
 * shows its rows (which open) and the known value it most likely means, ready to merge.
 */
import { useState } from 'react'
import { type Column, Figure } from '@/charts'
import { Button, StatusPill } from '@/components/ui'
import { isFilled } from '@/data/quality/applicability'
import { parseFieldRef } from '@/data/quality/fieldRef'
import { Drill } from '@/drill'
import { rowsSpec } from '../engine/drills'
import { fieldLabel, matchRows, type UnlistedValue, unlistedValues } from '../engine/lists'
import { useDraft } from './draft'
import type { MappingModel } from './model'

const FIRST = 6
const intText = (n: number) => n.toLocaleString('en-US')
const rowsText = (n: number) => `${intText(n)} ${n === 1 ? 'row' : 'rows'}`

interface ExportRow {
  field: string
  value: string
  rows: number
  suggestion: string
}

const COLUMNS: Column<ExportRow>[] = [
  { key: 'field', label: 'Field' },
  { key: 'value', label: 'Value' },
  { key: 'rows', label: 'Rows', format: 'int' },
  { key: 'suggestion', label: 'Likely means' },
]

export function UnlistedPanel({ model }: { model: MappingModel }) {
  const [all, setAll] = useState(false)
  const start = useDraft((s) => s.start)
  const items = unlistedValues(model.report.categories)
  const data = model.ctx.all
  const fields = new Set(items.map((u) => u.ref)).size
  const total = items.reduce((s, u) => s + u.count, 0)
  const shown = all ? items : items.slice(0, FIRST)

  const drillOf = (u: UnlistedValue) => () => {
    const p = parseFieldRef(u.ref)
    if (!p) return null
    const list = data[p.dataset] as unknown as Record<string, unknown>[]
    return rowsSpec({
      kind: p.dataset,
      title: `${u.category.label} "${u.value}"`,
      subtitle: fieldLabel(u.ref),
      data,
      rows: matchRows(list, p.field, { by: 'value', value: u.value }, isFilled),
      note: 'This value is not in the known list, so the views cannot place these rows.',
    })
  }

  return (
    <Figure
      id="data-map-unlisted"
      title="Values not in their list"
      subtitle={
        items.length
          ? `${intText(items.length)} ${items.length === 1 ? 'value' : 'values'} in ${intText(fields)} ${fields === 1 ? 'field' : 'fields'}, ${rowsText(total)}. Merge each into the value it means.`
          : 'Every value of a field with a known list is in it.'
      }
      data={items.map((u) => ({
        field: fieldLabel(u.ref),
        value: u.value,
        rows: u.count,
        suggestion: u.suggestion ?? '',
      }))}
      columns={COLUMNS}
      image={false}
      tableToggle={false}
      uses={[...new Set(items.map((u) => u.ref))]}
    >
      {items.length === 0 ? (
        <p className="flex items-start gap-2 text-small text-ink-2">
          <StatusPill severity="good" label="None" />
          <span>
            Every field with a list uses it: the official lists, case channels and the other fixed lists.
          </span>
        </p>
      ) : (
        <>
          <ul className="grid gap-x-6 md:grid-cols-2">
            {shown.map((u) => (
              <li key={`${u.ref}|${u.value}`} className="border-t border-rule py-2.5">
                <div className="flex items-start gap-2">
                  <StatusPill severity="warning" label="Not in the list" />
                  <Drill
                    spec={drillOf(u)}
                    label={`Show the ${rowsText(u.count)}`}
                    className="ml-auto shrink-0 text-small font-semibold text-ink tnum"
                  >
                    {rowsText(u.count)}
                  </Drill>
                </div>
                <p className="mt-1 text-small leading-snug text-ink-2">
                  <span className="text-ink">“{u.value}”</span> in {fieldLabel(u.ref)}
                  {u.suggestion ? `, likely ${u.suggestion}` : ''}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="-ml-2.5 mt-0.5"
                  onClick={() =>
                    start(
                      {
                        kind: 'merge',
                        ref: u.ref,
                        values: [u.value],
                        to: u.suggestion ?? '',
                        scope: 'category',
                      },
                      true,
                    )
                  }
                >
                  {u.suggestion ? `Merge into ${u.suggestion}` : 'Choose the value it means'}
                </Button>
              </li>
            ))}
          </ul>
          {items.length > FIRST && (
            <Button size="sm" variant="ghost" className="-ml-2.5 mt-1" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${intText(items.length)}`}
            </Button>
          )}
        </>
      )}
    </Figure>
  )
}
