/**
 * Listening (docs/VIEWS.md, Listening): every survey program across the employee and candidate
 * lifecycle. Results are grouped, never one person's answers; groups need 5 respondents and
 * manager cuts 10 over four quarters (`surveyMinimumsOf(ctx.metrics)`, `@/lib/surveys`).
 * Engagement and eNPS show only when the engagement surveys switch is on (Settings); its tab is
 * gated with `feature`, so the shell hides it while the switch is off.
 *
 * Other views show one linked survey number through `surveyHeadline` / `surveyKpi` in ./api.
 */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import type { ViewDef } from '../types'
import { compute, headline, summary } from './engine'
import { listeningActions } from './engine/actions'
import { LISTENING_TABS } from './engine/catalog'
import { CandidatesTab } from './ui/CandidatesTab'
import { EngagementTab } from './ui/EngagementTab'
import { ManagersTab } from './ui/ManagersTab'
import { OnboardingTab } from './ui/OnboardingTab'
import { Overview } from './ui/Overview'
import { ServicesTab } from './ui/ServicesTab'
import { StayExitTab } from './ui/StayExitTab'

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const m = useMemo(() => compute(ctx), [ctx])
  switch (tab) {
    case 'candidates':
      return <CandidatesTab ctx={ctx} m={m} />
    case 'onboarding':
      return <OnboardingTab ctx={ctx} m={m} />
    case 'stay-exit':
      return <StayExitTab ctx={ctx} m={m} />
    case 'managers':
      return <ManagersTab ctx={ctx} m={m} />
    case 'services':
      return <ServicesTab ctx={ctx} m={m} />
    case 'engagement':
      return m.engagementOn ? <EngagementTab ctx={ctx} m={m} /> : <Overview ctx={ctx} m={m} />
    default:
      return <Overview ctx={ctx} m={m} />
  }
}

export const view: ViewDef = {
  key: 'listening',
  label: 'Listening',
  tabs: LISTENING_TABS.map((t) => ({ ...t })),
  View,
  headline,
  datasets: [
    'employees',
    'requisitions',
    'candidates',
    'cases',
    'transactions',
    'onboardingTasks',
    'surveyResponses',
    'surveyItems',
  ],
  summary,
  actions: listeningActions,
}
