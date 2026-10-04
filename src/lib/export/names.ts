/**
 * File names and the context lines stamped on exports (title rows, slide footers, image footers).
 * `ExportMeta.asOf` may arrive as an ISO date ("2026-09-30") or already formatted ("30 Sep 2026");
 * both are accepted.
 */
import type { ExportMeta } from '@/charts/types'
import { type DataStandard, STANDARD_LABEL, TIER_LABEL, type Tier } from '@/data/quality/tier'
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

/**
 * `census-<view>-<name>-<as-of>`, e.g. "census-recruiting-time-to-fill-2026-09-30". The view is
 * named once: a name that starts with the view (its label or its key, as figure ids do, e.g.
 * "recruiting-time-to-fill" or "hrbp-attrition") drops that prefix.
 */
export function fileStem(meta: Pick<ExportMeta, 'view' | 'viewKey' | 'asOf'>, name = ''): string {
  const stamp = asOfIso(meta.asOf) ?? slug(meta.asOf)
  const view = slug(meta.view)
  let part = slug(name)
  for (const prefix of [view, meta.viewKey ? slug(meta.viewKey) : ''])
    if (prefix && (part === prefix || part.startsWith(`${prefix}-`))) {
      part = part.slice(prefix.length + 1)
      break
    }
  return ['census', view, part, stamp].filter(Boolean).join('-')
}

/**
 * Export context for a view that reads no people data (AI in HR lists agents): no scope, window,
 * as-of date, data standard, company or "Sample data" stamp, since none of them describe what is
 * exported. Every line built from the meta then leaves those parts out.
 */
export function withoutDataContext(meta: ExportMeta): ExportMeta {
  const { standard: _standard, ...rest } = meta
  return { ...rest, scope: '', window: '', asOf: '', isSample: false, company: '' }
}

/** False for the meta of a view that reads no people data (see `withoutDataContext`). */
export const hasDataContext = (meta: Pick<ExportMeta, 'scope' | 'window' | 'asOf'>): boolean =>
  !!(meta.scope || meta.window || meta.asOf)

/** "As of 30 Sep 2026", or '' when there is no as-of date. */
const asOfPart = (asOf: string) => (asOf ? `As of ${asOfLabel(asOf)}` : '')

/** "Whole company · 1 Oct 2025 – 30 Sep 2026 · As of 30 Sep 2026" ('' for a view with no data). */
export function metaLine(meta: Pick<ExportMeta, 'scope' | 'window' | 'asOf'>): string {
  return [meta.scope, meta.window, asOfPart(meta.asOf)].filter(Boolean).join(' · ')
}

/** "Company confidential · Sample data" */
export function stampLine(meta: Pick<ExportMeta, 'isSample'>): string {
  return meta.isSample ? 'Company confidential · Sample data' : 'Company confidential'
}

/** "Recruiting · Pipeline" */
export function viewLine(meta: Pick<ExportMeta, 'view' | 'tab'>): string {
  return [meta.view, meta.tab].filter(Boolean).join(' · ')
}

/**
 * Footer under exported chart images: "Whole company · As of 30 Sep 2026 · Production standard ·
 * Tier: Gold · Census · Sample data" (the standard and the tier when known), as sheets and slides
 * state them.
 */
export function imageFooter(
  meta: Pick<ExportMeta, 'scope' | 'asOf' | 'isSample' | 'standard'>,
  tier?: Tier | null,
): string {
  return [
    meta.scope,
    asOfPart(meta.asOf),
    meta.standard ? `${STANDARD_LABEL[meta.standard]} standard` : '',
    tier ? `Tier: ${TIER_LABEL[tier]}` : '',
    'Census',
    meta.isSample ? 'Sample data' : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const STANDARD_RANGE: Record<DataStandard, string> = {
  gold: 'gold only',
  silver: 'silver and up',
  bronze: 'bronze and up',
}

/** "Data standard: Validated (silver and up)". */
export function standardLine(standard: DataStandard): string {
  return `Data standard: ${STANDARD_LABEL[standard]} (${STANDARD_RANGE[standard]})`
}

/**
 * The data line of an export: the standard in force and the tier of what is exported, e.g.
 * "Data standard: Production (gold only) · Tier: Silver, not shown under this standard".
 * Null when neither is known (exports from outside the views).
 */
export function dataLine(
  standard: DataStandard | undefined,
  tier?: Tier | null,
  withheld?: boolean,
): string | null {
  const parts: string[] = []
  if (standard) parts.push(standardLine(standard))
  if (tier) parts.push(`Tier: ${TIER_LABEL[tier]}${withheld ? ', not shown under this standard' : ''}`)
  return parts.length ? parts.join(' · ') : null
}
