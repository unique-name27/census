/**
 * Excel/CSV import for Census: parse a file, recognize each sheet's dataset, map its columns,
 * normalize values into the schema's vocabularies and report every change.
 *
 *   const book = readWorkbook(buffer, file.name)
 *   const sheet = book.sheets[0]
 *   const [best] = guessDataset(sheet)
 *   const def = datasetDef(best.key)
 *   const saved = await loadProfile(best.key, sheet.headers)
 *   const { mapping, options } = saved
 *     ? applyProfile(saved, sheet.headers, def)
 *     : { mapping: autoMap(sheet.headers, sheet.rows, def, loadLearnedSynonyms(best.key)), options: {} }
 *   const result = applyMapping({ sheet, def, mapping, roster, options })
 *   summarizeIssues(result.issues)
 */
export { type ApplyArgs, applyMapping, suggestOptions } from './apply'
export { autoMap, confidenceOf, MIN_SCORE, rankHeaders, withChoice } from './automap'
export { canonicalText, normalizeCurrency } from './canonical'
export { cycleDateFromName, DOCUMENTED_DEFAULTS, REFERENCE_FX_TO_USD, UNKNOWN } from './defaults'
export { guessDataset, isTemplateHelpSheet, TEMPLATE_HELP_SHEETS } from './detect'
export { ACTION_LABELS, ISSUE_COLUMNS, issueTableRows, summarizeIssues } from './issues'
export { linkManagers, nameKey } from './managers'
export {
  type Coerced,
  coerceBoolean,
  coerceDate,
  coerceDateTime,
  coerceLevel,
  coerceMoney,
  coerceNumber,
  coercePercent,
  coerceRating,
  coerceValue,
  detectDateOrder,
  detectPercentWhole,
} from './normalize'
export { readWorkbook, sheetFromRows, WorkbookReadError } from './parse'
export {
  applyProfile,
  deleteProfile,
  forgetLearnedSynonyms,
  headerFingerprint,
  learnSynonym,
  loadLearnedSynonyms,
  loadProfile,
  type MappingProfile,
  makeProfile,
  saveProfile,
} from './profiles'
export { buildTemplateWorkbook, exportDatasetWorkbook, type TemplateOptions } from './templates'
export { normalizeHeader, normText } from './text'
export type * from './types'
export { summarizeValues, type ValueSummary } from './values'
export { normalizeEnumValue, normalizeLevel } from './vocab'
