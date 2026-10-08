/**
 * Settings → Privacy: pay amounts and immigration details, for this session only, and whether
 * the engagement and eNPS surveys show in Listening (remembered on this device).
 *
 * Per mode (docs/ROLES-V2.md 4.6): HR, CHRO and Developer show all three. Where the section is
 * limited it holds only the switches the mode has: Compensation the pay amounts switch, HR ops the
 * immigration switch. The engagement surveys switch stays with the full section; in the other
 * modes Listening follows the saved switch.
 */
import { showImmigrationIn } from '@/access/pay'
import { Switch } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { Field, SettingsBlock } from './ui'

export function PrivacySection() {
  const showPay = useCensus((s) => s.showPay)
  const setShowPay = useCensus((s) => s.setShowPay)
  const showImmigration = useCensus((s) => s.showImmigration)
  const setShowImmigration = useCensus((s) => s.setShowImmigration)
  const engagement = useCensus((s) => s.engagementSurveys)
  const setEngagement = useCensus((s) => s.setEngagementSurveys)
  const { access } = useAnalytics()
  const full = access.decide('settings:privacy').access === 'shown'
  const pay = access.can('pay:switch')
  const immigration = showImmigrationIn(access.mode, true)
  return (
    <SettingsBlock section="privacy">
      {pay && (
        <Field
          label="Pay amounts"
          hint="Salary, range, market and merit amounts in every view and download. Ratios such as compa-ratio are always shown. This lasts for this session only: amounts are hidden again the next time Census opens."
        >
          <Switch checked={showPay} onChange={setShowPay} label="Show pay amounts for this session" />
        </Field>
      )}
      {immigration && (
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
      )}
      {full && (
        <Field
          label="Engagement surveys"
          hint="Engagement and eNPS results in Listening, grouped like every survey. Off unless you turn it on; remembered on this device."
        >
          <Switch
            checked={engagement}
            onChange={setEngagement}
            label="Show engagement and eNPS in Listening"
          />
        </Field>
      )}
    </SettingsBlock>
  )
}
