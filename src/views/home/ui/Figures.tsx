/**
 * Figures two role homes share, drawn from their producing view's engine (cached per context) the
 * way that view draws them, with the view's metric, fields and drills (docs/ROLES-V2.md 5.5, 5.9):
 *
 *  - `ReqRisk`: Recruiting's open reqs by age against candidates past the screen, the risky corner
 *    (old reqs with nobody past the screen, every empty funnel) in red and the oldest named. A dot
 *    opens its req; the table's counts open the candidates.
 *  - `TrailingAttrition`: People stats' rolling 12-month voluntary attrition, the scope in the
 *    series color and the company de-emphasized. A comparison opens nothing in a scoped mode
 *    (docs/ROLES-V2.md 2.6): only the scope's points open their leavers.
 */
import {
  type Column,
  Figure,
  type FigureSpan,
  Legend,
  Lines,
  Scatter,
  toneColor,
  useChartTheme,
} from '@/charts'
import { useChartHeight } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { hrbpModel } from '@/views/hrbp/engine'
import { FIGURE } from '@/views/hrbp/engine/lineage'
import {
  attritionTrailing,
  COMPANY_LINE,
  type TrailingPoint,
  trailingDrill,
} from '@/views/hrbp/engine/trends'
import { ID } from '@/views/hrbp/metrics'
import { ANONYMITY_ID } from '@/views/hrbp/ui/defs'
import { drillWhen } from '@/views/hrbp/ui/drill'
import { computeRecruiting } from '@/views/recruiting/engine'
import { pastScreenDrill, reqActiveDrill, reqRowDrill } from '@/views/recruiting/engine/drills'
import { FIGURE_USES } from '@/views/recruiting/engine/lineage'
import { FIGURE_METRICS } from '@/views/recruiting/engine/metricLinks'
import { type ReqAgeDot, reqAgeDots } from '@/views/recruiting/engine/reqs'
import { RM } from '@/views/recruiting/metrics'
import { defOf, NEED_REQS } from '@/views/recruiting/ui/common'
import { comparisonOpens } from '../engine/compare'

const SCATTER = 'recruiting-req-age-vs-pipeline'

export function ReqRisk({ id, span }: { id: string; span: FigureSpan }) {
  const ctx = useAnalytics()
  const b = computeRecruiting(ctx).base
  const theme = useChartTheme()
  const height = useChartHeight('standard')
  const emptyDays = b.settings.emptyFunnelDays
  const dots = reqAgeDots(b.req.rows, emptyDays)
  const corner = dots.filter((d) => d.corner).length
  // The four oldest reqs in the corner are named on the chart; the table lists every one.
  const named = new Set(
    dots
      .filter((d) => d.corner)
      .sort((a, x) => x.daysOpen - a.daysOpen)
      .slice(0, 4)
      .map((d) => d.reqId),
  )
  const empties = dots.filter((d) => d.health === 'Empty funnel').length
  const one = (d: ReqAgeDot) => () => reqRowDrill(b, d.row, 'req')
  const columns: Column<ReqAgeDot>[] = [
    { key: 'reqId', label: 'Req', width: 12, drill: one },
    { key: 'title', label: 'Job title' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'level', label: 'Level' },
    { key: 'priority', label: 'Priority' },
    { key: 'daysOpen', label: 'Days open', format: 'int', drill: one },
    {
      key: 'pastScreen',
      label: 'Past the screen',
      format: 'int',
      drill: (d) => (d.pastScreen ? () => pastScreenDrill(b, d.row) : null),
    },
    {
      key: 'active',
      label: 'Active',
      format: 'int',
      drill: (d) => (d.active ? () => reqActiveDrill(b, d.row) : null),
    },
    { key: 'health', label: 'Health' },
  ]
  return (
    <Figure
      id={id}
      uses={FIGURE_USES[SCATTER]}
      metric={FIGURE_METRICS[SCATTER]}
      title="Open reqs by age and candidates past the screen"
      subtitle={`Each open req on ${formatDate(b.asOf)}: days open against active candidates at the hiring manager, onsite or offer stage`}
      data={dots}
      columns={columns}
      span={span}
      table={{ rowTone: (d) => (d.tone === 'default' ? null : d.tone), maxRows: 15 }}
      empty={b.reqs.length ? (dots.length ? null : 'No open reqs on the as-of date.') : NEED_REQS}
      emptyHeight={height}
      definitions={[
        defOf(b, RM.emptyFunnel),
        defOf(b, RM.reqAge, { settings: false }),
        {
          term: 'Past the screen',
          text: 'Active candidates waiting at the hiring manager, onsite or offer stage on the as-of date.',
        },
      ]}
      note={`${plural(dots.length, 'open req')} · ${fmt(corner, 'int')} open over ${fmt(emptyDays, 'days')} with nobody past the screen, ${fmt(empties, 'int')} of them an empty funnel · as of ${formatDate(b.asOf)}`}
    >
      <Legend
        className="mb-2"
        spec={{
          kind: 'swatch',
          items: [
            {
              label: `Over ${fmt(emptyDays, 'days')}, nobody past the screen`,
              color: toneColor(theme, 'critical'),
              shape: 'dot',
            },
            { label: 'Lacks a next step', color: toneColor(theme, 'warning'), shape: 'dot' },
            { label: 'Other open reqs', color: toneColor(theme, 'default'), shape: 'dot' },
          ],
        }}
      />
      <Scatter
        data={dots}
        x="daysOpen"
        y="pastScreen"
        tone={(d) => d.tone}
        label="label"
        labelFilter={(d) => named.has(d.reqId)}
        labelCount={4}
        xFormat="days"
        yFormat="int"
        xLabel="Days open"
        yLabel="Past the screen"
        refX={{ value: emptyDays, label: `Empty funnel age ${fmt(emptyDays, 'days')}` }}
        height={height}
        onSelect={(d) => drill(one(d))}
        ariaLabel="Open reqs by age and candidates past the screen"
      />
    </Figure>
  )
}

export function TrailingAttrition({ id, span }: { id: string; span: FigureSpan }) {
  const ctx = useAnalytics()
  const p = hrbpModel(ctx).prep
  const t = attritionTrailing(p)
  const points = t.voluntary
  const scope = points.filter((x) => x.series === t.scopeLine)
  const last = scope.at(-1)
  const open = (d: TrailingPoint) => drillWhen(d.records.length > 0, () => trailingDrill(p, d))
  // A company point is a comparison: in a scoped mode it opens nothing (docs/ROLES-V2.md 2.6).
  const opens = (d: TrailingPoint) => d.series !== COMPANY_LINE || comparisonOpens(ctx.access)
  const hidden = scope.filter((x) => x.rate == null).length
  return (
    <Figure
      id={id}
      metric={ID.trailing12}
      uses={p.uses(FIGURE.attritionTrailing('voluntary', p.set.regretted))}
      title="Voluntary attrition, rolling 12 months"
      subtitle={`Voluntary exits in the 12 months to each month end ÷ average headcount${t.company ? ', this scope and the company' : ''}`}
      data={points}
      columns={[
        { key: 'date', label: 'Month end', format: 'date' },
        { key: 'series', label: 'Line', format: 'text' },
        {
          key: 'exits',
          label: 'Voluntary exits, 12 months',
          format: 'int',
          drill: (r) => (opens(r) ? open(r) : null),
        },
        { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
        {
          key: 'rate',
          label: 'Voluntary attrition',
          format: 'pct',
          drill: (r) => (opens(r) ? open(r) : null),
        },
      ]}
      definitions={p.defs(ID.trailing12, ID.voluntary, ANONYMITY_ID)}
      note={`${last?.rate != null ? `${fmt(last.rate, 'pct')} in the 12 months to ${formatDate(ctx.asOf)}` : `As of ${formatDate(ctx.asOf)}`}${
        hidden ? ` · ${hidden} month ends under ${p.set.minGroup} people hidden` : ''
      }`}
      span={span}
      empty={
        !t.ready.voluntary
          ? 'Add the Termination type column to Employees to see this.'
          : scope.some((x) => x.rate != null)
            ? null
            : `Fewer than ${p.set.minGroup} employees in this scope, so the rate is hidden to protect anonymity.`
      }
    >
      <Lines
        data={points}
        x="date"
        y="rate"
        series="series"
        seriesOrder={[t.scopeLine, COMPANY_LINE]}
        emphasize={t.company ? t.scopeLine : undefined}
        format="pct"
        zero
        ariaLabel="Voluntary attrition over the trailing 12 months at each month end"
        onSelect={(d) => {
          if (opens(d)) drill(open(d))
        }}
        selectable={(d) => opens(d) && d.records.length > 0}
      />
    </Figure>
  )
}
