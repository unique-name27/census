# Sample company: Northgate Semiconductor

`generateSample()` returns all ten datasets for a fictional Nasdaq-listed fabless semiconductor
company, founded March 2014, as of **30 Sep 2026** (`SAMPLE_AS_OF`). Everything is seeded
(mulberry32, fixed seed, one named stream per module), so every call returns identical rows. It runs
in about 0.2 s in Node.

All names are fictional combinations from site-appropriate name pools. There are no protected-class
fields anywhere.

Numbers below are measured from the generated rows with the Census conventions (see "How the numbers
are measured"). `sample.test.ts` asserts every story with tolerances, so the rows below hold as long
as those tests pass. Employee, requisition and role IDs are quoted for convenience; tests should
find planted entities from the data (for example "the manager with 4+ regretted 'My manager' exits")
rather than hard-code IDs.

## Modules

| File | What |
|---|---|
| `index.ts` | `generateSample()`, `SAMPLE_AS_OF`, `SAMPLE_COMPANY`; runs the pipeline in order |
| `prng.ts` | `Rng` (mulberry32) and `rngFor(stream)` |
| `calendar.ts` | integer day arithmetic, weekdays, ISO conversion |
| `names.ts` | name pools per site, unique-name book |
| `departments.ts` | business units, departments (sites, level mix, career tracks), executive layer, cost centers |
| `titles.ts` | IC level draws and title ladders |
| `org.ts` | today's reporting structure (generic team builder, Executive Office, People team) |
| `model.ts` | internal `Person`/`World` working types |
| `employees.ts` | hire dates, leavers, contractors and interns, first-year exits in the earlier hire cohorts, job history, employee IDs; employee and job-change rows |
| `recruiting.ts` | requisitions and candidates |
| `services.ts` | HR cases and HR transactions (final pay deadlines by jurisdiction) |
| `talent.ts` | ratings, reviews, succession, learning |
| `comp.ts` | compensation |
| `raw/` | the messy sample: raw extracts, the gaps in the certified datasets, starter tiers, and `jobFunction` from the business unit (see "The messy sample") |

People added after a module's stories were calibrated get that module's rows from a separate stream:
the first-year leavers of the earlier hire cohorts (tag `prior-first-year-leaver`) draw their cases from
`cases-late-additions` and their transactions from `transactions-late-additions`, so adding them left
every calibrated case and transaction exactly as it was.

## Sizes

| Dataset | Rows | Notes |
|---|---|---|
| employees | 2,055 | 1,450 active employees, 83 active contractors, 25 active interns, 497 leavers (457 employees, 40 contractors and interns) |
| jobChanges | 1,797 | 668 promotions, 218 transfers, 91 lateral moves, 4 demotions, 816 manager changes |
| requisitions | 556 | 114 Open, 15 On hold, 399 Filled, 28 Cancelled |
| candidates | 9,279 | 457 Active, 7,708 Rejected, 484 Withdrawn, 105 Declined, 525 Hired |
| cases | 6,676 | 24 months from 1 Oct 2024; about 280 a month; 48 open |
| transactions | 3,526 | 540 New hire, 341 Termination, 486 Job change, 514 Compensation change, 257 Leave start, 214 Return from leave, 70 Location change, 1,104 Personal data change |
| reviews | 5,169 | 4 cycles, 1,245 to 1,338 people each |
| succession | 90 | 55 roles (28 Critical, 27 Key), one row per successor; roles with nobody named have one row with a blank successor |
| learning | 10,984 | 5,781 Compliance, 1,507 Security, 1,080 Onboarding, 684 Leadership, 1,932 Technical |
| comp | 1,450 | one row per active employee (not contractors or interns) |

## The company

**Business units and departments** (active employees today; HC 12 months ago in brackets for BUs):

- Silicon Engineering 556 [488]: Architecture 46, Digital Design 128, Design Verification 150, Physical Design 112, Analog & Mixed-Signal 70, DFT 50
- Systems & Software 337 [318]: Firmware 90, Software 122, Systems Validation 70, Hardware Engineering 55
- Operations 170 [163]: Test & Product Engineering 92, Supply Chain 44, Quality & Reliability 34
- Go-to-Market 184 [175]: Sales 86, Field Applications 64, Product Marketing 34
- Corporate 196 [196]: Finance 50, People 46, Legal 20, IT 50, Facilities 30
- Executive Office 7 [7]

**Sites** (active employees): San Jose 491, Bengaluru 319, Hsinchu 146, Austin 117, Shanghai 91,
Munich 48, Raleigh 47, Boulder 40, Haifa 39, Seattle 38, Ho Chi Minh City 33, Toronto 27,
Vancouver 14. Contractors cluster in Bengaluru, Hsinchu, Shanghai and Ho Chi Minh City.

**Levels** (active employees): L1 65, L2 191, L3 314, L4 293, L5 219, L6 105, M1 200, M2 43,
E1 12, E2 4, E3 4. Bengaluru, Shanghai and Ho Chi Minh City skew a step junior.

**Hierarchy**: CEO (E3, `E10001`) → C-suite and SVPs (COO, CRO, CFO at E3; SVP Silicon Engineering,
SVP Systems & Software, Chief People Officer, General Counsel at E2) → 12 VPs (E1) → directors (M2)
→ managers (M1) → ICs. Every `managerId` resolves; only the CEO has none. 263 people have active
direct reports; the median span (excluding the planted outliers) is 6, and over 85% of spans are 4-8.
Contractors and interns report to regular managers and count in `managerId`-based spans.

**HR team** (all are People department employees, so their names resolve in the roster):

- HRBP per business unit (`hrbp` field): Silicon Engineering Michael Thomas, Systems & Software Amanda Sullivan, Operations Ya-Wen Chang, Go-to-Market Thu Trang Vo, Corporate Sara Karimi, Executive Office Bhavana Joshi (Director, HR Business Partners).
- 9 recruiters (`requisitions.recruiter`, `candidates.recruiter`) with uneven loads: Agnieszka Nielsen (San Jose, Silicon Engineering) carries 29 open reqs and 136 active candidates; Andreas Schmitz (Munich, EMEA) carries 8 and 18.
- 4 coordinators (`candidates.coordinator`, set once a candidate reaches the hiring manager stage).
- 14 case agents (`cases.assignee`) across the teams Payroll, Benefits, Leave & accommodation, People operations, HRIS, Global mobility, Employee relations and Total rewards. Tier 0 (self-service) cases have no assignee.

**IDs**: employees `E10001`… in hire order; requisitions `REQ-4001`… in opened order; applications
`APP-200001`… and candidates `CAN-500001`… in applied order; cases `HR-100001`… and transactions
`TX-300001`… in opened or submitted order; succession roles `SP-001`…; cost centers
`<department code>-<site code>` (for example `1130-BLR`).

## How the numbers are measured

- Windows: last 12 months = 1 Oct 2025 to 30 Sep 2026 (T12); the prior 12 months = 1 Oct 2024 to 30 Sep 2025.
- Headcount and rates count `employmentType === 'Employee'` only. Average headcount is the mean of 13 month-end snapshots (30 Sep 2025 … 30 Sep 2026) = 1,383.1. Attrition = T12 exits ÷ average headcount.
- Active on day d: `hireDate <= d` and (`terminationDate` empty or `> d`).
- First-year attrition: the cohort hired 1 Oct 2024 to 30 Sep 2025 (12-24 months before the as-of date); share who left within 365 days of hire. "A year earlier" is the cohort hired 1 Oct 2023 to 30 Sep 2024.
- SLA attainment: resolved cases with `resolvedAt − openedAt` (calendar hours) ≤ `resolutionTargetHours`.
- Overdue learning: not completed and `dueDate` < as-of.
- Compa-ratio = `baseSalary / rangeMid`; merit spend = Σ(`meritPct` × base in USD) ÷ Σ(base in USD) over people with a proposal.
- "Latest rating" = 2026 Mid-year, falling back to 2025 Annual. Potential exists only on Annual cycles.

## Distributions worth knowing

- **Hiring**: 269 employees hired in T12. Hire dates fall on Mondays (fall interns start Tuesday 8 Sep 2026, after Labor Day); IDs follow hire order.
- **Exits (T12)**: 166 employee exits, 130 voluntary. Total attrition 12.0%, voluntary 9.4%, regretted 4.8%. The prior 12 months: 147 exits, 114 voluntary, 11.2% total and 8.6% voluntary over an average headcount of 1,318.0. Involuntary reasons: Performance, Conduct, Reduction in force (a 12-person RIF on 19 Jan 2024 in Corporate, Operations and Go-to-Market), End of contract (contractors and interns only). Background exits start on 1 Oct 2023; the only earlier exits are 11 first-year leavers from the 2022-2023 hire cohort (the first on 15 Feb 2023), so rates for windows before October 2023 are not meaningful.
- **First-year exits**: about 11% of every hire cohort leaves within a year: 10.3% of people hired 1 Oct 2022 to 30 Sep 2023 (21 of 204), 11.1% of those hired 1 Oct 2023 to 30 Sep 2024 (30 of 270) and 11.5% of those hired 1 Oct 2024 to 30 Sep 2025 (25 of 218, where Go-to-Market is the outlier; see HRBP story 3). They leave 75 to 330 days after starting: 70% resign (most often 'The work itself', 'Workload or burnout' or 'Equity, bonus or total rewards'), the rest are dismissed for performance.
- **Movement (T12)**: promotions 10.8% of average headcount, transfers 6.5%. Promotions take effect on 1 March or 1 September. Every person's job history chains from their hire level and department to today's level, department and manager; when a manager joined after their report, a Manager change on the manager's start date is recorded. 4 demotions from M1 back to an individual contributor level (Sep 2025 and Mar 2026) are the latest level change for those people.
- **Ratings** follow the guideline (3/10/52/25/10%) outside Go-to-Market: 4-5 share is 33.9% outside Go-to-Market. Potential (Annual cycles): Low 19%, Moderate 63%, High 19%. Reviews cover employees active and at least 90 days in role on the cycle date (2024 Annual 15 Dec 2024, 2025 Mid-year 30 Jun 2025, 2025 Annual 15 Dec 2025, 2026 Mid-year 30 Jun 2026). `reviewerId` is the manager on the cycle date.
- **Recruiting**: 525 hired candidates: 487 people in the roster (matched by name, hired before their start date), 28 internal moves (`source: 'Internal'`) and 10 recent accepts who start after the as-of date. Filled reqs have `filledDate` = their last hire's `hiredDate` and `openings` = number of hires. India notice periods are 60-92 days, Germany 45-95. Every open req older than 45 days (except the planted four) has a candidate who reached the hiring manager.
- **Active pipeline**: 457 active candidates (Applied 220, Screen 106, Hiring manager 61, Onsite 59, Offer 11). 144 of 226 interviewing candidates (64%) have a `nextEventDate`: 68 scheduled within the next 10 days, 76 awaiting feedback 1-6 days after the event.
- **Cases**: category shares roughly Payroll 18%, Benefits 14%, HR data & records 13%, Employment verification 12%, Systems access 9%, Leave & accommodation 7%, Policy question 7%, Onboarding 6%, Offboarding 4%, Compensation & equity 4%, Immigration & mobility 4%, Employee relations 2%. Channels: Portal 47%, Email 24%, Chat 18%, Phone 10%, Walk-in 2%. Benefits doubles each November (open enrollment). CSAT on 35% of resolved cases; reopened 4.4%; escalated 5.8%. Employee relations cases never carry a subcategory.
- **Transactions**: due dates come from the governing process: New hire = 3 business days before start; Termination = the final pay deadline for the leaver's jurisdiction and exit type, as `FINAL_PAY_RULES` in `src/views/services/engine/catalog.ts` states it (the day of termination in us-ca, tw and cn; us-tx involuntary +6 calendar days; us-co involuntary the same day; us-wa the end of the semi-monthly pay period, the 15th or the month end; us-nc, and resignations in us-tx and us-co, the next regular payday; Ontario (Toronto) the later of 7 days or the next payday; British Columbia (Vancouver) +2 days after a termination and +6 after a resignation; de the normal month-end pay date, the last business day of the month; il the 9th of the following month; in +2 working days; vn +14 working days).; Job, Compensation and Location changes = payroll cut-off (5 business days before the month end of the effective date, or the next month's when the effective date is past it); Leave start and Return = the effective date; Personal data change = 2 business days. `retro` is set on Job and Compensation changes only (true when completed after due; 75 of 1,000). 15 transactions are still open. US and Canadian paydays are semi-monthly, on the 15th and the last day of the month (the business day before when that falls on a weekend).
- **Learning**: the 2026 compliance campaign (Code of conduct, Insider trading, Anti-harassment, Export control & trade compliance, Information security) was assigned on 13 Jul 2026, due 26 Aug 2026, to everyone active that day (contractors and interns get Code of conduct and Information security only); 2.8% of non-export-control campaign courses are overdue. New hires in the last 24 months get two Onboarding courses (due +30 and +45 days); San Jose hires after the campaign get Anti-harassment due within 6 months (California rule). Leadership and Technical courses are optional.
- **Compensation**: local currency by site with `fxToUsd` (CAD 0.73, EUR 1.09, ILS 0.27, INR 0.012, TWD 0.031, CNY 0.14, VND 0.000039). Range midpoints by level and site zone; San Jose L3 165,000 / L5 235,000 / M2 285,000 USD; Austin and Boulder 0.90, Raleigh 0.88, Seattle 0.97, Canada 0.72, Munich 0.68, Haifa 0.70, Hsinchu 0.42, Shanghai 0.38, Bengaluru 0.26, Ho Chi Minh City 0.20 of San Jose in USD terms. Min = 80% and max = 120% of mid. Company median compa-ratio 0.98. Target bonus 10% (L1) to 60% (E3), 30-40% for Sales; last payout 0.8-1.2 of target, blank for people hired after 1 Oct 2025. Merit proposals belong to the FY2027 focal cycle, drafted against the latest rating; 1,299 people have one (blank for people hired after 1 Apr 2026). 104 people (8.0%) have a `promotionPct`. `lastIncreaseDate` is the 1 Nov 2025 merit or a later promotion.

## Planted stories

Each story lists where it lives, how to find it, and the measured magnitude.

### Recruiting

1. **Onsite-to-offer bottleneck in Design Verification this quarter.** `candidates` joined to `requisitions.department`. For candidates with `offerDate` in 1 Jul-30 Sep 2026, median days `onsiteDate → offerDate`: Design Verification **27 d** vs **8 d** for every other department (3.4×), vs 9 d for Design Verification in the first half of 2026. Other stage transitions run about 7 d (Screen → Hiring manager). 28 of the 59 active candidates at Onsite are in Design Verification, some for up to 24 days.
2. **Offer acceptance is falling, driven by Bengaluru.** Acceptance = hired ÷ (hired + declined), by `hiredDate` / `rejectedDate` (status Declined) in the quarter. Q1 2026 84.1%, Q2 2026 **84.8%**, Q3 2026 **68.2%** (58 of 85). Bengaluru reqs in Q3: 31.3% (10 of 32) vs 90.6% elsewhere; 22 of the 27 Q3 declines are on Bengaluru reqs, with reasons 'Accepted competing offer' (13), 'Compensation below expectations' (8), 'Counteroffer from current employer' (1). Bengaluru was 93.5% in Q2.
3. **Candidates lacking a next step; interview decisions stuck with two hiring managers.** Measured with the Recruiting view's tiered rule (`src/views/recruiting/engine/nextStep.ts`): an active candidate lacks a next step when the clock for its state passes a tier. Nothing booked: more than 1.5× the stage norm (watch) or 2.5× (overdue), where the norm is the median days to the next stage (4 d from Applied, 7 d from Screen, 8 d from Hiring manager and from Onsite). Interview held with no decision: more than 2 days (watch) or 5 (overdue). Offer out: more than 5 days (watch) or 10 (overdue). **172 of 457** active candidates (37.6%) lack a next step, 98 of them overdue: **86** are applications waiting for review, 42 need scheduling, **39** need an interview decision and 5 offers wait on an answer. **Ji-woo Lim** (Design Verification, San Jose) owns **20** of the 39 decisions and **Hannah Smith** (Software, Seattle) **9** (74% together); nobody else has more than 2. Counting every candidate whose interview has passed without a stage move (`nextEventDate` 1-6 days before the as-of date), 76 are awaiting feedback: 33 on Ji-woo Lim's reqs and 22 on Hannah Smith's (72% together), nobody else more than 2. On the simpler rule (not at Offer, no `nextEventDate`, more than 14 days in stage) 91 of 457 (19.9%) have no next step.
4. **Critical analog reqs stuck at the screen.** Open, `priority` Critical, older than 75 days, and no candidate ever reached `hmDate`: exactly **4**, all Analog & Mixed-Signal: REQ-4413 Principal SerDes Design Engineer (San Jose, 124 d), REQ-4425 Staff Mixed-Signal Design Engineer (Boulder, 111 d), REQ-4441 Staff Analog Design Engineer (Boulder, 96 d), REQ-4454 Staff Analog Design Engineer (San Jose, 82 d). No other open req of any priority is older than 75 days with nobody past Screen.
5. **Sources.** All candidates: Referral has the best hire rate (**20.6%** hired ÷ applications; next best Agency 6.7%, Sourced 6.6%); Agency has the lowest offer acceptance (**55.3%**; Job board 72.2%, all others 80%+). Job board applications by `appliedDate`: **680 → 356 (−47.6%)** prior 12 months vs T12.
6. **Time to fill.** Filled reqs with `filledDate` in T12, median days `openedDate → filledDate`: overall **52 d**; L5, L6, M2 and E levels **103 d**; Analog & Mixed-Signal **127 d**; L1-L4 49 d.
7. **Hiring surge in Q3 2026.** Open reqs at each month end (status Open, or Filled or Cancelled after that day; On hold is not counted): 32 on 30 Sep 2025, 42 on 31 Dec, 50 on 31 Mar 2026, **58 on 30 Jun**, then 64, 91 and **114 on 30 Sep 2026**. Reqs opened per month ran 15-23 from October 2025 to April 2026, 29-30 in May and June, and 34, 44 and 35 in July, August and September; 99 of the 114 open reqs were opened in Q3, while 51 reqs were filled in Q3 (63 in Q2). Silicon Engineering holds 63 of the open reqs, Systems & Software 25, Operations 14, Go-to-Market 11 and Corporate 1. Read it as the second-half hiring plan released in July. Planted on purpose and kept rather than smoothed: it fits the rest of the company (Silicon Engineering +13.9% and still growing, the Design Verification onsite queue, Bengaluru declines), and it is why the Open reqs tile reads +82 against a year earlier, why 220 of the 457 active candidates are still at Applied, and why Agnieszka Nielsen carries 29 open reqs.

### HR business partners

1. **Regretted attrition cluster under one manager.** T12 voluntary exits with `regrettable` true and `terminationReason` 'My manager', grouped by `managerId`: **Heather Hayes** (E10599, Physical Design Manager, Austin) has **5** (exits in Nov 2025, Jan, Mar, May and Aug 2026). No other manager has more than 2. Three of her six current reports were hired in 2026 as backfills.
2. **Bengaluru attrition.** T12 voluntary attrition in Bengaluru **18.8%** (57 exits) vs **9.4%** for the company (2.0×). Top reasons: 'Career growth or promotion' 20, 'Base salary' 18.
3. **First-year attrition in Go-to-Market.** Share of a hire cohort who left within 365 days of starting. Cohort hired 1 Oct 2024 to 30 Sep 2025: Go-to-Market **27.0%** (10 of 37; Sales 7 of 18) vs **8.3%** for the rest of the company (**11.5%** overall, 25 of 218). The jump is new: the earlier cohorts ran at the company's usual rate, with Go-to-Market below it. Hired 1 Oct 2023 to 30 Sep 2024: **11.1%** (30 of 270; Go-to-Market 2 of 37), the comparison behind the first-year tile's "vs a year earlier" (+0.4 pts for the company). Hired 1 Oct 2022 to 30 Sep 2023: **10.3%** (21 of 204; Go-to-Market 2 of 26). The 51 first-year leavers of those two cohorts all left by 4 Aug 2025.
4. **Span outliers** (active direct reports, all worker types): **3 managers with 12+**: Nisha Iyer (IT, Bengaluru) 12, Rohan Murthy (Software, Bengaluru) 13, Wei-Lun Lee (Test & Product Engineering, Hsinchu) 14. **4 people with exactly 1**: Director, Hardware Engineering (Boulder); Director, Tax & Treasury; Product Marketing Lead; Legal Operations Manager. **1 new manager with 8+**: Arjun Deshpande (Digital Design, Bengaluru, hired 16 Feb 2026 as M1) with 9. No manager promoted into M1 in the last 18 months has 8+ reports.
5. **Growth.** Headcount 30 Sep 2025 → 30 Sep 2026: Silicon Engineering **488 → 556 (+13.9%)**; Corporate **196 → 196 (flat)**; Systems & Software +6.0%, Operations +4.3%, Go-to-Market +5.1%.
6. **Company baseline.** Voluntary 9.4%, total 12.0%, regretted 4.8% (T12, annualized over average headcount). The prior 12 months: voluntary 8.6%, total 11.2%.

### HR ops

1. **Payroll spike in July 2026.** Payroll cases opened in July 2026: **118** vs a median **45** per month (2.6×). SLA attainment for those cases **60.2%** vs **92.0%** for payroll in other months. Company-wide attainment **89.8%**.
2. **Leave & accommodation.** SLA attainment **70.0%** (resolved cases). Of 15 open leave cases, **13** are 'Waiting on third party' (10 of them planted, opened 9-27 days before the as-of date and past their 7-day target).
3. **Final pay timeliness.** `transactions` type Termination, completed ones, late when `completedDate > dueDate`. San Jose involuntary exits **25.8%** late (8 of 31); Bengaluru (in) **25.7%** late (26 of 101); everyone else **3.4%** late (7 of 207). Exact shares are planted for the two risk groups. Every Termination's `dueDate` follows the final pay rule for its jurisdiction (see Distributions).
4. **New hire Day -3 readiness.** `transactions` type New hire, ready when `completedDate <= dueDate`. Asia Pacific sites (Bengaluru, Hsinchu, Shanghai, Ho Chi Minh City) **84.9%** ready (36 of 238 late) vs **97.4%** elsewhere.
5. **CSAT and reopens.** Mean `csat`: Email **3.61**, Portal **4.44**, Chat **4.45**, Phone 4.28, Walk-in 4.30. Reopen rate: HR data & records **14.1%** vs 2.9% for other categories.
6. **Immigration backlog.** Open Immigration & mobility cases opened more than 30 days ago: **15** (opened 47 to 131 days ago). No other category except Employee relations has open cases older than 30 days.

### Talent

1. **Go-to-Market rating inflation.** Share rated 4-5 across all four cycles: Go-to-Market **44.8%** (per cycle 48.4%, 47.0%, 38.7%, 45.5%) vs **33.9%** elsewhere (guideline 35%).
2. **Calibration in Silicon Engineering.** Mean (`preCalibrationRating − rating`): Silicon Engineering **+0.42** vs +0.09 to +0.11 in every other business unit.
3. **High-potential regretted exits.** Employees who left voluntarily on or after 1 Apr 2026, `regrettable` true, with potential High in an Annual review and a latest rating of 4+: exactly **3**: Daniela Herrera (Architecture, San Jose, L5, left 15 May 2026), Lior Azulay (Digital Design, Haifa, L5, 10 Jul 2026), Olivia Hill (Software, Seattle, L4, 4 Sep 2026). Every other regretted voluntary exit since 1 Mar 2026 has no High potential on record.
4. **Succession gaps.** Critical roles with no 'Ready now' successor: **8 of 28 (28.6%)**. Roles whose incumbent is High risk of loss and has no successor at all: exactly **4**: SP-001 VP Physical Design and Analog, SP-002 Director Analog & Mixed-Signal, SP-003 Principal Analog Design Engineer (all Critical), SP-004 Director Supply Chain (Key). Two more roles have nobody named but Low risk (SP-022, SP-049). 10 incumbents are High risk in total.
5. **Export control training overdue.** Course 'Export control & trade compliance' assigned 13 Jul 2026, active people, overdue as of 30 Sep 2026: Operations **32.3%** (54 of 167), Hsinchu **24.1%** (34 of 141), Operations in Hsinchu 37.5%; everyone else **3.7%**.
6. **High performers waiting for promotion.** Active employees below E level, hired on or before 30 Sep 2023, rated 4+ in both 2024 Annual and 2025 Annual, with no Promotion after 30 Sep 2023: **25**, of whom **15** are Design Verification L4-L5.

### Compensation

1. **Bengaluru pay position.** Median compa-ratio Bengaluru **0.88** vs 1.00 for every other site combined.
2. **Range position.** Below range minimum **78 of 1,450 (5.4%)**: 41 in Bengaluru and 35 of the other 37 promoted in the last 12 months. Above maximum **44 (3.0%)**, of whom **42** are L4s with 5.75+ years of tenure.
3. **Pay compression in Design Verification.** L3-L4: hired in T12 median compa-ratio **1.04** (33 people) vs incumbents **0.95** (33 people).
4. **Merit proposals.** Merit spend **3.54%** of base against a 3.5% budget; Go-to-Market **4.31%**; other business units 3.3-3.5%. Exactly **5** people with a latest rating of 5 have merit below 2%, and exactly **6** people rated 1-2 have merit above 3%. Both counts are the same if you join on the 2025 Annual rating instead (the outliers have equal ratings in both cycles).
5. **Analog market gap.** Median `baseSalary / marketP50`: Analog & Mixed-Signal **0.92** vs 0.97 for everyone else (market medians for analog jobs sit 10% above range midpoints; other jobs within ±3%).
6. **No merit differentiation in Firmware.** Mean merit by latest rating 1-5 in Firmware: 2.90%, 2.85%, 2.85%, 2.86%, 2.83% (flat). Elsewhere outside Go-to-Market: 0.2%, 1.2%, 3.1%, 4.5%, 5.9%.

## Fields that may be in the future

`candidates.nextEventDate` (scheduled interviews), `requisitions.targetStartDate`, and the deadline
fields `transactions.dueDate` and `learning.dueDate`. Everything else is on or before 30 Sep 2026;
case timestamps end by 30 Sep 2026 23:59.

## The messy sample

`generateSample()` stays clean so the engine tests can measure the planted stories exactly. The app
loads a messy version of it instead (`src/data/sample/raw`, registered in `main.tsx` with
`setSampleSeed`), the way real data arrives (docs/DATA-TIERS.md, "Sample data that sucks"). Seven
datasets are written out as raw extracts and read back through the real importer
(`sheetFromRows` → `autoMap` → `applyMapping`, with the roster for linking); the version keeps the
original sheet, the mapping and the import log. Every row survives the import, and only the cells
below differ from the clean sample, so every planted story still shows (`raw.test.ts` checks both).

| Dataset | Loads as | Arrives as | What is wrong with it |
|---|---|---|---|
| Employees | Gold | rows, certified by the HRIS team (headcount 1,450 and 166 exits reconcile) | Termination reason is blank for 139 of the 497 leavers (72% filled), all of them exits before 1 Oct 2025 |
| Job changes | Silver | `Job history report.xlsx`: Worker ID, Action Type ("Promotion > Promote employee"), IC level codes; mapping confirmed | 3 promotions before 2023 carry a legacy grade ("G7") as the prior level |
| Requisitions | Silver | `ATS job report.csv`: Job Req ID, Dept, "San Jose, CA", "Closed - Filled", M/D/YYYY; mapping confirmed | 17 closed reqs (3%) have no hiring manager; 3 have the hire reason "Conversion"; the 38 Design Verification and Test & Product Engineering reqs closed before Oct 2025 use the old ATS names "DV" and "Test & Product Eng", which the roster does not have |
| Candidates | Bronze | `ATS candidate export.csv`: first and last name columns, ATS stage and status names, MM/DD/YYYY | 371 applications (4%) have a source spelling the importer does not recognize ("LinkedIn Recruiter", "Indeed") |
| HR cases | Bronze | `Help desk case export.csv`: Case Number, State, HR Service, "1 - Critical", "L0 - Self-service", second timestamps | First response is missing on 534 of the 6,675 cases past New (8%); 165 cases from 2026 carry one of three unmapped help-desk services as their category |
| HR transactions | Silver | `Business process audit.xlsx`: business process names, day-first dates; mapping confirmed | 4 old job changes read "TBC" in the retro column |
| Reviews | Gold | rows, certified by the Talent team after calibration | None |
| Succession | Bronze | `Succession tracker FY26.xlsx`: a title row above the header, "Tier 1", H/M/L, 15-Mar-2026 | 13 of the 84 named successors (15%) are not in the roster: 8 typed as a name, 5 external candidates; 5 incumbent IDs are in lower case |
| Learning | Silver | `LMS completion export.csv`: Training Type ("Compliance Training"), Y/N; mapping confirmed | 5 old optional assignments read "TBC" as the mandatory flag |
| Compensation | Gold | rows, certified by Total rewards (rows and total base in USD reconcile) | Market median is blank for 580 of 1,450 people (60% filled) |

Every choice is drawn from a named stream (`raw-<dataset>`), so the messy sample is as
deterministic as the clean one. Employees get `jobFunction` from the business unit in
`generateSample()` itself: Silicon Engineering and Systems & Software are Engineering, Operations
is Operations, Go-to-Market is Sales & marketing, Corporate is G&A and the Executive Office is
Executive.
