/**
 * The wording and the target of a metric, each edited in place: Edit opens the field, Save
 * applies it everywhere the metric appears (Ctrl+Enter saves, Escape cancels), and a changed
 * field shows its default with "Use default".
 */
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react'
import { IconLock, IconPencil } from '@/components/icons'
import { Button, cx } from '@/components/ui'
import { comparatorText, defaultComparator, targetDirectionWarning, targetText } from '@/metrics/overrides'
import type { MetricDef, MetricTarget, TextField } from '@/metrics/types'
import { Select } from '../../ui/Select'
import { parseTargetDraft, type TargetDraft, type TargetRule, targetDraft, targetUnit } from '../model'

/** Boxes without a width, for inputs sized by the caller (a width class can't override `w-full`). */
export const INPUT_BOX =
  'min-w-0 rounded-control bg-sheet px-2 py-1.5 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--critical)]'

export const INPUT = `w-full ${INPUT_BOX}`

/** A labelled row of the definition sheet: label on the left, value and controls on the right. */
export function FieldRow({
  label,
  labelFor,
  children,
  className,
}: {
  label: string
  labelFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('grid gap-x-4 gap-y-1 border-t border-rule py-3 sm:grid-cols-[132px_1fr]', className)}>
      {labelFor ? (
        <label htmlFor={labelFor} className="text-[12px] font-semibold text-ink-2 sm:pt-0.5">
          {label}
        </label>
      ) : (
        <span className="text-[12px] font-semibold text-ink-2 sm:pt-0.5">{label}</span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** "Changed" in the warning wash, beside a field that differs from its default. */
export function ChangedMark({ label = 'Changed' }: { label?: string }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[3px] bg-warning-wash px-1.5 text-[11px] font-semibold text-ink">
      {label}
    </span>
  )
}

/** The default under a changed field, with the button that puts it back. */
function DefaultLine({ text, onUse }: { text: string; onUse: () => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-start gap-x-2 gap-y-1 text-[12px] leading-snug text-muted">
      <span className="min-w-0 flex-1 basis-60">
        Default: <span className="text-ink-2">{text}</span>
      </span>
      <button
        type="button"
        onClick={onUse}
        className="shrink-0 rounded-[2px] font-medium text-link underline-offset-2 hover:underline"
      >
        Use default
      </button>
    </div>
  )
}

/**
 * Focus follows the editor: into it when it opens, back to its Edit button when it closes (after
 * the commit, so it works whether or not the page is painting).
 */
function useFocusSwap(
  editing: boolean,
  editRef: RefObject<HTMLButtonElement | null>,
  focusEditor: () => void,
) {
  const was = useRef(editing)
  const focusIn = useEffectEvent(focusEditor)
  useEffect(() => {
    if (editing && !was.current) focusIn()
    else if (!editing && was.current) editRef.current?.focus()
    was.current = editing
  }, [editing, editRef])
}

const TEXT_LABEL: Record<TextField, string> = {
  definition: 'Definition',
  formula: 'Formula',
  population: 'Population',
  owner: 'Owner',
}

const EMPTY_TEXT: Record<TextField, string> = {
  definition: 'No definition',
  formula: 'No formula written',
  population: 'Not stated',
  owner: 'No owner named',
}

/** Save on Ctrl+Enter (Cmd+Enter), cancel on Escape. */
function editKeys(save: () => void, cancel: () => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save()
    }
  }
}

export function EditableText({
  def,
  base,
  field,
  changed,
  apply,
}: {
  /** The metric with your wording. */
  def: MetricDef
  /** The metric as registered. */
  base: MetricDef
  field: TextField
  changed: boolean
  apply: (value: string, done: string) => string | null
}) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const value = def[field] ?? ''
  const label = TEXT_LABEL[field]
  const single = field === 'owner'

  useFocusSwap(editing, editRef, () => {
    const el = boxRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })

  const open = () => {
    setDraft(value)
    setError(null)
    setEditing(true)
  }
  const close = () => {
    setEditing(false)
    setError(null)
  }
  const save = () => {
    const err = apply(draft, `${label} saved`)
    if (err) setError(err)
    else close()
  }

  return (
    <FieldRow label={label} labelFor={editing ? `${id}-box` : undefined}>
      {editing ? (
        <div>
          <textarea
            ref={boxRef}
            id={`${id}-box`}
            value={draft}
            rows={single ? 1 : field === 'definition' ? 4 : 2}
            aria-invalid={!!error}
            aria-describedby={`${id}-hint`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // One line: Enter saves.
              if (single && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                save()
              } else editKeys(save, close)(e)
            }}
            className={cx(INPUT, 'resize-y leading-snug', field === 'formula' && 'font-mono text-[12px]')}
          />
          <p id={`${id}-hint`} className={cx('mt-1 text-[12px]', error ? 'text-bad-text' : 'text-muted')}>
            {error ??
              (field === 'definition'
                ? 'Plain sentences, sentence case. Ctrl+Enter saves, Escape cancels.'
                : 'Leave it empty to clear it. Ctrl+Enter saves, Escape cancels.')}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-2">
            <p
              className={cx(
                'min-w-0 flex-1 text-[13px] leading-snug whitespace-pre-line',
                value ? 'text-ink' : 'text-muted',
                field === 'formula' && value && 'font-mono text-[12px]',
              )}
            >
              {value || EMPTY_TEXT[field]}
            </p>
            {changed && <ChangedMark />}
            {base.locked ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted">
                <IconLock className="size-3" /> Locked
              </span>
            ) : (
              <Button
                ref={editRef}
                size="sm"
                variant="ghost"
                icon={<IconPencil className="size-3.5" />}
                className="-mt-1 -mr-2 shrink-0"
                aria-label={`Edit ${label.toLowerCase()} of ${def.name}`}
                onClick={open}
              >
                Edit
              </Button>
            )}
          </div>
          {changed && (
            <DefaultLine
              text={base[field] || EMPTY_TEXT[field]}
              onUse={() => {
                const err = apply(base[field] ?? '', `${label} back to its default`)
                if (err) setError(err)
              }}
            />
          )}
          {error && <p className="mt-1 text-[12px] text-bad-text">{error}</p>}
        </div>
      )}
    </FieldRow>
  )
}

const RULE_LABEL: Record<TargetRule, string> = {
  none: 'No target',
  '>=': 'At least',
  '<=': 'At most',
  '<': 'Under',
}

export function TargetField({
  def,
  base,
  target,
  changed,
  apply,
}: {
  def: MetricDef
  base: MetricDef
  /** The target in force. */
  target: MetricTarget | null
  changed: boolean
  apply: (value: MetricTarget | null, done: string) => string | null
}) {
  const [editing, setEditing] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<TargetDraft>(() => targetDraft(def, target))
  const [error, setError] = useState<string | null>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const unit = targetUnit(def)
  const parsed = parseTargetDraft(def, draft)

  useFocusSwap(editing, editRef, () => formRef.current?.querySelector<HTMLSelectElement>('select')?.focus())

  // A required target (HR ops service levels) keeps its direction and can't be removed; "under"
  // is offered only where the target is registered that way.
  const fixedRule = base.targetRequired ? (base.target?.comparator ?? null) : null
  const rules: TargetRule[] = fixedRule
    ? [fixedRule]
    : ['none', '>=', '<=', ...(base.target?.comparator === '<' ? (['<'] as const) : [])]
  const open = () => {
    const d = targetDraft(def, target)
    // A new target starts in the metric's good direction: "at most" when lower is better.
    setDraft(d.rule === 'none' ? { rule: fixedRule ?? defaultComparator(def), text: '' } : d)
    setError(null)
    setEditing(true)
  }
  const close = () => {
    setEditing(false)
    setError(null)
  }
  const save = () => {
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const done = parsed.value
      ? `Target set to ${targetText(def, parsed.value).toLowerCase()}`
      : 'Target removed'
    const err = apply(parsed.value, done)
    if (err) setError(err)
    else close()
  }
  const direction =
    def.goodDirection === 'up'
      ? 'Higher is better.'
      : def.goodDirection === 'down'
        ? 'Lower is better.'
        : null
  const warning = parsed.ok ? targetDirectionWarning(def, parsed.value) : null

  return (
    <FieldRow label="Target">
      {editing ? (
        <div ref={formRef}>
          <div className="flex flex-wrap items-center gap-2">
            {fixedRule ? (
              <span className="text-[13px] text-ink">{comparatorText(fixedRule)}</span>
            ) : (
              <Select
                label={`Target rule for ${def.name}`}
                value={draft.rule}
                onChange={(v) => setDraft({ ...draft, rule: v as TargetRule })}
                className="w-[120px]"
              >
                {rules.map((r) => (
                  <option key={r} value={r}>
                    {RULE_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}
            {draft.rule !== 'none' && (
              <span className="flex items-center gap-1.5">
                <input
                  value={draft.text}
                  inputMode="decimal"
                  aria-label={`Target value${unit ? `, in ${unit === '%' ? 'percent' : unit}` : ''}`}
                  aria-invalid={!!error}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      save()
                    } else editKeys(save, close)(e)
                  }}
                  className={cx(INPUT_BOX, 'tnum h-7 w-[96px] py-0 text-right')}
                />
                {unit && <span className="text-[12px] text-muted">{unit}</span>}
              </span>
            )}
          </div>
          <p className={cx('mt-1 text-[12px]', error ? 'text-bad-text' : 'text-muted')} role="status">
            {error ?? [direction, targetHint(base)].filter(Boolean).join(' ')}
          </p>
          {!error && warning && (
            <p className="mt-1 text-[12px] text-ink-2">
              <span className="font-medium">Check the direction.</span> {warning}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-2">
            <p className={cx('min-w-0 flex-1 text-[13px] leading-snug', target ? 'text-ink' : 'text-muted')}>
              {targetText(def, target)}
              {target && direction && <span className="text-muted"> · {direction}</span>}
              {targetDirectionWarning(def, target) && (
                <span className="block text-[12px] text-ink-2">{targetDirectionWarning(def, target)}</span>
              )}
            </p>
            {changed && <ChangedMark />}
            {base.locked ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted">
                <IconLock className="size-3" /> Locked
              </span>
            ) : (
              <Button
                ref={editRef}
                size="sm"
                variant="ghost"
                icon={<IconPencil className="size-3.5" />}
                className="-mt-1 -mr-2 shrink-0"
                aria-label={`${target ? 'Edit' : 'Set'} the target of ${def.name}`}
                onClick={open}
              >
                {target ? 'Edit' : 'Set'}
              </Button>
            )}
          </div>
          {changed && (
            <DefaultLine
              text={targetText(base, base.target ?? null)}
              onUse={() => {
                const err = apply(base.target ?? null, 'Target back to its default')
                if (err) setError(err)
              }}
            />
          )}
          {error && <p className="mt-1 text-[12px] text-bad-text">{error}</p>}
        </div>
      )}
    </FieldRow>
  )
}

/** What a target does for this metric, in one sentence. */
function targetHint(def: Pick<MetricDef, 'targetRequired'>): string {
  return def.targetRequired
    ? 'Its status marks, target lines and readout are calculated with this target.'
    : 'Its key figure tiles show whether the value meets the target.'
}

/** Read-only facts of the definition sheet: window, unit, good direction. */
export function StaticRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FieldRow label={label}>
      <p className="text-[13px] leading-snug text-ink">{children}</p>
    </FieldRow>
  )
}
