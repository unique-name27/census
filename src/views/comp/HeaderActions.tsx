/**
 * Compensation header controls: the "Show pay amounts" switch (app-wide, store.showPay; Settings →
 * Privacy holds the same switch) and the "Cycle settings" button. The merit budget, healthy band,
 * merit guideline and every other Compensation threshold are settings in the metric dictionary,
 * so the button opens Metric definitions filtered to Compensation (docs/METRICS.md). In a mode
 * without the Data room (Compensation) it opens Settings > Compensation cycle, where the cycle's
 * dates are set and the other settings show.
 */
import { Button, Switch } from '@/components'
import { useAnalytics } from '@/data/context'
import { openSettings, useCensus } from '@/data/store'
import { openMetricDefinitions } from '@/views/data/metrics/open'

export function CompHeaderActions() {
  const showPay = useCensus((s) => s.showPay)
  const setShowPay = useCensus((s) => s.setShowPay)
  const dataRoom = useAnalytics().access.can('page:data')
  return (
    <>
      {/* Short labels on phones keep the header actions inside a 375px screen. */}
      <span data-tour="comp-pay-switch" className="inline-flex">
        <Switch
          checked={showPay}
          onChange={setShowPay}
          label={
            <span>
              Show pay<span className="max-sm:hidden"> amounts</span>
            </span>
          }
        />
      </span>
      <Button
        size="md"
        data-tour="comp-cycle-settings"
        variant="secondary"
        aria-label={dataRoom ? 'Cycle settings, in Metric definitions' : 'Cycle settings, in Settings'}
        onClick={() => (dataRoom ? openMetricDefinitions({ view: 'comp' }) : openSettings('compensation'))}
      >
        <span className="max-sm:hidden">Cycle settings</span>
        <span className="sm:hidden">Settings</span>
      </Button>
    </>
  )
}
