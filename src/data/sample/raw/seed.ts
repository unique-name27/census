/**
 * The messy sample through the real import pipeline: each raw extract is read the way the Data
 * room reads an upload (sheet → auto-map → apply, with the roster for linking), and its version
 * keeps the original sheet, the mapping and the import log.
 */
import { applyMapping } from '../../import/apply'
import { autoMap } from '../../import/automap'
import { sheetFromRows } from '../../import/sheet'
import type { ImportResult, Mapping, ParsedSheet } from '../../import/types'
import type { SampleSeed, SampleSeedEntry } from '../../quality/seed'
import { type Candidate, type DatasetKey, type Datasets, datasetDef, type Employee } from '../../schema'
import { cachedSample } from '..'
import type { RawExtract } from './extract'
import { budgetExtract } from './extracts/budget'
import { candidatesExtract } from './extracts/candidates'
import { casesExtract } from './extracts/cases'
import { hiringPlanExtract } from './extracts/hiringPlan'
import { jobChangesExtract } from './extracts/jobChanges'
import { learningExtract } from './extracts/learning'
import { onboardingTasksExtract } from './extracts/onboardingTasks'
import { requisitionsExtract } from './extracts/requisitions'
import { rightToWorkExtract } from './extracts/rightToWork'
import { successionExtract } from './extracts/succession'
import { surveyItemsExtract, surveyResponsesExtract } from './extracts/surveys'
import { transactionsExtract } from './extracts/transactions'
import { RAW_DATASETS, type RawDataset } from './plan'
import { certify, goldRows, rawEntryMeta, type StarterSample } from './starter'

const EXTRACTS: { [K in RawDataset]: (base: Datasets) => RawExtract<K> } = {
  jobChanges: jobChangesExtract,
  requisitions: requisitionsExtract,
  candidates: candidatesExtract,
  cases: casesExtract,
  transactions: transactionsExtract,
  succession: successionExtract,
  learning: learningExtract,
  hiringPlan: hiringPlanExtract,
  onboardingTasks: onboardingTasksExtract,
  rightToWork: rightToWorkExtract,
  surveyResponses: surveyResponsesExtract,
  surveyItems: surveyItemsExtract,
  budget: budgetExtract,
}

/** The raw extract of one dataset, built from the clean sample (with the certified gaps applied). */
export const rawExtract = <K extends RawDataset>(key: K, base: Datasets): RawExtract<K> =>
  EXTRACTS[key](base) as RawExtract<K>

export interface ImportedExtract<K extends DatasetKey = DatasetKey> {
  extract: RawExtract<K>
  sheet: ParsedSheet
  mapping: Mapping
  result: ImportResult<K>
}

/**
 * Read an extract the way the Data room reads an upload: header detection, auto-mapping, import.
 * Accepted candidates give onboarding tasks keyed by application ID their start dates.
 */
export function importExtract<K extends DatasetKey>(
  extract: RawExtract<K>,
  roster: readonly Employee[],
  candidates?: readonly Candidate[],
): ImportedExtract<K> {
  const sheet = sheetFromRows(extract.sheetName, extract.aoa)
  if (!sheet) throw new Error(`The ${extract.dataset} extract has no rows.`)
  const def = datasetDef(extract.dataset)
  const mapping = autoMap(sheet.headers, sheet.rows, def)
  const result = applyMapping<K>({
    sheet,
    def,
    mapping,
    roster: extract.dataset === 'employees' ? undefined : roster,
    candidates: extract.dataset === 'onboardingTasks' ? candidates : undefined,
  })
  return { extract, sheet, mapping, result }
}

/** True when two row lists hold the same values, field by field (a blank and a missing field match). */
export function sameRows(a: readonly object[], b: readonly object[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as Record<string, unknown>
    const y = b[i] as Record<string, unknown>
    if (x === y) continue
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)]))
      if ((x[k] ?? null) !== (y[k] ?? null)) return false
  }
  return true
}

/**
 * A raw dataset's seed entry from its import. When the import gives the same rows as the starter
 * state, the starter's rows are kept, so loading the import changes no number on screen.
 */
function importedEntry(
  key: RawDataset,
  imp: ImportedExtract,
  starterRows?: readonly object[],
): SampleSeedEntry {
  const rows = starterRows && sameRows(starterRows, imp.result.rows) ? starterRows : imp.result.rows
  return {
    ...rawEntryMeta(key),
    rows: rows as SampleSeedEntry['rows'],
    raw: imp.sheet,
    mapping: imp.mapping,
    options: imp.result.used,
    issues: imp.result.issues,
    rowsIn: imp.result.stats.rowsIn,
  }
}

export interface MessySample {
  /** Every dataset as the app loads it. */
  data: Datasets
  seed: SampleSeed
  imports: { [K in RawDataset]: ImportedExtract<K> }
}

/** The whole messy sample in one go (tests, and anything that needs the import logs at once). */
export function buildMessySample(base: Datasets = cachedSample()): MessySample {
  const gold = goldRows(base)
  const imports: Partial<Record<RawDataset, ImportedExtract>> = {}
  const seed: SampleSeed = { employees: { rows: gold.employees }, comp: { rows: gold.comp } }
  const entries = seed as Partial<Record<DatasetKey, SampleSeedEntry>>
  const data: Record<DatasetKey, unknown> = { ...gold }
  for (const key of RAW_DATASETS) {
    const imp: ImportedExtract = importExtract(rawExtract(key, gold), gold.employees, gold.candidates)
    imports[key] = imp
    entries[key] = importedEntry(key, imp)
    data[key] = imp.result.rows
  }
  const loaded = data as unknown as Datasets
  certify(seed, loaded)
  return { data: loaded, seed, imports: imports as MessySample['imports'] }
}

/** Yield until the browser is idle (at most 500 ms), so the import runs after first paint and input. */
const nextTask = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 500 })
    else setTimeout(resolve, 0)
  })

/**
 * Import the raw extracts behind a starter state, one dataset per task so the page stays
 * responsive, and return the full seed (the starter's rows kept wherever the import agrees).
 */
export async function completeMessySample(
  starter: StarterSample,
  base: Datasets = cachedSample(),
): Promise<SampleSeed> {
  const gold = goldRows(base)
  const seed: SampleSeed = { ...starter.seed }
  const entries = seed as Partial<Record<DatasetKey, SampleSeedEntry>>
  for (const key of RAW_DATASETS) {
    await nextTask()
    const imp: ImportedExtract = importExtract(
      rawExtract(key, gold),
      starter.data.employees,
      starter.data.candidates,
    )
    entries[key] = importedEntry(key, imp, starter.data[key])
  }
  return seed
}
