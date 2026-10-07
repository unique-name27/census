/**
 * The figure scan (docs/ROLES.md, 5.3): every view's tabs laid out off screen with
 * `renderWholeView`, one view per idle slice, reading what each tab's figures, KPI strips and
 * readouts declared. The Action center is laid out too, and My team for a preview leader outside
 * Manager mode, so the two home pages and the Action center are judged with the rest. In Developer mode it lists every figure; with Manager mode's access it lists
 * what a manager gets (hidden views, tabs and figures are simply not there). Results are kept in
 * memory until reload (`useDev().scans`).
 */
import type { AccessInput } from '@/access/context'
import { MODE_LABEL, type Mode } from '@/access/modes'
import { can } from '@/access/policy'
import { renderWholeView } from '@/app/wholeView'
import type { Features } from '@/data/context'
import { timingClock } from '@/lib/timing'
import { ActionCenter } from '@/views/actions'
import { type ViewDef, withAccessTabs, withFeatureTabs } from '@/views/types'
import { idle } from './engines'
import { type FigureScan, type ScannedFigure, type ScannedView, scannedFigures } from './scanModel'

export interface ScanProgress {
  view: string
  tab: string
  /** Views done so far. */
  done: number
  total: number
}

/**
 * The Action center as a one-tab view, so a scan lays it out and the contract checks judge its
 * figures like any view's (it is a page of its own, not a folder tab).
 */
export const ACTION_CENTER_VIEW: ViewDef = {
  key: 'actions' as ViewDef['key'],
  label: 'Action center',
  tabs: [{ key: 'page', label: 'Action center' }],
  View: ActionCenter,
  headline: () => ({ value: '', label: 'open items' }),
  datasets: [],
}

/**
 * The views a scan in this mode lays out, each with the tabs the mode and the feature switches
 * show, then the Action center when the mode shows it.
 */
export function scanPlan(views: readonly ViewDef[], mode: Mode, features: Features): ViewDef[] {
  const access = { can: (s: string) => can(mode, s) }
  const plan = views
    .filter((v) => can(mode, `view:${v.key}`))
    .map((v) => withAccessTabs(withFeatureTabs(v, features), access))
    .filter((v) => v.tabs.length > 0)
  return can(mode, 'page:actions') ? [...plan, ACTION_CENTER_VIEW] : plan
}

/**
 * The access a view is laid out with. My team shows one manager's org, so outside Manager mode it
 * is laid out for `previewLeaderId` (as Developer mode previews it with a leader picked), else it
 * would show only its "Pick a leader" state and nothing would be judged.
 */
export function scanAccess(
  view: Pick<ViewDef, 'key'>,
  access: AccessInput,
  previewLeaderId?: string | null,
): AccessInput {
  if (view.key !== 'team' || access.mode === 'manager' || !previewLeaderId) return access
  return { mode: 'manager', managerId: previewLeaderId }
}

/** Lay out every view of the plan off screen and collect what its figures declared. */
export async function runFigureScan(opts: {
  views: readonly ViewDef[]
  mode: Mode
  managerId?: string | null
  /** The leader My team is laid out for outside Manager mode (`scanAccess`). */
  previewLeaderId?: string | null
  features: Features
  onProgress?: (p: ScanProgress) => void
}): Promise<FigureScan> {
  const started = timingClock()
  const plan = scanPlan(opts.views, opts.mode, opts.features)
  const access: AccessInput =
    opts.mode === 'manager' ? { mode: 'manager', managerId: opts.managerId ?? null } : { mode: opts.mode }
  const views: ScannedView[] = []
  const figures: ScannedFigure[] = []
  for (const [i, view] of plan.entries()) {
    await idle()
    const stamps: number[] = []
    const res = await renderWholeView(view, {
      access: scanAccess(view, access, opts.previewLeaderId),
      measure: `census:scan:${view.key}`,
      purpose: 'scan',
      onProgress: (p) => {
        stamps[p.index] = timingClock()
        opts.onProgress?.({ view: view.label, tab: p.tab.label, done: i, total: plan.length })
      },
      whileMounted: async () => null,
    })
    const end = timingClock()
    const failed = new Set(res.failed.map((t) => t.key))
    views.push({
      key: view.key,
      label: view.label,
      tabs: view.tabs.map((t, ti) => ({
        key: t.key,
        label: t.label,
        failed: failed.has(t.key),
        ms: Math.max(0, (stamps[ti + 1] ?? end) - (stamps[ti] ?? end)),
      })),
    })
    for (const t of view.tabs) figures.push(...scannedFigures(view, t, res.facts[t.key] ?? []))
  }
  opts.onProgress?.({ view: '', tab: '', done: plan.length, total: plan.length })
  return {
    mode: opts.mode,
    managerId: opts.mode === 'manager' ? (opts.managerId ?? null) : null,
    at: new Date().toISOString(),
    ms: timingClock() - started,
    views,
    figures,
  }
}

/** "Scanned 11 views in Developer mode at 14:02, 182 figures." */
export function scanLine(scan: FigureScan | null | undefined, managerName?: string | null): string {
  if (!scan) return 'Not scanned yet.'
  const at = new Date(scan.at)
  const time = Number.isNaN(at.getTime())
    ? scan.at
    : at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const figures = scan.figures.filter((f) => f.kind === 'figure').length
  const who = scan.mode === 'manager' && managerName ? ` for ${managerName}'s org` : ''
  return `Scanned ${scan.views.length} views in ${MODE_LABEL[scan.mode]} mode${who} at ${time}: ${figures} figures, ${(scan.ms / 1000).toFixed(1)} s.`
}
