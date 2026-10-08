/**
 * The Action center engine (pure, no React): collect every view's open items, mark them handled
 * or snoozed, filter, group by owner, count, write notes and rows. See docs/VIEWS.md, Action center.
 */
export {
  type BelowStandard,
  browserIdle,
  type CollectError,
  type Collected,
  CollectSuperseded,
  cachedCollect,
  collectActions,
  collectPlan,
  compareActions,
  foldMatters,
  type HiddenReason,
  type Idle,
  isPrivateItem,
  isSuperseded,
  isTeamName,
  type OpenAction,
  runView,
  scheduleCollect,
  type TeamRelation,
  usesOf,
  type ViewRun,
  type ViewSource,
  withoutLeader,
  withoutScope,
} from './collect'
export { DUE_BUCKETS, type DueBucket, daysToDue, dueBucket, dueBucketLabel, dueText } from './due'
export {
  type ActionFilters,
  filterActions,
  isFiltering,
  matchesFilters,
  NO_FILTERS,
  type WaitingOn,
} from './filters'
export { groupByOwner, type OwnerBlock, type OwnerGroup, ownerCount } from './group'
export { KIND_LABEL, kindOf } from './kind'
export {
  hashKey,
  type ItemStatus,
  isOpen,
  type Mark,
  type Marks,
  type MarksState,
  type MarkTarget,
  markKeyOf,
  marksFile,
  mergeMarks,
  readMarksFile,
  STORAGE_KEY,
  snapshotOf,
  statusOf,
  withHandled,
  withReopened,
  withSnapshot,
  withSnoozed,
} from './marks'
export { askOf, composeNote, DEFAULT_ASK, greeting, NAGGING, NOTE_MAX_ITEMS } from './note'
export {
  countedOf,
  lensFor,
  listHeader,
  listsLine,
  NEEDS_SHOWN,
  nothingWaiting,
  practiceOf,
  type RoleView,
  roleView,
  showsLists,
  whereOf,
} from './roles'
export {
  countOf,
  foldRoleLists,
  isRollup,
  kindsOf,
  ownersOf,
  QUEUE_FOLD_AT,
  ROLLUP_PREFIX,
  type RollupSpec,
  rollupOf,
  unfold,
} from './rollups'
export {
  drillRows,
  EXPORT_COLUMNS,
  type ExportRow,
  exportRows,
  itemsDrill,
  SEVERITY_ORDER,
  SEVERITY_WORD,
  statusText,
} from './rows'
export { type ActionSettings, settingsOf } from './settings'
export { BLOCKS_PERSON, blocksPerson, isBlockedTask, severityOf } from './severity'
export {
  type ActionCounts,
  actionKpis,
  countActions,
  type OwnerDueRow,
  type OwnerTableRow,
  ownerDueRows,
  ownerTableRows,
  severityLine,
  type ViewCountRow,
  viewRows,
} from './summary'
