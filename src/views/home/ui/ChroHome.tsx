/**
 * The CHRO's executive home (docs/ROLES-V2.md 5.4): the monthly people review on one page. Targets
 * met and the key figures, every measure against its target beside the measures by practice and
 * status; then the top risks (the escalations someone must act on, and the risks the data shows);
 * My list, the leaders' orgs; and how the workforce is moving. The measures, findings and tiles
 * are the Scorecard's and the producing views' own numbers for the context on screen.
 */
import { useState } from 'react'
import { type Column, Figure, HBars, useChartTheme } from '@/charts'
import { Grid, goTo, KpiStrip, Pending, Readout, Section } from '@/components'
import type { FindingSource } from '@/components/Readout'
import type { Finding, Kpi } from '@/components/types'
import { cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { Drill } from '@/drill/Drill'
import { drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { definitionOf } from '@/metrics/api'
import { actionKpis, itemsDrill } from '@/views/actions/engine'
import { M as ACTIONS } from '@/views/actions/metrics'
import { hrbpModel } from '@/views/hrbp/engine'
import { scoreSpec } from '@/views/hrbp/engine/buckets'
import { FIGURE } from '@/views/hrbp/engine/lineage'
import { ID as HRBP } from '@/views/hrbp/metrics'
import { rescope } from '@/views/hrbp/ui/model'
import { computeRecruiting } from '@/views/recruiting/engine'
import { openReqsDrill } from '@/views/recruiting/engine/drills'
import type { SourcedFinding } from '@/views/scorecard/engine/model'
import { M as SCORECARD } from '@/views/scorecard/metrics'
import { Measures, Standing } from '@/views/scorecard/ui/Band'
import { HeadcountTrend, UnitAttrition } from '@/views/scorecard/ui/Sections'
import { useScorecard } from '@/views/scorecard/ui/useScorecard'
import { talentModel } from '@/views/talent/engine'
import { ESCALATIONS_ON_HOME } from '../engine/attention'
import {
  type LeaderRow,
  leaderRows,
  type PracticeRow,
  type PracticeSegment,
  practiceStatus,
  STATUS_WORD,
  withCritical,
} from '../engine/chro'
import { pendingTile, tile } from '../engine/kpis'
import { AttentionSection } from './Attention'
import { ListFigure } from './Frames'
import { useHomeItems } from './useHomeItems'
import { useIdleModel } from './useIdleModel'

const LINK = 'text-meta font-medium text-link underline-offset-2 hover:underline'

/* ───────── key figures ───────── */

function KeyFigures({ items }: { items: ReturnType<typeof useHomeItems> }) {
  const ctx = useAnalytics()
  const h = hrbpModel(ctx).kpi.kpis
  const r = computeRecruiting(ctx).kpis
  const critical = items
    ? actionKpis(items.open, ctx).find((k) => k.metricId === ACTIONS.critical)
    : undefined
  const kpis: Kpi[] = [
    ...tile(h, 'headcount', { view: 'hrbp', tab: 'workforce', label: 'People stats, Workforce' }),
    ...tile(h, 'voluntary', { view: 'hrbp', tab: 'attrition', label: 'People stats, Attrition' }),
    ...tile(h, 'regretted', { view: 'hrbp', tab: 'attrition', label: 'People stats, Attrition' }),
    ...tile(r, 'open-reqs', { view: 'recruiting', tab: 'requisitions', label: 'Recruiting, Requisitions' }),
    {
      ...(critical ?? pendingTile('critical', ACTIONS.critical, 'Critical', 'Counting open items')),
      label: 'Critical open items',
      link: { view: 'actions', label: 'Action center' },
    },
  ]
  return <KpiStrip id="home-chro-kpis" title="Key figures" kpis={kpis} span={8} />
}

/* ───────── measures by practice and status ───────── */

function PracticesFigure({
  model,
  className,
}: {
  model: NonNullable<ReturnType<typeof useScorecard>['model']>
  className?: string
}) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const [open, setOpen] = useState<PracticeSegment | null>(null)
  const { segments, rows } = practiceStatus(model)
  const colors: Record<string, string> = {
    [STATUS_WORD.met]: theme.status.good,
    [STATUS_WORD.watch]: theme.status.warning,
    [STATUS_WORD.missed]: theme.status.critical,
    [STATUS_WORD.none]: theme.deemph,
    [STATUS_WORD.unknown]: theme.sheet3,
  }
  const order = [
    STATUS_WORD.met,
    STATUS_WORD.watch,
    STATUS_WORD.missed,
    STATUS_WORD.none,
    STATUS_WORD.unknown,
  ]
  const pick = (practice: string, status?: PracticeSegment['status']) =>
    setOpen((cur) => {
      const seg = segments.find((s) => s.practice === practice && (!status || s.status === status)) ?? null
      return cur && seg && cur.practice === seg.practice && cur.status === seg.status ? null : seg
    })
  const columns: Column<PracticeRow>[] = [
    { key: 'practice', label: 'Practice' },
    { key: 'met', label: 'Met', format: 'int' },
    { key: 'watch', label: 'Watch', format: 'int' },
    { key: 'missed', label: 'Missed', format: 'int' },
    { key: 'none', label: 'No target', format: 'int' },
    { key: 'unknown', label: 'Not shown', format: 'int' },
    { key: 'measures', label: 'Measures', format: 'int' },
  ]
  const defined = [
    definitionOf(ctx.metrics, SCORECARD.status),
    definitionOf(ctx.metrics, SCORECARD.watch),
  ].filter((d): d is NonNullable<typeof d> => d != null)
  return (
    <Figure
      id="home-chro-practices"
      metric={SCORECARD.status}
      uses={model.uses.length ? model.uses : undefined}
      title="Measures by practice"
      subtitle="Each practice's measures by status against target"
      data={rows}
      columns={columns}
      definitions={defined}
      note={`${plural(model.counts.measures, 'measure')} from ${plural(rows.length, 'practice')} · as of ${formatDate(ctx.asOf)}`}
      span={4}
      className={className}
      empty={rows.length ? null : 'No practice has measures to show yet.'}
    >
      <HBars<PracticeSegment>
        data={segments}
        y="practice"
        x="measures"
        series="statusWord"
        stack
        seriesOrder={order}
        yOrder={rows.map((r) => r.practice)}
        colors={colors}
        format="int"
        onSelect={(d) => pick(d.practice)}
        onSelectSegment={(d) => pick(d.practice, d.status)}
        ariaLabel="Measures by practice, stacked by status against target"
      />
      {open && (
        <div className="mt-3 border-t border-rule pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-meta font-medium text-ink-2">
              {open.practice}: {plural(open.measures, 'measure')} {open.statusWord.toLowerCase()}
            </h3>
            <button type="button" className={LINK} onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <ul className="mt-1">
            {open.rows.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 py-0.5 text-small">
                <span className="min-w-0 flex-1 truncate text-ink" title={r.kpi.label}>
                  {r.kpi.label}
                </span>
                <Drill
                  spec={r.shown && !r.kpi.suppressed ? r.kpi.drill : null}
                  className="tnum shrink-0 text-ink"
                >
                  {r.valueText}
                </Drill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Figure>
  )
}

/* ───────── top risks in the data ───────── */

function sourcesOf(list: readonly SourcedFinding[]): (f: Finding) => FindingSource | null {
  const byId = new Map(list.map((s) => [s.finding.id, s]))
  return (f) => {
    const s = byId.get(f.id)
    if (!s) return null
    const to = s.opens
    return to
      ? { label: s.practice, openLabel: `Open in ${s.practice}`, open: () => goTo(to.view, to.tab) }
      : { label: s.practice }
  }
}

/* ───────── leaders' orgs ───────── */

function computeLeaders(ctx: Parameters<typeof leaderRows>[0]) {
  return leaderRows(ctx, {
    roles: talentModel(ctx).succession.roles,
    openReqs: computeRecruiting(ctx).base.req.open,
  })
}

function LeadersList({ items }: { items: ReturnType<typeof useHomeItems> }) {
  const ctx = useAnalytics()
  const { model, updating } = useIdleModel('chro-leaders', computeLeaders)
  if (!model)
    return <Pending title="Leaders' orgs" span={12} height={360} message="Reading each leader's org." />
  const { top, prep } = model
  const rows = withCritical(model.rows, items ? items.open : null)
  const b = computeRecruiting(ctx).base
  const talent = talentModel(ctx)
  const cell = (key: Parameters<typeof scoreSpec>[2]) => (r: LeaderRow) =>
    prep ? () => scoreSpec(prep, r.score, key) : null
  const columns: Column<LeaderRow>[] = [
    {
      key: 'leader',
      label: 'Leader',
      drill: (r) => {
        const e = ctx.org.byId.get(r.id)
        return e ? drillSpec({ kind: 'employees', title: r.leader, rows: [e] }) : null
      },
    },
    { key: 'title', label: 'Title' },
    { key: 'headcount', label: 'Headcount', format: 'int', drill: cell('headcount') },
    { key: 'voluntary', label: 'Voluntary attrition', format: 'pct', drill: cell('voluntary') },
    { key: 'voluntaryVsCompany', label: 'Voluntary vs company', format: 'pts' },
    { key: 'regretted', label: 'Regretted attrition', format: 'pct', drill: cell('regretted') },
    { key: 'regrettedVsCompany', label: 'Regretted vs company', format: 'pts' },
    {
      key: 'openReqs',
      label: 'Open reqs',
      format: 'int',
      drill: (r) => (r.reqs.length ? () => openReqsDrill(b, r.reqs, `Open reqs, ${r.leader}'s org`) : null),
    },
    {
      key: 'critical',
      label: 'Critical open items',
      format: 'int',
      drill: (r) =>
        r.criticalItems.length
          ? () => itemsDrill(ctx, `Critical open items, ${r.leader}'s org`, r.criticalItems)
          : null,
    },
    {
      key: 'coverage',
      label: 'Critical roles covered',
      format: 'pct0',
      drill: (r) =>
        r.roles.length
          ? talent.drill.roles(
              r.roles,
              `Critical roles in ${r.leader}'s org: ${r.covered} of ${r.criticalRoles} with a ready-now successor`,
            )
          : null,
    },
    { key: 'criticalRoles', label: 'Critical roles', format: 'int' },
    { key: 'hrbp', label: 'HR business partner' },
  ]
  return (
    <ListFigure<LeaderRow>
      metric={HRBP.scorecard}
      uses={prep ? prep.uses(FIGURE.scorecard('leader', false, prep.set.regretted)) : undefined}
      title="Leaders' orgs"
      subtitle={
        top
          ? `Each of ${top.name}'s direct reports' orgs, against the company, as of ${formatDate(ctx.asOf)}`
          : 'Each top leader’s org, against the company'
      }
      rows={rows}
      columns={columns}
      note={[
        model.company.voluntary != null ? `Company voluntary ${fmt(model.company.voluntary, 'pct')}` : '',
        model.company.regretted != null ? `regretted ${fmt(model.company.regretted, 'pct')}` : '',
        model.folded ? `${plural(model.folded, 'org')} under 5 employees not listed` : '',
        'a row focuses every view on that org',
      ]
        .filter(Boolean)
        .join(' · ')}
      onRowClick={(r) => {
        rescope(ctx, { leaderId: r.id })
        goTo('hrbp')
      }}
      empty={
        top
          ? rows.length
            ? null
            : 'No leader below the top of the org has 5 or more people.'
          : 'No reporting lines in the Employees data.'
      }
      className={cx(updating && 'opacity-60 transition-opacity')}
    />
  )
}

/* ───────── page ───────── */

const BAND_FRAMES = [
  { title: 'Targets met', span: 4 as const, height: 223 },
  { title: 'Key figures', span: 8 as const, height: 223 },
  { title: 'Measures against target', span: 8 as const, height: 640 },
  { title: 'Measures by practice', span: 4 as const, height: 300 },
]

export function ChroHome() {
  const { model, updating } = useScorecard()
  const items = useHomeItems()
  const fade = cx(updating && 'opacity-60 transition-opacity')
  const risks = model
    ? [
        ...model.findings.all.filter(
          (s) => s.finding.severity === 'critical' || s.finding.severity === 'warning',
        ),
      ]
    : []
  return (
    <>
      <Grid>
        {model ? (
          <>
            <Standing id="home-chro-standing" model={model} className={fade} />
            <KeyFigures items={items} />
            <Measures id="home-chro-measures" model={model} className={fade} />
            <PracticesFigure model={model} className={cx(fade, 'lg:sticky lg:top-4 self-start')} />
          </>
        ) : (
          <Pending message="Reading each practice's measures and findings." frames={BAND_FRAMES} />
        )}
      </Grid>
      <AttentionSection
        items={items}
        escalations
        shown={ESCALATIONS_ON_HOME}
        title="Top risks"
        dek="Escalations someone must act on first, each with its owner, then the risks the data shows across every practice."
      >
        {model ? (
          <Readout
            id="home-chro-risks"
            title="Top risks in the data"
            findings={risks.slice(0, 8).map((s) => s.finding)}
            sourceOf={sourcesOf(risks)}
            emptyText="No critical or watch findings in any practice."
            span={12}
            limit={8}
            variant="compact"
            className={fade}
          />
        ) : (
          <Pending
            title="Top risks in the data"
            span={12}
            height={320}
            message="Reading each practice's findings."
          />
        )}
      </AttentionSection>
      <Section
        title="My list"
        dek="The orgs of the leaders who report to the top of the company: the 1:1s of the month."
      >
        <LeadersList items={items} />
      </Section>
      <Section
        title="How the workforce is moving"
        dek="Headcount at each month end, and the business units losing people faster than the company."
      >
        <HeadcountTrend id="home-chro-hc-trend" span={6} />
        <UnitAttrition id="home-chro-attrition-bu" span={6} />
      </Section>
    </>
  )
}
