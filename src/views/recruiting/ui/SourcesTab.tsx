/**
 * Sources & offers: which channels bring people who get hired, how volume moved, where offers are
 * accepted or declined and why, and why candidates leave the process.
 */
import { useState } from 'react'
import { BarList, Figure, HBars, Lines } from '@/charts'
import { Section, Segmented } from '@/components'
import { STAGES } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { asOfNote, NEED_CANDIDATES, NoRecruitingData, TABLET_FULL, windowText } from './common'
import { useRecruiting } from './hooks'

type ExitKind = 'Rejected' | 'Withdrawn'

export function SourcesTab() {
  const m = useRecruiting()
  const b = m.base
  const [exitKind, setExitKind] = useState<ExitKind>('Rejected')
  if (!b.apps.length && !b.reqs.length) return <NoRecruitingData />

  const noCands = b.apps.length === 0
  const cohortHired = b.cohort.filter((a) => a.furthest === 5).length
  const overallRate = b.cohort.length ? cohortHired / b.cohort.length : null
  const exits = m.exitReasons.filter((r) => r.outcome === exitKind)
  const reasonTotals = new Map<string, number>()
  for (const r of exits) reasonTotals.set(r.reason, (reasonTotals.get(r.reason) ?? 0) + r.candidates)
  const reasonOrder = [...reasonTotals]
    .sort((a, c) => (a[0] === 'Other reasons' ? 1 : c[0] === 'Other reasons' ? -1 : c[1] - a[1]))
    .map(([r]) => r)
  const exitTotal = exits.reduce((s, r) => s + r.candidates, 0)
  const declinedTotal = m.declineReasons.reduce((s, r) => s + r.candidates, 0)
  const offersN = b.offers.length

  return (
    <>
      <Section
        title="Sources"
        dek={`Which channels bring candidates who get hired, for applications received ${windowText(b.window)}.`}
      >
        <Figure
          id="recruiting-source-effectiveness"
          title="Source effectiveness"
          subtitle={`Applications received ${windowText(b.window)}, by source`}
          data={m.sources}
          columns={[
            { key: 'source', label: 'Source' },
            { key: 'applications', label: 'Applications', format: 'int' },
            { key: 'share', label: 'Share', format: 'pct' },
            { key: 'hires', label: 'Hires', format: 'int' },
            { key: 'hireRate', label: 'Hire rate', format: 'pct' },
            { key: 'offerAcceptance', label: 'Offer acceptance', format: 'pct' },
            { key: 'medianTimeToHire', label: 'Median time to hire', format: 'days' },
            { key: 'priorApplications', label: 'Applications, prior period', format: 'int' },
            { key: 'change', label: 'Change', format: 'pct' },
          ]}
          tableOnly
          span={7}
          table={{ maxRows: 10 }}
          empty={noCands ? NEED_CANDIDATES : m.sources.length ? null : 'No applications in this period.'}
          definitions={[
            {
              term: 'Hire rate',
              text: 'Applications from the source that ended in a hire. Candidates still in process count as not hired yet.',
              formula: 'hired ÷ applications',
            },
            {
              term: 'Offer acceptance',
              text: 'Offers accepted ÷ offers accepted or declined, for these applications. Blank below 5 offers.',
              formula: 'hired ÷ (hired + declined)',
            },
            { term: 'Median time to hire', text: 'Days from application to offer accepted, for the hires.' },
            { term: 'Change', text: `Applications vs ${windowText(b.prior)}.` },
          ]}
          note={`${plural(b.cohort.length, 'application')} · ${plural(cohortHired, 'hire')} · ${asOfNote(b.asOf)}`}
        />
        <Figure
          id="recruiting-hire-rate-source"
          title="Hire rate by source"
          subtitle={`Share of applications hired, applications received ${windowText(b.window)}`}
          data={m.sources}
          columns={[
            { key: 'source', label: 'Source' },
            { key: 'hireRate', label: 'Hire rate', format: 'pct' },
            { key: 'hires', label: 'Hires', format: 'int' },
            { key: 'applications', label: 'Applications', format: 'int' },
          ]}
          span={5}
          className={TABLET_FULL}
          empty={noCands ? NEED_CANDIDATES : m.sources.length ? null : 'No applications in this period.'}
          definitions={[
            {
              term: 'Hire rate',
              text: 'Hired ÷ applications from the source.',
              formula: 'hired ÷ applications',
            },
          ]}
          note={`Overall ${fmt(overallRate, 'pct')} · ${asOfNote(b.asOf)}`}
        >
          <BarList
            data={m.sources}
            label="source"
            value="hireRate"
            format="pct"
            secondary={(d) => `${fmt(d.hires, 'int')} of ${fmt(d.applications, 'int')}`}
            ref={
              overallRate != null
                ? { value: overallRate, label: `Overall ${fmt(overallRate, 'pct')}` }
                : undefined
            }
            nullNote="Fewer than 5 applications"
            ariaLabel="Hire rate by source"
          />
        </Figure>
        <Figure
          id="recruiting-applications-source-month"
          title="Applications by source by month"
          subtitle={`Applications received per month, 24 months to ${formatDate(b.window.end)}${m.changedSource ? `; ${m.changedSource} moved most against the overall trend` : ''}`}
          data={m.sourcesByMonth}
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'source', label: 'Source' },
            { key: 'applications', label: 'Applications', format: 'int' },
          ]}
          span={12}
          empty={noCands ? NEED_CANDIDATES : null}
          definitions={[
            { term: 'Applications', text: 'Applications by the month they were received.' },
            {
              term: 'Highlighted source',
              text: 'The source (with at least 30 applications in the prior period) whose change in volume differs most from the change in all applications.',
            },
          ]}
          note={asOfNote(b.asOf)}
        >
          <Lines
            data={m.sourcesByMonth}
            x="month"
            y="applications"
            series="source"
            emphasize={m.changedSource ?? undefined}
            format="int"
            zero
            ariaLabel="Applications by source by month"
          />
        </Figure>
      </Section>

      <Section
        title="Offers"
        dek={`Where offers resolved ${windowText(b.window)} were accepted, and why candidates said no.`}
      >
        <Figure
          id="recruiting-offer-acceptance-location"
          title="Offer acceptance by location"
          subtitle={`Offers accepted ÷ offers resolved ${windowText(b.window)}, by work site`}
          data={m.acceptanceByLocation}
          columns={[
            { key: 'group', label: 'Location' },
            { key: 'rate', label: 'Offer acceptance', format: 'pct' },
            { key: 'hired', label: 'Accepted', format: 'int' },
            { key: 'declined', label: 'Declined', format: 'int' },
          ]}
          span={6}
          empty={
            noCands
              ? NEED_CANDIDATES
              : !b.cov.hasDeclined
                ? 'No declined offers in the data, so acceptance can’t be measured.'
                : offersN
                  ? null
                  : 'No offers resolved in this period.'
          }
          definitions={[
            {
              term: 'Offer acceptance',
              text: 'Offers accepted ÷ offers accepted or declined, by the req’s location. Sites with fewer than 5 resolved offers show no rate.',
              formula: 'hired ÷ (hired + declined)',
            },
          ]}
          note={`${plural(offersN, 'offer')} resolved · company ${fmt(m.companyAcceptance, 'pct')} · ${asOfNote(b.asOf)}`}
        >
          <BarList
            data={m.acceptanceByLocation}
            label="group"
            value="rate"
            format="pct0"
            domain={[0, 1]}
            secondary={(d) => `${fmt(d.hired, 'int')} of ${fmt(d.offers, 'int')}`}
            ref={
              m.companyAcceptance != null
                ? { value: m.companyAcceptance, label: `Company ${fmt(m.companyAcceptance, 'pct0')}` }
                : undefined
            }
            tone={(d) =>
              d.rate != null && m.companyAcceptance != null && d.rate <= m.companyAcceptance - 0.1
                ? 'warning'
                : 'default'
            }
            nullNote="Fewer than 5 resolved offers"
            ariaLabel="Offer acceptance by location"
          />
        </Figure>
        <Figure
          id="recruiting-decline-reasons"
          title="Why offers were declined"
          subtitle={`Declined offers ${windowText(b.window)}, by reason`}
          data={m.declineReasons}
          columns={[
            { key: 'reason', label: 'Reason' },
            { key: 'candidates', label: 'Declined offers', format: 'int' },
            { key: 'share', label: 'Share', format: 'pct' },
          ]}
          span={6}
          empty={
            noCands ? NEED_CANDIDATES : m.declineReasons.length ? null : 'No declined offers in this period.'
          }
          definitions={[
            { term: 'Reason', text: 'The rejection reason recorded on applications with status Declined.' },
          ]}
          note={`${plural(declinedTotal, 'declined offer')} · ${asOfNote(b.asOf)}`}
        >
          <BarList
            data={m.declineReasons}
            label="reason"
            value="candidates"
            format="int"
            secondary={(d) => fmt(d.share, 'pct0')}
            ariaLabel="Why offers were declined"
          />
        </Figure>
      </Section>

      <Section
        title="Why candidates left"
        dek={`Rejections and withdrawals dated ${windowText(b.window)}, by reason and the stage they left from.`}
      >
        <Figure
          id="recruiting-exit-reasons"
          title={exitKind === 'Rejected' ? 'Why candidates were rejected' : 'Why candidates withdrew'}
          subtitle={`${exitKind} ${windowText(b.window)}, by reason and stage`}
          data={exits}
          columns={[
            { key: 'outcome', label: 'Outcome' },
            { key: 'reason', label: 'Reason' },
            { key: 'stage', label: 'Stage', format: 'text' },
            { key: 'candidates', label: 'Candidates', format: 'int' },
          ]}
          span={12}
          actions={
            <Segmented<ExitKind>
              label="Outcome"
              value={exitKind}
              onChange={setExitKind}
              options={[
                { value: 'Rejected', label: 'Rejected' },
                { value: 'Withdrawn', label: 'Withdrawn' },
              ]}
            />
          }
          empty={
            noCands
              ? NEED_CANDIDATES
              : exits.length
                ? null
                : `No ${exitKind.toLowerCase()} candidates in this period.`
          }
          definitions={[
            { term: 'Rejected', text: 'The company ended the process.' },
            { term: 'Withdrawn', text: 'The candidate left the process.' },
            { term: 'Stage', text: 'The furthest stage the candidate reached before leaving.' },
          ]}
          note={`${plural(exitTotal, 'candidate')} · ${asOfNote(b.asOf)}`}
        >
          <HBars
            data={exits}
            y="reason"
            x="candidates"
            series="stage"
            stack
            seriesOrder={STAGES.slice(0, 5)}
            yOrder={reasonOrder}
            format="int"
            ariaLabel={exitKind === 'Rejected' ? 'Why candidates were rejected' : 'Why candidates withdrew'}
          />
        </Figure>
      </Section>
    </>
  )
}
