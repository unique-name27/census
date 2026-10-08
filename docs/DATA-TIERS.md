# Data tiers: no data, bronze, silver, gold

Assume the data is messy. Every number in Census carries a tier that says how far its data has
come, and one control decides the lowest tier the dashboard will show.

| Tier | Meaning | How a dataset gets there |
|---|---|---|
| **No data** | The dataset, or a field the number needs, is missing | Nothing loaded, or the field is empty for every row |
| **Bronze: raw** | Loaded as it came in. Mapping is automatic and not reviewed, and values may be defaulted or unrecognized | Any upload, before review |
| **Silver: mapped and validated** | A person confirmed the column mapping, no blocking issues remain, and checks pass | Data room → Review mapping → Confirm, with all blocking checks passed |
| **Gold: confirmed production** | Silver, certified by its data owner for this exact version, reconciled to control totals and fresh | Data room → Certify: name, note, optional control totals; certification ends when the data is replaced |

## The control

A **Data standard** control in the filter row applies to every view:

- **Production (gold):** only gold numbers show. Anything below shows "—" with "Not yet confirmed for production" and a link to the dataset in the Data room. Use this in leadership meetings.
- **Validated (silver and up)**
- **Everything, including raw (bronze and up):** the default, so nothing looks missing while data is being cleaned up. Every number carries its tier badge.

Exports follow the control. Every sheet, slide and chart image states the data standard and each
figure's tier. A figure held back by the standard exports only the reason, never its rows or its
note (notes often carry the hidden numbers), and the folder-tab headlines are gated like any KPI.

A side clause, column or overlay that reads a lower-tier field is left out of the number it sits
beside, with a short "not shown" note, instead of hiding that number: the compa-ratio finding
under Production drops its "named pay as the reason" clause, the 9-box drops its flight-risk
overlay. A number declares only the fields it actually shows.

## How a number gets its tier

Each KPI, figure and finding declares the fields it uses (`uses: ['employees.terminationDate',
'employees.terminationType']`). Its tier is the lowest tier among those fields:

1. **Dataset tier:** none, bronze, silver or gold, as in the table above.
2. **Field tier:** the dataset's tier, capped by the field's own quality.
   - **Silver or better** needs the field filled for at least 95% of the rows it applies to, and no more than 2% of values unrecognized or defaulted.
   - **Below that,** the field is bronze.
   - **Empty in every row,** it is no data.

   For example, voluntary attrition is bronze when termination type is only 60% filled, even if the roster is certified.
   - **Remapped after certification,** a gold field is capped at silver: your reference mappings changed certified rows, so the certified numbers no longer stand as they are until the data owner certifies again.
3. **Fallback:** a number that declares no fields takes the lowest tier of its view's datasets.

The badge explains itself on hover or focus: "Silver: Candidates mapping confirmed 2 Oct by you;
not certified. Stage is 97% filled." When several fields share the lowest tier, it names the one
that explains it best: a capped field first, then the lowest fill, then the most values not
recognized. Near a threshold the share gets one decimal, so 94.6% filled never reads as 95%.
Clicking the badge opens that dataset's Quality panel in the Data room.

Freshness is judged by the latest event date in the rows. Compensation has no event dates, so it
is judged by the date its pay extract was taken (its load date), 45 d at most.

## Data room changes

Each dataset gets a tier badge and four panels:

- **Raw:** the rows exactly as uploaded, with the original headers. Cells that failed conversion or were defaulted are highlighted. The original sheet is kept per dataset version, so you can re-map without uploading again.
- **Mapping:** lineage for every field. It shows source column, conversion (date order, % scale, value corrections), confidence and who confirmed it. **Confirm mapping** records your review.
- **Quality:** each field's fill rate over the rows it applies to, how many values are invalid or defaulted, and its resulting tier. It also lists rule results: references resolve, dates are in order, no duplicates, and the data is fresh. Every number drills to the rows behind it.
- **Certify:**
  - A checklist covering mapping confirmed, no blocking issues, issue rate within 2%, references resolve and freshness.
  - Optional control totals that must reconcile within 0.5%, such as "headcount per the HRIS report is 1,452" or "total base in USD per payroll".
  - Certifier name and note.
  - Certify, or Revoke.
  - History of the last three versions.

The certification is a local attestation, stored in this browser like everything else. It is not
a login.

## Sample data that sucks

The sample company now arrives the way real data does:

| Dataset | Tier | Why |
|---|---|---|
| Employees | Gold | Certified by the HRIS team; headcount reconciles. Termination reason is 72% filled, so exit-reason charts are bronze. |
| Job changes | Silver | Mapping confirmed, not certified |
| Requisitions | Silver | 3% of reqs have no hiring manager ID |
| Candidates | Bronze | Raw ATS export; mapping unconfirmed and 4% of sources unrecognized |
| HR cases | Bronze | Help-desk export; first response missing on 8%, some categories unmapped |
| HR transactions | Silver | |
| Reviews | Gold | Certified after calibration |
| Succession | Bronze | A hand-kept spreadsheet; 13 of 84 named successors (15%) are not in the roster, 14% of its rows |
| Learning | Silver | |
| Compensation | Gold | Reconciles to payroll; market median 60% filled, so the Market tab is bronze |

The messy datasets are generated as raw extracts with foreign headers, odd spellings and gaps.
They run through the real import pipeline when the app loads, so the raw, mapping and quality
panels show real issues. The engine tests keep using the clean sample, so the planted stories
stay testable.

## Build plan

1. **Quality core** in `src/data/quality/`:
   - tier rules, field quality from the loaded rows and the import log, lineage types (`FieldRef`) and `tierOf(uses)`, certification records
   - the store keeps the raw sheet, mapping and versions per dataset in IndexedDB
   - the store holds the `standard` (gold, silver or bronze), and `AnalyticsContext` gets `quality` and `standard`
2. **Shared UI:**
   - `TierBadge` (medal shape plus the word, so tier never relies on color; bronze, silver and gold tokens in both themes)
   - KpiStrip, Figure and Readout gate on the standard, and the Readout says how many findings are hidden and why
   - the drill panel shows the tier of the rows
   - exports stamp the data standard and each figure's tier
3. **Data room:** the Raw, Mapping, Quality and Certify panels, re-mapping from the stored raw sheet, and certification history.
4. **Messy sample:** the raw extract generator for the bronze and silver datasets, plus a "starter" certification state for the gold ones.
5. **Lineage in every view:** each KPI, figure and finding declares `uses`. A test asserts that every declared field exists in the schema and that every figure and KPI declares at least one.
6. **Review:** an independent reviewer per view checks tiers and gating, and a final check runs in light, dark and 375 px.

## Settings (ships in the same wave)

A **Settings** button (gear icon and the word) in the masthead opens one settings sheet. Settings
that are scattered today move into it, so each one has exactly one home:

| Section | What's in it | Moved from |
|---|---|---|
| Display | Theme (System / Light / Dark), text size (Small / Standard / Large / Extra large; scales the whole app), motion (follow system / reduce) | Masthead theme icon (removed) |
| Data | Data standard (Production / Validated / Everything), reporting date (as-of override) | Data room "Reporting date" card (it becomes one read-only line with "Change in Settings") |
| Privacy | Show pay amounts for this session | Compensation header switch (stays there too, as the in-context toggle bound to the same setting) |
| Compensation cycle | Merit budget %, healthy compa-ratio band, merit guideline by rating | Compensation "Cycle settings" popover (its button now opens this section) |
| Related tools | Edit the four tool links | Tools menu "Edit links" (it now opens this section) |
| This device | Export settings to a file, import settings from a file, clear everything Census stored on this device (uploads, mappings, certifications, settings), with a confirm step in the page | New |

Settings persist in this browser, except pay amounts, which last for the session only. The
existing keys migrate: `census:theme`, `census:tools`, `census:comp-cycle-settings`, `census:asOf`.

## Categories & mapping (a new Data room tab, same wave)

The Data room gets two tabs, **Datasets** (what it shows today) and **Categories & mapping**
(`#data.mapping`). The new tab shows how the categories in your data relate to each other, flags
where they disagree, and lets you fix the mapping in one place. Every view then uses the fixed
mapping. Mapping your own categories is part of what makes data silver.

**1. Org structure**
- A two-column mapping diagram, business unit → department, with links weighted by active headcount. A sortable table holds the same rows: business unit, department, headcount, managers, department leader (most senior person), cost centers, sites.
- It also shows location → country → region.
- **Conflicts** are flagged with a status pill and drill to the people:
  - a department that appears under more than one business unit
  - a department with no business unit
  - requisition departments that are not in the roster

**2. Job architecture**
- Job family → job function → job title, with headcount (docs/TAXONOMY.md: a job family is the broad group, such as Silicon Engineering, and contains job functions, such as Design RTL).
- A job function × level matrix (heatmap of headcount) shows each function's level spread.
- **Conflicts:**
  - a job function under several families
  - job functions with no family
  - titles whose level doesn't fit their function's usual range
  - people with no job function
  - job family and job function columns that look swapped (families inside functions)
- **Fields:** `jobFamily` and `jobFunction` on Employees, each with its own header names. A Workday "Job Family Group" column is the job family and its "Job Family" column the job function; "Function" next to "Sub Function" reads the same way. The sample gives every person a family and a function from their department and title (`src/data/sample/jobs.ts`).

**3. Category lists**
- One table per categorical field across the ten datasets:
  - levels, locations
  - case categories → Atlas process → team
  - transaction types → process
  - candidate stages and statuses, sources
  - termination types and reasons (the 12-reason taxonomy), change types
  - learning categories, readiness, potential
- Each table shows the canonical values, counts and shares, the raw spellings that were mapped to each value (from the import logs), and any unrecognized values.

**Editing the mapping (stored in this browser, applied before every metric):**
- **Move** a department to another business unit, or a job function to another family.
- **Merge** two spellings into one value (e.g. "DV" and "Design Verification").
- **Rename** a value.

Each change is listed with who made it and when, can be undone, and can be exported as an Excel
"reference mapping" to send to the HRIS team. Changes show up in the tier explanations, e.g.
"Department remapped by you for 14 rows".

Every count drills to the people or records behind it, every table and diagram sits in a
Figure (with exports), and the mapping layer is a pure function with tests:
`applyReferenceMappings(datasets, mappings)`.
