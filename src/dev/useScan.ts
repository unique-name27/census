/**
 * Starting a figure scan from the Developer page ("Scan figures", "Scan as role", "Run contract
 * checks"): one at a time, with its progress in the dev store so the header and every tab show it.
 * A role that needs a pick is scanned for the one made on the page or the one `census:mode`
 * remembers; the Developer scan lays out every role's home, so a role with neither gets a default
 * (the largest business unit and region, every recruiter).
 */
import { EVERY_RECRUITER, MODE_LABEL, type Mode, type ModePicks, PICK_OF } from '@/access/modes'
import { regionOptions, unitOptions } from '@/access/scopes/pickers'
import { picksOfState, useMode } from '@/access/store'
import { errorMessage } from '@/app/devlog'
import { leaderOptions } from '@/app/filterOptions'
import { toast } from '@/components/toast'
import { type AnalyticsContext, contextRegions, useAnalytics } from '@/data/context'
import { useLists } from '@/data/lists/store'
import { focusLeader } from '@/data/scope'
import { useCensus } from '@/data/store'
import { VIEWS } from '@/views/registry'
import { canLayOut, PICK_NOUN, pickLabel, picksFor, withDefaults } from './roles'
import { runFigureScan } from './scan'
import { useDev } from './store'

/** The picks a role is laid out with now: the page's, else the ones `census:mode` remembers. */
export const pagePicksNow = (): ModePicks =>
  picksFor(picksOfState(useMode.getState()), useDev.getState().pagePicks)

/**
 * The leader My team is laid out for in a Developer or HR scan: the leader on screen, else the
 * manager picked on this page or remembered by Manager mode, else a mid-size org from the leader
 * list (one with 20 to 150 people, the size of the sample's typical manager), so the contract
 * checks judge its figures.
 */
export function previewLeader(ctx: Pick<AnalyticsContext, 'org' | 'asOf' | 'filters'>): string | null {
  const focus = focusLeader(ctx.filters)
  if (focus && ctx.org.byId.has(focus)) return focus
  const remembered = pagePicksNow().managerId
  if (remembered && ctx.org.byId.has(remembered)) return remembered
  const options = leaderOptions(ctx.org, ctx.asOf, 3)
  return (options.find((o) => o.size >= 20 && o.size <= 150) ?? options[0])?.id ?? null
}

/** Picks for every role that has none: the largest business unit and region, and every recruiter. */
export function defaultPicks(
  ctx: Pick<AnalyticsContext, 'all' | 'asOf' | 'sources'>,
  lists: Parameters<typeof contextRegions>[0],
): Partial<ModePicks> {
  const unit = unitOptions(ctx.all.employees, ctx.asOf).find((u) => u.pickable)?.unit ?? null
  let region: string | null = null
  try {
    region =
      regionOptions(contextRegions(lists, ctx.all, ctx.sources), ctx.all.employees, ctx.asOf).rows[0]
        ?.region ?? null
  } catch {
    region = null
  }
  return { unit, region, recruiter: { name: EVERY_RECRUITER, id: null } }
}

export function useRunScan(): { run: (mode: Mode) => Promise<void>; busy: boolean } {
  const scanning = useDev((s) => s.scanning)
  const ctx = useAnalytics()
  const run = async (mode: Mode) => {
    if (useDev.getState().scanning) return
    const kind = PICK_OF[mode]
    const chosen = pagePicksNow()
    if (kind && !canLayOut(mode, chosen)) {
      toast(`Pick a ${PICK_NOUN[kind].toLowerCase()} first`, {
        description: `Scan as role lays out ${MODE_LABEL[mode]} mode for one ${PICK_NOUN[kind].toLowerCase()}. Choose one beside the button.`,
      })
      return
    }
    // Every home is laid out in the Developer scan: a role with no pick gets a default one.
    const picks = kind ? chosen : withDefaults(chosen, defaultPicks(ctx, useLists.getState().state))
    const scope = pickLabel(mode, picks, (id) => ctx.org.byId.get(id)?.name ?? null)
    const set = useDev.getState().setScanning
    set({ mode, text: 'Starting the scan.' })
    try {
      const scan = await runFigureScan({
        views: VIEWS,
        mode,
        picks,
        scope,
        previewLeaderId: mode === 'manager' ? null : previewLeader(ctx),
        features: { engagementSurveys: useCensus.getState().engagementSurveys },
        onProgress: (p) =>
          set({
            mode,
            text: p.view
              ? `Laying out ${p.view}, ${p.tab} (${p.done + 1} of ${p.total}).`
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
