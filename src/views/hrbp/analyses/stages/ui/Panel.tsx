/**
 * Engineering by chip development stage (docs/ANALYSES.md, 4.6), inside the shared frame: the job
 * family control (session state, never in the address), the lead capacity figure, then hiring in
 * flight beside the stage ratios, where each stage is staffed, stage headcount over time and the
 * job functions behind the stages. The family control scopes every number on the tab, the KPI
 * strip and readout included; off screen (a whole-view export) it reads All engineering.
 */
import { useState } from 'react'
import { useCan } from '@/access'
import { S } from '@/access/surfaces'
import { Button, Menu, Section } from '@/components'
import { useRouteShown } from '@/components/RouteLink'
import { useChartHeight } from '@/components/useNarrow'
import { openSettings } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { openMetricDefinition } from '@/views/data/metrics/open'
import { AnalysisFrame } from '../../shell/AnalysisFrame'
import type { AnalysisPanelProps } from '../../types'
import { type StagesModel, stagesModelFor } from '../engine'
import { SID } from '../engine/metrics'
import { familyMenuLabel } from '../engine/model'
import {
  CapacityFigure,
  FunctionsFigure,
  HiringFigure,
  RatiosFigure,
  TrendFigure,
  WhereFigure,
} from './figures'

const ALL = 'All engineering'

/** The job family control: All engineering, then each family with engineering people in scope. */
function FamilyControl({
  model,
  family,
  onChange,
}: {
  model: StagesModel
  family: string | null
  onChange: (f: string | null) => void
}) {
  if (model.families.length < 2 && !family) return null
  return (
    <Menu
      align="end"
      width={280}
      trigger={
        <Button size="sm" caret>
          Job family: {family ?? ALL}
        </Button>
      }
      items={[
        { label: ALL, hint: model.people.length.toLocaleString('en-US'), onSelect: () => onChange(null) },
        { separator: true },
        ...model.families.map((f) => ({
          label: familyMenuLabel(f),
          hint: f.people.toLocaleString('en-US'),
          onSelect: () => onChange(f.name),
        })),
      ]}
    />
  )
}

export function Panel({ def, model, ctx, offscreen }: AnalysisPanelProps<StagesModel>) {
  const [picked, setPicked] = useState<string | null>(null)
  // A family no longer in scope (the filters changed) reads as All engineering.
  const family = !offscreen && picked && model.families.some((f) => f.name === picked) ? picked : null
  const m = family ? stagesModelFor(ctx, family) : model
  const leadHeight = useChartHeight('lead')
  const listsShown = useCan(S.settings('lists'))
  const dictionaryShown = useRouteShown('data', 'metrics')
  const asOf = formatDate(ctx.asOf)
  const familyNote = family ? `Job family: ${family}` : null
  return (
    <AnalysisFrame
      def={def}
      model={m}
      ctx={ctx}
      actions={offscreen ? undefined : <FamilyControl model={model} family={family} onChange={setPicked} />}
      lead={<CapacityFigure m={m} ctx={ctx} familyNote={familyNote} height={leadHeight} />}
    >
      <Section
        title="Hiring and ratios"
        dek={`Which stages we are hiring into against their size today, and how each stage compares with the one it works beside. People and openings on ${asOf}.`}
      >
        <HiringFigure m={m} ctx={ctx} familyNote={familyNote} />
        <RatiosFigure
          m={m}
          ctx={ctx}
          familyNote={familyNote}
          onSetting={dictionaryShown ? () => openMetricDefinition(SID.ratios) : undefined}
        />
      </Section>
      <Section
        title="Where each stage is staffed"
        dek="Which stages depend on one site or business unit, read with that site's attrition in the readout."
      >
        <WhereFigure m={m} ctx={ctx} familyNote={familyNote} />
      </Section>
      <Section title="Over time" dek="How each stage has grown over the last two years.">
        <TrendFigure m={m} ctx={ctx} familyNote={familyNote} />
      </Section>
      <Section
        title="Job functions behind the stages"
        dek="Which job functions feed each stage, how their stage was set, and which have none yet."
      >
        <FunctionsFigure m={m} ctx={ctx} familyNote={familyNote} />
        <div className="col-span-full -mt-2 text-small text-ink-2">
          {listsShown ? (
            <button
              type="button"
              className="rounded-mark font-medium text-link underline-offset-2 hover:underline"
              onClick={() => openSettings('lists')}
            >
              Set stages in Settings, Official lists, Job functions
            </button>
          ) : (
            'Set stages in Settings, Official lists, Job functions.'
          )}
        </div>
      </Section>
    </AnalysisFrame>
  )
}
