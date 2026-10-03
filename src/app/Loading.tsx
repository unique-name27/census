/**
 * First frame while the datasets load: the real band and folder tabs with placeholder numbers, and
 * blank sheets where the KPI strip, readout and lead figure will land, so nothing jumps.
 */
import { cx } from '@/components/ui'
import { VIEWS } from '@/views/registry'
import { Mark } from './Mark'

const BLOCK = 'rounded-[3px] bg-sheet-3'

export function LoadingShell() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <header className="band">
        <div className="mx-auto max-w-[1440px] px-(--gutter)">
          <div className="flex h-[52px] items-center gap-2 pt-1">
            <Mark working />
            <span className="cut-head text-[18px] leading-none font-bold tracking-[-0.02em]">Census</span>
          </div>
          <div
            aria-hidden="true"
            className="-mx-(--gutter) flex items-end gap-1.5 overflow-hidden px-(--gutter) pt-1"
          >
            {VIEWS.map((v, i) => (
              <div
                key={v.key}
                className={cx(
                  'flex w-[184px] shrink-0 flex-col rounded-t-[6px] px-3.5 pt-2.5 pb-3',
                  i === 0 ? 'on-desk bg-page' : 'mt-1 bg-tab-idle',
                )}
              >
                <span className="cut-tab truncate text-[13px] leading-tight font-semibold text-ink-2">
                  {v.label}
                </span>
                <span className={cx(BLOCK, 'mt-2 h-[21px] w-16')} />
                <span className={cx(BLOCK, 'mt-1 h-3 w-24')} />
              </div>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-[1440px] px-(--gutter) pb-16">
          <p role="status" className="pt-6 text-[13px] text-ink-2">
            Preparing the data. Nothing leaves this browser.
          </p>
          <div aria-hidden="true" className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="h-[116px] rounded-sheet bg-sheet md:col-span-12" />
            <div className="h-72 rounded-sheet bg-sheet md:col-span-12 lg:col-span-4" />
            <div className="h-72 rounded-sheet bg-sheet md:col-span-12 lg:col-span-8" />
          </div>
        </div>
      </main>
    </div>
  )
}
