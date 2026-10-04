/**
 * The messy sample (docs/DATA-TIERS.md, "Sample data that sucks"): raw extracts with foreign
 * headers, odd spellings and gaps for the bronze and silver datasets, run through the real
 * import pipeline, and starter certifications for the gold ones. The app loads it through
 * `./load` (see `main.tsx`); this barrel is for tests and tools.
 */
export type { RawExtract } from './extract'
export { FUNCTION_BY_UNIT, jobFunctionOf, withJobFunction } from './jobFunction'
export {
  CERTIFIED,
  CONFIRMED,
  FILES,
  RAW_DATASETS,
  type RawDataset,
  SAMPLE_TIERS,
  type StartTier,
} from './plan'
export {
  buildMessySample,
  completeMessySample,
  type ImportedExtract,
  importExtract,
  type MessySample,
  rawExtract,
  sameRows,
} from './seed'
export { PLANTED, type StarterSample, starterSample } from './starter'
