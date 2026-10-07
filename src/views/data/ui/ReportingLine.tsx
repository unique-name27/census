/**
 * One line under the Data room header: the reporting date every window ends on, and whether the
 * Data room's downloads include pay amounts. Both are read-only here; each has one home in
 * Settings, and "Change in Settings" opens it.
 */
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { openSettings, useCensus } from '@/data/store'
import { formatDate } from '@/lib/dates'

export function ReportingLine({ className }: { className?: string }) {
  const ctx = useAnalytics()
  const override = useCensus((s) => s.asOfOverride)
  const showPay = useCensus((s) => s.showPay)
  const basis = override
    ? 'set by you'
    : ctx.isSample
      ? 'the sample company’s reporting date'
      : 'the latest date in your data, up to today'
  return (
    <div
      className={cx(
        'col-span-full flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sheet bg-sheet px-4 py-2.5',
        className,
      )}
    >
      <p className="flex min-w-0 flex-1 basis-[360px] flex-wrap items-center gap-x-2 gap-y-1 text-small">
        <span className="font-medium text-ink-2">Reporting date:</span>
        <span>
          <span className="font-semibold">{formatDate(ctx.asOf)}</span>
          <span className="text-ink-2">, {basis}. Windows such as the last 12 months end here.</span>
        </span>
        <Button size="sm" variant="ghost" className="-ml-1" onClick={() => openSettings('data')}>
          Change in Settings
        </Button>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
        <span className="font-medium text-ink-2">Pay amounts:</span>
        <span className="text-ink-2">
          {showPay ? 'Shown and exported for this session' : 'Hidden and left out of downloads'}
        </span>
        <Button size="sm" variant="ghost" className="-ml-1" onClick={() => openSettings('privacy')}>
          Change in Settings
        </Button>
      </p>
    </div>
  )
}
