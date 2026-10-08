# Settings: formula index and official lists

The user asked: "in settings, make an index for all formula's and metric calculations and also add
a data validation list you can see the full list of official orgs, departments, functions, etc."

Settings gains two sections. The sheet already has Display, Data, Privacy, Compensation cycle,
Related tools and This device; the two new sections go after Data.

## 1. Formulas (an index of every calculation)

A read-only, searchable index of every registered metric, built from the metric registry
(`ctx.metrics.list`, so it always matches what the app computes, including edits):

- **Grouped by view** (Scorecard, Recruiting, Onboarding, People stats, Org chart, HR ops, Talent, Compensation, Compliance, Listening), then by tab. Rules (privacy, data quality) get their own group.
- **Each row:**
  - metric name, formula (e.g. "voluntary exits ÷ average headcount × (12 ÷ window months)"), population and window
  - unit, target, and the settings it uses with their current values
  - the fields it reads (with tiers), and a "Changed from default" mark when edited
  - **Open in Metric definitions** to edit it
- **Search** over names, formulas, fields and settings, e.g. "headcount", "terminationDate", "SLA". Filters: by view, changed only, has a target.
- **Export:** the whole index as an Excel "Formula index" workbook and as CSV. Copy one formula as text.

Editing stays in one place, the Metric definitions tab. This section is the index, with a link to it.

## 2. Official lists (data validation)

The approved values Census validates data against, one list per category, with their hierarchy:

| List | Values carry | Parent |
|---|---|---|
| Business units | name, code, owner (optional) | none |
| Departments | name, code, cost center(s) | business unit |
| Job families | name, engineering (Yes or No; blank: proposed from the name) | none |
| Job functions | name, chip development stage (a choice from Chip development stages; blank: proposed from keywords) | job family |
| Levels | code (L1-L6, M1-M2, E1-E3), label, track | none (fixed codes, labels editable) |
| Locations | site, country, region, jurisdiction, currency | none |
| Cost centers | code, name | department |
| Case categories | name, Atlas process, team, response/resolution targets | none |
| Candidate sources | name, source type | none |
| Termination reasons | the 12-reason voluntary taxonomy and the involuntary reasons | type |
| Leave reasons, learning categories, survey programs | name | none |
| Universities | name (proposed from your data; other spellings are mapped to the name, or kept as retired values pointing at it) | none |
| Degree levels | the five levels (Associate, Bachelor's, Master's, PhD, Other), label | none (fixed, labels editable) |
| Fields of study | name; Census starts with ten (Electrical Engineering to Business, and Other) | none |
| Offer decline reasons | name, theme (Competition, Pay, Role, Logistics, Process, Personal, Other) | none; checks nothing, because Rejection reason also holds why candidates were turned down |
| Chip development stages | the eleven stages in lifecycle order, label, phase | none (fixed order, labels editable) |

The engineering attribute and the stage are read by Engineering by stage (People stats, Special
analyses): a person counts when their job function has a saved stage, or their job family is
engineering (then a blank stage is proposed from keywords on the function's name and commonest
title, and shows as Proposed until someone saves it). The theme is read by Offer declines. A stage
order number saved before the stage became a choice reads as the stage in that position.

**Starting point:**
- The lists start from the schema vocabularies and, for orgs and jobs, from the current data (the sample company's structure).
- "Rebuild from data" proposes additions found in the loaded data and lets you accept each one.
- A list proposed from your data checks nothing until "Make official"; changes to it are kept as a draft until then.
- A saved list checks the kind of data it was built for (one saved from the sample's list checks the sample; one built from your data or a file checks yours). With the other kind loaded it reads as proposed until you choose "Keep checking against this list" or rebuild it.

**Editing** (kept in this browser; part of the settings file):
- add, rename, retire (never hard-delete a value still used in data) and move under another parent
- every change is logged and can be undone
- **Import / export** as an Excel "Official lists" workbook: one sheet per list, plus hidden named ranges, so the same workbook feeds Excel data-validation dropdowns.
- The Data room templates use these lists for their dropdowns.

**Validation, wired into the quality layer:**
- For business unit, department, job function, job family, location, cost center, case category, source and termination reason, a value that is not on the official list counts as **not recognized**. It shows in field quality and caps the field at bronze, per the tier rules.
- Each list shows **"In data, not on the list"**: values with row counts (which drill to the rows) and a one-click **Map to…** that creates a reference mapping (the Categories & mapping tab), or **Add to list**.
- Each list shows **"On the list, not in data"** (informational).
- A department under a business unit other than its official parent is a conflict, shown in Categories & mapping.

The Categories & mapping tab links here for the official lists and keeps its role: showing how the
data relates and fixing the data's spellings.
