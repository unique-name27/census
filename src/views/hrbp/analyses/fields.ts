/**
 * What the loaded data holds, for the analyses' `ready` and `missing` (docs/ANALYSES.md, 1.6 and
 * part 6). A field is present when any row of the company's data has it: the quality index's
 * own test (`fieldTier` is 'none' only when no row fills it), so the Data room and the analyses
 * agree. Company-wide on purpose: a filter never turns "add this column" on. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { DatasetKey } from '@/data/schema'
import type { Missing } from './types'

/** Some row of the company's data fills the field. */
export const present = (ctx: Pick<AnalyticsContext, 'quality'>, ref: FieldRef): boolean =>
  ctx.quality.fieldTier(ref) !== 'none'

/** The dataset has rows. */
export const loaded = (ctx: Pick<AnalyticsContext, 'all'>, key: DatasetKey): boolean =>
  ctx.all[key].length > 0

/** The missing entry a figure needs, or undefined when its data is there. */
export const missingFor = (missing: readonly Missing[], figureId: string): Missing | undefined =>
  missing.find((m) => m.figures.includes(figureId))

/** "University, Degree level and Field of study". */
export const andList = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
