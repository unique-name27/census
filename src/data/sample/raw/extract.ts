/**
 * A raw extract: one sheet as a source system exports it, before Census reads it.
 */
import type { DatasetKey } from '../../schema'
import type { Rng } from '../prng'
import type { Cell } from './format'

export interface RawExtract<K extends DatasetKey = DatasetKey> {
  dataset: K
  /** The file the extract would arrive as. */
  fileName: string
  sheetName: string
  /** Rows as the export holds them (title rows, then the header row, then one row per record). */
  aoa: Cell[][]
}

/** Exactly `k` row indexes (fewer when fewer rows qualify), drawn from the rows that pass `test`. */
export function pickRows<R>(
  rows: readonly R[],
  k: number,
  rng: Rng,
  test: (row: R, index: number) => boolean = () => true,
): Set<number> {
  const eligible: number[] = []
  rows.forEach((r, i) => {
    if (test(r, i)) eligible.push(i)
  })
  return new Set(rng.sample(eligible, k))
}
