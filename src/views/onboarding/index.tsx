/**
 * Onboarding (docs/VIEWS.md, Onboarding): who starts in the next 90 days, whether each of them
 * will be ready on day one, whether hiring is on plan, and how the first 90 days are going.
 * For TA and people operations leads, and the HRBPs of hiring managers.
 */
import type { ViewDef } from '../types'
import { actions, headline, summary } from './engine'
import { First90Tab } from './ui/First90Tab'
import { PlanTab } from './ui/PlanTab'
import { UpcomingTab } from './ui/UpcomingTab'

function View({ tab }: { tab: string }) {
  switch (tab) {
    case 'first90':
      return <First90Tab />
    case 'plan':
      return <PlanTab />
    default:
      return <UpcomingTab />
  }
}

export const view: ViewDef = {
  key: 'onboarding',
  label: 'Onboarding',
  tabs: [
    { key: 'upcoming', label: 'Upcoming starts' },
    { key: 'first90', label: 'First 90 days' },
    { key: 'plan', label: 'Hiring plan' },
  ],
  View,
  headline,
  datasets: [
    'employees',
    'requisitions',
    'candidates',
    'transactions',
    'learning',
    'jobChanges',
    'hiringPlan',
    'onboardingTasks',
    'surveyResponses',
    'surveyItems',
  ],
  summary,
  actions,
}
