/**
 * The people Manager mode can be shaped for: active managers who lead 3 or more employees, the
 * leader filter's own list (`leaderOptions`), largest org first.
 */
import { useMemo } from 'react'
import { type LeaderOption, leaderOptions } from '@/app/filterOptions'
import { useAnalytics } from '@/data/context'
import { MIN_REPORTS } from '../lock'

export function useManagers(): LeaderOption[] {
  const { org, asOf } = useAnalytics()
  return useMemo(() => leaderOptions(org, asOf, MIN_REPORTS), [org, asOf])
}
