/**
 * Action center (docs/VIEWS.md, Action center): every open item from every view's
 * `actions(ctx)`, grouped by owner, with Copy note, Mark handled and Snooze. Reached from the
 * masthead's Actions button (route `#actions`), not a folder tab.
 *
 * The exports are the contract: `ActionCenter` (the page body; the shell renders the filter row
 * above it inside a figure registry) and `useOpenActionCount()` (the masthead count; null until
 * known). Views must not import this module from their own `index.tsx`: it reads the view
 * registry, which imports every view.
 */
export { ActionCenter } from './ui/ActionCenter'
export { useOpenActionCount } from './ui/useCollected'
