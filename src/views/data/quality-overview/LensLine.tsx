/**
 * The quality lens on one number (a KPI tile, a figure footer, a finding): when the "Show data
 * quality" switch is on, a quiet block saying its tier, the field limiting it, the rows under it
 * in the period and the gaps in them (each count opens those rows, each with its gap), and
 * "Definition changed" when the metric dictionary holds your changes to it. Rows are called left
 * out only when the metric says which fields it requires (`requires`); otherwise they are rows
 * with a gap, since a breakdown may still count them under Other. Nothing renders while the lens
 * is off, in the Data room, or for a number that names no data.
 */
import { useMemo } from 'react'
import { useCurrentView } from '@/components/currentView'
import { MedalGlyph } from '@/components/tier/TierBadge'
import { withoutTierPrefix } from '@/components/tier/tierModel'
import { cx, Tip } from '@/components/ui'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { TIER_LABEL } from '@/data/quality/tier'
import { type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import { Drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import { DefinitionChangedMark } from '@/views/data/metrics/ui/EditDefinition'
import { sourceInfo } from '../engine/manifest'
import { leftOutSpec } from './drills'
import {
  excludedText,
  type LeftOutPart,
  type PartRows,
  partFields,
  partRows,
  periodTestOf,
  rowsLeftOut,
  type ScopeTest,
  usedText,
} from './engine/leftOut'
import { limitPhrase } from './engine/lensText'
import { useLensOn } from './lens'

export type LensVariant = 'tile' | 'figure' | 'finding'

export interface QualityLensLineProps {
  /** The fields the number declares; the metric's registered `uses` when it declares none. */
  uses?: readonly FieldRef[]
  /** The metric dictionary entry, for its lineage and "Definition changed". */
  metricId?: string
  /** What the number is, for the drill panel's title ("Voluntary attrition"). */
  label: string
  variant: LensVariant
  /** Say the tier in words (figure footers); tiles and findings already show their badge beside it. */
  showTier?: boolean
  /**
   * Mark a changed definition (default true). KPI tiles, figures and findings carry their own
   * "Definition changed" mark, shown with the lens on or off, so they turn this off.
   */
  showChanged?: boolean
  className?: string
}

export function QualityLensLine(props: QualityLensLineProps) {
  const on = useLensOn()
  const view = useCurrentView()
  if (!on || !view || view.key === 'data') return null
  return <LensBody {...props} fallback={view.datasets ?? []} />
}

/* ───────────── scope ───────────── */

const scopeSets = new WeakMap<Datasets, Map<DatasetKey, ReadonlySet<object>>>()

/** The rows the current filters keep, as a test on unscoped row indexes; undefined for the whole company. */
export function scopeTestOf(
  ctx: Pick<AnalyticsContext, 'isCompany' | 'data' | 'all'>,
): ScopeTest | undefined {
  if (ctx.isCompany) return undefined
  return (key) => {
    let byKey = scopeSets.get(ctx.data)
    if (!byKey) {
      byKey = new Map()
      scopeSets.set(ctx.data, byKey)
    }
    let set = byKey.get(key)
    if (!set) {
      set = new Set<object>(ctx.data[key] as readonly object[])
      byKey.set(key, set)
    }
    const kept = set
    const rows = ctx.all[key] as readonly object[]
    return (i) => kept.has(rows[i])
  }
}

/* ───────────── wording ───────────── */

function LensBody({
  uses,
  metricId,
  label,
  variant,
  showTier = false,
  showChanged = true,
  className,
  fallback,
}: QualityLensLineProps & { fallback: readonly DatasetKey[] }) {
  const ctx = useAnalytics()
  const def = metricId ? ctx.metrics.def(metricId) : undefined
  const registered = metricId ? ctx.metrics.usesOf(metricId) : []
  const fieldUses: readonly FieldRef[] | undefined = uses?.length
    ? uses
    : registered.length
      ? registered
      : undefined
  // The fields a row must have to count, from the metric's entry: only those leave a row out.
  const requires = def?.requires?.length ? def.requires : undefined
  const usesKey = `${fieldUses?.join('|') ?? ''}/${requires?.join('|') ?? ''}`
  // The rows depend only on the quality index, the scope, the period and the fields.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `usesKey` stands for `fieldUses` and `requires`
  const left = useMemo(
    () =>
      rowsLeftOut(ctx.quality, fieldUses, {
        inScope: scopeTestOf(ctx),
        inPeriod: periodTestOf(ctx.all, ctx.window),
        requires,
      }),
    [ctx.quality, ctx.data, ctx.all, ctx.isCompany, ctx.window.start, ctx.window.end, usesKey],
  )
  if (!fieldUses && !fallback.length) return null
  const limiting = ctx.quality.limitingOf(fieldUses, fallback)
  const stats = limiting.ref ? ctx.quality.fieldStats(limiting.ref) : null
  const changed = showChanged && !!metricId && ctx.metrics.changesBehind(metricId).length > 0
  const what = def?.name ?? label
  const explain = withoutTierPrefix(ctx.quality.explainOf(fieldUses, fallback))
  const tier = limiting.tier
  // Tiers and fill rates are judged over the whole dataset, whatever the filters keep.
  const limit = limitPhrase(
    stats,
    limiting,
    ctx.quality.rules,
    limiting.dataset ? ctx.quality.dataset(limiting.dataset) : null,
    { mid: tier !== 'gold', ...(ctx.isCompany ? {} : { scope: 'company-wide' }) },
  )
  const many = left.parts.length > 1
  const small = variant === 'tile'

  return (
    <div
      data-quality-lens
      className={cx(
        'leading-snug text-muted',
        small ? 'mt-1.5 space-y-0.5 text-[11px]' : 'space-y-0.5 text-[12px]',
        className,
      )}
    >
      <p className="flex flex-wrap items-center gap-x-1">
        {showTier && (
          <span className="inline-flex items-center gap-1 font-medium text-ink-2">
            <MedalGlyph tier={tier} className="size-3" />
            {TIER_LABEL[tier]}
            <span aria-hidden="true" className="text-muted">
              ·
            </span>
          </span>
        )}
        <Tip content={explain}>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focus shows the explanation, as hover does */}
          <span tabIndex={0} className="relative z-10 cursor-default rounded-[2px]">
            {tier === 'gold' ? limit : `Limited by ${limit}`}
            <span className="sr-only">. {explain}</span>
          </span>
        </Tip>
      </p>
      {left.parts.map((p) => (
        <PartLine
          key={p.dataset}
          part={p}
          many={many}
          label={what}
          uses={fieldUses ?? []}
          small={small}
          periodLabel={ctx.window.label}
        />
      ))}
      {changed && metricId && (
        <p>
          <DefinitionChangedMark metricId={metricId} className="-ml-1" />
        </p>
      )}
    </div>
  )
}

/** What each kind of rows is called after its count, and in the drill button's label. */
const PART_WORDS: Record<PartRows, { link: string; rows: string }> = {
  leftOut: { link: 'left out', rows: 'rows left out' },
  kept: { link: 'kept with a gap', rows: 'rows kept with a gap' },
  gaps: { link: 'with a gap', rows: 'rows with a gap' },
  outside: { link: 'with a gap outside the period', rows: 'rows with a gap outside the period' },
}

function PartLine({
  part,
  many,
  label,
  uses,
  small,
  periodLabel,
}: {
  part: LeftOutPart
  many: boolean
  label: string
  uses: readonly FieldRef[]
  small: boolean
  periodLabel: string
}) {
  const ctx = useAnalytics()
  const dataset = datasetDef(part.dataset).label
  // With required fields: rows left out, then rows kept with a gap. Without: every gap.
  const kinds: PartRows[] = part.leftOut == null ? ['gaps'] : ['leftOut', 'kept']
  // Gaps outside the period are worth a word in a figure or finding; a tile has no room.
  if (!small) kinds.push('outside')
  const shown = kinds.filter((k) => partRows(part, k).length > 0)
  return (
    <p>
      {many && <span className="text-ink-2">{dataset}: </span>}
      {usedText(part)}
      {shown.map((which) => {
        const n = fmt(partRows(part, which).length, 'int')
        const excluded = which === 'outside' ? '' : excludedText(partFields(part, which), small ? 1 : 3)
        return (
          <span key={which}>
            {' · '}
            <Drill
              spec={() =>
                leftOutSpec({
                  part,
                  which,
                  data: ctx.all,
                  what: label,
                  uses,
                  scopeLabel: ctx.scopeLabel,
                  source: sourceInfo(ctx.sources[part.dataset]),
                  periodLabel,
                })
              }
              className="relative z-10 text-left"
              label={`${label}: show the ${n} ${dataset} ${PART_WORDS[which].rows}`}
            >
              {n} {PART_WORDS[which].link}
            </Drill>
            {excluded && <span>: {excluded}</span>}
          </span>
        )
      })}
    </p>
  )
}
