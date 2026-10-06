/**
 * What the Views menu and "Copy link to this view" do (docs/FILTERS.md, parts 1 and 2): apply a
 * saved view in one step (one history entry), and copy the full address of a view.
 */
import { currentScope, linkToView } from '@/components/navigation'
import { toast } from '@/components/toast'
import { batchAddress, setLensOn } from '@/data/address'
import type { AnalyticsContext } from '@/data/context'
import { type SavedView, viewScope } from '@/data/savedViews'
import { type RouteView, useCensus } from '@/data/store'
import { checkScope, leftOutMessage, periodMessage, type UrlScope, vocabularyOf } from '@/data/urlScope'
import { isRouteView, useSavedViews } from '@/data/viewsStore'
import { writeClipboard } from '@/lib/export/clipboard'

/**
 * Apply a saved view: its scope in one step and, when it has one, its page. One history entry.
 * Values the loaded data doesn't have (a leader who is not on the roster) are left out, and a
 * custom period is checked against the reporting date like a link's; a toast says what changed.
 * The data standard and lens are this tab's scope, so applying a view does not save them.
 */
export function applySavedView(view: SavedView, ctx: Pick<AnalyticsContext, 'all' | 'org' | 'asOf'>): void {
  const { scope, leftOut, period } = checkScope(viewScope(view), vocabularyOf(ctx))
  const st = useCensus.getState()
  const page = view.page && isRouteView(view.page.view) ? view.page : null
  batchAddress('push', () => {
    st.setFilters(scope.filters)
    st.setScopeStandard(scope.standard)
    setLensOn(scope.lens)
    if (page && (page.view !== st.route.view || page.tab !== st.route.tab))
      st.navigate(page.view as RouteView, page.tab, { scroll: page.view !== st.route.view })
  })
  useSavedViews.getState().setApplied(view.id)
  if (leftOut.length || period)
    toast(`Applied "${view.name}" without part of its scope`, {
      description: [
        leftOut.length ? leftOutMessage(leftOut, "The view's") : '',
        period ? periodMessage(period, "The view's") : '',
      ]
        .filter(Boolean)
        .join(' '),
      timeout: 9000,
    })
}

/** Copy a link to a scope and page (the view on screen by default), with a toast. */
export async function copyViewLink(
  opts: { scope?: UrlScope; route?: { view: RouteView; tab: string }; what?: string } = {},
): Promise<void> {
  const url = linkToView(opts.scope ?? currentScope(), opts.route ?? useCensus.getState().route)
  try {
    await writeClipboard(url)
    toast('Link copied', {
      tone: 'good',
      description: `It opens ${opts.what ?? 'this view'} with the same filters. Only people with the same data loaded see the same numbers.`,
    })
  } catch {
    toast('The browser blocked copying', { tone: 'critical', description: url })
  }
}
