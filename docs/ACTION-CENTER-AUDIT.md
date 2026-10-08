# Action center audit: what makes it "not ready" and what each role needs

The user asked: "add more roles like compensation, hrbp global for one BU, hrbp for one region but
all employees, finance, chro, recruiter, talent management, hr ops, each should have their own
actions and list." Their decisions: every role gets a home page with "Needs attention" (its action
items) and "My list" (the records it works on), and the Action center comes back for every role,
filtered to that role. Compensation sees individual pay amounts behind the existing session switch,
Finance sees cost totals only, every other role sees ratios only. CHRO sees everything HR sees.

This file is the audit behind that decision. Commit `7eb8ad7` put the Action center in Developer
mode only "until the team signs it off" and gave no reasons. Part 3 finds them. Parts 4 to 6 say
what has to change before any role sees it, what each role's version holds, and the checklist that
releases it. It is a planning document: no app code was changed.

Read with ARCHITECTURE.md, docs/ROLES.md (modes, the policy, the lock), docs/VIEWS.md (Action
center, the `actions()` contract) and docs/ASK-ACTIONS.md. Modes and roles stay an open switch:
they shape what Census shows, not who can see the data.

---

## 0. The verdict in one list

1. **The numbers are right.** Every item source recounted from raw rows matched exactly (part 3.1).
   Nothing is invented or double counted inside a view.
2. **The list is not usable as a weekly worklist.** 574 open items for 211 owners at company scope;
   55% overdue; 23% with no due date. Three sources make up 72% of the list and are mostly not
   actions: overdue training rolled up per manager (164), people below range minimum (78, all on
   one team) and recruiting aging (172). An export-license violation sits at position 123.
3. **Items never close.** Stay conversations, span reviews, promotion reviews, critical roles and
   below-minimum pay have no data that says they were done, so they stay open (one stay
   conversation item is 167 days overdue). The oldest recruiting items are on reqs that are on hold.
4. **Duplicates across views** for the same person and owner (export license: Onboarding and
   Compliance; I-9 Section 2: Onboarding and Compliance when one is late).
5. **Dates and wording slip:** "the oldest due 5 Dec" means 5 Dec 2024; a violation since 3 Aug
   reads "Due today"; 44 items end with a full stop and 530 do not.
6. **Handled and Snooze do not hold.** Onboarding item ids change when a new hire is entered in the
   HRIS (application ID to employee ID), roll-up items keep one id while their content changes, and
   marks live in one browser with no "by whom".
7. **The owner model has no "me".** Groups mix people and team queues, a team can be its own
   biggest owner (Total rewards, 90 items), and a regional HRBP, Finance or the CHRO have no owner
   group at all.
8. **Pay amounts leak into text.** With pay amounts on, a Compensation item's "What is open"
   carries "$4,008 a year in USD", which the export's `pay: true` column rule cannot drop and
   Copy note pastes into email.
9. **The data standard hides workflow.** At Validated, 258 of 574 items vanish (every recruiting,
   onboarding and HR case item); at Production, 464 vanish, including the export-license violation.
10. **Performance and phone:** about 1 s of main-thread work in one idle callback on first load;
    on a phone the first item is 3,383 px down a 12,661 px page.
11. **Tests cover counts and tone, not usefulness:** nothing tests freshness, de-duplication, id
    stability, dates with years, severity order or role routing.

Release needs the shared fixes in part 4, the role lenses in part 5 and the checklist in part 6.

---

## 1. How this was audited

- **Code read:** `src/views/actions/` (engine: `collect`, `due`, `filters`, `group`, `kind`, `marks`,
  `note`, `rows`, `summary`, `charts`; UI: `ActionCenter`, `Sheets`, `Charts`, `store`,
  `useCollected`), every view's `actions()` (`recruiting`, `onboarding`, `hrbp`, `org`, `services`,
  `talent`, `comp`, `compliance`, `listening`), `src/access/items.ts`, `policy.ts` (the `NOT_READY`
  rule), `src/views/team/ui/Waiting.tsx`, the Ask tool `open_items`, the commit `7eb8ad7` diff.
- **Tests run:** `npx vitest run src/views/actions`: 6 files, 44 tests pass (10 s).
  `npx vitest run src/views/team src/views/scorecard src/access` plus every view that has
  `actions`: 147 files, 1,521 tests pass (51 s).
- **Browser:** an own tab on `http://[::1]:8820`, `census:mode` set to Developer, sample data
  (Northgate, 2,080 employee rows, 1,450 active employees, as of 30 Sep 2026), whole company, last
  12 months, data standard Everything (this browser's saved standard). Read with page text and the
  accessibility tree; recounts ran the page's own engine modules against `ctx.all`; Handled, Undo
  and Copy note were clicked once each; phone checked at 375 x 812. Storage was put back
  (`census:filters` as found; `census:mode`, `census:actions` and `census:views` removed) and the
  tab closed.

---

## 2. What the Action center holds today (sample, whole company)

| View | Items | Kinds (count) | Owner group |
|---|---|---|---|
| Talent | 197 | Required training overdue (164), Promotion to review (25), Critical role without a ready successor (8) | Managers, HR business partners, Talent management |
| Recruiting | 178 | Application to review (86), Interview decision (39), Interview to schedule: screen (22), hiring manager (13), onsite (7), Empty funnel (6), Offer awaiting an answer (5) | Recruiters, Managers, Recruiting coordinators |
| Compensation | 89 | Pay below range minimum (78), Merit outside guideline (11) | Total rewards (team) |
| Onboarding | 44 | Day-one task (31), Probation decision (13) | People operations, IT, Facilities, Trade compliance, Managers |
| HR ops | 34 | Case past target (27), Transaction past due (4), Return from leave (3) | Global mobility, People operations, Payroll |
| People stats | 18 | Stay conversations (13), Span of control (5) | Managers, HR business partners |
| Compliance | 7 | Work authorization to reverify (4), Export license (3) | Global mobility, Trade compliance |
| Listening | 4 | Low upward feedback, Stay risk, Exit survey reason, Day-30 readiness (1 each) | HR business partners, Talent management, Total rewards, IT |
| Org chart | 3 | Single-report chain (2), New manager with a large team (1) | HR business partners |

Key figures: 574 open, 316 overdue (55%), 129 critical (22%), 110 due within 7 d, 211 owners
(202 people, 9 teams). By owner group: Managers 235 items for 181 owners; Recruiters 119 for 9;
Total rewards 90 for 1 team; HR business partners 34 for 5 (Michael Thomas 23); People operations
34; Recruiting coordinators 20; Global mobility 19; Talent management 9; Trade compliance 5; IT 4;
Facilities 4; Payroll 1. 140 items (24%) are owned by a team rather than a person. 134 (23%) have
no due date.

Due spread of the larger kinds (days from the as-of date, negative is overdue):

| Kind | Median | Oldest | Severity |
|---|---|---|---|
| Required training overdue | -35 | -664 | all Watch |
| Application to review | -10 | -176 | 64 Critical, 22 Watch |
| Stay conversations | -76 | -167 | 3 Critical, 10 Watch |
| Case past target | -38 | -121 | 16 Critical, 11 Watch |
| Probation decision | +6 | -121 | 4 Watch, 9 Note |
| Interview decision | +1 | -1 | 3 Critical, 36 Watch |
| Day-one task | +4 | +2 | 5 Watch, 26 Note |
| Pay below minimum, merit exceptions, promotion reviews, critical roles, span | no due date | | |

---

## 3. Findings

### 3.1 Correctness of the item sources (recounted from raw rows)

| Source | Recount | Result |
|---|---|---|
| `talent:training-overdue` | Required learning rows, not completed, due before the as-of date, employee active, grouped by `managerId` | 164 managers and 290 assignments; every item's count equals the recount. Correct. |
| `comp:below-minimum` | Latest comp row per active employee with `baseSalary < rangeMin` | 78 = 78, same people. Correct. |
| `services:case` | Open cases (48) whose age passed `resolutionTargetHours` | 27 = 27, same case IDs. Correct. |
| `hrbp:stay-conversations` | Regretted voluntary exits in the last 12 months by former manager, 2 or more | 13 = 13, counts equal. Correct (the minimum is 2, from the readout rule's setting). |
| Recruiting candidate items (172) | Candidate and req rows | Every candidate is Active, none rejected or hired. Every Interview decision is owned by the req's `hiringManagerId`. **7 items sit on reqs with status On hold**, and they are the oldest: 186, 184, 169, 105, 88 and 79 days. |
| Owners | Name to roster (`ownerLookup`) | Every recruiter, coordinator, case agent and HRBP name resolved to an employee ID; no unmatched person names. |

Verdict: the counts are real and current as of the data. The problems are in what is listed and
how it is worded, owned and kept, not in the arithmetic.

### 3.2 Noise and volume

- **Roll-ups that read as one item per manager:** `talent:training-overdue` makes 164 items (29% of
  the list, 52% of overdue), each "Watch", 12 of them with an oldest due date before 2026. A manager with
  one person one course overdue gets the same weight as an I-9 deadline.
- **A population presented as tasks:** 78 "Pay below range minimum" items plus 11 merit exceptions,
  all owned by the Total rewards team, none with a due date. It is a review list for the next cycle,
  not 89 things due this week; Copy note writes a 90-item note to the team that is reading it.
- **Normal workflow presented as exceptions:** 26 of 31 day-one tasks are "Note" items for tasks in
  progress and not yet due ("Laptop shipped is in progress ... Due 2 Oct").
- **Aging that is really a dead pipeline:** 86 application reviews, median 20 days since applying,
  the oldest 186 days on a held req. A real ATS would have closed these.
- **Reviews with no date:** 25 "Promotion to review" items (Note, no due date) sit with the five
  HRBPs, and one HRBP holds 23 HRBP items in all.
- **Result:** the page opens on five charts about the backlog; under them the Managers sheet alone
  lists 8 owners before "Show all 181 owners", and 11 more owner sheets follow. Nobody can answer
  "what do I raise this week" from it.

### 3.3 Freshness and closure

- **Items with no closing data:** stay conversations, span outliers, single-report chains, new
  managers, promotion reviews, critical roles, below-minimum pay, listening items. Only "Mark
  handled" in one browser closes them. Stay conversations stay open for 12 months after the latest
  exit (median 76 days overdue today).
- **Held and stale records:** candidate items on On hold reqs (7), applications with no activity
  for months (`candidates.lastActivityDate` is in the data and unused), probation decisions 121 days
  late (a decision that was surely made but never recorded).
- **Succession plans** updated 5 months ago drive "No successor" items with no check on plan age.

### 3.4 Duplicates across views

| Same matter | Item 1 | Item 2 | Sample |
|---|---|---|---|
| Export license for a start | `onboarding:task:<key>:Export-control screening` (Trade compliance) | `compliance:license:<employeeId>` (Trade compliance) | Claire Hill, Valeria Ruiz |
| I-9 Section 2 late | `onboarding:i9:<key>` (People operations, critical) | `compliance:i9:<employeeId>` (People operations, critical) | none open today; both fire for any late US start |
| One person's pay | `comp:below-minimum:<id>` | `comp:guideline-exception:<id>` | Sindhu Deshpande, Amanda Evans |
| Stay conversations and exit reasons | `hrbp:stay-conversations` (manager) | `listening:exit` (location) | related, not identical; keep apart |

`collectActions` de-duplicates by item id only (`seen`), and ids differ by view.

### 3.5 Due dates and wording

- **Year dropped:** Talent writes "the oldest due 5 Dec" with `short()` (drops the year) for a due
  date of 5 Dec 2024. 12 training items read this way. Recruiting's `short()` is safe only because
  its dates are recent.
- **Due date that hides a breach:** an export license not in force for someone working since 3 Aug
  has `due: asOf`, so it reads "Due today" and is not counted overdue. The due date is the start
  date (58 days overdue).
- **Punctuation:** Onboarding's `what` ends with a full stop (44 items); every other view's does not
  (530). The row, the note and the export all show both styles.
- **About for a team item opens the manager:** "Neha Agarwal's team" carries the manager's employee
  ID as `subject.id`, so the records row "opens the person it is about", which is the manager.
- **Team names:** "Recruiting" (Onboarding's recruiter fallback) and "Recruiting team" (Recruiting's
  unassigned owner); "HR business partner" (People stats fallback) and "HR business partners"
  (Listening). Benefits cases are filed under "Total rewards".
- Tone is clean: no nagging verb, no em dash, every ask polite (the existing test holds).

### 3.6 Severity and order

Severity means different things per view: Recruiting maps aging tiers (overdue is Critical), Talent
training is always Watch however late, HR ops is Critical past the aged-backlog days, Compliance
is Critical for a legal breach. 101 of the 129 Critical items are recruiting aging. Sorted by
severity then due date, the export-license breach (working without a license in force) lands at
position 123 of 574, behind 122 recruiting, case and other items.

### 3.7 The owner model (people and teams)

- Groups are owner roles (`ACTION_OWNER_ROLES`), and inside them people and team queues mix:
  Global mobility holds Amanda Wright (15 case items) and the "Global mobility" team (4
  reverifications); People operations holds three agents, the People operations queue (22) and
  "Employee relations" (1).
- There is no "me": the only personal lens is "My team", which is the leader filter (a manager and
  their org). A recruiter, a comp partner or an HRBP cannot say "my items".
- Missing owner groups for the new roles: Finance, the CHRO (escalations), a regional HRBP (the
  sample's `employees.hrbp` is one HRBP per business unit; nothing names a regional one), and
  Benefits apart from Compensation.
- An item has one owner. "Waiting on someone else, about my area" (a hiring manager's decision on a
  recruiter's req; a manager's stay conversations in an HRBP's unit) is only reachable through
  "My team" for managers.

### 3.8 Handled, Snooze, Undo and persistence

Verified in the browser: Handled writes `census:actions` (`{"version":1,"marks":{"services:tx:TX-303405":{...}}}`),
the toast says "Kept in this browser." with Undo, focus moves to the next owner's toggle, and Undo
restores the item and removes the key. Gaps:

- **Ids change under the mark.** Onboarding keys a start by `employee?.employeeId ?? applicationId`,
  so when the new hire is entered in the HRIS every handled or snoozed day-one task comes back.
- **Roll-ups keep one id while their content changes.** `talent:training-overdue:<managerId>`,
  `hrbp:stay-conversations:<managerId>`, `talent:critical-role:<roleId>`: handled today, a new overdue
  course or a fourth regretted exit next month stays hidden for up to 365 days (`KEEP_DAYS`).
- **One browser, one person.** Marks are not shared across the HR team, not in the settings file,
  and carry no "by whom" or "why". A recruiter marking an item handled does not tell the TA lead.
- **Two clocks.** Due dates use the data's as-of date; snoozes use the wall clock. Fine on live
  data refreshed daily; on the sample (as of 30 Sep, today 7 Oct) "Due in 2 d" is already past.
- **Undo** puts focus on the page body (the toast's button is gone), not back on the item.
- **An employee relations case ID is stored** in the mark's key (`services:case:HR-...`) when that
  item is marked, and Developer > State offers "Copy value" for `census:actions`. The page never
  shows it, but it is kept and copyable.

### 3.9 Copy note

Works (verified: "Note for Payroll copied, 1 item, ready to paste into email or chat"; the fallback
dialog exists for a blocked clipboard). Tone and the 25-item cap hold. Gaps:

- A note to a team queue the reader belongs to ("Hi Total rewards team, Here are 90 open items")
  is a note to themselves.
- It copies whatever `what` holds: pay amounts with the switch on (3.13), "the incumbent is at high
  risk of loss", upward feedback scores about a named manager. Each is allowed on screen for its
  reader; pasted into email it travels without Census's rules.
- No per-item copy, no "copy for the leader review" (all items about one leader's org, across
  owners), which is what the weekly review needs.

### 3.10 Exports

"Export list" writes the filtered list and a by-owner sheet; each owner-group sheet exports through
its Figure; item ids are never exported; the export meta carries scope and as-of. Gaps: no mode or
role line in the meta (Manager mode has one for whole-view exports, not this list); `what` can hold
a pay amount that no `pay: true` column flags; no "My list" export because there is no list.

### 3.11 Data standard gating

Items whose fields fall below the on-screen standard are hidden and counted. On the sample:

| Standard | Shown | Hidden | Hidden because |
|---|---|---|---|
| Everything (bronze) | 574 | 0 | |
| Validated (silver) | 316 | 258 | Candidates (172), Onboarding tasks (45), HR cases (27), Succession (8), req IDs (6) |
| Production (gold) | 110 | 464 | the above, plus Learning (164), Job changes, HR transactions, Right to work, Survey responses |

Hiding is right for a statistic and wrong for a workflow record: a recruiter at Validated sees no
recruiting items at all, and at Production the export-license breach disappears. The tier badge
on every sheet also repeats a long sentence ("Bronze tier. Onboarding tasks mapping not yet
confirmed ...") on each of 17 figures.

### 3.12 Performance

- First load in the browser: one idle callback runs every view's `actions` back to back, about
  966 ms of main-thread work (`census:actions:talent` 364 ms, `services` 230, `comp` 106,
  `listening` 88, `hrbp` 74, `compliance` 52, `onboarding` 40, `org` 11). The Scorecard slices its
  summaries across idle slices; the Action center does not.
- A new context (a filter change): about 450 ms. "My team" mode runs the views twice (the scope and
  the whole company without the leader), about 445 ms for a 66-person org.
- Every role home will collect too; the cache is per context, so homes, the masthead count and the
  page share one run only when they share a context.

### 3.13 Privacy

- **Employee relations:** the item names no person and carries no case ID on screen, in exports or
  in Ask (`isPrivateItem`, the sample test). In a scope under 5 people it is left out, and the page
  says so either way. Kept: the case ID in the stored mark key (3.8).
- **Pay amounts:** opt-in through `ctx.showPay`, but written into free text (`belowItem`: "$4,008 a
  year in USD"), so the export's column rule cannot drop it and Copy note pastes it. For Finance
  (totals only) and every ratio-only role the only safe rule is that item text never holds an amount.
- **Small groups:** counts in item text are about named teams ("2 regretted exits from Neha
  Agarwal's team"), allowed as counts; the drill lists the leavers. In Manager mode the manager sees
  HR's "regretted" classification of named leavers. Decide whether a manager's item says "exits"
  rather than "regretted exits" (open question 8.4).
- **Model scores:** `roleItem` falls back to the flight-risk model (`modelRisk`) when the succession
  data has no `incumbentRiskOfLoss`. The sample always has the recorded value, so no model score
  reaches item text today; an upload without that column would put a model score about a named
  incumbent into an item a manager can see.
- **Surveys:** the upward-feedback item is a manager cut with 10 respondents (the minimum); exit and
  stay items are group results above the minimum. Correct.
- **Immigration:** reverification items never say the authorization type. Correct.

### 3.14 Accessibility

Good: every button has a label ("Mark handled: Compensation change, Aarav Agarwal"), owner toggles
carry `aria-expanded` and `aria-controls`, lists are labelled ("Owners in Recruiters"), charts are
one tab stop with arrow keys, the masthead reads "Actions, 574 open, 129 critical", focus moves to
the next item after Handled. Gaps: the h1 is followed by h3 figure titles before the first h2
("Waiting on"); Undo drops focus to the body; the tier badge sentence is read on every figure.

### 3.15 Phone (375 px)

No horizontal scroll. But the five overview figures come first: "Waiting on" starts 3,383 px down
and the page is 12,661 px tall; an item row is about 192 px; Handled and Snooze are 28 px tall. On a
phone the list has to lead.

### 3.16 Test coverage

Covered today: counts and drills, owner matching, the data standard count, "My team" tagging, the
small-scope rule, note tone and cap, marks parsing and undo, due bands, kinds. Not covered:
freshness (held reqs, dead candidates), de-duplication across views, id stability across the hire,
roll-up reopening, dates with a year, severity order, pay amounts in text, per-role routing,
performance budget, phone order.

---

## 4. Shared changes before any role sees it

These are engine and contract changes in `src/views/types.ts` (lead-owned: say so in the report),
`src/views/actions/engine/` and each view's `actions()`.

### 4.1 The item contract

```ts
interface ActionItem {
  // existing: id, ownerRole, ownerId, ownerName, due, severity, what, subject, view, tab, drill, note, uses, kind
  /** Same matter across views ("license:E12069", "i9:E12069"): one item survives, the others fold in. */
  matter?: string
  /** Changes when the item's content changes (count, latest date): a handled mark with another
   *  fingerprint reopens. Roll-ups must set it. */
  fingerprint?: string
  /** A money amount for this item, shown only where the role and the switch allow; never in `what`
   *  or `note`. */
  amount?: { usd: number; label: string }
  /** Legal or regulatory exposure (I-9, export license, work authorization, final pay). Ranks first. */
  exposure?: boolean
  /** The record that would close it, for "why is this still open": "No completed date on the course". */
  closesWhen?: string
  /** Business unit and region of the person or req it is about, for the HRBP lenses. */
  place?: { businessUnit?: string; region?: Region; location?: string }
}
```

### 4.2 Engine fixes (each with a test in part 6)

| Fix | Where |
|---|---|
| Fold items that share `matter` (keep the one from the owning view: Compliance for licenses and I-9) | `collect.ts` after the `seen` pass |
| Drop candidate items on reqs On hold or Cancelled; drop or roll up applications with no activity in N days (setting) | `recruiting/engine/actions.ts`, `inQueue` |
| Key onboarding items by application ID when one exists (stable across the hire), or keep an alias map | `onboarding/engine/actions.ts`, `starts.ts` `key` |
| Fingerprints on roll-ups; `statusOf` reopens a handled mark whose fingerprint changed | `talent`, `hrbp`, `org`, `comp` actions; `marks.ts` v2 |
| Export license due date is the start date; never "Due today" for a breach | `compliance/engine/actions.ts` |
| Dates in `what` keep the year unless it is the as-of year (`dateWords(d, asOf)` in `src/lib/dates.ts`) | Talent, Recruiting |
| One punctuation rule for `what` (no full stop), enforced by a test | Onboarding |
| Amounts move to `amount`; `what` keeps the ratio only | `comp/engine/actions.ts` |
| One severity rubric: Critical = legal exposure, or a person blocked past the overdue limit (a start, a candidate decision, final pay); Watch = overdue; Note = due soon or awareness | each view; a shared `severityOf` in `src/views/actions/engine/` |
| Sort: `exposure` first, then severity, then days overdue | `compareActions` |
| Team items about a manager's team: `subject.kind: 'none'` with the drill, so About never opens the manager | `talent`, `hrbp` |
| Team names from one list (`TEAM_NAMES` becomes the source of owner names, not a matcher); Benefits gets its own owner role | `views/types.ts`, `services/engine/actions.ts` |
| Model risk never written into item text; only a recorded risk of loss | `talent/engine/actions.ts` `roleItem` |
| Workflow items are not hidden by the data standard; they show with their tier badge and the count of items "from data below your standard" | `collect.ts` (`gateFor` result becomes a tag, not a filter) |
| Slice the collection: one view per idle slice, stop on a newer context, like the Scorecard's `schedule.ts` | `useCollected.ts` |
| Hash the id of a private item before it is stored as a mark key | `marks.ts` |

### 4.3 Roll-ups and lists, not more items

Some sources stop being items and become lists (part 5), with one summary item each:

| Today | Becomes |
|---|---|
| 164 training items, one per manager | Manager: one item for their own team. HR and Talent: one item per course below target ("Export control refresher: 81% on time, 23 overdue") plus the list of overdue assignments. |
| 78 below-minimum items | Compensation: "My list: people below range minimum" and one item "78 people below range minimum; plan moves before the cycle closes", due the cycle's close date. |
| 25 promotion reviews | HRBP's list "High performers with no promotion in 3 years", one item per business unit before the promotion cycle. |
| 31 day-one tasks | Only tasks overdue, blocked, or not started inside the look-ahead are items; the rest stay on Onboarding's countdown. |

### 4.4 The role lens

Roles are new modes in `src/access/modes.ts` (see the modes plan). The Action center needs one pure
function beside `itemsShown` in `src/access/items.ts`:

```ts
interface RoleLens {
  role: RoleKey               // 'chro' | 'hr' | 'comp' | 'finance' | 'recruiter' | 'talent' | 'hr-ops' | 'hrbp-bu' | 'hrbp-region' | 'manager' | 'developer'
  me?: { id: string | null; name: string }   // the recruiter, the HRBP, the comp partner, picked like a manager
  lock?: ScopeLock            // manager org (exists), business unit, or region
}
function roleItems(collected: Collected, lens: RoleLens, ctx: AnalyticsContext): {
  needs: OpenAction[]          // owned by me or my role's queues, in my scope: "Needs attention"
  waiting: OpenAction[]        // in my area, owned by others: "Waiting on others"
  left: number                 // collected items this role does not list (said, never shown)
}
```

- Each role has an allowlist of item kinds and owner roles (part 5), a test per role, and an entry
  in the access matrix snapshot.
- `ScopeLock` generalizes the manager lock: `{ kind: 'org' | 'businessUnit' | 'region', ... }`, with
  the same clamp (`clampFilters`), the same small-scope rule (`lock.size` against the anonymity
  minimum) and the same records guard (`inLock`).
- Region is derived from location through `SITES[].region` (Americas, EMEA, APAC); the filter row has
  no region filter today, so the lock is a set of locations and the scope label says the region.
- The "My team" picker stays for HR, CHRO and Developer; every other role sees its lock instead.

### 4.5 Marks v2

`census:actions` v2: `{ state, at, until?, fingerprint?, by?: string, note?: string }`, the `by` a
name typed once in this browser ("Kept as Priya in this browser"). Optional "Save marks to a file"
and "Load marks" in Settings > This device, so a team can pass handled lists along. Not security;
marks never enter the settings file by default.

---

## 5. Each role's version

Format: **Needs attention** is the role's items (exists or missing); **My list** is the records it
works on (a table-only Figure with drills, never ActionItems); "Waiting on others" is the role's
area, owned elsewhere. Missing items name the data and the engine function that would build them.

### 5.1 CHRO

Scope: whole company, everything HR sees, pay amounts behind the session switch, no developer
tools. Home: Scorecard, top risks, Monthly people report.

**Needs attention:** escalations only, at most 10, each with its owner named.

| Item | Status | Source |
|---|---|---|
| Legal exposure: export license breach, I-9 late, work authorization ended, final pay late | Exists as items (Compliance, HR ops) | Filter `exposure` |
| Critical role with no successor and the incumbent at high risk of loss | Exists (4 on the sample) | `talent:critical-role`, severity Critical |
| Regretted exit cluster: 3 or more from one team in 12 months | Exists (3 on the sample, owned by managers) | `hrbp:stay-conversations` with `criticalExits` |
| Any item Critical and overdue more than 14 d (setting) | Missing | `roleItems` rule over collected items |
| Measures missed against target this month | Missing | Scorecard `buildScorecard` (missed rows), one item per practice, owned by the practice lead (a Settings list "Practice leads") |
| Monthly people report due | Missing (the kind `report:scorecard` is in `kind.ts` with no producer) | Due the first business day of the month (setting); owner the CHRO's chief of staff (Settings) |
| Merit spend over budget by business unit | Missing | `comp/engine/cycle.ts` `spendBy` + `overBudgetSeverity` |
| Case backlog aged past the aged-backlog days | Missing as one item | `services` `agedCases` count, owner the HR ops lead |

**My list:** the CEO's direct reports' orgs: headcount, voluntary and regretted attrition (vs
company), open reqs, open Critical items, critical roles covered, owner HRBP. Built from
`hrbpModel` per leader scope (the Scorecard's `scorecard-attrition-bu` already computes by unit).

**Waiting on others:** every Critical item, grouped by practice.

### 5.2 Compensation

Scope: whole company; individual pay amounts behind the existing session switch.

| Item | Status | Source |
|---|---|---|
| Pay below range minimum | Exists (78) | Becomes one item plus the list (4.3) |
| Merit outside guideline | Exists (11) | Keep per person, due the cycle close date |
| Exit survey: pay is the top reason at a location | Exists (1, Bengaluru) | `listening:exit` with `pay` |
| Compensation change transaction past due | Exists, owned by Payroll | Waiting on others |
| Pay above range maximum | Missing | `comp/engine/ranges.ts` `aboveMaximum` |
| Promoted with no increase, or an increase under the promotion guideline | Missing | `jobChanges` promotions + `comp.promotionPct`, `lastIncreaseDate` |
| Rated 4 or 5 with compa-ratio under 0.90 | Missing | `reviews` latest cycle + `compaRow` |
| No increase in 24 months while rated 3 or better | Missing | `comp.lastIncreaseDate`, `reviewAt` |
| Pay compression in a job and level | Missing | `ranges.ts` `compression` |
| Merit spend over budget by unit | Missing | `cycle.ts` `meritSpend`, `spendBy` |
| Jobs furthest below market | Missing | `market.ts` `jobsBelowMarket` |
| Cycle milestones (calibration, close, letters) | Missing data | Settings > Compensation cycle has budget and guideline, no dates: add `openDate`, `calibrationDate`, `closeDate`, `effectiveDate` |

**My list:** people outside range (below minimum and above maximum): name, job, level, location,
compa-ratio, range penetration, merit proposal %, last increase date; base, range and cost to
minimum only while pay amounts are on (`pay: true` columns). `compModel(ctx).ranges`, `cycle`.

**Copy note:** never carries an amount, whatever the switch (amounts live in `amount`).

**Benefits** cases leave this role (their own owner role, HR ops).

### 5.3 Finance

Scope: whole company; cost totals by cost center, business unit, level and site; never one
person's pay; every group under 5 folded into "Other". No item names a person.

| Item | Status | Source |
|---|---|---|
| Merit spend over budget, by business unit | Missing | `cycle.ts` `spendBy`, totals only |
| Hires vs plan off by more than the band, by unit and quarter | Missing | `onboarding/engine/plan.ts` `computePlan`, `statusOf` |
| Plan lines with no req, a req on hold or cancelled | Missing | `plan.ts` `coverageOf`, `isUncovered` |
| Open reqs not in the hiring plan | Missing | metric `recruiting.data.reqMatch` (exists), `hiringPlan.reqId` |
| Starts in the next 30 and 90 days by cost center (run-rate change) | Missing | `computeUpcoming`, `computeForecast`, `employees.costCenter` |
| Retro pay transactions this month (accrual) | Missing | `services/engine/transactions.ts` `retroCandidates`, counts and totals only |
| Total cost to bring people to range minimum, by unit | Missing | `ranges.ts` `costToMinimum` summed by unit, groups of 5 or more |
| Headcount or cost over budget by cost center | Missing data | A budget dataset: `costCenter`, `period`, `budgetHeadcount`, `budgetCostUsd` |

**My list:** cost centers: headcount, total base cost in USD (`baseSalary` x `fxToUsd`), target
bonus cost, equity, open reqs, starts in 90 days, plan variance. New pure `costModel(ctx)` in the
Compensation engine, aggregates only, tested to return no row under 5 people.

**Pay rule:** Finance never turns on individual pay amounts; the Mode switch keeps `showPay` off
the way Manager mode does, and cost totals are not a `pay: true` column (they are totals).

### 5.4 Recruiter

Scope: whole company; "me" is a recruiter name picked from `requisitions.recruiter` (matched to the
roster by `ownerLookup`); a TA lead picks "Every recruiter".

| Item | Status | Source |
|---|---|---|
| Application to review, screen to schedule, offer to send, offer awaiting an answer | Exists (owned by recruiter) | `recruiting/engine/actions.ts` |
| Empty funnel | Exists (6) | same |
| Interview to schedule (coordinator) | Exists (owned by coordinator) | Waiting on others, or Needs attention when the recruiter has no coordinator |
| Interview decision (hiring manager) | Exists (owned by hiring manager) | Waiting on others, with Copy note to the manager |
| Items on held reqs | Exists, wrongly | Drop (4.2) |
| Req on hold for 30 or more days | Missing | `requisitions.status`, a hold date (missing data: use `lastActivityDate` of its candidates until a `statusDate` column exists) |
| Req past target time to fill | Missing | `reqs.ts` `reqAge` against the time-to-fill target |
| Target start date at risk (no candidate past the hiring manager stage within the usual lead time) | Missing | `requisitions.targetStartDate`, `onboarding/engine/forecast.ts` `computeForecast` |
| Candidate with no activity in 21 d | Missing | `candidates.lastActivityDate` |
| Offer accepted, no start date | Missing | `candidates.offerDate`, `startDate` |
| Req with no recruiter | Missing | `requisitions.recruiter` empty, owner the TA lead |
| Recruiter load over the limit | Missing (TA lead) | `reqs.ts` `recruiterLoad` |

**My list:** my open reqs: req, title, hiring manager, days open, active candidates, lacking a next
step, health, target start. `computeRecruiting(ctx).base.req`, `reqFacts`. Then my candidates in
the queue (`activeItems`, `inQueue`).

**Not shown:** compensation, HR ops cases, talent risk, surveys; candidate items only.

### 5.5 Talent management

Scope: whole company.

| Item | Status | Source |
|---|---|---|
| Critical role without a ready-now successor | Exists (8) | `talent:critical-role` |
| Stay risk dominating a key talent group | Exists (1) | `listening:stay` |
| Overdue required training with no manager on record | Exists (the "No manager on record" roll-up) | `talent:training-overdue:none` |
| Required course below its on-time target | Missing (replaces 164 per-manager items for this role) | `talent/engine/learning.ts` `computeLearning`, by course |
| Succession plan not updated in 12 months (setting) | Missing | `succession.updatedDate` |
| Named successor who left or changed role | Missing | `succession.successorId` against `employees.terminationDate`, `jobChanges` |
| Incumbent of a critical role leaving (termination date ahead) | Missing | `employees.terminationDate` after the as-of date |
| Ratings missing in the latest cycle | Missing | `buildReviewIndex`, `latestCycle` |
| Ratings changed in calibration, to confirm with the manager | Missing | `reviews.preCalibrationRating` vs `rating` |
| Rating mix off the guideline by unit | Missing | `talent/engine/performance.ts` `computePerformance`, `RATING_GUIDELINE` |
| Key talent at high flight risk | Missing as items (a finding today) | `talent/engine/retention.ts` `computeRetention`; Talent role only |
| New manager without manager training | Missing | `org/engine/flags.ts` `becameManagerDates` + a required course named in Settings |

**My list:** critical roles: role, incumbent, risk of loss, successors by readiness, plan updated;
then the high-potential pool (9-box top boxes, `ninebox.ts`).

### 5.6 HR ops

Scope: whole company; the role's queues: People operations, Payroll, Benefits, Global mobility,
Trade compliance, Employee relations (counts only), plus IT and Facilities onboarding tasks.

| Item | Status | Source |
|---|---|---|
| Case past resolution target | Exists (27) | `services:case` |
| HR transaction past due | Exists (4) | `services:tx` |
| Return from leave not ready | Exists (3) | `services:return` |
| Day-one tasks overdue, blocked or not started in the look-ahead | Exists (31, to trim) | `onboarding:task` |
| I-9 Section 2 due or late | Exists (two sources, to fold) | `compliance:i9` survives |
| Reverification, export licenses | Exists (4, 3) | Compliance |
| Probation decision | Exists (owned by managers) | Waiting on others |
| Day-30 readiness low in a region | Exists (1) | `listening:readiness` |
| Case past its first-response target, still unanswered | Missing | `cases.responseTargetHours`, `firstResponseAt` |
| Case with no assignee | Missing | `cases.assignee` empty |
| Case reopened or escalated | Missing | `cases.ts` `reopenEscalate` |
| Transaction due in the next 3 business days | Missing (only overdue today) | `computeCached(ctx).tx` |
| Final pay due under the local rule, not processed | Missing (only once overdue) | `transactions.ts` `finalPayByJurisdiction` |
| New hire not entered by day -3 | Missing (a metric only) | metric `onboarding.first90.newHireEntered` |
| Expected return passed with no return recorded | Missing | `services/engine/leave.ts` `upcomingReturns` past the date |
| Statutory deadlines this month by jurisdiction | Missing | `compliance/engine/deadlines.ts` `computeDeadlines` |
| Agent over the queue limit | Missing (lead) | `cases.ts` `teamWorkload` |

**My list:** the open case queue by team and agent (age, SLA state, waiting on; employee relations
as counts only), transactions in flight, upcoming returns (no leave reason), starts in 14 days with
open tasks. `computeCached(ctx)`, `computeUpcoming`.

### 5.7 HRBP, one business unit (all its locations)

Scope: a business-unit lock (`ScopeLock` kind `businessUnit`). "Me" is the HRBP; on the sample
`employees.hrbp` names one HRBP per unit (Silicon Engineering: Michael Thomas, 556 people across 10
sites), so the default "me" is the unit's HRBP.

| Item | Status | Source |
|---|---|---|
| Span outliers, single-report chains, new managers with large teams | Exists (5, 2, 1) | `hrbp:span`, `org:*` |
| Promotion to review | Exists (25; to roll up per unit) | `talent:promotion-overdue` |
| Low upward feedback for a manager (10+ respondents) | Exists (1) | `listening:manager` |
| Exit survey reason at a location (not pay) | Exists | `listening:exit` |
| Stay conversations | Exists, owned by the manager | Waiting on others; HRBP owns it when the manager has left (exists) |
| Regretted exits in the last 30 days, for an exit follow-up with the leader | Missing | `exitsIn` + `regrettable` |
| People findings to raise with a leader (attrition hot spot, first-year attrition) | Missing as items | `hrbpModel(ctx).findings`, one item per finding with the leader as subject |
| Pending exits (termination date ahead) | Missing | `employees.terminationDate` after the as-of date |
| Below range minimum in the unit (ratios only) | Missing for this role | `compModel` ranges, count and compa-ratio, never amounts |
| Critical roles in the unit without a ready successor | Exists, owned by Talent | Waiting on others |
| Open employee relations cases in the unit | Missing | Count only, unit of 5 or more, never a person |
| Org layers deeper than the limit | Missing | `org/engine/flags.ts` `computeFlags` (add a depth flag) |

**My list:** the unit's leaders (directors and above, or every manager of 8 or more): headcount,
voluntary and regretted attrition, open reqs, open items, flags, last promotion rate. For 1:1 prep;
"Copy talking points" (exists on People stats) per leader.

### 5.8 HRBP, one region (every employee in it, across business units)

Scope: a region lock (`ScopeLock` kind `region`: the locations whose `SITES[].region` is the
region). Needs a Region choice in the filter row or the lock alone; region names must match
(Listening says "Asia Pacific", `SITES` says "APAC").

Owner gap: nothing in the data names a regional HRBP. Add a Settings list "HR business partners by
region" (or an employee column `regionalHrbp`); items about people in the region keep their unit
HRBP as owner and list in "Waiting on others", with the regional HRBP as co-owner for site matters.

| Item | Status | Source |
|---|---|---|
| Every HRBP item in 5.7, for people in the region | Exists through the lock | as 5.7 |
| Day-30 readiness low in the region | Exists (1, APAC) | `listening:readiness` |
| Exit survey reason at a site | Exists | `listening:exit` |
| Returns from leave at the region's sites | Exists (HR ops) | Waiting on others |
| Work authorization reverification at the region's sites | Exists (Global mobility) | Waiting on others; never the authorization type |
| Final pay by jurisdiction in the region | Missing | `finalPayByJurisdiction` |
| Statutory deadlines for the region's jurisdictions | Missing | `computeDeadlines` |
| Site attrition above the company | Missing as items | `hrbpModel(ctx).findings` by location |
| Onboarding readiness by site | Missing as items | `computeUpcoming` by location |

**My list:** the region's sites: headcount, attrition, starts in 30 days, open reqs, open cases
(counts), compliance state (reverifications due, I-9 on time).

### 5.9 Manager (exists)

Scope: the manager lock (docs/ROLES.md 4). Items today (Developer preview for Paul Adams, 66
people): 12 in the leader filter, 8 in Manager mode (recruiting, talent, onboarding).

| Item | Status | Source |
|---|---|---|
| Interview decision on my reqs | Exists | Recruiting |
| Probation decision | Exists | Onboarding |
| Required training overdue on my team | Exists | Talent (one item for the team, the year in its date) |
| Stay conversations | Exists | People stats (wording: open question 8.4) |
| Manager welcome before a start | Exists | Onboarding task |
| Day-one contingencies held by People operations | Exists, as "With People ops" | Waiting on others |
| Reviews not submitted for the current cycle | Missing data | A review status or submitted date column |
| My own required training | Missing | `learning` for the manager's ID |
| High performer with no promotion in 3 years, without the flight-risk wording | Missing for this role | `talent/engine/promotion.ts` `computeOverdue`, under Performance (not Retention risk) |

**My list:** my team: name, title, start date, in first 90 days, probation due, overdue courses,
open reqs I own. My team (`#team`) already holds most of this.

### 5.10 HR (the full HR team view)

Scope: whole company or any filter. The Action center as it is, after part 4: every owner group,
the "My team" picker, Copy note, plus a "Mine" picker (any person in the data) and the role's
queues. "Needs attention" on the HR home is the escalations of 5.1 plus anything owned by "me".

### 5.11 Developer

Everything, plus: the item contract checks (every item has `kind`, `uses`, `matter` where
needed, a valid tab), per-view timings, and the roll-up and fingerprint view of each item.

### 5.12 Who sees which kinds (the routing table the matrix test snapshots)

| Kind | CHRO | HR | Comp | Finance | Recruiter | Talent | HR ops | HRBP BU | HRBP region | Manager |
|---|---|---|---|---|---|---|---|---|---|---|
| Recruiting candidate steps | escalations | all | | | mine | | | waiting | waiting | my reqs |
| Empty funnel, req aging | escalations | all | | | mine | | | waiting | waiting | my reqs |
| Day-one tasks | escalations | all | | | waiting | | queues | waiting | waiting | mine |
| Probation decision | | all | | | | | waiting | waiting | waiting | mine |
| I-9, reverification, export license | yes | all | | | | | queues | waiting | waiting | |
| Cases, transactions, returns | escalations | all | comp changes waiting | totals only | | | queues | ER counts | ER counts | |
| Training (roll-up) | | all | | | | by course | | waiting | waiting | my team |
| Promotion review | | all | | | | | | mine | mine | reworded |
| Critical roles | yes | all | | | | mine | | waiting | waiting | in my org |
| Span, chains, new managers | | all | | | | | | mine | mine | |
| Stay conversations | clusters | all | | | | | | waiting | waiting | mine |
| Below minimum, merit exceptions | | all | mine | totals only | | | | ratios | ratios | |
| Listening items | | all | pay reason | | | stay risk | readiness | mine | mine | |
| Cost and plan items | spend | all | spend | mine | | | | | | |

"mine" = Needs attention; "waiting" = Waiting on others; blank = not listed.

---

## 6. Release checklist (each line has a test)

The Action center leaves `NOT_READY` in `src/access/policy.ts` only when every line holds. Tests are
Vitest, node environment, on the sample unless said.

**Correctness and freshness**
- [ ] Every item kind recounts from raw rows to the same ids (`engine/recount.test.ts`, one case per
      kind, like part 3.1).
- [ ] No candidate item on a req On hold, Cancelled, Filled or Closed; none for a rejected, hired or
      withdrawn candidate (`recruiting/engine/actions.test.ts`).
- [ ] No two open items share a `matter`; export license and I-9 fold into the Compliance item
      (`engine/dedupe.test.ts`, with a fixture where both views fire).
- [ ] Every item with legal exposure has `exposure: true` and sorts before every other item
      (`engine/order.test.ts`).
- [ ] A breach's due date is in the past, never the as-of date (`compliance/engine/actions.test.ts`).
- [ ] Every date in `what` or `note` from another year carries the year; `what` never ends with a
      full stop (`engine/wording.test.ts`, scanning every item on the sample).

**Volume**
- [ ] Each role's "Needs attention" on the sample holds 1 to 15 items before "Show all", and every
      item has a due date or a stated reason for none (`engine/roles.test.ts`).
- [ ] Roll-ups replace per-manager training for HR and Talent; below-minimum is one item plus a list
      (`talent`, `comp` action tests).

**Marks**
- [ ] An onboarding item keeps its id across the hire (fixture: the same start before and after the
      employee row exists) (`onboarding/engine/actions.test.ts`).
- [ ] A handled roll-up reopens when its fingerprint changes (`engine/marks.test.ts`).
- [ ] Marks v2 parse v1, drop broken entries, survive a throwing storage; a private item's key is
      hashed (`engine/marks.test.ts`); `census:actions` stays described in `STORAGE_KEYS`.
- [ ] Undo returns focus to the restored item (component test or QA crawl step).

**Roles**
- [ ] `roleItems` per role matches the routing table in 5.12; Finance lists no item with a person
      subject; Recruiter lists no comp, HR ops case, talent risk or survey item
      (`src/access/roleItems.test.ts`).
- [ ] Every role surface has an entry in the access matrix snapshot, `page:actions` is Shown or
      Limited in every role, and the `NOT_READY` list is empty (`src/access/matrix.test.ts`).
- [ ] The business-unit and region locks clamp every entry path like the manager lock
      (`src/access/scopeLock.test.ts`, the entry paths of `managerScope.test.ts`).
- [ ] Ask's `open_items` returns what the role's page lists (`ask/engine/tools.test.ts`).

**Privacy**
- [ ] No item's `what` or `note` holds a currency amount with pay amounts on or off; amounts live
      in `amount` and only render under `pay: true` (`engine/privacy.test.ts`, a pattern scan).
- [ ] Copy note never holds an amount, a case ID, an authorization type or a model score
      (`engine/note.test.ts`).
- [ ] Employee relations: no name, no case ID, left out under 5 people in every role lock
      (extend `sample.test.ts`).
- [ ] Finance rows and items never cover a group under 5 (`comp/engine/cost.test.ts`).
- [ ] Item text never uses `modelRisk` (`talent/engine/actions.test.ts`, a fixture without
      `incumbentRiskOfLoss`).

**Data standard**
- [ ] Workflow items show at every standard with their tier; the count "from data below your
      standard" is right (`engine/collect.test.ts`).

**Performance**
- [ ] Collection runs one view per idle slice; a cold run on the sample stays under 400 ms of work
      per slice and stops on a newer context (`engine/collect.perf.test.ts`, like
      `scorecard/engine/sample.perf.test.ts`).

**Layout and accessibility**
- [ ] On role homes and on the Action center under 768 px, the list comes before the overview
      figures (QA crawl at 375 px: first item within the first two screens).
- [ ] Heading order h1, h2, h3 with no skip; no horizontal scroll at 375 px on `#actions` and `#home` in
      every role mode, with each list picked (QA crawl: `documentElement.scrollWidth` is 375).
- [ ] The tier badge's long sentence is in its tooltip, not read on every figure.

**Help, tours, exports**
- [ ] `view-actions` article and tour back in every role, with per-role steps; Help links to
      `route:actions` restored (`src/help/access.test.ts`).
- [ ] Export list and My list exports carry the role and scope in the meta
      (`src/app/exportMeta.test.ts`).

**Gates:** `npx tsc --noEmit -p .`, `npx biome check src`, `npx vitest run`, `npx vite build`,
`npm run verify`, and the QA crawl's pass per role.

---

## 7. Work in flight that touches this

- **Ask on the screen (docs/ASK-ACTIONS.md):** the doc keeps the Action center Developer mode only;
  `open_items` stays refused outside Developer until the checklist above is done. When roles land,
  `open_items` and `get_screen` follow `roleItems`, and `open_records` on an item ref goes through the
  role lock. Its tool tests must move with the `NOT_READY` change.
- **Job-taxonomy flip (docs/TAXONOMY.md, when it lands):** item text and labels name departments
  and job titles ("Req REQ-4418 Field Applications Engineer II"); Compensation and Finance lists
  group by job and level. Items must read the taxonomy through the same helpers the views use, and
  `matter` keys must use IDs, never labels, so a relabel does not reopen handled items.
- **"Special analyses" sub-tab in People stats (docs/ANALYSES.md, when it lands):** People stats
  items link to tabs by key (`hrbp:span` to `org`, stay conversations to `attrition`). A new or
  renamed tab must keep those keys, and a test should fail when an item's `tab` is not one of its
  view's tabs (today `tabLabel` falls back to null without a sound).
- **The dev server:** while another workflow hot-updated `src/app/App.tsx`, the page went blank
  twice ("useAnalytics must be used inside <AnalyticsProvider>"); a full reload recovered it. Not an
  Action center fault; noted so QA runs reload after a hot update.

---

## 8. Open questions (decisions needed)

1. **Hide or tag below the data standard?** Recommended: workflow items always show, tagged with
   their tier. Today they hide.
2. **Marks shared or personal?** Recommended: personal in this browser, with "by" and an optional
   marks file. A shared store needs a backend Census does not have.
3. **Regional HRBP owner:** a Settings list by region, or a new employee column? Recommended:
   Settings list, so the sample and uploads work without a new column.
4. **Managers and "regretted":** should a manager's stay-conversations item say "exits" instead of
   "regretted exits", since "regretted" is HR's call about named leavers? Recommended: yes.
5. **Comp cycle dates:** add open, calibration, close and effective dates to Settings > Compensation
   cycle, so comp items have due dates? Recommended: yes.
6. **Finance budget data:** add a budget dataset (cost center, period, budget headcount, budget cost)
   or keep Finance to plan and actuals? Recommended: add it as an optional dataset.
7. **CHRO escalation threshold:** Critical and overdue more than 14 days, plus all legal exposure?
   Recommended as the default, kept in the metric dictionary.
