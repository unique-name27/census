/**
 * Category lists: one compact table per categorical field, a group at a time. Each value has its
 * count (which opens the rows), its share, the spellings read as it, and whether the known list
 * has it.
 */
import { useState } from 'react'
import { type Column, Figure } from '@/charts'
import { Section } from '@/components/Section'
import { Segmented } from '@/components/ui'
import { isFilled } from '@/data/quality/applicability'
import type { FieldRef } from '@/data/quality/fieldRef'
import { parseFieldRef } from '@/data/quality/fieldRef'
import type { CategoryDef, FieldInventory } from '@/data/reference'
import { datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import type { DrillSource } from '@/drill'
import { Select } from '../../ui/Select'
import { importRows, rowsSpec } from '../engine/drills'
import {
  extraColumns,
  fieldOptionLabel,
  groupInventories,
  inventorySummary,
  LIST_GROUPS,
  matchRows,
  type ValueRow,
  valueRows,
} from '../engine/lists'
import type { MappingModel } from './model'
import { UnlistedPanel } from './UnlistedPanel'

const intText = (n: number) => n.toLocaleString('en-US')

/** What each list maps to, when the category carries more than its values. */
const ABOUT: Record<string, string> = {
  caseCategory:
    'Each category maps to the Hire-to-Retire Atlas process that governs it and the team that owns it.',
  transactionType: 'Each transaction type maps to its Hire-to-Retire Atlas process.',
  terminationReason: 'The 12 voluntary exit reasons plus Other, and the involuntary reasons.',
  level: 'The level ladder, L1 to E3.',
  location: 'Known sites carry their country and region.',
  stage: 'Candidate stages in order, Applied to Hired.',
}

export function ListsSection({ model }: { model: MappingModel }) {
  const [groupId, setGroupId] = useState(LIST_GROUPS[0].id)
  const group = LIST_GROUPS.find((g) => g.id === groupId) ?? LIST_GROUPS[0]
  const groups = groupInventories(group, model.report.categories)
  const uploads = Object.keys(model.raw.issues).length

  return (
    <Section
      id="data-map-lists"
      title="Category lists"
      dek={
        <>
          The values of every categorical field across the ten datasets, how often each is used, and the
          spellings that were read as each one. Values outside a known list count against the field’s tier.
          {model.raw.loading
            ? ' Reading the stored files for their spellings.'
            : uploads
              ? ''
              : ' Spellings from the file appear once you upload your own data.'}
        </>
      }
    >
      <UnlistedPanel model={model} />
      <div className="col-span-full mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="cut-head text-[15px] font-semibold text-ink">Lists by area</h3>
        <span className="hidden lg:inline-flex">
          <Segmented
            label="Category group"
            value={group.id}
            onChange={setGroupId}
            options={LIST_GROUPS.map((g) => ({ value: g.id, label: g.label }))}
          />
        </span>
        <Select label="Category group" value={group.id} onChange={setGroupId} className="w-48 lg:hidden">
          {LIST_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </div>
      {groups.map(({ category, fields }) => (
        <CategoryTable key={category.id} category={category} fields={fields} model={model} />
      ))}
    </Section>
  )
}

function CategoryTable({
  category,
  fields,
  model,
}: {
  category: CategoryDef
  fields: readonly FieldInventory[]
  model: MappingModel
}) {
  const [ref, setRef] = useState<FieldRef>(fields[0].ref)
  const mappings = useCensus((s) => s.reference.mappings)
  const inv = fields.find((f) => f.ref === ref) ?? fields[0]
  const p = parseFieldRef(inv.ref)!
  const def = datasetDef(p.dataset)
  const rows = valueRows(inv, mappings, model.skipped)
  const sum = inventorySummary(inv)
  const data = model.ctx.all
  const issues = model.raw.issues[p.dataset] ?? []

  const drillOf = (r: ValueRow): DrillSource => {
    const m = r.match
    if (!m || !r.count) return null
    return () => {
      const list = data[p.dataset] as unknown as Record<string, unknown>[]
      const idx =
        m.by === 'import'
          ? importRows(p.dataset, list, issues, p.field, m.value)
          : matchRows(list, p.field, m, isFilled)
      const label = category.label.toLowerCase()
      const what = m.by === 'blank' ? `no ${label}` : `${label} "${r.value}"`
      return rowsSpec({
        kind: p.dataset,
        title:
          m.by === 'import'
            ? `${category.label} "${r.value}", not recognized at import`
            : `${def.label} with ${what}`,
        subtitle: `${def.label}: ${def.fields.find((f) => f.key === p.field)?.label ?? p.field}`,
        data,
        rows: idx,
        note:
          m.by === 'import'
            ? 'The importer did not recognize this value and left the field blank on these rows.'
            : undefined,
      })
    }
  }

  // Columns with nothing in them are left out: spellings before any upload, status without a list.
  const hasSpellings = rows.some((r) => r.spellings)
  const hasStatus = rows.some((r) => r.statusText)
  const columns: Column<ValueRow>[] = [
    { key: 'value', label: category.label },
    ...(extraColumns(category.id) as Column<ValueRow>[]),
    { key: 'count', label: 'Rows', format: 'int', drill: drillOf },
    { key: 'share', label: 'Share', format: 'pct' },
    ...(hasSpellings ? [{ key: 'spellings', label: 'Spellings mapped to it' }] : []),
    ...(hasStatus ? [{ key: 'statusText', label: 'Status' }] : []),
  ]
  const many = rows.length > 12
  const subtitle = [
    ABOUT[category.id],
    `${intText(sum.used)} ${sum.used === 1 ? 'value' : 'values'} in ${intText(sum.total)} ${sum.total === 1 ? 'row' : 'rows'} of ${def.label}.`,
  ]
    .filter(Boolean)
    .join(' ')
  const notes = [
    sum.unrecognized
      ? `${intText(sum.unrecognized)} ${sum.unrecognized === 1 ? 'value was' : 'values were'} not recognized.`
      : null,
    sum.blank ? `${intText(sum.blank)} ${sum.blank === 1 ? 'row is' : 'rows are'} blank.` : null,
    hasSpellings ? null : 'No other spellings were read as these values.',
    'Share is of the filled rows.',
  ].filter(Boolean)

  return (
    <Figure
      id={`data-map-list-${category.id}`}
      title={category.label}
      subtitle={subtitle}
      note={notes.join(' ')}
      data={rows}
      columns={columns}
      tableOnly
      span={6}
      uses={[inv.ref]}
      empty={sum.total ? null : `No rows loaded in ${def.label}.`}
      actions={
        fields.length > 1 ? (
          <Select
            label={`Which ${category.label.toLowerCase()} field`}
            value={inv.ref}
            onChange={(v) => setRef(v as FieldRef)}
            className="w-40"
          >
            {fields.map((f) => (
              <option key={f.ref} value={f.ref}>
                {fieldOptionLabel(f.ref, category)}
              </option>
            ))}
          </Select>
        ) : undefined
      }
      table={{
        maxRows: many ? 10 : 12,
        search: many ? `Find a ${category.label.toLowerCase()}` : undefined,
        rowTone: (r) => (r.status === 'unlisted' || r.status === 'import' ? 'warning' : null),
      }}
    />
  )
}
