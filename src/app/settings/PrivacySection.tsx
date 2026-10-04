/**
 * Settings → Privacy: pay amounts and immigration details, for this session only, and whether
 * the engagement and eNPS surveys show in Listening (remembered on this device).
 */
import { Switch } from '@/components/ui'
import { useCensus } from '@/data/store'
import { Field, SettingsBlock } from './ui'

export function PrivacySection() {
  const showPay = useCensus((s) => s.showPay)
  const setShowPay = useCensus((s) => s.setShowPay)
  const showImmigration = useCensus((s) => s.showImmigration)
  const setShowImmigration = useCensus((s) => s.setShowImmigration)
  const engagement = useCensus((s) => s.engagementSurveys)
  const setEngagement = useCensus((s) => s.setEngagementSurveys)
  return (
    <SettingsBlock section="privacy">
      <Field
        label="Pay amounts"
        hint="Salary, range, market and merit amounts in every view and download. Ratios such as compa-ratio are always shown. This lasts for this session only: amounts are hidden again the next time Census opens."
      >
        <Switch checked={showPay} onChange={setShowPay} label="Show pay amounts for this session" />
      </Field>
      <Field
        label="Immigration details"
        hint="Each person's work authorization type in Compliance tables, drill-downs and downloads; counts by type always show. This lasts for this session only."
      >
        <Switch
          checked={showImmigration}
          onChange={setShowImmigration}
          label="Show immigration details for this session"
        />
      </Field>
      <Field
        label="Engagement surveys"
        hint="Engagement and eNPS results in Listening, grouped like every survey. Off unless you turn it on; remembered on this device."
      >
        <Switch checked={engagement} onChange={setEngagement} label="Show engagement and eNPS in Listening" />
      </Field>
    </SettingsBlock>
  )
}
