import { useState } from 'react'
import { BarList, Columns, Figure, useChartTheme } from '@/charts'
import { Section, Segmented } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import { listText } from '../engine/base'
import { drillsWithUses } from '../engine/drillUses'
import { backTestSummary, factorDef, RISK_BANDS } from '../engine/risk'
import { scopeColors } from './colors'
import {
  backTestColumns,
  bandColumns,
  driverColumns,
  EXIT_PERSON_COLUMNS,
  evidenceColumns,
  PROMOTION_OVERDUE_COLUMNS,
  riskPersonColumns,
} from './columns'
import { DEF } from './defs'

type PeopleView = 'key' | 'high' | 'watch'

const POINT_SOURCE: Record<string, string> = {
  learned: 'Learned from exits',
  default: 'Default (no history to learn from)',
  fixed: 'Fixed (pay history is not kept)',
  off: 'Switched off',
}

export function RetentionTab({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const t = useChartTheme()
  const asOf = formatDate(ctx.asOf)
  const ret = m.retention
  const risk = m.risk
  const bt = risk.backTest
  const [view, setView] = useState<PeopleView>('key')
  const highCount = ret.bands.find((b) => b.band === 'High')?.people ?? 0
  const drivers = ret.drivers
    .filter((d) => d.anyReason > 0)
    .map((d) => ({ ...d, share: highCount >= 5 ? d.anyReason / highCount : null }))
  const evidence = risk.evidence.map((e) => ({
    ...e,
    how: POINT_SOURCE[e.source],
    definition: factorDef.get(e.key)?.text ?? '',
  }))
  const noPeople = ret.scored ? null : 'Nobody in this scope is an active employee at the as-of date.'
  const who = risk.exitKind === 'voluntary' ? 'voluntary exits' : 'exits'
  const learnedFrom = risk.learnedFrom
  const pointsNote = risk.learned
    ? `Points come from ${fmt(risk.learnedLeavers)} people who left within 12 months of the month-ends ${formatDate(learnedFrom[0])} to ${formatDate(learnedFrom.at(-1))} (${plural(risk.learnedPeople, 'person', 'people')} in all)`
    : 'Default points: there were fewer than 20 leavers or 100 people in the history to learn from'
  const offNote = risk.off.length
    ? ` · switched off: ${risk.off.map((o) => `${factorDef.get(o.key)?.label.toLowerCase()} (${o.why.toLowerCase()})`).join('; ')}`
    : ''
  const highShare = fmt(risk.highShare, 'pct0')
  const mediumShare = fmt(risk.mediumShare, 'pct0')

  // Factors the data says did not go with more exits, in one plain sentence.
  const zero = risk.evidence.filter((e) => e.source === 'learned' && e.points === 0)
  const promoZero = zero.some((e) => e.key === 'promotionGap') && zero.some((e) => e.key === 'highNoPromo')
  const otherZero = zero.filter((e) => !promoZero || (e.key !== 'promotionGap' && e.key !== 'highNoPromo'))
  const zeroText = [
    promoZero
      ? 'Time since the last promotion did not go with more voluntary exits in this data, for high performers or anyone else, so it adds no points.'
      : '',
    otherZero.length
      ? `${promoZero ? 'Nor did' : 'In this data,'} ${listText(otherZero.map((e) => `“${e.label.toLowerCase()}”`))}${promoZero ? '.' : ` did not go with more voluntary exits, so ${otherZero.length === 1 ? 'it adds' : 'they add'} no points.`}`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Band chart: under a filter, the scope's shares against the company's.
  const bandLong = ret.bands.flatMap((b) => [
    { band: b.band, series: 'This scope', share: b.share },
    { band: b.band, series: 'Company', share: b.companyShare },
  ])
  const byPerson = { onRowClick: (r: { employeeId: string }) => openPerson(r.employeeId) }
  // Each figure's drills carry its fields, so the panel shows that figure's tier.
  const bandsDrill = drillsWithUses(m.drill, m.uses['talent-risk-bands'])
  const backTestDrill = drillsWithUses(m.drill, m.uses['talent-risk-back-test'])
  const driversDrill = drillsWithUses(m.drill, m.uses['talent-risk-drivers'])
  const factorsDrill = drillsWithUses(m.drill, m.uses['talent-risk-factors'])

  // One people table, three views.
  const peopleRows =
    view === 'key'
      ? ret.keyTalent
      : view === 'high'
        ? ret.watchList.filter((r) => r.band === 'High')
        : ret.watchList
  const peopleTitle = view === 'key' ? 'Key talent at risk' : 'Flight risk by person'
  const peopleSub =
    view === 'key'
      ? `Rated 4-5 and in the high flight-risk band, as of ${asOf}`
      : view === 'high'
        ? `Everyone in the high band, any rating, as of ${asOf}`
        : `Everyone in the high and medium bands, any rating, as of ${asOf}`
  const overdueLow = m.overdue.rows.filter((r) => r.riskBand === 'Low').length
  const regret = ret.regrettedHigh

  return (
    <>
      <Section
        title="Who is at risk of leaving"
        dek="Every active employee gets a flight-risk score from plain factors. The bands are checked against real exits a year later, using only what was known then, so you can judge how far to trust them."
      >
        <Figure
          id="talent-risk-bands"
          uses={m.uses['talent-risk-bands']}
          title="People by risk band"
          subtitle={
            ctx.isCompany
              ? `Active employees by flight-risk band, scored as of ${asOf}`
              : `Share of active employees in each band, ${ctx.scopeLabel} against the company, as of ${asOf}`
          }
          data={ret.bands}
          columns={bandColumns(bandsDrill)}
          definitions={[DEF.flightRisk, DEF.bands]}
          note={`${plural(ret.scored, 'person', 'people')} scored · company-wide the high band is the top ${highShare} (score ${fmt(risk.cutHigh)} and up) and the medium band the next ${mediumShare}`}
          span={4}
          empty={noPeople}
        >
          {ctx.isCompany ? (
            <Columns
              data={ret.bands}
              x="band"
              y="people"
              xOrder={RISK_BANDS}
              tone={(d) => (d.band === 'High' ? 'default' : 'deemph')}
              labels
              height={220}
              onSelect={(d) => drill(bandsDrill.band(d.band, 'scope'))}
              ariaLabel="People by flight-risk band"
            />
          ) : (
            <Columns
              data={bandLong}
              x="band"
              y="share"
              series="series"
              seriesOrder={['This scope', 'Company']}
              colors={scopeColors(t)}
              xOrder={RISK_BANDS}
              format="pct0"
              height={220}
              onSelect={(d) => drill(bandsDrill.band(d.band, 'scope'))}
              onSelectSegment={(d) =>
                drill(bandsDrill.band(d.band, d.series === 'Company' ? 'company' : 'scope'))
              }
              ariaLabel="Share of people in each flight-risk band, this scope against the company"
            />
          )}
        </Figure>
        <Figure
          id="talent-risk-back-test"
          uses={m.uses['talent-risk-back-test']}
          title="Exit rate by risk band, back-tested"
          subtitle={`Scored as of ${formatDate(bt.scoredOn)} with points learned only from exits known by then; ${who} ${bt.outcome.label}, whole company`}
          data={bt.bands}
          columns={backTestColumns(backTestDrill)}
          definitions={[DEF.backTest, DEF.bands]}
          note={`${backTestSummary(bt)} ${plural(bt.population, 'person', 'people')} scored, ${fmt(bt.leavers)} left.${
            bt.learned
              ? ` Points learned from ${fmt(bt.learnedLeavers)} leavers before ${formatDate(bt.scoredOn)}.`
              : ' Default points: too little history before the scoring date to learn from.'
          }${
            bt.defaults.length
              ? ` ${listText(bt.defaults.map((k) => factorDef.get(k)!.label.toLowerCase())).replace(/^./, (c) => c.toUpperCase())} used default points: the data does not reach back far enough.`
              : ''
          }`}
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
            onSelect={(d) => drill(backTestDrill.backTest(d.band, 'left'))}
            ariaLabel="Exit rate within 12 months by flight-risk band a year earlier"
          />
        </Figure>
        <Figure
          id="talent-risk-drivers"
          uses={m.uses['talent-risk-drivers']}
          title="What drives risk"
          subtitle="Share of people in the high band with each factor"
          data={drivers}
          columns={driverColumns(driversDrill)}
          definitions={[DEF.flightRisk, DEF.mainReason]}
          note={`${plural(highCount, 'person', 'people')} in the high band · the number after each bar counts people for whom it is the main reason`}
          span={4}
          empty={noPeople ?? (drivers.length ? null : 'No factor earned points.')}
        >
          <BarList
            data={drivers}
            label="factor"
            value="share"
            format="pct0"
            domain={[0, 1]}
            secondary={(d) => (d.topReason ? `main for ${fmt(d.topReason)}` : null)}
            onSelect={(d) => drill(driversDrill.driver(d.key, 'any'))}
            ariaLabel="Share of high-band people with each factor"
          />
        </Figure>
      </Section>

      <Section
        title="How the score works"
        dek={`Each factor's points come from the last two years of exits: at every month-end 12 to 23 months back, a factor earns points in proportion to how much more often people with it left in the next 12 months. ${zeroText}`.trim()}
      >
        <Figure
          id="talent-risk-factors"
          uses={m.uses['talent-risk-factors']}
          title="Flight-risk factors and their evidence"
          subtitle={
            learnedFrom.length
              ? `People active at each month-end from ${formatDate(learnedFrom[0])} to ${formatDate(learnedFrom.at(-1))}, by whether they had each factor then, and the share who left voluntarily in the next 12 months`
              : 'Not enough exit history to learn from: every factor keeps its default points'
          }
          data={evidence}
          columns={evidenceColumns(factorsDrill)}
          definitions={[DEF.flightRisk, DEF.lift, DEF.backTest]}
          note={`${pointsNote}. A person counts once at each month-end they were active.${offNote}`}
          tableOnly
          table={{ maxRows: 12 }}
          empty={
            evidence.length ? null : 'Upload Employees with hire and termination dates to build the score.'
          }
        />
      </Section>

      <Section
        title="People to talk with"
        dek="Names for the next talent review: key talent at risk (or everyone in the high band), high performers waiting for a promotion, and the high performers who already left."
      >
        <Figure
          id="talent-key-talent-at-risk"
          uses={m.uses['talent-key-talent-at-risk']}
          title={peopleTitle}
          subtitle={peopleSub}
          data={peopleRows}
          columns={riskPersonColumns(peopleRows, { full: true })}
          definitions={[DEF.keyTalent, DEF.flightRisk, DEF.mainReason, DEF.bands]}
          note={
            view === 'key'
              ? `${plural(ret.keyTalent.length, 'person', 'people')} of ${fmt(ret.highPerformers)} active people rated 4-5 · high band = top ${highShare} of scores company-wide`
              : `${plural(peopleRows.length, 'person', 'people')} · high band = top ${highShare}, medium = next ${mediumShare} company-wide`
          }
          tableOnly
          actions={
            <Segmented<PeopleView>
              label="People shown"
              value={view}
              onChange={setView}
              options={[
                { value: 'key', label: 'Rated 4-5' },
                { value: 'high', label: 'High band' },
                { value: 'watch', label: 'High and medium' },
              ]}
            />
          }
          table={{ maxRows: 12, search: peopleRows.length > 12 ? 'Search people' : undefined, ...byPerson }}
          empty={
            noPeople ??
            (view === 'key' && !m.has.reviews
              ? 'Upload Reviews to see who is rated 4 or 5.'
              : peopleRows.length
                ? null
                : view === 'key'
                  ? 'Nobody rated 4 or 5 is in the high flight-risk band in this scope.'
                  : 'Nobody in this scope is in these bands.')
          }
        />
        <Figure
          id="talent-promotion-overdue"
          uses={m.uses['talent-promotion-overdue']}
          title="High performers overdue for promotion"
          subtitle={
            m.overdue.cycles.length === 2
              ? `Rated 4-5 in ${m.overdue.cycles[0].cycle} and ${m.overdue.cycles[1].cycle}, no promotion in 3 years, as of ${asOf}`
              : `Consistent high performers with no promotion in 3 years, as of ${asOf}`
          }
          data={m.overdue.rows}
          columns={PROMOTION_OVERDUE_COLUMNS}
          definitions={[DEF.overduePromotion]}
          note={`${plural(m.overdue.rows.length, 'person', 'people')} of ${fmt(m.overdue.eligible)} with 3+ years and both ratings${
            promoZero && overdueLow
              ? ` · ${fmt(overdueLow)} of them are in the low flight-risk band because time since promotion did not go with more exits here; the wait is still worth a conversation`
              : ''
          }`}
          tableOnly
          table={{
            maxRows: 10,
            search: m.overdue.rows.length > 10 ? 'Search people' : undefined,
            ...byPerson,
          }}
          empty={
            !m.overdue.available
              ? (m.overdue.reason ?? 'Not enough history to apply this rule.')
              : m.overdue.rows.length
                ? null
                : 'No consistent high performer has waited more than 3 years for a promotion.'
          }
        />
        <Figure
          id="talent-regretted-high-performers"
          uses={m.uses['talent-regretted-high-performers']}
          title="Regretted exits of high performers"
          subtitle={`Voluntary regretted exits whose last rating was 4 or 5, ${ctx.window.label}`}
          data={regret.current}
          columns={EXIT_PERSON_COLUMNS}
          definitions={[DEF.regrettedHigh]}
          note={
            regret.available
              ? `${plural(regret.current.length, 'exit')} · ${fmt(regret.prior.length)} in the prior period`
              : undefined
          }
          tableOnly
          table={{ maxRows: 10, ...byPerson }}
          empty={
            !regret.available
              ? `${regret.missing ?? 'A column is missing'}, so regretted exits of high performers can't be counted. Upload Employees with a termination type and a regrettable flag on leavers, and Reviews.`
              : regret.current.length
                ? null
                : 'No regretted exits of high performers in this period.'
          }
        />
      </Section>
    </>
  )
}
