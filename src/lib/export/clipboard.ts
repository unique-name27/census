/**
 * "Copy table": tab-separated text with a header row, ready to paste into Excel or Google
 * Sheets. Values use the same parse-friendly plain form as CSV (12.4%, ISO dates).
 */
import { plainText, visibleColumns } from './columns'
import { guardFormula } from './csv'
import type { ExportTable } from './types'

/** Tabs and line breaks inside a cell would split it; flatten them to spaces. */
const flatten = (s: string) => guardFormula(s.replace(/[\t\r\n]+/g, ' '))

export function toTsv(table: Pick<ExportTable, 'columns' | 'rows'>, opts: { showPay: boolean }): string {
  const cols = visibleColumns(table.columns, opts.showPay)
  const lines = [cols.map((c) => flatten(c.label)).join('\t')]
  for (const row of table.rows) {
    lines.push(
      cols
        .map((c) => {
          const v = row[c.key]
          const text = plainText(v, c.format)
          return typeof v === 'number' ? text : flatten(text)
        })
        .join('\t'),
    )
  }
  return lines.join('\n')
}

/** Write text to the clipboard; falls back to a hidden textarea where the async API is blocked (file://, older webviews). */
export async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    /* fall through to the legacy path */
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  ta.style.pointerEvents = 'none'
  document.body.append(ta)
  ta.select()
  // execCommand is deprecated but remains the only synchronous clipboard path without permissions.
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('Clipboard is not available')
}

/** Copy a table as TSV. Resolves to the number of data rows copied. */
export async function copyTable(
  table: Pick<ExportTable, 'columns' | 'rows'>,
  opts: { showPay: boolean },
): Promise<number> {
  await writeClipboard(toTsv(table, opts))
  return table.rows.length
}
