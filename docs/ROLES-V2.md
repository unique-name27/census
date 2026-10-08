# Roles: eleven modes, each with its own home, actions and list

The user asked: "add more roles like compensation, hrbp global for one BU, hrbp for one region but
all employees, finance, chro, recruiter, talent management, hr ops, each should have their own
actions and list."

Their decisions:

1. **Both.** Every role gets its own home page with "Needs attention" (that role's action items)
   and "My list" (the records it works on), and the Action center comes back for every role,
   filtered to that role. Today it is Developer mode only because it "isn't ready yet".
2. **Pay.** Compensation sees individual pay amounts behind the existing session switch. Finance
   sees cost totals only (by cost center, business unit, level and site), never one person's pay.
   Every other role sees ratios only.
3. **CHRO** sees everything HR sees, opens on an executive home (Scorecard, top risks, monthly
   people report), with pay behind the session switch and no developer tools.
4. Keep the existing HR (the full HR team view), Manager and Developer modes. New roles: CHRO,
   Compensation, Finance, Recruiter, Talent management, HR ops, HRBP for one business unit (all
   its locations), HRBP for one region (every employee in it, across business units).

This file extends docs/ROLES.md; every rule there still holds unless a part below replaces it
(each replacement says so). Read ARCHITECTURE.md, docs/ROLES.md, docs/VIEWS.md, docs/FILTERS.md,
docs/ASK.md and docs/ASK-ACTIONS.md first, and docs/ACTION-CENTER-AUDIT.md, which this contract
adopts as the Action center's release gate and as the source of each role's item routing (part 6).
docs/TAXONOMY.md and docs/ANALYSES-RESEARCH.md (plans landing in parallel) are accounted for in
parts 4.1, 4.2 and 8.10. Every house rule applies in every role: charts in a
Figure with exports, every number drills to its records, plain sentence case with no em dashes in
sentences, nothing that looks AI-built, and the privacy rules (no protected characteristics; pay
amounts opt-in; groups under 5 hidden; employee relations never names a person; survey answers
never individual, manager cuts need 10; immigration behind a session switch).

**Modes stay an open switch.** A role shapes what Census shows; it is not security, and no copy
may say or imply that it is (docs/ROLES.md 1.6 still applies word for word). The pay and scope
rules below keep a role's screens and exports free of what that role should not be handed. They do
not stop anyone from switching to another mode.

---

## 0. The calls in one list

1. Eleven modes in five groups in the Mode menu: **HR team** (HR, CHRO), **HR business partners**
   (HRBP for a business unit, HRBP for a region), **HR practices** (Compensation, Talent
   management, Recruiter, HR ops), **Outside HR** (Finance, Manager), **Building Census**
   (Developer). The UI keeps the word "mode".
2. Four modes need a pick, made in one dialog pattern and remembered in this browser: Manager (a
   manager, unchanged), HRBP for a business unit (a business unit), HRBP for a region (a region
   from the Region column of the Locations official list; Americas, APAC and EMEA in the sample),
   Recruiter (a recruiter, from the people named as recruiter on reqs).
3. `census:mode` moves to version 2 and holds every pick; a version 1 value migrates in place.
4. Manager's lock becomes one of four **scope kinds**: `org` (Manager), `unit` (HRBP for a
   business unit), `region` (HRBP for a region) and `reqs` (Recruiter). Every scope goes through
   the one filter clamp and the one route guard. `org`, `unit` and `region` are expressed as filter
   values (leader, business unit, location); `reqs` narrows the records after the filters.
5. Finance is not a scope but filters by **business unit and period only**, so every cost total it
   sees covers whole business units.
6. Pay has three views: **switch** (HR, CHRO, Compensation, Developer: amounts while "Show pay
   amounts" is on), **totals** (Finance: cost totals over 5 or more people, never one person's
   amount, no switch) and **none** (everyone else: ratios only). Ask never sends an amount or a
   cost total, in any mode.
7. A new Compensation tab, **Workforce cost** (`comp.cost`), holds the cost totals. Finance sees
   only that tab of Compensation.
8. CHRO is HR plus an executive home; nothing HR sees is taken away. Every other new role is an
   allowlist, like Manager: what its policy does not name is hidden.
9. A new view `home` (folder tab "Home", route `#home`) is the home of CHRO and the seven practice
   and partner roles. Its body is chosen by the role. HR keeps the Scorecard, Manager keeps My
   team, Developer keeps the Developer page; each gains or keeps a "Needs attention" and a "My
   list".
10. Every home has the same three parts: a chart-led top band, **Needs attention** (the role's
    own open items, from the Action center) and **My list** (one table of the records the role
    works on). Items in the role's area owned by someone else are "Waiting on others", one click
    away.
11. The Action center comes back for every role through the audit's role lens (`roleItems`:
    needs, waiting, left) and its release checklist (docs/ACTION-CENTER-AUDIT.md parts 4 to 6),
    and the "not ready yet" rule (`NOT_READY` in `src/access/policy.ts`) is deleted in the same
    change. Item text never holds a money amount, in any mode.
12. Ask follows the role: its tool list, view and dataset enums, scope and system prompt come from
    the role.
13. `src/access/policy.ts` becomes a folder with one table per role; the access matrix snapshot
    gains a column per role and moves the explanations into a second snapshot file.

---

## 1. The roles

### 1.1 The list

| Group | UI name | Id | Scope | Home | Pick | Purpose |
|---|---|---|---|---|---|---|
| HR team | HR | `hr` | whole company | Scorecard (`#scorecard`) | none | The whole HR team's app, unchanged: every view, the Data room and Settings. |
| HR team | CHRO | `chro` | whole company | Home, executive (`#home`) | none | The chief people officer: everything HR sees, opening on the scorecard, the top risks across practices and the monthly people report. |
| HR business partners | HRBP for a business unit | `hrbp-unit` | `unit` | Home (`#home`) | a business unit | An HRBP who supports one business unit at every location: its scorecard, people, hiring, talent, pay ratios, HR ops and compliance. |
| HR business partners | HRBP for a region | `hrbp-region` | `region` | Home (`#home`) | a region | An HRBP who supports every employee in one region, across business units. |
| HR practices | Compensation | `compensation` | whole company | Home (`#home`) | none | Total rewards: pay position, merit cycle, market and workforce cost, with amounts behind the switch. |
| HR practices | Talent management | `talent-management` | whole company | Home (`#home`) | none | Performance, calibration, succession, retention risk, learning and the first 90 days. |
| HR practices | Recruiter | `recruiter` | `reqs` | Home (`#home`) | a recruiter | One recruiter's reqs: candidates, next steps, offers and the starts they produce. |
| HR practices | HR ops | `hr-ops` | whole company | Home (`#home`) | none | People operations, payroll, benefits, HRIS, global mobility: cases, transactions, leave, day-one tasks, I-9s and the data itself. |
| Outside HR | Finance | `finance` | whole company, business unit filter only | Home (`#home`) | none | FP&A partners: headcount, hiring against plan, open reqs, contractors and cost totals. |
| Outside HR | Manager | `manager` | `org` | My team (`#team`) | a manager | Unchanged (docs/ROLES.md). |
| Building Census | Developer | `developer` | whole company | Developer (`#dev`) | none | Unchanged: every view and tool, plus the Developer page. |

HR is still the default. Nothing HR, Manager or Developer shows today is taken away, except
where part 5.11 and 5.12 add a Needs attention and a My list to their homes.

### 1.2 The Mode menu

- **Button** (masthead, unchanged place and icon). Text: "HR mode", "CHRO mode", "HRBP: Silicon
  Engineering", "HRBP: APAC", "Compensation mode", "Talent management mode", "Recruiter: Maya
  Chen", "HR ops mode", "Finance mode", "Manager: Priya Raman", "Developer mode". A mode waiting
  for its pick reads "HRBP mode", "Recruiter mode", "Manager mode". Under 640px it shows the icon
  and a short name: HR, CHRO, HRBP, Comp, Talent, Recruiter, HR ops, Finance, Manager, Developer.
- **Menu** (Popover, 380px wide, at most `min(80vh, 640px)` tall with its own scroll): eyebrow
  "Mode", then the five groups, each with a `text-label` muted heading, each choice a radio with
  its name and one line. The checked choice that has a pick shows the pick under its name
  ("Silicon Engineering") and a "Change…" text button ("Change business unit…", "Change region…",
  "Change recruiter…", "Change manager…"). Arrow keys, Home and End move focus across all
  choices, groups included; Space, Enter or a click picks (the rule `ModeChoices` follows today).
  Under the choices: a rule, `NOT_SECURITY_SHORT`, and "About modes".
- **One-line hints** (`MODE_HINT`):
  - HR: "Every view, the Data room and Settings, for the HR team." (unchanged)
  - CHRO: "Every HR view, opening on the scorecard, top risks and the monthly report."
  - HRBP for a business unit: "One business unit at every location: scorecard, people, hiring and talent."
  - HRBP for a region: "Every employee in one region, across business units."
  - Compensation: "Pay position, merit cycle, market and workforce cost."
  - Talent management: "Performance, succession, retention risk and learning."
  - Recruiter: "One recruiter's reqs: candidates, offers and upcoming starts."
  - HR ops: "Cases, transactions, leave, day-one tasks and compliance work."
  - Finance: "Headcount, hiring against plan, open reqs and cost totals."
  - Manager and Developer: unchanged.
- **Disabled choices**, with the hint in place of the line:
  - HRBP for a business unit, when no active employee has a business unit: "Needs business units
    in the Employees data."
  - HRBP for a region, when no location in the loaded data has a region: "Needs a region for each
    location in Settings, Official lists, Locations."
  - Recruiter, when no req open now or opened in the last 12 months names a recruiter: "Needs a
    recruiter on each req in the Requisitions data."
  - Manager: unchanged.
- **Settings > Mode** uses the same grouped radio list (`ModeChoices`) in place of today's
  `Segmented` (eleven choices do not fit one), with `NOT_SECURITY_LONG` as the section intro, the
  current pick line ("Showing Census for Silicon Engineering", "for APAC", "for Maya Chen's reqs",
  "for Priya Raman's org") with its "Change…" button, and in Developer mode the overlay switches.

### 1.3 Choosing a business unit, a region or a recruiter

One dialog component (`ScopePicker`, generalizing `ManagerPicker`) with a config per kind. Same
markup as today: title, dek, a search field, an inline list, a foot line, a primary button
(disabled until a row is picked) and Cancel. Cancel keeps the mode Census was in.

| Kind | Title | Dek | Rows (largest first) | Foot | Confirm |
|---|---|---|---|---|---|
| Business unit | "Choose a business unit" | "HRBP mode shows Census for one business unit, at every location. Pick the one you support." | Each business unit with active employees: name, "412 employees · 7 locations". Units on the official list with nobody in the data show muted and cannot be picked. | "Census lists the business units in the Employees data." | "Show this business unit" |
| Region | "Choose a region" | "HRBP mode shows Census for every employee in one region, across business units." | Each region: name, "506 employees · Bengaluru, Hsinchu, Shanghai, Ho Chi Minh City". | "Regions come from the Region column of the Locations list in Settings, Official lists." plus, when some people work at a location with no region, "{n} people work at locations with no region." | "Show this region" |
| Recruiter | "Choose a recruiter" | "Recruiter mode shows Census for one recruiter's reqs. Pick yourself." | First, "Every recruiter" ("For a talent acquisition lead: every req"), then each name in `requisitions.recruiter` on a req open now or opened in the last 12 months (trimmed, matched case-insensitively, matched to the roster by `ownerLookup` when possible): name, "14 open reqs · 61 active candidates". | "Census lists everyone named as the recruiter on a req that is open or was opened in the last 12 months." | "Show their reqs" ("Show every req" for the first row) |
| Manager | unchanged (docs/ROLES.md 1.3) | | | | |

- **"Every recruiter"** (docs/ACTION-CENTER-AUDIT.md 5.4) keeps Recruiter mode's views and item
  routing with no `reqs` scope: the whole company's reqs, for a talent acquisition lead. The
  button reads "Recruiter: every recruiter"; it is stored as `recruiter: { "name": "*", "id":
  null }`.
- **Regions** come from the effective Locations list (`effectiveLists(...).location`, official when
  made official, else proposed from the data): each location's `region` attribute. A location in
  the data with no list entry takes `locationAttrs(location, country).region` (the known site, else
  its country). A location with no region belongs to no region. The sample gives Americas, APAC
  and EMEA. One region index (`regionIndex`, 2.2) serves every reader: the region scope, the
  region picker, Onboarding's `regionOf` and `regionSites` and Listening's `regionOfLocation`, so
  a region has one name everywhere (the audit found Listening writing "Asia Pacific" where the
  sites say "APAC").
- **A small pick can be chosen.** A business unit or region with fewer than 5 active employees, or
  reqs with fewer than 5 candidates, can be picked; the home then says "{Scope} has fewer than 5
  employees, so rates are hidden to protect anonymity. Counts and lists still show." (reqs: "Your
  reqs have fewer than 5 candidates, so rates are hidden to protect anonymity. Counts and lists
  still show.") and Ask explains why it is off (part 7).
- **A remembered pick that is gone** (new data loaded): Census stays in the mode, opens the dialog
  with a note and shows the home's empty state until someone or something is picked: "Silicon
  Engineering is not in the loaded data. Pick again.", "No location in the loaded data is in
  APAC. Pick again.", "Maya Chen is not the recruiter on any req in the loaded data. Pick again."
  (Manager's note is unchanged.)

### 1.4 Remembered in this browser

`census:mode` moves to version 2:

```json
{ "v": 2, "mode": "hrbp-region", "managerId": "E10421", "unit": "Silicon Engineering",
  "region": "APAC", "recruiter": { "name": "Maya Chen", "id": "E10877" } }
```

- Every pick is kept when the mode changes, so coming back needs no new pick (today's rule for the
  manager, extended).
- **Migration:** a `{ "v": 1, "mode", "managerId" }` value reads as version 2 with the other picks
  null and is written back as version 2 on the next change. A missing, unreadable or unknown value,
  or an unknown mode, means HR. An older build that reads a version 2 value falls back to HR (its
  parser accepts only `v: 1`), which is the safe direction.
- Everything else in docs/ROLES.md 1.4 holds: every access in try/catch; not in the address; not
  in the settings file; other open tabs follow through the storage event; "Clear everything"
  removes it; QA crawls set it before load. The recruiter's name lives only in this browser, like
  the manager's ID.
- "Copy link to this view" carries `org`, `unit` and `region` scopes as ordinary filters (leader,
  business unit, locations), as Manager mode does today. A `reqs` scope has no filter form, so its
  link carries the other filters only; HR opening it sees every recruiter's reqs.

### 1.5 What switching does

docs/ROLES.md 1.5 holds, generalized:

- A mode change is not a history entry; Back never undoes it.
- **Every mode change turns "Show pay amounts" and "Show immigration details" off** (one rule,
  whatever the modes; today only entering Manager does). The quality lens turns off when entering
  Finance or Manager. The on-screen data standard goes back to the saved one when entering Finance
  or Manager.
- Entering a scoped mode clamps the filters (part 2.3) with history `replace`. Leaving one lifts
  the scope and leaves its filter values as ordinary, removable filters, with the toast "{Mode}
  mode" and the description "The filters still show {scope}." and the action "Whole company".
  Leaving Recruiter needs no such toast (its scope was never a filter).
- Entering Finance strips the leader, department, location and level filters and every exclude,
  with the toast "Finance mode" and the description "Finance mode filters by business unit and
  period, so every cost total covers whole business units."
- A route the new mode hides is replaced by its home (part 4.13).
- The records panel closes, and Ask starts a new chat with "Mode changed, so Ask started a new
  chat." (unchanged).
- Toast on entering any mode: "{Mode button text}" with `NOT_SECURITY_SHORT` as the description.

### 1.6 Wording

`src/access/copy.ts` keeps `NOT_SECURITY_SHORT`, `NOT_SECURITY_LONG` and `BANNED_MODE_WORDS`
unchanged and gains the role names, hints, picker copy, the scope phrases (`scopeName(scope)`:
"Priya Raman's org", "Silicon Engineering", "APAC", "Maya Chen's reqs") and the generalized
toasts and lines ("Outside {scope}.", "{n} records outside {scope} are not listed.", "HRBP mode
keeps Census on Silicon Engineering. Change it with Mode." for the pin tooltip). The word "role"
may appear in Help ("each mode is shaped for a role"); "access", "permission", "restricted",
"secure", "locked down", "authorized" and "role-based access" still may not.

---

## 2. Scopes

### 2.1 Scope kinds

| Kind | Mode | What it holds | How it applies |
|---|---|---|---|
| `org` | Manager | The manager's subtree (unchanged) | The leader filter, pinned to the manager or someone inside the org, include only (docs/ROLES.md 4.2). |
| `unit` | HRBP for a business unit | One business unit | The business unit filter, pinned to that unit, include only. |
| `region` | HRBP for a region | One region and its sites | The location filter, pinned to a non-empty subset of the region's sites, include only. |
| `reqs` | Recruiter | One recruiter's requisitions | After the filters: requisitions, candidates, onboarding tasks and the starts they produce are kept only when they belong to the recruiter's reqs. |

Finance, CHRO, HR, Compensation, Talent management, HR ops and Developer have no scope, and
neither has Recruiter with "Every recruiter". Finance has a **filter restriction** instead (2.5).

The `unit` scope keys on the business unit field only. After the job taxonomy flip
(docs/TAXONOMY.md) the sample has a job family named Silicon Engineering as well as a business
unit of that name; they are different fields, and HRBP mode for the business unit never reads the
job family.

### 2.2 The lock types

```ts
// src/access/scopes/types.ts
export type ScopeKind = 'org' | 'unit' | 'region' | 'reqs'

interface ScopeBase {
  kind: ScopeKind
  /** For copy: "Priya Raman's org", "Silicon Engineering", "APAC", "Maya Chen's reqs". */
  label: string
  /** Active employees in the scope (org, unit, region), or candidates on the reqs (reqs). */
  size: number
}
export interface OrgScope extends ScopeBase {
  kind: 'org'
  managerId: string
  managerName: string
  orgIds: ReadonlySet<string>
}
export interface UnitScope extends ScopeBase { kind: 'unit'; unit: string }
export interface RegionScope extends ScopeBase {
  kind: 'region'
  region: string
  /** The region's locations in the loaded data, in list order. */
  sites: readonly string[]
}
export interface ReqsScope extends ScopeBase {
  kind: 'reqs'
  recruiter: string
  recruiterId: string | null
  reqIds: ReadonlySet<string>
  /** Applications on those reqs. */
  appIds: ReadonlySet<string>
  /** Pre-hire employee IDs matched to an accepted candidate on those reqs. */
  startIds: ReadonlySet<string>
  openReqs: number
}
export type ScopeLock = OrgScope | UnitScope | RegionScope | ReqsScope
/** Kept so code written for Manager mode compiles unchanged. */
export type ManagerLock = OrgScope
```

Each is built by a pure, memoized function (per org index, as-of date and pick):
`orgScope` (today's `managerLock`, moved), `unitScope(employees, asOf, unit)`,
`regionScope(employees, asOf, region, regionOf)` and `reqsScope(data, asOf, recruiter, dedupDays)`.
`scopeFor(mode, picks, env)` returns `{ scope, unset }` like `heldLock` does today: a pick that is
missing or gone gives an empty scope of its kind (holding nobody, never the whole company) and
`unset: true`.

`reqsScope` needs the pre-hire matching that Onboarding uses today (`upcomingPeople` in
`src/views/onboarding/engine/starts.ts`: same normalized name, the req's department, start dates
within `dedupDays`). That matcher moves to `src/lib/starts.ts` as `matchPreHires(employees,
candidates, reqs, asOf, dedupDays)`; `upcomingPeople` calls it, and so does `reqsScope`, so a
start is on a recruiter's reqs by exactly the rule Onboarding shows.

### 2.3 One clamp, one route guard

`clampFilters(filters, scope, mode): Filters` (pure; the same object when nothing changes) runs at
every entry docs/ROLES.md 4.2 lists: `setFilters`, `resetFilters`, the opening address and startup
view, Back and Forward, saved views, `focusScope`, Filter to and Leave out, Ask's `resolveFilters`
and the screen tools, and once more inside `buildContext`.

| Kind | Rule |
|---|---|
| `org` | Unchanged. |
| `unit` | `businessUnit` becomes `[unit]` in include mode unless it already is. Department values whose official parent (or, without an official list, whose majority unit in the data) is another unit are dropped. A leader whose org has no active employee in the unit is dropped. Leader, location and level keep their values and modes; Exclude works with the too-few rule. |
| `region` | `location` becomes the region's sites that the filter already names in include mode; when it names none of them, or is empty, or is in exclude mode, it becomes the region's sites minus any excluded ones (all of them when that leaves none), always in include mode. Leader, business unit, department and level keep their values and modes. |
| `reqs` | No change: every filter works inside the reqs, as on Recruiting today (a leader filter keeps reqs whose hiring manager is in that org). |
| Finance (no scope) | Leader, department, location and level are cleared; `businessUnit` keeps its values in include mode (an excluded list becomes empty). Period is kept. |

A link or saved view whose filters were changed shows one toast, worded for the mode ("HRBP mode
shows Silicon Engineering, so the link's other business units were left out.", "Finance mode
filters by business unit and period, so the link's other filters were left out."); Back and
Forward never toast. The route guard (`routeDecision`) is per mode (part 4.13).

`buildContext` applies the clamp, then `scopeDatasets`, then `applyScope(data, scope)`, which does
work only for `reqs` (2.4). `ctx.isCompany` is false in every scope; `ctx.scopeLabel` reads the
scope's label, with the narrowing after it ("APAC: Bengaluru, L4", "Silicon Engineering, not
Munich"), from `scopeLabelOf(scope, filters, org)` in `src/access/scopes/label.ts`.

### 2.4 What each scope does to every dataset

`org`, `unit` and `region` go through `scopeDatasets` exactly as the filter they pin does today
(docs/FILTERS.md part 3): each dataset follows its people, requisitions their own fields, and so
on. `reqs` is applied by `applyScope` after the filters.

| Dataset | `org` (Manager) | `unit` | `region` | `reqs` (Recruiter) |
|---|---|---|---|---|
| employees | the manager's subtree | business unit = the unit | location in the region's sites | the filtered roster, kept for names (hiring managers, owners); pre-hires kept only when in `startIds` |
| jobChanges | the person's | the person's | the person's | emptied |
| requisitions | hiring manager in the org | the req's own business unit | the req's own location | recruiter = the pick |
| candidates | their req | their req | their req | their req |
| cases | requester in the org | requester in the unit; a case with an unknown requester is left out | requester in the region; an unknown requester by the case's own location | emptied |
| transactions | the person's | the person's | the person's | emptied |
| reviews | the person's | the person's | the person's | emptied |
| succession | incumbent in the org (the manager's own role left out) | incumbent in the unit | incumbent in the region | emptied |
| learning | the person's | the person's | the person's | emptied |
| comp | not read (hidden) | the person's | the person's | emptied |
| hiringPlan | not read (hidden) | the line's business unit | the line's location; a line without one is left out, and the Hiring plan tab says how many | lines whose `reqId` is one of the reqs (the tab is hidden) |
| onboardingTasks | the person or the accepted candidate's req | same | same | applications in `appIds`, employees in `startIds` |
| rightToWork | not read (hidden) | the person's | the person's | emptied |
| surveyResponses | not read (hidden) | the respondent (employee, or candidate's req) | same | emptied |
| surveyItems | not read | reference rows, unchanged | unchanged | emptied |

`ctx.all` is never narrowed: engines keep reading it for company benchmarks (2.6). "Emptied"
datasets are datasets the role reads nowhere (part 4.12); emptying them is a second line of
defense, and the role's views never show their "nothing loaded" states because those views are
hidden.

### 2.5 Filters inside a scope

| Control | `org` | `unit` | `region` | `reqs` | Finance |
|---|---|---|---|---|---|
| Period | as today | as today | as today | as today | as today |
| Leader | pinned (docs/ROLES.md 3.10) | include or exclude; options are leaders with 3 or more people in the unit; "Whole company" reads "Whole business unit" | include or exclude; options within the region; "Whole region" | include or exclude, as on Recruiting | hidden |
| Business unit | free, values from the org | pinned: lock icon, "Business unit: Silicon Engineering", no menu | free, values from the region | free | include only, no Exclude switch |
| Department | free, from the org | free, values from the unit | free, from the region | free | hidden |
| Location | free, from the org | free, from the unit | pinned: lock icon, "Location: APAC"; the menu lists the region's sites as checkboxes ("Whole region" at the top), no Exclude switch | free | hidden |
| Level | free | free | free | free | hidden |
| People in scope | "18 of 42 people in Priya Raman's org in scope" | "380 of 412 people in Silicon Engineering in scope" | "506 of 506 people in APAC in scope" | "14 open reqs and 61 active candidates on Maya Chen's reqs" | as today |
| Reset | the manager's whole org | the whole unit, default period | the whole region, default period | the whole reqs, default period | whole company, default period |
| Saved views | through the clamp | through the clamp | through the clamp | as today | through the clamp |

Option lists and counts come from inside the scope (`dimensionOptions(..., within)` with the
scope as `within`), and the too-few rule for Exclude is unchanged.

### 2.6 Company comparisons

docs/ROLES.md 4.4 holds for every scope: "vs company" deltas, company reference lines and
"Company" bars stay, as aggregates over `ctx.all`; a comparison never opens records outside the
scope (the records guard drops them and the "vs company" delta is not clickable,
`ui:kpi-delta-company`). In a `reqs` scope the comparison is "vs all reqs" (time to fill, offer
acceptance, days waiting), worded so by Recruiting's tiles when `ctx.access.scope.kind === 'reqs'`.
No scope shows a breakdown by groups outside itself: breakdowns read `ctx.data`.

### 2.7 People and records outside the scope

- **Records panel.** `inScope(kind, row, ctx)` in `src/access/scopes/records.ts` replaces
  `inLock` (which stays as a wrapper). For `org` it is today's rule. For `unit` and `region` it
  scopes `ctx.all` to the scope's pinned filter once per context (cached, as `orgScope` does) and
  keeps rows whose identity is in that scoped data: employee-keyed kinds by employee ID,
  requisitions by req ID, candidates by application or req, onboarding tasks by person or
  application, cases by case ID, hiring plan lines by their own fields, succession by incumbent.
  Grouped kinds (`surveyGroups`, `leaveGroups`) are computed inside the scope and kept. For `reqs`
  it keeps requisitions in `reqIds`, candidates in `appIds` or on those reqs, onboarding tasks by
  `appIds` or `startIds`, and employees in `startIds`; every other kind is left out. The panel
  says "{n} records outside {scope} are not listed."
- **Person card.** Someone outside the scope gets the limited card: name, title, department and
  "Outside {scope}.", no actions (docs/ROLES.md 3.12, generalized). `personInScope(id, access)`
  replaces `personInLock`.
- **Names.** In `org` and `reqs` scopes, people outside appear by name only as owners (recruiter,
  hiring manager, coordinator, an HRBP who owns an item) and, for Manager, in the reporting line.
  In `unit` and `region` scopes (HR business partners), names outside the scope also show where a
  record inside it names them, as plain text with their business unit or site: a successor in
  another unit ("Ana Ruiz, Data Center Group"), a manager above the scope. They never open.
- **Org chart.** `org`: unchanged (rooted at the manager). `unit` and `region`: the chart keeps
  the whole tree for readability and dims cards outside the scope, as the business unit and
  location filters already do; search finds people inside the scope only; a dimmed card's
  details panel is the limited card.
- **Succession.** `org`: unchanged (readiness only). `unit` and `region`: successors outside the
  scope by name and readiness, not openable. `reqs`: not shown (Talent is hidden).
- **Action center.** Items about people in the scope, plus items anywhere owned by someone in the
  scope (docs/ROLES.md 3.4, generalized: `withoutScope(ctx)` replaces `withoutLeader` for the wide
  run). In `reqs`: items about the reqs and their starts, plus items anywhere owned by the
  recruiter.

### 2.8 Small groups

Unchanged and applied inside every scope: rates, averages and shares over fewer than 5 people are
hidden, breakdowns fold small groups into "Other (k)", Exclude never leaves out 1 to 4 people,
survey manager cuts need 10, and employee relations items are left out of the Action center when
the scope holds fewer than 5 people. A scope under 5 sees counts and lists, every rate "—", and
the home's note (1.3).

---

## 3. Pay

### 3.1 Three pay views

| Pay view | Modes | "Show pay amounts" | Individual amounts (`pay: true`) | Cost totals (`cost: true`) | Ratios |
|---|---|---|---|---|---|
| switch | Developer, HR, CHRO, Compensation | shown, off by default, off on every mode change | while the switch is on | while the switch is on | always |
| totals | Finance | hidden | never | always, under the cost guard (3.2) | only on the figures Finance shows, which carry none (Compensation's ratio tabs are hidden) |
| none | HRBP for a business unit, HRBP for a region, Talent management, HR ops, Recruiter, Manager | hidden | never | never | wherever the role's views show them |

HR keeps the switch because HR mode is the existing full HR team view, which the user kept as it
is; "every other role sees ratios only" applies to the new roles and Manager.

In the context: `ctx.showPay` is true only in a switch mode with the switch on (unchanged meaning:
individual amounts may show). New `ctx.showCost` is `ctx.showPay || mode === 'finance'`. Columns
gain `cost?: true` beside `pay?: true` (`Column` in `src/charts/types.ts` and the export column
type in `src/lib/export/types.ts`); `visibleColumns(columns, { pay: ctx.showPay, cost:
ctx.showCost })` drops what is not allowed, in tables, CSV, Excel, slides and copy. A column that
holds one person's amount is `pay: true`; a column that holds a total over a group is `cost: true`.

Re-marking existing columns: Compensation's merit spend by business unit (`eligibleBaseUsd`,
`spendUsd`, `overUsd` in `src/views/comp/columns.ts`) become `cost: true` (they are business unit
totals); per-person gap columns (`gapUsd` on below minimum and above maximum) stay `pay: true`.

Session switch for immigration details follows the same pattern: shown in Developer, HR, CHRO and
HR ops; hidden and off elsewhere.

### 3.2 Finance cost totals

**Where.** A new Compensation tab, Workforce cost (`comp.cost`, after Merit cycle), and the
Finance home (5.10). In Developer, HR, CHRO and Compensation the tab shows behind "Show pay
amounts" (its figures show the empty state "Turn on Show pay amounts to see cost totals." with the
switch as `emptyAction`); in Finance it always shows; every other mode hides it.

**Definitions** (new metrics in `src/views/comp/metrics.ts`, engine `src/views/comp/engine/cost.ts`,
pure):

| Metric | Name | Formula | Notes |
|---|---|---|---|
| `comp.cost.people` | People costed | active employees at the as-of date with a comp row and a known `fxToUsd` | a count; those without FX are named in the note ("12 people without an exchange rate are left out") |
| `comp.cost.base` | Annual base cost | Σ baseSalary × fxToUsd | USD, full-time equivalent, a snapshot at the as-of date |
| `comp.cost.targetCash` | Target cash cost | Σ baseSalary × (1 + targetBonusPct) × fxToUsd | missing target bonus counts as 0 and the note says how many |
| `comp.cost.equity` | Annualized equity | Σ annualEquityUsd | |
| `comp.cost.perHead` | Target cash per employee | targetCash ÷ people | |
| `comp.cost.openReqsAtMid` | Open reqs at range midpoint (estimate) | for each open req, the median `rangeMid × fxToUsd` of active employees at its level and location (5 or more), else its level company-wide (5 or more), else no estimate | labeled "estimate" in every title and definition; reqs without an estimate are counted in the note |

Contractors and interns have no comp rows; their counts come from People stats
(`hrbp.workforce.contingent`), shown beside the totals, never costed.

**Figures that show cost totals** (all `cost: true` amounts; nothing else in Census shows a
total of pay to Finance):

| Id | Where | Form | Rows and drill |
|---|---|---|---|
| `comp-cost-kpis` | Workforce cost | KpiStrip: Target cash cost, Annual base cost, Annualized equity, People costed, Target cash per employee, Contractors and interns | each total opens the people it counts (below) |
| `comp-cost-by-cost-center` | Workforce cost | BarList, top 12 cost centers and Other, target cash | table: cost center, name (official list), department, people, base, target cash, equity, per employee |
| `comp-cost-by-unit` | Workforce cost; Finance home as `home-fin-cost-unit` | HBars stacked: base, bonus at target, equity, by business unit | Filter to the unit |
| `comp-cost-by-level` | Workforce cost | Columns in `LEVELS` order, target cash, people as secondary | |
| `comp-cost-by-site` | Workforce cost | BarList by location, target cash in USD | note: "Converted to USD at each row's exchange rate" |
| `comp-cost-merit-by-unit` | Workforce cost | Merit spend against budget by business unit (the Merit cycle tab's rows, same engine) | `cost: true` amount columns |
| `comp-cost-open-reqs` | Workforce cost | BarList by business unit: open reqs at range midpoint (estimate) | opens the reqs (requisitions kind) |
| `home-fin-cost-center` | Finance home | as `comp-cost-by-cost-center`, top 8 | |

**The cost guard** (in `cost.ts`, applied to every total above, in every mode):

1. **Minimum.** A total, per-employee figure or share over fewer than `minGroupOf` (5) costed
   people is null: "—" with "Hidden to protect anonymity (n < 5)". The scope's own total follows
   the same rule.
2. **No subtraction.** In each breakdown, groups under 5 fold into "Other (k)". While "Other" is
   still under 5 and the breakdown's total is shown, the smallest shown group joins it, until
   "Other" reaches 5 or nothing is left to fold. So no hidden group is ever the total minus the
   shown groups. A test checks this for every breakdown on the sample and on small fixtures.
3. **Whole business units only, in Finance.** Finance filters by business unit and period only
   (2.3), "Filter to" and "Focus on" are offered only for business unit groups, and Exclude is
   off. Two Finance scopes therefore always differ by whole business units, so comparing two
   totals cannot single out a person. (Modes that show the switch keep every filter: they can see
   amounts anyway.)
4. **Drills.** A cost total opens the people it counts. In Finance it opens the `employees` kind
   (ID, name, cost center, department, level, location, employment type, hire date) and never the
   `comp` kind, which Finance does not list (4.12); in the switch modes it opens the `comp` kind,
   whose amount columns follow the switch. No drill in Finance carries an amount column.
5. **Exports.** Figure exports carry exactly the rows shown (cost columns kept in Finance, `pay`
   columns dropped). "Export detail rows" on a cost figure writes the people without amounts in
   Finance. Whole-view exports and the deck follow the same columns. Finance export meta adds
   "Cost totals cover groups of 5 or more people. Individual pay is left out." in place of the
   "Pay amounts" line.
6. **Text.** Findings never state one person's amount unless `ctx.showPay` (today's
   Compensation rule). Action items never hold an amount in `what` or `note`, in any mode: the
   audit (3.13) found "$4,008 a year in USD" written into item text, where no column rule can drop
   it and Copy note pastes it into email. Amounts move to the new `ActionItem.amount` (audit 4.1),
   which the Action center renders as a `pay: true` column ("Amount (USD)"), so it shows only with
   the switch on and never in a copied note. Finance lists no item about one person's pay.
7. **Ask.** No tool returns an amount or a cost total in any mode (docs/ASK.md "pay amounts never
   do", unchanged). Finance's Ask answers headcount, plan and requisition questions and points to
   Compensation, Workforce cost for cost.

### 3.3 Other money on screen

- Compensation's per-person amounts (gap to minimum, over maximum, every amount in the `comp`
  drill and the person card) stay `pay: true`: Developer, HR, CHRO and Compensation with the switch
  on, nowhere else.
- The Data room's raw grids follow `ctx.showPay` as today; HR ops (which has the Data room and no
  switch) sees comp rows without amounts.
- The Monthly people report includes cost totals only when the switch is on in the mode it is
  made in.

---

## 4. The access matrix

Every surface, per mode. **S** shown as in HR mode today; **L** limited, with the limit stated
in 4.2 or the row's note; **H** hidden: not rendered, not in exports, not reachable by link,
shortcut, tour, search or Ask. "home" marks the mode's home.

Columns: **Dev** Developer · **HR** · **CHRO** · **BU** HRBP for a business unit · **Rgn** HRBP
for a region · **Comp** Compensation · **Tal** Talent management · **Ops** HR ops · **Rec**
Recruiter · **Fin** Finance · **Mgr** Manager.

Two rules cover most rows, as today: Developer shows everything; CHRO equals HR except that
CHRO shows `home` (its home) and its home figures. Every other new mode is an allowlist.

### 4.1 Views and sub-tabs

Folder-tab order per mode:

- HR: unchanged. CHRO, BU, Rgn: Home · Scorecard · Recruiting · Onboarding · People stats · Org
  chart · HR ops · Talent · Compensation · Compliance · Listening · AI in HR.
- Comp: Home · Scorecard · People stats · Org chart · Talent · Compensation · Listening · AI in HR.
- Tal: Home · Scorecard · Onboarding · People stats · Org chart · Talent · Listening · AI in HR.
- Ops: Home · Scorecard · Onboarding · People stats · Org chart · HR ops · Compliance · Listening ·
  AI in HR.
- Rec: Home · Recruiting · Onboarding · AI in HR.
- Fin: Home · Recruiting · Onboarding · People stats · Org chart · Compensation.
- Mgr: unchanged. Dev: the HR tabs, plus Home and My team by address.

| View · tab | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Home (`home`, new) | S (preview, 5.13) | H | S home | S home | S home | S home | S home | S home | S home | S home | H |
| My team (`team`) | S by address | H | H | H | H | H | H | H | H | H | S home |
| Scorecard | S | S home | S | S (scope) | S (scope) | S | S | S | H | H | H |
| Recruiting · Overview | S | S | S | S | S | H | H | H | L | H | L |
| Recruiting · Pipeline | S | S | S | S | S | H | H | H | S | H | S |
| Recruiting · Requisitions | S | S | S | S | S | H | H | H | L | L | L |
| Recruiting · Sources & offers | S | S | S | S | S | H | H | H | L | H | H |
| Onboarding · Upcoming starts | S | S | S | S | S | H | H | S | L | L | S |
| Onboarding · First 90 days | S | S | S | S | S | H | L | S | H | H | L |
| Onboarding · Hiring plan | S | S | S | S | S | H | H | H | H | S | H |
| People stats · Overview | S | S | S | S | S | S | S | S | H | S | S |
| People stats · Workforce | S | S | S | S | S | S | S | S | H | S | S |
| People stats · Attrition | S | S | S | S | S | S | S | L | H | L | L |
| People stats · Movement | S | S | S | S | S | S | S | S | H | H | S |
| People stats · Org design | S | S | S | S | S | L | S | L | H | H | L |
| People stats · Special analyses (`analyses`, docs/ANALYSES.md) | S | S | S | S | S | L | L | H | H | L | L |
| Org chart · Chart | S | S | S | L | L | L | L | L | H | L | L |
| Org chart · Reorg sandbox | S | S | S | S | S | H | H | H | H | H | H |
| HR ops · Overview, Cases, HR transactions, Leave & return, Service levels | S | S | S | S | S | H | H | S | H | H | H |
| Talent · Overview | S | S | S | S | S | L | S | H | H | H | L |
| Talent · Performance | S | S | S | S | S | S | S | H | H | H | S |
| Talent · Potential & succession | S | S | S | L | L | H | S | H | H | H | L |
| Talent · Retention risk | S | S | S | S | S | H | S | H | H | H | H |
| Talent · Learning | S | S | S | S | S | H | S | H | H | H | L |
| Compensation · Overview, Range position, Pay for performance, Market, Merit cycle | S | S | S | L | L | S | H | H | H | H | H |
| Compensation · Workforce cost (new, `cost`) | S (switch) | S (switch) | S (switch) | H | H | S (switch) | H | H | H | S | H |
| Compliance · Overview, Right to work, Export control, Deadlines | S | S | S | L | L | H | H | S | H | H | H |
| Listening · Overview | S | S | S | S | S | S | S | S | H | H | H |
| Listening · Candidates & hiring | S | S | S | S | S | H | H | H | H | H | H |
| Listening · Onboarding | S | S | S | S | S | H | S | S | H | H | H |
| Listening · Stay & exit | S | S | S | S | S | S | S | H | H | H | H |
| Listening · Managers | S | S | S | S | S | H | S | H | H | H | H |
| Listening · Services & learning | S | S | S | S | S | H | S | S | H | H | H |
| Listening · Engagement | while on | while on | while on | while on | while on | H | while on | H | H | H | H |
| AI in HR · Agents | S | S | S | S | S | S | S | S | S | H | H |
| Action center (`#actions`) | S | S | S | L | L | L | L | L | L | L | L |
| Data room (`#data`) | S | S | S | H | H | H | H | S | H | H | H |
| Developer (`#dev`) | S | H | H | H | H | H | H | H | H | H | H |

Special analyses (`hrbp.analyses`, docs/ANALYSES.md): decided per analysis in 4.2. Every
allowlist mode's table names the tab and its four sub-addresses; the matrix test fails while one
is missing. Finance sees People stats with only Overview, Workforce, Attrition (limited) and this
tab (limited) shown.

### 4.2 What "limited" means, role by role

These lists live in each mode's policy table (part 8.3). Metric ids are checked against the
catalog and figure ids against the source by the matrix test.

**One rule for linked survey numbers (all modes):** `LinkedSurvey` and every survey headline
another view shows render nothing when the survey's Listening tab is hidden in the mode (today
the whole Listening view is checked). That one rule produces most survey limits below.

**Special analyses** (People stats tab `analyses`, docs/ANALYSES.md): four analyses with
sub-addresses `#hrbp.analyses:quality`, `:declines`, `:stages`, `:pyramid`, each a policy surface
(`tab:hrbp.analyses:quality` and so on), so the picker lists only the shown ones and a deep link
to a hidden one opens the first shown one (docs/ANALYSES.md 1.7, generalized to every mode):

| Analysis (metric prefix) | Dev, HR, CHRO, BU, Rgn | Comp | Tal | Fin | Ops, Rec | Mgr |
|---|---|---|---|---|---|---|
| Quality of hire (`hrbp.quality.`; first ratings and education) | S | H | S | H | H | H |
| Why offers are declined (`hrbp.declines.`; candidates, `offerPositionInRange` is a ratio) | S | S, without `hrbp-declines-candidate-survey` (Listening, Candidates & hiring is hidden) | H | H | H | H |
| Engineering by stage (`hrbp.stages.`) | S | H | L: without `hrbp.stages.planned` (no hiring plan) | S, with planned hires | H | L (ANALYSES.md) |
| Workforce pyramid (`hrbp.pyramid.`) | S | S | S | S | H | S |

So the tab is **L** for Compensation, Talent management and Finance in 4.1 terms. Compensation
lists the `candidates` kind for the declines analysis (4.12). Finance's drills from Engineering by
stage and the pyramid open employees without ratings. On the hide lists: Compensation
`hrbp.quality.` and `hrbp.stages.`; Talent management `hrbp.declines.` and exact
`hrbp.stages.planned`; Finance allows `hrbp.stages.` and `hrbp.pyramid.` (4.2's Finance list).

- **HRBP for a business unit, HRBP for a region**
  - Scope: everything inside the unit or region (part 2).
  - Compensation: ratios only. The "Show pay amounts" switch, Cycle settings and every `pay` and
    `cost` column are hidden; Workforce cost is hidden.
  - Compliance: the "Show immigration details" switch is hidden and off, so authorization types
    never show per person; counts by type still show.
  - Org chart: cards outside the scope dimmed and limited (2.7).
  - Talent, Potential & succession: successors outside the scope by name and readiness, not
    openable.
  - Data room, Settings data sections and the Developer page are hidden.
- **Compensation**
  - People stats, Org design: manager feedback hidden (Listening, Managers is hidden).
  - Org chart: no "Simulate exit".
  - Talent, Overview: the key talent at risk tile, table and finding and the 9-box flight-risk
    overlay are hidden (metrics `talent.retention.*`, `talent.finding.keyTalent`); Performance is
    shown in full (ratings feed merit).
  - Hidden metric prefixes besides hidden views: `talent.retention.`, `talent.succession.`,
    `talent.learning.`, `onboarding.`, `recruiting.` (except the metrics of the offer declines
    analysis, which Compensation sees), `org.scenario.`; exact
    `talent.finding.keyTalent`, `talent.finding.criticalNotReady`,
    `talent.finding.successionExposed`, `talent.finding.trainingOverdue`,
    `talent.finding.goodSuccession`, `talent.finding.goodTraining`.
- **Talent management**
  - Onboarding, First 90 days: I-9 Section 2 on time and new hires entered by day -3 are hidden
    (`onboarding.first90.i9Section2`, `onboarding.first90.newHireEntered`, figure
    `onboarding-new-hire-entered`): they are HR ops and Compliance measures.
  - Org chart: no "Simulate exit".
  - Compensation is hidden; the person card has no compa-ratio. The flight-risk model still uses
    compa-ratio as a factor and shows it as its plain reason ("Paid low in range"), never the
    value.
- **HR ops**
  - People stats, Attrition: the exit survey number is hidden; Org design: manager feedback hidden
    (their Listening tabs are hidden).
  - Org chart: no "Simulate exit".
  - The person card shows the open case count (employee relations left out, as today), no
    compa-ratio.
- **Recruiter**
  - Scope: their reqs (part 2).
  - Recruiting, Overview: the "Hires vs plan" tile is hidden (`onboarding.plan.*`).
  - Recruiting, Requisitions: hiring manager satisfaction is hidden (Listening is hidden).
    Recruiter load shows the recruiter's own row only, because the data is their reqs.
  - Recruiting, Sources & offers: candidate experience is hidden.
  - Onboarding, Upcoming starts: their starts only; I-9 tasks are left out of readiness by task
    (an I-9 measure is HR ops' and Compliance's), as in Manager mode. Background checks and
    export-control screening show their state (recruiters manage start dates around them).
  - Metric allowlist: `recruiting.` (without `recruiting.data.reqMatch`), `onboarding.upcoming.`,
    `actions.`, `ai.`; every other metric is hidden.
- **Finance**
  - Filters: business unit and period only (2.3).
  - Recruiting: only Requisitions, without recruiter load, hiring manager satisfaction and the
    candidate counts' drills (candidates is not a kind Finance lists, so those cells are plain
    numbers, rule in 4.12).
  - Onboarding, Upcoming starts: contingencies read as the team holding them ("With People ops",
    "With Trade compliance"), as in Manager mode; readiness by task and owner shown.
  - Onboarding, Hiring plan: shown in full.
  - People stats, Attrition: rates and counts only; exit reasons (`hrbp.attrition.exitReasons`),
    the regretted leavers table (`hrbp-regretted-leavers`) and exits by last rating
    (`hrbp-exits-rating`) are hidden.
  - Org chart: no "Simulate exit"; the details panel shows no rating or potential
    (`person:ratings`).
  - Compensation: only Workforce cost.
  - Metric allowlist: `hrbp.headcount.`, `hrbp.flow.`, `hrbp.workforce.`, `hrbp.attrition.`
    (without `exitReasons`), `hrbp.findings.rapidGrowth`, `hrbp.findings.unevenGrowth`,
    `recruiting.reqs.`, `onboarding.upcoming.`, `onboarding.plan.`, `comp.cost.`, `org.chart.`,
    `org.people.`, `org.managers.`, `org.layers.`, `org.openRoles.`, `actions.`, plus the
    Special analyses' `hrbp.stages.` and `hrbp.pyramid.`.
- **Manager**: docs/ROLES.md 3.3, unchanged.
- **CHRO**: none beyond HR's.

### 4.3 Masthead and page frame

| Surface | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Wordmark (goes home) | `#dev` | `#scorecard` | `#home` | `#home` | `#home` | `#home` | `#home` | `#home` | `#home` | `#home` | `#team` |
| Mode button | S | S | S | L name | L name | S | S | S | L name | S | L name |
| "Pay amounts shown" tag | while on | while on | while on | H | H | while on | H | H | H | H | H |
| "Immigration details shown" tag | while on | while on | while on | H | H | H | H | while on | H | H | H |
| Tools | S | S | S | L | L | L | L | L | L | L | L |
| Actions button and count | S | S | S | L | L | L | L | L | L | L | L |
| Data room button | S | S | S | H | H | H | H | S | H | H | H |
| Developer button | S | H | H | H | H | H | H | H | H | H | H |
| Settings, Ask, Help | S | S | S | L | L | L | L | L | L | L | L |
| Scope line | S | S | S | L pin | L pin | S | S | S | L pin | S | L pin |
| Quality lens switch and dataset tier strip | S | S | S | S | S | S | S | S | S | H | H |
| "AI agents for {view}" link | S | S | S | S | S | S | S | S | S | H | H |
| Header: People stats "Copy talking points" | S | S | S | S | S | H | H | H | n/a | H | H |
| Header: Compensation pay switch and Cycle settings | S | S | S | H | H | S | n/a | n/a | n/a | H | n/a |
| Header: Compliance "Show immigration details" | S | S | S | H | H | n/a | n/a | S | n/a | n/a | n/a |
| Header: Scorecard "Monthly people report" | S | S | S | S (scope) | S (scope) | S | S | S | n/a | n/a | n/a |
| Header: AI in HR add, import, export, reset | S | S | S | H | H | H | H | H | H | n/a | n/a |
| Tier badge as a button (opens the dataset's Quality panel) | S | S | S | L | L | L | L | S | L | L | L |
| "Edit definition" in popovers | S | S | S | H | H | H | H | S | H | H | H |
| Welcome card | H | Scorecard | Home | Home | Home | Home | Home | Home | Home | Home | My team |
| Error boundary details | S | H | H | H | H | H | H | H | H | H | H |

"L" on the tier badge: glyph, word and hover explanation, not a button (no Data room). "L name"
on the Mode button: it reads the pick. "L pin": the scope line starts with the lock icon and names
the scope. Tools, Settings and Help are limited to what 4.6 to 4.8 show. The Actions count is the
mode's Needs attention count (`needs`, 6.1); in Developer, HR and CHRO it counts every open item,
as today.

### 4.4 Action center

| Surface | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Page | S | S | S | L | L | L | L | L | L | L | L |
| Items listed | all | all | all | in scope (2.7) | in scope | from shown views | from shown views | from shown views | on their reqs | from shown views | as today |
| "Needs attention" and "Waiting on others" lists (6.1) | H | H | H | S | S | S | S | S | S | S | S |
| "My team" picker | S | S | S | H (the pin) | H (the pin) | H | H | H | H | H | L pinned |
| Header counts, key figures, charts | S | S | S | S | S | S | S | S | S | S | S |
| Filters, Waiting on, Copy note, Mark handled, Snooze, Undo, Reopen | S | S | S | S | S | S | S | S | S | S | S |
| Export list, per-group Excel | S | S | S | S | S | S | S | S | S | S | S |
| Employee relations items | counts only | counts only | counts only | counts only | counts only | n/a | n/a | counts only | n/a | n/a | n/a |

### 4.5 Data room

Shown in full for Developer, HR, CHRO and HR ops; hidden for every other mode (as for Manager
today). HR ops is the data owner in this company (people operations includes HRIS). Metric links
(`metric:`) read as plain text wherever the Data room is hidden.

### 4.6 Settings

| Section | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Mode | S + overlays | S | S | L change | L change | S | S | S | L change | S | L change |
| Display | S | S | S | S | S | S | S | S | S | S | S |
| Data (data standard, reporting date) | S | S | S | H | H | H | H | S | H | H | H |
| Formulas | S | S | S | L | L | L | L | S | L | L | L |
| Official lists | S | S | S | H | H | H | H | S | H | H | H |
| Privacy | S | S | S | H | H | L pay | H | L immigration | H | H | H |
| Ask Census | S | S | S | S | S | S | S | S | S | S | S |
| Compensation cycle | S | S | S | H | H | S | H | H | H | H | H |
| Related tools | S | S | S | H | H | H | H | H | H | H | H |
| This device: Clear everything | S | S | S | S | S | S | S | S | S | S | S |
| This device: settings file save and load | S | S | S | H | H | H | H | S | H | H | H |

Formulas "L": the shown metrics only, no "Edit in Metric definitions" links. Privacy "L pay": only
the pay amounts switch; "L immigration": only the immigration switch. The engagement surveys
switch is in Privacy for Developer, HR and CHRO; in other modes Listening's Engagement tab follows
the saved switch (Manager: off, as today).

### 4.7 Tools menu

| Link | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Pipeline dashboard | S | S | S | S | S | H | H | H | S | H | H |
| Career lattice | S | S | S | S | S | S | S | S | S | H | S |
| Manager toolkit | S | S | S | S | S | S | S | S | S | H | S |
| HR process catalog and Atlas links | S | S | S | S | S | S | S | S | S | H | H |
| Edit links | S | S | S | H | H | H | H | H | H | H | H |

A link with no URL is left out where Edit links is hidden; the Tools button is hidden when no link
is left (Finance usually).

### 4.8 Help

| Articles and tours | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Start here, `modes` (rewritten for eleven modes) | S | S | S | S | S | S | S | S | S | S | S |
| New `view-home` (a section per role home) | S | H | S | S | S | S | S | S | S | S | H |
| `view-team` | S | H | H | H | H | H | H | H | H | H | S |
| `view-<key>` | shown views | shown views | shown views | shown views | shown views | shown views | shown views | shown views | shown views | shown views | shown views |
| `view-actions` (after the flip, 6.3) | S | S | S | S | S | S | S | S | S | S | S |
| Your data articles, tours `own-data`, `quality-definitions` | S | S | S | H | H | H | H | S | H | H | H |
| `definitions-how`, `glossary` | S | S | S | L | L | L | L | S | L | L | L |
| `privacy-browser`, `privacy-small-groups`, `privacy-sample` | S | S | S | S | S | S | S | S | S | S | S |
| `privacy-pay` (rewritten: switch, totals, ratios by mode) | S | S | S | S | S | S | H | H | H | S | H |
| `privacy-er` | S | S | S | S | S | H | H | S | H | H | H |
| `privacy-surveys` | S | S | S | S | S | S | S | S | H | H | H |
| `privacy-immigration` | S | S | S | S | S | H | H | S | H | H | H |
| `shortcuts`, `report-problem`, `troubleshooting`, `faq`, `whats-new` | S | S | S | S | S | S | S | S | S | S | S |
| `developer-tools` article and tour | S | H | H | H | H | H | H | H | H | H | H |
| Tour `getting-started` | S | S | S | H | H | H | H | H | H | H | H |
| New tour `home-start` "Getting started with your home" (Mode button, hero, Needs attention, My list, Action center) | S | H | S | S | S | S | S | S | S | S | H |
| Tours `manager-start`, `view-team` | S | H | H | H | H | H | H | H | H | H | S |
| Tours `view-<key>`, `view-actions` | follow the view; steps on hidden targets skipped |

"L" for `definitions-how` and `glossary`: Data room links read as text; the glossary lists the
mode's shown metrics. Report a problem adds the mode line: "Mode: HRBP for a region (APAC)",
"Mode: HRBP for a business unit (Silicon Engineering)", "Mode: Recruiter (recruiter set, name left
out)", "Mode: Manager (manager set, name left out)", "Mode: Finance" and so on. Business unit and
region names are not about a person; a recruiter or manager is.

### 4.9 Ask

Part 7 has the detail.

| Surface | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ask (button, sheet, answers) | S | S | S | L | L | L | L | L | L | L | L |
| `get_context`, `find_metrics`, `view_summary`, `compare_groups`, `query_records` | S | S | S | L | L | L | L | L | L | L | L |
| `explain_quality` | S | S | S | H | H | H | H | S | H | H | H |
| `open_items` | S | S | S | L | L | L | L | L | L | L | L |
| Screen tools (`get_screen`, `set_filters`, `reset_filters`, `open_view`, `show_figure`, `open_records`, `apply_saved_view`, `make_chart`) | S | S | S | L | L | L | L | L | L | L | L |
| Tool console | S | H | H | H | H | H | H | H | H | H | H |

### 4.10 Filter row

Part 2.5 for scopes and Finance. Data standard control: shown (interactive) in every HR team mode
(Dev, HR, CHRO, BU, Rgn, Comp, Tal, Ops, Rec); read only with the saved standard in Finance and
Manager. Quality lens: shown in the HR team modes, hidden in Finance and Manager. Saved views: a
saved view whose page the mode hides opens the mode's home.

### 4.11 Exports

| Export | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Figure menu (CSV, Excel, PNG, SVG, copy, detail rows, table view) | S | S | S | L | L | L | L | L | L | L | L |
| View export (this tab, all tabs; workbook, deck) | S | S | S | L | L | L | L | L | L | L | L |
| Copy link to this view | S | S | S | S | S | S | S | S | L | S | S |
| Monthly people report | S | S | S | S (scope) | S (scope) | S | S | S | H | H | H |
| Org slide | S | S | S | S | S | S | S | S | H | S | S |
| Reorg scenario export | S | S | S | S | S | H | H | H | H | H | H |
| Copy talking points | S | S | S | S | S | H | H | H | H | H | H |
| Action center Export list | S | S | S | S | S | S | S | S | S | S | S |
| Records panel CSV, Excel, copy | S | S | S | L | L | S | S | S | L | L | L |
| "Copy drill spec (JSON)" | S | H | H | H | H | H | H | H | H | H | H |
| Ask answer copy, CSV, Excel | S | S | S | S | S | S | S | S | S | S | S |
| Data room downloads | S | S | S | H | H | H | H | S | H | H | H |
| Formula index | S | S | S | L | L | L | L | S | L | L | L |

"L" on figure and view exports: shown figures and tabs only, columns per the pay view (3.1), and a
meta line in every mode but HR and Developer: "Made in {mode} mode." or "Made in {mode} mode for
{scope}." ("Made in HRBP mode for APAC.", "Made in Recruiter mode for Maya Chen's reqs."), plus
Finance's cost line (3.2). Copy link in Recruiter carries the filters but not the reqs (1.4).
Records exports: the rows the panel lists.

### 4.12 Records panel, drill kinds, datasets and the person card

Datasets each mode reads (Ask, Inventory, provenance, `dataset:<key>`):

| Mode | Datasets |
|---|---|
| Dev, HR, CHRO | all fifteen |
| BU, Rgn | all fifteen, inside the scope |
| Comp | employees, jobChanges, reviews, comp, requisitions (the org chart's open roles), candidates (the offer declines analysis), surveyResponses, surveyItems |
| Tal | employees, jobChanges, reviews, succession, learning, onboardingTasks, requisitions, surveyResponses, surveyItems |
| Ops | employees, jobChanges, requisitions, candidates, cases, transactions, learning, onboardingTasks, rightToWork, surveyResponses, surveyItems (and every dataset through the Data room) |
| Rec | requisitions, candidates, onboardingTasks (and employees for names and matched pre-hires only) |
| Fin | employees, requisitions, hiringPlan, comp (cost totals only; never in Ask) |
| Mgr | as today (eight) |

Drill kinds each mode lists (rows outside the scope left out in scoped modes):

| Mode | Kinds |
|---|---|
| Dev, HR, CHRO | all |
| BU, Rgn | all but `surveyResponses` (Data room only) |
| Comp | employees, jobChanges, reviews, comp, requisitions, candidates, surveyGroups, surveyItems, actionItems, actionOwners |
| Tal | employees, jobChanges, reviews, succession, learning, onboardingTasks, requisitions, surveyGroups, surveyItems, actionItems, actionOwners |
| Ops | employees, jobChanges, requisitions, candidates, cases, transactions, learning, onboardingTasks, rightToWork, leaveGroups, surveyGroups, surveyItems, surveyResponses, actionItems, actionOwners |
| Rec | requisitions, candidates, onboardingTasks, employees (matched pre-hires only), actionItems, actionOwners |
| Fin | employees, requisitions, hiringPlan, actionItems, actionOwners |
| Mgr | as today |

**Hidden-kind numbers render as plain numbers.** A number in a shown figure whose records are a
kind the mode does not list is not a button (no hover wash, no keyboard stop) and its table cell
is plain text. The records panel itself still answers "These records are not shown in {mode}
mode." if one is reached. The matrix test lists, per mode, every shown figure whose drill kind
is hidden, so each one is a reviewed choice.

Person card:

| Part | Dev | HR | CHRO | BU | Rgn | Comp | Tal | Ops | Rec | Fin | Mgr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Someone inside the scope (or anyone, unscoped) | S | S | S | S | S | S | S | S | L | L | L |
| Someone outside the scope | n/a | n/a | n/a | L outside | L outside | n/a | n/a | n/a | L outside | n/a | L outside |
| Compa-ratio fact | S | S | S | S | S | S | H | H | H | H | H |
| Pay amounts | switch | switch | switch | H | H | switch | H | H | H | H | H |
| Ratings and potential (`person:ratings`, new) | S | S | S | S | S | S | S | H | H | H | own final only |
| Open HR cases count (employee relations left out) | S | S | S | S | S | H | H | S | H | H | H |
| Overdue required courses | S | S | S | S | S | H | S | S | H | H | S |
| Focus on their org, Show in org chart | S | S | S | inside scope | inside scope | S | S | S | H | S | inside org |

Recruiter "L": a person card opens only for a matched pre-hire (name, role, start date, hiring
manager, readiness). Finance "L": name, title, department, level, location, cost center, hire
date, reporting line.

### 4.13 Deep links to hidden routes

One guard, per mode (docs/ROLES.md 3.15, generalized):

- A hidden view or page goes to the mode's home with history `replace` and the toast "{Page} is
  not shown in {mode} mode" / "Census opened {home} instead." / "Change mode".
- A hidden sub-tab of a shown view opens that view's first shown tab ("Compensation, Range
  position is not shown in Finance mode" / "Census opened Workforce cost instead.").
- `#home` in HR goes to the Scorecard; `#home` in Manager goes to My team; `#team` in every mode
  but Manager and Developer goes to the mode's home.
- A scoped mode waiting for its pick shows only the home's empty state (today's rule for Manager).

---

## 5. Role homes

### 5.1 Shared layout

The new view `home` (`src/views/home/`, `ViewDef` key `home`, label "Home", one tab `overview`)
renders the home of the mode on screen: CHRO, HRBP for a business unit, HRBP for a region,
Compensation, Talent management, HR ops, Recruiter, Finance. Page title (h1) is the home's name:
"Executive home", "Silicon Engineering", "APAC", "Compensation", "Talent management", "HR ops",
"Maya Chen's reqs", "Finance". The scope line follows as on every view. No greeting, no date line,
no hero copy (docs/DESIGN-REFRESH.md 4).

```
1440 (12 columns)
+---------------------------+------------------------------------------------------+
| HERO (span 4)             | KEY FIGURES (KpiStrip span 8, 5 or 6 tiles)          |
|  one text-hero number     |                                                      |
|  + its breakdown          |                                                      |
+---------------------------+------------------------------------------------------+
| LEAD CHART (span 8)                                 | SECOND CHART (span 4)       |
+------------------------------------------------------+-----------------------------+
Section "Needs attention"            [Open the Action center]
+------------------------+------------------------------------------------------------+
| Where your items wait  | Items (span 8): the role's 8 most urgent open items        |
| (span 4)               |                                                            |
+------------------------+------------------------------------------------------------+
Section "My list"
+-------------------------------------------------------------------------------------+
| One table-only Figure (span 12): the records this role works on                     |
+-------------------------------------------------------------------------------------+
Section "{role-specific}" (two to four figures, span 6 each)
```

Rules for every home:

- Every figure, tile and finding carries `metric` / `metricId` and `uses`, reuses the producing
  view's engine (cached per context) and, where one exists, its figure component, so a number on
  a home is the same number as on its view (docs/ROLES.md 2, DESIGN-REFRESH 4). Every number
  drills to its records.
- Figure ids: `home-<slug>-<thing>` for role figures (slugs: `chro`, `hrbp`, `comp`, `talent`,
  `ops`, `rec`, `fin`; both HRBP modes share `hrbp`), and three shared ids every home uses:
  `home-attention-wait`, `home-attention`, `home-list`. `src/views/home/engine/figures.ts` lists
  them per role (`HOME_FIGURES`); a test keeps it equal to the ids in `ui/`.
- Computed in the same idle pass pattern as the Scorecard, inside a 400 ms budget on the sample
  (warm); loading shows the sheets at their final size (`Pending`).
- The home's folder-tab headline is the producing view's own cheap headline: CHRO targets met
  (Scorecard), HRBP employees in scope (People stats), Compensation median compa-ratio, Talent
  management critical roles covered, HR ops open cases, Recruiter open reqs (Recruiting, scoped),
  Finance employees (People stats).
- `home` has no `summary` (it composes other views' numbers) and no `actions`.
- Header actions: CHRO and both HRBP homes carry "Monthly people report" (scoped for HRBPs);
  every home has the view Export menu.
- Phones: one column in the order drawn; the KPI strip shows four tiles and "Show all".

### 5.2 Needs attention (shared)

- **Source:** `collectActions(ctx, views)` (cached per context, sliced per view in idle time as
  the audit's 4.2 asks), then `roleItems(collected, lens, ctx)` (part 6.1): the home shows
  `needs`, sorted by `compareActions` (legal exposure first, then severity, then days overdue,
  the audit's order). The section's actions read "Open the Action center" and "Waiting on others
  (23)", which opens the Action center on that list.
- `home-attention-wait` (span 4): "Where your items wait", HBars by kind (top 6 and Other),
  stacked by due state (overdue, due in 7 days, later, no due date) in status colors with words.
  Metric `actions.items.open`; a segment opens its items (`actionItems` kind).
- `home-attention` (span 8): table-only Figure "Needs attention", the 8 most urgent items:
  severity (icon and word), what, about (opens the item's drill or person), waiting on, due in
  words ("4 d overdue"), from (view and tab, a `RouteLink`). Metric `actions.items.open`. Rows are
  read only; Mark handled and Snooze stay in the Action center. Section action "Open the Action
  center" goes to `#actions` with the role's default list.
- Empty: "Nothing is waiting on {practice} in {scope}." ("Nothing is waiting on Total rewards
  across the company."). Items from data below the on-screen standard show with their tier and
  are counted in one muted line ("4 items come from data below your standard"), per the audit's
  recommendation (its open question 1, adopted in 6.2).
- CHRO's Needs attention is the top risks instead (5.4).

### 5.3 My list (shared)

`home-list`: one table-only Figure per role, sortable, exportable (CSV, Excel), at most 50 rows on
screen with "Show all n" (the export holds every row), each row opening its records or person,
with the producing figure's metric. Columns per role are in each role's section. The list is
always inside the scope, and only lists records of kinds the mode lists.

### 5.4 CHRO: Executive home

Purpose: the monthly people review in one page. Where the people function stands against target,
what the biggest risks are across practices, and the report to send.

| Order | Id | Span | Form | Source | Metric | Drill |
|---|---|---|---|---|---|---|
| 1 | `home-chro-standing` | 4 hero | Targets met ("4 of 21") over a StatusSplit | Scorecard model (`useScorecard`, `engine/model.ts`) | `scorecard.measures.targetsMet` | a segment lists its measures; each value opens `kpi.drill` |
| 2 | `home-chro-kpis` | 8 | KpiStrip: Headcount, Voluntary attrition, Regretted attrition, Open reqs, Critical open items | the producing views' tiles | `hrbp.headcount.employees`, `hrbp.attrition.voluntary`, `hrbp.attrition.regretted`, `recruiting.reqs.open`, `actions.items.critical` | each tile's own |
| 3 | `home-chro-measures` | 8 | Measures against target, BulletList by practice (the Scorecard's component) | Scorecard rows | `scorecard.measures.status` | value opens `kpi.drill`; name opens the practice tab |
| 4 | `home-chro-practices` | 4 | HBars stacked: measures Met, Watch, Missed, No target per practice, status colors with words | Scorecard rows | `scorecard.measures.status` | a segment lists its measures |
| 5 | `home-attention-wait` | 4 | "Escalations by practice": HBars by source view stacked by due state | `roleItems` needs | `actions.items.critical` | a segment opens its items |
| 6 | `home-attention` (Needs attention) | 8 | "Escalations", at most 10, each with its owner named (5.2 columns) | `roleItems` needs: the audit's 5.1 rule (below) | `actions.items.critical` | each item's drill |
| 7 | `home-chro-risks` | 12 | "Top risks in the data": compact Readout of the critical and warning findings across every practice, up to 8, ranked as the Scorecard's top findings (each practice's most serious first), practice tag and "Open in {view}" | Scorecard model `findings.top` | `scorecard.findings.top` | each finding's drill, Focus on, Open in |
| 8 | `home-list` (My list) | 12 | "Leaders' orgs" (below) | | | |
| 9 | `home-chro-hc-trend` | 6 | Headcount over time (Scorecard's) | People stats series | `hrbp.headcount.employees` | point: month-end employees |
| 10 | `home-chro-attrition-bu` | 6 | Voluntary attrition by business unit against the company | People stats attrition | `hrbp.attrition.voluntary` | leavers; Filter to the unit |

The page's third section is titled "Top risks": escalations first (items someone must act on),
then the risks the data shows (findings). Header action: "Monthly people report" (the Scorecard's
menu and deck).

**Escalations** (the CHRO's `needs`, docs/ACTION-CENTER-AUDIT.md 5.1): every item with legal
exposure (`exposure: true`: export license breach, I-9 late, work authorization ended, final pay
late); critical roles with no successor and the incumbent at high risk of loss; regretted exit
clusters of 3 or more from one team in 12 months; and any critical item overdue more than 14 days
(setting `escalationDays` on `actions.items.critical`). Items the audit lists as missing for the
CHRO (measures missed this month per practice, the monthly people report due, merit spend over
budget, aged case backlog) follow in later releases.

**My list:** "Leaders' orgs", one row per direct report of the top leader (the CEO's direct
reports): leader, headcount, voluntary and regretted attrition (vs company), open reqs, open
critical items, critical roles covered, HR business partner (`employees.hrbp`). Built from
`hrbpModel` per leader scope (the People stats sub-org scorecard's rows). Metric
`hrbp.scorecard.offCompany`; a row opens People stats with "Focus on their org"; the leader name
opens the person card.

### 5.5 HRBP for a business unit, HRBP for a region

Purpose: the CHRO's scorecard for the HRBP's own scope, plus the attrition and hiring risks to
raise with its leaders. The page is identical for both modes; the scope and the breakdown
dimension differ: departments in a business unit, sites in a region.

| Order | Id | Span | Form | Source | Metric | Drill |
|---|---|---|---|---|---|---|
| 1 | `home-hrbp-standing` | 4 hero | Targets met for the scope over a StatusSplit | Scorecard model on the scoped context | `scorecard.measures.targetsMet` | as on the Scorecard |
| 2 | `home-hrbp-kpis` | 8 | Headcount (vs 12 months), Voluntary attrition (vs company), Regretted attrition (vs company), First-year attrition (vs company), Open reqs, Starts in 30 days | producing tiles | `hrbp.headcount.employees`, `hrbp.attrition.voluntary`, `hrbp.attrition.regretted`, `hrbp.attrition.firstYear`, `recruiting.reqs.open`, `onboarding.upcoming.starts` | each tile's own; "vs company" deltas not clickable |
| 3 | `home-hrbp-measures` | 8 | Measures against target for the scope | Scorecard rows | `scorecard.measures.status` | as on the Scorecard |
| 4 | `home-hrbp-findings` | 4 | "What to raise": compact Readout, up to 6 findings from People stats, Recruiting, Onboarding and Talent for the scope, ranked as the Scorecard ranks | the views' summaries | each finding's | each finding's |
| 5 | `home-attention-wait`, `home-attention` | 4, 8 | Needs attention (5.2) | | | |
| 6 | `home-list` | 12 | My list (below) | | | |
| 7 | `home-hrbp-attrition-by-group` | 6 | BarList: voluntary attrition by department (unit) or by site (region), company rate as the reference, glyph on groups 3 or more pts above | People stats attrition model | `hrbp.attrition.voluntary` | leavers; Filter to the group |
| 8 | `home-hrbp-attrition-trend` | 6 | Lines: rolling 12-month voluntary attrition, scope in `--s1`, company in `--deemph` | People stats trends | `hrbp.attrition.trailing12` | point: leavers in the 12 months to that month end |
| 9 | `home-hrbp-req-risk` | 6 | Scatter: open reqs by age and candidates past the screen, empty funnels in red and named | Recruiting reqs model | `recruiting.reqs.emptyFunnel` | a dot opens the req's applications |
| 10 | `home-hrbp-pipeline` | 6 | Pipeline today for the scope | Recruiting | `recruiting.pipeline.activeCandidates` | a segment opens its candidates |

**My list** (docs/ACTION-CENTER-AUDIT.md 5.7 and 5.8), a `Segmented` above one table, the export
following the chosen list:

- **"Leaders"** (business unit; default): the unit's leaders (director level and above, or every
  manager with 8 or more people in their org): leader, headcount, net change, voluntary and
  regretted attrition (vs company), open reqs, open items, flags (span, new manager,
  single-report chain), promotion rate. People stats' sub-org scorecard and manager table on the
  scoped context (`hrbp.scorecard.offCompany`). A row opens People stats focused on that leader's
  org; "Copy talking points" there prepares the 1:1.
- **"Sites"** (region; default): one row per site in the region: headcount, voluntary attrition,
  starts in 30 days, open reqs, open cases (count; employee relations counted, never named),
  reverifications due, I-9 Section 2 on time. A row applies "Filter to" the site.
- **"Key talent at risk"** (both): rating 4 or 5 and High flight risk in the scope, from Talent's
  retention model: name, department, level, manager, latest rating, risk band, top two reasons,
  successor for, tenure (`talent.retention.keyTalent`); a row opens the person card.

**Needs attention items** follow the audit's routing (5.12): the HRBP's own kinds in the scope are
`needs` (span of control `hrbp:span`, single-report chain `org:single-report-chain`, new manager
with a large team `org:new-manager`, promotion to review rolled up per unit
`talent:promotion-overdue`, low upward feedback `listening:manager`, exit survey reason
`listening:exit`, and stay conversations whose manager has left); everything else in the scope is
`waiting` (recruiting steps, day-one tasks, probation decisions, compliance and HR ops items,
training, critical roles, stay conversations owned by managers). Employee relations shows as a
count only, in scopes of 5 or more. In region mode no owner names a regional HRBP (the audit's
open question 3): items route by kind inside the scope, so none is needed for this release.

### 5.6 Compensation

Purpose: pay position against policy, the outliers to fix, and how the merit cycle is going.

| Order | Id | Span | Form | Source | Metric | Drill |
|---|---|---|---|---|---|---|
| 1 | `home-comp-in-band` | 4 hero | In healthy band ("78%") over a 100% bar of range position (Below minimum, Q1, Q2, Q3, Q4, Above maximum; status colors for below and above, ordinal ramp between) | Compensation model | `comp.compa.inBand`; bar `comp.position.mix` | a segment opens its people (`comp` kind) |
| 2 | `home-comp-kpis` | 8 | Median compa-ratio, Below minimum (% and n), Above maximum (% and n), Merit spend vs budget, Merit proposals entered, Pay for performance | Compensation tiles | `comp.compa.median`, `comp.position.belowMin`, `comp.position.aboveMax`, `comp.merit.spend`, `comp.merit.proposals`, `comp.merit.differentiation` | each tile's own |
| 3 | `home-comp-distribution` | 8 | Compa-ratio distribution, healthy band shaded, ref at 1.00 | Compensation (`comp-compa-distribution`) | `comp.compa.ratio` | a bin opens its people |
| 4 | `home-comp-cycle` | 4 | "Merit cycle progress": BulletList per business unit, proposals entered as a share of eligible people against 100%, spend vs budget as the row's status | new `proposalProgress(model)` in `engine/cycle.ts` | `comp.merit.proposals` | a bullet opens the eligible people without a proposal |
| 5 | `home-attention-wait`, `home-attention` | 4, 8 | Needs attention | | | |
| 6 | `home-list` | 12 | My list (below) | | | |
| 7 | `home-comp-outliers` | 6 | Median compa-ratio by location and level (Heatmap diverging around 1.00, cells under 5 hidden) | Compensation (`comp-compa-location-level`) | `comp.compa.median` | a cell opens its people |
| 8 | `home-comp-below-cause` | 6 | Below range minimum by location and cause (promoted, hired, neither) | Compensation (`comp-below-min-cause`) | `comp.position.belowMin` | a segment opens its people |

**My list:** "People outside range" (docs/ACTION-CENTER-AUDIT.md 5.2), below minimum first, then
above maximum, a `Segmented` to show one side: employee ID, name, job, department, level,
location, compa-ratio, range penetration, merit proposal (%), last increase date, promoted in the
last 12 months, latest rating; base, range and gap to minimum or over maximum (USD) only with the
switch on (`pay: true`). Metrics `comp.position.belowMin` and `comp.position.aboveMax`; a row
opens the person card.

**Needs attention items** (owned by Total rewards): the below-minimum population as **one** item
("78 people are paid below their range minimum; plan moves before the cycle closes", due the
cycle's close date) in place of 78 per-person items (audit 4.3), merit outside guideline per
person (`comp:guideline-exception`, due the close date), and the new roll-ups in 5.14: merit spend
over budget by unit, high performers paid low in range by unit (the "compa outliers"), and merit
proposals missing by unit (cycle progress). Exit survey reasons where pay leads
(`listening:exit`) are also Compensation's. Compensation change transactions owned by Payroll are
`waiting`. Every amount sits in `ActionItem.amount`, never in the text (3.2).

### 5.7 Talent management

Purpose: succession cover for critical roles, whether reviews are done and fair, and required
training.

| Order | Id | Span | Form | Source | Metric | Drill |
|---|---|---|---|---|---|---|
| 1 | `home-talent-coverage` | 4 hero | Succession coverage ("62%" of critical roles with a ready-now successor) over a 100% bar by best successor readiness: Ready now, 1-2 yrs, 3+ yrs, No successor | Talent succession model | `talent.succession.criticalCoverage`; bar `talent.succession.bestReadiness` | a segment opens its roles (`succession` kind) |
| 2 | `home-talent-kpis` | 8 | Rated in latest cycle, High performers (vs guideline), High potentials, Key talent at risk, Required training on time, Regretted exits of high performers | Talent tiles | `talent.performance.ratedCoverage`, `talent.performance.highPerformers`, `talent.potential.highPotentials`, `talent.retention.keyTalent`, `talent.learning.requiredOnTime`, `talent.retention.regrettedHigh` | each tile's own |
| 3 | `home-talent-exposure` | 8 | Succession exposure: Heatmap of roles by incumbent risk of loss and best successor readiness | Talent (`talent-succession-exposure`) | `talent.succession.exposure` | a cell opens its roles |
| 4 | `home-talent-overdue-trend` | 4 | Required training overdue at each month end, stacked by course | Talent (`talent-overdue-trend`) | `talent.learning.overdueAtMonthEnd` | a segment opens the assignments overdue then |
| 5 | `home-attention-wait`, `home-attention` | 4, 8 | Needs attention | | | |
| 6 | `home-list` | 12 | My list (below) | | | |
| 7 | `home-talent-review-coverage` | 6 | "Rated in the latest cycle by business unit": BulletList against 100% | new rows from the performance model | `talent.performance.ratedCoverage` | a bullet opens the unrated eligible people (`employees` kind) |
| 8 | `home-talent-rating-mix` | 6 | Rating distribution against the guideline | Talent (`talent-rating-distribution`) | `talent.performance.ratingDistribution` | a column opens its people |

**My list:** "Critical roles" (Talent's critical roles rows): role, incumbent, business unit,
criticality, incumbent risk of loss, successors, ready now, readiness mix, status (Covered, Thin,
No successor, with a StatusPill). Metric `talent.succession.roleStatus`; a row opens the role's
succession records.

A `Segmented` switches My list to "High potentials" (the 9-box's top boxes, `talent.potential.nineBox`).

**Needs attention items:** critical roles without a ready successor (`talent:critical-role`),
the new required courses below their on-time target (`talent:course-below-target`, one item per
course in place of the 164 per-manager training items, audit 4.3), the new ratings missing in the
latest cycle (`talent:review-missing`), stay risk (`listening:stay`), and the "No manager on
record" training roll-up. Per-manager training items stay Manager mode's ("my team") and are
`waiting` for HRBPs. Promotion reviews are the HRBP's.

### 5.8 HR ops

Purpose: are employees getting answers on time, are transactions processed on time, who is
returning from leave, and which day-one and I-9 tasks are open.

| Order | Id | Span | Form | Source | Metric | Drill |
|---|---|---|---|---|---|---|
| 1 | `home-ops-sla` | 4 hero | Resolution SLA met ("87%", target 90%) over a 100% bar of open cases: within target, due within 24 h, past target | HR ops model | `services.cases.resolutionSla`; bar `services.cases.backlog` | a segment opens its cases (employee relations counted, never listed) |
| 2 | `home-ops-kpis` | 8 | Open backlog, Transactions on time, Final pay on time, Returns in the next 30 days, Day -3 tasks not done, I-9 Section 2 on time | producing tiles | `services.cases.backlog`, `services.tx.onTime`, `services.tx.finalPay`, `services.leave.returnsSoon`, `onboarding.upcoming.dayMinus3`, `compliance.i9.section2OnTime` | each tile's own |
| 3 | `home-ops-backlog` | 8 | Open backlog by age, stacked by status | HR ops (`services-backlog-by-age`) | `services.cases.backlog` | a segment opens its cases |
| 4 | `home-ops-sla-trend` | 4 | Resolution SLA by month with the 90% target | HR ops (`services-sla-by-month`) | `services.cases.resolutionSla` | a point opens that month's cases |
| 5 | `home-attention-wait`, `home-attention` | 4, 8 | Needs attention | | | |
| 6 | `home-list` | 12 | My list (below) | | | |
| 7 | `home-ops-tx` | 6 | On time by transaction type against the 98% target | HR ops (`services-tx-on-time-by-type`) | `services.tx.onTime` | a bar opens its transactions |
| 8 | `home-ops-day-one` | 6 | Day-one readiness by owner (IT, Facilities, People ops, Trade compliance, Manager) | Onboarding (`onboarding-readiness-by-owner`) | `onboarding.upcoming.readinessByOwner` | a bar opens its tasks |

**My list:** "Open cases", oldest first: case ID, category, Atlas process, team, assignee,
priority, opened, age (d), SLA state (Within target, Due within 24 h, Past target, with a
StatusPill), channel. New `openCaseRows(model)` in `src/views/services/engine/cases.ts`. Metric
`services.cases.backlog`; a row opens the case. Employee relations cases are never rows: one
muted line under the table, "{n} employee relations cases are open. They are counted, never
listed.", shown whether n is 0 or not, and left out entirely when the scope holds fewer than 5
people (the Action center's rule).

A `Segmented` switches My list to "Transactions in flight" (open HR transactions with due state)
and "Returns in 30 days" (never the leave reason), as the audit's 5.6 list has them.

**Needs attention items** (the role's queues: People operations, Payroll, Benefits once it has its
own owner role, Global mobility, Trade compliance, and IT and Facilities day-one tasks): cases past
target (`services:case`), transactions past due (`services:tx`), returns from leave without
systems ready (`services:return`), I-9 Section 2 (one item per person: `compliance:i9` survives
and `onboarding:i9` folds into it by `matter`, audit 4.2), work authorizations to reverify
(`compliance:reverification`), export licenses (`compliance:license`, the onboarding screening
task folding into it), and day-one tasks that are overdue, blocked or not started inside the
look-ahead (`onboarding:task`, trimmed per audit 4.3). Probation decisions (managers) and day-30
readiness are `waiting`.

### 5.9 Recruiter

Purpose: the recruiter's own desk. Who lacks a next step, which offers are out, which reqs are
stuck, and who starts soon.

| Order | Id | Span | Form | Source | Metric | Drill |
|---|---|---|---|---|---|---|
| 1 | `home-rec-next-step` | 4 hero | Candidates lacking a next step ("12") over a 100% bar by state: Needs review, Needs scheduling, Needs decision, Offer pending, with aging-tier glyphs | Recruiting next-step model on the reqs scope | `recruiting.pipeline.lackingNextStep` | a segment opens its candidates |
| 2 | `home-rec-kpis` | 8 | Open reqs, Active candidates, Offers out, Hires (window), Median time to fill (vs all reqs), Offer acceptance (vs all reqs) | Recruiting tiles | `recruiting.reqs.open`, `recruiting.pipeline.activeCandidates`, `recruiting.offers.waiting`, `recruiting.hires.offersAccepted`, `recruiting.reqs.timeToFill`, `recruiting.offers.acceptance` | each tile's own |
| 3 | `home-rec-pipeline` | 8 | Pipeline today for the reqs | Recruiting (`recruiting-pipeline-today`) | `recruiting.pipeline.activeCandidates` | a segment opens its candidates |
| 4 | `home-rec-waiting` | 4 | Waiting time by stage: DotStrip, one dot per active candidate, tone by aging tier | Recruiting (`recruiting-waiting-time`) | `recruiting.pipeline.daysWaiting` | a dot opens the candidate's application |
| 5 | `home-attention-wait`, `home-attention` | 4, 8 | Needs attention | | | |
| 6 | `home-list` | 12 | My list (below) | | | |
| 7 | `home-rec-req-age` | 6 | Open reqs by age and candidates past the screen (Scatter, empty funnels red and named) | Recruiting (`recruiting-req-age-vs-pipeline`) | `recruiting.reqs.emptyFunnel` | a dot opens the req's applications |
| 8 | `home-rec-starts` | 6 | Countdown to day one for the recruiter's starts (I-9 tasks left out) | Onboarding (`onboarding-countdown`) | `onboarding.upcoming.readiness` | a dot opens the start's tasks |

**My list:** "My open reqs" (Recruiting's open requisitions rows on the reqs): req, title,
department, location, level, priority, hiring manager, days open, active candidates per stage,
lacking a next step, health (Empty funnel, n lack a next step, On track). Metric
`recruiting.reqs.open`; a row opens the req's applications.

A `Segmented` switches My list to "My candidates in the queue" (the action queue on the reqs).

**Needs attention items** (the recruiter's own, audit 5.4): applications to review
(`recruiting:review`), offers to send (`recruiting:offer`), offers awaiting an answer
(`recruiting:offer-answer`), empty funnels (`recruiting:empty-funnel`), the new reqs past their
time-to-fill target (`recruiting:past-target`, 5.14), and interviews to schedule when the req has
no coordinator. **Waiting on others:** interview decisions owned by hiring managers
(`recruiting:decision`, with Copy note to the manager), interviews to schedule owned by
coordinators, and day-one tasks on their starts. No item sits on a req On hold, Cancelled, Filled
or Closed (audit 4.2). Copy follows the recruiting tone rules ("Ask the panel to submit scorecards
and make a decision this week.").

### 5.10 Finance

Purpose: headcount and hiring against plan, the reqs the plan does not cover, contractors, and
what the workforce costs.

| Order | Id | Span | Form | Source | Metric | Drill |
|---|---|---|---|---|---|---|
| 1 | `home-fin-vs-plan` | 4 hero | Starts against plan year to date ("92%") over a 100% bar of plan lines by status (On plan, Behind, Ahead) per business unit | Onboarding plan model (`hiresVsPlan`, `engine/plan.ts`) | `onboarding.plan.vsPlan` | a segment opens its plan lines (`hiringPlan` kind) |
| 2 | `home-fin-kpis` | 8 | Headcount (vs 12 months), Net change, Open reqs, Open reqs not in the plan, Contractors and interns, Target cash cost | producing tiles; cost from `engine/cost.ts` | `hrbp.headcount.employees`, `hrbp.headcount.netChange`, `recruiting.reqs.open`, `onboarding.plan.notInPlan`, `hrbp.workforce.contingent`, `comp.cost.targetCash` | each tile's own; the cost tile opens the people it counts without amounts |
| 3 | `home-fin-plan` | 8 | Plan against actual, cumulative by month: plan, actual, committed, forecast (de-emphasized) | Onboarding (`onboarding-plan-vs-actual`) | `onboarding.plan.vsPlanByMonth` | a point opens that month's starts |
| 4 | `home-fin-cost-unit` | 4 | Workforce cost by business unit (3.2) | `engine/cost.ts` | `comp.cost.targetCash` | the unit's people, no amounts; Filter to the unit |
| 5 | `home-attention-wait`, `home-attention` | 4, 8 | Needs attention | | | |
| 6 | `home-list` | 12 | My list (below) | | | |
| 7 | `home-fin-reqs-plan` | 6 | "Open reqs against the plan by business unit": HBars stacked, in the plan and not in the plan (backfills apart), with planned roles that have no req as a second series | Onboarding plan model | `onboarding.plan.notInPlan` (definitions include `onboarding.plan.noReq`) | a segment opens its reqs or plan lines |
| 8 | `home-fin-worker-mix` | 6 | Workforce mix: employees, contractors and interns by business unit | People stats (`hrbp-worker-mix`) | `hrbp.workforce.contingent` | a segment opens its people |
| 9 | `home-fin-cost-center` | 12 | Workforce cost by cost center, top 8 (3.2) | `engine/cost.ts` | `comp.cost.targetCash` | the cost center's people, no amounts |

**My list:** "Plan lines behind" (Onboarding's plan coverage rows with status Behind): business
unit, department, plan year to date, actual year to date, committed, open reqs, forecast, full-year
gap, status. Metric `onboarding.plan.gap`; a row opens its plan lines, with "Filter to" the
business unit. Without a hiring plan loaded, the list and the hero show the Hiring plan tab's
empty state with the template link.

A `Segmented` switches My list to "Cost centers" (docs/ACTION-CENTER-AUDIT.md 5.3): cost center,
name, headcount, base cost, target bonus cost, equity, open reqs, starts in 90 days, under the
cost guard (3.2: rows under 5 people fold into Other, no subtraction).

**Needs attention items** (owned by Finance, a new owner group, 5.14; none names a person): open
reqs not in the plan (`onboarding:not-in-plan`), hiring behind plan by unit and department
(`onboarding:plan-behind`), and planned roles with no req, or whose req is on hold or cancelled
(`onboarding:plan-no-req`). **Waiting on others:** merit spend over budget by unit (Total
rewards' item, a total, on Workforce cost).

### 5.11 HR: the Scorecard gains Needs attention

HR's home stays the Scorecard (docs/ROLES.md 2.1). After the Action center flip (6.3):
`scorecard-items` comes back, and a new `scorecard-attention` (span 8, beside it) lists the
escalations across every practice by the CHRO's rule (5.4, audit 5.10), at most 10, with "Open
the Action center". HR's My list is the People scorecard table, already the page's record; no new
list. The audit's "Mine" picker for HR (any person in the data as "me") is a later addition.

### 5.12 Manager: My team gains a list

My team stays Manager's home (docs/ROLES.md 2.2). After the flip, `team-waiting` comes back and
moves up to sit under the top row, titled "Needs attention" (same id), holding the manager's own
items (interview decisions on their reqs, probation decisions, one training item for their team,
stay conversations worded "exits" rather than "regretted exits", the audit's open question 4) with
day-one contingencies held by People operations as "Waiting on others". A new `team-people` (span
12, table-only, titled "My list: my team", direct reports first, audit 5.9): name, title, start
date, in first 90 days (yes or no), probation due, overdue required courses, open reqs they own.
Metric `hrbp.headcount.employees`; a row opens the person card. It follows the Manager rules.

### 5.13 Developer

The Developer page stays Developer's home. `#home` opens by address and from Developer >
Inventory with a "Preview a role" control (a select of the eight roles with a Home); the preview
renders through an `AnalyticsProvider` with that role's `access` (the off-screen override pattern)
and the picks remembered in `census:mode` (asking for one when missing). Developer > Access shows
every role's column; "Scan as role" in Inventory replaces "Scan as Manager".

### 5.14 Action items: what changes and what is new

docs/ACTION-CENTER-AUDIT.md part 5 lists, per role, every existing and missing item with its data
source. This contract builds, in the first release, the audit's shared changes (its part 4) and
the subset below, chosen so each home's Needs attention is useful on day one. The audit's other
"Missing" rows follow in later releases, each added the same way.

Every item follows the view contract (docs/VIEWS.md) and the audit's item contract (4.1): stable
id `'<view>:<kind>:<record>'`, a `kind` label in `KIND_LABEL` (`src/views/actions/engine/kind.ts`),
`what` in plain words without a nagging verb or a closing full stop, `note` as the polite ask,
`uses`, a drill that opens at least one record, `matter` when the same matter can come from two
views, `fingerprint` on every roll-up, `exposure` for legal and regulatory matters, `place`
(business unit, region, location) for the HRBP lenses, and `amount` instead of any money in the
text. Severity follows the audit's one rubric: critical for legal exposure or a person blocked past
the overdue limit, warning (Watch) for overdue, info (Note) for due soon or awareness. Thresholds
are settings on the named metric.

**Changed** (audit 4.2 and 4.3):

| Item | Change |
|---|---|
| `comp:below-minimum:<employeeId>` (78 on the sample) | Becomes one roll-up, `comp:below-minimum:all` (per business unit in an HRBP scope, ratios only), due the comp cycle's close date, with the people in Compensation's My list |
| `talent:training-overdue:<managerId>` (164) | Listed only for the manager (Manager mode, and `waiting` for HRBPs); HR and Talent management get one item per course below target instead (new, below) |
| `talent:promotion-overdue:<employeeId>` (25) | Rolled up per business unit, owned by the unit's HRBP |
| `onboarding:task:*` (31) | Only tasks overdue, blocked or not started inside the look-ahead; keyed by application ID when one exists, so a mark survives the hire |
| `onboarding:i9:*` and the onboarding export screening task | Fold into `compliance:i9:*` and `compliance:license:*` through `matter` |
| `compliance:license:*` | Due date is the start date (a breach is overdue, never "Due today"); `exposure: true` |
| Recruiting candidate items | None on a req On hold, Cancelled, Filled or Closed |
| Every item with money in `what` | The amount moves to `amount` |

**New** (first release):

| Id | View · tab | Owner | Kind label | Rule | Severity | Drill |
|---|---|---|---|---|---|---|
| `recruiting:past-target:<reqId>` | Recruiting · Requisitions | the req's recruiter (else "Recruiting") | "Req past its time-to-fill target" | open req (not On hold) older than the time-to-fill target in force (`ctx.metrics.target('recruiting.reqs.timeToFill')`), else 1.5 × the median time to fill for its level over the last 12 months (5 or more fills); not already an empty-funnel item. Settings on `recruiting.reqs.age`: `agingMultiple` 1.5, `agingCritical` 2.5 | warning; critical past `agingCritical` × the target | the req's applications |
| `talent:course-below-target:<course>` | Talent · Learning | Talent management | "Required course below target" | a required course whose on-time share is under the target of `talent.learning.requiredOnTime`, with 5 or more assignments due | warning | the course's overdue assignments (`learning` kind) |
| `talent:review-missing:<managerId>` | Talent · Performance | the manager (else Talent management) | "Ratings missing" | the latest cycle with `cycleDate` at least 30 days before the as-of date (setting `reviewGraceDays` on `talent.performance.ratedCoverage`): people active on the cycle date and hired 90 or more days before it (setting `eligibleAfterDays`) with no review in that cycle, grouped by manager; fingerprint = the unrated IDs | warning; critical 60 or more days past the cycle date | the unrated people (`employees` kind) |
| `comp:over-budget:<businessUnit>` | Compensation · Workforce cost | Total rewards | "Merit spend over budget" | the rule `comp.merit.overBudget` already uses for its finding; the item shows spend against budget in %, `amount` holds the overrun total | warning | the unit's people with a proposal (`comp` kind; `employees` kind in Finance) |
| `comp:high-rated-low-compa:<businessUnit>` | Compensation · Pay for performance | Total rewards | "High performers paid low in range" | people rated 4 or 5 in the latest annual cycle with compa-ratio under the healthy band's low end (0.90 by default), 5 or more in the unit | warning | those people (`comp` kind) |
| `comp:no-proposal:<businessUnit>` | Compensation · Merit cycle | Total rewards | "Merit proposals missing" | while the cycle is open (new cycle dates, below): eligible people in the unit with no proposal, 5 or more | info; warning within 14 days of the close date | the eligible people without a proposal |
| `onboarding:not-in-plan:<reqId>` | Onboarding · Hiring plan | Finance | "Req not in the hiring plan" | an open req on no plan line, not a backfill (`onboarding.plan.notInPlan`) | warning | the req |
| `onboarding:plan-behind:<businessUnit>:<department>` | Onboarding · Hiring plan | Finance | "Hiring behind plan" | a plan coverage row with status Behind (`onboarding.plan.vsPlan`, ±10% setting) | warning; critical when the full-year gap is 25% or more of the full-year plan (setting `behindCritical` on `onboarding.plan.gap`) | the row's plan lines, with Filter to the business unit |
| `onboarding:plan-no-req:<positionId or line key>` | Onboarding · Hiring plan | Finance | "Planned role with no open req" | a future plan line with no `reqId`, or whose req is On hold or Cancelled (`onboarding.plan.noReq`) | info; warning when the planned start is within 60 days | the plan line (`hiringPlan` kind) |

**Comp cycle dates** (the audit's open question 5, adopted): Settings > Compensation cycle gains
open, calibration, close and effective dates, kept on the comp cycle metric settings
(`COMP_CYCLE` in `src/metrics/compCycle.ts`, so they are logged and travel with the settings
file). Without a close date, Compensation's items have no due date and say so ("No cycle close
date set").

Example wording: "Req R-2041 Senior verification engineer has been open 118 d; the target is 45
d" with the note "Could we review the req with the hiring manager this week?"; "6 people on Priya
Raman's team have no rating in the 2026 mid-year cycle" with "Could you complete these ratings or
let me know when they will be in?"; "Req R-2207 is open but on no line of the FY27 v2 plan" with
"Could you confirm whether this req has budget, or add it to the plan?".

**New owner group:** `finance` in `ACTION_OWNER_ROLES` (after `total-rewards`), label "Finance" in
`ACTION_OWNER_LABEL` (`src/views/types.ts`), and "Finance" in the Action center's team names.
Benefits gets its own owner role (`benefits`, "Benefits"), out of Total rewards, as the audit's 4.2
asks; HR ops lists it.

---

## 6. The Action center for every role

### 6.1 Role filter: the audit's role lens

Two pure steps, in `src/access/items.ts`, after `collectActions`:

1. **What the mode lists.** `itemsShown(access, items)` filters in every allowlist mode, not only
   Manager: an item is listed when the mode shows its view, its tab, its subject kind and its drill
   kind, and its id is on no hidden item prefix (Manager's I-9 rule stays). Then the scope (2.7):
   items about the scope (`place` or the subject inside it), plus items anywhere owned by someone
   in it.
2. **Whose it is.** `roleItems(collected, lens, ctx)` (docs/ACTION-CENTER-AUDIT.md 4.4) returns
   `needs` (owned by the role, its "me" or its queues: Needs attention), `waiting` (in the role's
   area, owned by others: Waiting on others) and `left` (listed by nothing in this mode; a count,
   said, never shown). The lens is `{ mode, me?, scope? }`: `me` is the recruiter (Recruiter) or
   the manager (Manager); the scope is part 2's. The routing is the audit's table in its part
   5.12, mapped to this contract's modes (`hrbp-unit` and `hrbp-region` to its two HRBP columns,
   `compensation` to Comp, `talent-management` to Talent, `hr-ops` to HR ops), with the item
   changes of 5.14. It lives as data in `src/access/policy/routing.ts` and is part of the matrix
   snapshot (one row per kind and mode: needs, waiting or not listed).

What each mode's Action center shows:

- **Developer, HR, CHRO:** every item, as today, with the "My team" picker. The CHRO and HR
  homes' Needs attention take the escalations (5.4).
- **Every other mode:** two lists, "Needs attention" (default) and "Waiting on others", as a
  `Segmented` under the header, each with its count; the charts and key figures follow the chosen
  list. The masthead count is `needs`. Manager keeps its pinned org and "Waiting on" switch inside
  each list.
- The header line names the list: "Open items for Total rewards, as of 30 Sep 2026", "Open items
  in APAC", "Open items on Maya Chen's reqs".
- On phones and on homes the list leads and the overview charts follow (audit 3.15).
- Marks follow the audit's marks v2 (its 4.5, and its open question 2 as recommended): per
  browser, by item id, with a fingerprint that reopens a changed roll-up and an optional "by"
  name; one browser's marks hold across modes, so an item handled in HR ops mode is handled in HR
  mode too.

### 6.2 Readiness

The release gate is docs/ACTION-CENTER-AUDIT.md: its shared changes (part 4: the item contract,
the engine fixes, roll-ups into lists, the role lens, marks v2) and every line of its release
checklist (part 6). This contract adopts the audit's recommendations for its open questions 1
(workflow items show at every data standard, tagged with their tier and counted), 2 (marks
personal in this browser, with "by" and an optional marks file), 4 (a manager's item says "exits",
not "regretted exits"), 5 (comp cycle dates, 5.14) and 7 (escalations: critical and overdue more
than 14 days, plus all legal exposure, the threshold kept in the metric dictionary). Its open
question 3 (a regional HRBP owner) is not needed for this release (5.5); question 6 (a budget
dataset) is this contract's one decision (part 9).

Four checks this contract adds to the audit's list, each with a test:

1. **One count.** For one context, the masthead count, the page's Needs attention count, the
   Scorecard's Critical open items tile, My team's tile and every home's Needs attention come from
   `roleItems` over the same collection and agree, for every mode on the sample
   (`src/views/actions/engine/roles.test.ts`).
2. **Mode and scope.** For every mode, every listed item's view, tab and kinds are shown in the
   mode and every item is in the scope or owned by someone in it (part 2.7, 4.4); none of
   Recruiter's items is about compensation, an HR ops case, talent risk or a survey; Finance lists
   no item about one person.
3. **Homes and exports.** Each home's Needs attention holds 1 to 15 items before "Show all" on the
   sample (the audit's volume line, per mode); Export list carries the mode and scope line (4.11).
4. **Routing snapshot.** The routing table is in the matrix snapshot, so a change to who sees an
   item kind shows in review.

### 6.3 Retiring "not ready yet"

In one change, after 6.2 passes (the audit's checklist tests and this contract's four):

- Delete `NOT_READY`, `NOT_READY_PREFIXES`, `NOT_READY_PAGES`, `NOT_READY_HOW` and `isNotReady`
  from the policy, the `NOT_READY_PAGES` branch in `routeShown` and `routeDecision`, and the "not
  ready yet" error in Ask's `runTool`.
- Restore everything the commit "Action center: Developer mode only until it is ready" took away:
  the masthead Actions button, `scorecard-items`, `team-waiting`, the `actions.*` metrics on
  tiles, the `actionItems` and `actionOwners` drills, Ask's `open_items`, the `view-actions` Help
  article and tour, and the help text that points at the Action center.
- Update the matrix snapshots, `src/access/route.test.ts`, `src/help/access.test.ts`, the Ask
  tool tests, and docs/ASK-ACTIONS.md's line "the Action center stays Developer mode only".
- From then on, the Action center is limited per mode (4.4) like any other page.

---

## 7. Ask per role

docs/ASK.md and docs/ASK-ACTIONS.md hold in every mode. Changes:

- **Tools.** `toolDefinitionsFor(access)` (today: all, HR's, or Manager's) is cached per mode and
  scope kind (a `Map`, not the two module variables it uses now). For every mode: tools the mode
  hides are left out; `view_summary` and `compare_groups` list only the mode's shown views with a
  summary; `query_records` lists only the mode's datasets (4.12; Finance without `comp`), with the
  field help for those datasets; `explain_quality` only in Developer, HR, CHRO and HR ops;
  `open_items` returns the mode's `needs` and `waiting` lists from `roleItems` (the audit's part 7),
  so Ask and the page agree. `runTool` checks the policy first and
  returns a plain error worded for the mode ("compare_groups is not available in Recruiter
  mode.").
- **Scope.** `resolveFilters` goes through `clampFilters` for every scope kind and Finance's
  restriction. In `unit` and `region`, no business unit or location means the scope (never the
  whole company); a value outside it is refused ("In HRBP mode a business unit filter must be
  Silicon Engineering."). In `reqs`, tools run on the scoped context, so every result is about the
  reqs; `compare_groups` by leader lists hiring managers' orgs inside the reqs. In Finance a
  filter on leader, department, location or level is refused with the reason.
- **Ask off for small scopes.** As Manager mode today: off with a plain reason when the scope is
  under the anonymity minimum: "Ask needs a business unit of 5 or more employees in HRBP mode, so
  that no answer is about one person." (region: "a region of 5 or more employees"; reqs: "5 or
  more candidates on your reqs").
- **System prompt.** `rolePromptLine(mode, scope, token)` in `src/ask/engine/prompt.ts` replaces
  `managerPromptLine`; one block for every mode but HR and Developer, after the base prompt:
  - CHRO: "Census is in CHRO mode: every HR view. When asked for an overview, lead with the
    people scorecard and the top risks across practices."
  - HRBP for a business unit: "Census is in HRBP mode for the Silicon Engineering business unit,
    at every location. Every number is for that unit; company numbers are comparisons only. The
    Data room and pay amounts are not available in this mode: say so when asked, and do not
    estimate them."
  - HRBP for a region: the same, "for the APAC region (Bengaluru, Hsinchu, Shanghai, Ho Chi Minh
    City), across business units".
  - Compensation: "Census is in Compensation mode for the whole company: Compensation, People
    stats, Org chart, Talent performance and Listening's exit and stay results. Recruiting, HR ops,
    Compliance and the Data room are not available in this mode: say so when asked, and do not
    estimate them."
  - Talent management, HR ops: the same pattern with their views.
  - Recruiter: "Census is in Recruiter mode for {{P7}}'s reqs. Every number is about those reqs,
    their candidates and their starts; numbers for all reqs are comparisons only. Other views are
    not available in this mode: say so when asked, and do not estimate them."
  - Finance: "Census is in Finance mode: headcount, the hiring plan, requisitions and contractors,
    filtered by business unit. Cost totals are on Compensation, Workforce cost; they are never
    sent to you, so point there when asked. Individual pay is not available in any form."
  - Manager: today's line, unchanged.
- **Tokens.** Business unit, region and site names are categories, not people, and go as text.
  A recruiter's name is a person and goes as a token, as a manager's does.
- **Suggested questions.** Each home gets its own four (CHRO: "Which practices miss the most
  targets?"; Recruiter: "Which of my reqs have gone longest without a hire?"; Finance: "Which
  business units are furthest behind the hiring plan?").

The Ask workflow is editing `src/ask` now (docs/ASK-ACTIONS.md). This part is built after those
changes land, by whoever then owns `src/ask` (8.9).

---

## 8. Implementation

### 8.1 Modules

```
src/access/
  modes.ts            Mode (11 ids), MODES, MODE_GROUPS, MODE_LABEL, MODE_SHORT, MODE_HINT,
                      HOME_OF, HOME_LABEL, SCOPE_OF (mode → kind), PICK_OF (mode → pick kind),
                      PAY_OF (mode → 'switch' | 'totals' | 'none'), IMMIGRATION_OF, modeButtonLabel
  copy.ts             wording (1.6)
  surfaces.ts         S, plus S.pay('amounts' | 'totals' | 'switch'), S.person('ratings'),
                      S.ui('attention-lists')
  scopes/
    types.ts          ScopeKind, ScopeLock and its four kinds, ManagerLock alias
    org.ts            today's lock.ts (managerLock → orgScope; isPickableManager, MIN_REPORTS)
    unit.ts, region.ts, reqs.ts   builders (pure, memoized)
    regions.ts        regionIndex(lists, data): location → region, region → sites
    pickers.ts        unitOptions, regionOptions, recruiterOptions (pure)
    clamp.ts          clampFilters(filters, scope, mode), FILTER_DIMS_OF, the toasts' reasons
    apply.ts          applyScope(data, scope) (reqs)
    records.ts        inScope, rowsInScope, personInScope (inLock, rowsInLock, personInLock wrap them)
    label.ts          scopeLabelOf, scopeName
    index.ts          scopeFor(mode, picks, env)
  lock.ts, records.ts re-export from scopes/ during the move, then go
  policy/
    index.ts          decide, can, routeDecision, routeShown, firstShownTab
    types.ts          RolePolicy, RoleTab
    developer.ts      DEVELOPER_ONLY
    hr.ts             decideHr
    chro.ts           HR plus the CHRO home
    table.ts          decideTable(policy, surface, at, info): the allowlist engine (today's decideManager, generalized)
    manager.ts        today's Manager tables, moved unchanged
    hrbp.ts           both HRBP modes (one table, two ids)
    compensation.ts, talent.ts, hrOps.ts, recruiter.ts, finance.ts
    routing.ts        the item routing (the audit's 5.12 table, per mode)
    notReady.ts       the NOT_READY rule, until the flip (6.3)
  matrix.ts           accessMatrix over every mode; matrixText, howText, matrixCounts
  context.ts          AccessContext (8.5), accessFor(mode, scope, metrics, unset)
  store.ts            useMode v2 (8.4)
  connect.ts          guards per mode and scope; checkScope (today's checkManager, per kind)
  hooks.ts            useAccess, useCan, useDecision, useScope (useLock kept)
  items.ts            itemsShown for every allowlist mode, practiceItems
  pay.ts              payView(mode), showPayIn(mode, switchOn), showCostIn(mode, switchOn)
  ui/                 ModeButton, ModeMenu (grouped), ModeChoices, ScopePicker (generalizes
                      ManagerPicker), ModeSection
src/views/home/       the Home view: index.tsx, engine/ (per role, pure), ui/ (layout and parts)
src/lib/starts.ts     matchPreHires (moved from onboarding)
```

`src/access/` still imports only types and pure modules (`@/data/*` pure modules including
`@/data/lists` for regions, `@/views/types`, `@/drill/types`, `@/ask/engine/types`); the policy
never imports the view registry.

### 8.2 Types

```ts
export type Mode =
  | 'hr' | 'chro' | 'hrbp-unit' | 'hrbp-region' | 'compensation' | 'talent-management'
  | 'recruiter' | 'hr-ops' | 'finance' | 'manager' | 'developer'

export interface ModePicks {
  managerId: string | null
  unit: string | null
  region: string | null
  recruiter: { name: string; id: string | null } | null
}

export type PayView = 'switch' | 'totals' | 'none'

export interface AccessInput {
  mode: Mode
  picks?: Partial<ModePicks>
  /** @deprecated use picks.managerId */
  managerId?: string | null
}
```

`RouteView` gains `home`; `ViewKey` gains `home` (label "Home"); `PAGE_VIEWS` is unchanged.

### 8.3 Policy tables

```ts
// src/access/policy/types.ts
export interface RoleTab { key: string; label: string; decision: Decision }
export interface RolePolicy {
  mode: Mode
  /** Every ViewKey and page ('actions', 'data', 'dev'); a missing one is hidden and fails the matrix test. */
  views: Readonly<Record<ViewKey | 'actions' | 'data' | 'dev', Decision>>
  /** Every tab of every view this mode shows. */
  tabs: Readonly<Partial<Record<ViewKey, readonly RoleTab[]>>>
  metrics: {
    /** When set, only metrics under these prefixes show (Recruiter, Finance). */
    allow?: readonly string[]
    hidePrefixes: readonly string[]
    hide: readonly string[]
  }
  hiddenFigures: readonly string[]
  drillKinds: readonly DrillKind[]
  datasets: readonly DatasetKey[]
  hiddenItemPrefixes: readonly string[]
  articles: Readonly<Record<string, Decision>>
  tours: Readonly<Record<string, Decision>>
  /** Every other named surface (masthead, header, settings, tools, help, ask, filter, export, person, focus, shortcut, ui, org). */
  surfaces: Readonly<Record<string, Decision>>
}
```

`decide(mode, surface, at, info)`:

1. Developer: shown.
2. `isNotReady` (until 6.3).
3. HR: `decideHr` (developer-only surfaces, `view:home`, `view:team` and their figures hidden).
4. CHRO: `decideHr`, except `view:home`, `tab:home.overview`, `figure:home-chro-*` and the shared
   `figure:home-attention*` and `figure:home-list` are shown.
5. Every other mode: `decideTable(ROLE_POLICY[mode], …)`, today's `decideManager` generalized:
   views and tabs from the table (hidden by default); a figure hidden when on `hiddenFigures`,
   when its id starts with a hidden view's key or a home slug that is not the mode's, or when its
   tab is hidden; a metric hidden when outside `allow`, on `hidePrefixes` or `hide`, or when none
   of its views is shown; kinds, datasets, help and the named surfaces from the table.

`ROLE_POLICY` is filled from part 4 of this file. Every limited or hidden decision carries its
`how` sentence, worded for the mode ("Pay amounts stay with Total rewards; HRBP mode shows
ratios.").

**Matrix snapshot.** `accessMatrix(inventory)` returns one row per surface with a decision per
mode. Two files under `src/access/__snapshots__/`:

- `access-matrix.txt`: surface, then one column per mode in the order Dev, HR, CHRO, BU, Rgn,
  Comp, Tal, Ops, Rec, Fin, Mgr, each `S`, `L` or `H` (a one-letter grid stays readable at
  eleven columns).
- `access-how.txt`: for every surface with a limited or hidden decision, one line per mode
  that limits or hides it: `surface  mode  decision  how`.

The inventory adds the `home` view and tab, `HOME_FIGURES` per role (placed on `home`), the new
surfaces (`pay:*`, `person:ratings`, `ui:attention-lists`), the new Compensation tab, and the
`tab:hrbp.analyses` tab with its four sub-address surfaces. Developer > Access and the Developer overview's
`dev-access-by-mode` read the same rows, with a mode filter of eleven.

### 8.4 Store and migration

```ts
// src/access/store.ts
export interface ModeState {
  mode: Mode
  picks: ModePicks
  /** Which picker is open, if any. */
  picking: 'manager' | 'unit' | 'region' | 'recruiter' | null
  pickNote: string | null
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  /** Switch modes. A mode that needs a pick it does not have opens its picker and keeps the current mode. */
  setMode: (mode: Mode) => void
  /** Make (or change) a pick and enter its mode. */
  choose: (pick: { kind: 'manager'; id: string } | { kind: 'unit'; unit: string }
    | { kind: 'region'; region: string } | { kind: 'recruiter'; name: string; id: string | null }) => void
  openPicker: (kind: NonNullable<ModeState['picking']>, note?: string | null) => void
  cancelPick: () => void
  reload: () => void
  /** Kept for existing callers: choose({ kind: 'manager', id }). */
  chooseManager: (employeeId: string) => void
  /** Kept for existing callers: picks.managerId. */
  managerId: string | null
}
```

`parseStoredMode(raw)` accepts `v: 1` and `v: 2` and returns a version 2 value (part 1.4); a test
covers v1 Manager, v1 HR, v2 every mode, corrupt JSON, an unknown mode, a missing pick and a
throwing storage. `MODE_KEY` and the `STORAGE_KEYS` entry ("The mode and its picks: manager,
business unit, region, recruiter") update together.

### 8.5 Context

```ts
// AnalyticsContext (src/data/context.tsx)
showPay: boolean          // unchanged meaning: individual amounts may show
showCost: boolean         // new: cost totals may show (showPay, or Finance)
access: AccessContext

// src/access/context.ts
export interface AccessContext {
  mode: Mode
  scope: ScopeLock | null
  /** @deprecated Manager's org scope: scope when its kind is 'org'. */
  lock: OrgScope | null
  unset: boolean
  pay: PayView
  decide: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => Decision
  can: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => boolean
}
```

`buildContext({ …, access, regions? })`: resolves the scope with `scopeFor` (regions from the
`regions` argument, which the provider builds from the official lists store; tests and the gallery
fall back to `locationAttrs`), clamps the filters, scopes the data, applies `applyScope`, sets
`showPay = PAY_OF[mode] === 'switch' && args.showPay`, `showCost = showPay || PAY_OF[mode] ===
'totals'`, `showImmigration = IMMIGRATION_OF[mode] && args.showImmigration`, features as today
(Manager forced off), and `access` from `accessFor`. Without `access` it builds an HR context, so
every existing test is unchanged. Ask's `chatContext` and `contextFor` copy `access` and keep
`showPay` and `showCost` false.

### 8.6 Where it plugs in

| Area | Files | Change |
|---|---|---|
| Registry | `src/views/registry.ts`, `src/views/types.ts`, `src/views/scorecard/views.ts` | Add `home` (before `team`); `visibleViews(access)` unchanged in shape; `OTHER_VIEWS` gains `home` |
| Routes and guards | `src/data/store.ts` | `ROUTE_VIEWS` + `home`; `homeView()` asks the route guard (unchanged mechanism) |
| Shell | `src/app/App.tsx`, `FolderTabs.tsx`, `Masthead.tsx`, `ViewHeader.tsx` | Home view; folder tabs per mode; masthead per 4.3; scope pins for every kind |
| Filter row | `src/app/FilterBar.tsx`, `LeaderPicker.tsx`, `StandardControl.tsx`, `filterOptions.ts` | Pinned business unit and region controls; Finance's restricted row; options `within` the scope; "Whole business unit", "Whole region" |
| Exports | `src/app/ExportMenu.tsx`, `wholeView.tsx`, `exportMeta.ts`, `src/lib/export/**` | `cost` columns and `showCost`; the mode meta lines; Finance cost line |
| Figure and tables | `src/charts/Figure.tsx`, `DataTable`, `src/charts/types.ts` | `cost?: true` columns; hidden-kind numbers as plain text (4.12) |
| KPI strip, readout | `src/components/KpiStrip.tsx`, `Readout.tsx`, `kpiModel.ts`, `src/access/numbers.ts` | Findings' `people` kept to any scope (`personInScope`) |
| Records panel | `src/drill/**` | `inScope`, the "not listed" line per scope, per-mode kinds, person card per 4.12, `person:ratings` |
| Action center | `src/views/actions/**`, `src/access/items.ts` | The audit's part 4 (item contract use, de-duplication by `matter`, freshness, ordering, data standard as a tag, sliced collection, marks v2), `roleItems`, the Needs attention and Waiting on others lists, scoped wide run (`withoutScope`), header line, readiness tests, the flip |
| Compensation | `src/views/comp/**` | Workforce cost tab, `engine/cost.ts`, cost metrics, column re-marking, the four new items, `proposalProgress` |
| Other view items | `src/views/recruiting/engine/actions.ts`, `talent/engine/actions.ts`, `onboarding/engine/actions.ts` and `plan.ts`, `services/engine/cases.ts` | The new items (5.14), `openCaseRows`, review coverage rows |
| Onboarding | `src/views/onboarding/engine/starts.ts`, `src/lib/starts.ts` | Move `matchPreHires`; Recruiter's I-9 rule and Finance's contingency wording (Manager's code paths, keyed on the mode) |
| Listening | `src/views/listening/LinkedSurvey.tsx`, `api.ts` | Hidden when the survey's tab is hidden in the mode (4.2) |
| Talent, Org chart | `src/views/talent/engine` (critical roles), `src/views/org/**` | Successors outside a unit or region scope by name, not openable; dimmed out-of-scope cards with the limited panel; search inside the scope |
| Homes | `src/views/home/**`, `src/views/scorecard/**` (`scorecard-attention`), `src/views/team/**` (`team-people`, Needs attention move) | Part 5 |
| Settings | `src/app/settings/**`, `src/data/settings.ts` | Sections per 4.6; Mode section with the grouped list and pick lines |
| Tools | `src/app/ToolsMenu.tsx` | Per 4.7 |
| Help | `src/help/**` | `modes` rewrite, `view-home`, `privacy-pay` rewrite, `home-start` tour, decisions per mode, Report a problem mode lines |
| Ask | `src/ask/**` | Part 7 |
| Developer | `src/dev/**` | Access tab and inventory over eleven modes, "Scan as role", Home preview, `STORAGE_KEYS` text |

### 8.7 Lead-owned contract changes

Each builder that makes one says so in its report: `ViewKey` and `VIEW_LABEL` gain `home: 'Home'`
(`src/data/schema.ts`); `ROUTE_VIEWS` gains `home` (`src/data/store.ts`);
`AnalyticsContext.showCost`, `buildContext`'s `access` (with picks) and `regions` arguments
(`src/data/context.tsx`); `ACTION_OWNER_ROLES` and `ACTION_OWNER_LABEL` gain `finance` and `benefits`, and `ActionItem`
gains the audit's `matter`, `fingerprint`, `amount`, `exposure`, `closesWhen` and `place`
(`src/views/types.ts`); `VIEWS` gains `home` (`src/views/registry.ts`); `Column.cost`
(`src/charts/types.ts`). `scopeDatasets` and `employeeMatcher` do not change: `org`, `unit` and
`region` work through the filters they pin, and `reqs` through `applyScope`.

### 8.8 Tests

1. **Access matrix** (`src/access/matrix.test.ts`): both snapshot files over every surface and
   every mode. Invariants: Developer shows everything; HR differs from Developer only on the
   developer-only surfaces, `home` and `team`; CHRO differs from HR only on `home` and its home
   figures; every allowlist mode names every `ViewKey`, page and every tab of each view it shows
   (so a new view or tab fails until each mode decides); every limited or hidden decision has a
   `how`; every hidden figure id exists in the source and every hidden metric id or prefix
   matches the catalog; each mode's drill kinds belong to its datasets (or are grouped kinds of
   its shown views); `masthead:pay-tags`, `settings:privacy`, `header:comp`, `header:compliance`
   and `pay:*` agree with `PAY_OF` and `IMMIGRATION_OF`; every mode's shown linked surveys sit on
   shown Listening tabs; the list of shown figures whose drill kind is hidden, per mode, is in the
   snapshot; the copy has no em dash and no banned word.
2. **Routes** (`src/access/route.test.ts`): for every mode, every route and tab (including
   `#home`, `#team`, `#dev.*`, Data room addresses, `#comp.cost`, `#actions`): shown routes
   untouched; hidden views to the mode's home; hidden tabs to the first shown tab; a scoped mode
   with no pick lands on the home's empty state; Back never returns to a hidden route.
3. **Scope clamps per kind** (`src/access/scopes/*.test.ts`, on the sample): for `org`, `unit`,
   `region` and `reqs`, and for Finance's restriction, through every entry path (setFilters,
   resetFilters, an opening address, a saved view at company scope, `focusScope`, Filter to and
   Leave out, Ask `resolveFilters` with and without filters, Back and Forward): the clamp is
   idempotent and returns the same object when nothing changes; every row of every dataset in
   `ctx.data` is in scope (unit: every employee's business unit; region: every employee's location
   in the region's sites; reqs: every req's recruiter, every candidate's req, every onboarding task's
   application or matched pre-hire; the emptied datasets empty); `ctx.all` is untouched;
   `isCompany` is false; region sites come from the Locations list's region column, and a location
   without one is in no region.
4. **Homes never show out-of-scope rows** (`src/views/home/engine/scope.test.ts`): for every
   scoped mode on the sample, every home figure's rows, every Needs attention item (subject, owner
   rule, drill rows) and every My list row pass `inScope`; "vs company" comparisons open nothing;
   every home figure id is in `HOME_FIGURES` and in the matrix; every home figure carries a metric
   shown in its mode.
5. **Pay rules** (`src/access/pay.test.ts`, `src/views/comp/engine/cost.test.ts`): for every
   mode, `showPay` is false unless the mode has the switch and it is on, and `showCost` is true
   only for the switch modes with the switch on and for Finance. In Finance, a whole-view render of
   every shown tab (`renderWholeView` facts) has no `pay` column, cost columns present on the cost
   figures, and no amount in any drill row, detail export or CSV; every cost total over fewer than
   5 people is null; in every cost breakdown the shown groups plus Other equal the total and Other
   is 5 or more whenever the total is shown; no listed item is about one person's pay, and every
   item drill is a kind Finance lists. In every mode no Ask
   tool result holds a money field or a cost total (extend `src/ask/engine/privacy.test.ts`'s
   matrix to every mode). No item's `what` or `note` holds a currency amount, switch on or off (the
   audit's pattern scan).
6. **Store** (`src/access/store.test.ts`): part 8.4's cases; picks kept across mode changes; each
   picker opens when its mode is chosen without a pick; the mode is not in `settingsBlob`;
   `clearCensusStorage` removes it.
7. **Action center**: every line of the audit's release checklist (its part 6, with the test files
   it names) and this contract's four checks (6.2, `src/views/actions/engine/roles.test.ts`) for
   every mode; the routing snapshot; the new and changed items (5.14) on the sample
   and on fixtures.
8. **Ask** (extend `src/ask/engine/matrix.test.ts`, `privacy.test.ts`, `managerMode.test.ts` into
   `modes.test.ts`): `toolDefinitionsFor` per mode (tools and enums), refusals per mode, the
   prompt block per mode, the small-scope rule per kind, recruiter names as tokens.
9. **Help** (extend `src/help/content.test.ts` and `access.test.ts`): every article and tour has a
   decision in every mode; each mode's visible tours keep at least 3 steps; links to hidden targets
   read as text; the new copy follows the rules; Report a problem names the mode, and never a
   manager or recruiter.

Gates as always: `npx tsc --noEmit -p .`, `npx biome check src`, `npx vitest run`, `npm run
build`, `npm run verify`. The QA crawl adds one pass per mode (eleven): every shown route, tour
and article opens; every hidden route redirects; every home renders within budget at 1440 and 375.

### 8.9 Build order and file ownership

Each stage lists agents that can run in parallel. An agent owns its files; anything else it
needs changed it asks the owner for, or notes in its report.

| Stage | Agent | Owns | Delivers | Needs |
|---|---|---|---|---|
| 1 | **Core** | `src/access/{modes,copy,surfaces,context,store,connect,hooks,items,pay,matrix}.ts`, `src/access/scopes/**`, `src/access/policy/{index,types,table,developer,hr,chro,manager,notReady,items}.ts`, lead-owned edits in `src/data/{schema,store,context}.tsx` and `src/views/types.ts`, `src/lib/starts.ts` (the move, with the onboarding re-export) | types, store v2, every scope kind and clamp, `applyScope`, `inScope`, the policy engine with Manager moved unchanged and CHRO, the matrix over eleven modes with the six remaining role tables as hide-everything stubs, tests 2, 3, 6 | nothing |
| 2 | **Policies** | `src/access/policy/{hrbp,compensation,talent,hrOps,recruiter,finance}.ts`, `src/access/__snapshots__/**`, `src/access/matrix.test.ts` | the six role tables from part 4, both snapshots, test 1 | Core |
| 2 | **Shell** | `src/access/ui/**`, `src/app/**` (except `wholeView.tsx`, `exportMeta.ts`, `ExportMenu.tsx`), `src/app/settings/**` | Mode menu groups, `ScopePicker`, Settings > Mode, masthead per 4.3, filter row pins and Finance's row, Settings and Tools per mode | Core |
| 2 | **Data surfaces** | `src/charts/**`, `src/lib/export/**`, `src/app/{wholeView.tsx,exportMeta.ts,ExportMenu.tsx}`, `src/drill/**`, `src/components/**` | `cost` columns, `showCost`, export meta lines, hidden-kind plain numbers, records guard per scope, person card per 4.12 | Core |
| 2 | **Compensation** | `src/views/comp/**`, `src/metrics/compCycle.ts` | Workforce cost tab and engine, cost metrics and guard, column re-marking, the below-minimum roll-up, amounts into `amount`, three new items, cycle dates, `proposalProgress`, part of test 5 | Core (`showCost`, the item contract), Data surfaces (`cost` column type; agree the type first) |
| 2 | **View items** | `src/views/{recruiting,talent,onboarding,services,listening,org,hrbp,compliance}/**` | the audit's part 4.2 fixes in each view's `actions()` (held reqs, stable onboarding keys, fingerprints, `matter`, exposure and due dates, years in dates, punctuation, team subjects, no model risk in text, `place`), the changed and new items of 5.14 outside Compensation, `openCaseRows`, review coverage rows, Onboarding's Recruiter and Finance wording, `LinkedSurvey` per tab, Talent and Org chart scope behavior, one region index for Listening and Onboarding | Core |
| 3 | **Action center** | `src/views/actions/**` | the audit's part 4 engine changes in the Action center, `roleItems` and the two lists, scoped wide run, `KIND_LABEL` for the new kinds, readiness tests (6.2), then the flip (6.3) together with Policies (who deletes `notReady.ts` and updates the snapshots in the same change) | Policies, View items, Compensation |
| 4 | **Homes** | `src/views/home/**`, `src/views/scorecard/**`, `src/views/team/**` | part 5, test 4 | Action center, Compensation, View items |
| 5 | **Ask** | `src/ask/**` (after the Ask workflow's changes land) | part 7, test 8 | Policies, Action center flip |
| 5 | **Help** | `src/help/**` | 4.8, `modes`, `view-home`, `privacy-pay`, `home-start`, test 9 | Homes |
| 5 | **Developer** | `src/dev/**` | Access tab over eleven modes, "Scan as role", Home preview, storage key text | Policies, Homes |
| 6 | **QA** | `scripts/**` (the crawl), no app code | the per-mode crawl, screenshots at 1440 and 375, the gates | everything |

### 8.10 Other workflows running now

- **Ask** (`src/ask`, docs/ASK-ACTIONS.md): its uncommitted changes also touch
  `src/access/policy.ts` (the screen tools' surfaces) and the matrix snapshot. Core moves those
  surfaces into the Manager table unchanged when it splits the policy, and stage 5 Ask work starts
  only after that workflow lands.
- **Action center audit** (docs/ACTION-CENTER-AUDIT.md, landed while this contract was written):
  adopted as the release gate and the routing source (part 6, 5.14). Where this contract and the
  audit differ in naming, this contract's mode ids hold (`hrbp-unit` for its "HRBP BU", `talent`
  ownership for its "Talent"), and the audit's `ScopeLock` sketch (`org`, `businessUnit`,
  `region`) is part 2's `org`, `unit`, `region` and `reqs`.
- **Special analyses** (docs/ANALYSES.md and docs/ANALYSES-RESEARCH.md landed): tab `analyses`
  with four sub-addresses, decided per mode in 4.2. docs/ANALYSES.md 1.7 decides Developer, HR
  and Manager; this contract adds the other eight modes in the same form (`tab:hrbp.analyses:<key>`
  surfaces), and its Manager decisions are kept as written. The analyses add optional employee
  fields (`university`, `degreeLevel`, `fieldOfStudy`, `fte`) and candidate fields
  (`competingOffer`, `offerRevised`, `offerPositionInRange`); they belong to their datasets in
  every mode that reads them. No analysis feeds the Scorecard, `summary()` or the Action center,
  so they add nothing to any home's Needs attention.
- **Job taxonomy flip** (docs/TAXONOMY.md landed): job family and job function swap meaning; field
  keys stay. Nothing here keys on either field. The `unit` scope reads the business unit, not the
  job family (2.1). Employee drills gain Job family and Job function columns and the person card a
  line for them, in every mode that lists employees. Compensation's Market moves to job function
  (not in Finance's or the HRBPs' amount rules, which it does not touch). If its open decision 2
  makes job family and job function filter dimensions, they are allowed in every mode with a full
  filter row, hidden in Finance (2.3) until named in `FILTER_DIMS_OF`, and they do not change the
  `org`, `unit` or `region` clamps. Its `ctx.jobs` is additive and needs nothing from the modes.

---

## 9. Open questions

Decided (see "Decisions made" at the end): **a headcount budget for Finance.** Census has a hiring plan (planned hires by
month and org) but no headcount or cost budget. This contract builds Finance's "headcount vs plan"
as starts against the hiring plan plus net headcount change, and "open reqs vs budget" as open
reqs against the plan's lines (reqs on no line are unbudgeted). A true headcount and cost budget
needs a new optional dataset (cost center × month × budgeted headcount and budgeted cost) with
import, templates, official-list checks and a Workforce cost "against budget" view. The audit
(its open question 6) recommends adding it as an optional dataset. Build it in this release, or
after Finance has used the plan-based view?

Calls made here that a reviewer is most likely to revisit:

- HR keeps "Show pay amounts" (HR mode is the existing full team view); the switch also exists in
  CHRO and Compensation, and nowhere else.
- Finance filters by business unit and period only, so cost totals can never be compared across
  scopes that differ by a few people; Finance sees people by name in headcount drills, never
  their pay.
- The Data room shows in HR, CHRO, HR ops and Developer only; HR ops is the data owner.
- HRBPs see successors and managers outside their scope by name (never openable); Manager and
  Recruiter do not.
- Recruiter sees no Org chart, People stats, Talent or Listening; its world is its reqs and their
  starts.
- Compensation and Talent management do not see Recruiting or HR ops; HR ops does not see Talent
  or Compensation.
- Every mode change turns pay amounts and immigration details off.
- The audit's recommendations for its open questions 1, 2, 4, 5 and 7 are adopted (6.2); its
  question 3 (a regional HRBP owner) waits, because region items route by kind inside the scope.
- Recruiter mode offers "Every recruiter" for a talent acquisition lead (the audit's 5.4).

## Decisions made (7 Oct 2026)

- **Budget dataset: build it in this release.** The user chose to add it now. A new optional dataset,
  "Headcount and cost budget" (sheet "Budget"): `period` (month), `businessUnit`, `department`
  (optional), `costCenter` (optional), `budgetHeadcount`, `budgetCost` (a pay-type amount: Finance
  sees it only as totals under the Finance rules above), `currency`, `planVersion`. Import,
  templates, official-list checks, quality, and the sample company gets a budget that tells a story
  (Silicon Engineering under budget on headcount but over on cost from contractors; Go-to-Market
  over on headcount). Finance's home and the Workforce cost tab show actual against budget; with no
  budget loaded they fall back to the hiring plan, as written above.
- **Action center audit, open questions 1 to 7:** take every recommendation in
  docs/ACTION-CENTER-AUDIT.md section 8: workflow items show below the data standard tagged with
  their tier; marks stay personal in this browser with "by" and an optional marks file; regional
  HRBP owners from a Settings list by region; managers see "exits", not "regretted exits"; comp
  cycle dates in Settings > Compensation cycle; the budget dataset (above); the CHRO escalation
  threshold as the default, kept in the metric dictionary.
- **Security center (added 7 Oct 2026):** the roles build also delivers docs/SECURITY-CENTER.md: a
  Developer-page tab that edits overrides on this contract's policy tables, with guard rails, a
  preview-as-role, and a published `access-policy.json` that every user loads (the user chose a
  policy file for everyone). Design the policy tables so overrides can be applied on top of them.
