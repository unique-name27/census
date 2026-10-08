/**
 * Workforce cost (`comp.cost`, docs/ROLES-V2.md 3.2): what the workforce costs a year, as totals
 * over groups of 5 or more people (the cost guard in `engine/cost.ts`), actual against the
 * headcount and cost budget when one is loaded (the hiring plan otherwise), merit spend against
 * budget and open reqs at range midpoint. In the switch modes the figures wait for "Show pay
 * amounts"; in Finance they always show and every drill lists employees, never their pay.
 */
import { BarList, BulletList, type Column, Columns, Figure, HBars, Lines } from '@/charts'
import { KpiStrip, RouteLink, Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { effectiveLists, useLists } from '@/data/lists'
import { LEVELS } from '@/data/schema'
import { Drill, type DrillSource, drill } from '@/drill'
import { drillSpec } from '@/drill/types'
import { BUDGET_STATUS_LABEL, type BudgetRow, type BudgetStatus } from '@/lib/budget'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { hiresVsPlan } from '@/views/onboarding/api'
import {
  BUDGET_CENTER_COLUMNS,
  BUDGET_COST_COLUMNS,
  BUDGET_HEADCOUNT_COLUMNS,
  BUDGET_MONTH_COLUMNS,
  type BudgetCenterRow,
  type BudgetTrendRow,
  type BudgetUnitRow,
  COST_BY_CENTER_COLUMNS,
  COST_BY_LEVEL_COLUMNS,
  COST_BY_SITE_COLUMNS,
  COST_BY_UNIT_COLUMNS,
  type CostCenterRow,
} from '../columns'
import { costTableColumns, meritCostColumns, openReqColumns, withDrill } from '../drillColumns'
import {
  type CostModel,
  type CostRow,
  costPeopleDrill,
  costRowDrill,
  drawable,
  isCosted,
  type OpenReqRow,
  openReqDrill,
} from '../engine/cost'
import type { SpendRow } from '../engine/cycle'
import { FIGURE_METRIC } from '../engine/definitions'
import { spendDrill } from '../engine/drill'
import type { CompModel } from '../engine/model'
import type { CompPerson } from '../engine/population'
import { COST_OFF, note, PaySwitch } from '../shared'

const money = (v: number | null) => fmt(v, 'money')
const PARTS = ['Base', 'Bonus at target', 'Equity'] as const
/** Over budget is the one to look at; under is said in words without a status color. */
const STATUS_TONE: Record<BudgetStatus, 'warning' | 'good' | 'none'> = {
  over: 'warning',
  under: 'none',
  on: 'good',
}
const budgetStatus = (s: BudgetStatus | null) =>
  s ? { tone: STATUS_TONE[s], label: BUDGET_STATUS_LABEL[s] } : null
const word = (s: BudgetStatus | null) => (s ? BUDGET_STATUS_LABEL[s] : null)

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

/** One stacked bar per business unit: base, bonus at target and equity. */
export function costParts(rows: readonly CostRow[]) {
  return drawable(rows).flatMap((r) => [
    { group: r.group, part: PARTS[0], usd: r.baseUsd, row: r },
    { group: r.group, part: PARTS[1], usd: r.bonusUsd, row: r },
    { group: r.group, part: PARTS[2], usd: r.equityUsd, row: r },
  ])
}

/** Workforce cost by business unit, stacked: the chart the Finance home reuses (`home-fin-cost-unit`). */
export function CostByUnitChart({ c }: { c: CostModel }) {
  const parts = costParts(c.byUnit)
  const open = (d: { row: CostRow }) => drill(costRowDrill(c, d.row, 'Workforce cost'))
  return (
    <HBars
      data={parts}
      y="group"
      x="usd"
      series="part"
      stack
      seriesOrder={[...PARTS]}
      yOrder={drawable(c.byUnit).map((r) => r.group)}
      format="money"
      onSelect={open}
      onSelectSegment={open}
    />
  )
}

/**
 * The named cost centers by target cash: the chart the Finance home reuses (`home-fin-cost-center`).
 * Other is far larger than any one cost center, so it stays in the table and the note
 * (`otherCentersNote`), where it does not flatten the bars.
 */
export function CostByCenterChart({ c, rows }: { c: CostModel; rows: readonly CostCenterRow[] }) {
  return (
    <BarList
      data={drawable(rows).filter((r) => !r.isOther) as CostCenterRow[]}
      label="group"
      value="targetCashUsd"
      format="money"
      sort="none"
      secondary={(d) => d.name ?? d.department ?? null}
      onSelect={(d) => drill(costRowDrill(c, d, 'Workforce cost'))}
    />
  )
}

/** "Other (80 cost centers): $141.2M": the folded cost centers the chart leaves to the table. */
export function otherCentersNote(rows: readonly CostRow[]): string | null {
  const other = rows.find((r) => r.isOther && r.targetCashUsd != null)
  return other ? `Other (${fmt(other.folded, 'int')} cost centers): ${money(other.targetCashUsd)}` : null
}

/** Merit spend against the budget in USD by business unit. */
function MeritCostChart({
  m,
  rows,
}: {
  m: CompModel
  rows: readonly (SpendRow & { budgetUsd: number | null })[]
}) {
  const flag = m.rules.overBudget.flag
  return (
    <BulletList
      data={rows}
      label="group"
      value="spendUsd"
      target="budgetUsd"
      format={(_, v) => money(v)}
      scale="row"
      status={(r) =>
        r.delta == null
          ? null
          : r.delta >= flag - 1e-9
            ? { tone: 'warning', label: 'Over budget' }
            : { tone: 'good', label: 'Within budget' }
      }
      onSelect={(r) =>
        drill(() =>
          m.cost.totals
            ? costPeopleDrill(m.cost, `Merit proposals, ${r.group}`, r.members.filter(isCosted))
            : spendDrill(m, r, 'priced'),
        )
      }
    />
  )
}

/** The fallback when no budget is loaded: hiring against the hiring plan (Onboarding's number). */
function PlanFallback() {
  const ctx = useAnalytics()
  const plan = hiresVsPlan(ctx)
  const shown = plan && ctx.access.can(`metric:${plan.metricId}`)
  return (
    <div className="col-span-full rounded-sheet bg-sheet px-4 py-4 text-small leading-snug text-ink-2 lg:px-5">
      <p>
        No headcount and cost budget is loaded, so Census compares hiring with the hiring plan instead. Load a
        budget to compare headcount and cost with it.
      </p>
      {shown && plan ? (
        <p className="mt-2">
          Starts against the plan year to date:{' '}
          <Drill spec={plan.kpi.drill ?? null} label={`Show the ${fmt(plan.actual, 'int')} starts`}>
            {fmt(plan.value, 'pct')}
          </Drill>{' '}
          ({fmt(plan.actual, 'int')} of {fmt(plan.planned, 'int')} planned
          {plan.status ? `, ${plan.status.toLowerCase()}` : ''}).{' '}
          <RouteLink view="onboarding" tab="plan" className="text-link underline-offset-2 hover:underline">
            Open the hiring plan
          </RouteLink>
        </p>
      ) : (
        <p className="mt-2">No hiring plan is loaded either.</p>
      )}
    </div>
  )
}

/** The employees a budget row counts, as their comp rows outside Finance. */
function budgetPeopleDrill(m: CompModel, title: string, row: Pick<BudgetRow, 'employees'>) {
  const ids = new Set(row.employees.map((e) => e.employeeId))
  const people: CompPerson[] = m.pop.people.filter((p) => ids.has(p.id))
  return costPeopleDrill(m.cost, title, people, {
    note: 'Employees active at the date the budget month is measured.',
  })
}

/** The budget lines behind a budget number. */
function budgetLinesDrill(m: CompModel, title: string, lines: BudgetRow['lines']) {
  if (!lines.length) return null
  return drillSpec({
    kind: 'budget',
    title,
    subtitle: `${m.scopeLabel}`,
    rows: lines.slice(),
    note: 'Budget lines of the latest plan version.',
  })
}

/** A budget table: headcount opens the employees, budget columns open the lines, cost the people costed. */
function budgetColumns<T extends BudgetRow>(m: CompModel, cols: readonly Column<T>[]): Column<T>[] {
  const people = (r: T): DrillSource =>
    r.employees.length ? () => budgetPeopleDrill(m, `Headcount, ${r.label}`, r) : null
  const lines = (r: T): DrillSource =>
    r.lines.length ? () => budgetLinesDrill(m, `Budget, ${r.label}`, r.lines) : null
  const cost = (r: T): DrillSource =>
    r.costUsd != null ? () => budgetPeopleDrill(m, `Workforce cost, ${r.label}`, r) : null
  return withDrill(cols, {
    headcount: people,
    headcountVariance: people,
    costed: cost,
    budgetHeadcount: lines,
    budgetCostUsd: lines,
    employeeCostUsd: cost,
    costUsd: cost,
    costVarianceUsd: cost,
  })
}

/** Headcount at a budget month's end: the employees, as roster rows (counts only). */
function monthDrill(m: CompModel, r: BudgetTrendRow) {
  if (!r.employees.length) return null
  return drillSpec({
    kind: 'employees',
    title: `Headcount, ${r.monthLabel}`,
    subtitle: `${r.date ? `As of ${formatDate(r.date)}` : r.monthLabel} · ${m.scopeLabel}`,
    rows: r.employees.slice(),
    note: `Employees active on ${formatDate(r.date)}, against a budget of ${fmt(r.budgetHeadcount, 'int')}.`,
  })
}

export function Cost({ m }: { m: CompModel }) {
  const c = m.cost
  const names = useCenterNames()
  const off = c.shown ? null : COST_OFF
  const offAction = c.shown ? undefined : <PaySwitch />
  const asOf = formatDate(c.asOf)
  const costed = c.total.people
  const centers: CostCenterRow[] = c.byCostCenter.map((r) => ({ ...r, name: names.get(r.key) ?? null }))
  const levelRows = drawable(c.byLevel)
  const siteRows = drawable(c.bySite)
  const merit = c.merit.rows.map((r) => ({
    ...r,
    budgetUsd: r.eligibleBaseUsd == null ? null : r.eligibleBaseUsd * r.budgetPct,
  }))
  const reqs = c.openReqs
  const b = c.budget
  const compared = b && !b.unavailable && b.total ? b : null
  const units: BudgetUnitRow[] = (compared?.byUnit ?? []).map((r) => ({
    ...r,
    headcountWord: word(r.headcountStatus),
    costWord: word(r.costStatus),
  }))
  const budgetCenters: BudgetCenterRow[] = (compared?.byCostCenter ?? []).map((r) => ({
    ...r,
    headcountWord: word(r.headcountStatus),
    costWord: word(r.costStatus),
    name: r.costCenter ? (names.get(r.costCenter) ?? null) : null,
  }))
  const trend: BudgetTrendRow[] = (compared?.byMonth ?? []).map((r) => ({
    ...r,
    monthLabel: formatMonth(r.period),
  }))
  const trendLines = trend.flatMap((r) => [
    { period: r.period, series: 'Budget', value: r.budgetHeadcount, row: r },
    ...(r.headcount == null ? [] : [{ period: r.period, series: 'Headcount', value: r.headcount, row: r }]),
  ])
  const trendColumns = withDrill(BUDGET_MONTH_COLUMNS, {
    headcount: (r) => () => monthDrill(m, r),
    budgetHeadcount: (r) => () => budgetLinesDrill(m, `Budget lines, ${r.monthLabel}`, r.lines),
  })
  const month = compared?.month ? formatMonth(`${compared.month}-01`) : null
  const budgetNote = [
    compared?.version ? `${compared.version}` : null,
    month ? `${month}, measured ${formatDate(compared?.date)}` : null,
    ...(compared?.notes ?? []),
  ]
    .filter(Boolean)
    .join(' · ')
  const noCost = !c.total.people
  const none = (rows: readonly unknown[], text: string) =>
    off ??
    (noCost ? 'No one in this scope has a comp record with an exchange rate.' : rows.length ? null : text)
  const centerRows = (r: BudgetCenterRow) => drill(budgetPeopleDrill(m, `Budget, ${r.label}`, r))
  const totalText =
    c.shown && c.total.targetCashUsd != null ? ` · ${money(c.total.targetCashUsd)} target cash` : ''

  return (
    <div>
      <KpiStrip kpis={c.kpis} id="comp-cost-kpis" title="Workforce cost figures" />

      <Section
        title="Where the cost sits"
        dek={`Annual base, bonus at target and equity in US dollars for active employees, as of ${asOf}. Totals cover groups of 5 or more people; a smaller group folds into Other.`}
      >
        <Figure
          id="comp-cost-by-unit"
          uses={m.uses['comp-cost-by-unit']}
          metric={FIGURE_METRIC['comp-cost-by-unit']}
          title="Workforce cost by business unit"
          subtitle="Base, bonus at target and equity, USD a year"
          data={c.byUnit}
          columns={costTableColumns(c, COST_BY_UNIT_COLUMNS)}
          definitions={m.definitions['comp-cost-by-unit']}
          note={`${note(m, costed, 'people', true)}${totalText}`}
          span={7}
          empty={none(drawable(c.byUnit), 'No cost totals in this scope.')}
          emptyAction={offAction}
        >
          <CostByUnitChart c={c} />
        </Figure>
        <Figure
          id="comp-cost-by-cost-center"
          uses={m.uses['comp-cost-by-cost-center']}
          metric={FIGURE_METRIC['comp-cost-by-cost-center']}
          title="Workforce cost by cost center"
          subtitle="Target cash, USD a year, the 12 largest cost centers; the rest are Other in the table"
          data={centers}
          columns={costTableColumns(c, COST_BY_CENTER_COLUMNS)}
          definitions={m.definitions['comp-cost-by-cost-center']}
          note={[otherCentersNote(centers), note(m, costed, 'people', true)].filter(Boolean).join(' · ')}
          span={5}
          empty={none(drawable(centers), 'No cost centers on the roster in this scope.')}
          emptyAction={offAction}
        >
          <CostByCenterChart c={c} rows={centers} />
        </Figure>
        <Figure
          id="comp-cost-by-level"
          uses={m.uses['comp-cost-by-level']}
          metric={FIGURE_METRIC['comp-cost-by-level']}
          title="Workforce cost by level"
          subtitle="Target cash, USD a year"
          data={c.byLevel}
          columns={costTableColumns(c, COST_BY_LEVEL_COLUMNS)}
          definitions={m.definitions['comp-cost-by-level']}
          note={note(m, costed, 'people', true)}
          span={6}
          empty={none(levelRows, 'No levels on the roster in this scope.')}
          emptyAction={offAction}
        >
          <Columns
            data={levelRows}
            x="group"
            y="targetCashUsd"
            xOrder={[
              ...LEVELS,
              ...levelRows.map((r) => r.group).filter((g) => !(LEVELS as readonly string[]).includes(g)),
            ]}
            format="money"
            secondary={(d) => `${fmt(d.people, 'int')} people`}
            onSelect={(d) => drill(costRowDrill(c, d, 'Workforce cost'))}
          />
        </Figure>
        <Figure
          id="comp-cost-by-site"
          uses={m.uses['comp-cost-by-site']}
          metric={FIGURE_METRIC['comp-cost-by-site']}
          title="Workforce cost by location"
          subtitle="Target cash, USD a year"
          data={c.bySite}
          columns={costTableColumns(c, COST_BY_SITE_COLUMNS)}
          definitions={m.definitions['comp-cost-by-site']}
          note={`Converted to USD at each row’s exchange rate · ${note(m, costed, 'people', true)}`}
          span={6}
          empty={none(siteRows, 'No locations in this scope.')}
          emptyAction={offAction}
        >
          <BarList
            data={siteRows}
            label="group"
            value="targetCashUsd"
            format="money"
            sort="none"
            secondary={(d) => `${fmt(d.people, 'int')} people`}
            onSelect={(d) => drill(costRowDrill(c, d, 'Workforce cost'))}
          />
        </Figure>
      </Section>

      <Section
        title="Against the budget"
        dek={
          compared
            ? `Headcount at each month end and the monthly cost run rate at ${asOf}, against the budget${compared.version ? ` (${compared.version})` : ''}. Contractors are costed at the range midpoint of their level and location, an estimate.`
            : 'The headcount and cost budget, when one is loaded in the Data room.'
        }
      >
        {compared ? (
          <>
            <Figure
              id="comp-cost-budget-headcount"
              uses={m.uses['comp-cost-budget-headcount']}
              metric={FIGURE_METRIC['comp-cost-budget-headcount']}
              title="Headcount against budget by business unit"
              subtitle={`Employees against budget headcount, ${month ?? 'the compared month'}`}
              data={units}
              columns={budgetColumns(m, BUDGET_HEADCOUNT_COLUMNS)}
              definitions={m.definitions['comp-cost-budget-headcount']}
              note={budgetNote}
              span={6}
              empty={off ?? (units.length ? null : 'No budget lines in this scope.')}
              emptyAction={offAction}
            >
              <BulletList
                data={units}
                label="label"
                value="headcount"
                target="budgetHeadcount"
                format={(_, v) => fmt(v, 'int')}
                status={(r) => budgetStatus(r.headcountStatus)}
                onSelect={(r) => drill(budgetPeopleDrill(m, `Headcount, ${r.label}`, r))}
              />
            </Figure>
            <Figure
              id="comp-cost-budget-cost"
              uses={m.uses['comp-cost-budget-cost']}
              metric={FIGURE_METRIC['comp-cost-budget-cost']}
              title="Monthly cost against budget by business unit"
              subtitle={`Employees’ target cash and the contractor estimate, USD a month, ${month ?? 'the compared month'}`}
              data={units}
              columns={budgetColumns(m, BUDGET_COST_COLUMNS)}
              definitions={m.definitions['comp-cost-budget-cost']}
              note={budgetNote}
              span={6}
              empty={
                off ??
                (units.some((r) => r.costUsd != null) ? null : 'No budget cost to compare in this scope.')
              }
              emptyAction={offAction}
            >
              <BulletList
                data={units.filter((r) => r.costUsd != null)}
                label="label"
                value="costUsd"
                target="budgetCostUsd"
                format={(_, v) => money(v)}
                status={(r) => budgetStatus(r.costStatus)}
                onSelect={(r) => drill(budgetPeopleDrill(m, `Workforce cost, ${r.label}`, r))}
              />
            </Figure>
            <Figure
              id="comp-cost-budget-trend"
              uses={m.uses['comp-cost-budget-trend']}
              metric={FIGURE_METRIC['comp-cost-budget-trend']}
              title="Headcount against budget by month"
              subtitle="Employees at each month end against budget headcount"
              data={trend}
              columns={trendColumns}
              definitions={m.definitions['comp-cost-budget-trend']}
              note={budgetNote}
              span={12}
              empty={off ?? (trend.length ? null : 'No budget months in this scope.')}
              emptyAction={offAction}
            >
              <Lines
                data={trendLines}
                x="period"
                y="value"
                series="series"
                seriesOrder={['Headcount', 'Budget']}
                emphasize="Headcount"
                format="int"
                onSelect={(d) => drill(monthDrill(m, d.row))}
              />
            </Figure>
            <Figure
              id="comp-cost-budget-centers"
              uses={m.uses['comp-cost-budget-centers']}
              metric={FIGURE_METRIC['comp-cost-budget-centers']}
              title="Budget by cost center"
              subtitle={`Headcount and monthly cost against budget, ${month ?? 'the compared month'}`}
              data={budgetCenters}
              columns={budgetColumns(m, BUDGET_CENTER_COLUMNS)}
              definitions={m.definitions['comp-cost-budget-centers']}
              note={budgetNote}
              span={12}
              tableOnly
              table={{ search: 'Search cost centers', maxRows: 15, onRowClick: centerRows }}
              empty={off ?? (budgetCenters.length ? null : 'The budget names no cost centers.')}
              emptyAction={offAction}
            />
          </>
        ) : b?.unavailable ? (
          <p className="col-span-full rounded-sheet bg-sheet px-4 py-4 text-small leading-snug text-ink-2 lg:px-5">
            {b.unavailable}
          </p>
        ) : (
          <PlanFallback />
        )}
      </Section>

      <Section
        title="Merit and open roles"
        dek="This cycle’s merit proposals against the merit budget, and what the open reqs would cost at the range midpoint, both in US dollars."
      >
        <Figure
          id="comp-cost-merit-by-unit"
          uses={m.uses['comp-cost-merit-by-unit']}
          metric={FIGURE_METRIC['comp-cost-merit-by-unit']}
          title="Merit spend against budget by business unit"
          subtitle={`Proposed merit against the ${fmt(m.settings.meritBudget, 'pct2')} budget, USD`}
          data={c.merit.rows}
          columns={meritCostColumns(m, c)}
          definitions={m.definitions['comp-cost-merit-by-unit']}
          note={note(m, c.merit.total.eligible, 'proposals', true)}
          span={6}
          empty={off ?? (merit.some((r) => r.spendUsd != null) ? null : 'No merit proposals in this scope.')}
          emptyAction={offAction}
        >
          <MeritCostChart m={m} rows={merit.filter((r) => r.spendUsd != null)} />
        </Figure>
        <Figure
          id="comp-cost-open-reqs"
          uses={m.uses['comp-cost-open-reqs']}
          metric={FIGURE_METRIC['comp-cost-open-reqs']}
          title="Open reqs at range midpoint (estimate)"
          subtitle="Each opening at the median range midpoint for its level and location, USD a year"
          data={reqs.rows}
          columns={openReqColumns(c)}
          definitions={m.definitions['comp-cost-open-reqs']}
          note={openReqNote(reqs.total, asOf)}
          span={6}
          empty={
            off ??
            (reqs.rows.some((r) => r.estimateUsd != null)
              ? null
              : 'No open reqs with an estimate in this scope.')
          }
          emptyAction={offAction}
        >
          <BarList
            data={reqs.rows.filter((r) => r.estimateUsd != null)}
            label="group"
            value="estimateUsd"
            format="money"
            sort="none"
            secondary={(d) => `${fmt(d.reqs, 'int')} ${d.reqs === 1 ? 'req' : 'reqs'}`}
            onSelect={(d) => drill(openReqDrill(c, d))}
          />
        </Figure>
      </Section>
    </div>
  )
}

function openReqNote(t: OpenReqRow, asOf: string): string {
  const parts = [`${fmt(t.reqs, 'int')} open reqs`, `${fmt(t.openings, 'int')} openings`, `as of ${asOf}`]
  if (t.noEstimate)
    parts.push(`${fmt(t.noEstimate, 'int')} ${t.noEstimate === 1 ? 'opening' : 'openings'} with no estimate`)
  return parts.join(' · ')
}
