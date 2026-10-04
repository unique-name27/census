/**
 * Compensation header controls: the "Show pay amounts" switch (app-wide, store.showPay; Settings →
 * Privacy holds the same switch) and the "Cycle settings" button. The merit budget, healthy band,
 * merit guideline and every other Compensation threshold are settings in the metric dictionary,
 * so the button opens Metric definitions filtered to Compensation (docs/METRICS.md).
 */
import { Button, Switch } from '@/components'
import { useCensus } from '@/data/store'
import { openMetricDefinitions } from '@/views/data/metrics/open'

export function CompHeaderActions() {
  const showPay = useCensus((s) => s.showPay)
  const setShowPay = useCensus((s) => s.setShowPay)
  return (
    <>
      {/* Short labels on phones keep the header actions inside a 375px screen. */}
      <Switch
        checked={showPay}
        onChange={setShowPay}
        label={
          <span>
            Show pay<span className="max-sm:hidden"> amounts</span>
          </span>
        }
      />
      <Button
        size="md"
        variant="secondary"
        aria-label="Cycle settings, in Metric definitions"
        onClick={() => openMetricDefinitions({ view: 'comp' })}
      >
        <span className="max-sm:hidden">Cycle settings</span>
        <span className="sm:hidden">Settings</span>
      </Button>
    </>
  )
}
