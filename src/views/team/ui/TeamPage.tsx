/**
 * My team (docs/ROLES.md 2.2, docs/DESIGN-REFRESH.md 4.2): one manager's org on one page. Key
 * figures, what needs attention beside headcount over time, then People, Hiring, Talent and the
 * open items the org owns. Every figure is the producing view's number for the scope on screen
 * (in Manager mode, the manager's org), read from that view's model, with its metric and fields.
 * Nothing here shows pay, survey results, HR ops cases, compliance details, exit reasons or
 * flight-risk scores.
 */
import { smallOrgNote } from '@/access/copy'
import { routeShown } from '@/access/policy'
import { type ChartNote, Figure, Lines } from '@/charts'
import { cx, Grid, goTo, KpiStrip, Readout, spanClass } from '@/components'
import type { FindingSource } from '@/components/Readout'
import type { Finding, Kpi } from '@/components/types'
import { useChartHeight } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { WelcomeCard } from '@/help/ui/WelcomeCard'
import { addDays, formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { minGroupOf } from '@/metrics/privacy'
import { M as ACTIONS } from '@/views/actions/metrics'
import { NO_HISTORY } from '@/views/hrbp/engine/base'
import { employeesOnSpec } from '@/views/hrbp/engine/drill'
import { FIGURE } from '@/views/hrbp/engine/lineage'
import { LAST_YEAR, YEAR_BEFORE } from '@/views/hrbp/engine/workforce'
import { ID } from '@/views/hrbp/metrics'
import { drillWhen } from '@/views/hrbp/ui/drill'
import type { SourcedFinding } from '@/views/scorecard/engine/model'
import {
  orgUnderMinimum,
  practiceFindings,
  type TeamSources,
  teamFindings,
  teamKpis,
  teamSources,
  waitingKpi,
} from '../engine'
import { HiringSection } from './Hiring'
import { PeopleSection } from './People'
import { TalentSection } from './TalentFigures'
import { useTeamItems } from './useTeamItems'
import { labelOf, PRACTICES } from './views'
import { WaitingSection } from './Waiting'

/** The items tile before the open items are collected: same place, a quiet note. */
const waitingPending: Kpi = {
  id: 'waiting',
  metricId: ACTIONS.open,
  label: 'Owned by people in this org',
  value: null,
  format: 'int',
  note: 'Counting open items',
}

function HeadcountFigure({ s }: { s: TeamSources }) {
  const ctx = useAnalytics()
  const height = useChartHeight('lead')
  const p = s.hrbp.prep
  const wf = s.hrbp.workforce
  const asOf = formatDate(ctx.asOf)
  const yearAgo = formatDate(addDays(p.t12.start, -1))
  const thisYear = wf.overlay.filter((o) => o.period === LAST_YEAR)
  const first = thisYear[0]
  const end = thisYear.at(-1)
  const change = first && end ? end.headcount - first.headcount : 0
  // The year's change on the latest point, when it is more than a rounding step.
  const notes: ChartNote[] =
    first && end && first.headcount > 0 && Math.abs(change) / first.headcount >= 0.02
      ? [
          {
            at: end.x,
            series: LAST_YEAR,
            text: `${change > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(change), 'int')} in 12 months`,
          },
        ]
      : []
  const last = wf.series.at(-1)
  return (
    <Figure
      id="team-headcount-trend"
      metric={ID.headcount}
      uses={p.uses(FIGURE.headcountTrend)}
      title="Headcount over time"
      subtitle={`Employees at each month end, ${yearAgo} to ${asOf}, with the year before as a dashed gray line on the same months`}
      data={wf.overlay}
      columns={[
        { key: 'date', label: 'Month end', format: 'date' },
        {
          key: 'headcount',
          label: 'Headcount',
          format: 'int',
          drill: (r) => drillWhen(r.headcount > 0, () => employeesOnSpec(p, r.date)),
        },
        { key: 'period', label: 'Period', format: 'text' },
      ]}
      definitions={p.defs(ID.headcount)}
      note={`${fmt(last?.headcount ?? 0, 'int')} employees on ${asOf}`}
      span={12}
      emptyHeight={height + 40}
      empty={
        !p.has.terminationDate
          ? `${NO_HISTORY}.`
          : wf.series.some((r) => r.headcount > 0)
            ? null
            : 'No employees in this org over the last 24 months.'
      }
    >
      <Lines
        data={wf.overlay}
        x="x"
        y="headcount"
        series="period"
        seriesOrder={[YEAR_BEFORE, LAST_YEAR]}
        emphasize={LAST_YEAR}
        format="int"
        height={height}
        notes={notes}
        onSelect={(d) => drill(() => employeesOnSpec(p, d.date))}
        ariaLabel="Headcount at each month end, this year and the year before"
      />
    </Figure>
  )
}

/** "Open in People stats": the finding's tab when the mode shows it, else the view's first tab. */
function sourcesOf(mode: Parameters<typeof routeShown>[0], list: readonly SourcedFinding[]) {
  const byId = new Map(list.map((s) => [s.finding.id, s]))
  return (f: Finding): FindingSource | null => {
    const s = byId.get(f.id)
    if (!s) return null
    const to = s.opens
    if (!to || !routeShown(mode, to.view)) return { label: s.practice }
    const tab = routeShown(mode, to.view, to.tab) ? to.tab : undefined
    return { label: s.practice, openLabel: `Open in ${s.practice}`, open: () => goTo(to.view, tab) }
  }
}

export function TeamPage() {
  const ctx = useAnalytics()
  // One model per producing view and context, shared with those views (each caches its own).
  const s = teamSources(ctx)
  const items = useTeamItems()
  const min = minGroupOf(ctx.metrics)
  const small = orgUnderMinimum(ctx, s)
  const waiting = items ? waitingKpi(ctx, items.items) : null
  const kpis = [...teamKpis(s, labelOf, ctx, small), waiting ?? waitingPending]
  const findings = teamFindings(ctx, practiceFindings(s, PRACTICES))
  return (
    <>
      <WelcomeCard variant="manager" className="mb-4" />
      {small && (
        <p role="note" className="mb-4 max-w-[70ch] text-small text-ink-2">
          {smallOrgNote(min)}
        </p>
      )}
      <Grid>
        <KpiStrip id="team-kpis" title="My team key figures" kpis={kpis} />
        <Readout
          id="team-readout"
          title="What needs attention"
          findings={findings.map((f) => f.finding)}
          sourceOf={sourcesOf(ctx.access.mode, findings)}
          span={12}
          limit={6}
          variant="compact"
          emptyText="Nothing needs attention in this org right now."
          // 4 of 12 from 1024px, full width under the strip below that; phones: after the lead chart.
          className="lg:sticky lg:top-4 lg:col-span-4 max-md:order-1"
        />
        {/* The right column runs as long as the readout (headcount, then the People section), so
            the lead chart never stretches to the readout's height. Phones: lead chart, readout,
            then People (max-md:order). */}
        <div className={cx(spanClass(8), 'max-md:contents')}>
          <Grid>
            <HeadcountFigure s={s} />
          </Grid>
          <PeopleSection s={s} className="max-md:order-2" />
        </div>
      </Grid>
      <HiringSection s={s} />
      <TalentSection s={s} small={small} />
      <WaitingSection items={items} />
    </>
  )
}
