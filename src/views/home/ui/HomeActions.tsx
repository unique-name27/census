/**
 * The Home view's header actions (docs/ROLES-V2.md 5.1): the CHRO's and both HRBP homes carry the
 * Scorecard's "Monthly people report" (for the HRBP's scope, as the context on screen is). Every
 * home has the view Export menu, which the shell draws.
 */
import { useAnalytics } from '@/data/context'
import { ReportMenu } from '@/views/scorecard/ui/ReportMenu'

export function HomeActions() {
  const { access } = useAnalytics()
  const report = access.mode === 'chro' || access.mode === 'hrbp-unit' || access.mode === 'hrbp-region'
  if (!report || access.unset || !access.can('export:monthly-report')) return null
  return <ReportMenu />
}
