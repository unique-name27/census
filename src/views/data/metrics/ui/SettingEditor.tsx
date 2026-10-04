/**
 * One calculation setting, edited in place: the input fits its type (a number with its unit, a
 * switch, a choice, five ratings, a low and a high end), is checked against the setting's
 * definition as you type, and applies with Apply (switches and choices apply at once). Locked
 * settings show their value; the anonymity minimum takes only values at or above its floor.
 */
import { type ReactNode, useId, useState } from 'react'
import { IconLock } from '@/components/icons'
import { Button, cx, Switch } from '@/components/ui'
import { RATING_LABELS } from '@/data/schema'
import { allowedText, formatParam, parseParamInput, RATING_KEYS, sameParam } from '@/metrics/params'
import type { ParamDef, ParamValue, RatingKey } from '@/metrics/types'
import { Select } from '../../ui/Select'
import { draftValue, inputUnit, type SettingDraft, settingDraft } from '../model'
import { ChangedMark, INPUT_BOX } from './fields'

const NUM = cx(INPUT_BOX, 'tnum h-7 w-[84px] py-0 text-right')

function NumberBox({
  value,
  onChange,
  label,
  unit,
  invalid,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  unit: string
  invalid: boolean
  onEnter: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        value={value}
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnter()
          }
        }}
        className={NUM}
      />
      {unit && <span className="text-[12px] text-muted">{unit}</span>}
    </span>
  )
}

export function SettingEditor({
  metricName,
  param,
  current,
  changed,
  apply,
}: {
  metricName: string
  param: ParamDef
  /** The value in force. */
  current: ParamValue
  changed: boolean
  /** Apply a validated value; returns the reason it was refused, or null. */
  apply: (value: ParamValue, done: string) => string | null
}) {
  const id = useId()
  const [initial] = useState(() => settingDraft(param, current))
  const [draft, setDraft] = useState<SettingDraft>(initial)
  const [refused, setRefused] = useState<string | null>(null)
  const unit = inputUnit(param)
  const check = parseParamInput(param, draftValue(param, draft))
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const error = refused ?? (dirty && !check.ok ? check.error : null)
  const canApply = dirty && check.ok && !sameParam(check.value, current)
  const locked = param.locked === true

  const done = (v: ParamValue) => `${param.label} set to ${formatParam(param, v)}`
  const save = (value?: ParamValue) => {
    const v = value ?? (check.ok ? check.value : undefined)
    if (v === undefined) return
    const err = apply(v, done(v))
    setRefused(err)
  }
  const restoreDefault = () => {
    const err = apply(
      param.default,
      `${param.label} back to its default, ${formatParam(param, param.default)}`,
    )
    setRefused(err)
  }

  let control: ReactNode
  if (locked)
    control = (
      <p className="flex items-center gap-1.5 text-[13px] text-ink">
        {formatParam(param, current)}
        <span className="inline-flex items-center gap-1 text-[12px] text-muted">
          <IconLock className="size-3" /> Locked
        </span>
      </p>
    )
  else if (draft.kind === 'flag')
    control = (
      <Switch
        checked={draft.value}
        onChange={(v) => {
          setDraft({ kind: 'flag', value: v })
          save(v)
        }}
        label={
          // The switch is named by the setting; On or Off is its visible state.
          <>
            <span className="sr-only">{param.label}</span>
            <span aria-hidden="true">{draft.value ? 'On' : 'Off'}</span>
          </>
        }
      />
    )
  else if (param.type === 'choice' && draft.kind === 'text')
    control = (
      <Select
        label={`${param.label} for ${metricName}`}
        value={draft.text}
        onChange={(v) => {
          setDraft({ kind: 'text', text: v })
          save(v)
        }}
        className="w-full max-w-[340px]"
      >
        {(param.choices ?? []).map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
    )
  else if (draft.kind === 'ratings')
    control = (
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        {RATING_KEYS.map((k: RatingKey) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted">
              {k} {RATING_LABELS[k]}
            </span>
            <NumberBox
              value={draft.values[k]}
              label={`${param.label}, rating ${k} ${RATING_LABELS[k]}`}
              unit={unit}
              invalid={!!error}
              onChange={(v) => setDraft({ kind: 'ratings', values: { ...draft.values, [k]: v } })}
              onEnter={() => canApply && save()}
            />
          </div>
        ))}
      </div>
    )
  else if (draft.kind === 'range')
    control = (
      <span className="inline-flex flex-wrap items-center gap-2">
        <NumberBox
          value={draft.values[0]}
          label={`${param.label}, low end`}
          unit={unit}
          invalid={!!error}
          onChange={(v) => setDraft({ kind: 'range', values: [v, draft.values[1]] })}
          onEnter={() => canApply && save()}
        />
        <span className="text-[12px] text-muted">to</span>
        <NumberBox
          value={draft.values[1]}
          label={`${param.label}, high end`}
          unit={unit}
          invalid={!!error}
          onChange={(v) => setDraft({ kind: 'range', values: [draft.values[0], v] })}
          onEnter={() => canApply && save()}
        />
      </span>
    )
  else if (draft.kind === 'text')
    control = (
      <NumberBox
        value={draft.text}
        label={`${param.label} for ${metricName}`}
        unit={unit}
        invalid={!!error}
        onChange={(v) => setDraft({ kind: 'text', text: v })}
        onEnter={() => canApply && save()}
      />
    )

  const applies = !locked && draft.kind !== 'flag' && param.type !== 'choice'

  return (
    <fieldset
      className="min-w-0 border-t border-rule py-3 first:border-t-0 first:pt-0"
      aria-labelledby={`${id}-label`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p id={`${id}-label`} className="text-[13px] font-semibold text-ink">
            {param.label}
          </p>
          <p className="mt-0.5 max-w-[62ch] text-[12px] leading-snug text-ink-2">{param.description}</p>
        </div>
        {changed && <ChangedMark />}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {control}
        {applies && (
          <span className="flex gap-1.5">
            <Button
              size="sm"
              variant={canApply ? 'primary' : 'secondary'}
              disabled={!canApply}
              onClick={() => save()}
            >
              Apply
            </Button>
            {dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(initial)
                  setRefused(null)
                }}
              >
                Cancel
              </Button>
            )}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1 text-[12px] text-bad-text" role="alert">
          {error}
        </p>
      )}
      <p className="mt-1.5 flex flex-wrap items-start gap-x-2 gap-y-0.5 text-[12px] leading-snug text-muted">
        <span>
          Default: <span className="text-ink-2">{formatParam(param, param.default)}</span>
        </span>
        {!locked && (
          <span>
            Allowed: <span className="text-ink-2">{allowedText(param)}</span>
          </span>
        )}
        {changed && !locked && (
          <button
            type="button"
            onClick={restoreDefault}
            className="rounded-[2px] font-medium text-link underline-offset-2 hover:underline"
          >
            Use default
          </button>
        )}
      </p>
    </fieldset>
  )
}
