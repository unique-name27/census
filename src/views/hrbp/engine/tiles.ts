/**
 * KPI tiles of the Movement and Org design tabs, built in the engine like the Overview strip so
 * each carries its lineage (`uses`), its metric dictionary entry (and its definition from there)
 * and opens the records behind it.
 */
import type { Kpi } from '@/components/types'
import { ID } from '../metrics'
import { activeWorkers, count, type Prep } from './base'
import { movementTileSpec, orgTileSpec } from './buckets'
import { changesSpec, managersSpec, scopePart, titled, workersSpec } from './drill'
import { tagKpis } from './drillUses'
import { promotionsComparisonSpec } from './kpis'
import { MOVES, ORG, PROMOTION_RATE } from './lineage'
import { type MovementModel, promotionComparison } from './movement'
import type { OrgModel } from './org'

type MovementTile = Parameters<typeof movementTileSpec>[2]
type OrgTile = Parameters<typeof orgTileSpec>[2]

export function movementKpis(p: Prep, mv: MovementModel): Kpi[] {
  const { ctx } = p
  const window = ctx.window.label
  const ref = ctx.isCompany ? mv.priorPromotions.rate : mv.companyPromotions.rate
  const delta = mv.promotions.rate != null && ref != null ? mv.promotions.rate - ref : null
  const promoSuppressed = mv.promotions.avgHeadcount > 0 && mv.promotions.avgHeadcount < p.set.minGroup
  const mobilitySuppressed = mv.mobility.rate == null && mv.promotions.avgHeadcount > 0
  const tile = (t: MovementTile, has: boolean) => (has ? () => movementTileSpec(p, mv, t) : undefined)
  const moves = p.uses(MOVES)
  const rate = p.uses(PROMOTION_RATE)

  const kpis: Kpi[] = [
    {
      id: 'promotions',
      metricId: ID.promotions,
      label: 'Promotions',
      value: mv.promotions.promotions,
      format: 'int',
      delta: mv.promotions.promotions - mv.priorPromotions.promotions,
      deltaLabel: mv.priorLabel,
      goodDirection: null,
      note: window,
      definition: p.text(ID.promotions),
      drill: tile('promotions', mv.records.promotions.length > 0),
      // The comparison window's promotions in this scope (always the scope's own history).
      deltaDrill: mv.priorPromotions.promotions
        ? () => {
            const { window: w, part } = promotionComparison(p)
            return changesSpec(
              p,
              titled('Promotions', scopePart(p), part),
              p.changes.filter(
                (c) => c.changeType === 'Promotion' && c.effectiveDate >= w.start && c.effectiveDate <= w.end,
              ),
              { when: w.label },
            )
          }
        : undefined,
      uses: moves,
    },
    {
      id: 'promotion-rate',
      metricId: ID.promotionRate,
      label: 'Promotion rate',
      value: mv.promotions.rate,
      format: 'pct',
      delta,
      deltaLabel: ctx.isCompany ? mv.priorLabel : 'vs company',
      goodDirection: null,
      deltaMaterial: p.material(delta, ref),
      note: `Over an average headcount of ${Math.round(mv.promotions.avgHeadcount).toLocaleString('en-US')}`,
      suppressed: promoSuppressed,
      definition: p.text(ID.promotionRate),
      drill: tile('promotionRate', !promoSuppressed && mv.promotions.rate != null),
      deltaDrill: promoSuppressed || delta == null ? undefined : () => promotionsComparisonSpec(p, mv),
      uses: rate,
    },
    {
      id: 'moves',
      metricId: ID.moves,
      label: 'Transfers and lateral moves',
      value: mv.transfers + mv.lateral,
      format: 'int',
      note: `${count(mv.transfers, 'transfer', 'transfers')}, ${count(mv.lateral, 'lateral move', 'lateral moves')}`,
      definition: p.text(ID.moves),
      drill: tile('moves', mv.transfers + mv.lateral > 0),
      // "90 transfers, 32 lateral moves": the same events, split in the panel's note.
      noteDrill: tile('moves', mv.transfers + mv.lateral > 0),
      uses: moves,
    },
    {
      id: 'mobility',
      metricId: ID.mobility,
      label: 'Internal mobility',
      value: mv.mobility.rate,
      format: 'pct',
      note: `${count(mv.mobility.movers, 'person', 'people')} moved at least once`,
      suppressed: mobilitySuppressed,
      definition: p.text(ID.mobility),
      drill: tile('mobility', !mobilitySuppressed && mv.mobility.rate != null),
      // "256 people moved at least once": those people.
      noteDrill: tile('mobility', !mobilitySuppressed && mv.mobility.rate != null),
      uses: rate,
    },
  ]
  if (mv.demotions) {
    kpis.push({
      id: 'demotions',
      metricId: ID.demotions,
      label: 'Demotions',
      value: mv.demotions,
      format: 'int',
      note: window,
      definition: p.text(ID.demotions),
      drill: tile('demotions', true),
      uses: moves,
    })
  }
  return tagKpis(kpis)
}

export function orgKpis(p: Prep, org: OrgModel): Kpi[] {
  const hasManagers = org.managers.length > 0
  const tile = (t: OrgTile, has: boolean) => (has ? () => orgTileSpec(p, org, t) : undefined)
  const uses = p.uses(ORG)
  const half = org.medianSpan == null ? null : Math.ceil(org.medianSpan)
  return tagKpis([
    {
      id: 'managers',
      metricId: ID.managers,
      label: 'Managers',
      value: org.managers.length,
      format: 'int',
      note: `${org.activeWorkers.toLocaleString('en-US')} active workers`,
      definition: p.text(ID.managers),
      drill: tile('managers', hasManagers),
      // "1,560 active workers": everyone active in scope, every worker type.
      noteDrill: org.activeWorkers
        ? () =>
            workersSpec(
              p,
              titled('Active workers', scopePart(p)),
              activeWorkers(p.people, p.asOf),
              'Everyone active on the as-of date, every worker type.',
            )
        : undefined,
      uses,
    },
    {
      id: 'mean-span',
      metricId: ID.meanSpan,
      label: 'Mean span',
      value: org.meanSpan,
      format: 'num1',
      note: 'Direct reports per manager',
      definition: p.text(ID.meanSpan),
      drill: tile('meanSpan', hasManagers),
      uses,
    },
    {
      id: 'median-span',
      metricId: ID.medianSpan,
      label: 'Median span',
      value: org.medianSpan,
      format: 'num1',
      note:
        org.medianSpan != null
          ? `Half of managers have ${Math.ceil(org.medianSpan)} or more direct reports`
          : 'Direct reports per manager',
      definition: p.text(ID.medianSpan),
      drill: tile('medianSpan', hasManagers),
      // "Half of managers have 6 or more direct reports": those managers.
      noteDrill:
        half == null
          ? undefined
          : () =>
              managersSpec(
                p,
                titled(`Managers with ${half} or more direct reports`, scopePart(p)),
                org.managers.filter((m) => m.directs >= half),
                {
                  note: `${count(org.managers.filter((m) => m.directs >= half).length, 'manager', 'managers')} of ${count(org.managers.length, 'manager', 'managers')}.`,
                },
              ),
      uses,
    },
    {
      id: 'manager-ratio',
      metricId: ID.managerRatio,
      label: 'Manager ratio',
      value: org.managerRatio,
      format: 'num1',
      note: 'Individual contributors per manager',
      definition: p.text(ID.managerRatio),
      drill: tile('managerRatio', org.managerRatio != null && org.individuals.length > 0),
      uses,
    },
    {
      id: 'layers',
      metricId: ID.layers,
      label: 'Layers',
      value: org.layers,
      format: 'int',
      note: 'From the top of this scope',
      definition: p.text(ID.layers),
      drill: tile('layers', org.layers != null),
      uses,
    },
  ])
}
