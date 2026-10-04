/**
 * Engagement: the quarterly pulse and eNPS by business unit. Shown only while the engagement
 * surveys switch is on (Settings, Privacy); while it is off the answers are not read at all.
 */
import { BarList, type Column, Figure } from '@/charts'
import { EmptyState, Grid } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { fmt } from '@/lib/format'
import type { ListeningModel } from '../engine'
import { type GroupScore, scoresOf } from '../engine/cuts'
import { groupsDrill, rowsBy } from '../engine/drills'
import { npsText } from '../engine/findings'
import type { SurveyModel } from '../engine/measures'
import { cutOf } from '../engine/prepare'
import { M } from '../metrics'
import { AreaFrame, WithSurvey } from './AreaTab'
import { SurveyBlock } from './SurveyBlock'
import { count, defs, noteOf } from './shared'

export function EngagementTab({ ctx, m }: { ctx: AnalyticsContext; m: ListeningModel }) {
  if (!m.engagementOn)
    return (
      <Grid>
        <EmptyState
          title="Engagement surveys are off"
          body="Turn them on in Settings, Privacy. While they are off, engagement answers are not shown or counted anywhere in Census."
        />
      </Grid>
    )
  return (
    <AreaFrame
      m={m}
      tab="engagement"
      dek="The quarterly engagement pulse and employee NPS by business unit. Results by manager follow the manager-cut rule like upward feedback."
    >
      <WithSurvey m={m} survey="Engagement">
        {(sm) => (
          <SurveyBlock ctx={ctx} m={m} sm={sm}>
            <EnpsByOrg ctx={ctx} m={m} sm={sm} />
          </SurveyBlock>
        )}
      </WithSurvey>
    </AreaFrame>
  )
}

interface Datum extends GroupScore {
  shown: string
}

function EnpsByOrg({ ctx, m, sm }: { ctx: AnalyticsContext; m: ListeningModel; sm: SurveyModel }) {
  const b = m.engagementByOrg
  const rows: Datum[] = b
    ? scoresOf(b, 'nps').map((g) => ({ ...g, shown: g.suppressed ? 'Hidden to protect anonymity' : 'Yes' }))
    : []
  const bu = cutOf(m.prepared, 'businessUnit')
  const wave = sm.latest?.wave ?? null
  const open = (g: GroupScore) =>
    groupsDrill(
      rowsBy(
        sm.latestRows.filter((r) => {
          const v = bu(r)
          return g.group.startsWith('Other (') ? !!v && !b?.groups.some((x) => x.group === v) : v === g.group
        }),
        (r) => r.driver ?? r.item,
        { survey: sm.survey, wave, groupBy: 'Driver', min: sm.min },
      ),
      {
        survey: sm.survey,
        wave,
        title: `Engagement, ${g.group}, by driver`,
        subtitle: `${wave ?? ''} · ${ctx.scopeLabel}`,
        min: sm.min,
        uses: m.uses.engagement,
      },
    )
  const columns: Column<Datum>[] = [
    { key: 'group', label: 'Business unit' },
    { key: 'value', label: 'eNPS', format: 'int', drill: (r) => (r.suppressed ? null : () => open(r)) },
    { key: 'respondents', label: 'Respondents', format: 'int', drill: (r) => () => open(r) },
    { key: 'shown', label: 'Shown' },
  ]
  return (
    <Figure
      id="listening-eng-org"
      uses={m.uses.engagement}
      metric={M.engagementByOrg}
      span={12}
      title={`eNPS by business unit, ${wave ?? 'latest wave'}`}
      subtitle="Employee NPS from 0 to 10 answers, by the respondent’s business unit"
      data={rows}
      columns={columns}
      definitions={defs(ctx, M.engagementByOrg, sm.min)}
      note={noteOf(
        ctx,
        count(
          rows.reduce((a, r) => a + r.respondents, 0),
          'respondent',
        ),
      )}
      empty={rows.length ? null : 'No eNPS answers in the latest wave.'}
    >
      <BarList
        data={rows}
        label="group"
        value="value"
        format="int"
        valueText={(d) => (d.value == null ? '—' : npsText(d.value))}
        secondary={(d) => `n ${fmt(d.respondents, 'int')}`}
        onSelect={(d) => (d.suppressed ? undefined : drill(() => open(d)))}
      />
    </Figure>
  )
}
