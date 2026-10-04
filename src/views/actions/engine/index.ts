/**
 * The Action center engine (pure, no React): collect every view's open items, mark them handled
 * or snoozed, filter, group by owner, count, write notes and rows. See docs/VIEWS.md, Action center.
 */
export {
  type CollectError,
  type Collected,
  collectActions,
  compareActions,
  type HiddenReason,
  isPrivateItem,
  isTeamName,
  type OpenAction,
  type TeamRelation,
  usesOf,
  type ViewSource,
  withoutLeader,
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
export {
  type ItemStatus,
  isOpen,
  type Mark,
  type Marks,
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
