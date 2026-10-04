/**
 * The metric dictionary (docs/METRICS.md): types, the assembled catalog, the `ctx.metrics` API,
 * your overrides with their change log, persistence, the settings-file section and the Excel
 * "Metric dictionary" workbook.
 *
 * A view's own `metrics.ts` imports `@/metrics/define` and `@/metrics/types` directly, never this
 * barrel (the barrel loads the catalog, which loads every view's `metrics.ts`).
 */
export {
  defaultMetrics,
  definitionOf,
  definitionsStamp,
  kpiTarget,
  type MetricDefinition,
  mergeDef,
  metricIdOf,
  metricsApi,
  targetStatus,
} from './api'
export { CATALOG, METRICS, metricsOfView, VIEW_METRICS } from './catalog'
export {
  COMP_CYCLE,
  COMP_CYCLE_METRICS,
  compCycleEdits,
  compCycleOf,
  cycleSettingsOf,
  HEALTHY_BAND_PARAM,
  MERIT_BUDGET_PARAM,
  MERIT_GUIDELINE_PARAM,
} from './compCycle'
export { defineMetrics, type MetricInput } from './define'
export {
  buildDictionaryWorkbook,
  type DictionaryMeta,
  type DictionaryRow,
  dictionaryFileName,
  downloadMetricDictionary,
  importDictionary,
  METRICS_SHEET,
  type ParsedDictionary,
  planDictionaryImport,
  readDictionaryWorkbook,
  rejectedText,
  SETTINGS_SHEET,
} from './excel'
export {
  applyImport,
  importMetricsSection,
  importSummary,
  type MetricsFileSection,
  metricsFileSection,
} from './imports'
export {
  applyEdit,
  applyEdits,
  type BatchResult,
  type ChangeOpts,
  canUndo,
  changedFields,
  checkEdit,
  checkTarget,
  cleanOverride,
  comparatorText,
  currentValue,
  defaultComparator,
  defaultValue,
  describeChange,
  EMPTY_METRICS,
  fieldsOf,
  formatFieldValue,
  MAX_LOG,
  MAX_TEXT,
  resetAll,
  resetMetric,
  sameValue,
  sanitizeMetricsState,
  targetDirectionWarning,
  targetText,
  undoChange,
} from './overrides'
export {
  allowedText,
  cloneParam,
  formatParam,
  formatParamNumber,
  isNumericParam,
  isShareParam,
  isWholeParam,
  type ParamCheck,
  paramDecimals,
  paramFormat,
  parseParamInput,
  parseParamNumber,
  RATING_KEYS,
  sameParam,
  validateParam,
} from './params'
export { loadMetrics, METRICS_KEY, migrateCompCycle, saveMetrics } from './persist'
export { ANONYMITY, minGroupOf, PAY_AMOUNTS, PRIVACY_METRICS, PROTECTED_FIELDS } from './privacy'
export { QUALITY_METRICS, QUALITY_RULES, qualityRulesOf } from './quality'
export {
  catalogOf,
  fieldLabel,
  isFieldOf,
  isTextField,
  METRIC_VIEW_LABEL,
  type MetricCatalog,
  paramField,
  paramKeyOf,
  paramOf,
  validateCatalog,
  withRequired,
} from './registry'
export type * from './types'
export { TEXT_FIELDS } from './types'
