/** The org model for the current analytics context, computed once per context. */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import { type OrgModel, type OrgRules, orgModel, orgRules } from '../engine'

export function useOrgModel(): OrgModel {
  const ctx = useAnalytics()
  return useMemo(() => orgModel(ctx), [ctx])
}

/** The thresholds in force from the metric dictionary, without building the model. */
export function useOrgRules(): OrgRules {
  return orgRules(useAnalytics().metrics)
}
