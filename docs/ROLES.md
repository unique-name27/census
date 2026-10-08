# Modes: HR, Manager and Developer

The user asked: "can you make developer mode, hr mode, and manager mode, and limit the access based
on role and what they should see. ie developer needs to see every function and tool. make it look
nicer and add more graphs."

Their decisions:

- **An open switch.** Anyone can switch modes. No PIN, no manager packs, nothing to unlock. Modes
  hide what a role should not see and shape the app for the role. They are not security, and no
  copy may say or imply that they are.
- **Manager mode** is "Team basics" plus "Talent", locked to the manager's own org: people stats
  (headcount, attrition, tenure), org chart, open reqs and upcoming starts, their Action center
  items, and their team's reviews, learning and succession. Not compensation, surveys, HR ops
  cases, compliance, AI in HR or the Data room.
- **Developer mode** sees every function and tool: everything HR sees, plus developer tools.
- **HR mode** is today's app for the HR team, without developer tools.
- **Look:** a design polish across every view with 2 to 4 new charts per view, and a chart-led home
  page for each mode. The per-view polish is planned in its own doc; this contract covers the three
  home pages and the rule every new figure follows (part 2.4).

This file is the contract builders follow. Read ARCHITECTURE.md, docs/VIEWS.md and docs/FILTERS.md
first; every house rule there still applies in every mode.

---

## 0. The calls in one list

1. Three modes, named **HR**, **Manager** and **Developer** in the UI. HR is the default.
2. The switch is a **Mode** button in the masthead and a **Mode** section at the top of Settings.
   Choosing Manager asks "Choose a manager" from a searchable list of people who lead 3 or more
   employees (the leader filter's own list).
3. The mode is remembered in this browser (`census:mode`). It is **not** in the address and **not**
   in the settings file. A link opened in Manager mode is clamped to the manager's org.
4. Manager mode is an **allowlist**: anything the policy does not name is hidden. HR mode hides only
   the developer surfaces. Developer mode hides nothing.
5. The manager's org is a **lock**, not a filter value: the leader filter may name the manager or
   anyone inside their org, never anyone outside it and never in exclude mode. Every way filters
   change (the row, links, Back, saved views, Filter to this, Focus on, Ask) goes through one
   clamp.
6. **Company benchmarks stay** in Manager mode as aggregate comparisons ("vs company"), never as
   records: a company comparison opens no list of people outside the org.
7. People outside the org can appear by name only as owners (a recruiter on a req) or in the
   manager's own reporting line. Their records and person cards do not open. Successors outside
   the org show by readiness only.
8. Manager mode also hides, inside the shown views: Recruiting > Sources & offers, Onboarding >
   Hiring plan, Org chart > Reorg sandbox, Talent > Retention risk (flight-risk scores), every
   survey number, I-9 measures, and "Copy talking points".
9. Ask works in Manager mode, locked to the org, without `explain_quality`, and only when the org
   has at least the anonymity minimum (5) employees.
10. Homes: HR opens on the **Scorecard** (made chart-led), Manager on a new **My team** view,
    Developer on a new **Developer** page (`#dev`) reached from the masthead.
11. One pure, tested access policy (`src/access/`) answers every surface. A matrix test snapshots
    every surface in every mode.

---

## 1. The three modes

### 1.1 What each mode is for

| Mode (UI name) | Id | For | Home | Folder tabs |
|---|---|---|---|---|
| HR | `hr` | The HR team: HRBPs, TA, people operations, total rewards, talent, compliance. Today's app. | Scorecard (`#scorecard`) | Scorecard · Recruiting · Onboarding · People stats · Org chart · HR ops · Talent · Compensation · Compliance · Listening · AI in HR |
| Manager | `manager` | One people manager looking at their own org: their people, hiring, starts and talent. | My team (`#team`) | My team · Recruiting · Onboarding · People stats · Org chart · Talent |
| Developer | `developer` | Whoever builds, tests or supports Census: every view and tool, plus what is behind them. | Developer (`#dev`) | The HR folder tabs, plus the Developer page in the masthead |

HR mode differs from today only by the Mode button, the Mode section in Settings, the chart-led
Scorecard and the new help content. Nothing HR sees today is taken away.

### 1.2 The switch

- **Where.** A ghost button at the start of the masthead's button group, before Tools, with the
  existing `IconPeople` and a caret: "HR mode", "Manager: Priya Raman", "Developer mode". Under
  640px it shows the icon and the short name ("HR", "Manager", "Developer").
  `data-tour="masthead-mode"`.
- **The menu** (a Popover, 340px): eyebrow "Mode", then three choices as a radio group, each with
  the name and one line:
  - HR: "Every view, the Data room and Settings, for the HR team."
  - Manager: "One manager's org: people stats, org chart, hiring, starts and talent."
  - Developer: "Everything in HR mode, plus the Developer page and debug overlays."
  - In Manager mode, a "Change manager…" button under the choices.
  - A rule, then the short wording (1.6) in 12px muted text, and "About modes" (opens the Help
    article `modes`).
- **Settings > Mode** (a new first section, `SettingsSection` `'mode'`): the same three choices
  as a `Segmented` with the one-line hint under it, the long wording (1.6) as the section intro,
  in Manager mode "Showing Census for Priya Raman's org" with "Change manager…", and in Developer
  mode the three debug overlay switches (part 5.8).
- **Disabled choice.** When no one in the loaded Employees data leads 3 or more employees (an
  upload without manager IDs), the Manager choice is disabled with the hint "Needs reporting lines
  (manager IDs) in the Employees data."

### 1.3 Choosing a manager

Choosing Manager without a manager set, or "Change manager…", opens a Dialog:

- Title "Choose a manager". Dek: "Manager mode shows Census for one manager's org. Pick yourself."
- A search field ("Search by name or title") over a list built by `leaderOptions(ctx.org,
  ctx.asOf, 3)` from `src/app/filterOptions.ts`, largest org first, exactly the leader filter's
  list. Each row: name, title, "24 employees". Reuse `LeaderPicker`'s list markup and styles
  (`PICKER_ITEM`, `POPUP_SURFACE`, `SEARCH_INPUT`); the dialog version renders the list inline.
- Under the list: "Census lists people who lead 3 or more employees, the same list as the leader
  filter."
- Buttons: "Show their org" (primary, disabled until a row is picked) and Cancel. Cancel keeps the
  mode Census was in.
- A manager whose org has fewer than 5 active employees can be picked; the My team page then says
  "This org has fewer than 5 employees, so rates are hidden to protect anonymity. Counts and lists
  still show." and Ask explains why it is off (4.7).
- When the remembered manager is no longer on the roster or no longer leads 3 or more employees
  (new data loaded), Census stays in Manager mode, opens this dialog with the note "Priya Raman is
  not in the loaded data as a manager. Pick again.", and shows My team's empty state until someone
  is picked.

### 1.4 Remembered in this browser, not in the address

- **Storage.** `localStorage` key `census:mode`, value `{ "v": 1, "mode": "manager", "managerId":
  "E10421" }`, read once when the store is created and written on every change, every access in
  try/catch. A missing, unreadable or unknown value means HR. Settings > This device > "Clear
  everything" removes it with every other `census:` key (`clearCensusStorage` already does).
- **Not in the settings file.** A settings file is shared across the team; the mode belongs to the
  person at this browser. `settingsBlob` and `parseSettingsFile` ignore it.
- **Other open tabs follow.** A mode change posts on the existing tab channel
  (`src/data/tabSync.ts`) and every open Census tab applies it, so one browser is one mode.
- **Not in the address.** The address says what is on screen (route and scope), not who is
  looking. So:
  - A link opened in Manager mode applies inside the manager's org: a leader outside it, or a
    leader in exclude mode, becomes the manager, with the toast "Manager mode shows Priya Raman's
    org, so the link's leader was replaced." A link to a route hidden in this mode opens the mode's
    home (3.15).
  - "Copy link to this view" in Manager mode carries the manager's org as an ordinary leader filter
    (`leader=E10421`); HR opening it sees that org with the leader filter removable as usual.
  - Back and Forward restore scopes through the same clamp, without a toast.
  - QA crawls set the mode by writing `census:mode` before load; there is no `?mode=` parameter.

### 1.5 What switching does

- A mode change is not a history entry. Back never undoes it.
- **To Manager:** the filters are clamped (the leader becomes the manager, include mode; list
  filters and the period stay and apply inside the org), written with history `replace`. Pay
  amounts, immigration details and the quality lens switch off. The on-screen data standard goes
  back to your saved standard. The records panel closes, Ask starts a new chat (see the last bullet),
  and a route hidden in Manager mode is replaced by My team. Toast: "Manager mode for Priya
  Raman's org" with the description "Modes change what Census shows, not who can see the data."
- **From Manager to HR or Developer:** the lock lifts; the filters stay as they are (the manager's
  org remains an ordinary, removable leader filter). Toast "HR mode" with the description "The
  leader filter still shows Priya Raman's org." and the action "Whole company" (clears the leader).
- **To Developer:** overlays stay as last set (all off the first time). A hidden route cannot
  occur, since Developer shows everything.
- **To HR from Developer:** the Developer page, if open, is replaced by the Scorecard; overlays
  switch off on screen (their saved state is kept for the next Developer session).
- **Ask:** any mode change starts a new chat, with the line "Mode changed, so Ask started a new
  chat." in the sheet. Earlier answers may hold numbers the new mode does not show.

### 1.6 The wording that says modes are a view, not security

Two constants in `src/access/copy.ts`, used verbatim wherever modes are explained (the Mode menu,
Settings > Mode, the Help article `modes`, the manager toast):

- `NOT_SECURITY_SHORT`: "Modes change what Census shows, not who can see the data."
- `NOT_SECURITY_LONG`: "Modes shape Census for how you use it. They are not security: anyone using
  Census can switch modes, and every mode reads the same data in this browser. Share Census and its
  files only with people who may see all of it."

No copy anywhere may use "access", "permission", "restricted", "secure", "locked down",
"authorized" or "role-based access" about modes. The lock icon on the leader filter means "this
mode keeps this fixed", and its tooltip says so: "Manager mode keeps Census on Priya Raman's org.
Change it with Mode."

---

## 2. Home pages (chart-led)

All three follow the house rules: every chart in a `Figure` with exports, table view and
definitions; every number drills to its records; `metric` and `uses` on every KPI, figure and
finding (the Developer page's app-facts figures are the one documented exception, 2.3). New
figures reuse existing engines; no number is computed a second way.

### 2.1 HR: the Scorecard, chart-led (`#scorecard`)

The Scorecard keeps everything in docs/VIEWS.md and gains a chart band that leads the page. As
built:

| Order | Figure id | Span | Chart | Source and drill |
|---|---|---|---|---|
| 1 | `scorecard-standing` | 4 (lead) | Targets met: one hero number ("4 of 21") over a StatusSplit of the measures Met, Watch, Missed, No target and Not shown, in status colors with glyph and word | The scorecard model (`engine/model.ts`). Metric `scorecard.measures.targetsMet`. A segment lists its measures under the bar; each value opens its records. Shares in the tooltip are of the measures with a target. |
| 2 | Key figures (`KpiStrip`) | 8 | Headcount, Voluntary attrition, Open reqs, Critical open items | Each the producing view's own tile, linking to the tab that explains it. |
| 3 | `scorecard-measures` | 8 | BulletList, every measure against its target, by practice. "Furthest from target" switches to a BarList of the share measures in signed points against a 0 "Target" rule; measures in other units (days, counts, scores) are named in the note and stay in the table | Metric `scorecard.measures.status`. A bar or bullet opens the measure's records; a name opens its practice tab. |
| 4 | Top findings (existing `Readout`, compact) | 4 | as today | as today |
| 5 | `scorecard-headcount` | 4 | Lines, month-end headcount over the last 12 months, the year before dashed in muted ink on the same months | People stats' headcount series. Metric `hrbp.headcount.employees`. A point drills to the month-end employees; the export holds both lines' points. |
| 6 | `scorecard-flow` | 4 | Columns grouped, hires and exits by month, 12 months | People stats' flows. Metric `hrbp.flow.hires`. |
| 7 | `scorecard-attrition-trend` | 4 | Lines, voluntary and regretted attrition by quarter, 8 quarters | People stats' attrition by quarter. Metric `hrbp.attrition.voluntary`. A point opens the quarter's leavers, with "Filter to" that quarter. |
| 8 | `scorecard-attrition-bu` | 4 | BarList, voluntary attrition by business unit against the company rate | Metric `hrbp.attrition.voluntary`. A bar opens the unit's leavers, with "Filter to" and "Leave out". |
| 9 | `scorecard-pipeline` | 4 | Recruiting's Pipeline today | Metric `recruiting.pipeline.activeCandidates`. |
| 10 | `scorecard-items` | 4 | HBars stacked, open Action center items by owner group and due bucket | `collectActions` (cached per context). Metric `actions.items.open`. A segment opens its items (`actionItems`). |
| 11 | People scorecard (existing table) | 12 | as today | as today |

The band is computed in the same idle pass as the summaries and stays inside the Scorecard's 400 ms
budget on the sample (the series come from the People stats model the summary already builds, and
the Action center's collect is cached per context). The Monthly people report adds the "Targets met
by practice" slide after the title slide.

### 2.2 Manager: My team (`#team`)

A new view, `src/views/team/`, `ViewDef` key `team`, label "My team", one tab `overview`.
Folder-tab headline: active employees in the scope ("employees"), spark of the last 8 quarter ends
(People stats' headline function on the same context). Datasets: employees, jobChanges, reviews,
succession, learning, requisitions, candidates, onboardingTasks. No `summary` (it composes other
views' numbers; the Scorecard and Ask must not count them twice) and no `actions`.

Layout, top to bottom:

1. **KPI strip** `team-kpis`: Headcount (`hrbp.headcount.employees`, change vs 12 months
   earlier), Voluntary attrition (`hrbp.attrition.voluntary`, vs company), Regretted attrition
   (`hrbp.attrition.regretted`, vs company), Open reqs (`recruiting.reqs.open`, link Recruiting,
   Requisitions), Starts in 30 days (`onboarding.upcoming.starts`, link Onboarding, Upcoming
   starts), Required training on time (`talent.learning.requiredOnTime`, link Talent, Learning),
   Owned by people in this org (`actions.items.open`, link Action center: the open items the
   leader or anyone in the org holds, not the items about the org that the masthead counts). Each
   tile is the producing view's own KPI object, not a copy. In an org of fewer employees than the
   anonymity minimum every rate tile (attrition and training on time) shows hidden, whatever
   population the producing view gates its own rate on.
2. **Row:** `team-readout` (span 4, the shared `Readout`, title "What needs attention"): up to 6
   findings from People stats, Recruiting, Onboarding and Talent for this scope, after the Manager
   hide lists (3.3), ranked like the Scorecard's top findings (critical first; each practice's most
   serious before any practice's second), each tagged with its practice and "Open in {view}". Then
   `team-headcount-trend` (span 8, lead): Lines, month-end headcount over the last 12 months, the
   year before dashed on the same months; points drill to the month-end employees.
3. **Section "People"** (dek: "Who is in your org and how it is changing."):
   `team-hires-exits` (span 6, Columns grouped, hires and exits by month, 12 months),
   `team-attrition-vs-company` (span 6, HBars grouped: voluntary, regretted and first-year
   attrition, series "This org" in `--s1` and "Company" in `--deemph`; each org bar drills to its
   leavers, the company bars open nothing), `team-tenure` (span 6, Columns by tenure band),
   `team-levels` (span 6, Columns, people by level, with "Filter to"), `team-span` (span 12,
   BarList: direct reports of each manager in the org, with the company median span as the
   reference rule).
4. **Section "Hiring"** (dek: "Open roles, candidates waiting on a step, and who starts soon."):
   `team-pipeline` (span 7, Recruiting's "Pipeline today" for this scope: stage bars split by
   next-step state, clicking opens Recruiting, Pipeline), `team-start-calendar` (span 5, Columns
   weekly for the next 13 weeks stacked by readiness status Ready, On track, Behind, Not ready, with
   status colors and words), `team-open-reqs` (span 6, table-only: req, title, days open, active
   candidates, lacking a next step, health; a row opens the req's applications),
   `team-starts-table` (span 6, table-only: each upcoming start with day-one tasks, readiness and
   the blocking item, contingencies worded as the team holding them).
5. **Section "Talent"** (dek: "Ratings, successors for critical roles and required training."):
   `team-rating-mix` (span 4, Columns grouped, share per rating vs guideline, latest cycle),
   `team-succession` (span 4, HBars: critical roles in the org by best successor readiness, Ready
   now, 1-2 yrs, 3+ yrs, No successor; no export when the org has no critical role),
   `team-training-by-course` (span 4, BarList: required training on time by course against the
   target; a bar opens the course's assignments due with an On time column; hidden in an org
   under the anonymity minimum), then `team-training-overdue` and `team-critical-roles`
   (table-only, each assignment and each critical role).
6. **Section "Waiting on this org"**: `team-waiting` (span 12, table-only): open Action center
   items that the leader or anyone in the org owns, the leader's own first (severity, what, who it
   waits on, about, due in words, from), at most 10, with "Open the Action center" in the section
   actions.

Every figure carries the producing view's metric id, so the access rules apply to it unchanged.
Every figure id starts with `team-`. The welcome card shows here in Manager mode, offering the
"Getting started as a manager" tour.

In Developer mode `#team` opens by address and from Developer > Inventory, with the scope on
screen; without a leader it shows an empty state with the leader picker: "Pick a leader to preview
My team." It is not a folder tab there. In HR mode it is hidden (3.15).

### 2.3 Developer: the Developer page overview (`#dev`, tab `overview`)

Chart-led, built from the inventory (part 5). These figures describe the app, not people, so they
follow the Data room's precedent: `gate={false}`, no `uses`, no metric dictionary entry (a test
keeps `dev.*` out of the catalog and the Formulas index), and their definitions panel says "About
the app, not people data." Their numbers open the matching Inventory rows instead of the records
panel.

As built, the Overview tab leads with the data and the contracts, and the counts and timings
have tabs of their own:

- **Overview:** the KPI strip `dev-kpis` (each tile opens its rows); `dev-freshness` (BulletList,
  days since each dataset's latest event against its limit); `dev-fill` (the Data quality field
  matrix, fill by dataset and field) and `dev-rows` (BarList, rows per dataset); `dev-import-errors`
  (import error rate by version) and `dev-checks` (BarList, the share of rows each failing row
  check flags, its own definition; the dataset-level pass or fail rules are left out);
  `dev-metric-tiers` (HBars stacked, metrics by home view and tier, which covers the planned
  metrics per view and fields by tier), `dev-changed` and `dev-no-target` (BarLists by view);
  `dev-contract` (HBars 100%, contract coverage by view, from "Run contract checks", which lays out
  every view, the Action center, and My team for a preview leader outside Manager mode),
  `dev-checked` and `dev-gaps` (tables); `dev-timing` (BarList, summary time per view against the
  400 ms budget, every view listed, a run read from the cache marked); `dev-errors` (this
  session's errors).
- **Inventory:** `dev-inventory-kpis` (Views, Tabs, Figures after a scan, Metrics, Ask tools, Drill
  kinds, Datasets, Storage keys), `dev-figures-per-view` (Columns, after "Scan figures"), and one
  table per list.
- **Access:** `dev-access-by-mode` (HBars 100%, surfaces Shown, Limited and Hidden per mode) and
  the access matrix.
- **State:** `dev-storage` (BarList, bytes per storage key).
- **Timings:** `dev-engine-timings` (BarList, the slowest engine functions), the cold and warm
  runs, and every measure.

The figures about data quality carry the `quality.rules.*` entry they show; the rest carry no
metric id, as above.

### 2.4 New figures from the design polish

The 2 to 4 new charts per view (planned separately) inherit their tab's decision in every mode. Each
new figure must carry `metric`, so the metric rules apply. A new figure that shows pay amounts,
survey results, HR ops cases or transactions, compliance details, or a breakdown by orgs outside
the scope must be added to the Manager hide lists (3.3) in the same change, and the access matrix
snapshot (6.8) updated. A new tab is hidden in Manager mode until the policy names it.

---

## 3. The access matrix

Every surface, in Developer / HR / Manager order. **Shown**: as in HR mode today. **Hidden**: not
rendered, not in exports, not reachable by link, shortcut, tour, search or Ask. **Limited**: shown
with the limits stated. "n/a" means the surface sits inside something already hidden.

Two rules cover most rows: Developer shows everything; HR shows everything except the developer
surfaces (the Developer page and button, debug overlays, their shortcut, the Ask tool console,
"Copy drill spec", error details, the `team` view, and the developer and manager-only help).

### 3.1 Masthead and page frame

| Surface | Developer | HR | Manager |
|---|---|---|---|
| Wordmark (goes home) | Shown, to `#dev` | Shown, to `#scorecard` | Shown, to `#team` |
| Company line, Sample data tag, as-of date, footer | Shown | Shown | Shown |
| Mode button | Shown | Shown | Shown, reads "Manager: Priya Raman" |
| Pay amounts shown / Immigration details shown tags | Shown while on | Shown while on | Hidden (both off in this mode) |
| Tools | Shown | Shown | Limited (3.7) |
| Actions button and count | Shown | Shown | Limited: counts the items Manager mode lists (3.4) |
| Data room button | Shown | Shown | Hidden |
| Developer button ("Developer", after Data room, with a new `IconCode` in `src/components/icons.tsx`: angle brackets, 16px, 1.5px stroke) | Shown | Hidden | Hidden |
| Settings | Shown | Shown | Limited (3.6) |
| Ask | Shown | Shown | Limited (3.9) |
| Help | Shown | Shown | Limited (3.8) |
| Skip link | Shown | Shown | Shown |
| View header: title, scope / window / as-of line, provenance tag | Shown | Shown | Limited: the scope line starts with the lock icon ("Priya Raman's org") |
| View header: "About this view" | Shown | Shown | Follows the view's article (3.8) |
| View header: "AI agents for {view}" link | Shown | Shown | Hidden |
| View header: quality lens switch and dataset tier strip | Shown | Shown | Hidden (lens off) |
| Header action: People stats "Copy talking points" | Shown | Shown | Hidden (written for an HRBP to use with a leader) |
| Header actions: Compensation (pay switch, Cycle settings), Compliance, AI in HR, Scorecard "Monthly people report" | Shown | Shown | n/a |
| Tier badges | Shown; click opens the dataset's Quality panel | Shown; same | Limited: glyph, word and hover explanation; not a button |
| KPI and figure definition popovers | Shown, with "Edit definition" | Shown, with "Edit definition" | Limited: the definition, no "Edit definition" |
| "Learn more" in popovers | Shown | Shown | Shown when its article is shown in this mode |
| Welcome card | Hidden | On the Scorecard, as today | On My team, offering the manager tour |
| Error boundary message | Shown with a "Details" disclosure: message and component stack | As today | As today |

### 3.2 Folder tabs and sub-tabs

Manager folder-tab order: My team · Recruiting · Onboarding · People stats · Org chart · Talent.
Arrow keys move over the shown tabs only.

| View · tab | Developer | HR | Manager |
|---|---|---|---|
| My team · Overview (`team`) | Shown by address and from Inventory; not a folder tab | Hidden | Shown, first folder tab, home |
| Scorecard · Overview | Shown | Shown, home | Hidden (judges the whole people function, including pay, HR ops and compliance) |
| Recruiting · Overview | Shown | Shown | Limited: the "Hires vs plan" tile is hidden |
| Recruiting · Pipeline | Shown | Shown | Shown (candidates on reqs in the org, next steps, action queue with Copy note) |
| Recruiting · Requisitions | Shown | Shown | Limited: "Recruiter load" and hiring manager satisfaction are hidden |
| Recruiting · Sources & offers | Shown | Shown | Hidden (sourcing analytics are TA's) |
| Onboarding · Upcoming starts | Shown | Shown | Shown |
| Onboarding · First 90 days | Shown | Shown | Limited: I-9 Section 2 on time, new hires entered by day -3 (ON-03) and the day-30 pulse are hidden |
| Onboarding · Hiring plan | Shown | Shown | Hidden (plan versions are a finance and TA artifact) |
| People stats · Overview | Shown | Shown | Shown (Sub-org scorecard rows are the leader's direct reports' orgs) |
| People stats · Workforce | Shown | Shown | Shown |
| People stats · Attrition | Shown | Shown | Limited: the exit survey number is hidden |
| People stats · Movement | Shown | Shown | Shown |
| People stats · Org design | Shown | Shown | Limited: manager feedback (a survey) is hidden |
| People stats · Special analyses | Shown | Shown | Limited: Quality of hire (`tab:hrbp.analyses:quality`) and Offer declines (`tab:hrbp.analyses:declines`) are hidden, and their addresses open Engineering by stage with the toast; Engineering by stage leaves out planned hires from the hiring plan; the Level pyramid shows inside the org |
| Org chart · Chart | Shown | Shown | Limited: rooted at the scope's leader, nothing above the manager (4.5); names above the manager in the details panel are plain text; no "Simulate exit" (an exit what-if is a reorg scenario, `org:simulate-exit`); Org slide export shown |
| Org chart · Reorg sandbox | Shown | Shown | Hidden (reorg scenarios are worked through with the HRBP) |
| HR ops · Overview, Cases, HR transactions, Leave & return, Service levels | Shown | Shown | Hidden (cases, transactions and leave are HR ops records) |
| Talent · Overview | Shown | Shown | Limited: the "Key talent at risk" tile, table and finding are hidden, and the 9-box has no flight-risk overlay, column or records (`talent.retention.flightRisk` is hidden, so the engine reads no score about a named person) |
| Talent · Performance | Shown | Shown | Shown |
| Talent · Potential & succession | Shown | Shown | Limited: successors outside the org show by readiness only, and the roles table has no "Flight risk (model)" column (4.5) |
| Talent · Retention risk | Shown | Shown | Hidden (flight-risk scores about named people stay with HR) |
| Talent · Learning | Shown | Shown | Limited: training evaluation (a survey) is hidden |
| Compensation · all five tabs | Shown | Shown | Hidden |
| Compliance · all four tabs | Shown | Shown | Hidden |
| Listening · Overview to Services & learning | Shown | Shown | Hidden |
| Listening · Engagement | Shown while the switch is on | Shown while the switch is on | Hidden |
| AI in HR · Agents | Shown | Shown | Hidden |
| Folder-tab headlines | Shown | Shown | Shown for the shown tabs, computed for the scope |

### 3.3 Manager hide lists (inside shown views)

These lists live in the policy (`src/access/policy.ts`) and are what "Limited" in 3.2 means. The
matrix test checks that every id below exists (metric ids in the catalog, figure ids in the
source).

- **Metric ids** (a KPI, figure or finding whose `metricId` / `metric` matches is not rendered,
  not exported, not in Ask, not in the glossary or Formulas):
  - prefixes `scorecard.`, `services.`, `comp.`, `compliance.`, `listening.`, `ai.`,
    `onboarding.plan.`, `recruiting.sources.`, `org.scenario.`, `hrbp.quality.`, `hrbp.declines.`
  - exact `onboarding.first90.i9Section2`, `onboarding.first90.newHireEntered`,
    `onboarding.first90.pulseReady`, `recruiting.recruiters.load`,
    `recruiting.offers.declineReasons`, `recruiting.offers.acceptanceByLocation`,
    `recruiting.data.reqMatch`, `talent.retention.flightRisk`, `talent.retention.keyTalent`,
    `talent.retention.riskBands`, `talent.retention.backTest`, `talent.retention.riskDrivers`,
    `talent.finding.keyTalent`, `hrbp.stages.planned`
- **Figure ids** (belt and braces for figures that also carry a hidden metric):
  `recruiting-recruiter-load`, `recruiting-candidate-survey`, `recruiting-hiring-manager-survey`,
  `onboarding-new-hire-entered`, `onboarding-pulse`, `hrbp-exit-survey`, `hrbp-manager-feedback`,
  `talent-key-talent-top`, `talent-key-talent-at-risk`, `talent-stay-interviews`,
  `talent-training-evaluation`, `hrbp-declines-candidate-survey`, plus every figure on a hidden
  tab or a hidden part of one (`tab:hrbp.analyses:quality`), and by id prefix
  (`MANAGER_HIDDEN_FIGURE_PREFIXES`) every `hrbp-quality-` and `hrbp-declines-` figure, wherever it
  is drawn.
- **Ask fields** of the hidden analyses: `query_records` does not read employees' `university`,
  `degreeLevel` and `fieldOfStudy` or candidates' `competingOffer`, `offerRevised` and
  `offerPositionInRange` (`NEEDS` in `src/ask/engine/allowlist.ts`), and a cut by
  `rejectionReason` leaves declined offers out.
- **`LinkedSurvey`** (`src/views/listening/LinkedSurvey.tsx`) renders nothing while Listening is
  hidden, section and all.
- **Drill kinds hidden:** `cases`, `transactions`, `comp`, `rightToWork`, `hiringPlan`,
  `surveyResponses`, `surveyItems`, `surveyGroups`, `leaveGroups`. Shown: `employees`,
  `jobChanges`, `requisitions`, `candidates`, `reviews`, `succession`, `learning`,
  `onboardingTasks`, `actionItems`, `actionOwners`.
- **Datasets** Manager mode reads (Ask, Inventory, provenance): employees, jobChanges, reviews,
  succession, learning, requisitions, candidates, onboardingTasks.
- **Action items hidden:** items whose `view` or `tab` is hidden, whose `drill` or `subject` kind
  is hidden, and items with ids starting `onboarding:i9:` (a Compliance measure).

### 3.4 Action center (`#actions`)

| Surface | Developer | HR | Manager |
|---|---|---|---|
| Page | Shown | Shown | Limited: items from the shown views only (3.3), for the org |
| "My team" picker | Shown | Shown | Limited: replaced by the locked leader ("Priya Raman's org", lock icon); narrowing to a leader inside the org works as in the filter row |
| Items included | Every view's | Every view's | Items about people in the org, plus items owned by the manager or someone in the org anywhere in the company (it is their team's work); those items' About opens only records inside the org |
| Header counts, key figures, "Where items wait", "Where items come from" | Shown | Shown | Shown, over the listed items |
| Filters (owner group, severity, due, from, search), "Waiting on" | Shown | Shown | Shown |
| Copy note, Mark handled, Snooze, Undo, Reopen | Shown | Shown | Shown (marks are kept in this browser as today) |
| "Export list" and per-group Excel | Shown | Shown | Shown, the listed items only |
| "From" links | Shown | Shown | Shown (every listed item's view is shown) |
| Employee relations items | Counts only, as today | Counts only, as today | n/a (HR ops hidden) |

### 3.5 Data room (`#data`)

| Surface | Developer | HR | Manager |
|---|---|---|---|
| Datasets tab: manifest, reporting line and as-of override, drop zone, upload dialog, Download sample workbook, Download blank template, Reset everything to sample, per-row Upload / Template / Download current / Reset | Shown | Shown | Hidden |
| Dataset panels: Raw, Mapping, Quality, Certify | Shown | Shown | Hidden |
| Data quality tab | Shown | Shown | Hidden |
| Metric definitions tab: edit, undo, change log, dictionary workbook import and export | Shown | Shown | Hidden |
| Categories & mapping tab | Shown | Shown | Hidden |

### 3.6 Settings

| Section | Developer | HR | Manager |
|---|---|---|---|
| Mode (new, first) | Shown, with the debug overlay switches | Shown | Shown, with "Change manager…" |
| Display | Shown | Shown | Shown |
| Data (data standard, reporting date) | Shown | Shown | Hidden |
| Formulas | Shown | Shown | Limited: metrics of the shown views after the hide lists; no "Edit in Metric definitions" links; the download holds the same rows |
| Official lists | Shown | Shown | Hidden |
| Privacy (pay amounts, immigration details, engagement surveys) | Shown | Shown | Hidden (the views they change are hidden; all three are off in this mode) |
| Ask Census (key, workspace ID, model, Check key) | Shown | Shown | Shown |
| Compensation cycle | Shown | Shown | Hidden |
| Related tools | Shown | Shown | Hidden |
| This device | Shown | Shown | Limited: "Clear everything" shown; save settings to a file and load from one are hidden (team configuration is HR's) |

The section nav and the sheet's description list only the shown sections. `openSettings(section)`
for a hidden section opens the sheet at its top.

### 3.7 Tools menu

| Link | Developer | HR | Manager |
|---|---|---|---|
| Pipeline dashboard | Shown | Shown | Hidden |
| Career lattice | Shown | Shown | Shown |
| Manager toolkit | Shown | Shown | Shown |
| HR process catalog (and Atlas deep links in views) | Shown | Shown | Hidden |
| "Edit links" and "No link yet. Add one in Settings." | Shown | Shown | Hidden; a link with no URL is left out of the menu |

When no link is left in Manager mode, the Tools button is hidden.

### 3.8 Help

| Surface | Developer | HR | Manager |
|---|---|---|---|
| Help sheet, search box | Shown | Shown | Limited: search covers the shown articles and the glossary of shown metrics |
| "Take the tour", "What's on this page" | Shown | Shown | Follow the page's tour and article |
| Keyboard shortcuts | Shown, plus the developer shortcut | Shown | Shown |
| Report a problem | Shown, adds "Mode: Developer" | Shown, adds "Mode: HR" | Shown, adds "Mode: Manager (manager set, name left out)" |
| What's new | Shown | Shown | Shown |
| Article links to hidden targets (`route:`, `settings:`, `metric:`, `tour:`, `article:`) | Links | Links | Plain text |

Articles (ids from `src/help/articles/`):

| Articles | Developer | HR | Manager |
|---|---|---|---|
| Start here: `what-census-is`, `moving-around`, `reading-a-number`, `clicking-down`, `exporting`, `ask-census` | Shown | Shown | Shown |
| New `modes` (Start here): what each mode is for, the switch, choosing a manager, `NOT_SECURITY_LONG` | Shown | Shown | Shown |
| `view-<key>` for each view, and `view-actions` | Shown | Shown, except `view-team` | Shown for the shown views: `view-team`, `view-recruiting`, `view-onboarding`, `view-hrbp`, `view-org`, `view-talent`, `view-actions` |
| New `view-team` (Each view) | Shown | Hidden | Shown |
| Your data: `data-loading`, `data-mapping`, `data-categories`, `data-official-lists`, `data-tiers`, `data-certify`, `data-quality-tab`, `data-wrong` | Shown | Shown | Hidden |
| `definitions-how` | Shown | Shown | Shown (its Data room links read as text) |
| `glossary` | Shown | Shown | Limited: shown metrics only |
| `privacy-browser`, `privacy-small-groups`, `privacy-sample` | Shown | Shown | Shown |
| `privacy-pay`, `privacy-er`, `privacy-surveys`, `privacy-immigration` | Shown | Shown | Hidden |
| `shortcuts`, `report-problem`, `troubleshooting`, `faq`, `whats-new` | Shown | Shown | Shown |
| New `developer-tools` (Help and support) | Shown | Hidden | Hidden |

Tours (ids from `src/help/tours.ts`):

| Tours | Developer | HR | Manager |
|---|---|---|---|
| `getting-started` | Shown | Shown | Hidden (replaced by `manager-start`) |
| `own-data`, `quality-definitions` | Shown | Shown | Hidden |
| `view-scorecard`, `view-services`, `view-comp`, `view-compliance`, `view-listening`, `view-ai` | Shown | Shown | Hidden |
| `view-recruiting`, `view-onboarding`, `view-hrbp`, `view-org`, `view-talent`, `view-actions` | Shown | Shown | Limited: steps on hidden tabs or hidden targets are skipped (6.5, Help) |
| New `manager-start` "Getting started as a manager" (5 steps: the Mode button, My team's KPI strip, the locked leader, a drill to the people, the Action center) | Shown | Hidden | Shown |
| New `view-team` (4 steps) | Shown | Hidden | Shown |
| New `developer-tools` (5 steps: Developer button, Inventory, Ask tools console, State, overlays) | Shown | Hidden | Hidden |

A Help link or `startTour` for a hidden article or tour opens the Help sheet's list with the line
"That article is not shown in this mode."

### 3.9 Ask Census and its seven tools

| Surface | Developer | HR | Manager |
|---|---|---|---|
| Ask button, sheet, conversation, What was sent, Copy answer, answer tables | Shown | Shown | Limited: off with a plain reason when the org has fewer than 5 employees: "Ask needs an org of 5 or more employees in Manager mode, so that no answer is about one person." |
| Suggested questions | For the view on screen | For the view on screen | For the view on screen; My team gets its own four |
| `view:` and `metric:` links in answers | Links | Links | `view:` to a hidden view and every `metric:` link (the dictionary is in the Data room) render as plain text |
| Record refs in answers | Open the records panel | Same | Same, through the records guard (3.12) |
| `get_context` | Shown | Shown | Limited: the scope is the org; views and tabs are Manager mode's; datasets are the eight in 3.3; vocabularies come from the org; leaders are those inside the org; feature switches report off |
| `find_metrics` | Shown | Shown | Limited: metrics of the shown views after the hide lists |
| `view_summary` | Shown | Shown | Limited: views `recruiting`, `onboarding`, `hrbp`, `talent`; `scorecard` and hidden views are refused ("The scorecard is not shown in Manager mode."); hidden KPIs and findings are dropped |
| `compare_groups` | Shown | Shown | Limited: the same views; `by: leader` lists leaders inside the org only |
| `query_records` | Shown | Shown | Limited: the eight datasets only; grouping by a person field allowed for manager, hiring manager, recruiter and coordinator |
| `explain_quality` | Shown | Shown | Hidden: not in the tool definitions sent to Claude, and refused if called |
| `open_items` | Shown | Shown | Limited: the items Manager mode's Action center lists |
| Tool console (run a tool here, part 5.5) | Shown | Hidden | Hidden |

### 3.10 Filter row

| Control | Developer | HR | Manager |
|---|---|---|---|
| Saved views (Views menu, save, Manage, Copy link, Open Census with this view, examples) | Shown | Shown | Limited: every view applies through the clamp (4.2); a view whose page is hidden opens My team; saving stores the clamped scope |
| Period | Shown | Shown | Shown |
| Leader | Shown, include and exclude | Shown | Limited: the button shows the lock icon and "Leader: Priya Raman's org"; the list holds the manager (tagged "You") and leaders inside the org; "Whole company" reads "Whole org" and returns to the manager; no Include / Exclude switch |
| Leader chain chips ("widen to") | Shown | Shown | Limited: start at the manager; nobody above |
| Business unit, department, location, level | Shown | Shown | Limited: values and counts from the org (`within` = the lock); include and exclude both work, with the existing too-few rule |
| People in scope | Shown | Shown | Limited: "18 of 42 people in Priya Raman's org in scope" |
| Data standard control | Shown | Shown | Limited: read only, "Data standard: Everything" with its hint; links and saved views do not change it in this mode |
| Filter chips, Reset | Shown | Shown | Shown; Reset returns to the manager's whole org and the default period |

### 3.11 Exports

| Export | Developer | HR | Manager |
|---|---|---|---|
| Figure menu: CSV, Excel, PNG, SVG, copy, detail rows, table view, definitions | Shown | Shown | Shown for shown figures; "Edit definition" hidden |
| View Export: this tab (workbook, deck), all tabs (workbook, deck) | Shown | Shown | Limited: shown tabs and figures only (the off-screen render runs in the same mode); meta adds "Made in Manager mode for Priya Raman's org." |
| Copy link to this view | Shown | Shown | Shown (1.4) |
| Monthly people report | Shown | Shown | n/a |
| Org slide (PowerPoint) | Shown | Shown | Shown |
| Reorg scenario export | Shown | Shown | n/a |
| Copy talking points | Shown | Shown | Hidden |
| Action center Export list | Shown | Shown | Shown |
| Records panel: CSV, Excel, copy | Shown | Shown | Shown, the rows the panel lists |
| Records panel: "Copy drill spec (JSON)" | Shown | Hidden | Hidden |
| Ask answer: copy, CSV, Excel | Shown | Shown | Shown |
| Data room downloads | Shown | Shown | n/a |
| Formula index (Settings > Formulas) | Shown | Shown | Limited: the shown metrics |
| Developer page tables (every inventory table is a table-only Figure) | Shown | n/a | n/a |

### 3.12 Records panel and person card

| Surface | Developer | HR | Manager |
|---|---|---|---|
| Records panel for a shown drill kind | Shown | Shown | Limited: rows about people outside the org are left out, with the muted line "3 records outside Priya Raman's org are not listed." |
| Records panel for a hidden kind (should not be reachable) | Shown | Shown | "These records are not shown in Manager mode." and no table |
| Counts inside the panel (a req's applications, a manager's org) | Shown | Shown | Same rules as the panel |
| Person card, someone in the org | Shown | Shown | Limited: no Compa-ratio fact; Open items shows overdue required courses only (no open HR cases count) |
| Person card, someone outside the org (a recruiter, the manager's own manager) | Shown | Shown | Limited: name, title, department and "Outside Priya Raman's org." Nothing else, no actions |
| Reporting line ("Reports to") on a card | Links | Links | Names inside the org are links; names above the manager are plain text |
| Direct reports list on a card | Links | Links | Links (always inside the org) |
| "Focus on their org" | Shown | Shown | Shown for people inside the org |
| "Show in org chart" | Shown | Shown | Shown for people inside the org |
| Row click opening a person | Shown | Shown | Only for people inside the org (`rowPerson` returns null otherwise) |

### 3.13 Filter to this, findings, Focus on, KPI tiles, links between views

| Surface | Developer | HR | Manager |
|---|---|---|---|
| "Filter to …" and "Leave out …" in the records panel | Shown | Shown | Limited: offered only when the clamp would leave the result unchanged (it stays inside the org); leaving out a leader is not offered |
| Readout findings | Shown | Shown | Limited: findings with a hidden metric are dropped; `people` lists only people in the org; a finding's tab link only to a shown tab |
| "Focus on …" on a finding | Shown | Shown | Limited: same rule as Filter to |
| Scorecard and My team "Open in {view}" | Shown | Shown | Shown for shown views only |
| KPI tile linking to another view (`Kpi.link`) or tab (`Kpi.tab`) | Shown | Shown | The tile renders without the link when the target is hidden (`tileTarget` returns null); tiles with a hidden metric are not rendered |
| KPI delta drill when the delta is "vs company" | Shown | Shown | The delta is not clickable (the company's records are not listed) |
| Links between views (`routeHash`, `goTo` buttons, "Open in Listening", compliance's links to Talent and Onboarding, HR ops' link to Onboarding, Data room and Metric definitions links, AI agents links, Atlas process links) | Links | Links | A link whose target is hidden renders as plain text (or not at all for a link-only control); `goTo` refuses a hidden route as the safety net (3.15) |
| Org chart "Open in People stats" and "Open in Talent" | Shown | Shown | Shown |

### 3.14 Keyboard shortcuts

| Shortcut | Developer | HR | Manager |
|---|---|---|---|
| `?` opens Help | Shown | Shown | Shown |
| Alt+A (Option+A) opens Ask | Shown | Shown | Shown; the sheet explains when Ask is off (3.9) |
| Tab, Shift+Tab, skip link, Esc, Enter or Space on a number | Shown | Shown | Shown |
| Arrows, Home, End on folder tabs and sub-tabs | All tabs | All tabs | Shown tabs only |
| Tour keys, Ask composer keys | Shown | Shown | Shown |
| Org chart: `/`, arrows, Enter, Esc, `+` and `-` | Shown | Shown | Shown, inside the org |
| Reorg sandbox: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y | Shown | Shown | n/a |
| Metric definitions: Enter, Ctrl+Enter, Esc | Shown | Shown | n/a |
| New: Alt+Shift+D (Option+Shift+D, matched on `e.code === 'KeyD'`) toggles every debug overlay | Shown | Does nothing, not listed | Does nothing, not listed |

The developer shortcut is listed in the `developer-tools` article, not in `shortcuts`.

### 3.15 Deep links to hidden routes

One guard, in the store's `navigate` (every route change goes through it, including
`followAddress` and `goTo`), plus one check when the address connects at load:

- A hidden **view or page** is replaced, with history `replace`, by the mode's home. Toast:
  "{Page} is not shown in {Mode} mode" with the description "Census opened {home} instead." and the
  action "Change mode" (opens the Mode menu).
- A hidden **sub-tab** of a shown view opens that view's first shown tab the same way ("{View},
  {Tab} is not shown in Manager mode").
- What each mode redirects:
  - HR: `#dev.*` and `#team` go to `#scorecard`.
  - Manager: `#scorecard`, `#services.*`, `#comp.*`, `#compliance.*`, `#listening.*`, `#ai.*`
    (agent catalog links included), `#data.*` (metric addresses and dataset panels included),
    `#dev.*` go to `#team`; `#recruiting.sources`, `#onboarding.plan`, `#org.sandbox`,
    `#talent.retention` go to the view's first tab.
  - Developer: nothing.
- A saved view, a startup view or a tour step whose page is hidden opens the mode's home (the tour
  step is skipped instead).
- The address then shows the route on screen, so Back never loops into the hidden route.
- `openInOrgChart(id)` for someone outside the org shows the toast "Not in Priya Raman's org" and
  does not navigate.

---

## 4. Manager scoping

### 4.1 The lock

The manager's org is the subtree under the chosen manager (`subtreeIds(ctx.org, managerId)`: the
manager, everyone below them, current and former, by reporting line). It is a lock the mode holds,
not a value the filters hold:

```ts
export interface ManagerLock {
  managerId: string
  managerName: string
  /** Employee IDs in the manager's org (subtreeIds), the manager included. */
  orgIds: ReadonlySet<string>
  /** Active employees in the org on the as-of date (headcount basis). */
  size: number
}
```

Built by `managerLock(org, asOf, managerId)` in `src/access/lock.ts`, memoized per org index,
as-of date and manager. Null when the manager is not on the roster.

### 4.2 Every way in goes through one clamp

`clampFilters(filters, lock): Filters` (pure, returns the same object when nothing changes):

- `leaderId` null, outside `orgIds`, or in exclude mode: becomes `lock.managerId`, include mode.
- A leader inside the org (anyone in `orgIds`, as "Focus on their org" allows today) in include
  mode stays: a director can narrow to one of their managers.
- List filters, their modes and the period are kept: they apply inside the org.

It runs at every entry: `setFilters` and `resetFilters` (through a guard the store calls,
`setFilterGuard(fn)` in `src/data/store.ts`, registered by `src/access/connect.ts`), the opening
address and saved startup view (`loadAddress`), Back and Forward (`followAddress`), saved views
(`applySavedView`), `focusScope`, Ask's `resolveFilters`, and once more inside
`buildContext` (defensive: `ctx.filters` and `ctx.data` are always clamped). `ctx.isCompany` is
always false in Manager mode, and `ctx.scopeLabel` reads "Priya Raman's org".

### 4.3 Other filters inside the org

The period and the four list filters work as today, inside the org. Their options and counts come
from the org (`dimensionOptions(..., within)` with the lock), Exclude works with the too-few rule,
and the leader list is the manager plus leaders inside the org. Reset returns to the manager's whole
org over the default period.

### 4.4 Company comparisons: kept, as aggregates

**Decision: keep company benchmarks in Manager mode, as aggregate comparisons only.** Reason: the
first question every leader asks is how their org compares, HRBPs already put "vs company" in
front of leaders on the People stats tiles, and a company rate over a couple of thousand people
says nothing about any one person. What that means:

- Engines keep reading `ctx.all` for benchmarks: "vs company" deltas, company reference lines and
  "Company" bars stay.
- A comparison never opens records: the records guard (3.12) drops rows outside the org, and a
  "vs company" delta is not clickable (3.13). Producers keep writing `deltaLabel` as "vs company"
  (VIEWS.md wording), which is what KpiStrip checks.
- No breakdown by orgs outside the scope: every breakdown already reads `ctx.data` (the org), and
  the Scorecard, which compares practices company-wide, is hidden.

### 4.5 People outside the org

- **Names** of people outside the org appear only as owners (recruiter, coordinator, an HRBP who
  owns an item) and in the manager's own reporting line, as plain text. Their records and person
  cards do not open (3.12).
- **Records panel:** a row is kept only when it is about the org, decided by `inLock(kind, row,
  ctx)` in `src/access/records.ts`, which reuses the scoping routes: it scopes `ctx.all` to
  `{ leaderId: managerId }` once per context (cached) and keeps rows whose identity is in that
  scoped dataset (employees and employee-keyed rows by employee ID, requisitions by hiring manager,
  candidates by their req, onboarding tasks by their person, action items as listed).
- **Succession:** a successor outside the org shows in the Critical roles table as their readiness
  only ("1 outside your org, ready now"), never by name, and does not open. The Talent engine reads
  `ctx.access.lock` for this; nothing changes in HR or Developer mode.
- **Org chart:** the scope's leader is the root; the breadcrumb starts at the manager; search finds
  people inside the org only; open reqs show as today under their hiring managers.
- **Action center:** items owned by someone in the org stay listed even when their subject is
  outside it; the subject shows by its label and its About opens only records inside the org.
- **The manager's own talent records.** The manager is in their org (headcount, ratings, training),
  but their own potential, proposed (pre-calibration) ratings, flight-risk score and succession
  status stay with HR and their own leader: many companies do not show people these about
  themselves. So in Manager mode the Talent engine reads the manager's reviews without potential
  or proposed rating (`ownTalentWithheld`), so they are not placed in the 9-box or counted as a
  high potential; the plan for the manager's own role is left out of the roles table, the records
  and the Action center (`plansInScope`, `inLock`); and the person card and the org chart's
  details panel show the manager's final ratings only, with no "Successor for".
- **Onboarding contingencies.** A background check or export-control screening reads as the team
  holding it ("With People ops") in every table and record of the page, never where it stands;
  I-9 tasks are left out of readiness by task (an I-9 measure is Compliance's).

### 4.6 Small groups

The anonymity rules are unchanged and apply inside the org: rates, averages and shares over fewer
than 5 people are hidden ("Hidden to protect anonymity (n < 5)"), breakdowns fold small groups into
"Other (k)", and Exclude never leaves out 1 to 4 people. An org under 5 employees sees counts and
lists but no rates, and My team says so (1.3). Nothing about surveys, employee relations or
immigration applies, because those views are hidden.

### 4.7 Ask, locked to the org

- Ask is available only when `lock.size` is at least the anonymity minimum (`minGroupOf`), which is
  the rule Ask already applies to a leader filter.
- The tool definitions sent to Claude come from `toolDefinitionsFor(ctx.access)`: `explain_quality`
  is left out; the `view` and `dataset` enums and descriptions list only what Manager mode shows.
- `resolveFilters` in Manager mode: no `leader` means the manager (never the whole company); a
  leader token outside the org is refused ("In Manager mode a leader filter must be someone in
  {{P3}}'s org."); `exclude: ["leader"]` is refused; the result goes through `clampFilters`.
- `runTool` checks the policy before running: a hidden tool, view or dataset returns a plain error
  Claude can read, never a number.
- The system prompt gets one more block in Manager mode: "Census is in Manager mode for {{P3}}'s
  org. Every number is for that org; company numbers are comparisons only. Compensation, surveys,
  HR ops, compliance, AI in HR and the Data room are not available in this mode: say so when asked,
  and do not estimate them."
- Person tokens, the privacy pass and "What was sent" are unchanged.

### 4.8 Session switches

In Manager mode `ctx.showPay`, `ctx.showImmigration` and `ctx.features.engagementSurveys` are
false whatever the store says, the quality lens is off and the data standard is your saved one.
Leaving Manager mode gives the store's values back (pay and immigration stay off, as entering
switched them off for the session).

---

## 5. Developer tools

### 5.1 The Developer page

A masthead page like the Data room: route `#dev`, `PAGE_VIEWS` gains `'dev'`, code in `src/dev/`
(lazy-loaded with `React.lazy`, so HR and Manager mode load none of it). No filter row; its own
header like the Data room's: title "Developer", dek "Every view, figure, metric, tool and setting in
Census, and the state behind the screen. Nothing on this page is sent anywhere.", and underline
tabs:

`overview` Overview · `inventory` Inventory · `access` Access · `ask` Ask tools · `state` State ·
`timings` Timings

Each list is a table-only `Figure` (search, sort, CSV and Excel), ids prefixed `dev-`, with the
app-facts exception in 2.3. Sub-addresses use the colon form the Data room already uses:
`#dev.inventory:figures`, `#dev.ask:query_records`.

### 5.2 Overview

The chart-led home in 2.3.

### 5.3 Inventory

A `Segmented` picks the list; each is one table-only Figure. Every row has an "Access" column with
the decision in each mode (from the policy), so the inventory and the Access tab never disagree.

| List | Rows and columns | Built from |
|---|---|---|
| Views | key, label, route, tabs, datasets, headline, summary, actions, header actions (yes or no) | `VIEWS` (`src/views/registry.ts`) |
| Tabs | view, tab key, label, route `#view.tab`, feature switch | `VIEWS[].tabs` |
| Figures | id, title, view, tab, metric, rows, tier, held back, image | A scan: "Scan figures" renders every view's tabs off screen with `renderWholeView` (`src/app/wholeView.tsx`) and reads each tab's figure registry; "Scan as Manager" runs the same render with a Manager access override, to list what a manager gets. Results kept in memory until reload. |
| Metrics | id, name, views, unit, target, good direction, changed from default, settings, fields it reads | `ctx.metrics.list` and `formulaRows` (`src/app/settings/formulaIndex.ts`) |
| Engine functions | view, function (`headline`, `summary`, `actions`), last ms, KPIs / findings / items returned, "Run" | `VIEWS`; "Run" calls the function on the live context through `timed` and shows the result as JSON in a side sheet (functions dropped by the replacer) |
| Ask tools | name, description, input schema, access per mode, "Open in console" | `TOOL_DEFINITIONS`, `TOOL_NAMES` (`src/ask/engine/tools.ts`) |
| Drill kinds | kind, dataset, standard columns, what a row opens | `KINDS` and `ROW_OPENS` in `src/drill/records.ts` (export a `DRILL_KINDS` list), `drillDataset` |
| Datasets and fields | dataset, field, type, required or recommended, pay, Ask allowlisted, tier, coverage | `DATASETS` (`src/data/schema.ts`), `QUERY_DATASETS` (`src/ask/engine/allowlist.ts`), `ctx.quality` |
| Storage keys | key, where (localStorage, sessionStorage, IndexedDB), bytes, what it holds | A scan of every `census:` key in the three stores, described by `STORAGE_KEYS` (`src/dev/storageKeys.ts`); `census:ask-key` shows "set" or "not set", never its value; the workspace ID is cut to `wrkspc_…` |
| Routes | address, page, tab, access per mode | `ROUTE_VIEWS`, each view's tabs, `DATA_TABS`, `DATASET_PANELS`, the metric address pattern, `#actions`, the `#dev` tabs |
| Settings | setting, current value, default, where it is kept, in the settings file (yes or no) | `DEFAULT_SETTINGS`, `pickSettings`, the session switches, the mode, the overlays |
| Shortcuts | keys, where, what it does, modes | `SHORTCUTS` (`src/dev/shortcuts.ts`), the same list the shortcuts article is checked against |
| Help | article and tour ids, group, route, access per mode | `ARTICLES`, `TOURS` |

Storage rows offer "Copy value" (never for the Ask key) and "Remove" for localStorage keys, with an
in-page confirm like Settings > This device.

### 5.4 Access

`accessMatrix(inventory)` from the policy (the same function the matrix test snapshots), as one
table-only Figure: surface, kind, Developer, HR, Manager, how it is limited. Filters: kind, mode,
decision, and "Only where modes differ".

### 5.5 Ask tools console

Runs one Ask tool in this browser and shows exactly what Claude would get, without calling Claude:

- Pick a tool; its input schema shows beside a JSON input box prefilled with a working example per
  tool. "Check input" validates against the schema; "Run here" calls `runTool(name, input, env,
  conv)` with the live `ToolEnv` (the current mode included) and a fresh conversation (`TokenMap`,
  `RefRegistry`, `ReleaseAudit`).
- Result: the progress label, ms, error or not, and the exact JSON text that would be sent
  (pretty-printed). "Show names" rehydrates person tokens locally, as the Ask sheet does. Each `ref`
  in the result has "Open records", which opens the records panel through the same guard.
- The line "Runs the tool in this browser. Nothing is sent to Anthropic." sits above the button.
  The console never imports the client module; a test runs it with a client that throws if called.
- In the Ask sheet, Developer mode adds "Open in console" to each tool call under "What was sent".

### 5.6 State

Sections as sheets of label and value, each with "Copy as JSON":

- Route: view, tab, the raw hash, the scope read from the address, canonical filters.
- Scope: `ctx.filters`, scope label, `isCompany`, window and comparison window, as-of date and where
  it comes from, people in scope.
- Mode: mode, manager and lock size, how many surfaces are shown, limited and hidden.
- Switches: pay amounts, immigration details, features, data standard (saved and on screen),
  quality lens.
- Quality index: each dataset's tier and explanation, field tiers counted by tier
  (`ctx.quality`, `tierCounts`).
- Data: sources, versions, reference mappings and changes, metric definitions changed.
- Saved views: count, applied, set to open Census.
- Panels: drill stack depth and top kind, Help (open, tour), Ask (open, turns, key set or not,
  model, workspace ID set or not).
- Storage: `storageUnavailable`, keys and bytes.

A note under the Copy buttons: "Copied state holds employee IDs from the filters. Use Report a
problem for tickets." The Ask key and workspace ID are never copied.

### 5.7 Timings

- `timed(name, fn)` in `src/lib/timing.ts` wraps a call in `performance.mark` and `measure`
  (try/catch). It records only while a module flag is on, which `src/access/connect.ts` sets in
  Developer mode, so the other modes pay nothing. The Scorecard's existing
  `census:scorecard:<view>` entries keep recording as today.
- Names: `census:context`, `census:quality`, `census:headline:<view>`,
  `census:scorecard:<view>` (summaries), `census:actions:<view>`, `census:drill:<kind>`,
  `census:ask:<tool>`, `census:export:<view>`.
- The tab: a table-only Figure of every `census:` measure (name, runs, median, max, last) and a
  BarList of the slowest. "Run all engines" runs each view's `headline`, `summary` and `actions`
  twice on the live inputs, once on a fresh `buildContext` (cold: the per-context caches miss) and
  once on the live context (warm), and reports both. "Clear timings" clears the `census:` measures.

### 5.8 Debug overlays

Three switches, kept in `census:dev` (`{ "v": 1, "overlays": { "figures": false, "tours": false,
"metrics": false } }`), set from Settings > Mode, the Developer page header and Alt+Shift+D (all on
or all off). Developer mode only; off on screen in other modes.

- **Figure ids:** a small label on each figure's top-left corner with its id (11px mono,
  `bg-ink text-on-ink`, `rounded-[3px]`); clicking it copies the id.
- **Tour targets:** a 1px dashed `--rule-strong` outline and a label on every `[data-tour]`
  element.
- **Metric ids on hover:** hovering a KPI tile, figure or finding shows a tip with its metric id and
  the fields it reads. `KpiTile`, `Figure` and the readout's finding items always carry
  `data-metric`; they add `data-uses` only while this overlay is on.

One component, `DevOverlay` (`src/dev/DevOverlay.tsx`), mounted by the shell while any overlay is
on: it sets `data-dev-overlay` on `<html>` (CSS outlines in `src/styles/index.css`) and draws the
labels in one positioned layer that follows layout with a ResizeObserver. No glows, shadows or
color washes; tokens only.

### 5.9 Developer additions elsewhere

- Error boundaries show "Details" with the message and component stack.
- The records panel's Export menu adds "Copy drill spec (JSON)" (kind, title, filter, uses, rows).
- The Ask sheet's "What was sent" adds "Open in console" per tool call.
- `#team` opens by address and from Inventory (2.2).

### 5.10 What it reuses

`VIEWS` and `viewByKey`; each view's `headline`, `summary` and `actions`; `renderWholeView` and the
figure registry; `ctx.metrics` and `formulaRows`; `DATASETS`, `DATASET_KEYS` and `QUERY_DATASETS`;
`ctx.quality`, `tierCounts` and `TierBadge`; `TOOL_DEFINITIONS`, `TOOL_NAMES`, `runTool`,
`toolLabel`, `TokenMap`, `RefRegistry` and `ReleaseAudit`; `KINDS`, `ROW_OPENS`, `drillDataset` and
`buildDrillTable`; `ROUTE_VIEWS`, `parseHash`, `splitHash`, `readScope`, `DATA_TABS` and
`DATASET_PANELS`; `SETTINGS_SECTIONS`, `DEFAULT_SETTINGS` and `pickSettings`; `clearCensusStorage`'s
key walk; the Scorecard's User Timing entries; `ARTICLES` and `TOURS`; `Figure`, `DataTable`,
`KpiStrip`, the chart kit and the export library.

---

## 6. Implementation

### 6.1 Modules

```
src/access/
  modes.ts        Mode, MODES, MODE_LABEL, MODE_HINT, homeOf(mode)
  copy.ts         NOT_SECURITY_SHORT, NOT_SECURITY_LONG, toasts' wording
  surfaces.ts     SurfaceId and its builders (S.view, S.tab, S.figure, …)
  policy.ts       decide(), can(), routeDecision(), the Manager tables and hide lists (pure)
  matrix.ts       inventory types, accessMatrix(inventory) (pure)
  lock.ts         ManagerLock, managerLock(), clampFilters() (pure)
  records.ts      inLock(kind, row, ctx) (pure)
  store.ts        useMode (Zustand), persisted at census:mode
  connect.ts      registers the store's filter guard and route guard, follows tabs, sets the timing flag
  hooks.ts        useAccess(), useCan(surface)
  ui/ModeButton.tsx, ui/ModeMenu.tsx, ui/ManagerPicker.tsx, ui/ModeSection.tsx
  *.test.ts
src/views/team/   the My team view (index.tsx, ui/, engine/ composing the other views' engines)
src/dev/          the Developer page, inventory builders (pure, tested), DevOverlay, storageKeys, shortcuts
src/lib/timing.ts timed()
```

`src/access/` imports only types and pure modules from `@/data`, `@/views/types`, `@/drill/types`
and `@/ask/engine/types`; nothing in `src/access/` except `ui/` and `hooks.ts` imports React. The
policy never imports the view registry: callers pass the inventory.

### 6.2 The policy

```ts
export type Mode = 'hr' | 'manager' | 'developer'
export type Access = 'shown' | 'limited' | 'hidden'
export interface Decision {
  access: Access
  /** For limited and hidden: one plain sentence, shown in Developer > Access and the snapshot. */
  how?: string
}
/** Branded string ids: "view:hrbp", "tab:talent.retention", "figure:hrbp-exit-survey",
 *  "metric:talent.retention.flightRisk", "kpi:talent-key-talent-risk", "page:data",
 *  "data:metrics", "data-panel:raw", "settings:privacy", "tools:pipeline", "tools:edit",
 *  "help:article:privacy-pay", "help:tour:own-data", "help:search", "help:report", "ask",
 *  "ask:explain_quality", "ask:console", "filter:leader", "filter:exclude", "filter:standard",
 *  "filter:lens", "filter:saved-views", "header:hrbp", "header:agents", "export:view",
 *  "export:talking-points", "export:drill-spec", "drill:cases", "dataset:comp",
 *  "person:outside-org", "person:compa-ratio", "person:open-cases", "masthead:data",
 *  "masthead:dev", "shortcut:dev-overlays", "overlay:figures", "item:onboarding:i9:" */
export type SurfaceId = string & { readonly __surface: true }

export function decide(mode: Mode, surface: SurfaceId, at?: { view: string; tab?: string }): Decision
export const can = (mode: Mode, surface: SurfaceId, at?: { view: string; tab?: string }): boolean =>
  decide(mode, surface, at).access !== 'hidden'
export function routeDecision(mode: Mode, route: Route): { route: Route; redirected: boolean; reason?: string }
export function accessMatrix(inventory: AccessInventory): MatrixRow[]
```

How `decide` works:

1. Developer: shown, always.
2. HR: hidden when the surface is on `DEVELOPER_ONLY` (`page:dev`, `masthead:dev`, `overlay:*`,
   `shortcut:dev-overlays`, `ask:console`, `export:drill-spec`, `view:team`, `tab:team.*`,
   `help:article:view-team`, `help:article:developer-tools`, `help:tour:view-team`,
   `help:tour:manager-start`, `help:tour:developer-tools`), else shown.
3. Manager: an explicit table, **hidden by default**.
   - `view:*` and `tab:*`: every `ViewKey` and every tab of a shown view has an entry (3.2); a
     missing entry is hidden and fails the matrix test.
   - `figure:<id>` at a view and tab: hidden when on the figure list or its tab is hidden, else the
     tab's decision.
   - `metric:<id>`: hidden when it matches the metric list or none of its views (`def.views`) is
     shown, else shown.
   - `kpi:<id>`: hidden when its metric is hidden.
   - Every other kind: the tables in 3.1 and 3.4 to 3.14.

UI and engines ask through `ctx.access` (6.4), never by reading the mode store directly, so an
off-screen render with an override (the Manager figure scan, a manager whole-view export) gets its
own answers.

### 6.3 Store

```ts
// src/access/store.ts
export interface ModeState {
  mode: Mode
  /** Manager mode: the employee ID Census is shaped for. Kept when leaving Manager mode, so
   *  coming back needs no new pick. */
  managerId: string | null
  /** The "Choose a manager" dialog is open. */
  picking: boolean
  /** Switch modes. Manager without a manager opens the picker and keeps the current mode until one is chosen. */
  setMode: (mode: Mode) => void
  /** Pick (or change) the manager and enter Manager mode. */
  chooseManager: (employeeId: string) => void
  cancelPick: () => void
}
// census:mode = { v: 1, mode, managerId }

// src/dev/store.ts (loaded with the Developer code, read by DevOverlay)
export interface DevState {
  overlays: { figures: boolean; tours: boolean; metrics: boolean }
  setOverlay: (key: keyof DevState['overlays'] | 'all', on: boolean) => void
  /** The last figure scans, in memory only. */
  scans: { mode: Mode; at: string; figures: ScannedFigure[] }[]
}
// census:dev = { v: 1, overlays }
```

`src/data/store.ts` gains two hooks it calls but does not define: `setFilterGuard(fn | null)`
(applied inside `setFilters`, `resetFilters` and the initial filters) and `setRouteGuard(fn |
null)` (applied inside `navigate`, returning the route to show and an optional toast). Both are
registered by `connectAccess()` from `src/access/connect.ts`, called once by the shell like
`connectLens`. `HOME_VIEW` becomes `homeView()`, which asks the route guard for the mode's home
(Scorecard when none is registered, so tests and the gallery behave as today).

### 6.4 Context

`AnalyticsContext` gains:

```ts
access: {
  mode: Mode
  /** Manager mode only; null otherwise. */
  lock: ManagerLock | null
  /** decide() bound to this mode, for engines and UI that hold only ctx. */
  decide: (surface: SurfaceId, at?: { view: string; tab?: string }) => Decision
}
```

`buildContext({ …, access })` defaults to HR with no lock, so every existing test builds an HR
context unchanged. With a lock it clamps the filters, forces `showPay`, `showImmigration` and
`features.engagementSurveys` off and uses the standard passed in (the provider passes the saved
one). `AnalyticsProvider` reads `useMode` and the lock and takes an optional `access` prop for
off-screen renders. Ask's `chatContext` and `contextFor` copy `access` with the rest.

### 6.5 Where it plugs in

| Area | File | Change |
|---|---|---|
| Registry | `src/views/registry.ts` | Add `team` first in `VIEWS`; `visibleViews(ctx.access)` returns the shown views with their shown tabs |
| View tabs | `src/views/types.ts` | `withAccessTabs(view, access)` beside `withFeatureTabs`; the shell applies both |
| Scorecard views list | `src/views/scorecard/views.ts` | Add `team` to `OTHER_VIEWS` (it has no summary, so it adds nothing); the existing test keeps the list equal to the registry |
| Folder tabs | `src/app/FolderTabs.tsx` | Iterate `visibleViews`; roving index over them |
| Shell | `src/app/App.tsx` | `dev` page (lazy, Suspense, error boundary, figure registry, `CurrentViewProvider` with `datasets: []`); `ViewPage` applies `withAccessTabs`; mounts `DevOverlay`; `connectAccess()` |
| Routes | `src/data/store.ts` | `ROUTE_VIEWS` + `team`, `dev`; `PAGE_VIEWS` + `dev`; the two guards; `homeView()` |
| Navigation | `src/components/navigation.ts` | `goTo` goes through `navigate`, so the route guard covers it; `routeHash` callers that render links check `can` first (see "Links") |
| Address | `src/app/address.ts` | `putScope` and `loadAddress` go through the filter guard; the clamp toast for links and saved views (not Back and Forward) |
| Masthead | `src/app/Masthead.tsx` | `ModeButton`; Data room and Developer buttons by access; pay and immigration tags by access |
| Filter row | `src/app/FilterBar.tsx`, `LeaderPicker.tsx`, `StandardControl.tsx` | Locked leader (lock icon, org-only options, "Whole org", no mode switch), chain from the manager, org-scoped options, read-only standard |
| View header | `src/app/ViewHeader.tsx` | Lens and dataset strip, AI agents link and `HeaderActions` by access; lock in the scope line |
| Exports | `src/app/ExportMenu.tsx`, `wholeView.tsx`, `exportMeta.ts` | Shown tabs only; `renderWholeView` passes `access` to its provider; the Manager mode meta line |
| Tools | `src/app/ToolsMenu.tsx` | Filter links by `tools:<id>`; "Edit links" by `tools:edit` |
| Settings | `src/app/settings/SettingsSheet.tsx`, `src/data/settings.ts` | `'mode'` first in `SETTINGS_SECTIONS`; render and list only shown sections; `ModeSection`; This device's file buttons by access |
| Figure | `src/charts/Figure.tsx` | `ctx.access.decide(S.figure(id), currentView)` and the metric check: hidden returns null and registers nothing; "Edit definition" by access; `data-metric` (and `data-uses` under the overlay) |
| KPI strip, readout, tiles | `src/components/KpiStrip.tsx`, `Readout.tsx`, `kpiModel.ts` | Drop tiles and findings with a hidden metric; `tileTarget` returns null for a hidden route; no "vs company" delta drill in Manager mode; Focus on and finding tab links by access |
| Tier badge | `src/components/tier/TierBadge.tsx` | Not a button when `page:data` is hidden |
| Links | `src/views/ai/link.ts`, `src/views/listening/LinkedSurvey.tsx`, `src/views/data/metrics/open.ts`, view-to-view links | `useAgentLink` returns null and `LinkedSurvey` renders nothing when their view is hidden; metric links render as text when `page:data` is hidden; a small `<RouteLink view tab>` (`src/components/RouteLink.tsx`) renders text for a hidden target, and existing link sites move to it |
| Drill | `src/drill/DrillPanel.tsx`, `records.ts`, `PersonCard.tsx`, `person.ts`, `focus.ts`, `filter.ts` | Records guard (`inLock`) with the "not listed" line; hidden kinds; `rowPerson` null outside the org; limited person card; `focusScope` through the clamp; `groupScopes` offers only clamp-stable scopes; "Copy drill spec" in Developer mode |
| Action center | `src/views/actions/engine/collect.ts`, `ui/ActionCenter.tsx`, `index.tsx` | Items filtered by access after collecting (pure, on `ctx.access`); the locked "My team"; `useOpenActionCount` counts the filtered list |
| Talent | `src/views/talent/engine` (critical roles rows) | Successors outside the lock by readiness only |
| Org chart | `src/views/org/` | Root and breadcrumb at the manager; search inside the org; `openInOrgChart` refuses people outside the org |
| Ask | `src/ask/engine/tools.ts`, `scope.ts`, `tools/*.ts`, `prompt.ts`, `ui/AskSheet.tsx`, `ui/Answer.tsx` | `toolDefinitionsFor`; the `runTool` policy check; `resolveFilters` clamp; limited `get_context`, `find_metrics`, `view_summary`, `compare_groups`, `query_records`, `open_items`; the Manager prompt block; the org-size rule; new chat on mode change; plain-text links |
| Help | `src/help/articles/*`, `tours.ts`, `types.ts`, `search.ts`, `links.ts`, `diagnostics.ts`, `diagnosticInput.ts`, `ui/*` | Article and tour decisions by id; `TourStep.surface?` for steps on a hidden control (`hrbp-talking-points`, `masthead-data`, `quality-lens`, `data-standard`); the tour engine skips steps whose route or surface is hidden; search and glossary filtered; link world checks access; the mode line in Report a problem; the new articles and tours; WelcomeCard on the mode's home |
| Timings | `src/lib/timing.ts`, call sites in `headlineGate.ts`, `collect.ts`, `context.tsx`, `tools.ts`, `wholeView.tsx`, `records.ts` | `timed()` around each |

### 6.6 Lead-owned contract changes

These touch files ARCHITECTURE.md marks as the lead's; each builder that makes one says so in its
report: `ViewKey` and `VIEW_LABEL` gain `team: 'My team'` (`src/data/schema.ts`);
`ROUTE_VIEWS`, `PAGE_VIEWS`, `HOME_VIEW` and the two guard hooks (`src/data/store.ts`);
`AnalyticsContext.access` and `buildContext`'s `access` argument (`src/data/context.tsx`);
`SettingsSection` `'mode'` (`src/data/settings.ts`); `VIEWS` (`src/views/registry.ts`);
`withAccessTabs` (`src/views/types.ts`); `TourStep.surface` (`src/help/types.ts`). `scopeDatasets`
and `employeeMatcher` do not change: the lock works through `clampFilters` and `inLock`.

### 6.7 Build order

1. **Core:** `src/access/` (modes, copy, surfaces, policy, matrix, lock, records, store, connect,
   hooks), the context field, the store guards and routes, `withAccessTabs`, `visibleViews`,
   FolderTabs, the shell's route handling, Mode button, menu, picker and Settings section, the
   filter row lock. Tests 1 to 4 in 6.8.
2. **Surfaces:** Figure, KPI strip, readout, tiles, tier badge, links and `RouteLink`, records
   panel and person card, Action center, Tools, Settings sections, exports and whole-view meta,
   Talent successors, Org chart root, Help, Ask. Tests 5 and 6.
3. **Homes:** the Scorecard chart band and the My team view, with their help article, tour and
   welcome card.
4. **Developer:** the Developer page and its six tabs, `timed`, `DevOverlay`, the Ask console and
   the other developer additions. Test 7.
5. **Design polish** (its own doc), following 2.4.

### 6.8 Tests (Vitest, node environment, `*.test.ts`)

1. **Access matrix** (`src/access/matrix.test.ts`). Builds the inventory from `VIEWS` (keys and
   tabs), `DATA_TABS`, `DATASET_PANELS`, `SETTINGS_SECTIONS`, `DEFAULT_TOOLS`, `ARTICLES`, `TOURS`,
   `TOOL_NAMES`, `DRILL_KINDS`, `DATASET_KEYS`, `SHORTCUTS`, the masthead controls, the filter
   controls, the export kinds and the hide lists; renders `accessMatrix()` as a fixed-width text
   table and compares it with `src/access/__snapshots__/access-matrix.txt`
   (`toMatchFileSnapshot`), so every change to who sees what shows in review. Invariants: every
   surface is shown in Developer mode; HR differs from Developer only on `DEVELOPER_ONLY`; Manager
   has an explicit entry for every `ViewKey` and every tab of a shown view; every limited or hidden
   Manager decision has a `how`; every hidden figure id appears in the source as a Figure id (the
   same source scan `src/help/content.test.ts` uses); every hidden metric id or prefix matches the
   catalog; no `dev.` metric is in the catalog; `NOT_SECURITY_SHORT` and `NOT_SECURITY_LONG` have no
   em dash and none of the words banned in 1.6.
2. **Routes** (`src/access/route.test.ts`). For every mode, every `ROUTE_VIEWS` entry with each of
   its tabs, the Data room addresses (`#data.metrics/hrbp/attrition/voluntary`,
   `#data.employees-raw`), `#ai.agents:compliance`, `#dev.inventory:figures` and `#team`:
   `routeDecision` matches 3.15 (shown routes untouched; hidden views to the mode's home; hidden
   tabs to the first shown tab). With the store and `AddressWriter` (as in
   `src/app/addressHistory.test.ts`): a redirect replaces the entry, the address shows the home,
   and Back does not return to the hidden route.
3. **Manager scope** (`src/access/managerScope.test.ts`, on the sample). Pick a manager with a
   mid-size org and one with an org under 5. For every entry path (setFilters with a leader
   outside, leader exclude, resetFilters, an opening address with an outside leader, a saved view
   at company scope, `focusScope` from a company finding, Ask `resolveFilters` with and without a
   leader): `ctx.filters.leaderId` is in `orgIds` and include, and every row of `ctx.data.employees`
   is in `orgIds`. Every shown view's `summary` returns only KPIs and findings whose metric is shown,
   each finite or null. `collectActions` plus the access filter returns only shown views' items,
   none starting `onboarding:i9:`. `inLock` drops company rows from a "vs company" delta drill.
   `personSummary` for someone outside gives the limited card. Talent critical roles name no
   successor outside the org. Pay, immigration and engagement are off in the context.
4. **Store** (`src/access/store.test.ts`). `census:mode` round trip; corrupt, unknown and missing
   values give HR; storage that throws still gives a working store; `setMode('manager')` without a
   manager opens the picker and keeps the mode; `chooseManager` enters Manager mode; the mode is not
   in `settingsBlob`; `clearCensusStorage` removes it.
5. **Ask in Manager mode** (extend `src/ask/engine/matrix.test.ts` and `privacy.test.ts`). Every
   tool with the argument matrix in Manager mode: no token for an employee outside the org appears
   in any result except owner fields; `explain_quality` is not in `toolDefinitionsFor` and is
   refused; `view_summary` refuses `scorecard`, `comp`, `services`, `compliance`, `listening`;
   `query_records` refuses `cases`, `transactions`, `comp`, `hiringPlan`, `rightToWork`,
   `surveyResponses`, `surveyItems`; a leader token outside the org and `exclude: ["leader"]` are
   refused; an org under 5 turns Ask off; the system blocks include the Manager line.
6. **Help** (extend `src/help/content.test.ts`). Every article and tour has a decision in every
   mode; each mode's visible tours keep at least 3 steps after skipping, and every kept step's
   target and route are shown in that mode; links in a mode's visible articles to hidden targets
   render as text; the new articles and tours follow the copy rules; the `shortcuts` article lists
   no developer shortcut and `developer-tools` lists it; Report a problem names the mode and never
   the manager.
7. **Developer** (`src/dev/*.test.ts`). The inventory builders are pure and their counts equal the
   registry's (views, tabs, metrics, tools, drill kinds, datasets, routes, settings); `STORAGE_KEYS`
   covers every `census:` key literal in `src/` (a source scan) and never exposes the Ask key value;
   the Ask console runs every tool with its example input against a client that throws if called;
   `timed` records nothing outside Developer mode.

Gates as always: `npx tsc --noEmit -p .`, `npx biome check src`, `npx vitest run`, `npx vite
build`, and the one-file build (`npm run verify`). The QA crawl adds one pass per mode: open every
shown route, every shown tour and every shown article, and confirm hidden routes redirect.

---

## 7. Open questions

Decision needed: none. Every call above is made. The ones a reviewer is most likely to revisit:
Manager mode hides Talent > Retention risk, Onboarding > Hiring plan, Recruiting > Sources & offers
and the Reorg sandbox; company benchmarks stay as aggregates; a manager can narrow to leaders
inside their org; the mode is not part of the address or the settings file.
