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

Exports follow the control. Every sheet and slide states the data standard and each figure's tier.

## How a number gets its tier

Each KPI, figure and finding declares the fields it uses (`uses: ['employees.terminationDate',
'employees.terminationType']`). Its tier is the lowest tier among those fields:

1. **Dataset tier:** none, bronze, silver or gold, as in the table above.
2. **Field tier:** the dataset's tier, capped by the field's own quality.
   - **Silver or better** needs the field filled for at least 95% of the rows it applies to, and no more than 2% of values unrecognized or defaulted.
   - **Below that,** the field is bronze.
   - **Empty in every row,** it is no data.

   For example, voluntary attrition is bronze when termination type is only 60% filled, even if the roster is certified.
3. **Fallback:** a number that declares no fields takes the lowest tier of its view's datasets.

The badge explains itself on hover or focus: "Silver: Candidates mapping confirmed 2 Oct by you;
not certified. Stage is 97% filled." Clicking the badge opens that dataset's Quality panel in the
Data room.

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
| Candidates | Bronze | Raw ATS export; stage names unconfirmed and 4% unrecognized |
| HR cases | Bronze | Help-desk export; first response missing on 8%, some categories unmapped |
| HR transactions | Silver | |
| Reviews | Gold | Certified after calibration |
| Succession | Bronze | A hand-kept spreadsheet; 15% of successors are not in the roster |
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
