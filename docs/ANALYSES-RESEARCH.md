# Special analyses: research and defaults

Research for the four People stats "Special analyses" asked for on 2026-10-07: quality of hire by
university and degree, why candidates decline offers, engineering resources across the stages of
chip development, and the workforce pyramid by level. Each part gives what the sources say (with a
confidence note), then the defaults Census should use and the sample-data patterns for Northgate.

This is a planning document. Nothing here changes app code.

**Confidence scale used below**

- **High**: read in the primary source, or a well-established fact (a statute, a court case).
- **Medium**: read in a reputable secondary source, or the primary source only in part.
- **Low**: vendor blog, search snippet, single anecdote, or figures that disagree across sources.
- **House default**: no source found; a Census choice, labeled as such so nobody mistakes it for a
  benchmark. Every house default should be an editable setting with the value shown in the
  Formulas index.

Source numbers ([S1] and so on) refer to the list at the end.

---

## 1. Engineering resources across the stages of chip development

### 1.1 What the sources say

**Stages.** Vendors and teaching material agree on the order; they disagree on where a few steps
belong (synthesis is "front end" in some, "implementation" in others).

- Synopsys names five stages: specification and architecture; RTL design and verification;
  synthesis and implementation (place, route, PPA); design for test (DFT) and validation (final
  checks before tapeout); tapeout and fabrication [S4]. *High (fetched).*
- Post-silicon validation is done by a dedicated silicon validation team, separate from the design
  verification team that ran pre-silicon simulation, working in a lab on boards. Bring-up runs in
  steps: power-on and supplies, clock and reset, smoke tests over JTAG, functional validation
  against the spec, then characterization across voltage, temperature and samples, including speed
  binning [S5]. *Medium (fetched; an educational site, not a standards body).*
- Verification is not a single phase: it runs alongside every stage, and design engineers
  themselves spent on average 49% of their time on verification in 2022 [S1]. *High.*

**Verification versus design headcount.** The only survey-based figures are from the Siemens EDA
and Wilson Research Group functional verification studies.

- 2022 IC/ASIC: "about a one-to-one ratio in terms of mean peak number of verification and design
  engineers" across most market segments; in some segments such as processors "it is not unusual
  to find a 5-to-1 ratio" [S1]. The text does not state the direction of the 5-to-1 explicitly; in
  context it reads as verification to design. *High for 1:1; medium for the direction of 5:1.*
- Demand for IC/ASIC verification engineers grew at a 6.2% CAGR from 2007 to 2022, against 2.7%
  for design engineers [S1]. *High.*
- IC/ASIC verification engineers spend more time debugging than on any other activity [S1]. *High.*
- 2026 study (604 participants): verification "consumes roughly half of project time", and
  first-silicon success continues to decline [S2]. *High (fetched executive findings; no
  per-activity numbers in the public page).*
- 2024 IC/ASIC study: only 14% of projects achieved first-silicon success, the lowest in more than
  twenty years of tracking [S3]. *Medium (Verification Academy summary and Siemens blog snippet; the
  full report needs a login). The 2024 study changed its recruitment method, so compare it with
  2026, not with 2007-2022.*
- Vendor articles claim 2-3 verification engineers per designer, or verification as 70% of an SoC
  team [S6]. *Low: no method given, and it conflicts with the survey data. Do not use.*

**Headcount by stage.** I could not find any public source that gives the share of a chip company's
engineers in each stage (architecture, design, verification, DFT, physical design, post-silicon).
IBS cost-of-design models are paywalled and give totals, not a headcount split. Anything Census
shows as a "typical distribution" is therefore a house default, not a benchmark.

**Industry workforce context (for the readout, not for targets).**

- SIA and Oxford Economics project the U.S. chip workforce growing from about 345,000 to about
  460,000 jobs by 2030, with 67,000 at risk of going unfilled: 39% technicians, 35% engineers with
  four-year degrees or computer scientists, 26% engineers at master's or PhD level [S12][S13].
  *High (fetched).*

**How job families and functions are named.** Naming is not standard, and the same word means
different tiers in different systems. This matters for the taxonomy flip.

- Workday's job catalog nests job profiles in job families, and job families in job family groups
  [S7]. *High.*
- Tenants rename the tiers. The University of Miami calls Workday's job family group a "Job Family"
  and Workday's job family a "Job Function" [S8]: exactly the user's convention (family = broad,
  function = specific). *High (fetched).*
- Aon Radford uses "job function" for the broad grouping (examples: engineering, sales, finance,
  R&D) inside industry modules, the opposite of the user's convention [S9]. *Medium-low (search
  summary of an Aon article; the page would not load).*
- Mercer's position code has a three-digit family and a three-digit sub-family, then career stream
  and level [S10]. *Medium-low (older Mercer catalogue, via search).*
- Real semiconductor example: Intel's "Silicon Hardware Engineering" postings say the role may
  involve silicon architecture, circuit design, layout, logic, physical design, verification,
  product engineering, and validation and debug [S11]. A broad family containing specific
  disciplines, like the user's Silicon Engineering containing Design RTL. *Medium-low (search
  snippets of postings that have since expired).*

### 1.2 Census defaults

**Taxonomy (the flip).**

- Job family = the broad group (Silicon Engineering, Systems & Software, Operations, Go-to-Market,
  Corporate). Job function = the discipline inside it (Design RTL, Design verification, and so on).
  Official lists: Job families have no parent; Job functions have a parent job family.
- Importer aliases, after the flip:
  - `jobFamily`: job family, job family group, family group, job category.
  - `jobFunction`: job function, discipline, sub-family, job sub-family, specialization.
- Because "job family" means the narrow tier in default Workday and the broad tier for this user,
  the importer should not trust headers alone. Add a **nesting check**: when two job columns are
  mapped, the one whose values each sit under exactly one value of the other (and which has more
  distinct values) is the function. If the headers say the opposite, propose the swap with the
  evidence ("142 of 142 Design RTL rows sit under Silicon Engineering") and let the user confirm.
  *House default, motivated by [S7][S8][S9].*

**Stages (official list "Development stages", ordered).** One attribute on each job function in
an engineering family maps it to a stage. Tapeout is a milestone, not a stage, so no headcount sits
on it; it is drawn as a marker between back end and post-silicon.

| # | Stage | Phase | Example functions (map in Settings) |
|---|---|---|---|
| 1 | Architecture and specification | Front end | Architecture, performance modeling |
| 2 | Design | Front end | Design RTL, digital IP design, analog and mixed-signal design |
| 3 | Design verification | Front end | Design verification, formal verification, emulation |
| 4 | Implementation and DFT | Back end | Synthesis, DFT |
| 5 | Physical design and signoff | Back end | Physical design, static timing, physical verification, analog layout |
| 6 | Post-silicon validation | Post-silicon | Silicon validation, bring-up, characterization |
| 7 | Production test and product engineering | Post-silicon | Test engineering, product engineering |
| - | Across stages | - | CAD and methodology, program management |

Stage names follow [S4] and [S5]; the split into seven and the "Across stages" bucket are house
defaults. A function with no stage shows as "Not mapped to a stage" with a count that drills to its
people, so nothing silently drops out.

**Default scope.** Job family = Silicon Engineering (switchable to any engineering family, or all
engineering families). Population: active regular employees at as-of; contractors shown as a
separate, switchable series because verification and physical design often use them.

**Measures (each registered with formula, population, window):**

- Headcount by stage, and share of the family. Drills to people.
- Headcount by stage and level (stacked), to see where senior engineers sit.
- Headcount by stage and location.
- **Verification-to-design ratio** = headcount in stage 3 ÷ headcount in digital functions of
  stage 2 (analog design is excluded by default because analog verification is mostly done by the
  designers; setting). Reference line at 1.0 with the note "industry surveys find about 1:1 at peak
  across most segments; processor projects can run far higher" [S1].
  - Watch band: below 0.8 or above 1.5 for the family as a whole. *House default.* Do not color it
    as good or bad beyond that; the right ratio depends on how much new IP the programs carry [S1].
- Change in each stage's headcount over 12 months (from month-end snapshots), so a stage being
  starved ahead of tapeout shows.
- Open reqs by stage (from requisitions, through the req's job function when present, else its
  department's dominant function). Shows where the hiring plan is putting people.

**Copy notes.** Say "about one to one" and cite the study in the figure note. Never present the
house stage mix as "typical".

### 1.3 Sample data (Northgate)

Today the Silicon Engineering business unit has 556 active employees: Architecture 46, Digital
Design 128, Design Verification 150, Physical Design 112, Analog & Mixed-Signal 70, DFT 50
(`src/data/sample/departments.ts`). Proposed functions under the Silicon Engineering family, from
the existing roles:

| Department today | Job function (new) | Stage |
|---|---|---|
| Architecture | Architecture | 1 |
| Digital Design | Design RTL (ASIC, RTL, digital IP and low-power design engineers) | 2 |
| Design Verification | Design verification (incl. formal and emulation) | 3 |
| DFT | DFT | 4 |
| Physical Design | Physical design (incl. STA and physical verification) | 5 |
| Analog & Mixed-Signal | Analog and mixed-signal design; analog layout | 2 and 5 |
| Systems Validation (Systems & Software BU) | Post-silicon validation | 6 |
| Test & Product Engineering (Operations BU) | Product and test engineering | 7 |

Families need not follow business units, so the post-silicon functions can sit in the Silicon
Engineering family while the people stay in their business units. That way every stage has
people. This is a decision for the lead.

Patterns already in the data that the analysis will surface:

- Verification-to-design ratio for the family: 150 ÷ 128 = **1.17**, inside the watch band.
- By site the ratio swings: Bengaluru about 1.9 (DV 67, design 35), San Jose about 0.8, Austin
  about 0.55, and Haifa and Munich have design but no verification. (Computed from the site weights
  in `departments.ts`; check against the generated rows.) A natural finding: "Verification
  is concentrated in Bengaluru; design in San Jose, Haifa and Munich depends on it." No source claims
  this is typical, so present it as Northgate's shape, not an industry pattern.
- Silicon Engineering holds 63 of 114 open reqs (sample README). Tag them to functions so the
  "Open reqs by stage" figure shows where the plan is going; a good planted story is that most new
  reqs are design and verification, with none in post-silicon validation ahead of the next
  tapeout.

---

## 2. Quality of hire, and its relationship to university and degree

### 2.1 What the sources say

**Definition and components.**

- LinkedIn's 2015-2016 Global Recruiting Trends grouped quality-of-hire measures into three:
  new-hire performance evaluations, turnover or retention, and hiring manager satisfaction. Reported
  usage shares differ between write-ups (for example 54% retention, 43% hiring manager satisfaction,
  37% performance in one; 51% performance in another) [S15]. *Medium for the three components;
  low for the percentages, which disagree.*
- The most-cited formula: **Quality of hire = (PR + HP + HR) / N**, where PR is the average
  performance rating of new hires, HP the share reaching acceptable productivity in an acceptable
  time, HR the share still employed after one year, and N the number of indicators (Stephen Lowisz,
  ERE, 30 June 2010) [S14]. *High (fetched).* It is an equal-weight average of group-level rates.
- Weighted variants exist, for example performance 35%, retention 25%, hiring manager satisfaction
  25%, ramp 15% [S16]. *Low (vendor).* Measurement checkpoints at 90 days, 6 months and 1 year are
  common [S17]. *Low-medium (vendor glossary).*
- Ramp time: I found no semiconductor or hardware benchmark for time to productivity. General
  figures (3 to 9 months for software engineers) come from small vendor surveys. *Not usable.*
- Retention context: as much as 40% of all turnover happens in the first year of employment (Work
  Institute 2025 Retention Report, via WorldatWork) [S29]. *Medium (secondary). This is a share of
  turnover, not a cohort rate.*

**Cautions about the performance component.**

- Idiosyncratic rater effects explained 62% and 53% of rating variance in two samples, against
  21-25% for actual performance (Scullen, Mount and Goff, 2000) [S28]. *Medium (abstract via
  secondary).* Ratings partly measure the rater; calibrated ratings and a minimum group size help.
- Hires who leave before their first review have no rating, so a performance-only average
  over-states quality (survivorship). The retention half of the index is what corrects for it.

**Cautions about university and degree as predictors.**

- Years of education predicted job performance at about .10 in Schmidt and Hunter's 1998
  meta-analysis, against .51 for structured interviews and general mental ability [S18]. Sackett
  and colleagues' 2022 re-analysis lowered most validities but could not recompute years of
  education [S19]. *Medium (course outline of the 1998 paper; secondary summary of 2022).*
- In a study of 28,339 students from 294 universities in 79 countries, those from higher-ranked
  universities performed about 1.9% better per 1,000 ranking positions; for schools a few hundred
  places apart the gap was about 1% [S20]. *Medium (secondary coverage of the HBR article and
  EJIM paper). Short consulting projects, not multi-year careers.*
- Google's Laszlo Bock said in 2013 that GPAs and test scores "don't predict anything" for hiring,
  except a slight link for new graduates [S26]. *Medium (secondary reprints of an NYT interview).*
- University prestige proxies family income: children from top 1% families are twice as likely as
  middle-class children with the same SAT/ACT scores to attend an Ivy-Plus college, driven by legacy
  preferences, non-academic ratings and athlete recruitment (Chetty, Deming, Friedman) [S21].
  *High (fetched).* Rivera's *Pedigree* documents how screening on school prestige sorts candidates
  by their families' socioeconomic status [S22]. *Medium.*
- Adverse impact: *Griggs v. Duke Power* (1971) struck down a high school diploma requirement that
  excluded Black applicants at higher rates and was not shown to predict job performance [S23].
  The four-fifths rule treats a selection rate below 80% of the highest group's rate as evidence of
  adverse impact (29 CFR 1607.4(D)) [S24]. *High.* So "hire more from university X" is a selection
  rule that would need validation evidence, not a dashboard finding.
- Graduation year is an age proxy: the EEOC has warned that asking for it can deter older
  applicants, and won a jury verdict (RockAuto) where an applicant was rejected after giving a
  graduation year more than 20 years back [S25]. *High.* Census already bans it.
- University country proxies national origin: over half of U.S. master's engineering graduates and
  over 60% of PhD engineering graduates are foreign citizens [S12]. *High.* A "U.S. versus foreign
  university" cut would largely be a nationality cut.
- Degree requirements are loosening on paper more than in practice: HBS and the Burning Glass
  Institute found removing degree requirements changed fewer than 1 in 700 hires in 2023 [S27].
  *Medium-high.*

### 2.2 Census defaults

**The index (what the user asked for: performance plus retention).**

- **Quality of hire** = 50% × performance score + 50% × 12-month retention, both group-level, on a
  0-100 scale. The weights are a setting; the formula follows [S14] with N = 2.
  - Performance score = mean of (first full-cycle rating − 1) ÷ 4 × 100 over cohort hires with a
    rating. (Rating 3 "Meets" = 50, 5 = 100.) Uses the first review cycle that ends at least 6
    months after the start date.
  - 12-month retention = cohort hires still employed 365 days after their start ÷ cohort hires
    whose 365-day mark has passed. Involuntary and voluntary exits both count as not retained;
    a switch shows "regretted exits only".
  - Optional third and fourth components (off by default, weight 0): hiring manager satisfaction
    and ramp, only when the data exists. Census's hiring manager survey rates the recruiting
    process, not the hire, so it must not be reused for this.
- Population: external hires (regular employees, not interns or conversions) with a start date in
  the window. Window: starts from 36 to 12 months before as-of, so every hire has passed 12 months.
  Cohorts by start half-year.
- Every number drills to the hires, down to the employee.

**The cuts.**

- By university (top universities by hires, rest folded into "Other universities"), by highest
  degree level (Bachelor's, Master's, PhD, Associate or other, None recorded), and by field of
  study (Electrical engineering, Computer engineering, Computer science, Physics, Materials
  science, Other). Degree level by job function is the default view, because PhDs cluster in
  architecture and analog and would otherwise look like a degree effect.
- Default filter "Early-career hires (L1-L3 at hire)" with a switch to all hires: for experienced
  hires, university says little about current skill. (Level at hire is the experience control;
  graduation year is never used.)
- Groups under 5 hires are hidden or folded (house rule). Show n beside every bar and a 90%
  interval or a "small sample" mark under 20. Differences smaller than about 5 points on the index
  read as "about the same". *House default.*

**Guard rails in the copy.**

- Fixed note on the figure: "Where people studied is a weak predictor of performance and can stand
  in for family background. Use this to check sourcing and onboarding, not to screen candidates."
- No university-country or region cut, no graduation year, no "prestige tier" column. If the data
  carries a tier, the importer leaves it unmapped.
- Findings may say "hires from X left faster in their first year" and suggest checking onboarding
  or the role; they never recommend preferring or avoiding a school.

### 2.3 Sample data (Northgate)

New fields (Employee, optional): `university`, `degreeLevel`, `fieldOfStudy`. Candidates may carry
the same so the recruiting side can use them later.

- Silicon Engineering hires: about 35% Bachelor's, 50% Master's, 15% PhD. PhDs mostly in
  Architecture and Analog & Mixed-Signal; Master's dominant in design verification and design.
  Corporate and Go-to-Market mostly Bachelor's. Consistent in direction with SIA's 26% of
  unfilled jobs needing master's or PhD engineers [S12]; the exact mix is a house choice.
- About 12 to 15 named universities with 10 or more hires each in the window, the rest in a long
  tail. Use fictional but plausible names (or neutral real ones with no planted outcome) so the
  sample never attaches invented results to a real institution. *Decision for the lead.*
- Company quality of hire about 70; 12-month retention of hires about 88%; first full-cycle ratings
  following `RATING_GUIDELINE` (3 most common).
- Planted stories, sized to stay realistic per [S18][S20]:
  - Degree level differences are small once you look within job function (a few points).
  - The two most-hired universities score about the same as everyone else on performance, but one
    of them has noticeably lower 12-month retention (its hires leave for competing offers in year
    one). The finding points to onboarding and early-career pay, not to the school.
  - One university with an engineering partnership near a Northgate site (for example Bengaluru or
    Austin) has the best 12-month retention, with a modest performance edge.

---

## 3. Why candidates decline offers

### 3.1 What the sources say

**Benchmark acceptance rates.**

- Ashby (about 230,000 offers, January 2021 to March 2024): average offer acceptance 78%, rising to
  81% in 2023; **technical roles 73%, business roles 84%** [S30]. *High (fetched).*
- Gem 2025 benchmarks (over 140 million applications, 2021-2024): acceptance 84%, up from 81% in
  2021; average time to hire rose from 33 to 41 days [S31]. *High (fetched; no engineering split).*
- Formulas differ: Greenhouse divides accepted by accepted plus rejected, leaving pending out [S39];
  Ashby filters out organization-driven rejections [S30]. Rescinded offers made up 17% of declined
  technical offers and 27% of declined business offers in Ashby's data [S30]. *High.*

**Reasons.**

- Robert Half, Australia, 500 hiring managers, October 2025 (employers' view): better offer from
  another employer 32%; pay not competitive 31%; lack of flexibility, remote options or office
  mandates 29%; role not aligned with skills or goals 29%; lengthy or impersonal process 22%;
  unclear career progression 21%; job security or company stability 21%; values not aligned 20%
  [S33]. *High (fetched); employer perception, one country.*
- Gartner, about 3,000 candidates, Q1 2025: 44% received multiple offers (51% in Q1 2024, 72% in Q1
  2023); 35% backed out after accepting an offer (48% in Q1 2024). Top factors for accepting: higher
  pay 53%, career growth 47%, work-life balance 45%, better working conditions 39%, learning new
  skills 39% [S32]. *High (HR Dive report of the Gartner release; the release itself returned 403).*
  Note the 35% is the share of candidates who reneged at some point in their search, not a per-offer
  renege rate for one employer.
- Reneging (Robert Half, U.S., 2019): 28% of professionals had backed out after saying yes; reasons:
  a better offer 44%, an acceptable counteroffer 27%, bad things heard about the company 19% [S34].
  *High for reasons (fetched); medium for the 28% (press release via search).*
- Counteroffers (Robert Half, UK, 2,000 employees, December 2021): 57% had received one at some
  point; 53% of those offered one last time accepted it; 34% of those who accepted had left within
  six months [S36]. *High (fetched).*
- Candidate experience: poor communication or unclear expectations led 26% of job seekers to decline
  offers in 2024; negative interview interactions 36% [S37]. *Low (vendor, no sample size).*
- Semiconductors: in a McKinsey survey (2023, reported May 2024), more than half of semiconductor
  and electronics employees were at least somewhat likely to leave in 3-6 months, top reasons lack
  of career development, then limited flexibility [S38]. *Medium (Bloomberg via search).* Intel's
  graduate silicon postings state an on-site requirement [S11]: lab and bring-up work makes the
  work-arrangement reason more prominent in chip companies than in software. *Medium-low.*

**Speed.**

- Robert Half U.S., survey fielded November 2020 to January 2021 (1,000+ workers): 62% lose interest
  if they do not hear back within 10 business days of the first interview; 77% within 3 weeks
  [S35]. *High (fetched).*
- Ashby: candidates who accepted spent about 2 to 2.8 days in the offer stage, candidates who
  declined about 6; technical roles sit about 4 days in the offer stage versus 3 for business; in
  recent quarters shorter time in offer tracked higher acceptance [S30]. *High (fetched).*
- I found no published curve of acceptance rate by days from final interview to offer. *Not found.*

### 3.2 Census defaults

**Official list "Offer decline reasons"** (category level; recruiter-entered in the ATS):

1. Accepted a competing offer
2. Compensation below expectations
3. Counteroffer from current employer
4. Work arrangement (on-site or hybrid policy)
5. Location or relocation
6. Role, level or title
7. Career growth
8. Hiring process too slow or poor experience
9. Concerns about the company
10. Personal or family reasons
11. Not given

Reneges keep their own status and reasons (existing `Reneged: ...` values). Offers rescinded by
Northgate are excluded from the acceptance rate and shown separately. The list follows the
reasons in [S33][S34]; splitting work arrangement from location is a house choice because of on-site
lab work.

**Measures (reuse `recruiting.offers.*` where they exist):**

- Offer acceptance = accepted ÷ (accepted + declined), by decision date (existing
  `recruiting.offers.acceptance`, target 0.85). In this deep dive add a **watch line at 75% for
  engineering functions**, with the note "engineering offers are accepted less often than business
  offers (about 73% versus 84% in one large dataset)" [S30].
- Renege rate = accepted offers later withdrawn before the start ÷ accepted offers, by acceptance
  quarter. Watch above 3%. *House default (no per-offer benchmark found).*
- Decline reasons by job function, level, location and source (existing
  `recruiting.offers.declineReasons`, extended with cuts).
- **Acceptance by days from final interview to offer**, buckets 0-7, 8-14, 15-21, 22+ (the 14 and
  21 marks follow [S35]).
- **Days in offer stage** (offer date to decision) for accepted versus declined, median; reference
  note from [S30].
- Competing-offer and counteroffer share by level (are senior candidates being countered?).
- Candidate experience survey "why declined": aggregated only, survey minimum applies, never per
  candidate (house rule). The recruiter-entered ATS reason drills to the candidate.
- Pay comparisons (offer against range, against the candidate's ask) are opt-in only, under the pay
  switch, like every pay amount in Census.

### 3.3 Sample data (Northgate)

The sample already plants the main story: acceptance 84-85% in Q1-Q2 2026, **68.2% in Q3**, with
Bengaluru at 31.1%, driven by competing offers and pay (sample README). Adjustments so the deep dive
has more to find:

- Re-weight the general decline mix toward the research: competing offer 30, compensation 25,
  counteroffer 12, work arrangement 8, location 7, role or level 8, career growth 4, process 4,
  personal 2 (the Bengaluru Q3 mix stays as it is).
- Add a time pattern: declines rise with delay from onsite to offer, for example acceptance about
  90% at 0-7 days, 85% at 8-14, 72% at 15-21, 60% at 22+. Days in offer stage: median about 3 for
  accepted, about 6 for declined (shape from [S30]; exact values are house numbers).
- Counteroffers concentrated at L5-L6 and in Design verification and Physical design, where
  current employers fight hardest to keep people. *House assumption; no source by level.*
- A few "Work arrangement" declines on lab-heavy functions (post-silicon validation, product
  engineering) in San Jose and Hsinchu.
- Keep reneges in Bengaluru (counteroffer, another offer) as today.

---

## 4. Workforce pyramid by level

### 4.1 What the sources say

**Spans and layers.**

- McKinsey describes five manager archetypes with spans from 3-5 to 15+: player/coach 3-5,
  coach 6-7, supervisor 8-10, facilitator 11-15, coordinator 15+; there is "no single magic number"
  [S40]. *Medium (the article timed out; ranges from consistent search summaries).*
- Will Larson's organizational math for engineering: one manager per six to eight engineers, and
  four to six managers per manager of managers (28 June 2020) [S41]. *High (fetched).*
- Gallup reported the average number of direct reports rising from 10.9 in 2024 to 12.1 in 2025,
  with a median of about five to six [S45]. *Low-medium (search summary; the page would not load).*

**Level distribution.**

- Uber, about 2,000 software engineers in 2020: staff about 2.5-3%, senior staff about 1%,
  principal about 0.1%; the senior level became overcrowded and was split in two [S42]. *Medium
  (an author's estimate, fetched).*
- In chip companies "Staff" is mid-ladder: Qualcomm's engineering ladder runs Associate Engineer,
  Engineer, Senior Engineer, Staff Engineer, Senior Staff Engineer, Principal Engineer [S46].
  *Medium (fetched level names; no tenure data).* Software benchmarks for the share of "staff and
  above" therefore do not transfer to semiconductor titles. Compare on Census level codes, not
  titles.
- Pave (over 8,700 companies, published March 2026): entry-level (P1) employees fell from 6.8% to
  4.6% of headcount over two years; org charts are moving from a pyramid toward a diamond [S43].
  *High (fetched).*
- Over-leveling: a level distribution shifted up against the market costs more than paying at a
  higher percentile, and usually comes from inconsistent level matching or title inflation
  (Franklin, April 2024) [S44]. *Medium (fetched; a comp-vendor newsletter).*
- I found no reliable published distribution of engineers across levels for semiconductor
  companies. *Not found.*

**What bulges and thin levels usually signal** (synthesis of [S42][S43][S44]):

- A bulge at one mid level: promotion bottleneck, or a hiring wave moving up as a cohort; check
  time in level and promotion rate out of that level.
- A distribution shifted up compared with the company or market: level or title inflation, or
  inconsistent leveling at hire; check level at hire against comparable roles.
- A thin entry level: future pipeline risk and dependence on experienced hires.
- A thin level just below a senior one: succession risk for those senior roles.
- Few senior engineers in a function: dependence on a small number of experts.

### 4.2 Census defaults

- **Pyramid figure**: horizontal bars by level, L1 at the bottom to E3 at the top, IC levels and
  management levels as two blocks (management drawn beside or above the IC block, never mixed).
  Overlay the company's shape (as shares) in gray when a filter is active, and the shape 12 months
  ago as an outline. Each bar drills to people. Respects the filter row (leader, business unit,
  department, location) and gains a job family and job function filter.
- **Shape measures** (on IC levels):
  - Entry share = (L1 + L2) ÷ IC headcount.
  - Senior share = (L5 + L6) ÷ IC headcount.
  - Peak level (the level with the most people) and a shape word: Pyramid (each level at least as
    large as the next one up), Diamond (peak at L3 or L4), Top-heavy (senior share above entry
    share and above the company's senior share by 10 points or more).
  - ICs per manager = IC headcount ÷ people with direct reports, beside the existing span metrics
    (`hrbp.org.span`, `org.span.median`).
- **Expected shape = the company's own mix for the same job function**, not an outside absolute,
  because architecture is senior by design and test engineering is not. Findings compare an org to
  that expectation. *House default.*
- **Flags** (settings; minimum org size 25 ICs, levels under 5 hidden):
  - Bulge: an interior level more than 1.5 times both neighbors.
  - Thin level: an interior level under half the smaller neighbor (L1 is excluded, since many chip
    companies hire few new graduates).
  - Entry share 10 or more points below the function's company mix.
  - Senior share 10 or more points above the function's company mix.
  - Paired with time in level (median months since the last promotion, from `jobChanges`) and
    promotion rate out of the level, so a bulge reads as "stuck" or "a cohort moving up".
- Span reference band for engineering managers: 6-8 (Larson [S41]; McKinsey's coach and supervisor
  archetypes [S40]); the existing span flags (1, or 12 and over) stay.

### 4.3 Sample data (Northgate)

Active employees today (sample README): L1 65, L2 191, L3 314, L4 293, L5 219, L6 105, M1 200,
M2 43, E1 12, E2 4, E3 4. On ICs: entry share about 22%, senior share about 27%, peak at L3: a
diamond, which is plausible for an experienced-hire chip company and matches the direction in
[S43]. Median span 6.

Planted stories worth adding:

- An L4 bulge in Design verification, Bengaluru, from the hiring wave two years ago, with time in
  level rising and few L4 to L5 promotions. It ties to the existing Bengaluru attrition story (top
  reason "Career growth or promotion").
- Architecture shows top-heavy against the company but normal against its own function mix, so the
  function-relative rule visibly avoids a false alarm.
- One department with a thin L2 (no new-graduate hiring for two years), giving an entry-share
  finding.
- Keep "Staff" as Census's L5 label; the help text says semiconductor "Staff" is mid-career.

---

## 5. Privacy and house-rule checks across the four analyses

- No gender, age, race or nationality, and nothing that proxies for them: no graduation year, no
  university country or region, no prestige tier (part 2).
- Pay amounts only under the pay switch (part 3, offer against range).
- Groups under 5 hidden or folded (universities, decline reasons by small site, levels in small
  orgs).
- Survey answers (candidate experience "why declined") only in aggregate with the survey minimum.
- Every number drills to its records: hires for quality of hire, candidates for declines, employees
  for stages and the pyramid.

## 6. What I could not find

- Any public headcount split of chip engineering teams by development stage.
- A 2024 or 2026 verification-to-design ratio (the reports are behind a login).
- A semiconductor or hardware ramp-time (time to productivity) benchmark.
- A per-offer renege-rate benchmark, and a published curve of acceptance by days to offer.
- A reliable level distribution for semiconductor engineering organizations.
- Radford's actual job-code catalog for hardware or IC design roles (paywalled).

## 7. Sources

- [S1] Harry Foster, "Part 8: The 2022 Wilson Research Group Functional Verification Study",
  Siemens Verification Horizons, 12 Dec 2022.
  https://blogs.sw.siemens.com/verificationhorizons/2022/12/12/part-8-the-2022-wilson-research-group-functional-verification-study/
- [S2] Verification Academy, "2026 Functional Verification Study: Executive Findings".
  https://verificationacademy.com/topics/planning-measurement-and-analysis/wrg-industry-data-and-trends/2026-functional-verification-study-executive-findings-paper/
- [S3] Verification Academy, "IC/ASIC Functional Verification Trend Report - 2024".
  https://verificationacademy.com/topics/planning-measurement-and-analysis/wrg-industry-data-and-trends/2024-siemens-eda-and-wilson-research-group-ic-asic-functional-verification-trend-report/
  and Siemens, "Why first silicon success is getting harder for system companies".
  https://blogs.sw.siemens.com/verificationhorizons/2025/09/03/why-first-silicon-success-is-getting-harder-for-system-companies
- [S4] Synopsys, "What is ASIC design?". https://www.synopsys.com/glossary/what-is-asic-design.html
- [S5] ChipVerify, "Post-silicon validation". https://chipverify.com/verification/post-silicon-validation
- [S6] ALLPCB, "Verification: the heavy burden in SoC design" (cited only to reject it).
  https://www.allpcb.com/allelectrohub/verification-the-heavy-burden-in-soc-design
- [S7] Workday Administrator Guide, job catalog.
  https://doc.workday.com/admin-guide/en-us/human-capital-management/staffing/job-catalog/dan1370796361150.html
- [S8] University of Miami, Workday glossary. https://workday-hr.it.miami.edu/resources/glossary/index.html
- [S9] Aon, "As market realities change, Radford Global Job Leveling Model rises to the challenge" (2018).
  https://humancapital.aon.com/insights/articles/2018/As-Market-Realities-Change-Radford-Global-Job-Leveling-Model-Rises-to-the-Challenge
- [S10] Mercer, MLS job catalogue. https://info.mercer.com/rs/521-DEV-513/images/MLS-Job-Catalogue.pdf
- [S11] Intel, "Silicon Hardware Engineering - College Graduate, Masters" (expired posting).
  https://jobs.intel.com/en/job/hillsboro/silicon-hardware-engineering-college-graduate-masters/41147/75979897376
- [S12] SIA and Oxford Economics, "Chipping Away: Assessing and Addressing the Labor Market Gap
  Facing the U.S. Semiconductor Industry" (July 2023).
  https://www.semiconductors.org/chipping-away-assessing-and-addressing-the-labor-market-gap-facing-the-u-s-semiconductor-industry/
- [S13] SIA, "America faces significant shortage of tech workers in semiconductor industry and
  throughout U.S. economy".
  https://www.semiconductors.org/america-faces-significant-shortage-of-tech-workers-in-semiconductor-industry-and-throughout-u-s-economy/
- [S14] Stephen Lowisz, "Quality of hire: the top recruiting metric", ERE, 30 Jun 2010.
  https://www.ere.net/quality-of-hire-the-top-recruiting-metric
- [S15] LinkedIn Global Recruiting Trends 2016, as summarized by BM Magazine and Workable.
  https://bmmagazine.co.uk/opinion/the-top-global-recruitment-trends-for-2016/ and
  https://resources.workable.com/blog/quality-of-hire
- [S16] Bryq, "Quality of hire metrics". https://www.bryq.com/blog/quality-of-hire-metrics
- [S17] HR Cloud, "Quality of hire" glossary. https://www.hrcloud.com/resources/glossary/quality-of-hire
- [S18] Schmidt and Hunter (1998), "The validity and utility of selection methods in personnel
  psychology", Psychological Bulletin 124(2), via a Portland State course outline.
  https://web.pdx.edu/~mccunee/quant_621/Outlines/Schmidt%20&%20Hunter%20(1998).doc
- [S19] Sackett, Zhang, Berry and Lievens (2022), "Revisiting meta-analytic estimates of validity in
  personnel selection", Journal of Applied Psychology 107; summary by Master HR.
  https://master-hr.com/insights/new-study-providing-updated-validity-estimates/ ; paper:
  https://ink.library.smu.edu.sg/lkcsb_research/6894
- [S20] "Workers from elite schools perform better, but only slightly", NYSSCPA, 9 Sep 2020 (on
  Taras et al., HBR and European Journal of International Management).
  https://nysscpa.org/news/1050236-workers-from-elite-schools-perform-better-but-only-slightly-2020-09-09
- [S21] Chetty, Deming and Friedman, "Diversifying Society's Leaders? The Determinants and Causal
  Effects of Admission to Highly Selective Private Colleges", Opportunity Insights (2023; QJE 2026).
  https://opportunityinsights.org/paper/collegeadmissions/
- [S22] Lauren A. Rivera, *Pedigree: How Elite Students Get Elite Jobs*, Princeton University Press.
  https://press.princeton.edu/node/60856
- [S23] *Griggs v. Duke Power Co.*, 401 U.S. 424 (1971). https://en.wikipedia.org/wiki/Griggs_v._Duke_Power_Co.
- [S24] 29 CFR 1607.4, Uniform Guidelines on Employee Selection Procedures.
  https://www.law.cornell.edu/cfr/text/29/1607.4
- [S25] SHRM, "When interviewers press for birth dates and grad dates, is it discriminatory?"
  https://shrm.org/topics-tools/news/inclusion-diversity/interviewers-press-birth-dates-grad-dates-discriminatory
  and EEOC, "Jury in EEOC suit finds RockAuto discriminated against applicant because of his age".
  https://www.eeoc.gov/newsroom/jury-eeoc-suit-finds-rockauto-discriminated-against-applicant-because-his-age
- [S26] eSchool News, "Google: GPAs are worthless" (20 Jun 2013, on the NYT interview with Laszlo
  Bock). https://www.eschoolnews.com/2013/06/20/google-gpas-are-worthless/
- [S27] Burning Glass Institute and Harvard Business School, "Skills-Based Hiring: The Long Road from
  Pronouncements to Practice" (Feb 2024). https://burningglassinstitute.org/research/skills-based-hiring-2024
- [S28] Scullen, Mount and Goff (2000), "Understanding the latent structure of job performance
  ratings", Journal of Applied Psychology 85(6), 956-970, doi:10.1037/0021-9010.85.6.956; abstract via
  https://academicnewsletter.sufe.edu.cn/info/372766
- [S29] WorldatWork, "Maximize the potential of new hires with targeted reward strategies" (on Work
  Institute's 2025 Retention Report).
  https://worldatwork.org/publications/workspan-daily/maximize-the-potential-of-new-hires-with-targeted-reward-strategies
- [S30] Ashby, "2023 Trends Report: Offer acceptance rates".
  https://www.ashbyhq.com/talent-trends-report/reports/2023-trends-report-offer-acceptance-rates
- [S31] Gem, "10 takeaways from the 2025 recruiting benchmarks report".
  https://www.gem.com/blog/10-takeaways-from-the-2025-recruiting-benchmarks-report
- [S32] HR Dive, "Fewer job candidates report receiving multiple offers" (20 Jun 2025, on Gartner's
  16 Jun 2025 release). https://www.hrdive.com/news/fewer-job-candidates-report-receiving-multiple-offers/751154/ ;
  release: https://www.gartner.com/en/newsroom/press-releases/2025-06-16-gartner-hr-research-finds-44-percent-of-prospective-candidates-received-multiple-job-offers-in-1q250
- [S33] Robert Half Australia, "Why top talent is saying no to job offers" (13 Jan 2026).
  https://www.roberthalf.com/au/en/about/press/why-top-talent-is-saying-no-to-job-offers-why-employers-worried
- [S34] HR Dive, "Nearly one-third of candidates back out after they've accepted a job offer" (20 May
  2019). https://hrdive.com/news/nearly-one-third-of-candidates-back-out-after-theyve-accepted-a-job-offer/555006 ;
  Robert Half release: https://press.roberthalf.com/2019-05-15-Cold-Feet-Survey-Shows-28-Of-Professionals-Renege-On-Job-Offer-After-Accepting
- [S35] Robert Half, "How to lose a candidate in 10 business days" (10 Feb 2021).
  https://press.roberthalf.com/2021-02-10-How-To-Lose-A-Candidate-In-10-Business-Days
- [S36] Robert Half UK, "Half of counteroffers successful as hiring crisis continues".
  https://www.roberthalf.com/gb/en/about/press/half-counteroffers-successful-hiring-crisis-continues
- [S37] CareerPlug, "Candidate experience statistics and research report 2025".
  https://www.careerplug.com/candidate-experience-statistics/
- [S38] Bloomberg, "Chip workers are likely to quit jobs, worsening labor shortage" (10 May 2024, on
  a McKinsey survey). https://www.bloomberg.com/news/articles/2024-05-10/chip-workers-are-likely-to-quit-jobs-worsening-labor-shortage
- [S39] Greenhouse Support, "Offer activity report".
  https://support.greenhouse.io/hc/en-us/articles/204635925-Offer-activity-report
- [S40] McKinsey, "How to identify the right 'spans of control' for your organization".
  https://www.mckinsey.com/capabilities/people-and-organization/our-insights/how-to-identify-the-right-spans-of-control-for-your-organization
- [S41] Will Larson, "Where do Staff-plus engineers fit into the org?" (28 Jun 2020).
  https://lethain.com/where-should-staff-plus-eng-report/
- [S42] Gergely Orosz, "Uber's engineering level changes", The Pragmatic Engineer.
  https://newsletter.pragmaticengineer.com/p/ubers-engineering-level-changes
- [S43] Pave, "Diamond-shaped org structures" (23 Mar 2026). https://pave.com/blog-posts/diamond-shaped-org-structures
- [S44] Charlie Franklin, "The hidden costs of over-leveling", Peer Group (17 Apr 2024).
  https://compapeergroup.substack.com/p/the-hidden-costs-of-over-leveling
- [S45] Gallup, "Span of control: optimal team size for managers".
  https://www.gallup.com/workplace/700718/span-control-optimal-team-size-managers.aspx
- [S46] Levels.fyi, Qualcomm software engineer levels.
  https://www.levels.fyi/companies/qualcomm/salaries/software-engineer/levels/staff-engineer
