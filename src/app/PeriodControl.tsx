/**
 * Reporting period: presets as rows (each with the exact dates it covers) and a custom range with
 * two native date inputs behind a hairline.
 */
import { Popover } from '@base-ui/react/popover'
import { useState } from 'react'
import { IconCheck } from '@/components/icons'
import { POPUP_SURFACE } from '@/components/styles'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { PERIOD_LABELS, type PeriodPreset, periodWindows } from '@/data/scope'
import { useCensus } from '@/data/store'
import { customRangeError, shortRange } from './filterOptions'

const PRESETS: PeriodPreset[] = ['t12m', 'ytd', 'lastQuarter', 't6m', 't3m']

const DATE_INPUT =
  'h-8 w-full min-w-0 rounded-control bg-sheet px-2 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]'

export function PeriodControl() {
  const ctx = useAnalytics()
  const filters = useCensus((s) => s.filters)
  const setFilters = useCensus((s) => s.setFilters)
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState({ start: ctx.window.start, end: ctx.window.end, editing: false })
  const error = customRangeError(custom.start, custom.end)
  const isCustom = filters.period === 'custom'
  const showCustom = isCustom || custom.editing

  const onOpenChange = (next: boolean) => {
    if (next) setCustom({ start: ctx.window.start, end: ctx.window.end, editing: false })
    setOpen(next)
  }
  const pick = (p: PeriodPreset) => {
    setFilters({ period: p })
    setOpen(false)
  }
  const apply = () => {
    if (error) return
    setFilters({ period: 'custom', customStart: custom.start, customEnd: custom.end })
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <Button caret aria-label={`Period: ${isCustom ? ctx.window.label : PERIOD_LABELS[filters.period]}`}>
            {isCustom ? ctx.window.label : PERIOD_LABELS[filters.period]}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6} className="z-50 outline-none">
          <Popover.Popup className={cx(POPUP_SURFACE, 'w-[300px] max-w-[calc(100vw-32px)] py-1')}>
            <Popover.Title className="eyebrow px-3 pt-2 pb-1">Reporting period</Popover.Title>
            <ul aria-label="Reporting period">
              {[...PRESETS, 'custom' as const].map((p) => {
                const checked = p === 'custom' ? showCustom : !showCustom && filters.period === p
                const w = p === 'custom' ? null : periodWindows(p, ctx.asOf).current
                return (
                  <li key={p}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() => (p === 'custom' ? setCustom({ ...custom, editing: true }) : pick(p))}
                      className="mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                    >
                      <span className="flex w-4 shrink-0 justify-center">
                        {checked && <IconCheck className="size-4" strokeWidth={2.25} />}
                      </span>
                      <span className={cx('flex-1', checked && 'font-semibold')}>{PERIOD_LABELS[p]}</span>
                      {w && <span className="tnum text-[11px] text-muted">{shortRange(w.start, w.end)}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            {showCustom && (
              <div className="mt-1 border-t border-rule px-3 pt-2.5 pb-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[12px] text-ink-2">
                    From
                    <input
                      type="date"
                      value={custom.start}
                      max={custom.end || undefined}
                      onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                      className={cx(DATE_INPUT, 'mt-1')}
                    />
                  </label>
                  <label className="text-[12px] text-ink-2">
                    To
                    <input
                      type="date"
                      value={custom.end}
                      min={custom.start || undefined}
                      onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                      className={cx(DATE_INPUT, 'mt-1')}
                    />
                  </label>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span role="status" className="text-[12px] text-bad-text">
                    {error}
                  </span>
                  <Button size="sm" variant="primary" disabled={!!error} onClick={apply}>
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
