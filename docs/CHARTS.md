# New charts for every view

Proposed by three planners from the data Census actually has (see docs/DESIGN-REFRESH.md for the visual rules and docs/ROLES.md for access). Each chart sits in a Figure with exports, drills on every mark, and declares uses and metricId. Roles: D = Developer, H = HR, M = Manager (locked to their org).

## People stats (hrbp)

### Headcount by business unit over time (hrbp-headcount-by-org-trend)

- **Tab:** workforce
- **Question:** Which parts of the organization drove the change in headcount over the last two years, and when did it happen?
- **Form:** Columns, stacked, xType 'month', 24 month ends, series = business unit in fixed slot order with Other last (at most 8). Kit form exists. Composition over time is the one thing the Overview's single headcount line and the Workforce growth bars cannot show. Title follows the scope: 'by organization' with each direct report's org when a leader is focused, 'by department' inside one business unit.
- **Data:** employees (hireDate, terminationDate, employmentType, businessUnit, department, managerId). Extend computeWorkforce in src/views/hrbp/engine/workforce.ts with a byGroupSeries using headcountAt at monthPoints(asOf, 24) and the scorecard's one-level-down grouping (computeScorecard in scorecard.ts). Leavers are placed under their last manager, as the leader filter already does. Metric hrbp.headcount.employees (existing).
- **Drill:** Segment opens the employees active at that month end in that group (employeesOnSpec plus the group), with byGroup('businessUnit' | 'department', 'group') so the panel offers Filter to and Leave out; for a leader's direct-report orgs the filter is leaderId = that person. A column (whole month) opens everyone active that month end. Other opens without a filter.
- **Roles:** Developer, HR, Manager (own org: one bar segment per direct report's org)
- **Privacy:** Counts only, no rates, so no suppression is needed. Orgs under 5 still fold into Other to match the Sub-org scorecard. Contractors follow the countContractors setting, stated in the note.
- **Effort:** medium

### Attrition, rolling 12 months (hrbp-attrition-trailing)

- **Tab:** overview
- **Question:** Is attrition in this organization getting better or worse, and is it moving with the company or on its own?
- **Form:** Lines, 24 month ends, two series: Voluntary and Regretted (s1, s2), each the trailing 12-month annualized rate; when an org filter is on, the company's voluntary line is added de-emphasized via emphasize. Kit form exists. Smoother than the quarterly bars on the Attrition tab and gives the Overview a second trend next to headcount.
- **Data:** employees (terminationDate, terminationType, regrettable, hireDate, employmentType). New engine function in src/views/hrbp/engine/attrition.ts: for each monthPoints(asOf, 24) end, attrition(emps, trailing(end, 12), kind, { exitDataPresent }) for voluntary and regretted, plus ctx.all for the company line. New metric hrbp.attrition.trailing12 (definition: exits in the 12 months to each month end divided by the average headcount of those months); links to hrbp.attrition.voluntary and hrbp.attrition.regretted.
- **Drill:** A point opens the exits in that point's 12-month window of that kind (employees kind, period filter via periodFilter(start, end)); the company line opens the company's exits for the same window.
- **Roles:** Developer, HR, Manager (own org)
- **Privacy:** A point whose average headcount is under 5 is null and breaks the line with the anonymity note in the tooltip; small manager teams will see only the company line, which the note says.
- **Effort:** medium

### How long new hires stay (hrbp-cohort-retention)

- **Tab:** attrition
- **Question:** Of the people we hired each year, what share are still here 3, 6, 12 and 24 months later, and is the latest cohort leaving faster than earlier ones?
- **Form:** Lines with a numeric x (months since hire, 0 to 24), one series per hire year (the last three 12-month hire cohorts ending on the as-of date), y = share still employed, ref at 12 months. Needs a small kit addition: xType 'number' on Lines (numericAxis already exists in src/charts/kit/scale.ts). Fallback with today's kit: Columns grouped at 3/6/12/18/24 months, series = cohort.
- **Data:** employees (hireDate, terminationDate, employmentType). New engine function next to firstYearAttrition use in attrition.ts: survival per cohort, with each cohort's curve stopping at the months it has actually been observed (no extrapolation). New metric hrbp.attrition.cohortRetention, linked to hrbp.attrition.firstYear. Sample: the Go-to-Market 2024-25 cohort shows 27.0% gone by month 12 vs 8.3% elsewhere.
- **Drill:** A bar opens the cohort's hires counted at that checkpoint (employees kind), those who left by it first with a 'Left within' column, so a 100% bar opens its hires too; the cohort name in the legend or table opens the whole cohort. Period filter on hire dates via periodFilter.
- **Roles:** Developer, HR, Manager (own org, usually hidden for small teams)
- **Privacy:** A cohort under 5 hires is not drawn and is named in the note as hidden to protect anonymity. Share is a rate, so the minimum applies at every point.
- **Effort:** large

### New manager in the last 12 months (hrbp-manager-changes)

- **Tab:** movement
- **Question:** Where do people keep getting a new manager? Manager churn is a known flight-risk factor and a sign of unstable teams.
- **Form:** BarList of the share of today's employees with at least one manager change in the last 12 months, by the scorecard's one-level-down group, company ref line, lowest group count shown as secondary text. Kit form exists.
- **Data:** jobChanges (changeType 'Manager change', plus Transfer rows whose toManagerId differs from fromManagerId, effectiveDate, employeeId) joined to employees (active at asOf). New function in src/views/hrbp/engine/movement.ts. New metric hrbp.movement.managerChange. Leaves out the synthetic change recorded when a manager joined after their report (same effective date as the manager's hire), stated in the definition.
- **Drill:** A bar opens the people with a manager change in that group (employees kind) with byGroup on the group dimension; detail export lists their jobChanges rows. Other opens without a filter.
- **Roles:** Developer, HR (Movement is outside Manager mode's team basics)
- **Privacy:** Share over fewer than 5 employees is hidden. No reasons or names in the chart itself.
- **Effort:** medium

**Layout polish:** Workforce has no lead chart: put hrbp-headcount-by-org-trend full width (about 300 px tall) above 'Where people are'. Overview: keep the right column level with the readout by placing the rolling attrition chart beside 'Hires and exits by month' (span 6 each) instead of below it; when the headcount bridge shows, it moves under them as a short table. Movement: 'Time since last promotion' is a 240 px chart on a 794 px sheet (stretched by the transfers chart beside it); stack hrbp-manager-changes under it in the same column so both columns end together, and stop 'Promotions by quarter' (240 px chart in a 461 px sheet) stretching to match 'Promotion rate by level' by giving both the same chart height. Attrition: add the cohort curve to 'When and how people left' as a second row (span 7) with 'Exits by tenure at exit' moved up beside it (span 5), so how long people stay and when they leave read together; 'Who left' keeps level, last rating and the leavers table. In Manager mode, hide Movement and Org design tabs and the Regretted leavers table's reason column, and show exit reasons only when 5 or more leavers share the scope.

## Org chart (org)

### People at each layer (org-shape-layers)

- **Tab:** chart
- **Question:** What shape is this organization: how many people sit at each layer below the leader, and how many of them manage others?
- **Form:** HBars stacked, one row per layer (layer 1 = the chart root), series People managers / Individual contributors / Contractors and interns in fixed slots s1-s3, yOrder top layer first. Kit form exists. Reads as the org's silhouette under the chart and makes a deep or top-heavy org obvious at a glance.
- **Data:** employees (managerId, employmentType) through the OrgTree already built for the chart (tree.depth, tree.directs). peopleAtLayer(tree, rootId, layer) and layerIn in src/views/org/engine/figures.ts already exist; add a byLayer roll-up next to orgKeyFigures. Metric org.layers.count (existing) for the figure, with org.managers.count in the definitions.
- **Drill:** Segment opens the people at that layer and role (employees kind); a click elsewhere in the row opens everyone at that layer (the keyboard steps through the segments, which together are the layer). The records offer 'Show on chart', which opens the chart down to that layer (expanded.setLevels).
- **Roles:** Developer, HR, Manager (own org: the root is the manager)
- **Privacy:** Counts only. When the business unit, department, location or level filters are on, counts only matching people, the same rule as the key figures, and the note says so.
- **Effort:** small

### Teams under each direct report (org-team-sizes)

- **Tab:** chart
- **Question:** How big is each leader's organization under this person, and where are the open roles landing?
- **Form:** HBars stacked, one row per direct report of the chart root (largest org first), series Employees / Contractors and interns / Open roles (open roles only when Requisitions are loaded; in s3 with a legend, not dashed). Kit form exists.
- **Data:** OrgTree (tree.children(rootId), tree.total, subtreeOf) plus requisitions (status Open, hiringManagerId) via the model's reqs map that already powers the Open roles overlay; sum open reqs over each sub-org. Metric org.person.totalOrg (existing), with org.openRoles.count in the definitions.
- **Drill:** People segments open that sub-org's people of that worker type (employees kind) with Filter to leaderId = the direct report (the scorecard's rescope patch); the Open roles segment opens the requisitions (requisitions kind). The row label jumps to that person on the chart.
- **Roles:** Developer, HR, Manager (own org)
- **Privacy:** Counts only. Req titles in the drill are fine for managers (they are the hiring managers or above them).
- **Effort:** medium

### Span of each manager (org-span-by-layer)

- **Tab:** chart
- **Question:** Which managers have too many or too few direct reports, and at which layer of the org do they sit?
- **Form:** DotStrip, one dot per people manager, x = direct reports, rows = layer, tone warning for narrow (span 1) and wide (12 or more, from orgRules), median tick per row. Kit form exists. Unlike the span histogram on People stats it names who and where; extremes are labeled (sample: Wei-Lun Lee 14, Rohan Murthy 13, Nisha Iyer 12).
- **Data:** OrgTree (tree.directs, layerIn) and the flags map (computeFlags in src/views/org/engine/flags.ts) for tone. Metric org.person.directReports (existing), with org.flags.wideSpan and org.flags.narrowSpan in the definitions.
- **Drill:** A dot opens that manager's direct reports (employees kind) and offers 'Show on chart' (the chart's jump(id)). Built without a row drill: the table view lists every manager with their layer and is searchable. Medians show one decimal (3.5 reports, never rounded to 4).
- **Roles:** Developer, HR, Manager (own org)
- **Privacy:** Counts only; names are the managers already on the chart.
- **Effort:** small

### Tenure mix by team (org-tenure-mix)

- **Tab:** chart
- **Question:** Which teams under this leader are mostly new people, and which are long-tenured?
- **Form:** HBars stack 'normalize', one row per direct report's org, series = TENURE_BANDS with scheme 'ordinal' (blue ramp, short to long). Kit form exists. Pairs with the new-hire concentration finding on People stats.
- **Data:** OrgTree subtreeOf per direct report, employees.hireDate with tenureYears / tenureBand from src/lib/people.ts at ctx.asOf. New metric org.team.tenureMix (org.team.avgTenure already exists for the detail panel).
- **Drill:** Segment opens the people in that team and tenure band (employees kind) with Filter to leaderId = the direct report; a row opens the whole team.
- **Roles:** Developer, HR, Manager (own org)
- **Privacy:** Shares are rates: teams under 5 people fold into 'Other (k)' and are not drawn on their own; the note says how many.
- **Effort:** small

**Layout polish:** The Chart tab is a KPI strip, a 920 px chart and a 643 px flags table. Add a 'Team shape' section between the chart and the flags table with two rows: People at each layer (span 7) beside Span of each manager (span 5), then Teams under each direct report (span 7) beside Tenure mix by team (span 5). All four follow the chart root (focus person, leader filter, or the manager in Manager mode) and recompute when the root changes, with the root's name in the section dek ('Under Priya Raman'). On phones they stack below the 60vh canvas. In the Reorg sandbox, replace the small 'People per layer' table in the scenario panel with the same layer chart drawn as Today vs Scenario (HBars grouped), so the sandbox and the chart read alike.

## Talent (talent)

### Succession exposure (talent-succession-exposure)

- **Tab:** succession
- **Question:** Which critical and key roles would we struggle to fill if the person in them left: how likely is the incumbent to leave, and how ready is their best successor?
- **Form:** Heatmap, rows = best successor readiness (Ready now, 1-2 years, 3+ years, No successor), columns = incumbent risk of loss (High, Medium, Low, Not rated), value = roles, sequential scheme, showValues. Kit form exists. The High risk / No successor cell is the story (sample: exactly 4 roles, SP-001 to SP-004).
- **Data:** succession (incumbentRiskOfLoss, readiness, successorId, criticality) through SuccessionResult.roles in src/views/talent/engine/succession.ts (riskOfLoss, coverage, status already computed); roll the roles into cells. A Segmented control switches Critical only / Critical and key. New metric talent.succession.exposure, with talent.succession.bestReadiness and talent.finding.successionExposed in the definitions.
- **Drill:** A cell opens its roles (succession kind: role, incumbent, successors, readiness) with byGroup on business unit where a single unit is in scope; selecting a cell also filters the Critical and key roles table below to that cell.
- **Roles:** Developer, HR, Manager (roles whose incumbent is in their org)
- **Privacy:** Counts of roles only. In Manager mode the drill names successors inside the manager's org only; a successor elsewhere reads 'Named successor outside your org'.
- **Effort:** small

### Share rated 4-5 by manager (talent-rating-by-manager)

- **Tab:** performance
- **Question:** Which managers rate their teams well above or below the 35% guideline, so calibration can start with them?
- **Form:** DotStrip, one dot per reviewer with 5 or more people rated in the latest cycle, x = share rated 4-5, rows = business unit, ref at the guideline (35%), median tick per row, the most extreme few labeled. Kit form exists. Sample: Go-to-Market's row sits right of the guideline (44.8% vs 33.9% elsewhere).
- **Data:** reviews (reviewerId, rating, cycle, cycleDate) for latestCycle, with reviewer names from employees. New function in src/views/talent/engine/performance.ts reusing the rated records. Metric talent.performance.highPerformers (existing) with a new talent.performance.byReviewer for the per-manager cut. Empty state 'No reviewer IDs in Reviews' when reviewerId is absent.
- **Drill:** A dot opens that reviewer's reviews for the cycle (reviews kind); a row opens the business unit's reviews with byGroup('businessUnit').
- **Roles:** Developer, HR (hidden in Manager mode: it compares managers with each other)
- **Privacy:** Reviewers with fewer than 5 rated people are left out and counted in the note. No individual ratings on the chart.
- **Effort:** medium

### Rating change since the last annual cycle (talent-rating-change)

- **Tab:** performance
- **Question:** How sticky are ratings: how many high performers stayed high, and how many dropped or rose since last year?
- **Form:** Heatmap 5 by 5, rows = rating in the prior annual cycle, columns = rating in the latest annual cycle, shaded by each cell's share of its prior-rating row (so movement shows, not the biggest group), cells print the people count, sequential scheme, the share and count in the tooltip. Kit form exists. A drop in rating is one of the flight-risk factors, so this shows how many people that factor touches.
- **Data:** reviews (employeeId, cycle, cycleDate, rating) for people rated in both annual cycles, using buildReviewIndex / reviewAt from src/lib/people.ts. New function in performance.ts. New metric talent.performance.ratingChange.
- **Drill:** A cell opens the reviews of those people in both cycles (reviews kind), with byGroup on business unit when the scope holds one; the diagonal (no change) opens like any other cell.
- **Roles:** Developer, HR, Manager (own team)
- **Privacy:** Counts per cell are allowed; row shares are hidden when the prior-rating row has fewer than 5 people. Managers only ever see their own team's rows.
- **Effort:** medium

### Required training completed over time (talent-required-progress)

- **Tab:** learning
- **Question:** For required training due this period, how fast are people completing it, and which course will miss the 95% target by its due date?
- **Form:** Lines, weekly from the earliest assignment to the as-of date, y = share of required assignments completed, one series per course (at most 8, rest as Other), y ref at the 95% target. Needs a small kit addition: a vertical x reference on Lines (xRef) to mark each course's due date. Sample: Export control and trade compliance flattens near 85% while the other campaign courses reach about 97%.
- **Data:** learning (required, assignedDate, dueDate, completedDate, course) for assignments due in the window. New function in src/views/talent/engine/learning.ts. New metric talent.learning.completionCurve, with talent.learning.requiredOnTime in the definitions.
- **Drill:** A point opens that course's assignments with their completion status as of that week, still open first (learning kind); with one location or department in scope it carries byGroup for that dimension.
- **Roles:** Developer, HR, Manager (own team)
- **Privacy:** A course with fewer than 5 assignments in the scope is not drawn and is named in the note. Shares only, no names on the chart.
- **Effort:** medium

**Layout polish:** Overview: the readout is 1,376 px tall but the 9-box beside it is 560 px, leaving about 800 px of empty column. Stack 'Rating distribution vs guideline' and 'Succession coverage by business unit' under the 9-box in the right column (the Compensation Overview already does this), then 'Key talent at risk' full width. Succession opens on an 822 px table with no chart and no key figures: lead with Succession exposure (span 7) beside a small KPI strip (critical roles covered, roles with no successor, departed successors), then the roles table, which the heatmap filters. Learning has no KPI strip: add one (required on time, overdue now, hours per employee) and lead with the completion curve full width; 'Overdue assignments' (784 px) beside 'Learning hours per employee' (301 px) leaves about 480 px empty, so cap the table at 10 rows or put the hours chart above a short 'Overdue by manager' list. Performance: put 'Share rated 4-5 by manager' full width in the Calibration section (rows per business unit), and 'Rating change since the last annual cycle' beside 'Exit rate within 12 months by rating'. In Manager mode hide Retention risk and the reviewer chart.

## Compensation (comp)

### Pay position and voluntary attrition by location (comp-pay-attrition)

- **Tab:** overview
- **Question:** Do the places where we pay lowest in the range also lose the most people?
- **Form:** Scatter, one dot per location (Segmented toggle: location / department), x = median compa-ratio, y = voluntary attrition over the last 12 months, r = employees, refX at the company median compa-ratio, refY at company voluntary attrition, the extreme few labeled. Kit form exists. Never a dual axis: both measures sit on their own axis of one plot. Sample: Bengaluru alone sits low and high (0.88, 18.8% vs 0.98, 9.4%).
- **Data:** comp (baseSalary, rangeMid) via o.byLocation / byDepartment medians in src/views/comp/engine/model.ts, plus attrition(emps, ctx.window, 'voluntary', { exitDataPresent }) from src/lib/people.ts per group (the comp low-compa finding already links them). Figure metric comp.compa.median, with hrbp.attrition.voluntary in the definitions.
- **Drill:** A dot opens the group's people with their compa-ratio (comp kind) with byGroup('location' | 'department', 'group'); detail export adds the group's voluntary leavers (employees kind).
- **Roles:** Developer, HR (Compensation is not in Manager mode)
- **Privacy:** Ratios only, unaffected by Show pay amounts. A group under 5 employees is left out (both the median and the rate would be hidden) and counted in the note.
- **Effort:** medium

### Median compa-ratio by location and level (comp-compa-location-level)

- **Tab:** overview
- **Question:** Is low pay position a whole-site problem or concentrated at certain levels?
- **Form:** Heatmap, rows = location, columns = level groups (L1-L2, L3-L4, L5-L6, M1, M2, E, the org chart's LEVEL_GROUPS so cells stay large enough), value = median compa-ratio, scheme 'diverging' with mid 1.00 and domain 0.85-1.15, showValues. Kit form exists.
- **Data:** comp via CompPerson (compa, location, level) in src/views/comp/engine/population.ts, grouped with the existing median helpers in groups.ts. Metric comp.compa.median (existing).
- **Drill:** A cell opens its people (comp kind) with byGroup('location') merged with the level filter via withFilter, labeled 'Bengaluru, L3-L4'.
- **Roles:** Developer, HR
- **Privacy:** Cells under 5 people render '—' with 'Hidden to protect anonymity (n < 5)' as the locked note; no amounts.
- **Effort:** small

### Is it pay or the range? Job functions against the market (comp-market-vs-range)

- **Tab:** market
- **Question:** When a job function is paid below market, is it because people sit low in their range, or because the range itself trails the market?
- **Form:** Scatter, one dot per job function (department where the roster has none) with 5 or more people, x = market median ÷ range midpoint, y = median compa-ratio, r = people, refX and refY at 1.00, extremes labeled clear of the other dots and the rules (the refX label moves inside the plot when it would meet the y axis title). Kit form exists. Right of 1.00 means the range trails the market; below 1.00 means pay sits low in the range. Sample: Analog & Mixed-Signal sits at about 1.10 across and 1.00 up, so the fix is the range, not the people.
- **Data:** comp (marketP50, rangeMid, baseSalary) via MarketRow in src/views/comp/engine/market.ts (marketVsMid and members already computed; add the members' median compa-ratio). Metric comp.market.vsMidpoint (existing, today only a table column), with comp.market.gap in the definitions.
- **Drill:** A dot opens the function's people with compa-ratio and market ratio (comp kind); job function is not a filter dimension, so no Filter to.
- **Roles:** Developer, HR
- **Privacy:** Functions under 5 people are left out and counted in the note; market medians are ratios here, so the Show pay amounts switch does not apply. Note states that 40% of the sample has no market median.
- **Effort:** small

### Below range minimum by location and cause (comp-below-min-cause)

- **Tab:** ranges
- **Question:** Why are people below the range minimum: recently promoted into a higher range, recently hired, or paid low for a longer time?
- **Form:** HBars stacked, one row per location with anyone below minimum (largest first), series Promoted in the last 12 months / Hired in the last 12 months / Neither, fixed slots s1-s3. Kit form exists. Sample: 41 in Bengaluru are 'Neither', while 35 of the 37 elsewhere were promoted in the last 12 months, which are two different fixes.
- **Data:** comp via CompPerson (position 'Below minimum', promotedRecently, hiredRecently, location) in src/views/comp/engine/population.ts; jobChanges feed promotedRecently. Metric comp.position.belowMin (existing).
- **Drill:** A segment opens those people (comp kind, the Below range minimum table's columns) with byGroup('location', 'location'); a row opens everyone below minimum at that site.
- **Roles:** Developer, HR
- **Privacy:** Counts and ratios only; gap amounts stay in the table behind Show pay amounts.
- **Effort:** small

**Layout polish:** Overview: the right column already balances the readout. Add a 'Pay and retention' row under it with Pay position and voluntary attrition (span 7) beside the location and level heatmap (span 5 at 1440, full width under 1280 because 13 rows by 6 columns needs the width). Ranges has no lead chart and two 570 px full-width tables: put the below-minimum cause chart at the top of 'Outside the range' (span 12, short) and let the two tables sit side by side from 1280 px with 8 rows each. Performance: the merit matrix is a 174 px heatmap on a 707 px sheet because 'Differentiation by department' beside it is 598 px; raise the matrix rowHeight to about 40 px and self-start its sheet, or move 'Bonus payout by rating' under it in the same column. Market: lead with the pay-or-range scatter (span 7) beside 'Gap to market by level' (span 5); move job family and location gaps below. Merit cycle: 'Promotions in this cycle' (766 px table) beside 'Total rewards mix by level' (330 px) leaves a gap; cap the table at 10 rows or stack 'Merit distribution' under the mix chart. Every new chart is ratios only: say so in its definition so readers know the Show pay amounts switch does not change it.

## HR ops (services, incl. Leave & return)

### Open cases at each month end (services-cases-open-trend)

- **Tab:** Cases (new lead, span 12 above Service levels by category)
- **Question:** Is the case backlog growing, and how much of it is older than two weeks?
- **Form:** Lines (kit), 24 month ends, two count series on one axis: Open (s1, area) and Open longer than 14 days (s2), endpoint labels. Today the view has only a snapshot of the backlog by age, no trend.
- **Data:** cases.openedAt, resolvedAt, status via CaseFact. Extend services/engine/cases.ts with backlogByMonth(facts, monthEnds, agedDays), reusing openAt from engine/kpis.ts and monthPoints from lib/people. Metric: existing services.cases.backlog (the aged line reads services.cases.aged and its agedDays setting).
- **Drill:** A point opens the cases open at that month end through openDrill; the aged series opens only the cases past the threshold. Employee relations rows keep caseDrill's existing person-free handling, and the drill is gated by drillWhen/lockedReason. No Filter to (a month end is not a group of a filter dimension). Table cells drill the same way.
- **Roles:** HR and Developer. Not Manager (HR ops cases are excluded).
- **Privacy:** Counts only. Drills are locked when fewer than 5 people are behind them in a narrow scope. Employee relations cases are counted but never tied to a requester.
- **Effort:** small

### On time by transaction type and quarter (services-tx-on-time-heatmap)

- **Tab:** HR transactions (new lead; the tab has none today)
- **Question:** Which kinds of HR transactions slipped, and in which quarter (new hires before a start wave, terminations at year end, changes at payroll cut-off)?
- **Form:** Heatmap (kit): rows are the 8 TRANSACTION_TYPES in schema order, columns the last 8 quarters, value the share on time. scheme 'diverging' with mid = the onTimeTarget setting (98%), showValues, n = transactions due. Quarters rather than months so small types (location change, about 9 a quarter) clear the minimum.
- **Data:** transactions.type, dueDate, completedDate via TxFact and onTimeRate. New onTimeByTypeQuarter in services/engine/transactions.ts. Metric: existing services.tx.onTime.
- **Drill:** A cell opens onTimeDrill(records), e.g. 'New hire transactions due in 2026 Q3', with periodFilter(quarter start, end) so the panel offers Filter to that quarter. A row label opens every transaction of that type in the window. Leave start and Return rows use the transactions drill, which already leaves out leaveReason.
- **Roles:** HR and Developer.
- **Privacy:** Cells under 5 transactions or 5 people are blank, with 'Hidden to protect anonymity (n < 5)'. No leave reason anywhere.
- **Effort:** small

### People on leave at each month end (services-leave-on-leave-trend)

- **Tab:** Leave & return (new span 8 lead)
- **Question:** Is the number of people on leave rising, and is there a season to it, so people operations can plan returns and cover?
- **Form:** Lines (kit) with area, one series over 24 month ends, endpoint label. Counts people (a person with overlapping leaves once), as the On leave now tile does. The line starts once the leave history covers a whole leave (its first start plus the length nine in ten finished leaves stay within), and the note says where the history starts.
- **Data:** Leave start and Return from leave transactions (effectiveDate, employeeId) paired by leaveFacts, plus employees.terminationDate. Uses onLeaveSeries(facts, monthEnds, min) in engine/leave.ts. Metric: existing services.leave.onLeave.
- **Drill:** A point opens the people on leave at that month end, one row per person (leaveDrill, transactions kind, never the reason). No Filter to.
- **Roles:** HR and Developer. The tab stays HR only and out of whole-view leader exports.
- **Privacy:** Month ends with fewer than 5 people on leave are null, which onLeaveSeries already returns. No leave reason on the chart or in the drill.
- **Effort:** small

### Service levels by quarter (services-levels-by-quarter)

- **Tab:** Service levels (new lead above the scorecard table)
- **Question:** Which Atlas service levels have been missed several quarters running, and which slipped only recently?
- **Form:** Heatmap (kit): rows are the 14 Atlas measures (misses first, like the scorecard), columns the last 6 quarters. Each cell shows Met, At risk or Missed with the actual printed in it. Needs a small Heatmap extension: a tone accessor that fills cells with status tokens plus the status glyph. The measures mix shares and days (ER-02), so a single numeric ramp would mislead.
- **Data:** cases and transactions through the existing scorecard(LevelInputs) in engine/levels.ts, run once per quarter window (new scorecardByQuarter). Metric: existing services.levels.status, with each row linking its services.levels.<id>. uses come from levelUses per row.
- **Drill:** A cell opens levelDrill(row, 'actual') for that quarter, with periodFilter for the quarter. The row label opens the measure's definition and Atlas process.
- **Roles:** HR and Developer.
- **Privacy:** n stays hidden under 5 people (the existing LevelRow rule). ER-02 shows median days only and never lists a person.
- **Effort:** medium

**Layout polish:** - **Overview KPI strip:** the 7 tiles wrap at roughly 800 to 1100 px, leaving 'Transactions on time' alone on a second row. Use a 4 + 3 grid, or move that tile to HR transactions.
- **Overview readout:** it lists 10 findings beside the lead and runs far below it. Cap it at 5 with 'Show all 10'.
- **Cases opened by month:** the gray Other segment is the largest part of every bar, so the July 2026 payroll spike is lost. Name the top 7 categories plus Other, or emphasize Payroll and set the rest to deemph.
- **HR transactions, New hires section:** it is a full Section with an empty body. Make it a one-line link under the Timeliness dek.
- **Leave & return lead:** 'On leave now by reason' has 3 bars (Parental 6, Medical 6, Other 8), which is thin for span 8. Put the new trend at span 8 and the by-reason figure at span 4, with the readout and survey column under it.
- **Service levels:** lead with the quarter heatmap. Keep the scorecard table as the reference below, then Gap to target (7) and First response (5).
- **Phones:** the 5 sub-tabs scroll sideways; scroll the active tab into view on load.

## Compliance

### Reverification runway (compliance-reverification-runway)

- **Tab:** Right to work (new lead; the tab opens on a table today)
- **Question:** Who is inside 90 days of an expiry without reverification started, and how close is each person to the line?
- **Form:** DotStrip (kit): one dot per person, x = days to expiry (expired people below 0, out to 180 d), rows in STATUS_ORDER (Expired, Not started, Started late, On time, Not due yet), ref at the 90 d lead time ('start reverification by'). Tone: critical for not started or expired, warning for started late, good for on time, deemph for not due yet.
- **Data:** rightToWork.expiryDate and reverificationStartedDate, employees.hireDate and terminationDate. Reads WorkModel.expiringHorizon plus expired (ExpiryRow already carries daysToExpiry and status), so no engine change is needed. Metric: existing compliance.work.reverificationOverdue, with compliance.work.reverificationOnTime in the definitions.
- **Drill:** A dot opens that person's expiry record (expiryDrill with one row, then the person card). A row label opens everyone in that status. No Filter to.
- **Roles:** HR and Developer. Not Manager (Compliance is excluded).
- **Privacy:** Expiry date and reverification status per person are allowed by the view's rules. Authorization type shows in the tooltip only while 'Show immigration details' is on. No nationality.
- **Effort:** small

### Business days from start to I-9 Section 2 (compliance-i9-business-days)

- **Tab:** Right to work
- **Question:** When Section 2 is late, how late is it, and are on-time ones landing on day 3 with no margin?
- **Form:** Histogram (kit): integer bins from 0 to 10+ business days, band [0, 3] labelled 'within 3 business days', ref at 3. Starts still past due with Section 2 not done are stated in the note.
- **Data:** rightToWork.i9Section2Date, employees.hireDate and location (US sites). Reads I9Row.businessDays from computeI9, which already exists. Metric: existing compliance.i9.section2OnTime.
- **Drill:** A bin opens the US starts in it, using the same I-9 rows drill as 'I-9 Section 2 on time by site'. No Filter to.
- **Roles:** HR and Developer.
- **Privacy:** I-9 dates per person already appear in the existing I-9 drill. Bins are hidden when the scope has fewer than 5 US starts.
- **Effort:** small

### People in licensed roles by site and status (compliance-licenses-by-site)

- **Tab:** Export control (new lead)
- **Question:** Where do roles that need an export license sit, and is anyone at a site working or starting without one in force?
- **Form:** HBars stacked (kit): y = location, series = Approved, Pending, Expired, Denied. License status is a state, so the series use the status tokens (good, warning, critical) with legend words. Pre-hires are marked 'starting' in the tooltip.
- **Data:** rightToWork.exportLicenseRequired, exportLicenseStatus and exportLicenseExpiry, employees.location and hireDate. Reads ExportModel.required (LicenseRow has status, inForce and upcoming), grouped by location. Metric: existing compliance.export.licenseStatus.
- **Drill:** A segment opens the people with that status at that site, the same rows as 'Working without a license in force', through byGroup('location'). A bar opens every licensed role at the site, with Filter to that location.
- **Roles:** HR and Developer.
- **Privacy:** No nationality or authorization type. Names appear only in the drill, as in the existing tables.
- **Effort:** small

### Statutory calendar by jurisdiction and month (compliance-deadlines-by-month)

- **Tab:** Deadlines (new lead; the tab is all tables today)
- **Question:** Which months are heavy with filings, payments and notices, and in which jurisdictions, so payroll and people operations can plan the year?
- **Form:** Heatmap (kit), sequential: rows are the jurisdictions where people in scope work (Atlas order), columns the next 12 months, value the calendar entries falling in that month. 'Every month' entries count in each month. The tooltip lists the obligations and the employees covered.
- **Data:** reference/calendar.ts and employees.location, through computeDeadlines and nextOccurrence extended to a 12-month horizon (new calendarByMonth in engine/deadlines.ts). Metric: compliance.deadlines.upcoming with a new calendar-months setting (12), or a new compliance.deadlines.calendar.
- **Drill:** A cell opens that jurisdiction and month's calendar entries through a new non-people drill kind, 'deadlines', with the Statutory calendar columns. A row label opens the employees covered, with Filter to the jurisdiction's sites via byGroup('location', sites) and a label such as 'Filter to California'.
- **Roles:** HR and Developer.
- **Privacy:** No personal data in the cells. Carries the 'confirm dates and obligations with employment counsel' note.
- **Effort:** medium

**Layout polish:** - **Overview lead:** it stacks 2 to 6 people a month across five business units, so most segments are one person and the colors say little. Color by reverification status instead (status tokens with words) and keep business unit in the tooltip and table.
- **Authorization mix:** Permanent (no expiry) is 91.5% of active people and flattens every time-limited bar. Chart only the time-limited categories and state the permanent share in the subtitle.
- **Statutory calendar table:** clamp 'What it involves' to two lines with an expand control, and pin the When column on phones.
- **Export control:** three figures for about 22 people. Put the two tables side by side at span 6 under the new lead.
- **Header on phones:** the 'Show immigration details' and 'Show data quality' switches wrap under the title. Group them into one Display menu below 768 px.

## Listening

### Response rate by program (listening-response-rate-by-program)

- **Tab:** Overview (new chart lead, span 8 beside the readout)
- **Question:** Are we hearing from enough people in each survey to trust its results?
- **Form:** BarList (kit): one bar per program, ref at the response-rate target (default 60%), glyphTone from status, bars named for the program (Candidate experience, Exit survey, Return to work), short names and whole percents on phones, secondary text such as '282 of 1,014 invited'. Programs whose invited population is unknown show '—' with 'Invited population not known'. Today the lead slot holds a table.
- **Data:** surveyResponses plus the invited populations (candidates, requisitions, employees, cases, transactions), through the existing rateOf and invitedOf in listening/engine/measures.ts that already feed the programs table. Metric: existing listening.programs.responseRate.
- **Drill:** A bar opens the invited people, one row per person, so the list is the invited count (invitedDrill): candidates by application, everyone else as employees, with how many filled reqs, resolved cases or returns sent them the survey. Never who answered. A hidden rate opens nothing, as today.
- **Roles:** HR and Developer. Not Manager (surveys are excluded).
- **Privacy:** The rate is hidden when invited or responded is under the minimum. Engagement shows only while the engagement switch is on.
- **Effort:** small

### Driver scores by wave (listening-<survey key>-trend)

- **Tab:** Every area tab (inside SurveyBlock, per survey)
- **Question:** Is each driver getting better or worse over the last four waves, not just since the last one?
- **Form:** Lines (kit): x = the waves at equal steps, labeled with the wave names (2025 Q4, 2026 H1), y zoomed to the scores and the target in half points, series = drivers (at most 8, the rest folded), emphasize the driver with the largest change, ref at the target when the drivers share one. Scale is 1 to 5; NPS surveys plot NPS.
- **Data:** surveyResponses.wave, responseDate, score and driver, and surveyItems.driver and target, using byWave and byDriver from @/lib/surveys. New driverTrend(sm, waves = 4) in listening/engine/measures.ts. Metric: new listening.drivers.trend (setting: waves shown, 4).
- **Drill:** A point opens the surveyGroups rows for that driver and wave (groupsDrill over itemRowsOf), never answers.
- **Roles:** HR and Developer.
- **Privacy:** A wave and driver point under 5 distinct respondents is a gap, labelled 'Hidden to protect anonymity'. No manager cuts here. Engagement shows only while the switch is on.
- **Effort:** medium

### How people answered (listening-<survey key>-answers)

- **Tab:** Every area tab (inside SurveyBlock, per survey)
- **Question:** Is a middling mean a split room or a lukewarm one: by driver, how many agree and how many disagree?
- **Form:** New kit form, LikertBars: a diverging stacked bar centred on the neutral answer. On 1 to 5 items, answers 1 and 2 extend left, 3 sits in gray at the centre and 4 and 5 extend right. On 0 to 10 items the parts are detractors, passives and promoters. Uses the --div tokens with the gray midpoint and 2 px gaps. It is needed because HBars with stack 'normalize' cannot centre on neutral, and the dataviz rules name this form for ordered-scale shares.
- **Data:** surveyResponses.score, scale and driver for the latest wave, using isTopBox and isBottomBox with byDriver from @/lib/surveys. Metric: new listening.drivers.distribution.
- **Drill:** A segment opens the surveyGroups row for that driver, with counts per answer band. No person and no respondent key.
- **Roles:** HR and Developer.
- **Privacy:** Each driver needs 5 distinct respondents in the wave; otherwise the row reads 'Hidden to protect anonymity'. Shares only.
- **Effort:** large

### Why people left: exit survey and HR record (listening-exit-reasons-vs-record)

- **Tab:** Stay & exit
- **Question:** Do leavers tell the exit survey the same reason HR records, or is pay or the manager under-recorded somewhere? (In the sample, Bengaluru answers 'Base salary' in the survey while the HR record says career growth.)
- **Form:** HBars grouped (kit): y = the 12 VOLUNTARY_REASONS, x = share of leavers, series in a fixed order: Exit survey (s1), then HR record (s2). Location and other cuts come from the global filter row.
- **Data:** surveyResponses.reason for the Exit survey, counted once per respondent (reasonsOf in listening/engine/cuts.ts), and employees.terminationReason, terminationType and terminationDate for voluntary exits in the window (exitsIn from lib/people). New exitReasonsVsRecord in cuts.ts. Metric: new listening.exit.reasonsVsRecord, defined beside listening.exit.reasons.
- **Drill:** A survey bar opens surveyGroups for that reason. An HR record bar opens the voluntary leavers with that reason (the employees drill, the same list People stats > Attrition already shows). No Filter to: reason is not a filter dimension.
- **Roles:** HR and Developer.
- **Privacy:** Two independent grouped distributions with no per-person join: respondent keys only join org attributes. A side with fewer than 5 respondents or leavers is hidden. Survey reasons fewer than 5 gave fold into one 'Other reasons, fewer than 5 each' row (with the next smallest reasons while that row is itself under 5), and an HR-record bar for a reason the survey shows under 5 is counted, never listed, so no named leaver sits beside a survey count of 1.
- **Effort:** medium

**Layout polish:** - **Overview layout:** put the response-rate chart in the lead slot and move the Survey programs table to full width under it.
- **Survey programs table:** replace the plain 'Missed / Watch / Met' words with StatusPill, and explain each '—' response rate in its tooltip.
- **Area tabs:** they repeat SurveyBlock 2 or 3 times. Add an in-page index of survey names under the tab strip. Lay each block out as: Score by driver (6) beside How people answered (6), then Driver scores by wave (8) beside Change since the last wave (4), then the heat table (12).
- **Shared 1 to 5 axis:** fix the domain at 1 to 5 on every BarList so bars compare across figures.
- **Engagement switch off:** show the note as a quiet line on a sheet rather than a loose paragraph.

## AI in HR

### Agents by HR area and audience (ai-agent-coverage)

- **Tab:** Agents
- **Question:** Who has an agent in each HR area, and where are the gaps (no agent for employees in Compensation, none for managers in Compliance)?
- **Form:** Heatmap (kit), sequential: rows are the 8 AGENT_AREAS, columns HR team, Managers and Employees, value = agents. Zero cells stay empty with 'No agent' in the tooltip.
- **Data:** The catalog in useAiAgents (area, audience[]). New pure coverage(agents) in ai/catalog/summary.ts. Metric: new ai.catalog.coverage. Not a people number, so uses = [] and gate = false.
- **Drill:** A cell sets the list filters (area and audience) and scrolls to the agent cards, the same mechanism as today's area counts. The detail export lists the agents behind each cell.
- **Roles:** HR and Developer. Not Manager (AI in HR is excluded).
- **Privacy:** No personal data.
- **Effort:** small

### What agents draw on (ai-agent-sources)

- **Tab:** Agents
- **Question:** Which systems and documents do the most agents read, so access approvals and content owners are reviewed first?
- **Form:** BarList (kit): data sources two or more agents share, matched ignoring case, spacing and a plural last word, top 8 plus Other, secondary text = the HR areas that use each source. Sources one agent uses are counted in the note and listed in All data sources.
- **Data:** Catalog dataSources. New sourceCounts(agents). Metric: new ai.catalog.sources (uses [], gate false).
- **Drill:** A bar narrows the list to agents that draw on that source (a new Source facet, or the search box set to it). Other opens the folded sources.
- **Roles:** HR and Developer.
- **Privacy:** No personal data.
- **Effort:** small

### Agents by owner team and status (ai-agents-by-owner)

- **Tab:** Agents
- **Question:** Which teams own agents, and how far along each one is (sample, pilot, live)?
- **Form:** HBars stacked (kit): y = owner team, series = Sample, Pilot, Live with the ordinal ramp, because the series are lifecycle stages, not good or bad states. While the whole catalog is the sample, it shows counts with the note 'Every agent is a sample'.
- **Data:** Catalog ownerTeam and status. Metric: new ai.catalog.status (uses [], gate false).
- **Drill:** A segment filters the list by owner team (a new facet) and status.
- **Roles:** HR and Developer.
- **Privacy:** No personal data.
- **Effort:** small

**Layout polish:** - **Second row:** keep the use note (4) beside Agents by area (8). Add a second row with the coverage heatmap (7) and data sources (5); the owner chart goes under the filters.
- **Sample badges:** every card repeats 'Sample'. When the whole catalog is the sample, say it once in the header and drop the per-card badge.
- **Card height:** cards are tall. Show 2 bullets of 'Use it for' and 'Don't use it for', with 'More' for the rest.
- **No filter row or scope line:** keep it that way. The new figures carry no tier badge.

## Data room

### Records by month (data-coverage-by-month)

- **Tab:** Datasets (new lead above the manifest)
- **Question:** Does each dataset cover the months the views report on, and where are the gaps, such as an extract cut short or a stale load?
- **Form:** Heatmap (kit), sequential: rows are the datasets in DATASET_KEYS order, columns the last 24 months, value = rows dated in that month by the dataset's own event date (employees: hires and exits; jobChanges: effectiveDate; requisitions: openedDate; candidates: appliedDate; cases: openedAt; transactions: submittedDate; learning: assignedDate; onboardingTasks: dueDate; surveyResponses: responseDate). Datasets with no date, such as Comp, Right to work, Succession and Survey items, get one muted row each reading 'Snapshot, no dates'.
- **Data:** Every dataset, through date accessors like PERIOD_RULES in quality-overview/engine/leftOut.ts. New rowsByMonth. Metric: new data.coverage.byMonth (MetricView 'data'), gate false.
- **Drill:** A cell opens that dataset's rows dated in the month (rowsSpec or allRowsSpec). Survey responses cells open grouped waves (surveyGroups), never single answers.
- **Roles:** HR and Developer. Not Manager.
- **Privacy:** Raw rows follow the Data room rules: pay columns only with showPay, authorization type only with immigration details on, survey answers never individually.
- **Effort:** medium

### Metrics by view and tier (data-quality-metrics-by-view)

- **Tab:** Data quality (new lead above 'Datasets by tier')
- **Question:** How much of each practice's dashboard can I trust today, and where does bronze data hold numbers back? (In the sample, 209 of 296 metrics are below gold.)
- **Form:** HBars stacked (kit): y = views in folder-tab order, series = Gold, Silver, Bronze, No data in tier order, colored with the --tier-* tokens and paired with the legend words. The same data exists today only as the table-only 'Metrics by tier'.
- **Data:** impact.metrics (MetricTierRow view and tier) from metricImpact in quality-overview/engine/impact.ts, already computed. Metric: new data.quality.metricTiers, gate false.
- **Drill:** A segment narrows the 'Metrics by tier' table to that view and tier; its rows open Metric definitions as today. A bar label narrows to the view.
- **Roles:** HR and Developer.
- **Privacy:** No personal data.
- **Effort:** small

### Values not in their list, by field (data-map-unlisted-by-field)

- **Tab:** Categories & mapping
- **Question:** Which fields have the most rows the views can't place, so I fix those mappings first?
- **Form:** BarList (kit): field labels, value = rows, secondary text = distinct values, top 8 plus Other.
- **Data:** unlistedValues(model.report.categories) from mapping/engine/lists.ts, which already feeds the UnlistedPanel list. Metric: new data.mapping.unlisted, gate false.
- **Drill:** A bar opens the rows behind that field's unlisted values (rowsSpec with matchRows) and scrolls the panel to its values, ready to merge.
- **Roles:** HR and Developer.
- **Privacy:** Rows drill the way the existing panel does; pay columns are dropped unless showPay.
- **Effort:** small

**Layout polish:** - **Datasets tab:** the 'Replace the sample with your exports' drop zone takes the first screen even when data is loaded. Collapse it to a compact 'Add files' bar after the first load, so the coverage heatmap and the manifest lead.
- **Data quality tab:** it opens on the dense 'Datasets by tier' table. Lead with the one-line summary and the metrics-by-view chart, then the table.
- **Trend figure:** it is a table until a dataset has earlier versions. Show an empty note ('No earlier versions yet') rather than a table of one row per dataset.
- **Developer mode:** this is the natural home for the developer tools: figure ids, metric ids and uses on each Figure, and raw-grid access.

## Scorecard

### Gap to target (scorecard-gap-to-target)

- **Tab:** overview
- **Question:** Which of our measures are furthest from target, and by how much, so the monthly people review starts with the biggest misses?
- **Form:** BarList, existing kit, used the way HR ops services-gap-to-target already uses it. Signed points, sorted lowest first, glyphTone for Met, Watch or Missed with icon and word, a reference rule at 0 labelled Target. Row label is 'Final pay on time · HR ops', secondary is '85.6% vs at least 100%'. It is the lead: a span 12 sheet above the table. A ranked bar is the clearest way to show one comparable measure (points from target) across 15 or more measures.
- **Data:** Reads ScorecardModel.rows, already computed by the views' summaries, so nothing new is read. Add gapRows(model) in src/views/scorecard/engine/report.ts. It takes rows that are shown, have a comparable target and a share format (pct, pct0, pct1). For at least targets the gap is (value minus target) x 100; for at most and under targets it is (target minus value) x 100, so below zero always means a miss. Extend judge() in engine/status.ts to return headroom for met measures, since today met gives gap 0. Measures in other units (median time to fill in days, key talent at risk as a count) are listed in the note ('Median time to fill, 52 d against at most 45 d, is in days and shows in the table only'). Measures hidden by the data standard or by anonymity are counted in the note. New metricId scorecard.measures.gap, defined as value minus target in points, signed so below zero misses. Each bar carries its own kpi.metricId in the table export. uses is the union of the shown rows' kpi.uses.
- **Drill:** Each bar opens row.kpi.drill, the records behind the value down to the person. The row label opens row.opens (the practice tab). The table view's Gap cell uses the same drill, and the Target cell links to the metric in Metric definitions, as ScoreTable does. No Filter to: measures are not groups.
- **Roles:** HR and Developer. Hidden in Manager mode (the Scorecard judges company practices, including comp and HR ops). Developer additionally sees each row's metricId in the table view.
- **Privacy:** Uses only values the scorecard already shows: ratios and rates, never pay amounts. Suppressed or below-standard measures are left out and counted in the note, never drawn as 0.
- **Effort:** small

### Key measures over time against target (scorecard-measure-trends)

- **Tab:** overview
- **Question:** Is each practice's key measure improving or slipping, and when did it cross its target? This is the slide a CHRO wants before asking why.
- **Form:** New kit form LineGrid: small multiples in one SVG (so PNG and SVG export still work, with data-chart on the root). One panel per measure with a target, 8 quarters or 12 months. 2px line in s1, a target rule with its comparator, the last point labelled with value and status glyph, and an independent y scale per panel. This needs a new form because the measures have different units: one Lines chart would need several axes (forbidden), and Plot facets share one y scale. Span 12 under Gap to target, grouped by practice in folder-tab order.
- **Data:** Needs a contract change in the lead-owned src/components/types.ts: Kpi.trend?: { date: ISODate; value: number | null; n?: number; drill?: DrillSource }[]. Each view's summary fills it from series it already computes:
- Recruiting: acceptanceByQuarter, and the quarterly time-to-fill medians behind ttfSpark.
- Onboarding: first90.dayOne.byMonth.
- People stats: attrition by quarter.
- HR ops: the SLA and transaction series behind sparkSla and sparkTx.
- Talent: training by month.
- Compliance, Listening and Compensation: their quarterly series where they exist. Otherwise leave trend unset and the panel says 'No trend yet'.
A new src/views/scorecard/engine/trends.ts judges each point with judge() against today's target. The same output can also give a 'Targets met by month' count. New metricId scorecard.measures.trend. Each panel also carries its kpi.metricId and kpi.uses.
- **Drill:** Every point opens its trend[i].drill: the records behind that period's value, with periodFilter(start, end) for the month or quarter. The panel title opens the practice tab. Points under the anonymity minimum or below the data standard are gaps in the line with a tooltip reason, and are not clickable.
- **Roles:** HR and Developer. Hidden in Manager mode.
- **Privacy:** Each point follows its view's own suppression: medians and rates over fewer than 5 people are null, and survey points follow surveyMinimumsOf (no manager cuts here). No pay amounts.
- **Effort:** large

### Places named across practices (scorecard-findings-by-place)

- **Tab:** overview
- **Question:** Is one place or team behind problems in several practices at once? In the sample, Bengaluru is named in Recruiting, People stats, HR ops and Compensation, which points to one leader conversation rather than four.
- **Form:** BarList, existing kit. Value is the number of practices with a critical or watch finding about that group. Secondary lists the practices ('Recruiting, People stats, HR ops, Compensation'). glyphTone is the worst severity. Top 8 groups. Span 5 beside a span 7 slot, or under Top findings on the right at 1280 px and wider. A count across a short list of named groups is a ranked bar, not a matrix.
- **Data:** Reads model.findings.all (the summaries' findings, already computed). Add placeGroups(model) in src/views/scorecard/engine/model.ts. It keys each finding by its filter: the dimension and the sorted values. Findings whose filter is the same set of sites merge, so HR ops' 'India' and Recruiting's 'Bengaluru' are one group, labelled with the most common filterLabel or the value. Region filters ('Asia Pacific') stay as their own group. A group is listed only when 2 or more practices name it (new setting minPractices, 2). New metricId scorecard.findings.places. uses is the union of the grouped findings' uses.
- **Drill:** Each bar opens a new drill kind findings, following the actionItems pattern. Rows show practice, severity, title and people; each row opens that finding's own drill down to the people. The bar also carries byGroup(dimension, values, label) so the panel offers 'Filter to Bengaluru' and 'Leave out Bengaluru'. A region uses filterLabel 'Asia Pacific'. Opening a row's practice goes to finding.tab.
- **Roles:** HR and Developer. Hidden in Manager mode.
- **Privacy:** Groups come only from findings, which already respect the minimum of 5 and the survey minimums. Employee relations findings never carry a person, and a group is a location, department, business unit or level, never a person. Findings hidden by the data standard are counted, not listed.
- **Effort:** medium

**Layout polish:** Make Gap to target the first sheet so the page reads chart first, table second. Today the page is a table and a findings list only. Move the WelcomeCard into a one-line dismissible notice; it pushes the scorecard below the fold at 1440 px. In the table, show the tier badge only when a measure is below Gold (or as one legend line), because the long tier text on every row is noise. Give each practice group header a small met, watch and missed count bar with status glyphs. On phones the table runs about 3,000 px before Top findings: collapse each practice to its header row ('0 of 2 met') with tap to expand, and put Top findings above the full table. Keep the page's own finding ('10 of 21 measures miss their target') as the subtitle of Gap to target so the takeaway is stated once.

## Recruiting

### Open reqs at month end by business unit (recruiting-open-reqs-month-end)

- **Tab:** overview
- **Question:** Is our open req load growing faster than we fill it, and which business unit is driving it? In the sample, open reqs went from 32 to a peak of 124 on 31 Aug, 63 of them in Silicon Engineering.
- **Form:** Columns, existing kit. xType month, 24 month-ends, stacked by business unit in fixed categorical slots (more than 8 fold into Other), labels off, legend on. Span 12 at the top of the Overview's Requisitions section, above Open reqs by department and Time to fill by level. Stacked columns show both the total level and its makeup over time. Today only the folder tab and KPI sparks show this, undated and 8 points long.
- **Data:** Reads requisitions (openedDate, filledDate, closedDate, status, businessUnit). Generalize openReqSpark into openReqsByMonthEnd(reqs, asOf, 24, by) in src/views/recruiting/engine/reqs.ts. It uses the same isOpenAt rule as the Open reqs KPI, so On hold is not counted (say so in the note). Add it to RecruitingModel. metricId recruiting.reqs.open. Add uses and metric entries for the id to FIGURE_USES (engine/lineage.ts) and FIGURE_METRICS (engine/metricLinks.ts) so the lineage test covers it.
- **Drill:** A segment opens that business unit's reqs open on that month end (openReqsDrill), with byGroup('businessUnit') so the panel offers 'Filter to Silicon Engineering'. A click elsewhere in a column opens every req open that month end. No periodFilter, because a month end is a snapshot and not a window.
- **Roles:** HR, Developer and Manager. In Manager mode it is locked to the manager's org, and the series switch to department when the scope sits inside one business unit.
- **Privacy:** Requisitions only, no personal fields. The drill lists reqs, and candidates only one step further, as today.
- **Effort:** small

### Interview decisions waiting by hiring manager (recruiting-decisions-by-hiring-manager)

- **Tab:** pipeline
- **Question:** Which hiring managers have candidates waiting on an interview decision, and how long have they waited? In the sample, Ji-woo Lim and Hannah Smith hold 74% of the overdue decisions. This is the leader ask for the weekly review.
- **Form:** BarList, existing kit. Top 10 and Other. Value is the number of candidates in the awaiting-feedback state. Secondary is 'oldest 6 d · 4 overdue'. tone is critical when any candidate is past the red tier, warning for amber, otherwise default. Span 4 beside the Action queue (span 8) in the 'Who needs to act' section. A ranked bar gives the clear takeaway: two people own the problem.
- **Data:** Reads b.actives (ActiveItem) filtered to state awaiting-feedback, grouped by app.hiringManager and hiringManagerId, using tier and days from nextStep.ts. Add decisionsByHiringManager(b) in engine/pipeline.ts. New metricId recruiting.pipeline.awaitingDecision: candidates whose interview happened with no stage move since, owned by the hiring manager; aging tiers above 2 d (watch) and 5 d (overdue). Register it, add it to FIGURE_USES (candidates.nextEventDate, stageEnteredDate, requisitions.hiringManager).
- **Drill:** A bar opens those candidates (activeDrill with waitingExtra: days since the interview, tier). When hiringManagerId is known, byGroup('leaderId', 'hiringManagerId', label) offers 'Filter to Ji-woo Lim's org'. Other opens the folded managers' candidates without a filter. The table view's counts drill the same way.
- **Roles:** HR, Developer and Manager. In Manager mode it is locked to the org, so a manager sees their own reqs and those of hiring managers in their org.
- **Privacy:** Names hiring managers, as the Action queue and Copy note already do. Candidate names appear only in the drill. The copy follows the tone rules: the subtitle reads 'Candidates whose interview happened and who are waiting on a decision', never 'chasing'.
- **Effort:** small

### Open reqs by age and candidates past the screen (recruiting-req-age-vs-pipeline)

- **Tab:** requisitions
- **Question:** Which open reqs are old and still have almost nobody past the screen, so we can rethink the role or the sourcing before another month passes? In the sample this is the four Critical analog reqs at 82 to 124 days with no one past the screen.
- **Form:** Scatter, existing kit. One dot per open req. x is days open, y is active candidates past the screen (hiring manager, onsite and offer stages). tone is from health: critical for Empty funnel, warning when candidates lack a next step, otherwise default. labelFilter on critical reqs ('REQ-4414 Principal SerDes Design Engineer'). refX at the empty-funnel age (30 d), refY at 1. Span 7 in the 'Age and volume' section, beside Open req age (Histogram) now at span 5. Two measures per entity is exactly what a scatter is for, and the risky corner is visible at a glance.
- **Data:** Reads m.base.req.rows (OpenReqRow: daysOpen, hiringManagerStage, onsite, offer, health, severity, priority), so nothing new is computed. metricId recruiting.reqs.emptyFunnel, with recruiting.reqs.age in the definitions. FIGURE_USES gets requisitions.openedDate, status, priority and the candidates stage dates. The export rows are req ID, title, department, location, level, priority, days open, past the screen, active and health.
- **Drill:** A dot opens that req and its active candidates (reqRowDrill with measure 'active'). In the table view, the req ID opens the req and the counts open the candidates at each stage. No Filter to: a req is not a group.
- **Roles:** HR, Developer and Manager. In Manager mode it shows only the open reqs in the manager's org.
- **Privacy:** Req-level only, with no candidate data on the chart. Candidate names appear one step down in the drill, as today.
- **Effort:** small

### Median time to fill by quarter (recruiting-time-to-fill-quarter)

- **Tab:** requisitions
- **Question:** Is time to fill getting shorter, and is the gap between junior and senior roles closing? Today the KPI shows 52 d against a 45 d target. L5 and above runs about 103 d and L1 to L4 about 49 d.
- **Form:** Lines, existing kit. 8 quarter ends with xTicks quarter. Three series: All reqs in s1 and the two level bands, with endLabels. ref is the dictionary target ('Target at most 45 d'). Span 7 in the 'Time to fill and recruiter load' section, beside Time to fill by department (span 5). A trend against a target is a line. Today only the KPI spark shows the quarterly medians, with no dates.
- **Data:** Reads requisitions openedDate, filledDate (or the start-date clock that b.ttf sets), level and status. Promote the ttfSpark logic in engine/kpis.ts to ttfByQuarter(b, bands) in engine/reqs.ts, using quarterWindows plus medianTtf for each band. Bands: L1 to L4, and L5 and above (with M and E levels). A quarter with fewer than 5 filled reqs in a band is null and shows as a gap. metricId recruiting.reqs.timeToFill; the target comes from ctx.metrics.target.
- **Drill:** A point opens the reqs filled in that quarter and band (filledReqsDrill with ttfExtra). It carries periodFilter(quarter start, end) and, for a band, byGroup('level', levels, label 'L5 and above'). The All reqs points carry only the period.
- **Roles:** HR and Developer. Not in Manager mode: managers see open reqs, not recruiting performance.
- **Privacy:** Medians over fewer than 5 filled reqs are hidden ('Fewer than 5 reqs filled'). No personal fields.
- **Effort:** small

**Layout polish:** The Overview readout column is long: 6 findings, each with full detail. Show the title sentence and next step, with detail behind 'More', so the lead Pipeline today sits level with the top findings. Every KPI tile and figure carries a tier badge (Silver or Bronze). Show it only when below Gold, or once per strip, to calm the page. On the Pipeline tab, put Interview decisions waiting beside the Action queue so the 'who acts' story reads left to right. On Requisitions, pair the new scatter with Open req age, and Time to fill by quarter with Time to fill by department, so each row has one trend or distribution and one ranking. Keep the 'AI agents for Recruiting' line quiet and right-aligned. In Manager mode, open the view on Requisitions, not Overview, since the manager's question is their open reqs.

## Onboarding

### Countdown to day one (onboarding-countdown)

- **Tab:** upcoming
- **Question:** Who starts in the next 30 days, and which team holds the item that stands between each of them and a ready first day? In the sample, IT holds the Asia Pacific laptops for the October starts, and three starts on 5 Oct have no cleared background check.
- **Form:** DotStrip, existing kit. One dot per upcoming start in the next 30 days. x is days to start (0 to 30). y is the owner of the blocking task, in ONBOARDING_OWNERS order, plus 'Nothing open'. tone is from readiness status: Not ready critical, Behind warning, On track default, Ready good, with a legend. ref at day -3 ('Day -3 tasks due'). label is the person's name for the tooltip. Span 12 at the top of the 'Ready for day one' section, above Readiness by task and Readiness by owner. It shows timing and owner together, which the start calendar (by business unit) and the two BarLists (shares) do not.
- **Data:** Reads m.upcoming.rows (Start with startDate and region; readiness: status, blocking.owner, blocking.name, daysToGo), so nothing new is computed. Add countdownRows(u, days) in engine/upcoming.ts with the horizon taken from the starts-in-30-days setting. metricId onboarding.upcoming.readiness. uses is the upcoming starts and onboarding task fields (onboardingTasks.dueDate, status, completedDate; employees.hireDate; candidates.startDate).
- **Drill:** A dot opens that person's day-one tasks (onboardingTasks drill), with a link to the pre-hire's person card or the accepted offer, as the Upcoming starts table does. A row label opens every start blocked by that owner. No Filter to: owner teams are not a filter dimension, and a person is not a group.
- **Roles:** HR, Developer and Manager. In Manager mode it is locked to the manager's org, and the Manager row shows their own welcome tasks.
- **Privacy:** In Manager mode, background check and export-control screening show only as 'With People ops' or 'With Trade compliance'. The drill leaves out their status (Blocked or In progress) so a hiring manager cannot read a contingency outcome. Authorization type never appears. HR sees the full task states, as in the table today.
- **Effort:** small

### Late day-one tasks by task and region (onboarding-late-tasks-by-region)

- **Tab:** first90
- **Question:** Which day-one tasks miss their due date, and where? In the sample, laptops shipped late for 41% of Asia Pacific starts against 6% elsewhere, which is why day-one readiness is 72% there.
- **Form:** Heatmap, existing kit, sequential. x is region (Americas, EMEA, Asia Pacific), with a Segmented toggle to site. y is the day-one task in checklist order. value is the share of starts with the task done after its due date, or still open when due. The n channel shows starts. showValues on. Span 7 at the top of the 'Where day one slips' section, beside Day-one readiness by site (span 5). New hires entered by day -3 moves to the next row. Task by place is a grid question, and the heatmap points straight at one cell.
- **Data:** Reads m.first90.readinessTasks ({ start, task, late }), already computed for starts in the window. Add lateByTaskAndRegion(first90, minGroup) in engine/first90.ts with the rateBy pattern. metricId onboarding.readout.lateTask (it exists), with onboarding.first90.dayOneReadiness in the definitions. uses is onboardingTasks.dueDate, completedDate and status, and employees.location.
- **Drill:** A cell opens those late tasks with their people (onboardingTasks drill, task state Done late or Overdue). It carries byGroup('location', the region's sites, label 'Asia Pacific') so the panel offers 'Filter to Asia Pacific'; at site level it is a plain location filter. The row header opens every late instance of that task.
- **Roles:** HR and Developer. Not in Manager mode (First 90 days is outside team basics).
- **Privacy:** Cells with fewer than 5 starts are blank and read 'Hidden to protect anonymity (n < 5)', in both the tooltip and the table view. No contingency outcome is shown beyond late or on time, and authorization type never appears.
- **Effort:** small

### When late day-one tasks were finished (onboarding-task-timing)

- **Tab:** first90
- **Question:** When a day-one task is late, does it still land before the first day, or does the new starter sit without it? In the sample, about five in eight late laptops arrived after the first day.
- **Form:** Histogram, existing kit. values are days from the start date to completion (negative means before day one), one task at a time. A Segmented control picks the task, defaulting to the task with the most late items (Laptop shipped in the sample); the others are Accounts created, Background check cleared and Badge ready. band runs from the lowest value to the task's due day ('By the due date'). refs at 0 ('First day'). unit is 'starts'. Span 5 beside the late-tasks heatmap on its second row, or span 6 with Check-ins. A distribution of lateness answers the question that the share alone does not.
- **Data:** Reads the same first90.readinessTasks plus task.task.completedDate and start.startDate. Add taskTiming(first90, task) in engine/first90.ts. Tasks still open are counted in the note ('3 still open'), not binned. New metricId onboarding.first90.taskTiming: days from the start date to the completed date; the due day comes from the checklist. uses is onboardingTasks.completedDate and dueDate, plus the start date fields.
- **Drill:** A bin opens the people and tasks in it (onboardingTasks drill with an extra 'Days from start' column). The note's open count opens the open tasks. No Filter to: bins are not groups. The page filter (for example Asia Pacific) scopes it.
- **Roles:** HR and Developer. Not in Manager mode.
- **Privacy:** Shows task timing only. Hide the chart when fewer than 5 starts have the chosen task in scope. Contingency outcomes are never shown beyond the completion date, and authorization type never appears.
- **Effort:** small

### Starts against plan by business unit and month (onboarding-plan-gap-by-month)

- **Tab:** plan
- **Question:** Where, and in which months, did starts fall behind the hiring plan? Silicon Engineering is at 86% of its plan to date while Go-to-Market is ahead. The cumulative lead line hides which months and which units did it.
- **Form:** Heatmap, existing kit, diverging. y is the business unit (department under a business unit filter). x is the month, from the plan year's start to the as-of month. value is actual starts minus planned starts, mid 0, showValues on. The tooltip reads '8 started of 12 planned'. Span 12 directly under 'Plan, actual and forecast starts' and above the Coverage section. Polarity over unit and month is a diverging grid. The existing table and HBars give totals, not timing.
- **Data:** Reads hiringPlan (period, businessUnit, department, plannedHires, the latest planVersion) and employees (isEmployee, hireDate) through the existing plan model. Add byUnitMonth(plan, cut) in src/views/onboarding/engine/plan.ts, sharing the Actual definition that MonthRow uses. metricId onboarding.plan.vsPlan. uses is hiringPlan.period, plannedHires, businessUnit and employees.hireDate.
- **Drill:** A cell opens the people who started in that unit that month (employees drill), with the unit's plan lines for that month in the panel note. It carries byGroup('businessUnit', ...) plus periodFilter(month start, month end), so the panel offers 'Filter to Silicon Engineering'. The row header opens the unit's plan lines for the year.
- **Roles:** HR and Developer. Not in Manager mode.
- **Privacy:** Counts of starts and planned roles only. The drill lists employees who started, as the existing Actual drill does. No pay or plan cost fields.
- **Effort:** medium

**Layout polish:** The readout carries 10 findings with full detail. Show titles and next steps with detail behind 'More', so the Start calendar sits level with the first findings. On Upcoming starts, place the countdown before Readiness by task and Readiness by owner, so the section reads people first, then teams. Give the Start calendar an optional 'Color by readiness' toggle so it does not repeat the business unit split the plan tab already shows. On First 90 days, lead 'Where day one slips' with the heatmap and move New hires entered by day -3 to a row with the timing histogram. On Hiring plan, keep the cumulative line as the lead and put the month heatmap right under it, then Coverage. In Manager mode, open on Upcoming starts only and drop the 'Notice periods and reneges' section, which is company-level TA data.

## Action center

### When items fall due (actions-due-timeline)

- **Tab:** page (#actions)
- **Question:** Is our open work mostly stale or mostly coming due, and which week peaks? In the sample, 316 of 574 items are overdue, and most of the Talent ones fell due on 26 Aug.
- **Form:** Columns, existing kit. Band x in fixed order: 8+ weeks overdue, 4 to 8 weeks overdue, 2 to 4 weeks overdue, 1 to 2 weeks overdue, under 1 week overdue, this week, next week, 2 to 4 weeks ahead, later, no due date. Stacked by severity: Critical uses the status critical color, Watch the status warning color, Note uses deemph. Legend with the severity words. Span 7 as the lead of the first row, beside the owners chart. This is one chart for both how stale the backlog is and the coming load. 'Where items wait' only has four buckets per owner group.
- **Data:** Reads the open OpenAction items (item.due, item.severity) against ctx.asOf. Add dueBand(due, asOf) next to dueBucket in src/views/actions/engine/due.ts, and dueTimelineRows(open, ctx) in engine/summary.ts. metricId actions.items.overdue, with actions.items.dueSoon in the definitions. uses is usesOf(open).
- **Drill:** A segment opens its items (itemsDrill with the page's status). A click elsewhere in a column opens every item in that band. Rows open their own records or person card as today. No Filter to: due bands are not filter dimensions.
- **Roles:** HR, Developer and Manager. In Manager mode it is locked to the manager's org: their own items and those about or owned by their org, through the existing My team leader logic.
- **Privacy:** Counts of items only. Employee relations items keep their rules: counted, never named, and left out in scopes under the anonymity minimum (the page already says so).
- **Effort:** small

### Who has the most waiting (actions-top-owners)

- **Tab:** page (#actions)
- **Question:** Who has the most open items, overdue or critical, so I know whom to raise in this week's leader reviews?
- **Form:** BarList, existing kit. Top 12 owners (people and teams) and Other. value is open items. Secondary is '21 overdue · 21 critical'. glyphTone is critical when any item is critical, warning when any is overdue. Span 5 beside the due timeline. The ranked bar shows the takeaway at once; today you must scan 211 owners across 12 sheets.
- **Data:** Reads ownerRows(open, ctx) in src/views/actions/engine/summary.ts, already built for the Owners KPI drill: owner, ownerGroup, personId, items, overdue, critical. No new computation. metricId actions.owners.withOpen. uses is usesOf(open).
- **Drill:** A bar opens that owner's items (itemsDrill). For a person, the panel links their person card. When the owner manages people, the panel offers 'My team: {name}' (leaderId through the existing My team picker). Other opens the remaining owners' items. The table view adds an owner group column and the same drills.
- **Roles:** HR, Developer and Manager. In Manager mode it shows only the manager and people in their org, plus teams holding their org's items.
- **Privacy:** Names owners, as the owner sheets and Copy notes already do. It never names the subject of an employee relations item, and those items' owner is a team.
- **Effort:** small

### What is waiting, by kind (actions-by-kind)

- **Tab:** page (#actions)
- **Question:** What kind of work is waiting (interview decisions, applications to review, overdue training, pay below range minimum, day-one tasks, probation decisions, cases or transactions past target), and how much of it is overdue?
- **Form:** HBars, existing kit, stacked by due bucket. It uses the same series order and colors as 'Where items wait': Overdue critical, Due within 7 d warning, Due later s1, No due date deemph. Top 12 kinds and Other. Span 7 on the second row, beside 'Where items come from' (by view, span 5). Kind is finer than view: Recruiting alone holds applications to review, interview decisions and empty funnels.
- **Data:** Needs a small contract change: ActionItem.kind?: string, a plain label such as 'Interview decision' or 'Required training overdue'. Each view's actions() sets it next to the id it already builds (for example recruiting:decision, talent:training-overdue, onboarding:probation, services:case, compliance:i9). collect.ts falls back to the view label when it is missing. Add kindRows(open, ctx) in engine/summary.ts. metricId actions.items.open. uses is usesOf(open). Add a test so every view's items carry a kind.
- **Drill:** A segment opens the items of that kind and due bucket, and a row opens every item of that kind (itemsDrill). Items open their own drill or person card. No Filter to.
- **Roles:** HR, Developer and Manager. In Manager mode it covers only the manager's own and their org's items.
- **Privacy:** Kind labels are category level. An employee relations item reads 'Case past target', never its subcategory or a person. Survey-based items (Listening) keep their manager-cut minimum of 10.
- **Effort:** medium

**Layout polish:** On phones the 'Waiting on' list starts about 2,160 px down the page, under the filter row, the header, five KPI tiles and two charts. On narrow screens, put the list first and fold the charts into a 'Show charts' disclosure. Show the KPI strip three across on phones and drop the per-tile Bronze badge. The severity counts in the header (Critical 129, Watch 382, Note 63) repeat the Critical tile: keep the header line and drop the tile, or the reverse. New order: KPIs, then the due timeline (span 7) with Who has the most waiting (span 5), then What is waiting by kind (span 7) with Where items come from (span 5), then Where items wait (span 12). Kit-wide bug: BarList's value and secondary text run together for screen readers and copied text ('197164 overdue' in Where items come from). Add a visually hidden separator. In Manager mode, open with My team set to the manager and hide the picker.

## People stats, Special analyses: Quality of hire (hrbp.analyses:quality)

docs/ANALYSES.md part 2 is the contract; this lists what was built. The engine is `src/views/hrbp/analyses/quality/engine/` (cohort, groups with their interval and expected score, findings, drills); the figures are in its `ui/figures.tsx`. Every hire list is an employee drill with University, Degree level, Field of study, Level at hire, Site, First full review, Stayed a year and Regretted, by hire date. No figure, table, drill or export holds a quality of hire score per person. The whole analysis is hidden in Manager mode.

### Quality of hire by university (hrbp-quality-university)

- **Tab:** analyses:quality (the lead, span 8)
- **Form:** RangeBars in range mode: the interval track (90% by default), the mean dot in s1 and the expected score from site and level as an ink tick, a reference rule "Company 66.9". Kit additions on RangeBars: `ref`, a row tail with a status glyph and its word (`glyphTone`, `glyphLabel`: Above, Below), a muted `secondary` ("38 hires · expected 65.8", tooltip only under 560px), `deemph` for Not recorded, and two-line category labels in rows of 26px or more. Sort: Hires (default) or Quality of hire; Other universities (k) and Not recorded always last. Metric hrbp.quality.score; the note carries "Compare groups, not people."
- **Drill:** a row opens its scored hires (Other opens the folded schools' hires). No Filter to.

### Performance and retention by university (hrbp-quality-university-parts)

- **Form:** Scatter, one dot per shown university, x stayed a year, y first review score, size scored hires, company rules on both axes, labels on the five most extreme. Metric hrbp.quality.score.
- **Drill:** a dot opens the school's scored hires; table cells open the rated hires and the hires with a retention score.

### Performance and retention by group (hrbp-quality-parts)

- **Form:** HBars grouped, First review score (s1) and Stayed a year, % (s2) on one 0 to 100 axis, the company first. Group by: Degree level, Field of study, Source, Business unit, Site (a segmented control from 1200px, a menu below); the table and exports hold every grouping. Metric hrbp.quality.score.
- **Drill:** a bar opens the group's rated hires or hires with a retention score; Filter to on business unit and site rows only.

### Quality of hire by degree level, by field of study and by source of hire (hrbp-quality-degree, hrbp-quality-field, hrbp-quality-source)

- **Form:** RangeBars as the lead. Degree levels in their order then Not recorded; the six largest fields, then Other fields (a field recorded as "Other" folds there), then Not recorded; sources in their order, then any other source, Other sources (k) and Not in the candidate data. The source note gives the link coverage ("218 of 488 hires link to an application; the candidate data starts 30 Apr 2024") and its detail export is the linked applications. Metric hrbp.quality.score.
- **Drill:** a row opens its scored hires. No Filter to.

### Degree level by field of study (hrbp-quality-degree-field)

- **Form:** Heatmap, diverging around the company mean, values printed, n in the tooltip; cells under the smallest cell (10 scored hires) show the dash. Metric hrbp.quality.score.
- **Drill:** a cell opens its scored hires.

## People stats, Special analyses: Level pyramid (hrbp.analyses:pyramid)

docs/ANALYSES.md part 5 is the contract; this lists what was built. The pyramid is a kit form: `Pyramid` in `src/charts/kit/Pyramid.tsx` (layout, hit-testing and keyboard points in `pyramidModel.ts`, tested), with an `outline` legend swatch in `core/legend.ts`.

### Workforce pyramid (hrbp-pyramid)

- **Tab:** analyses:pyramid (the lead, span 8)
- **Question:** What shape is the workforce across levels, and what changed in a year? In the sample, a diamond: L3 314 (+31% in a year) over a thin L1 of 65.
- **Form:** Pyramid. One centered 16px bar per level, L1 at the bottom, 6px apart, 4px rounded ends; a 1.5px ink-2 outline on a 2px sheet halo for a year ago (or, under an org filter or in Manager mode, the company's shape scaled to the scope). Track brackets (Individual contributor, Manager, Executive) with a hairline between them; right gutter: headcount, change and "span 6" in tabular figures, and up to two notes from the bulge and thin level findings. Split: None, Business unit (company slots s1 to s7 in company size order, Other and Not recorded in deemph), Tenure (five-step ordinal ramp), Worker type (Contractors s1 and Interns s2 as on Workforce, Employees s3; adds contractors and interns). Below 160px of bars it drops notes, then bracket labels and the span column, and uses the level codes.
- **Data:** `pyramidData` in `src/views/hrbp/analyses/pyramid/engine/model.ts`. Metric hrbp.headcount.employees. The table and exports are long form with a Split column holding every split.
- **Drill:** A row opens its employees (Level a year ago, Tenure band, Direct reports) with Filter to the level; a business unit segment opens the level in that unit with Filter to both; tenure and worker type segments open without a filter. From the table, a year ago opens the people at the level then and the change opens who joined and left the level. The company outline opens nothing.
- **Keyboard:** one tab stop; Up and Down between levels, Left and Right through a split level's segments, Enter drills.
- **Roles:** Developer, HR, Manager (inside the org; the company outline is an aggregate).

### Size against the level below (hrbp-pyramid-ratio-below)

- **Form:** BarList, sort none, E1-E3/M2 at the top down to L2/L1, reference at 1×, a warning glyph on the individual track above 1 + tolerance. Metric hrbp.pyramid.ratioBelow (setting: tolerance, 25%).
- **Drill:** both levels' employees with Filter to the two levels ("L2 and L1"). The ratio is hidden over a level below under the anonymity minimum.

### Spans at each management level (hrbp-pyramid-spans)

- **Form:** RangeBars in quartile mode for M1, M2 and E1 to E3 (combined only when each is under 5 managers), secondary "200 managers", a warning glyph and "Wide" or "Narrow" at the Org chart's span thresholds. Metric hrbp.org.medianSpan.
- **Drill:** the managers at the level with their direct reports and total org. No Filter to: filtering to the level would leave their reports out.

### How each level changed in 12 months (hrbp-pyramid-flow)

- **Form:** table only. A year ago, hired, promoted in, promoted out, left, other changes, today, change, growth; every row reconciles. Metric hrbp.pyramid.levelFlow.
- **Drill:** hired, left, today and other changes open employees; promotions open job changes.

### Level mix by business unit (hrbp-pyramid-mix)

- **Form:** HBars, 100% stacked, a Company row first, then the company's seven largest units and Other; bands Entry, Career, Senior, Management, Executive on the ordinal ramp. Metric hrbp.pyramid.levelMix.
- **Drill:** a segment opens its employees with Filter to the unit and the band's levels ("Senior levels in Silicon Engineering"); the Company row opens nothing in Manager mode.

## People stats, Special analyses: Engineering by stage (hrbp.analyses:stages)

docs/ANALYSES.md part 4 is the contract; this lists what was built. The engine is `src/views/hrbp/analyses/stages/engine/` (who counts and in which stage in `placer.ts` and `base.ts`, the counts in `capacity.ts`, hiring in flight in `hiring.ts` through Onboarding's upcoming starts and plan coverage, the KPI strip, readout and Ask tables, and every figure's drill in `figureDrills.ts`); the figures are in its `ui/figures.tsx`, the stacked stage bars in `ui/StageBars.tsx`. A person counts in the stage of their job function (`ctx.jobs.engineeringPlace`); a req or plan line takes the most common job function of its department's active employees ("Inferred from department"). Every people list is an employee drill with Stage, Stage source (Saved, Proposed, Not mapped) and FTE. The section's "Job family: All engineering" menu scopes every number on the tab (session state; exports say what is on screen; off screen it reads All engineering). Stage, job family and job function are not filter dimensions: only the heatmap's site and business unit cells set Filter to.

### Engineering capacity by chip development stage (hrbp-stages-capacity)

- **Tab:** analyses:stages (the lead, span 8)
- **Form:** `StageBars` (a Plot visual through `PlotChart`): stacked horizontal bars, the nine lifecycle stages in order, a hairline, then Software and firmware, Shared engineering and Not mapped (only with people); Employees s1 and Contractors s2 with a legend; the bar ends in its total and "12% contractors". Header Headcount | FTE. Up to two notes from the readout ("43% in Bengaluru"; the ratio below its reference when it fires). Metric hrbp.stages.capacity.
- **Drill:** a segment opens that stage's employees or contractors, elsewhere in the row both; table cells open employees, contractors, interns and the people 12 months ago. No Filter to.

### Hiring in flight by stage (hrbp-stages-hiring)

- **Form:** `StageBars`, the same rows; Accepted, not started (seq-600), Open reqs (seq-400), Planned, no req yet (seq-250, left out in Manager mode); the bar ends in "+27" and "18% of today". Note on the stage with the most planned starts with no req. Metric hrbp.stages.hiring.
- **Drill:** accepted opens the upcoming starts (Onboarding's list, noun "starts"), open reqs the requisitions (Openings, Job function, Stage, Stage source), planned the plan lines (hidden in Manager mode).

### Stage ratios against reference (hrbp-stages-ratios)

- **Form:** BulletList, five ratios each on its own scale, the reference as the tick (0 is none: no tick, "No reference"); Below reference (warning) at or under the reference less the readout's below-by share, Near reference (good) within it either side, Above reference beyond it. The measure name opens Metric definitions at hrbp.stages.ratios (plain text where the Data room is hidden). Metric hrbp.stages.ratios.
- **Drill:** a row opens the people in both stages.

### Where each stage is staffed (hrbp-stages-where)

- **Form:** Heatmap, rows the stages with people, columns the eight largest sites by engineering headcount then Other (or business units), value the row share (sequential 0 to 100%), n people, values printed. Site | Business unit; the table and exports hold both groupings (Grouped by). A row under the anonymity minimum shows counts and no shares. Metric hrbp.stages.capacity.
- **Drill:** a cell opens its people with Filter to the site or business unit (none on Other).

### Stage headcount over time (hrbp-stages-trend)

- **Form:** TrendGrid, one cell per stage with people, the last 8 quarter ends, each cell on its own scale, no target. Each person counts in their current job function's stage. Metric hrbp.stages.capacity.
- **Drill:** a point opens the people in the stage at that quarter end.

### Job functions behind the stages (hrbp-stages-functions)

- **Form:** table only: job family, job function, stage, stage source, employees, contractors, their FTE, open openings and planned with no req (left out in Manager mode). A link under it opens Settings, Official lists (plain text where Settings hides the lists). Metric hrbp.stages.mapped.
- **Drill:** each count opens its people, reqs or plan lines.

## People stats, Special analyses: Offer declines (hrbp.analyses:declines)

docs/ANALYSES.md part 3 is the contract; this lists what was built. The engine is `src/views/hrbp/analyses/declines/engine/` (offers read with Recruiting's `prepareApps`, `resolvedOffers` and `acceptance`); every mark opens its offers through Recruiting's candidate drill, declined first, with the offer's own columns (offer and decision dates, days to offer and to decide, outcome, reason and theme, competing offer, offer revised, position in range). The whole analysis is hidden in Manager mode.

### Why offers were declined (hrbp-declines-reasons)

- **Tab:** analyses:declines (the lead, span 8)
- **Form:** Pareto (`ParetoChart.tsx` in the analysis's ui folder): a column per reason on the Offer decline reasons list (largest first, "Other reasons (k)" after the named ones, "Not recorded" last in deemph), a 2px ink-2 line with dots for the running share and a rule at 80%, one axis from 0 to 100%. A bracket names the reasons that reach 80% ("3 reasons, 86% of declines"). Short reason names under the columns; the tooltip and table keep the full ones. Metric recruiting.offers.declineReasons.
- **Drill:** a column opens its declined offers. No Filter to.

### Decline rate by quarter (hrbp-declines-trend)

- **Form:** Lines, 8 quarters to the as-of date; under an org filter the company line is added and the scope emphasized. A quarter under the anonymity minimum breaks the line. Note from the rise finding ("Rose to 32% in Q3 2026, mostly in Bengaluru"). Metric hrbp.declines.rate.
- **Drill:** a point opens the quarter's offers with Filter to the quarter (the scope's line only).

### Decline rate by group (hrbp-declines-by-group)

- **Form:** BarList, domain 0 to 100%, company rule, secondary "46 of 70 · expected 23%", a warning glyph where the gap to expected is at least the gap to flag with enough offers. The "By level" menu picks Level band, Location, Business unit, Source, Recruiter or Hiring manager; the table and exports hold every cut (Grouped by, expected, gap, 90% Wilson interval). Metric hrbp.declines.rate, with hrbp.declines.expected.
- **Drill:** a bar opens its offers; Filter to on level bands ("L5-L6"), locations and business units.

### Decline rate by days from final interview to offer, and from offer to decision (hrbp-declines-interview-to-offer, hrbp-declines-offer-to-decision)

- **Form:** Columns, one series, rule at the rate over the measured offers, "n offers" in the tooltip (a new optional `secondary` on Columns). "No clear link in this period" when no bucket is the gap to flag away from it. Metric hrbp.declines.timing.
- **Drill:** a column opens its offers. No Filter to.

### Competing offers and revised offers (hrbp-declines-competing)

- **Form:** BarList of acceptance, four fixed rows, company acceptance rule, secondary "11 of 17". Metric hrbp.declines.competing.

### Where offers sat in the range (hrbp-declines-range-position)

- **Form:** dumbbell (`RangeDumbbell.tsx`), the company first, then locations by gap; declined median in s1, accepted in s2, scale 0 to 1.2 with a midpoint rule. A row short of one outcome shows the other dot. Metric hrbp.declines.rangePosition (a ratio, never an amount).
- **Drill:** a dot opens that row's offers of that outcome, with Filter to the location.

### What candidates who declined told us (hrbp-declines-candidate-survey)

- **Form:** candidate NPS of survey respondents who declined against those who accepted (BarList), beside the survey's decline reasons and the ATS reasons (a table). Shown only when candidate experience answers are loaded and Listening is shown; on Manager mode's hide list. Grouped results only, at the survey minimum.
- **Drill:** survey numbers open grouped results (surveyGroups); ATS counts open the declined offers.

### What to do next (hrbp-declines-next-steps)

- **Form:** table only, span 12: theme, declined offers, share, where it concentrates (`decomposeRate` on location, level band and business unit), owner, and the fixed next step per theme. Personal and Other have none. Metric recruiting.offers.declineReasons.
- **Drill:** a theme's count opens its declined offers.
