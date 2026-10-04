/**
 * "Export" for a view: every figure on this tab, or every figure on every tab of the view, as one
 * Excel workbook (a sheet per figure) or one PowerPoint deck (a slide per figure). The whole-view
 * export lays the other tabs out off screen first (see `renderWholeView`) and reports its progress
 * in a toast. The export library loads on first use.
 */
import { useState } from 'react'
import { useFigureRegistry } from '@/charts/registry'
import { IconDownload, IconSlides, IconTable } from '@/components/icons'
import { toast, updateToast } from '@/components/toast'
import { Button, Menu, type MenuItem } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { plural } from '@/lib/format'
import type { ViewDef } from '@/views/types'
import { buildExportMeta } from './exportMeta'
import { renderWholeView } from './wholeView'
import {
  type ExportKind,
  layoutProgress,
  payDropped,
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
    })

  const runTab = async (kind: ExportKind) => {
    const figures = registry?.list() ?? []
    if (!figures.length) {
      toast('There is nothing to export on this tab yet.')
      return
    }
    setBusy(kind)
    const meta = metaFor(view.tabs.find((t) => t.key === tab)?.label)
    const opts = { showPay: ctx.showPay }
    try {
      const lib = await import('@/lib/export')
      if (kind === 'workbook') await lib.exportViewWorkbook(figures, meta, opts)
      else await lib.exportViewDeck(figures, meta, opts)
      const dropped = !ctx.showPay && figures.some((f) => f.columns.some((c) => c.pay))
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
    const opts = { showPay: ctx.showPay }
    const first = layoutProgress(view.label, view.tabs[0], 0, view.tabs.length)
    const id = toast(first.title, { description: first.description, timeout: 0 })
    try {
      const lib = await import('@/lib/export')
      const {
        groups,
        failed,
        value: images,
      } = await renderWholeView(view, {
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
        payDropped: payDropped(groups, ctx.showPay),
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

  return (
    <Menu
      width={284}
      trigger={
        <Button icon={<IconDownload />} caret disabled={!!busy}>
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      }
      items={items}
    />
  )
}
