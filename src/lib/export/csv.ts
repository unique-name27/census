/**
 * CSV per RFC 4180 (CRLF rows, quotes doubled, fields quoted when they contain a comma, quote or
 * line break), with a UTF-8 byte-order mark so Excel opens accented names correctly.
 *
 * Cells that a spreadsheet would execute as a formula (leading = + - @ tab or CR) are prefixed
 * with an apostrophe. Numbers are written as numbers and are never prefixed.
 */
import type { ExportMeta } from '@/charts/types'
import { plainText, visibleColumns } from './columns'
import { downloadBlob, MIME } from './download'
import { fileStem, metaLine, stampLine } from './names'
import type { ExportOptions, ExportTable } from './types'

const FORMULA_START = /^[=+\-@\t\r]/

/** Neutralize spreadsheet formula injection in a text cell. */
export function guardFormula(s: string): string {
  return FORMULA_START.test(s) ? `'${s}` : s
}

/** One CSV field: guarded, then quoted if needed. */
export function csvField(s: string): string {
  const v = guardFormula(s)
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export interface CsvOptions {
  /** Lines written above the header row (title, scope, as-of). Off by default to keep the file machine-readable. */
  preamble?: readonly string[]
  /** Prefix a UTF-8 byte-order mark (default true). */
  bom?: boolean
}

export function toCsv(
  table: Pick<ExportTable, 'columns' | 'rows'>,
  opts: { showPay: boolean } & CsvOptions,
): string {
  const cols = visibleColumns(table.columns, opts.showPay)
  const lines: string[] = []
  for (const p of opts.preamble ?? []) lines.push(csvField(p))
  if (opts.preamble?.length) lines.push('')
  lines.push(cols.map((c) => csvField(c.label)).join(','))
  for (const row of table.rows) {
    lines.push(
      cols
        .map((c) => {
          const v = row[c.key]
          const text = plainText(v, c.format)
          return typeof v === 'number' ? text : csvField(text)
        })
        .join(','),
    )
  }
  return `${opts.bom === false ? '' : '﻿'}${lines.join('\r\n')}\r\n`
}

/** Download one table as CSV. With `preamble: true`, title and context lines precede the header. */
export function downloadCsv(
  table: ExportTable,
  meta: ExportMeta,
  opts: ExportOptions & { preamble?: boolean },
): void {
  const preamble = opts.preamble
    ? [table.title ?? table.name, table.subtitle ?? '', metaLine(meta), stampLine(meta)].filter(Boolean)
    : undefined
  const csv = toCsv(table, { showPay: opts.showPay, preamble })
  downloadBlob(new Blob([csv], { type: MIME.csv }), `${opts.fileName ?? fileStem(meta, table.name)}.csv`)
}
