/**
 * The Compensation cycle settings form: merit budget, healthy compa-ratio band and merit
 * guideline by rating. It edits a text draft and applies it to Settings → Compensation cycle,
 * so the settings sheet can show it as that section.
 */
import { useState } from 'react'
import { Button, toast } from '@/components'
import { RATING_LABELS } from '@/data/schema'
import { DEFAULT_SETTINGS, RATINGS, sameSettings } from './engine/settings'
import { type Draft, parseDraft, toDraft } from './settingsDraft'
import { setCycleSettings, useCycleSettings } from './settingsStore'

const INPUT =
  'tnum h-7 w-[68px] min-w-0 rounded-control bg-sheet px-2 text-right text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--critical)]'

function Field({
  id,
  label,
  value,
  onChange,
  invalid,
  unit,
  step,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  invalid: boolean
  unit?: string
  step: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label htmlFor={id} className="text-[13px] text-ink-2">
        {label}
      </label>
      <span className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        />
        <span className="w-3 text-[12px] text-muted">{unit}</span>
      </span>
    </div>
  )
}

/** The cycle settings form: edits a draft, applies it to Settings. */
export function CycleSettingsForm({ onApplied }: { onApplied?: () => void }) {
  const settings = useCycleSettings()
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings))
  const parsed = parseDraft(draft)
  const error = 'error' in parsed ? parsed : null
  const isDefault = 'settings' in parsed && sameSettings(parsed.settings, DEFAULT_SETTINGS)

  const apply = () => {
    if (!('settings' in parsed)) return
    setCycleSettings(parsed.settings)
    toast('Cycle settings applied', { description: 'Saved in this browser.' })
    onApplied?.()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <p className="mb-2 text-[12px] leading-snug text-ink-2">
        Used for merit spend, the healthy band and the guideline checks. Saved in this browser only.
      </p>
      <Field
        id="comp-budget"
        label="Merit budget, % of eligible base"
        value={draft.budget}
        unit="%"
        step="0.1"
        invalid={error?.field === 'budget'}
        onChange={(v) => setDraft({ ...draft, budget: v })}
      />
      <fieldset className="mt-1 flex items-center justify-between gap-3 border-t border-rule py-1 pt-2">
        <legend className="float-left text-[13px] text-ink-2">Healthy compa-ratio band</legend>
        <span className="flex items-center gap-1.5">
          <input
            aria-label="Band low end"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={draft.low}
            aria-invalid={error?.field === 'low'}
            onChange={(e) => setDraft({ ...draft, low: e.target.value })}
            className={INPUT}
          />
          <span className="text-[12px] text-muted">to</span>
          <input
            aria-label="Band high end"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={draft.high}
            aria-invalid={error?.field === 'high'}
            onChange={(e) => setDraft({ ...draft, high: e.target.value })}
            className={INPUT}
          />
        </span>
      </fieldset>
      <fieldset className="mt-1 border-t border-rule pt-2">
        <legend className="eyebrow float-left mb-1 w-full">Merit guideline by rating</legend>
        {RATINGS.map((r) => (
          <Field
            key={r}
            id={`comp-guideline-${r}`}
            label={`${r} ${RATING_LABELS[r]}`}
            value={draft.guideline[r]}
            unit="%"
            step="0.1"
            invalid={error?.field === `g${r}`}
            onChange={(v) => setDraft({ ...draft, guideline: { ...draft.guideline, [r]: v } })}
          />
        ))}
      </fieldset>
      <div className="mt-2 min-h-4 text-[12px] text-bad-text" role="status">
        {error?.error}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-rule pt-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={isDefault}
          onClick={() => setDraft(toDraft(DEFAULT_SETTINGS))}
        >
          Use defaults
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!!error}>
          Apply
        </Button>
      </div>
    </form>
  )
}
