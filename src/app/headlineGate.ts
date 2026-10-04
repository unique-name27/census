/**
 * The folder-tab headline under the data standard. A headline is a number like any KPI: below the
 * standard it reads "—", drops its spark and says why, so a tab never shows what the tiles on the
 * page hide.
 */
import { gateFor, type TierGate } from '@/components/tier/tierModel'
import type { DataStandard } from '@/data/quality/tier'
import type { QualityIndex } from '@/data/quality/types'
import type { DatasetKey } from '@/data/schema'
import { DASH } from '@/lib/format'
import type { Headline } from '@/views/types'

export interface GatedHeadline extends Headline {
  /** Why the number is hidden ("Not yet confirmed for production"); null when it is shown. */
  hidden: string | null
  gate: TierGate | null
}

export function gateHeadline(
  headline: Headline,
  quality: Pick<QualityIndex, 'limitingOf' | 'explainOf'>,
  standard: DataStandard,
  datasets: readonly DatasetKey[],
): GatedHeadline {
  const gate = gateFor(quality, standard, headline.uses, datasets)
  if (!gate || gate.shown) return { ...headline, hidden: null, gate }
  return { value: DASH, label: headline.label, uses: headline.uses, hidden: gate.reason, gate }
}
