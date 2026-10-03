# Census — architecture and build contract

Census is a people-analytics workbench for an HR team at a semiconductor company. It has five
views (folder tabs) and a Data room:

| View key | Tab label | Who uses it | Reads |
|---|---|---|---|
| `recruiting` | Recruiting | Talent acquisition leads, recruiters, hiring leaders | requisitions, candidates |
| `hrbp` | HR business partners | HRBPs preparing for leader 1:1s and org reviews | employees, jobChanges, reviews |
| `services` | Employee services | People operations, payroll, benefits, HRIS | cases, transactions, employees |
| `talent` | Talent | Talent management, calibration owners | reviews, succession, learning, employees, jobChanges |
| `comp` | Compensation | Total rewards / comp partners | comp, employees, reviews |
| `data` | Data room | Whoever loads the data | all ten datasets |

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
`rounded-control` (4px)). Never use raw Tailwind palette colors (`gray-500`, `blue-600`, …) or literal hex
in components; always tokens. Both light and dark themes come from the tokens automatically.

Typography: one family, **Archivo** (variable, with a width axis). Body 14px / 1.45. Headings,
tab labels, KPI values and figure titles use the semi-condensed cut: class `cut-head`
(font-stretch 84%) with weight 600-650. Small uppercase labels use class `eyebrow`. Use
`tnum` (tabular figures) only for numbers that align in columns (tables, axis ticks), not on big
standalone values. IDs (employee, req, case IDs) use `font-mono` at 12px. Type scale: 11 / 12 / 13 / 14 /
16 / 20 / 28 / 40 px. No other fonts, no serif.

Layout and surfaces:

- Page background `bg-page`. Figures, tables and panels are sheets: `bg-sheet rounded-sheet`, **no
  shadow, no border** (the tonal step from page to sheet is the separation). Inside a sheet,
  separate parts with `border-rule` hairlines.
- 12-column grid with 16px gaps on desktop; everything stacks to one column under 768px. Side gutter
  `var(--gutter)`. Max content width 1440px.
- Don't put cards inside cards. Don't put a colored accent rail on the side of anything. Don't round
  everything to 12px+. Don't use gradients, glows, glassmorphism or emoji. Don't center page content.
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
- Employee relations cases: show counts and timeliness only, never subcategory text below the
  category level.

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
  `{ asOf, window, prior, filters, scopeLabel, isCompany, data (scoped), all (unscoped), org, sources, isSample, showPay }`.

Engines read `ctx.data` for the scoped population and `ctx.all` for company benchmarks. Org filters
are already applied to `ctx.data`; **period filtering is each engine's job** using `ctx.window` and
`ctx.prior` (inclusive ISO date bounds; `window.months` for annualizing).

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
exportable). Figures register with the view's figure registry so "Export view" includes them.

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
| `Heatmap` | grid of values | `x`, `y`, `value`, `format`, `scheme: 'sequential'|'diverging'`, `xOrder?`, `yOrder?`, `showValues?`, `domain?` |
| `Scatter` | two measures per entity | `x`, `y`, `r?`, `tone?`, `label?` (labels a few), `xFormat`, `yFormat`, `refX?`, `refY?` |
| `DotStrip` | one dot per item along a value axis, grouped by row | `x`, `y`, `tone?`, `xFormat`, `ref?` |
| `RangeBars` | ranges with a marker (salary range, quartiles) | `y`, `min`, `max`, `mid?`, `value?`, `q1?`, `q3?`, `format` |
| `Sparkline` | tiny trend for tiles and tables | `values`, `width?`, `height?` |
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
`src/components/icons.tsx` (`IconDownload`, `IconTable`, `IconInfo`, …). Built by the shell builder: `KpiStrip` (`kpis: Kpi[]`),
`Readout` (`findings: Finding[]`), `Section` (`title`, `dek?`, children in a 12-col grid), `Grid`, `EmptyState`,
`MultiSelect`, `Dialog`, `toast()`. `DataTable` (`columns`, `rows`, sortable, `onRowClick`, `rowTone`, `maxRows`) is in
`@/charts` (chart builder). `Kpi` and `Finding` shapes are in
`src/components/types.ts`.

### Extra shared APIs (from the shell and chart builders)

- Navigation: `goTo(view, tab?)` (pushes history; keeps scroll inside a view), `useCurrentView()`, `routeHash`.
- `useTableFigure({ id, title, subtitle?, note?, columns, rows })` registers a table-only export without rendering.
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
