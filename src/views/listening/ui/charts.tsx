/**
 * The Listening charts added with the design refresh (docs/CHARTS.md, Listening): response rate
 * by program (the Overview's lead), driver scores over the last waves (in every survey block) and
 * exit reasons in the survey beside the HR record (Stay & exit). Rows come from engine/charts.ts;
 * every survey number opens grouped counts, never one person's answers.
 */
import { BarList, type Column, Figure, HBars, Lines } from '@/charts'
import { useChartHeight, useNarrow } from '@/components/useNarrow'
import type { AnalyticsContext } from '@/data/context'
import type { SurveyType } from '@/data/schema'
import { drill } from '@/drill'
import { drillSpec } from '@/drill/types'
import { fmt } from '@/lib/format'
import type { ListeningModel, ProgramRow } from '../engine'
import {
  type DriverTrendPoint,
  driverTrend,
  EXIT_SURVEY,
  type ExitReasonRow,
  exitReasonsVsRecord,
  HR_RECORD,
  rateBars,
  surveyKeysOf,
} from '../engine/charts'
import { groupsDrill, itemRowsOf, rowsBy } from '../engine/drills'
import { invitedDrill, type SurveyModel } from '../engine/measures'
import { M } from '../metrics'
import { count, defs, noteOf, periodWords } from './shared'

/* ───────────── response rate by program ───────────── */

interface RateBar extends ProgramRow {
  /** The program's name on the bar. */
  program: string
}

/** Program names where the headline name is a score ("Candidate NPS" is the candidate experience survey). */
const PROGRAM_NAME: Partial<Record<SurveyType, string>> = {
  'Candidate experience': 'Candidate experience',
  'Exit survey': 'Exit survey',
  'Return to work': 'Return to work',
  'HR service survey': 'HR service survey',
  'Stay interview': 'Stay interviews',
  'Training evaluation': 'Training evaluation',
}

/** Short program names for phones. */
const SHORT_PROGRAM: Partial<Record<SurveyType, string>> = {
  'Candidate experience': 'Candidates',
  'Hiring manager satisfaction': 'Hiring managers',
  'Onboarding pulse day 30': 'Day 30 pulse',
  'Onboarding pulse day 90': 'Day 90 pulse',
  'Exit survey': 'Exit survey',
  'HR service survey': 'HR service',
  'Return to work': 'Return to work',
}

export function ResponseRateFigure({
  ctx,
  m,
  span = 8,
}: {
  ctx: AnalyticsContext
  m: ListeningModel
  /** 8 beside the readout; 12 inside the overview's right column. */
  span?: 8 | 12
}) {
  const s = m.settings
  const height = useChartHeight('lead')
  const narrow = useNarrow()
  // Bars are named for the program, not its headline score ("Exit survey", not "Exit survey
  // score"); phones get short names, so no label is cut off.
  const rows: RateBar[] = rateBars(m.programs).map((r) => ({
    ...r,
    program: (narrow ? SHORT_PROGRAM[r.survey] : undefined) ?? PROGRAM_NAME[r.survey] ?? r.survey,
  }))
  const target = s.responseTarget?.value ?? null
  const unknown = m.programs.length - rows.length
  // The invited people open only when the rate shows and there are at least the survey's minimum
  // of them: a shorter named list beside the respondent count would say who answered.
  const invited = (r: ProgramRow) =>
    r.rate != null && r.invited >= s.minOf[r.survey]
      ? () => invitedDrill(ctx, r.survey, ctx.window, m.uses.rate(r.survey))
      : null
  const columns: Column<RateBar>[] = [
    { key: 'program', label: 'Program' },
    { key: 'rate', label: 'Response rate', format: 'pct', drill: invited },
    { key: 'responded', label: 'Answered', format: 'int' },
    { key: 'invited', label: 'Invited', format: 'int', drill: invited },
  ]
  return (
    <Figure
      id="listening-response-rate-by-program"
      uses={m.uses.programs}
      metric={M.responseRate}
      span={span}
      title="Response rate by program"
      subtitle={`People invited in the ${periodWords(ctx)} who answered at least once${target != null ? `, against the ${fmt(target, 'pct0')} target` : ''}`}
      data={rows}
      columns={columns}
      definitions={defs(ctx, M.responseRate, s.minGroup)}
      note={noteOf(
        ctx,
        count(rows.length, 'program'),
        unknown ? `invited population not known for ${count(unknown, 'other program')}` : null,
      )}
      empty={
        rows.length
          ? null
          : 'No program in scope has an invited population Census can work out, so no response rate shows.'
      }
      emptyHeight={height}
    >
      <BarList
        data={rows}
        label="program"
        value="rate"
        format="pct"
        sort="none"
        domain={[0, 1]}
        ref={target != null ? { value: target, label: `Target ${fmt(target, 'pct0')}` } : undefined}
        // Phones: whole percents and no "invited", so the counts fit beside the bar.
        valueText={narrow ? (d) => fmt(d.rate, 'pct0') : undefined}
        secondary={(d) =>
          d.responded == null
            ? `${fmt(d.invited, 'int')} invited`
            : `${fmt(d.responded, 'int')} of ${fmt(d.invited, 'int')}${narrow ? '' : ' invited'}`
        }
        glyphTone={(d) => (target != null && d.rate != null && d.rate < target ? 'warning' : 'default')}
        nullNote={`Hidden to protect anonymity (n < ${s.minGroup})`}
        onSelect={(d) => drill(invited(d))}
        selectable={(d) => !!invited(d)}
      />
    </Figure>
  )
}

/* ───────────── driver scores by wave ───────────── */

/** An evenly spaced stand-in date for the i-th wave, so the waves plot at equal steps. */
const waveSlot = (i: number): string => `2000-01-${String(i + 1).padStart(2, '0')}`

export function DriverTrendFigure({
  ctx,
  m,
  sm,
}: {
  ctx: AnalyticsContext
  m: ListeningModel
  sm: SurveyModel
}) {
  const key = sm.program.key
  const min = sm.min
  const t = driverTrend(m.prepared, sm)
  const targets = [...new Set(sm.drivers.map((d) => d.target))]
  const oneTarget = targets.length === 1 ? targets[0] : null
  const open = (d: DriverTrendPoint) =>
    d.value == null
      ? null
      : () =>
          groupsDrill(itemRowsOf(d.rows, sm.survey, d.wave, d.driver, min), {
            survey: sm.survey,
            wave: d.wave,
            title: `${d.driver}, ${sm.program.name}, ${d.wave}, by item`,
            subtitle: ctx.scopeLabel,
            min,
            uses: m.uses.drivers,
          })
  const columns: Column<DriverTrendPoint>[] = [
    { key: 'driver', label: 'Driver' },
    { key: 'wave', label: 'Wave' },
    { key: 'start', label: 'First answer', format: 'date' },
    { key: 'value', label: 'Mean score', format: 'num2', drill: open },
    {
      key: 'respondents',
      label: 'Respondents',
      format: 'int',
      drill: (r) => (r.respondents ? open(r) : null),
    },
  ]
  const shown = t.points.some((x) => x.value != null)
  // Waves sit at equal steps named for the wave ("2026 Q1"), not on a calendar by first answer.
  const slotOf = new Map(t.waves.map((w, i) => [w.wave, waveSlot(i)]))
  const waveAt = new Map(t.waves.map((w, i) => [waveSlot(i), w.wave]))
  const plotted = t.points.map((p) => ({ ...p, slot: slotOf.get(p.wave) ?? waveSlot(0) }))
  // The score axis is zoomed to the scores (and the target), in half points within 1 to 5.
  const values = t.points.flatMap((p) => (p.value == null ? [] : [p.value]))
  if (oneTarget != null) values.push(oneTarget)
  const yDomain: [number, number] = values.length
    ? [
        Math.max(1, Math.floor((Math.min(...values) - 0.15) * 2) / 2),
        Math.min(5, Math.ceil((Math.max(...values) + 0.15) * 2) / 2),
      ]
    : [1, 5]
  return (
    <Figure
      id={`listening-${key}-trend`}
      uses={m.uses.drivers}
      metric={M.trend}
      span={12}
      title="Driver scores by wave"
      subtitle={`Mean score on 1 to 5 per driver in the last ${count(t.waves.length || 4, 'wave')}${t.emphasis ? `; ${t.emphasis.toLowerCase()} moved most` : ''}`}
      data={t.points}
      columns={columns}
      definitions={defs(ctx, M.trend, min)}
      note={noteOf(
        ctx,
        t.waves.length ? `${t.waves[0].wave} to ${t.waves.at(-1)?.wave}` : null,
        t.folded ? `${count(t.folded, 'more driver')} in the table view of Score by driver` : null,
      )}
      empty={
        !sm.compare
          ? `Shown for the whole company only. In a filtered scope this survey can come down to one manager’s team, so waves are not compared.`
          : t.waves.length < 2
            ? 'Fewer than two waves so far, so there is no trend yet.'
            : !t.points.length
              ? 'This survey has no 1 to 5 questions in these waves.'
              : shown
                ? null
                : `Every driver has fewer than ${min} respondents in each wave, so scores are hidden to protect anonymity.`
      }
    >
      <Lines
        data={plotted}
        x="slot"
        xLabel={(x) => waveAt.get(x) ?? x}
        y="value"
        series="driver"
        seriesOrder={t.drivers}
        emphasize={t.drivers.length > 1 ? (t.emphasis ?? undefined) : undefined}
        format="num2"
        yDomain={yDomain}
        ref={oneTarget != null ? { value: oneTarget, label: `Target ${fmt(oneTarget, 'num1')}` } : undefined}
        onSelect={(d) => drill(open(d))}
        selectable={(d) => !!open(d)}
      />
    </Figure>
  )
}

/* ───────────── exit reasons: survey and HR record ───────────── */

export function ExitVsRecordFigure({
  ctx,
  m,
  sm,
}: {
  ctx: AnalyticsContext
  m: ListeningModel
  sm: SurveyModel
}) {
  const min = sm.min
  const x = exitReasonsVsRecord(ctx, sm.period, min)
  const sub = `${ctx.window.label} · ${ctx.scopeLabel}`
  const surveyOpen = (reason: string) => {
    const who = surveyKeysOf(x, reason)
    const rows = sm.period.filter((r) => who.has(r.respondentKey))
    return groupsDrill(
      rowsBy(rows, () => reason, { survey: sm.survey, wave: null, groupBy: 'Exit reason', min }),
      {
        survey: sm.survey,
        wave: null,
        title: `Exit survey: ${reason === x.foldedLabel ? `${reason} (${x.folded.join(', ')})` : reason}`,
        subtitle: sub,
        min,
        uses: m.uses.exitReasons,
      },
    )
  }
  const recordOpen = (reason: string) =>
    drillSpec({
      kind: 'employees',
      title: `Voluntary leavers with the termination reason ${reason}`,
      subtitle: sub,
      rows: x.leavers.filter((e) => e.terminationReason?.trim() === reason),
      note: 'From the HR record. The exit survey is never matched to these people.',
      uses: [
        'employees.terminationDate',
        'employees.terminationType',
        'employees.terminationReason',
        'employees.employmentType',
      ],
    })
  const open = (d: ExitReasonRow) =>
    !d.opens ? null : d.source === EXIT_SURVEY ? () => surveyOpen(d.reason) : () => recordOpen(d.reason)
  const unlisted = x.rows.filter((r) => r.source === HR_RECORD && !!r.count && !r.opens).length
  const columns: Column<ExitReasonRow>[] = [
    { key: 'reason', label: 'Reason' },
    { key: 'source', label: 'Source' },
    { key: 'count', label: 'People', format: 'int', drill: open },
    { key: 'share', label: 'Share', format: 'pct', drill: open },
  ]
  const both = !x.survey.hidden && !x.record.hidden
  return (
    <Figure
      id="listening-exit-reasons-vs-record"
      uses={[
        ...m.uses.exitReasons,
        'employees.terminationDate',
        'employees.terminationType',
        'employees.terminationReason',
        'employees.employmentType',
      ]}
      metric={M.exitVsRecord}
      span={12}
      title="Why people left: exit survey and HR record"
      subtitle={`Share of leavers giving each reason in the exit survey, and share of voluntary leavers with that termination reason in the HR record, ${periodWords(ctx)}`}
      data={x.rows}
      columns={columns}
      definitions={defs(ctx, M.exitVsRecord, min)}
      note={noteOf(
        ctx,
        x.survey.hidden ? null : count(x.survey.people, 'survey respondent'),
        x.record.hidden ? null : count(x.record.people, 'voluntary leaver'),
        both
          ? null
          : x.survey.hidden
            ? `survey hidden under ${min} respondents`
            : `HR record hidden under ${min} leavers`,
        x.foldedLabel ? `${count(x.folded.length, 'survey reason')} grouped in the last row` : null,
        unlisted
          ? `${count(unlisted, 'HR record reason')} the survey shows for fewer than ${min} people ${unlisted === 1 ? 'is' : 'are'} counted, not listed`
          : null,
      )}
      empty={
        x.survey.hidden && x.record.hidden
          ? `Fewer than ${min} leavers on each side gave a reason, so both are hidden to protect anonymity.`
          : x.reasons.length
            ? null
            : 'No exit reason in the period.'
      }
    >
      <HBars
        data={x.rows}
        y="reason"
        x="share"
        series="source"
        seriesOrder={[EXIT_SURVEY, HR_RECORD]}
        yOrder={x.reasons}
        format="pct"
        onSelect={(d) => drill(open(d))}
        onSelectSegment={(d) => drill(open(d))}
        selectable={(d) => !!open(d)}
        lockedNote={(d) =>
          d.source === HR_RECORD && d.count && !d.opens
            ? `Not listed: the exit survey shows this reason for fewer than ${min} people`
            : null
        }
      />
    </Figure>
  )
}
