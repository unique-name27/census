/**
 * Export context for a figure on screen: the view and tab it sits in, the scope, window and
 * as-of date, whether the data is the sample company, the data standard in force and the mode
 * lines (none of those for a view that reads no people data).
 */
import { useCurrentView } from '@/components/currentView'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { modeMeta } from '@/lib/export/modeMeta'
import { withoutDataContext } from '@/lib/export/names'
import type { ExportMeta } from './types'

export function useExportMeta(): ExportMeta {
  const ctx = useAnalytics()
  const view = useCurrentView()
  const meta: ExportMeta = {
    view: view?.label ?? '',
    viewKey: view?.key,
    tab: view?.tabs.find((t) => t.key === view.tab)?.label,
    scope: ctx.scopeLabel,
    window: ctx.window.label,
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    company: ctx.isSample ? SAMPLE_COMPANY : 'Company data',
    standard: ctx.standard,
    // Outside HR and Developer: "Made in HRBP mode for APAC." and Finance's cost line (ROLES-V2 4.11).
    ...modeMeta(ctx.access),
  }
  // A view that reads no datasets (AI in HR) exports without scope, as-of or data standard lines.
  return view?.datasets?.length === 0 ? withoutDataContext(meta) : meta
}
