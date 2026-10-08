/**
 * Action center (docs/VIEWS.md, Action center): every open item from every view's
 * `actions(ctx)`, grouped by owner, with Copy note, Mark handled and Snooze. Reached from the
 * masthead's Actions button (route `#actions`), not a folder tab.
 *
 * The exports are the contract: `ActionCenter` (the page body; the shell renders the filter row
 * above it inside a figure registry), `useOpenActionCount()` (the masthead count; null until
 * known) and `useRoleItems()` (the mode's Needs attention and Waiting on others over the items
 * open in this browser, for the homes, the Scorecard and My team: one split for every reader,
 * docs/ROLES-V2.md 6.2). Views must not import this module from their own `index.tsx`: it reads
 * the view registry, which imports every view.
 */
export { ActionCenter } from './ui/ActionCenter'
export { type RoleItemsState, useOpenActionCount, useRoleItems } from './ui/useCollected'
