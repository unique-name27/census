/**
 * The data standard control in the filter row: Production, Validated or Everything, with how
 * many datasets sit at each tier. It applies to every view and is the same setting as
 * Settings → Data.
 */
import { MedalGlyph } from '@/components/tier/TierBadge'
import { STANDARD_HINT, tierCountParts, tierCounts, tierCountsText } from '@/components/tier/tierModel'
import { Segmented, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { DATA_STANDARDS, type DataStandard, STANDARD_LABEL } from '@/data/quality/tier'
import { useCensus } from '@/data/store'

export function StandardControl() {
  const ctx = useAnalytics()
  const standard = useCensus((s) => s.dataStandard)
  const setStandard = useCensus((s) => s.setDataStandard)
  const counts = tierCounts(ctx.quality)
  const parts = tierCountParts(counts)
  return (
    <div data-tour="data-standard" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <Tip content={STANDARD_HINT[standard]}>
        <span className="text-[12px] font-medium text-ink-2">Data standard</span>
      </Tip>
      <Segmented<DataStandard>
        label="Data standard"
        value={standard}
        onChange={setStandard}
        options={DATA_STANDARDS.map((s) => ({
          value: s,
          label: STANDARD_LABEL[s],
          icon: <MedalGlyph tier={s} className="size-3" />,
        }))}
      />
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted">
        <span className="sr-only">{tierCountsText(counts)}</span>
        <span aria-hidden="true">Datasets</span>
        {parts.map((p) => (
          <span key={p.tier} aria-hidden="true" className="inline-flex items-center gap-1 whitespace-nowrap">
            <MedalGlyph tier={p.tier} className="size-3" />
            {p.text}
          </span>
        ))}
      </p>
    </div>
  )
}
