/**
 * Candidates & hiring: candidate experience (NPS by stage and department, source and recruiter,
 * and why candidates declined) and hiring manager satisfaction by recruiter.
 */
import { BarList, type Column, Figure, Heatmap } from '@/charts'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import type { DrillSpec } from '@/drill/types'
import { fmt } from '@/lib/format'
import type { Breakdown } from '@/lib/surveys'
import type { ListeningModel } from '../engine'
import { type GroupScore, type ReasonRow, type StageCell, scoresOf } from '../engine/cuts'
import { groupsDrill, rowsBy } from '../engine/drills'
import { npsText, stageWords } from '../engine/findings'
import type { SurveyModel } from '../engine/measures'
import { candidateOf } from '../engine/prepare'
import { M, scoreMetric } from '../metrics'
import { AreaFrame, WithSurvey } from './AreaTab'
import { stageCellDrill } from './drill'
import { SurveyBlock } from './SurveyBlock'
import { count, defs, noteOf, periodWords } from './shared'

interface StageDatum extends StageCell {
  shown: string
}

interface ScoreDatum extends GroupScore {
  shown: string
}

const scoreRows = (b: Breakdown | null, measure: 'mean' | 'nps'): ScoreDatum[] =>
  b
    ? scoresOf(b, measure).map((g) => ({ ...g, shown: g.suppressed ? 'Hidden to protect anonymity' : 'Yes' }))
    : []

export function CandidatesTab({ ctx, m }: { ctx: AnalyticsContext; m: ListeningModel }) {
  return (
    <AreaFrame
      m={m}
      tab="candidates"
      dek="What candidates say about the process at each stage, and what hiring managers say about how their reqs were filled. Candidate answers are grouped by the req they applied to; hiring manager answers by the recruiter of the req they rate."
    >
      <WithSurvey m={m} survey="Candidate experience">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <CandidateCuts ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
      <WithSurvey m={m} survey="Hiring manager satisfaction">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <RecruiterFigure ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
    </AreaFrame>
  )
}

function CandidateCuts({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const p = m.prepared
  const stage = m.stage
  const wave = sm.latest?.wave ?? null
  const flagged = stage?.flag
  const cells: StageDatum[] = (stage?.cells ?? []).map((c) => ({
    ...c,
    shown: c.suppressed ? 'Hidden to protect anonymity' : 'Yes',
  }))
  // A cell of a department shown at the minimum carries the department as its filter.
  const cellOpen = stageCellDrill(ctx, m, sm)
  const stageColumns: Column<StageDatum>[] = [
    { key: 'department', label: 'Department' },
    { key: 'stage', label: 'Furthest stage' },
    { key: 'nps', label: 'NPS', format: 'int', drill: (r) => (r.suppressed ? null : cellOpen(r)) },
    {
      key: 'respondents',
      label: 'Respondents',
      format: 'int',
      drill: (r) => (r.respondents ? cellOpen(r) : null),
    },
    { key: 'shown', label: 'Shown' },
  ]

  const bySource = scoreRows(m.bySource, 'nps')
  const byRecruiter = scoreRows(m.byRecruiterCx, 'nps')
  const npsOpen = (by: 'source' | 'recruiter') => (g: GroupScore) =>
    groupsDrill(
      rowsBy(
        sm.period.filter((r) => {
          const c = candidateOf(p, r)
          const v = by === 'source' ? c?.source : c?.recruiter || (c ? p.req.get(c.reqId)?.recruiter : null)
          return g.group.startsWith('Other (')
            ? !!v && !(by === 'source' ? m.bySource : m.byRecruiterCx)?.groups.some((x) => x.group === v)
            : v === g.group
        }),
        (r) => r.driver ?? r.item,
        { survey: sm.survey, wave: null, groupBy: 'Driver', min: sm.min },
      ),
      {
        survey: sm.survey,
        wave: null,
        title: `Candidate experience, ${by} ${g.group}, by driver`,
        subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
        min: sm.min,
        uses: m.uses.candidateBy(by),
      },
    )
  const scoreColumns = (label: string, open: (g: GroupScore) => DrillSpec): Column<ScoreDatum>[] => [
    { key: 'group', label },
    { key: 'value', label: 'NPS', format: 'int', drill: (r) => (r.suppressed ? null : () => open(r)) },
    { key: 'respondents', label: 'Respondents', format: 'int', drill: (r) => () => open(r) },
    { key: 'shown', label: 'Shown' },
  ]

  const declines = m.declines
  const declineRows: ReasonRow[] = declines?.rows ?? []
  const declineOpen = () =>
    groupsDrill(
      rowsBy(
        sm.period.filter((r) => !!r.reason?.trim()),
        (r) => r.reason?.trim() || null,
        { survey: sm.survey, wave: null, groupBy: 'Decline reason', min: sm.min },
      ),
      {
        survey: sm.survey,
        wave: null,
        title: 'Why candidates declined',
        subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
        min: sm.min,
        uses: m.uses.declines,
      },
    )
  const npsMetric = scoreMetric(sm.program)

  return (
    <>
      <Figure
        id="listening-cx-stage"
        uses={m.uses.stage}
        metric={M.stageNps}
        span={12}
        title={`Candidate NPS by furthest stage and department, ${wave ?? 'latest wave'}`}
        subtitle="NPS from 0 to 10 answers, by the req’s department and the furthest stage the candidate reached; blue is positive, red negative"
        data={cells}
        columns={stageColumns}
        definitions={defs(ctx, M.stageNps, sm.min)}
        note={noteOf(
          ctx,
          flagged
            ? `${flagged.department} at the ${stageWords(flagged.stage)}: ${npsText(flagged.nps)} against ${npsText(flagged.restNps)}`
            : null,
          `gap flagged at ${fmt(m.settings.stageGap, 'int')} points`,
        )}
        empty={
          !cells.length
            ? 'No candidate NPS answers with a stage in the latest wave.'
            : cells.every((c) => c.nps == null)
              ? `Every department and stage has fewer than ${sm.min} respondents in this wave.`
              : null
        }
      >
        <Heatmap
          data={cells}
          x="stage"
          y="department"
          value="nps"
          n="respondents"
          format="int"
          scheme="diverging"
          mid={0}
          domain={[-60, 60]}
          xOrder={stage?.stages}
          yOrder={stage?.departments}
          onSelect={(d) => (d.suppressed ? undefined : drill(cellOpen(d)))}
        />
      </Figure>
      <Figure
        id="listening-cx-source"
        uses={m.uses.candidateBy('source')}
        metric={npsMetric}
        span={6}
        title="Candidate NPS by source"
        subtitle={`NPS from 0 to 10 answers, ${periodWords(ctx)}`}
        data={bySource}
        columns={scoreColumns('Source', npsOpen('source'))}
        definitions={defs(ctx, npsMetric, sm.min)}
        note={noteOf(
          ctx,
          count(
            bySource.reduce((a, g) => a + g.respondents, 0),
            'respondent',
          ),
        )}
        empty={bySource.length ? null : 'No candidate NPS answers joined to a source in the period.'}
      >
        <BarList
          data={bySource}
          label="group"
          value="value"
          format="int"
          valueText={(d) => (d.value == null ? '—' : npsText(d.value))}
          secondary={(d) => `n ${fmt(d.respondents, 'int')}`}
          onSelect={(d) => (d.suppressed ? undefined : drill(() => npsOpen('source')(d)))}
        />
      </Figure>
      <Figure
        id="listening-cx-recruiter"
        uses={m.uses.candidateBy('recruiter')}
        metric={npsMetric}
        span={6}
        title="Candidate NPS by recruiter"
        subtitle={`NPS from 0 to 10 answers, ${periodWords(ctx)}`}
        data={byRecruiter}
        columns={scoreColumns('Recruiter', npsOpen('recruiter'))}
        definitions={defs(ctx, npsMetric, sm.min)}
        note={noteOf(
          ctx,
          count(
            byRecruiter.reduce((a, g) => a + g.respondents, 0),
            'respondent',
          ),
        )}
        empty={byRecruiter.length ? null : 'No candidate NPS answers joined to a recruiter in the period.'}
      >
        <BarList
          data={byRecruiter}
          label="group"
          value="value"
          format="int"
          valueText={(d) => (d.value == null ? '—' : npsText(d.value))}
          secondary={(d) => `n ${fmt(d.respondents, 'int')}`}
          onSelect={(d) => (d.suppressed ? undefined : drill(() => npsOpen('recruiter')(d)))}
        />
      </Figure>
      <Figure
        id="listening-cx-declines"
        uses={m.uses.declines}
        metric={M.declines}
        span={6}
        title="Why candidates declined"
        subtitle={`Reason chosen by candidates who declined an offer, counted once per candidate, ${periodWords(ctx)}`}
        data={declineRows}
        columns={[
          { key: 'reason', label: 'Reason' },
          { key: 'count', label: 'Candidates', format: 'int', drill: () => declineOpen },
          { key: 'share', label: 'Share', format: 'pct', drill: () => declineOpen },
        ]}
        definitions={defs(ctx, M.declines, sm.min)}
        note={noteOf(ctx, declines ? count(declines.total, 'candidate') : null)}
        empty={
          declines?.suppressed
            ? declines.total
              ? `Fewer than ${sm.min} candidates gave a reason, so the reasons are hidden.`
              : 'No candidate who declined gave a reason in the period.'
            : null
        }
      >
        <BarList
          data={declineRows}
          label="reason"
          value="count"
          format="int"
          secondary={(d) => fmt(d.share, 'pct0')}
          onSelect={() => drill(declineOpen)}
        />
      </Figure>
    </>
  )
}

function RecruiterFigure({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const p = m.prepared
  const b = m.recruiter?.breakdown ?? null
  const rows = scoreRows(b, 'mean')
  const flag = m.recruiter?.flag
  const recruiterOf = (r: { subjectKey?: string | null }) =>
    (r.subjectKey ? p.req.get(r.subjectKey)?.recruiter : null) ?? null
  const open = (g: GroupScore) =>
    groupsDrill(
      rowsBy(
        sm.period.filter((r) => {
          const v = recruiterOf(r)
          return g.group.startsWith('Other (') ? !!v && !b?.groups.some((x) => x.group === v) : v === g.group
        }),
        (r) => r.driver ?? r.item,
        { survey: sm.survey, wave: null, groupBy: 'Driver', min: sm.min },
      ),
      {
        survey: sm.survey,
        wave: null,
        title: `Hiring manager satisfaction, ${g.group}, by driver`,
        subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
        min: sm.min,
        uses: m.uses.recruiter,
      },
    )
  const target = m.settings.targetOf[sm.survey]
  return (
    <Figure
      id="listening-hm-recruiter"
      uses={m.uses.recruiter}
      metric={M.byRecruiter}
      span={12}
      title="Hiring manager satisfaction by recruiter"
      subtitle={`Mean score on 1 to 5 for the reqs each recruiter filled, ${periodWords(ctx)}, lowest first`}
      data={rows}
      columns={[
        { key: 'group', label: 'Recruiter' },
        {
          key: 'value',
          label: 'Mean score',
          format: 'num2',
          drill: (r) => (r.suppressed ? null : () => open(r)),
        },
        { key: 'respondents', label: 'Hiring managers', format: 'int', drill: (r) => () => open(r) },
        { key: 'shown', label: 'Shown' },
      ]}
      definitions={defs(ctx, M.byRecruiter, sm.min)}
      note={noteOf(
        ctx,
        flag ? `${flag.recruiter} carries ${count(flag.openReqs, 'open req')}` : null,
        `gap flagged at ${fmt(m.settings.recruiterGap, 'num2')}`,
      )}
      empty={rows.length ? null : 'No hiring manager answers joined to a recruiter in the period.'}
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
        glyphTone={(d) => (flag && d.group === flag.recruiter ? 'warning' : 'default')}
        onSelect={(d) => (d.suppressed ? undefined : drill(() => open(d)))}
      />
    </Figure>
  )
}
