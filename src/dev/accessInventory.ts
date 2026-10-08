/**
 * The inventory the access matrix is built from (docs/ROLES.md, 5.4 and 6.8; docs/ROLES-V2.md 8.3):
 * the same registries the matrix test reads, the role homes' figures on their pages and the
 * Special analyses addresses included, so Developer > Access shows exactly the snapshot's rows in
 * all eleven modes. Pure.
 */
import { type AccessInventory, accessMatrix, MATRIX_MODES, type MatrixRow } from '@/access/matrix'
import type { Mode } from '@/access/modes'
import { DEFAULT_TOOLS } from '@/app/tools'
import { ALL_TOOL_NAMES } from '@/ask/engine/tools'
import { DATASET_KEYS } from '@/data/schema'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { DRILL_KINDS } from '@/drill/records'
import { ARTICLES } from '@/help/articles'
import { TOURS } from '@/help/tours'
import { DATA_TABS, DATASET_PANELS } from '@/views/data/links'
import { ALL_HOME_FIGURES } from '@/views/home/engine/figures'
import { ANALYSIS_KEYS } from '@/views/hrbp/analyses/tab'
import { SCORECARD_FIGURES } from '@/views/scorecard/engine/figures'
import { TEAM_FIGURES } from '@/views/team/engine/figures'
import type { ViewDef } from '@/views/types'
import { howByMode } from './inventory'

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
    askTools: ALL_TOOL_NAMES,
    drillKinds: DRILL_KINDS,
    datasets: DATASET_KEYS,
    // The role homes' figures, on their pages (docs/ROLES-V2.md 5), as the matrix test lists them.
    figures: [
      ...ALL_HOME_FIGURES.map((id) => ({ id, view: 'home', tab: 'overview' })),
      ...TEAM_FIGURES.map((id) => ({ id, view: 'team', tab: 'overview' })),
      ...SCORECARD_FIGURES.map((id) => ({ id, view: 'scorecard', tab: 'overview' })),
    ],
    // People stats > Special analyses, each analysis by its address (4.2).
    parts: ANALYSIS_KEYS.map((k) => `hrbp.analyses:${k}`),
  }
}

/** Every surface with its decision in each mode, as the matrix test snapshots it. */
export const accessRows = (views: readonly ViewDef[]): MatrixRow[] => accessMatrix(accessInventory(views))

export type AccessFilter = {
  kind: string
  /** 'all', or one mode: the decision filter then reads that mode's column only. */
  mode: 'all' | Mode
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

/** Whether the modes do not all decide a surface the same way. */
export const modesDiffer = (r: MatrixRow): boolean =>
  MATRIX_MODES.some((m) => r.decisions[m].access !== r.decisions.developer.access)

/** How a row is limited: one mode's sentence when the filter names a mode, else every mode's. */
export function rowHow(r: MatrixRow, mode: AccessFilter['mode'] = 'all'): string {
  if (mode === 'all') return howByMode(r.decisions)
  const d = r.decisions[mode]
  return d.access === 'shown' ? '' : (d.how ?? '')
}

/** The rows the Access tab's filters keep. */
export function filterAccessRows(rows: readonly MatrixRow[], f: AccessFilter): MatrixRow[] {
  const q = f.query.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.kind !== 'all' && r.kind !== f.kind) return false
    const decisions = f.mode === 'all' ? MATRIX_MODES.map((m) => r.decisions[m]) : [r.decisions[f.mode]]
    if (f.decision !== 'all' && !decisions.some((d) => d.access === f.decision)) return false
    if (f.differ && !modesDiffer(r)) return false
    if (q && !`${r.surface} ${r.kind} ${howByMode(r.decisions)}`.toLowerCase().includes(q)) return false
    return true
  })
}

/** The kinds in the matrix, in first-seen order (for the kind filter). */
export function accessKinds(rows: readonly MatrixRow[]): string[] {
  return [...new Set(rows.map((r) => r.kind))]
}
