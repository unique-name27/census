/**
 * Onboarding: the day-30 and day-90 pulses, with day-30 readiness ("I had what I needed") by
 * region beside the late laptops in the onboarding checklist.
 */
import { BarList, type Column, Figure } from '@/charts'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { fmt } from '@/lib/format'
import type { ListeningModel } from '../engine'
import { type RegionReadiness, readinessRows } from '../engine/cuts'
import * as L from '../engine/lineage'
import type { SurveyModel } from '../engine/measures'
import { M } from '../metrics'
import { AreaFrame, WithSurvey } from './AreaTab'
import { readinessDrills } from './drill'
import { SurveyBlock } from './SurveyBlock'
import { count, defs, noteOf, periodWords } from './shared'

interface RegionDatum extends RegionReadiness {
  shown: string
}

export function OnboardingTab({ ctx, m }: { ctx: AnalyticsContext; m: ListeningModel }) {
  return (
    <AreaFrame
      m={m}
      tab="onboarding"
      dek="What new employees say 30 and 90 days after their start, and how their first-week readiness lines up with the onboarding checklist. Onboarding shows the checklist itself."
    >
      <WithSurvey m={m} survey="Onboarding pulse day 30">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <ReadinessFigures ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
      <WithSurvey m={m} survey="Onboarding pulse day 90">
        {(sm) => <SurveyBlock ctx={ctx} m={m} sm={sm} />}
      </WithSurvey>
    </AreaFrame>
  )
}

function ReadinessFigures({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const p = m.prepared
  const cut = m.readiness
  const rows: RegionDatum[] = (cut?.regions ?? []).map((r) => ({
    ...r,
    shown: r.suppressed ? 'Hidden to protect anonymity' : 'Yes',
  }))
  const ready = readinessRows(p, sm.period)
  const target = m.settings.readinessTarget
  // Each region's numbers carry the region's sites as their filter ("Filter to Bengaluru, Hsinchu").
  const regionDrill = readinessDrills(ctx, m, sm)
  const open = regionDrill.survey
  const lateOpen = regionDrill.late
  const startsOpen = regionDrill.starts
  const columns: Column<RegionDatum>[] = [
    { key: 'region', label: 'Region' },
    { key: 'mean', label: 'Readiness', format: 'num2', drill: (r) => (r.suppressed ? null : open(r)) },
    {
      key: 'respondents',
      label: 'Respondents',
      format: 'int',
      drill: (r) => (r.respondents ? open(r) : null),
    },
    {
      key: 'starts',
      label: 'Starts with a laptop task',
      format: 'int',
      drill: (r) => (r.starts ? startsOpen(r) : null),
    },
    { key: 'late', label: 'Laptops late', format: 'int', drill: (r) => (r.late ? lateOpen(r) : null) },
    {
      key: 'lateShare',
      label: 'Late share',
      format: 'pct',
      drill: (r) => (r.late ? lateOpen(r) : null),
    },
    { key: 'shown', label: 'Shown' },
  ]
  const hasTasks = rows.some((r) => r.starts != null)
  return (
    <Figure
      id="listening-d30-readiness"
      uses={hasTasks ? [...new Set([...m.uses.readiness, ...L.LAPTOP_TASKS])] : m.uses.readiness}
      metric={M.readiness}
      span={12}
      title="Day-30 readiness by region, beside late laptops"
      subtitle={`Mean answer on 1 to 5 to "In my first week I had what I needed", ${periodWords(ctx)}; the table adds laptops shipped after their due date for the region’s starts`}
      data={rows}
      columns={columns}
      definitions={defs(ctx, M.readiness, sm.min)}
      note={noteOf(
        ctx,
        cut ? count(cut.overall.respondents, 'respondent') : null,
        target ? `target ${fmt(target.value, 'num1')}` : null,
        hasTasks ? null : 'load Onboarding tasks to see late laptops',
      )}
      empty={
        !ready.length
          ? 'No readiness question found in the day-30 pulse. Name its driver Week-1 readiness in the Survey items sheet.'
          : rows.every((r) => r.mean == null)
            ? `Every region has fewer than ${sm.min} respondents.`
            : null
      }
    >
      <BarList
        data={rows}
        label="region"
        value="mean"
        format="num2"
        domain={[0, 5]}
        ref={target ? { value: target.value, label: `target ${fmt(target.value, 'num1')}` } : undefined}
        secondary={(d) => (d.lateShare != null ? `${fmt(d.lateShare, 'pct0')} laptops late` : null)}
        glyphTone={(d) => (m.readiness?.flag?.region === d.region ? 'warning' : 'default')}
        onSelect={(d) => (d.suppressed ? undefined : drill(open(d)))}
      />
    </Figure>
  )
}
