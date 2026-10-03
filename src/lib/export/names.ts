/**
 * File names and the context lines stamped on exports (title rows, slide footers, image footers).
 * `ExportMeta.asOf` may arrive as an ISO date ("2026-09-30") or already formatted ("30 Sep 2026");
 * both are accepted.
 */
import type { ExportMeta } from '@/charts/types'
import { formatDate, isValidDate } from '@/lib/dates'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** ISO date for an as-of stamp given as "2026-09-30" or "30 Sep 2026"; null when neither. */
export function asOfIso(asOf: string): string | null {
  const s = asOf.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && isValidDate(s.slice(0, 10))) return s.slice(0, 10)
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(s)
  if (!m) return null
  const month = MONTHS.indexOf(m[2].toLowerCase())
  if (month < 0) return null
  const iso = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return isValidDate(iso) ? iso : null
}

/** "30 Sep 2026" whichever way the as-of date was given. */
export function asOfLabel(asOf: string): string {
  const iso = asOfIso(asOf)
  return iso ? formatDate(iso) : asOf
}

/** Lowercase, ASCII, dash-separated; safe in a file name on every OS. */
export function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
}

/** `census-<view>-<name>-<as-of>`, e.g. "census-recruiting-rec-time-to-fill-2026-09-30". */
export function fileStem(meta: Pick<ExportMeta, 'view' | 'asOf'>, name = ''): string {
  const stamp = asOfIso(meta.asOf) ?? slug(meta.asOf)
  return ['census', slug(meta.view), slug(name), stamp].filter(Boolean).join('-')
}

/** "Whole company · 1 Oct 2025 – 30 Sep 2026 · As of 30 Sep 2026" */
export function metaLine(meta: Pick<ExportMeta, 'scope' | 'window' | 'asOf'>): string {
  return [meta.scope, meta.window, `As of ${asOfLabel(meta.asOf)}`].filter(Boolean).join(' · ')
}

/** "Company confidential · Sample data" */
export function stampLine(meta: Pick<ExportMeta, 'isSample'>): string {
  return meta.isSample ? 'Company confidential · Sample data' : 'Company confidential'
}

/** "Recruiting · Pipeline" */
export function viewLine(meta: Pick<ExportMeta, 'view' | 'tab'>): string {
  return [meta.view, meta.tab].filter(Boolean).join(' · ')
}

/** Footer under exported chart images: "Whole company · As of 30 Sep 2026 · Census · Sample data" */
export function imageFooter(meta: Pick<ExportMeta, 'scope' | 'asOf' | 'isSample'>): string {
  return [meta.scope, `As of ${asOfLabel(meta.asOf)}`, 'Census', meta.isSample ? 'Sample data' : '']
    .filter(Boolean)
    .join(' · ')
}
