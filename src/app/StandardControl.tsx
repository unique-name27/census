/**
 * The data standard control in the filter row: Production, Validated or Everything, with how
 * many datasets sit at each tier. It applies to every view and is the same setting as
 * Settings → Data. From 1280px it folds into the filter row as a compact menu.
 */
import { standardFixed } from '@/access/copy'
import { MedalGlyph } from '@/components/tier/TierBadge'
import { STANDARD_HINT, tierCountParts, tierCounts, tierCountsText } from '@/components/tier/tierModel'
import { Button, Menu, Segmented, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { DATA_STANDARDS, type DataStandard, STANDARD_LABEL } from '@/data/quality/tier'
import { useCensus } from '@/data/store'

/**
 * `compact` (the filter row from 1280px): one menu button, "Standard: Everything", at the row's
 * right end; the menu lists the three standards and the datasets at each tier.
 */
export function StandardControl({ compact = false }: { compact?: boolean }) {
  const ctx = useAnalytics()
  const standard = useCensus((s) => s.dataStandard)
  const setStandard = useCensus((s) => s.setDataStandard)
  const counts = tierCounts(ctx.quality)
  const parts = tierCountParts(counts)
  // Finance and Manager mode show the saved standard, read only (docs/ROLES-V2.md 4.10): one short
  // label, like the compact menu button, with what it means and why it is fixed in the tooltip.
  if (ctx.access.decide('filter:standard').access === 'limited')
    return (
      <div data-tour="data-standard" className="inline-flex min-w-0 items-center whitespace-nowrap">
        <Tip content={`${STANDARD_HINT[ctx.standard]} ${standardFixed(ctx.access.mode)}`}>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focus shows why the standard is fixed, as hover does */}
          <span className="inline-flex items-center gap-1.5 text-meta text-ink-2" tabIndex={0}>
            <MedalGlyph tier={ctx.standard} className="size-3" />
            <span>
              <span className="sr-only">Data </span>Standard:
            </span>
            <span className="text-ink">{STANDARD_LABEL[ctx.standard]}</span>
          </span>
        </Tip>
      </div>
    )
  if (compact)
    return (
      <span data-tour="data-standard" className="inline-flex">
        <Menu
          width={300}
          align="end"
          trigger={
            <Button size="sm" variant="ghost" caret aria-label={`Data standard: ${STANDARD_LABEL[standard]}`}>
              <MedalGlyph tier={standard} className="size-3" />
              <span className="text-ink-2">Standard:</span>
              <span>{STANDARD_LABEL[standard]}</span>
            </Button>
          }
          items={[
            { heading: 'Data standard' },
            ...DATA_STANDARDS.map((s) => ({
              label: STANDARD_LABEL[s],
              icon: <MedalGlyph tier={s} className="size-3" />,
              hint: s === standard ? 'In use' : undefined,
              onSelect: () => setStandard(s),
            })),
            { separator: true as const },
            { heading: tierCountsText(counts) },
          ]}
        />
      </span>
    )
  return (
    <div data-tour="data-standard" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <Tip content={STANDARD_HINT[standard]}>
        <span className="text-meta font-medium text-ink-2">Data standard</span>
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
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-meta text-muted">
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
