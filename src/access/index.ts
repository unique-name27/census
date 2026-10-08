/**
 * Modes (docs/ROLES-V2.md; docs/ROLES.md): eleven modes, an open switch that shapes Census for how
 * it is used. It is not security: every mode reads the same data in this browser, and anyone can
 * switch. No copy may say otherwise (`NOT_SECURITY_SHORT`, `NOT_SECURITY_LONG`, `BANNED_MODE_WORDS`).
 *
 * One pure policy answers every surface: `decide(mode, surface, at?, info?)` is shown, limited or
 * hidden, with one sentence for limited and hidden. UI and engines ask through `ctx.access` (or the
 * hooks), never the mode store, so an off-screen render with its own mode gets its own answers.
 *
 * ── The modes (`modes.ts`) ──────────────────────────────────────────────────────────────────────
 *
 *   Mode            'hr' | 'chro' | 'hrbp-unit' | 'hrbp-region' | 'compensation' | 'talent-management'
 *                   | 'recruiter' | 'hr-ops' | 'finance' | 'manager' | 'developer'
 *   MODES, MODE_GROUPS (the Mode menu's five groups), MODE_LABEL ("HRBP for a region"), MODE_NAME
 *   (in sentences: "HRBP"), MODE_SHORT (phones: "Comp"), MODE_HINT, modeButtonLabel(mode, pick)
 *   HOME_OF (scorecard | home | team | dev), HOME_LABEL, HOME_SLUG ('chro', 'hrbp', 'comp', 'talent',
 *   'ops', 'rec', 'fin'), SHARED_HOME_FIGURES, isOtherHomeFigure(mode, id)
 *   SCOPE_OF (mode → 'org' | 'unit' | 'region' | 'reqs' | null), PICK_OF (mode → 'manager' | 'unit' |
 *   'region' | 'recruiter' | null), MODE_OF_PICK, ModePicks, EVERY_RECRUITER ('*'), hasPick
 *   PAY_OF (mode → 'switch' | 'totals' | 'none'), IMMIGRATION_OF (mode → boolean)
 *
 *   modeButtonLabel('hrbp-unit', 'Silicon Engineering')  // "HRBP: Silicon Engineering"
 *   modeButtonLabel('recruiter', EVERY_RECRUITER)        // "Recruiter: every recruiter"
 *   modeButtonLabel('finance')                           // "Finance mode"
 *
 * ── ctx.access (`context.ts`) ──────────────────────────────────────────────────────────────────
 *
 *   ctx.access = { mode, scope, lock, unset, pay, decide, can }
 *     scope   ScopeLock | null: the org, business unit, region or reqs the mode holds
 *     lock    @deprecated: `scope` when its kind is 'org' (Manager mode), else null
 *     unset   a scoped mode whose pick is missing or gone: the scope holds nobody
 *     pay     'switch' | 'totals' | 'none'
 *
 *   accessFor(mode, scope?, metrics?, unset?) builds one (memoized); `buildContext({ access:
 *   { mode, picks } })` builds the scope from the picks. Without `access` a context is HR's.
 *
 * ── Scopes (`scopes/`, docs/ROLES-V2.md part 2) ────────────────────────────────────────────────
 *
 *   OrgScope    { kind: 'org', label, size, managerId, managerName, orgIds }          Manager
 *   UnitScope   { kind: 'unit', label, size, unit, memberIds, leaderIds, otherDepartments }   HRBP BU
 *   RegionScope { kind: 'region', label, size, region, sites, memberIds }             HRBP region
 *   ReqsScope   { kind: 'reqs', label, size, recruiter, recruiterId, reqIds, appIds, startIds,
 *                 openReqs, activeCandidates, asOf }                                  Recruiter
 *
 *   scopeFor(mode, picks, { org, asOf, all, regions?, departmentParents?, dedupDays? })
 *     → { scope, unset }   (a missing or gone pick: an empty scope of its kind, unset true)
 *   clampFilters(filters, scope, mode?)   the one clamp; same object when nothing changes. Finance
 *     (no scope) keeps the business unit and period only. FILTER_DIMS_OF[mode] lists the row's dims.
 *   clampReason(mode, scope, asked, kept, 'link' | 'view')   the one toast for a changed link
 *   applyScope(data, scope)   after the filters; only 'reqs' narrows (and empties what Recruiter
 *     never reads)
 *   inScope(kind, row, ctx), rowsInScope(spec, ctx), personInScope(id, ctx.access)   the records
 *     guard for every kind (inLock, rowsInLock, personInLock are the same functions)
 *   scopeName(scope), scopeLabelOf(scope, filters, org)   "APAC", "APAC: Bengaluru, L4"
 *   regionIndex(locationListValues, data)   one region index: regionOf(location), regions,
 *     sitesOf(region), noRegion
 *   unitOptions, regionOptions, recruiterOptions   the pick dialogs' rows (pure)
 *
 *   // An engine that keys on the scope:
 *   const s = ctx.access.scope
 *   if (s?.kind === 'reqs') compareTo = 'all reqs'          // "vs all reqs" in Recruiter mode
 *   if (s && !personInScope(id, ctx.access)) card = 'outside'
 *   const rows = rowsInScope(spec, ctx).rows                 // the records panel's rows
 *   // A link or saved view that names its own filters:
 *   const kept = clampFilters(asked, ctx.access.scope, ctx.access.mode)
 *
 * ── Policy tables (`policy/`, docs/ROLES-V2.md 8.3) ────────────────────────────────────────────
 *
 *   decide(mode, surface, at?, info?)
 *     1. Developer: shown.  2. An override (`setPolicyOverrides`, the Security center's policy
 *     file; never shows a Developer-only surface elsewhere).  3. HR: `decideHr`.  4. CHRO:
 *     `decideChro` (HR plus `home`).  5. Every other mode: `decideTable(ROLE_POLICY[mode], …)`, an
 *     allowlist: what its table does not name is hidden. The Action center is limited per mode like
 *     any other page; `ROUTING[mode]` (policy/routing.ts) says whose each item kind is.
 *   ROLE_POLICY: Record<TableMode, RolePolicy>; RolePolicy is plain data (views, tabs, hiddenParts,
 *     metrics { allow?, hidePrefixes, hide }, hiddenFigures, hiddenFigurePrefixes, drillKinds,
 *     drillListed, datasets, hiddenItemPrefixes, articles, tours, surfaces). Manager's is
 *     `MANAGER_POLICY` (policy/manager.ts, moved unchanged); the six role tables (policy/hrbp.ts
 *     for both HRBP modes, compensation.ts, talent.ts, hrOps.ts, recruiter.ts, finance.ts) are
 *     filled from part 4 with the shared building blocks in policy/kit.ts (`VIEW_TABS`,
 *     `tabTable`, `frameSurfaces`, `articlesFor`, `toursFor`, `analysesSurfaces`,
 *     `listeningHides`). `stubPolicy(mode)` is no longer used by any table.
 *   routeShown(mode, view, tab), routeDecision(mode, route), firstShownTab(mode, view)
 *
 *   // A role table (the shape every table has; see policy/finance.ts):
 *   const views = { home: SHOWN, recruiting: limited('Requisitions only, …'), talent: hidden('…'), … }
 *   export const FINANCE_POLICY: RolePolicy = {
 *     mode: 'finance', views,
 *     tabs: tabTable(views, { recruiting: { overview: hidden('…'), requisitions: limited('…') } }),
 *     metrics: { allow: ['hrbp.headcount.', 'comp.cost.', …], hidePrefixes: [], hide: [] },
 *     surfaces: { ...frameSurfaces({ mode: 'finance', views }), 'filter:leader': hidden('…'), … },
 *     …
 *   }
 *
 * ── Pay (`pay.ts`, docs/ROLES-V2.md part 3) ────────────────────────────────────────────────────
 *
 *   ctx.showPay    individual amounts may show (`pay: true` columns): a switch mode, switch on
 *   ctx.showCost   cost totals may show (`cost: true` columns): showPay, or Finance always
 *   payView(mode), showPayIn(mode, switchOn), showCostIn(mode, switchOn), showImmigrationIn(…)
 *   payDecisions(mode): the `pay:switch`, `pay:amounts`, `pay:totals` decisions every table carries
 *
 *   // A cost figure's columns:
 *   { key: 'targetCash', label: 'Target cash (USD)', format: 'usd', cost: true }
 *   if (!ctx.showCost) return { empty: 'Turn on Show pay amounts to see cost totals.' }
 *
 * ── Items (`items.ts`) ─────────────────────────────────────────────────────────────────────────
 *
 *   itemsShown(access, items)   every allowlist mode lists only items whose view, tab, subject kind,
 *     drill kind and id prefix it shows (Developer, HR and CHRO list every item)
 *   itemInScope(access, item)   about the scope (subject or `place`) or owned by someone in it
 *   roleItems(items, lensOf(ctx.access, ctx.asOf, days))   { needs, waiting, left } by the routing
 *     table in policy/routing.ts (`ROUTING[mode]`, plain data: kinds, owner groups, "me", escalations)
 *
 * ── How a new figure, KPI, finding, view or tab declares its access ──────────────────────────
 *
 * Most things declare nothing new: they are judged by what they already carry.
 *
 *  - Figure: its `id` (prefixed with the view key) and its `metric`. `<Figure>` asks
 *    `ctx.access.decide(S.figure(id), { view, tab })` and `S.metric(metric)` and renders nothing,
 *    registers nothing and exports nothing when either is hidden. A figure inherits its tab's
 *    decision; a figure on a hidden tab or view, or whose id starts with a hidden view's key
 *    ("comp-…"), is hidden. Role home figures are `home-<slug>-<thing>`; another role's are hidden.
 *  - KPI tile and finding: their `metricId`. `KpiStrip` and `Readout` drop a tile or finding whose
 *    metric is hidden; a tile's `tab` / `link` renders without the link when the target is hidden.
 *  - A new figure that shows pay amounts, survey results, HR ops cases or transactions, compliance
 *    details or a breakdown by orgs outside the scope goes on the hide lists of every allowlist
 *    table that should not show it (`hiddenFigures`, or its metric on `metrics.hide`) in the same
 *    change, with both matrix snapshots updated (`npx vitest run src/access -u`).
 *  - New metric: registered in the view's `metrics.ts` with its `views`. A metric listed only on
 *    views a mode hides is hidden there.
 *  - New view or tab: hidden in every allowlist mode until its table names it (`views`, `tabs`).
 *    HR, CHRO and Developer show it as soon as it is in `VIEWS`. The matrix test fails until every
 *    allowlist mode names every view and every tab of a shown view.
 *  - New developer-only surface: add its id to `DEVELOPER_ONLY` (every other mode hides it).
 *  - Anything else that a mode should hide: ask in the component, and name the surface in each
 *    table's `surfaces` (hidden by default where not named).
 *  - A link to another view or tab: `<RouteLink view tab>` from '@/components/RouteLink' renders
 *    plain text when the target is hidden; `goTo` refuses a hidden route as the safety net.
 *  - Records: drill specs need nothing; the records panel keeps only rows inside the scope
 *    (`inScope`) and hides the kinds the mode does not list (`drillKinds`).
 *
 * Example: a component that shows an optional control and a figure.
 *
 *   import { S, useCan, useScope } from '@/access'
 *
 *   function Header() {
 *     const canTalk = useCan(S.header('hrbp'))     // hidden where a table says so
 *     return canTalk ? <TalkingPointsButton /> : null
 *   }
 *
 *   // Nothing to declare: the Figure hides itself where its tab, id or metric is hidden.
 *   <Figure id="hrbp-tenure-mix" metric="hrbp.workforce.tenure" title="Tenure" … />
 *
 *   // An engine that holds only ctx:
 *   if (ctx.access.can(S.metric('talent.retention.flightRisk'))) findings.push(riskFinding)
 *   if (ctx.access.can(S.pay('totals')) && ctx.showCost) rows.push(costRow)
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Modules: `modes`, `copy` (every sentence the modes add, including `PICKER_COPY` per pick kind),
 * `surfaces` (`S`), `pay`, `scopes/` (kinds, builders, the clamp, `applyScope`, the records guard,
 * labels, regions, picker rows), `policy/` (`decide`, the tables, routes), `matrix` (the inventory,
 * `accessMatrix`, `matrixText`, `howText`), `context` (`ctx.access`), `store` (`useMode` v2 at
 * `census:mode`), `connect` (the store guards per mode and scope), `hooks` (`useAccess`, `useCan`,
 * `useScope`, `useLock`), `items`. `lock.ts` and `records.ts` re-export from `scopes/` while
 * callers move. Nothing here but `ui/` and `hooks.ts` imports React.
 */
export { type AccessContext, type AccessInput, accessFor, HR_ACCESS, HR_INPUT, picksOf } from './context'
export * from './copy'
export { useAccess, useAt, useCan, useDecision, useLock, useScope } from './hooks'
export {
  escalationRank,
  isMine,
  itemInScope,
  itemShown,
  itemsShown,
  lensOf,
  type RoleLens,
  type RoleLists,
  type RoutedItem,
  roleItems,
} from './items'
export {
  type AccessInventory,
  accessMatrix,
  howOf,
  howText,
  MATRIX_MODES,
  type MatrixRow,
  MODE_COLUMN,
  matrixCounts,
  matrixText,
} from './matrix'
export * from './modes'
export { type PaySurface, payDecisions, payView, showCostIn, showImmigrationIn, showPayIn } from './pay'
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
  firstShownTab,
  hidesMetricId,
  isDeveloperOnly,
  isTableMode,
  MANAGER_DATASETS,
  MANAGER_DRILL_KINDS,
  MANAGER_HIDDEN_FIGURE_PREFIXES,
  MANAGER_HIDDEN_FIGURES,
  MANAGER_HIDDEN_ITEM_PREFIXES,
  MANAGER_HIDDEN_METRIC_PREFIXES,
  MANAGER_HIDDEN_METRICS,
  MANAGER_POLICY,
  MANAGER_SURFACES,
  MANAGER_TABS,
  MANAGER_VIEWS,
  managerHidesMetricId,
  type PolicyOverrides,
  placeLabel,
  policyOf,
  policyVersion,
  ROLE_POLICY,
  type RolePolicy,
  type RoleTab,
  type RouteDecision,
  routeDecision,
  routeShown,
  SHOWN,
  setPolicyOverrides,
  type TableMode,
} from './policy'
export * from './scopes'
export {
  MODE_KEY,
  type ModePick,
  type ModeState,
  openManagerPicker,
  openModeMenu,
  openPicker,
  parseStoredMode,
  picksOfState,
  type StoredMode,
  setMode,
  useMode,
} from './store'
export { kindOf, restOf, S, type SurfaceId, surface } from './surfaces'
