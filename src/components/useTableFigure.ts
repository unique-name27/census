import { useEffect, useState } from 'react'
import { nextFigureOrder, useFigureRegistry } from '@/charts/registry'
import type { Column, FigureFacts } from '@/charts/types'

/**
 * Registers a table-only figure (no SVG) with the view's figure registry, so "Export view"
 * includes it as a sheet or slide. Keeps its on-screen order across re-registrations; registers
 * nothing while there are no rows. `items` (a KPI strip's tiles, a readout's findings) are only
 * declared for the Developer page's contract checks, never exported.
 */
export function useTableFigure(fig: {
  id: string
  title: string
  subtitle?: string
  note?: string
  columns: Column[]
  rows: Record<string, unknown>[]
  items?: FigureFacts['items']
}): void {
  const registry = useFigureRegistry()
  const [order] = useState(nextFigureOrder)
  const { id, title, subtitle, note, columns, rows, items } = fig
  useEffect(() => {
    if (!registry || !rows.length) return
    return registry.register({ id, title, subtitle, note, columns, rows, getSvg: () => null, order })
  }, [registry, id, title, subtitle, note, columns, rows, order])
  useEffect(() => {
    if (!registry?.track || !items) return
    return registry.track({
      id,
      title,
      gated: false,
      rows: rows.length,
      image: false,
      kind: 'table',
      items,
      order,
    })
  }, [registry, id, title, rows.length, items, order])
}
