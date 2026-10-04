/**
 * Which sheet goes to which dataset, and in what order the upload dialog walks them.
 *
 * Every sheet of every dropped file is matched to its most likely dataset. Weak matches are set
 * to "Skip" so nothing lands in the wrong place without a person choosing it. Employees always
 * go first, so requisitions, reviews, compensation and the rest link to the new roster.
 */
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'

/** Matches at or above this are imported unless the person changes them. */
export const STRONG_MATCH = 0.6
/** Below this a sheet probably isn't Census data at all. */
export const WEAK_MATCH = 0.35

export interface GuessLike {
  key: DatasetKey
  confidence: number
}

export interface SheetInfo {
  fileName: string
  sheetName: string
  rows: number
  /** All ten datasets, best first (from `guessDataset`). */
  guesses: readonly GuessLike[]
}

export type PlanReason =
  /** Matched by its columns. */
  | 'detected'
  /** A possible match that the person should confirm. */
  | 'uncertain'
  /** Doesn't look like any dataset; skipped unless the person picks one. */
  | 'not-census'
  /** The person started from a dataset's Upload button and this is the best sheet for it. */
  | 'target'
  /** The person started from another dataset's Upload button. */
  | 'not-target'

export interface PlannedSheet extends SheetInfo {
  /** Stable id within one upload ("0:1" = file 0, sheet 1). */
  id: string
  /** Dataset to import into; null skips the sheet. */
  dataset: DatasetKey | null
  reason: PlanReason
}

export type MatchStrength = 'strong' | 'possible' | 'weak'

export function matchStrength(confidence: number): MatchStrength {
  return confidence >= STRONG_MATCH ? 'strong' : confidence >= WEAK_MATCH ? 'possible' : 'weak'
}

export const MATCH_WORD: Record<MatchStrength, string> = {
  strong: 'Strong match',
  possible: 'Possible match',
  weak: 'Weak match',
}

export function confidenceFor(guesses: readonly GuessLike[], key: DatasetKey | null): number | null {
  if (!key) return null
  return guesses.find((g) => g.key === key)?.confidence ?? null
}

const datasetRank = (k: DatasetKey | null) => (k === 'employees' ? 0 : k ? 1 : 2)

/** Employees first, then the other sheets that will be imported, then the ones set to skip; file order within each. */
export function orderPlan<T extends { dataset: DatasetKey | null }>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => datasetRank(a.item.dataset) - datasetRank(b.item.dataset) || a.i - b.i)
    .map((x) => x.item)
}

/**
 * Assign a dataset to every sheet. With `target` (the Upload button on one dataset's row), the
 * sheet that fits that dataset best goes to it and every other sheet is skipped.
 */
export function planSheets(
  files: readonly { fileName: string; sheets: readonly Omit<SheetInfo, 'fileName'>[] }[],
  target?: DatasetKey | null,
): PlannedSheet[] {
  const all: PlannedSheet[] = files.flatMap((file, fi) =>
    file.sheets.map((s, si) => {
      const best = s.guesses[0]
      const strength = best ? matchStrength(best.confidence) : 'weak'
      return {
        ...s,
        fileName: file.fileName,
        id: `${fi}:${si}`,
        dataset: best && strength !== 'weak' ? best.key : null,
        reason: strength === 'strong' ? 'detected' : strength === 'possible' ? 'uncertain' : 'not-census',
      } satisfies PlannedSheet
    }),
  )
  if (!target) return orderPlan(all)
  let bestId: string | null = null
  let bestScore = -1
  for (const s of all) {
    const c = confidenceFor(s.guesses, target) ?? 0
    if (c > bestScore) {
      bestScore = c
      bestId = s.id
    }
  }
  return orderPlan(
    all.map(
      (s): PlannedSheet =>
        s.id === bestId
          ? { ...s, dataset: target, reason: 'target' }
          : { ...s, dataset: null, reason: 'not-target' },
    ),
  )
}

export type SheetStatus = 'pending' | 'applied' | 'skipped'

/** Sheets still waiting that are set to a dataset (sheets set to skip are never walked to). */
export function pendingImports(
  items: readonly { id: string; dataset: DatasetKey | null }[],
  status: Readonly<Record<string, SheetStatus>>,
  currentId?: string | null,
): { id: string; dataset: DatasetKey | null }[] {
  return items.filter(
    (s) => s.id !== currentId && s.dataset != null && (status[s.id] ?? 'pending') === 'pending',
  )
}

/**
 * The next sheet to show after `currentId`: a pending Employees sheet first (so the roster lands
 * before anything that links to it), then pending sheets in plan order. Sheets set to skip stay
 * listed (and can be opened) but the walk does not stop on them.
 */
export function nextPending(
  items: readonly { id: string; dataset: DatasetKey | null }[],
  status: Readonly<Record<string, SheetStatus>>,
  currentId?: string | null,
): string | null {
  const pending = pendingImports(items, status, currentId)
  return (pending.find((s) => s.dataset === 'employees') ?? pending[0])?.id ?? null
}

/** Other sheets in the same upload that are set to the same dataset (the later one applied wins). */
export function sameTarget(
  items: readonly { id: string; dataset: DatasetKey | null }[],
  status: Readonly<Record<string, SheetStatus>>,
  id: string,
): string[] {
  const me = items.find((s) => s.id === id)
  if (!me?.dataset) return []
  return items
    .filter((s) => s.id !== id && s.dataset === me.dataset && status[s.id] !== 'skipped')
    .map((s) => s.id)
}

/** Datasets in manifest order, for the "import as" picker. */
export const DATASET_ORDER: readonly DatasetKey[] = DATASET_KEYS

/**
 * The sheets of a workbook worth walking: not the template's help sheets, and not sheets with
 * no rows (a blank template has headers on every sheet). `noRows` names the ones left out.
 */
export function usableSheets<S extends { name: string; rows: readonly unknown[] }>(
  book: { sheets: readonly S[]; emptySheets: readonly string[] },
  isHelpSheet: (name: string) => boolean,
): { sheets: S[]; noRows: string[] } {
  const content = book.sheets.filter((s) => !isHelpSheet(s.name))
  return {
    sheets: content.filter((s) => s.rows.length > 0),
    noRows: [
      ...content.filter((s) => s.rows.length === 0).map((s) => s.name),
      ...book.emptySheets.filter((n) => !isHelpSheet(n)),
    ],
  }
}

/** Every sheet of an upload is a weak match for every dataset: it isn't Census data. */
export function isNotCensus(sheets: readonly { reason: PlanReason }[]): boolean {
  return sheets.length > 0 && sheets.every((s) => s.reason === 'not-census')
}
