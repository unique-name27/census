/**
 * The figure scan (docs/ROLES.md, 5.3; docs/ROLES-V2.md 5.13): every view's tabs laid out off
 * screen with `renderWholeView`, one layout per idle slice, reading what each tab's figures, KPI
 * strips and readouts declared. The Action center is laid out too. In Developer mode it lists every
 * figure, with My team laid out for a preview leader and the Home view once per role, each in its
 * own mode, so every home page is judged with the rest. "Scan as role" lays everything out with
 * another mode's access and its pick, to list what that role gets (hidden views, tabs and figures
 * are simply not there). Results are kept in memory until reload (`useDev().scans`).
 */
import type { AccessInput } from '@/access/context'
import { HOME_OF, MODE_LABEL, type Mode, type ModePicks } from '@/access/modes'
import { can } from '@/access/policy'
import { renderWholeView } from '@/app/wholeView'
import type { Features } from '@/data/context'
import { timingClock } from '@/lib/timing'
import { ActionCenter } from '@/views/actions'
import { type ViewDef, withAccessTabs, withFeatureTabs } from '@/views/types'
import { idle } from './engines'
import { canLayOut, HOME_ROLES, picksOfMode } from './roles'
import { type FigureScan, type ScannedFigure, type ScannedView, scannedFigures } from './scanModel'

export interface ScanProgress {
  view: string
  tab: string
  /** Layouts done so far. */
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

const tabsIn = (view: ViewDef, mode: Mode, features: Features): ViewDef =>
  withAccessTabs(withFeatureTabs(view, features), { can: (s: string) => can(mode, s) })

/**
 * The views a scan in this mode lays out, each with the tabs the mode and the feature switches
 * show, then the Action center when the mode shows it.
 */
export function scanPlan(views: readonly ViewDef[], mode: Mode, features: Features): ViewDef[] {
  const plan = views
    .filter((v) => can(mode, `view:${v.key}`))
    .map((v) => tabsIn(v, mode, features))
    .filter((v) => v.tabs.length > 0)
  return can(mode, 'page:actions') ? [...plan, ACTION_CENTER_VIEW] : plan
}

/** One off-screen layout of a scan: a view, the access it is laid out with, and for a home, as whom. */
export interface ScanLayout {
  view: ViewDef
  access: AccessInput
  /** The role a home is laid out as inside another mode's scan (the Developer scan's homes). */
  as?: Mode
}

/**
 * Every layout of a scan in this mode, in plan order. My team shows one manager's org, so outside
 * Manager mode it is laid out for `previewLeaderId` (else it would show only its "Pick a leader"
 * state and nothing would be judged). The Home view shows the home of the mode on screen, so in a
 * mode whose home is elsewhere (Developer) it is laid out once per role with a Home, each in its
 * own mode with `picks`; a role without its pick is left out.
 */
export function scanLayouts(opts: {
  views: readonly ViewDef[]
  mode: Mode
  picks: Partial<ModePicks>
  features: Features
  previewLeaderId?: string | null
}): ScanLayout[] {
  const { mode, picks, features } = opts
  const access: AccessInput = { mode, picks }
  const out: ScanLayout[] = []
  for (const view of scanPlan(opts.views, mode, features)) {
    if (view.key === 'team' && mode !== 'manager' && opts.previewLeaderId) {
      out.push({ view, access: { mode: 'manager', picks: { ...picks, managerId: opts.previewLeaderId } } })
    } else if (view.key === 'home' && HOME_OF[mode] !== 'home') {
      const home = opts.views.find((v) => v.key === 'home') ?? view
      for (const role of HOME_ROLES) {
        if (!canLayOut(role, picks)) continue
        const shown = tabsIn(home, role, features)
        if (shown.tabs.length) out.push({ view: shown, access: { mode: role, picks }, as: role })
      }
    } else out.push({ view, access })
  }
  return out
}

/** Lay out every view of the plan off screen and collect what its figures declared. */
export async function runFigureScan(opts: {
  views: readonly ViewDef[]
  mode: Mode
  /** The picks the mode (and, in Developer mode, each home) is laid out with. */
  picks: Partial<ModePicks>
  /** The pick in words, for the scan's line ("APAC"). */
  scope?: string | null
  /** The leader My team is laid out for outside Manager mode. */
  previewLeaderId?: string | null
  features: Features
  onProgress?: (p: ScanProgress) => void
}): Promise<FigureScan> {
  const started = timingClock()
  const layouts = scanLayouts(opts)
  const views: ScannedView[] = []
  const figures: ScannedFigure[] = []
  for (const [i, layout] of layouts.entries()) {
    await idle()
    const { view, as } = layout
    const stamps: number[] = []
    const res = await renderWholeView(view, {
      access: layout.access,
      measure: `census:scan:${view.key}`,
      purpose: 'scan',
      onProgress: (p) => {
        stamps[p.index] = timingClock()
        opts.onProgress?.({
          view: as ? `${view.label}, ${MODE_LABEL[as]}` : view.label,
          tab: p.tab.label,
          done: i,
          total: layouts.length,
        })
      },
      whileMounted: async () => null,
    })
    const end = timingClock()
    const failed = new Set(res.failed.map((t) => t.key))
    // A home laid out as a role is one tab of the Home view, keyed by the role.
    const tabs = view.tabs.map((t, ti) => ({
      key: as ?? t.key,
      label: as ? MODE_LABEL[as] : t.label,
      failed: failed.has(t.key),
      ms: Math.max(0, (stamps[ti + 1] ?? end) - (stamps[ti] ?? end)),
      ...(as ? { as } : {}),
    }))
    const known = views.find((v) => v.key === view.key)
    if (known) known.tabs.push(...tabs)
    else views.push({ key: view.key, label: view.label, tabs })
    for (const [ti, t] of view.tabs.entries())
      figures.push(...scannedFigures(view, tabs[ti], res.facts[t.key] ?? []))
  }
  opts.onProgress?.({ view: '', tab: '', done: layouts.length, total: layouts.length })
  return {
    mode: opts.mode,
    picks: picksOfMode(opts.mode, opts.picks),
    scope: opts.scope ?? null,
    at: new Date().toISOString(),
    ms: timingClock() - started,
    views,
    figures,
  }
}

/** "Scanned 11 views in Developer mode at 14:02: 182 figures, 21.4 s." */
export function scanLine(scan: FigureScan | null | undefined): string {
  if (!scan) return 'Not scanned yet.'
  const at = new Date(scan.at)
  const time = Number.isNaN(at.getTime())
    ? scan.at
    : at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const figures = scan.figures.filter((f) => f.kind === 'figure').length
  const who = scan.scope ? ` for ${scan.scope}` : ''
  return `Scanned ${scan.views.length} views in ${MODE_LABEL[scan.mode]} mode${who} at ${time}: ${figures} figures, ${(scan.ms / 1000).toFixed(1)} s.`
}
