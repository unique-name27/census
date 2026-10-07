import { BarList, Columns, Figure, HBars } from '@/charts'
import { EmptyState, KpiStrip, Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { HrbpModel } from '../engine'
import { count } from '../engine/base'
import { deptMoveSpec, promotionLevelSpec, promotionQuarterSpec, sinceSpec } from '../engine/buckets'
import { FIGURE } from '../engine/lineage'
import { type DeptMoveRow, SINCE_BANDS } from '../engine/movement'
import { ANONYMITY_ID, ID } from './defs'
import { drillWhen } from './drill'
import { ManagerChanges } from './Trends'

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

  const quarters = mv.byQuarter
  const qPromos = quarters.reduce((s, q) => s + q.promotions, 0)
  const companyRate = mv.companyPromotions.rate
  const deptTotal = mv.byDepartment.reduce((s, r) => s + r.moves, 0)
  const active = mv.sincePromotion.reduce((s, r) => s + r.people, 0)

  return (
    <>
      <KpiStrip id="hrbp-movement-kpis" title="Movement figures" kpis={m.movementKpis} />

      <Section
        title="Promotions"
        dek="How many people were promoted each quarter, and at which levels promotions happen."
      >
        <Figure
          id="hrbp-promotions-quarter"
          metric={ID.promotions}
          uses={p.uses(FIGURE.promotionsByQuarter)}
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
          definitions={p.defs(ID.promotions, ID.promotionRate, ID.avgHeadcount)}
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
          metric={ID.promotionRate}
          uses={p.uses(FIGURE.promotionsByLevel)}
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
            ...p.defs(ID.promotionRate),
            {
              term: 'Level',
              text: 'The level a person was promoted from, over the average number of employees at that level (rebuilt from Job changes for each month end).',
            },
            ...p.defs(ANONYMITY_ID),
          ]}
          note={`Groups under ${p.set.minGroup} hidden${companyRate != null ? ` · company rate ${fmt(companyRate, 'pct')}` : ''}`}
          span={6}
          empty={
            mv.byLevel.some((r) => r.rate != null)
              ? null
              : `No level has ${p.set.minGroup} or more employees in this period.`
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
          metric={ID.moves}
          uses={p.uses(FIGURE.movesByDepartment)}
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
          definitions={p.defs(ID.moves)}
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
        {/* Two short charts stacked, so this column ends level with the moves beside it. */}
        <div className="col-span-full flex min-w-0 flex-col gap-4 lg:col-span-5">
          <Figure
            id="hrbp-time-since-promotion"
            metric={ID.sincePromotion}
            uses={p.uses(FIGURE.timeSincePromotion)}
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
            definitions={p.defs(ID.sincePromotion)}
            note={`${active.toLocaleString('en-US')} employees · as of ${asOf}`}
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
          <ManagerChanges m={m} />
        </div>
        <Figure
          id="hrbp-internal-moves"
          metric={ID.mobility}
          uses={p.uses(FIGURE.internalMoves)}
          title="Internal moves"
          subtitle={`Promotions, transfers, lateral moves and demotions, ${window}, newest first.`}
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
          definitions={p.defs(ID.moves, ID.promotionRate, ID.mobility)}
          note={`${mv.moves.length} moves · as of ${asOf}`}
          tableOnly
          table={{ search: 'Search moves', maxRows: 12, onRowClick: (r) => openPerson(r.employeeId) }}
          empty={mv.moves.length ? null : 'No internal moves in this period.'}
        />
      </Section>
    </>
  )
}
