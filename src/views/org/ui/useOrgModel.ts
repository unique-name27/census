/** The org model for the current analytics context, computed once per context. */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import { buildOrgModel, type OrgModel, type OrgRules, orgRules } from '../engine'

export function useOrgModel(): OrgModel {
  const ctx = useAnalytics()
  return useMemo(() => buildOrgModel(ctx), [ctx])
}

/** The thresholds in force from the metric dictionary, without building the model. */
export function useOrgRules(): OrgRules {
  return orgRules(useAnalytics().metrics)
}
