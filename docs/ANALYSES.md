# Special analyses (People stats)

The user asked: "add special analyses to the hr tab, have one that goes into the relationship
between university, degree, and quality of hire which is a combo of performance and retention.
another should do a deep dive into why people reject our offers. another should show the
distribution of engineering resources across all stages of chip development, job family (silicon
engineering) and job function (Design RTL) should be used for this. Pyramid of workforce by level
as well."

Decisions already made:

- The four analyses live in a new **Special analyses** sub-tab of People stats (`hrbp`).
- Census flips its job taxonomy to match the user's data everywhere: a **job family** is the broad
  group (Silicon Engineering) and holds **job functions**, the specific disciplines (Design RTL).
  Today Census assumes the opposite. That change has its own spec and lands first; part 4.2 says
  what this spec needs from it. Where the two disagree on a name, the taxonomy spec wins and the
  stage mapping follows it.

This file is the contract builders follow. Read ARCHITECTURE.md, docs/VIEWS.md (People stats),
docs/ROLES.md, docs/SETTINGS-LISTS.md, docs/METRICS.md and docs/CHARTS.md first; every house rule
there applies. Numbers quoted as "measured" come from today's sample with the definitions below;
numbers quoted as "planted" are targets for the sample builder (part 2.10, 3.10, 4.10, 5.9).

---

## 0. The calls in one list

1. One new sub-tab, `analyses`, labelled **Special analyses**, last in People stats (after Org
   design). It holds four analyses picked with a control at the top; the pick is in the address
   in the colon form the Data room and Developer page use: `#hrbp.analyses:quality`,
   `:declines`, `:stages`, `:pyramid`.
2. Each analysis is laid out like a small Overview: section heading with the question it answers,
   a KPI strip, the readout (span 4) beside the lead figure (span 8), then sections of figures.
3. **Quality of hire** = a weighted mean of a performance score (the first full review after hire,
   on a 0 to 100 scale) and a retention score (100 when still employed 12 months after hire, 0
   when not; regretted exits count against, including regretted exits in the second year). Weights
   are metric settings, 50/50 by default. The cohort is hires whose 12-month outcome is known.
4. University, degree level and field of study are new optional Employees fields. **No graduation
   year**: the importer drops it as an age proxy. Universities with fewer than 10 scored hires fold
   into "Other universities (k)". Groups are compared with an interval and with the score their
   site and level mix would predict, so a university that stands in for a place is read as the
   place. Nobody gets a personal quality of hire score on screen, in a drill or in an export.
5. **Why offers are declined** reads Recruiting's applications (the same `App` preparation and
   offer definitions), adds a decline reason taxonomy with themes, and three optional Candidate
   fields: `competingOffer` (yes/no), `offerRevised` (yes/no) and `offerPositionInRange` (a ratio,
   never an amount).
6. **Engineering by chip development stage** maps each job function to a stage through a new
   `stage` attribute on the Job functions official list. Nine stages in lifecycle order plus two
   that run across the lifecycle (Software and firmware, Shared engineering). Analog and
   mixed-signal design is its own stage. Contractors are always their own series. FTE comes from a
   new optional `fte` field (blank counts as 1).
7. **Workforce pyramid** is a custom centered-bar chart, L1 at the bottom to E3 at the top, with a
   year-ago outline, the three tracks bracketed, median span per management level, and splits by
   business unit, tenure band or worker type. Nothing protected, nothing that proxies for it.
8. Manager mode: the tab is **limited**. Quality of hire and Why offers are declined are hidden;
   Engineering by stage shows without planned hires (the hiring plan is hidden there); the pyramid
   shows in full, inside the org.
9. No analysis feeds the Scorecard, `summary()`, the Action center or "Copy talking points". They
   are analyses for a readout, not measures the practice is judged on.
10. Fictional universities in the sample, like the fictional people: no planted story says
    anything about a real institution.

---

## 1. The tab

### 1.1 Where it sits and its address

- `view.tabs` in `src/views/hrbp/index.tsx` gains `{ key: 'analyses', label: 'Special analyses' }`
  after `org`. Folder-tab order and every other tab are unchanged.
- Address: `#hrbp.analyses` (bare) and `#hrbp.analyses:<key>` with key `quality`, `declines`,
  `stages` or `pyramid`. Parse with a tiny pure helper beside the engine
  (`parseAnalysesTab(tab)`, modelled on `parseDevTab` in `src/dev/tabs.ts`); an unknown key reads
  as bare. The route guard and `withAccessTabs` compare the part before the colon with the tab key.
- Bare address: opens the first analysis in order that is **ready** (its required data is
  present, 1.6), else the first analysis in order. The address then shows the opened key with
  history `replace`, so Back does not bounce.

### 1.2 The picker

- A `Segmented` control at the top of the tab body, label "Analysis", options in this order:
  **Quality of hire** · **Offer declines** · **Engineering by stage** · **Level pyramid**.
  Changing it calls `goTo('hrbp', 'analyses:<key>')` (one history entry each).
- An analysis that is not ready keeps its option, with the muted word "Needs data" after the
  label (in the option, not a badge), so readers learn it exists.
- Under 768px the control becomes a `Menu` button ("Analysis: Quality of hire") so four long
  labels never wrap or scroll sideways.
- Options the mode hides are not there (1.7). Never a lock icon (DESIGN-REFRESH 2.10).
- `data-tour="hrbp-analyses-picker"` on the control for the People stats tour step (7.6).

### 1.3 Layout of each analysis

Same rhythm as every Overview (ARCHITECTURE "Overview tab layout"):

1. `Section` with the analysis title (`text-section`) and a one-sentence dek that states the
   question and the window, e.g. "Do hires from some universities, degrees and fields of study
   perform better and stay longer? Hires from 1 Oct 2023 to 30 Sep 2025." Section `actions` hold
   the analysis's only own control when it has one (Engineering by stage: the job family picker).
2. `KpiStrip` of 4 to 6 tiles, each with `metricId`, `uses` and `drill`.
3. A row: `Readout` (span 4, limit 4, phones 2) and the **lead figure** (span 8, lead height
   `useChartHeight('lead')`: 280px, 220px on phones).
4. `Section`s of figures, two per row where they pair (span 6 + 6, 7 + 5 or 5 + 7), full width
   for tables and the wide grids.

The **tab's lead figure** is the lead of the analysis on screen: Quality of hire by university;
Why offers were declined (Pareto); Engineering capacity by chip development stage; Workforce
pyramid. Each is described in its part.

### 1.4 Modules

Engines (pure, Vitest beside each, no React):

```
src/views/hrbp/engine/analyses/
  index.ts        ANALYSES registry: key, label, title, question, lead metric, ready(ctx), missing(ctx);
                  analysisModel(ctx, key) with a WeakMap cache per context (computed on first use)
  tab.ts          parseAnalysesTab, analysesTab(key)
  mix.ts          expected value from a mix of cells with fallback (shared by quality and declines)
  interval.ts     mean and interval of a score; Wilson interval of a rate (table columns only)
  quality.ts      cohort, components, scores, groups, findings
  declines.ts     offers, reasons and themes, cuts, timing, competing offers, range position, findings
  stages.ts       stage of each person and req, capacity, hiring in flight, ratios, sites, trend, findings
  pyramid.ts      levels today and a year ago, splits, ratio to the level below, spans, flow, findings
  sample.test.ts  the planted stories (part 7)
```

UI under `src/views/hrbp/ui/analyses/`: `AnalysesTab.tsx` (picker and routing),
`QualityOfHire.tsx`, `OfferDeclines.tsx`, `EngineeringStages.tsx`, `LevelPyramid.tsx`, and two
custom visuals, `PyramidChart.tsx` (SVG through `PlotChart` with `keyPoints`) and `ParetoChart.tsx`
(a Plot visual). Both use `useChartTheme()`, carry `data-chart` on the root `<svg>` and sit in a
`Figure`.

The analyses are not part of `computeHrbp`: the Scorecard and the folder-tab headline stay as
cheap as today. `analysisModel` runs only when the tab (or an export) asks for that analysis.

Reuse instead of re-implementing (ARCHITECTURE "Metric conventions"):

- `@/lib/people`: `isActiveAt`, `headcountAt`, `buildReviewIndex`, `tenureBand`, `TENURE_BANDS`,
  `directReports`, `hasExitData`. `@/lib/decompose`: `decomposeRate` for where a finding sits.
- People stats `prepare(ctx)` (`Prep`: settings, counts, history with `levelAt`, `isRegretted`,
  `uses`, `defs`, `meets`).
- Recruiting: `prepareApps`, `resolvedOffers`, `acceptance`, `acceptanceByQuarter`,
  `declineReasons`, `rosterLink` and its candidate drill builders (`@/views/recruiting/engine/*`).
  The Compensation readout already imports another view's engine this way.
- Onboarding: `upcomingPeople` (accepted offers not yet started, de-duplicated against pre-hire
  rows) and the hiring plan's req matching in `src/views/onboarding/engine/plan.ts`.

### 1.5 Exports

- "Export this tab" exports the analysis on screen: its KPI strip, readout and every figure.
- "Export all tabs" (workbook and deck) includes **all four** analyses the mode shows. When the tab
  is rendered off screen for a whole-view export it lays out every shown analysis in order, each
  under its Section title, using the `useOffscreen` pattern in
  `src/views/services/ui/LeaveTab.tsx`. Figure ids are unique across the four, so the registry
  keeps them apart.
- Figures with a cut control (a `Segmented` that changes the grouping) put **every cut** in
  `Figure.data` in long form with a "Grouped by" column, as Recruiting's "Why candidates left"
  does with both outcomes. The chart shows the selected cut; the note says "the table and exports
  hold every grouping".
- Pay amounts never appear. Offer position in range is a ratio and always allowed.

### 1.6 Methods shared by the analyses

**Ready and missing.** Each analysis declares the fields it cannot do without (`ready`) and the
fields that unlock parts of it (`missing` lists what is absent, in plain words). The picker and
the empty states (part 6) read the same list, so a message always names the column to add.

**Small groups.** Any rate, mean, median or share over fewer than the anonymity minimum
(`minGroupOf(ctx.metrics)`, 5) is `null`, renders the dash placeholder and says "Hidden to
protect anonymity (n < 5)". Breakdowns fold groups under their minimum into "Other (k)". Some
analyses set a higher minimum for a comparison to be shown (10 scored hires per university, 10
resolved offers per recruiter or hiring manager); those settings can be lowered to the anonymity
minimum and no further (`min` on the param).

**Complementary suppression.** A breakdown's rows add up to the scope, whose numbers the KPI strip
shows, so the hidden rows could be worked out together from the rest. When the hidden rows of a
cut (or of a heatmap row or column, with the people in no cell) hold some people but fewer than the
minimum between them, another row is hidden too: an "Other" row first takes the smallest values
shown until it reaches the minimum; otherwise the smallest row shown that no finding names is
hidden, keeping its name and count. Planted stories that would give a small group away this way
move: with Silicon Engineering in scope, the computer science bachelor's cell (17 hires) is hidden
because the row's 3 master's hires would be its remainder, and in Offer declines L1 to L4 is hidden
beside the single M1 to E3 offer.

**Not recorded.** A blank grouping value is its own row, "Not recorded", drawn last in
`--deemph`, never folded into Other, so readers see how much the grouping leaves out.

**Expected from the mix** (`mix.ts`). For a group G and a measure m:
`expected(G) = mean over members i of G of companyMean(m, cell(i))`, where `cell(i)` is the
finest cell in a fallback list that has at least `minCell` members company-wide (the cohort or
offers in `ctx.all`, so a filter never changes the benchmark). When the cut itself is one of the
cell's dimensions it is dropped from the list (the expected decline rate of a location uses only
its level mix). `gap = actual − expected`. This separates "this group" from "where and at what
level this group sits". The definitions popover says so in one sentence.

**Interval of a score** (`interval.ts`): `mean ± z × sd ÷ √n` with z = 1.28, 1.645 or 1.96 for the
80, 90 (default) or 95% setting. A group is **clearly above** the company when the interval's low
end is above the company mean, **clearly below** when its high end is below it, otherwise **not
clearly different**. Plain wording in the definitions: "The bar shows how sure the comparison is.
Few hires make a wide bar. A bar that crosses the company line is not clearly different from the
company."

**Colors.** One series in `--s1`. Categorical identities (business units) take slots in the order
of the **company's** units by size (from `ctx.all`), so a filter never repaints the survivors.
Ordered bands (tenure, level bands, hiring certainty) take the ordinal ramp: three steps
`--seq-250 / --seq-400 / --seq-600`, five steps `--seq-250 / --seq-400 / --seq-500 / --seq-600 /
--seq-700` (both checked with `validate_palette.js --ordinal`: light end 2.04:1 on the light sheet,
2.11:1 on the dark sheet; `ordinalColors` in `src/charts/kit/series.ts` already spans this ramp).
Status glyphs only where a row is flagged (`glyphTone`), never as fill.

**Notes on charts.** Up to two `notes` per chart, taken from the finding that cites the figure's
metric (`shortNote(finding.title, subject)`).

### 1.7 Manager mode (docs/ROLES.md)

`MANAGER_TABS.hrbp` gains, after Org design:

```ts
tab('analyses', 'Special analyses', limited(
  'Quality of hire and Why offers are declined are hidden, and planned hires from the hiring plan are left out of Engineering by stage.',
)),
```

| Analysis | Developer | HR | Manager |
|---|---|---|---|
| Quality of hire | Shown | Shown | Hidden: prefix `hrbp.quality.` on `MANAGER_HIDDEN_METRIC_PREFIXES`. Education with first ratings is an HR and TA analysis, and a manager's org makes university groups small enough to point at people. |
| Why offers are declined | Shown | Shown | Hidden: prefix `hrbp.declines.` (offer analytics are TA's, as Recruiting > Sources & offers and `recruiting.offers.declineReasons` already are). Figure `hrbp-declines-candidate-survey` goes on `MANAGER_HIDDEN_FIGURES` too (a survey). Both analyses' figure ids are hidden by prefix (`MANAGER_HIDDEN_FIGURE_PREFIXES`), and Ask's `query_records` does not read their fields (education; competing offer, offer revised, position in range; decline reasons). |
| Engineering by stage | Shown | Shown | Limited: exact id `hrbp.stages.planned` hidden; the hiring-in-flight figure and the KPI strip leave the planned series out (the engine asks `ctx.access.can(S.metric('hrbp.stages.planned'))`, as Recruiting does with `showDeclineReasons`). Company comparisons stay as aggregates. |
| Level pyramid | Shown | Shown | Shown, inside the org; "Compare with: Company" draws the company's shape scaled to the org (an aggregate, never records). |

- The picker lists only the shown analyses; the bare address opens the first shown one that is
  ready (Engineering by stage on the sample).
- Deep links: `#hrbp.analyses:quality` or `:declines` in Manager mode is replaced (history
  `replace`) by `#hrbp.analyses:stages` with the 3.15 toast pattern: "People stats, Quality of
  hire is not shown in Manager mode", description "Census opened Engineering by stage instead.",
  action "Change mode". The sub-addresses are surfaces in the policy
  (`tab:hrbp.analyses:quality` and so on) so the access matrix snapshot lists each one.
- Drill kinds used: `employees`, `jobChanges`, `requisitions`, `candidates`, `reviews` (shown in
  Manager mode) and `hiringPlan`, `surveyGroups` (hidden there, and only reached from hidden parts).

### 1.8 Ask (shared)

`src/ask` is being changed by another workflow now. This spec asks nothing of it until that lands;
part 2.9, 3.9, 4.9 and 5.8 list what each tool can already answer and what to add after.

- Works with no Ask change: `find_metrics` returns every new metric (they are in the catalog);
  `get_context` lists the new tab; `query_records` answers counts over existing fields.
- Requests for the Ask owner, in one list:
  1. `query_records` allowlist: `employees.university`, `employees.degreeLevel`,
     `employees.fieldOfStudy` (categories), `employees.fte` (number), `candidates.competingOffer`
     and `candidates.offerRevised` (booleans), `candidates.offerPositionInRange` (a ratio, like
     compa-ratio), `requisitions.jobFamily`, `requisitions.jobFunction`, `hiringPlan.jobFunction`.
     A grouping by university with a rating measure falls under the existing "one person's rating
     or assessment" rule: grouped counts with small counts hidden, and differencing protection.
  2. `view_summary` gains an optional `tab` (`analyses:quality` and so on) that returns that
     analysis's KPIs and findings from a pure `analysisSummary(ctx, key)` exported by the hrbp
     engine (the same objects the tab renders).
  3. `compare_groups` accepts those KPIs as `kpi` when `tab` is given, by business unit,
     department, location, level or leader.
  4. A derived `stage` grouping for employees and requisitions, read through the Job functions
     list (stage is a list attribute, not a column).
  5. Manager mode refuses `analyses:quality` and `analyses:declines` like any hidden metric.
  6. Suggested questions on this tab: "What drives quality of hire here?", "Why were offers
     declined last quarter?", "How many verification engineers do we have per RTL designer?",
     "Which levels grew fastest in the last year?"
- Ask never ranks or scores a named person or candidate by education, and never answers "which
  university should we hire from" with a list of people. The system prompt line for it belongs to
  the Ask owner; this spec asks for it.

---

## 2. Education and quality of hire (`quality`)

### 2.1 Questions it answers for an HR leader

- Do hires from some universities, degree levels or fields of study perform better in their first
  review and stay longer than others? By how much, and how sure are we?
- Is a difference about the school, or about where and at what level those hires sit?
- Which part moves quality of hire for a group: performance or retention?
- Which hiring channels bring hires who do well and stay?
- How complete is education data, and who is missing?

### 2.2 Definitions

**Cohort.** Employees (`employmentType === 'Employee'`; contractors and interns are never hires
here) with `hireDate` in the hire window: the `cohortMonths` (24) months ending `retentionMonths`
(12) months before the as-of date. On the sample: 1 Oct 2023 to 30 Sep 2025, 488 hires. Hires in
the last 12 months are left out even when they already left: counting their exits without their
stayers would understate retention. The window ignores the period picker (the definition says
so). Org scope: a hire counts in the scope its record is in (`ctx.data`), leavers under their
last manager, as everywhere in People stats.

**Performance score P (0 to 100).** The first full review: the employee's earliest review whose
`cycleDate` is at least `firstReviewMinDays` (180) days after the hire date and within
`firstReviewWithinMonths` (24) months of it. Ratings go through Talent's `normRating`. Scoring:

- `scale` (default): `P = (rating − 1) ÷ 4 × 100`. Meets (3) is 50.
- `percentile`: `P = 100 × (ratings below + ½ × ratings equal) ÷ ratings in that cycle`, over
  every employee rated in the cycle company-wide, which takes out cycle-to-cycle drift.

When the Reviews data starts after the hire's first eligible cycle (the hire date plus 180 days
falls before the earliest cycle on record), Census uses the earliest review it has and marks the
row "Earliest review on record" in the drill.

**Retention score R (0 or 100).** 100 when the hire was still employed `retentionMonths` (12)
months after the hire date; 0 when they left before then, whatever the exit type (voluntary,
involuntary, regretted or not). Regretted exits count against in full, and with
`regrettedSecondYear` on (default) a regretted exit after the 12-month mark, up to 24 months after
hire and on or before the as-of date, also scores 0: a strong hire lost in their second year is a
hiring outcome the business feels. Regretted uses the People stats rule in force
(`hrbp.attrition.regretted`, setting `rule`). With `rifExcluded` on (default) a hire who left in a
reduction in force has no retention score. The second-year rule sees a full second year only for
hires 24 or more months back; the definition says so.

**Quality of hire Q (0 to 100).**
`Q = (wP × P + wR × R) ÷ (wP + wR)` with `wP = performanceWeight`, `wR = retentionWeight`, both
0.5 by default. When both are 0 the engine uses 0.5 each and the definition says so.

| The hire | P | R | Q |
|---|---|---|---|
| Rated, still employed at 12 months | from the review | 100 | weighted mean |
| Rated, left before 12 months | from the review | 0 | weighted mean |
| Left before a first full review was due | none | 0 | **0** (retention alone). Leaving them out would flatter groups with early leavers. |
| Left in a reduction in force | if rated | none | P alone, else left out |
| Still employed (or left after 12 months) with no first full review | none | known | **left out**, counted as "Not scored" |

**Group score.** Mean Q over the group's scored hires, with its interval (1.6) and its expected
score from the site and level mix: cells site × level band at hire, then site, then company,
`minCell` 10 (`hrbp.quality.expected`). Level at hire is `history.levelAt(e, hireDate)`; level
bands L1-L2, L3-L4, L5-L6, M1-E3. Site is today's location (Census has no location history; the
definition says so).

**Minimums.** Any mean needs 5 scored hires (anonymity). A university is shown on its own with at
least `minUniversityHires` (10) scored hires, else it folds into "Other universities (k)". Degree
by field cells need `minCellHires` (10). Fields of study beyond the six largest fold into "Other
fields".

**Source of hire.** The application a hire came from, by `rosterLink` run from the employee side
(an index of hired applications by the employee they became). Hires with no linked application
read "Not in the candidate data"; the note gives the coverage (measured: 224 of 488).

Measured on today's sample with the defaults: Q **66.9**, P **54.2**, R **84.2%** over 488 hires
(448 rated, 40 who left before a first review). Software 73.0, Design Verification 61.8.

### 2.3 New data

**Employees** (all optional, none `recommended`, so missing education never turns a dataset
amber):

| Key | Label | Type | Synonyms (normalized headers) | Description |
|---|---|---|---|---|
| `university` | University | string | university, school, college, institution, alma mater, school name, university name, education institution | School of the highest degree, as the HRIS records it. |
| `degreeLevel` | Degree level | enum `DEGREE_LEVELS` | degree level, degree, highest degree, education level, highest education, qualification, degree type | Associate, Bachelor's, Master's, PhD or Other. |
| `fieldOfStudy` | Field of study | string | field of study, major, area of study, degree subject, specialization, specialisation, degree field, concentration | The subject of the highest degree, e.g. Electrical Engineering. |

- `DEGREE_LEVELS = ['Associate', "Bachelor's", "Master's", 'PhD', 'Other'] as const` in the
  schema. Import normalization (`src/data/import/vocab.ts`): AA, AS, associate → Associate; BS,
  BSc, BA, BE, B.Tech, BEng, bachelor, undergraduate → Bachelor's; MS, MSc, MA, ME, M.Tech, MEng,
  MBA, master, graduate → Master's; PhD, Ph.D., DPhil, doctorate, doctoral → PhD; diploma,
  certificate, high school → Other. Unrecognized values are logged, not guessed.
- Do **not** use "discipline" as a synonym here: after the taxonomy flip it belongs to job
  function.
- One row per person: when someone has several degrees, the HRIS's highest one. Help says so.
- **Graduation year is never read.** `src/data/import/protected.ts` gains the word `graduation`
  and the headers `grad year`, `class of`, `class year`, `year graduated`, `degree year`, `year of
  degree`, with a new `DropReason` `'proxy'` whose Data room message reads "Graduation year can
  reveal age, so Census does not read it." No university country, region or ranking field either
  (they proxy national origin or invite a league table).

**Official lists** (docs/SETTINGS-LISTS.md gains three rows):

| List | Kind | Values carry | Parent |
|---|---|---|---|
| Universities | org (proposed from your data) | name | none |
| Degree levels | fixed | the five levels; labels editable | none |
| Fields of study | vocab | name; Census starts with Electrical Engineering, Computer Engineering, Computer Science, Physics, Materials Science, Mechanical Engineering, Chemical Engineering, Mathematics, Business, Other | none |

"In data, not on the list" plus Map to merges spellings ("Coyote Valley Univ." to "Coyote Valley
University"); the analysis groups by the mapped value.

### 2.4 Metrics (registered in `src/views/hrbp/metrics.ts`, owner People analytics)

| Id | Name | Formula | Population | Window | Unit, direction |
|---|---|---|---|---|---|
| `hrbp.quality.score` | Quality of hire | (wP × first review score + wR × retention score) ÷ (wP + wR), averaged over scored hires | Employees hired in the cohort window | The 24 months ending 12 months before the as-of date, whatever the period | num1, up |
| `hrbp.quality.performance` | First review score | (first full review rating − 1) ÷ 4 × 100, averaged | Rated hires in the cohort | same | num1, up |
| `hrbp.quality.retention` | Stayed a year | hires with retention score 100 ÷ hires with a retention score | Cohort less reductions in force | same | pct, up |
| `hrbp.quality.cohort` | Hires scored | count of hires with a quality of hire score; "Not scored" counted apart | Cohort | same | int, none |
| `hrbp.quality.education` | Education recorded | cohort hires with university or degree level ÷ cohort hires | Cohort | same | pct, up |
| `hrbp.quality.expected` | Expected from site and level | mean over a group's hires of the company score in their site and level cell | Cohort | same | num1, none |
| `hrbp.quality.findings` | Quality of hire readout | rules in 2.7 | Cohort | same | rule |

Settings (`ParamDef`), all on `hrbp.quality.score` unless named:

| Key | Label | Type, default, bounds | What it changes |
|---|---|---|---|
| `performanceWeight` | Weight of the first review | percent, 0.5, 0 to 1 | Share of quality of hire from performance. |
| `retentionWeight` | Weight of staying a year | percent, 0.5, 0 to 1 | Share from retention. Weights are divided by their sum. |
| `retentionMonths` | Retention window | months, 12, 6 to 24 | When a hire counts as retained; also ends the cohort window. |
| `regrettedSecondYear` | Count regretted exits in the second year | boolean, on | A regretted exit up to 24 months after hire also scores 0. |
| `rifExcluded` | Leave reductions in force out | boolean, on | RIF leavers get no retention score. |
| `cohortMonths` | Hire window | months, 24, 6 to 60 | How many months of hires the cohort holds. |
| `firstReviewMinDays` | First full review after | days, 180, 90 to 365 | The first review that counts is at least this long after hire. |
| `firstReviewWithinMonths` | First review within | months, 24, 12 to 36 | A review later than this is not a first review. |
| `scoring` | Performance scoring | choice `scale` (Position on the 1 to 5 scale) or `percentile` (Percentile within the review cycle) | How a rating becomes 0 to 100. |
| `minUniversityHires` | Smallest university shown | number, 10, min 5 | Universities below it fold into Other. |
| `minCellHires` | Smallest degree and field cell | number, 10, min 5 | Heatmap cells below it show the dash placeholder. |
| `interval` | Interval | choice 0.8, 0.9 (default), 0.95 | Width of the interval bars and the "clearly" test. |
| `minCell` (on `hrbp.quality.expected`) | Smallest mix cell | number, 10, min 5 | Cells below it fall back to the site, then the company. |
| `minGap` (on `hrbp.quality.findings`) | Gap worth a finding | number, 5 points | See 2.7. |
| `coverageTarget` (on `hrbp.quality.findings`) | Education coverage target | percent, 0.8 | See 2.7. |

`dependsOn`: every `hrbp.quality.*` entry depends on `hrbp.quality.score` and on
`hrbp.attrition.regretted` (its rule changes who counts as regretted).

Lineage (`uses`): `employees.hireDate`, `employees.terminationDate`, `employees.terminationType`,
`employees.regrettable`, `employees.terminationReason` (RIF), `employees.employmentType`,
`employees.location`, `employees.level`, `reviews.rating`, `reviews.cycleDate`, `reviews.cycle`;
optional groups `jobChanges.fromLevel`/`toLevel` (level at hire), `employees.university`,
`employees.degreeLevel`, `employees.fieldOfStudy`, and for source `candidates.source`,
`candidates.hiredDate`, `candidates.candidateName`, `employees.name`.

### 2.5 KPIs

| Tile | Metric | Value on the sample | Change | Drill |
|---|---|---|---|---|
| Quality of hire | `hrbp.quality.score` | 66.9 | vs company under an org filter, else none (note: "Hires 1 Oct 2023 to 30 Sep 2025") | the scored hires with their inputs (2.6 drill columns) |
| Stayed a year | `hrbp.quality.retention` | 84.2% | as above | hires with a retention score, those who did not stay first |
| First review score | `hrbp.quality.performance` | 54.2 | as above | rated hires with their first review |
| Hires scored | `hrbp.quality.cohort` | 488 | note: "40 left before a first review; 0 not scored" | every cohort hire, "Not scored" first |
| Education recorded | `hrbp.quality.education` | planted 88% | none; tone warning glyph under the coverage target | hires with no university and no degree level |

### 2.6 Figures

Every figure: `metric` as listed, `uses` from the lineage, `definitions` from the dictionary
(`p.defs(...)`), a note with the population and the window ("448 rated hires · hired 1 Oct 2023
to 30 Sep 2025"), and drills on every mark and table cell. **Drill columns** for every hire list
(kind `employees`, `extra`): University, Degree level, Field of study, Level at hire, Site, First
full review (cycle and rating, or "Left before a first review"), Stayed a year (Yes, No, "Left in
a reduction in force"), Exit date, Regretted. **No per-person quality of hire score and no sort by
score**: rows sort by hire date. Education groups are not filter dimensions, so they set no
"Filter to"; cuts by business unit or site do.

**2.6.1 Quality of hire by university** (`hrbp-quality-university`, lead, span 8)

- Question: whose hires do well and stay, and how sure are we?
- Form: `RangeBars` in range mode, one row per university: the track runs from the interval's low
  to high end, the value dot is the group's mean (`--s1`), the mid tick is the expected score from
  site and level (ink). A vertical reference rule at the company mean, labelled "Company 66.9".
  Kit addition: `glyphTone` on `RangeBars` (as on `BarList`): a warning glyph and the word "Below"
  beside rows clearly below, a good glyph and "Above" beside rows clearly above.
- Sort: **by scored hires, largest first** (default), with a header `Segmented` "Sort: Hires |
  Quality of hire". A league table invites hiring by school name; the default order is volume.
  "Other universities (k)" and "Not recorded" always last.
- Secondary text: "38 hires · expected 65".
- Takeaway it should make obvious: one or two schools sit clearly away from the company line once
  the interval is taken into account, and a school whose dot sits on its own expected tick is
  telling you about the site, not the school.
- Table and export: university, scored hires, quality of hire, interval low, interval high,
  expected from site and level, gap to expected, first review score, stayed a year, status
  (Above, Below, Not clearly different).
- Drill: a row opens that university's scored hires; Other opens the folded schools' hires.
- Muted line under the chart (part of the Figure note, not a box): "Compare groups, not people.
  University can stand in for where someone studied or grew up, so read each group beside its
  expected score."

**2.6.2 Performance and retention by university** (`hrbp-quality-university-parts`, span 6)

- Question: which part drives a school's score?
- Form: `Scatter`, one dot per shown university (Other and Not recorded left out), x = stayed a
  year (%), y = first review score, size = scored hires, `refX` and `refY` at the company values.
  Labels on the extremes (labelCount 5).
- Takeaway: the quadrant reads at a glance; "high first reviews, low retention" is a different
  conversation from "average reviews, everyone stays".
- Metric `hrbp.quality.score` (definitions also cite performance and retention). Drill: a dot opens
  that university's hires.

**2.6.3 Performance and retention by group** (`hrbp-quality-parts`, span 6)

- Form: `HBars` grouped, two series "First review score" (`--s1`) and "Stayed a year" (`--s2`) on
  one 0 to 100 axis (both are 0 to 100 measures, so one axis is honest). First row "Company".
- Cut (`Segmented`): Degree level · Field of study · Source · Business unit · Site.
- Sort: degree levels in `DEGREE_LEVELS` order; others by scored hires.
- Drill: a bar opens the group's hires for that measure. **Filter to this** on Business unit and
  Site rows (`byGroup('businessUnit' | 'location', 'group', ...)`); none on the other cuts.

**2.6.4 Quality of hire by degree level** (`hrbp-quality-degree`, span 5)

- `RangeBars` as in 2.6.1 (interval, mean dot, expected tick, company rule), rows in
  `DEGREE_LEVELS` order then Not recorded. Drill: the level's hires.

**2.6.5 Quality of hire by field of study** (`hrbp-quality-field`, span 7)

- Same form, six largest fields by scored hires, then "Other fields", then Not recorded.

**2.6.6 Degree level by field of study** (`hrbp-quality-degree-field`, span 7)

- Form: `Heatmap`, rows = the six largest fields plus Other fields, columns = degree levels in
  order, value = mean quality of hire, `scheme: 'diverging'`, `mid` = company mean (above and below
  the company is polarity), `n` = scored hires, `showValues`. Cells under `minCellHires` show the
  dash placeholder.
- Takeaway: which combinations sit above or below the company; the classic one is a computer
  science bachelor's placed in a chip design role.
- Drill: a cell opens its hires.

**2.6.7 Quality of hire by source of hire** (`hrbp-quality-source`, span 5)

- `RangeBars` as in 2.6.1, rows = `SOURCES` order then "Not in the candidate data". Note gives the
  link coverage ("224 of 488 hires link to an application; the candidate data starts 13 Jul
  2024").
- Drill: the source's hires (person rows); the linked applications are the detail export.

### 2.7 Findings (readout, ranked by severity then impact; up to 4)

1. **Clearly above or below** (`hrbp.quality.findings`): a university, degree level, field or
   source whose interval excludes the company mean, `|actual − company| ≥ minGap` and
   `|actual − expected| ≥ minGap ÷ 2` in the same direction. At most two, largest
   `|gap to expected| × hires` first. Severity `good` above, `warning` below.
   - "Hires from Coyote Valley University score 79 on quality of hire, 12 points above the
     company." Detail: "38 hires. 97% stayed a year and their first reviews averaged 60. Hires at
     the same sites and levels score 66." Action: "Find out what this campus program does
     differently, such as internships, team placement or onboarding, and share it with the other
     programs."
   - Never "hire more from", never "avoid": actions are about programs, onboarding and retention.
2. **Strong reviews, weak retention**: a shown group with `P ≥ company P + 8` and
   `R ≤ company R − 10`. When its gap to expected is under `minGap`, the finding says the site
   explains it.
   - "Hires from Nandi Hills Institute of Technology have the strongest first reviews (68), but
     only 67% stayed a year." Detail: "Their quality of hire, 67, matches other Bengaluru hires at
     the same levels (68)." Action: "Treat this as a Bengaluru retention question: see Attrition
     in People stats." (`tab: 'attrition'`; `filter: { location: ['Bengaluru'] }` for Focus on.)
3. **A degree and field combination below the company**: the lowest heatmap cell with
   `actual ≤ company − 2 × minGap` and hires ≥ `minCellHires`.
   - "Bachelor's hires in computer science score 55 in this scope, against 69 for electrical
     engineering." Action: "Check that role scope and onboarding for computer science graduates
     in design and verification roles are clear."
4. **Education coverage**: education recorded below `coverageTarget`, naming the business unit
   with the lowest coverage (units of 10 or more hires), or every unit that rounds to that same
   share. Severity `info`; Focus on keeps the units named.
   - "Education is recorded for 88% of hires in the cohort; Corporate and Go-to-Market are at
     70%." Action: "Ask HR operations to add university and degree from offer paperwork for new
     hires."

Copy rules: one sentence with the number, up to two of detail, one neutral action. Name no hire
in a quality of hire finding (`people` stays empty): the finding is about groups.

### 2.8 How Census keeps university from being misused

University is not a protected characteristic, but it can stand in for several: where someone grew
up (national origin), family income, and in some countries religion or ethnicity. Graduation year
would stand in for age, so it is not read at all. Census:

- compares **groups only**, with a minimum of 10 scored hires per university (never below the
  anonymity minimum), folding the rest;
- shows how sure each comparison is (interval) and what site and level would predict (expected),
  and only writes a finding when both agree;
- sorts universities by volume, not by score, by default;
- never shows, exports or lets Ask produce a personal quality of hire score, and never ranks
  people;
- never uses education in Recruiting: no university column in the pipeline, the action queue or
  candidate drills, and no filter on it anywhere;
- keeps education out of the filter row and the person card in this change;
- hides the whole analysis in Manager mode;
- writes findings about programs and retention, never about choosing or avoiding schools.

The Help article (7.6) carries these points in plain words.

### 2.9 Ask

- Today: `find_metrics` (all `hrbp.quality.*`), `query_records` on employees grouped by business
  unit, location, level or hire date (counts and leavers).
- After the Ask change (1.8): `query_records` grouped by `university`, `degreeLevel` or
  `fieldOfStudy` (counts; mean rating under the assessment rule); `view_summary` with
  `tab: 'analyses:quality'`; `compare_groups` of Quality of hire by business unit or location.

### 2.10 Sample data to plant

New columns only, drawn from their own stream (`education`) after every existing module, so no
story in `src/data/sample/README.md` moves. Fill about 85% of all employee rows (active and
leavers), with fictional universities by site (US sites: "Coyote Valley University", "Barton
Creek Polytechnic", "Front Range Technical University", "Puget Sound Institute"; India: "Nandi
Hills Institute of Technology", "Kaveri College of Engineering"; Taiwan, China, Israel, Germany,
Canada, Vietnam: two or three each). The builder checks that no name is a real institution.
Targets, measured on the cohort with the defaults (assert with tolerances):

1. **Coyote Valley University** (San Jose): 35 to 45 scored hires; quality of hire at least 9
   points above the company; interval low end above the company; expected about 65, gap at least
   8. Finding 1 fires for it.
2. **Nandi Hills Institute of Technology** (Bengaluru): 28 to 36 scored hires; the highest first
   review score of any shown university (at least 66); stayed a year at most 70%; quality of hire
   within 3 points of its expected score. Finding 2 fires and says the site explains it.
3. **Barton Creek Polytechnic** (Austin): 10 to 14 scored hires, at least 8 points below the
   company, interval crossing the company line. No finding; the wide bar shows why.
4. At least 12 universities with 1 to 9 hires fold into "Other universities (k)".
5. Degree levels: Master's at least 4 points above Bachelor's; PhD 18 to 30 hires with the highest
   first review score and about company retention; Associate 8 to 15 hires, mostly Test & Product
   Engineering technicians.
6. Bachelor's in Computer Science placed in Silicon Engineering design and verification roles stay
   a year at most 65%; company-wide that cell is at least 6 points below Bachelor's in Electrical
   Engineering, and with Silicon Engineering in scope at least 12 points below (cells of 10 or
   more). Finding 3 fires in both scopes; in Silicon Engineering the computer science cell is
   withheld by complementary suppression (1.6), so it names Bachelor's in Electrical Engineering.
7. Education recorded for 88% (±2) of the cohort; Go-to-Market and Corporate 65 to 75%; everyone
   else at least 93%. Finding 4 fires naming Go-to-Market or Corporate.
8. Source: no plant; the test asserts every value is finite or null.
9. Messy sample (`raw/`): the Employees extract gains "University", "Highest Degree" (B.Tech, MS,
   PhD and the like, normalized on import) and "Major"; 3% of university names are spelled two
   ways, so the Universities list shows "In data, not on the list" with Map to.

---

## 3. Why offers are declined (`declines`)

### 3.1 Questions it answers

- How often are offers declined, and is it getting worse? Where: which levels, sites, business
  units, sources, recruiters and hiring managers?
- Why do candidates say no, and which few reasons explain most declines?
- Is it a market (location and level) or something about one recruiter or hiring manager?
- Does speed matter: the time from the final interview to the offer, and from offer to decision?
- Do competing offers and counteroffers decide it, and does revising our offer help?
- Where did declined offers sit in the pay range?
- What do candidates who declined tell us, and what should we do next?

### 3.2 Definitions

- **Offers resolved** in a window: Recruiting's `resolvedOffers` (accepted by `hiredDate`, declined
  by `rejectedDate`, status Declined). Same scoping as Recruiting: a candidate is in scope through
  its requisition's business unit, department, location and level.
- **Decline rate** = declined ÷ (accepted + declined) = 1 − offer acceptance
  (`recruiting.offers.acceptance`). Reneges (accepted, later withdrawn) are not declines; they
  have their own tile.
- Window: the period picker for tiles and cuts; 8 quarters ending at the as-of date for the trend.
- **Reasons** come from `rejectionReason` on declined offers, mapped to the new
  `OFFER_DECLINE_REASONS` vocabulary and its themes:

| Reason | Theme | Owner of the next step |
|---|---|---|
| Accepted competing offer | Competition | Talent acquisition and hiring managers |
| Counteroffer from current employer | Competition | Talent acquisition and hiring managers |
| Compensation below expectations | Pay | Total rewards |
| Equity, bonus or total rewards | Pay | Total rewards |
| Role or level | Role | Hiring managers |
| Team or manager | Role | Hiring managers |
| Location or relocation | Logistics | Talent acquisition and global mobility |
| Start date or notice period | Logistics | Talent acquisition |
| Process took too long | Process | Talent acquisition |
| Personal reasons | Personal | none |
| Other, and anything not recognized | Other | none |

  Import normalization: "accepted another offer", "went with another company" → Accepted competing
  offer; "salary", "comp", "pay" → Compensation below expectations; "counter offer", "counter" →
  Counteroffer from current employer; "relocation", "commute" → Location or relocation; "notice
  period" → Start date or notice period. Unrecognized values keep their text, count as not
  recognized (tier rules) and sit under the Other theme. A new official list, **Offer decline
  reasons** (vocab, attribute `theme`), holds them.
- **Final interview** = `onsiteDate`, else `hmDate`. **Days to offer** = `offerDate − final
  interview`. **Days to decide** = decision date (`hiredDate` or `rejectedDate`) − `offerDate`.
  Buckets: days to offer 0-7, 8-14, 15-21, 22+; days to decide 0-3, 4-7, 8-14, 15+.
- **Expected decline rate** of a group (`mix.ts`): cells location × level band (L1-L4, L5-L6, M1-E3),
  then location, then company, `minCell` 5 resolved offers, company offers in the window. A cut by
  location drops location from the cells; a cut by level band drops level.
- **Competing offer**, **offer revised**, **position in range**: the new Candidate fields (3.3).
  Position in range compares medians; acceptance with and without a competing offer is accepted
  ÷ resolved inside each group.
- Minimums: every rate needs 5 resolved offers; recruiters and hiring managers need
  `minPersonOffers` (10) resolved offers to be shown on their own, else they fold into "Other
  recruiters (k)" or "Other hiring managers (k)".

Measured on today's sample (last 12 months to 30 Sep 2026): **88 of 401** offers declined
(21.9%); Q3 2026 **31.8%** (50 of 157) against 15.2% in Q2; Bengaluru 36.4% (48 of 132) against
14.9% elsewhere; L5 and L6 **65.7%** (46 of 70) against 12.7% at L1 to L4; Agency 48.5%, Referral
0.9%; reasons: competing offer 44 (50%), pay below expectations 23 (26%), counteroffer 9 (10%),
so three reasons explain **86%**. Days to offer shows no link (21% within a week, 23% in 8 to 14
days).

### 3.3 New data (Candidates, all optional)

| Key | Label | Type | Synonyms | Description |
|---|---|---|---|---|
| `competingOffer` | Competing offer | boolean | competing offer, other offer, has competing offer, competitive offer, competing offer flag | The candidate told us they held another offer when this one was made or decided. |
| `offerRevised` | Offer revised | boolean | offer revised, revised offer, offer improved, renegotiated, counter made | We improved the offer after it was first extended. |
| `offerPositionInRange` | Offer position in range | percent | position in range, offer position in range, offer range position, range position | Where the offered base sat in the role's pay range: 0 at the minimum, 1 at the maximum. A ratio, never an amount. |

- Values above 1.5 are read as percentages (35 → 0.35). Below 0 or above 1.5 after that are
  logged and left blank.
- None is `pay: true` (no amount); Ask may read them (1.8).
- Each figure that needs one says which field to add when it is missing (part 6).

### 3.4 Metrics

| Id | Name | Formula | Unit, direction |
|---|---|---|---|
| `hrbp.declines.rate` | Decline rate | declined ÷ (accepted + declined), offers resolved in the window | pct, down |
| `hrbp.declines.count` | Declined offers | count of declined offers resolved in the window | int, down |
| `hrbp.declines.expected` | Expected from location and level | mean of the company decline rate in each offer's location and level cell | pct, none |
| `hrbp.declines.timing` | Decline rate by time to offer and to decide | decline rate per days bucket | pct, none |
| `hrbp.declines.competing` | Acceptance with a competing offer | accepted ÷ resolved, offers with a competing offer | pct, up |
| `hrbp.declines.rangePosition` | Offer position in range | median position in range, by outcome | ratio, none |
| `hrbp.declines.findings` | Offer declines readout | rules in 3.7 | rule |

Reused: `recruiting.offers.declineReasons` (its `views` gains `'hrbp'`) for the reasons Pareto,
and `onboarding.upcoming.renegeRate` (views gains `'hrbp'`) for the reneges tile, so each number
means the same thing on every tab. Every `hrbp.declines.*` entry has `dependsOn:
['recruiting.offers.acceptance']`.

Settings: `minPersonOffers` (number, 10, min 5) on `hrbp.declines.rate`; `minCell` (number, 5, min
5) on `hrbp.declines.expected`; on `hrbp.declines.findings`: `risePts` (percent, 0.10), `gapPts`
(percent, 0.10), `slowDecisionDays` (days, 7), `minResolved` (number, 20).

Lineage: `candidates.status`, `candidates.offerDate`, `candidates.hiredDate`,
`candidates.rejectedDate`, `candidates.rejectionReason`, `candidates.reqId`,
`requisitions.reqId`, `requisitions.location`, `requisitions.level`, `requisitions.businessUnit`;
per cut `candidates.source`, `candidates.recruiter`, `requisitions.hiringManager`; timing
`candidates.onsiteDate`, `candidates.hmDate`; optional `candidates.competingOffer`,
`candidates.offerRevised`, `candidates.offerPositionInRange`.

### 3.5 KPIs

| Tile | Metric | Sample | Change | Drill |
|---|---|---|---|---|
| Decline rate | `hrbp.declines.rate` | 21.9% | vs prior period, or vs company under an org filter (People stats rule and materiality floor) | resolved offers, declined first |
| Declined offers | `hrbp.declines.count` | 88 | vs prior period | declined offers |
| Top reason | `recruiting.offers.declineReasons` | "Accepted competing offer, 50%" | none | declines with that reason |
| With a competing offer | `hrbp.declines.competing` | planted (share of declines with a competing offer known) | none | those declines |
| Median days to decide, declined | `hrbp.declines.timing` | planted | vs accepted, in the note | declined offers with days to decide |
| Renege rate | `onboarding.upcoming.renegeRate` | 0.6% | none | the reneges |

### 3.6 Figures

Drill kind `candidates` throughout (Recruiting's builders), extra columns: Offer date, Decision
date, Days to offer, Days to decide, Outcome, Reason, Theme, Competing offer, Offer revised,
Position in range. A hire links to their person card by `rosterLink`. **Filter to this** on marks
that are a business unit, department, location or level of the req (`byGroup` on the req's
dimension); a quarter point carries `periodFilter(quarterStart, quarterEnd)`; reasons, sources,
recruiters, hiring managers and buckets set none.

**3.6.1 Why offers were declined** (`hrbp-declines-reasons`, lead, span 8)

- Question: which few reasons explain most declines?
- Form: `ParetoChart`, one axis from 0 to 100% of declines: a column per reason (its share,
  `--s1`, sorted descending, "Other reasons (k)" last whatever its size), a 2px line with dots for
  the cumulative share (ink-2), and a labelled reference rule at 80% ("80% of declines"). Both
  marks are shares of the same declines, so this is one scale, not a dual axis. Under each column:
  the reason; the theme is in the tooltip and the table.
- Annotation: a bracket over the reasons that reach 80%: "3 reasons, 86% of declines".
- Takeaway: three reasons explain almost all declines, and two of them (competition) are about
  speed and offer strategy rather than pay alone.
- Table: reason, theme, declined offers, share, cumulative share. Drill: a column opens its
  declines.

**3.6.2 Decline rate by quarter** (`hrbp-declines-trend`, span 6)

- `Lines`, 8 quarters, decline rate; under an org filter the company line is added and the scope
  is emphasized (`emphasize`). A point under 5 resolved offers breaks the line. Note from the rise
  finding ("Rose to 32%, mostly Bengaluru").
- Drill: a point opens that quarter's resolved offers, `periodFilter` on the quarter.

**3.6.3 Decline rate by group** (`hrbp-declines-by-group`, span 6)

- `BarList` of decline rate, `domain [0, 1]`, company rule, secondary text "33 of 54 · expected
  41%", `glyphTone` warning where the gap to expected is at least `gapPts` with enough offers.
- Cut (`Segmented`): Level · Location · Business unit · Source · Recruiter · Hiring manager.
  Levels in `LEVELS` order; others by resolved offers. Folds per 3.2.
- Takeaway: whether a high rate is the market (bar near its expected marker) or the group (bar
  well past it). On the sample, Shreya Ramesh's 49% is measured against her Bengaluru, senior
  mix; the test records whether it clears the gap.
- Table holds every cut with a "Grouped by" column: group, resolved, declined, decline rate,
  expected, gap, Wilson interval.
- Drill: a bar opens its resolved offers. Filter to this on Level, Location and Business unit.

**3.6.4 Decline rate by days from final interview to offer** (`hrbp-declines-interview-to-offer`,
span 6) and **3.6.5 by days from offer to decision** (`hrbp-declines-offer-to-decision`, span 6)

- `Columns`, one series, x = bucket, y = decline rate, company rule, value caps, secondary
  "n offers" in the tooltip; a bucket under 5 offers shows the dash placeholder.
- Side by side on purpose: on the sample the first is flat (speed to offer is not the driver
  here) and the second rises sharply after a week (planted). The note on a flat chart reads "No
  clear link in this period".
- Drill: a column opens its offers.

**3.6.6 Competing offers and revised offers** (`hrbp-declines-competing`, span 6)

- `BarList` of acceptance, four rows in fixed order: "Competing offer, revised", "Competing offer,
  not revised", "No competing offer recorded, revised", "No competing offer recorded, not revised";
  `domain [0, 1]`, company acceptance rule, secondary "n of m".
- Takeaway: candidates with a competing offer mostly decline unless we revise.
- Empty without `competingOffer` (part 6). Drill: a row opens its offers.

**3.6.7 Where offers sat in the range** (`hrbp-declines-range-position`, span 6)

- Dumbbell, one row per location (and a "Company" row first): left dot the median position of
  declined offers, right dot accepted (two series, `--s1` and `--s2`, legend), x from 0 to 1.2,
  midpoint rule at 0.5. Rows need 5 offers per outcome; a row short of one outcome shows its other
  dot only. Sort by the gap. Kit addition: move `src/views/talent/ui/Dumbbell.tsx` into the chart
  kit (`@/charts`), Talent importing it from there.
- Takeaway: declined offers in Bengaluru sat low in the range; it ties to the Compensation
  readout (Bengaluru compa-ratio 0.88).
- Drill: a dot opens that location's offers of that outcome. Filter to this on the location.

**3.6.8 What candidates who declined told us** (`hrbp-declines-candidate-survey`, span 6)

- Shown only when the Candidate experience survey has responses and Listening is shown (the
  `LinkedSurvey` rule). `BarList` of candidate NPS for respondents who declined against those
  hired, and the survey's top decline reasons beside the ATS reasons (grouped counts). Survey
  numbers drill to `surveyGroups`; groups under the survey minimum are hidden. Link "Open in
  Listening".

**3.6.9 What to do next** (`hrbp-declines-next-steps`, span 6 or 12 when the survey is absent)

- `tableOnly`: theme, declined offers, share, where it concentrates (from `decomposeRate` on
  location, level and business unit), owner, next step. Next steps are fixed wording per theme,
  filled with the concentration:
  - Pay: "Review offer ranges for {group} with Total rewards before the next offers go out."
  - Competition: "Agree when recruiters can revise an offer to meet a competing one, and shorten
    the time from final interview to offer for {group}."
  - Role: "Check the level and scope in offers for {group} with the hiring managers."
  - Logistics: "Review relocation support and start date flexibility for {group}."
  - Process: "Resolve the slowest step before the offer for {group}."
  - Personal and Other: no next step.
- A theme's count drills to its declines.

### 3.7 Findings (up to 4)

1. **Declines rising**: the latest quarter's decline rate at least `risePts` above the mean of the
   four quarters before it, with `minResolved` offers; `decomposeRate` names where. Warning.
   "Offer declines rose to 32% in Q3 2026 from 15% in Q2, mostly in Bengaluru." Action: "Review
   Bengaluru offers with Total rewards before the next offers go out." Filter: Bengaluru.
2. **A few reasons explain most declines**: the reasons that reach 80%. Info. "Three reasons
   explain 86% of declined offers: a competing offer (50%), pay below expectations (26%) and a
   counteroffer (10%)."
3. **A group well above its expected rate**: largest `(rate − expected) × resolved` across the
   cuts with the gap at least `gapPts`. Warning. "Offers at L5 and L6 were declined 66% of the
   time, against 13% at L1 to L4." Detail: "46 of 70 senior offers. The gap holds in Bengaluru and
   elsewhere." Action: "Review senior offer ranges and the closing plan for L5 and L6 offers with
   Total rewards." A hiring manager or recruiter is named only when they pass `minPersonOffers`
   and their gap to expected clears `gapPts`; the action then reads "Review the closing step on
   {name}'s reqs together." (Recruiting tone rules: no nagging verbs.)
4. **Revising works** (needs `competingOffer` and `offerRevised`): "Candidates with a competing
   offer accepted 31% of offers; when we revised the offer, 62% accepted." Action: "Agree in
   advance when recruiters can revise an offer that meets a competing one."
5. **Low in the range** (needs `offerPositionInRange`): a location whose declined median is at
   least 0.15 below its accepted median. "Declined offers in Bengaluru sat at 0.21 of the range,
   against 0.38 for accepted ones." Action: "Move Bengaluru offers toward the range midpoint,
   starting with L4 to L6."
6. **Slow decisions**: decline rate after `slowDecisionDays` at least `gapPts` above within it.
   "Offers decided after more than a week were declined 55% of the time, against 15% within a
   week." Action: "Set a decision date when the offer goes out and keep in touch until then."

Ranking keeps the readout at four; the rest stay available to Ask and exports.

### 3.8 Manager mode

Hidden (1.7). Recruiting's own offer figures are unchanged.

### 3.9 Ask

- Today: `query_records` on candidates with `status` Declined grouped by `rejectionReason`,
  `source`, or the req's location (counts and shares); `find_metrics`.
- After the Ask change: booleans and position in range in `query_records`; `view_summary` with
  `tab: 'analyses:declines'`; `compare_groups` of Decline rate by location, level or business
  unit.

### 3.10 Sample data to plant

From a new stream (`recruiting-offer-detail`) after recruiting and before surveys:

1. Existing patterns stay as measured in 3.2 (no change): the Q3 rise, Bengaluru, L5 and L6,
   Agency, the reason mix.
2. `competingOffer`, filled for offers resolved since 1 Oct 2025 (blank before, so the coverage
   note reads "Recorded for offers since 1 Oct 2025"): yes on about 85% of "Accepted competing
   offer" declines, 30% of "Compensation below expectations" declines, none of the counteroffer
   declines (that offer is from the current employer), and 10 to 14% of accepted offers.
   Acceptance with a competing offer: 25 to 35%.
3. `offerRevised` since 1 Oct 2025: yes on 20 to 30% of offers with a competing offer; acceptance
   when revised at least 55%, when not revised at most 25%.
4. `offerPositionInRange` on every offer resolved since 1 Oct 2025: Bengaluru medians declined
   0.18 to 0.24, accepted 0.35 to 0.42; elsewhere declined 0.42 to 0.50, accepted 0.48 to 0.56;
   L5 and L6 declined 0.30 to 0.38. It agrees with Compensation story 1.
5. **Slow decisions.** Declined offers with a competing offer get a decision 8 to 16 days after
   the offer: move `rejectedDate` later, never into another calendar quarter and never past the
   as-of date; `offerDate` stays. So that the slow bucket is not all declines, about 25 accepted
   offers with a competing offer outside Design Verification and outside Q3 2026 take 8 to 14 days
   to accept: move `screenDate`, `hmDate`, `onsiteDate` and `offerDate` earlier by the same number
   of days (`appliedDate`, `hiredDate`, `startDate` and every interval between interview stages
   unchanged), only where applied to screen stays at least 2 days. Target: decided after 7 days,
   45 to 60% declined; within 7 days, at most 17%.
   Guards: offer acceptance by quarter and by location, time to hire, time to fill, the stage
   norms, Recruiting stories 1 to 7, Onboarding story 3 and Listening story 1 must hold to their
   current test tolerances. If any fails, drop the accepted-offer shift and move only half of the
   declines.
6. Raw extract: "Competing Offer?" Y, N or blank; "Offer Revised" Y or N; "Offer Range Position"
   as "35%".

---

## 4. Engineering resources by chip development stage (`stages`)

### 4.1 Questions it answers

- How many engineers (employees and contractors, heads and FTE) work at each stage of chip
  development, from architecture to production test?
- Is verification staffed in proportion to design? Other ratios against references we set?
- Where is each stage staffed, by site and business unit, and is a stage concentrated where
  attrition is high?
- Which stages are we hiring into: accepted offers not started, open reqs, planned roles with no
  req yet?
- How has each stage grown over two years?
- Which job functions feed each stage, and which have no stage yet?

### 4.2 What this needs from the taxonomy flip

- `employees.jobFamily` is the broad group and `employees.jobFunction` the discipline, with
  matching synonyms; the Job functions list has the Job families list as its parent.
- **Job families** list gains attribute `engineering` (Yes or No). Census proposes Yes for a family
  whose name matches the existing engineering pattern in `src/views/hrbp/engine/workforce.ts`
  (`ENGINEERING`), else No. The engineering share in Workforce can move to it later; not in this
  change.
- **Job functions** list gains attribute `stage`, a choice from `CHIP_STAGES` (4.3) or blank.
  Census proposes a stage from keywords when the attribute is blank (4.3); a proposed stage is
  used and marked "Proposed" until someone saves it.
- Requisitions gain optional `jobFamily` and `jobFunction` (same synonyms as Employees, list
  checked); Hiring plan gains optional `jobFunction`. When a req has none, the analysis uses the
  most common job function of its department's active employees and marks it "Inferred from
  department"; a plan line takes its req's, else the same inference.

Sample job families, functions and stages this analysis expects (titles are today's sample
tracks):

| Job family | Job function | Sample titles | Stage |
|---|---|---|---|
| Silicon Engineering | Architecture | SoC, CPU and Power Architect; Architecture Manager | Architecture and spec |
| Silicon Engineering | Performance modeling | Performance Modeling Engineer | Architecture and spec |
| Silicon Engineering | Design RTL | ASIC, RTL, Digital IP and Low Power Design Engineer; Digital Design Manager | RTL design |
| Silicon Engineering | Analog design | Analog, Mixed-Signal and SerDes Design Engineer; Analog Design Manager | Analog and mixed-signal design |
| Silicon Engineering | Analog layout | Analog Layout Engineer | Analog and mixed-signal design |
| Silicon Engineering | Design verification | Design Verification Engineer and Manager | Design verification |
| Silicon Engineering | Formal verification | Formal Verification Engineer | Design verification |
| Silicon Engineering | Emulation and prototyping | Emulation Engineer | Design verification |
| Silicon Engineering | DFT | DFT and Memory BIST Engineer; DFT Manager | DFT |
| Silicon Engineering | Physical design | Physical Design Engineer and Manager | Physical design |
| Silicon Engineering | Timing signoff | Static Timing Analysis Engineer | Signoff and tape-out |
| Silicon Engineering | Physical verification | Physical Verification Engineer | Signoff and tape-out |
| Systems Engineering | Package design | Package Design Engineer | Signoff and tape-out |
| Systems Engineering | Signal integrity | Signal Integrity Engineer | blank on purpose (4.10) |
| Systems Engineering | Post-silicon validation | Post-Silicon and Systems Validation Engineer; Systems Validation Manager | Post-silicon validation and bring-up |
| Systems Engineering | Validation automation | Validation Automation Engineer | Post-silicon validation and bring-up |
| Systems Engineering | Board and hardware design | Hardware and Board Design Engineer; Hardware Engineering Manager | Post-silicon validation and bring-up |
| Software Engineering | Firmware | Firmware, Embedded Software and Security Firmware Engineer; manager | Software and firmware |
| Software Engineering | Software | Software, Driver and SDK Engineer; manager | Software and firmware |
| Software Engineering | Compilers and tools | Compiler and Software Tools Engineer | Software and firmware |
| Product Engineering | Product and test engineering | Product, Test and Yield Engineer; Test Technician; manager | Product and test engineering |
| Product Engineering | Quality and reliability | Quality, Reliability and Failure Analysis Engineer; manager | Product and test engineering |
| Engineering Infrastructure | EDA and CAD | CAD Infrastructure Engineer | Shared engineering |
| Engineering Leadership | Engineering leadership | VPs and SVPs of engineering; directors keep their team's function | Shared engineering |

Families not marked engineering (Sales, Finance, People and the rest) are outside this analysis.

### 4.3 Stages

`CHIP_STAGES` in the schema, in lifecycle order, with the phase each belongs to:

| Key | Stage | Phase | What happens |
|---|---|---|---|
| `architecture` | Architecture and spec | Pre-silicon, front end | Product and system architecture, micro-architecture, performance and power modeling, the specification |
| `rtl` | RTL design | Pre-silicon, front end | Digital logic design in RTL, IP integration, synthesis-ready design |
| `ams` | Analog and mixed-signal design | Pre-silicon, front end | Analog, mixed-signal and SerDes circuit design and analog layout. Runs beside RTL design, not after it; its own talent pool and hiring market, so its own stage. |
| `verification` | Design verification | Pre-silicon, front end | Functional verification (UVM), formal, emulation and FPGA prototyping |
| `dft` | DFT | Pre-silicon, front end | Scan, BIST, ATPG and test insertion |
| `physical` | Physical design | Pre-silicon, back end | Floorplan, place and route, clock tree, timing closure |
| `signoff` | Signoff and tape-out | Pre-silicon, back end | Static timing, power and IR signoff, physical verification (DRC, LVS), package co-design, tape-out |
| `postSilicon` | Post-silicon validation and bring-up | Post-silicon | First silicon bring-up, validation, characterization, evaluation and validation boards |
| `productTest` | Product and test engineering | Post-silicon | Production test programs (ATE), yield, qualification, quality and reliability |

Across the lifecycle (drawn after the nine, separated by a hairline):

| Key | Stage | What |
|---|---|---|
| `software` | Software and firmware | Firmware, drivers, compilers, SDKs: pre-silicon on emulation, then on silicon |
| `shared` | Shared engineering | EDA and CAD, methodology, engineering program management, engineering leadership |

Plus the computed row **Not mapped** (an engineering job function with no stage, saved or
proposed). Fabrication and assembly are done by foundry and assembly partners in a fabless
company, so they have no staffed stage here; supply chain and foundry operations are not
engineering families.

Keyword proposals: whole words or phrases, case-insensitive, on the job function name and then
on its commonest job title; the first rule that matches wins, in this order:

1. architect, performance model, specification → architecture
2. analog, mixed-signal, serdes, rf → ams (before any layout or design rule, so analog layout
   stays analog)
3. timing, sta, signoff, sign-off, physical verification, drc, lvs, tape-out, package, signal
   integrity, power integrity → signoff (before verification, so physical verification is
   signoff)
4. verification, formal, emulation, prototyping, uvm → verification
5. dft, bist, scan, atpg → dft
6. physical design, place and route, back end, backend → physical
7. rtl, asic, logic design, digital design, front end, ip design → rtl
8. post-silicon, bring-up, silicon validation, systems validation, characterization, board,
   hardware → postSilicon
9. product engineering, test engineering, yield, ate, reliability, quality, failure analysis →
   productTest
10. firmware, software, driver, compiler, sdk, embedded → software
11. cad, eda, methodology, program management, engineering leadership → shared

Nothing matched: blank (Not mapped).

The stages are a **fixed** official list "Chip development stages" (order fixed, values can be
retired), like Levels. Census reads the built-in labels; a label edited on the list is not read.

### 4.4 Definitions

- **Engineering people**: active on the as-of date (`isActiveAt`) with a job family marked
  engineering. When no family is marked (no job family data), the department fallback
  (`isEngineering`) applies and the note says so.
- **Headcount** by stage: employees (`isEmployee`). **Contractors** are always their own series,
  whatever "Count contractors in headcount" says (the definition states it). Interns are listed in
  the table only.
- **FTE** = sum of `fte` (blank counts as 1). New optional Employees field:

| Key | Label | Type | Synonyms | Description |
|---|---|---|---|---|
| `fte` | FTE | number | fte, full time equivalent, fte %, work percentage, scheduled hours percent, standard hours percent | Share of a full-time schedule: 1 is full time, 0.5 half. Values above 1.5 are read as percentages (80 → 0.8). Blank counts as 1. |

- **Hiring in flight** by stage, never double counted:
  - accepted, not started: `upcomingPeople` from Onboarding (accepted offers with a start date
    after the as-of date, de-duplicated against pre-hire rows), stage of the req's job function;
  - open reqs: open openings (`openings` of Open reqs; On hold left out, noted);
  - planned, no req yet: hiring plan starts in the next `planMonths` (6) whose line has no req ID
    and is not matched to an open req by Onboarding's plan matching.
- **Ratio** of stage A to stage B = people in A ÷ people in B, employees plus contractors when
  `ratioContractors` is on (default off, as industry references count employees; the finding, the
  tile note and the table still give the ratio with contractors), heads, never FTE (references
  are head counts).
  Ratios shown, each with an editable reference (0 means no reference):

| Ratio | Default reference | Why the default |
|---|---|---|
| Verification per RTL designer (verification ÷ rtl) | 1.5 | Industry surveys put the average around one verification engineer per designer, with two or more per designer common on large SoCs. A reference, not a target. |
| DFT per RTL designer (dft ÷ rtl) | 0 (none) | No common reference; set your own. |
| Physical design and signoff per RTL designer ((physical + signoff) ÷ rtl) | 0 | same |
| Post-silicon per pre-silicon ((postSilicon + productTest) ÷ the seven pre-silicon stages) | 0 | same |
| Software and firmware per silicon engineer (software ÷ the nine stages) | 0 | same |

- **Change over time**: headcount by stage at the last 8 quarter ends. Each person counts in their
  current job function's stage (job changes between functions are not in the job history; the
  definition says so).
- Window: the as-of date for capacity; next `planMonths` for plans; 8 quarter ends for the trend.

Measured on today's sample by department (the flip's functions will give the exact split):
design verification **150** employees and **21** contractors against **128** in RTL design, so
1.17 per RTL designer (1.34 with contractors), below 1.5; Bengaluru holds **43%** of verification
(64) and **46%** of DFT (23); verification holds 21 of the open engineering reqs and 29 of the
Q4 planned starts; contractors are 12% of verification.

### 4.5 Metrics

| Id | Name | Formula | Unit, direction |
|---|---|---|---|
| `hrbp.stages.capacity` | Engineering capacity by stage | employees, contractors and FTE per stage on the as-of date | int, none |
| `hrbp.stages.hiring` | Hiring in flight by stage | accepted not started + open openings (+ planned with no req) per stage | int, none |
| `hrbp.stages.planned` | Planned starts with no req | hiring plan starts in the next 6 months with no req | int, down |
| `hrbp.stages.ratios` | Stage ratios | people in one stage ÷ people in another | num2, none |
| `hrbp.stages.mapped` | Stage recorded | engineering people whose job function has a saved stage ÷ engineering people | pct, up |
| `hrbp.stages.findings` | Engineering by stage readout | rules in 4.7 | rule |

Settings: on `hrbp.stages.capacity` `countInterns` (boolean, off); on `hrbp.stages.hiring`
`planMonths` (months, 6, 1 to 18); on `hrbp.stages.ratios` `ratioContractors` (boolean, off) and
one reference per ratio (`verificationReference` 1.5, `dftReference`, `physicalReference`,
`postSiliconReference`, `softwareReference`, each number 0 to 10, step 0.05, 0 = none); on
`hrbp.stages.findings` `belowBy` (percent, 0.15), `concentration` (percent, 0.4),
`contractorShare` (percent, 0.15), `unmappedShare` (percent, 0.05), `attritionGap` (percent, 0.03).

Lineage: `employees.jobFamily`, `employees.jobFunction`, `employees.employmentType`,
`employees.hireDate`, `employees.terminationDate`; optional `employees.fte`,
`employees.location`, `employees.businessUnit`; hiring `requisitions.status`,
`requisitions.openings`, `requisitions.jobFunction` (or `requisitions.department`),
`candidates.status`, `candidates.startDate`, `hiringPlan.period`, `hiringPlan.plannedHires`,
`hiringPlan.reqId`, `hiringPlan.jobFunction`.

### 4.6 Controls, KPIs and figures

**Job family control** (Section `actions`): a `Menu` "Job family: All engineering" with each
engineering family. It scopes every figure of this analysis (one control above everything it
scopes). Session state only, not in the address; exports use what is on screen and say so in the
meta; the off-screen export uses All engineering.

Stage, job family and job function are not filter dimensions, so only marks that are a site or a
business unit set **Filter to this**; every other mark opens its records without a filter.

**KPIs**

| Tile | Metric | Sample | Change | Drill |
|---|---|---|---|---|
| Engineering FTE | `hrbp.stages.capacity` | measured | vs 12 months ago | engineering employees |
| Contractors | `hrbp.stages.capacity` | measured, with share of capacity | vs 12 months ago | engineering contractors |
| Verification per RTL designer | `hrbp.stages.ratios` | 1.17 (reference 1.5) | none; warning glyph when below by `belowBy` | both stages' people |
| Open engineering reqs | `hrbp.stages.hiring` | openings | vs prior quarter end | the open reqs |
| Planned, no req yet | `hrbp.stages.planned` | measured, about 20 starts in the next 6 months (Silicon Engineering's 9 are Hiring plan story 2) | none | the plan lines (hidden in Manager mode) |
| Stage recorded | `hrbp.stages.mapped` | planted 99% | none | people in Not mapped or Proposed functions |

**4.6.1 Engineering capacity by chip development stage** (`hrbp-stages-capacity`, lead, span 8)

- Question: where do our engineers sit across the lifecycle?
- Form: `HBars` stacked, rows = the nine stages in lifecycle order (never sorted by size), a
  hairline, then Software and firmware, Shared engineering and Not mapped; series Employees
  (`--s1`) and Contractors (`--s2`), legend. Header `Segmented` "Headcount | FTE".
  Secondary text at the bar end: "171 · 12% contractors".
- Annotation: the finding's note on the stage below its reference ("1.2 per RTL designer").
- Takeaway: the shape of the engineering organization across the flow, and where contractors
  carry a stage.
- Table: phase, stage, employees, contractors, interns, FTE, share of engineering, change vs 12
  months ago. Drill: a segment opens that stage's employees or contractors (kind `employees`,
  extra columns Job family, Job function, Stage, Stage source (Saved, Proposed, Inferred), FTE).
  No Filter to (stage is not a filter dimension).

**4.6.2 Hiring in flight by stage** (`hrbp-stages-hiring`, span 6)

- `HBars` stacked, same row order, series in order of certainty on the three-step ordinal ramp:
  Accepted, not started (`--seq-600`) · Open reqs (`--seq-400`) · Planned, no req yet
  (`--seq-250`, left out in Manager mode). Secondary: "+31, 18% of today".
- Takeaway: where hiring is concentrated against today's size; a stage with planned roles and no
  req is a plan gap.
- Drill: accepted segments open the upcoming starts (kind `candidates`, onboarding noun
  "starts"), open reqs open `requisitions` (extra Job function, Stage, Stage source), planned opens
  `hiringPlan`.

**4.6.3 Stage ratios against reference** (`hrbp-stages-ratios`, span 6)

- `BulletList`, one row per ratio (4.4), all on one shared scale (`scale="shared"`, so bar length
  compares across ratios), tick at the reference, value
  `fmt(v, 'num2')`, status: below the reference by `belowBy` or more → warning "Below reference";
  within → neutral "Near reference" (up to `belowBy` under the reference is not a success state);
  above → default "Above reference"; no value → "Too few people to compare", or "No one in RTL
  design in this scope" when nobody is below the line; no reference → "No
  reference" (no tick). `onSelectLabel` opens Metric definitions at the ratio's setting
  (`#data.metrics/...`, hidden link in Manager mode).
- Drill: a row opens the people in both stages, stage as the first extra column.

**4.6.4 Where each stage is staffed** (`hrbp-stages-where`, span 12)

- `Heatmap`, rows = stages in order, columns = sites (eight largest by engineering headcount,
  then Other), value = share of the stage's people at that site (row shares, sequential), `n` =
  people, `showValues`. Cut (`Segmented`): Site · Business unit.
- Takeaway: which stages depend on one site; read with that site's attrition (the finding does).
- Drill: a cell opens its people with **Filter to this** on the site (or business unit).

**4.6.5 Stage headcount over time** (`hrbp-stages-trend`, span 12)

- `TrendGrid`, one cell per stage with people (nine plus the two across-lifecycle stages), 8
  quarter ends, each cell on its own scale (subtitle says so), no target rule. Export
  `trendGridRows(series)` with `TREND_GRID_COLUMNS`.
- Drill: a point opens the people active at that quarter end in that stage.

**4.6.6 Job functions behind the stages** (`hrbp-stages-functions`, span 12, `tableOnly`)

- Job family, job function, stage, stage source (Saved, Proposed, Not mapped), employees,
  contractors, FTE, open openings, planned with no req. Each count drills. A link under the table:
  "Set stages in Settings, Official lists, Job functions" (plain text in Manager mode).

### 4.7 Findings (up to 4)

1. **Below reference**: a ratio below its reference by `belowBy` or more. Warning. "Design
   verification has 1.2 engineers per RTL designer, below the 1.5 reference." Detail: "150
   verification engineers and 21 contractors for 128 in RTL design. Verification holds 21 of the
   open engineering reqs." Action: "Weigh the verification gap in the Q4 hiring plan with the
   Silicon Engineering leaders."
2. **Concentrated where attrition is high**: a stage with at least `concentration` of its people
   at one site whose voluntary attrition (People stats, last 12 months) is at least
   `attritionGap` above the company. Warning. "43% of design verification and 46% of DFT sit in
   Bengaluru, where voluntary attrition is 18.8%." Action: "Review succession and knowledge
   sharing for verification and DFT outside Bengaluru." Filter: Bengaluru.
3. **Planned roles with no req** (hidden in Manager mode): the two stages with the most. Info.
   "Software and firmware has 6 planned starts in the next 6 months with no req yet, and design
   verification 4." Action: "Open the reqs or move the roles in the plan with talent acquisition."
   On the sample the software starts are mostly Q1 2027 count rows and the verification ones are
   Hiring plan story 2.
4. **Contractor-heavy stage**: contractor share at least `contractorShare`. Info. Does not fire on
   the sample (12% at most).
5. **Not mapped or only proposed**: engineering people in functions with no stage above
   `unmappedShare`, or any function whose stage is only proposed. Info. "8 engineers are in a job
   function whose stage is only proposed: Signal integrity." Action: "Confirm or change the stage
   in Settings, Official lists, Job functions."

### 4.8 Manager mode

Shown, limited: no planned series, KPI or finding 3 (1.7). The job family control lists the
families inside the org. Company comparisons (the reference ratios are not company numbers) stay
aggregates.

### 4.9 Ask

- Today: `query_records` on employees grouped by `jobFamily` and `jobFunction` (headcount),
  requisitions by department; `find_metrics`.
- After the Ask change: the derived `stage` grouping; `view_summary` with `tab:
  'analyses:stages'`; `compare_groups` of Verification per RTL designer by location or business
  unit.

### 4.10 Sample data to plant

1. Job family and job function on every employee, req and planned role from the sample's tracks
   (table in 4.2); stages saved on the sample's official Job functions list, except **Signal
   integrity** (about 8 people) left blank, so its stage shows as Proposed (Signoff and tape-out,
   from the keywords) and finding 5 fires. The Not mapped row appears only when it has people.
2. Requisitions: `jobFunction` filled for reqs opened since 1 Oct 2025; earlier reqs blank, so
   "Inferred from department" shows on old filled reqs only.
3. Hiring plan: `jobFunction` on planned roles; count rows blank.
4. `fte`: 20 part-time employees (0.5, 0.6 or 0.8): 8 Munich, 5 Haifa, 4 Toronto, 3 San Jose; 9 of
   them in engineering stages (verification 3, RTL design 2, software and firmware 4); 6
   contractors at 0.5. Drawn from the stream `fte`.
5. Existing outcomes the tests assert (no plant): verification per RTL designer under 1.5;
   Bengaluru at least 40% of verification and DFT; verification has the most open engineering
   reqs; the planned roles with no req match Hiring plan story 2.
6. Raw extract: "Job Function" and "Job Family" columns as the flip defines; "FTE %" as 100, 80,
   50.

---

## 5. Workforce pyramid by level (`pyramid`)

### 5.1 Questions it answers

- What shape is the workforce across levels, and how has it changed in a year?
- Where are the bulges (levels growing much faster than the workforce) and the thin levels?
- How wide are spans at each management level?
- How does the shape differ by business unit, tenure or worker type?
- What made each level grow or shrink: hiring, promotion or leaving?

### 5.2 Definitions

- **Headcount at a level**: People stats headcount (`hrbp.headcount.employees`, with its
  contractor setting) on the as-of date by `level`. Level null rows are counted apart ("Level not
  recorded").
- **A year ago**: active 12 months before the as-of date, at the level held then
  (`history.levelAt`). Only with job changes loaded; without them no outline (a person's level
  today would understate the change). Fixed 12 months, whatever the period picker.
- **Compare with: Company** (offered under an org filter and in Manager mode): the company's share
  at each level × the scope's total, drawn as the outline instead of a year ago.
- **Order**: `LEVELS`, L1 at the bottom to E3 at the top. Tracks from `levelTrack`: Individual
  contributor (L1 to L6), Manager (M1, M2), Executive (E1 to E3). M1 sits above L6 in the order,
  not in seniority; the bracket marks where the management track starts.
- **Median span per level**: `directReports` (all worker types, as `hrbp.org.medianSpan`) for
  people at that level with at least one direct report; shown for a level with 5 or more such
  managers. E1 to E3 combine into one row for the spans figure when each alone is under 5.
- **Size against the level below** = headcount(level) ÷ headcount(level below), for L2/L1 up to
  L6/L5, M2/M1 and E1-E3/M2. Above 1 + `tolerance` (0.25) on the individual track is an inverted
  step.
- **Level mix bands**: Entry (L1, L2), Career (L3, L4), Senior (L5, L6), Management (M1, M2),
  Executive (E1 to E3).
- **How each level changed** over the last 12 months: a year ago + hired at the level + promoted
  in − promoted out − left from the level ± other changes (demotions, transfers in or out of
  scope, corrections) = today. Level at hire and at exit from `levelAt`; promotions from job
  changes.

Measured on today's sample: L1 65, L2 191, L3 314, L4 293, L5 219, L6 105, M1 200, M2 43, E1 12,
E2 4, E3 4 (1,450); a year ago L1 73, L2 186, L3 240, L4 264, L5 228, L6 98, M1 198, M2 40 (1,347,
+7.6%). L3 grew **30.8%**: 240 + 108 hired + 47 promoted in − 31 promoted out − 50 left = 314. L1
73 + 28 hired − 30 promoted to L2 − 6 left = 65. Entry levels **17.7%**, senior individual levels
22.3%, management and executive 18.1%. Size against the level below: L2/L1 2.94, L3/L2 1.64,
L4/L3 0.93, L5/L4 0.75, L6/L5 0.48. Median span M1 6, M2 6, E1 4.

### 5.3 Metrics

| Id | Name | Formula | Unit |
|---|---|---|---|
| `hrbp.headcount.employees` (reused) | Headcount | the pyramid, its outlines and the mix by business unit | int |
| `hrbp.pyramid.levelMix` | Level mix | employees in a band ÷ employees | pct, none |
| `hrbp.pyramid.ratioBelow` | Size against the level below | headcount(level) ÷ headcount(level below) | times, none |
| `hrbp.pyramid.levelFlow` | How each level changed | the 12-month flow in 5.2 | int, none |
| `hrbp.org.medianSpan`, `hrbp.org.managerRatio` (reused) | Median span, Manager ratio | as defined | |
| `hrbp.pyramid.findings` | Pyramid readout | rules in 5.6 | rule |

Settings: `tolerance` (percent, 0.25) on `hrbp.pyramid.ratioBelow`; on `hrbp.pyramid.findings`
`bulgeGap` (percent, 0.10), `minLevel` (number, 20), `thinRatio` (percent, 0.5), `topHeavyGap`
(percent, 0.08), `minUnit` (number, 50). Every `hrbp.pyramid.*` entry has `dependsOn:
['hrbp.headcount.employees']`. The spans figure reads the Org chart's span thresholds where it
flags a level (wide and narrow span, `ORG_PARAM`).

Lineage: `employees.level`, `employees.hireDate`, `employees.terminationDate`,
`employees.employmentType`; optional `jobChanges.fromLevel`, `jobChanges.toLevel`,
`jobChanges.effectiveDate`, `jobChanges.changeType`, `employees.managerId` (spans),
`employees.businessUnit` (split and mix).

### 5.4 KPIs

| Tile | Metric | Sample | Change | Drill |
|---|---|---|---|---|
| Employees | `hrbp.headcount.employees` | 1,450 | vs a year ago | employees |
| Entry levels (L1 to L2) | `hrbp.pyramid.levelMix` | 17.7% | pts vs a year ago | employees at L1 and L2, Filter to L1 and L2 |
| Senior individual levels (L5 to L6) | `hrbp.pyramid.levelMix` | 22.3% | pts vs a year ago | as above |
| Management and executive | `hrbp.pyramid.levelMix` | 18.1% | pts vs a year ago | as above |
| Manager ratio | `hrbp.org.managerRatio` | as Org design | as Org design | as Org design |

### 5.5 Figures

Drill kind `employees` (extra columns Level a year ago, Tenure band, Direct reports); job changes
for promotion counts. **Filter to this** on every level (`groupFilter('level', ...)`), and level
plus business unit on business unit segments (engine sets both, `filterLabel` "L3 in Silicon
Engineering").

**5.5.1 Workforce pyramid** (`hrbp-pyramid`, lead, span 8)

- Question: what shape are we, and what changed in a year?
- Form: `PyramidChart`. One row per level, L1 at the bottom; a horizontal bar centered on a
  vertical axis, width proportional to headcount (one scale for bars and outlines: the larger of
  today and the outline), 16px tall, 6px between rows, 4px rounded ends on both sides (both ends
  are data ends). Outline: a 1.5px `--ink-2` rectangle, no fill, 4px taller than the bar, with a
  2px sheet halo so it reads over the fill. Left gutter: level code and label ("L3 Career") and the
  track brackets (Individual contributor, Manager, Executive) with a hairline between L6 and M1.
  Right gutter: headcount, change ("+74"), and "span 6" for levels with spans, all in ink and
  muted text, `tnum`.
- Split (header `Segmented`): None · Business unit · Tenure · Worker type. None is `--s1`.
  Business unit: up to seven company units in company size order plus Other (`--deemph`),
  categorical slots, segments laid left to right inside the centered bar with 2px sheet gaps,
  legend. Tenure: `TENURE_BANDS` on the five-step ordinal ramp. Worker type: Employees, Contractors,
  Interns in the slots the Workforce "Contractors and interns" figure uses; it adds contractors and
  interns to the pyramid and the note says so.
- Second header control when an org filter is on: "Compare with: A year ago | Company".
- Legend line: "Bar: today · Outline: a year ago" (or "the company, scaled to this org").
- Tooltip: level, headcount, a year ago (or company scaled), change, share, median span, the
  hovered segment's count and share of the level.
- Keyboard: one tab stop; Up and Down move between levels, Left and Right between segments;
  Enter drills. `keyPoints` from the row and segment centers.
- Annotations: up to two, from the bulge and thin-base findings ("+31% in a year", "a third of
  L2"), placed in the right gutter.
- Takeaway: a diamond, not a pyramid: thin entry levels under a wide L3 to L5 middle, with L3
  swelling most this year.
- Table and export: level, track, today, a year ago (or company scaled), change, growth, share,
  median span, and one column per split segment (long form with "Split" for every split).
- Drill: a row opens its employees; a segment its employees in that segment; the outline (from the
  table) opens the people at that level a year ago.

**5.5.2 Size against the level below** (`hrbp-pyramid-ratio-below`, span 6)

- `BarList`, rows L2/L1 up to E1-E3/M2 in order (`sort: 'none'`), value = ratio, `ref` at 1
  ("Same size as the level below"), `glyphTone` warning on the individual track where the ratio
  exceeds 1 + tolerance.
- Takeaway: the base widens upward to L3, then narrows as a pyramid should.
- Drill: both levels' employees, Filter to the two levels (`filterLabel` "L2 and L1").

**5.5.3 Spans at each management level** (`hrbp-pyramid-spans`, span 6)

- `RangeBars` in quartile mode per management level (M1, M2, E1 to E3): whisker min to max, box
  q1 to q3, median tick; secondary "200 managers". Levels with fewer than 5 managers show the
  dash placeholder and the anonymity note.
- Drill: the managers at that level with their direct report counts.

**5.5.4 How each level changed in 12 months** (`hrbp-pyramid-flow`, span 7, `tableOnly`)

- Level, a year ago, hired, promoted in, promoted out, left, other changes, today, change, growth.
  Rows reconcile (the test checks it). Hired, left and today drill to employees; promoted in and
  out drill to job changes.

**5.5.5 Level mix by business unit** (`hrbp-pyramid-mix`, span 5)

- `HBars` with `stack: 'normalize'`, rows = business units (company order, up to seven plus Other)
  with a "Company" row first, series = the five bands on the five-step ordinal ramp.
- Takeaway: which units are top-heavy or entry-heavy against the company.
- Drill: a segment opens its employees; Filter to the business unit and the band's levels
  ("Senior levels in Silicon Engineering").

### 5.6 Findings (up to 4)

1. **Bulge**: a level with at least `minLevel` people whose 12-month growth is at least
   `bulgeGap` above the workforce's. Warning. "L3 grew 31% in 12 months, from 240 to 314, while
   the workforce grew 8%." Detail: "108 people were hired at L3 and 47 promoted into it; 31 were
   promoted to L4 and 50 left." Action: "Plan L4 promotion capacity for 2027 with the business
   units that hired at L3." Filter: L3.
2. **Thin base**: an individual level under `thinRatio` of the level above it. Info. "L1 is the
   thinnest individual level: 65 people, a third of L2 (191)." Detail: "Entry levels are 17.7% of
   employees, and L1 shrank by 8 in a year." Action: "Check that entry-level hiring matches the
   plan for growing future senior engineers."
3. **Inverted step above L3**: an individual level larger than the one below by more than the
   tolerance, from L4 up. Warning. Does not fire on the sample.
4. **Span outside the band**: a management level whose median span is at or below the Org chart's
   narrow span or at or above its wide span. Does not fire on the sample (M1 and M2 at 6).
5. **Top-heavy unit**: a business unit of at least `minUnit` employees whose senior,
   management and executive share is at least `topHeavyGap` above the company's. Info.

### 5.7 Manager mode

Shown in full inside the org: the org's own pyramid, its own year ago, and the company's shape as
an aggregate outline. Spans and flow count only people in the org; a level under 5 people shows
its count (counts are allowed) but no span.

### 5.8 Ask

- Today: `query_records` on employees grouped by `level` (and business unit), `compare_groups` of
  Headcount by level; `find_metrics`.
- After the Ask change: `view_summary` with `tab: 'analyses:pyramid'` for the flow and findings.

### 5.9 Sample data

No plant: the measured shape in 5.2 is already a clear story (L3 bulge, thin L1, diamond shape).
The test asserts the findings fire with these numbers and that the flow reconciles at every level.

---

## 6. Empty states

Plain text on the sheet with a muted 16px icon, the figure keeping its chart height, one action
when there is something to do ("Open the Data room", which renders as plain text where the Data
room is hidden). The message names the column.

| Situation | Where | Message |
|---|---|---|
| No Employees at all | whole view | the existing People stats empty state |
| No cohort hires (hire dates all in the last 12 months or none in the window) | Quality of hire | "No hires from {window} in this scope. Quality of hire needs a year of outcomes." |
| No termination dates anywhere | Quality of hire | "Add leavers (Termination date) to Employees to see who stayed a year." Retention, and so quality of hire, is null, never 100%. |
| No Reviews | Quality of hire | "Upload Reviews to score the first full review. Until then only Stayed a year shows." The retention tile and figures still show; quality of hire is null. |
| No university, degree level or field anywhere | the education figures | "Add University, Degree level or Field of study to Employees to compare by education." The KPI strip, source and business unit cuts still show. |
| One education field present, another missing | that figure | "Add {field} to Employees to see this." |
| Fewer than 5 scored hires | any score | the anonymity note |
| No Candidates or Requisitions | Offer declines | "Upload Candidates and Requisitions to see why offers are declined." |
| No Declined status anywhere | Offer declines | "No declined offers in the data, so declines can't be measured." |
| No rejection reasons on declines | reasons figure | "Add Rejection reason to Candidates to see why offers were declined." |
| No onsite and no hiring manager dates | interview to offer | "Add Onsite date or Hiring manager date to Candidates to see this." |
| No `competingOffer` / `offerRevised` / `offerPositionInRange` | their figures and tiles | "Add {field} to Candidates to see this." |
| No candidate survey, or Listening hidden | survey figure | not rendered (the `LinkedSurvey` rule) |
| No `jobFunction` anywhere | Engineering by stage | "Add Job function to Employees, and give each job function a stage in Settings, Official lists, to see engineering by stage." |
| No job family marked engineering | Engineering by stage | falls back to engineering departments; note "Engineering departments used: no job family is marked engineering." |
| Job functions without a stage | capacity figure | the Not mapped row and the finding |
| No `fte` | FTE view | FTE equals headcount; note "No FTE in Employees, so each person counts as 1." |
| No Hiring plan | hiring in flight | planned series absent; note "No hiring plan loaded." |
| No Requisitions | hiring in flight | "Upload Requisitions to see open reqs by stage." |
| No `level` anywhere | Level pyramid | "Add Level to Employees to see the pyramid." |
| No Job changes | Level pyramid outline and flow | no outline; note "Add Job changes to compare with a year ago." Flow table empty with the same words. |
| No termination dates | Level pyramid outline | `NO_HISTORY` wording |
| Some levels blank | pyramid | note "12 people with no level are not in the pyramid", drillable |

---

## 7. Tests

Engine tests use small hand-built fixtures for exact definitions and a smoke test over
`buildContext({ data: generateSample(), … })` (ARCHITECTURE "Engine pattern").

### 7.1 Definitions (`src/views/hrbp/engine/analyses/*.test.ts`)

- `quality.test.ts`: cohort bounds (a hire 11 months back is out, 12 months back is in, a recent
  early leaver is out); first full review picks the first review at least 180 days after hire and
  within 24 months, and marks "Earliest review on record"; P for each rating under both scorings;
  R for stayed, left before 12 months (each exit type), regretted in the second year (on and off),
  RIF (on and off); Q for every row of the table in 2.2; weights 100/0 give Q = P, 0/100 give
  Q = R, 0/0 gives 50/50 and a note; group means, intervals and "clearly" status; expected score
  with cell fallback; university fold at 10 and at 5; Not recorded never folds; drill rows carry
  no score column and sort by hire date.
- `declines.test.ts`: decline rate equals 1 − Recruiting's acceptance on the same offers; reneges
  excluded; reason mapping and themes (each normalization in 3.2); Pareto cumulative shares end at
  100% and "Other reasons" is last; expected rate drops the cut's own dimension; person folds at
  10; buckets at their edges (7 and 8 days); competing and revised groups; position in range
  medians, percentages read as fractions.
- `stages.test.ts`: keyword proposals (each rule; analog layout to ams, not physical; physical
  verification to signoff, not verification; "sta" never matches inside another word); saved stage beats proposal; Not mapped; contractors always their own series whatever the
  contractor setting; FTE with blanks as 1 and percentages; hiring in flight never counts a planned
  role that has an open req, and never counts a pre-hire twice; ratios with and without
  contractors; references of 0 give no tick; inferred req functions.
- `pyramid.test.ts`: levels a year ago from job history; the flow reconciles for every level;
  ratios to the level below; spans per level with the 5-manager rule; splits sum to the level;
  company outline scaled to the scope total.
- `mix.test.ts`, `interval.test.ts`, `tab.test.ts` (parse, unknown keys, bare address default by
  readiness).

### 7.2 Sample (`src/views/hrbp/engine/analyses/sample.test.ts`)

Every measured number in 2.2, 3.2, 4.4 and 5.2 within tolerance, and every planted target in
2.10, 3.10 and 4.10; each finding listed as firing fires with the expected subject, and the ones
marked "does not fire" do not; every value finite or null; no group under its minimum carries a
rate. `src/data/sample/sample.test.ts` and `README.md` gain the new stories, and every existing
story test still passes (the decision-date plant in 3.10 is the one that touches existing rows).

### 7.3 Metrics and settings (extend `src/views/hrbp/engine/metrics.test.ts`)

Every KPI, figure and finding of the tab maps to a registered metric; every setting in 2.4, 3.4,
4.5 and 5.3 is read through `ctx.metrics` (`recordParamReads`); changing each one changes the
number it says it changes; `dependsOn` marks "Definition changed" when the regretted rule changes;
reused metrics list `'hrbp'` in `views`.

### 7.4 Drills and Filter to this (`src/views/hrbp/ui/filterTo.test.ts`)

`expectFilterTo` on business unit and site cuts of quality of hire, level, location and business
unit cuts of declines, quarter points (period filter), heatmap cells of stages, every pyramid row
and business unit segment, level mix segments; `expectLeaveOut` on the counts that split the
scope; no filter on university, degree, field, source, recruiter, hiring manager, reason, bucket,
stage or Other rows.

### 7.5 Access (`src/access`)

Matrix snapshot updated (`npx vitest run src/access -u`): the tab limited in Manager mode with its
`how`; the four sub-address surfaces; hidden prefixes `hrbp.quality.` and `hrbp.declines.`, exact
`hrbp.stages.planned`, figure `hrbp-declines-candidate-survey`; every hidden id exists in the
catalog or source. Routes: `#hrbp.analyses:quality` and `:declines` in Manager mode redirect to
`:stages` with replace and the toast; HR and Developer untouched. Manager scope on the sample: the
stages and pyramid models contain only people in the org; company outline opens no records.

### 7.6 Import, lists, privacy, help, copy, export, performance

- Import: synonyms map for every new field; degree normalization table; FTE and position in range
  percentages; graduation-year headers are dropped with reason `'proxy'` and the Data room message;
  "discipline" does not map to field of study.
- Lists: Universities, Degree levels, Fields of study, Offer decline reasons, Chip development
  stages exist with their kinds; the `stage` and `engineering` attributes edit, undo and round-trip
  through the Official lists workbook.
- Privacy: no field named or meaning graduation year, age or birth anywhere in the schema; no
  export or drill of quality of hire holds a per-person score; Ask privacy tests (Ask owner) cover
  the education groupings.
- Help (`src/help/content.test.ts`): the People stats article's new section "Special analyses"
  (what each answers, how quality of hire is built, how to read the intervals and expected
  ticks, the misuse safeguards in 2.8) and one People stats tour step on
  `[data-tour="hrbp-analyses-picker"]` pass the article and tour checks in every mode.
- Copy: every new label, subtitle, note, definition and finding is sentence case with no em dash
  and no nagging verb (the existing copy tests scan the source).
- Export: a whole-view export of People stats includes the four analyses' figures in HR mode and
  only Engineering by stage and Level pyramid in Manager mode; long-form cut tables carry every
  cut.
- Performance (`*.perf.test.ts`): each analysis model computes in under 100 ms on the sample.
- Gates: `npx tsc --noEmit -p .`, `npx biome check src`, `npx vitest run`, `npm run build`,
  `npm run verify`.

---

## 8. Build order, files and docs

1. **Taxonomy flip** (its own spec) lands first.
2. **Schema and import** (lead-owned `src/data/schema.ts`: say so in the report): `DEGREE_LEVELS`,
   `CHIP_STAGES`, `OFFER_DECLINE_REASONS` with themes; Employees `university`, `degreeLevel`,
   `fieldOfStudy`, `fte`; Candidates `competingOffer`, `offerRevised`, `offerPositionInRange`;
   Requisitions `jobFamily`, `jobFunction`; Hiring plan `jobFunction`. Importer vocab and the
   `'proxy'` drop reason.
3. **Official lists**: the three new lists, Offer decline reasons, Chip development stages, the
   `stage` and `engineering` attributes, workbook sheets and template dropdowns.
4. **Sample** (sample-data builder): parts 2.10, 3.10, 4.10; README stories; raw extracts.
5. **Engines and metrics** (hrbp builder): part 1.4 modules, metrics in `src/views/hrbp/metrics.ts`,
   lineage in `engine/lineage.ts` (`HRBP_DATASETS` gains `requisitions`, `candidates`,
   `hiringPlan`, `surveyResponses` as optional reads; `view.datasets` follows).
6. **Kit** (chart builder): `glyphTone` on `RangeBars`; `Dumbbell` moved into the kit.
7. **UI**: the tab, the four analyses, `PyramidChart`, `ParetoChart`.
8. **Access**: policy entries, matrix snapshot, routes.
9. **Help and docs**.
10. **Ask** requests (1.8), after the Ask workflow's current change.

Docs to update in the same change: docs/VIEWS.md (People stats tabs, a short Special analyses
section pointing here), docs/ROLES.md (3.2 row, 3.3 hide lists, 3.15 redirects), docs/SETTINGS-LISTS.md
(the new lists and attributes), docs/METRICS.md (People stats settings list), docs/CHARTS.md (the
new figure ids), `src/data/sample/README.md`.

Effort: Quality of hire large; Offer declines large; Engineering by stage large (most of it is the
taxonomy and lists); Level pyramid medium (the custom chart).

---

## 9. Calls a reviewer may revisit

- Hires from the last 12 months are left out of quality of hire even when they already left
  (2.2): the alternative understates retention.
- A hire who left before a first review scores 0; one still employed without a review is left out.
- Regretted exits in the second year count against retention by default.
- Universities sort by volume, not score, by default; no personal score anywhere.
- Analog and mixed-signal design is a stage of its own; software and firmware and shared
  engineering run across stages; one stage per job function (no splitting a person's time).
- Only verification per RTL designer ships with a reference (1.5); the other ratios wait for the
  user's own.
- Decline analysis is hidden in Manager mode, matching Recruiting > Sources & offers.
- The decision-date plant in 3.10 is the one sample change that edits existing rows, inside its
  quarter, with guards.
