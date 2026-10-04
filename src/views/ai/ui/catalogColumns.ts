/** The columns of the agent catalog figure: the "AI agents" sheet's columns, as a table. */
import type { Column } from '@/charts/types'
import { type CatalogRow, SHEET_COLUMNS, safeAgentUrl } from '../catalog'

/** Long-text columns: on screen, in Excel, CSV and copy, but a slide has no room for them. */
const SHEETS_ONLY = new Set<keyof CatalogRow>([
  'useFor',
  'dontUseFor',
  'examplePrompts',
  'dataSources',
  'url',
])

export const CATALOG_COLUMNS: Column<CatalogRow>[] = SHEET_COLUMNS.map((c) => ({
  key: c.key,
  label: c.label,
  width: Math.min(c.width, 40),
  ...(SHEETS_ONLY.has(c.key) && { only: 'sheets' as const }),
  ...(c.key === 'url' && { href: (r: CatalogRow) => safeAgentUrl(r.url) }),
}))
