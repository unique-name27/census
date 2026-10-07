/**
 * Hands Ask what the page on screen rendered (docs/ASK-ACTIONS.md, part 2): the figure registry
 * of the tab, the analytics context it rendered with and where it is, so `liveAskApp` can list
 * the figures, draw from them and wait for a new tab or scope to settle. Render one inside each
 * figure registry the shell mounts for the page on screen (and one on pages without a registry,
 * such as the Data room). Renders nothing.
 */
import { useEffect } from 'react'
import { connectScreen } from '@/ask/engine'
import { useFigureRegistry } from '@/charts/registry'
import { useCurrentView } from '@/components/currentView'
import { useAnalytics, useAnalyticsPending } from '@/data/context'
import { useCensus } from '@/data/store'

export function AskScreenBridge() {
  const registry = useFigureRegistry()
  const ctx = useAnalytics()
  const pending = useAnalyticsPending()
  const here = useCurrentView()
  const route = useCensus((s) => s.route)
  const view = here?.key ?? route.view
  const tab = here?.tab ?? route.tab
  useEffect(() => connectScreen({ registry, ctx, view, tab, pending }), [registry, ctx, view, tab, pending])
  return null
}
