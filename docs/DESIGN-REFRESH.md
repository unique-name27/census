# Census design refresh

Status: planning spec, 6 Oct 2026. Sections 2 and 3 (visual direction and shared components,
including 3.5) were built on 7 Oct 2026; sections 4 and appendix A build on them. Sections 4.1 and 4.2 (the
HR and Manager homes) were built on 7 Oct 2026 as docs/VIEWS.md describes (Scorecard, As built; My team). One agent applies sections 2 and 3
across every view at once; the role home pages (section 4) and the chart additions (appendix A)
follow. Role modes themselves (who sees which tab, the mode switch, the manager picker, routes)
are specified in the modes spec written alongside this one; where this file needs a decision
from it, it says so.

What the user asked for: "make it look nicer and add more graphs", with HR, manager and
developer modes. Decisions already taken: modes are an open switch that shapes the app for a
role and hides what a role should not see; they are not security and no copy may say they are.
The look is both a polish pass over every view (2 to 4 new charts each) and a chart-led home page
per role.

Ground rules this spec keeps: the identity (folder tabs on a cool-gray desk, graphite masthead,
Archivo with the semi-condensed cut, white sheets with no shadow and no border, the validated
dataviz palette, tier medals), every chart in a `Figure`, every number drilling to its records,
`uses` and `metricId` on every KPI, figure and finding, plain sentence-case copy, and the privacy
rules in ARCHITECTURE.md and VIEWS.md. Nothing that looks AI-built: no gradients, glows,
glassmorphism, sparkle icons, emoji, greetings or hero copy.

Note on paths: the tokens live in `src/styles/tokens.css` and are mapped to Tailwind in
`src/styles/index.css` (there is no `src/index.css`).

---

## 1. Audit

Method: the lead's dev server on the sample (Northgate Semiconductor, as of 30 Sep 2026), Chrome
at 1440 x 900 and 375 x 812, light and dark, plus DOM measurements and a read of the shared
components. Pages looked at in the browser: Scorecard, Recruiting, People stats, Org chart,
Talent, Compensation, Action center, Data room (Datasets, Data quality), the drill panel,
Settings and Ask. Onboarding, HR ops, Compliance, Listening and AI in HR are audited from code
and figure counts only and are marked so.

Overall: the bones are good. The chart kit already follows most dataviz rules (thin bars with
rounded data ends, hairline solid grids, muted axis text, tooltips built with `textContent`,
values leading labels, fixed categorical order, a validated palette). What makes the app feel
dated or cramped is the layer around the charts: an eroded type scale, crowded KPI tiles,
repeated chrome on every sheet, a home page with no charts, long text-first pages on phones, and
weak surface separation in dark mode.

### 1.1 Across the app

| # | Problem | Evidence |
|---|---|---|
| A1 | The type scale has drifted. ARCHITECTURE.md allows 11 / 12 / 13 / 14 / 16 / 20 / 28 / 40 px; the code uses seven more sizes. | `text-[15px]` x23 (Figure title, WelcomeCard, Ask `Answer.tsx`, Data room `DictionaryBar.tsx`, `MappingTab.tsx`), `text-[22px]` x8 (`DrillPanel.tsx`, `SettingsSheet.tsx`, `AskSheet.tsx`, `HelpSheet.tsx`, `PersonCard.tsx`, `MetricDetail.tsx`), `text-[17px]` x5 (`settings/ui.tsx`, `Answer.tsx`, `TurnView.tsx`, `TourLayer.tsx`), `text-[18px]` x3 (`FolderTabs.tsx`, `Masthead.tsx`, `Loading.tsx`), `text-[21px]` (`FolderTabs.tsx`), `text-[26px]` and `sm:text-[30px]` (`KpiStrip.tsx`, `PersonCard.tsx`). 43 off-scale uses in all. |
| A2 | Sheet titles do not form a hierarchy: a figure title is 15px, the readout title 16px, the scorecard's waiting sheet 15px, side sheets 22px. | `Figure.tsx` h3 `text-[15px]`; `Readout.tsx` h2 `text-[16px]`; `ScorecardPage.tsx` `Waiting` h2 `text-[15px]`; `DrillPanel.tsx` / `SettingsSheet.tsx` `text-[22px]`. |
| A3 | Radii are ad hoc. Tokens give 6px (sheet) and 4px (control); components add 3px, 2px, 1px and 8px by hand. | `rounded-[2px]` x46, `rounded-[3px]` x32 (Tag, StatusPill, chips, Menu items), `rounded-[8px]` in `help/ui/TourLayer.tsx`. |
| A4 | Muted ink fails text contrast on the desk. `--muted #737b8a` is 3.67:1 on `--page #eceef1`, 3.87:1 on `--sheet-2` and 4.12:1 on `--sheet`. It sets most 11 to 12px text: notes, "1,450 people in scope", deltas' comparison labels, axis ticks. | Computed from `tokens.css`; WCAG AA needs 4.5:1 for text this size. |
| A5 | Sheets barely lift off the desk in dark mode: `--page #0d0f12` to `--sheet #16191e` is a 4.5-point OKLab lightness step (1.09:1). In light it is 4.0 points. Combined with no shadow and no border, sheets in dark read as one dark field. | Computed; visible on Recruiting and People stats in dark at 1440. |
| A6 | KPI tiles are crowded and misaligned. A label that wraps pushes its value down, so values in one strip sit on different baselines. The target line truncates the one number it exists to show. The tier badge sits in its own row at the foot (`mt-auto`), leaving a band of empty space in short tiles. Notes run to three lines of formula text. | Talent at 1440: "Regretted exits, rated 4-5" wraps and its "39" sits 18px lower than its neighbours; "Missed target at least 8..." (Critical roles covered) and "target at least 9..." (Required training). Recruiting: "target at most 4..." (Median time to fill). Compensation: "target at least 8...", "target at most 2...". Phones: "target at m...". People stats notes: "166 exits over an average headcount of 1,383, annualized". `KpiStrip.tsx` `TargetLine` uses `truncate`. |
| A7 | Every sheet repeats the same five controls. Each figure header carries a tier badge (glyph and word), a table toggle, a definitions button and an export button, all in full ink. On Recruiting's Overview that is 5 figures x 4 controls plus 7 KPI tier badges and 6 finding tier badges: the chrome competes with the data. | `Figure.tsx` header; `IconButton` ghost variant is `text-ink-2`. |
| A8 | Instructions in the copy. Subtitles and notes tell the reader to click: the tooltip already says "Click to see the records". It reads like template filler and adds a line to every sheet. | "click a value to see the records" (scorecard note), "click a segment or a count to see the candidates" (Pipeline today), "Select a box to see the people in it." (9-box), "Select a row to focus on it." (Sub-org scorecard), "Select a bar to see its items." (`ActionCenter.tsx` x2), "Select a row to open the person." (`hrbp/ui/Attrition.tsx`, `Movement.tsx`), "Click a square for its blank or invalid rows." and two more in `QualityTab.tsx`, "Click a cell / a bar or ribbon to see the people." (`JobSection.tsx`, `OrgSection.tsx`). |
| A9 | Four different loading treatments, all a bare line of text on an empty desk, so the page height jumps when content lands. | "Preparing the data. Nothing leaves this browser." (`Loading.tsx`), "Reading each practice's measures and findings." (`ScorecardPage.tsx`), "Collecting open items from every view." (Action center), "Loading data quality..." (Data quality tab, with three dots). |
| A10 | Empty figures nest a gray box in the sheet (a card in a card) that is shorter than the chart it replaces, so rows of figures go ragged. | `Figure.tsx` empty body: `min-h-28 rounded-control bg-sheet-2`. |
| A11 | Status color fills whole bars where status is not the figure's subject. The light `--warning #fab219` is 1.79:1 on the sheet: long yellow bars read washed out in light and glare in dark, and the status glyph already says the same thing. | Recruiting, Open reqs by department: aged departments are solid yellow bars plus a diamond glyph (`BarList tone`). `BarList` already has `glyphTone` for exactly this. |
| A12 | Chart marks cannot be reached by keyboard. Hover shows a tooltip and a click drills, but nothing in `src/charts/kit` or `plot.tsx` takes focus or keys (only `DataTable.tsx` does). The table view is the only keyboard path to a value. | grep for `tabIndex` / `onKeyDown` in `src/charts`. |
| A13 | Charts cannot annotate. The story a finding tells ("Offer acceptance fell to 68% in Q3") is not marked on the chart that shows it; the reader has to match the readout to the line. There is no annotation primitive. | Offer acceptance by quarter drops to 68% with no note; Offers accepted by month spikes to 48 in Sep 2026 with no note. No `annot` / `callout` anywhere in `src/charts`. |
| A14 | Phones put two to four screens of chrome and text before the first chart. | 375 x 812: the band is 194px tall, the filter row wraps to three rows plus the data standard row, the Scorecard title sits at 431px and its first sheet at 821px. Recruiting: the KPI strip starts at 656px and is 657px tall, then the full readout; the first chart is at 2,877px. People stats: first chart at 3,278px. |
| A15 | Folder tab colors cross-fade when the open tab changes (`transition-colors duration-100` on the selected background), so the open tab passes through a mid gray before it becomes the desk. Caught mid-transition in testing at `rgb(192,194,198)`. | `FolderTabs.tsx` tab class. |
| A16 | Masthead pages hang from nothing. On the Data room and the Action center no folder tab is open, so the band ends in a flat edge and the desk loses its tab. | Data room and Action center at 1440. |
| A17 | Table headers use two styles: uppercase tracked eyebrows in the scorecard and the Data room, sentence case in DataTable and the drill panel. | `ScoreTable.tsx` `HEAD = 'eyebrow ...'`; Data room Datasets table "DATASET TIER SOURCE ROWS"; drill panel "Employee ID Name Job title". |

### 1.2 Shell (masthead, folder tabs, filter row, view header)

- Masthead: tidy at 1440. The Action center badge reads "574" in an ink-filled chip on every page;
  a count that never nears zero in solid ink reads as an alarm (`Masthead.tsx` `ActionsButton`,
  `bg-ink text-on-ink`). The wordmark is 18px, off the scale.
- Folder tabs: the strongest part of the identity and it works: eleven tabs fit from 1280px with
  live headlines and sparklines. Issues: A15, and the number sizes 18 / 21px are off-scale.
- Filter row: two rows on desktop (filters, then "Data standard Production / Validated /
  Everything · Datasets 3 gold 8 silver 4 bronze"), which costs 32px on every page. On phones it
  becomes four rows (A14).
- View header: title, scope line, then a third line with "About this view" and "AI agents for
  Recruiting (4)". Three lines of small text before the sub-tabs; the two links could ride on the
  scope line.

### 1.3 Scorecard (home)

- The home page has no charts. One figure, the People scorecard table, and the readout. The only
  graphics are 72px sparklines in the table. Page height 2,479px at 1440.
- The first thing on the page is the WelcomeCard ("New to Census?" with "Take the 2-minute tour"
  in an ink button), above any number. A full-width onboarding banner in the prime spot is a
  template move.
- The table is dense and good as a record (value, target, status pill with icon and word, change,
  trend, tier), but it is the wrong lead for a monthly people review: nothing shows at a glance
  how far each measure is from its target or which practices carry the misses.
- "Top findings across Census" is a long column of 14px headlines and 13px detail with three links
  each; the tier badge sits inline after the headline sentence and wraps mid-line.

### 1.4 Recruiting (Overview)

- Five figures; the readout (span 4) runs the whole page height beside Pipeline today, Hiring and
  Requisitions, so the right column carries all the charts and the left column is text.
- KPI strip: A6 (two truncated targets). Seven tiles each with a tier medal.
- Open reqs by department: A11 (solid yellow bars). Offers accepted by month and Offer acceptance
  by quarter: A13 (no annotation of the September spike or the Q3 drop).
- Pipeline today is a good lead chart (stage bars split by next-step state with a "lack a next
  step" glyph and count at the bar end).
- Dark: the yellow bars are the loudest thing on the page.

### 1.5 People stats (Overview)

- Three figures and the readout. Headcount over time is a large 484px sheet for one rising line;
  its y axis starts at 1,250, which is fine for a line, and the prior year is correctly
  de-emphasized.
- KPI notes are formulas ("166 exits over an average headcount of 1,383, annualized"); they belong
  in the definition popover, with a short note on the tile.
- Sub-org scorecard: good use of washes plus arrows; header labels at 11px.
- 375 dark: Headcount over time shows one x tick label ("Jan '26") for 12 months, and its end
  label "Last 12 months 1,450" runs to the sheet's right edge.

### 1.6 Org chart

- Opens at 61% zoom to fit nine top-level cards across, so card text (14px names, 11 to 12px
  detail) renders at roughly 7 to 8px: unreadable until the reader zooms.
- The canvas sheet is 846px tall and the tree fills about the top 250px; the rest is an empty
  `bg-sheet-2` field.
- Each card carries a 3px business-unit color rail on its top edge (`Card.tsx`, `absolute inset-x-0
  top-0 h-[3px]`). ARCHITECTURE.md bans colored accent rails; this one is a color key, so it should
  look like the legend's swatch, not a rail.
- KPI strip of five with tier badges at the foot of short tiles (A6): large empty bands.

### 1.7 Talent (Overview)

- 9-box: a sequential heat grid that works, but the center cell (404 people) is filled with the
  darkest step (`seq-700`, #0d366b) at about 150 x 70px with white text: the heaviest block on the
  page, heavier than the finding it supports.
- KPI strip: two truncated targets (A6); "Regretted exits, rated 4-5" wraps and drops its value.
- Readout headlines with inline tier badges wrapping mid-sentence.

### 1.8 Compensation (Overview)

- Compa-ratio distribution (histogram with the healthy band shaded and a 1.00 rule) and Range
  position by business unit (100% bars, labels inside the wider segments) are among the best
  charts in the app.
- KPI strip: two truncated targets. "Median compa-ratio by department" is 707px tall for one
  BarList; a long list needs `top` with "Other", or the table.

### 1.9 Views audited from code only

- Onboarding (20 figures, 15 kit charts), HR ops (27, 21), Talent (26, 19), Compensation (25, 20),
  Listening (22, 18), People stats (28, 21): rich already; they need the shared polish more than
  new figures.
- Compliance: 12 figures but only 5 kit charts; six are tables. It is the most text-and-table view
  and gets the most new charts in appendix A.
- AI in HR: 2 figures, no charts. Action center: 2 charts (Where items wait, Where items come
  from) over 12 owner tables; Where items wait stacks large critical red and warning yellow
  segments (A11, acceptable here because due state is the subject).

### 1.10 Data room

- Datasets tab: header copy ("Files you add stay in this browser...") repeats the page footer
  ("Everything stays in this browser..."). An uppercase eyebrow strip ("REPORTING DATE", "PAY
  AMOUNTS") and uppercase table headers (A17). Field coverage as 2px s1 bars in table cells: good.
- Data quality tab: 5,560px of mostly tables, opening with a two-sentence paragraph on the desk and
  a run-on summary line. The figures that would orient a reader (tiers by dataset, the field fill
  matrix) sit far down.
- No open folder tab (A16).

### 1.11 Drill panel

- 820px side sheet; title 22px (A1). The 130-row voluntary leavers table sets 12px cells with
  `padding: 6px 8px 6px 0` and lets text wrap: job titles run to three lines ("Staff Design
  Verification Engineer"), so rows vary from 32 to 56px and the list is hard to scan.
- No overview of the list: the reader cannot see at a glance that 57 of 130 are in Bengaluru
  without sorting.

### 1.12 Settings

- A 560px sheet in the page tone with a white card inside it (`m-3 rounded-sheet bg-sheet`), and
  inside that the data standard choices as bordered option boxes: cards in cards in a sheet.
- The section nav (Display, Data, Formulas, Official lists, Privacy, Ask Census, Compensation
  cycle, Related tools, This device) wraps onto two rows of small links.
- The sheet description is one 40-word sentence listing every section.

### 1.13 Ask

- Without an API key the 640px sheet shows the same introduction twice (the description and the
  body both open with "Ask a question about your people data...") and is otherwise empty below
  the key notice. A reader cannot tell what Ask would do for them.
- Answer text at 15 and 17px (A1).

### 1.14 Dark mode

- A5 (sheet separation). The band (#171a1f) is lighter than the page (#0d0f12), which inverts
  the light theme's order; acceptable, since the band is graphite in both themes, but it makes the
  desk look darker than the masthead.
- Charts hold up: the validated dark steps are in use and the gridlines are visible. Status yellow
  fills glare (A11).

### 1.15 Phone (375)

- No sideways page scroll anywhere checked (scrollWidth 375 on every page). Good.
- A14 is the main problem: chrome first, charts three screens down.
- KPI strip in two columns works, but seven tiles with tier rows make it 657px tall.
- Charts keep their desktop heights (Headcount over time is about 420px tall at 375).

### 1.16 What reads as AI-built or templated today

Small, but they add up: the onboarding banner at the top of the home page; instructions in
subtitles (A8); duplicated explanatory sentences (Ask intro twice, Data room privacy line twice,
the Settings run-on description); a notification-style count badge in solid ink; cards nested in
cards (Settings, empty figures); and, on phones, a stack of controls before any number. There
are no gradients, glows, sparkle icons or emoji anywhere, and that must stay true.

---

## 2. Visual direction

Keep the concept: practices are folder tabs on a cool-gray desk, every figure is a white sheet on
it. The refresh makes it calmer and more exact: a strict type scale, a 4px rhythm, quieter
chrome, KPI tiles that align, charts that annotate the one thing that matters, and a home page
per role that leads with charts.

### 2.1 Color and surfaces

Token changes in `src/styles/tokens.css` (dark values go in both the media-query block and the
`[data-theme="dark"]` block):

| Token | Light now | Light new | Dark now | Dark new | Why |
|---|---|---|---|---|---|
| `--page` | #eceef1 | #e8eaee | #0d0f12 | #0a0c0f | desk to sheet step 4.0 to 5.2 points (light), 4.5 to 7.2 (dark) |
| `--sheet` | #fbfbfc | same | #16191e | #181c22 | |
| `--sheet-2` | #f3f4f6 | same | #1c2026 | #1f242b | keeps a 3.3-point step above the sheet |
| `--sheet-3` | #e7e9ed | same | #242931 | #272d35 | |
| `--muted` | #737b8a | #616a78 | #8a919d | same | light: 4.54:1 on the new page, 4.97:1 on sheet-2, 5.29:1 on sheet (was 3.67 / 3.87 / 4.12) |
| `--rule` | | same | #262a31 | #2b3038 | rule stays 8 points above the new sheet |
| `--rule-strong` | | same | #363b44 | #3b414b | |
| `--grid` | | same | #22262c | #252a31 | gridline stays 5.8 points off the sheet, as now |
| `--axis` | | same | #3b414a | #444b56 | |
| `--deemph` | | same | #474d57 | #4a515c | 2.14:1 on the new sheet, as now |

Checked: the categorical palette passes every check on the new dark sheet (`validate_palette.js
... --mode dark --surface #181c22`: worst adjacent CVD delta E 8.4, normal-vision 19.3, every slot
at least 3:1) and on the light sheet (worst adjacent CVD 9.1; aqua, yellow and magenta are under
3:1, so the relief rule stands: visible labels or the table view). The three-step ordinal ramp
`--seq-250 / --seq-400 / --seq-600` passes `--ordinal` in both modes (light end 2.04:1 light,
2.11:1 dark). Tier glyphs stay at least 3:1 on the new page (gold 3.55, silver 3.38, bronze 4.24).

Color by job, unchanged: one series in `--s1`; identities in fixed order; magnitude on the blue
ramp; polarity on the diverging pair; state only in status colors with a glyph and a word;
emphasis (one in `--s1`, the rest `--deemph`) when the story is one thing. New rule for A11: a
status color fills a whole bar only when status is the figure's subject (Action center due state,
readiness status). Elsewhere a flagged bar keeps its series color and carries the status glyph
and word at its end (`BarList glyphTone`).

### 2.2 Type scale

One scale, as named Tailwind tokens in `src/styles/index.css` `@theme`, so the classes say what
they are for and a test can ban everything else:

| Token (class) | Size / line height | Weight and cut | Used for |
|---|---|---|---|
| `text-label` | 11 / 1.35 | 500 to 600 | tier word, tags, pills, axis ticks, legend in dense places, table header on phones |
| `text-meta` | 12 / 1.4 | 400 to 500 | notes, deltas, scope line extras, table cells in the drill panel, tooltips |
| `text-small` | 13 / 1.45 | 400 to 500 | subtitles, deks, table cells, buttons, finding detail |
| `text-body` | 14 / 1.45 | 400; 600 for finding headlines | body text, readout headlines |
| `text-title` | 16 / 1.3 | 600, `cut-head` | every sheet title: Figure, Readout, EmptyState, settings sections, KPI-strip title |
| `text-section` | 20 / 1.2 | 600, `cut-head` | Section headings, side-sheet titles (drill, Settings, Ask, Help), folder-tab numbers on wide tabs |
| `text-page` | 28 / 1.1 | 650, `cut-head` | view title (h1), KPI values |
| `text-display` | 40 / 1.05 | 650, `cut-head` | Person card headline number, Data room big counts |
| `text-hero` | 48 / 1.0 | 650, `cut-head` | one hero figure per role home page, nowhere else |

Rules: proportional figures on KPI, hero and folder-tab values; `tnum` only for numbers that
align in columns or on axes. IDs stay `font-mono` 12px. The wordmark is the one exception
(18px bold, in `Mark.tsx`/`Masthead.tsx` only). Mapping of today's off-scale sizes: 15 to 16
(`text-title`), 17 to 16, 18 and 21 to 20 (`text-section`), 22 to 20, 26 and 30 to 28
(`text-page`).

### 2.3 Spacing rhythm

A 4px base. The steps in use: 4 (inside a control), 8 (between related lines), 12 (section
heading to its grid), 16 (grid gap everywhere, sheet side padding on phones), 20 (sheet side
padding from 1024px, view header to body), 40 (between sections). Nothing lands between them.

- Sheet insets: `px-5` (20px) from 1024px, `px-4` (16px) below; header `pt-4`, body `pt-3 pb-5`,
  note `pb-4`. Today the figure header is `pt-3.5` (14px) and the note `pb-3.5`, off the rhythm.
- Grid gap stays 16px at every width (ARCHITECTURE.md contract).
- Section: 40px above, heading block then 12px to the grid. View header bottom rule to body 20px.

### 2.4 Sheets

No change to the concept: `bg-sheet rounded-sheet`, no shadow, no border, hairline `border-rule`
inside. Changes:

- Never nest a filled box in a sheet (A10): empty, held-back and preview states use plain text on
  the sheet with a muted 16px icon.
- Side sheets (drill, Settings, Ask, Help) are a single surface: `bg-sheet` body, sections divided
  by hairlines, titles `text-section`.
- Radius tokens: `--radius-sheet` 6px, `--radius-control` 4px, new `--radius-chip` 3px (tags,
  pills, badges, chips, menu items) and `--radius-mark` 2px (inline focus outlines on links and
  drill numbers). No other radius values.

### 2.5 KPI tiles

Anatomy, top to bottom, aligned across the strip with CSS subgrid (`grid-rows-subgrid`, the strip
defines five row tracks; fallback: the label block reserves two lines with `min-h-[2lh]`):

1. Label row: label (`text-meta`, ink-2, up to two lines, never truncated) on the left; on the
   right the tier medal with its word (`text-label`) and the info button. The tier no longer takes
   its own row at the foot.
2. Value row: value `text-page` (28px at every width), proportional figures, drillable; sparkline
   72 x 24 on the right, bottom-aligned to the value's baseline.
3. Change row: arrow, signed change, comparison in muted (`text-meta`); wraps, never truncates.
4. Target row (when the metric has a target): quiet StatusPill ("Met" / "Missed") and "target at
   most 45 d" in full, wrapping if needed.
5. Note row: one short note (`text-meta`, muted), drillable when it counts a subset. Formula notes
   move into the definition popover; producers keep notes to one short clause.

Tiles stay separated by hairlines inside one sheet (no cards). A strip takes `span` so a home page
can set a hero figure beside it. On phones the strip shows two tiles a row and, past four tiles,
the first four plus "Show all 7" (a button; the rest stay in the export).

### 2.6 Hero figure (role homes only)

One per home page: the number the role is judged on, `text-hero` (48px), in a Figure with its
breakdown directly under it (for HR, a status split bar of measures met, on watch, missed and
without a target). Same sans as everything else; no display face, no color on the number.

### 2.7 Charts

Marks (kit already close; keep): bars at most 24px with 4px rounded data ends and square
baselines; 2px surface gaps between stacked segments and touching bars; lines 2px with round
joins; dots at least 8px with a 2px sheet ring; areas at 10% opacity.

- Axes: no domain line; tick labels `text-label` muted with `tnum`; 4 to 5 nice y ticks; at
  least 3 x tick labels at any width (start, middle, end), so a phone never shows one lonely
  "Jan '26". Units ride in the tick format (`%`, `d`, `yrs`) or, for counts, in the subtitle.
- Gridlines: 1px solid `--grid`, horizontal only for columns and lines, vertical only for
  horizontal bars. The zero baseline in `--axis`. Never dashed.
- Reference lines: 1px `--ink-2` with an 11px ink-2 label ("Company 52 d", "Target 95%"),
  as now (`refRule`).
- Labels: value at the bar tip, on the column cap, at the line end; never on every point. End
  labels live inside the figure: the right margin is computed from the measured label width
  (`textWidth`), fixing the 375 overflow on Headcount over time.
- Annotations (new, A13): up to two short notes per chart, tied to a datum: a 1px ink-2 leader
  from the point to an 11px ink-2 label with a sheet-colored halo ("Fell to 68%, mostly
  Bengaluru"). Placed in free space above the marks; if it would collide, it is dropped and the
  tooltip and table carry it. Producers take the note text from the finding that cites the
  chart's metric, so chart and readout tell the same story.
- Legends: above the plot, left-aligned, `text-meta` ink-2, swatch mirrors the mark (rect, line,
  dot, diamond, and a new medal swatch for tier-coded charts). For at most four series, also
  direct-label line ends.
- Tooltips: unchanged structure (value strong, label secondary, line keys, `textContent` only);
  title row in `text-label` muted; one shared note "Click to see the records".
- Keyboard (A12): every kit chart is one tab stop. Arrow keys move through the data in reading
  order and show the same tooltip at the datum; Enter or Space drills; Escape clears. A visible
  focus ring wraps the chart and a 2px ink outline marks the focused mark.
- Heights: lead figure 280px plot (220px under 768px); standard 220px (180px); small multiples
  96px; BarList grows with rows (28px a row) and folds past 12 rows into "Other" with
  `onSelectOther`.
- Status fills: see 2.1. Status glyph shapes stay matched to the icons (circle good, diamond
  warning, square serious, triangle critical).
- Heatmaps: the darkest step is `--seq-600` for cells larger than 48 x 48px (9-box, merit
  matrix), so one cell never becomes the page's heaviest block; cell text picks ink or white by
  the fill's luminance (`inkOn`).

### 2.8 Tables

One style for DataTable, ScoreTable, the Data room manifest and the drill panel:

- Header: `text-meta` 500 ink-2, sentence case (no uppercase eyebrows), hairline `--rule-strong`
  under it, sticky inside the scroller.
- Rows 36px (32px in the drill panel), hairline `--rule` between rows, hover `bg-hover`, selected
  `bg-sheet-2`. No zebra stripes.
- Numbers right-aligned with `tnum`; IDs mono 12px; text cells clamp at two lines with the full
  value in `title`; job titles and names never wrap past two lines.
- Status cells use StatusPill (icon and word). On phones the first column is pinned and the table
  scrolls sideways inside its sheet.

### 2.9 Findings (Readout)

- Each finding: a meta line (`text-label`: practice tag, tier medal and word) above the headline,
  so the badge no longer wraps mid-sentence; headline `text-body` 600; detail `text-small` ink-2;
  "Next step:" line; links in one row.
- Overviews show the first four findings and "Show n more". Role homes use a compact variant:
  headline, next step and the first link only.
- Phones: the lead chart comes before the readout (section 2.13).

### 2.10 Empty states

- A figure with nothing to show keeps the height its chart would have had, so a row of figures
  stays even; inside, a muted 16px icon and one or two sentences (`text-small`), plus one link
  when there is something to do ("Open the Data room", "Upload Requisitions").
- A whole view with no data uses EmptyState, unchanged apart from type tokens.
- Mode-hidden content never shows an empty state or a lock: it is simply not there. `IconLock`
  stays reserved for privacy suppression ("Hidden to protect anonymity"), so nobody reads a mode
  as a permission system.

### 2.11 Loading and updating

- First load: the sheets appear at their final size with their titles, and one quiet status line
  inside the lead sheet (`role="status"`). No spinners, no shimmer, no skeleton blocks that
  flash. A new `Pending` component replaces the four variants in A9.
- Recompute (a filter change, a mode change): charts hold their previous render at 60% opacity
  until the new one is ready (the scorecard already does this); no layout jump.

### 2.12 Motion

- View and sub-tab change: content fades in over 120ms with a 4px rise (as now).
- Folder tabs: the selected state changes instantly; only hover transitions (A15).
- Side sheets slide 200ms; menus and popovers fade and scale 100ms (as now).
- Chart marks never animate on load or on filter change.
- "Reduce motion" in Settings and the OS setting both stop all of it (as now).

### 2.13 Phones (under 768px)

- Band: wordmark and icon buttons on one row, the company line on the second (as now).
- Filter row: the period control plus one "Filters" button with the count of active filters,
  opening a bottom sheet with every org filter, saved views and the data standard. Active filters
  still show as removable chips under it. This keeps one filter row (FILTERS.md) in one line.
- View header: title and scope line; view actions collapse into a "More" menu except the view's
  primary action.
- Order on overviews: KPI strip (first four tiles), lead figure, readout (first two findings),
  then sections. Target: the first chart starts within the first 1.5 screens (top at or above
  1,200px at 375 x 812).

### 2.14 Copy polish (applies everywhere)

- Remove click and select instructions from subtitles and notes (A8). The tooltip says "Click to
  see the records"; Help explains drilling once.
- One statement per idea: drop the duplicated privacy line in the Data room header (the footer
  says it), the duplicated Ask introduction, and shorten the Settings description to one plain
  sentence ("Display, data, formulas, privacy and this device.").
- Notes state the population and the date only ("235 reqs filled · as of 30 Sep 2026").

---

## 3. Shared-component changes, by file

Apply in this order; each step leaves the app building and the tests passing. Lead-owned files
are marked (lead); changing them is expected here, and the report should list them.

### 3.1 Tokens and styles

| File | Change |
|---|---|
| `src/styles/tokens.css` (lead) | Surface, muted, rule, grid, axis and deemph values from 2.1 in both dark blocks; `--radius-chip: 3px`, `--radius-mark: 2px`. |
| `src/styles/index.css` (lead) | `@theme` text tokens from 2.2 (`--text-label`, `--text-label--line-height`, ... `--text-hero`); `--radius-chip` and `--radius-mark` mapped to `rounded-chip` / `rounded-mark`. Keep `.cut-head`, `.cut-tab`, `.tnum`, `.eyebrow` (eyebrow is for section eyebrows only, not table headers). |
| `src/styles/typeScale.test.ts` (new) | Fails on any `text-[Npx]` or `rounded-[Npx]` class in `src/**/*.tsx`, with an allowlist of one entry (the wordmark). |
| `src/styles/tierTokens.test.ts` | Add the new surfaces, and assert `--muted` is at least 4.5:1 on `--page`, `--sheet` and `--sheet-2` in both themes. |

### 3.2 Primitives and page structure

| File | Change |
|---|---|
| `src/components/ui.tsx` (lead) | Tag, StatusPill, Menu items, Segmented thumbs: `rounded-chip`. `IconButton` ghost default `text-muted`, `hover:text-ink` (quiets A7). Type classes to tokens. |
| `src/components/KpiStrip.tsx` | Tile anatomy from 2.5 (subgrid rows, tier and info in the label row, value `text-page`, no `truncate` in `TargetLine`); `span` prop (default 12); phones: first four tiles plus "Show all n". Keep every `data-tour` anchor (`kpi-strip`, `kpi-info`, `kpi-value`, `kpi-tier`), moving `kpi-tier` with the badge. |
| `src/components/Readout.tsx` | Meta line above the headline (practice tag, tier); `limit` (default 4 on overviews) with "Show n more"; `variant="compact"` for homes. |
| `src/components/Section.tsx` | Title `text-section`, dek `text-small` at most 70ch; spacing from 2.3. |
| `src/components/EmptyState.tsx` | Type tokens; no other change. |
| `src/components/Pending.tsx` (new) | Reserved-size sheet frame(s) with titles and one status line; props `title`, `span`, `height`, `message`. Replaces `Waiting` in `ScorecardPage.tsx`, the Action center's "Collecting open items...", the Data quality "Loading data quality..." and similar lines. |
| `src/data/context.tsx` (lead) | Expose `pending: boolean` (a deferred analytics context is being computed) so Figure and KpiStrip can hold the old render at 60% opacity. |

### 3.3 Figure and chart kit

| File | Change |
|---|---|
| `src/charts/Figure.tsx` | Insets from 2.3; title `text-title`, subtitle `text-small`; header controls quiet (A7); empty body without the inner box and at the chart's reserved height (`emptyHeight`, default 220); `pending` from context sets `opacity-60`; `variant="compact"` (title and export only) for the drill panel's summary figures. |
| `src/charts/plot.tsx` | Keyboard layer (2.7): `tabIndex=0` on the chart group, arrow keys step a focus index through `keyPoints` (pixel centers per datum, supplied by each kit chart from its scales), the same tooltip renders at that point, Enter or Space calls `onSelect`, Escape clears. Minimum three x tick labels at any width. |
| `src/charts/core/marks.ts` | `noteMark(note, theme)` for annotations: leader line plus halo label, collision-checked with `textWidth`, dropped when it does not fit. Type `ChartNote = { at: x or category; value?: number; text: string }`. |
| `src/charts/core/legend.ts`, `src/charts/Legend.tsx` | Add a `medal` swatch shape (tier glyph) for tier-coded charts. |
| `src/charts/theme.ts` (lead) | Add `tier: { gold, silver, bronze }` resolved colors for SVG glyphs. |
| `src/charts/kit/Lines.tsx` | `notes?: ChartNote[]` (at most 2); right margin from measured end-label width; responsive default height (2.7). |
| `src/charts/kit/Columns.tsx`, `HBars.tsx` | `notes?`; responsive default height. |
| `src/charts/kit/BarList.tsx` | `notes?`; document that `tone` (fill) is for status-subject figures and `glyphTone` otherwise; fold past 12 rows by default when `top` is not given. |
| `src/charts/kit/Heatmap.tsx` | Cap the ramp at `--seq-600` when cells exceed 48 x 48px. |
| `src/charts/kit/BulletList.tsx` (new) | One row per measure, each on its own scale: a 6px `--sheet-3` track from 0 to 1.15 x max(value, target), an 8px `--s1` bar for the value with a 4px rounded end, a 2px x 16px ink tick at the target, then the value (`text-small` 600) and a status glyph with its word. Props: `data`, `label`, `value`, `target`, `format` (a function of the row, units differ by row), `status`, `group?` (row group headers, e.g. practice), `onSelect`, `onSelectLabel`. Root `<svg data-chart>`; keyboard and tooltip as the kit. Used by the HR home (measures against target) and the developer home (freshness against limit). |
| `src/charts/kit/TrendGrid.tsx` (new) | Small multiples: one 160 x 96 cell per series, its own y scale (said in the subtitle), a 2px `--s1` line, endpoint dot with a sheet ring, the target as a 1px ink-2 rule, the measure name (`text-meta`) and latest value (`text-body` 600) above; tooltip per point; keyboard steps cells then points. Exports one long table (series, period, value, target). |
| `src/charts/kit/StatusSplit.tsx` (new) | One 100% bar, 12px tall, 2px gaps, segments in status colors in a fixed order (met, watch, missed, no target, not shown); counts with glyph and word under each segment, never inside; each segment drills (`onSelect`). Root `<svg data-chart>`. |
| `src/charts/Sparkline.tsx` (lead) | Optional `target` (1px ink-2 rule). |
| `src/charts/DataTable.tsx` | Table style from 2.8: header, 36px rows, two-line clamp, sticky header, `pinFirst` on phones. |
| `src/charts/index.ts` | Export `BulletList`, `TrendGrid`, `StatusSplit`, `ChartNote`. |
| `src/charts/__gallery__/Gallery.tsx` | Add the three new charts and an annotated Lines and Columns, light and dark. |

### 3.4 Shell and sheets

| File | Change |
|---|---|
| `src/app/FolderTabs.tsx` | Transition on hover only (A15); tab numbers `text-section` (20px), `text-title` on narrow tabs; when the route is a masthead page (Action center, Data room), render one open tab for it at the right end of the strip so the desk always hangs from a tab (A16). The tab list per mode comes from the modes spec. |
| `src/app/FilterBar.tsx` | From 1280px the data standard folds into the filter row's right end as a compact menu ("Standard: Everything") beside "1,450 people in scope", removing the second row. Under 768px: period control plus "Filters (n)" opening a bottom sheet (2.13). |
| `src/app/ViewHeader.tsx` | "About this view" and the AI agents link join the scope line as trailing muted links; title `text-page`; phones collapse actions into "More". |
| `src/app/Masthead.tsx` | Actions count in a quiet chip (`bg-sheet-3`, `text-ink`), the critical count in its tooltip; the count follows the mode's scope (modes spec). |
| `src/app/Loading.tsx` | First frame matches the role home layout (hero sheet, tile strip, lead sheet) using `Pending`. |
| `src/drill/DrillPanel.tsx` | Title `text-section`; a collapsible "Summary" with two compact figures (count by department and by level, BarList top 5 plus Other, both drillable to the subset); table per 2.8 at 32px rows. |
| `src/drill/PersonCard.tsx` | Headline number `text-display`, other sizes to tokens. |
| `src/app/settings/SettingsSheet.tsx`, `src/app/settings/ui.tsx` | One surface (no inner card); radio options as rows divided by hairlines; from 1024px a two-pane sheet (section list on the left, 168px); title `text-section`; one-sentence description. |
| `src/ask/ui/AskSheet.tsx`, `Answer.tsx`, `TurnView.tsx` | Title `text-section`; answer text `text-body`, answer headings `text-title`; no-key state says it once and lists four example questions (disabled until a key is added): "How has voluntary attrition in Bengaluru changed this year?", "Which departments have reqs open longer than 90 days?", "How many people start in the next 30 days?", "Which critical roles have no ready-now successor?". |
| `src/help/ui/WelcomeCard.tsx` | Becomes one quiet line under the view header on first visit ("New to Census? Take the 2-minute tour." with a ghost button and "Not now"); no card, no ink button. |
| `src/help/ui/TourLayer.tsx`, `ArticleView.tsx`, `HelpSheet.tsx` | Type and radius tokens. |

### 3.5 View-level edits the same agent makes everywhere

1. Replace off-scale text and radius classes (the test in 3.1 lists them).
2. Remove click and select instructions from subtitles and notes (A8 lists the strings).
3. Where `BarList tone` marks a flagged subset in a figure whose subject is not status, switch to
   `glyphTone` (Recruiting Open reqs by department first; grep `tone={` in `src/views`).
4. Replace local loading lines with `Pending`.
5. Add `notes` to the charts a finding cites (start with Offer acceptance by quarter, Offers
   accepted by month, Headcount over time, Resolution SLA by month, Day-one readiness by month).
6. Org chart: `src/views/org/ui/Card.tsx` replaces the 3px top rail with an 8px square swatch
   before the department line (the Legend swatch); `Canvas.tsx` opens at zoom 0.85 or more with
   the top two levels centered and fits the canvas height to the content (at least 360px, at most
   70% of the viewport).
7. `src/views/scorecard/ui/ScoreTable.tsx` and the Data room manifest and reporting strip
   (`src/views/data/ui/Manifest.tsx`, `ReportingLine.tsx`): sentence-case headers and labels.
8. Keep every `data-tour` anchor the tours use (`help/tours.ts`); `help/content.test.ts` must stay
   green.

---

## 4. Role home pages

Shared rules:

- Each mode opens on its home, which is the first folder tab of that mode. Routes and tab lists
  are the modes spec's; this file assumes `#scorecard` (HR, tab "Scorecard"), `#team` (manager,
  tab "My team") and `#developer` (developer, tab "Developer"). Developer mode also has the HR
  home and every view.
- Layout: the standard shell (band, filter row, view header). Desktop is the 12-column grid with
  16px gaps; tablets put spans 3 to 6 two a row; phones are one column in the order given.
- Every number drills to its records, down to the employee where the number counts people.
  Every figure, tile and finding carries `uses` and `metricId`. Figures reuse the producing
  view's engine (cached per context) and, where one exists, its figure component, so a number on
  a home page is the same number as on its view.
- Page titles are the tab names. No greeting, no date line beyond the scope line, no hero copy.
- Exports: "Export" on each home writes the page like any view (Excel and PowerPoint); the HR
  home keeps "Monthly people report".

### 4.1 HR home: Scorecard

Purpose: the monthly people review and an HRBP's first look. Leads with how many measures meet
target and how far each is from it, then where the workforce is moving, then the record.

```
1440 (12 columns)
+---------------------------+------------------------------------------------------+
| TARGETS MET (span 4)      | KEY FIGURES (KpiStrip span 8, 4 tiles)               |
|  4 of 21          (48px)  | Employees | Voluntary attrition | Open reqs |        |
|  [met|watch|missed|none]  |  1,450    |  9.4%               |  114      | Critical|
|  4 met · 7 watch · 10 ... |  +103     |  +0.7 pts           |  +82      | items   |
+---------------------------+------------------------------------------------------+
| MEASURES AGAINST TARGET (span 8)                    | TOP FINDINGS (span 4)       |
|  Recruiting                                          |  compact readout, 5 items   |
|   Median time to fill   [=====|    ]  52 d  Missed   |  critical first             |
|   Offer acceptance      [=======| ]  78.1%  Missed   |                              |
|  Onboarding ...                                      |                              |
+------------------------------------------------------+-----------------------------+
Section "How the workforce is moving"
+-------------------------------------+---------------------------------------------+
| Headcount over time (span 6)        | Hires and exits by month (span 6)           |
+-------------------------------------+---------------------------------------------+
Section "Where the pressure is"
+------------------------+------------------------+-----------------------------------+
| Voluntary attrition by | Pipeline today (span 4)| Where open items wait (span 4)    |
| business unit (span 4) |                        |                                   |
+------------------------+------------------------+-----------------------------------+
Section "Measure trends"
+-------------------------------------------------------------------------------------+
| TrendGrid: one cell per measure with a target, 6 cells a row (span 12)              |
+-------------------------------------------------------------------------------------+
Section "People scorecard"
+-------------------------------------------------------------------------------------+
| The existing People scorecard table (span 12), unchanged as the record and export   |
+-------------------------------------------------------------------------------------+
```

375 order: Targets met; four tiles (2 x 2); Measures against target (first 8 rows and "Show all
21"); Top findings (2 and "Show all"); Headcount over time; Hires and exits; Voluntary attrition
by business unit; Pipeline today; Where open items wait; Measure trends (2 cells a row); People
scorecard.

| Id | Title | Form | Data source | Metric | Drill |
|---|---|---|---|---|---|
| `scorecard-standing` | Targets met | Hero value plus `StatusSplit` | `useScorecard()` model: `counts`, `rows[].status` | `scorecard.measures.targetsMet` | Each segment lists its measures (the figure's table view filtered to that status); each measure drills through `row.kpi.drill` to people |
| `key-figures` (strip) | Employees; Voluntary attrition; Open reqs; Critical open items | KpiStrip, 4 tiles | People stats and Recruiting headlines and tile builders (`hrbp/engine/kpis.ts`, `recruiting/engine/kpis.ts`); Action center `summary.ts` | `hrbp.headcount.employees`, `hrbp.attrition.voluntary`, `recruiting.reqs.open`, `actions.items.critical` | Employees active at the as-of date; voluntary leavers in the window; open reqs; critical open items |
| `scorecard-measures` | Measures against target | `BulletList` grouped by practice | scorecard `rows` (value, target, status, `goodDirection`) | `scorecard.measures.status` | Value: `row.kpi.drill`; measure name: `row.opens` (the practice tab) |
| `scorecard-findings` | Top findings across Census | Readout compact, 5 | `model.findings.top` | `scorecard.findings.top` | Each finding's `drill`, "Focus on", "Open in" |
| `scorecard-headcount` | Headcount over time | Lines, 24 month ends, prior year `--deemph`, end label | hrbp workforce model (`computeWorkforce(prepare(ctx))`) | `hrbp.headcount.employees` | Point: employees active at that month end |
| `scorecard-flow` | Hires and exits by month | Columns grouped, 12 months, 2 series with legend | hrbp workforce and attrition models | `hrbp.flow.hires` (definitions include `hrbp.flow.exits`) | Bar: the hires or leavers that month |
| `scorecard-attrition-bu` | Voluntary attrition by business unit | BarList with company ref, glyph on units 3+ pts above | hrbp attrition model by business unit | `hrbp.attrition.voluntary` | Bar: voluntary leavers in the unit; Filter to this (`byGroup('businessUnit', ...)`); units under 5 show "—" |
| `scorecard-pipeline` | Pipeline today | Recruiting's `PipelineBars` | `computeRecruiting(ctx)` | as on Recruiting (`recruiting.pipeline.activeCandidates`) | Segment: candidates in that stage and state |
| `scorecard-items` | Where open items wait | Action center's figure (HBars stacked by due state, status colors, due state is the subject) | `collectActions(ctx, views)` | `actions.items.open` | Segment: the items |
| `scorecard-trends` | Measure trends | `TrendGrid` | `row.kpi.spark` with new optional `Kpi.sparkDates` (producers that have spark points add their dates; cells without dates show the spark without an x axis) | each cell `row.metricId`; figure `scorecard.measures.status` | Latest value: `row.kpi.drill`; points show in tooltip and table |
| `scorecard-people` | People scorecard | existing table | existing | `scorecard.measures.status` | existing |

Notes: the WelcomeCard line (3.4) sits under the view header, not in the grid. Computation keeps
the scorecard's idle schedule; the hero, tiles and bullets render from the same model, so
nothing new runs before the first paint. Status split and bullets read "—" for measures the data
standard hides, and say why in the table view.

### 4.2 Manager home: My team

Purpose: a manager's own organization: who is in it, how it is changing, who is joining, what is
waiting on them, and their team's reviews, learning and succession. Everything is locked to the
manager's org (the leader filter set and held by manager mode; the modes spec says how the
manager is chosen). Not on this page and not reachable from it: compensation, survey results, HR
ops cases, compliance, AI in HR, the Data room. Benchmarks outside the org (business unit,
company) show as numbers for comparison but do not open records in manager mode.

Scope line: "{Leader}'s organization · 42 people · 1 Oct 2025 to 30 Sep 2026 · as of 30 Sep 2026".

```
1440
+-------------------------------------------------------------------------------------+
| KPI strip (span 12, 6 tiles): People in my org | Voluntary attrition | Median tenure |
|   Open reqs | Starts in 30 days | Items waiting on managers                         |
+------------------------------------------------------+------------------------------+
| Headcount over time (span 8)                         | Waiting on managers in this  |
|                                                      | org (span 4, list, 6 items)  |
+------------------------------------------------------+------------------------------+
Section "Hiring for my team"
+--------------------------------------------+----------------------------------------+
| Open reqs by stage (span 7)                | Starts by week, next 13 weeks (span 5) |
+--------------------------------------------+----------------------------------------+
| Upcoming starts (span 12, table, 8 rows)                                            |
+-------------------------------------------------------------------------------------+
Section "Team shape"
+------------------------+------------------------+-----------------------------------+
| Tenure (span 4)        | People by level (4)    | Direct reports per manager (4)    |
+------------------------+------------------------+-----------------------------------+
Section "Movement"
+------------------------------------------------------+------------------------------+
| Hires and exits by month (span 8)                    | Voluntary attrition: my org, |
|                                                      | business unit, company (4)   |
+------------------------------------------------------+------------------------------+
Section "Talent"
+------------------------+------------------------+-----------------------------------+
| Ratings vs guideline   | Required training on   | Critical roles in my org:         |
| (span 4)               | time by course (4)     | successor readiness (4)           |
+------------------------+------------------------+-----------------------------------+
| Overdue training (span 6, table)       | Critical roles (span 6, table)              |
+----------------------------------------+--------------------------------------------+
Section "My org chart"
+-------------------------------------------------------------------------------------+
| Org chart canvas, two levels, 360px tall, "Open Org chart" (span 12)                |
+-------------------------------------------------------------------------------------+
```

375 order: tiles (first four, "Show all 6"); Waiting on managers; Headcount over time; Open reqs
by stage; Starts by week; Upcoming starts; Tenure; People by level; Direct reports per manager;
Hires and exits; Voluntary attrition comparison; Ratings; Required training; Critical roles; the
two tables; org chart.

| Id | Title | Form | Data source | Metric | Drill |
|---|---|---|---|---|---|
| `team-kpis` (strip) | People in my org; Voluntary attrition (vs company); Median tenure; Open reqs; Starts in 30 days; Items waiting on managers | KpiStrip, 6 tiles | hrbp tile builders; Recruiting tiles; Onboarding `computeUpcoming`; `collectActions` filtered to `ownerRole === 'manager'` with `ownerId` in the leader's subtree | `hrbp.headcount.employees`, `hrbp.attrition.voluntary`, `hrbp.workforce.tenure`, `recruiting.reqs.open`, `onboarding.upcoming.starts`, `actions.items.open` | People in the org; voluntary leavers; people by tenure; open reqs; people starting; the items |
| `team-headcount` | Headcount over time | Lines, 24 month ends, prior year deemph | hrbp workforce model (scoped) | `hrbp.headcount.employees` | Employees at that month end |
| `team-waiting` | Waiting on managers in this org | List in a Figure (`image={false}`, `tableToggle={false}`), soonest due first, 6 shown and "Open the Action center" | `collectActions` as above | `actions.items.open` | Each item's own drill; employee relations items never name anyone (existing rule) |
| `team-pipeline` | Open reqs by stage | Recruiting's `PipelineBars` | `computeRecruiting(ctx)` scoped | `recruiting.pipeline.activeCandidates` | Candidates in that stage and state |
| `team-starts` | Starts by week, next 13 weeks | Columns stacked by readiness (Ready, On track, Behind, Not ready: status colors, legend with glyphs; readiness is the subject) | `computeUpcoming` | `onboarding.upcoming.calendar` | People starting that week in that state |
| `team-starts-table` | Upcoming starts | tableOnly: person, role, start date, days to go, readiness "7 of 9 done" with StatusPill, blocking item | `computeUpcoming` | `onboarding.upcoming.readiness` | Row opens the person or candidate |
| `team-tenure` | Tenure | Columns by `TENURE_BANDS` | hrbp workforce | `hrbp.workforce.tenure` | People in the band |
| `team-levels` | People by level | Columns in `LEVELS` order | hrbp workforce | `hrbp.headcount.employees` | People at the level |
| `team-spans` | Direct reports per manager | BarList, one bar per manager in the org, company median span as ref, `glyphTone` for Overloaded (12+) and Light (under 3) | hrbp org model | `hrbp.org.span` | The manager's direct reports |
| `team-flow` | Hires and exits by month | Columns grouped, 12 months | hrbp models | `hrbp.flow.hires` | Hires or leavers that month |
| `team-attrition-compare` | Voluntary attrition: my org, business unit, company | BarList of 3, emphasis (my org `--s1`, others `--deemph`) | `attrition(...)` on the org, the leader's business unit (`ctx.all`) and the company | `hrbp.attrition.voluntary` | My org: its voluntary leavers. Business unit and company: no drill in manager mode (`selectable` false, tooltip note "Benchmark only") |
| `team-ratings` | Ratings in the latest cycle against the guideline | Columns grouped (my org `--s1`, guideline `--deemph`) | `talentModel(ctx)` performance | `talent.performance.ratingDistribution` | People with that rating |
| `team-training` | Required training on time by course | BarList with 95% ref, top 6 courses and Other | talent learning model | `talent.learning.requiredOnTime` | Assignments for that course |
| `team-succession` | Critical roles in my org | HBars stacked by successor readiness (Ready now, 1 to 2 years, 3+ years: ordinal ramp; No successor: critical with glyph) | talent succession model | `talent.succession.criticalCoverage` | The roles and successors in that segment |
| `team-training-overdue` | Overdue training | tableOnly: person, course, due, days overdue | talent learning model | `talent.learning.overdue` | Row opens the person |
| `team-critical-roles` | Critical roles | tableOnly: role, incumbent, successors, ready now, status | talent succession model | `talent.succession.roleStatus` | Row opens the role's people |
| `team-org` | My org chart | Org chart canvas, two levels | org engine | `org.chart.reportingLines` | Cards and counts as on Org chart |

Privacy: rates over fewer than 5 people read "—" with "Hidden to protect anonymity (n < 5)" and
the lock icon, as everywhere; a small org simply shows more dashes. No exit reasons on this page
(a manager's small org would identify people). No flight-risk scores unless the modes spec puts
Retention risk in manager mode. No pay, no survey numbers, no case counts.

### 4.3 Developer home: Developer

Purpose: one page that shows whether the data, the metric dictionary, the view contracts and the
runtime are healthy, with every developer tool one click away. It reads no people records beyond
what HR mode already shows; its own numbers are about datasets, metrics, figures and errors, and
they drill to those records (the dataset panel, the metric entry, the figure, the rows left out).

Scope line: "Census {version} · built {build date} · Sample data". Header actions: "Run contract
checks", "Copy diagnostics" (reuses `help/diagnostics.ts`, so it holds no names, IDs or values).

```
1440
+-------------------------------------------------------------------------------------+
| KPI strip (6): Datasets at gold | Metrics below the standard | Figures meeting the    |
|   contract | Scorecard compute time | Errors this session | Storage used            |
+------------------------------------------------------+------------------------------+
| Freshness against the limit (span 8, BulletList)     | Developer tools (span 4,     |
|                                                      | link list sheet)             |
+------------------------------------------------------+------------------------------+
Section "Data"
+------------------------------------------------------+------------------------------+
| Field fill by dataset (span 8, Heatmap)              | Rows by dataset (span 4)     |
+------------------------------------------------------+------------------------------+
| Import error rate by version (span 6, Lines)  | Import errors by dataset and check   |
|                                               | (span 6, Heatmap)                    |
+-----------------------------------------------+--------------------------------------+
Section "Metric dictionary"
+--------------------------------------------+-----------------------+----------------+
| Metrics by tier and view (span 6, HBars)   | Changed definitions   | Metrics with   |
|                                            | by view (span 3)      | no target (3)  |
+--------------------------------------------+-----------------------+----------------+
Section "Contracts" (after "Run contract checks")
+------------------------------------------------------+------------------------------+
| Contract coverage by view (span 8, HBars 100%)       | What was checked (span 4,    |
|                                                      | table)                       |
+------------------------------------------------------+------------------------------+
| Gaps (span 12, table)                                                               |
+-------------------------------------------------------------------------------------+
Section "Runtime"
+-------------------------------------------+-----------------------------------------+
| Summary time per view (span 6, BarList)   | Errors this session (span 6, table)     |
+-------------------------------------------+-----------------------------------------+
```

375 order: tiles; Developer tools; Freshness; Field fill; Rows by dataset; Import error rate;
Import errors by check; Metrics by tier; Changed definitions; Metrics with no target; Contracts;
Runtime.

Developer tools sheet (links, not a chart): Chart gallery (`gallery.html`), Metric definitions,
Formulas (Settings), Data quality, Raw data (Datasets, per dataset), Categories & mapping,
Official lists, Tours (start any tour), Ask: what was sent (when a key is set), Reset everything
to the sample (existing guarded action). Each is a row: name (`text-small` 600), one plain line of
what it is (`text-meta` muted).

| Id | Title | Form | Data source | Metric | Drill |
|---|---|---|---|---|---|
| `developer-kpis` (strip) | Datasets at gold; Metrics below the standard; Figures meeting the contract; Scorecard compute time; Errors this session; Storage used | KpiStrip, 6 tiles | dataset tiers (`data/quality` tier compute, `ctx.quality`); metric registry with the standard gate; contract checks (below; "—" until run); `performance.getEntriesByName('census:scorecard:<view>')`; new `src/app/devlog.ts`; `navigator.storage.estimate()` | new `developer.data.goldDatasets`, `developer.metrics.belowStandard`, `developer.contract.coverage`, `developer.perf.summaryMs` (target at most 400 ms), `developer.errors.session`, `developer.storage.used` | Datasets list (each opens its Quality panel); Metric definitions filtered to held-back entries; the Gaps table; Summary time per view; the error log; stored datasets by size |
| `developer-freshness` | Freshness against the limit | `BulletList`: age in days per dataset, the tick at its freshness limit, warning glyph past it | dataset freshness from `data/quality` | `quality.rules.freshness` | Row: the dataset's Quality panel |
| `developer-fill` | Field fill by dataset | Heatmap, dataset x field (required first), sequential | the Data quality field matrix (`quality-overview/FieldMatrix.tsx` model) | `quality.rules.fill` | Cell: the blank or invalid rows of that field |
| `developer-rows` | Rows by dataset | BarList, medal and tier word as secondary text | `ctx.sources` | new `developer.data.rows` | Bar: the dataset's raw rows |
| `developer-import-errors` | Import error rate by version | Lines (reuse "Tier and import error rate by version") | `data/quality/versions.ts` | `quality.rules.problemRate` | Point: that version's failing rows |
| `developer-checks` | Import errors by dataset and check | Heatmap, dataset x check, share of rows failing | `views/data/engine/checks.ts` | `quality.rules.problemRate` | Cell: the failing rows |
| `developer-metric-tiers` | Metrics by tier and view | HBars stacked, ordinal ramp (`--seq-250`, `--seq-400`, `--seq-600`) for bronze, silver, gold plus `--deemph` for held back, medal swatches in the legend | metric registry and gates (reuse Data quality "Metrics by tier") | new `developer.metrics.byTier` | Segment: Metric definitions filtered to that view and tier |
| `developer-changed` | Changed definitions by view | BarList | `metrics.changesBehind` / `changedCount` | new `developer.metrics.changed` | Bar: Metric definitions, "Changed only", that view |
| `developer-no-target` | Metrics with no target, by view | BarList | registry (`kpiTarget` null) | new `developer.metrics.noTarget` | Bar: those entries |
| `developer-contract` | Contract coverage by view | HBars 100%: complete, missing metric id, missing uses, KPI or finding without a drill (good, warning, serious, critical with glyphs; state is the subject) | lays out each view's tabs off screen with `wholeView.tsx` (as the Monthly people report does) and reads the figure registry, the KPI strips and the readouts; runs only on "Run contract checks", in idle slices, and reports its own time | `developer.contract.coverage` | Segment: the Gaps table filtered |
| `developer-checked` | What was checked | tableOnly: view, figures, KPIs, findings, time taken | contract run | `developer.contract.coverage` | Row: the view |
| `developer-gaps` | Gaps | tableOnly: view, tab, element (figure, KPI, finding), id, what is missing, "Open" (goes to the tab and scrolls to `data-tour="figure-<id>"`) | contract run | `developer.contract.coverage` | Row: the element in its view |
| `developer-timing` | Summary time per view | BarList in ms, "Budget 400 ms" ref, warning glyph above it | User Timing `census:scorecard:<view>` | `developer.perf.summaryMs` | Bar: opens that view |
| `developer-errors` | Errors this session | tableOnly: time, view, tab, where (view render, summary, actions), message | `src/app/devlog.ts` ring buffer (last 100), fed by `ViewErrorBoundary`, the scorecard's "Could not be computed" path and `Collected.errors` | `developer.errors.session` | Row: opens the view and tab |

The `developer.*` metrics are registered in the developer view's own `metrics.ts` (modes spec
owns the folder), with `gate: false` on figures about the data itself, as the Data room does.

---

## 5. Definition of done

### 5.1 Automated

- `npx tsc --noEmit -p .`, `npx vitest run`, `npx biome check src`, `npx vite build` pass.
- `src/styles/typeScale.test.ts` passes: no `text-[Npx]` or `rounded-[Npx]` outside the allowlist.
- `src/styles/tierTokens.test.ts` passes with the new surfaces and the `--muted` contrast checks.
- The categorical palette passes `validate_palette.js` against `--sheet` in both modes (light
  `#fbfbfc`, dark `#181c22`) and the tier ramp passes `--ordinal`; record the output in the
  report.
- Help content and tour tests pass (every `data-tour` anchor still resolves).
- New kit charts have tests: BulletList scales each row on its own and drills; StatusSplit
  segment counts add up; TrendGrid exports one row per point; keyboard focus moves through data
  and Enter calls `onSelect` (Testing Library on the kit).
- Manager home test over the sample: with the leader set to a manager, the page holds no figure
  with a `metricId` starting `comp.`, `listening.`, `services.` or `compliance.`; benchmark bars
  are not selectable; every rate over fewer than 5 people is null.
- Developer home test: the contract run over the sample finds every figure, KPI and finding and
  reports zero gaps, or lists each one.

### 5.2 Screenshots

Take each at 1440 x 900 and 375 x 812, in light and in dark (16 combinations per page group),
top of page and one scroll down: HR home, My team, Developer, Recruiting, People stats, Org
chart, Talent, Compensation, Compliance, Action center, Data room (Datasets and Data quality),
the drill panel (open on Voluntary attrition), Settings, Ask (no key). Check:

| Check | How |
|---|---|
| No sideways page scroll | `document.documentElement.scrollWidth === clientWidth` on every page at 375 |
| First chart early on phones | Top of the first chart figure at or above 1,200px at 375 on every overview and home |
| KPI values aligned | Within one strip row, every `[data-tour="kpi-value"]` has the same top (1px tolerance) |
| Nothing truncated in tiles | No KPI target or change line has `scrollWidth > clientWidth` |
| Labels stay inside sheets | Every chart end label and annotation box sits inside its figure minus 16px |
| Type on the scale | Every rendered font size is one of 11, 12, 13, 14, 16, 20, 28, 40, 48 (wordmark excepted) |
| Sheets separate from the desk | Visible in dark at 1440 without leaning in; tokens as in 2.1 |
| Charts have at least 3 x tick labels | Every time-axis chart at 375 |
| Status reads without color | Every status color on screen has a glyph and a word beside it |
| No status fill where status is not the subject | Recruiting Open reqs by department shows `--s1` bars with diamond glyphs |
| Empty figures keep their height | Upload no Requisitions (or filter to a department with none): figures in a row stay even |
| Loading holds the frame | Throttle CPU 4x, reload Scorecard: sheets at final size with one status line, no jump when content lands |
| Keyboard | Tab reaches each chart; arrows show tooltips at data; Enter opens the drill; focus ring visible in both themes |
| Org chart readable on open | Card names render at 12px or larger at the opening zoom; no empty canvas band taller than 120px |
| Drill panel scannable | No cell wraps past two lines; rows 32px; Summary shows department and level counts |
| Settings and Ask | One surface, no nested cards; Ask without a key shows one explanation and four example questions |
| Motion | Folder tab change shows no gray mid-state; with Reduce motion on, nothing slides or fades |
| Nothing AI-built | No gradient, glow, blur, sparkle icon, emoji, greeting or marketing line anywhere; no click instructions in subtitles or notes |
| Modes are not security | No lock icon or "restricted" wording on anything a mode hides; the lock appears only for anonymity |

### 5.3 Docs

- ARCHITECTURE.md "Design language": the type tokens, radius tokens, new surface values, the
  status-fill rule, annotations, keyboard rule and the three new kit charts.
- VIEWS.md: the three home pages (as built), and appendix A's figures under their views.
- The chart gallery shows every kit chart, including the new ones, in both themes.

---

## Appendix A. Chart additions per view

Two to four new figures per view, chosen to fill gaps rather than repeat what a view already
shows. Each is a proposal for the view's builder, who confirms the definition against the view's
engine; "new" marks a metric id to register. All follow section 2, sit in a Figure, export,
carry `uses` and `metricId`, and drill to records.

| View | Id | Title | Form | Data | Metric | Drill |
|---|---|---|---|---|---|---|
| Recruiting | `rec-active-by-stage` | Active candidates by stage, month end | Columns stacked, 12 months, stages on the ordinal ramp | candidate stage dates (`recruiting/engine/pipeline.ts`, a month-end variant) | `recruiting.pipeline.activeCandidates` | Segment: candidates active in that stage at that month end |
| Recruiting | `rec-ttf-quarter` | Median time to fill by quarter | Lines, 8 quarters, target ref | `recruiting/engine/reqs.ts` | `recruiting.reqs.timeToFill` | Point: reqs filled that quarter |
| Recruiting | `rec-recruiter-load` | Recruiter load and waiting time | Scatter: open reqs (x) against median days candidates wait (y), team medians as refs, the 3 furthest out labeled | recruiter load model | `recruiting.recruiters.load` | Dot: the recruiter's active candidates |
| Recruiting | `rec-hires-source` | Hires by source, by quarter | Columns stacked, top 5 sources and Other, 8 quarters | sources model | new `recruiting.sources.hires` | Segment: the hires |
| Onboarding | `onb-countdown` | Upcoming starts by days to go | DotStrip: days to start (0 to 90) by business unit, readiness glyphs (readiness is the subject) | `computeUpcoming` | `onboarding.upcoming.readiness` | Dot: the person or candidate |
| Onboarding | `onb-owner-lead` | When each owner finishes day-one tasks | RangeBars: days before start, quartiles, by owner | onboarding tasks | `onboarding.upcoming.readinessByOwner` | Bar: that owner's tasks |
| Onboarding | `onb-renege-quarter` | Renege rate by quarter | Lines, 8 quarters, 3% target ref | `renegeCount` by quarter | `onboarding.upcoming.renegeRate` | Point: the reneged offers |
| People stats | `hrbp-cohort-retention` | Still here, by hire year | Lines: share of each of the last 4 hire-year cohorts still employed by months since hire (0 to 36), end labels | employees | new `hrbp.workforce.cohortRetention` | Point: that cohort's leavers to that month; cohorts under 5 hidden |
| People stats | `hrbp-rolling-voluntary` | Voluntary attrition, rolling 12 months | Lines, 24 month ends, scope `--s1`, company `--deemph` (one axis, same unit) | `attrition()` per trailing window | `hrbp.attrition.voluntary` | Point: voluntary leavers in that window |
| People stats | `hrbp-attrition-heat` | Voluntary attrition by department and tenure | Heatmap, top 10 departments x tenure band, cells under 5 average headcount hidden | attrition model | `hrbp.attrition.voluntary` | Cell: the leavers; Filter to this on the department |
| People stats | `hrbp-level-mix` | Level mix, a year ago and now | Columns grouped in `LEVELS` order (a year ago `--deemph`, now `--s1`) | workforce model | `hrbp.headcount.share` | Bar: people at that level on that date |
| Org chart | `org-layers` | People by layer | HBars stacked (employees, contractors and interns) by layer from the top of the selected org | org engine layout | `org.layers.count` | Bar: people in that layer |
| Org chart | `org-span-strip` | Direct reports per manager | DotStrip by layer, glyphs for wide and narrow spans | org engine flags | `org.span.median` | Dot: the manager's direct reports |
| HR ops | `svc-backlog-trend` | Open cases at each week end | Lines, 26 weeks, 13-week median ref | cases | `services.cases.backlog` | Point: cases open that week end |
| HR ops | `svc-cases-per-100` | Cases per 100 employees by business unit | BarList with company ref | cases and average headcount | new `services.cases.rate` | Bar: the unit's cases (employee relations counted, never named) |
| HR ops | `svc-first-response` | Hours to first response | Histogram, band at 0 to the category target | cases | `services.cases.responseSla` | Bin: the cases |
| HR ops | `svc-on-leave-trend` | People on leave at each month end | Lines, 24 months | leave pairs | `services.leave.onLeave` | Point: the people on leave (no reasons in the drill) |
| Talent | `tal-rating-change` | Rating change since the last cycle | HBars 100% by business unit: down, same, up on the diverging pair with a gray middle | reviews | new `talent.performance.ratingChange` | Segment: the people |
| Talent | `tal-promo-by-rating` | Promotion rate by last rating | Columns, ratings 1 to 5 | job changes and reviews | new `talent.performance.promotionByRating` | Bar: the people promoted |
| Talent | `tal-overdue-trend` | Required training overdue at each month end | Lines, 12 months | learning | `talent.learning.overdue` | Point: overdue assignments that month end |
| Compensation | `comp-merit-compa` | Merit increase against compa-ratio | Scatter: compa-ratio (x) against merit % (y), three rating groups (4 to 5, 3, 1 to 2: slots 1 to 3, all-pairs safe), refs at 1.00 and the budget % | comp and reviews | `comp.merit.pct` | Dot: the person (ratios only; amounts only with pay shown) |
| Compensation | `comp-penetration-family` | Range penetration by job family | RangeBars, quartiles | comp | `comp.position.penetration` | Bar: people in the family |
| Compensation | `comp-below-min-location` | Below range minimum by location | BarList, share as secondary | comp | `comp.position.belowMin` | Bar: the people |
| Compliance | `cmp-expiry-strip` | Authorizations ending in the next 180 days | DotStrip: days to expiry by business unit, glyph by reverification state (state is the subject) | right to work | `compliance.work.expiring` | Dot: the person (type only with immigration details on) |
| Compliance | `cmp-i9-days` | Business days to complete I-9 Section 2 | Histogram, band at 0 to 3 | right to work and hire dates | `compliance.i9.section2OnTime` | Bin: the people |
| Compliance | `cmp-license-expiry` | Export licenses ending by month | Columns, next 12 months | right to work | `compliance.export.licenseStatus` | Bar: the people |
| Compliance | `cmp-deadlines-heat` | Statutory deadlines by jurisdiction and month | Heatmap, counts, next 6 months | `reference/calendar.ts` | `compliance.deadlines.upcoming` | Cell: the deadline entries |
| Listening | `lis-response-trend` | Response rate by program and wave | Lines, emphasis on the program with the largest change | `responseRate` by wave | `listening.programs.responseRate` | Point: `surveyGroups` |
| Listening | `lis-answer-mix` | Answers by driver, latest wave | HBars 100%, diverging around the neutral answer | `byDriver` top and bottom box | `listening.drivers.score` | Segment: `surveyGroups` (groups under 5 hidden) |
| Listening | `lis-score-vs-ops` | Day-30 readiness score against day-one readiness, by site | Scatter, sites with 5 or more respondents | Listening onboarding score and Onboarding day-one readiness | `listening.onboarding.readiness` | Dot: the site's `surveyGroups` row and its starts |
| AI in HR | `ai-by-area` | Agents by HR area and status | HBars stacked, status on the ordinal ramp | agent catalog | new `ai.catalog.byArea` | Segment: the catalog filtered |
| AI in HR | `ai-sources` | Data sources the agents draw on | BarList | agent catalog `dataSources` | new `ai.catalog.sources` | Bar: the agents using it |
| Action center | `act-due-weeks` | Open items by due week | Columns stacked by severity, overdue first, next 8 weeks | `collectActions` | `actions.items.dueSoon` | Segment: the items |
| Action center | `act-days-late` | Days overdue by owner group | RangeBars, quartiles | `collectActions` | `actions.items.overdue` | Bar: the overdue items |
| Data room | `data-rows-tier` | Rows by dataset | BarList with medal and tier word | `ctx.sources` | new `developer.data.rows` (shared with the developer home) | Bar: the dataset's raw rows |
| Data room | `data-check-heat` | Import errors by dataset and check | Heatmap (shared with the developer home) | `views/data/engine/checks.ts` | `quality.rules.problemRate` | Cell: the failing rows |

Data quality also moves "Datasets by tier" and the field fill matrix to the top of its tab, so
the page opens on a picture rather than a paragraph.
