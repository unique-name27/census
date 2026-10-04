import { BarList, Columns, Figure, HBars } from '@/charts'
import { EmptyState, KpiStrip, Section } from '@/components'
import type { Kpi } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { MIN_GROUP } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { HrbpModel } from '../engine'
import { count, isMaterialGap } from '../engine/base'
import { SINCE_BANDS } from '../engine/movement'
import { DEF } from './defs'

export function Movement({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const mv = m.movement
  const p = m.prep
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
      suppressed: mv.promotions.avgHeadcount > 0 && mv.promotions.avgHeadcount < MIN_GROUP,
      definition: DEF.promotionRate.text,
    },
    {
      id: 'moves',
      label: 'Transfers and lateral moves',
      value: mv.transfers + mv.lateral,
      format: 'int',
      note: `${count(mv.transfers, 'transfer', 'transfers')}, ${count(mv.lateral, 'lateral move', 'lateral moves')}`,
      definition: 'Transfer and Lateral move events in the period.',
    },
    {
      id: 'mobility',
      label: 'Internal mobility',
      value: mv.mobility.rate,
      format: 'pct',
      note: `${count(mv.mobility.movers, 'person', 'people')} moved at least once`,
      suppressed: mv.mobility.rate == null && mv.promotions.avgHeadcount > 0,
      definition: DEF.mobility.text,
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
            { key: 'promotions', label: 'Promotions', format: 'int' },
            { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
            { key: 'rate', label: 'Promotion rate', format: 'pct' },
          ]}
          definitions={[DEF.promotionRate, DEF.avgHeadcount]}
          note={`${qPromos} promotions in 8 quarters · as of ${asOf}`}
          span={6}
          empty={qPromos ? null : 'No promotions in the last 8 quarters.'}
        >
          <Columns data={quarters} x="quarter" y="promotions" xOrder={quarters.map((q) => q.quarter)} />
        </Figure>
        <Figure
          id="hrbp-promotion-level"
          title="Promotion rate by level"
          subtitle={`Promotions from each level ÷ average headcount at that level, ${window}`}
          data={mv.byLevel}
          columns={[
            { key: 'level', label: 'Level promoted from', format: 'text' },
            { key: 'promotions', label: 'Promotions', format: 'int' },
            { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
            { key: 'rate', label: 'Promotion rate', format: 'pct' },
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
            { key: 'moves', label: 'Moves', format: 'int' },
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
          />
        </Figure>
        <Figure
          id="hrbp-time-since-promotion"
          title="Time since last promotion"
          subtitle={`Employees on ${asOf} by years since their last promotion`}
          data={mv.sincePromotion}
          columns={[
            { key: 'band', label: 'Since last promotion', format: 'text' },
            { key: 'people', label: 'Employees', format: 'int' },
            { key: 'share', label: 'Share', format: 'pct' },
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
          <Columns data={mv.sincePromotion} x="band" y="people" xOrder={[...SINCE_BANDS]} height={240} />
        </Figure>
        <Figure
          id="hrbp-internal-moves"
          title="Internal moves"
          subtitle={`Promotions, transfers, lateral moves and demotions, ${window}, newest first`}
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
          table={{ search: 'Search moves', maxRows: 12 }}
          empty={mv.moves.length ? null : 'No internal moves in this period.'}
        />
      </Section>
    </>
  )
}
