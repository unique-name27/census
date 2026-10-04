/**
 * How the source systems write values: date styles, yes/no flags, level codes and site names.
 * Each formatter takes the clean sample value and returns the cell as the export would hold it.
 */
import type { ISODate, ISODateTime, Level } from '../../schema'

/** A spreadsheet cell as an export holds it. */
export type Cell = string | number | boolean | null

/** One column of an extract: its header and how a row's cell is written. */
export interface Column<R> {
  header: string
  cell: (row: R, index: number) => Cell
}

/** Header row first, then one array per record. */
export function toAoa<R>(rows: readonly R[], columns: readonly Column<R>[]): Cell[][] {
  const out: Cell[][] = [columns.map((c) => c.header)]
  rows.forEach((r, i) => {
    out.push(columns.map((c) => c.cell(r, i)))
  })
  return out
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parts = (iso: string) => ({ y: iso.slice(0, 4), m: iso.slice(5, 7), d: iso.slice(8, 10) })

/** 07/14/2026 (US, zero-padded). */
export const mmddyyyy = (iso: ISODate | null | undefined): string | null => {
  if (!iso) return null
  const { y, m, d } = parts(iso)
  return `${m}/${d}/${y}`
}

/** 7/14/2026 (US, as Excel shows it by default). */
export const mdy = (iso: ISODate | null | undefined): string | null => {
  if (!iso) return null
  const { y, m, d } = parts(iso)
  return `${+m}/${+d}/${y}`
}

/** 14/07/2026 (day first). */
export const ddmmyyyy = (iso: ISODate | null | undefined): string | null => {
  if (!iso) return null
  const { y, m, d } = parts(iso)
  return `${d}/${m}/${y}`
}

/** 14-Jul-2026. */
export const dMonY = (iso: ISODate | null | undefined): string | null => {
  if (!iso) return null
  const { y, m, d } = parts(iso)
  return `${d}-${MONTHS[+m - 1]}-${y}`
}

/** 2026-07-14 09:32:00 (help-desk timestamps). */
export const stamp = (dt: ISODateTime | null | undefined): string | null =>
  dt ? `${dt.slice(0, 10)} ${dt.slice(11, 16)}:00` : null

/** Y / N, blank when unknown. */
export const yn = (b: boolean | null | undefined): string | null => (b == null ? null : b ? 'Y' : 'N')

/** IC4 for L4; manager and executive codes as they are. */
export const levelCode = (level: Level | null | undefined): string | null =>
  level == null ? null : level.startsWith('L') ? `IC${level.slice(1)}` : level

/** Sites with the region suffix an ATS adds ("San Jose, CA"), and the old name for Bengaluru. */
const SITE_LABEL: Record<string, string> = {
  'San Jose': 'San Jose, CA',
  Austin: 'Austin, TX',
  Raleigh: 'Raleigh, NC',
  Boulder: 'Boulder, CO',
  Seattle: 'Seattle, WA',
  Toronto: 'Toronto, ON',
  Vancouver: 'Vancouver, BC',
  Bengaluru: 'Bangalore, India',
  Hsinchu: 'Hsinchu, Taiwan',
  Shanghai: 'Shanghai, China',
  Munich: 'Munich, Germany',
  Haifa: 'Haifa, Israel',
  'Ho Chi Minh City': 'HCMC, Vietnam',
}

export const siteLabel = (site: string | null | undefined): string | null =>
  site == null ? null : (SITE_LABEL[site] ?? site)

/** "Thu Trang Vo" → ["Thu Trang", "Vo"]: the last word is the last name. */
export function splitName(name: string): [string, string] {
  const at = name.lastIndexOf(' ')
  return at < 0 ? [name, ''] : [name.slice(0, at), name.slice(at + 1)]
}
