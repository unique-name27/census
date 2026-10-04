/**
 * Managers: upward feedback themes, and results by manager only through manager cuts (10 or
 * more distinct respondents pooled over the last four quarters).
 */
import { BarList, type Column, Figure } from '@/charts'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { formatDate, formatRange } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ListeningModel } from '../engine'
import type { ManagerRow } from '../engine/cuts'
import { groupsDrill, rowsBy } from '../engine/drills'
import type { SurveyModel } from '../engine/measures'
import { M } from '../metrics'
import { AreaFrame, WithSurvey } from './AreaTab'
import { SurveyBlock } from './SurveyBlock'
import { count, defs, noteOf } from './shared'

export function ManagersTab({ ctx, m }: { ctx: AnalyticsContext; m: ListeningModel }) {
  return (
    <AreaFrame
      m={m}
      tab="managers"
      dek={`What people say about their own manager, twice a year. A manager’s own results show only with ${m.settings.minManager} or more distinct respondents over the last four quarters; everyone else is counted, never shown.`}
    >
      <WithSurvey m={m} survey="Manager feedback">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <ManagerCuts ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
    </AreaFrame>
  )
}

interface ManagerDatum extends ManagerRow {
  flagged: string
}

function ManagerCuts({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const cut = m.managers
  const s = m.settings
  const p = m.prepared
  const rows: ManagerDatum[] = (cut?.rows ?? []).map((r) => ({
    ...r,
    flagged: r.low ? 'Below the low score' : '',
  }))
  const win = cut?.window
  const open = (r: ManagerRow) => {
    const theirs = sm.all.filter(
      (x) =>
        !!win &&
        x.responseDate >= win.start &&
        x.responseDate <= win.end &&
        (x.subjectKey === r.managerId ||
          (!x.subjectKey && p.emp.get(x.respondentKey)?.managerId === r.managerId)),
    )
    return groupsDrill(
      rowsBy(theirs, (x) => x.driver ?? x.item, {
        survey: sm.survey,
        wave: null,
        groupBy: 'Driver',
        min: s.minManager,
      }),
      {
        survey: sm.survey,
        wave: null,
        title: `Upward feedback for ${r.name}, by driver`,
        subtitle: `Four quarters to ${formatDate(ctx.asOf)}`,
        min: s.minManager,
        uses: m.uses.managers,
        note: `Manager cuts need ${s.minManager} or more distinct respondents over four quarters.`,
      },
    )
  }
  const columns: Column<ManagerDatum>[] = [
    { key: 'name', label: 'Manager' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'mean', label: 'Mean score', format: 'num2', drill: (r) => () => open(r) },
    { key: 'respondents', label: 'Respondents', format: 'int', drill: (r) => () => open(r) },
    { key: 'flagged', label: 'Flag' },
  ]
  return (
    <Figure
      id="listening-mgr-cuts"
      uses={m.uses.managers}
      metric={M.upward}
      span={12}
      title="Upward feedback by manager"
      subtitle={`Mean score on 1 to 5 for managers with ${s.minManager} or more respondents, ${win ? formatRange(win.start, win.end) : 'last four quarters'}, lowest first`}
      data={rows}
      columns={columns}
      definitions={defs(ctx, M.upward, s.minManager)}
      note={noteOf(
        ctx,
        count(rows.length, 'manager'),
        cut?.hidden
          ? `${count(cut.hidden, 'manager')} with fewer than ${s.minManager} respondents not shown`
          : null,
        `low score ${fmt(s.lowManager, 'num1')}`,
      )}
      empty={
        rows.length
          ? null
          : `No manager has ${s.minManager} or more respondents over the last four quarters, so no manager is shown.`
      }
    >
      <BarList
        data={rows}
        label="name"
        value="mean"
        format="num2"
        sort="asc"
        top={25}
        other="mean"
        domain={[0, 5]}
        ref={{ value: s.lowManager, label: `low score ${fmt(s.lowManager, 'num1')}` }}
        secondary={(d) => `${d.department ?? ''} · n ${fmt(d.respondents, 'int')}`}
        glyphTone={(d) => (d.low ? 'warning' : 'default')}
        onSelect={(d) => drill(() => open(d))}
      />
    </Figure>
  )
}
