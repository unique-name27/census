/**
 * One official list in Settings: what it is and where it came from, Make official for a list
 * proposed from your data, Add a value and Rebuild from data, the values in the data that are not
 * on it (each opens its rows, with Map to… and Add to list), its values in a table (a row opens
 * the value's editor) and the values on it that no row uses.
 */
import { useId, useState } from 'react'
import { type Column, DataTable } from '@/charts'
import { toast } from '@/components/toast'
import { Button, cx, StatusPill, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { canAdd, type ListAnalysis, listDef, listFromData, useLists } from '@/data/lists'
import type { SourceKinds } from '@/data/lists/effective'
import type { EffectiveList, EffectiveLists, ListEdit, ListsState, ListValue } from '@/data/lists/types'
import { parseFieldRef } from '@/data/quality/fieldRef'
import { describeMapping } from '@/data/reference'
import { useCensus } from '@/data/store'
import { Drill, type DrillSource } from '@/drill'
import { rowsSpec } from '@/views/data/mapping/engine/drills'
import { fieldLabel } from '@/views/data/mapping/engine/lists'
import { useYourName } from '@/views/data/mapping/ui/hooks'
import { Select } from '@/views/data/ui/Select'
import { INPUT } from '../ui'
import { AttrField } from './AttrField'
import { changeNote, undoFromToast } from './actions'
import {
  checksText,
  intText,
  type OffListItem,
  offListItems,
  offListNote,
  originText,
  pauseText,
  plural,
  proposals,
  rowsText,
  soleField,
  type ValueRow,
  valueRows,
  valuesNote,
} from './listModel'
import { ValueEditor } from './ValueEditor'

const FIRST = 6
const H3 = 'text-[13px] font-semibold text-ink'

export function ListStatusChip({ official }: { official: boolean }) {
  return official ? <StatusPill severity="good" label="Official" /> : <Tag tone="outline">Proposed</Tag>
}

/**
 * Make a list change with a toast that can undo it; returns the error, or null when it was made.
 * The toast says so when the list still checks nothing after the change.
 */
function useRun(lists: EffectiveLists, analysis: ListAnalysis) {
  const edit = useLists((s) => s.edit)
  const sources = useCensus((s) => s.sources)
  const [name] = useYourName()
  return (e: ListEdit, description?: string): string | null => {
    const r = edit(e, lists, { by: name, usage: (_, v) => analysis.uses.get(v)?.total ?? 0 })
    if (!r.ok) return r.error
    const id = r.change.id
    toast(r.change.what, {
      tone: 'good',
      description: description ?? changeNote(r.state, e.list, sources),
      action: { label: 'Undo', onClick: () => undoFromToast(id, name) },
    })
    return null
  }
}

/* ───────────── add a value ───────────── */

function AddForm({
  list,
  lists,
  analysis,
  onDone,
}: {
  list: EffectiveList
  lists: EffectiveLists
  analysis: ListAnalysis
  onDone: () => void
}) {
  const def = list.def
  const run = useRun(lists, analysis)
  const ids = useId()
  const parentDef = def.parent ? listDef(def.parent) : null
  const [value, setValue] = useState('')
  const [parent, setParent] = useState('')
  const [attrs, setAttrs] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const editable = def.attrs.filter((a) => !a.derived)
  const submit = () => {
    const err = run({ kind: 'add', list: def.id, value, parent: parent || null, attrs })
    setError(err)
    if (!err) onDone()
  }
  return (
    <form
      aria-labelledby={`${ids}-title`}
      className="flex flex-col gap-2.5 rounded-control bg-sheet-2 px-3.5 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <span id={`${ids}-title`} className={H3}>
        Add a {def.singular.toLowerCase()}
      </span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-2">
          {def.singular}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error || undefined}
            className={cx(INPUT, 'w-full')}
          />
        </label>
        {parentDef && (
          <div className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-2">
            <span aria-hidden="true">{parentDef.singular}</span>
            <Select label={parentDef.singular} value={parent} onChange={setParent}>
              <option value="">No {parentDef.singular.toLowerCase()}</option>
              {lists[parentDef.id].values
                .filter((v) => !v.retired)
                .map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.value}
                  </option>
                ))}
            </Select>
          </div>
        )}
        {editable.map((a) => (
          <AttrField
            key={a.key}
            attr={a}
            value={attrs[a.key] ?? ''}
            onChange={(v) => setAttrs((s) => ({ ...s, [a.key]: v }))}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-bad-text">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" disabled={!value.trim()}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/* ───────────── rebuild from data ───────────── */

function RebuildPanel({
  list,
  lists,
  analysis,
  sources,
  onDone,
}: {
  list: EffectiveList
  lists: EffectiveLists
  analysis: ListAnalysis
  sources: SourceKinds
  onDone: () => void
}) {
  const ctx = useAnalytics()
  const def = list.def
  const editMany = useLists((s) => s.editMany)
  const edit = useLists((s) => s.edit)
  const [name] = useYourName()
  const found = proposals(list, ctx.all)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(found.map((v) => v.value)))
  const yours = (Object.keys(sources) as (keyof SourceKinds)[]).some((k) => sources[k]?.kind === 'upload')
  const accept = () => {
    const values = found.filter((v) => picked.has(v.value))
    const r = editMany([{ kind: 'add-many', list: def.id, values }], lists, '', { by: name })
    const change = r.change
    if (!change) {
      toast(r.rejected[0]?.error ?? 'Nothing was added.', { tone: 'critical' })
      return
    }
    const n = values.length
    toast(`Added ${plural(n, def.singular.toLowerCase(), def.label.toLowerCase())} from the data`, {
      tone: 'good',
      description: changeNote(r.state, def.id, sources),
      action: { label: 'Undo', onClick: () => undoFromToast(change.id, name) },
    })
    onDone()
  }
  const startOver = () => {
    const values = listFromData(def, ctx.all, (k) => sources[k]?.kind === 'upload')
    const r = edit({ kind: 'replace', list: def.id, values, basis: 'data' }, lists, { by: name })
    if (!r.ok) {
      toast(r.error, { tone: 'critical' })
      return
    }
    const id = r.change.id
    toast(r.change.what, {
      tone: 'good',
      description: changeNote(r.state, def.id, sources) ?? 'It now checks your data.',
      action: { label: 'Undo', onClick: () => undoFromToast(id, name) },
    })
    onDone()
  }
  const parentLabel = def.parent ? listDef(def.parent).singular : null
  return (
    <div className="flex flex-col gap-2.5 rounded-control bg-sheet-2 px-3.5 py-3">
      <span className={H3}>Rebuild from data</span>
      {found.length ? (
        <>
          <p className="text-[12px] text-ink-2">
            {plural(found.length, 'value')} in the loaded data {found.length === 1 ? 'is' : 'are'} not on the
            list. Choose the ones to add.
          </p>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {found.map((v) => (
              <li key={v.value}>
                <label className="flex items-start gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={picked.has(v.value)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const next = new Set(s)
                        if (e.target.checked) next.add(v.value)
                        else next.delete(v.value)
                        return next
                      })
                    }
                    className="mt-1 size-3.5 accent-(--ink)"
                  />
                  <span className="min-w-0">
                    {v.value}
                    <span className="text-ink-2">
                      {parentLabel && v.parent ? ` · ${v.parent}` : ''} ·{' '}
                      {rowsText(analysis.uses.get(v.value)?.total ?? 0)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={!picked.size} onClick={accept}>
              {picked.size === found.length
                ? `Add all ${intText(found.length)}`
                : `Add ${plural(picked.size, 'value')}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[12px] text-ink-2">Every value in the loaded data is on the list.</p>
      )}
      {/* A list proposed from your data is already that list: nothing to start over from. */}
      {yours && def.kind === 'org' && list.source !== 'data' && (
        <div className="flex flex-col gap-1.5 border-t border-rule pt-2.5">
          <p className="text-[12px] text-ink-2">
            Or start over: replace the whole list with one built from your data. Values only the sample uses
            go.
          </p>
          <div>
            <Button size="sm" onClick={startOver}>
              Replace with a list from your data
            </Button>
          </div>
        </div>
      )}
      {!found.length && (
        <div>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Close
          </Button>
        </div>
      )}
    </div>
  )
}

/* ───────────── in the data, not on the list ───────────── */

function OffListBlock({
  list,
  lists,
  analysis,
}: {
  list: EffectiveList
  lists: EffectiveLists
  analysis: ListAnalysis
}) {
  const ctx = useAnalytics()
  const def = list.def
  const items = offListItems(list, analysis)
  const [all, setAll] = useState(false)
  const [mapping, setMapping] = useState<{ key: string; to: string } | null>(null)
  const addMapping = useCensus((s) => s.addReferenceMapping)
  const undoMapping = useCensus((s) => s.undoReferenceChange)
  const [name] = useYourName()
  const run = useRun(lists, analysis)
  const ids = useId()
  if (!items.length) return null
  const shown = all ? items : items.slice(0, FIRST)
  const active = list.values.filter((v) => !v.retired)
  const keyOf = (i: OffListItem) => `${i.ref}|${i.value}`
  const fromData = (value: string): ListValue | undefined =>
    listFromData(def, ctx.all).find((v) => v.value === value)

  const drill =
    (i: OffListItem): DrillSource =>
    () => {
      const p = parseFieldRef(i.ref)
      if (!p) return null
      return rowsSpec({
        kind: p.dataset,
        title: `${def.singular} "${i.value}"`,
        subtitle: i.field,
        data: ctx.all,
        rows: i.rows,
        note: list.validates
          ? `"${i.value}" is not on the official ${def.label.toLowerCase()} list, so it counts as not recognized.`
          : `"${i.value}" is not on the proposed ${def.label.toLowerCase()} list.`,
      })
    }

  const mapTo = (i: OffListItem, to: string) => {
    const r = addMapping({ kind: 'merge', ref: i.ref, from: [i.value], to, scope: 'category' }, name)
    if (!r.ok) {
      toast(r.error, { tone: 'critical' })
      return
    }
    const audit = r.state.audit[0]?.id
    toast(describeMapping(r.mapping), {
      tone: 'good',
      description: 'A reference mapping in Categories & mapping. Every view now reads the new value.',
      action: audit ? { label: 'Undo', onClick: () => undoMapping(audit, name) } : undefined,
    })
    setMapping(null)
  }

  const addToList = (i: OffListItem) => {
    const proposed = fromData(i.value)
    const err = run({
      kind: 'add',
      list: def.id,
      value: i.value,
      parent: proposed?.parent ?? null,
      attrs: proposed?.attrs as Record<string, string> | undefined,
    })
    if (err) toast(err, { tone: 'critical' })
  }

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-2">
      <div>
        <h4 id={`${ids}-title`} className={H3}>
          In data, not on the list
        </h4>
        <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{offListNote(list, items)}</p>
      </div>
      <ul className="flex flex-col">
        {shown.map((i) => {
          const open = mapping?.key === keyOf(i)
          return (
            <li key={keyOf(i)} className="border-t border-rule py-2">
              <div className="flex items-start gap-2">
                <StatusPill severity={list.validates ? 'warning' : 'info'} label="Not on the list" />
                <Drill
                  spec={drill(i)}
                  label={`Show the ${rowsText(i.rows.length)} with "${i.value}"`}
                  className="ml-auto shrink-0 text-[13px] font-semibold text-ink tnum"
                >
                  {rowsText(i.rows.length)}
                </Drill>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink-2">
                <span className="text-ink">“{i.value}”</span> in {i.field}
                {i.suggestion ? `, likely ${i.suggestion}` : ''}
              </p>
              {open ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Select
                    label={`Map "${i.value}" to`}
                    value={mapping.to}
                    onChange={(to) => setMapping({ key: keyOf(i), to })}
                    className="w-56 max-w-full"
                  >
                    <option value="">Choose a {def.singular.toLowerCase()}</option>
                    {active.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.value}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!mapping.to}
                    onClick={() => mapTo(i, mapping.to)}
                  >
                    Map
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMapping(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="-ml-2.5 mt-0.5 flex flex-wrap gap-1">
                  {i.canMap && active.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMapping({ key: keyOf(i), to: i.suggestion ?? '' })}
                    >
                      Map to…
                    </Button>
                  )}
                  {canAdd(def) && (
                    <Button size="sm" variant="ghost" onClick={() => addToList(i)}>
                      Add to list
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {items.length > FIRST && (
        <div>
          <Button size="sm" variant="ghost" className="-ml-2.5" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${intText(items.length)}`}
          </Button>
        </div>
      )}
    </section>
  )
}

/* ───────────── the list ───────────── */

export function ListPanel({
  list,
  lists,
  analysis,
  saved,
  sources,
}: {
  list: EffectiveList
  lists: EffectiveLists
  analysis: ListAnalysis
  saved: ListsState
  sources: SourceKinds
}) {
  const ctx = useAnalytics()
  const def = list.def
  const run = useRun(lists, analysis)
  const [panel, setPanel] = useState<'add' | 'rebuild' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ids = useId()
  const rows = valueRows(list, analysis, lists)
  const value = selected ? list.values.find((v) => v.value === selected) : undefined
  const parentDef = def.parent ? listDef(def.parent) : null
  const notInData = analysis.notInData

  // The count opens exactly the rows it counts: only when one field holds them all. A value used
  // in several fields opens its editor instead (the row click), which opens each field's rows.
  const drillValue = (r: ValueRow): DrillSource => {
    const sole = soleField(analysis.uses.get(r.value))
    if (!sole) return null
    return () => {
      const p = parseFieldRef(sole.ref)
      if (!p) return null
      return rowsSpec({
        kind: p.dataset,
        title: `${def.singular} "${r.value}"`,
        subtitle: fieldLabel(sole.ref),
        data: ctx.all,
        rows: sole.rows,
      })
    }
  }

  const columns: Column<ValueRow>[] = [
    { key: 'value', label: def.singular },
    ...(parentDef ? [{ key: 'parent', label: parentDef.singular } as Column<ValueRow>] : []),
    ...def.attrs.map(
      (a): Column<ValueRow> => ({
        key: `attr:${a.key}`,
        label: a.label,
        format: a.type === 'number' ? 'int' : undefined,
      }),
    ),
    ...(def.id === 'department' ? [{ key: 'costCenters', label: 'Cost centers' } as Column<ValueRow>] : []),
    { key: 'rows', label: 'Rows', format: 'int', drill: drillValue },
    { key: 'status', label: 'Status' },
  ]

  const makeOfficial = () =>
    setError(
      run(
        { kind: 'make-official', list: def.id },
        checksText({ ...list, validates: true, paused: undefined }),
      ),
    )

  return (
    <section aria-labelledby={`${ids}-title`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`${ids}-title`} className="cut-head text-[16px] font-semibold text-ink">
              {def.label}
            </h3>
            <ListStatusChip official={list.status === 'official'} />
          </div>
          <p className="mt-0.5 max-w-[60ch] text-[12px] leading-snug text-ink-2">
            {def.about} {checksText(list)}
          </p>
          <p className="mt-0.5 max-w-[60ch] text-[12px] leading-snug text-muted">{originText(list, saved)}</p>
        </div>
      </div>

      {list.status === 'proposed' && (list.source === 'data' || list.paused === 'draft') && (
        <div className="flex flex-col gap-2 rounded-control bg-sheet-2 px-3.5 py-3">
          <p className="text-[13px] text-ink">
            {list.paused === 'draft'
              ? pauseText(list)
              : 'Census built this list from your data. Check it, then make it official to check your data against it.'}
          </p>
          <div>
            <Button size="sm" variant="primary" onClick={makeOfficial}>
              Make official
            </Button>
          </div>
        </div>
      )}
      {(list.paused === 'sample' || list.paused === 'yours') && (
        <div className="flex flex-col gap-2 rounded-control bg-warning-wash px-3.5 py-3">
          <p className="text-[13px] text-ink">{pauseText(list)}</p>
          <div className="flex flex-wrap gap-2">
            {list.paused === 'sample' && (
              <Button size="sm" variant="primary" onClick={() => setPanel('rebuild')}>
                Rebuild from data
              </Button>
            )}
            <Button size="sm" onClick={makeOfficial}>
              Keep checking against this list
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[12px] text-bad-text">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canAdd(def) && (
          <Button
            size="sm"
            onClick={() => setPanel(panel === 'add' ? null : 'add')}
            aria-expanded={panel === 'add'}
          >
            Add a value
          </Button>
        )}
        {def.kind === 'org' && (
          <Button
            size="sm"
            onClick={() => setPanel(panel === 'rebuild' ? null : 'rebuild')}
            aria-expanded={panel === 'rebuild'}
          >
            Rebuild from data
          </Button>
        )}
      </div>
      {panel === 'add' && (
        <AddForm key={def.id} list={list} lists={lists} analysis={analysis} onDone={() => setPanel(null)} />
      )}
      {panel === 'rebuild' && (
        <RebuildPanel
          key={def.id}
          list={list}
          lists={lists}
          analysis={analysis}
          sources={sources}
          onDone={() => setPanel(null)}
        />
      )}

      <OffListBlock list={list} lists={lists} analysis={analysis} />

      <div className="flex flex-col gap-1.5">
        <h4 className={H3}>Values</h4>
        <p className="text-[12px] text-ink-2">{valuesNote(list.values.length)}</p>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.value}
          maxRows={12}
          search={rows.length > 12 ? `Find a ${def.singular.toLowerCase()}` : undefined}
          onRowClick={(r) => setSelected(r.value === selected ? null : r.value)}
          caption={`${def.label}: values, ${parentDef ? `${parentDef.singular.toLowerCase()}, ` : ''}rows in data and status`}
          emptyText={`No ${def.label.toLowerCase()} yet.`}
        />
      </div>
      {value && (
        <ValueEditor
          key={`${def.id}:${value.value}`}
          list={list}
          lists={lists}
          value={value}
          analysis={analysis}
          onClose={() => setSelected(null)}
          onRenamed={setSelected}
        />
      )}

      {notInData.length > 0 && list.values.length > 0 && (
        <p className="text-[12px] leading-snug text-ink-2">
          <span className="font-semibold text-ink">On the list, not in the data:</span>{' '}
          {notInData
            .slice(0, 12)
            .map((v) => v.value)
            .join(', ')}
          {notInData.length > 12 ? ` and ${intText(notInData.length - 12)} more` : ''}.{' '}
          {notInData.length === 1
            ? 'Nothing to fix: it is ready for rows that use it.'
            : 'Nothing to fix: they are ready for rows that use them.'}
        </p>
      )}
    </section>
  )
}
