# Metric definitions and data quality

Two requests:
1. "The metric definitions should be included in this and be able to be modified."
2. "There also needs to be a way to see the data quality underlying the dashboard."

## 1. Metric dictionary

Every metric Census shows has one entry in a registry (`src/metrics/`). That entry is the single
source of truth for:
- its wording on screen: the KPI info popover, the Figure "Definitions" datasheet and readout tooltips
- the settings the engines calculate with
- the dictionary page

### What an entry holds

| Field | Example (Voluntary attrition) |
|---|---|
| id | `hrbp.attrition.voluntary` |
| name | Voluntary attrition |
| views | People stats; also used in Compensation and Talent findings |
| definition | Employees who resigned in the window, as a share of average headcount, annualized. |
| formula | voluntary exits ÷ average headcount × (12 ÷ window months) |
| population | Employees only; contractors and interns excluded. Average headcount = mean of month-end snapshots. |
| window | The period picker (default last 12 months) |
| unit, good direction | %, down |
| target | (optional) e.g. ≤ 8% |
| data used | the `uses` lineage: `employees.hireDate`, `employees.terminationDate`, `employees.terminationType`, `employees.employmentType` |
| owner | People analytics |
| settings | the parameters the calculation reads (below) |
| current tier | from the quality index |

### What can be changed

- **Wording:** definition, formula note, population note and owner. Your text replaces the default everywhere it appears.
- **Targets:** any metric can take a target. Targets drive the status pills, the Scorecard later on, and readout thresholds where a finding compares against a target.
- **Calculation settings:** a curated set of parameters the engines read through `ctx.metrics.param(id, key)` instead of constants. Each one is typed, with a sensible minimum and maximum. For example:
  - **People stats:**
    - count contractors in headcount (off)
    - annualize turnover rates (on)
    - first-year window (365 days)
    - what counts as regretted (voluntary and flagged regrettable)
    - materiality floor for coloring changes
  - **Recruiting:**
    - aging multipliers for "lacks a next step" (1.5× / 2.5× the stage norm)
    - decision wait (2 / 5 days) and offer wait (5 / 10 days)
    - time to fill ends at offer accepted or at start date
    - empty-funnel age (30 days)
  - **HR ops:**
    - response and resolution targets by case category (from the schema defaults)
    - SLA target (90%) and transactions on-time target (98%), kept as those metrics' own targets (the Target field), which the status marks and readout are calculated with
    - backlog age threshold (14 days)
  - **Talent:**
    - high performer = rating ≥ 4 (the Org chart exit simulation reads it too)
    - rating guideline distribution
    - flight-risk band cut-offs (top 10% / next 25%)
    - required training target (95%)
  - **Compensation:**
    - healthy compa-ratio band (0.90-1.10)
    - merit budget (3.5%)
    - merit guideline by rating
    - compression minimum group size

    These move here from Settings > Compensation cycle, so each one has one home; that Settings section and the comp header button now open this dictionary filtered to Compensation.
  - **Org chart:** span outliers (1 and 12+), new manager window (12 months), deep chain (7 layers). People stats reads these here rather than keeping its own copies.
  - **Data quality rules:**
    - silver fill threshold (95%)
    - allowed problem rate (2%)
    - control-total tolerance (0.5%)
    - freshness limits by dataset
- **Locked:** the anonymity minimum (5) can be raised, never lowered. The privacy rules (no protected fields, pay amounts opt-in) cannot be edited.

**Every change:**
- applies to all views immediately (numbers recompute)
- is listed in a change log (what, old value → new value, when, and by whom when a name is set)
- can be undone or reset to the default
- is stamped on exports, e.g. "Definitions changed from defaults: 3 (see Metric definitions)"
- is kept in this browser like the other settings, and travels with the settings file

### The dictionary page

A new Data room tab, **Metric definitions** (`#data.metrics`):
- a searchable, filterable list of every metric, by view, by tier, by "changed from default" and by "has a target"
- each metric opens a detail panel: definition, formula, population, window, data used (each field with its tier and fill rate), settings with their defaults, target, owner, the change log, and where the metric appears (links to each view)
- the whole dictionary exports to Excel as "Metric dictionary": one row per metric and a sheet of settings. A dictionary edited in Excel can be imported back, validated field by field.

Every KPI info popover and Figure definitions panel gets an **"Edit definition"** link that opens this
page at that metric.

## 2. Seeing the data quality under the dashboard

Three layers, from quick glance to full detail:

1. **On every number:**
   - the tier badge (already there) explains itself on hover
   - KPI tiles and figure footers gain a quiet quality line when the quality lens is on (see below), e.g. "1,410 of 1,450 rows used · termination type 92% filled · Silver"
   - rows a metric had to leave out (blank or unrecognized values) are countable, and the count drills to those rows
2. **The quality lens:** a "Show data quality" switch in the view header, remembered per browser. When on, every KPI, figure and finding shows:
   - its tier and the field limiting it
   - rows used vs rows left out, and what was excluded

   The view header also shows a strip of the datasets this view uses with their tiers. Off by default, so the dashboard stays clean for meetings.

   A changed definition is the exception: every KPI, figure and finding whose metric differs from its defaults carries a quiet "Definition changed" mark, lens on or off, just as exports always carry the "Definitions changed" stamp. A number calculated differently from the standard one should never reach a meeting unmarked.
3. **The Data quality tab** (`#data.quality`, new in the Data room): the quality story for the whole dashboard.
   - **Dataset × tier summary:** each dataset's tier, version, mapping status, certification, freshness and issue rate.
   - **Field quality matrix:** datasets × their fields as a heatmap of fill rate. Cells drill to the blank or invalid rows.
   - **Metric impact:** every metric with its current tier and the field limiting it, sorted by how many metrics a single fix would raise. For example, "Filling Termination reason for 141 leavers would lift 6 metrics to Gold."
   - **Checks:** every rule result across datasets (references, duplicates, dates in order, freshness, control totals), each drillable.
   - **Trend:** tier and issue rate per dataset version (the version history).
   - **Export:** the whole tab exports as a "Data quality report" workbook.

## Build plan

1. **Metric registry core:**
   - `src/metrics/`: types, the registry API, parameter definitions with validation, overrides, change log and persistence (`census:metrics`)
   - `ctx.metrics` in the analytics context
   - Excel export/import of the dictionary, with tests
   - the Settings > Compensation cycle values migrate into metric settings
2. **Per view:** register every metric the view shows (wording from today's definitions), move today's constants and thresholds into parameters read from `ctx.metrics`, and link KPIs, figures and findings to metric ids, so popovers read the registry. Tests: every KPI and figure maps to a registered metric, every parameter is read through the registry, and changing a parameter changes the number.
3. **Shared UI:**
   - the Metric definitions tab, "Edit definition" links, the quality lens, the view header dataset strip and the export stamps
   - the Data quality tab, with the metric impact ranking computed from lineage × field quality
4. **Review:**
   - an independent reviewer recomputes several metrics after changing their settings
   - the data quality tab is checked against raw rows
   - regression across all views
