/**
 * Listening overview: every survey program with its latest wave, response rate against target,
 * headline score, change and status, the readout across programs, and the wave calendar.
 */
import { type Column, Figure } from '@/charts'
import { cx, Grid, goTo, KpiStrip, Readout, Section, spanClass } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { addMonths } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { headlineDrill, type ListeningModel, type ProgramRow, type WaveRow } from '../engine'
import { TAB_LABEL } from '../engine/catalog'
import { answersDrill, groupsDrill, rowsBy } from '../engine/drills'
import { invitedDrill } from '../engine/measures'
import { M } from '../metrics'
import { ResponseRateFigure } from './charts'
import { count, defs, noteOf, periodWords } from './shared'
import { WaveCalendar } from './WaveCalendar'

interface ProgramDatum extends ProgramRow {
  area: string
  /** Invited people, or null when the population can't be known. */
  invitedShown: number | null
}

export function Overview({ ctx, m }: { ctx: AnalyticsContext; m: ListeningModel }) {
  const s = m.settings
  const rows: ProgramDatum[] = m.programs.map((r) => ({
    ...r,
    area: TAB_LABEL[r.tab],
    invitedShown: r.rateKnown ? r.invited : null,
  }))
  const open = (r: ProgramRow) => {
    const sm = m.surveys.get(r.survey)
    return sm?.latest ? () => headlineDrill(ctx, sm, m.uses.drivers) : null
  }
  // The invited people are listed only when there are at least the survey's minimum of them: a
  // shorter named list beside the respondent count would say who answered.
  const invited = (r: ProgramRow) =>
    r.rateKnown && r.invited >= s.minOf[r.survey]
      ? () => invitedDrill(ctx, r.survey, ctx.window, m.uses.rate(r.survey))
      : null
  const fmtOf = (r: ProgramDatum) => (r.kind === 'nps' ? 'int' : 'num2')
  const changeDrill = (r: ProgramRow) => {
    const sm = m.surveys.get(r.survey)
    const scale = r.kind === 'nps' ? '0-10' : '1-5'
    return groupsDrill(
      rowsBy(sm ? [...sm.priorRows, ...sm.latestRows].filter((x) => x.scale === scale) : [], (x) => x.wave, {
        survey: r.survey,
        wave: null,
        groupBy: 'Wave',
        min: sm?.min ?? s.minGroup,
      }),
      {
        survey: r.survey,
        wave: null,
        title: `${r.name}, ${r.priorWave ?? 'prior wave'} and ${r.latestWave ?? 'latest wave'}`,
        subtitle: ctx.scopeLabel,
        min: sm?.min ?? s.minGroup,
        uses: m.uses.drivers,
      },
    )
  }
  const columns: Column<ProgramDatum>[] = [
    { key: 'survey', label: 'Survey' },
    { key: 'latestWave', label: 'Latest wave' },
    { key: 'respondents', label: 'Respondents', format: 'int', drill: open },
    { key: 'value', label: 'Headline', format: fmtOf, drill: (r) => (r.value == null ? null : open(r)) },
    { key: 'target', label: 'Target', format: fmtOf },
    {
      key: 'change',
      label: 'Change',
      format: fmtOf,
      drill: (r) => (r.change == null ? null : () => changeDrill(r)),
    },
    { key: 'statusWord', label: 'Status' },
    // A hidden rate opens nothing: the invited list beside it would say who answered.
    {
      key: 'rate',
      label: 'Response rate',
      format: 'pct',
      drill: (r) => (r.rate == null ? null : invited(r)),
    },
    { key: 'invitedShown', label: 'Invited', format: 'int', drill: invited },
  ]
  const yearStart = addMonths(ctx.asOf, -12)
  const calendarNames = m.programs.filter((r) => m.surveys.has(r.survey)).map((r) => r.survey as string)
  const waveColumns: Column<WaveRow>[] = [
    { key: 'name', label: 'Survey' },
    { key: 'wave', label: 'Wave' },
    { key: 'start', label: 'First answer', format: 'date' },
    { key: 'end', label: 'Last answer', format: 'date' },
    { key: 'respondents', label: 'Respondents', format: 'int', drill: (w) => () => waveDrill(w) },
  ]
  const waveDrill = (w: WaveRow) => {
    const sm = m.surveys.get(w.survey)
    return answersDrill(sm ? sm.all.filter((r) => r.wave === w.wave) : [], {
      survey: w.survey,
      wave: w.wave,
      title: `${w.name}, ${w.wave}, by driver`,
      subtitle: ctx.scopeLabel,
      min: sm?.min ?? s.minGroup,
      uses: m.uses.drivers,
    })
  }
  const known = m.programs.filter((r) => r.rateKnown).length

  return (
    <>
      <KpiStrip kpis={m.kpis} />
      <Grid className="mt-4">
        {/* The readout sits beside a right column that runs as long as it (the lead chart, the
            programs table and the wave calendar), so a short chart never stretches to its height.
            Phones: the lead figure first, then the readout, then the rest (max-md:order). */}
        <Readout
          findings={m.findings}
          span={12}
          className="lg:sticky lg:top-4 lg:col-span-4 max-md:order-1"
          emptyText="No survey result stands out in this period."
        />
        <div className={cx(spanClass(8), 'max-md:contents')}>
          <Grid>
            <ResponseRateFigure ctx={ctx} m={m} span={12} />
          </Grid>
          <Grid className="md:mt-4 max-md:order-2">
            <Figure
              id="listening-programs"
              uses={m.uses.programs}
              metric={M.status}
              span={12}
              tableOnly
              title="Survey programs"
              subtitle={`Each program’s latest wave against its target; response rate over ${periodWords(ctx)}`}
              data={rows}
              columns={columns}
              definitions={defs(ctx, [M.status, M.responseRate], s.minGroup)}
              note={noteOf(
                ctx,
                `${count(m.surveys.size, 'program')} with answers`,
                `response rate target ${s.responseTarget ? fmt(s.responseTarget.value, 'pct0') : 'none'}`,
                `invited population known for ${count(known, 'program')}`,
              )}
              table={{ onRowClick: (r) => goTo('listening', r.tab) }}
              empty={
                m.surveys.size
                  ? null
                  : 'No survey answers in scope. Load a Survey responses sheet in the Data room.'
              }
            />
            {!m.engagementOn && (
              <p className="col-span-full text-small text-ink-2">
                Engagement surveys are off. Turn them on in Settings, Privacy.
              </p>
            )}
          </Grid>
          <Section
            title="Wave calendar"
            className="max-md:order-2"
            dek="When each program sent its waves over the last 12 months. Triggered surveys run all quarter; stay interviews and upward feedback run twice a year."
          >
            <Figure
              id="listening-waves"
              uses={m.uses.calendar}
              metric={M.calendar}
              span={12}
              title="Survey waves by program"
              subtitle="Each bar runs from a wave’s first answer to its last, last 12 months"
              data={m.waves}
              columns={waveColumns}
              definitions={defs(ctx, M.calendar, s.minGroup)}
              note={noteOf(ctx, count(m.waves.length, 'wave'))}
              empty={m.waves.length ? null : 'No waves in the last 12 months.'}
            >
              <WaveCalendar
                waves={m.waves}
                programs={calendarNames}
                start={yearStart}
                end={ctx.asOf}
                onSelect={(w) => drill(() => waveDrill(w))}
              />
            </Figure>
          </Section>
        </div>
      </Grid>
    </>
  )
}
