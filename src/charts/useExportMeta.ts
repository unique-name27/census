/**
 * Export context for a figure on screen: the view and tab it sits in, the scope, window and
 * as-of date, and whether the data is the sample company.
 */
import { useCurrentView } from '@/components/currentView'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import type { ExportMeta } from './types'

export function useExportMeta(): ExportMeta {
  const ctx = useAnalytics()
  const view = useCurrentView()
  return {
    view: view?.label ?? '',
    tab: view?.tabs.find((t) => t.key === view.tab)?.label,
    scope: ctx.scopeLabel,
    window: ctx.window.label,
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    company: ctx.isSample ? SAMPLE_COMPANY : 'Company data',
  }
}
