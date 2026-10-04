# Census: what to add next (plan, no build yet)

## Context

Census has seven tabs: Recruiting, People stats, Org chart, HR ops, Talent,
Compensation and the Data room. Drill-down on every number is being finished in the background.
You asked two things:

1. What else would I want on a dashboard to run an HR function?
2. An onboarding part that covers upcoming starts and reflects the hiring plan.

I checked what Census already covers (onboarding, leave, compliance, planning, listening, cost
and so on) so nothing here repeats a view that already exists. This file is the plan. Nothing
gets built until you say go.

---

## Part 1. New "Onboarding" tab (your request; build first)

**Where it goes:** a new folder tab between Recruiting and People stats, following the
employee lifecycle (hire, then start, then manage). Key `onboarding`, folder `src/views/onboarding/`.

**The questions it answers:**
- Who starts in the next 90 days?
- Will each of them be ready on day one?
- Are we hiring to plan?
- How are the first 90 days going?

### Tabs

**1. Upcoming starts** (opens on this tab)
- KPIs:
  - starts in the next 30 / 60 / 90 days
  - starts whose Day −3 tasks are not all done
  - starts in the next 10 business days with open contingencies (the Atlas ON-01 weekly exception)
  - median days from offer accepted to start, by location (India has 60-90 day notice periods)
  - renege rate (accepted offers that never started, target under 3%, India tracked separately)
- Start calendar: weekly columns for the next 13 weeks, stacked by business unit; every bar drills to the people.
- Upcoming starts table:
  - one row per person: name, role, department, hiring manager, recruiter, location, start date, days to go
  - readiness, e.g. "7 of 9 done", with a status pill
  - the blocking item, such as background check, laptop or I-9
  - a row opens the person (pre-hire) or the candidate record
- Readiness by task: share of upcoming starts with each task done by its due date (laptop, accounts, badge, background check, export-control screening, I-9 Section 1, benefits packet, orientation booked, manager welcome).
- Readiness by owner (IT, Facilities, People ops, Trade compliance, Manager), to show who is behind.

**2. First 90 days**
- Day-1 readiness for people who started in the window: every pre-start task done by Day 0 (Atlas ON-01, target 95% or more).
- I-9 Section 2 within 3 business days (US starts, Atlas ON-02, target 100%).
- Required training done within 30 days of the start (from Learning, which exists today; ON-04 target 95%).
- 30/60/90-day check-ins on time (ON-04, target 90%).
- Probation decisions due and overdue: due 10 business days before probation ends; flag 30 days ahead.
- Voluntary attrition within 90 days (target under 2%), by department and hiring manager, with groups under 5 hidden.

**3. Hiring plan**
- Plan, actual and forecast by month, as cumulative lines:
  - plan: planned starts
  - actual: employees whose hire date fell in the period
  - committed: accepted offers with a future start
  - forecast: open reqs × the historical fill rate × time to fill (logic Recruiting already has)
- Plan coverage table by business unit and department: plan year to date and full year, actual, committed, open reqs, gap, and status (On plan / Behind / Ahead).
- Planned roles with no open requisition, and open reqs that are not in the plan (backfills shown on their own).
- Readout findings, for example:
  - "Silicon Engineering is 14 starts behind its Q4 plan; 9 planned roles have no open req."
  - "3 people start next week without a cleared background check."

**Readout:** findings across all three tabs, each with a number, where it concentrates and one
neutral next step. Every number drills to the people, candidates or reqs behind it.

### Data

Two new datasets. Both are optional; the tab shows what it can without them.

**1. Hiring plan** (sheet "Hiring plan"). One row per planned role, or one row per period × org
with a count. Both shapes work in the same sheet.
- Required: `period` (month), `businessUnit`, `department`, `plannedHires` (defaults to 1).
- Optional: `location`, `level`, `jobTitle`, `reqType` (New/Backfill), `reqId` (links the plan line to a requisition), `planVersion`.
- Header names it recognizes: "Planned hires", "Plan HC", "Approved headcount", "Target start", "Position ID", "Req".

**2. Onboarding tasks** (sheet "Onboarding tasks"). One row per person per task.
- Fields: `employeeId` or `applicationId`, `task`, `owner`, `dueDate`, `completedDate`, `status`, `processId`.
- Default task list and due dates come from the Atlas:
  - pre-start (ON-01): contingencies cleared Day −3, IT Day −3, badge Day −2, Day −1 readiness check
  - right to work (ON-02): I-9 Section 2 within 3 business days
  - onboarding completion (ON-04): policy acknowledgments within 5 business days, 30/60/90 check-ins, probation decision

**Changes to existing data:**
- Candidates: add an optional `startDate` (expected start). Greenhouse exports call it "Start Date". Today `hiredDate` is the offer-accepted date, so the start is unknown.
- Candidates: a renege is an accepted offer (`hiredDate` set) later marked Withdrawn. The importer treats "Reneged" and "Offer rescinded" as Withdrawn with a reason. No new status value is needed.
- Employees with a hire date after the as-of date count as pre-hire records. Upcoming starts merges pre-hire employees and accepted candidates with a future `startDate`, de-duplicated by req and name.

### Build steps (same pattern as the existing views)

1. `src/data/schema.ts`:
   - add the two datasets (types, `DATASETS` field definitions with header synonyms) and `Candidate.startDate`
   - add `'onboarding'` to `ViewKey`, `ROUTE_VIEWS` and the registry
   - add drill kinds `onboardingTasks` and `hiringPlan` (`src/drill/types.ts`, `records.ts`)
2. Sample company (`src/data/sample/`), with stories planted to match the existing recruiting data:
   - a hiring plan for FY2026-27 whose Q4 2026 ramp explains the Q3 open-req surge already in the sample (32 to 114 open reqs)
   - about 60 accepted offers starting Oct-Dec 2026, Bengaluru with long notice periods
   - onboarding tasks with these stories: APAC laptops shipped late; 3 starts next week without a cleared background check; Silicon Engineering behind plan; 2 Bengaluru reneges; overdue probation decisions in Sales
3. Engine `src/views/onboarding/engine/` (pure, with Vitest tests):
   - reuse `src/lib/people.ts` (hires, first-year and 90-day attrition), `src/lib/dates.ts` (`addBusinessDays`, `businessDaysBetween`) and `src/lib/decompose.ts` (where a finding concentrates)
   - reuse Recruiting's stage pass rates and time to fill for the forecast; import them from the recruiting engine rather than copying
4. UI: `src/views/onboarding/ui/*` using `Figure`, the chart kit, `KpiStrip`, `Readout`, drill specs on every number, and table rows that open the person card.
5. Data room: templates and import mapping for the two new datasets; the Tasks import accepts relative due dates such as "Day -3".
6. Avoid duplicates:
   - move "New hire readiness by site" from HR ops > HR transactions to Onboarding, and replace it with a link
   - keep HR ops' ON-03 row in the Service levels scorecard, since that measures HR operations processing, not people readiness
   - Recruiting's Overview gets one "Hires vs plan" KPI that opens Onboarding > Hiring plan

### How I'd verify it

- Engine tests: definitions; empty and missing datasets (shows "—", never 0); n < 5 hidden; every planted story detected; every number shown equals the number of rows its drill opens.
- Round-trip test: build the sample workbook, import it, and check the rows come back identical for the two new datasets.
- In the browser: every tab in light, dark and 375 px; the drill panel on each KPI, chart and table; the Excel and PowerPoint exports; the Data room upload of a hiring-plan sheet that has one row per period.
- `npm run verify` (type check, lint, all tests, app build and the one-file build).

---

## Part 2. Other dashboards I'd want for running an HR function

Ranked by value to an HR leader, given what Census already covers.

| # | Dashboard | Why | Data |
|---|---|---|---|
| 1 | **People scorecard (home page)** | A CHRO one-pager: one key number per practice with target and status, trend, the top findings from every view, and a one-click monthly people report deck. Today you have to visit seven tabs. | Works with today's data (reuses every view's engine) |
| 2 | **Action center** | Every open action grouped by owner (manager, HRBP, recruiter, HR ops): candidates waiting on a decision, cases past target, overdue training, probation decisions due, starts not ready. With a "my team" mode for a manager. Built for your weekly review with leaders. | Works with today's data (owners already exist in the data) |
| 3 | **Compliance and right to work** | Work authorizations expiring in 90/180 days, I-9 timeliness, export-control license status (a "license required" flag, never nationality), required training and policy acknowledgments, and a calendar of statutory deadlines from the Atlas for the 13 jurisdictions. High risk for a semiconductor company. | New "Right to work" dataset; Atlas calendar as reference data |
| 4 | **Leave and return to work** | Who is on leave now, how long, return rate, retention 12 months after return (target 90%), and terminations during or soon after protected leave. | Works with today's data (leave start and return transactions); leave reason optional |
| 5 | **Employee listening** | Exit survey (reason Pareto, regretted vs others), onboarding pulse, engagement and eNPS, with manager-level cuts only at 10 or more people. You switched engagement off in the org chart tool, so this is your call. | New survey responses dataset |
| 6 | **Workforce cost** | Base + bonus + equity in USD by cost center, site and level, with cost per head. Amounts only when "Show pay amounts" is on. | Snapshot works today; trends need payroll history |
| 7 | **Data quality rules** | Data Detective-style consistency checks in the Data room: leavers with no reason, active people with no comp row, hire date after termination date, duplicate people, managers who have left. | Works with today's data |

**Left out on purpose, based on what you decided earlier:**
- Representation and other protected-class reporting: the gender fields were removed as sensitive.
- Turnover cost in dollars: dollar figures were removed from the org chart tool.
- Full position management: the hiring plan above only covers planned hires and starts.

---

## Part 3. What you chose, and where each piece goes

You picked People scorecard, Action center, Compliance & right to work and Leave & return to
work. You first asked for exit survey and onboarding pulse only, then for more surveys, so
Listening now covers the full survey program below, with engagement and eNPS still off. Workforce
cost and data quality rules wait.

To keep the number of folder tabs sensible and avoid duplicates:

| Piece | Where it lives | Data |
|---|---|---|
| People scorecard | New first folder tab **Scorecard**; Census opens here | Today's data |
| Action center | **Actions** button in the masthead with an open-items count, beside the Data room; not a folder tab | Today's data, plus onboarding tasks and right to work once loaded |
| Compliance & right to work | New folder tab **Compliance** | New Right to work dataset; Atlas calendar as reference data |
| Leave & return to work | New sub-tab **Leave & return** under HR ops | Today's data, plus two optional transaction fields |
| Surveys (all programs) | New folder tab **Listening**; each survey's key result also appears in the view it belongs to | New survey responses dataset |

### People scorecard (home)
- One table of the key numbers. Each practice gets 2-3 measures with:
  - the value
  - the target and a status pill (Met / Watch / Missed)
  - the change vs the prior period
  - a trend line
- Every row drills like any other number and opens its view.
- **Top findings across Census:** the most serious findings from every view, each linking to its tab.
- **Targets:** defaults come from the Atlas KPI targets (e.g. resolution SLA 90%, final pay on time 100%, required training 95%) plus common benchmarks. They are editable in a "Targets" popover and kept in this browser.
- **Monthly people report:** one click builds a PowerPoint (scorecard, top findings, each view's lead chart) and an Excel workbook. It reuses the whole-view export now being added.
- **Contract change:** `ViewDef` gets an optional `summary(ctx)` that returns `{ kpis, findings }`, so the scorecard calls each view's engine without rendering the views. Load budget: 400 ms or less on the sample, computed in an idle callback after the first paint.

### Action center
- **Contract change:** each view's engine exports `actions(ctx)`, returning items of type `ActionItem { owner (role + person), due, severity, what, subject (person, candidate, case or req), view, drill }`. Items come from:
  - Recruiting: next steps from the action queue
  - Onboarding: starts not ready, probation decisions due
  - HR ops: cases past target, overdue transactions
  - Talent: overdue required training
  - Compliance: expiries
- **Layout:** grouped by owner (manager, HRBP, recruiter, HR ops, IT, trade compliance). Each owner gets:
  - Copy note, using the recruiting tone rules (polite asks, never "chase")
  - Mark handled or Snooze 7 days (kept in this browser)
  - Excel export
- **"My team" mode:** pick a manager to see their open items and their team's. The leader filter already does the scoping.

### Compliance & right to work
- New dataset **Right to work**:
  - `employeeId`, `authorizationType`, `expiryDate`, `reverificationStartedDate`, `i9Section1Date`, `i9Section2Date`
  - `exportLicenseRequired` (yes/no), `exportLicenseStatus`, `exportLicenseExpiry`
- **Privacy:**
  - No nationality or citizenship field, ever; those are protected characteristics.
  - The authorization type shows only in aggregate unless a session switch "Show immigration details" is on, the same pattern as pay amounts.
- **Figures:**
  - authorization expiries over the next 180 days, by month and org, with reverification started at 90 days or more (target 100%)
  - I-9 Section 2 within 3 business days for US starts
  - people who started while an export license was still pending (should be 0)
  - required training and policy acknowledgments as a summary that links to Talent > Learning, not a copy of it
  - statutory deadlines in the next 60 days for the jurisdictions where people work
- **Reference data:** the statutory calendar is bundled from the Atlas repo's `data/country-*.json` into `src/data/reference/`.

### Leave & return to work (HR ops sub-tab)
- **Data:** leave start and return-from-leave transactions, paired per person. Two optional new transaction fields: `leaveReason`, using the Atlas's 9 categories at category level only (no medical detail), and `expectedReturnDate`.
- **Figures:**
  - on leave now, by reason and org
  - median leave length
  - returns in the next 30 days, with the LV-03 check that systems are ready
  - return rate
  - retention 12 months after return (target 90%), with a parental-leave cut when reasons are loaded
  - leavers within 6 months of returning, shown to HR only
- Groups under 5 are hidden, as everywhere else.

### Listening: the survey program (you asked for more surveys)
One survey framework covers every listening point across the employee and candidate lifecycle.
A new **Listening** folder tab holds the detail. Each survey's headline result also shows up as a
KPI or finding in the view it belongs to, as one number that links to Listening (not a second copy
of the charts).

| Survey | When it is sent | What it tells you | Also shows up in |
|---|---|---|---|
| Candidate experience | After each interview stage and after a decline | Candidate NPS by stage, source and recruiter; why candidates declined | Recruiting > Sources & offers |
| Hiring manager satisfaction | When a req is filled | Satisfaction with speed, slate quality and communication, by recruiter | Recruiting > Requisitions |
| Onboarding pulse, Day 30 and Day 90 | 30 and 90 days after the start | Week-1 readiness ("I had what I needed"), role clarity, manager support | Onboarding > First 90 days |
| Stay interviews | Twice a year for key talent | What keeps people and what would make them leave | Talent > Retention risk |
| Exit survey | At notice of resignation | Primary reason (the 12-reason taxonomy), driver gaps between regretted and other leavers, would they return | People stats > Attrition |
| Manager feedback (upward) | Twice a year | Manager effectiveness themes. Manager cuts only at 10 or more respondents over four quarters. | People stats > Org design |
| HR service survey | When a case is resolved | Satisfaction and effort by category and channel; extends today's case CSAT | HR ops > Cases |
| Return to work | 30 days after returning from leave | Was the return smooth (systems ready, manager check-in) | HR ops > Leave & return |
| Training evaluation | After a course | Course usefulness and relevance, by course | Talent > Learning |
| Engagement and eNPS (off) | Quarterly pulse | Engagement and eNPS by org | Off by default, behind one switch, because you turned it off before. Say the word to enable it. |

**Listening tab:**
- **Overview:** every survey program with its latest wave, response rate against target, score and trend, plus a calendar of waves.
- **One sub-tab per area:** Candidates & hiring · Onboarding · Stay & exit · Managers · Services & learning.
- **Each survey gets:**
  - score by driver against its target
  - a driver heat table across org, location and tenure
  - change since the last wave
  - response rate
  - a readout that ties results to the operational numbers, e.g. "Day-30 'I had what I needed' is 3.4 in APAC; laptops shipped late for 41% of APAC starts"

**Data:** one new dataset, **Survey responses**, in long format (one row per answer), so any
survey tool export maps into it:
- `survey`, `wave`, `responseDate`
- `respondentKey`: an employee ID, or an application ID for candidates. Used only to join org, stage or req attributes; never displayed.
- `item`, `driver`, `score`, `scale` (1-5 or 0-10)
- optional `reason`

An optional **Survey items** sheet maps question codes to drivers and holds targets. Free-text
comments are not imported (privacy).

**Sample data:** waves for each survey, with stories tied to the existing ones:
- low candidate scores at the Design Verification onsite (the bottleneck story)
- one recruiter with low hiring-manager satisfaction
- low Day-30 readiness in APAC (the laptop story)
- "career growth" as the top stay risk for DV L4-L5 (the overdue-promotion story)
- "base salary" as the top exit reason in Bengaluru (the pay story)
- low upward feedback for the Austin Physical Design manager (the regretted-exits story)

**Privacy (the one exception to click-down):** survey numbers drill to grouped counts, never to an individual's answers.
- Groups need 5 or more respondents.
- Manager cuts need 10 or more over four quarters (Atlas rules).
- Nothing below the minimum is shown, and the panel says why.

## Order

1. Finish the drill-down wave already running, then build the one-file version and a shareable link.
2. Onboarding with upcoming starts and the hiring plan (Part 1).
3. People scorecard and Action center, which share the new `summary` and `actions` contracts.
4. Listening: the survey dataset, sample waves, the Listening tab, and one linked number per related view.
5. Leave & return to work (HR ops sub-tab).
6. Compliance & right to work.

Each step uses the same process as before:
- builders work on separate folders against `ARCHITECTURE.md`
- an independent reviewer recomputes the numbers from raw rows
- fixers apply the findings
- `npm run verify` runs, then a browser check in light, dark and 375 px
