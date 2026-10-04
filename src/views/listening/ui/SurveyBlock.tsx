/**
 * One survey's section (docs/VIEWS.md, Listening, Layout): its key figures, score by driver
 * against target, change since the last wave and the driver heat table across org, location and
 * tenure (stage for candidates). Area tabs add their own cuts as children.
 */
import { type ReactNode, useState } from 'react'
import { BarList, type Column, Columns, Figure, Heatmap } from '@/charts'
import { KpiStrip, Section, Segmented } from '@/components'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { formatRange } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { type ListeningModel, surveyKpis } from '../engine'
import { driverDrill, groupsDrill, itemRowsOf } from '../engine/drills'
import { cutsFor, type DriverRow, type HeatCell, inHeatColumn, type SurveyModel } from '../engine/measures'
import { CUT_LABEL, type CutKey, cutOf } from '../engine/prepare'
import { STATUS_WORD } from '../engine/settings'
import { M } from '../metrics'
import { count, defs, noteOf, periodWords, statusTone } from './shared'

interface DriverDatum extends DriverRow {
  statusWord: string
  targetText: string
}

interface ChangeDatum {
  driver: string
  delta: number | null
  value: number | null
  prior: number | null
  material: string
}

interface HeatDatum extends HeatCell {
  shown: string
}

export function SurveyBlock({
  ctx,
  m,
  sm,
  extraKpis = [],
  children,
}: {
  ctx: AnalyticsContext
  m: ListeningModel
  sm: SurveyModel
  extraKpis?: Kpi[]
  children?: ReactNode
}) {
  const cuts = cutsFor(sm.survey)
  const [cut, setCut] = useState<CutKey>(cuts[0])
  const p = sm.program
  const key = p.key
  const wave = sm.latest?.wave ?? null
  const waveSub = sm.latest
    ? `${sm.latest.wave}, ${formatRange(sm.latest.start, sm.latest.end)}`
    : 'No waves yet'
  const min = sm.min
  const uses = m.uses.drivers
  const latestN = new Set(sm.latestRows.map((r) => r.respondentKey)).size

  const drivers: DriverDatum[] = sm.drivers.map((d) => ({
    ...d,
    statusWord: d.value == null ? '—' : STATUS_WORD[d.status],
    targetText: `target ${fmt(d.target, 'num1')}`,
  }))
  const targets = [...new Set(drivers.map((d) => d.target))]
  const oneTarget = targets.length === 1 ? targets[0] : null
  const driverOpen = (d: { driver: string }) =>
    driverDrill(sm.latestRows, d.driver, {
      survey: sm.survey,
      wave,
      title: `${d.driver}, ${p.name}, ${wave ?? 'latest wave'}, by item`,
      subtitle: `${waveSub} · ${ctx.scopeLabel}`,
      min,
      uses,
    })
  const driverColumns: Column<DriverDatum>[] = [
    { key: 'driver', label: 'Driver' },
    { key: 'value', label: 'Mean score', format: 'num2', drill: (r) => () => driverOpen(r) },
    { key: 'target', label: 'Target', format: 'num1' },
    { key: 'respondents', label: 'Respondents', format: 'int', drill: (r) => () => driverOpen(r) },
    { key: 'statusWord', label: 'Status' },
  ]

  const changes: ChangeDatum[] = sm.drivers.map((d) => ({
    driver: d.driver,
    delta: d.delta,
    value: d.value,
    prior: d.prior,
    material: d.delta == null ? '—' : d.material ? 'Yes' : 'No',
  }))
  const changeOpen = (d: { driver: string }) =>
    groupsDrill(
      [
        ...itemRowsOf(sm.priorRows, sm.survey, sm.prior?.wave ?? null, d.driver, min),
        ...itemRowsOf(sm.latestRows, sm.survey, wave, d.driver, min),
      ],
      {
        survey: sm.survey,
        wave: null,
        title: `${d.driver}, ${sm.prior?.wave ?? 'prior wave'} and ${wave ?? 'latest wave'}, by item`,
        subtitle: ctx.scopeLabel,
        min,
        uses,
      },
    )
  // A symmetric scale at least twice the material change wide, so a small move looks small.
  const reach = Math.max(m.settings.material * 2, ...changes.map((c) => Math.abs(c.delta ?? 0)))
  const changeDomain: [number, number] = [-Math.ceil(reach * 10) / 10, Math.ceil(reach * 10) / 10]
  const changeColumns: Column<ChangeDatum>[] = [
    { key: 'driver', label: 'Driver' },
    {
      key: 'prior',
      label: sm.prior ? `Mean, ${sm.prior.wave}` : 'Mean, prior wave',
      format: 'num2',
      drill: (r) => (r.prior == null ? null : () => changeOpen(r)),
    },
    {
      key: 'value',
      label: wave ? `Mean, ${wave}` : 'Mean, latest wave',
      format: 'num2',
      drill: (r) => (r.value == null ? null : () => changeOpen(r)),
    },
    {
      key: 'delta',
      label: 'Change',
      format: 'num2',
      drill: (r) => (r.delta == null ? null : () => changeOpen(r)),
    },
    { key: 'material', label: 'Material change' },
  ]

  const heat = sm.heat[cut]
  const heatRows: HeatDatum[] = (heat?.cells ?? []).map((c) => ({
    ...c,
    shown: c.suppressed ? 'Hidden to protect anonymity' : 'Yes',
  }))
  const cutKey = cutOf(m.prepared, cut)
  const heatOpen = (c: HeatCell) => {
    const answers = heat
      ? sm.period.filter(
          (r) =>
            r.scale === '1-5' && (r.driver ?? r.item) === c.driver && inHeatColumn(heat, cutKey(r), c.group),
        )
      : []
    return groupsDrill(itemRowsOf(answers, sm.survey, null, c.driver, min), {
      survey: sm.survey,
      wave: null,
      title: `${c.driver}, ${CUT_LABEL[cut].toLowerCase()} ${c.group}`,
      subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
      min,
      uses: m.uses.heat(sm.survey, cut),
    })
  }
  const heatColumns: Column<HeatDatum>[] = [
    { key: 'driver', label: 'Driver' },
    { key: 'group', label: CUT_LABEL[cut] },
    {
      key: 'value',
      label: 'Mean score',
      format: 'num2',
      drill: (r) => (r.suppressed ? null : () => heatOpen(r)),
    },
    {
      key: 'respondents',
      label: 'Respondents',
      format: 'int',
      drill: (r) => (r.respondents ? () => heatOpen(r) : null),
    },
    { key: 'shown', label: 'Shown' },
  ]
  const heatMid = oneTarget ?? m.settings.defaultTarget
  const kpis = [...surveyKpis(ctx, m, sm), ...extraKpis]
  const noFive = !drivers.length

  return (
    <Section id={`listening-${key}`} title={sm.survey} dek={`${p.definition} Sent ${programWhen(sm)}.`}>
      <KpiStrip id={`listening-${key}-kpis`} title={`${sm.survey} key figures`} kpis={kpis} />
      <Figure
        id={`listening-${key}-drivers`}
        uses={uses}
        metric={M.driverScore}
        span={6}
        title="Score by driver"
        subtitle={`Mean score on 1 to 5 in ${wave ?? 'the latest wave'}, against each driver’s target`}
        data={drivers}
        columns={driverColumns}
        definitions={defs(ctx, M.driverScore, min)}
        note={noteOf(ctx, count(latestN, 'respondent'), waveSub)}
        empty={
          noFive
            ? sm.latest
              ? 'This survey has no 1 to 5 questions in its latest wave.'
              : 'No waves yet.'
            : drivers.every((d) => d.value == null)
              ? `Every driver has fewer than ${min} respondents in this wave, so scores are hidden to protect anonymity.`
              : null
        }
      >
        <BarList
          data={drivers}
          label="driver"
          value="value"
          format="num2"
          sort="none"
          domain={[0, 5]}
          ref={
            oneTarget != null ? { value: oneTarget, label: `target ${fmt(oneTarget, 'num1')}` } : undefined
          }
          secondary={oneTarget != null ? undefined : 'targetText'}
          glyphTone={(d) => statusTone(d.status)}
          onSelect={(d) => drill(() => driverOpen(d))}
        />
      </Figure>
      <Figure
        id={`listening-${key}-change`}
        uses={uses}
        metric={M.change}
        span={6}
        title="Change since the last wave"
        subtitle={
          sm.prior && wave
            ? `Mean score in ${wave} less ${sm.prior.wave}, by driver, on 1 to 5`
            : 'Mean score in the latest wave less the wave before, by driver'
        }
        data={changes}
        columns={changeColumns}
        definitions={defs(ctx, M.change, min)}
        note={noteOf(
          ctx,
          `changes of ${fmt(m.settings.material, 'num2')} or more are material`,
          sm.prior ? `${sm.prior.wave} to ${wave}` : null,
        )}
        empty={
          !sm.compare
            ? `Shown for the whole company only. In a filtered scope this survey can come down to one manager’s team, so each number needs ${min} or more respondents and waves are not compared.`
            : !sm.prior
              ? 'Only one wave so far, so there is nothing to compare.'
              : noFive
                ? 'This survey has no 1 to 5 questions to compare.'
                : changes.every((c) => c.delta == null)
                  ? `Each driver has fewer than ${min} respondents in one of the two waves, so changes are hidden.`
                  : null
        }
      >
        <Columns
          data={changes}
          x="driver"
          y="delta"
          format="num2"
          tone={(d) => (d.material === 'Yes' ? 'default' : 'deemph')}
          yDomain={changeDomain}
          labels
          height={220}
          onSelect={(d) => (d.delta == null ? undefined : drill(() => changeOpen(d)))}
        />
      </Figure>
      <Figure
        id={`listening-${key}-heat`}
        uses={m.uses.heat(sm.survey, cut)}
        metric={M.heat}
        span={12}
        title={`Driver heat table by ${CUT_LABEL[cut].toLowerCase()}`}
        subtitle={`Mean score on 1 to 5 per driver, ${periodWords(ctx)}; blue is above ${oneTarget != null ? 'the target of ' : ''}${fmt(heatMid, 'num1')}, red below`}
        data={heatRows}
        columns={heatColumns}
        definitions={defs(ctx, M.heat, min)}
        actions={
          <Segmented
            label="Cut the drivers by"
            value={cut}
            onChange={setCut}
            options={cuts.map((c) => ({ value: c, label: CUT_LABEL[c] }))}
          />
        }
        note={noteOf(
          ctx,
          count(sm.periodRespondents, 'respondent'),
          heat?.folded ? `${count(heat.folded, 'smaller group')} folded into Other` : null,
          heat?.unassigned ? `${count(heat.unassigned, 'answer')} not joined to a group` : null,
        )}
        empty={
          noFive || !heat || !heat.cells.length
            ? 'No answers on 1 to 5 in the period for this cut.'
            : heat.cells.every((c) => c.value == null)
              ? `Every group has fewer than ${min} respondents, so the table is hidden to protect anonymity.`
              : null
        }
      >
        <Heatmap
          data={heatRows}
          x="group"
          y="driver"
          value="value"
          n="respondents"
          format="num2"
          scheme="diverging"
          mid={heatMid}
          domain={[heatMid - 1, heatMid + 1]}
          xOrder={heat?.groups}
          yOrder={heat?.drivers}
          onSelect={(d) => (d.suppressed ? undefined : drill(() => heatOpen(d)))}
        />
      </Figure>
      {children}
    </Section>
  )
}

function programWhen(sm: SurveyModel): string {
  const when: Record<string, string> = {
    'Candidate experience': 'after each interview stage and after an offer decision',
    'Hiring manager satisfaction': 'when a req is filled',
    'Onboarding pulse day 30': '30 days after the start',
    'Onboarding pulse day 90': '90 days after the start',
    'Stay interview': 'twice a year to key talent',
    'Exit survey': 'at notice of resignation',
    'Manager feedback': 'twice a year',
    'HR service survey': 'when a case is resolved',
    'Return to work': '30 days after returning from leave',
    'Training evaluation': 'after a course',
    Engagement: 'as a quarterly pulse',
  }
  return when[sm.survey] ?? 'on its own schedule'
}
