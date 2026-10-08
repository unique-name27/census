/**
 * My team, People: hires and exits by month, the org's attrition beside the company's, tenure,
 * levels and the span of each manager in the org. People stats' numbers and records throughout.
 */
import { BarList, Columns, Figure, HBars, seriesColor, type Tone, useChartTheme } from '@/charts'
import { Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { LEVELS } from '@/data/schema'
import { drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { TENURE_BANDS } from '@/lib/people'
import { countSpec, flowMonthSpec, flowSpec, managerCellSpec } from '@/views/hrbp/engine/buckets'
import { FIGURE } from '@/views/hrbp/engine/lineage'
import { ID } from '@/views/hrbp/metrics'
import { ANONYMITY_ID } from '@/views/hrbp/ui/defs'
import { drillWhen, headcountDrill } from '@/views/hrbp/ui/drill'
import {
  attritionCompare,
  COMPANY_SERIES,
  type CompareRow,
  companyMedianSpan,
  FLAG_TONE,
  ORG_SERIES,
  type SpanRow,
  spanRows,
  type TeamSources,
} from '../engine'

/** Managers the span chart draws by name; the table view lists every one. */
const SPANS_DRAWN = 12

const BENCHMARK = "Benchmark only: the company's records are not listed here."

const signed = (v: number) => (v > 0 ? `+${fmt(v, 'int')}` : fmt(v, 'int'))

export function PeopleSection({ s, className }: { s: TeamSources; className?: string }) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const m = s.hrbp
  const p = m.prep
  const wf = m.workforce
  const asOf = formatDate(ctx.asOf)
  const none = wf.headcount ? null : 'No active employees in this org.'

  /* Hires and exits. */
  const hires = wf.flows.filter((r) => r.series === 'Hires').reduce((n, r) => n + r.people, 0)
  const exits = wf.flows.filter((r) => r.series === 'Exits').reduce((n, r) => n + r.people, 0)
  const firstMonth = wf.flows[0] ? formatDate(`${wf.flows[0].month}-01`) : ''

  /* Attrition against the company. */
  // Manager mode hides regretted attrition: managers see exits, not regretted exits.
  const shownMetric = (id: string) => ctx.access.can(`metric:${id}`)
  const regretted = shownMetric(ID.regretted)
  const compare = attritionCompare(m, shownMetric)
  const compareUses = [
    ...new Set(
      m.kpi.kpis
        .filter((k) => ['voluntary', ...(regretted ? ['regretted'] : []), 'first-year'].includes(k.id))
        .flatMap((k) => k.uses ?? []),
    ),
  ]
  const orgHas = compare.some((r) => r.series === ORG_SERIES && r.rate != null)

  /* Spans. */
  const spans = spanRows(m)
  const companySpan = companyMedianSpan(ctx)
  const spanDrill = (r: SpanRow) =>
    drillWhen(r.directs > 0, () => managerCellSpec(p, m.org, r.manager, 'directs'))
  const orgDrill = (r: SpanRow) =>
    drillWhen(r.totalOrg > 0, () => managerCellSpec(p, m.org, r.manager, 'totalOrg'))
  const glyph = (r: SpanRow): Tone => FLAG_TONE[r.flag] ?? 'default'

  return (
    // It sits in the right column beside the readout: two figures a row, then the span chart.
    <Section title="People" dek="Who is in the org and how it is changing." className={className}>
      <Figure
        id="team-hires-exits"
        metric={ID.hires}
        uses={p.uses(FIGURE.hiresExits)}
        title="Hires and exits by month"
        subtitle={`Employees hired and employees who left, ${firstMonth} to ${asOf}`}
        data={wf.flows}
        columns={[
          { key: 'month', label: 'Month', format: 'text' },
          { key: 'series', label: 'Movement', format: 'text' },
          {
            key: 'people',
            label: 'Employees',
            format: 'int',
            drill: (r) => drillWhen(r.records.length > 0, () => flowSpec(p, r)),
          },
        ]}
        definitions={p.defs(ID.hires, ID.exits)}
        note={`${fmt(hires, 'int')} hires, ${fmt(exits, 'int')} exits, net ${signed(hires - exits)} · as of ${asOf}`}
        span={6}
        empty={hires + exits ? null : 'No hires or exits in the last 12 months.'}
      >
        <Columns
          data={wf.flows}
          x="month"
          y="people"
          series="series"
          seriesOrder={['Hires', 'Exits']}
          xType="month"
          onSelect={(d) => drill(() => flowMonthSpec(p, wf.flows, d.month))}
          onSelectSegment={(d) => drill(() => flowSpec(p, d))}
          ariaLabel="Hires and exits by month"
        />
      </Figure>
      <Figure
        id="team-attrition-vs-company"
        metric={ID.voluntary}
        uses={compareUses}
        title="Attrition against the company"
        subtitle={`${regretted ? 'Voluntary, regretted and first-year' : 'Voluntary and first-year'} attrition, ${ctx.window.label}`}
        data={compare}
        columns={[
          { key: 'measure', label: 'Measure', format: 'text' },
          { key: 'series', label: 'Population', format: 'text' },
          { key: 'rate', label: 'Rate', format: 'pct', drill: (r: CompareRow) => r.drill },
          { key: 'note', label: 'Note', format: 'text' },
        ]}
        definitions={p.defs(ID.voluntary, ...(regretted ? [ID.regretted] : []), ID.firstYear, ANONYMITY_ID)}
        note={`Annualized rates; first-year attrition is the share of a hire cohort · company figures are comparisons and open no records`}
        span={6}
        empty={
          orgHas || compare.some((r) => r.rate != null)
            ? null
            : 'Add leavers (Termination date) to Employees to see this.'
        }
      >
        <HBars<CompareRow>
          data={compare}
          y="measure"
          x="rate"
          series="series"
          seriesOrder={[ORG_SERIES, COMPANY_SERIES]}
          colors={{ [ORG_SERIES]: seriesColor(theme, 0), [COMPANY_SERIES]: theme.deemph }}
          format="pct"
          selectable={(d) => d.series === ORG_SERIES && !!d.drill}
          lockedNote={(d) => (d.series === COMPANY_SERIES ? BENCHMARK : d.note)}
          onSelect={(d) => drill(d.drill)}
          onSelectSegment={(d) => drill(d.drill)}
          ariaLabel="Attrition in this org and in the company"
        />
      </Figure>
      <Figure
        id="team-tenure"
        metric={ID.tenure}
        uses={p.uses(FIGURE.tenure)}
        title="Tenure"
        subtitle={`Employees on ${asOf} by years since hire`}
        data={wf.tenure}
        columns={[
          { key: 'label', label: 'Tenure', format: 'text' },
          {
            key: 'headcount',
            label: 'Employees',
            format: 'int',
            drill: (r) => drillWhen(r.records.length > 0, () => countSpec(p, 'tenure', r)),
          },
          {
            key: 'share',
            label: 'Share',
            format: 'pct',
            drill: (r) => drillWhen(r.records.length > 0, () => countSpec(p, 'tenure', r)),
          },
        ]}
        definitions={p.defs(ID.tenure)}
        note={`${plural(wf.headcount, 'employee')}${wf.avgTenure != null ? ` · average ${fmt(wf.avgTenure, 'years')}` : ''}`}
        span={6}
        empty={none}
      >
        <Columns
          data={wf.tenure}
          x="label"
          y="headcount"
          xOrder={[...TENURE_BANDS]}
          onSelect={(d) => drill(() => countSpec(p, 'tenure', d))}
          ariaLabel="Employees by tenure band"
        />
      </Figure>
      <Figure
        id="team-levels"
        metric={ID.headcount}
        uses={p.uses(FIGURE.byLevel)}
        title="People by level"
        subtitle={`Employees on ${asOf}, L1 to E3`}
        data={wf.byLevel}
        columns={[
          { key: 'label', label: 'Level', format: 'text' },
          { key: 'headcount', label: 'Employees', format: 'int', drill: headcountDrill(p, 'level') },
          { key: 'share', label: 'Share', format: 'pct', drill: headcountDrill(p, 'level') },
        ]}
        definitions={[
          ...p.defs(ID.headcount, ID.share),
          {
            term: 'Levels',
            text: 'L1 to L6 are individual levels, M1 and M2 manager and director, E1 to E3 executive.',
          },
        ]}
        note={plural(wf.headcount, 'employee')}
        span={6}
        empty={none}
      >
        <Columns
          data={wf.byLevel}
          x="label"
          y="headcount"
          xOrder={[...LEVELS]}
          onSelect={(d) => drill(headcountDrill(p, 'level')(d))}
          ariaLabel="Employees by level"
        />
      </Figure>
      <Figure
        id="team-span"
        metric={ID.span}
        uses={p.uses(FIGURE.spanOfControl)}
        title="Direct reports per manager"
        subtitle={`Active direct reports of each manager in the org, ${asOf}`}
        data={spans}
        columns={[
          { key: 'name', label: 'Manager', format: 'text' },
          { key: 'jobTitle', label: 'Title', format: 'text' },
          { key: 'directs', label: 'Direct reports', format: 'int', drill: spanDrill },
          { key: 'totalOrg', label: 'Total org', format: 'int', drill: orgDrill },
          { key: 'flag', label: 'Flag', format: 'text' },
        ]}
        definitions={p.defs(ID.span, ID.medianSpan, ID.managerFlag)}
        note={[
          plural(spans.length, 'manager'),
          spans.length > SPANS_DRAWN ? `the ${SPANS_DRAWN} widest drawn, the table lists all` : '',
          companySpan != null ? `company median ${fmt(companySpan, 'num1')}` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        span={12}
        empty={spans.length ? null : 'No managers in this org.'}
      >
        <BarList<SpanRow>
          data={spans.slice(0, SPANS_DRAWN)}
          label="name"
          value="directs"
          format="int"
          glyphTone={glyph}
          secondary={(d) => (d.flag === 'Healthy' || d.flag === 'New' ? '' : d.flag)}
          ref={
            companySpan != null
              ? { value: companySpan, label: `Company median ${fmt(companySpan, 'num1')}` }
              : undefined
          }
          onSelect={(d) => drill(spanDrill(d))}
          ariaLabel="Direct reports per manager"
        />
      </Figure>
    </Section>
  )
}
