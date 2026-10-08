/**
 * Pipeline: where applications go (the river), who owns the next step (action queue), how each
 * stage converts and how long candidates wait, and how speed changed month by month. Every number
 * opens the applications behind it in the drill panel.
 */
import { useEffect, useRef } from 'react'
import { type Column, DotStrip, Figure, Heatmap } from '@/charts'
import { Section } from '@/components'
import { STAGES } from '@/data/schema'
import { Drill, drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { timesText } from '../engine/definitions'
import { candidateDrill, flowDrill, speedCellDrill, stepChangeDrill, stepDaysDrill } from '../engine/drills'
import { type FlowKind, type SpeedCell, TRANSITIONS } from '../engine/flow'
import { FIGURE_USES } from '../engine/lineage'
import { FIGURE_METRICS } from '../engine/metricLinks'
import type { WaitDot } from '../engine/pipeline'
import { HIRED, LAST_OPEN_STAGE } from '../engine/types'
import { RM } from '../metrics'
import { useRecruitingUi } from '../state'
import { ActionQueue } from './ActionQueue'
import { asOfNote, defOf, drillIf, NEED_CANDIDATES, NoRecruitingData, windowText } from './common'
import { DecisionsByManager } from './DecisionsByManager'
import { useRecruiting } from './hooks'
import { RiverChart } from './RiverChart'

const MEMBER_COLUMNS = [
  { key: 'candidate', label: 'Candidate' },
  { key: 'reqId', label: 'Req' },
  { key: 'title', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'source', label: 'Source' },
  { key: 'applied', label: 'Applied', format: 'date' as const },
  { key: 'stage', label: 'Furthest stage' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'exitDate', label: 'Outcome date', format: 'date' as const },
  { key: 'reason', label: 'Reason' },
]

export function PipelineTab() {
  const m = useRecruiting()
  const b = m.base
  const focusQueue = useRecruitingUi((s) => s.focusQueue)
  const queueFocused = useRecruitingUi((s) => s.queueFocused)
  const queueRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusQueue) return
    queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    queueFocused()
  }, [focusQueue, queueFocused])

  if (!b.apps.length && !b.reqs.length) return <NoRecruitingData />
  const { minGroup, aging } = b.settings

  const flow = b.flow
  type FlowRow = {
    stage: string
    flow: string
    candidates: number
    shareOfStage: number | null
    medianDays: number | null
    kind: FlowKind
    stageIndex: number
  }
  const flowRows = flow.stages.flatMap((s) => {
    const name = STAGES[s.stage]
    const share = (v: number) => (s.entered ? v / s.entered : null)
    const rows: FlowRow[] = []
    if (s.advanced)
      rows.push({
        stage: name,
        flow: `Advanced to ${STAGES[s.stage + 1].toLowerCase()}`,
        candidates: s.advanced,
        shareOfStage: share(s.advanced),
        medianDays: s.medianDays,
        kind: 'advanced',
        stageIndex: s.stage,
      })
    for (const [k, v, kind] of [
      ['Still active', s.active, 'active'],
      ['Rejected', s.rejected, 'rejected'],
      ['Withdrawn', s.withdrawn, 'withdrawn'],
      ['Offer declined', s.declined, 'declined'],
    ] as const)
      if (v)
        rows.push({
          stage: name,
          flow: k,
          candidates: v,
          shareOfStage: share(v),
          medianDays: null,
          kind,
          stageIndex: s.stage,
        })
    return rows
  })
  flowRows.push({
    stage: 'Hired',
    flow: 'Hired',
    candidates: flow.hired,
    shareOfStage: flow.total ? flow.hired / flow.total : null,
    medianDays: null,
    kind: 'node',
    stageIndex: HIRED,
  })
  const flowRowDrill = (r: FlowRow) => drillIf(r.candidates, () => flowDrill(b, r.kind, r.stageIndex))
  const flowColumns: Column<FlowRow>[] = [
    { key: 'stage', label: 'Stage' },
    { key: 'flow', label: 'Flow' },
    { key: 'candidates', label: 'Candidates', format: 'int', drill: flowRowDrill },
    { key: 'shareOfStage', label: 'Share of stage', format: 'pct', drill: flowRowDrill },
    {
      key: 'medianDays',
      label: 'Median days to advance',
      format: 'days',
      drill: (r) => drillIf(r.medianDays != null, () => stepDaysDrill(b, r.stageIndex)),
    },
  ]

  // Manager mode lists no candidate's reason for leaving the process (`column:candidates.rejectionReason`).
  const reasons = b.showCandidateReasons !== false
  const memberColumns = reasons ? MEMBER_COLUMNS : MEMBER_COLUMNS.filter((c) => c.key !== 'reason')
  const memberRow = (a: (typeof b.cohort)[number]) => ({
    candidate: a.name,
    applicationId: a.id,
    reqId: a.reqId,
    title: a.title,
    department: a.department,
    source: a.source,
    applied: a.appliedDate,
    stage: STAGES[a.furthest],
    outcome: a.outcome,
    exitDate: a.exitDate,
    ...(reasons ? { reason: a.reason ?? '' } : {}),
  })

  const conversion = [
    ...flow.stages.map((s) => ({
      stage: STAGES[s.stage],
      stageIndex: s.stage,
      entered: s.entered,
      advanced: s.advanced,
      pass: s.pass,
      rejected: s.rejected,
      withdrawn: s.withdrawn,
      declined: s.declined,
      active: s.active,
      medianDays: s.medianDays,
      change: s.deltaDays != null ? Math.round(s.deltaDays) : null,
    })),
    {
      stage: 'Hired',
      stageIndex: HIRED,
      entered: flow.hired,
      advanced: null,
      pass: null,
      rejected: null,
      withdrawn: null,
      declined: null,
      active: null,
      medianDays: null,
      change: null,
    },
  ]
  type ConversionRow = (typeof conversion)[number]
  const part = (kind: FlowKind, n: (r: ConversionRow) => number | boolean | null) => (r: ConversionRow) =>
    drillIf(n(r), () => flowDrill(b, kind, r.stageIndex))
  const conversionColumns: Column<ConversionRow>[] = [
    { key: 'stage', label: 'Stage' },
    { key: 'entered', label: 'Reached', format: 'int', drill: part('node', (r) => r.entered) },
    { key: 'advanced', label: 'Advanced', format: 'int', drill: part('advanced', (r) => r.advanced) },
    {
      key: 'pass',
      label: 'Pass rate',
      format: 'pct',
      drill: part('advanced', (r) => r.pass != null && r.advanced),
    },
    { key: 'rejected', label: 'Rejected', format: 'int', drill: part('rejected', (r) => r.rejected) },
    { key: 'withdrawn', label: 'Withdrawn', format: 'int', drill: part('withdrawn', (r) => r.withdrawn) },
    { key: 'declined', label: 'Declined', format: 'int', drill: part('declined', (r) => r.declined) },
    { key: 'active', label: 'Active', format: 'int', drill: part('active', (r) => r.active) },
    {
      key: 'medianDays',
      label: 'Median days',
      format: 'days',
      drill: (r) => drillIf(r.medianDays != null, () => stepDaysDrill(b, r.stageIndex)),
    },
    {
      key: 'change',
      label: 'Change',
      format: 'days',
      drill: (r) => drillIf(r.change != null, () => stepChangeDrill(b, r.stageIndex)),
    },
  ]
  const lacking = b.actives.filter((x) => x.tier).length
  const dotDrill = (d: WaitDot) => () => candidateDrill(b, d.item)
  const cellDrill = (c: SpeedCell) => drillIf(c.steps.length, () => speedCellDrill(b, c))

  return (
    <>
      <Section
        title="Where applications went"
        dek={
          <>
            Where the{' '}
            {flow.total > 0 ? (
              <Drill
                spec={() => flowDrill(b, 'node', 0)}
                label={`Show the ${plural(flow.total, 'application')}`}
              >
                {fmt(flow.total, 'int')}
              </Drill>
            ) : (
              '0'
            )}{' '}
            applications received {windowText(b.window)} went.
          </>
        }
      >
        <Figure
          id="recruiting-candidate-flow"
          uses={FIGURE_USES['recruiting-candidate-flow']}
          metric={FIGURE_METRICS['recruiting-candidate-flow']}
          title="Candidate flow"
          subtitle={`Applications received ${windowText(b.window)}, by the furthest stage reached and outcome on ${formatDate(b.asOf)}`}
          data={flowRows}
          columns={flowColumns}
          span={12}
          empty={b.apps.length ? (flow.total ? null : 'No applications in this period.') : NEED_CANDIDATES}
          detail={{
            label: 'Applications',
            columns: memberColumns,
            rows: () => b.cohort.map(memberRow),
          }}
          definitions={[
            defOf(b, RM.candidateFlow),
            { term: 'Cohort', text: `Applications with an applied date ${windowText(b.window)}.` },
            defOf(b, RM.passRate, { term: 'Pass rate' }),
            {
              term: 'Still active',
              text: 'In process at that stage on the as-of date: the open-ended fade.',
            },
            {
              term: 'Bottom band',
              text: 'Everyone who left the process, building up from left to right. Drawn on its own, smaller scale.',
            },
          ]}
          note={`${plural(flow.total, 'application')} · ${fmt(flow.hired, 'int')} hired · the bottom band uses a smaller scale than the river · ${asOfNote(b.asOf)}`}
        >
          <RiverChart base={b} />
        </Figure>
      </Section>

      <div ref={queueRef} className="scroll-mt-4">
        <Section
          title="Who needs to act"
          dek="Candidates who lack a next step (past the usual time), grouped by who owns it. Interview decisions sit with the hiring manager; copy a note to send each owner their list."
        >
          <ActionQueue base={b} groups={m.queue} aside={<DecisionsByManager base={b} rows={m.decisions} />} />
        </Section>
      </div>

      <Section
        title="Stage conversion and waiting time"
        dek="How each stage converts for this period’s applications, and how long today’s active candidates have been waiting."
      >
        <Figure
          id="recruiting-stage-conversion"
          uses={FIGURE_USES['recruiting-stage-conversion']}
          metric={FIGURE_METRICS['recruiting-stage-conversion']}
          title="Stage conversion"
          subtitle={`Applications received ${windowText(b.window)}, by stage, with the median days to the next stage and the change vs the prior period. Hired counts the ones that ended in an accepted offer, whenever it was accepted.`}
          data={conversion}
          columns={conversionColumns}
          tableOnly
          span={12}
          table={{ maxRows: 10 }}
          empty={b.apps.length ? (flow.total ? null : 'No applications in this period.') : NEED_CANDIDATES}
          definitions={[
            {
              term: 'Hired',
              text: 'Applications received in the period that ended in an accepted offer, whenever it was accepted. Not the same as Offers accepted on the Overview, which counts offers by the date they were accepted.',
            },
            defOf(b, RM.passRate, {
              term: 'Pass rate',
              extra: 'Candidates still active at the stage are shown separately (Active).',
            }),
            defOf(b, RM.daysToNextStage, { term: 'Median days' }),
            {
              term: 'Change',
              text: `Median days to next stage minus the same median for applications received ${windowText(b.prior)}, in days (negative = faster). Shown when both periods have at least ${minGroup} candidates.`,
            },
          ]}
          note={`${plural(flow.total, 'application')} · ${asOfNote(b.asOf)}`}
        />
        <Figure
          id="recruiting-waiting-time"
          uses={FIGURE_USES['recruiting-waiting-time']}
          metric={FIGURE_METRICS['recruiting-waiting-time']}
          title="Waiting time by stage"
          subtitle={`Days each active candidate has waited, ${formatDate(b.asOf)}`}
          data={m.waiting}
          columns={
            [
              { key: 'candidate', label: 'Candidate', drill: dotDrill },
              { key: 'applicationId', label: 'Application' },
              { key: 'stage', label: 'Stage' },
              { key: 'state', label: 'State' },
              { key: 'days', label: 'Days waiting', format: 'int', drill: dotDrill },
              { key: 'tier', label: 'Aging' },
            ] satisfies Column<WaitDot>[]
          }
          span={12}
          empty={
            b.apps.length
              ? m.waiting.length
                ? null
                : 'No active candidates on the as-of date.'
              : NEED_CANDIDATES
          }
          definitions={[
            defOf(b, RM.daysWaiting),
            {
              term: 'Red',
              text: `Overdue: no step booked past ${timesText(aging.overdue)} the usual days for the stage, a decision pending more than ${plural(aging.decisionOverdueDays, 'day')}, or an offer out more than ${plural(aging.offerOverdueDays, 'day')}.`,
            },
            {
              term: 'Amber',
              text: `Watch: no step booked past ${timesText(aging.watch)} the usual days for the stage, a decision pending more than ${plural(aging.decisionWatchDays, 'day')}, an offer out more than ${plural(aging.offerWatchDays, 'day')}, or a step booked more than ${timesText(aging.farOut)} the usual days away.`,
            },
            { term: 'Gray', text: 'Scheduled: in motion.' },
          ]}
          note={`${plural(m.waiting.length, 'active candidate')} · ${plural(lacking, 'lacks a next step', 'lack a next step')} · ticks mark each stage’s median`}
        >
          <DotStrip
            data={m.waiting}
            x="days"
            y="stage"
            id="applicationId"
            label="candidate"
            tone={(d) => d.tone}
            xFormat="days"
            yOrder={STAGES.slice(0, LAST_OPEN_STAGE + 1)}
            median
            onSelect={(d) => drill(dotDrill(d))}
            ariaLabel="Waiting time by stage"
          />
        </Figure>
      </Section>

      <Section
        title="Speed by month"
        dek="Median days for each step, by the month the step was completed. A row that darkens toward the right is a step slowing down."
      >
        <Figure
          id="recruiting-speed-heatmap"
          uses={FIGURE_USES['recruiting-speed-heatmap']}
          metric={FIGURE_METRICS['recruiting-speed-heatmap']}
          title="Days per transition by month"
          subtitle={`Median days per step, steps completed in the 12 months to ${formatDate(b.window.end)}`}
          data={m.speed}
          columns={
            [
              { key: 'month', label: 'Completed in' },
              { key: 'transition', label: 'Step' },
              { key: 'days', label: 'Median days', format: 'days', drill: cellDrill },
              { key: 'n', label: 'Steps completed', format: 'int', drill: cellDrill },
            ] satisfies Column<SpeedCell>[]
          }
          span={12}
          empty={b.apps.length ? null : NEED_CANDIDATES}
          definitions={[
            defOf(b, RM.stepDaysByMonth, {
              term: 'Median days',
              extra: `Cells with fewer than ${minGroup} steps are left blank.`,
            }),
          ]}
          note={`Cells under ${minGroup} steps are blank and hidden · ${asOfNote(b.asOf)}`}
        >
          <Heatmap
            data={m.speed}
            x="monthLabel"
            y="transition"
            value="days"
            n="n"
            format="days"
            scheme="sequential"
            xOrder={[...new Set(m.speed.map((c) => c.monthLabel))]}
            yOrder={TRANSITIONS}
            onSelect={(c) => drill(cellDrill(c))}
            ariaLabel="Days per transition by month"
          />
        </Figure>
      </Section>
    </>
  )
}
