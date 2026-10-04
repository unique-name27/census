/**
 * One value of an official list, opened from its table row: where the data uses it (each count
 * opens the rows), and rename, move under another parent, attributes, retire or restore, and
 * delete for an unused value you added. A rename or move can carry the data along through a
 * reference mapping (Categories & mapping), so the numbers follow the list.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { IconClose } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, cx, IconButton } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { cleanName, type ListAnalysis, listDef, useLists } from '@/data/lists'
import type { EffectiveList, EffectiveLists, ListEdit, ListValue } from '@/data/lists/types'
import { linkReference } from '@/data/lists/undo'
import { parseFieldRef } from '@/data/quality/fieldRef'
import { categoryOf, type NewReferenceMapping } from '@/data/reference'
import { useCensus } from '@/data/store'
import { Drill } from '@/drill'
import { rowsSpec } from '@/views/data/mapping/engine/drills'
import { fieldLabel } from '@/views/data/mapping/engine/lists'
import { useYourName } from '@/views/data/mapping/ui/hooks'
import { Select } from '@/views/data/ui/Select'
import { INPUT } from '../ui'
import { AttrField } from './AttrField'
import { changeNote, undoFromToast } from './actions'
import { intText, rowsText, statusText } from './listModel'

const BLOCK = 'flex flex-col gap-1.5 border-t border-rule pt-3'
const LABEL = 'text-[12px] font-semibold text-ink'

export function ValueEditor({
  list,
  lists,
  value,
  analysis,
  onClose,
  onRenamed,
}: {
  list: EffectiveList
  lists: EffectiveLists
  value: ListValue
  analysis: ListAnalysis
  onClose: () => void
  onRenamed: (to: string) => void
}) {
  const ctx = useAnalytics()
  const def = list.def
  const edit = useLists((s) => s.edit)
  const addMapping = useCensus((s) => s.addReferenceMapping)
  const sources = useCensus((s) => s.sources)
  const [name] = useYourName()
  const ids = useId()
  const headRef = useRef<HTMLHeadingElement>(null)
  const one = def.singular.toLowerCase()
  const use = analysis.uses.get(value.value)
  const rows = use?.total ?? 0
  const byRef = [...(use?.byRef ?? new Map()).entries()]
  const mappable = byRef.find(([ref]) => categoryOf(ref))?.[0] ?? null
  const parentDef = def.parent ? listDef(def.parent) : null
  const parentValues = def.parent
    ? lists[def.parent].values.filter((v) => !v.retired || v.value === value.parent)
    : []
  const canRename = def.kind === 'org' || (def.kind === 'vocab' && !value.builtIn)
  const editable = def.attrs.filter((a) => !a.derived && !(value.builtIn && a.builtInFixed))
  const fixedAttrs = def.attrs.filter((a) => a.derived || (value.builtIn && a.builtInFixed))

  const [newName, setNewName] = useState(value.value)
  const [renameData, setRenameData] = useState(true)
  const [parent, setParent] = useState(value.parent ?? '')
  const [moveData, setMoveData] = useState(true)
  const [attrs, setAttrs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      editable.map((a) => [a.key, value.attrs?.[a.key] == null ? '' : String(value.attrs[a.key])]),
    ),
  )
  const [replacedBy, setReplacedBy] = useState('')
  const [error, setError] = useState<{ part: string; text: string } | null>(null)

  // A newly opened value brings its editor into view.
  useEffect(() => {
    headRef.current?.focus({ preventScroll: true })
    headRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  /**
   * Make a change. `after` may carry the data along with a reference mapping: the change records
   * it, so any undo (the toast's, or the change log's) takes the list and the data back together.
   */
  const run = (
    part: string,
    e: ListEdit,
    after?: () => { description?: string; reference?: string | null },
  ) => {
    const r = edit(e, lists, { by: name, usage: (_, v) => analysis.uses.get(v)?.total ?? 0 })
    if (!r.ok) {
      setError({ part, text: r.error })
      return false
    }
    setError(null)
    const id = r.change.id
    const extra = after?.()
    if (extra?.reference) linkReference(id, extra.reference)
    const notes = [extra?.description, changeNote(r.state, def.id, sources)].filter(Boolean)
    toast(r.change.what, {
      tone: 'good',
      description: notes.length ? notes.join(' ') : undefined,
      action: { label: 'Undo', onClick: () => undoFromToast(id, name) },
    })
    return true
  }

  /** A reference mapping that carries the data along; returns its change-list id, or null. */
  const mapData = (m: NewReferenceMapping): string | null => {
    const r = addMapping(m, name)
    if (!r.ok) {
      toast('The data was not changed', { tone: 'critical', description: r.error })
      return null
    }
    return r.state.audit[0]?.id ?? null
  }

  const rename = () => {
    // The name the list stores (trimmed, inner spaces collapsed), so the data gets the same one.
    const to = cleanName(newName)
    const ok = run('rename', { kind: 'rename', list: def.id, from: value.value, to }, () => {
      if (!renameData || !rows || !mappable) return {}
      const audit = mapData({ kind: 'rename', ref: mappable, from: [value.value], to, scope: 'category' })
      return audit
        ? {
            description: `Its ${rowsText(rows)} in the data were renamed too (Categories & mapping).`,
            reference: audit,
          }
        : {}
    })
    if (ok) onRenamed(to)
  }

  const move = () => {
    const to = parent || null
    run('move', { kind: 'move', list: def.id, value: value.value, parent: to }, () => {
      if (!moveData || !rows || !to || (def.id !== 'department' && def.id !== 'jobFamily')) return {}
      const audit = mapData(
        def.id === 'department'
          ? { kind: 'move-department', department: value.value, from: null, to }
          : { kind: 'move-family', jobFamily: value.value, from: null, to },
      )
      return audit
        ? {
            description: `Its rows in the data now sit under ${to} too (Categories & mapping).`,
            reference: audit,
          }
        : {}
    })
  }

  const drillFor = (ref: (typeof byRef)[number][0], idx: readonly number[]) => () => {
    const p = parseFieldRef(ref)
    if (!p) return null
    return rowsSpec({
      kind: p.dataset,
      title: `${def.singular} "${value.value}"`,
      subtitle: fieldLabel(ref),
      data: ctx.all,
      rows: idx,
    })
  }

  const err = (part: string) =>
    error?.part === part ? (
      <p role="alert" className="text-[12px] text-bad-text">
        {error.text}
      </p>
    ) : null

  return (
    <section
      aria-labelledby={`${ids}-head`}
      className="flex flex-col gap-3 rounded-control bg-sheet-2 px-3.5 py-3"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4
            id={`${ids}-head`}
            ref={headRef}
            tabIndex={-1}
            className="cut-head truncate rounded-[2px] text-[15px] font-semibold text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
          >
            {value.value}
          </h4>
          <p className="text-[12px] text-ink-2">
            {statusText(value)}
            {fixedAttrs.map((a) =>
              value.attrs?.[a.key] != null ? (
                <span key={a.key}>
                  {' · '}
                  {a.label}: {String(value.attrs[a.key])}
                </span>
              ) : null,
            )}
          </p>
        </div>
        <IconButton label={`Close ${value.value}`} size="sm" onClick={onClose}>
          <IconClose />
        </IconButton>
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Used in</span>
        {byRef.length ? (
          <ul className="flex flex-col gap-0.5 text-[13px] text-ink-2">
            {byRef.map(([ref, idx]) => (
              <li key={ref} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{fieldLabel(ref)}</span>
                <Drill
                  spec={drillFor(ref, idx)}
                  label={`Show the ${rowsText(idx.length)} in ${fieldLabel(ref)}`}
                  className="shrink-0 font-semibold text-ink tnum"
                >
                  {rowsText(idx.length)}
                </Drill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-2">No rows in the data use it.</p>
        )}
      </div>

      {canRename && (
        <div className={BLOCK}>
          <label htmlFor={`${ids}-name`} className={LABEL}>
            Rename
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`${ids}-name`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename()
              }}
              className={cx(INPUT, 'w-56 max-w-full')}
              aria-invalid={error?.part === 'rename' || undefined}
            />
            <Button
              size="sm"
              onClick={rename}
              disabled={!cleanName(newName) || cleanName(newName) === value.value}
            >
              Rename
            </Button>
          </div>
          {rows > 0 && mappable && (
            <label className="flex items-start gap-2 text-[12px] text-ink-2">
              <input
                type="checkbox"
                checked={renameData}
                onChange={(e) => setRenameData(e.target.checked)}
                className="mt-0.5 size-3.5 accent-(--ink)"
              />
              <span>
                Rename it in the data too: {rowsText(rows)}, through a reference mapping in Categories &
                mapping.
              </span>
            </label>
          )}
          {err('rename')}
        </div>
      )}

      {parentDef && def.kind === 'org' && (
        <div className={BLOCK}>
          <span className={LABEL}>{parentDef.singular}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label={`${parentDef.singular} of ${value.value}`}
              value={parent}
              onChange={setParent}
              className="w-56 max-w-full"
            >
              <option value="">No {parentDef.singular.toLowerCase()}</option>
              {parentValues.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.value}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={move} disabled={(value.parent ?? '') === parent}>
              Move
            </Button>
          </div>
          {rows > 0 &&
            parent &&
            parent !== (value.parent ?? '') &&
            (def.id === 'department' || def.id === 'jobFamily') && (
              <label className="flex items-start gap-2 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  checked={moveData}
                  onChange={(e) => setMoveData(e.target.checked)}
                  className="mt-0.5 size-3.5 accent-(--ink)"
                />
                <span>
                  Move its rows in the data too, so they sit under {parent} (a reference mapping in Categories
                  & mapping).
                </span>
              </label>
            )}
          {err('move')}
        </div>
      )}

      {editable.length > 0 && (
        <div className={BLOCK}>
          <span className={LABEL}>Details</span>
          <p className="text-[12px] text-ink-2">
            For reference: details travel with the list and its workbook, and no number in Census reads them.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {editable.map((a) => (
              <AttrField
                key={a.key}
                attr={a}
                value={attrs[a.key] ?? ''}
                onChange={(v) => setAttrs((s) => ({ ...s, [a.key]: v }))}
              />
            ))}
          </div>
          <div>
            <Button
              size="sm"
              onClick={() => run('attrs', { kind: 'attrs', list: def.id, value: value.value, attrs })}
            >
              Save details
            </Button>
          </div>
          {err('attrs')}
        </div>
      )}

      <div className={BLOCK}>
        <span className={LABEL}>{value.retired ? 'Retired' : 'Retire'}</span>
        {value.retired ? (
          <>
            <p className="text-[12px] text-ink-2">
              Older rows that use it are still recognized. Restore it to offer it in template dropdowns again.
            </p>
            <div>
              <Button
                size="sm"
                onClick={() => run('retire', { kind: 'restore', list: def.id, value: value.value })}
              >
                Restore
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] text-ink-2">
              A retired value stays recognized in older rows but leaves the template dropdowns.
              {rows ? ` ${intText(rows)} ${rows === 1 ? 'row uses' : 'rows use'} it now.` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {def.kind !== 'fixed' && (
                <Select
                  label="Replaced by"
                  value={replacedBy}
                  onChange={setReplacedBy}
                  className="w-56 max-w-full"
                >
                  <option value="">No replacement</option>
                  {list.values
                    .filter((v) => !v.retired && v.value !== value.value)
                    .map((v) => (
                      <option key={v.value} value={v.value}>
                        Replaced by {v.value}
                      </option>
                    ))}
                </Select>
              )}
              <Button
                size="sm"
                onClick={() =>
                  run('retire', {
                    kind: 'retire',
                    list: def.id,
                    value: value.value,
                    replacedBy: replacedBy || null,
                  })
                }
              >
                Retire
              </Button>
            </div>
          </>
        )}
        {err('retire')}
      </div>

      {value.added && rows === 0 && (
        <div className={BLOCK}>
          <span className={LABEL}>Delete</span>
          <p className="text-[12px] text-ink-2">You added it and no row uses it, so it can be deleted.</p>
          <div>
            <Button
              size="sm"
              onClick={() => {
                if (run('delete', { kind: 'delete', list: def.id, value: value.value })) onClose()
              }}
            >
              Delete {one}
            </Button>
          </div>
          {err('delete')}
        </div>
      )}
    </section>
  )
}
