/**
 * The reporting date every window ends on, with an override, and the pay-amounts switch that
 * governs what the Data room's downloads include.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, cx, Switch } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { formatDate, isValidDate, todayISO } from '@/lib/dates'

/** Earliest as-of date accepted, so a year typed digit by digit (0002, 0020 …) is never applied. */
const EARLIEST = '1990-01-01'

const DATE_INPUT =
  'h-8 min-w-0 flex-1 rounded-control bg-sheet px-2 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]'

export function AsOfPanel({ className }: { className?: string }) {
  const ctx = useAnalytics()
  const override = useCensus((s) => s.asOfOverride)
  const setOverride = useCensus((s) => s.setAsOfOverride)
  const showPay = useCensus((s) => s.showPay)
  const setShowPay = useCensus((s) => s.setShowPay)
  const inputId = useId()
  const today = todayISO()
  const [draft, setDraft] = useState(override ?? '')
  const editing = useRef(false)
  // Follow changes made elsewhere (Clear, Reset everything) unless the person is typing.
  useEffect(() => {
    if (!editing.current) setDraft(override ?? '')
  }, [override])
  const future = isValidDate(draft) && draft > today
  const apply = (v: string) => {
    if (isValidDate(v) && v >= EARLIEST && v <= today && v !== override) setOverride(v)
  }
  const basis = override
    ? 'Set by you.'
    : ctx.isSample
      ? 'The sample company’s reporting date.'
      : 'The latest date in your data, up to today.'
  return (
    // Full width until the desktop grid, so a tablet never shows it beside an empty half.
    <div
      className={cx('col-span-full min-w-0 lg:col-span-4', 'flex flex-col rounded-sheet bg-sheet', className)}
    >
      <div className="px-5 pt-4 pb-4">
        <h2 className="eyebrow">Reporting date</h2>
        <p className="cut-head mt-2 text-[28px] leading-none font-[650]">{formatDate(ctx.asOf)}</p>
        <p className="mt-2 text-[13px] text-ink-2">{basis} Windows such as the last 12 months end here.</p>
        <label htmlFor={inputId} className="mt-4 block text-[12px] font-medium text-ink-2">
          As-of date
        </label>
        <div className="mt-1 flex gap-2">
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
              // A half-typed or unusable date goes back to the one in use; Clear removes it.
              if (!isValidDate(draft) || draft < EARLIEST || draft > today) setDraft(override ?? '')
            }}
            onChange={(e) => {
              setDraft(e.target.value)
              apply(e.target.value)
            }}
            className={DATE_INPUT}
          />
          <Button
            variant="ghost"
            disabled={!override}
            onClick={() => {
              setDraft('')
              setOverride(null)
            }}
          >
            Clear
          </Button>
        </div>
        {future && (
          <p id={`${inputId}-error`} className="mt-1.5 text-[12px] text-bad-text">
            Pick a date on or before today, {formatDate(today)}.
          </p>
        )}
      </div>
      <div className="mt-auto border-t border-rule px-5 py-3.5">
        <h2 className="eyebrow mb-2">Pay amounts</h2>
        <Switch checked={showPay} onChange={setShowPay} label="Show and export pay amounts" />
        <p className="mt-1.5 text-[12px] text-muted">
          Salary, range and market amounts in every view and download, including the sample workbook. Ratios
          such as compa-ratio are always shown.
        </p>
      </div>
    </div>
  )
}
