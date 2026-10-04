/**
 * KPI tiles of the Movement and Org design tabs, built in the engine like the Overview strip so
 * each carries its lineage (`uses`) and opens the records behind it.
 */
import type { Kpi } from '@/components/types'
import { MIN_GROUP } from '@/data/schema'
import { count, isMaterialGap, type Prep } from './base'
import { movementTileSpec, orgTileSpec } from './buckets'
import { DEF } from './defs'
import { MOVES, ORG, PROMOTION_RATE } from './lineage'
import type { MovementModel } from './movement'
import type { OrgModel } from './org'

type MovementTile = Parameters<typeof movementTileSpec>[2]
type OrgTile = Parameters<typeof orgTileSpec>[2]

export function movementKpis(p: Prep, mv: MovementModel): Kpi[] {
  const { ctx } = p
  const window = ctx.window.label
  const ref = ctx.isCompany ? mv.priorPromotions.rate : mv.companyPromotions.rate
  const delta = mv.promotions.rate != null && ref != null ? mv.promotions.rate - ref : null
  const promoSuppressed = mv.promotions.avgHeadcount > 0 && mv.promotions.avgHeadcount < MIN_GROUP
  const mobilitySuppressed = mv.mobility.rate == null && mv.promotions.avgHeadcount > 0
  const tile = (t: MovementTile, has: boolean) => (has ? () => movementTileSpec(p, mv, t) : undefined)
  const moves = p.uses(MOVES)
  const rate = p.uses(PROMOTION_RATE)

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
      uses: moves,
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
      uses: rate,
    },
    {
      id: 'moves',
      label: 'Transfers and lateral moves',
      value: mv.transfers + mv.lateral,
      format: 'int',
      note: `${count(mv.transfers, 'transfer', 'transfers')}, ${count(mv.lateral, 'lateral move', 'lateral moves')}`,
      definition: 'Transfer and Lateral move events in the period.',
      drill: tile('moves', mv.transfers + mv.lateral > 0),
      uses: moves,
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
      uses: rate,
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
      uses: moves,
    })
  }
  return kpis
}

export function orgKpis(p: Prep, org: OrgModel): Kpi[] {
  const hasManagers = org.managers.length > 0
  const tile = (t: OrgTile, has: boolean) => (has ? () => orgTileSpec(p, org, t) : undefined)
  const uses = p.uses(ORG)
  return [
    {
      id: 'managers',
      label: 'Managers',
      value: org.managers.length,
      format: 'int',
      note: `${org.activeWorkers.toLocaleString('en-US')} active workers`,
      definition: 'Active people in scope with at least one active direct report.',
      drill: tile('managers', hasManagers),
      uses,
    },
    {
      id: 'mean-span',
      label: 'Mean span',
      value: org.meanSpan,
      format: 'num1',
      note: 'Direct reports per manager',
      definition: DEF.span.text,
      drill: tile('meanSpan', hasManagers),
      uses,
    },
    {
      id: 'median-span',
      label: 'Median span',
      value: org.medianSpan,
      format: 'num1',
      note:
        org.medianSpan != null
          ? `Half of managers have ${Math.ceil(org.medianSpan)} or more direct reports`
          : 'Direct reports per manager',
      definition: DEF.span.text,
      drill: tile('medianSpan', hasManagers),
      uses,
    },
    {
      id: 'manager-ratio',
      label: 'Manager ratio',
      value: org.managerRatio,
      format: 'num1',
      note: 'Individual contributors per manager',
      definition: 'Active workers who manage nobody, divided by the number of managers.',
      drill: tile('managerRatio', org.managerRatio != null && org.individuals.length > 0),
      uses,
    },
    {
      id: 'layers',
      label: 'Layers',
      value: org.layers,
      format: 'int',
      note: 'From the top of this scope',
      definition: DEF.layers.text,
      drill: tile('layers', org.layers != null),
      uses,
    },
  ]
}
