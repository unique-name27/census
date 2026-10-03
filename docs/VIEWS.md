# Census — view specifications

Each view is a folder tab. This file says what each one must answer, which numbers it shows, how
they are defined, which findings it generates and which figures it draws. Builders may add a figure
when it clearly helps a reader, and may merge two when they say the same thing, but must not drop
the questions a view answers. Every figure sits in `<Figure>` (export menu and table view come with
it). Every finding follows the copy rules in ARCHITECTURE.md.

Period semantics used throughout: "in the window" = an event date inside `ctx.window` (inclusive);
"snapshot" = state at `ctx.asOf`; the comparison is `ctx.prior`.

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
(snapshot; note = share of actives; good = down).

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

---

## HR business partners (`hrbp`)

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

---

## Employee services (`services`)

Question: are employees getting fast, correct answers and are HR transactions processed on time?
Readers: People operations, payroll, benefits and HRIS leads. Ties every measure to the
Hire-to-Retire Atlas process that governs it (process IDs from `CASE_CATEGORIES` and
`TRANSACTION_PROCESS`).

Tabs: `overview` Overview · `cases` Cases · `transactions` HR transactions · `levels` Service levels.

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
jurisdiction (tableOnly + BarList), New hire readiness by site (BarList), Days early or late
(Histogram of completedDate − dueDate, band at ≤ 0), Retro adjustments by month (Columns).

Service levels: Service level scorecard (tableOnly, rowTone): one row per measurable Atlas KPI:
Process ID, process, measure, target, actual, status (Met / At risk within 5 pts / Missed), n,
window. At minimum: PY-05 payroll cases resolved within 2 business days (≥ 95%), DS-07
verifications within 2 business days (≥ 95%), LV-01 leave cases first response within 1 business
day (≥ 98%), ON-03 new hires entered by Day −3 (100%), OF-05 final pay on time (100%), DS-01 retro
transactions < 2% of changes, DS-04 access cases within 2 business days (≥ 98%), ER-02 median days
to close ≤ 30, BN-03 benefits cases within 5 business days (≥ 95%), MV-06 immigration cases first
response within 1 business day. Gap to target (HBars diverging around 0).

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
merit < 2%; rating ≤ 2 with merit > 3%), job family below market by ≥ 5%, department with no
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

Market: Base vs market median by job family (BarList diverging around 0%), by location, by level,
Jobs furthest below market (tableOnly).

Merit cycle: Merit spend vs budget by business unit (BarList with budget ref; amounts in the table
only when showPay), Merit distribution (Histogram), Guideline exceptions (tableOnly, rowTone),
Promotions in this cycle (stat + table), Total rewards mix by level (HBars normalize: base, target
bonus, equity; shares only).

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
