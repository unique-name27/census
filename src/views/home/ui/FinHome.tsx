/**
 * Finance's home (docs/ROLES-V2.md 5.10, with "Decisions made": actual against the headcount and
 * cost budget, falling back to the hiring plan when no budget is loaded). Headcount against budget
 * leads (or starts against the plan year to date); then the key figures, headcount against budget
 * by month (or plan against actual) and cost by business unit; Needs attention (Finance's plan
 * items); My list, the plan lines behind (or cost centers); open reqs against the plan, the
 * workforce mix and cost by cost center. Every amount is a total over 5 or more people (the cost
 * guard); every drill lists people without amounts, and no row is about one person's pay.
 */
import { useState } from 'react'
import { BulletList, type Column, Figure, HBars, Lines } from '@/charts'
import { Grid, goTo, KpiStrip, Section } from '@/components'
import type { Kpi } from '@/components/types'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { effectiveLists, useLists } from '@/data/lists'
import { drill } from '@/drill/Drill'
import { drillSpec } from '@/drill/types'
import { BUDGET_STATUS_LABEL, type BudgetMonthRow, type BudgetRow } from '@/lib/budget'
import { addDays, formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { isActiveAt } from '@/lib/people'
import { COST_BY_CENTER_COLUMNS, COST_BY_UNIT_COLUMNS, type CostCenterRow } from '@/views/comp/columns'
import { costTableColumns } from '@/views/comp/drillColumns'
import { type CostModel, costPeopleDrill, drawable, topCostCenters } from '@/views/comp/engine/cost'
import { FIGURE_METRIC as COMP_FIGURE } from '@/views/comp/engine/definitions'
import { type CompModel, compModel } from '@/views/comp/engine/model'
import { M as COMP } from '@/views/comp/metrics'
import { CostByCenterChart, CostByUnitChart } from '@/views/comp/tabs/Cost'
import { hrbpModel } from '@/views/hrbp/engine'
import { joinedLeftSpec } from '@/views/hrbp/engine/drill'
import { FIGURE } from '@/views/hrbp/engine/lineage'
import { CONTINGENT } from '@/views/hrbp/engine/workforce'
import { ID } from '@/views/hrbp/metrics'
import { mixDrill } from '@/views/hrbp/ui/drill'
import { computeOnboarding, type OnboardingModel } from '@/views/onboarding/engine'
import { employeesDrill, planDrill, reqsDrill, startsDrill } from '@/views/onboarding/engine/drills'
import { ACTUAL, OPEN_REQS, PLAN, PLAN_REQ, UPCOMING, union } from '@/views/onboarding/engine/lineage'
import { cumulative, type PlanModel } from '@/views/onboarding/engine/plan'
import { M as ONBOARDING } from '@/views/onboarding/metrics'
import { coverageRowDrills } from '@/views/onboarding/ui/drill'
import { computeRecruiting } from '@/views/recruiting/engine'
import { HOME_SHOWN } from '../engine/attention'
import {
  type BehindRow,
  behindRows,
  budgetParts,
  comparable,
  planParts,
  REQ_SERIES,
  type ReqPlanRow,
  type ReqPlanSegment,
  reqsAgainstPlan,
  type UnitPart,
} from '../engine/fin'
import { tile } from '../engine/kpis'
import { AttentionSection } from './Attention'
import { Hero, ListFigure, ListSwitch } from './Frames'
import { useHomeItems } from './useHomeItems'

const money = (v: number | null) => fmt(v, 'money')
const planUses = union(PLAN, PLAN_REQ)

/** Cost center names from the Cost centers list in force (official, else proposed from the data). */
function useCenterNames(): ReadonlyMap<string, string> {
  const ctx = useAnalytics()
  const saved = useLists((s) => s.state)
  const values = effectiveLists(saved, ctx.all, ctx.sources).costCenter?.values ?? []
  const out = new Map<string, string>()
  for (const v of values) {
    const name = v.attrs?.name
    if (typeof name === 'string' && name) out.set(v.value, name)
  }
  return out
}

/** A budget row's employees, as roster rows (counts only, never amounts). */
function budgetEmployees(title: string, row: Pick<BudgetRow, 'employees'>, note?: string) {
  if (!row.employees.length) return null
  return drillSpec({ kind: 'employees', title, rows: row.employees.slice(), note })
}

/* ───────── the hero ───────── */

function VsBudget({ m }: { m: CompModel }) {
  const b = m.cost.budget
  if (!comparable(b)) return null
  const t = b.total
  const parts = budgetParts(b)
  const month = b.month ? formatMonth(`${b.month}-01`) : 'the compared month'
  const unitsOf = (key: string) => {
    const p = parts.find((x) => x.key === key)
    if (!p) return null
    const rows = b.byUnit.filter((r) => r.businessUnit && p.units.includes(r.businessUnit))
    return drillSpec({
      kind: 'employees',
      title: `${p.label}: ${p.units.join(', ')}`,
      rows: rows.flatMap((r) => r.employees),
      note: `Employees in the business units ${p.label.toLowerCase()} on headcount in ${month}.`,
    })
  }
  return (
    <Hero<UnitPart>
      id="home-fin-vs-plan"
      metric={COMP.headcountVsBudget}
      uses={m.uses['comp-cost-budget-headcount']}
      title="Headcount against budget"
      subtitle={`Employees against budget headcount in ${month}, and each business unit's standing`}
      value={t.budgetHeadcount ? fmt(t.headcount / t.budgetHeadcount, 'pct') : '—'}
      valueDrill={budgetEmployees(`Headcount, ${month}`, t)}
      valueLabel="Show the employees counted"
      label={`of budget: ${fmt(t.headcount, 'int')} employees against ${fmt(t.budgetHeadcount, 'int')}`}
      line={`${b.version ?? 'Budget'} · measured ${formatDate(b.date)}`}
      parts={parts}
      unit="business units"
      onSegment={(key) => drill(unitsOf(key))}
      ariaLabel="Business units by headcount against budget"
      data={parts}
      columns={[
        { key: 'label', label: 'Headcount against budget' },
        {
          key: 'count',
          label: 'Business units',
          format: 'int',
          drill: (r) => (r.count ? unitsOf(r.key) : null),
        },
        { key: 'people', label: 'Employees', format: 'int' },
      ]}
      definitions={m.definitions['comp-cost-budget-headcount']}
      note={[
        `${plural(t.headcount, 'employee')} against a budget of ${fmt(t.budgetHeadcount, 'int')}`,
        ...b.notes,
      ].join(' · ')}
    />
  )
}

function VsPlan({ o }: { o: OnboardingModel }) {
  const { access } = useAnalytics()
  const p = o.plan
  const b = o.base
  const tileKpi = o.kpis.plan.find((k) => k.id === 'vs-plan')
  if (!p)
    return (
      <Hero<UnitPart>
        id="home-fin-vs-plan"
        metric={ONBOARDING.vsPlan}
        title="Starts against plan"
        value="—"
        label="year to date"
        parts={[]}
        unit="business units"
        ariaLabel="Business units by starts against plan"
        data={[]}
        columns={[{ key: 'label', label: 'Status' }]}
        empty="No hiring plan or headcount and cost budget is loaded, so there is nothing to compare against."
        emptyAction={
          access.can('page:data') ? (
            <Button size="sm" onClick={() => goTo('data')}>
              Open the Data room
            </Button>
          ) : undefined
        }
      />
    )
  const parts = planParts(p)
  const unitsOf = (key: string) => {
    const part = parts.find((x) => x.key === key)
    if (!part) return null
    const lines = p.views.filter((v) => part.units.includes(v.line.businessUnit))
    return planDrill(b, lines, `Plan lines, ${part.label.toLowerCase()}: ${part.units.join(', ')}`, {
      uses: planUses,
    })
  }
  return (
    <Hero<UnitPart>
      id="home-fin-vs-plan"
      metric={ONBOARDING.vsPlan}
      uses={tileKpi?.uses ?? planUses}
      title="Starts against plan"
      subtitle={`Starts year to date against the ${p.version ?? 'hiring'} plan, and each business unit's standing`}
      value={p.vsPlan == null ? '—' : fmt(p.vsPlan, 'pct0')}
      valueDrill={tileKpi?.drill}
      valueLabel="Show the starts to date"
      label={`of plan to date: ${fmt(p.actual.length, 'int')} of ${fmt(p.planYtd, 'int')}`}
      line={`No budget is loaded, so Census compares with the hiring plan · as of ${formatDate(b.asOf)}`}
      parts={parts}
      unit="business units"
      onSegment={(key) => drill(unitsOf(key))}
      ariaLabel="Business units by starts against plan"
      data={parts}
      columns={[
        { key: 'label', label: 'Plan status' },
        {
          key: 'count',
          label: 'Business units',
          format: 'int',
          drill: (r) => (r.count ? () => unitsOf(r.key) : null),
        },
        { key: 'people', label: 'Starts to date', format: 'int' },
      ]}
      note={`${fmt(p.planFull, 'int')} planned for the year · as of ${formatDate(b.asOf)}`}
    />
  )
}

/* ───────── lead chart: by month ───────── */

function BudgetByMonth({ m }: { m: CompModel }) {
  const b = m.cost.budget
  if (!comparable(b)) return null
  const rows = b.byMonth.map((r) => ({ ...r, monthLabel: formatMonth(r.period) }))
  type Row = (typeof rows)[number]
  const lines = rows.flatMap((r) => [
    { period: r.period, series: 'Budget', value: r.budgetHeadcount, row: r },
    ...(r.headcount == null ? [] : [{ period: r.period, series: 'Headcount', value: r.headcount, row: r }]),
  ])
  const month = (r: BudgetMonthRow & { monthLabel: string }) =>
    budgetEmployees(`Headcount, ${r.monthLabel}`, r, `Employees active on ${formatDate(r.date)}.`)
  const columns: Column<Row>[] = [
    { key: 'monthLabel', label: 'Month', sortValue: (r) => r.month },
    {
      key: 'budgetHeadcount',
      label: 'Budget headcount',
      format: 'int',
      drill: (r) =>
        r.lines.length
          ? () => drillSpec({ kind: 'budget', title: `Budget lines, ${r.monthLabel}`, rows: r.lines.slice() })
          : null,
    },
    { key: 'headcount', label: 'Headcount', format: 'int', drill: (r) => () => month(r) },
    { key: 'headcountVariance', label: 'Headcount vs budget', format: 'int' },
  ]
  return (
    <Figure
      id="home-fin-plan"
      uses={m.uses['comp-cost-budget-trend']}
      metric={COMP_FIGURE['comp-cost-budget-trend']}
      title="Headcount against budget by month"
      subtitle={`Employees at each month end against budget headcount, ${b.version ?? 'the budget'}`}
      data={rows}
      columns={columns}
      definitions={m.definitions['comp-cost-budget-trend']}
      note={[b.version, ...b.notes].filter(Boolean).join(' · ')}
      span={8}
      empty={rows.length ? null : 'No budget months in this scope.'}
    >
      <Lines
        data={lines}
        x="period"
        y="value"
        series="series"
        seriesOrder={['Headcount', 'Budget']}
        emphasize="Headcount"
        format="int"
        onSelect={(d) => drill(month(d.row))}
      />
    </Figure>
  )
}

function PlanByMonth({ o }: { o: OnboardingModel }) {
  const p = o.plan
  const b = o.base
  if (!p) return null
  const cum = cumulative(p, b.asOf)
  const byMonth = new Map(p.months.map((x) => [x.month, x]))
  const rows = p.months.map((x) => ({
    month: x.month,
    monthName: formatMonth(`${x.month}-01`),
    plan: x.plan,
    actual: x.month <= b.asOf.slice(0, 7) ? x.actual : null,
    committed: x.committed,
    forecast: Math.round(x.forecast * 10) / 10,
  }))
  type Row = (typeof rows)[number]
  const planOf = (r: Row) =>
    r.plan
      ? () =>
          planDrill(
            b,
            p.views.filter((v) => v.month === r.month),
            `Planned starts, ${r.monthName}`,
            { uses: planUses },
          )
      : null
  const actualOf = (r: Row) =>
    r.actual
      ? () =>
          employeesDrill(b, byMonth.get(r.month)?.actualPeople ?? [], `Starts in ${r.monthName}`, {
            uses: ACTUAL,
          })
      : null
  const committedOf = (r: Row) =>
    r.committed
      ? () =>
          startsDrill(b, byMonth.get(r.month)?.committedStarts ?? [], `Committed starts, ${r.monthName}`, {
            uses: UPCOMING,
          })
      : null
  return (
    <Figure
      id="home-fin-plan"
      uses={union(PLAN, ACTUAL, UPCOMING)}
      metric={ONBOARDING.vsPlanByMonth}
      title="Plan against actual, cumulative"
      subtitle={`Cumulative starts by month: planned, started, committed and forecast, ${p.version ?? 'the plan'}`}
      data={rows}
      columns={[
        { key: 'monthName', label: 'Month', sortValue: (r) => r.month },
        { key: 'plan', label: 'Planned starts', format: 'int', drill: planOf },
        { key: 'actual', label: 'Actual starts', format: 'int', drill: actualOf },
        { key: 'committed', label: 'Committed starts', format: 'int', drill: committedOf },
        { key: 'forecast', label: 'Forecast starts', format: 'num1' },
      ]}
      note={`${fmt(p.planFull, 'int')} planned · ${fmt(p.actual.length, 'int')} started · ${fmt(p.committed.length, 'int')} committed · as of ${formatDate(b.asOf)}`}
      span={8}
    >
      <Lines
        data={cum}
        x="month"
        y="starts"
        series="series"
        seriesOrder={['Plan', 'Actual', 'Committed', 'Forecast']}
        emphasize="Actual"
        format="int"
        zero
        xTicks="quarter"
        onSelect={(d) => {
          const r = rows.find((x) => x.month === d.month)
          if (!r) return
          drill(d.series === 'Plan' ? planOf(r) : d.series === 'Actual' ? actualOf(r) : committedOf(r))
        }}
      />
    </Figure>
  )
}

/* ───────── cost by business unit ───────── */

function CostByUnit({ m }: { m: CompModel }) {
  const c = m.cost
  const b = c.budget
  if (comparable(b)) {
    const units = b.byUnit.filter((r) => r.costUsd != null)
    const status = (s: BudgetRow['costStatus']) =>
      s
        ? {
            tone: s === 'over' ? ('warning' as const) : s === 'on' ? ('good' as const) : ('none' as const),
            label: BUDGET_STATUS_LABEL[s],
          }
        : null
    const people = (r: BudgetRow) =>
      budgetEmployees(
        `Workforce cost, ${r.label}`,
        r,
        'Employees whose target cash the cost counts; no amounts are listed.',
      )
    return (
      <Figure
        id="home-fin-cost-unit"
        uses={m.uses['comp-cost-budget-cost']}
        metric={COMP.costVsBudget}
        title="Monthly cost against budget"
        subtitle="Employees' target cash and the contractor estimate, USD a month, by business unit"
        data={b.byUnit}
        columns={[
          { key: 'label', label: 'Business unit' },
          { key: 'costed', label: 'People costed', format: 'int', drill: (r) => () => people(r) },
          { key: 'budgetCostUsd', label: 'Budget cost a month (USD)', format: 'moneyFull', cost: true },
          { key: 'costUsd', label: 'Cost a month (USD)', format: 'moneyFull', cost: true },
          { key: 'costVarianceUsd', label: 'Cost vs budget (USD)', format: 'moneyFull', cost: true },
          { key: 'costVariancePct', label: 'Cost vs budget (%)', format: 'deltaPct' },
        ]}
        definitions={m.definitions['comp-cost-budget-cost']}
        note={`Totals cover groups of 5 or more people · ${[b.version, ...b.notes].filter(Boolean).join(' · ')}`}
        span={4}
        empty={
          !c.shown
            ? 'Cost totals show in Finance mode, or with Show pay amounts on.'
            : units.length
              ? null
              : 'No budget cost to compare in this scope.'
        }
      >
        <BulletList<BudgetRow>
          data={units}
          label="label"
          value="costUsd"
          target="budgetCostUsd"
          format={(_, v) => money(v)}
          status={(r) => status(r.costStatus)}
          onSelect={(r) => drill(() => people(r))}
        />
      </Figure>
    )
  }
  return (
    <Figure
      id="home-fin-cost-unit"
      uses={m.uses['comp-cost-by-unit']}
      metric={COMP_FIGURE['comp-cost-by-unit']}
      title="Workforce cost by business unit"
      subtitle="Base, bonus at target and equity, USD a year"
      data={c.byUnit}
      columns={costTableColumns(c, COST_BY_UNIT_COLUMNS)}
      definitions={m.definitions['comp-cost-by-unit']}
      note={`Totals cover groups of 5 or more people · ${plural(c.total.people, 'person', 'people')} costed`}
      span={4}
      empty={
        !c.shown
          ? 'Cost totals show in Finance mode, or with Show pay amounts on.'
          : drawable(c.byUnit).length
            ? null
            : 'No cost totals in this scope.'
      }
    >
      <CostByUnitChart c={c} />
    </Figure>
  )
}

/* ───────── my list ───────── */

type ListKey = 'behind' | 'centers'

function MyList({ m, o }: { m: CompModel; o: OnboardingModel }) {
  const ctx = useAnalytics()
  const names = useCenterNames()
  const p = o.plan
  const [list, setList] = useState<ListKey>(p ? 'behind' : 'centers')
  const behind = p ? behindRows(p) : []
  const c = m.cost
  const centers: CostCenterRow[] = c.byCostCenter.map((r) => ({ ...r, name: names.get(r.key) ?? null }))
  const actions = (
    <ListSwitch<ListKey>
      value={list}
      onChange={setList}
      options={[
        ...(p
          ? [{ value: 'behind' as const, label: `Plan lines behind (${fmt(behind.length, 'int')})` }]
          : []),
        { value: 'centers' as const, label: `Cost centers (${fmt(centers.length, 'int')})` },
      ]}
    />
  )
  if (list === 'behind' && p) {
    const b = o.base
    const where = (r: BehindRow) => `${r.department}, ${r.businessUnit}`
    const drills = new Map(
      behind.map((r) => [
        r.row,
        coverageRowDrills(b, p, r.row, where(r), {
          plan: planUses,
          actual: ACTUAL,
          gap: union(planUses, UPCOMING),
        }),
      ]),
    )
    const d = (r: BehindRow) => drills.get(r.row)!
    const columns: Column<BehindRow>[] = [
      { key: 'businessUnit', label: 'Business unit' },
      { key: 'department', label: 'Department' },
      { key: 'planYtd', label: 'Plan to date', format: 'int', drill: (r) => d(r).planYtd },
      { key: 'actualYtd', label: 'Actual to date', format: 'int', drill: (r) => d(r).actualYtd },
      { key: 'vsPlan', label: 'Vs plan', format: 'pct' },
      { key: 'committed', label: 'Committed', format: 'int', drill: (r) => d(r).committed },
      { key: 'openReqs', label: 'Open reqs', format: 'int', drill: (r) => d(r).openReqs },
      { key: 'forecast', label: 'Forecast', format: 'num1', drill: (r) => d(r).forecast },
      { key: 'gap', label: 'Full-year gap', format: 'int', drill: (r) => d(r).gap },
      { key: 'planFull', label: 'Full-year plan', format: 'int', drill: (r) => d(r).planFull },
      { key: 'status', label: 'Status' },
    ]
    return (
      <ListFigure<BehindRow>
        metric={ONBOARDING.gap}
        uses={planUses}
        title="Plan lines behind"
        subtitle={`Departments whose starts to date are behind the ${p.version ?? 'hiring'} plan, the largest full-year gap first`}
        rows={behind}
        columns={columns}
        note={`${plural(behind.length, 'department')} behind · as of ${formatDate(b.asOf)} · a row opens its plan lines`}
        actions={actions}
        rowTone={(r) =>
          r.planFull && r.gap / r.planFull >= b.settings.behindCritical ? 'critical' : 'warning'
        }
        onRowClick={(r) => drill(d(r).planFull)}
        empty="No department is behind the plan to date."
      />
    )
  }
  return (
    <ListFigure<CostCenterRow>
      metric={COMP_FIGURE['comp-cost-by-cost-center']}
      uses={m.uses['comp-cost-by-cost-center']}
      title="Cost centers"
      subtitle="Headcount and cost totals by cost center, USD a year; groups under 5 people fold into Other"
      rows={centers}
      columns={costTableColumns(c, COST_BY_CENTER_COLUMNS)}
      definitions={m.definitions['comp-cost-by-cost-center']}
      note={`Totals cover groups of 5 or more people · ${ctx.scopeLabel} · as of ${formatDate(c.asOf)}`}
      actions={actions}
      onRowClick={(r) => drill(costPeopleDrill(c, `Workforce cost, ${r.group}`, r.members ?? []))}
      empty={
        !c.shown
          ? 'Cost totals show in Finance mode, or with Show pay amounts on.'
          : centers.length
            ? null
            : 'No cost centers on the roster in this scope.'
      }
    />
  )
}

/* ───────── reqs against the plan, worker mix, cost centers ───────── */

function ReqsAgainstPlan({ o }: { o: OnboardingModel }) {
  const ctx = useAnalytics()
  const p = o.plan
  const b = o.base
  const open = computeRecruiting(ctx).base.req.open
  const rows = p ? reqsAgainstPlan(p, open) : []
  const segments = rows.flatMap((r) => r.segments)
  const seg = (s: ReqPlanSegment) =>
    s.series === 'Planned, no req'
      ? planDrill(b, s.lines, `Planned roles with no req, ${s.group}`, { uses: planUses })
      : reqsDrill(b, s.reqs, `Open reqs, ${s.series.toLowerCase()}, ${s.group}`, { uses: OPEN_REQS })
  const cell = (series: (typeof REQ_SERIES)[number]) => (r: ReqPlanRow) => {
    const s = r.segments.find((x) => x.series === series)
    return s?.count ? () => seg(s) : null
  }
  return (
    <Figure
      id="home-fin-reqs-plan"
      uses={union(OPEN_REQS, planUses)}
      metric={ONBOARDING.notInPlan}
      title="Open reqs against the plan by business unit"
      subtitle="Open reqs on a plan line, on none (new roles, backfills apart), and planned roles with no open req"
      data={rows}
      columns={[
        { key: 'group', label: 'Business unit' },
        { key: 'inPlan', label: 'In the plan', format: 'int', drill: cell('In the plan') },
        { key: 'notInPlan', label: 'Not in the plan', format: 'int', drill: cell('Not in the plan') },
        { key: 'backfills', label: 'Backfills', format: 'int', drill: cell('Backfill') },
        { key: 'noReq', label: 'Planned, no req', format: 'int', drill: cell('Planned, no req') },
      ]}
      definitions={[
        ...(ctx.metrics.def(ONBOARDING.notInPlan)
          ? [{ term: 'Not in the plan', text: ctx.metrics.def(ONBOARDING.notInPlan)?.definition ?? '' }]
          : []),
        ...(ctx.metrics.def(ONBOARDING.noReq)
          ? [{ term: 'Planned, no req', text: ctx.metrics.def(ONBOARDING.noReq)?.definition ?? '' }]
          : []),
      ]}
      note={`${plural(open.length, 'open req')} · as of ${formatDate(b.asOf)}`}
      span={6}
      empty={
        p
          ? rows.length
            ? null
            : 'No open reqs or planned roles in this scope.'
          : 'Load a hiring plan to compare open reqs against it.'
      }
    >
      <HBars<ReqPlanSegment>
        data={segments}
        y="group"
        x="count"
        series="series"
        stack
        seriesOrder={[...REQ_SERIES]}
        yOrder={rows.map((r) => r.group)}
        format="int"
        onSelectSegment={(d) => drill(() => seg(d))}
        onSelect={(d) => drill(() => seg(d))}
        ariaLabel="Open reqs against the plan by business unit"
      />
    </Figure>
  )
}

function WorkerMix() {
  const ctx = useAnalytics()
  const m = hrbpModel(ctx)
  const p = m.prep
  const rows = m.workforce.mix.businessUnit
  const cell = mixDrill(p, 'businessUnit')
  const contingent = rows
    .filter((r) => (CONTINGENT as readonly string[]).includes(r.workerType))
    .reduce((n, r) => n + r.people, 0)
  const order = [...new Set(rows.map((r) => r.workerType))]
  return (
    <Figure
      id="home-fin-worker-mix"
      metric={ID.contingent}
      uses={p.uses(FIGURE.workerMix('businessUnit'))}
      title="Workforce mix"
      subtitle={`Active employees, contractors and interns by business unit on ${formatDate(ctx.asOf)}`}
      data={rows}
      columns={[
        { key: 'group', label: 'Business unit' },
        { key: 'workerType', label: 'Worker type' },
        { key: 'people', label: 'People', format: 'int', drill: cell },
        { key: 'share', label: 'Share of unit', format: 'pct', drill: cell },
      ]}
      definitions={p.defs(ID.contingent)}
      note={`${fmt(contingent, 'int')} contractors and interns, never costed · as of ${formatDate(ctx.asOf)}`}
      span={6}
      empty={rows.length ? null : 'No active workers in this scope.'}
    >
      <HBars
        data={rows}
        y="group"
        x="people"
        series="workerType"
        stack
        seriesOrder={order}
        onSelectSegment={(d) => drill(cell(d))}
        onSelect={(d) => drill(cell(d))}
        ariaLabel="Active workers by business unit and worker type"
      />
    </Figure>
  )
}

function CostByCenter({ m }: { m: CompModel }) {
  const names = useCenterNames()
  const c: CostModel = m.cost
  const top: CostCenterRow[] = topCostCenters(c, 8).map((r) => ({ ...r, name: names.get(r.key) ?? null }))
  return (
    <Figure
      id="home-fin-cost-center"
      uses={m.uses['comp-cost-by-cost-center']}
      metric={COMP_FIGURE['comp-cost-by-cost-center']}
      title="Workforce cost by cost center"
      subtitle="Target cash, USD a year, the 8 largest cost centers; the rest are Other in the table"
      data={top}
      columns={costTableColumns(c, COST_BY_CENTER_COLUMNS)}
      definitions={m.definitions['comp-cost-by-cost-center']}
      note={`Totals cover groups of 5 or more people · as of ${formatDate(c.asOf)}`}
      span={12}
      empty={
        !c.shown
          ? 'Cost totals show in Finance mode, or with Show pay amounts on.'
          : drawable(top).length
            ? null
            : 'No cost centers on the roster in this scope.'
      }
    >
      <CostByCenterChart c={c} rows={top} />
    </Figure>
  )
}

/* ───────── page ───────── */

export function FinHome() {
  const ctx = useAnalytics()
  const m = compModel(ctx)
  const o = computeOnboarding(ctx)
  const h = hrbpModel(ctx)
  const items = useHomeItems()
  const p: PlanModel | null = o.plan
  const budget = comparable(m.cost.budget)
  const prep = h.prep
  // Net change over 12 months: who joined and who left, as People stats counts them.
  const yearAgo = addDays(prep.t12.start, -1)
  const joined = prep.emps.filter((e) => isActiveAt(e, prep.asOf) && !isActiveAt(e, yearAgo))
  const left = prep.emps.filter((e) => !isActiveAt(e, prep.asOf) && isActiveAt(e, yearAgo))
  const net: Kpi = {
    id: 'net-change',
    metricId: ID.netChange,
    label: 'Net change, 12 months',
    value: prep.has.terminationDate ? joined.length - left.length : null,
    format: 'int',
    note: `${fmt(joined.length, 'int')} joined, ${fmt(left.length, 'int')} left`,
    drill:
      joined.length || left.length
        ? () =>
            joinedLeftSpec(prep, 'Joined and left, last 12 months', joined, left, { when: prep.t12.label })
        : undefined,
    uses: prep.uses(FIGURE.headcountTrend),
    link: { view: 'hrbp', tab: 'workforce', label: 'People stats, Workforce' },
  }
  const notInPlan: Kpi[] = p
    ? [
        {
          id: 'not-in-plan',
          metricId: ONBOARDING.notInPlan,
          label: 'Open reqs not in the plan',
          value: p.notInPlan.added.length,
          format: 'int',
          note: `${fmt(p.notInPlan.backfills.length, 'int')} backfills apart`,
          drill: p.notInPlan.added.length
            ? () => reqsDrill(o.base, p.notInPlan.added, 'Open reqs not in the plan', { uses: OPEN_REQS })
            : undefined,
          uses: union(OPEN_REQS, planUses),
          link: { view: 'onboarding', tab: 'plan', label: 'Onboarding, Hiring plan' },
        },
      ]
    : []
  const kpis: Kpi[] = [
    ...tile(h.kpi.kpis, 'headcount', { view: 'hrbp', tab: 'workforce', label: 'People stats, Workforce' }),
    net,
    ...tile(computeRecruiting(ctx).kpis, 'open-reqs', {
      view: 'recruiting',
      tab: 'requisitions',
      label: 'Recruiting, Requisitions',
    }),
    ...notInPlan,
    ...tile(m.cost.kpis, 'cost-contingent', {
      view: 'hrbp',
      tab: 'workforce',
      label: 'People stats, Workforce',
    }),
    ...tile(m.cost.kpis, 'cost-target-cash', {
      view: 'comp',
      tab: 'cost',
      label: 'Compensation, Workforce cost',
    }),
  ]
  return (
    <>
      <Grid>
        {budget ? <VsBudget m={m} /> : <VsPlan o={o} />}
        <KpiStrip id="home-fin-kpis" title="Key figures" kpis={kpis} span={8} />
        {budget ? <BudgetByMonth m={m} /> : p ? <PlanByMonth o={o} /> : null}
        <CostByUnit m={m} />
      </Grid>
      <AttentionSection
        items={items}
        shown={HOME_SHOWN}
        dek="Finance's open items: reqs not in the hiring plan, hiring behind plan by department, and planned roles with no open req."
      />
      <Section
        title="My list"
        dek={
          p
            ? 'The departments behind the hiring plan, or the cost centers.'
            : 'The cost centers, with headcount and cost totals.'
        }
      >
        <MyList m={m} o={o} />
      </Section>
      <Section
        title="Open roles and the workforce"
        dek="Open reqs against the plan, the mix of employees, contractors and interns, and where the cost sits."
      >
        <ReqsAgainstPlan o={o} />
        <WorkerMix />
        <CostByCenter m={m} />
      </Section>
    </>
  )
}
