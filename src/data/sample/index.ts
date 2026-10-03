/**
 * Deterministic sample company. STUB: replaced by the sample-data generator.
 */
import type { Datasets, ISODate } from '../schema'

/** Fixed reference date for the sample company: the end of Q3 2026. */
export const SAMPLE_AS_OF: ISODate = '2026-09-30'
export const SAMPLE_COMPANY = 'Northgate Semiconductor'

export function generateSample(): Datasets {
  return {
    employees: [],
    jobChanges: [],
    requisitions: [],
    candidates: [],
    cases: [],
    transactions: [],
    reviews: [],
    succession: [],
    learning: [],
    comp: [],
  }
}
