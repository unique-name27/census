/**
 * Talent management's home (docs/ROLES-V2.md 5.7): succession cover for critical roles, whether
 * reviews are done and fair, and required training. The share of critical roles with a ready-now
 * successor leads over the roles' best successor readiness; then the key figures, succession
 * exposure and overdue training; Needs attention; My list, the critical roles (or the high
 * potentials); and review coverage and the rating mix. Every number is Talent's own.
 */
import { useState } from 'react'
import { BulletList, type Column, Columns, Figure, Heatmap } from '@/charts'
import { Grid, KpiStrip, Section } from '@/components'
import type { Kpi, Severity } from '@/components/types'
import { useChartHeight } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import { drillSpec } from '@/drill/types'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { type TalentModel, talentModel } from '@/views/talent/engine'
import {
  type ExposureCell,
  type OverdueMonthRow,
  overdueMonthDrill,
  RISK_OF_LOSS,
} from '@/views/talent/engine/charts'
import type { CoverageByUnitRow } from '@/views/talent/engine/performance'
import { FIGURE_METRIC, TALENT_METRIC as M } from '@/views/talent/engine/settings'
import { COVERAGE_ORDER, type RoleRow } from '@/views/talent/engine/succession'
import { exposureLabel } from '@/views/talent/ui/ChartFigures'
import { distributionColumns, roleColumns } from '@/views/talent/ui/columns'
import { defsFor, TERM } from '@/views/talent/ui/defs'
import { GuidelineColumns } from '@/views/talent/ui/GuidelineColumns'
import { HOME_SHOWN } from '../engine/attention'
import { tile } from '../engine/kpis'
import { coverageParts, type HipoRow, highPotentials } from '../engine/talent'
import { AttentionSection } from './Attention'
import { Hero, ListFigure, ListSwitch } from './Frames'
import { useHomeItems } from './useHomeItems'

/* ───────── succession coverage ───────── */

function Coverage({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const s = m.succession
  const critical = s.roles.filter((r) => r.criticality === 'Critical')
  const parts = coverageParts(critical)
  const byCoverage = (c: string) => critical.filter((r) => r.coverage === c)
  const columns: Column<(typeof parts)[number]>[] = [
    { key: 'label', label: 'Best successor readiness' },
    {
      key: 'count',
      label: 'Critical roles',
      format: 'int',
      drill: (r) =>
        r.count
          ? m.drill.roles(byCoverage(r.key), `Critical roles, best successor ${r.label.toLowerCase()}`)
          : null,
    },
    { key: 'share', label: 'Share', format: 'pct' },
  ]
  return (
    <Hero
      id="home-talent-coverage"
      metric={M.criticalCoverage}
      uses={m.uses['talent-succession-coverage']}
      title="Succession coverage"
      subtitle="Critical roles with a successor ready now, and every critical role by its best successor"
      value={s.coverage == null ? '—' : fmt(s.coverage, 'pct0')}
      valueDrill={s.criticalCovered ? m.drill.coverage() : null}
      valueLabel="Show the critical roles with a successor ready now"
      label="of critical roles covered"
      line={`${fmt(s.criticalCovered, 'int')} of ${plural(s.critical, 'critical role')} have a ready-now successor · as of ${formatDate(ctx.asOf)}`}
      parts={parts}
      unit="critical roles"
      onSegment={(key) =>
        drill(m.drill.roles(byCoverage(key), `Critical roles, best successor ${key.toLowerCase()}`))
      }
      ariaLabel="Critical roles by the readiness of their best successor"
      data={parts}
      columns={columns}
      definitions={defsFor(ctx.metrics, [M.criticalCoverage, M.bestReadiness])}
      note={`${plural(critical.length, 'critical role')} planned · as of ${formatDate(ctx.asOf)}`}
      empty={
        !m.has.succession
          ? 'Upload Succession to see coverage.'
          : critical.length
            ? null
            : 'No critical roles are planned in this scope.'
      }
    />
  )
}

/* ───────── succession exposure ───────── */

function Exposure({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const ex = m.charts.exposure.All
  const risks = RISK_OF_LOSS.filter((r) => r !== 'Not rated' || ex.notRated > 0)
  const cells = ex.cells.filter((c) => risks.includes(c.risk))
  const roles = (c: ExposureCell) =>
    m.drill.roles(
      c.list,
      `${exposureLabel(c)}: ${plural(c.roles, 'role')}`,
      'Critical and key roles by the incumbent’s risk of loss and the readiness of the best successor still employed.',
    )
  return (
    <Figure
      id="home-talent-exposure"
      uses={m.uses['talent-succession-exposure']}
      metric={FIGURE_METRIC['talent-succession-exposure']}
      title="Succession exposure"
      subtitle="Planned critical and key roles by the incumbent’s risk of loss and the readiness of the best successor"
      data={cells}
      columns={[
        { key: 'risk', label: 'Risk of loss', format: 'text' },
        { key: 'readiness', label: 'Best successor', format: 'text' },
        { key: 'roles', label: 'Roles', format: 'int', drill: (c) => (c.roles ? roles(c) : null) },
      ]}
      definitions={defsFor(
        ctx.metrics,
        [M.exposure, M.bestReadiness],
        [m.riskShown ? TERM.riskOfLoss : TERM.riskOfLossPlan],
      )}
      note={`${plural(ex.exposed, 'role')} at high risk with no successor, of ${plural(ex.total, 'role')} · as of ${formatDate(ctx.asOf)}`}
      span={8}
      empty={
        !m.has.succession
          ? 'Upload Succession to see this.'
          : ex.total
            ? null
            : 'No critical or key roles are planned in this scope.'
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
        rowHeight={40}
        selectable={(c) => c.roles > 0}
        ariaLabel="Planned roles by risk of loss and best successor readiness"
        onSelect={(c) => {
          if (c.roles) drill(roles(c))
        }}
      />
    </Figure>
  )
}

/* ───────── overdue training ───────── */

function OverdueTrend({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const t = m.charts.overdueTrend
  const height = useChartHeight('standard')
  const last = t.totals.at(-1)
  const peak = t.totals.reduce<(typeof t.totals)[number] | null>(
    (best, x) => (!best || x.overdue > best.overdue ? x : best),
    null,
  )
  const segment = (d: OverdueMonthRow) =>
    d.overdue ? () => overdueMonthDrill({ ctx }, t, d.month, d.course) : null
  const whole = (d: { month: string }) => () => overdueMonthDrill({ ctx }, t, d.month, null)
  return (
    <Figure
      id="home-talent-overdue-trend"
      uses={m.uses['talent-overdue-trend']}
      metric={FIGURE_METRIC['talent-overdue-trend']}
      title="Required training overdue"
      subtitle={`Assignments past due and not completed at each month end, by course, to ${formatDate(ctx.asOf)}`}
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
      }`}
      span={4}
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
  )
}

/* ───────── my list ───────── */

const STATUS_TONE: Record<RoleRow['status'], Severity> = {
  Covered: 'good',
  Thin: 'warning',
  'No successor': 'critical',
}

type ListKey = 'roles' | 'hipos'

function MyList({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const [list, setList] = useState<ListKey>('roles')
  const roles = m.succession.roles.filter((r) => r.criticality === 'Critical')
  const hipos = highPotentials(m.nineBox, m.riskShown, ctx.org.byId)
  const actions = (
    <ListSwitch<ListKey>
      value={list}
      onChange={setList}
      options={[
        { value: 'roles', label: `Critical roles (${fmt(roles.length, 'int')})` },
        { value: 'hipos', label: `High potentials (${fmt(hipos.length, 'int')})` },
      ]}
    />
  )
  if (list === 'hipos') {
    const columns: Column<HipoRow>[] = [
      { key: 'name', label: 'Name' },
      { key: 'jobTitle', label: 'Title' },
      { key: 'department', label: 'Department' },
      { key: 'location', label: 'Location' },
      { key: 'level', label: 'Level' },
      { key: 'manager', label: 'Manager' },
      {
        key: 'rating',
        label: 'Latest annual rating',
        format: 'int',
        drill: (r) => drillSpec({ kind: 'employees', title: r.name, rows: [r.employee] }),
      },
      { key: 'box', label: '9-box' },
      ...(m.riskShown ? [{ key: 'riskBand', label: 'Flight risk band' } as Column<HipoRow>] : []),
    ]
    return (
      <ListFigure<HipoRow>
        metric={M.nineBox}
        uses={m.uses['talent-nine-box']}
        title="High potentials"
        subtitle={`People assessed high potential in ${m.nineBox.cycle?.cycle ?? 'the latest annual cycle'}, the top row of the 9-box`}
        rows={hipos}
        columns={columns}
        definitions={defsFor(ctx.metrics, [M.nineBox, M.highPotentials], [TERM.latestCycle])}
        note={`${plural(hipos.length, 'person', 'people')} · a row opens the person`}
        actions={actions}
        onRowClick={(r) => openPerson(r.employeeId)}
        empty={
          m.has.reviews ? 'Nobody in this scope is assessed high potential.' : 'Upload Reviews to see this.'
        }
      />
    )
  }
  const columns: Column<RoleRow>[] = [
    ...roleColumns(m.drill, m.riskShown).filter((c) => c.key !== 'roleId' && c.key !== 'department'),
    { key: 'businessUnit', label: 'Business unit' },
  ]
  return (
    <ListFigure<RoleRow>
      metric={M.roleStatus}
      uses={m.uses['talent-critical-roles']}
      title="Critical roles"
      subtitle="Each critical role with its incumbent, bench and status, the least covered first"
      rows={[...roles].sort(
        (a, b) => COVER_RANK[a.status] - COVER_RANK[b.status] || a.roleTitle.localeCompare(b.roleTitle),
      )}
      columns={columns}
      definitions={defsFor(
        ctx.metrics,
        [M.roleStatus, M.bestReadiness],
        [m.riskShown ? TERM.riskOfLoss : TERM.riskOfLossPlan],
      )}
      note={`${plural(roles.length, 'critical role')} · as of ${formatDate(ctx.asOf)} · a row opens the role's succession records`}
      actions={actions}
      rowTone={(r) => STATUS_TONE[r.status]}
      onRowClick={(r) => drill(m.drill.roles([r], `${r.roleTitle}: succession`))}
      empty={
        m.has.succession ? 'No critical roles are planned in this scope.' : 'Upload Succession to see this.'
      }
    />
  )
}

const COVER_RANK: Record<RoleRow['status'], number> = { 'No successor': 0, Thin: 1, Covered: 2 }

/* ───────── reviews ───────── */

function ReviewCoverage({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const rows = m.performance.coverageByUnit
  const cycle = m.performance.cycle?.cycle
  const open = (r: CoverageByUnitRow) =>
    r.unrated.length
      ? drillSpec({
          kind: 'employees',
          title: `Not rated in ${cycle ?? 'the latest cycle'}, ${r.businessUnit}`,
          rows: r.unrated,
          note: 'Active employees with no rating in the latest cycle.',
        })
      : null
  return (
    <Figure
      id="home-talent-review-coverage"
      uses={m.uses['talent-rating-distribution']}
      metric={M.ratedCoverage}
      title="Rated in the latest cycle by business unit"
      subtitle={`Active employees with a rating in ${cycle ?? 'the latest cycle'}, against 100%`}
      data={rows}
      columns={[
        { key: 'businessUnit', label: 'Business unit' },
        { key: 'active', label: 'Active employees', format: 'int' },
        { key: 'rated', label: 'Rated', format: 'int' },
        { key: 'share', label: 'Rated share', format: 'pct', drill: open },
      ]}
      definitions={defsFor(ctx.metrics, [M.ratedCoverage], [TERM.latestCycle])}
      note={`Units under ${m.settings.minGroup} people are hidden · as of ${formatDate(ctx.asOf)}`}
      span={6}
      empty={
        !m.has.reviews
          ? 'Upload Reviews to see this.'
          : rows.length
            ? null
            : 'No ratings in the latest cycle for this scope.'
      }
    >
      <BulletList<CoverageByUnitRow>
        data={rows}
        label="businessUnit"
        value="share"
        target={() => 1}
        format={(_, v) => fmt(v, 'pct')}
        scale="shared"
        status={(r) =>
          r.share == null
            ? null
            : r.share >= 0.995
              ? { tone: 'good', label: 'Done' }
              : { tone: 'warning', label: `${fmt(r.unrated.length, 'int')} not rated` }
        }
        selectable={(r) => r.unrated.length > 0}
        onSelect={(r) => drill(open(r))}
        ariaLabel="Share of active employees rated in the latest cycle, by business unit"
      />
    </Figure>
  )
}

function RatingMix({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const perf = m.performance
  const cycle = perf.cycle?.cycle
  return (
    <Figure
      id="home-talent-rating-mix"
      uses={m.uses['talent-rating-distribution']}
      metric={FIGURE_METRIC['talent-rating-distribution']}
      title="Rating distribution against the guideline"
      subtitle={cycle ? `Share of people at each rating, ${cycle}` : 'Share of people at each rating'}
      data={perf.distribution}
      columns={distributionColumns(m.drill)}
      definitions={defsFor(ctx.metrics, [M.ratingDistribution, M.highPerformers], [TERM.latestCycle])}
      note={`${plural(perf.rated, 'person', 'people')} rated · as of ${formatDate(ctx.asOf)}`}
      span={6}
      empty={
        !m.has.reviews
          ? 'Upload Reviews to see the rating distribution.'
          : perf.rated < m.settings.minGroup
            ? `Fewer than ${m.settings.minGroup} people are rated in this scope, so the distribution is hidden to protect anonymity.`
            : null
      }
    >
      <GuidelineColumns
        data={perf.distribution}
        drillFor={(d) => m.drill.rating(d.rating)}
        height={220}
        minGroup={m.settings.minGroup}
        ariaLabel="Rating distribution compared with the guideline"
      />
    </Figure>
  )
}

/* ───────── page ───────── */

export function TalentHome() {
  const ctx = useAnalytics()
  const m = talentModel(ctx)
  const items = useHomeItems()
  const k = m.kpis
  const kpis: Kpi[] = [
    ...tile(k, 'talent-rated', { view: 'talent', tab: 'performance', label: 'Talent, Performance' }),
    ...tile(k, 'talent-high-performers', {
      view: 'talent',
      tab: 'performance',
      label: 'Talent, Performance',
    }),
    ...tile(k, 'talent-high-potentials', {
      view: 'talent',
      tab: 'succession',
      label: 'Talent, Potential & succession',
    }),
    ...tile(k, 'talent-key-talent-risk', {
      view: 'talent',
      tab: 'retention',
      label: 'Talent, Retention risk',
    }),
    ...tile(k, 'talent-training-on-time', { view: 'talent', tab: 'learning', label: 'Talent, Learning' }),
    ...tile(k, 'talent-regretted-high', {
      view: 'talent',
      tab: 'retention',
      label: 'Talent, Retention risk',
    }),
  ]
  return (
    <>
      <Grid>
        <Coverage m={m} />
        <KpiStrip id="home-talent-kpis" title="Key figures" kpis={kpis} span={8} />
        <Exposure m={m} />
        <OverdueTrend m={m} />
      </Grid>
      <AttentionSection
        items={items}
        shown={HOME_SHOWN}
        dek="Talent management's open items: critical roles without a ready successor, required courses below target, ratings missing and stay risk."
      />
      <Section
        title="My list"
        dek="The critical roles and their bench, or the high potentials to develop and keep."
      >
        <MyList m={m} />
      </Section>
      <Section
        title="Reviews"
        dek="Whether everyone was rated in the latest cycle, and how the ratings compare with the guideline."
      >
        <ReviewCoverage m={m} />
        <RatingMix m={m} />
      </Section>
    </>
  )
}
