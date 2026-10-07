/**
 * One metric's detail panel: what it is (definition, formula, population, window, unit, owner,
 * target), the settings its calculation reads, the data it uses with each field's tier and fill
 * rate, where it appears, and its change log. Wording, target and settings edit in place; every
 * change applies to all views at once and can be undone.
 */
import type { Ref } from 'react'
import { Figure } from '@/charts'
import { IconClose, IconLock, IconReset } from '@/components/icons'
import { goTo, routeHash } from '@/components/navigation'
import { TierBadge } from '@/components/tier/TierBadge'
import { toast } from '@/components/toast'
import { Button, IconButton } from '@/components/ui'
import type { AnalyticsContext } from '@/data/context'
import { useCensus } from '@/data/store'
import { CATALOG } from '@/metrics/catalog'
import type { MetricDef, MetricView, ParamValue, TextField } from '@/metrics/types'
import {
  changeRows,
  directionText,
  fieldRows,
  GROUP_LABEL,
  groupOf,
  metricTier,
  SETTING_COLUMNS,
  settingRows,
  tierNote,
  unitText,
  type ViewDatasets,
  whereRows,
} from '../model'
import { metricHref, openMetricDefinition } from '../open'
import { ChangeLog } from './ChangeLog'
import { DataUsed } from './DataUsed'
import { ChangedMark, EditableText, StaticRow, TargetField } from './fields'
import { SettingEditor } from './SettingEditor'
import { useMetricEdit } from './useMetricEdit'

const TEXT: readonly TextField[] = ['definition', 'formula', 'population']

/** Where a view link goes: the view itself, or the Data quality tab for the Data room's rules. */
const viewTab = (v: MetricView): string => (v === 'data' ? 'quality' : '')

export function MetricDetail({
  ctx,
  def,
  base,
  by,
  viewDatasets,
  onClose,
  headingRef,
}: {
  ctx: Pick<AnalyticsContext, 'metrics' | 'quality' | 'all' | 'sources'>
  /** The metric with your changes. */
  def: MetricDef
  /** The metric as registered. */
  base: MetricDef
  /** Your name, for the change log. */
  by: string
  viewDatasets: ViewDatasets
  onClose: () => void
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const api = ctx.metrics
  const apply = useMetricEdit(by)
  const resetMetric = useCensus((s) => s.resetMetric)
  const changed = api.changedFields(def.id)
  const isChanged = changed.length > 0
  const tier = metricTier(def, ctx.quality, viewDatasets)
  const fields = fieldRows(def, ctx.quality, tier.limiting?.ref ?? null)
  const settings = settingRows(def, api)
  const log = changeRows(api.state, CATALOG, def.id)
  const group = groupOf(def)
  const where = whereRows(def)
  // Other metrics whose settings this one is calculated with (the anonymity minimum included).
  const sources = api
    .sourcesOf(def.id)
    .slice(1)
    .map((id) => ({
      id,
      name: api.def(id)?.name ?? id,
      changed: api.changesBehind(def.id).some((b) => b.metricId === id),
    }))
  const slug = def.id.replace(/\./g, '-')

  const reset = () => {
    resetMetric(def.id, by)
    toast(`${def.name} is back to its defaults`, {
      tone: 'good',
      description: 'Each field it changed is in the change log, where it can be undone.',
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby={`${slug}-name`}
        data-tour="metric-detail"
        className="rounded-sheet bg-sheet px-4 pt-3.5 pb-1"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">
              {GROUP_LABEL[group]} · <span className="font-mono normal-case tracking-normal">{def.id}</span>
            </p>
            <h2
              id={`${slug}-name`}
              ref={headingRef}
              tabIndex={-1}
              className="cut-head mt-1 rounded-mark text-section leading-tight font-semibold outline-none focus-visible:outline-2 focus-visible:outline-focus"
            >
              {def.name}
            </h2>
          </div>
          <IconButton label="Close this metric" size="sm" className="-mr-1.5" onClick={onClose}>
            <IconClose />
          </IconButton>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {tier.tier ? (
            <TierBadge
              tier={tier.tier}
              explain={tier.explain ?? undefined}
              dataset={tier.limiting?.dataset}
            />
          ) : (
            <span className="inline-flex h-6 items-center gap-1 rounded-chip bg-sheet-3 px-1.5 text-meta font-semibold text-ink-2">
              {base.locked && <IconLock className="size-3" />}
              {base.locked
                ? 'Privacy rule, locked'
                : base.kind === 'setting'
                  ? 'Setting, reads no data'
                  : 'Rule'}
            </span>
          )}
          {isChanged && <ChangedMark label="Changed from default" />}
          {isChanged && (
            <Button size="sm" variant="ghost" icon={<IconReset />} onClick={reset} className="ml-auto">
              Reset to defaults
            </Button>
          )}
        </div>
        <p className="mt-3 text-meta text-muted">
          Appears in{' '}
          {where.map((w, i) => (
            <span key={w.view}>
              {i > 0 && (i === where.length - 1 ? ' and ' : ', ')}
              <a
                href={routeHash(w.view, viewTab(w.view))}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  goTo(w.view, viewTab(w.view))
                }}
                className="font-medium text-link underline-offset-2 hover:underline"
              >
                {w.label}
              </a>
              {w.home && where.length > 1 && ' (its home)'}
            </span>
          ))}
          .
        </p>
        {sources.length > 0 && (
          <p className="mt-1 text-meta text-muted">
            Also calculated with the settings of{' '}
            {sources.map((s, i) => (
              <span key={s.id}>
                {i > 0 && (i === sources.length - 1 ? ' and ' : ', ')}
                <a
                  href={metricHref(s.id)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    openMetricDefinition(s.id)
                  }}
                  className="font-medium text-link underline-offset-2 hover:underline"
                >
                  {s.name}
                </a>
                {s.changed && ' (changed)'}
              </span>
            ))}
            . A change there changes this number too.
          </p>
        )}
        <div className="mt-3">
          {TEXT.map((f) => (
            <EditableText
              key={f}
              def={def}
              base={base}
              field={f}
              changed={changed.includes(f)}
              apply={(value, done) => apply({ metricId: def.id, field: f, value }, done)}
            />
          ))}
          <StaticRow label="Window">{def.window ?? 'Not tied to a period'}</StaticRow>
          <StaticRow label="Unit">
            {unitText(def.unit)}
            <span className="text-muted"> · {directionText(def.goodDirection)}</span>
          </StaticRow>
          <TargetField
            key={JSON.stringify(api.target(def.id))}
            def={def}
            base={base}
            target={api.target(def.id)}
            changed={changed.includes('target')}
            apply={(value, done) => apply({ metricId: def.id, field: 'target', value }, done)}
          />
          <EditableText
            def={def}
            base={base}
            field="owner"
            changed={changed.includes('owner')}
            apply={(value, done) => apply({ metricId: def.id, field: 'owner', value }, done)}
          />
        </div>
      </section>

      {def.params.length > 0 && (
        <Figure
          id={`data-metrics-${slug}-settings`}
          title="Settings"
          subtitle="What the calculation reads. A change applies to every view at once."
          data={settings}
          columns={SETTING_COLUMNS}
          image={false}
          tableToggle={false}
          gate={false}
          uses={def.uses}
        >
          {def.params.map((p) => {
            const current = api.param<ParamValue>(def.id, p.key)
            return (
              <SettingEditor
                key={`${p.key}:${JSON.stringify(current)}`}
                metricName={def.name}
                param={p}
                current={current}
                changed={changed.includes(`params.${p.key}`)}
                apply={(value, done) => apply({ metricId: def.id, field: `params.${p.key}`, value }, done)}
              />
            )
          })}
        </Figure>
      )}

      <DataUsed
        metricId={def.id}
        rows={fields}
        uses={def.uses}
        ctx={ctx}
        tierNote={tierNote(def, tier, viewDatasets)}
      />

      <ChangeLog id={`data-metrics-${slug}-log`} rows={log} by={by} uses={def.uses} />
    </div>
  )
}
