/**
 * The folder-tab headline under the data standard. A headline is a number like any KPI: below the
 * standard it reads "—", drops its spark and says why, so a tab never shows what the tiles on the
 * page hide.
 */
import { gateFor, type TierGate } from '@/components/tier/tierModel'
import type { AnalyticsContext } from '@/data/context'
import type { DataStandard } from '@/data/quality/tier'
import type { QualityIndex } from '@/data/quality/types'
import type { DatasetKey } from '@/data/schema'
import { DASH } from '@/lib/format'
import { timed } from '@/lib/timing'
import { catalogHeadline } from '@/views/ai/catalog/summary'
import type { Agent } from '@/views/ai/catalog/types'
import type { Headline, ViewDef } from '@/views/types'

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

/** A view's headline; "—" when computing it fails, so one view never blanks the tab strip. */
export function safeHeadline(view: ViewDef, ctx: AnalyticsContext): Headline {
  try {
    return timed(`census:headline:${view.key}`, () => view.headline(ctx))
  } catch (err) {
    console.error(`Headline for ${view.key} failed`, err)
    return { value: DASH, label: '' }
  }
}

/**
 * Every folder tab's headline, gated on the data standard. The AI in HR tab counts `agents`, its
 * catalog store, which is not part of ctx: the caller passes the live catalog, so a memo keyed on
 * these arguments recomputes when an agent is edited, removed or imported.
 */
export function folderHeadlines(
  views: readonly ViewDef[],
  ctx: AnalyticsContext,
  agents: readonly Agent[],
): GatedHeadline[] {
  return views.map((v) =>
    gateHeadline(
      v.key === 'ai' ? catalogHeadline(agents) : safeHeadline(v, ctx),
      ctx.quality,
      ctx.standard,
      v.datasets,
    ),
  )
}
