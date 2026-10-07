/**
 * Stay & exit: what keeps key talent and what would make them leave (stay interviews), and why
 * people leave (exit survey reason Pareto, top reason by location, the regretted gap and whether
 * leavers would return).
 */
import { BarList, type Column, Columns, Figure } from '@/charts'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { fmt } from '@/lib/format'
import type { ListeningModel } from '../engine'
import type { ExitLocation, GapRow, ReasonRow, StayGroup } from '../engine/cuts'
import { groupsDrill, rowsBy } from '../engine/drills'
import type { SurveyModel } from '../engine/measures'
import { M } from '../metrics'
import { AreaFrame, WithSurvey } from './AreaTab'
import { ExitVsRecordFigure } from './charts'
import { exitLocationDrill, stayGroupDrill } from './drill'
import { SurveyBlock } from './SurveyBlock'
import { count, defs, noteOf, periodWords } from './shared'

export function StayExitTab({ ctx, m }: { ctx: AnalyticsContext; m: ListeningModel }) {
  const wouldReturn = m.kpis.filter((k) => k.id === 'would-return')
  return (
    <AreaFrame
      m={m}
      tab="stay-exit"
      dek="What keeps key talent and what would make them leave, from stay interviews twice a year, and why people leave, from the exit survey at notice of resignation. Reasons count people, not answers."
    >
      <WithSurvey m={m} survey="Stay interview">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <StayFigures ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
      <WithSurvey m={m} survey="Exit survey">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm} extraKpis={wouldReturn}>
            <ExitFigures ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
    </AreaFrame>
  )
}

function StayFigures({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const stay = m.stay
  const reasons: ReasonRow[] = stay?.reasons ?? []
  const groups: StayGroup[] = stay?.groups ?? []
  const sub = `${ctx.window.label} · ${ctx.scopeLabel}`
  const reasonOpen = () =>
    groupsDrill(
      rowsBy(sm.period, (r) => r.reason?.trim() || null, {
        survey: sm.survey,
        wave: null,
        groupBy: 'Top stay risk',
        min: sm.min,
      }),
      {
        survey: sm.survey,
        wave: null,
        title: 'Stay risks named',
        subtitle: sub,
        min: sm.min,
        uses: m.uses.stay,
      },
    )
  // A group's stay risks carry its department and levels as their filter.
  const groupOpen = stayGroupDrill(ctx, m, sm)
  const groupColumns: Column<StayGroup>[] = [
    { key: 'group', label: 'Department and career band' },
    { key: 'reason', label: 'Top stay risk' },
    { key: 'share', label: 'Share of stay interviews', format: 'pct', drill: groupOpen },
    { key: 'count', label: 'Interviews naming it', format: 'int', drill: groupOpen },
    { key: 'interviews', label: 'Stay interviews', format: 'int', drill: groupOpen },
    { key: 'respondents', label: 'People', format: 'int', drill: groupOpen },
  ]
  const flag = stay?.flag
  return (
    <>
      <Figure
        id="listening-stay-risks"
        uses={m.uses.stay}
        metric={M.topRisk}
        span={5}
        title="Top stay risks"
        subtitle={`What key talent say would make them leave, share of stay interviews, ${periodWords(ctx)}`}
        data={reasons}
        columns={[
          { key: 'reason', label: 'Stay risk' },
          { key: 'count', label: 'Stay interviews', format: 'int', drill: () => reasonOpen },
          { key: 'share', label: 'Share', format: 'pct', drill: () => reasonOpen },
        ]}
        definitions={defs(ctx, M.topRisk, sm.min)}
        note={noteOf(
          ctx,
          stay ? count(stay.interviews, 'stay interview') : null,
          stay ? count(stay.respondents, 'person', 'people') : null,
        )}
        empty={
          stay?.suppressed
            ? `Fewer than ${sm.min} people named a stay risk, so the reasons are hidden.`
            : reasons.length
              ? null
              : 'No stay interview named a reason in the period.'
        }
      >
        <BarList
          data={reasons}
          label="reason"
          value="share"
          format="pct"
          secondary={(d) => `${fmt(d.count, 'int')}`}
          onSelect={() => drill(reasonOpen)}
        />
      </Figure>
      <Figure
        id="listening-stay-groups"
        uses={m.uses.stay}
        metric={M.topRisk}
        span={7}
        tableOnly
        title="Where one stay risk dominates"
        subtitle={`Top stay risk per department and career band with ${sm.min} or more people, highest share first`}
        data={groups}
        columns={groupColumns}
        definitions={defs(ctx, M.topRisk, sm.min)}
        note={noteOf(
          ctx,
          flag ? `${flag.group}: ${flag.reason.toLowerCase()} in ${fmt(flag.share, 'pct0')}` : null,
          `flagged from ${fmt(m.settings.riskShare, 'pct0')}`,
        )}
        table={{ maxRows: 12 }}
        empty={
          groups.length
            ? null
            : `No department and career band has ${sm.min} or more people with a stay interview.`
        }
      />
    </>
  )
}

interface GapDatum extends GapRow {
  group: string
  value: number | null
  n: number
}

function ExitFigures({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const exit = m.exit
  const p = m.prepared
  const reasons: ReasonRow[] = exit?.reasons ?? []
  const locations: ExitLocation[] = exit?.locations ?? []
  const sub = `${ctx.window.label} · ${ctx.scopeLabel}`
  const reasonOpen = () =>
    groupsDrill(
      rowsBy(sm.period, (r) => r.reason?.trim() || null, {
        survey: sm.survey,
        wave: null,
        groupBy: 'Exit reason',
        min: sm.min,
      }),
      {
        survey: sm.survey,
        wave: null,
        title: 'Exit survey reasons',
        subtitle: sub,
        min: sm.min,
        uses: m.uses.exitReasons,
      },
    )
  // A location's exit reasons carry the location as their filter.
  const locationOpen = exitLocationDrill(ctx, m, sm)
  const locationRows = locations.map((l) => ({
    ...l,
    nextReason: l.next?.reason ?? '—',
    nextCount: l.next?.count ?? null,
  }))
  type LocationDatum = (typeof locationRows)[number]
  const locationColumns: Column<LocationDatum>[] = [
    { key: 'location', label: 'Location' },
    { key: 'respondents', label: 'Leavers who answered', format: 'int', drill: locationOpen },
    { key: 'reason', label: 'Top reason' },
    { key: 'count', label: 'Naming it', format: 'int', drill: locationOpen },
    { key: 'share', label: 'Share', format: 'pct', drill: locationOpen },
    { key: 'nextReason', label: 'Next reason' },
    {
      key: 'nextCount',
      label: 'Naming it',
      format: 'int',
      drill: (l) => (l.next ? locationOpen(l) : null),
    },
  ]
  const gapRows: GapDatum[] = m.regretted.flatMap((g) => [
    { ...g, group: 'Regretted leavers', value: g.regretted, n: g.regrettedN },
    { ...g, group: 'Other leavers', value: g.other, n: g.otherN },
  ])
  const gapOpen = (g: GapDatum) => {
    const want = g.group === 'Regretted leavers'
    return groupsDrill(
      rowsBy(
        sm.period.filter((r) => {
          const e = p.emp.get(r.respondentKey)
          return e?.regrettable != null && e.regrettable === want && r.scale === '1-5'
        }),
        (r) => r.driver ?? r.item,
        { survey: sm.survey, wave: null, groupBy: 'Driver', min: sm.min },
      ),
      {
        survey: sm.survey,
        wave: null,
        title: `Exit survey, ${g.group.toLowerCase()}, by driver`,
        subtitle: sub,
        min: sm.min,
        uses: m.uses.regretted,
      },
    )
  }
  const flag = exit?.flag
  return (
    <>
      <Figure
        id="listening-exit-reasons"
        uses={m.uses.exitReasons}
        metric={M.exitReasons}
        span={5}
        title="Exit reasons"
        subtitle={`Primary reason people leaving by choice give, counted once per person, ${periodWords(ctx)}`}
        data={reasons}
        columns={[
          { key: 'reason', label: 'Reason' },
          { key: 'count', label: 'Leavers', format: 'int', drill: () => reasonOpen },
          { key: 'share', label: 'Share', format: 'pct', drill: () => reasonOpen },
        ]}
        definitions={defs(ctx, M.exitReasons, sm.min)}
        note={noteOf(ctx, exit ? count(exit.respondents, 'leaver') : null)}
        empty={
          exit?.suppressed
            ? `Fewer than ${sm.min} leavers gave a reason, so the reasons are hidden.`
            : reasons.length
              ? null
              : 'No exit survey reason in the period.'
        }
      >
        <BarList
          data={reasons}
          label="reason"
          value="count"
          format="int"
          top={10}
          secondary={(d) => fmt(d.share, 'pct0')}
          onSelect={() => drill(reasonOpen)}
        />
      </Figure>
      <Figure
        id="listening-exit-locations"
        uses={m.uses.exitReasons}
        metric={M.exitReasons}
        span={7}
        tableOnly
        title="Top exit reason by location"
        subtitle={`Locations with ${sm.min} or more leavers who answered, ${periodWords(ctx)}`}
        data={locationRows}
        columns={locationColumns}
        definitions={defs(ctx, M.exitReasons, sm.min)}
        note={noteOf(
          ctx,
          flag
            ? `${flag.location}: ${flag.reason.toLowerCase()} for ${flag.count} of ${flag.respondents}`
            : null,
        )}
        empty={locationRows.length ? null : `No location has ${sm.min} or more leavers who answered.`}
      />
      <ExitVsRecordFigure ctx={ctx} m={m} sm={sm} />
      <Figure
        id="listening-exit-regretted"
        uses={m.uses.regretted}
        metric={M.driverGap}
        span={12}
        title="Exit survey by driver, regretted and other leavers"
        subtitle={`Mean score on 1 to 5, ${periodWords(ctx)}; regretted leavers are the ones the business wanted to keep`}
        data={gapRows}
        columns={[
          { key: 'driver', label: 'Driver' },
          { key: 'group', label: 'Leavers' },
          {
            key: 'value',
            label: 'Mean score',
            format: 'num2',
            drill: (g) => (g.value == null ? null : () => gapOpen(g)),
          },
          { key: 'n', label: 'Respondents', format: 'int', drill: (g) => (g.n ? () => gapOpen(g) : null) },
          {
            key: 'gap',
            label: 'Regretted less other',
            format: 'num2',
            drill: (g) => (g.gap == null ? null : () => gapOpen(g)),
          },
        ]}
        definitions={defs(ctx, M.driverGap, sm.min)}
        note={noteOf(ctx, `groups under ${sm.min} respondents are hidden`)}
        empty={
          gapRows.some((g) => g.value != null)
            ? null
            : 'Not enough regretted and other leavers answered to compare.'
        }
      >
        <Columns
          data={gapRows}
          x="driver"
          y="value"
          series="group"
          seriesOrder={['Regretted leavers', 'Other leavers']}
          format="num2"
          yDomain={[0, 5]}
          height={240}
          onSelect={(g) => (g.value == null ? undefined : drill(() => gapOpen(g)))}
        />
      </Figure>
    </>
  )
}
