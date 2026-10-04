/**
 * What a figure exports when the data standard holds it back: one row with the status and the
 * reason, in place of its data, and no note (notes usually carry the figure's own numbers). A
 * preview shown on screen is never exported.
 */
import type { Column } from '@/charts/types'

export const WITHHELD_COLUMNS: Column[] = [
  { key: 'status', label: 'Status', format: 'text' },
  { key: 'reason', label: 'Why, and how to raise it', format: 'text' },
]

/** The single row a withheld figure exports. */
export function withheldRows(status: string, reason: string): Record<string, unknown>[] {
  return [{ status, reason }]
}

/** Why a figure is held back: the status line, what holds it back and how to raise it. */
export interface WithheldReason {
  title: string
  body: string
  raise?: string | null
}

/** The rows, columns and note a figure registers with its view and writes to every export. */
export interface FigureExport {
  columns: readonly Column[]
  rows: readonly Record<string, unknown>[]
  /** Undefined while withheld: a note such as "company median 52 d" would leak the hidden number. */
  note: string | undefined
  withheld: boolean
}

/** A figure's export payload: its own data, or, below the data standard, only the reason. */
export function figureExport(
  fig: { columns: readonly Column[]; rows: readonly object[]; note?: string },
  held: WithheldReason | null,
): FigureExport {
  if (!held)
    return {
      columns: fig.columns,
      rows: fig.rows as readonly Record<string, unknown>[],
      note: fig.note,
      withheld: false,
    }
  return {
    columns: WITHHELD_COLUMNS,
    rows: withheldRows(held.title, [held.body, held.raise].filter(Boolean).join(' ')),
    note: undefined,
    withheld: true,
  }
}

/** The note an export may print: none for a withheld table, whatever the caller passed. */
export const exportNote = (t: { note?: string; withheld?: boolean }): string | undefined =>
  t.withheld ? undefined : t.note || undefined
