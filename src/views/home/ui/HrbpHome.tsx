/**
 * The HRBP homes, for a business unit or a region (docs/ROLES-V2.md 5.5): the CHRO's scorecard for
 * the HRBP's own scope, plus the attrition and hiring risks to raise with its leaders. The page is
 * the same for both modes; the breakdown is by department in a business unit and by site in a
 * region, and My list opens on the unit's leaders or the region's sites. Every number is the
 * producing view's for the scoped context; "vs company" comparisons open nothing.
 */
import { type ReactNode, useState } from 'react'
import { BarList, type Column, Figure } from '@/charts'
import { goTo, KpiStrip, Pending, Readout, Section } from '@/components'
import type { FindingSource } from '@/components/Readout'
import type { Finding, Kpi } from '@/components/types'
import { cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { itemsDrill } from '@/views/actions/engine'
import { drillScopeOf } from '@/views/compliance/engine'
import { expiryDrill, i9Drill } from '@/views/compliance/engine/drills'
import { hrbpModel } from '@/views/hrbp/engine'
import {
  changesSpec,
  employeesOnSpec,
  joinedLeftSpec,
  leaversSpec,
  rateNote,
} from '@/views/hrbp/engine/drill'
import { all, BUSINESS_UNIT, VOLUNTARY } from '@/views/hrbp/engine/lineage'
import { ID } from '@/views/hrbp/metrics'
import { attritionGroupDrill } from '@/views/hrbp/ui/drill'
import { rescope } from '@/views/hrbp/ui/model'
import { computeOnboarding } from '@/views/onboarding/engine'
import { startsDrill } from '@/views/onboarding/engine/drills'
import { computeRecruiting } from '@/views/recruiting/engine'
import { openReqsDrill } from '@/views/recruiting/engine/drills'
import type { SourcedFinding } from '@/views/scorecard/engine/model'
import { Measures, Standing } from '@/views/scorecard/ui/Band'
import { PipelineToday } from '@/views/scorecard/ui/Sections'
import { useScorecard } from '@/views/scorecard/ui/useScorecard'
import { computeCached as servicesModel } from '@/views/services/engine'
import { openDrill } from '@/views/services/engine/drills'
import { talentModel } from '@/views/talent/engine'
import { FIGURE_METRIC as TALENT_FIGURE_METRIC } from '@/views/talent/engine/settings'
import { riskPersonColumns } from '@/views/talent/ui/columns'
import { HOME_SHOWN } from '../engine/attention'
import {
  type GroupBar,
  groupAttrition,
  hrbpLists,
  type LeaderListRow,
  type SiteListRow,
} from '../engine/hrbp'
import { scorecardJudge, tile } from '../engine/kpis'
import { AttentionSection } from './Attention'
import { ReqRisk, TrailingAttrition } from './Figures'
import { ListFigure, ListSwitch } from './Frames'
import { HomeTop } from './HomeTop'
import { type HomeItems, useHomeItems } from './useHomeItems'
import { useIdleModel } from './useIdleModel'

/** The practices whose findings an HRBP raises with leaders (5.5). */
const RAISE = new Set(['hrbp', 'recruiting', 'onboarding', 'talent'])

/* ───────── key figures ───────── */

function KeyFigures() {
  const ctx = useAnalytics()
  const h = hrbpModel(ctx).kpi.kpis
  const r = computeRecruiting(ctx).kpis
  const o = computeOnboarding(ctx).kpis.upcoming
  const kpis: Kpi[] = [
    ...tile(h, 'headcount', { view: 'hrbp', tab: 'workforce', label: 'People stats, Workforce' }),
    ...tile(h, 'voluntary', { view: 'hrbp', tab: 'attrition', label: 'People stats, Attrition' }),
    ...tile(h, 'regretted', { view: 'hrbp', tab: 'attrition', label: 'People stats, Attrition' }),
    ...tile(h, 'first-year', { view: 'hrbp', tab: 'attrition', label: 'People stats, Attrition' }),
    ...tile(r, 'open-reqs', { view: 'recruiting', tab: 'requisitions', label: 'Recruiting, Requisitions' }),
    ...tile(o, 'starts-30', { view: 'onboarding', tab: 'upcoming', label: 'Onboarding, Upcoming starts' }),
  ]
  // Judged as the measures beside it are, so a rate never reads Missed here and Watch there.
  return (
    <KpiStrip
      id="home-hrbp-kpis"
      title="Key figures"
      kpis={kpis}
      span={8}
      judge={scorecardJudge(ctx.metrics)}
    />
  )
}

/* ───────── what to raise ───────── */

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

/* ───────── attrition by department or site ───────── */

function GroupAttrition() {
  const ctx = useAnalytics()
  const m = hrbpModel(ctx)
  const p = m.prep
  const region = ctx.access.scope?.kind === 'region'
  const dim = region ? 'location' : 'department'
  const { rows, company } = groupAttrition(m, dim)
  const cell = attritionGroupDrill(p, dim, true)
  const above = rows.filter((r) => r.above)
  const word = region ? 'site' : 'department'
  const columns: Column<GroupBar>[] = [
    { key: 'group', label: region ? 'Site' : 'Department' },
    { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
    { key: 'voluntary', label: 'Voluntary exits', format: 'int', drill: cell },
    { key: 'voluntaryRate', label: 'Voluntary attrition', format: 'pct', drill: cell },
  ]
  return (
    <Figure
      id="home-hrbp-attrition-by-group"
      metric={ID.voluntary}
      uses={p.uses(all(VOLUNTARY, BUSINESS_UNIT))}
      title={`Voluntary attrition by ${word}`}
      subtitle={`Annualized voluntary attrition, ${ctx.window.label}, against the company`}
      data={rows}
      columns={columns}
      definitions={p.defs(ID.voluntary, ID.voluntaryAbove)}
      note={[
        company != null ? `Company ${fmt(company, 'pct')}` : '',
        above.length
          ? `${plural(above.length, word)} at least ${fmt(p.set.voluntaryAbove.gap * 100, 'num1')} pts above the company`
          : '',
        `${word}s under ${p.set.minGroup} people are hidden`,
      ]
        .filter(Boolean)
        .join(' · ')}
      span={6}
      empty={
        rows.some((r) => r.voluntaryRate != null) ? null : 'No voluntary attrition to compare in this scope.'
      }
    >
      <BarList<GroupBar>
        data={rows}
        label="group"
        value="voluntaryRate"
        format="pct"
        sort="none"
        top={12}
        ref={company != null ? { value: company, label: `Company ${fmt(company, 'pct')}` } : undefined}
        glyphTone={(r) => (r.above ? 'warning' : 'default')}
        secondary={(r) => (r.voluntaryRate == null ? '' : `${fmt(r.voluntary, 'int')} exits`)}
        selectable={(r) => r.voluntaryRate != null && r.leavers.length > 0}
        onSelect={(r) => drill(cell(r))}
        ariaLabel={`Voluntary attrition by ${word}, against the company`}
      />
    </Figure>
  )
}

/* ───────── my list ───────── */

type ListKey = 'leaders' | 'sites' | 'talent'

function LeadersTable({
  rows,
  items,
  actions,
}: {
  rows: LeaderListRow[]
  items: HomeItems | null
  actions: ReactNode
}) {
  const ctx = useAnalytics()
  const p = hrbpModel(ctx).prep
  const b = computeRecruiting(ctx).base
  const company = hrbpModel(ctx).attrition.company
  const open = items ? items.open : null
  const withItems = rows.map((r) => {
    const list = open
      ? open.filter((a) => (!!a.ownerId && r.ids.has(a.ownerId)) || (!!a.personId && r.ids.has(a.personId)))
      : []
    return { ...r, items: open ? list.length : null, itemList: list }
  })
  type Row = (typeof withItems)[number]
  const period = ctx.window.label
  const columns: Column<Row>[] = [
    { key: 'leader', label: 'Leader' },
    { key: 'title', label: 'Title' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (r) => () =>
        employeesOnSpec(p, p.asOf, { title: `Employees in ${r.leader}'s org`, rows: r.active }),
    },
    {
      key: 'netChange',
      label: 'Net change, 12 mo',
      format: 'int',
      drill: (r) =>
        r.netChange == null || (!r.joined.length && !r.left.length)
          ? null
          : () =>
              joinedLeftSpec(p, `Joined and left, ${r.leader}'s org, last 12 months`, r.joined, r.left, {
                when: p.t12.label,
              }),
    },
    {
      key: 'voluntary',
      label: 'Voluntary attrition',
      format: 'pct',
      drill: (r) =>
        r.voluntary == null
          ? null
          : () =>
              leaversSpec(p, `Voluntary leavers, ${r.leader}'s org, ${period}`, r.voluntaryLeavers, {
                note: rateNote(
                  r.voluntaryLeavers.length,
                  ['voluntary exit', 'voluntary exits'],
                  r.avgHeadcount,
                  p.window.months,
                  p.set.annualize,
                ),
              }),
    },
    { key: 'voluntaryVsCompany', label: 'Voluntary vs company', format: 'pts' },
    {
      key: 'regretted',
      label: 'Regretted attrition',
      format: 'pct',
      drill: (r) =>
        r.regretted == null
          ? null
          : () =>
              leaversSpec(p, `Regretted leavers, ${r.leader}'s org, ${period}`, r.regrettedLeavers, {
                note: rateNote(
                  r.regrettedLeavers.length,
                  ['regretted exit', 'regretted exits'],
                  r.avgHeadcount,
                  p.window.months,
                  p.set.annualize,
                ),
              }),
    },
    { key: 'regrettedVsCompany', label: 'Regretted vs company', format: 'pts' },
    {
      key: 'openReqs',
      label: 'Open reqs',
      format: 'int',
      drill: (r) => (r.reqs.length ? () => openReqsDrill(b, r.reqs, `Open reqs, ${r.leader}'s org`) : null),
    },
    {
      key: 'items',
      label: 'Open items',
      format: 'int',
      drill: (r) =>
        r.itemList.length ? () => itemsDrill(ctx, `Open items, ${r.leader}'s org`, r.itemList) : null,
    },
    { key: 'flags', label: 'Flags' },
    {
      key: 'promotionRate',
      label: 'Promotion rate',
      format: 'pct',
      drill: (r) =>
        r.promotions.length
          ? () => changesSpec(p, `Promotions, ${r.leader}'s org, ${period}`, r.promotions)
          : null,
    },
  ]
  return (
    <ListFigure<Row>
      metric={ID.scorecard}
      uses={p.uses(all(VOLUNTARY, BUSINESS_UNIT))}
      title="Leaders"
      subtitle={`Directors and above, and every manager with 8 or more people in their org, in ${ctx.access.scope?.label ?? ctx.scopeLabel}`}
      rows={withItems}
      columns={columns}
      definitions={p.defs(ID.voluntary, ID.regretted, ID.promotionRate)}
      note={[
        company.voluntary != null ? `Company voluntary ${fmt(company.voluntary, 'pct')}` : '',
        company.regretted != null ? `regretted ${fmt(company.regretted, 'pct')}` : '',
        `rates under ${p.set.minGroup} people are hidden`,
        'a row focuses every view on that org',
      ]
        .filter(Boolean)
        .join(' · ')}
      actions={actions}
      onRowClick={(r) => {
        rescope(ctx, { leaderId: r.id })
        goTo('hrbp')
      }}
      empty={rows.length ? null : 'No leader in this scope has 8 or more people in their org.'}
    />
  )
}

function SitesTable({ rows, actions }: { rows: SiteListRow[]; actions: ReactNode }) {
  const ctx = useAnalytics()
  const m = hrbpModel(ctx)
  const p = m.prep
  const b = computeRecruiting(ctx).base
  const o = computeOnboarding(ctx)
  const s = servicesModel(ctx)
  const scope = drillScopeOf(ctx)
  const voluntary = attritionGroupDrill(p, 'location', true)
  const startsOf = (r: SiteListRow) => o.upcoming.in30.filter((x) => r.startIds.includes(x.key))
  const privateTotal = rows.reduce((n, r) => n + r.privateCases, 0)
  const columns: Column<SiteListRow>[] = [
    { key: 'site', label: 'Site' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (r) =>
        r.active.length
          ? () => employeesOnSpec(p, p.asOf, { title: `Employees, ${r.site}`, rows: r.active })
          : null,
    },
    {
      key: 'voluntary',
      label: 'Voluntary attrition',
      format: 'pct',
      drill: (r) => (r.group ? voluntary(r.group) : null),
    },
    {
      key: 'starts30',
      label: 'Starts in 30 days',
      format: 'int',
      drill: (r) =>
        r.starts30 ? () => startsDrill(o.base, startsOf(r), `Starts in the next 30 days, ${r.site}`) : null,
    },
    {
      key: 'openReqs',
      label: 'Open reqs',
      format: 'int',
      drill: (r) => (r.reqs.length ? () => openReqsDrill(b, r.reqs, `Open reqs, ${r.site}`) : null),
    },
    {
      key: 'openCases',
      label: 'Open cases',
      format: 'int',
      drill: (r) => (r.cases.length ? () => openDrill(s.scope, r.cases, `Open cases, ${r.site}`) : null),
    },
    {
      key: 'reverifications',
      label: 'Reverifications due',
      format: 'int',
      drill: (r) =>
        r.expiring.length
          ? () =>
              expiryDrill(scope, r.expiring, {
                title: `Work authorizations to reverify, ${r.site}`,
                uses: [],
              })
          : null,
    },
    // I-9 Section 2 is a US rule: a region with no US site leaves the column out.
    ...(rows.some((r) => r.usSite || r.i9.length > 0)
      ? [
          {
            key: 'i9OnTime' as const,
            label: 'I-9 Section 2 on time',
            format: 'pct' as const,
            drill: (r: SiteListRow) =>
              r.i9OnTime != null
                ? () => i9Drill(scope, r.i9, { title: `I-9 Section 2, ${r.site}`, uses: [] })
                : null,
          },
        ]
      : []),
  ]
  return (
    <ListFigure<SiteListRow>
      metric={ID.voluntary}
      uses={p.uses(VOLUNTARY)}
      title="Sites"
      subtitle={`Each site in ${ctx.access.scope?.label ?? 'the region'}, as of ${formatDate(ctx.asOf)}`}
      rows={rows}
      columns={columns}
      note={[
        s.smallScope
          ? ''
          : `${plural(privateTotal, 'employee relations case')} counted in open cases, never listed`,
        'reverifications due in the next 90 days',
        'a row filters every view to the site',
      ]
        .filter(Boolean)
        .join(' · ')}
      actions={actions}
      onRowClick={(r) => rescope(ctx, { location: [r.site] })}
      empty={rows.length ? null : 'No site in this region has people, reqs or starts.'}
    />
  )
}

function KeyTalentTable({ actions }: { actions: ReactNode }) {
  const ctx = useAnalytics()
  const t = talentModel(ctx)
  const rows = t.retention.keyTalent
  return (
    <ListFigure
      metric={TALENT_FIGURE_METRIC['talent-key-talent-top']}
      uses={t.uses['talent-key-talent-top']}
      title="Key talent at risk"
      subtitle={`Rated 4 or 5 and in the high flight-risk band, in ${ctx.access.scope?.label ?? ctx.scopeLabel}`}
      rows={rows}
      columns={riskPersonColumns(rows, { full: true })}
      note={`${plural(rows.length, 'person', 'people')} · scored as of ${formatDate(ctx.asOf)} · a row opens the person`}
      actions={actions}
      onRowClick={(r) => openPerson(r.employeeId)}
      empty={
        t.has.reviews
          ? 'Nobody rated 4 or 5 is in the high flight-risk band in this scope.'
          : 'Upload Reviews to see this.'
      }
    />
  )
}

function MyList({ items }: { items: HomeItems | null }) {
  const ctx = useAnalytics()
  const region = ctx.access.scope?.kind === 'region'
  const keyShown = ctx.access.can(`metric:${TALENT_FIGURE_METRIC['talent-key-talent-top']}`)
  const [list, setList] = useState<ListKey>(region ? 'sites' : 'leaders')
  const { model, updating } = useIdleModel('hrbp-lists', hrbpLists)
  const options = [
    region ? { value: 'sites' as const, label: 'Sites' } : { value: 'leaders' as const, label: 'Leaders' },
    ...(keyShown ? [{ value: 'talent' as const, label: 'Key talent at risk' }] : []),
  ]
  const actions = <ListSwitch value={list} onChange={setList} options={options} />
  if (!model)
    return (
      <Pending
        title={region ? 'Sites' : 'Leaders'}
        span={12}
        height={360}
        message="Reading the scope's leaders and sites."
      />
    )
  return (
    <div className={cx('col-span-full min-w-0', updating && 'opacity-60 transition-opacity')}>
      {list === 'talent' ? (
        <KeyTalentTable actions={actions} />
      ) : region ? (
        <SitesTable rows={model.sites} actions={actions} />
      ) : (
        <LeadersTable rows={model.leaders} items={items} actions={actions} />
      )}
    </div>
  )
}

/* ───────── page ───────── */

const BAND_FRAMES = [
  { title: 'Targets met', span: 4 as const, height: 223 },
  { title: 'Key figures', span: 8 as const, height: 223 },
  { title: 'Measures against target', span: 8 as const, height: 640 },
  { title: 'What to raise', span: 4 as const, height: 480 },
]

export function HrbpHome() {
  const ctx = useAnalytics()
  const { model, updating } = useScorecard()
  const items = useHomeItems()
  const fade = cx(updating && 'opacity-60 transition-opacity')
  const raise = model
    ? model.findings.all.filter(
        (s) => RAISE.has(s.view) && (s.finding.severity === 'critical' || s.finding.severity === 'warning'),
      )
    : []
  const region = ctx.access.scope?.kind === 'region'
  return (
    <>
      <HomeTop
        hero={
          model ? (
            <Standing id="home-hrbp-standing" model={model} className={fade} />
          ) : (
            <Pending
              message="Reading each practice's measures and findings for this scope."
              frames={BAND_FRAMES.slice(0, 1)}
            />
          )
        }
        overview={
          model ? (
            <>
              <KeyFigures />
              <Measures id="home-hrbp-measures" model={model} className={fade} />
              <Readout
                id="home-hrbp-findings"
                title="What to raise"
                findings={raise.slice(0, 6).map((s) => s.finding)}
                sourceOf={sourcesOf(raise)}
                emptyText="No critical or watch findings in People stats, Recruiting, Onboarding or Talent for this scope."
                span={12}
                limit={6}
                variant="compact"
                className={cx('lg:col-span-4 lg:sticky lg:top-4', fade)}
              />
            </>
          ) : (
            <Pending
              message="Reading each practice's measures and findings for this scope."
              frames={BAND_FRAMES.slice(1)}
            />
          )
        }
        attention={
          <AttentionSection
            items={items}
            shown={HOME_SHOWN}
            dek={
              ctx.access.scope?.kind === 'region' && ctx.access.scope.owner
                ? "Your open items in this scope: span of control, single-report chains, new managers with a large team, promotions to review, what the surveys say about managers and exits, and what they say about your region's sites."
                : 'Your open items in this scope: span of control, single-report chains, new managers with a large team, promotions to review and what the surveys say about managers and exits.'
            }
          />
        }
      />
      <Section
        title="My list"
        dek={
          region
            ? "The region's sites, to review with each site lead, and the key talent at risk."
            : "The unit's leaders, to prepare each 1:1, and the key talent at risk."
        }
      >
        <MyList items={items} />
      </Section>
      <Section
        title="Attrition and hiring risks"
        dek={`Where the scope is losing people faster than the company, and the reqs and candidates to raise with its leaders.`}
      >
        <GroupAttrition />
        <TrailingAttrition id="home-hrbp-attrition-trend" span={6} />
        <ReqRisk id="home-hrbp-req-risk" span={6} />
        <PipelineToday id="home-hrbp-pipeline" span={6} link={false} />
      </Section>
    </>
  )
}
