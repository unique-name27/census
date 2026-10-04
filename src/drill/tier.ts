/**
 * The tier the drill panel shows: the drilled number's, when its spec names the fields it is
 * computed from, otherwise the tier of the dataset the records come from. Pure.
 */
import type { Tier } from '@/data/quality/tier'
import type { QualityIndex } from '@/data/quality/types'
import type { DatasetKey } from '@/data/schema'
import type { DrillSpec } from './types'

export interface DrillTier {
  tier: Tier
  explain: string
  /** The dataset whose Quality panel explains it. */
  dataset: DatasetKey
  /** The tier is the records' dataset's, not the number's (the spec names no fields). */
  ofDataset: boolean
}

export function drillTier(
  quality: Pick<QualityIndex, 'datasetTier' | 'explain' | 'limitingOf' | 'explainOf'>,
  spec: Pick<DrillSpec, 'kind' | 'uses'>,
): DrillTier {
  if (spec.uses?.length) {
    const l = quality.limitingOf(spec.uses, [spec.kind])
    return {
      tier: l.tier,
      explain: quality.explainOf(spec.uses, [spec.kind]),
      dataset: l.dataset ?? spec.kind,
      ofDataset: false,
    }
  }
  return {
    tier: quality.datasetTier(spec.kind),
    explain: quality.explain(spec.kind),
    dataset: spec.kind,
    ofDataset: true,
  }
}
