/**
 * The words around an org slide: the footer (what the slide is, the data standard and the org
 * chart's tier) and the speaker notes. Pure, so the stamps are testable without building a deck.
 */
import type { ExportMeta } from '@/charts/types'
import type { Tier } from '@/data/quality/tier'
import { asOfLabel, dataLine, stampLine } from '@/lib/export/names'
import type { SlidePlan } from '../engine'

/** The org chart figure's tier, and whether the data standard holds it back on screen. */
export interface SlideTier {
  tier?: Tier | null
  withheld?: boolean
}

export interface OrgSlideText {
  /** Footer lines on the left: the slide note (or the confidentiality stamp), then the data line. */
  left: string[]
  right: string
  notes: string
}

export function orgSlideText(
  plan: Pick<SlidePlan, 'subtitle' | 'note'>,
  meta: ExportMeta,
  page: number,
  data: SlideTier = {},
): OrgSlideText {
  const standard = dataLine(meta.standard, data.tier, data.withheld)
  return {
    left: [plan.note || stampLine(meta), standard].filter((s): s is string => !!s),
    right: `Census · Org chart · ${meta.scope} · As of ${asOfLabel(meta.asOf)}  ·  ${page}`,
    notes: [plan.subtitle, plan.note, standard, stampLine(meta)].filter(Boolean).join('\n'),
  }
}
