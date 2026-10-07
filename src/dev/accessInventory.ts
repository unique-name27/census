/**
 * The inventory the access matrix is built from (docs/ROLES.md, 5.4 and 6.8): the same registries
 * the matrix test reads, so Developer > Access shows exactly the snapshot's rows. Pure.
 */
import { type AccessInventory, accessMatrix, type MatrixRow } from '@/access/matrix'
import { DEFAULT_TOOLS } from '@/app/tools'
import { TOOL_NAMES } from '@/ask/engine/tools'
import { DATASET_KEYS } from '@/data/schema'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { DRILL_KINDS } from '@/drill/records'
import { ARTICLES } from '@/help/articles'
import { TOURS } from '@/help/tours'
import { DATA_TABS, DATASET_PANELS } from '@/views/data/links'
import type { ViewDef } from '@/views/types'

export function accessInventory(views: readonly ViewDef[]): AccessInventory {
  return {
    views: views.map((v) => ({
      key: v.key,
      label: v.label,
      tabs: v.tabs.map((t) => ({ key: t.key, label: t.label })),
    })),
    dataTabs: DATA_TABS.map((t) => t.route || t.key),
    datasetPanels: DATASET_PANELS,
    settings: SETTINGS_SECTIONS,
    tools: DEFAULT_TOOLS.map((t) => t.id),
    articles: ARTICLES.map((a) => a.id),
    tours: TOURS.map((t) => t.id),
    askTools: TOOL_NAMES,
    drillKinds: DRILL_KINDS,
    datasets: DATASET_KEYS,
  }
}

/** Every surface with its decision in each mode, as the matrix test snapshots it. */
export const accessRows = (views: readonly ViewDef[]): MatrixRow[] => accessMatrix(accessInventory(views))

export type AccessFilter = {
  kind: string
  /** 'all', or a mode to show only its non-shown rows. */
  mode: 'all' | 'developer' | 'hr' | 'manager'
  decision: 'all' | 'shown' | 'limited' | 'hidden'
  differ: boolean
  query: string
}

export const NO_ACCESS_FILTER: AccessFilter = {
  kind: 'all',
  mode: 'all',
  decision: 'all',
  differ: false,
  query: '',
}

/** The rows the Access tab's filters keep. */
export function filterAccessRows(rows: readonly MatrixRow[], f: AccessFilter): MatrixRow[] {
  const q = f.query.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.kind !== 'all' && r.kind !== f.kind) return false
    const decisions = f.mode === 'all' ? [r.developer, r.hr, r.manager] : [r[f.mode]]
    if (f.decision !== 'all' && !decisions.some((d) => d.access === f.decision)) return false
    if (f.differ && r.developer.access === r.hr.access && r.hr.access === r.manager.access) return false
    if (q && !`${r.surface} ${r.kind} ${r.hr.how ?? ''} ${r.manager.how ?? ''}`.toLowerCase().includes(q))
      return false
    return true
  })
}

/** The kinds in the matrix, in first-seen order (for the kind filter). */
export function accessKinds(rows: readonly MatrixRow[]): string[] {
  return [...new Set(rows.map((r) => r.kind))]
}
