/**
 * The Talent figures added in the design refresh: succession exposure (Potential & succession),
 * rating change and share rated high by reviewer (Performance), and required training overdue at
 * each month end (Learning). Each mark opens the records it counts; the engine is
 * `../engine/charts.ts`.
 */
import { useState } from 'react'
import { type Column, Columns, DotStrip, Figure, Heatmap } from '@/charts'
import { Section, Segmented } from '@/components'
import { useChartHeight } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import {
  type ExposureCell,
  type ExposureScope,
  type OverdueMonthRow,
  overdueMonthDrill,
  type RatingChangeCell,
  type ReviewerDot,
  RISK_OF_LOSS,
  ratingChangeDrill,
  reviewerDrill,
} from '../engine/charts'
import { RATING_ORDER } from '../engine/performance'
import { FIGURE_METRIC, highRangeText, highRatingText, TALENT_METRIC as M } from '../engine/settings'
import { COVERAGE_ORDER } from '../engine/succession'
import { defsFor, TERM } from './defs'

/* ───────── Potential & succession ───────── */

export interface ExposurePick {
  readiness: string
  risk: string
  /** Critical and key roles, or critical roles only. */
  scope: ExposureScope
}

const RISK_WORD: Record<string, string> = {
  High: 'high risk of loss',
  Medium: 'medium risk of loss',
  Low: 'low risk of loss',
  'Not rated': 'no risk of loss recorded',
}

/** The words for a cell: "High risk of loss, no successor". */
export const exposureLabel = (p: Pick<ExposurePick, 'readiness' | 'risk'>): string =>
  `${RISK_WORD[p.risk] ?? p.risk}, ${p.readiness === 'No successor' ? 'no successor' : `best successor ${p.readiness.toLowerCase()}`}`.replace(
    /^./,
    (c) => c.toUpperCase(),
  )

export function SuccessionExposure({
  m,
  onPick,
}: {
  m: TalentModel
  /** A cell was picked: the roles table below narrows to it. */
  onPick: (pick: ExposurePick) => void
}) {
  const ctx = useAnalytics()
  const [scope, setScope] = useState<ExposureScope>('All')
  const ex = m.charts.exposure[scope]
  const risks = RISK_OF_LOSS.filter((r) => r !== 'Not rated' || ex.notRated > 0)
  const cells = ex.cells.filter((c) => risks.includes(c.risk))
  const roles = (c: ExposureCell) =>
    m.drill.roles(
      c.list,
      `${exposureLabel(c)}: ${plural(c.roles, 'role')}`,
      `${scope === 'All' ? 'Critical and key roles' : 'Critical roles'} by the incumbent’s risk of loss and the readiness of the best successor still employed.`,
    )
  const what = scope === 'All' ? 'critical and key roles' : 'critical roles'
  return (
    <Figure
      id="talent-succession-exposure"
      uses={m.uses['talent-succession-exposure']}
      metric={FIGURE_METRIC['talent-succession-exposure']}
      title="Succession exposure"
      subtitle={`Planned ${what} by the incumbent’s risk of loss and the readiness of the best successor`}
      data={cells}
      columns={[
        { key: 'risk', label: 'Risk of loss', format: 'text' },
        { key: 'readiness', label: 'Best successor', format: 'text' },
        { key: 'roles', label: 'Roles', format: 'int', drill: roles },
      ]}
      definitions={defsFor(
        ctx.metrics,
        [M.exposure, M.bestReadiness],
        [m.riskShown ? TERM.riskOfLoss : TERM.riskOfLossPlan],
      )}
      note={`${plural(ex.exposed, 'role')} at high risk with no successor, of ${plural(ex.total, 'role')}${
        ex.notRated ? ` · ${fmt(ex.notRated, 'int')} with no risk of loss recorded` : ''
      } · as of ${formatDate(ctx.asOf)}`}
      span={7}
      actions={
        <Segmented<ExposureScope>
          label="Roles counted"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'All', label: 'Critical and key' },
            { value: 'Critical', label: 'Critical' },
          ]}
        />
      }
      empty={
        !m.has.succession
          ? 'Upload Succession to see this.'
          : ex.total
            ? null
            : `No ${what} are planned in this scope.`
      }
    >
      <Heatmap
        data={cells}
        x="risk"
        y="readiness"
        value="roles"
        format="int"
        xOrder={risks}
        yOrder={COVERAGE_ORDER}
        rowHeight={44}
        selectable={(c) => c.roles > 0}
        ariaLabel="Planned roles by risk of loss and best successor readiness"
        onSelect={(c) => {
          if (!c.roles) return
          onPick({ readiness: c.readiness, risk: c.risk, scope })
          drill(roles(c))
        }}
      />
    </Figure>
  )
}

/* ───────── Performance ───────── */

export function RatingChange({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const rc = m.charts.ratingChange
  const open = (c: RatingChangeCell) => (c.people ? () => ratingChangeDrill({ ctx }, rc, c) : null)
  const prior = rc.prior?.cycle
  const latest = rc.latest?.cycle
  const share = (k: number) => (rc.people ? fmt(k / rc.people, 'pct0') : '—')
  // Shade: each cell's share of its earlier rating (the counts are printed in the cells anyway).
  const rowTotal = new Map<string, number>()
  for (const c of rc.cells) rowTotal.set(c.prior, (rowTotal.get(c.prior) ?? 0) + c.people)
  const shaded = rc.cells.map((c) => {
    const total = rowTotal.get(c.prior) ?? 0
    return { ...c, shade: total ? c.people / total : null }
  })
  return (
    <Figure
      id="talent-rating-change"
      uses={m.uses['talent-rating-change']}
      metric={FIGURE_METRIC['talent-rating-change']}
      title="Rating change since the last annual cycle"
      subtitle={
        prior && latest
          ? `People rated in both cycles: rating in ${prior} (rows) by rating in ${latest} (columns), shaded by share of each row`
          : 'People rated in both of the last two annual cycles'
      }
      data={rc.cells}
      columns={[
        { key: 'prior', label: prior ? `Rating in ${prior}` : 'Earlier rating', format: 'text' },
        { key: 'latest', label: latest ? `Rating in ${latest}` : 'Later rating', format: 'text' },
        { key: 'people', label: 'People', format: 'int', drill: open },
        { key: 'rowShare', label: 'Share of the earlier rating', format: 'pct', drill: open },
      ]}
      definitions={defsFor(ctx.metrics, [M.ratingChange], [TERM.latestCycle])}
      note={`${plural(rc.people, 'person', 'people')}: ${share(rc.same)} kept their rating, ${share(rc.up)} rose, ${share(rc.down)} fell`}
      span={4}
      empty={
        !m.has.reviews
          ? 'Upload Reviews to see this.'
          : !prior || !latest
            ? 'Rating change needs two annual review cycles.'
            : rc.people
              ? null
              : 'Nobody in this scope is rated in both annual cycles.'
      }
    >
      {/* Colored by the share of each earlier rating, so movement shows rather than the biggest
          group; the cells print the counts. */}
      <Heatmap
        data={shaded}
        x="latest"
        y="prior"
        value="shade"
        format="pct"
        n="people"
        cellText={(c) => fmt(c.people, 'int')}
        domain={[0, 1]}
        xOrder={RATING_ORDER}
        yOrder={[...RATING_ORDER].reverse()}
        rowHeight={36}
        selectable={(c) => c.people > 0}
        ariaLabel={`People by rating in ${prior ?? 'the earlier cycle'} and in ${latest ?? 'the later cycle'}`}
        onSelect={(c) => drill(open(c))}
      />
    </Figure>
  )
}

export function RatingByReviewer({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const b = m.charts.byReviewer
  const s = m.settings
  const hi = highRatingText(s.highRating)
  const range = highRangeText(s.highRating)
  const open = (d: ReviewerDot) => () => reviewerDrill({ ctx, settings: s }, b, d)
  const columns: Column<ReviewerDot>[] = [
    { key: 'reviewer', label: 'Reviewer', format: 'text' },
    { key: 'businessUnit', label: 'Business unit', format: 'text' },
    { key: 'rated', label: 'People rated', format: 'int', drill: open },
    { key: 'high', label: `Rated ${range}`, format: 'int', drill: open },
    { key: 'share', label: `Share rated ${range}`, format: 'pct', drill: open },
  ]
  const far = b.dots.filter((d) => d.unusual).length
  return (
    <Figure
      id="talent-rating-by-manager"
      uses={m.uses['talent-rating-by-manager']}
      metric={FIGURE_METRIC['talent-rating-by-manager']}
      title={`Share rated ${range} by reviewer`}
      subtitle={`One dot per reviewer with ${fmt(s.minGroup, 'int')} or more people rated in ${b.cycle?.cycle ?? 'the latest cycle'}, by the reviewer’s business unit; tick at each unit’s median`}
      data={b.dots}
      columns={columns}
      definitions={defsFor(ctx.metrics, [M.byReviewer, M.highPerformers, M.ratingDistribution])}
      note={`${plural(b.dots.length, 'reviewer')} shown, ${fmt(far, 'int')} further from the guideline than chance explains${
        b.left
          ? ` · ${plural(b.left, 'reviewer')} with fewer than ${fmt(s.minGroup, 'int')} rated left out`
          : ''
      }`}
      empty={
        !m.has.reviews
          ? 'Upload Reviews to see this.'
          : !b.hasReviewer
            ? 'No reviewer IDs in Reviews. Add the Reviewer ID column to see this.'
            : b.dots.length
              ? null
              : `No reviewer rated ${fmt(s.minGroup, 'int')} or more people in this scope.`
      }
      table={{ search: 'Search reviewers' }}
    >
      <DotStrip
        data={b.dots}
        x="share"
        y="businessUnit"
        id="reviewerId"
        label="reviewer"
        xFormat="pct0"
        xDomain={[0, 1]}
        yOrder={b.units}
        median
        ref={{ value: s.highGuideline, label: `Guideline ${fmt(s.highGuideline, 'pct0')}` }}
        tone={(d) => (d.unusual ? 'default' : 'deemph')}
        ariaLabel={`Share of people rated ${hi} by each reviewer`}
        onSelect={(d) => drill(open(d))}
      />
    </Figure>
  )
}

/* ───────── Learning ───────── */

export function OverdueTrend({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const t = m.charts.overdueTrend
  const height = useChartHeight('lead')
  const last = t.totals.at(-1)
  const peak = t.totals.reduce<(typeof t.totals)[number] | null>(
    (best, x) => (!best || x.overdue > best.overdue ? x : best),
    null,
  )
  const segment = (d: OverdueMonthRow) =>
    d.overdue ? () => overdueMonthDrill({ ctx }, t, d.month, d.course) : null
  const whole = (d: { month: string }) => () => overdueMonthDrill({ ctx }, t, d.month, null)
  return (
    <Section
      title="Overdue over the year"
      dek="Required assignments past due and not completed at each month end, by course: when campaigns fell behind and how fast they caught up."
    >
      <Figure
        id="talent-overdue-trend"
        uses={m.uses['talent-overdue-trend']}
        metric={FIGURE_METRIC['talent-overdue-trend']}
        title="Required training overdue at each month end"
        subtitle={`Assignments past due and not completed, last 12 month ends to ${formatDate(ctx.asOf)}, by course`}
        data={t.rows}
        columns={[
          { key: 'date', label: 'Month end', format: 'date' },
          { key: 'course', label: 'Course', format: 'text' },
          { key: 'overdue', label: 'Overdue', format: 'int', drill: segment },
        ]}
        definitions={defsFor(ctx.metrics, [M.overdueAtMonthEnd, M.overdue], [TERM.required])}
        note={`${plural(last?.overdue ?? 0, 'assignment')} overdue on ${formatDate(ctx.asOf)}${
          peak && peak.overdue > 0 && peak !== last
            ? ` · most at the end of ${formatMonth(`${peak.month}-01`)} (${fmt(peak.overdue, 'int')})`
            : ''
        }${t.folded.length ? ` · ${plural(t.folded.length, 'smaller course')} in Other` : ''}`}
        empty={
          !m.learning.hasDueDates
            ? 'Upload Learning with due dates to see overdue training.'
            : t.totals.some((x) => x.overdue > 0)
              ? null
              : 'No required training was overdue at any month end in the last 12 months.'
        }
        emptyHeight={height}
      >
        <Columns
          data={t.rows}
          x="month"
          y="overdue"
          series="course"
          stack
          seriesOrder={t.courses}
          xType="month"
          height={height}
          ariaLabel="Required training overdue at each month end, by course"
          onSelect={(d) => drill(whole(d))}
          onSelectSegment={(d) => drill(segment(d))}
        />
      </Figure>
    </Section>
  )
}
