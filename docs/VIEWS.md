# Census — view specifications

Each view is a folder tab. This file says what each one must answer, which numbers it shows, how
they are defined, which findings it generates and which figures it draws. Builders may add a figure
when it clearly helps a reader, and may merge two when they say the same thing, but must not drop
the questions a view answers. Every figure sits in `<Figure>` (export menu and table view come with
it). Every finding follows the copy rules in ARCHITECTURE.md.

Period semantics used throughout: "in the window" = an event date inside `ctx.window` (inclusive);
"snapshot" = state at `ctx.asOf`; the comparison is `ctx.prior`.

---

## Contracts the new views share

Folder-tab order: Scorecard · Recruiting · Onboarding · People stats · Org chart · HR ops · Talent ·
Compensation · Compliance · Listening · AI in HR. Census opens on the Scorecard (`#scorecard`);
old links such as `#recruiting.pipeline` keep working. The Action center is a page reached from
the masthead (`#actions`), like the Data room (`#data`).

**View contract** (`src/views/types.ts`):

- `summary?(ctx): { kpis: Kpi[]; findings: Finding[] }`: what the Scorecard reads, computed with
  the view's own engine and no React. `kpis` are the two or three measures the practice is judged
  on, in order, each with `metricId`, `uses`, `drill` and, when it has one, `tab`. `findings` are
  the view's readout, ranked. Keep it cheap: the Scorecard calls every view's summary.
- `actions?(ctx): ActionItem[]`: the view's open items for the Action center. `ActionItem` is
  `{ id, ownerRole, ownerId?, ownerName, due?, severity, what, subject: { kind, id?, label }, view,
  tab?, drill?, note?, uses? }`. `ownerRole` is one of `ACTION_OWNER_ROLES` (manager, hrbp,
  recruiter, coordinator, hr-ops, payroll, it, facilities, trade-compliance, immigration, talent,
  total-rewards; labels in `ACTION_OWNER_LABEL`). `id` is stable across recomputes
  (`'<view>:<kind>:<record id>'`) so Mark handled and Snooze stick. `what` describes the state in
  plain words ("I-9 Section 2 is not complete, due 2 Oct"), never a nagging verb; `note` holds the
  polite ask the copied note uses. An employee relations case never names a person.
- `Kpi.link?: ViewLink` (`{ view, tab?, label }`, `src/components/types.ts`): a tile that opens a
  tab of another view, in place of `tab` (which opens a tab of the view the strip sits in). The
  producer names the destination ("Onboarding, Hiring plan") so shared components never import the
  view registry; `tileTarget(kpi, view)` in `src/components/kpiModel.ts` resolves either.

**Datasets** (`src/data/schema.ts`; all optional, the sample leaves them empty until it grows them):

| Dataset | Key | One row per | Read by |
|---|---|---|---|
| Hiring plan | `hiringPlan` | planned role, or month × org with a count | Onboarding |
| Onboarding tasks | `onboardingTasks` | person × task (employee ID or application ID) | Onboarding, Compliance |
| Right to work | `rightToWork` | employee | Compliance |
| Survey responses | `surveyResponses` | answer (long format) | Listening |
| Survey items | `surveyItems` | survey × item (driver, target) | Listening |

Plus `Candidate.startDate` (expected first day of an accepted offer) and, on HR transactions,
`leaveReason` (`LEAVE_REASONS`, the Atlas's nine categories) and `expectedReturnDate` for leave
starts. Vocabularies: `ONBOARDING_TASKS` (the Atlas ON-01 to ON-04 checklist with owner, process
and due day; `onboardingTaskByName`), `ONBOARDING_OWNERS`, `ONBOARDING_STATUSES`,
`AUTHORIZATION_TYPES`, `EXPORT_LICENSE_STATUSES`, `SURVEY_TYPES`, `SURVEY_SCALES` and
`SURVEY_PROGRAMS` (respondent, Listening area, when sent, scale, where its headline also shows,
manager cuts, off by default). `emptyDatasets()` and `withAllDatasets(partial)` build complete
`Datasets` for fixtures.

**Drill kinds** (`src/drill`): `hiringPlan`, `onboardingTasks` (person from the roster or the
accepted candidate, start date, state Done / Done late / Overdue / Blocked / In progress / Not
started / Not needed via `taskState`), `rightToWork` (authorization type only while
`ctx.showImmigration`), `surveyItems`, `surveyGroups` (grouped survey results, `SurveyGroupRow`
from `@/lib/surveys`) and `surveyResponses` (Data room quality checks only: no respondent, date,
score or subject). Survey numbers always drill to `surveyGroups`.

**Session switches and features** (`ctx`): `ctx.showPay` as before; `ctx.showImmigration`
(Settings > Privacy, session only, never saved); `ctx.features.engagementSurveys` (Settings >
Privacy, saved, off by default).

**Privacy rules in the dictionary** (`src/metrics/privacy.ts`): the anonymity minimum
(`minGroupOf(ctx.metrics)`, 5), survey manager cuts (`surveyMinimumsOf(ctx.metrics)`:
`{ minGroup, minManager: 10, quarters: 4 }`), immigration details opt-in and survey answers
grouped only. The importer drops protected-characteristic columns (gender, ethnicity, age and
birth date, nationality, citizenship, religion, disability, veteran status, sexual orientation,
marital status) and free-text comment columns from every sheet as it is read
(`ParsedSheet.dropped`, `droppedText`).

**Surveys library** (`src/lib/surveys.ts`, pure): `aggregate`, `breakdown` / `byDriver` /
`byItem` / `byWave` (groups under the minimum fold into "Other (k)", hidden while still too
small), `waveChange`, `wavesOf` / `latestWaves`, `responseRate` (against an invited population),
`npsOf`, top and bottom box, `selectResponses`, `itemIndex` / `driverOf` / `targetOf`,
`respondentIndex` + `respondentKey(index, BY_DEPARTMENT …)` (group labels only, never records),
`managerCuts` (10+ distinct respondents over four quarters) and `groupRows` for drills.

---

## Scorecard (`scorecard`)

Question it answers: how is the people function doing against its targets, and what needs
attention first? Readers: the CHRO and HR leadership in the monthly people review; HRBPs before a
leader meeting.

Tabs: `overview` Overview (one tab, so no sub-tab strip).

Folder-tab headline: targets met ("9 of 14", label "targets met"), counting only measures shown
under the data standard; `uses` = the union of the shown measures' fields.

Datasets: every dataset (it reads the views, which read them).

### How it works

- For every view in `VIEWS` with a `summary` (not the scorecard itself, not AI in HR), call
  `view.summary(ctx)`. Compute in an idle callback after the first paint (`requestIdleCallback`
  with a 200 ms fallback), keyed on `ctx`; budget 400 ms on the sample. Show a quiet loading line
  on the sheet meanwhile, never a spinner over the page.
- A view whose summary throws contributes a row "Could not be computed" for that practice and
  logs the error; the rest of the scorecard still renders.
- Measures per practice (the view's `summary.kpis`, in order; the view builders choose them):
  Recruiting: median time to fill, offer acceptance, hires vs plan. Onboarding: day-one readiness
  (ON-01, at least 95%), I-9 Section 2 on time (ON-02, 100%), voluntary attrition within 90 days
  (under 2%). People stats: voluntary attrition, regretted attrition, first-year attrition. HR ops:
  resolution SLA met (90%), transactions on time (98%), final pay on time (100%). Talent:
  succession coverage, required training on time (95%), key talent at risk. Compensation: in
  healthy band, below minimum, merit spend vs budget. Compliance: reverification started 90 or
  more days ahead (100%), I-9 Section 2 within 3 business days (100%), people working with an
  export license not in force (0). Listening: response rate of the latest waves, day-30 readiness
  score, exit survey "would return". Org chart has no summary.

### Definitions

- Target: the metric's target in force, `ctx.metrics.target(kpi.metricId)` (yours or the
  default). Defaults come from the Atlas KPI targets and common benchmarks; each view registers
  them on its own metrics.
- Status: Met when the value meets the target; Watch when it misses by less than the watch margin;
  Missed beyond it; "No target" (gray, no icon) when the metric has none; "—" when the value is
  null or hidden by the data standard. Watch margin: a scorecard setting
  (`scorecard.status.watch`), default 5 pts for shares and 10% of the target for other units.
  Status pills carry an icon and the word (`StatusPill`).
- Change: the KPI's own `delta` and `deltaLabel`, colored only when `deltaMaterial`.

### Layout and figures

- Header action: "Monthly people report" (menu: PowerPoint, Excel). The deck holds a title slide,
  the scorecard table, the top findings and each view's lead chart; the workbook holds the
  scorecard, the findings and each view's key figures. Reuse the whole-view export
  (`src/app/wholeView.tsx` renders a view's Overview off screen) and `exportViewDeck` /
  `exportViewWorkbook`; stamp scope, window, as-of, data standard and "Definitions changed".
- People scorecard (lead, span 8, a table-only Figure so it exports): practice, measure, value,
  target, status, change, trend (sparkline from `kpi.spark`), tier badge. The value drills
  (`kpi.drill`); the practice name opens the view at `kpi.tab`. Practices with no measure shown
  say why in one muted line.
- Top findings across Census (span 4, the shared `Readout`): up to 8 findings from every view's
  summary, critical first, then warning, then by folder-tab order; each carries its practice as a
  tag and "Open in {view}". Gated on the standard like any readout.
- Targets popover ("Targets" button on the scorecard sheet): lists each measure's target with
  at least / at most and the value; edits go to the metric dictionary (`editMetric` on the
  `target` field), so they are logged, undoable and travel with the settings file.

### Findings

The scorecard writes no findings of its own beyond one line when several practices miss target:
"5 of 14 measures miss their target; 3 are in Onboarding and Compliance." Action: "Review the
missed measures with each practice lead this month."

### As built

- Code: `src/views/scorecard/` (`engine/model.ts` judges, gates and ranks; `engine/schedule.ts`
  runs the summaries; `engine/report.ts` shapes the exports; `ui/` the page, table and report).
  The other views are read through `views.ts`, imported one by one: importing
  `@/views/registry` from the scorecard would be an import cycle.
- Metrics (`metrics.ts`): `scorecard.measures.status` (the table's figure), `scorecard.status.watch`
  (settings `shareMargin` 5 pts, `relativeMargin` 10%), `scorecard.measures.targetsMet` (the
  folder tab), `scorecard.findings.missedTargets` (setting `minPractices`, 2) and
  `scorecard.findings.top` (setting `limit`, 8). None holds a target: targets stay on each
  measure's own entry. `MEASURE_IDS` lists the measures for the lineage; a test keeps it in step
  with the summaries.
- Targets: the "Targets" popover lists each measure's target and links to its entry in Metric
  definitions (`#data.metrics/...`); the table's target cell links there too ("Set a target" when
  there is none). There is no second place to edit a target.
- Top findings: within each severity every practice's most serious finding comes before any
  practice's second, in folder-tab order, so one busy practice never fills the list. The
  scorecard's own line leads and does not count toward the limit. The shared `Readout` takes
  `sourceOf(finding)` for the practice tag, "Open in {view}" and a Practice export column.
- Folder tab: "—" until the idle computation is done, then `refreshHeadlines()`
  (`src/app/headlineRefresh.ts`) makes the folder tabs read their headlines again. A run for an
  older context (a filter change, a data load) stops at its next idle slice.
- Layout: side by side from 1280px; below that the table takes the full width and the findings
  follow. On phones the table scrolls inside its sheet with the measure column pinned.
- Monthly people report: the deck is the title slide, the scorecard in slide-sized parts, the
  top findings and each practice's lead chart ("Recruiting: Pipeline today"); the workbook is a
  Summary, the scorecard, every finding, and each practice's key figures and lead chart. Org
  chart (no summary) and AI in HR are not in it.
- Cost on the sample: the summaries take about 190 ms warm and 430 ms on a cold first run in
  Node; in the browser the scorecard's own share is about 110 to 150 ms because the views' models
  are cached per context. Each run records `census:scorecard:<view>` User Timing entries.
- Chart-led home (docs/DESIGN-REFRESH.md 4.1, docs/ROLES.md 2.1; `ui/Band.tsx`, `ui/Sections.tsx`,
  engine `engine/band.ts`, ids in `engine/figures.ts`). Top row: Targets met (`scorecard-standing`,
  span 4: the one `text-hero` number "4 of 21" and a `StatusSplit`; a segment lists its measures,
  each value opening `kpi.drill`) beside the key figures (span 8: People stats' Headcount and
  Voluntary attrition, Recruiting's Open reqs and the Action center's Critical open items, each
  tile opening its own view's tab). Then Measures against target (`scorecard-measures`, span 8,
  `BulletList` grouped by practice, or "Furthest from target" ranked in watch margins, which is
  CHARTS.md's Gap to target; the table view adds the signed gap in the measure's unit, and the
  metric id in Developer mode) beside Top findings (compact readout, 5 before "Show more"). Section
  "How the workforce is moving": Headcount over time, Hires and exits by month, Voluntary and
  regretted attrition by quarter (`scorecard-attrition-trend`). Section "Where the pressure is":
  Voluntary attrition by business unit against the company (glyph at the readout rule's gap,
  "Filter to" a unit), Recruiting's Pipeline today, and Where open items wait (the Action center's
  collection for the context, in idle time; HBars by owner group stacked by due state). Section
  "People scorecard": the table, unchanged, as the record. The monthly report's deck opens with a
  "Targets met by practice" slide. Not built: Measure trends (TrendGrid) and Places named across
  practices: the KPI sparks are per-period values without dates or records (their last point is
  not the scorecard's value), and grouping findings needs a findings drill kind.

---

## My team (`team`)

Manager mode's home (docs/ROLES.md 2.2, docs/DESIGN-REFRESH.md 4.2); in Developer mode it opens by
address with a leader in the filter row, and asks for one without. Code: `src/views/team/`
(`engine/` composes the producing views' models, `ui/` the page, ids in `engine/figures.ts`). No
`summary` and no `actions`. Every figure carries the producing view's metric, so the access rules
apply to it unchanged, and reads that view's model for the scope (in Manager mode the manager's
org): nothing is counted a second way.

- Key figures (`team-kpis`): People stats' Headcount, Voluntary and Regretted attrition (vs company),
  Recruiting's Open reqs, Onboarding's Starts in the next 30 days, Talent's Required training on
  time, each the view's own tile pointed at its tab; then Waiting on this org (the Action center's
  open items the leader or someone in the org owns, from `collectActions` in idle time).
- What needs attention (`team-readout`, compact, up to 6): People stats', Recruiting's,
  Onboarding's and Talent's findings ranked like the Scorecard's, after Manager mode's hide lists in
  every mode; beside it Headcount over time (lead).
- People: Hires and exits by month; Attrition against the company (HBars grouped: voluntary,
  regretted, first-year; "This org" in slot 1 opens the tile's leavers, "Company" in gray opens
  nothing); Tenure; People by level; Direct reports per manager (BarList, the 12 widest drawn,
  company median span as the reference, glyph and word for Overloaded, Heavy and Light).
- Hiring: Pipeline today (Recruiting's figure and records); Starts by week (Columns stacked by
  day-one readiness, status colors); Open reqs and Upcoming starts (tables).
- Talent: Ratings against the guideline (Talent's figure); Critical roles by successor readiness;
  Required training on time by course (six courses and "Other courses (k)", recounted); Overdue
  training and Critical roles (tables; successors outside the org by readiness only).
- Waiting on this org (`team-waiting`): the items one by one, the leader's own first, at most 10.
- Privacy: no pay, survey results, HR ops cases, compliance details, exit reasons or flight-risk
  scores (a source test keeps those reads out); an org under 5 employees sees counts and lists and
  the anonymity line, with every rate "—". Welcome line: "New to My team?" with the manager tour.

---

## Recruiting (`recruiting`)

Question it answers: are we hiring the people we need, fast enough, and where is the process
stuck? Primary readers: TA leads preparing a weekly review with hiring leaders.

Tabs: `overview` Overview · `pipeline` Pipeline · `requisitions` Requisitions · `sources` Sources & offers.

Folder-tab headline: open reqs at asOf ("open reqs"), sparkline of open reqs at the last 8 month ends.

### Definitions (port the user's recruiting tool; see research-recruiting.md)

- Reached stage S: the candidate has a date for S or any later stage (use the per-stage dates;
  fall back to `stageIndex(currentStage) >= index(S)` only when dates are missing). This handles
  skipped stages.
- Stage pass rate (cohort of applications applied in the window): advanced / resolved where
  resolved = reached S and (reached S+1 or exited at S). Show "still active" separately so active
  candidates don't drag the rate down. State the definition.
- Days in a transition: date(S+1) − date(S) for candidates who reached both.
- Next-step state for every Active candidate (the user's core definition: overdue means the
  candidate LACKS A PENDING NEXT STEP, not just a long time in stage):
  1. `offer-out` if currentStage is Offer and offerDate <= asOf (waiting on the candidate);
  2. `scheduled` if nextEventDate > asOf (in motion, never alarmed);
  3. `awaiting-feedback` if nextEventDate <= asOf and stageEnteredDate <= nextEventDate (the
     interview happened and nobody acted; owned by the hiring manager);
  4. `needs-step` otherwise (nothing pending: the real alarm).
  Labels: Needs review (Applied), Needs scheduling (Screen / Hiring manager / Onsite), {Stage}
  scheduled, Needs decision (awaiting feedback), Offer pending (Offer, needs-step), Offer extended.
- Aging tier: needs-step amber when days in stage > 1.5 × stage norm, red > 2.5 × (norm =
  historical median transition days for that stage with ≥ 5 samples, else 14);
  awaiting-feedback amber > 2 d, red > 5 d; offer-out amber > 5 d, red > 10 d; scheduled amber only
  when the event is more than 1.5 × norm away. "Lacks a next step" = any tier.
- Owner of the next action: Applied → recruiter; Screen/HM/Onsite needs-step → coordinator, else
  recruiter; awaiting-feedback → hiring manager (from the req), else recruiter; Offer → recruiter.
- Time to fill: median days from req openedDate to filledDate, reqs filled in the window.
- Time to hire: median days appliedDate → hiredDate, hires in the window.
- Offer acceptance: hired ÷ (hired + declined) for offers resolved in the window (resolution date =
  hiredDate or rejectedDate).
- Open req age: asOf − openedDate for Open reqs (On hold shown separately).

### KPIs (Overview)

Open reqs (snapshot, Δ vs prior window end), Hires (window), Median time to fill (good = down),
Median time to hire (good = down), Offer acceptance (good = up), Candidates lacking a next step
(snapshot; note = share of actives; good = down), and Hires vs plan (year to date, from the Hiring
plan; "—" without one) that opens Onboarding > Hiring plan.

### Findings (readout, max 6, ranked by severity then impact)

Port the flag rules and thresholds from research-recruiting.md (bottleneck, lacks next step,
offers awaiting response, offer acceptance falling, empty funnel, source drying up, withdrawals
rising) and use `decomposeRate` / `decomposeMedian` to name where each concentrates (department,
location, level, recruiter, hiring manager, source). Add: slow time to fill for a segment (median ≥
1.5 × company with ≥ 5 reqs). Add one `good` finding when something is clearly working (best
source by hire rate). Copy examples:
- "Onsite to offer is the bottleneck in Design Verification: median 19 d vs 7 d elsewhere." Action:
  "Resolve the onsite to offer bottleneck. Start with the Design Verification hiring managers."
- "48 candidates lack a next step, 21 of them waiting on an interview decision." Action: "Ask the
  panels to submit scorecards and make a decision this week."
- "Offer acceptance fell to 68% from 85% last quarter, mostly in Bengaluru."

### Figures

Overview: Pipeline today (lead, span 8: stage bars split by next-step state, clickable to the
Pipeline tab), Hires by month (24 months, Columns), Open reqs by department (BarList, tone by
oldest age), Time to fill by level (BarList, median days, company ref), Offer acceptance by quarter
(Lines, 8 quarters).

Pipeline: Candidate flow (custom SVG sankey "river": Applied → Screen → Hiring manager → Onsite →
Offer → Hired with rejected/withdrawn/declined draining to a bottom band and still-active as an
open-ended fade; cohort = applications in the window; ribbons clickable to filter the action queue),
Stage conversion table (entered, advanced, pass %, rejected, withdrawn, declined, active, median
days to next stage, Δ days vs prior), Waiting time by stage (DotStrip: one dot per active candidate,
x = days waiting, tone by aging tier), Days per transition by application month (Heatmap,
12 months × transitions, median days; makes a recent bottleneck visible), Action queue (tableOnly:
grouped by owner; candidate, req, stage, state label, days, next step in neutral words; a "Copy
note" button per owner that writes a polite, professional message, e.g. "Could you ask the panel
to submit scorecards for Priya Raman (Senior DV Engineer) and make the call this week?").

Requisitions: Open requisitions (tableOnly, rowTone: req, title, department, location, level,
priority, hiring manager, recruiter, days open, active candidates per stage, health: "Empty funnel"
critical when nobody is past Screen after 30 days, "N lack a next step" warning, else "On track"),
Open req age (Histogram), Time to fill by department (BarList), Reqs opened and filled by month
(Columns grouped), Recruiter load (tableOnly: open reqs, active candidates, hires in window, median
days waiting, lacking next step; flag when median wait > 1.5 × team median).

Sources & offers: Source effectiveness (tableOnly + BarList of hire rate: applications, share,
hires, hire rate, offer acceptance, median time to hire), Applications by source by month (Lines,
emphasize the source with the largest change), Offer acceptance by location (BarList with company
ref), Why offers were declined (BarList of rejection reasons for Declined), Why candidates left the
process (HBars: rejected vs withdrawn reasons by stage).

Added in the design refresh (docs/CHARTS.md): Open reqs at month end (Overview, top of
Requisitions; Columns stacked by business unit, or by department when the scope sits in one unit,
24 month ends, `openReqsByMonthEnd`; a segment carries its unit as the filter), Interview decisions
waiting (Pipeline, under the owners panel; BarList by hiring manager, top 10 and Other, glyph for
overdue or to watch; new metric `recruiting.pipeline.awaitingDecision`; no filter, a hiring
manager's own reqs are not an org), Open reqs by age and candidates past the screen
(Requisitions; Scatter, one dot per open req, empty funnels red and named; a dot opens its req),
Median time to fill by quarter (Requisitions; Lines, all reqs and L1 to L4 / L5 and above, 8
quarters, target rule; a point carries the quarter and the band's levels; hidden in Manager mode).

---

## Onboarding (`onboarding`)

Question it answers: who starts in the next 90 days, will each of them be ready on day one, are
we hiring to plan, and how are the first 90 days going? Readers: TA and people operations leads,
hiring managers' HRBPs.

Tabs: `upcoming` Upcoming starts · `first90` First 90 days · `plan` Hiring plan.

Folder-tab headline: starts in the next 30 days ("starts in 30 days"), spark of weekly starts for
the next 8 weeks.

Datasets: employees, requisitions, candidates, transactions, learning, hiringPlan,
onboardingTasks. The tab shows what it can without the two new datasets: without Onboarding tasks
the readiness numbers are "—" with "No onboarding tasks loaded" (never 0%); without a Hiring plan
the Hiring plan tab is an empty state with the template link.

### Definitions

- Upcoming start: a pre-hire employee (`hireDate` after the as-of date) or an accepted candidate
  (`hiredDate` set, status Hired) with `startDate` after the as-of date. De-duplicate by req and
  name: drop the candidate when an employee with the same normalized name starts within 14 days of
  the candidate's start date in the req's department. Accepted candidates with no start date count
  separately as "start date unknown" (a quality note, not a guess).
- Readiness: the person's tasks that count toward day one (`ONBOARDING_TASKS` with
  `readiness: true`; I-9 tasks only for US sites). "7 of 9 done" counts tasks completed (or Not
  needed). Status: Ready (all done), On track (none past due), Behind (any past due), Not ready
  (starts within 3 days with any open). The blocking item is the open task with the earliest due
  date. Due dates come from the data (the importer converts "Day -3" with the start date) or,
  when blank, from the checklist's `dueDay`.
- Day -3 tasks not done: upcoming starts in the next 14 days (a setting) with any task due on or
  before day -3 still open.
- Open contingencies (Atlas ON-01 weekly exception): starts in the next 10 business days whose
  background check or export-control screening is not done.
- Offer accepted to start: median days `hiredDate` → `startDate` over accepted offers in the
  window, by location (India has 60-90 day notice periods).
- Renege rate: accepted offers in the window (`hiredDate` in window) later withdrawn (status
  Withdrawn with `hiredDate` set) ÷ accepted offers in the window. Target under 3%; the country
  tracked separately (default India) is a setting and gets its own figure row.
- Day-one readiness (ON-01): people who started in the window with every readiness task completed
  on or before their start date ÷ starts in the window with tasks. Target at least 95%.
- I-9 Section 2 within 3 business days (ON-02): US starts in the window with the I-9 Section 2
  task completed by `addBusinessDays(start, 3)`. Target 100%.
- Required training within 30 days (ON-04): required Learning assignments of starters in the
  window completed within 30 days of the start. Target at least 95%.
- Check-ins on time (ON-04): 30, 60 and 90-day check-in tasks completed by their due date. Target
  at least 90%.
- Probation decisions: the Probation decision task, due 10 business days before probation ends;
  "due soon" within 30 days, "overdue" past due and not done.
- Voluntary attrition within 90 days: hires in the window whose 90 days have passed and who left
  voluntarily within 90 days ÷ those hires. Target under 2%. By department and by hiring manager
  (the manager at hire), groups under the anonymity minimum hidden.
- Hiring plan: the latest `planVersion` when several are loaded (say which). Plan = Σ
  `plannedHires` by start month. Actual = employees (`isEmployee`) whose `hireDate` falls in the
  month. Committed = accepted offers with a future `startDate`, by start month. Forecast = open
  reqs × the historical fill rate × time to fill, from the Recruiting engine (import it, never
  copy it).
- Plan coverage by business unit and department: plan year to date, full-year plan, actual year
  to date, committed, open reqs, gap = full-year plan − (actual + committed + forecast), status
  On plan (actual year to date within ±10% of plan year to date), Behind, Ahead.
- Planned roles with no open requisition: future plan lines without a `reqId`, or whose req is
  not Open. Open reqs not in the plan: Open reqs whose ID is on no plan line and whose department
  has no planned starts left; backfills (`reqType` Backfill) listed on their own.

### KPIs

Upcoming starts: starts in 30 / 60 / 90 days (one tile, note "60 d: n · 90 d: n"), Day -3 tasks
not done, open contingencies in the next 10 business days, median offer accepted to start (d),
renege rate. First 90 days: day-one readiness, I-9 Section 2 on time, required training within 30
days, check-ins on time, probation decisions overdue, voluntary attrition within 90 days. Hiring
plan: starts vs plan year to date (actual ÷ plan), committed, gap.

### Figures

Upcoming starts: Start calendar (lead, Columns stacked by business unit, weekly for the next 13
weeks; every bar drills to the people), Upcoming starts (tableOnly: person, role, department,
hiring manager, recruiter, location, start date, days to go, readiness "7 of 9 done" with a status
pill, blocking item; a row opens the pre-hire's person card or the candidate drill), Readiness by
task (BarList: share of upcoming starts with each task done by its due date), Readiness by owner
(BarList: IT, Facilities, People ops, Trade compliance, Manager).

First 90 days: Day-one readiness by month (Lines with the target), New hire readiness by site
(BarList; moved here from HR ops > HR transactions: New hire transactions completed by day -3),
Check-ins on time by check-in (BarList), Probation decisions due and overdue (tableOnly), Voluntary
attrition within 90 days by department and by hiring manager (BarList, suppressed under the
minimum), and one number from Listening: day-30 "I had what I needed", linking there.

Hiring plan: Plan vs actual (lead, Lines, cumulative by month: plan, actual, committed, forecast
de-emphasized), Plan coverage (tableOnly with status pills), Planned roles with no requisition
(tableOnly), Open reqs not in the plan (tableOnly, backfills on their own).

Added in the design refresh (docs/CHARTS.md): Countdown to day one (Upcoming starts, top of Ready
for day one; DotStrip of starts in the look-ahead by days to go and the team holding the blocking
item, colored by readiness with a legend; in Manager mode a background check or screening reads
"With People ops" / "With Trade compliance" in the table and the records), Late day-one tasks by
task and region (First 90 days; Heatmap with a Region / Site switch, cells under the anonymity
minimum hidden; a region carries its sites as the filter), When day-one tasks were finished (First
90 days; Histogram of days from start to completion for one task, on-time band and first-day rule;
new metric `onboarding.first90.taskTiming`), Starts against plan by unit and month (Hiring plan,
section Month by month; diverging Heatmap of actual minus planned starts, by department inside
one unit). The two First 90 days figures are HR and Developer only.

### Findings

Findings across the three tabs, each with a number, where it concentrates (`decomposeRate`) and
one neutral next step. Examples: "Silicon Engineering is 14 starts behind its Q4 plan; 9 planned
roles have no open req." Action: "Review the open roles with the Silicon Engineering leaders and
open the missing reqs." "3 people start next week without a cleared background check." Action:
"Ask People operations to confirm the background checks before Friday." Others: a region whose
laptops ship late (readiness by owner × region), reneges concentrated in a location, probation
decisions overdue in a department, day-one readiness under target at a site.

### Elsewhere

- Recruiting's Overview gets one "Hires vs plan" KPI that opens Onboarding > Hiring plan. It reads
  `hiresVsPlan(ctx)` from `src/views/onboarding/api.ts` (pure; null without a plan), which returns
  the value, counts, status and a ready `kpi` (metric `onboarding.plan.vsPlan`, `uses`, drills; no
  `tab`). As built: `src/views/recruiting/plan.ts` (`hiresVsPlanKpi`, `overviewKpis`) adds
  `link: { view: 'onboarding', tab: 'plan' }`; the Overview strip and Recruiting's `summary` read
  it from there, outside the Recruiting engine (the forecast here imports that engine, so an import
  back would be a cycle). Without a plan the tile shows "—" and still opens the Hiring plan tab.
- HR ops keeps ON-03 (new hires entered by day -3) in its Service levels scorecard; its "New hire
  readiness by site" figure is replaced by a link here.
- `actions(ctx)`: starts not ready (owner = the blocking task's owner: IT, facilities, hr-ops,
  trade-compliance or the manager), probation decisions due or overdue (manager), I-9 Section 2
  due (hr-ops).
- `summary(ctx)`: day-one readiness, I-9 Section 2 on time, voluntary attrition within 90 days.

---

## People stats (`hrbp`)

Question: what does a leader's organization look like, how is it changing, and what should the
HRBP raise in the next 1:1? Port the user's HRBP dashboard definitions (research-hrbp.md, the
metric engine `hrbp.mjs`) and FIX the bugs listed there. The scope picker is the global filter row
(leader, business unit, department, location, level). Flight risk and promotion readiness live in
Talent (don't duplicate them here).

Tabs: `overview` Overview · `workforce` Workforce · `attrition` Attrition · `movement` Movement · `org` Org design.

Header action: "Copy talking points" (5-7 plain-text bullets for a leader 1:1: headcount and YoY,
voluntary attrition vs company with top reason, regretted exits and where they cluster (count
REGRETTED exits per manager, the old tool used all exits by mistake), first-year attrition with
cohort n, promotion rate vs company, top finding). Copies to clipboard with a toast.

Folder-tab headline: active employees at asOf ("employees"), sparkline of the last 8 quarter-ends.

### KPIs

Headcount (Δ vs 12 months earlier), Hires (window), Attrition (annualized), Voluntary attrition,
Regretted attrition, First-year attrition (note: cohort n), Promotion rate (promotions in the window
from jobChanges ÷ average headcount; count every promotion event). When an org filter is active,
deltas compare with the company (`ctx.all`) and say "vs company"; otherwise vs the prior window.
Delta coloring uses the materiality floor from the old tool: |Δ| ≥ 0.02 × |company| + 0.15 pts.

### Findings (port the alert rules; drop engagement, pay, gender rules)

Regretted exits clustered under a manager (≥ 2 in 12 months; critical ≥ 3), voluntary attrition
vs company by department / location (≥ 3 pts above with avg HC ≥ 10, decomposed), first-year
attrition > 20% with cohort ≥ 5, span outliers (1 report or ≥ 12), new manager (< 12 months tenure)
with ≥ 5 directs, single-report chains (manager with exactly 1 report whose subtree ≥ 5), org depth
> 7 layers, rapid growth (department headcount now vs 6 months ago, true headcount at both dates,
≥ 35% with base ≥ 5), new-hire concentration (≥ 50% of a team hired in the last 6 months, team ≥
5). Each with a concrete action ("Hold stay conversations with the rest of the team this month").
Name at most 5 people inline; put the rest in `people`.

### Figures

Overview: Headcount over time (lead, Lines, month-end, 24 months, with the prior-year line
de-emphasized), Hires and exits by month (Columns grouped, 12 months), Sub-org scorecard (tableOnly:
rows = the leader's direct reports' orgs when a leader is selected, else business units; HC, net Δ
12 mo, voluntary attrition, regretted, first-year attrition, promotion rate, avg span; cells shaded
when materially off the company; small orgs (< 5) folded into "Other"; row click rescopes).

Workforce: Headcount by department (BarList top 12 + Other), by location (BarList), by level
(Columns in LEVELS order), Tenure (Columns by band), Workforce mix (HBars: employees vs contractors
vs interns by business unit), Growth by business unit (BarList of YoY change, diverging tones),
Engineering share (Meter or stat).

Attrition: Attrition by quarter (Columns stacked voluntary/involuntary, annualized per quarter),
Regretted attrition by quarter (Lines), Why people left (BarList of voluntary reasons, 12-reason
taxonomy), Attrition by department / location (BarList with company ref, suppressed below 5),
Attrition by tenure at exit and by level (Columns), Exits by last rating (Columns: exits within 12
months by rating, from reviews), Regretted leavers (tableOnly: name, department, level, manager, exit
date, reason, last rating).

Movement: Promotions by quarter (Columns), Promotion rate by level (BarList, promotions ÷ avg HC at
level, suppressed < 5), Transfers and lateral moves by department (HBars), Time since last
promotion (Columns: < 1 yr, 1-2, 2-3, 3-5, 5+, never), Internal moves table (tableOnly).

Org design: Span of control (Columns: 1, 2, 3-5, 6-8, 9-11, 12+), Layers by business unit
(BarList), Manager table (tableOnly: manager, department, directs, total org, tenure months,
regretted exits 12 mo, flag Overloaded ≥ 12 / Heavy ≥ 9 / Light < 3 / New < 12 mo / Healthy),
Single-report chains (tableOnly), KPIs for mean/median span, manager ratio, layers on this tab via a
small KpiStrip.

Added in the design refresh (docs/CHARTS.md; engine `engine/trends.ts`, computed per tab on first
use): Attrition, rolling 12 months (`hrbp-attrition-trailing`, Overview beside Hires and exits;
Lines over 24 month ends, voluntary or regretted, company line in gray under an org filter;
`hrbp.attrition.trailing12`), Headcount by business unit over time (`hrbp-headcount-by-org-trend`,
Workforce lead; Columns stacked by the scorecard's one-level-down groups, at most 7 plus Other;
`hrbp.headcount.employees`), How long new hires stay (`hrbp-cohort-retention`, Attrition; Columns
grouped, three yearly hire cohorts at 3/6/12/18/24 months, only hires whose checkpoint has passed;
`hrbp.attrition.cohortRetention`), New manager in the last 12 months (`hrbp-manager-changes`,
Movement under Time since last promotion; BarList by group with company ref;
`hrbp.movement.managerChange`). All four show in Manager mode, inside the org.

---

## HR ops (`services`)

Question: are employees getting fast, correct answers and are HR transactions processed on time?
Readers: People operations, payroll, benefits and HRIS leads. Ties every measure to the
Hire-to-Retire Atlas process that governs it (process IDs from `CASE_CATEGORIES` and
`TRANSACTION_PROCESS`).

Tabs: `overview` Overview · `cases` Cases · `transactions` HR transactions · `leave` Leave & return ·
`levels` Service levels.

Folder-tab headline: open cases at asOf ("open cases"), sparkline of cases opened per month (8).

### Definitions

- Response SLA met: firstResponseAt − openedAt ≤ responseTargetHours (fall back to the category
  default). Resolution SLA met: resolvedAt − openedAt ≤ resolutionTargetHours. Calendar hours.
  Rates over cases opened in the window that have the timestamp; open cases already past their
  target count as missed.
- Time to resolve: median hours (show days when ≥ 48 h) for cases resolved in the window.
- Backlog: cases with an open status at asOf; age = asOf − openedAt.
- First-contact resolution: resolved, not reopened, not escalated, Tier 0/1.
- CSAT: mean of 1-5 scores with n; "—" below 5 responses.
- Transaction on time: completedDate ≤ dueDate. Open transactions past due count as late.
- Final pay timeliness: Termination transactions on time, by jurisdiction (SITES), with the rule
  stated (e.g. "California: same day for involuntary, last day for voluntary").
- New hire readiness: New hire transactions completed by Day −3 (dueDate), by site.

### KPIs

Cases opened (window, vs prior), Open backlog (snapshot; note: share older than 14 d), Resolution
SLA met (target 90%), First response SLA met, Median time to resolve, Satisfaction (CSAT, n),
Transactions on time (target 98%).

### Findings

Volume spike (a month ≥ 1.8 × the trailing 6-month median, with its SLA rate), categories with
resolution SLA < 80% (with the waiting-on-third-party share), final pay late in a jurisdiction (on
time < 95% with n ≥ 5), new hire readiness < 95% by site/region, channel CSAT gap ≥ 0.5, reopen
rate ≥ 2 × company by category, aged backlog (> 30 d) by category, and one `good` finding.
Actions name the owning team and the Atlas process ("Review the PY-05 payroll correction steps with
the Payroll team").

### Figures

Overview: Cases opened by month (lead: Columns stacked by the top 5 categories + Other, 24
months), Resolution SLA by month (Lines with 90% target ref), Cases by category (BarList with
secondary = SLA %), Open backlog by age (Columns: 0-2 d, 3-7, 8-14, 15-30, 30+, stacked by status).

Cases: Resolution SLA by category (BarList, target ref, tone), Time to resolve by category
(RangeBars: q1/median/q3), When cases arrive (Heatmap weekday × hour), Satisfaction by channel
(BarList), Reopened and escalated by category (HBars), Team workload (tableOnly: team, opened,
resolved, open, SLA %, median time to resolve, CSAT), Cases open longer than 14 days (tableOnly,
rowTone by age).

HR transactions: On time by transaction type (BarList with target), Final pay timeliness by
jurisdiction (tableOnly + BarList), a link to Onboarding for new hire readiness by site (the
figure moved there), Days early or late
(Histogram of completedDate − dueDate, band at ≤ 0), Retro adjustments by month (Columns).

Service levels: Service level scorecard (tableOnly, rowTone): one row per measurable Atlas KPI:
Process ID, process, measure, target, actual, status (Met / At risk within 5 pts / Missed), n,
window. At minimum: PY-05 payroll cases resolved within 2 business days (≥ 95%), DS-07
verifications within 2 business days (≥ 95%), LV-01 leave cases first response within 1 business
day (≥ 98%), ON-03 new hires entered by Day −3 (100%), OF-05 final pay on time (100%), DS-01 retro
transactions < 2% of changes, DS-04 access cases within 2 business days (≥ 98%), ER-02 median days
to close ≤ 30, BN-03 benefits cases within 5 business days (≥ 95%), MV-06 immigration cases first
response within 1 business day. Gap to target (HBars diverging around 0).

### Leave & return (`leave`)

Question it answers: who is on leave, how long, are returns handled well, and do people stay after
they come back? Readers: the leave and accommodation team, HRBPs.

- Data: Leave start and Return from leave transactions, paired per person (each leave start with
  the next return on or after it; none yet means still on leave). Optional fields: `leaveReason`
  (the Atlas's nine categories, category level only) and `expectedReturnDate`. Without reasons,
  the reason cuts say "No leave reasons loaded" and everything else still shows.
- On leave now: a leave start on or before the as-of date with no return by then, for people still
  employed. Leave length: return − start in days, median over returns in the window.
- Returns in the next 30 days: open leaves whose expected return falls in the next 30 days, with
  the LV-03 check that systems are ready (the Return from leave transaction completed by its due
  date, or due and open).
- Return rate: leaves that ended in a return ÷ leaves that ended (a return, or a termination while
  on leave) in the window.
- Retention 12 months after return: people who returned 12 to 24 months before the as-of date and
  were still employed 12 months after returning ÷ those returners. Target at least 90%. A
  parental-leave cut when reasons are loaded.
- Leavers within 6 months of returning, and terminations during leave: counts with a drill to the
  people (HR only: this tab is never part of a leader export by default); never in a finding by
  name.
- Privacy: groups under the anonymity minimum are hidden. The leave reason appears only in grouped
  counts, never next to a named person (the transactions drill leaves it out); Medical and
  Workers' compensation are categories only, never detail.
- KPIs: on leave now, median leave length, returns in the next 30 days (note: systems not ready),
  return rate, retention 12 months after return.
- Figures: On leave now by reason and business unit (HBars stacked, lead), Leave length by reason
  (RangeBars, quartiles), Returns in the next 30 days (tableOnly with an LV-03 status pill), Return
  rate by quarter (Lines), Retention 12 months after return by reason (BarList with the 90%
  target), and one number from Listening (Return to work survey), linking there.
- Findings: retention after parental leave under target; returns due next week without systems
  ready (action for people operations and IT); terminations soon after return concentrated in a
  department (count only).
- `actions(ctx)` adds returns in the next 30 days whose systems are not ready (hr-ops).
- As built: the lead figure toggles between "by reason" (the default; across the scope) and "by
  business unit and reason", because at 20 people on leave most unit × reason cells fall under
  the minimum. A reason is named in a group only when 5 or more share it and not everyone in the
  group does. Numbers cut by reason drill to the `leaveGroups` drill kind (grouped counts and one
  measure, never a person); people lists (transactions or employees kind) never carry the reason.
  The Return to work number comes from `surveyHeadline` in `src/views/listening/api.ts`, loaded
  through a glob so HR ops runs without it. When laid out off screen for a whole-view export the
  tab renders only a note, so it is never part of a leader export by default; "This tab" export
  still works. Settings (metric dictionary): look-ahead 30 d and urgent 7 d
  (`services.leave.returnsSoon`), retention horizon 12 months with a 90% target
  (`services.leave.retention`), exits within 6 months (`services.leave.exitsAfterReturn`), and the
  readout rules `services.readout.retentionAfterReturn`, `.returnsNotReady`, `.exitsAfterReturn`.

HR ops `summary(ctx)`: resolution SLA met (`services.cases.resolutionSla`, 90%), transactions on
time (`services.tx.onTime`, 98%) and final pay on time (`services.levels.of05-final-pay`, 100%),
then the readout ranked by severity with the leave findings except the HR-only exit cluster, and
without people lists. `actions(ctx)`: open cases past their resolution target (owner by team:
Payroll, Total rewards for Benefits, Global mobility, else People operations; the agent's name
when the case has one; employee relations cases name no one and do not drill), transactions open
past due (Payroll for terminations and compensation changes, critical for final pay or more than
14 days late), and returns from leave without systems ready.

---

## Talent (`talent`)

Question: is performance assessed fairly, do we have successors for critical roles, who are we at
risk of losing, and is required training done? Readers: talent management and calibration owners.

Tabs: `overview` Overview · `performance` Performance · `succession` Potential & succession ·
`retention` Retention risk · `learning` Learning.

Folder-tab headline: share of Critical roles with a Ready-now successor ("critical roles covered").

### Definitions

- Latest cycle: `latestCycle` at asOf; annual cycle for potential (latest cycle with potential).
- Rating distribution vs guideline: share per rating (1-5) of rated employees vs RATING_GUIDELINE.
  High performers = rating ≥ 4 (guideline 35%).
- Calibration shift: mean(preCalibrationRating − rating) where both exist.
- 9-box: performance (rating 1-2 Low, 3 Moderate, 4-5 High) × potential (Low/Moderate/High), latest
  annual cycle, active employees.
- Succession coverage: share of Critical roles (criticality = Critical) with ≥ 1 successor Ready now.
- Flight risk (new, explainable model replacing the old one): score 0-100 from factors computed at
  asOf: time since last promotion or hire vs level norm, tenure in the 1-3 year peak, rating
  dropped vs prior cycle, high rating without promotion in 3 years, department voluntary attrition
  (12 months) above company, manager changed in the last 6 months, ≥ 40% of peers under the same
  manager left in the last 12 months, compa-ratio < 0.90 when comp data exists. Each factor gives
  points and a plain reason. Bands by percentile: top 10% High, next 25% Medium, rest Low.
  BACK-TEST: score everyone as of 12 months before asOf and report the exit rate per band over the
  following 12 months, so readers can see the model separates leavers from stayers.
- Required training: assignments with required = true; on time = completedDate ≤ dueDate; overdue
  = no completion and dueDate < asOf.

### KPIs

Rated in latest cycle (coverage %), High performers (% rated 4-5, vs guideline 35%), High
potentials (%), Succession coverage (Critical roles ready now), Regretted exits of high performers
(window), Required training on time (%), Key talent at risk (rating ≥ 4 and High flight risk).

### Findings

Rating inflation (a business unit's share rated 4-5 more than 8 pts above guideline, n ≥ 20),
calibration shift > 0.3 by business unit, high-potential regretted exits in the last 6 months,
Critical roles without a ready-now successor and incumbents with High risk of loss and no
successor, training overdue concentration (decompose by course × department/location), high
performers with no promotion in 3+ years (decompose by department/level), key talent at risk. One
`good` finding when appropriate.

### Figures

Overview: 9-box (lead, custom grid: counts and % per cell, cell click shows the people, labels
like "Stars" are fine but keep them plain: "High performance, high potential"), Rating distribution
vs guideline (Columns grouped: actual vs guideline), Succession coverage by business unit (HBars:
ready now / 1-2 yrs / 3+ yrs / no successor), Key talent at risk (tableOnly, top 10).

Performance: Share rated 4-5 by department (BarList with 35% ref), Rating mix by business unit
(HBars normalize, ratings in order with an ordinal blue ramp), Calibration shift by business unit
(RangeBars or dumbbell: mean pre-calibration vs final), Average rating by cycle (Lines per business
unit, emphasize the outlier), Exit rate within 12 months by rating (Columns).

Potential & succession: Critical roles (tableOnly, rowTone: role, incumbent, criticality, risk of
loss, successors, ready now, readiness mix, status Covered / Thin / No successor), Bench strength by
business unit (HBars), High potentials by level (Columns), Successor readiness pipeline (Columns by
readiness).

Retention risk: People by risk band (Columns), Exit rate by risk band, back-tested (Columns with
the definition), What drives risk (BarList: how often each factor is a person's top reason), Key
talent at risk (tableOnly with top 2 reasons), High performers overdue for promotion (tableOnly).

Learning: Required training on time by course (BarList with 95% ref), Overdue by course and
department (Heatmap, share overdue), Completions by month (Columns), Learning hours per employee by
business unit (BarList), Overdue assignments (tableOnly).

Added in the design refresh (engine `engine/charts.ts`): Succession exposure
(`talent-succession-exposure`, Succession lead beside Bench strength; Heatmap of roles by the
incumbent's risk of loss and the best successor's readiness; a picked cell narrows the roles table;
`talent.succession.exposure`), Rating change since the last annual cycle (`talent-rating-change`,
Performance; Heatmap 5 × 5; `talent.performance.ratingChange`), Share rated 4-5 by reviewer
(`talent-rating-by-manager`, Performance > Calibration; DotStrip by the reviewer's business unit,
reviewers with 5 or more rated; hidden in Manager mode; `talent.performance.byReviewer`), Required
training overdue at each month end (`talent-overdue-trend`, Learning lead; Columns stacked by course;
`talent.learning.overdueAtMonthEnd`).

---

## Compensation (`comp`)

Question: is pay positioned where policy says, is it fair relative to performance and the market,
and is the merit cycle on budget? Readers: total rewards and comp partners. Privacy: ratios always;
amounts only when "Show pay amounts" is on.

Tabs: `overview` Overview · `ranges` Range position · `performance` Pay for performance ·
`market` Market · `cycle` Merit cycle.

HeaderActions: Switch "Show pay amounts" (store.showPay) and a "Cycle settings" popover (merit
budget %, default 3.5%; healthy compa-ratio band, default 0.90-1.10; merit guideline by rating,
default 5: 6%, 4: 4.5%, 3: 3%, 2: 1%, 1: 0%), persisted in localStorage with try/catch.

Folder-tab headline: median compa-ratio ("median compa-ratio").

### Definitions

- Population: active employees at asOf with a comp row. Amount aggregates convert to USD with
  fxToUsd; ratios need no conversion.
- Compa-ratio = baseSalary ÷ rangeMid. Range penetration = (base − min) ÷ (max − min), unclamped
  (below 0 = under min, above 1 = over max). Position buckets: Below minimum, Q1, Q2, Q3, Q4, Above
  maximum.
- Market ratio = baseSalary ÷ marketP50.
- Merit spend % = Σ(base × meritPct) ÷ Σ(base of eligible), in USD; eligible = active with a merit
  proposal field (null treated as 0 for spend, excluded from averages). Promotion % reported
  separately and excluded from merit outlier checks.
- Pay-for-performance differentiation = mean merit % of rating 4-5 ÷ mean merit % of rating 3
  (latest annual rating).
- Pay compression: compa-ratio of people hired in the last 12 months vs incumbents (hired before)
  at the same level and department (n ≥ 5 each side).
- Cost to bring to minimum = Σ(rangeMin − base) for those below minimum (amount; showPay only).

### KPIs

Median compa-ratio, In healthy band (%), Below minimum (% and n), Above maximum (% and n), Merit
spend vs budget (% of base, Δ vs budget), Pay-for-performance differentiation (×), Median market
ratio.

### Findings

Location or department with median compa-ratio ≤ 0.92 (link the same group's voluntary attrition
from `src/lib/people.ts` when it is above company), below-minimum people (count; cost to bring to
minimum only when showPay), above-maximum cluster (decompose by level/tenure), compression in a
department × level, merit spend over budget by business unit, guideline exceptions (rating 5 with
merit < 2%; rating ≤ 2 with merit > 3%), job function below market by ≥ 5%, department with no
differentiation (ratio < 1.15). One `good` finding.

### Figures

Overview: Compa-ratio distribution (lead, Histogram, shaded healthy band, ref at 1.00), Range
position by business unit (HBars normalize over the six buckets, ordinal ramp with status colors for
below/above), Median compa-ratio by location (BarList with company ref), Median compa-ratio by level
(DotStrip or BarList in level order).

Range position: Range penetration by level (RangeBars q1/median/q3), Below minimum (tableOnly: ID,
name, department, level, location, compa-ratio, gap to minimum %, gap amount when showPay),
Above maximum (tableOnly), Compa-ratio by tenure (Scatter or DotStrip by tenure band), Pay
compression (RangeBars or dumbbell: new hires vs incumbents by department × level where n ≥ 5).

Pay for performance: Compa-ratio by rating (DotStrip or Columns), Merit % by rating vs guideline
(Columns with per-rating ref), Merit matrix (Heatmap: rating × compa-ratio quartile → average merit
%, diverging vs guideline), Differentiation by department (BarList of the ratio, ref 1.15), Bonus
payout by rating (Columns).

Market: Base vs market median by job function (BarList diverging around 0%), by location, by level,
Jobs furthest below market (tableOnly).

Merit cycle: Merit spend vs budget by business unit (BarList with budget ref; amounts in the table
only when showPay), Merit distribution (Histogram), Guideline exceptions (tableOnly, rowTone),
Promotions in this cycle (stat + table), Total rewards mix by level (HBars normalize: base, target
bonus, equity; shares only).

Added in the design refresh (engine `engine/charts.ts`, ratios and counts only): Pay position and
voluntary attrition (`comp-pay-attrition`, Overview "Pay and retention"; Scatter by location or
department), Median compa-ratio by location and level (`comp-compa-location-level`, Heatmap diverging
around 1.00, cells under 5 hidden), Pay or the range (`comp-market-vs-range`, Market lead; Scatter of
job families, market median ÷ midpoint against median compa-ratio), Below range minimum by location
and cause (`comp-below-min-cause`, Ranges lead; HBars stacked promoted / hired / neither).

---

## Compliance (`compliance`)

Question it answers: is everyone allowed to work, verified on time and licensed for the
technology they touch, and which statutory deadlines are coming? Readers: people operations,
global mobility and trade compliance. High risk for a semiconductor company.

Tabs: `overview` Overview · `work` Right to work · `export` Export control · `deadlines` Deadlines.

Folder-tab headline: work authorizations expiring in the next 90 days ("expiring in 90 days").

Datasets: employees, learning, onboardingTasks, rightToWork.

### Privacy (enforced in the engine)

- No nationality or citizenship field exists, ever, and none is imported (the importer drops such
  columns). Authorization types are broad categories (`AUTHORIZATION_TYPES`); citizens and
  permanent residents are both "Permanent (no expiry)".
- The authorization type shows per person (tables, drills, exports) only while
  `ctx.showImmigration` is on; counts by type always show, with groups under the minimum folded
  into "Other". The `rightToWork` drill kind already hides the type when it is off.
- Expiry dates and reverification status are shown per person: they are what people operations
  acts on.

### Definitions

- Expiring: `expiryDate` after the as-of date and within 180 days (90 for the headline).
- Reverification on time: reverification started at least 90 days before expiry
  (`reverificationStartedDate <= expiryDate − 90`), over authorizations that expired in the window
  or expire within 180 days. Target 100%. Overdue: expiring within 90 days with no
  reverification started.
- I-9 Section 2 within 3 business days: US employees (site country United States) hired in the
  window with `i9Section2Date <= addBusinessDays(hireDate, 3)`. Target 100%. Section 1 on time:
  `i9Section1Date <= hireDate`.
- Export control: people whose role needs a license (`exportLicenseRequired`). Working without a
  license in force: active, license required, and status Pending, Denied or Expired, or
  `exportLicenseExpiry` before the as-of date. Should be 0. Upcoming starts with a license still
  pending are listed for trade compliance.
- Required training and policy acknowledgments: a summary only (required training on time from
  the Talent engine, policy acknowledgments within 5 business days from Onboarding tasks), each
  linking to Talent > Learning or Onboarding; not a copy of those figures.
- Statutory deadlines: the Hire-to-Retire Atlas calendar, bundled in
  `src/views/compliance/reference/calendar.ts` (generated from the Atlas `data/country-*.json`:
  every jurisdiction in `SITES` plus US federal, 155 entries, each with its month, the day where
  the Atlas names one, recurrence and the Atlas wording; each jurisdiction with its source list
  and the month its research was verified). Show entries after the as-of date and within the
  look-ahead (60 days, a setting) for jurisdictions where someone in scope works; US federal
  entries apply at every US site; an entry without a day counts for its whole month. Every
  figure carries "confirm dates and obligations with employment counsel" (the Atlas is a working
  draft).

### KPIs

Expiring in 90 days (note: in 180 days), reverification on time, reverification overdue, I-9
Section 2 within 3 business days, working without an export license in force, required training
on time (links to Talent).

### Figures

Overview: Authorization expiries by month (lead, Columns over the next 6 months stacked by
business unit; drills to the people), Reverification on time by quarter (bars by the quarter the
authorization ends in, with the 100% target; a quarter under the anonymity minimum shows "—"),
Deadlines in the next 60 days (tableOnly), Training and acknowledgments summary (two
numbers with links). Right to work: Expiring authorizations (tableOnly: person, department,
location, expiry, days to expiry, reverification started, status pill; type only with immigration
details on), Authorization mix (BarList of counts by category with shares; small categories fold
into Other; a count opens its people only with immigration details on), I-9 timeliness by site
(BarList with target). Export control: Licenses by status (BarList), Working without a license in
force (tableOnly), Upcoming starts with a license pending (tableOnly). Deadlines: Statutory
calendar (tableOnly, next 60 days, by jurisdiction).

### Findings

Reverification overdue concentrated in a business unit; I-9 Section 2 late at a site; anyone
working without an export license in force (critical); a cluster of expiries in one month.
Actions name the team: "Start reverification with Global mobility this week for the 6 people
whose authorization ends before 31 Dec."

### Elsewhere

- `actions(ctx)`: reverification to start (immigration: ended, overdue, or its 90-day mark within
  the notice setting), I-9 Section 2 past due and not complete (hr-ops; upcoming Section 2 tasks
  stay with Onboarding), export license not in force for someone working or starting within the
  look-ahead (trade-compliance). Ids `compliance:<reverification|i9|license>:<employee ID>`.
- `summary(ctx)`: reverification on time, I-9 Section 2 within 3 business days, working without a
  license in force.

---

## Listening (`listening`)

Question it answers: what do candidates, new starters, employees, leavers and service users tell
us, where are scores low, and how do they tie to what the operational numbers show? Readers: HR
leadership, HRBPs, talent acquisition, people operations.

Tabs: `overview` Overview · `candidates` Candidates & hiring · `onboarding` Onboarding ·
`stay-exit` Stay & exit · `managers` Managers · `services` Services & learning · `engagement`
Engagement (only while the engagement surveys switch is on: the tab carries
`feature: 'engagementSurveys'` and the shell drops it with `withFeatureTabs`). Each survey lives on
its `SURVEY_PROGRAMS[].area` tab, except Engagement, which has its own.

Folder-tab headline: survey programs with a wave in the last 12 months ("survey programs").

Datasets: employees, requisitions, candidates, cases, transactions, surveyResponses, surveyItems.

### Privacy (enforced in the engine, the one exception to click-down)

- Every survey number is grouped. Use `@/lib/surveys` for every aggregate; a group needs at least
  `surveyMinimumsOf(ctx.metrics).minGroup` distinct respondents (5) and cuts by manager need
  `minManager` (10) over the last four quarters (`managerCuts`). Nothing below the minimum is
  shown, and the figure or drill says why ("Hidden to protect anonymity").
- Survey numbers drill to `surveyGroups` rows (grouped counts and scores), never to answers or
  people. Respondent keys only join org, stage or req attributes (`respondentIndex` /
  `respondentKey`), and are never displayed or exported. Free-text comments are never imported.
- Engagement and eNPS show only when `ctx.features.engagementSurveys` is on (Settings > Privacy).
  When it is off, Engagement answers are ignored everywhere (not shown, not counted) and the
  Overview says "Engagement surveys are off. Turn them on in Settings, Privacy."

### Definitions

- Wave: the `wave` value; waves order by their first answer (`wavesOf`). Latest wave = the last
  one that started on or before the as-of date.
- Score: mean on the item's scale (1-5 or 0-10), or top-box share (4-5, or 9-10). NPS for
  likelihood-to-recommend items on 0-10: % promoters − % detractors.
- Target: the Survey items sheet's `target` for the item; else the Listening default setting
  (4.0 on 1-5, NPS 20; settings in `listening/metrics.ts`).
- Response rate: respondents ÷ invited population when it is known, over the period (people whose
  trigger fell in the period and who answered, up to 120 days before it for an exit survey at
  notice): candidates who reached the stage (Candidate experience), filled reqs' hiring managers
  (Hiring manager satisfaction), starters whose day 30 or 90 fell in the period (Onboarding pulse),
  resolved cases (HR service survey), returners (Return to work), voluntary leavers (Exit survey);
  else "—" with "Invited population not known". Target: the metric's target (default 60%). The
  rate drills to the invited records, never to who answered.
- Change since the last wave: `waveChange`, null when either wave is under the minimum.
- Driver: the answer's own driver, else the Survey items sheet's (`driverOf`).

### Layout

Overview: Survey programs (lead, tableOnly: survey, latest wave, respondents, response rate vs
target, headline score, change since last wave, status), Wave calendar (DotStrip of waves by month
per program), and a readout across programs.

Each area tab, per survey: score by driver against target (BarList with the target), driver heat
table (Heatmap: drivers × org, location or tenure band, cells under the minimum blank and labeled),
change since the last wave (Columns of deltas by driver), response rate. Specific cuts:
Candidate experience NPS by stage (`touchpoint`), source and recruiter, and why candidates declined
(`reason`); Hiring manager satisfaction by recruiter (`subjectKey` = req ID); Onboarding pulse
day-30 "I had what I needed" by region; Stay interview risk drivers for key talent; Exit survey
reason Pareto (12-reason taxonomy), driver gaps between regretted and other leavers (join
`employees.regrettable`), would return; Manager feedback by manager only through `managerCuts`;
HR service survey by case category and channel (`subjectKey` = case ID); Return to work; Training
evaluation by course (`subjectKey` = course).

### Findings

Tie results to operational numbers: "Day-30 'I had what I needed' is 3.4 in APAC; laptops shipped
late for 41% of APAC starts." Others: low candidate scores at one stage (the onsite bottleneck),
one recruiter's low hiring-manager satisfaction, career growth as the top stay risk for a group,
base salary as the top exit reason in a location, low upward feedback for a manager (only at 10+
respondents). Never a finding about a group under the minimum.

### Elsewhere

- Each survey's headline result shows as one number in the view it belongs to
  (`SURVEY_PROGRAMS[].alsoIn`), linking to Listening. Listening exports the API the other views
  call: `surveyHeadline(ctx, survey): { value: number | null; format; label; name; wave;
  respondents; suppressed; target; status; change; priorWave; metricId; uses; view: 'listening';
  tab; href; drill } | null` from `src/views/listening/api.ts` (pure; null when the survey has no
  answers in scope, and for Engagement while the switch is off), plus `surveyKpi(ctx, survey,
  { id?, label? })`, a ready KPI tile with no `tab` (link with `href` or `goTo('listening', tab)`).
- As built, the other views show it with `<LinkedSurvey survey id title dek />`
  (`src/views/listening/LinkedSurvey.tsx`): a section with "Open in Listening" and one Figure
  (metric = the survey's `listening.score.*`, `uses` from the headline, a one-row export; the value
  and respondents drill to grouped results). It renders nothing while no survey answers are loaded
  at all. Placement (`linkedSpots()` in `src/views/listening/linked.ts`): Recruiting > Sources &
  offers (candidate experience), Recruiting > Requisitions (hiring manager satisfaction), People
  stats > Attrition (exit survey), People stats > Org design (manager feedback), HR ops > Cases (HR
  service survey), Talent > Retention risk (stay interviews), Talent > Learning (training
  evaluation). Onboarding's day-30 pulse and HR ops' return to work keep their own figures.
- `linkedHeadline(ctx, survey)` is the headline as another view shows it: for manager feedback
  outside the whole company (a leader or department filter can narrow People stats to one
  manager's team) the number also needs the manager-cut minimum (`surveyMinimumsOf().minManager`,
  10) and drops the change since the wave before.
- `summary(ctx)`: response rate (period, pooled over the programs with a known population),
  day-30 readiness, exit "would return".
- `actions(ctx)`: upward feedback below the low score (manager cuts only) to the manager's HR
  business partner; a dominant stay risk for a department and career band to talent management;
  a location's stand-out exit reason to total rewards when it is pay, else the HR business
  partners; a region's low day-30 readiness to IT when late laptops explain it, else people
  operations.

---

## Data room (`data`)

Question: what data is loaded, is it complete, and how do I replace the sample with mine?

Layout: a header explaining the privacy model in one sentence ("Files you add stay in this
browser."), a drop zone that accepts one or many .xlsx/.xls/.csv files (multi-sheet workbooks
supported), and a manifest of the ten datasets as rows on one sheet: name, what it powers (view
names), source (Sample / file name + sheet + date), rows, field coverage (filled % of required and
recommended fields, as a small meter), issues, actions (Upload, Template, Download current, Reset to
sample). Global actions: "Download sample workbook" (all ten sheets), "Download blank template",
"Reset everything to sample", and an "As-of date" override (date input, clear button).

Upload flow (a Dialog): for each sheet found → detected dataset (with confidence; user can change
it or skip the sheet) → column mapping table (dataset field, required/recommended marker, chosen
column (select), confidence dot, three sample values, normalization preview for enum fields showing
unrecognized values) → validation summary (rows in/out, skipped, duplicates, defaulted, issues
table with "Download issues (CSV)") → Apply replaces the dataset (store.replaceDataset) and toasts
"Employees replaced: 1,912 rows". Remember the mapping by header fingerprint (profiles) and apply
it silently next time with a note. Employees are linked by manager name when IDs are missing.

---

## Action center (`#actions`)

Question it answers: what is open, who does it wait on, and what should I raise in this week's
review with each leader? Not a folder tab: the masthead "Actions" button (with the open count,
`useOpenActionCount()` from `src/views/actions`) opens it, and it keeps the filter row (the
leader filter is its "my team" mode: pick a manager to see their open items and their team's).

Files: `src/views/actions/` exports `ActionCenter` (the page body; the shell renders the filter
row above it inside a figure registry) and `useOpenActionCount(): number | null`.

### Items

Every view's `actions(ctx)` (see the view contract): Recruiting (the action queue's next steps,
owned by the hiring manager first for decisions, recruiter or coordinator otherwise), Onboarding
(starts not ready, probation decisions due, I-9 Section 2 due), HR ops (cases past target,
overdue transactions, returns from leave without systems ready), Talent (overdue required
training), Compliance (reverification, I-9, export licenses). Gated on the data standard like
any number (items whose `uses` fall below it are hidden, with a count of how many and why).

### Layout

- Header: "Action center", one line on what it lists, counts by severity.
- One sheet per owner group in `ACTION_OWNER_ROLES` order (Managers, HR business partners,
  Recruiters …) with its count, a "Copy note" button and an Excel export. Rows: severity icon and
  word, what, subject (opens its drill), owner name, due (in words: "Due in 3 d", "4 d overdue"),
  the view it comes from (link), Mark handled, Snooze 7 days.
- Copy note: one polite plain-text message per owner person following the recruiting tone rules
  ("Could you confirm the background check for Priya Raman, who starts on 12 Oct?"), never chase,
  push or nag.
- Handled and snoozed items are kept in this browser (`census:actions`, by item id, with
  try/catch); a snooze ends after its days (a setting, default 7). Open = neither handled nor
  snoozed.

### As built

- **Engine** (`src/views/actions/engine/`, pure, tested): `collectActions(ctx, views)` runs every
  view's `actions(ctx)` once per context (a view that throws is listed in `errors`, the rest
  still show), gates each item on the data standard (`gateFor` with the item's `uses`, else its
  view's datasets; hidden items are counted by the field or dataset that holds them back), matches
  owners named only by name to the roster (`ownerLookup`), so one person is one owner across views,
  and tells teams ("IT", "People operations") from people. Item ids are never shown or exported:
  an employee relations item's id carries its case ID.
- **My team** is the leader filter. The header's "My team" picker sets it (managers with one or
  more reports). Items about people in the leader's org come from the scoped context as usual,
  and items anywhere in the company owned by the leader or someone in their org are added (so a
  talent acquisition manager sees their recruiters' items). Each item is tagged `leader`, `org`
  or `other`, and a "Waiting on" switch narrows to one of them. In a scope under the anonymity
  minimum, employee relations items are left out, and the page says so whether or not any exist.
- **Page**: header (what it lists, scope, as-of, counts by severity that drill, My team, Export
  list), key figures (open, overdue, critical, due soon, owners), "Where items wait" (stacked bars
  by owner group and due date, status colors for overdue and due soon) and "Where items come
  from" (by view), then the list: filters (owner group, severity, due, from, search; Open or
  Handled and snoozed), one Figure per owner group with a block per owner (counts that drill,
  Copy note), items with severity, what, the polite ask, About (opens the item's `drill`, or the
  person card), From (opens the view and tab), due in words, Handled and Snooze with Undo, or
  Reopen. "Export list" writes the filtered list and a by-owner sheet to Excel; each owner
  group's sheet exports on its own.
- **Drill kind** `actionItems` (`ActionItemRow` in `src/drill/types.ts`): every count opens its
  items; the About cell opens the item's own records and a row opens the person it is about.
- **Metrics** (`src/views/actions/metrics.ts`): `actions.items.open` (setting: snooze length,
  7 d), `actions.items.overdue`, `actions.items.dueSoon` (setting: look-ahead, 7 d),
  `actions.items.critical`, `actions.owners.withOpen`. Their `uses` is `ITEM_USES`, the union of
  the fields the views' items read; a sample test fails when a view's items read a field not on
  it.
- **Copy note** (`composeNote`): "Hi {first name}," (or "Hi {team} team,"), one line on how many
  items as of the as-of date, each item numbered with what it is about, what is open (its due
  date when the item does not already say it) and the view's own polite ask, then "If any of
  these are already done, let me know and I will update the list. Thank you." An ask with a
  nagging verb is replaced by "Could you let me know where this stands?". At most 25 items; the
  rest are counted.
- **Views must not import `@/views/actions` from their `index.tsx`**: it reads the view registry.
- **Design refresh charts** (`engine/charts.ts`, `ui/Charts.tsx`): When items fall due (Columns,
  ten due bands from 8+ weeks overdue to no due date, stacked by severity), Who has the most
  waiting (BarList, top 12 owners and Other, glyph for critical or overdue), What is waiting, by
  kind (HBars stacked by due bucket, top 12 kinds and Other). Kinds come from `ActionItem.kind`
  (Recruiting and Onboarding set it), else the id (`engine/kind.ts`), else the view label; a
  sample test fails when an item has no named kind. Page order: key figures, due timeline with
  top owners, by kind with by view, then Where items wait at full width.

---
## Org chart (`org`)

Question: who reports to whom, how is each team shaped, and what would a reorganization change?
Ported from the user's own org chart tool (GitHub `unique-name27/org-chart-simulator`, which they say
"functions well"), redrawn in the Census design language and fed by the Employees dataset.

Tabs: `chart` Chart · `sandbox` Reorg sandbox.

Folder-tab headline: people managers at asOf ("people managers"), or average span; keep it cheap.

Chart: a top-down tree of person cards (name, title, level, department, location, direct and total
org counts) with connectors, expand and collapse per node, "expand all to depth N", zoom and pan,
fit to screen, search with jump-to-person (keyboard shortcut "/"), focus a person (breadcrumb up the
chain), color by department / location / level / tenure band / business unit (legend, categorical
slots in fixed order with "Other"), and flags carried from the old tool: span outliers (1 report or
12+), new managers with large teams, single-report chains, people hired in the last 90 days. The
global filters apply: a selected leader becomes the chart root; business unit / department /
location / level filters dim non-matching cards instead of removing them (the chain stays
readable). An as-of view uses `isActiveAt(ctx.asOf)`; a toggle shows open requisitions as dashed
placeholder cards under their hiring manager. Clicking a card opens a detail panel: person facts,
manager chain, direct reports, team stats (span, tenure, regretted exits 12 months), latest rating
and potential when reviews exist, and links "Open in People stats" (sets leaderId and goes
to #hrbp) and "Open in Talent".

Reorg sandbox: drag a person (or a whole team) onto a new manager; changes stay in a local
scenario (never touch the datasets), shown as a list of moves with undo; a ripple preview and a
scenario diff (span changes, layers, managers gaining or losing reports, orphaned teams, cycles
blocked) like the old tool's ScenarioDiffModal; reset; export the scenario as an Excel file of
moves and the resulting roster.

Exports: the chart is wrapped in a Figure whose rows are the people currently shown (ID, name,
title, manager, level, department, location, directs, total org) so CSV/Excel work; PNG/SVG export
of the visible chart; and an "Org slide" export (PowerPoint, one slide per selected leader with
their direct org, like the old tool's slide builder) using pptxgenjs. Large orgs: virtualize or
collapse by default below depth 3 so 1,500 people stay fast.

Team shape (design refresh, engine `engine/shape.ts`), between the chart and the flags table, follows
the chart root and the dimming filters: People at each layer (`org-shape-layers`, HBars stacked
managers / individual contributors / contractors and interns; `org.layers.count`), Span of each
manager (`org-span-by-layer`, DotStrip by layer, wide and narrow spans emphasized;
`org.person.directReports`), Orgs under each direct report (`org-team-sizes`, HBars stacked with open
roles when that switch is on; `org.person.totalOrg`), Tenure mix by org (`org-tenure-mix`, 100%
HBars on the ordinal ramp, orgs under 5 folded; `org.team.tenureMix`).

---

## AI in HR (`ai`)

Question: which AI agents does the HR team have, what is each one for, and when should you not
use it? A catalog of Glean agents, organized by HR area. For now every entry is a clearly marked
sample, with sample links.

Placement: the last folder tab, "AI in HR". Folder-tab headline: number of agents ("agents"),
plus "sample" while the catalog is the sample.

Each agent has:
- name, HR area (Recruiting, Onboarding, People stats, HR ops, Talent,
  Compensation, Compliance, People ops), audience (HR team, managers, employees) and status
  (Sample, Pilot, Live)
- a one-sentence description, "Use it for" (2-4 bullets) and "Don't use it for" (guardrails, e.g.
  "Not for hiring or pay decisions; it drafts, people decide")
- example prompts, each with a Copy button
- the data it draws on (e.g. Greenhouse, the HRIS, the Hire-to-Retire Atlas, policy pages)
- owner team, and an "Open in Glean" link (opens in a new tab). Sample links are labeled "Sample
  link" whatever the agent's status, so a Pilot or Live agent that still has its sample link says so.

Layout:
- A short responsible-use note at the top, one or two plain sentences: agents assist and people
  decide, and only use agents approved for the data you share with them.
- Filters: HR area, audience, status, and a search over names, descriptions and use cases. The
  search matches words where they start ("verif" finds "verification"), and single characters only
  as whole words, so "1:1" finds Leader 1:1 prep and not every agent with a 1 in it.
- Agents grouped by HR area, as sheets in a responsive grid. This is the one place in Census where
  cards are the right form, because each agent is an object people pick from.
- A compact "Agents by area" summary. Its counts filter the list.
- The catalog as a table-only Figure, so it exports to CSV or Excel like every other table. A slide
  shows only name, HR area, audience, status, description and owner; the long-text columns stay in
  Excel and CSV.
- It reads no datasets, so the view shows no filter row, no scope, window or as-of line and no tier
  badges, and its exports carry no scope, data-standard or "Sample data" lines.

Editing (the catalog is a sample to be replaced):
- Edit in place: add, edit and remove agents, and reset to the sample.
- Import from and export to an Excel sheet named "AI agents", with the same columns as the
  catalog. A row with no status (or an unknown one) is imported as Pilot, as the Add dialog
  defaults, and the import says so; it is never marked Sample.
- Kept in this browser like the Tools links, with the same safe-link rule (http/https only).

Light links from the other views: each view's header area shows one quiet line, "AI agents for
Recruiting (4)", which opens this tab filtered to that area. It is a link, not a second catalog.

Sample catalog (about 20 agents):
- Recruiting: Job description writer, Interview kit builder, Candidate scorecard summary,
  Offer justification prep
- Onboarding: New hire guide (first-week questions), Start readiness checker
- People stats: Leader 1:1 prep, Reorg impact brief, Policy answers by country
- HR ops: HR help desk triage, Leave and benefits navigator, Employment verification
  drafter
- Talent: Review writing coach, Calibration brief, Career path explorer, Learning recommender
- Compensation: Pay range explainer, Merit guideline checker
- Compliance: Export control screening guide (process steps only, never nationality decisions)
- People ops: Process finder for the Hire-to-Retire Atlas

View-to-area mapping for those links: Recruiting → Recruiting; Onboarding → Onboarding; People
stats → People stats; Org chart → People stats; HR ops → HR ops and People ops; Talent → Talent;
Compensation → Compensation; Compliance → Compliance.
