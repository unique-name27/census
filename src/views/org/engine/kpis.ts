/**
 * The key figure tiles for the org on screen: people, managers, median span, layers, open roles
 * (only with the Open roles overlay on) and structure flags. Each tile carries the records behind it (built only when opened) and the fields
 * it is computed from, for its tier.
 */
import type { Kpi } from '@/components/types'
import type { Requisition } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import { type DrillScope, type KeyFigureDrills, keyFigureDrills } from './drill'
import { tagKpis } from './drillUses'
import type { OrgKeyFigures } from './figures'
import type { Flag } from './flags'
import { keyFigureUses, type OrgLineage } from './lineage'
import type { OrgTree } from './tree'

export interface OrgKpiInput {
  tree: OrgTree
  rootId: string
  key: OrgKeyFigures
  scope: DrillScope
  flags: ReadonlyMap<string, readonly Flag[]>
  reqRecords: ReadonlyMap<string, Requisition>
  lineage: OrgLineage
  /** The business unit, department, location or level filters are set (they count only matches). */
  dims: boolean
  /**
   * The Open roles overlay is on. Open requisitions are not part of the org chart by default (the
   * team chose to leave them off), so their tile shows only with the overlay.
   */
  openRoles: boolean
}

export function orgKpis(p: OrgKpiInput): Kpi[] {
  const { key } = p
  const uses = keyFigureUses(p.lineage)
  let drills: KeyFigureDrills | null = null
  const kd = () => {
    drills ??= keyFigureDrills(p.tree, p.rootId, key, p.scope, p.flags, p.reqRecords)
    return drills
  }
  /** A zero has nothing behind it: no drill, so no underline that opens nothing. */
  const when = (n: number, which: keyof KeyFigureDrills): DrillSource | undefined =>
    n > 0 ? () => kd()[which] : undefined
  const tiles: Kpi[] = [
    {
      id: 'org-people',
      label: p.dims ? 'People matching' : 'People in this org',
      value: key.people.length,
      format: 'int',
      note: p.dims ? 'Matching the filters · every worker type' : 'Including the leader · every worker type',
      drill: when(key.people.length, 'people'),
      uses: uses.people,
    },
    {
      id: 'org-managers',
      label: 'People managers',
      value: key.managers.length,
      format: 'int',
      drill: when(key.managers.length, 'managers'),
      uses: uses.managers,
    },
    {
      id: 'org-span',
      label: 'Median span',
      value: key.medianSpan,
      format: 'num1',
      note: 'Direct reports per manager',
      definition: 'Median number of direct reports among people with at least one, all worker types.',
      drill: when(key.managers.length, 'medianSpan'),
      uses: uses.medianSpan,
    },
    {
      id: 'org-layers',
      label: 'Layers',
      value: key.layers,
      format: 'int',
      definition: 'Levels from the top of this org to its deepest report, counting the top as 1.',
      drill: when(key.layers, 'layers'),
      uses: uses.layers,
    },
    {
      id: 'org-open-roles',
      label: 'Open roles',
      value: key.openReqIds.length,
      format: 'int',
      note: 'Open requisitions',
      drill: when(key.openReqIds.length, 'openRoles'),
      uses: uses.openRoles,
    },
    {
      id: 'org-flags',
      label: 'Structure flags',
      value: key.flagged.length,
      format: 'int',
      note: 'People with a span, chain or new-manager flag',
      definition: p.lineage.jobChanges
        ? 'People with a wide span (12+), a span of 1, a single-report chain, or under 12 months as a manager with 8 or more direct reports. Managing since is the move to a manager level in Job changes, otherwise the hire date.'
        : 'People with a wide span (12+), a span of 1, a single-report chain, or under 12 months as a manager with 8 or more direct reports. Managing since is the hire date here, because Job changes is not loaded or not at the data standard.',
      drill: when(key.flagged.length, 'flagged'),
      uses: uses.flagged,
    },
  ]
  return tagKpis(p.openRoles ? tiles : tiles.filter((k) => k.id !== 'org-open-roles'))
}
