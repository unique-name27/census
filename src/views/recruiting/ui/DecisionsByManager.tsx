/**
 * Interview decisions waiting, by hiring manager (Pipeline, "Who needs to act"): the leader ask of
 * the weekly review. One bar per hiring manager with candidates whose interview happened and who
 * are still waiting on a decision; the glyph marks a manager with any decision overdue (or to
 * watch). Every bar and count opens the candidates behind it. A hiring manager's own reqs are not
 * a filter (the leader filter is a whole org), so the bars carry none.
 */
import { BarList, type Column, Figure } from '@/charts'
import { drill } from '@/drill'
import { fmt, plural } from '@/lib/format'
import type { RecruitingBase } from '../engine/base'
import { activeDrill, decisionsDrill, otherDecisionsDrill } from '../engine/drills'
import { FIGURE_USES } from '../engine/lineage'
import { FIGURE_METRICS } from '../engine/metricLinks'
import type { DecisionRow } from '../engine/pipeline'
import { RM } from '../metrics'
import { asOfNote, defOf, drillIf, NEED_CANDIDATES } from './common'

/** Hiring managers shown by name; the rest fold into "Other". */
const TOP = 10

export function DecisionsByManager({
  base: b,
  rows,
}: {
  base: RecruitingBase
  rows: readonly DecisionRow[]
}) {
  const total = rows.reduce((n, r) => n + r.candidates, 0)
  const overdue = rows.reduce((n, r) => n + r.overdue, 0)
  const { decisionWatchDays, decisionOverdueDays } = b.settings.aging
  const all = (r: DecisionRow) => drillIf(r.candidates, () => decisionsDrill(b, r))
  const tier = (which: 'red' | 'amber', n: (r: DecisionRow) => number) => (r: DecisionRow) =>
    drillIf(n(r), () =>
      activeDrill(
        b,
        r.items.filter((x) => x.tier === which),
        {
          title: `Interview decisions ${which === 'red' ? 'overdue' : 'to watch'}, ${r.hiringManager}`,
        },
      ),
    )
  const columns: Column<DecisionRow>[] = [
    { key: 'hiringManager', label: 'Hiring manager' },
    { key: 'candidates', label: 'Waiting on a decision', format: 'int', drill: all },
    { key: 'overdue', label: 'Overdue', format: 'int', drill: tier('red', (r) => r.overdue) },
    { key: 'watch', label: 'To watch', format: 'int', drill: tier('amber', (r) => r.watch) },
    { key: 'oldest', label: 'Longest wait', format: 'days', drill: all },
  ]
  return (
    <Figure
      id="recruiting-decisions-by-hiring-manager"
      uses={FIGURE_USES['recruiting-decisions-by-hiring-manager']}
      metric={FIGURE_METRICS['recruiting-decisions-by-hiring-manager']}
      title="Interview decisions waiting"
      subtitle="Candidates whose interview happened and who are waiting on a decision, by hiring manager"
      data={rows}
      columns={columns}
      span={12}
      empty={
        b.apps.length
          ? rows.length
            ? null
            : 'No candidate is waiting on an interview decision.'
          : NEED_CANDIDATES
      }
      definitions={[
        defOf(b, RM.awaitingDecision),
        {
          term: 'Glyph',
          text: `A triangle marks a hiring manager with a decision overdue (more than ${plural(decisionOverdueDays, 'day')} since the interview); a diamond, one to watch (more than ${plural(decisionWatchDays, 'day')}).`,
        },
      ]}
      note={`${plural(total, 'candidate')} · ${fmt(overdue, 'int')} overdue · ${asOfNote(b.asOf)}`}
    >
      <BarList
        data={rows}
        label="hiringManager"
        value="candidates"
        unit="candidates"
        format="int"
        top={TOP}
        secondary={(d) =>
          `oldest ${fmt(d.oldest, 'days')}${d.overdue ? ` · ${fmt(d.overdue, 'int')} overdue` : ''}`
        }
        glyphTone={(d) => (d.overdue ? 'critical' : d.watch ? 'warning' : 'default')}
        onSelect={(d) => drill(all(d))}
        onSelectOther={(rest) => drill(() => otherDecisionsDrill(b, rest))}
        ariaLabel="Interview decisions waiting by hiring manager"
      />
    </Figure>
  )
}
