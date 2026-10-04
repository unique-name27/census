/** Settings → Data: the data standard and the reporting date. */
import { useEffect, useId, useRef, useState } from 'react'
import { MedalGlyph } from '@/components/tier/TierBadge'
import { STANDARD_HINT, tierCounts, tierCountsText } from '@/components/tier/tierModel'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { DATA_STANDARDS, STANDARD_LABEL } from '@/data/quality/tier'
import { EARLIEST_REPORTING_DATE as EARLIEST, isReportingDate } from '@/data/settings'
import { useCensus } from '@/data/store'
import { formatDate, isValidDate, todayISO } from '@/lib/dates'
import { Field, INPUT, SettingsBlock } from './ui'

function StandardChoice() {
  const ctx = useAnalytics()
  const standard = useCensus((s) => s.dataStandard)
  const setStandard = useCensus((s) => s.setDataStandard)
  const name = useId()
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-[13px] font-semibold text-ink">Data standard</legend>
      <p className="-mt-1 mb-1 text-[12px] leading-snug text-muted">
        The lowest tier a number needs to be shown in any view. {tierCountsText(tierCounts(ctx.quality))}.
      </p>
      {DATA_STANDARDS.map((s) => {
        const id = `${name}-${s}`
        const on = s === standard
        return (
          <label
            key={s}
            htmlFor={id}
            className={cx(
              'flex cursor-pointer items-start gap-2.5 rounded-control px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--rule)] hover:bg-hover has-[:focus-visible]:shadow-[inset_0_0_0_2px_var(--focus)]',
              on && 'bg-sheet-2 shadow-[inset_0_0_0_1px_var(--rule-strong)]',
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={s}
              checked={on}
              onChange={() => setStandard(s)}
              className="mt-0.5 size-3.5 shrink-0 accent-(--ink)"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <MedalGlyph tier={s} />
                {STANDARD_LABEL[s]}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{STANDARD_HINT[s]}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

function ReportingDate() {
  const ctx = useAnalytics()
  const override = useCensus((s) => s.asOfOverride)
  const setOverride = useCensus((s) => s.setAsOfOverride)
  const inputId = useId()
  const today = todayISO()
  const [draft, setDraft] = useState(override ?? '')
  const editing = useRef(false)
  // Follow changes made elsewhere (Clear, a settings file) unless the person is typing.
  useEffect(() => {
    if (!editing.current) setDraft(override ?? '')
  }, [override])
  const future = isValidDate(draft) && draft > today
  const apply = (v: string) => {
    if (isReportingDate(v, today) && v !== override) setOverride(v)
  }
  const basis = override
    ? 'Set by you.'
    : ctx.isSample
      ? 'The sample company’s reporting date.'
      : 'The latest date in your data, up to today.'
  return (
    <Field
      label="Reporting date"
      htmlFor={inputId}
      hint={
        <>
          In use: {formatDate(ctx.asOf)}. {basis} Windows such as the last 12 months end on this date.
        </>
      }
    >
      <input
        id={inputId}
        type="date"
        value={draft}
        min={EARLIEST}
        max={today}
        aria-invalid={future || undefined}
        aria-describedby={future ? `${inputId}-error` : undefined}
        onFocus={() => {
          editing.current = true
        }}
        onBlur={() => {
          editing.current = false
          if (!isReportingDate(draft, today)) setDraft(override ?? '')
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          apply(e.target.value)
        }}
        className={cx(INPUT, 'w-44')}
      />
      <Button
        variant="ghost"
        disabled={!override}
        onClick={() => {
          setDraft('')
          setOverride(null)
        }}
      >
        {ctx.isSample ? 'Use the default date' : 'Use the latest date'}
      </Button>
      {future && (
        <p id={`${inputId}-error`} className="w-full text-[12px] text-bad-text">
          Pick a date on or before today, {formatDate(today)}.
        </p>
      )}
    </Field>
  )
}

export function DataSection() {
  return (
    <SettingsBlock section="data">
      <StandardChoice />
      <ReportingDate />
    </SettingsBlock>
  )
}
