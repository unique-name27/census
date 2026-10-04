import { BarList, Columns, Figure, HBars } from '@/charts'
import { EmptyState, KpiStrip, Section } from '@/components'
import type { Kpi } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { MIN_GROUP } from '@/data/schema'
import { drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { HrbpModel } from '../engine'
import { count, isMaterialGap } from '../engine/base'
import {
  deptMoveSpec,
  movementTileSpec,
  promotionLevelSpec,
  promotionQuarterSpec,
  sinceSpec,
} from '../engine/buckets'
import { type DeptMoveRow, SINCE_BANDS } from '../engine/movement'
import { DEF } from './defs'
import { drillWhen } from './drill'

export function Movement({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const mv = m.movement
  const p = m.prep
  const moveDrill = (rows: readonly DeptMoveRow[]) => drill(() => deptMoveSpec(p, rows))
  const asOf = formatDate(ctx.asOf)
  const window = ctx.window.label

  if (!p.has.jobChanges) {
    return (
      <EmptyState
        title="Upload Job changes to see promotions and moves"
        body="Promotions, transfers, lateral moves and time since last promotion all come from the Job changes dataset. Add it in the Data room."
      />
    )
  }

  const ref = ctx.isCompany ? mv.priorPromotions.rate : mv.companyPromotions.rate
  const delta = mv.promotions.rate != null && ref != null ? mv.promotions.rate - ref : null
  const promoSuppressed = mv.promotions.avgHeadcount > 0 && mv.promotions.avgHeadcount < MIN_GROUP
  const mobilitySuppressed = mv.mobility.rate == null && mv.promotions.avgHeadcount > 0
  const tile = (t: Parameters<typeof movementTileSpec>[2], has: boolean) =>
    drillWhen(has, () => movementTileSpec(p, mv, t))
  const kpis: Kpi[] = [
    {
      id: 'promotions',
      label: 'Promotions',
      value: mv.promotions.promotions,
      format: 'int',
      delta: mv.promotions.promotions - mv.priorPromotions.promotions,
      deltaLabel: mv.priorLabel,
      goodDirection: null,
      note: window,
      definition: 'Promotion events in the period. A person promoted twice counts twice.',
      drill: tile('promotions', mv.records.promotions.length > 0),
    },
    {
      id: 'promotion-rate',
      label: 'Promotion rate',
      value: mv.promotions.rate,
      format: 'pct',
      delta,
      deltaLabel: ctx.isCompany ? mv.priorLabel : 'vs company',
      goodDirection: null,
      deltaMaterial: isMaterialGap(delta, ref),
      note: `Over an average headcount of ${Math.round(mv.promotions.avgHeadcount).toLocaleString('en-US')}`,
      suppressed: promoSuppressed,
      definition: DEF.promotionRate.text,
      drill: tile('promotionRate', !promoSuppressed && mv.promotions.rate != null),
    },
    {
      id: 'moves',
      label: 'Transfers and lateral moves',
      value: mv.transfers + mv.lateral,
      format: 'int',
      note: `${count(mv.transfers, 'transfer', 'transfers')}, ${count(mv.lateral, 'lateral move', 'lateral moves')}`,
      definition: 'Transfer and Lateral move events in the period.',
      drill: tile('moves', mv.transfers + mv.lateral > 0),
    },
    {
      id: 'mobility',
      label: 'Internal mobility',
      value: mv.mobility.rate,
      format: 'pct',
      note: `${count(mv.mobility.movers, 'person', 'people')} moved at least once`,
      suppressed: mobilitySuppressed,
      definition: DEF.mobility.text,
      drill: tile('mobility', !mobilitySuppressed && mv.mobility.rate != null),
    },
  ]
  if (mv.demotions) {
    kpis.push({
      id: 'demotions',
      label: 'Demotions',
      value: mv.demotions,
      format: 'int',
      note: window,
      definition: 'Demotion events in the period.',
      drill: tile('demotions', true),
    })
  }

  const quarters = mv.byQuarter
  const qPromos = quarters.reduce((s, q) => s + q.promotions, 0)
  const companyRate = mv.companyPromotions.rate
  const deptTotal = mv.byDepartment.reduce((s, r) => s + r.moves, 0)
  const active = mv.sincePromotion.reduce((s, r) => s + r.people, 0)

  return (
    <>
      <KpiStrip id="hrbp-movement-kpis" title="Movement figures" kpis={kpis} />

      <Section
        title="Promotions"
        dek="How many people were promoted each quarter, and at which levels promotions happen."
      >
        <Figure
          id="hrbp-promotions-quarter"
          title="Promotions by quarter"
          subtitle={`Promotion events per quarter, ${quarters.length ? formatDate(quarters[0].start) : ''} to ${asOf}`}
          data={quarters}
          columns={[
            { key: 'quarter', label: 'Quarter', format: 'text' },
            { key: 'start', label: 'From', format: 'date' },
            { key: 'end', label: 'To', format: 'date' },
            {
              key: 'promotions',
              label: 'Promotions',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => promotionQuarterSpec(p, r)),
            },
            { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
            {
              key: 'rate',
              label: 'Promotion rate',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => promotionQuarterSpec(p, r)),
            },
          ]}
          definitions={[DEF.promotionRate, DEF.avgHeadcount]}
          note={`${qPromos} promotions in 8 quarters · as of ${asOf}`}
          span={6}
          empty={qPromos ? null : 'No promotions in the last 8 quarters.'}
        >
          <Columns
            data={quarters}
            x="quarter"
            y="promotions"
            xOrder={quarters.map((q) => q.quarter)}
            onSelect={(d) => drill(() => promotionQuarterSpec(p, d))}
          />
        </Figure>
        <Figure
          id="hrbp-promotion-level"
          title="Promotion rate by level"
          subtitle={`Promotions from each level ÷ average headcount at that level, ${window}`}
          data={mv.byLevel}
          columns={[
            { key: 'level', label: 'Level promoted from', format: 'text' },
            {
              key: 'promotions',
              label: 'Promotions',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => promotionLevelSpec(p, r)),
            },
            { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
            {
              key: 'rate',
              label: 'Promotion rate',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => promotionLevelSpec(p, r)),
            },
          ]}
          definitions={[
            DEF.promotionRate,
            {
              term: 'Level',
              text: 'The level a person was promoted from, over the average number of employees at that level (rebuilt from Job changes for each month end).',
            },
            DEF.suppressed,
          ]}
          note={`Groups under ${MIN_GROUP} hidden${companyRate != null ? ` · company rate ${fmt(companyRate, 'pct')}` : ''}`}
          span={6}
          empty={
            mv.byLevel.some((r) => r.rate != null) ? null : 'No level has 5 or more employees in this period.'
          }
        >
          <BarList
            data={mv.byLevel}
            label="level"
            value="rate"
            format="pct"
            sort="none"
            secondary={(d) => count(d.promotions, 'promotion', 'promotions')}
            ref={
              companyRate != null
                ? { value: companyRate, label: `Company ${fmt(companyRate, 'pct')}` }
                : undefined
            }
            onSelect={(d) => drill(() => promotionLevelSpec(p, d))}
          />
        </Figure>
      </Section>

      <Section
        title="Moves and time in role"
        dek={`Transfers and lateral moves ${window}, and how long current employees have gone since their last promotion.`}
      >
        <Figure
          id="hrbp-moves-department"
          title="Transfers and lateral moves by department"
          subtitle={`Moves into each department, ${window}`}
          data={mv.byDepartment}
          columns={[
            { key: 'department', label: 'Department moved into', format: 'text' },
            { key: 'type', label: 'Move type', format: 'text' },
            {
              key: 'moves',
              label: 'Moves',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => deptMoveSpec(p, [r])),
            },
          ]}
          definitions={[
            {
              term: 'Transfer',
              text: 'A move to a different department or manager line, recorded in Job changes.',
            },
            { term: 'Lateral move', text: 'A change of role at the same level.' },
          ]}
          note={`${deptTotal} moves · as of ${asOf}`}
          span={7}
          empty={deptTotal ? null : 'No transfers or lateral moves in this period.'}
        >
          <HBars
            data={mv.byDepartment}
            y="department"
            x="moves"
            series="type"
            stack
            seriesOrder={['Transfer', 'Lateral move']}
            onSelect={(d) => moveDrill(mv.byDepartment.filter((r) => r.department === d.department))}
            onSelectSegment={(d) => moveDrill([d])}
          />
        </Figure>
        <Figure
          id="hrbp-time-since-promotion"
          title="Time since last promotion"
          subtitle={`Employees on ${asOf} by years since their last promotion`}
          data={mv.sincePromotion}
          columns={[
            { key: 'band', label: 'Since last promotion', format: 'text' },
            {
              key: 'people',
              label: 'Employees',
              format: 'int',
              drill: (r) => drillWhen(r.records.length > 0, () => sinceSpec(p, r)),
            },
            {
              key: 'share',
              label: 'Share',
              format: 'pct',
              drill: (r) => drillWhen(r.records.length > 0, () => sinceSpec(p, r)),
            },
          ]}
          definitions={[
            {
              term: 'Never promoted',
              text: 'No Promotion event on record since hire, including people hired recently.',
            },
          ]}
          note={`${active.toLocaleString('en-US')} employees · as of ${asOf}`}
          span={5}
          empty={active ? null : 'No active employees in this scope.'}
        >
          <Columns
            data={mv.sincePromotion}
            x="band"
            y="people"
            xOrder={[...SINCE_BANDS]}
            height={240}
            onSelect={(d) => drill(() => sinceSpec(p, d))}
          />
        </Figure>
        <Figure
          id="hrbp-internal-moves"
          title="Internal moves"
          subtitle={`Promotions, transfers, lateral moves and demotions, ${window}, newest first. Select a row to open the person.`}
          data={mv.moves}
          columns={[
            { key: 'date', label: 'Effective', format: 'date' },
            { key: 'employeeId', label: 'ID', format: 'text' },
            { key: 'name', label: 'Name', format: 'text' },
            { key: 'type', label: 'Move', format: 'text' },
            { key: 'fromLevel', label: 'From level', format: 'text' },
            { key: 'toLevel', label: 'To level', format: 'text' },
            { key: 'fromDepartment', label: 'From department', format: 'text' },
            { key: 'toDepartment', label: 'To department', format: 'text' },
          ]}
          definitions={[DEF.promotionRate, DEF.mobility]}
          note={`${mv.moves.length} moves · as of ${asOf}`}
          tableOnly
          table={{ search: 'Search moves', maxRows: 12, onRowClick: (r) => openPerson(r.employeeId) }}
          empty={mv.moves.length ? null : 'No internal moves in this period.'}
        />
      </Section>
    </>
  )
}
