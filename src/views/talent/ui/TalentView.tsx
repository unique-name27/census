import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import { talentModel } from '../engine'
import { LearningTab } from './LearningTab'
import { OverviewTab } from './OverviewTab'
import { PerformanceTab } from './PerformanceTab'
import { RetentionTab } from './RetentionTab'
import { SuccessionTab } from './SuccessionTab'

export function TalentView({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const model = useMemo(() => talentModel(ctx), [ctx])
  switch (tab) {
    case 'performance':
      return <PerformanceTab m={model} />
    case 'succession':
      return <SuccessionTab m={model} />
    case 'retention':
      return <RetentionTab m={model} />
    case 'learning':
      return <LearningTab m={model} />
    default:
      return <OverviewTab m={model} />
  }
}
