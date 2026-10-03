/**
 * "Export" for a whole view tab: every figure on screen as one Excel workbook (a sheet per figure)
 * or one PowerPoint deck (a slide per figure). The export library loads on first use.
 */
import { useState } from 'react'
import { useFigureRegistry } from '@/charts/registry'
import { IconDownload, IconSlides, IconTable } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, Menu } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { plural } from '@/lib/format'
import type { ViewDef } from '@/views/types'
import { buildExportMeta } from './exportMeta'

type Kind = 'workbook' | 'deck'

export function ExportMenu({ view, tab }: { view: ViewDef; tab: string }) {
  const registry = useFigureRegistry()
  const ctx = useAnalytics()
  const [busy, setBusy] = useState<Kind | null>(null)

  const run = async (kind: Kind) => {
    const figures = registry?.list() ?? []
    if (!figures.length) {
      toast('There is nothing to export on this tab yet.')
      return
    }
    setBusy(kind)
    const meta = buildExportMeta({
      viewLabel: view.label,
      tabLabel: view.tabs.find((t) => t.key === tab)?.label,
      scopeLabel: ctx.scopeLabel,
      window: ctx.window,
      asOf: ctx.asOf,
      isSample: ctx.isSample,
      sampleCompany: SAMPLE_COMPANY,
    })
    const opts = { showPay: ctx.showPay }
    try {
      const lib = await import('@/lib/export')
      if (kind === 'workbook') await lib.exportViewWorkbook(figures, meta, opts)
      else await lib.exportViewDeck(figures, meta, opts)
      const payDropped = !ctx.showPay && figures.some((f) => f.columns.some((c) => c.pay))
      toast(kind === 'workbook' ? 'Workbook downloaded' : 'Slides downloaded', {
        tone: 'good',
        description: `${plural(figures.length, 'figure')} from ${[meta.view, meta.tab].filter(Boolean).join(', ')}.${
          payDropped ? ' Pay amounts were left out.' : ''
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

  return (
    <Menu
      width={272}
      trigger={
        <Button icon={<IconDownload />} caret disabled={!!busy}>
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      }
      items={[
        { heading: 'This tab' },
        {
          label: 'Excel workbook (all figures)',
          icon: <IconTable />,
          hint: '.xlsx',
          onSelect: () => void run('workbook'),
        },
        {
          label: 'PowerPoint slides (all figures)',
          icon: <IconSlides />,
          hint: '.pptx',
          onSelect: () => void run('deck'),
        },
      ]}
    />
  )
}
