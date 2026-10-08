/**
 * "Export" for a view: every figure on this tab, or every figure on every tab of the view, as one
 * Excel workbook (a sheet per figure) or one PowerPoint deck (a slide per figure). The whole-view
 * export lays the other tabs out off screen first (see `renderWholeView`) and reports its progress
 * in a toast. The export library loads on first use.
 */
import { useState } from 'react'
import { useFigureRegistry } from '@/charts/registry'
import { IconCopy, IconDownload, IconSlides, IconTable } from '@/components/icons'
import { toast, updateToast } from '@/components/toast'
import { Button, Menu, type MenuItem } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { moneyLeftOut, moneyOpts } from '@/lib/export/columns'
import { modeMeta } from '@/lib/export/modeMeta'
import { plural } from '@/lib/format'
import type { ViewDef } from '@/views/types'
import { accessInputOf, buildExportMeta } from './exportMeta'
import { copyViewLink } from './viewActions'
import { renderWholeView } from './wholeView'
import {
  type ExportKind,
  layoutProgress,
  WHOLE_VIEW_LABEL,
  wholeViewDone,
  writeProgress,
} from './wholeViewModel'

export function ExportMenu({ view, tab }: { view: ViewDef; tab: string }) {
  const registry = useFigureRegistry()
  const ctx = useAnalytics()
  const [busy, setBusy] = useState<ExportKind | null>(null)

  const metaFor = (tabLabel: string | undefined) =>
    buildExportMeta({
      viewLabel: view.label,
      tabLabel,
      scopeLabel: ctx.scopeLabel,
      window: ctx.window,
      asOf: ctx.asOf,
      isSample: ctx.isSample,
      sampleCompany: SAMPLE_COMPANY,
      standard: ctx.standard,
      readsData: view.datasets.length > 0,
      // Every mode but HR and Developer says so, with its scope, and Finance adds its cost line
      // (docs/ROLES-V2.md 4.11, 3.2).
      ...modeMeta(ctx.access),
    })

  const runTab = async (kind: ExportKind) => {
    const figures = registry?.list() ?? []
    if (!figures.length) {
      toast('There is nothing to export on this tab yet.')
      return
    }
    setBusy(kind)
    const meta = metaFor(view.tabs.find((t) => t.key === tab)?.label)
    // Pay amounts per the switch; cost totals per the mode (Finance keeps them, `ctx.showCost`).
    const opts = moneyOpts(ctx)
    try {
      const lib = await import('@/lib/export')
      if (kind === 'workbook') await lib.exportViewWorkbook(figures, meta, opts)
      else await lib.exportViewDeck(figures, meta, opts)
      const dropped = moneyLeftOut(figures, { pay: opts.showPay, cost: opts.showCost })
      toast(kind === 'workbook' ? 'Workbook downloaded' : 'Slides downloaded', {
        tone: 'good',
        description: `${plural(figures.length, 'figure')} from ${[meta.view, meta.tab].filter(Boolean).join(', ')}.${
          dropped ? ' Pay amounts were left out.' : ''
        }`,
      })
    } catch (err) {
      console.error('View export failed', err)
      toast('The export did not finish', {
        tone: 'critical',
        description: err instanceof Error ? err.message : 'Try again, or export figures one at a time.',
      })
    } finally {
      setBusy(null)
    }
  }

  const runView = async (kind: ExportKind) => {
    setBusy(kind)
    const meta = metaFor(WHOLE_VIEW_LABEL)
    const opts = moneyOpts(ctx)
    const first = layoutProgress(view.label, view.tabs[0], 0, view.tabs.length)
    const id = toast(first.title, { description: first.description, timeout: 0 })
    try {
      const lib = await import('@/lib/export')
      const {
        groups,
        failed,
        value: images,
      } = await renderWholeView(view, {
        // The off-screen tabs render in the same mode and scope, with the same tabs and figures.
        access: accessInputOf(ctx.access),
        onProgress: ({ index, total, tab: t }) => {
          const p = layoutProgress(view.label, t, index, total)
          updateToast(id, p.title, { description: p.description })
        },
        whileMounted: async (groups) => {
          const figures = groups.flatMap((g) => g.figures)
          const p = writeProgress(kind, 'images', figures.length)
          updateToast(id, p.title, { description: p.description })
          return lib.captureFigureImages(figures)
        },
      })
      const count = groups.reduce((n, g) => n + g.figures.length, 0)
      if (!count) {
        updateToast(id, 'There is nothing to export in this view yet.', { timeout: 5000 })
        return
      }
      const p = writeProgress(kind, 'file', count)
      updateToast(id, p.title, { description: p.description })
      if (kind === 'workbook') await lib.exportViewWorkbook(groups, meta, { ...opts, captured: images })
      else await lib.exportViewDeck(groups, meta, { ...opts, captured: images })
      const done = wholeViewDone({
        kind,
        viewLabel: view.label,
        groups,
        failed,
        payDropped: moneyLeftOut(
          groups.flatMap((g) => g.figures),
          { pay: opts.showPay, cost: opts.showCost },
        ),
      })
      updateToast(id, done.title, { tone: 'good', description: done.description, timeout: 6000 })
    } catch (err) {
      console.error('Whole-view export failed', err)
      updateToast(id, 'The export did not finish', {
        tone: 'critical',
        description: err instanceof Error ? err.message : 'Try again, or export one tab at a time.',
        timeout: 8000,
      })
    } finally {
      setBusy(null)
    }
  }

  const items: MenuItem[] = [
    { heading: view.tabs.length > 1 ? 'This tab' : 'This view' },
    {
      label: 'Excel workbook (all figures)',
      icon: <IconTable />,
      hint: '.xlsx',
      onSelect: () => void runTab('workbook'),
    },
    {
      label: 'PowerPoint slides (all figures)',
      icon: <IconSlides />,
      hint: '.pptx',
      onSelect: () => void runTab('deck'),
    },
  ]
  if (view.tabs.length > 1)
    items.push(
      { separator: true },
      { heading: 'Whole view, all tabs' },
      {
        label: `Excel workbook (${plural(view.tabs.length, 'tab')})`,
        icon: <IconTable />,
        hint: '.xlsx',
        onSelect: () => void runView('workbook'),
      },
      {
        label: `PowerPoint slides (${plural(view.tabs.length, 'tab')})`,
        icon: <IconSlides />,
        hint: '.pptx',
        onSelect: () => void runView('deck'),
      },
    )
  // The address with the scope spelled out, so the link opens this tab with these filters.
  items.push(
    { separator: true },
    { label: 'Copy link to this view', icon: <IconCopy />, onSelect: () => void copyViewLink() },
  )

  return (
    <Menu
      width={284}
      trigger={
        <Button data-tour="view-export" icon={<IconDownload />} caret disabled={!!busy}>
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      }
      items={items}
    />
  )
}
