/**
 * Sources & offers: which channels bring people who get hired, how volume moved, where offers are
 * accepted or declined and why, and why candidates leave the process. Every number opens the
 * applications behind it; hidden rates (under the anonymity minimum) don't.
 */
import { useState } from 'react'
import { BarList, type Column, Figure, HBars, Lines } from '@/charts'
import { Section, Segmented } from '@/components'
import { STAGES } from '@/data/schema'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { LinkedSurvey } from '@/views/listening/LinkedSurvey'
import {
  declineReasonDrill,
  exitReasonDrill,
  locationOffersDrill,
  type SourceMeasure,
  sourceDrill,
  sourceMonthDrill,
} from '../engine/drills'
import { FIGURE_USES } from '../engine/lineage'
import { FIGURE_METRICS } from '../engine/metricLinks'
import type { ExitReasonRow, GroupAcceptance, ReasonRow, SourceMonthRow, SourceRow } from '../engine/sources'
import { RM } from '../metrics'
import { useRecruitingUi } from '../state'
import { asOfNote, defOf, drillIf, NEED_CANDIDATES, NoRecruitingData, windowText } from './common'
import { useRecruiting } from './hooks'

type ExitKind = 'Rejected' | 'Withdrawn'
type Basis = 'quarter' | 'period'

/** "+103%", "−48%": a relative change with its sign. */
const signedPct = (v: number) => `${v > 0 ? '+' : ''}${fmt(v, 'pct0')}`

export function SourcesTab() {
  const m = useRecruiting()
  const b = m.base
  const [exitKind, setExitKind] = useState<ExitKind>('Rejected')
  const chosenBasis = useRecruitingUi((s) => s.acceptanceBasis)
  const setBasis = useRecruitingUi((s) => s.setAcceptanceBasis)
  if (!b.apps.length && !b.reqs.length) return <NoRecruitingData />
  const { minGroup, locationGapPts } = b.settings

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
  const changed = m.sources.find((r) => r.source === m.changedSource)
  // Offer acceptance by location opens on the basis the readout used (the latest quarter when the
  // finding compares quarters), so the chart a reader lands on shows the same story.
  const q = m.latestQuarter
  const quarterWords = q.complete ? q.label : `${q.label} to date`
  const hasQuarterView = q.start > b.window.start
  const basis: Basis = hasQuarterView
    ? (chosenBasis ?? (m.acceptanceDropBasis === 'quarter' ? 'quarter' : 'period'))
    : 'period'
  const byLocation: GroupAcceptance[] =
    basis === 'quarter' ? m.acceptanceByLocationQuarter : m.acceptanceByLocation
  const companyAcc = basis === 'quarter' ? m.companyAcceptanceQuarter : m.companyAcceptance
  const offersN = byLocation.reduce((n, r) => n + r.offers, 0)
  const periodWords = b.windowWords[0].toUpperCase() + b.windowWords.slice(1)

  // Drills. A hidden rate or median (under the anonymity minimum) has no records behind it, so it
  // never drills.
  const src = (measure: SourceMeasure, n: (r: SourceRow) => number | boolean | null) => (r: SourceRow) =>
    drillIf(n(r), () => sourceDrill(b, r, measure))
  const basisWindow = basis === 'quarter' ? { start: q.start, end: q.end } : b.window
  const locDrill = (only?: 'Hired' | 'Declined') => (r: GroupAcceptance) =>
    drillIf(only ? r.apps.some((a) => a.outcome === only) : r.apps.length, () =>
      locationOffersDrill(b, r, basisWindow, only),
    )
  const reasonDrill = (r: ReasonRow) => drillIf(r.apps.length, () => declineReasonDrill(b, r, declinedTotal))
  const exitDrill = (r: ExitReasonRow) =>
    drillIf(r.apps.length, () => exitReasonDrill(b, r.apps, r.outcome, r.reason, r.stage))
  const exitReasonAll = (r: ExitReasonRow) => {
    const apps = exits.filter((x) => x.reason === r.reason).flatMap((x) => x.apps)
    return drillIf(apps.length, () => exitReasonDrill(b, apps, r.outcome, r.reason))
  }

  return (
    <>
      <Section
        title="Sources"
        dek={`Which channels bring candidates who get hired, for applications received ${windowText(b.window)}.`}
      >
        <Figure
          id="recruiting-source-effectiveness"
          uses={FIGURE_USES['recruiting-source-effectiveness']}
          metric={FIGURE_METRICS['recruiting-source-effectiveness']}
          title="Source effectiveness"
          subtitle={`Share of applications hired, by source, applications received ${windowText(b.window)}. The table view has volume, offer acceptance, time to hire and change.`}
          data={m.sources}
          columns={
            [
              { key: 'source', label: 'Source' },
              {
                key: 'applications',
                label: 'Applications',
                format: 'int',
                drill: src('applications', (r) => r.applications),
              },
              {
                key: 'share',
                label: 'Share',
                format: 'pct',
                drill: src('applications', (r) => r.applications),
              },
              { key: 'hires', label: 'Hired', format: 'int', drill: src('hires', (r) => r.hires) },
              {
                key: 'hireRate',
                label: 'Hire rate',
                format: 'pct',
                drill: src('hireRate', (r) => r.hireRate != null && r.hires),
              },
              {
                key: 'offerAcceptance',
                label: 'Offer acceptance',
                format: 'pct',
                drill: src('offerAcceptance', (r) => r.offerAcceptance != null),
              },
              {
                key: 'medianTimeToHire',
                label: 'Median time to hire',
                format: 'days',
                drill: src('medianTimeToHire', (r) => r.medianTimeToHire != null),
              },
              {
                key: 'priorApplications',
                label: 'Applications, prior period',
                format: 'int',
                drill: src('priorApplications', (r) => r.priorApplications),
              },
              {
                key: 'change',
                label: 'Change in applications',
                format: 'pct',
                drill: src('change', (r) => r.change != null),
              },
            ] satisfies Column<SourceRow>[]
          }
          span={6}
          empty={noCands ? NEED_CANDIDATES : m.sources.length ? null : 'No applications in this period.'}
          definitions={[
            {
              term: 'Hired',
              text: 'Applications received in the period that ended in an accepted offer, whenever it was accepted. Offers accepted on the Overview counts by the accept date instead, so the two can differ.',
            },
            defOf(b, RM.sourceHireRate, {
              term: 'Hire rate',
              extra: `Blank under ${minGroup} applications.`,
            }),
            {
              term: 'Offer acceptance',
              text: `Offers accepted ÷ offers accepted or declined, for these applications. Blank below ${minGroup} offers.`,
              formula: 'hired ÷ (hired + declined)',
            },
            {
              term: 'Median time to hire',
              text: `Days from application to offer accepted, for the applications hired. Blank under ${minGroup} hires.`,
            },
            {
              term: 'Change in applications',
              text: `Applications vs ${windowText(b.prior)}, as a share of the prior count (negative = fewer).`,
            },
          ]}
          note={`${plural(b.cohort.length, 'application')} · ${fmt(cohortHired, 'int')} hired · overall ${fmt(overallRate, 'pct')} · ${asOfNote(b.asOf)}`}
        >
          <BarList
            data={m.sources}
            label="source"
            value="hireRate"
            format="pct"
            secondary={(d) =>
              d.hireRate != null
                ? `${fmt(d.hires, 'int')} of ${fmt(d.applications, 'int')}`
                : plural(d.applications, 'application')
            }
            ref={
              overallRate != null
                ? { value: overallRate, label: `Overall ${fmt(overallRate, 'pct')}` }
                : undefined
            }
            nullNote={`Fewer than ${minGroup} applications`}
            onSelect={(d) => drill(src('hireRate', (r) => r.hireRate != null && r.hires)(d))}
            ariaLabel="Source effectiveness: hire rate by source"
          />
        </Figure>
        <Figure
          id="recruiting-applications-source-month"
          uses={FIGURE_USES['recruiting-applications-source-month']}
          metric={FIGURE_METRICS['recruiting-applications-source-month']}
          title="Applications by source by month"
          subtitle={`Applications received per month, 24 months to ${formatDate(b.window.end)}${changed?.change != null ? `. ${changed.source}: ${signedPct(changed.change)} ${b.compareLabel}, the biggest move against the overall trend` : ''}`}
          data={m.sourcesByMonth}
          columns={
            [
              { key: 'month', label: 'Month' },
              { key: 'source', label: 'Source' },
              {
                key: 'applications',
                label: 'Applications',
                format: 'int',
                drill: (r) => drillIf(r.applications, () => sourceMonthDrill(b, r)),
              },
            ] satisfies Column<SourceMonthRow>[]
          }
          span={6}
          empty={noCands ? NEED_CANDIDATES : null}
          definitions={[defOf(b, RM.sourceApplications)]}
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
            onSelect={(d) => drill(drillIf(d.applications, () => sourceMonthDrill(b, d)))}
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
          uses={FIGURE_USES['recruiting-offer-acceptance-location']}
          metric={FIGURE_METRICS['recruiting-offer-acceptance-location']}
          title="Offer acceptance by location"
          subtitle={`Offers accepted ÷ offers resolved ${basis === 'quarter' ? `in ${quarterWords}` : windowText(b.window)}, by work site, largest first`}
          data={byLocation}
          columns={
            [
              { key: 'group', label: 'Location' },
              { key: 'rate', label: 'Offer acceptance', format: 'pct', drill: locDrill() },
              { key: 'hired', label: 'Accepted', format: 'int', drill: locDrill('Hired') },
              { key: 'declined', label: 'Declined', format: 'int', drill: locDrill('Declined') },
              { key: 'offers', label: 'Offers resolved', format: 'int', drill: locDrill() },
            ] satisfies Column<GroupAcceptance>[]
          }
          span={6}
          actions={
            hasQuarterView ? (
              <Segmented<Basis>
                label="Period"
                value={basis}
                onChange={setBasis}
                options={[
                  { value: 'quarter', label: quarterWords },
                  { value: 'period', label: periodWords },
                ]}
              />
            ) : undefined
          }
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
            defOf(b, RM.acceptanceByLocation, {
              term: 'Offer acceptance',
              extra: `Sites under ${minGroup} resolved offers fold into Other; a row still under ${minGroup} shows only its offer count.`,
            }),
          ]}
          note={`${plural(offersN, 'offer')} resolved · company ${fmt(companyAcc, 'pct')} · ${asOfNote(b.asOf)}`}
        >
          <BarList
            data={byLocation}
            label="group"
            value="rate"
            format="pct0"
            domain={[0, 1]}
            sort="none"
            secondary={(d) =>
              d.rate != null && d.hired != null
                ? `${fmt(d.hired, 'int')} of ${fmt(d.offers, 'int')}`
                : plural(d.offers, 'offer')
            }
            ref={
              companyAcc != null
                ? { value: companyAcc, label: `Company ${fmt(companyAcc, 'pct0')}` }
                : undefined
            }
            tone={(d) =>
              d.rate != null && companyAcc != null && d.rate <= companyAcc - locationGapPts
                ? 'warning'
                : 'default'
            }
            nullNote={`Fewer than ${minGroup} resolved offers`}
            onSelect={(d) => drill(locDrill()(d))}
            ariaLabel="Offer acceptance by location"
          />
        </Figure>
        <Figure
          id="recruiting-decline-reasons"
          uses={FIGURE_USES['recruiting-decline-reasons']}
          metric={FIGURE_METRICS['recruiting-decline-reasons']}
          title="Why offers were declined"
          subtitle={`Declined offers ${windowText(b.window)}, by reason`}
          data={m.declineReasons}
          columns={
            [
              { key: 'reason', label: 'Reason' },
              { key: 'candidates', label: 'Declined offers', format: 'int', drill: reasonDrill },
              { key: 'share', label: 'Share', format: 'pct', drill: reasonDrill },
            ] satisfies Column<ReasonRow>[]
          }
          span={6}
          empty={
            noCands ? NEED_CANDIDATES : m.declineReasons.length ? null : 'No declined offers in this period.'
          }
          definitions={[defOf(b, RM.declineReasons, { term: 'Reason' })]}
          note={`${plural(declinedTotal, 'declined offer')} · ${asOfNote(b.asOf)}`}
        >
          <BarList
            data={m.declineReasons}
            label="reason"
            value="candidates"
            format="int"
            secondary={(d) => fmt(d.share, 'pct0')}
            onSelect={(d) => drill(reasonDrill(d))}
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
          uses={FIGURE_USES['recruiting-exit-reasons']}
          metric={FIGURE_METRICS['recruiting-exit-reasons']}
          title={exitKind === 'Rejected' ? 'Why candidates were rejected' : 'Why candidates withdrew'}
          subtitle={`${exitKind} ${windowText(b.window)}, by reason and the stage they left from`}
          data={m.exitReasons}
          columns={
            [
              { key: 'outcome', label: 'Outcome' },
              { key: 'reason', label: 'Reason' },
              { key: 'stage', label: 'Stage left from', format: 'text' },
              { key: 'candidates', label: 'Candidates', format: 'int', drill: exitDrill },
            ] satisfies Column<ExitReasonRow>[]
          }
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
            defOf(b, RM.exitReasons),
            { term: 'Rejected', text: 'The company ended the process.' },
            { term: 'Withdrawn', text: 'The candidate left the process.' },
            { term: 'Stage', text: 'The furthest stage the candidate reached before leaving.' },
          ]}
          note={`${plural(exitTotal, 'candidate')} ${exitKind.toLowerCase()} · the table and exports hold both outcomes · ${asOfNote(b.asOf)}`}
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
            onSelect={(d) => drill(exitReasonAll(d))}
            onSelectSegment={(d) => drill(exitDrill(d))}
            ariaLabel={exitKind === 'Rejected' ? 'Why candidates were rejected' : 'Why candidates withdrew'}
          />
        </Figure>
      </Section>

      <LinkedSurvey
        survey="Candidate experience"
        id="recruiting-candidate-survey"
        title="What candidates say"
        dek="One number from the candidate experience survey. Candidate NPS by stage, source and recruiter, and why candidates declined, are in Listening."
      />
    </>
  )
}
