/**
 * Why offers are declined (docs/ANALYSES.md, 3.6), inside the shared frame: the reasons Pareto as
 * the lead, then where and when (the quarterly trend and the rate by group against its expected
 * rate), speed (days to offer and to decide), competing offers and the range, and what candidates
 * told us with what to do next. Every mark opens its offers; groups of the requisition's business
 * unit, location or level, and quarters, carry "Filter to this".
 */
import { useState } from 'react'
import { BarList, type ChartNote, type Column, Columns, DataTable, Figure, Lines, shortNote } from '@/charts'
import { Button, goTo, IconCheck, IconChevronRight, Menu, Section } from '@/components'
import { useRouteShown } from '@/components/RouteLink'
import { useChartHeight } from '@/components/useNarrow'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { programOf } from '@/views/listening/engine/catalog'
import { scoreMetric } from '@/views/listening/metrics'
import { definitionsOf } from '../../../engine/wording'
import { missingFor } from '../../fields'
import { AnalysisFrame } from '../../shell/AnalysisFrame'
import type { AnalysisPanelProps } from '../../types'
import type { DeclinesModel } from '../engine'
import type { AcceptanceRow, RangeRow } from '../engine/competing'
import { CUTS, type CutKey, cutDef, type GroupRow } from '../engine/cuts'
import {
  bucketDrill,
  competingDrill,
  groupDrill,
  quarterDrill,
  rangeDrill,
  reasonDrill,
  themeDrill,
} from '../engine/figureDrills'
import { aboveExpectedRow, daysWords } from '../engine/findings'
import { DECLINES_FIGURES as F } from '../engine/ids'
import { DM } from '../engine/metrics'
import type { ReasonRow, ThemeRow } from '../engine/reasons'
import {
  CANDIDATE_SURVEY,
  candidateSurveyShown,
  type SurveyNpsRow,
  type SurveyReasonRow,
} from '../engine/survey'
import { type BucketRow, DECIDE_BUCKETS } from '../engine/timing'
import { COMPANY_SERIES, type QuarterRow } from '../engine/trend'
import { ParetoChart } from './ParetoChart'
import { RangeDumbbell } from './RangeDumbbell'

const pct0 = (v: number | null | undefined) => fmt(v, 'pct0')

/** "88 declined offers · as of 30 Sep 2026" */
const noteOf = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')

/** The survey figure's rows, long form: the NPS pair, then the reasons. */
interface SurveyTableRow {
  part: string
  group: string
  nps: number | null
  respondents: number | null
  surveyCount: number | null
  ats: number | null
}

export function Panel({ def, model: m, ctx, offscreen }: AnalysisPanelProps<DeclinesModel>) {
  const lead = useChartHeight('lead')
  const standard = useChartHeight('standard')
  const dataRoom = useRouteShown('data')
  const [chosenCut, setCut] = useState<CutKey>('level')
  const cut = offscreen ? 'level' : chosenCut
  const s = m.settings
  const missing = def.missing(ctx)
  const gap = (id: string) => missingFor(missing, id)?.message ?? null
  const asOf = `as of ${formatDate(ctx.asOf)}`
  const emptyAction = dataRoom ? (
    <Button size="sm" onClick={() => goTo('data')}>
      Open the Data room
    </Button>
  ) : undefined
  const noOffers = m.count.resolved ? null : 'No offers resolved in this period.'
  const finding = (id: string) => m.findings.find((f) => f.id === id)

  /* ───────── lead: the reasons Pareto ───────── */
  const toReason = reasonDrill(ctx, m)
  const reasonColumns: Column<ReasonRow>[] = [
    { key: 'reason', label: 'Reason' },
    { key: 'theme', label: 'Theme' },
    { key: 'declined', label: 'Declined offers', format: 'int', drill: toReason },
    { key: 'share', label: 'Share', format: 'pct', drill: toReason },
    { key: 'cumulative', label: 'Running total', format: 'pct' },
  ]
  const leadFigure = (
    <Figure
      id={F.reasons}
      metric={DM.reasons}
      uses={m.uses.reasons}
      title="Why offers were declined"
      subtitle={`Share of declined offers by reason, with the running total, ${m.periodWords}`}
      data={m.reasons}
      columns={reasonColumns}
      definitions={definitionsOf(ctx.metrics, DM.reasons, DM.rate)}
      note={noteOf(plural(m.declined.length, 'declined offer'), asOf)}
      empty={
        gap(F.reasons) ??
        (!m.declined.length
          ? 'No declined offers in this period.'
          : m.declined.length < s.minGroup
            ? `Shares are hidden to protect anonymity: fewer than ${s.minGroup} declined offers in this period. Exports list the counts by reason.`
            : null)
      }
      emptyAction={gap(F.reasons) ? emptyAction : undefined}
      emptyHeight={lead}
    >
      <ParetoChart
        rows={m.reasons}
        height={lead}
        onSelect={(r) => drill(toReason(r))}
        ariaLabel="Why offers were declined: share of declined offers by reason, with the running total"
      />
    </Figure>
  )

  /* ───────── trend ───────── */
  const toQuarter = quarterDrill(ctx, m)
  const trendRows: QuarterRow[] = [...m.quarters, ...m.companyQuarters]
  const rise = finding('hrbp-declines-rising')
  const latest = m.quarters.at(-1)
  const riseNote = rise && latest ? shortNote(rise.title, 'Offer declines') : null
  // With one line the note needs no series; beside the company it points at the scope's line.
  const trendNotes: ChartNote[] =
    riseNote && latest
      ? [{ at: latest.end, text: riseNote, ...(m.companyQuarters.length ? { series: latest.series } : {}) }]
      : []
  const trendColumns: Column<QuarterRow>[] = [
    { key: 'label', label: 'Quarter', sortValue: (r) => r.quarter },
    ...(m.companyQuarters.length ? [{ key: 'series', label: 'Scope' }] : []),
    { key: 'resolved', label: 'Offers resolved', format: 'int', drill: toQuarter },
    { key: 'declined', label: 'Declined', format: 'int', drill: toQuarter },
    { key: 'rate', label: 'Decline rate', format: 'pct', drill: toQuarter },
  ]

  /* ───────── by group ───────── */
  const toGroup = groupDrill(ctx, m)
  const c = cutDef(cut)
  const groupRows = m.groups.filter((g) => g.cut === cut)
  const above = finding('hrbp-declines-above-expected')
  const aboveRow = above ? aboveExpectedRow(m) : null
  const groupNote = above && aboveRow?.cut === cut ? shortNote(above.title) : null
  const groupNotes: ChartNote[] = groupNote && aboveRow ? [{ at: aboveRow.label, text: groupNote }] : []
  const companyRate = m.companyCount.resolved >= s.minGroup ? m.companyCount.rate : null
  const groupColumns: Column<GroupRow>[] = [
    { key: 'groupedBy', label: 'Grouped by' },
    { key: 'label', label: 'Group' },
    { key: 'resolved', label: 'Offers resolved', format: 'int', drill: toGroup },
    { key: 'declined', label: 'Declined', format: 'int', drill: toGroup },
    { key: 'rate', label: 'Decline rate', format: 'pct', drill: toGroup },
    { key: 'expected', label: 'Expected', format: 'pct' },
    { key: 'gap', label: 'Gap to expected', format: 'pts' },
    { key: 'low', label: 'Low (90% interval)', format: 'pct' },
    { key: 'high', label: 'High (90% interval)', format: 'pct' },
  ]
  const cutPicker = (
    <Menu
      align="end"
      width={200}
      trigger={
        <Button size="sm" caret>
          By {c.label.toLowerCase()}
        </Button>
      }
      items={CUTS.map((x) => ({
        label: x.label,
        icon: x.key === cut ? <IconCheck className="size-3.5" /> : <span className="size-3.5" />,
        onSelect: () => setCut(x.key),
      }))}
    />
  )
  const groupMin = c.person ? s.minPersonOffers : s.minGroup

  /* ───────── speed ───────── */
  const toBucket = bucketDrill(ctx, m)
  const bucketColumns: Column<BucketRow>[] = [
    { key: 'bucket', label: 'Days' },
    { key: 'resolved', label: 'Offers resolved', format: 'int', drill: toBucket },
    { key: 'declined', label: 'Declined', format: 'int', drill: toBucket },
    { key: 'rate', label: 'Decline rate', format: 'pct', drill: toBucket },
  ]
  const slow = finding('hrbp-declines-slow-decisions')
  // The note sits on the first bucket past the decision window ("After a week, 56% declined").
  const firstSlow = DECIDE_BUCKETS.find((b) => b.lo > s.slowDecisionDays)
  const slowBucket = m.toDecide.rows.find((r) => r.rate != null && r.bucket === firstSlow?.key)
  const decideNotes: ChartNote[] =
    slow && slowBucket?.rate != null
      ? [
          {
            at: slowBucket.bucket,
            text: `After ${daysWords(s.slowDecisionDays)}, ${pct0(slowBucket.rate)} declined`,
          },
        ]
      : []
  const timingFigure = (kind: 'toOffer' | 'toDecide') => {
    const part = kind === 'toOffer' ? m.toOffer : m.toDecide
    const id = kind === 'toOffer' ? F.interviewToOffer : F.offerToDecision
    const missingMsg = kind === 'toOffer' ? gap(F.interviewToOffer) : null
    const noDates = !m.has.offerDate ? 'Add Offer date to Candidates to see this.' : null
    const empty =
      missingMsg ??
      noDates ??
      (part.measured.length ? noOffers : 'No offers with these dates in this period.')
    return (
      <Figure
        id={id}
        metric={DM.timing}
        uses={m.uses.timing}
        title={
          kind === 'toOffer'
            ? 'Decline rate by days from final interview to offer'
            : 'Decline rate by days from offer to decision'
        }
        subtitle={
          kind === 'toOffer'
            ? `Final interview is the onsite date, else the hiring manager date. Offers resolved in ${m.periodWords}`
            : `From the offer date to the date the candidate accepted or declined. Offers resolved in ${m.periodWords}`
        }
        data={part.rows}
        columns={bucketColumns}
        definitions={definitionsOf(ctx.metrics, DM.timing)}
        note={noteOf(
          part.flat ? 'No clear link in this period' : null,
          `${plural(part.measured.length, 'offer')} with the dates`,
          asOf,
        )}
        span={6}
        empty={empty}
        emptyAction={missingMsg || noDates ? emptyAction : undefined}
        emptyHeight={standard}
      >
        <Columns
          data={part.rows}
          x="bucket"
          y="rate"
          format="pct0"
          ref={part.overall != null ? { value: part.overall, label: `All ${pct0(part.overall)}` } : undefined}
          secondary={(r) => plural(r.resolved, 'offer')}
          notes={kind === 'toDecide' ? decideNotes : undefined}
          lockedNote={(r) => (r.rate == null ? `Fewer than ${s.minGroup} offers` : null)}
          onSelect={(r) => drill(toBucket(r))}
          ariaLabel={`Decline rate by days ${kind === 'toOffer' ? 'from final interview to offer' : 'from offer to decision'}`}
        />
      </Figure>
    )
  }

  /* ───────── competing offers and the range ───────── */
  const toCompeting = competingDrill(ctx, m)
  const competingColumns: Column<AcceptanceRow>[] = [
    { key: 'group', label: 'Group' },
    { key: 'resolved', label: 'Offers resolved', format: 'int', drill: toCompeting },
    { key: 'accepted', label: 'Accepted', format: 'int', drill: toCompeting },
    { key: 'acceptance', label: 'Acceptance', format: 'pct', drill: toCompeting },
  ]
  const competingGap = gap(F.competing)
  const toRange = rangeDrill(ctx, m)
  const rangeColumns: Column<RangeRow>[] = [
    { key: 'label', label: 'Location' },
    { key: 'declined', label: 'Declined, median', format: 'num2', drill: (r) => toRange(r, 'declined') },
    { key: 'declinedN', label: 'Declined offers', format: 'int', drill: (r) => toRange(r, 'declined') },
    { key: 'accepted', label: 'Accepted, median', format: 'num2', drill: (r) => toRange(r, 'accepted') },
    { key: 'acceptedN', label: 'Accepted offers', format: 'int', drill: (r) => toRange(r, 'accepted') },
    { key: 'gap', label: 'Accepted minus declined', format: 'num2' },
  ]
  const rangeGap = gap(F.rangePosition)

  /* ───────── survey and next steps ───────── */
  // The survey shows only where the mode shows its Listening tab and the figure (Compensation mode
  // hides Candidates & hiring), and the section is titled for what it holds.
  const survey = m.survey && candidateSurveyShown(ctx) ? m.survey : null
  const program = programOf.get(CANDIDATE_SURVEY)
  const surveyRows: SurveyTableRow[] = survey
    ? [
        ...survey.nps.map((r) => ({
          part: 'Candidate NPS',
          group: r.group,
          nps: r.nps,
          respondents: r.suppressed ? null : r.respondents,
          surveyCount: null,
          ats: null,
        })),
        ...survey.reasons.map((r) => ({
          part: 'Decline reason',
          group: r.reason,
          nps: null,
          respondents: null,
          surveyCount: r.survey,
          ats: r.ats,
        })),
      ]
    : []
  const npsOf = (row: SurveyTableRow) => survey?.nps.find((r) => r.part === row.part && r.group === row.group)
  const reasonOf = (row: SurveyTableRow) =>
    survey?.reasons.find((r) => row.part === 'Decline reason' && r.reason === row.group)
  const surveyColumns: Column<SurveyTableRow>[] = [
    { key: 'part', label: 'Measure' },
    { key: 'group', label: 'Group' },
    {
      key: 'nps',
      label: 'Candidate NPS',
      format: 'int',
      drill: (row) => {
        const n = npsOf(row)
        return n && survey ? survey.npsDrill(n) : null
      },
    },
    { key: 'respondents', label: 'Respondents', format: 'int' },
    {
      key: 'surveyCount',
      label: 'Chose it in the survey',
      format: 'int',
      drill: (row) => {
        const r = reasonOf(row)
        return r && survey ? survey.reasonDrill(r) : null
      },
    },
    {
      key: 'ats',
      label: 'Declined offers with it in the ATS',
      format: 'int',
      drill: (row) => {
        const r = reasonOf(row) && m.reasons.find((x) => x.reason === row.group)
        return r ? toReason(r) : null
      },
    },
  ]
  const toTheme = themeDrill(ctx, m)
  const themeColumns: Column<ThemeRow>[] = [
    { key: 'theme', label: 'Theme' },
    { key: 'declined', label: 'Declined offers', format: 'int', drill: toTheme },
    { key: 'share', label: 'Share', format: 'pct', drill: toTheme },
    { key: 'concentratesIn', label: 'Where it concentrates' },
    { key: 'owner', label: 'Owner' },
    { key: 'nextStep', label: 'Next step' },
  ]

  return (
    <AnalysisFrame def={def} model={m} ctx={ctx} lead={leadFigure}>
      <Section
        title="Where and when"
        dek="Which quarters and groups decline most, and whether a group's rate is its market (near what its location and level would predict) or the group itself."
      >
        <Figure
          id={F.trend}
          metric={DM.rate}
          uses={m.uses.offers}
          title="Decline rate by quarter"
          subtitle={`Declined ÷ resolved offers, 8 quarters to ${formatDate(ctx.asOf)}${m.companyQuarters.length ? ', with the company beside the scope' : ''}`}
          data={trendRows}
          columns={trendColumns}
          definitions={definitionsOf(ctx.metrics, DM.rate)}
          note={noteOf(`A quarter under ${s.minGroup} resolved offers breaks the line`, asOf)}
          span={6}
          empty={m.quarters.some((q) => q.resolved) ? null : 'No offers resolved in the last 8 quarters.'}
          emptyHeight={standard}
        >
          <Lines
            data={trendRows}
            x="end"
            y="rate"
            series={m.companyQuarters.length ? 'series' : undefined}
            seriesOrder={m.companyQuarters.length ? [ctx.scopeLabel, COMPANY_SERIES] : undefined}
            emphasize={m.companyQuarters.length ? ctx.scopeLabel : undefined}
            format="pct0"
            zero
            xTicks="quarter"
            notes={trendNotes}
            onSelect={(q) => drill(toQuarter(q))}
            ariaLabel="Decline rate by quarter"
          />
        </Figure>
        <Figure
          id={F.byGroup}
          metric={DM.rate}
          uses={m.uses.groups}
          title="Decline rate by group"
          subtitle={`Declined ÷ resolved offers by ${c.label.toLowerCase()}, ${m.periodWords}. After each rate: the offers and the rate the group's mix would predict`}
          data={m.groups}
          columns={groupColumns}
          definitions={definitionsOf(ctx.metrics, DM.rate, DM.expected)}
          note={noteOf(
            'The table and exports hold every grouping',
            c.person ? `${c.label}s with fewer than ${s.minPersonOffers} offers are folded together` : null,
            asOf,
          )}
          span={6}
          actions={cutPicker}
          empty={noOffers}
          emptyHeight={standard}
        >
          <BarList
            data={groupRows}
            label="label"
            value="rate"
            format="pct0"
            domain={[0, 1]}
            sort="none"
            top={groupRows.length}
            secondary={(r) =>
              r.rate != null
                ? `${fmt(r.declined, 'int')} of ${fmt(r.resolved, 'int')} · expected ${pct0(r.expected)}`
                : plural(r.resolved, 'offer')
            }
            ref={
              companyRate != null ? { value: companyRate, label: `Company ${pct0(companyRate)}` } : undefined
            }
            tone={(r) => (r.kind === 'notRecorded' ? 'deemph' : 'default')}
            glyphTone={(r) => (r.flagged ? 'warning' : 'default')}
            nullNote={`Hidden to protect anonymity: fewer than ${groupMin} resolved offers here, or in a group hidden with it`}
            notes={groupNotes}
            onSelect={(r) => drill(toGroup(r))}
            ariaLabel={`Decline rate by ${c.label.toLowerCase()}`}
          />
        </Figure>
      </Section>

      <Section
        title="Speed"
        dek="Whether the time we take to make an offer, or the time a candidate takes to decide, goes with more declines."
      >
        {timingFigure('toOffer')}
        {timingFigure('toDecide')}
      </Section>

      <Section
        title="Competing offers and the range"
        dek="How offers end when the candidate holds another one, whether revising ours helps, and where offers sat in the pay range. Position in range is a ratio, never an amount."
      >
        <Figure
          id={F.competing}
          metric={DM.competing}
          uses={m.uses.competing}
          title="Competing offers and revised offers"
          subtitle={`Acceptance of offers resolved in ${m.periodWords}, by whether the candidate held a competing offer and whether we revised ours`}
          data={m.competing}
          columns={competingColumns}
          definitions={definitionsOf(ctx.metrics, DM.competing)}
          note={noteOf('A blank Competing offer counts as none recorded', asOf)}
          span={6}
          empty={competingGap ?? noOffers}
          emptyAction={competingGap ? emptyAction : undefined}
          emptyHeight={standard}
        >
          <BarList
            data={m.competing}
            label="group"
            value="acceptance"
            format="pct0"
            domain={[0, 1]}
            sort="none"
            secondary={(r) =>
              r.acceptance != null
                ? `${fmt(r.accepted, 'int')} of ${fmt(r.resolved, 'int')}`
                : plural(r.resolved, 'offer')
            }
            ref={
              m.companyAcceptance != null
                ? { value: m.companyAcceptance, label: `Company ${pct0(m.companyAcceptance)}` }
                : undefined
            }
            nullNote={`Fewer than ${s.minGroup} resolved offers`}
            onSelect={(r) => drill(toCompeting(r))}
            ariaLabel="Acceptance with and without a competing offer, revised and not revised"
          />
        </Figure>
        <Figure
          id={F.rangePosition}
          metric={DM.rangePosition}
          uses={m.uses.range}
          title="Where offers sat in the range"
          subtitle={`Median position in the pay range of declined and accepted offers, ${m.periodWords}: 0 at the range minimum, 1 at the maximum`}
          data={m.range}
          columns={rangeColumns}
          definitions={definitionsOf(ctx.metrics, DM.rangePosition)}
          note={noteOf(
            `Each outcome needs ${s.minGroup} offers with a position`,
            'the rule marks the midpoint',
            asOf,
          )}
          span={6}
          empty={rangeGap ?? (m.range.length ? null : 'No offers with a position in range in this period.')}
          emptyAction={rangeGap ? emptyAction : undefined}
          emptyHeight={standard}
        >
          <RangeDumbbell
            rows={m.range}
            minGroup={s.minGroup}
            onSelect={(r, side) => drill(toRange(r, side))}
            ariaLabel="Median position in range of declined and accepted offers, by location"
          />
        </Figure>
      </Section>

      <Section
        title={survey ? 'What candidates told us, and what to do next' : 'What to do next'}
        dek={
          survey
            ? 'The candidate experience survey beside the reasons recorded in the ATS, and the next step for each theme with its owner.'
            : 'The next step for each theme of decline reasons, with its owner and where it concentrates.'
        }
      >
        {survey && (
          <Figure
            id={F.survey}
            metric="listening.candidates.declineReasons"
            uses={m.uses.reasons}
            title="What candidates who declined told us"
            subtitle={`Candidate NPS of survey respondents whose offer was declined or accepted, and the reasons they chose beside the ATS, ${m.periodWords}`}
            data={surveyRows}
            columns={surveyColumns}
            definitions={definitionsOf(
              ctx.metrics,
              'listening.candidates.declineReasons',
              ...(program ? [scoreMetric(program)] : []),
            )}
            note={noteOf(`Grouped results only; a group under ${survey.min} respondents is hidden`, asOf)}
            actions={
              program ? (
                <Button size="sm" variant="ghost" onClick={() => goTo('listening', program.tab)}>
                  Open in Listening
                  <IconChevronRight className="size-3.5" />
                </Button>
              ) : undefined
            }
            empty={
              survey.respondents ? null : 'No candidate survey answers from these candidates in this period.'
            }
            emptyHeight={standard}
          >
            {/* Two halves side by side from 768px: the NPS pair, then the reasons beside the ATS. */}
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              <div className="min-w-0">
                <BarList<SurveyNpsRow>
                  data={survey.nps}
                  label="group"
                  value="nps"
                  format="int"
                  domain={[-100, 100]}
                  sort="none"
                  secondary={(r) => plural(r.respondents, 'respondent')}
                  nullNote={`Fewer than ${survey.min} respondents`}
                  onSelect={(r) => drill(survey.npsDrill(r))}
                  ariaLabel="Candidate NPS of respondents who declined and who accepted"
                />
              </div>
              <div className="min-w-0 max-md:border-rule max-md:border-t max-md:pt-3">
                <DataTable<SurveyReasonRow>
                  columns={[
                    { key: 'reason', label: 'Decline reason' },
                    {
                      key: 'survey',
                      label: 'In the survey',
                      format: 'int',
                      drill: (r) => survey.reasonDrill(r),
                    },
                    {
                      key: 'ats',
                      label: 'In the ATS',
                      format: 'int',
                      drill: (r) => {
                        const row = m.reasons.find((x) => x.reason === r.reason)
                        return row ? toReason(row) : null
                      },
                    },
                  ]}
                  rows={survey.reasons}
                  maxRows={6}
                />
              </div>
            </div>
          </Figure>
        )}
        <Figure
          id={F.nextSteps}
          metric={DM.reasons}
          uses={m.uses.groups}
          title="What to do next"
          subtitle="Declined offers by theme, where each concentrates by location, level or business unit, its owner and the next step"
          data={m.themes}
          columns={themeColumns}
          definitions={definitionsOf(ctx.metrics, DM.reasons, DM.findings)}
          note={noteOf('Personal and other reasons have no next step', asOf)}
          tableOnly
          empty={
            gap(F.nextSteps) ?? (m.themes.length ? null : 'No declined offers with a reason in this period.')
          }
          emptyAction={gap(F.nextSteps) ? emptyAction : undefined}
        />
      </Section>
    </AnalysisFrame>
  )
}
