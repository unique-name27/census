/**
 * First frame while the datasets load: the real band and folder tabs (numbers not yet known, so
 * left blank), and the home page's sheets at their final size with their titles: the hero beside
 * the key figures, then the lead sheet beside the findings (`Pending`, docs/DESIGN-REFRESH.md
 * 2.11). One quiet status line, no skeleton blocks, so nothing flashes or jumps.
 */
import { Pending } from '@/components/Pending'
import { cx } from '@/components/ui'
import { VIEWS } from '@/views/registry'
import { Mark } from './Mark'

/** The tabs a first visit shows (My team is Manager mode's own home, not a tab elsewhere). */
const TABS = VIEWS.filter((v) => v.key !== 'team')

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
            {TABS.map((v, i) => (
              <div
                key={v.key}
                className={cx(
                  'flex w-[184px] shrink-0 flex-col rounded-t-sheet px-3.5 pt-2.5 pb-3',
                  i === 0 ? 'on-desk bg-page' : 'mt-1 bg-tab-idle',
                )}
              >
                <span className="cut-tab truncate text-small leading-tight font-semibold text-ink-2">
                  {v.label}
                </span>
                <span className="mt-2 block h-5" />
                <span className="mt-1 block h-4" />
              </div>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-[1440px] px-(--gutter) pb-16">
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-12 max-md:*:col-span-full">
            <Pending
              message="Preparing the data. Nothing leaves this browser."
              frames={[
                // The Scorecard's first sheets at their final 1440 sizes (see ScorecardPage).
                { title: 'Targets met', span: 4, height: 223 },
                { title: 'Key figures', span: 8, height: 223 },
                { title: 'Measures against target', span: 8, height: 973 },
                { title: 'Top findings across Census', span: 4, height: 827 },
              ]}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
