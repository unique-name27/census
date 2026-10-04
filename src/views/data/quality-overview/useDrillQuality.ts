/**
 * The quality index for drills on the Data quality tab: the same data and versions as everywhere,
 * plus each dataset's import log, so values blanked or defaulted at import open the rows they came
 * from. It allows no problems at all, so every rule keeps the rows behind it even when it passes
 * (five references that don't resolve, within the share allowed, still open those five rows).
 * Counts and tiers come from `ctx.quality` (it knows your reference mappings and the rules in
 * force); this index only finds rows.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAnalytics } from '@/data/context'
import { computeQuality, type IssueMap } from '@/data/quality/compute'
import type { QualityIndex } from '@/data/quality/types'
import { DATASET_KEYS } from '@/data/schema'
import { useCensus } from '@/data/store'

export function useDrillQuality(): QualityIndex {
  const ctx = useAnalytics()
  const versions = useCensus((s) => s.versions)
  const getRaw = useCensus((s) => s.getRaw)
  // The versions whose import logs are kept; a new upload or a re-map changes it.
  const signature = DATASET_KEYS.map((k) => (versions[k]?.hasRaw ? versions[k].versionId : '')).join('|')
  const [loaded, setLoaded] = useState<{ signature: string; issues: IssueMap } | null>(null)
  useEffect(() => {
    let live = true
    // The signature lists, per dataset, the version whose import log to read ('' for none).
    const ids = signature.split('|')
    const wanted = DATASET_KEYS.flatMap((k, i) => (ids[i] ? [[k, ids[i]] as const] : []))
    void Promise.all(
      wanted.map(([k, id]) =>
        getRaw(k, id)
          .then((raw) => [k, raw?.issues ?? null] as const)
          .catch(() => [k, null] as const),
      ),
    ).then((list) => {
      if (!live) return
      const issues: IssueMap = {}
      for (const [k, i] of list) if (i?.length) issues[k] = i
      setLoaded({ signature, issues })
    })
    return () => {
      live = false
    }
  }, [signature, getRaw])
  const issues = loaded?.signature === signature ? loaded.issues : undefined
  // Nothing allowed: every rule names its rows, passing or not.
  const strict = useMemo(() => ({ ...ctx.quality.rules, maxProblemShare: 0 }), [ctx.quality.rules])
  return useMemo(
    () =>
      computeQuality(ctx.all, versions, issues && Object.keys(issues).length ? issues : undefined, {
        asOf: ctx.asOf,
        rules: strict,
      }),
    [issues, ctx.all, versions, ctx.asOf, strict],
  )
}
