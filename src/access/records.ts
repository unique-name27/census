/**
 * The records guard, kept at its old path while callers move to `./scopes` (docs/ROLES-V2.md 8.1):
 * `inLock`, `rowsInLock` and `personInLock` are `inScope`, `rowsInScope` and `personInScope`, which
 * keep to every scope kind.
 */
export { inLock, inScope, personInLock, personInScope, rowsInLock, rowsInScope } from './scopes'
