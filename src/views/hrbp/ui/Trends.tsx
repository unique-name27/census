/**
 * The People stats figures added in the design refresh: attrition over the trailing 12 months
 * (Overview), headcount by organization over time (Workforce), how long new hires stay
 * (Attrition) and new managers in the last 12 months (Movement). The engine is
 * `../engine/trends.ts`; every bar, segment and point opens the people behind it.
 */
import { useMemo, useState } from 'react'
import { BarList, type Column, Columns, Figure, Lines } from '@/charts'
import { Segmented } from '@/components'
import { useChartHeight } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { HrbpModel } from '../engine'
import { NO_HISTORY, NO_LEAVERS } from '../engine/base'
import { employeesOnSpec } from '../engine/drill'
import { FIGURE } from '../engine/lineage'
import {
  attritionTrailing,
  CHECKPOINTS,
  COMPANY_LINE,
  type CohortPoint,
  checkpointLabel,
  cohortDrill,
  cohortRetention,
  headcountByOrg,
  type ManagerChangeRow,
  managerChangeDrill,
  managerChanges,
  type OrgMonthRow,
  orgMonthDrill,
  type TrailingKind,
  type TrailingPoint,
  trailingDrill,
} from '../engine/trends'
import { ANONYMITY_ID, ID } from './defs'
import { drillWhen } from './drill'

const KIND_WORD: Record<TrailingKind, string> = { voluntary: 'Voluntary', regretted: 'Regretted' }

/* ───────── Overview ───────── */

export function AttritionTrailing({ m, span }: { m: HrbpModel; span: 6 | 12 }) {
  const ctx = useAnalytics()
  const p = m.prep
  const [picked, setKind] = useState<TrailingKind>('voluntary')
  // Manager mode hides regretted attrition (HR's call about named leavers): voluntary only.
  const withRegretted = ctx.access.can(`metric:${ID.regretted}`)
  const kind: TrailingKind = withRegretted ? picked : 'voluntary'
  const t = useMemo(() => attritionTrailing(p), [p])
  const points = t[kind]
  const scope = points.filter((x) => x.series === t.scopeLine)
  const last = scope.at(-1)
  const ready = t.ready[kind]
  const open = (d: TrailingPoint) => drillWhen(d.records.length > 0, () => trailingDrill(p, d))
  // A company point is a comparison: in Manager mode it opens nothing (docs/ROLES.md, 4.4).
  const opens = (d: TrailingPoint) => d.series === t.scopeLine || !ctx.access.lock
  const hiddenPoints = scope.filter((x) => x.rate == null).length
  return (
    <Figure
      id="hrbp-attrition-trailing"
      metric={ID.trailing12}
      uses={p.uses(FIGURE.attritionTrailing(kind, p.set.regretted))}
      title="Attrition, rolling 12 months"
      subtitle={`${KIND_WORD[kind]} exits in the 12 months to each month end ÷ average headcount${t.company ? ', this scope and the company' : ''}`}
      data={points}
      columns={[
        { key: 'date', label: 'Month end', format: 'date' },
        { key: 'series', label: 'Line', format: 'text' },
        {
          key: 'exits',
          label: `${KIND_WORD[kind]} exits, 12 months`,
          format: 'int',
          drill: (r) => (opens(r) ? open(r) : null),
        },
        { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
        {
          key: 'rate',
          label: `${KIND_WORD[kind]} attrition`,
          format: 'pct',
          drill: (r) => (opens(r) ? open(r) : null),
        },
      ]}
      definitions={p.defs(ID.trailing12, kind === 'voluntary' ? ID.voluntary : ID.regretted, ANONYMITY_ID)}
      note={`${last?.rate != null ? `${fmt(last.rate, 'pct')} in the 12 months to ${formatDate(ctx.asOf)}` : `As of ${formatDate(ctx.asOf)}`}${
        hiddenPoints ? ` · ${hiddenPoints} month ends under ${p.set.minGroup} people hidden` : ''
      }`}
      span={span}
      actions={
        withRegretted ? (
          <Segmented<TrailingKind>
            label="Exits"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'voluntary', label: 'Voluntary' },
              { value: 'regretted', label: 'Regretted' },
            ]}
          />
        ) : undefined
      }
      empty={
        !p.has.terminationDate
          ? `${NO_LEAVERS}.`
          : !ready
            ? kind === 'voluntary'
              ? 'Add the Termination type column to Employees to see this.'
              : 'Add the Regrettable column to Employees to see this.'
            : scope.some((x) => x.rate != null)
              ? null
              : `Fewer than ${p.set.minGroup} employees in this scope, so the rate is hidden to protect anonymity.`
      }
    >
      <Lines
        data={points}
        x="date"
        y="rate"
        series="series"
        seriesOrder={[t.scopeLine, COMPANY_LINE]}
        emphasize={t.company ? t.scopeLine : undefined}
        format="pct"
        zero
        ariaLabel={`${KIND_WORD[kind]} attrition over the trailing 12 months at each month end`}
        onSelect={(d) => {
          if (opens(d)) drill(open(d))
        }}
        selectable={(d) => opens(d) && d.records.length > 0}
      />
    </Figure>
  )
}

/* ───────── Workforce ───────── */

export function HeadcountByOrg({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const p = m.prep
  const h = useMemo(() => headcountByOrg(p), [p])
  const height = useChartHeight('lead')
  const first = h.totals[0]
  const last = h.totals.at(-1)
  const seg = (d: OrgMonthRow) => drillWhen(d.records.length > 0, () => orgMonthDrill(p, d))
  const month = (d: { date: string }) => () => employeesOnSpec(p, d.date)
  const change = first && last ? last.headcount - first.headcount : 0
  return (
    <Figure
      id="hrbp-headcount-by-org-trend"
      metric={ID.headcount}
      uses={p.uses(FIGURE.headcountByOrg(h.dim))}
      title={`Headcount by ${h.noun} over time`}
      subtitle={`Employees at each of the last 24 month ends, ${
        h.dim === 'leader' ? 'by the org of each direct report' : `by ${h.noun}`
      }, people who left counted where they last were`}
      data={h.rows}
      columns={[
        { key: 'date', label: 'Month end', format: 'date' },
        { key: 'group', label: h.noun.replace(/^./, (c) => c.toUpperCase()), format: 'text' },
        { key: 'headcount', label: 'Employees', format: 'int', drill: seg },
      ]}
      definitions={p.defs(ID.headcount, ID.share)}
      note={`${first && last ? `${fmt(first.headcount, 'int')} to ${fmt(last.headcount, 'int')} (${change >= 0 ? '+' : ''}${fmt(change, 'int')})` : ''}${
        h.folded ? ` · ${h.folded} smaller ${h.folded === 1 ? `${h.noun}` : `${h.noun}s`} in Other` : ''
      }${h.leader ? ` · ${h.leader}, who leads this scope, counted in Other` : ''} · ${p.set.countContractors ? 'contractors included' : 'contractors and interns excluded'} · as of ${formatDate(ctx.asOf)}`}
      empty={
        !p.has.terminationDate
          ? `${NO_HISTORY}.`
          : h.totals.some((x) => x.headcount > 0)
            ? null
            : 'No employees in this scope over the last 24 months.'
      }
      emptyHeight={height}
    >
      <Columns
        data={h.rows}
        x="month"
        y="headcount"
        series="group"
        stack
        seriesOrder={h.groups}
        xType="month"
        height={height}
        labels={false}
        ariaLabel={`Headcount at each month end by ${h.noun}`}
        onSelect={(d) => drill(month(d))}
        onSelectSegment={(d) => drill(seg(d))}
      />
    </Figure>
  )
}

/* ───────── Attrition ───────── */

export function CohortRetention({ m }: { m: HrbpModel }) {
  const p = m.prep
  const r = useMemo(() => cohortRetention(p), [p])
  const drawn = r.points.filter((x) => x.share != null)
  const open = (d: CohortPoint) => drillWhen(d.hires.length > 0, () => cohortDrill(p, r, d))
  const twelve = drawn.filter((x) => x.months === 12)
  const columns: Column<CohortPoint>[] = [
    { key: 'cohort', label: 'Hire cohort', format: 'text' },
    { key: 'checkpoint', label: 'After hire', format: 'text' },
    { key: 'observed', label: 'Hires counted', format: 'int' },
    { key: 'stayed', label: 'Still employed', format: 'int' },
    { key: 'share', label: 'Share still employed', format: 'pct', drill: open },
  ]
  return (
    <Figure
      id="hrbp-cohort-retention"
      metric={ID.cohortRetention}
      uses={p.uses(FIGURE.cohortRetention)}
      title="How long new hires stay"
      subtitle="Share of each yearly hire cohort still employed 3 to 24 months after their hire date"
      data={r.points}
      columns={columns}
      definitions={p.defs(ID.cohortRetention, ID.firstYear, ANONYMITY_ID)}
      note={`${twelve.map((x) => `${fmt(x.share, 'pct0')} of ${x.cohort.replace('Hired ', 'hires ')} stayed 12 months`).join(' · ')}${
        r.hidden.length ? ` · ${r.hidden.join(', ')} hidden: under ${p.set.minGroup} hires` : ''
      }`}
      span={7}
      empty={
        !p.has.terminationDate
          ? `${NO_LEAVERS}.`
          : drawn.length
            ? null
            : `Fewer than ${p.set.minGroup} hires in each cohort, so the shares are hidden to protect anonymity.`
      }
    >
      <Columns
        data={drawn}
        x="checkpoint"
        y="share"
        series="cohort"
        seriesOrder={r.cohorts.map((c) => c.label)}
        xOrder={CHECKPOINTS.map(checkpointLabel)}
        format="pct0"
        yDomain={[0, 1]}
        labels={false}
        height={240}
        ariaLabel="Share of each hire cohort still employed after their hire date"
        onSelect={(d) => drill(open(d))}
        onSelectSegment={(d) => drill(open(d))}
        selectable={(d) => d.hires.length > 0}
      />
    </Figure>
  )
}

/* ───────── Movement ───────── */

export function ManagerChanges({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const p = m.prep
  const mc = useMemo(() => managerChanges(p), [p])
  const open = (d: ManagerChangeRow) => drillWhen(d.people.length > 0, () => managerChangeDrill(p, mc, d))
  const total = mc.rows.reduce((a, r) => a + r.changed, 0)
  const employees = mc.rows.reduce((a, r) => a + r.employees, 0)
  return (
    <Figure
      id="hrbp-manager-changes"
      metric={ID.managerChange}
      uses={p.uses(FIGURE.managerChanges(mc.dim))}
      title="New manager in the last 12 months"
      subtitle={`Share of employees today with at least one change of manager since ${formatDate(mc.window.start)}, by ${mc.noun}`}
      data={mc.rows}
      columns={[
        { key: 'group', label: mc.noun.replace(/^./, (c) => c.toUpperCase()), format: 'text' },
        { key: 'employees', label: 'Employees', format: 'int' },
        { key: 'changed', label: 'With a new manager', format: 'int', drill: open },
        { key: 'share', label: 'Share', format: 'pct', drill: open },
      ]}
      definitions={p.defs(ID.managerChange, ANONYMITY_ID)}
      note={`${fmt(total, 'int')} of ${fmt(employees, 'int')} employees · ${mc.noun}s under ${p.set.minGroup} folded into Other${
        mc.leader ? ` · ${mc.leader}, who leads this scope, counted in Other` : ''
      } · as of ${formatDate(ctx.asOf)}`}
      empty={mc.rows.length ? null : 'No employees in this scope.'}
    >
      <BarList
        data={mc.rows}
        label="group"
        value="share"
        format="pct"
        sort="none"
        ref={
          mc.company != null ? { value: mc.company, label: `Company ${fmt(mc.company, 'pct0')}` } : undefined
        }
        tone={(d) => (d.other ? 'deemph' : 'default')}
        secondary={(d) => `n = ${fmt(d.employees, 'int')}`}
        onSelect={(d) => drill(open(d))}
        selectable={(d) => d.people.length > 0}
      />
    </Figure>
  )
}
