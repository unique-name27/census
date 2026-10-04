/** Settings → Privacy: pay amounts, for this session only. */
import { Switch } from '@/components/ui'
import { useCensus } from '@/data/store'
import { Field, SettingsBlock } from './ui'

export function PrivacySection() {
  const showPay = useCensus((s) => s.showPay)
  const setShowPay = useCensus((s) => s.setShowPay)
  return (
    <SettingsBlock section="privacy">
      <Field
        label="Pay amounts"
        hint="Salary, range, market and merit amounts in every view and download. Ratios such as compa-ratio are always shown. This lasts for this session only: amounts are hidden again the next time Census opens."
      >
        <Switch checked={showPay} onChange={setShowPay} label="Show pay amounts for this session" />
      </Field>
    </SettingsBlock>
  )
}
