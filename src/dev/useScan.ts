/**
 * Starting a figure scan from the Developer page ("Scan figures", "Scan as Manager", "Run contract
 * checks"): one at a time, with its progress in the dev store so the header and every tab show it.
 */
import type { Mode } from '@/access/modes'
import { useMode } from '@/access/store'
import { errorMessage } from '@/app/devlog'
import { leaderOptions } from '@/app/filterOptions'
import { toast } from '@/components/toast'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { focusLeader } from '@/data/scope'
import { useCensus } from '@/data/store'
import { VIEWS } from '@/views/registry'
import { runFigureScan } from './scan'
import { useDev } from './store'

/** The manager a "Scan as Manager" uses: the one Manager mode remembers. */
export const scanManagerId = (): string | null => useMode.getState().managerId

/**
 * The leader My team is laid out for in a Developer or HR scan: the leader on screen, else the
 * manager Manager mode remembers, else a mid-size org from the leader list (one with 20 to 150
 * people, the size of the sample's typical manager), so the contract checks judge its figures.
 */
export function previewLeader(ctx: Pick<AnalyticsContext, 'org' | 'asOf' | 'filters'>): string | null {
  const focus = focusLeader(ctx.filters)
  if (focus && ctx.org.byId.has(focus)) return focus
  const remembered = scanManagerId()
  if (remembered && ctx.org.byId.has(remembered)) return remembered
  const options = leaderOptions(ctx.org, ctx.asOf, 3)
  return (options.find((o) => o.size >= 20 && o.size <= 150) ?? options[0])?.id ?? null
}

export function useRunScan(): { run: (mode: Mode) => Promise<void>; busy: boolean } {
  const scanning = useDev((s) => s.scanning)
  const ctx = useAnalytics()
  const run = async (mode: Mode) => {
    if (useDev.getState().scanning) return
    const managerId = mode === 'manager' ? scanManagerId() : null
    if (mode === 'manager' && !managerId) {
      toast('Pick a manager first', {
        description: 'Scan as Manager uses the manager Manager mode remembers. Choose one in Settings, Mode.',
      })
      return
    }
    const set = useDev.getState().setScanning
    set({ mode, text: 'Starting the scan.' })
    try {
      const scan = await runFigureScan({
        views: VIEWS,
        mode,
        managerId,
        previewLeaderId: mode === 'manager' ? null : previewLeader(ctx),
        features: { engagementSurveys: useCensus.getState().engagementSurveys },
        onProgress: (p) =>
          set({
            mode,
            text: p.view
              ? `Laying out ${p.view}, ${p.tab} (view ${p.done + 1} of ${p.total}).`
              : 'Reading the results.',
          }),
      })
      useDev.getState().addScan(scan)
      toast('Scan finished', {
        tone: 'good',
        description: `${scan.figures.filter((f) => f.kind === 'figure').length} figures on ${scan.views.length} views.`,
      })
    } catch (err) {
      toast('The scan could not finish', { tone: 'critical', description: errorMessage(err) })
    } finally {
      set(null)
    }
  }
  return { run, busy: !!scanning }
}
