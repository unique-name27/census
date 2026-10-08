/**
 * Manager mode's lock, kept at its old path while callers move to `./scopes` (docs/ROLES-V2.md
 * 8.1): the lock is the `org` scope, and `clampFilters` is the one clamp for every scope kind.
 */
export {
  clampFilters,
  emptyLock,
  heldLock,
  isPickableManager,
  leaderInLock,
  leaderReplaced,
  type ManagerLock,
  MIN_REPORTS,
  managerLock,
  orgScope,
} from './scopes'
