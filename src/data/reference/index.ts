/**
 * Reference mappings and the structure of the categories in the data: which departments sit
 * under which business units, which job families under which functions, and the values of every
 * categorical field. `applyReferenceMappings` runs before every metric.
 */
export { applyReferenceMappings, targetRefs, validateMapping } from './apply'
export {
  CATEGORICAL_REFS,
  CATEGORIES,
  type CategoryDef,
  type CategorySection,
  categoryById,
  categoryOf,
} from './categories'
export { describeMapping } from './describe'
export {
  type CategoryValue,
  type DepartmentConflict,
  type FamilyConflict,
  type FamilyLevelCell,
  type FieldInventory,
  type FunctionEdge,
  type InferOptions,
  inferStructure,
  inventory,
  type LevelOutlier,
  type LocationEdge,
  type OrgEdge,
  type Person,
  type RawSpelling,
  type ReqDepartmentGap,
  type Split,
  type StructureReport,
  type TitleEdge,
} from './infer'
export {
  type AddResult,
  addMapping,
  canUndo,
  EMPTY_REFERENCE,
  isReferenceState,
  MAX_AUDIT,
  removeMapping,
  undoChange,
} from './state'
export type * from './types'
