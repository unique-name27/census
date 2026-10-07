/**
 * Modes: HR, Manager and Developer (docs/ROLES.md). An open switch that shapes Census for how it
 * is used. It is not security: every mode reads the same data in this browser.
 *
 * One pure policy answers every surface: `decide(mode, surface, at?)` is shown, limited or hidden
 * (with one sentence for limited and hidden). UI and engines ask through `ctx.access` (or the
 * hooks below), never the mode store, so an off-screen render with its own mode gets its own
 * answers.
 *
 * ── How a new figure, KPI, finding, view or tab declares its access ──────────────────────────
 *
 * Most things declare nothing new: they are judged by what they already carry.
 *
 *  - Figure: its `id` (prefixed with the view key) and its `metric`. `<Figure>` asks
 *    `ctx.access.decide(S.figure(id), { view, tab })` and `S.metric(metric)` and renders nothing,
 *    registers nothing and exports nothing when either is hidden. A figure inherits its tab's
 *    decision; a figure on a hidden tab or view, or whose id starts with a hidden view's key
 *    ("comp-…"), is hidden in Manager mode.
 *  - KPI tile and finding: their `metricId`. `KpiStrip` and `Readout` drop a tile or finding whose
 *    metric is hidden; a tile's `tab` / `link` renders without the link when the target is hidden.
 *  - Home-page and other new figures (DESIGN-REFRESH, ROLES 2.4): carry `metric`. A new figure that
 *    shows pay amounts, survey results, HR ops cases or transactions, compliance details or a
 *    breakdown by orgs outside the scope goes on the Manager hide lists in `policy.ts`
 *    (`MANAGER_HIDDEN_FIGURES`, or its metric on `MANAGER_HIDDEN_METRICS`) in the same change, and
 *    `src/access/__snapshots__/access-matrix.txt` is updated (`npx vitest run src/access -u`).
 *  - New metric: registered in the view's `metrics.ts` with its `views`. A metric listed only on
 *    views a mode hides is hidden there.
 *  - New view: add its key to `MANAGER_VIEWS` and its tabs to `MANAGER_TABS` (or it is hidden in
 *    Manager mode: the policy is an allowlist there). HR and Developer show it as soon as it is in
 *    `VIEWS`. The matrix test fails until Manager mode names every view and every tab of a shown view.
 *  - New tab: hidden in Manager mode until `MANAGER_TABS` names it. The shell drops hidden tabs
 *    (`withAccessTabs`) and redirects an address to one (`routeDecision`).
 *  - New developer-only surface: add its id to `DEVELOPER_ONLY` (HR and Manager hide it).
 *  - Anything else that a mode should hide: ask in the component, and add the surface to
 *    `MANAGER_SURFACES` (hidden by default in Manager mode when not named).
 *  - A link to another view or tab: `<RouteLink view tab>` from '@/components/RouteLink' renders
 *    plain text when the target is hidden; `goTo` refuses a hidden route as the safety net.
 *  - Records: drill specs need nothing; the records panel keeps only rows about the manager's org
 *    (`inLock`) and hides the kinds Manager mode does not list (`MANAGER_DRILL_KINDS`).
 *
 * Example: a component that shows an optional control and a figure.
 *
 *   import { S, useCan } from '@/access'
 *
 *   function Header() {
 *     // Hidden in Manager mode by MANAGER_SURFACES['header:hrbp'].
 *     const canTalk = useCan(S.header('hrbp'))
 *     return canTalk ? <TalkingPointsButton /> : null
 *   }
 *
 *   // Nothing to declare: the Figure hides itself where its tab, id or metric is hidden.
 *   <Figure id="hrbp-tenure-mix" metric="hrbp.workforce.tenure" title="Tenure" … />
 *
 *   // An engine that holds only ctx:
 *   if (ctx.access.can(S.metric('talent.retention.flightRisk'))) findings.push(riskFinding)
 *   const lock = ctx.access.lock // Manager mode: { managerId, managerName, orgIds, size }
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Modules: `modes` (names, hints, homes), `copy` (every sentence the modes add), `surfaces` (`S`,
 * the surface ids), `policy` (`decide`, `can`, `routeDecision`, the Manager tables and hide
 * lists), `matrix` (the inventory and `accessMatrix`), `lock` (`ManagerLock`, `managerLock`,
 * `clampFilters`), `records` (`inLock`), `context` (`ctx.access`), `store` (`useMode`, kept at
 * `census:mode`), `connect` (the store guards), `hooks` (`useAccess`, `useCan`, `useLock`).
 * Nothing here but `ui/` and `hooks.ts` imports React.
 */
export { type AccessContext, type AccessInput, accessFor, HR_ACCESS, HR_INPUT } from './context'
export * from './copy'
export { useAccess, useAt, useCan, useDecision, useLock } from './hooks'
export {
  clampFilters,
  emptyLock,
  isPickableManager,
  leaderInLock,
  type ManagerLock,
  managerLock,
} from './lock'
export { type AccessInventory, accessMatrix, type MatrixRow, matrixCounts, matrixText } from './matrix'
export * from './modes'
export {
  type Access,
  type At,
  baseTab,
  can,
  DEVELOPER_ONLY,
  type DecideInfo,
  type Decision,
  decide,
  firstManagerTab,
  isDeveloperOnly,
  MANAGER_DATASETS,
  MANAGER_DRILL_KINDS,
  MANAGER_HIDDEN_FIGURES,
  MANAGER_HIDDEN_ITEM_PREFIXES,
  MANAGER_HIDDEN_METRIC_PREFIXES,
  MANAGER_HIDDEN_METRICS,
  MANAGER_SURFACES,
  MANAGER_TABS,
  MANAGER_VIEWS,
  managerHidesMetricId,
  placeLabel,
  type RouteDecision,
  routeDecision,
  routeShown,
  SHOWN,
} from './policy'
export { inLock, personInLock, rowsInLock } from './records'
export {
  MODE_KEY,
  type ModeState,
  openManagerPicker,
  openModeMenu,
  parseStoredMode,
  setMode,
  useMode,
} from './store'
export { kindOf, restOf, S, type SurfaceId, surface } from './surfaces'
