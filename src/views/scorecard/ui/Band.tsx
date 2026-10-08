/**
 * The Scorecard's lead band (docs/DESIGN-REFRESH.md 4.1): targets met as the page's one hero
 * number with its status split, the four key figures, and every measure against its target as a
 * bullet list, by practice or furthest from target first (docs/CHARTS.md, Gap to target). All
 * from the scorecard model already on screen, so the band adds no computation before it paints.
 */
import { useState } from 'react'
import {
  BarList,
  BulletList,
  type BulletStatus,
  type Column,
  Figure,
  type SplitKey,
  StatusSplit,
  type Tone,
} from '@/charts'
import { cx, goTo, KpiStrip, Segmented } from '@/components'
import type { Kpi } from '@/components/types'
import { useNarrow } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import type { RouteView } from '@/data/store'
import { Drill, drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { definitionOf } from '@/metrics/api'
import { actionKpis } from '@/views/actions/engine'
import { M as ACTIONS } from '@/views/actions/metrics'
import { hrbpModel } from '@/views/hrbp/engine'
import { computeRecruiting } from '@/views/recruiting/engine'
import {
  gapRows,
  type MeasureOrder,
  type MeasureRow,
  measureRows,
  measuresWith,
  otherUnitText,
  SPLIT_STATUS,
  standingCounts,
} from '../engine/band'
import type { ScorecardModel } from '../engine/model'
import { standingLine } from '../engine/report'
import type { ScoreStatus } from '../engine/status'
import { M } from '../metrics'
import type { ScorecardItems } from './useScorecardItems'

const LINK = 'text-meta font-medium text-link underline-offset-2 hover:underline'

const TONE: Record<ScoreStatus, BulletStatus['tone'] | null> = {
  met: 'good',
  watch: 'warning',
  missed: 'critical',
  none: 'none',
  unknown: null,
}

/** Furthest from target keeps each bar in its series color and marks its status with a glyph. */
const GLYPH: Record<ScoreStatus, Tone> = {
  met: 'good',
  watch: 'warning',
  missed: 'critical',
  none: 'default',
  unknown: 'default',
}

const defined = <T,>(list: readonly (T | null | undefined)[]): T[] => list.filter((x): x is T => x != null)

/* ───────── targets met ───────── */

export function Standing({
  id,
  model,
  className,
}: {
  /** `scorecard-standing` on the Scorecard; a role home gives its own (`home-chro-standing`). */
  id: string
  model: ScorecardModel
  className?: string
}) {
  const ctx = useAnalytics()
  const [open, setOpen] = useState<SplitKey | null>(null)
  const c = model.counts
  const counts = standingCounts(c)
  const rows = measureRows(model)
  const listed = open ? measuresWith(model, SPLIT_STATUS[open]) : []
  const words: Record<SplitKey, string> = {
    met: 'met',
    watch: 'to watch',
    missed: 'missed',
    none: 'without a target',
    hidden: 'not shown',
  }
  const line = (Object.keys(counts) as SplitKey[])
    .filter((k) => counts[k] > 0)
    .map((k) => `${fmt(counts[k], 'int')} ${words[k]}`)
    .join(' · ')
  return (
    <Figure
      id={id}
      metric={M.targetsMet}
      uses={model.headline.uses.length ? model.headline.uses : model.uses}
      title="Targets met"
      subtitle="Measures meeting their target, of those with a target and a value shown"
      data={rows}
      columns={[
        { key: 'practice', label: 'Practice', format: 'text' },
        { key: 'measure', label: 'Measure', format: 'text' },
        { key: 'statusWord', label: 'Status', format: 'text' },
        {
          key: 'valueText',
          label: 'Value',
          format: 'text',
          drill: (r: MeasureRow) => (r.value == null ? null : r.row.kpi.drill),
        },
        { key: 'targetText', label: 'Target', format: 'text' },
        { key: 'hiddenReason', label: 'Why not shown', format: 'text' },
      ]}
      definitions={defined([
        definitionOf(ctx.metrics, M.targetsMet),
        definitionOf(ctx.metrics, M.status),
        definitionOf(ctx.metrics, M.watch),
      ])}
      note={`${plural(c.measures, 'measure')} from ${plural(model.practices.length, 'practice')} · as of ${formatDate(ctx.asOf)}`}
      span={4}
      className={className}
      empty={c.measures ? null : 'No practice has measures to show yet.'}
    >
      <div className="flex items-baseline gap-2">
        <span className="cut-head text-hero font-semibold text-ink">
          {c.judged ? `${fmt(c.met, 'int')} of ${fmt(c.judged, 'int')}` : '—'}
        </span>
        <span className="text-small text-ink-2">targets met</span>
      </div>
      <div className="mt-4">
        <StatusSplit
          counts={counts}
          onSelect={(k) => setOpen((cur) => (cur === k ? null : k))}
          openHint="list the measures"
          ariaLabel="Measures by status against target"
        />
      </div>
      <p className="mt-1 text-meta text-muted">{line}</p>
      {open && listed.length > 0 && (
        <div className="mt-3 border-t border-rule pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-meta font-medium text-ink-2">
              {plural(listed.length, 'measure')} {words[open]}
            </h3>
            <button type="button" className={LINK} onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <ul className="mt-1">
            {listed.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 py-0.5 text-small">
                <span className="min-w-0 flex-1 truncate text-ink" title={`${r.measure} · ${r.practice}`}>
                  {r.measure} <span className="text-muted">· {r.practice}</span>
                </span>
                <Drill spec={r.value == null ? null : r.row.kpi.drill} className="tnum shrink-0 text-ink">
                  {r.valueText}
                </Drill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Figure>
  )
}

/* ───────── key figures ───────── */

const relink = (k: Kpi | undefined, view: RouteView, label: string): Kpi[] => {
  if (!k) return []
  if (k.link) return [k]
  const { tab, ...rest } = k
  return [{ ...rest, link: { view, tab: tab ?? '', label } }]
}

/**
 * Employees, voluntary attrition, open reqs and critical open items: People stats', Recruiting's
 * and the Action center's own tiles, each opening the tab that explains it.
 */
export function KeyFigures({ items, className }: { items: ScorecardItems | null; className?: string }) {
  const ctx = useAnalytics()
  const h = hrbpModel(ctx).kpi.kpis
  const r = computeRecruiting(ctx).kpis
  const critical = items
    ? actionKpis(items.open, ctx).find((k) => k.metricId === ACTIONS.critical)
    : undefined
  const pendingCritical: Kpi = {
    id: 'critical',
    metricId: ACTIONS.critical,
    label: 'Critical',
    value: null,
    format: 'int',
    note: 'Counting open items',
  }
  const kpis: Kpi[] = [
    ...relink(
      h.find((k) => k.id === 'headcount'),
      'hrbp',
      'People stats, Workforce',
    ),
    ...relink(
      h.find((k) => k.id === 'voluntary'),
      'hrbp',
      'People stats, Attrition',
    ),
    ...relink(
      r.find((k) => k.id === 'open-reqs'),
      'recruiting',
      'Recruiting, Requisitions',
    ),
    {
      ...(critical ?? pendingCritical),
      label: 'Critical open items',
      link: { view: 'actions', label: 'Action center' },
    },
  ]
  return <KpiStrip kpis={kpis} span={8} className={className} />
}

/* ───────── measures against target ───────── */

/** A share measure on "Furthest from target": its row, named with its practice. */
type GapBar = MeasureRow & { name: string }

/** Measures a phone shows before "Show all". */
const PHONE_ROWS = 8

export function Measures({
  id,
  model,
  className,
}: {
  /** `scorecard-measures` on the Scorecard; a role home gives its own (`home-chro-measures`). */
  id: string
  model: ScorecardModel
  className?: string
}) {
  const ctx = useAnalytics()
  const narrow = useNarrow()
  const [order, setOrder] = useState<MeasureOrder>('practice')
  const [all, setAll] = useState(false)
  const rows = measureRows(model, order)
  const shown = narrow && !all ? rows.slice(0, PHONE_ROWS) : rows
  const developer = ctx.access.mode === 'developer'
  const byPractice = order === 'practice'
  // Furthest from target: share measures in signed points against a 0 target rule; measures in
  // other units are named in the note and stay in the table (their gaps don't compare).
  const gaps = gapRows(model)
  const gapNote = [
    gaps.otherUnits.length
      ? `In other units, so in the table only: ${gaps.otherUnits.map(otherUnitText).join('; ')}`
      : '',
    gaps.rest.length ? `${plural(gaps.rest.length, 'measure')} with no value shown or no target` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const columns: Column<MeasureRow>[] = [
    { key: 'practice', label: 'Practice', format: 'text' },
    { key: 'measure', label: 'Measure', format: 'text' },
    {
      key: 'valueText',
      label: 'Value',
      format: 'text',
      drill: (r) => (r.value == null ? null : r.row.kpi.drill),
    },
    { key: 'targetText', label: 'Target', format: 'text' },
    { key: 'statusWord', label: 'Status', format: 'text' },
    {
      key: 'gapText',
      label: 'Gap to target',
      format: 'text',
      drill: (r) => (r.value == null ? null : r.row.kpi.drill),
    },
    { key: 'hiddenReason', label: 'Why not shown', format: 'text' },
    ...(developer ? [{ key: 'metricId' as const, label: 'Metric id', format: 'text' as const }] : []),
  ]
  const judged = model.counts.judged
  return (
    <Figure
      id={id}
      metric={M.status}
      uses={model.uses.length ? model.uses : undefined}
      title="Measures against target"
      subtitle={
        byPractice
          ? judged
            ? standingLine(model.counts)
            : 'Each measure on its own scale, with its target'
          : 'Share measures in points from their target, the furthest miss first; below zero misses'
      }
      data={rows}
      columns={columns}
      definitions={defined([
        definitionOf(ctx.metrics, M.status),
        definitionOf(ctx.metrics, M.watch),
        {
          term: 'Gap to target',
          text: 'How far the value is from its target, in the measure’s unit: below zero is short of the target. Shares are in points. Furthest from target ranks the share measures by their points; measures in days, counts or scores are listed in the table, since their gaps don’t compare with points.',
        },
      ])}
      note={
        byPractice
          ? `Each bar runs on its own scale up to 1.15 × the larger of value and target · as of ${formatDate(ctx.asOf)}`
          : gapNote || `As of ${formatDate(ctx.asOf)}`
      }
      span={8}
      className={className}
      actions={
        <Segmented<MeasureOrder>
          label="Order"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'practice', label: 'By practice' },
            { value: 'gap', label: 'Furthest from target' },
          ]}
        />
      }
      empty={rows.length ? null : 'No practice has measures to show yet.'}
    >
      {byPractice ? (
        <BulletList<MeasureRow>
          data={shown}
          label={(r) => r.measure}
          value="value"
          target="target"
          group="practice"
          format={(r, v) => fmt(v, r.format)}
          status={(r) => {
            const tone = TONE[r.status]
            return tone ? { tone, label: r.statusWord } : null
          }}
          selectable={(r) => r.value != null && !!r.row.kpi.drill}
          onSelect={(r) => drill(r.row.kpi.drill)}
          onSelectLabel={(r) => goTo(r.row.opens.view, r.row.opens.tab)}
          nullNote="Not shown: below the data standard, missing, or hidden to protect anonymity"
          ariaLabel="Each measure against its target"
        />
      ) : gaps.shares.length ? (
        <BarList<GapBar>
          data={gaps.shares.map((r) => ({ ...r, name: `${r.measure} · ${r.practice}` }))}
          label="name"
          value="gap"
          format="pts"
          sort="none"
          ref={{ value: 0, label: 'Target' }}
          glyphTone={(r) => GLYPH[r.status]}
          secondary={(r) =>
            `${r.valueText} vs ${r.targetText.charAt(0).toLowerCase()}${r.targetText.slice(1)}`
          }
          selectable={(r) => !!r.row.kpi.drill}
          onSelect={(r) => drill(r.row.kpi.drill)}
          ariaLabel="Share measures in points from their target, the furthest miss first"
        />
      ) : (
        <p className="py-6 text-small text-muted">No share measure has a value and a target to compare.</p>
      )}
      {byPractice && narrow && rows.length > PHONE_ROWS && (
        <button type="button" className={cx(LINK, 'mt-2')} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </Figure>
  )
}
