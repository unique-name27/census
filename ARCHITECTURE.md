# Census — architecture and build contract

Census is a people-analytics workbench for an HR team at a semiconductor company. It has seven
views (folder tabs, in this order) and a Data room:

| View key | Tab label | Who uses it | Reads |
|---|---|---|---|
| `recruiting` | Recruiting | Talent acquisition leads, recruiters, hiring leaders | requisitions, candidates |
| `hrbp` | People stats | HRBPs preparing for leader 1:1s and org reviews | employees, jobChanges, reviews |
| `org` | Org chart | HRBPs and leaders: reporting lines, team shape, reorg scenarios | employees, requisitions, reviews, jobChanges |
| `services` | HR ops | People operations, payroll, benefits, HRIS | cases, transactions, employees |
| `talent` | Talent | Talent management, calibration owners | reviews, succession, learning, employees, jobChanges |
| `comp` | Compensation | Total rewards / comp partners | comp, employees, reviews |
| `ai` | AI in HR | The whole HR team: which Glean agents to use, and when not to | no datasets (an agent catalog kept in this browser) |
| `data` | Data room | Whoever loads the data | all ten datasets |

A view that reads no datasets (AI in HR) shows no filter row, no scope, window or as-of line and no
data tiers, and its exports carry no scope or data-standard lines.

The primary use: specialists review numbers during the week, then walk leaders through them in
meetings. So every view leads with a readout of findings, every chart exports its data, and a
whole view exports as an Excel workbook or a PowerPoint deck.

Everything runs in the browser. Uploaded files never leave the machine (IndexedDB only). The app
ships on sample data for a fictional company (Northgate Semiconductor) and accepts Excel/CSV
uploads per dataset.

## Stack

Vite 8 (Rolldown) · React 19.3 with the React Compiler · TypeScript 7 (native `tsc`) · Tailwind CSS 4.3
· Observable Plot 0.6 + d3 7 · Zustand 5 · Base UI 1.8 (unstyled accessible primitives) · Motion 14
· SheetJS 0.20 (read) · ExcelJS 4 (styled write) · pptxgenjs 4 · idb-keyval · Vitest 5 · Biome 2.

Commands (run from the project root):

- `npx tsc --noEmit -p .` type-checks (fast; run it often)
- `npx vitest run <path>` runs tests
- `npx biome check src/<your folder>` lints (fix what it reports in your own files)
- `npx vite build` must succeed
- Do NOT run `npm install` / add dependencies. Everything needed is installed. Do NOT start the dev
  server on port 8820 (the lead uses it); if you need to look at UI, use `npx vite --port <unique port>`.

Path alias: `@/` = `src/`. React Compiler is on: don't sprinkle `useMemo`/`useCallback` for render
performance; DO use `useMemo` around expensive metric computations keyed on the analytics context.

## Design language (read fully before writing UI)

Concept: **the five practices are file-folder tabs that open onto a cool-gray desk; every figure is a
white sheet laid on that desk.** Precision of an engineering datasheet, warmth of a well-kept
personnel file. It must not look AI-built or like a stock Tailwind/shadcn admin template.

Tokens live in `src/styles/tokens.css` and are mapped to Tailwind utilities in
`src/styles/index.css` (`bg-page`, `bg-sheet`, `bg-sheet-2`, `text-ink`, `text-ink-2`, `text-muted`,
`border-rule`, `border-rule-strong`, `bg-hover`, `text-link`, `bg-s1`…`bg-s8`, status
`good/warning/serious/critical` with `-wash` and `-text` variants, `rounded-sheet` (6px),
`rounded-control` (4px), `rounded-chip` (3px: tags, pills, badges, chips, menu items), `rounded-mark`
(2px: inline focus outlines on links and drill numbers, small swatches)). No other radius values.
Never use raw Tailwind palette colors (`gray-500`, `blue-600`, …) or literal hex in components;
always tokens. Both light and dark themes come from the tokens automatically.

Surfaces (docs/DESIGN-REFRESH.md 2.1): light `--page #e8eaee` under `--sheet #fbfbfc`; dark `--page
#0a0c0f` under `--sheet #181c22` (`--sheet-2 #1f242b`, `--sheet-3 #272d35`). `--muted` is `#616a78` in
light so 11 to 12px muted text reaches 4.5:1 on the page and both sheet tones
(`src/styles/tierTokens.test.ts` checks it in every theme block).

Typography: one family, **Archivo** (variable, with a width axis). Body 14px / 1.45. Headings,
tab labels, KPI values and figure titles use the semi-condensed cut: class `cut-head`
(font-stretch 84%) with weight 600-650. Section eyebrows use class `eyebrow` (never table headers:
those are sentence case, `TABLE_HEAD` in `src/components/styles.ts`). Use `tnum` (tabular figures)
only for numbers that align in columns (tables, axis ticks), not on big standalone values. IDs
(employee, req, case IDs) use `font-mono` at 12px. No other fonts, no serif.

Type scale: one class per job, defined in `src/styles/index.css` `@theme`; each sets size and line
height. `src/styles/typeScale.test.ts` fails on any arbitrary `text-[Npx]` or `rounded-[Npx]` (the
18px wordmark is the one exception).

| Class | Size / line height | Use |
|---|---|---|
| `text-label` | 11 / 1.35 | tier word, tags, pills, axis ticks, dense legends |
| `text-meta` | 12 / 1.4 | notes, deltas, scope extras, drill-panel cells, tooltips, table headers |
| `text-small` | 13 / 1.45 | subtitles, deks, table cells, buttons, finding detail |
| `text-body` | 14 / 1.45 | body text, readout headlines (600) |
| `text-title` | 16 / 1.3 | every sheet title (600, `cut-head`) |
| `text-section` | 20 / 1.2 | Section headings, side-sheet titles, wide folder-tab numbers |
| `text-page-title` | 28 / 1.1 | view title (h1), KPI values (`text-page` is the page color, not a size) |
| `text-display` | 40 / 1.05 | person card and Data room big numbers |
| `text-hero` | 48 / 1.0 | one hero figure per role home page, nowhere else |

Layout and surfaces:

- Page background `bg-page`. Figures, tables and panels are sheets: `bg-sheet rounded-sheet`, **no
  shadow, no border** (the tonal step from page to sheet is the separation). Inside a sheet,
  separate parts with `border-rule` hairlines.
- 12-column grid with 16px gaps on desktop; everything stacks to one column under 768px. Side gutter
  `var(--gutter)`. Max content width 1440px.
- Breakpoints follow the area, not the window (docs/ASK-ACTIONS.md, part 1): while Ask is docked beside the
  page, the shell is an area (`data-area`, a size container named `shell`) and Tailwind's `sm` to `xl` and
  `max-*` read its width (src/styles/index.css); the Ask panel is an area too. In code use `useNarrow`,
  `useMinWidth` or `mainAreaAtLeast(px)` (src/components/mainArea.ts), never `window.matchMedia` on a width.
- Don't put cards inside cards. Don't put a colored accent rail on the side of anything. Don't round
  everything to 12px+. Don't use gradients, glows, glassmorphism or emoji. Don't center page content.
- Side sheets (drill panel, Settings, Ask, Help) are one surface: `bg-sheet`, parts divided by
  hairlines, titles `text-section`. Empty, held-back and loading states are plain text on the sheet
  (a muted 16px icon), never a filled box inside it. Loading shows the sheets at their final size
  with their titles and one status line (`Pending` from `@/components`); while a newer analytics
  context is computed, `useAnalyticsPending()` is true and Figure and KpiStrip hold their old
  render at 60% opacity.
- Spacing is a 4px rhythm: 4, 8, 12, 16 (grid gap, sheet inset on phones), 20 (sheet inset from
  1024px), 40 (between sections). Figure insets: `px-4 lg:px-5`, header `pt-4`, body `pt-3 pb-5`.
- Buttons are compact (28-32px tall), `rounded-control`, ink text; the primary button is ink fill with
  `text-on-ink`. Icons are simple 16px strokes (1.5px) drawn inline as SVG (see `src/components/icons.tsx`).
- Interactive things look interactive: hover wash `bg-hover`, visible focus ring (global
  `:focus-visible` style), pointer cursor on clickable marks.
- State is encoded in form, not only color: status pills carry an icon + a word (`StatusPill`).

Charts (also read the dataviz rules summarized here):

- Marks are thin: bars ≤ 24px thick with 4px rounded data ends and square baselines; lines 2px;
  dots ≥ 8px with a 2px ring in the sheet color; area fills ~10% opacity. Gridlines are 1px solid
  `--grid`, never dashed. Axis text uses muted ink, never the series color.
- Color by job: one series → slot 1 (`--s1`); categorical identities in fixed order `--s1…--s8`
  (never cycled; >8 → fold into "Other"); magnitude → the sequential blue ramp (`--seq-*`); polarity
  → diverging blue/red with gray midpoint (`--div-*`); state → status colors only
  (`--good/--warning/--serious/--critical`), always with an icon or label. Use **emphasis** (one series
  in `--s1`, the rest in `--deemph`) when the story is about one thing.
- Never a dual-axis chart. Never a pie for close values (donuts only for ≤ 4 part-to-whole, prefer
  stacked bars). Legend for ≥ 2 series; direct-label selectively (endpoint, extreme), never every point.
- Status fill rule: a status color fills a whole bar only when status is the figure's subject (due
  state, readiness, approval status). Elsewhere a flagged bar keeps its series color and carries the
  status glyph beside its value (`BarList glyphTone`, not `tone`).
- Annotations: up to two short notes per chart (`notes` on Lines, Columns, HBars, BarList; type
  `ChartNote`), each tied to a datum and taken from the finding that cites the chart's metric
  (`shortNote(finding.title, subject)`). A note that has no free place is dropped; the tooltip and
  table still carry the number.
- Keyboard: every kit chart is one tab stop. Arrow keys move through the data in reading order (Left
  and Right along a series, Up and Down across series or rows) and show the tooltip at the datum,
  Enter or Space drills, Escape clears. Custom Plot visuals get the same by passing `keyPoints` to
  `PlotChart` (`plotPos(plot, 'x', v)` gives pixel positions).
- Heights: lead figure 280px plot (220px on phones), standard 220px (180px), the kit's default;
  `useChartHeight('lead')` from `@/components/useNarrow`. Time axes always show at least three labels.
- Every chart has a hover tooltip and a table view (the `Figure` frame provides the table view).
- Every chart is wrapped in `<Figure>` which provides title, subtitle, table toggle, definition
  popover and the export menu (CSV, Excel, PNG, SVG, copy). **No chart may be rendered outside a
  Figure.** The rows you pass to `Figure.data` are exactly what gets exported.

Copy (the user's writing rules):

- Plain, direct English for HR readers. Sentence case for every label, title and button. No marketing
  language, no exclamation marks, no emoji. Prefer short sentences. No em dashes in sentences ("—" is
  only the placeholder for a missing value).
- Name things the way HR people do: "Time to fill", "Regretted attrition", "Compa-ratio", "Ready now".
- Findings are one sentence with the number in it ("Voluntary attrition in Bengaluru is 14.2%, 6.1 pts
  above the company"), then up to two sentences of detail, then one neutral action.
- Recruiting tone rules: write "Resolve {stage} bottleneck", never "Unblock". Never describe anyone as
  "chasing" people; no nagging verbs (chase, push, nag, ping, hound). Interviewed-but-unactioned
  candidates are a leader ask: "Ask the panel to submit scorecards and make a decision this week."
  Awaiting-feedback items are owned by the hiring manager first, recruiter as fallback.
- Units always visible (%, d, pts, yrs). Windows always stated ("last 12 months", "as of 30 Sep 2026").

## Privacy rules (enforced in engines, not just UI)

- No gender, ethnicity, age or other protected-class fields exist in the schema. Don't add any.
- Any rate or average over a group of fewer than `MIN_GROUP` (5) people is `null` and renders "—"
  with "Hidden to protect anonymity (n < 5)". Breakdown tables fold groups under 5 into "Other (k)".
- Pay **amounts** (salary, range min/mid/max, market median, equity value, merit dollars, cost to
  bring to minimum) are only shown and exported when `ctx.showPay` is true. Mark such columns
  `pay: true` and the Figure/table/export layer drops them automatically. Ratios (compa-ratio, range
  penetration, merit %) are always fine.
- Manager mode shows exits, never regretted exits, and no breakdown of why people left (docs/ROLES-V2.md,
  "Decisions made", 8 Oct 2026): engines cite no exit or candidate reason there and People stats' model holds
  no regretted exits, and records leave the reason and regrettable columns out (`column:` surfaces). A new
  number, finding or column that says either goes on the Manager hide lists in the same change;
  `src/access/managerExits.test.ts` crawls every surface Manager mode shows for both.
- Employee relations cases: show counts and timeliness only, never subcategory text below the
  category level. Never tie one to a named person: a person card's open case count leaves ER cases
  out, so neither the count nor a note can reveal that someone has an open ER case.

## Data model

`src/data/schema.ts` is the single source of truth: record types, vocabularies (LEVELS, STAGES,
CASE_CATEGORIES with Atlas process IDs and default SLAs, TRANSACTION_TYPES, RATING_GUIDELINE, SITES with
jurisdictions and currencies, VOLUNTARY_REASONS …) and the `DATASETS` field definitions used by the
importer, templates and exports. Dates are ISO strings (`YYYY-MM-DD`; case timestamps
`YYYY-MM-DDTHH:mm`). Compare ISO dates as strings; use `src/lib/dates.ts` for arithmetic.

Sample data (`src/data/sample/`) is a deterministic, seeded, coherent company with planted stories
documented in `src/data/sample/README.md`. Its as-of date is `SAMPLE_AS_OF` = 2026-09-30.

## State and context

- `src/data/store.ts` (Zustand `useCensus`): datasets, source metadata, filters, route, `showPay`,
  theme, as-of override, dataset replace/reset (IndexedDB persistence).
- `src/data/scope.ts`: `Filters`, `periodWindows()`, `scopeDatasets()`, `buildOrgIndex()`,
  `subtreeIds()`, `isEmployee()`, `isActiveAt()`, `resolveAsOf()`.
- `src/data/context.tsx`: `useAnalytics(): AnalyticsContext` =
  `{ asOf, window, prior, filters, scopeLabel, isCompany, data (scoped), all (unscoped), org, sources, isSample, showPay, access, jobs }`.
  `jobs` is the job architecture (docs/TAXONOMY.md, section 7): a job family is the broad group and contains job
  functions; `jobs.families`, `jobs.familyOf(fn)`, `jobs.stageOf(fn)`, `jobs.familyFor(e)`, `jobs.source`, and for
  Engineering by stage `jobs.stageFor(fn)` (saved or proposed chip development stage), `jobs.engineeringOf(family)`
  and `jobs.engineeringPlace(e)`. `offerDeclineReasons` is the Offer decline reasons list in force (read a declined
  offer with `readDeclineReason(raw, ctx.offerDeclineReasons)` from `@/data/lists`).

Engines read `ctx.data` for the scoped population and `ctx.all` for company benchmarks. Org filters
are already applied to `ctx.data`; **period filtering is each engine's job** using `ctx.window` and
`ctx.prior` (inclusive ISO date bounds; `window.months` for annualizing).

Filters (docs/FILTERS.md): each org filter includes or excludes its values (`filters.modes`; read it with
`isExcluded(f, dim)`, never assume `leaderId` means "focus on"; use `focusLeader(f)` for the leader a scope
includes). `ctx.scopeLabel` can read "Whole company except Sales"; inside a sentence use `scopeInSentence()`.
The address holds route and scope (`#view.tab?…`, `src/data/urlScope.ts`); one writer (`src/app/address.ts`)
keeps it in step. Move with `goTo` / `navigate`; change filters with `setFilters` (scope changes collapse into
one history entry; pass `{ history: 'push' }` for a one-step change). Saved views: `src/data/savedViews.ts`.

## Modes: HR, Manager and Developer (docs/ROLES.md)

An open switch (the masthead's Mode button, Settings > Mode), kept in this browser at `census:mode`, never in
the address or the settings file. It shapes Census for how it is used; it is not security, and no copy may say
it is. One pure policy in `src/access/` (`decide(mode, surface, at?)`: shown, limited or hidden) answers every
surface; read the declaration guide at the top of `src/access/index.ts`. In short:

- Ask through `ctx.access` (`ctx.access.can(S.metric(id))`, `ctx.access.lock`) or the hooks (`useCan`,
  `useAccess`, `useLock` from `@/access`), never the mode store, so off-screen renders get their own answers.
- A **figure** is judged by its `id` (view-key prefix) and `metric`, a **KPI** and a **finding** by `metricId`;
  `Figure`, `KpiStrip` and `Readout` hide what the mode hides. A new figure that shows pay amounts, surveys, HR
  ops cases, compliance details or orgs outside the scope goes on the Manager hide lists in `policy.ts` in the
  same change, with the access matrix snapshot updated (`npx vitest run src/access -u`).
- A new **view** or **tab** is hidden in Manager mode until `MANAGER_VIEWS` / `MANAGER_TABS` name it (Manager
  mode is an allowlist); HR and Developer show it at once. The shell drops hidden tabs (`withAccessTabs`),
  folder tabs come from `folderViews(ctx.access)`, and `navigate` redirects a hidden route to the mode's home.
- Links to another view use `<RouteLink view tab>` (plain text when hidden) or `useRouteShown(view, tab)`.
- Manager mode's org is a lock, not a filter value: every filter change goes through `clampFilters` (the store's
  filter guard), records are kept to the org by `inLock`, and `ctx.isCompany` is always false there.

### The Developer page (`#dev`, `src/dev/`, docs/ROLES.md part 5)

Lazy-loaded, Developer mode only. Tabs: Overview (the Developer home, docs/DESIGN-REFRESH.md 4.3), Inventory,
Access, Security center (docs/SECURITY-CENTER.md), Ask tools, State, Timings; sub-addresses use the colon form
(`#dev.inventory:figures`, `#dev.inventory:homes/finance`, `#dev.security:role:finance`, `#dev.ask:query_records`,
`src/dev/tabs.ts`); the address keeps everything after its first "." as the tab. Its figures describe the app, not people: ids `dev-…`, `gate={false}`, no metric dictionary entry
unless one already exists (`quality.rules.*`), and numbers open inventory rows, Data room entries or data records.

- **What a figure declares is tracked, rows or not:** the figure registry has `track(facts)` / `tracked()` beside
  `register` (`FigureFacts` in `src/charts/types.ts`: id, title, metric, uses, gated, rows, tier, image, and a KPI
  strip's or readout's items). Exports never read it. `renderWholeView` returns `facts` per tab; the figure scan
  (`src/dev/scan.ts`) and the contract checks (`src/dev/contract.ts`) read it.
- **Timings:** `timed(name, fn)` and `recordSince(name, start)` from `src/lib/timing.ts` write `census:` User Timing
  measures only while Developer mode is on (`connectAccess` sets the flag). Wrapped today: `census:context`,
  `census:quality`, `census:headline:<view>`, `census:actions:<view>`, `census:drill:<kind>`, `census:ask:<tool>`,
  `census:export:<view>` (and the scorecard's own `census:scorecard:<view>`).
- **Errors this session:** `logDevError` in `src/app/devlog.ts` (a ring buffer of 100, in memory) is fed by the view
  error boundary, the scorecard's summaries, the Action center's views and Ask's tools.
- **Storage keys:** a new `census:` key goes in `STORAGE_KEYS` (`src/dev/storageKeys.ts`); a test scans the source and
  fails on one that is not described. A new keyboard shortcut goes in `SHORTCUTS` (`src/dev/shortcuts.ts`).
- **Debug overlays:** kept at `census:dev`; `DevLayer` (mounted by the shell) handles Alt+Shift+D and loads
  `DevOverlay`. KPI tiles, figures and findings carry `data-metric`.

## Metric conventions

Shared definitions live in `src/lib/people.ts` (lead-owned, tested): `headcountAt`, `activeAt`, `avgHeadcount`,
`snapshotDates`, `hiresIn`, `exitsIn`, `attrition(employees, window, kind)` (all / voluntary / involuntary / regretted,
annualized, null-not-zero), `firstYearAttrition`, `retention12`, `tenureYears`, `tenureBand`, `directReports`,
`buildReviewIndex` / `reviewAt` / `latestCycle`, `quarterPoints`, `monthPoints`. Root-cause analysis lives in
`src/lib/decompose.ts` (`decomposeRate`, `decomposeMedian`): use it to say WHERE a finding concentrates.
Always use these instead of re-implementing them, so a number means the same thing on every tab.


- Headcount counts `employmentType === 'Employee'` only (`isEmployee`). Contractors and interns are
  reported separately.
- Active on date d: `hireDate <= d` and (`!terminationDate || terminationDate > d`).
- Average headcount over a window = mean of month-end snapshots from the window start's month-end
  (inclusive of the snapshot just before the window) to the window end (13 points for 12 months).
- Turnover-type rates (attrition, hire rate) = events in window ÷ average headcount, annualized ×
  (12 ÷ window.months). Say "annualized" in the definition.
- Regretted attrition counts voluntary exits with `regrettable === true`.
- When a field needed for a metric is absent from every row (e.g. no `terminationType` anywhere), the
  metric is `null` with a note naming the missing column, never 0.
- When the Employees data has no termination dates at all (an active-only roster), pass
  `attrition(emps, w, kind, { exitDataPresent: hasExitData(ctx.all.employees) })`: every rate is `null` with
  "No termination dates in the Employees data", never 0%.
- KPI deltas compare to the prior window (`ctx.prior`); when an org filter is active, HRBP tiles may
  compare to the company instead. Color a delta only if material (`isMaterialChange` in
  `src/lib/stats.ts`, or a domain-specific threshold); otherwise gray.
- Use `median` for durations (time to fill, time to resolve) and say "median" in labels.

## Shared building blocks (who owns what)

| Path | Owner | What |
|---|---|---|
| `src/styles/**`, `src/data/schema.ts`, `scope.ts`, `store.ts`, `context.tsx`, `src/lib/{dates,format,stats}.ts`, `src/charts/{types,registry}.tsx`, `src/components/types.ts`, `src/views/types.ts`, `src/views/registry.ts` | lead | contracts; change only if you must, and say so in your report |
| `src/data/sample/**` | sample-data builder | generator + README of planted stories + tests |
| `src/data/import/**` | import builder | parsing, header detection, auto-mapping, normalization, validation, templates (pure + tests) |
| `src/components/{ui,icons}.tsx`, `src/charts/{theme.ts,Sparkline.tsx}` | lead | UI primitives (Button, IconButton, Menu, Popover, Tip, Segmented, Switch, StatusPill, SeverityIcon, Tag, cx), icon set, chart theme hook |
| `src/charts/**` (rest), `src/lib/export/**` | chart & export builder | Figure, Plot wrapper, chart kit, DataTable, export library, `src/charts/index.ts` barrel |
| `src/app/**`, `src/components/**` (rest), `src/main.tsx` | shell builder | app shell, folder tabs, filter bar, view header, KPI strip, readout, Section/Grid, EmptyState, MultiSelect, Dialog, toast, `src/components/index.ts` barrel (re-exports ui, icons, types) |
| `src/views/<key>/**` | that view's builder | engine (pure + tests) and UI for the view |
| `src/views/data/**` | data room builder | upload, mapping, dataset status UI |

### Figure (`import { Figure } from '@/charts'`)

```tsx
<Figure
  id="rec-time-to-fill"            // stable kebab-case id, unique in the app; prefix with view key
  title="Time to fill by department"
  subtitle="Median days from req opened to offer accepted, reqs filled in the last 12 months"
  data={rows}                      // rows behind the chart, exported as-is
  columns={[{ key: 'department', label: 'Department' }, { key: 'days', label: 'Median days', format: 'days' }, { key: 'n', label: 'Reqs filled', format: 'int' }]}
  definitions={[{ term: 'Time to fill', text: 'Days from the req opened date to the offer accepted date.', formula: 'filledDate − openedDate' }]}
  note="62 reqs filled · as of 30 Sep 2026"
  span={6}                         // grid columns at desktop width: 3|4|5|6|7|8|9|12
  actions={<Segmented …/>}         // optional header controls
  empty={rows.length ? null : 'No filled reqs in this period.'}
  detail={{ label: 'Requisitions', columns: reqColumns, rows: () => reqRows }} // optional "export detail rows"
>
  <BarList data={rows} label="department" value="days" format="days" />
</Figure>
```

`tableOnly` renders `data` as a sortable table instead of a chart (for tables that should still be
exportable). `emptyAction` adds one control under the empty message ("Open the Data room"); `emptyHeight`
(default 220) keeps an empty figure as tall as its chart; `variant="compact"` keeps the title and the export
menu only (small summary figures, as in the drill panel). Figures register with the view's figure registry so "Export view" includes them.

### Chart kit (`import { BarList, Columns, Lines, … } from '@/charts'`)

All charts are responsive to their container width, theme-aware, render one `<svg>`, show tooltips,
and accept `onSelect(datum)` for click-to-drill. Accessors are property names of the datum.

| Component | Use | Key props |
|---|---|---|
| `BarList` | ranked horizontal bars, one series | `label`, `value`, `format`, `top?` (folds rest into Other), `secondary?` (muted text after value), `ref?: {value,label}`, `tone?: (d)=>'default'|'deemph'|'good'|'warning'|'serious'|'critical'` |
| `Columns` | vertical bars over categories or months; grouped or stacked | `x`, `y`, `series?`, `stack?`, `seriesOrder?`, `xType?: 'band'|'month'`, `format`, `ref?` |
| `HBars` | horizontal grouped/stacked/100% bars | `y`, `x`, `series?`, `stack?: boolean|'normalize'`, `seriesOrder?`, `format` |
| `Lines` | trends over time (x = ISO date or `YYYY-MM`) | `x`, `y`, `series?`, `area?`, `emphasize?`, `ref?`, `format`, `yDomain?` |
| `Histogram` | distribution of a numeric field | `values` or `data`+`value`, `thresholds`, `format`, `band?: [lo,hi]` (shaded healthy zone), `refs?` |
| `Heatmap` | grid of values | `x`, `y`, `value`, `format`, `scheme: 'sequential'|'diverging'`, `xOrder?`, `yOrder?`, `showValues?`, `domain?`, `blankZero?` (0 cells unfilled and unlabelled) |
| `Scatter` | two measures per entity | `x`, `y`, `r?`, `tone?`, `label?` (labels a few), `xFormat`, `yFormat`, `refX?`, `refY?` |
| `DotStrip` | one dot per item along a value axis, grouped by row | `x`, `y`, `tone?`, `xFormat`, `ref?` |
| `RangeBars` | ranges with a marker (salary range, quartiles) | `y`, `min`, `max`, `mid?`, `value?`, `q1?`, `q3?`, `format` |
| `Sparkline` | tiny trend for tiles and tables | `values`, `width?`, `height?`, `target?` (1px ink-2 rule) |
| `BulletList` | measures against target, one row each on its own scale (0 to 1.15 x max of value and target), or one shared scale for measures in one unit | `data`, `label`, `value`, `target`, `format: (row, v) => string`, `status?: (row) => {tone, label}`, `group?`, `scale?: 'row'\|'shared'`, `onSelect`, `onSelectLabel` |
| `TrendGrid` | small multiples, one cell per measure, each on its own y scale, target rule | `series: TrendSeries[]` (`id`, `name`, `short?` for a cell too narrow for the name, `values`, `periods?`, `target?`, `format`), `onSelect(s, i)`; export `trendGridRows(series)` with `TREND_GRID_COLUMNS` |
| `StatusSplit` | one 100% bar of status counts in fixed order (met, watch, missed, no target, not shown) | `counts`, `labels?`, `unit?`, `onSelect(key)` |
| `Meter` | a ratio against a target | `value` (0-1), `target?`, `tone?` |

Domain-specific visuals (recruiting flow sankey, 9-box grid, funnel, etc.) are built by the view
builder inside `src/views/<key>/`, as SVG, using `useChartTheme()` from `@/charts` for resolved colors,
and still wrapped in `<Figure>`.

### Export library (`@/lib/export`)

`downloadCsv`, `downloadXlsx(sheets)`, `copyTable`, `downloadPng(svg)`, `downloadSvg(svg)`,
`exportViewWorkbook(figures, meta)`, `exportViewDeck(figures, meta)`. CSV cells are protected
against formula injection. Workbooks are styled (bold frozen header, number formats from the column
`format`, autofilter, title rows with scope / window / as-of, "Company confidential" and "Sample data"
stamps). Pay columns are dropped unless `showPay`.

### Components (`import { … } from '@/components'`)

Already written (lead): `Button`, `IconButton`, `Menu` (items API), `Popover`, `Tip` (tooltip), `TooltipProvider`,
`Segmented`, `Switch`, `StatusPill`, `SeverityIcon`, `Tag`, `cx` in `src/components/ui.tsx`, and the icon set in
`src/components/icons.tsx` (`IconDownload`, `IconTable`, `IconInfo`, …). Built by the shell builder: `KpiStrip` (`kpis: Kpi[]`,
`span?` default 12; tiles on a five-row subgrid: label with tier and info, value, change, target in full, one short
note; phones show four tiles and "Show all n"), `Readout` (`findings: Finding[]`, `limit?` default 4, phones 2,
`variant?: 'compact'` for home pages; meta line with practice tag and tier above each headline), `Pending`
(`title`, `span`, `height`, `message`, or `frames`: sheets at final size while a page prepares), `Section` (`title`,
`dek?`, children in a 12-col grid), `Grid`, `EmptyState`,
`MultiSelect`, `Dialog`, `toast()`. `DataTable` (`columns`, `rows`, sortable, `onRowClick`, `rowTone`, `maxRows`) is in
`@/charts` (chart builder). `Kpi` and `Finding` shapes are in
`src/components/types.ts`.

### Extra shared APIs (from the shell and chart builders)

- Navigation: `goTo(view, tab?)` (pushes history; keeps scroll inside a view), `useCurrentView()`, `routeHash`
  (a link's href, route only: it keeps the scope on screen), `linkToView()` (the full address with the scope).
- "Filter to this" (producer pattern, details at the top of `src/drill/testing.ts`): a number that counts a group
  of a filterable dimension sets `DrillSpec.filter` (`Partial<Filters>`). In a figure say the dimension once with
  `byGroup(dim, groupKey, build)` from `@/charts` (use its result for `onSelect` via `drill()` and for table
  `drill`); in an engine set `filter: groupFilter(dim, value)` (plus `periodFilter(start, end)` for a month or
  quarter). Set nothing for numbers that are not a group, "Other" rows, or groups keyed differently from the
  filters. Test it with `expectFilterTo` (and `expectLeaveOut` for counts that split the scope) from
  `@/drill/testing`. Findings' `filter`, person cards and these actions all apply through `focusScope()`.
- `useTableFigure({ id, title, subtitle?, note?, columns, rows })` registers a table-only export without rendering.
- `<FigureSection section={{ key, label, short, window? }}>` (from `@/charts`) marks the figures inside as one part
  of a tab (People stats > Special analyses: one per analysis). Exports then number and name its sheets
  ("23 Quality · By university"), head it on the Summary, and state its own window instead of the period; a
  This tab export of one section names it in the title and file name.
- Layout: `Span` and `spanClass(span)`; `Section` takes `actions`.
- `toast(message, { tone?: 'neutral' | 'good' | 'critical', description?, action?: { label, onClick }, timeout? })`.
- Charts: `PlotChart` + `housePlot` + axis/grid helpers for custom Plot visuals; `Legend`; `toneColor`, `inkOn`,
  `sequentialScale`, `divergingScale`; `textWidth`. A custom SVG visual inside a Figure that also contains other
  SVGs must put `data-chart` on its root `<svg>` so PNG/SVG export captures the right element.
- Plot pitfall: the mark option `ariaLabel` is a per-row data channel, not a fixed label (a constant string makes
  lines disappear). Bar corner radii are in screen space; use the kit instead of hand-rolling rounded bars.
- Imported data may have `null` in `level`, `employmentType`, requisition `reqType`/`priority`, case
  `priority`/`tier` and comp `fxToUsd` (unrecognized values are logged, not guessed). Guard for it.
- `regrettable` is boolean for leavers and null for active people. Succession roles with no successor have one row
  with `successorId` null. Comp `meritPct` is null for people hired after 2026-04-01 or without a rating.

### Views

Each view folder exports `view: ViewDef` from `index.tsx` (see `src/views/types.ts`): label, tabs,
the `View({ tab })` component, a cheap `headline(ctx)` for the folder tab, the datasets it reads, and
optional `HeaderActions`. The shell renders the masthead, folder tabs, filter row, view header
(title, scope and window line, sub-tabs, Export menu) and wraps the view in a figure registry; the
view renders its body only.

Engine pattern: `src/views/<key>/engine/*.ts` are pure functions of `AnalyticsContext` (no React, no
DOM) with Vitest tests next to them (`*.test.ts`) that use small hand-built fixtures for exact
definitions AND a smoke test over `buildContext({ data: generateSample(), … })` asserting the planted
sample stories are detected and every number is finite or null. UI calls the engine inside
`useMemo(() => compute(ctx), [ctx])`.

Overview tab layout for every view: KPI strip (5-7 tiles) → row with Readout (span 4) and the lead
figure (span 8) → sections of figures. Deeper tabs: a short section dek explaining what the tab
answers, then figures and tables.

## Tooling note: Node crash while compiling

On Node 24.14 the React Compiler step (Babel) can crash Node with 0xC0000409 at random while
compiling the whole app (dev server or build). Every npm script that runs Vite starts Node with
`--max-semi-space-size=64`, which stops it; run Vite through those scripts (`npm run dev`,
`npm run build`, `npm run build:single`), not `npx vite`.
