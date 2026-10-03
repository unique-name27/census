import { useState } from 'react'
import { BarList, Columns, Figure } from '@/charts'
import { Section, Segmented } from '@/components'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import { backTestSummary, factorDef, RISK_BANDS } from '../engine/risk'
import {
  BACKTEST_COLUMNS,
  BAND_COLUMNS,
  DRIVER_COLUMNS,
  EVIDENCE_COLUMNS,
  EXIT_PERSON_COLUMNS,
  PROMOTION_OVERDUE_COLUMNS,
  RISK_PERSON_FULL_COLUMNS,
} from './columns'
import { DEF } from './defs'

type WatchBand = 'High' | 'Medium'

export function RetentionTab({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const asOf = formatDate(ctx.asOf)
  const ret = m.retention
  const risk = m.risk
  const bt = risk.backTest
  const [watch, setWatch] = useState<WatchBand>('High')
  const highCount = ret.bands.find((b) => b.band === 'High')?.people ?? 0
  const drivers = ret.drivers
    .filter((d) => d.anyReason > 0)
    .map((d) => ({ ...d, share: highCount >= 5 ? d.anyReason / highCount : null }))
  const evidence = risk.evidence.map((e) => ({ ...e, definition: factorDef.get(e.key)?.text ?? '' }))
  const watchRows = watch === 'High' ? ret.watchList.filter((r) => r.band === 'High') : ret.watchList
  const noPeople = ret.scored ? null : 'Nobody in this scope is an active employee at the as-of date.'
  const pointsNote = risk.learned
    ? 'Points come from voluntary exits over the last 12 months'
    : 'Default points: there were fewer than 20 exits or 100 people a year ago to learn from'
  const offNote = risk.off.length
    ? ` · switched off: ${risk.off.map((o) => `${factorDef.get(o.key)?.label.toLowerCase()} (${o.why.toLowerCase()})`).join('; ')}`
    : ''

  return (
    <>
      <Section
        title="Who is at risk of leaving"
        dek="Every active employee gets a flight-risk score from plain factors. The bands are checked against real exits a year later, so you can judge how far to trust them."
      >
        <Figure
          id="talent-risk-bands"
          title="People by risk band"
          subtitle={`Active employees by flight-risk band, scored as of ${asOf}`}
          data={ret.bands}
          columns={BAND_COLUMNS}
          definitions={[DEF.flightRisk, DEF.bands]}
          note={`${plural(ret.scored, 'person', 'people')} scored · high band starts at a score of ${fmt(risk.cutHigh)}`}
          span={4}
          empty={noPeople}
        >
          <Columns
            data={ret.bands}
            x="band"
            y="people"
            xOrder={RISK_BANDS}
            tone={(d) => (d.band === 'High' ? 'default' : 'deemph')}
            labels
            height={220}
            ariaLabel="People by flight-risk band"
          />
        </Figure>
        <Figure
          id="talent-risk-back-test"
          title="Exit rate by risk band, back-tested"
          subtitle={`Scored as of ${formatDate(bt.scoredOn)}; ${bt.exitKind === 'voluntary' ? 'voluntary exits' : 'exits'} ${bt.outcome.label}, whole company`}
          data={bt.bands}
          columns={BACKTEST_COLUMNS}
          definitions={[DEF.backTest, DEF.bands]}
          note={`${backTestSummary(bt)} ${plural(bt.population, 'person', 'people')} scored, ${fmt(bt.leavers)} left.`}
          span={4}
          empty={bt.population ? null : 'There is no workforce history 12 months back to test against.'}
        >
          <Columns
            data={bt.bands}
            x="band"
            y="rate"
            xOrder={RISK_BANDS}
            format="pct"
            tone={(d) => (d.band === 'High' ? 'default' : 'deemph')}
            ref={
              bt.overallRate != null
                ? { value: bt.overallRate, label: `All ${fmt(bt.overallRate, 'pct')}` }
                : undefined
            }
            labels
            height={220}
            ariaLabel="Exit rate within 12 months by flight-risk band a year earlier"
          />
        </Figure>
        <Figure
          id="talent-risk-drivers"
          title="What drives risk"
          subtitle="Share of people in the high band with each factor"
          data={drivers}
          columns={DRIVER_COLUMNS}
          definitions={[DEF.flightRisk]}
          note={`${plural(highCount, 'person', 'people')} in the high band · secondary text: how often the factor is the top reason`}
          span={4}
          empty={noPeople ?? (drivers.length ? null : 'No factor earned points.')}
        >
          <BarList
            data={drivers}
            label="factor"
            value="share"
            format="pct0"
            domain={[0, 1]}
            secondary={(d) => (d.topReason ? `top for ${fmt(d.topReason)}` : null)}
            ariaLabel="Share of high-band people with each factor"
          />
        </Figure>
      </Section>

      <Section
        title="How the score works"
        dek="Each factor's points come from the last 12 months: a factor earns points in proportion to how much more often people with it left. Factors that did not go with more exits get no points."
      >
        <Figure
          id="talent-risk-factors"
          title="Flight-risk factors and their evidence"
          subtitle={`People active on ${formatDate(bt.scoredOn)}, by whether they had each factor then, and the share who left voluntarily by ${asOf}`}
          data={evidence}
          columns={EVIDENCE_COLUMNS}
          definitions={[DEF.flightRisk, DEF.lift, DEF.backTest]}
          note={`${pointsNote}${offNote}`}
          tableOnly
          table={{ maxRows: 12 }}
          empty={
            evidence.length ? null : 'Upload Employees with hire and termination dates to build the score.'
          }
        />
      </Section>

      <Section
        title="People to talk with"
        dek="Names for the next talent review: key talent at risk, high performers waiting for a promotion, everyone in the high band, and the high performers who already left."
      >
        <Figure
          id="talent-key-talent-at-risk"
          title="Key talent at risk"
          subtitle={`Rated 4-5 and in the high flight-risk band, as of ${asOf}, with their top two reasons`}
          data={ret.keyTalent}
          columns={RISK_PERSON_FULL_COLUMNS}
          definitions={[DEF.keyTalent, DEF.flightRisk]}
          note={`${plural(ret.keyTalent.length, 'person', 'people')} of ${fmt(ret.highPerformers)} rated 4-5`}
          tableOnly
          table={{ maxRows: 10, search: ret.keyTalent.length > 10 ? 'Search people' : undefined }}
          empty={
            !m.has.reviews
              ? 'Upload Reviews to see who is rated 4 or 5.'
              : ret.keyTalent.length
                ? null
                : 'Nobody rated 4 or 5 is in the high flight-risk band in this scope.'
          }
        />
        <Figure
          id="talent-promotion-overdue"
          title="High performers overdue for promotion"
          subtitle={
            m.overdue.cycles.length === 2
              ? `Rated 4-5 in ${m.overdue.cycles[0].cycle} and ${m.overdue.cycles[1].cycle}, no promotion in 3 years, as of ${asOf}`
              : `Consistent high performers with no promotion in 3 years, as of ${asOf}`
          }
          data={m.overdue.rows}
          columns={PROMOTION_OVERDUE_COLUMNS}
          definitions={[DEF.overduePromotion]}
          note={`${plural(m.overdue.rows.length, 'person', 'people')} of ${fmt(m.overdue.eligible)} with 3+ years and both ratings`}
          tableOnly
          table={{ maxRows: 10, search: m.overdue.rows.length > 10 ? 'Search people' : undefined }}
          empty={
            !m.overdue.available
              ? (m.overdue.reason ?? 'Not enough history to apply this rule.')
              : m.overdue.rows.length
                ? null
                : 'No consistent high performer has waited more than 3 years for a promotion.'
          }
        />
        <Figure
          id="talent-flight-risk-list"
          title="Flight risk by person"
          subtitle={`${watch === 'High' ? 'High band' : 'High and medium bands'}, highest scores first, as of ${asOf}`}
          data={watchRows}
          columns={RISK_PERSON_FULL_COLUMNS}
          definitions={[DEF.flightRisk, DEF.bands]}
          note={`${plural(watchRows.length, 'person', 'people')}`}
          tableOnly
          actions={
            <Segmented<WatchBand>
              label="Bands shown"
              value={watch}
              onChange={setWatch}
              options={[
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'High and medium' },
              ]}
            />
          }
          table={{ maxRows: 15, search: 'Search people' }}
          empty={noPeople ?? (watchRows.length ? null : 'Nobody in this scope is in these bands.')}
        />
        <Figure
          id="talent-regretted-high-performers"
          title="Regretted exits of high performers"
          subtitle={`Voluntary regretted exits whose last rating was 4 or 5, ${ctx.window.label}`}
          data={ret.regrettedHigh.current}
          columns={EXIT_PERSON_COLUMNS}
          definitions={[DEF.regrettedHigh]}
          note={`${plural(ret.regrettedHigh.current.length, 'exit')} · ${fmt(ret.regrettedHigh.prior.length)} in the prior period`}
          tableOnly
          table={{ maxRows: 10 }}
          empty={
            !m.has.regrettable
              ? 'Upload Employees with a regrettable flag on leavers to see this.'
              : ret.regrettedHigh.current.length
                ? null
                : 'No regretted exits of high performers in this period.'
          }
        />
      </Section>
    </>
  )
}
