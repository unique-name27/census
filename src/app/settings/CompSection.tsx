/**
 * Settings → Compensation cycle: merit budget, healthy compa-ratio band and merit guideline by
 * rating. The Compensation view reads the same values.
 */
import { useId, useState } from 'react'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'
import { RATING_LABELS } from '@/data/schema'
import { type CompCycleSettings, DEFAULT_COMP_CYCLE, RATING_KEYS } from '@/data/settings'
import { useCensus } from '@/data/store'
import { type CompDraft, parseCompDraft, sameCompCycle, toCompDraft } from './model'
import { INPUT, SettingsBlock } from './ui'

const NUM = cx(INPUT, 'tnum h-7 w-[72px] px-2 text-right')

function NumberRow({
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
          className={NUM}
        />
        <span className="w-3 text-[12px] text-muted">{unit}</span>
      </span>
    </div>
  )
}

function CycleForm({ saved }: { saved: CompCycleSettings }) {
  const setCompCycle = useCensus((s) => s.setCompCycle)
  const base = useId()
  const [draft, setDraft] = useState<CompDraft>(() => toCompDraft(saved))
  const parsed = parseCompDraft(draft)
  const error = parsed.ok ? null : parsed
  const changed = parsed.ok && !sameCompCycle(parsed.settings, saved)
  const isDefault = parsed.ok && sameCompCycle(parsed.settings, DEFAULT_COMP_CYCLE)
  const apply = () => {
    if (!parsed.ok) return
    setCompCycle(parsed.settings)
    toast('Cycle settings applied', { tone: 'good', description: 'Compensation uses them now.' })
  }
  return (
    // parseCompDraft checks the values; the browser's step check would silently block 3.55%.
    <form
      noValidate
      className="max-w-[420px]"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <NumberRow
        id={`${base}-budget`}
        label="Merit budget, % of eligible base"
        value={draft.budget}
        unit="%"
        step="0.1"
        invalid={error?.field === 'budget'}
        onChange={(v) => setDraft({ ...draft, budget: v })}
      />
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset's legend cannot sit in a flex row beside the inputs */}
      <div
        role="group"
        aria-labelledby={`${base}-band`}
        className="mt-1 flex items-center justify-between gap-3 border-t border-rule pt-2 pb-1"
      >
        <span id={`${base}-band`} className="text-[13px] text-ink-2">
          Healthy compa-ratio band
        </span>
        <span className="flex items-center gap-1.5">
          <input
            aria-label="Band low end"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={draft.low}
            aria-invalid={error?.field === 'low'}
            onChange={(e) => setDraft({ ...draft, low: e.target.value })}
            className={NUM}
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
            className={NUM}
          />
          <span className="w-3" />
        </span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a floated legend squeezes the first row to zero width */}
      <div role="group" aria-labelledby={`${base}-guideline`} className="mt-1 border-t border-rule pt-2">
        <p id={`${base}-guideline`} className="eyebrow mb-1">
          Merit guideline by rating
        </p>
        {RATING_KEYS.map((r) => (
          <NumberRow
            key={r}
            id={`${base}-g${r}`}
            label={`${r} ${RATING_LABELS[r]}`}
            value={draft.guideline[r]}
            unit="%"
            step="0.1"
            invalid={error?.field === `g${r}`}
            onChange={(v) => setDraft({ ...draft, guideline: { ...draft.guideline, [r]: v } })}
          />
        ))}
      </div>
      <p className="mt-2 min-h-4 text-[12px] text-bad-text" role="status">
        {error?.error}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" type="submit" disabled={!changed}>
          Apply
        </Button>
        <Button
          variant="ghost"
          disabled={isDefault}
          onClick={() => setDraft(toCompDraft(DEFAULT_COMP_CYCLE))}
        >
          Use defaults
        </Button>
      </div>
    </form>
  )
}

export function CompSection() {
  const saved = useCensus((s) => s.compCycle)
  return (
    <SettingsBlock
      section="compensation"
      intro="Used for merit spend, the healthy band and the guideline checks in Compensation. Saved in this browser."
    >
      {/* A new saved value (Apply, a settings file) starts the form over from it. */}
      <CycleForm key={JSON.stringify(saved)} saved={saved} />
    </SettingsBlock>
  )
}
