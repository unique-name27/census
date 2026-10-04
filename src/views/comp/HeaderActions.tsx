/**
 * Compensation header controls: the "Show pay amounts" switch (app-wide, store.showPay; Settings →
 * Privacy holds the same switch) and the "Cycle settings" button, which opens Settings at the
 * Compensation cycle section.
 */
import { Button, Switch } from '@/components'
import { openSettings, useCensus } from '@/data/store'

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
        aria-label="Cycle settings"
        aria-haspopup="dialog"
        onClick={() => openSettings('compensation')}
      >
        <span className="max-sm:hidden">Cycle settings</span>
        <span className="sm:hidden">Settings</span>
      </Button>
    </>
  )
}
