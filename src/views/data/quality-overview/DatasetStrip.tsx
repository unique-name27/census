/**
 * The quality lens in the view header: the "Show data quality" switch, and (while it is on) a
 * strip under the header naming the datasets the view reads with their tiers. Each one opens the
 * Data quality tab at that dataset; its explanation shows on hover or focus.
 */
import { MedalGlyph } from '@/components/tier/TierBadge'
import { withoutTierPrefix } from '@/components/tier/tierModel'
import { Switch, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { TIER_LABEL } from '@/data/quality/tier'
import { type DatasetKey, datasetDef } from '@/data/schema'
import { openDataQuality, useLensOn, useQualityLens } from './lens'

export function QualityLensSwitch() {
  const on = useLensOn()
  const setOn = useQualityLens((s) => s.setOn)
  return <Switch checked={on} onChange={setOn} label="Show data quality" />
}

export function QualityDatasetStrip({ datasets }: { datasets: readonly DatasetKey[] }) {
  const on = useLensOn()
  if (!on || !datasets.length) return null
  return <Strip datasets={datasets} />
}

const CHIP =
  'inline-flex h-6 items-center gap-1.5 rounded-[3px] px-1.5 text-[12px] whitespace-nowrap hover:bg-hover active:bg-press'

function Strip({ datasets }: { datasets: readonly DatasetKey[] }) {
  const { quality } = useAnalytics()
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labeled row of links, not a form fieldset
    <div
      role="group"
      aria-label="Data behind this view"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 pt-3"
    >
      <span className="eyebrow mr-1.5">Data behind this view</span>
      {datasets.map((k) => {
        const tier = quality.datasetTier(k)
        const label = datasetDef(k).label
        const explain = withoutTierPrefix(quality.explain(k))
        return (
          <Tip
            key={k}
            content={
              <span className="block">
                <span className="font-semibold">{TIER_LABEL[tier]}.</span> {explain}
                <span className="mt-1 block text-muted">Opens the Data quality tab at {label}.</span>
              </span>
            }
          >
            <button
              type="button"
              className={CHIP}
              onClick={() => openDataQuality(k)}
              aria-label={`${label}: ${TIER_LABEL[tier]}. ${explain} Open the Data quality tab at ${label}.`}
            >
              <MedalGlyph tier={tier} className="size-3" />
              <span className="font-medium text-ink">{label}</span>
              <span className="text-muted">{TIER_LABEL[tier]}</span>
            </button>
          </Tip>
        )
      })}
      <button
        type="button"
        onClick={() => openDataQuality()}
        className="ml-1 rounded-[2px] text-[12px] font-medium text-link underline-offset-2 hover:underline"
      >
        Open data quality
      </button>
    </div>
  )
}
