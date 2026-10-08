/**
 * The starter state of the messy sample: every dataset's rows as the import of its raw extract
 * yields them, built straight from the clean sample with the planted problems applied, plus the
 * confirmations and certifications. It costs a few milliseconds, so the app can open on it while
 * the real import of the raw extracts runs (`completeMessySample`), which then adds each
 * version's original sheet, mapping and import log. `raw.test.ts` checks that both give the
 * same rows.
 */
import { computeControlTotal, DEFAULT_TOLERANCE } from '../../quality/rules'
import type { SampleSeed, SampleSeedEntry } from '../../quality/seed'
import type { DatasetKey, Datasets } from '../../schema'
import { cachedSample, SAMPLE_AS_OF } from '..'
import { budgetPlanted } from './extracts/budget'
import { candidatesPlanted } from './extracts/candidates'
import { casesPlanted } from './extracts/cases'
import { hiringPlanPlanted } from './extracts/hiringPlan'
import { jobChangesPlanted } from './extracts/jobChanges'
import { learningPlanted } from './extracts/learning'
import { onboardingTasksPlanted } from './extracts/onboardingTasks'
import { requisitionsPlanted } from './extracts/requisitions'
import { rightToWorkPlanted } from './extracts/rightToWork'
import { successionPlanted } from './extracts/succession'
import { surveyItemsPlanted, surveyResponsesPlanted } from './extracts/surveys'
import { transactionsPlanted } from './extracts/transactions'
import { compWithGaps, employeesWithGaps } from './gold'
import { CERTIFIED, CONFIRMED, FILES, IMPORTED_AT, RAW_DATASETS, type RawDataset } from './plan'

/** The rows each raw extract imports as. */
export const PLANTED: { [K in RawDataset]: (base: Datasets) => Datasets[K] } = {
  jobChanges: jobChangesPlanted,
  requisitions: requisitionsPlanted,
  candidates: candidatesPlanted,
  cases: casesPlanted,
  transactions: transactionsPlanted,
  succession: successionPlanted,
  learning: learningPlanted,
  hiringPlan: hiringPlanPlanted,
  onboardingTasks: onboardingTasksPlanted,
  rightToWork: rightToWorkPlanted,
  surveyResponses: surveyResponsesPlanted,
  surveyItems: surveyItemsPlanted,
  budget: budgetPlanted,
}

export interface StarterSample {
  /** Every dataset as the app shows it. */
  data: Datasets
  seed: SampleSeed
}

type Entries = Partial<Record<DatasetKey, SampleSeedEntry>>

/** File, load time and confirmation of a raw dataset's version (no sheet or import log yet). */
export function rawEntryMeta(key: RawDataset): SampleSeedEntry {
  const confirmed = CONFIRMED[key]
  return {
    ...FILES[key],
    importedAt: IMPORTED_AT[key],
    ...(confirmed ? { mappingConfirmed: confirmed } : {}),
  }
}

/** Starter certifications, with control totals stated the way the owner's report states them. */
export function certify(seed: SampleSeed, data: Datasets): void {
  const entries = seed as Entries
  for (const key of Object.keys(CERTIFIED) as DatasetKey[]) {
    const cert = CERTIFIED[key]
    if (!cert) continue
    const controlTotals = cert.controlTotals.map((t) => {
      const actual = computeControlTotal(t.metric, data, key, SAMPLE_AS_OF) ?? 0
      return {
        label: t.label,
        metric: t.metric,
        expected: Math.round(actual / t.roundTo) * t.roundTo,
        tolerance: DEFAULT_TOLERANCE,
      }
    })
    entries[key] = {
      ...entries[key],
      certification: { by: cert.by, at: cert.at, note: cert.note, controlTotals },
    }
  }
}

/** The certified datasets with their gaps: exit reasons not migrated, market medians not matched. */
export function goldRows(base: Datasets): Datasets {
  return { ...base, employees: employeesWithGaps(base.employees), comp: compWithGaps(base.comp) }
}

/** The starter state, built from the clean sample (the generated one by default). */
export function starterSample(base: Datasets = cachedSample()): StarterSample {
  const gold = goldRows(base)
  const seed: SampleSeed = { employees: { rows: gold.employees }, comp: { rows: gold.comp } }
  const entries = seed as Entries
  const data: Record<DatasetKey, unknown> = { ...gold }
  for (const key of RAW_DATASETS) {
    const rows = PLANTED[key](gold)
    data[key] = rows
    entries[key] = { ...rawEntryMeta(key), rows } as SampleSeedEntry
  }
  const loaded = data as unknown as Datasets
  certify(seed, loaded)
  return { data: loaded, seed }
}
