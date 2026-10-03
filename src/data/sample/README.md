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
| `employees.ts` | hire dates, leavers, contractors and interns, job history, employee IDs; employee and job-change rows |
| `recruiting.ts` | requisitions and candidates |
| `services.ts` | HR cases and HR transactions |
| `talent.ts` | ratings, reviews, succession, learning |
| `comp.ts` | compensation |

## Sizes

| Dataset | Rows | Notes |
|---|---|---|
| employees | 2,004 | 1,450 active employees, 83 active contractors, 25 active interns, 446 leavers (406 employees, 40 contractors and interns) |
| jobChanges | 1,795 | 668 promotions, 218 transfers, 91 lateral moves, 4 demotions, 814 manager changes |
| requisitions | 556 | 114 Open, 15 On hold, 399 Filled, 28 Cancelled |
| candidates | 9,279 | 457 Active, 7,708 Rejected, 484 Withdrawn, 105 Declined, 525 Hired |
| cases | 6,645 | 24 months from 1 Oct 2024; about 270 a month; 48 open |
| transactions | 3,506 | 540 New hire, 321 Termination, 486 Job change, 514 Compensation change, 257 Leave start, 214 Return from leave, 70 Location change, 1,104 Personal data change |
| reviews | 5,155 | 4 cycles, 1,232 to 1,338 people each |
| succession | 90 | 55 roles (28 Critical, 27 Key), one row per successor; roles with nobody named have one row with a blank successor |
| learning | 10,964 | 5,781 Compliance, 1,507 Security, 1,080 Onboarding, 684 Leadership, 1,912 Technical |
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
- First-year attrition: the cohort hired 1 Oct 2024 to 30 Sep 2025; share who left within 365 days of hire.
- SLA attainment: resolved cases with `resolvedAt − openedAt` (calendar hours) ≤ `resolutionTargetHours`.
- Overdue learning: not completed and `dueDate` < as-of.
- Compa-ratio = `baseSalary / rangeMid`; merit spend = Σ(`meritPct` × base in USD) ÷ Σ(base in USD) over people with a proposal.
- "Latest rating" = 2026 Mid-year, falling back to 2025 Annual. Potential exists only on Annual cycles.

## Distributions worth knowing

- **Hiring**: 269 employees hired in T12. Hire dates fall on Mondays (fall interns start Tuesday 8 Sep 2026, after Labor Day); IDs follow hire order.
- **Exits (T12)**: 166 employee exits, 130 voluntary. Total attrition 12.0%, voluntary 9.4%, regretted 4.8%. Involuntary reasons: Performance, Conduct, Reduction in force (a 12-person RIF on 19 Jan 2024 in Corporate, Operations and Go-to-Market), End of contract (contractors and interns only).
- **Movement (T12)**: promotions 10.8% of average headcount, transfers 6.5%. Promotions take effect on 1 March or 1 September. Every person's job history chains from their hire level and department to today's level, department and manager; when a manager joined after their report, a Manager change on the manager's start date is recorded. 4 demotions from M1 back to an individual contributor level (Sep 2025 and Mar 2026) are the latest level change for those people.
- **Ratings** follow the guideline (3/10/52/25/10%) outside Go-to-Market: 4-5 share is 34% outside Go-to-Market. Potential (Annual cycles): Low 19%, Moderate 63%, High 19%. Reviews cover employees active and at least 90 days in role on the cycle date (2024 Annual 15 Dec 2024, 2025 Mid-year 30 Jun 2025, 2025 Annual 15 Dec 2025, 2026 Mid-year 30 Jun 2026). `reviewerId` is the manager on the cycle date.
- **Recruiting**: 525 hired candidates: 487 people in the roster (matched by name, hired before their start date), 28 internal moves (`source: 'Internal'`) and 10 recent accepts who start after the as-of date. Filled reqs have `filledDate` = their last hire's `hiredDate` and `openings` = number of hires. India notice periods are 60-92 days, Germany 45-95. Every open req older than 45 days (except the planted four) has a candidate who reached the hiring manager.
- **Active pipeline**: 457 active candidates (Applied 220, Screen 106, Hiring manager 61, Onsite 59, Offer 11). 144 of 226 interviewing candidates (64%) have a `nextEventDate`: 68 scheduled within the next 10 days, 76 awaiting feedback 1-6 days after the event.
- **Cases**: category shares roughly Payroll 18%, Benefits 14%, HR data & records 13%, Employment verification 12%, Systems access 9%, Leave & accommodation 7%, Policy question 7%, Onboarding 6%, Offboarding 4%, Compensation & equity 4%, Immigration & mobility 4%, Employee relations 2%. Channels: Portal 47%, Email 24%, Chat 18%, Phone 10%, Walk-in 2%. Benefits doubles each November (open enrollment). CSAT on 35% of resolved cases; reopened 4.4%; escalated 5.8%. Employee relations cases never carry a subcategory.
- **Transactions**: due dates come from the governing process: New hire = 3 business days before start; Termination = final-pay rule by jurisdiction (us-ca same day; us-tx involuntary +6 calendar days; us-co involuntary same day; in +2 working days; vn +14 working days; everyone else the first Friday at least 7 days after the exit, so +7 to +13); Job, Compensation and Location changes = payroll cut-off (5 business days before the month end of the effective date, or the next month's when the effective date is past it); Leave start and Return = the effective date; Personal data change = 2 business days. `retro` is set on Job and Compensation changes only (true when completed after due; 75 of 1,000). 17 transactions are still open.
- **Learning**: the 2026 compliance campaign (Code of conduct, Insider trading, Anti-harassment, Export control & trade compliance, Information security) was assigned on 13 Jul 2026, due 26 Aug 2026, to everyone active that day (contractors and interns get Code of conduct and Information security only); 2.8% of non-export-control campaign courses are overdue. New hires in the last 24 months get two Onboarding courses (due +30 and +45 days); San Jose hires after the campaign get Anti-harassment due within 6 months (California rule). Leadership and Technical courses are optional.
- **Compensation**: local currency by site with `fxToUsd` (CAD 0.73, EUR 1.09, ILS 0.27, INR 0.012, TWD 0.031, CNY 0.14, VND 0.000039). Range midpoints by level and site zone; San Jose L3 165,000 / L5 235,000 / M2 285,000 USD; Austin and Boulder 0.90, Raleigh 0.88, Seattle 0.97, Canada 0.72, Munich 0.68, Haifa 0.70, Hsinchu 0.42, Shanghai 0.38, Bengaluru 0.26, Ho Chi Minh City 0.20 of San Jose in USD terms. Min = 80% and max = 120% of mid. Company median compa-ratio 0.98. Target bonus 10% (L1) to 60% (E3), 30-40% for Sales; last payout 0.8-1.2 of target, blank for people hired after 1 Oct 2025. Merit proposals belong to the FY2027 focal cycle, drafted against the latest rating; 1,299 people have one (blank for people hired after 1 Apr 2026). 104 people (8.0%) have a `promotionPct`. `lastIncreaseDate` is the 1 Nov 2025 merit or a later promotion.

## Planted stories

Each story lists where it lives, how to find it, and the measured magnitude.

### Recruiting

1. **Onsite-to-offer bottleneck in Design Verification this quarter.** `candidates` joined to `requisitions.department`. For candidates with `offerDate` in 1 Jul-30 Sep 2026, median days `onsiteDate → offerDate`: Design Verification **27 d** vs **8 d** for every other department (3.4×), vs 9 d for Design Verification in the first half of 2026. Other stage transitions run about 7 d (Screen → Hiring manager). 28 of the 59 active candidates at Onsite are in Design Verification, some for up to 24 days.
2. **Offer acceptance is falling, driven by Bengaluru.** Acceptance = hired ÷ (hired + declined), by `hiredDate` / `rejectedDate` (status Declined) in the quarter. Q1 2026 84.1%, Q2 2026 **84.8%**, Q3 2026 **68.2%** (58 of 85). Bengaluru reqs in Q3: 31.3% (10 of 32) vs 90.6% elsewhere; 22 of the 27 Q3 declines are on Bengaluru reqs, with reasons 'Accepted competing offer' (13), 'Compensation below expectations' (8), 'Counteroffer from current employer' (1). Bengaluru was 93.5% in Q2.
3. **Candidates without a next step; feedback stuck with two hiring managers.** Active candidates not at Offer, with no `nextEventDate` and more than 14 days since `stageEnteredDate`: **91 of 457 (19.9%)**, held at 20% by design. Awaiting feedback (`nextEventDate` in the past): 76 items, of which **Ji-woo Lim** (Design Verification, San Jose) owns **33** and **Hannah Smith** (Software, Seattle) owns **22** through their open reqs (72% together); nobody else has more than 2.
4. **Critical analog reqs stuck at the screen.** Open, `priority` Critical, older than 75 days, and no candidate ever reached `hmDate`: exactly **4**, all Analog & Mixed-Signal: REQ-4413 Principal SerDes Design Engineer (San Jose, 124 d), REQ-4425 Staff Mixed-Signal Design Engineer (Boulder, 111 d), REQ-4441 Staff Analog Design Engineer (Boulder, 96 d), REQ-4454 Staff Analog Design Engineer (San Jose, 82 d). No other open req of any priority is older than 75 days with nobody past Screen.
5. **Sources.** All candidates: Referral has the best hire rate (**20.6%** hired ÷ applications; next best Agency 6.7%, Sourced 6.6%); Agency has the lowest offer acceptance (**55.3%**; Job board 72.2%, all others 80%+). Job board applications by `appliedDate`: **680 → 356 (−47.6%)** prior 12 months vs T12.
6. **Time to fill.** Filled reqs with `filledDate` in T12, median days `openedDate → filledDate`: overall **52 d**; L5, L6, M2 and E levels **103 d**; Analog & Mixed-Signal **127 d**; L1-L4 49 d.

### HR business partners

1. **Regretted attrition cluster under one manager.** T12 voluntary exits with `regrettable` true and `terminationReason` 'My manager', grouped by `managerId`: **Heather Hayes** (E10599, Physical Design Manager, Austin) has **5** (exits in Nov 2025, Jan, Mar, May and Aug 2026). No other manager has more than 2. Three of her six current reports were hired in 2026 as backfills.
2. **Bengaluru attrition.** T12 voluntary attrition in Bengaluru **18.8%** (57 exits) vs **9.4%** for the company (2.0×). Top reasons: 'Career growth or promotion' 20, 'Base salary' 18.
3. **First-year attrition in Go-to-Market.** 2024-10-01..2025-09-30 hire cohort: Go-to-Market **27.0%** (10 of 37; Sales 7 of 18) vs **8.3%** for the rest of the company (11.5% overall).
4. **Span outliers** (active direct reports, all worker types): **3 managers with 12+**: Nisha Iyer (IT, Bengaluru) 12, Rohan Murthy (Software, Bengaluru) 13, Wei-Lun Lee (Test & Product Engineering, Hsinchu) 14. **4 people with exactly 1**: Director, Hardware Engineering (Boulder); Director, Tax & Treasury; Product Marketing Lead; Legal Operations Manager. **1 new manager with 8+**: Arjun Deshpande (Digital Design, Bengaluru, hired 16 Feb 2026 as M1) with 9. No manager promoted into M1 in the last 18 months has 8+ reports.
5. **Growth.** Headcount 30 Sep 2025 → 30 Sep 2026: Silicon Engineering **488 → 556 (+13.9%)**; Corporate **196 → 196 (flat)**; Systems & Software +6.0%, Operations +4.3%, Go-to-Market +5.1%.
6. **Company baseline.** Voluntary 9.4%, total 12.0%, regretted 4.8% (T12, annualized over average headcount).

### Employee services

1. **Payroll spike in July 2026.** Payroll cases opened in July 2026: **118** vs a median **45** per month (2.6×). SLA attainment for those cases **60.2%** vs **92.0%** for payroll in other months. Company-wide attainment **89.7%**.
2. **Leave & accommodation.** SLA attainment **69.9%** (resolved cases). Of 15 open leave cases, **13** are 'Waiting on third party' (10 of them planted, opened 9-27 days before the as-of date and past their 7-day target).
3. **Final pay timeliness.** `transactions` type Termination, completed ones, late when `completedDate > dueDate`. San Jose involuntary exits **26.7%** late (8 of 30); Bengaluru (in) **25.5%** late (25 of 98); everyone else **3.2%** late (6 of 189). Exact shares are planted for the two risk groups.
4. **New hire Day -3 readiness.** `transactions` type New hire, ready when `completedDate <= dueDate`. Asia Pacific sites (Bengaluru, Hsinchu, Shanghai, Ho Chi Minh City) **84.9%** ready (36 of 238 late) vs **97.4%** elsewhere.
5. **CSAT and reopens.** Mean `csat`: Email **3.61**, Portal **4.44**, Chat **4.45**, Phone 4.28, Walk-in 4.31. Reopen rate: HR data & records **14.0%** vs 2.9% for other categories.
6. **Immigration backlog.** Open Immigration & mobility cases opened more than 30 days ago: **15** (opened 35-140 days ago). No other category except Employee relations has open cases older than 30 days.

### Talent

1. **Go-to-Market rating inflation.** Share rated 4-5 across all four cycles: Go-to-Market **44.9%** (per cycle 49%, 47%, 39%, 46%) vs **34.0%** elsewhere (guideline 35%).
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
5. **Analog market gap.** Median `baseSalary / marketP50`: Analog & Mixed-Signal **0.92** vs 0.98 for everyone else (market medians for analog jobs sit 10% above range midpoints; other jobs within ±3%).
6. **No merit differentiation in Firmware.** Mean merit by latest rating 1-5 in Firmware: 2.90%, 2.85%, 2.85%, 2.86%, 2.83% (flat). Elsewhere outside Go-to-Market: 0.2%, 1.2%, 3.1%, 4.5%, 5.9%.

## Fields that may be in the future

`candidates.nextEventDate` (scheduled interviews), `requisitions.targetStartDate`, and the deadline
fields `transactions.dueDate` and `learning.dueDate`. Everything else is on or before 30 Sep 2026;
case timestamps end by 30 Sep 2026 23:59.
