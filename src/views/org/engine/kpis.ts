/**
 * The key figure tiles for the org on screen: people, managers, median span, layers, open roles
 * (only with the Open roles overlay on) and structure flags. Each tile carries the records behind
 * it (built only when opened), the fields it is computed from (for its tier), and its metric
 * dictionary entry: the info popover reads the registry's definition, with your wording.
 */
import type { Kpi } from '@/components/types'
import type { Requisition } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import { plural } from '@/lib/format'
import { defaultMetrics } from '@/metrics/api'
import type { MetricsApi } from '@/metrics/types'
import { ORG_METRIC } from '../metrics'
import { defText, flaggedDefinition } from './defs'
import { type DrillScope, type KeyFigureDrills, keyFigureDrills } from './drill'
import { tagKpis } from './drillUses'
import type { OrgKeyFigures } from './figures'
import type { Flag } from './flags'
import { keyFigureUses, type OrgLineage } from './lineage'
import { orgRules } from './rules'
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
  /** The metric dictionary (`ctx.metrics`): wording and settings. The defaults without it. */
  metrics?: MetricsApi
}

export function orgKpis(p: OrgKpiInput): Kpi[] {
  const { key } = p
  const m = p.metrics ?? defaultMetrics()
  const rules = orgRules(m)
  const uses = keyFigureUses(p.lineage)
  let drills: KeyFigureDrills | null = null
  const kd = () => {
    drills ??= keyFigureDrills(p.tree, p.rootId, key, p.scope, p.flags, p.reqRecords, rules)
    return drills
  }
  /** A zero has nothing behind it: no drill, so no underline that opens nothing. */
  const when = (n: number, which: keyof KeyFigureDrills): DrillSource | undefined =>
    n > 0 ? () => kd()[which] : undefined
  const tiles: Kpi[] = [
    {
      id: 'org-people',
      metricId: ORG_METRIC.people,
      label: p.dims ? 'People matching' : 'People in this org',
      value: key.people.length,
      format: 'int',
      note: p.dims ? 'Matching the filters · every worker type' : 'Including the leader · every worker type',
      definition: defText(m, ORG_METRIC.people),
      drill: when(key.people.length, 'people'),
      uses: uses.people,
    },
    {
      id: 'org-managers',
      metricId: ORG_METRIC.managers,
      label: 'People managers',
      value: key.managers.length,
      format: 'int',
      definition: defText(m, ORG_METRIC.managers),
      drill: when(key.managers.length, 'managers'),
      uses: uses.managers,
    },
    {
      id: 'org-span',
      metricId: ORG_METRIC.medianSpan,
      label: 'Median span',
      value: key.medianSpan,
      format: 'num1',
      note: 'Direct reports per manager',
      definition: defText(m, ORG_METRIC.medianSpan),
      drill: when(key.managers.length, 'medianSpan'),
      uses: uses.medianSpan,
    },
    {
      id: 'org-layers',
      metricId: ORG_METRIC.layers,
      label: 'Layers',
      value: key.layers,
      format: 'int',
      // Only an org deeper than the deep-chain setting gets a note: how many sit below it.
      note: key.deep.length
        ? `${plural(key.deep.length, 'person', 'people')} below layer ${key.deepLayer}`
        : undefined,
      definition: defText(m, ORG_METRIC.layers),
      drill: when(key.layers, 'layers'),
      noteDrill: when(key.deep.length, 'deepChain'),
      uses: uses.layers,
    },
    {
      id: 'org-open-roles',
      metricId: ORG_METRIC.openRoles,
      label: 'Open roles',
      value: key.openReqIds.length,
      format: 'int',
      note: 'Open requisitions',
      definition: defText(m, ORG_METRIC.openRoles),
      drill: when(key.openReqIds.length, 'openRoles'),
      uses: uses.openRoles,
    },
    {
      id: 'org-flags',
      metricId: ORG_METRIC.flagged,
      label: 'Structure flags',
      value: key.flagged.length,
      format: 'int',
      note: 'People with a span, chain or new-manager flag',
      definition: flaggedDefinition(m, rules, p.lineage.jobChanges),
      drill: when(key.flagged.length, 'flagged'),
      uses: uses.flagged,
    },
  ]
  return tagKpis(p.openRoles ? tiles : tiles.filter((k) => k.id !== 'org-open-roles'))
}
