/**
 * Services & learning: the HR service survey by case category and channel, return to work by
 * how the return was processed, and training evaluations by course.
 */
import { BarList, type Column, Columns, Figure } from '@/charts'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { fmt } from '@/lib/format'
import type { Breakdown } from '@/lib/surveys'
import type { ListeningModel } from '../engine'
import { type GroupScore, type ReturnRow, scoresOf } from '../engine/cuts'
import { groupsDrill, rowsBy } from '../engine/drills'
import type { SurveyModel } from '../engine/measures'
import { M } from '../metrics'
import { AreaFrame, WithSurvey } from './AreaTab'
import { SurveyBlock } from './SurveyBlock'
import { count, defs, noteOf, periodWords } from './shared'

interface ScoreDatum extends GroupScore {
  shown: string
}

const scoreRows = (b: Breakdown | null): ScoreDatum[] =>
  b
    ? scoresOf(b, 'mean').map((g) => ({ ...g, shown: g.suppressed ? 'Hidden to protect anonymity' : 'Yes' }))
    : []

export function ServicesTab({ ctx, m }: { ctx: AnalyticsContext; m: ListeningModel }) {
  return (
    <AreaFrame
      m={m}
      tab="services"
      dek="What employees say about HR service when a case is resolved, about their return from leave, and about the courses they finish. HR ops and Talent show the cases, returns and courses themselves."
    >
      <WithSurvey m={m} survey="HR service survey">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <ServiceCuts ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
      <WithSurvey m={m} survey="Return to work">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <ReturnFigure ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
      <WithSurvey m={m} survey="Training evaluation">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <CourseFigure ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
    </AreaFrame>
  )
}

function ServiceCuts({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const p = m.prepared
  const sub = `${ctx.window.label} · ${ctx.scopeLabel}`
  const figure = (by: 'category' | 'channel') => {
    const b = by === 'category' ? m.serviceCategory : m.serviceChannel
    const rows = scoreRows(b)
    const caseValue = (r: { subjectKey?: string | null }) => {
      const c = r.subjectKey ? p.cases.get(r.subjectKey) : undefined
      return (by === 'category' ? c?.category : c?.channel) || null
    }
    const open = (g: GroupScore) =>
      groupsDrill(
        rowsBy(
          sm.period.filter((r) => {
            const v = caseValue(r)
            return g.group.startsWith('Other (')
              ? !!v && !b?.groups.some((x) => x.group === v)
              : v === g.group
          }),
          (r) => r.driver ?? r.item,
          { survey: sm.survey, wave: null, groupBy: 'Driver', min: sm.min },
        ),
        {
          survey: sm.survey,
          wave: null,
          title: `HR service survey, ${g.group}, by driver`,
          subtitle: sub,
          min: sm.min,
          uses: m.uses.service(by),
        },
      )
    const label = by === 'category' ? 'Case category' : 'Channel'
    const columns: Column<ScoreDatum>[] = [
      { key: 'group', label },
      {
        key: 'value',
        label: 'Mean score',
        format: 'num2',
        drill: (r) => (r.suppressed ? null : () => open(r)),
      },
      { key: 'respondents', label: 'Respondents', format: 'int', drill: (r) => () => open(r) },
      { key: 'shown', label: 'Shown' },
    ]
    const target = m.settings.targetOf[sm.survey]
    return (
      <Figure
        id={`listening-hrs-${by}`}
        uses={m.uses.service(by)}
        metric={M.serviceCuts}
        span={6}
        title={`HR service satisfaction by ${label.toLowerCase()}`}
        subtitle={`Mean score on 1 to 5 by the ${by} of the case rated, ${periodWords(ctx)}`}
        data={rows}
        columns={columns}
        definitions={defs(ctx, M.serviceCuts, sm.min)}
        note={noteOf(
          ctx,
          count(
            rows.reduce((a, r) => a + r.respondents, 0),
            'respondent',
          ),
          'employee relations cases are never surveyed',
        )}
        empty={
          rows.length ? null : `No HR service answers joined to a case ${label.toLowerCase()} in the period.`
        }
      >
        <BarList
          data={rows}
          label="group"
          value="value"
          format="num2"
          sort="asc"
          domain={[0, 5]}
          ref={target ? { value: target.value, label: `target ${fmt(target.value, 'num1')}` } : undefined}
          secondary={(d) => `n ${fmt(d.respondents, 'int')}`}
          onSelect={(d) => (d.suppressed ? undefined : drill(() => open(d)))}
        />
      </Figure>
    )
  }
  return (
    <>
      {figure('category')}
      {figure('channel')}
    </>
  )
}

interface ReturnDatum extends ReturnRow {
  group: string
  value: number | null
  n: number
}

function ReturnFigure({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const r = m.returns
  const rows: ReturnDatum[] = (r?.rows ?? []).flatMap((x) => [
    { ...x, group: 'Processed late', value: x.late, n: x.lateN },
    { ...x, group: 'Processed on time', value: x.onTime, n: x.onTimeN },
  ])
  const open = (d: ReturnDatum) =>
    groupsDrill(
      rowsBy(
        sm.period.filter((a) => (a.driver ?? a.item) === d.driver),
        (a) => {
          const late = r?.lateOf(a)
          return late == null ? null : late ? 'Processed late' : 'Processed on time'
        },
        { survey: sm.survey, wave: null, groupBy: 'Return', driver: d.driver, min: sm.min },
      ),
      {
        survey: sm.survey,
        wave: null,
        title: `Return to work, ${d.driver}, by how the return was processed`,
        subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
        min: sm.min,
        uses: m.uses.returns,
      },
    )
  return (
    <Figure
      id="listening-rtw-timing"
      uses={m.uses.returns}
      metric={M.returnTiming}
      span={12}
      title="Return to work by how the return was processed"
      subtitle={`Mean score on 1 to 5 for returns processed by their due date and after it, ${periodWords(ctx)}`}
      data={rows}
      columns={[
        { key: 'driver', label: 'Driver' },
        { key: 'group', label: 'Return' },
        {
          key: 'value',
          label: 'Mean score',
          format: 'num2',
          drill: (d) => (d.value == null ? null : () => open(d)),
        },
        { key: 'n', label: 'Respondents', format: 'int', drill: (d) => (d.n ? () => open(d) : null) },
      ]}
      definitions={defs(ctx, M.returnTiming, sm.min)}
      note={noteOf(
        ctx,
        r ? `${r.lateReturns} of ${count(r.returns, 'return')} processed late in the period` : null,
        `groups under ${sm.min} respondents are hidden`,
      )}
      empty={
        rows.some((x) => x.value != null)
          ? null
          : 'No return to work answers could be joined to a return from leave in the period.'
      }
    >
      <Columns
        data={rows}
        x="driver"
        y="value"
        series="group"
        seriesOrder={['Processed late', 'Processed on time']}
        format="num2"
        yDomain={[0, 5]}
        height={220}
        onSelect={(d) => (d.value == null ? undefined : drill(() => open(d)))}
      />
    </Figure>
  )
}

function CourseFigure({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const b = m.courses
  const rows = scoreRows(b)
  const open = (g: GroupScore) =>
    groupsDrill(
      rowsBy(
        sm.period.filter((r) => {
          const v = r.subjectKey?.trim()
          return g.group.startsWith('Other (') ? !!v && !b?.groups.some((x) => x.group === v) : v === g.group
        }),
        (r) => r.driver ?? r.item,
        { survey: sm.survey, wave: null, groupBy: 'Driver', min: sm.min },
      ),
      {
        survey: sm.survey,
        wave: null,
        title: `${g.group}, by driver`,
        subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
        min: sm.min,
        uses: m.uses.courses,
      },
    )
  return (
    <Figure
      id="listening-trn-course"
      uses={m.uses.courses}
      metric={M.byCourse}
      span={12}
      title="Training evaluation by course"
      subtitle={`Mean score on 1 to 5 for usefulness and relevance, ${periodWords(ctx)}, lowest first`}
      data={rows}
      columns={[
        { key: 'group', label: 'Course' },
        {
          key: 'value',
          label: 'Mean score',
          format: 'num2',
          drill: (r) => (r.suppressed ? null : () => open(r)),
        },
        { key: 'respondents', label: 'Respondents', format: 'int', drill: (r) => () => open(r) },
        { key: 'shown', label: 'Shown' },
      ]}
      definitions={defs(ctx, M.byCourse, sm.min)}
      note={noteOf(ctx, count(rows.length, 'course'), `low score ${fmt(m.settings.lowCourse, 'num1')}`)}
      empty={rows.length ? null : 'No training evaluations name a course in the period.'}
    >
      <BarList
        data={rows}
        label="group"
        value="value"
        format="num2"
        sort="asc"
        domain={[0, 5]}
        ref={{ value: m.settings.lowCourse, label: `low score ${fmt(m.settings.lowCourse, 'num1')}` }}
        secondary={(d) => `n ${fmt(d.respondents, 'int')}`}
        glyphTone={(d) => (d.value != null && d.value < m.settings.lowCourse ? 'warning' : 'default')}
        onSelect={(d) => (d.suppressed ? undefined : drill(() => open(d)))}
      />
    </Figure>
  )
}
