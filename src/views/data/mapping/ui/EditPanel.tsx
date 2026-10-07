/**
 * Make a change: move a department to another business unit, put a job family under a function,
 * merge spellings into one value, or rename a value. The panel says what the change would do
 * before it is made; every change goes to the change list and can be undone.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'
import type { FieldRef } from '@/data/quality/fieldRef'
import { CATEGORIES, categoryOf, describeMapping, type FieldInventory } from '@/data/reference'
import { useCensus } from '@/data/store'
import { spanClass } from '@/lib/spans'
import { Select } from '../../ui/Select'
import {
  draftMapping,
  EDIT_LABEL,
  type EditKind,
  placementText,
  previewChange,
  previewText,
  scopeText,
} from '../engine/edit'
import { fieldLabel } from '../engine/lists'
import { BLANK } from '../engine/structure'
import { useDraft } from './draft'
import { scrollBehavior } from './hooks'
import type { MappingModel } from './model'

const NEW = '\u0000new'
const KINDS: EditKind[] = ['move-department', 'move-family', 'merge', 'rename']
const HINT: Record<EditKind, string> = {
  'move-department':
    'Put a department under another business unit, in Employees, Requisitions and the Hiring plan.',
  'move-family': 'Put a job family under a job function, in Employees.',
  merge: 'Read several spellings as one value, for example "DV" and "Design Verification".',
  rename: 'Change what a value is called everywhere it appears.',
}

const INPUT =
  'h-7 w-full min-w-0 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]'

function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string
  hint?: string
  children: ReactNode
  id?: string
}) {
  return (
    <div className="grid gap-1">
      {id ? (
        <label htmlFor={id} className="text-meta font-medium text-ink-2">
          {label}
        </label>
      ) : (
        // The control carries the same name as its aria-label.
        <span aria-hidden="true" className="text-meta font-medium text-ink-2">
          {label}
        </span>
      )}
      {children}
      {hint && <p className="text-meta leading-snug text-muted">{hint}</p>}
    </div>
  )
}

export function EditPanel({
  model,
  name,
  setName,
}: {
  model: MappingModel
  name: string
  setName: (n: string) => void
}) {
  const { options, report, ctx } = model
  const draft = useDraft((s) => s.draft)
  const focusNonce = useDraft((s) => s.focusNonce)
  const set = useDraft((s) => s.set)
  const start = useDraft((s) => s.start)
  const reset = useDraft((s) => s.reset)
  const add = useCensus((s) => s.addReferenceMapping)
  const undo = useCensus((s) => s.undoReferenceChange)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const ids = useId()

  // A conflict's fix fills the draft in and brings the panel into view.
  useEffect(() => {
    if (!focusNonce) return
    const el = panelRef.current
    if (!el) return
    // Focus first: moving focus during a smooth scroll can stop it.
    el.querySelector<HTMLElement>('select, input')?.focus({ preventScroll: true })
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  }, [focusNonce])

  const mapping = draftMapping(draft)
  const preview = previewChange(ctx.all, mapping)
  const message = previewText(preview)
  const ready = !preview.error && !preview.skipped && preview.total > 0

  const submit = () => {
    const r = add(mapping, name)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    setFilter('')
    const auditId = r.state.audit[0]?.id
    toast(describeMapping(r.mapping), {
      tone: 'good',
      description: message,
      action: auditId ? { label: 'Undo', onClick: () => undo(auditId, name) } : undefined,
    })
    reset()
  }

  const inventory: FieldInventory | undefined = report.categories.find((c) => c.ref === draft.ref)
  const cat = categoryOf(draft.ref)
  const values = (inventory?.values ?? []).filter((v) => v.count > 0)
  const shownValues = filter.trim()
    ? values.filter(
        (v) => v.value.toLowerCase().includes(filter.trim().toLowerCase()) || draft.values.includes(v.value),
      )
    : values

  const dept = options.departments.find((d) => d.value === draft.department)
  const fam = options.families.find((f) => f.value === draft.jobFamily)
  const unitCustom = draft.kind === 'move-department' && draft.to !== '' && !options.units.includes(draft.to)
  const fnCustom = draft.kind === 'move-family' && draft.to !== '' && !options.functions.includes(draft.to)
  const [typingUnit, setTypingUnit] = useState(false)
  const [typingFn, setTypingFn] = useState(false)

  const kindSelect = (
    <Field label="What to change" hint={HINT[draft.kind]}>
      <Select
        label="What to change"
        value={draft.kind}
        onChange={(k) => {
          setError(null)
          setFilter('')
          setTypingUnit(false)
          setTypingFn(false)
          start({ kind: k as EditKind })
        }}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {EDIT_LABEL[k]}
          </option>
        ))}
      </Select>
    </Field>
  )

  const fieldSelect = (
    <Field label="Field">
      <Select
        label="Field"
        value={draft.ref}
        onChange={(v) => {
          setFilter('')
          set({ ref: v as FieldRef, values: [], to: '' })
        }}
      >
        {CATEGORIES.map((c) => (
          <optgroup key={c.id} label={c.label}>
            {c.refs.map((r) => (
              <option key={r} value={r}>
                {fieldLabel(r)}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </Field>
  )

  const scopeBox = cat && cat.refs.length > 1 && (
    <label className="flex items-start gap-2 text-small text-ink-2">
      <input
        type="checkbox"
        className="mt-0.5 accent-[var(--ink)]"
        checked={draft.scope === 'category'}
        onChange={(e) => set({ scope: e.target.checked ? 'category' : 'field' })}
      />
      <span>
        Change it everywhere {cat.label.toLowerCase()} appears: {scopeText(draft.ref)}
      </span>
    </label>
  )

  const toValue = (label: string) =>
    cat?.strict && cat.vocab ? (
      <Field label={label}>
        <Select label={label} value={draft.to} onChange={(v) => set({ to: v })}>
          <option value="">Choose a value</option>
          {cat.vocab.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
    ) : (
      <Field label={label} id={`${ids}-to`}>
        <input
          id={`${ids}-to`}
          className={INPUT}
          value={draft.to}
          list={`${ids}-values`}
          placeholder="Type or pick a value"
          onChange={(e) => set({ to: e.target.value })}
        />
        <datalist id={`${ids}-values`}>
          {[...new Set([...(cat?.vocab ?? []), ...values.map((v) => v.value)])].map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </Field>
    )

  return (
    <div
      ref={panelRef}
      id="data-map-edit-panel"
      className={cx('scroll-mt-4 rounded-sheet bg-sheet px-4 pt-3.5 pb-4', spanClass(5))}
    >
      <h3 className="cut-head text-title leading-snug font-semibold text-ink">Make a change</h3>
      <p className="mt-0.5 text-small leading-snug text-ink-2">
        Kept in this browser and applied before every number in Census. Your files are not changed.
      </p>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) submit()
        }}
      >
        {kindSelect}

        {draft.kind === 'move-department' && (
          <>
            <Field
              label="Department"
              hint={dept ? `Now under ${placementText(dept.under, BLANK.businessUnit)}` : undefined}
            >
              <Select
                label="Department"
                value={draft.department}
                onChange={(v) => set({ department: v, from: '' })}
              >
                <option value="">Choose a department</option>
                {options.departments.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.value}
                  </option>
                ))}
              </Select>
            </Field>
            {dept && dept.under.filter((u) => u.under).length > 1 && (
              <Field label="Rows to move">
                <Select label="Rows to move" value={draft.from} onChange={(v) => set({ from: v })}>
                  <option value="">Every row of the department</option>
                  {dept.under
                    .filter((u) => u.under)
                    .map((u) => (
                      <option key={u.under} value={u.under ?? ''}>
                        Only rows under {u.under}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <Field label="Business unit">
              {typingUnit || unitCustom ? (
                <div className="flex gap-2">
                  <input
                    className={INPUT}
                    value={draft.to}
                    placeholder="New business unit"
                    aria-label="New business unit"
                    onChange={(e) => set({ to: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTypingUnit(false)
                      set({ to: '' })
                    }}
                  >
                    Pick one
                  </Button>
                </div>
              ) : (
                <Select
                  label="Business unit"
                  value={draft.to}
                  onChange={(v) => {
                    if (v === NEW) {
                      setTypingUnit(true)
                      set({ to: '' })
                    } else set({ to: v })
                  }}
                >
                  <option value="">Choose a business unit</option>
                  {options.units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value={NEW}>New business unit…</option>
                </Select>
              )}
            </Field>
          </>
        )}

        {draft.kind === 'move-family' && (
          <>
            <Field
              label="Job family"
              hint={fam ? `Now under ${placementText(fam.under, BLANK.jobFunction)}` : undefined}
            >
              <Select
                label="Job family"
                value={draft.jobFamily}
                onChange={(v) => set({ jobFamily: v, from: '' })}
              >
                <option value="">Choose a job family</option>
                {options.families.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value}
                  </option>
                ))}
              </Select>
            </Field>
            {fam && fam.under.filter((u) => u.under).length > 1 && (
              <Field label="Rows to move">
                <Select label="Rows to move" value={draft.from} onChange={(v) => set({ from: v })}>
                  <option value="">Every row of the family</option>
                  {fam.under
                    .filter((u) => u.under)
                    .map((u) => (
                      <option key={u.under} value={u.under ?? ''}>
                        Only rows under {u.under}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <Field label="Job function">
              {typingFn || fnCustom ? (
                <div className="flex gap-2">
                  <input
                    className={INPUT}
                    value={draft.to}
                    placeholder="Function name"
                    aria-label="Job function name"
                    onChange={(e) => set({ to: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTypingFn(false)
                      set({ to: '' })
                    }}
                  >
                    Pick one
                  </Button>
                </div>
              ) : (
                <Select
                  label="Job function"
                  value={draft.to}
                  onChange={(v) => {
                    if (v === NEW) {
                      setTypingFn(true)
                      set({ to: '' })
                    } else set({ to: v })
                  }}
                >
                  <option value="">Choose a function</option>
                  {options.functions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                  <option value={NEW}>Another function…</option>
                </Select>
              )}
            </Field>
          </>
        )}

        {draft.kind === 'merge' && (
          <>
            {fieldSelect}
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-meta font-medium text-ink-2">
                Spellings to merge{draft.values.length ? ` (${draft.values.length} chosen)` : ''}
              </legend>
              {values.length > 10 && (
                <input
                  className={INPUT}
                  value={filter}
                  placeholder="Find a value"
                  aria-label="Find a value"
                  onChange={(e) => setFilter(e.target.value)}
                />
              )}
              <ul className="max-h-48 overflow-y-auto rounded-control py-1 shadow-[inset_0_0_0_1px_var(--rule)]">
                {shownValues.length === 0 && (
                  <li className="px-2 py-1 text-small text-muted">No values to show.</li>
                )}
                {shownValues.map((v) => {
                  const on = draft.values.includes(v.value)
                  return (
                    <li key={v.value}>
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-small text-ink hover:bg-hover">
                        <input
                          type="checkbox"
                          className="accent-[var(--ink)]"
                          checked={on}
                          onChange={() => {
                            const next = on
                              ? draft.values.filter((x) => x !== v.value)
                              : [...draft.values, v.value]
                            set({ values: next, to: draft.to || (next.length ? next[0] : '') })
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">{v.value}</span>
                        <span className="tnum text-meta text-muted">{v.count.toLocaleString('en-US')}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
            {toValue('Merge into')}
            {scopeBox}
          </>
        )}

        {draft.kind === 'rename' && (
          <>
            {fieldSelect}
            <Field label="Value">
              <Select
                label="Value to rename"
                value={draft.values[0] ?? ''}
                onChange={(v) => set({ values: v ? [v] : [] })}
              >
                <option value="">Choose a value</option>
                {values.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.value} ({v.count.toLocaleString('en-US')})
                  </option>
                ))}
              </Select>
            </Field>
            {toValue('New name')}
            {scopeBox}
          </>
        )}

        <p
          role="status"
          className={cx(
            'text-small leading-snug',
            error || (preview.error && hasInput(draft)) || preview.skipped ? 'text-bad-text' : 'text-ink-2',
          )}
        >
          {error ?? (hasInput(draft) ? message : 'Choose what to change to see how many rows it affects.')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={!ready}>
            Make change
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null)
              setFilter('')
              setTypingUnit(false)
              setTypingFn(false)
              reset()
            }}
          >
            Clear
          </Button>
        </div>
        <div className="grid gap-1 border-t border-rule pt-3">
          <label htmlFor={`${ids}-name`} className="text-meta font-medium text-ink-2">
            Your name, for the change list
          </label>
          <input
            id={`${ids}-name`}
            className={INPUT}
            value={name}
            placeholder="Optional"
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </form>
    </div>
  )
}

/** The draft names something to change (so a validation message is worth showing). */
function hasInput(d: ReturnType<typeof useDraft.getState>['draft']): boolean {
  switch (d.kind) {
    case 'move-department':
      return !!d.department
    case 'move-family':
      return !!d.jobFamily
    default:
      return d.values.length > 0
  }
}
