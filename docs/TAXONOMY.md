# Job taxonomy: job families contain job functions

The user asked for special analyses on People stats. One of them shows engineering resources
across the stages of chip development, and the user named the fields to use: job family
(Silicon Engineering) and job function (Design RTL). In the user's data a **job family is the
broad group** and a **job function is a discipline inside it**.

Census assumes the opposite today. `jobFunction` is the broad level (Engineering, Operations,
Sales & marketing, G&A, Executive, derived from the business unit in the sample) and `jobFamily`
sits under it (Design Verification, FP&A). This plan flips Census to the user's taxonomy
everywhere: what changes and where, the new sample values, header names for HRIS exports, how
saved state moves over, and the tests. It is a plan only; it changes no app code.

The field keys stay `jobFamily` and `jobFunction`. Their meaning, their hierarchy and the sample's
values change. A column headed "Job family" still feeds `jobFamily`, so uploads that already name
the columns the user's way keep working unchanged.

## 1. Before and after

| | Today | After the flip |
|---|---|---|
| Hierarchy | job function → job family → job title | job family → job function → job title |
| `jobFamily` holds | a discipline, e.g. "Design Verification" (in the sample: the department name, or a track's own family such as FP&A) | the broad group, e.g. "Silicon Engineering" |
| `jobFunction` holds | a broad function from the business unit: Engineering, Operations, Sales & marketing, G&A, Executive | the discipline inside the family, e.g. "Design RTL" |
| Official lists | Job functions (no parent), then Job families (parent: job function) | Job families (no parent; Engineering attribute), then Job functions (parent: job family; Chip development stage attribute, see the note in 2.4) |
| Reference mapping | `move-family`: put a job family under a job function (writes `employees.jobFunction`) | `move-function`: put a job function under a job family (writes `employees.jobFamily`); saved `move-family` mappings keep applying as legacy |
| Categories & mapping | function → family → title, family × level heatmap, "family under several functions" | family → function → title, function × level heatmap, "function under several families" |
| Level outliers | a title against its family's other titles | a title against its function's other titles |
| Compensation, Market | grouped by job family, falling back to department | grouped by job function, falling back to department |
| Org chart, Color by | Job function | Job family and Job function |

## 2. Inventory: where Census assumes "function contains family"

Line numbers are as of 7 Oct 2026. Every row says what the code does today and what changes.

### 2.1 Schema (`src/data/schema.ts`)

| Where | Today | Change |
|---|---|---|
| 701-702 | `JOB_FUNCTIONS = ['Engineering', 'Operations', 'Sales & marketing', 'G&A', 'Executive']`, "Job functions, the level above job family" | Remove. Add `JOB_FAMILIES`, the sample's six families in order (section 4), documented as the suggested values for the move form. The functions of each family live in the sample (`src/data/sample/jobs.ts`); a test keeps the two in step. |
| 715-719 | `Employee.jobFamily` (no doc); `jobFunction` doc "Broad function above the job family (Engineering, …)" | `jobFamily`: "Broad group of related jobs (Silicon Engineering). Contains job functions." `jobFunction`: "Discipline within the job family (Design RTL)." |
| 1191-1197 | field `jobFamily`: synonyms `['job family', 'discipline', 'family']`, description "Discipline, e.g. Design verification." | synonyms `['job family', 'family', 'functional area']`, description "Broad group of related jobs, e.g. Silicon Engineering. Each job family contains job functions." |
| 1198-1204 | field `jobFunction`: synonyms `['job function', 'function', 'functional area', 'job function name']`, description "Broad function above the job family, e.g. Engineering or G&A." | synonyms `['job function', 'function', 'job function name', 'discipline']`, description "Discipline within a job family, e.g. Design RTL." |

No other dataset carries either field: Requisitions, Candidates, Hiring plan and Compensation
have none (see Decision needed 1). Field order in `DATASETS` stays family then function, which
now reads top down.

### 2.2 Import (`src/data/import`)

| Where | Today | Change |
|---|---|---|
| `synonyms.ts:21` | `jobFamily: ['job family group', 'job family name']` | Section 5. |
| `automap.ts:344` (`autoMapProfiled`), `:427` (`autoMap`) | One header per field, strongest first. In a Workday file "Job Family" (label match, 1.0) beats "Job Family Group" (synonym, 0.98) for `jobFamily`, so the discipline lands in `jobFamily` and the group column is left unmapped. | Add the pair rule (section 5) after scoring. |
| new, pure | none | `jobLevelsSwapped(rows)`, the swapped check (section 5), shown in `src/views/data/ui/import/ColumnsStep.tsx`. |
| `test-fixtures.ts:13-203` | Fixture rows in the old orientation (`jobFamily: 'Design verification'`, `jobFunction: 'Engineering'`; the CEO row `'Executive'` / `'Executive'`) | Flip to the new values (`'Silicon Engineering'` / `'Design Verification'`; the CEO `'Executive'` / `'Executive Leadership'`). |
| `e2e.test.ts:43-44, 70-71` | Export headers "Job Family Group" (from `jobFamily`) and "Job Function" (from `jobFunction`) | Write the Workday pair, "Job Family Group" (family) and "Job Family" (function), so the pair rule runs end to end and the import still matches the clean roster exactly. |
| `templates.ts` | Column labels, the Fields sheet and dropdowns come from the schema and the official lists | No code change. The Job function dropdown lists every function, not only those of the family chosen in the row; dependent dropdowns are out of scope. |

### 2.3 Sample generator (`src/data/sample`)

**What the two fields hold today.** `jobFamily` comes from `Person.family` and has 44 values:

- the department name by default: `newPerson` sets `family: init.dept` (`model.ts:113`) and
  `assignIcRole` sets `p.family = track.family ?? spec.name` (`titles.ts:78-84`);
- a track's own family on 14 tracks (`departments.ts:352` Procurement, `:410` Sales operations,
  `:489-492` Accounting, FP&A, Tax, Treasury, `:514-527` People operations, Talent acquisition,
  HR business partnering, `:569` Trade compliance, `:595-597` Enterprise applications,
  Information security, EDA and CAD, `:637` Corporate strategy);
- "Executive leadership" for every E-level person (`org.ts:435`, and the 2024 VP leaver at
  `employees.ts:350`);
- hand-set families for the Executive Office (`org.ts:209-246`: Corporate strategy, Executive
  administration, Communications) and the People team (`org.ts:248-340`: People operations,
  Payroll, Benefits, HRIS, Global mobility, Employee relations, Learning and development, Total
  rewards, Talent acquisition, HR business partnering);
- the department name for interns (`employees.ts:720-723`).

`employeeRows` writes it at `employees.ts:1143`.

`jobFunction` comes from `withJobFunction` (`raw/jobFunction.ts:9-27`, called at `index.ts:67`),
which maps the business unit: Silicon Engineering and Systems & Software to Engineering,
Operations to Operations, Go-to-Market to Sales & marketing, Corporate to G&A, Executive Office to
Executive. Pre-hires take the department's most common family and the business unit's function
(`prehires.ts:60-61`).

**Other readers of the old values.**

- `comp.ts:115-121, 291`: `marketFactor` hashes `${family}|${level}`, so every market median
  depends on today's family strings.
- `onboarding.ts:33, 67, 210, 283`: `SCREENED_FUNCTIONS = {'Engineering', 'Operations'}`, looked up
  through `jobFunctionOf(businessUnit)`, decides who gets export screening tasks.
- `raw/index.ts:8` re-exports `FUNCTION_BY_UNIT`, `jobFunctionOf`, `withJobFunction`.
- `README.md:42, 307-312` describe `jobFunction` from the business unit.

The new assignment is specified in section 4.

### 2.4 Official lists (`src/data/lists`, Settings > Official lists)

**Superseded by docs/ANALYSES.md 4.2 and 4.3.** The Job functions attribute is `stage`, labelled "Chip development stage": a
choice from `CHIP_STAGES` (eleven stages), not a "Stage order" number. Census proposes a stage from
keywords while it is blank. The Job families list has an `engineering` attribute (Yes or No) that
says which families Engineering by stage counts. Where this table says Stage order, read Chip
development stage. Numbers saved before the change read as that stage's position, so 1 to 8 keep
their meaning.

| Where | Today | Change |
|---|---|---|
| `types.ts:11-12` | `ListId` lists `jobFunction` before `jobFamily` | Swap the order (cosmetic). |
| `defs.ts:58-68` | `jobFunction`: no parent, no attributes, about "The broad functions above job families, such as Engineering or G&A." | Moves after `jobFamily`. `parent: 'jobFamily'`, `attrs: [{ key: 'stage', label: 'Stage order', type: 'number' }]`, about "Each job function sits under one job family. Stage order places engineering functions in the chip development flow." |
| `defs.ts:69-80` | `jobFamily`: `parent: 'jobFunction'`, about "Each job family sits under one job function." | No parent. About "The broad groups of related jobs, such as Silicon Engineering. Each contains job functions." |
| `seed.ts:5-7` | comment "a family's function" | "a job function's family". |
| `seed.ts:87` | `PARENT_FIELD.jobFamily = { employees: 'jobFunction' }` | `PARENT_FIELD.jobFunction = { employees: 'jobFamily' }`. |
| `seed.ts:202-209` | `ownLists` order `jobFunction, jobFamily` | `jobFamily, jobFunction`. |
| `seed.ts:220-280` | `sampleListValues` builds both lists from the data | Unchanged, plus: the sample's Job functions get `attrs.stage` from `src/data/sample/jobs.ts`. Every sample function has exactly one family, so every function gets a parent. |
| `effective.ts:244-263` | `officialParentMaps` returns `{ department, jobFamily }` | `{ department, jobFunction }`. |
| `analyze.ts:105-112` | comment "job family → job function" | "job function → job family". |
| `persist.ts:13, 156, 193, 212` | `LISTS_STORE_VERSION = 1`; load, file section, file import | Version 2 and the migration in section 6.1. |
| `edit.ts:588-594` | `canUndo` checks only for later changes to the same lists | Also false for an entry with no steps (the migration entry). |
| `workbook.ts:52, 148-156, 272, 289, 381-387` | The parent column is named after the parent list ("Job function" on the Job families sheet) | Generic; it follows the defs ("Job family" column on the Job functions sheet, with the JobFamilies dropdown, and a Stage order column). Add the old-layout check in section 6.3. |
| `src/app/settings/lists/ValueEditor.tsx:138-152, 291-305` | Moving a `jobFamily` value offers "Move its rows in the data too" through a `move-family` mapping | The same for `jobFunction` values through `move-function`. |
| `src/app/settings/lists/ListPanel.tsx` | Rebuild from data adds missing values; nothing fills blank parents | Add "Fill parents from the data" on any list with a parent: for each value with no parent, the parent most of its rows name (the `Tally.majority` rule), applied as one logged change of `move` edits. Needed after the migration (section 6.1). |

### 2.5 Reference mappings and Categories & mapping

Engine (`src/data/reference`):

| Where | Today | Change |
|---|---|---|
| `types.ts:26-33, 50, 57` | `MoveFamily { kind: 'move-family', jobFamily, from: function \| null, to: function }` | Add `MoveFunction { kind: 'move-function', jobFunction, from: family \| null, to: family }`. Keep `MoveFamily` in `ReferenceMapping` as a legacy kind; drop it from `NewReferenceMapping` so it can't be created. |
| `apply.ts:26-29` | validation "Choose a job family." / "Choose a job function." / "The job family is already under that function." | For `move-function`: "Choose a job function." / "Choose a job family." / "The job function is already under that family." Legacy kind: valid as saved. |
| `apply.ts:52-53` | `targetRefs` → `['employees.jobFunction']` | `move-function` → `['employees.jobFamily']`; legacy unchanged. |
| `apply.ts:116-120` | rows with `jobFamily === m.jobFamily` (and `jobFunction === from`) get `jobFunction = to` | `move-function`: rows with `jobFunction === m.jobFunction` (and `jobFamily === from`) get `jobFamily = to`. Legacy case kept as is, so saved data corrections still apply. |
| `describe.ts:17-20` | "Moved job family X from A to B." / "Put job family X under B." | "Moved job function X from A to B." / "Put job function X under B." Legacy: "Set the job function of job family X rows to B." |
| `state.ts:82-90` | `addMapping` case `move-family` | Case `move-function`. |
| `categories.ts:65-68` | comment on `JOB_FUNCTIONS`; `jobFunction` listed before `jobFamily` | Comment on `JOB_FAMILIES`; `jobFamily` first. Both stay open (`vocab: null`). |
| `infer.ts:3, 83-123, 156-160` | `FunctionEdge`, `FamilyConflict`, `TitleEdge`, `FamilyLevelCell`, `LevelOutlier`; report fields `functions`, `familiesUnderSeveralFunctions`, `familyLevels`, `peopleWithoutFamily` | `JobEdge { jobFamily, jobFunction }` (report field `jobs`), `FunctionConflict { jobFunction, families }` (`functionsUnderSeveralFamilies`), `FunctionLevelCell { jobFamily, jobFunction, level }` (`functionLevels`), `LevelOutlier.jobFunction`, `peopleWithoutFunction`, and a new `swapped` (section 5). |
| `infer.ts:224-262` | `findLevelOutliers` compares a title with its family's other titles | Compare within the job function (the discipline has the ladder). |
| `infer.ts:381-479` | builds function → family → title | Builds family → function → title; conflicts per function. |
| `index.ts:19-20` | exports `FamilyConflict`, `FamilyLevelCell` | Export the renamed types. |

Mapping view (`src/views/data/mapping`):

| Where | Today | Change |
|---|---|---|
| `engine/conflicts.ts:15-20, 25` | kinds `family-several-functions`, `family-no-function`, `people-no-family`, `family-official-function`; fix `move-family` | `function-several-families`, `function-no-family`, `people-no-function`, `function-official-family`, new `job-levels-swapped`; fix `move-function`. Conflict ids are not saved anywhere, so renaming them needs no migration. |
| `engine/conflicts.ts:203-280` | "X appears under 2 job functions: …", "2 job families have no job function (6 people).", "N people have no job family.", "Title (Family) sits at L6, outside the family's usual L2 to L4." | "Design RTL appears under 2 job families: …" (fix: put it all under the family with most people); "2 job functions have no job family (6 people)." (fix: assign a family); "N people have no job function. Fix it in the source system and upload again." (only when some rows have a function; with no function column at all the section shows "No job function column in Employees" instead); "RTL Design Engineer (Design RTL) sits at L6, outside the function's usual L2 to L4." |
| `engine/conflicts.ts:293-297, 330-347, 367` | `OfficialParents.jobFamily`; "X sits under F for n people; its official job function is G." | `OfficialParents.jobFunction`; "Design RTL sits under Corporate for n people; its official job family is Silicon Engineering." |
| `engine/structure.ts:17-18, 24, 402-569` | `BLANK.jobFunction` / `BLANK.jobFamily`; `familyOrder`; `jobDiagram` columns `['Job function', 'Job family']`, focus `['Job function', 'Job family', 'Job title']` | `functionOrder` (functions under their main family, families largest first); columns `['Job family', 'Job function']`; with a focused function `['Job family', 'Job function', 'Job title']`. |
| `engine/structure.ts:580-676` | `familyRows`, `titleRows`, `familyLevelCells` (job family × level) | `jobRows` (family, function, headcount, status), `titleRows`, `functionLevelCells` (job function × level, rows in diagram order). |
| `engine/edit.ts:2, 18, 22, 34, 46, 57-58, 84, 114-140` | `EditKind 'move-family'` "Assign a job family"; `Draft.jobFamily`; `options.functions` from `JOB_FUNCTIONS` plus the data; `options.families` placements | `'move-function'` "Assign a job function"; `Draft.jobFunction`; `options.families` from `JOB_FAMILIES` plus the data; `options.functions` placements under families. |
| `engine/workbook.ts:21, 54, 70-71, 113-119, 180-182, 199, 217-218, 245-246` | kind label "Move job family", subject "Department or job family", field "Employees: Job function"; reads `movefamily`, `movejobfamily`, `assignjobfamily` | "Move job function", "Department or job function", "Employees: Job family"; reads `movefunction`, `movejobfunction`, `assignjobfunction`. Legacy rows export as "Set job function (before job families held functions)" and are refused on import (section 6.4). |
| `engine/drills.ts:22-23, 59-60` | job columns: Job function, Job family | Job family, Job function. |
| `engine/lists.ts:48` | categories `[…, 'jobFunction', 'jobFamily', …]` | `[…, 'jobFamily', 'jobFunction', …]`. |
| `engine/diagram.ts:3`, `ui/MappingDiagram.tsx:3`, `MappingTab.tsx:3` | comments "function → job family → title" | "job family → job function → title". |
| `ui/model.ts:23-24, 42-44, 78, 90-92` | `familyRows`, `familyLevelCells`, `officialParentMaps` | Renamed builders. |
| `ui/JobSection.tsx:2, 19-21, 29-30, 51-191` | definition "Job function: The broad area above the job family: Engineering, Operations, Sales & marketing, G&A or Executive, or your own."; picker "Show the titles of a job family"; titles "Job functions and families", "Job family by level"; dek "A family should sit under one function" | Definitions: "Job family: The broad group of related jobs, such as Silicon Engineering. It contains job functions." and "Job function: A discipline inside one job family, such as Design RTL." Picker "Show the titles of a job function"; titles "Job families and functions", "Job function by level"; dek "A function should sit under one family, and its titles within its usual levels." |
| `ui/EditPanel.tsx:2, 30, 34, 135-137, 327-390, 525-526` | "Put a job family under a job function, in Employees." | "Put a job function under a job family, in Employees." Fields: Job function (hint "Now under …"), then Job family (choose or type). |
| `ui/EditSection.tsx:123-131, 249-250, 297, 301` | export sheet "Job functions", "Job families by function, after the changes"; uses; empty text "assign a job family to a function" | Sheet "Job families", "Job functions by family, after the changes"; uses flipped; "assign a job function to a family". Legacy mappings in the change list carry a tag "Made before job families held job functions" with Remove. |
| `ui/ConflictList.tsx:101, 110, 117-118` | `move-family` fix; "now sit under the official job function" | `move-function`; "now sit under the official job family". |
| `MappingTab.tsx:42, 57` | Job architecture card "n job families, n titles" | "n job families, n job functions". |

### 2.6 Quality rules and vocabularies

- Neither field has a vocabulary: no `values` in the schema, and `categories.ts` gives both
  `vocab: null` (open values). Only the official lists check them, through the list refs
  `employees.jobFamily` and `employees.jobFunction`: a value not on the list counts as not
  recognized and caps the field at bronze. The rule is unchanged; the lists change (2.4).
- No quality rule reads either field. `src/data/quality/core.test.ts:51-59` pins the synonym
  lists; `src/data/quality/test-fixtures.ts:29-30` uses the old orientation.
- `src/views/data/engine/qualityTable.test.ts:56-69` uses `jobFunction` only as an example field,
  and `src/charts/__gallery__/Tiers.tsx:19` ("Employees had no column for job function") still
  reads right. Neither changes.
- New: the swapped check (section 5) as an import hint and as a Categories & mapping conflict.

### 2.7 Filters, drills, exports

- **Filters.** Neither field is a filter dimension (`src/data/scope.ts:127-142`); the address,
  saved views and saved filters never name them. No change here (Decision needed 2).
- **Drills.** The employee records panel shows neither field (`src/drill/records.ts:107-125`,
  row builder `:129-150`). Add Job family and Job function after Job title, shown only when a
  row in the list has one (the `MANAGER_COLUMNS` pattern), so the new analyses drill to people
  with both visible. The person card (`src/drill/PersonCard.tsx:85-89`) adds "Design RTL ·
  Silicon Engineering" under the title when present.
- **Filter to this.** Family and function are not filters, so numbers grouped by them set no
  `DrillSpec.filter` (`src/views/comp/engine/groupFilter.ts:5, 12` already says this for job
  family; the same holds for job function).
- **Exports.** Every export that names the fields is listed in its own section: Compensation
  columns (2.10), the org table (2.8), the Categories & mapping sheet and reference mapping
  workbook (2.5), the Official lists workbook (2.4) and the templates (2.2).

### 2.8 Org chart (`src/views/org`)

| Where | Today | Change |
|---|---|---|
| `engine/colorBy.ts:2, 12, 17, 61, 66` | `ColorBy` includes `'jobFunction'` ("Job function"), `NO_JOB_FUNCTION` | Add `'jobFamily'` ("Job family", `NO_JOB_FAMILY`) before `'jobFunction'`. Six families fit the eight slots; functions (38 in the sample) fold into Other past eight, as the color rule says. |
| `engine/uses.ts:49` | `COLOR_USES.jobFunction` | Add `jobFamily: ['employees.jobFamily']`. |
| `engine/rows.ts:19, 37, 57` | org table columns Business unit, Job function, Department | Business unit, Department, Job family, Job function. |
| `ui/state.ts:40` | saved prefs keep a valid `colorBy` | Unchanged; a saved `'jobFunction'` stays valid (section 6.7). |

### 2.9 People stats, Talent, Recruiting, Hiring plan

No engine, figure or metric in `src/views/hrbp`, `talent`, `recruiting` or `onboarding` (which
holds the hiring plan) reads `jobFamily` or `jobFunction` today, so there is nothing to flip
there. The new Special analyses sub-tab of People stats is the first People stats reader;
section 7 gives it the contract. Requisitions, Candidates and the Hiring plan have no family or
function field (Decision needed 1).

### 2.10 Compensation (`src/views/comp`)

Market groups people by job family today. After the flip a family is as broad as Silicon
Engineering, which no market survey prices. Market moves to **job function**, falling back to
department (not family: a department is close to a function in size, a family is not).

| Where | Today | Change |
|---|---|---|
| `engine/population.ts:29-30, 80-81, 140-159, 201` | `jobFamily: e.jobFamily \|\| e.department`, `has.jobFamily` | `job: e.jobFunction \|\| e.department`, `has.jobFunction`. |
| `engine/model.ts:188, 301-302` | `byFamily`, `familyChart` | `byJob`, `jobChart`. |
| `engine/market.ts:107-127` | job family × level cells | job function × level cells. |
| `engine/charts.ts:6, 236-268, 431` | "one dot per job family", `familyMarketPosition`, `familyPositionDrill` | One dot per job function; `jobMarketPosition`, `jobPositionDrill`. |
| `engine/findings.ts:603-611` | below market per family; id `comp-below-market-${group}` | Per function; same id pattern (section 6.8). |
| `engine/lineage.ts:4, 64-66, 104, 123, 150-154` | `familyUses` = `employees.jobFamily` (when present) and department | `jobUses` = `employees.jobFunction` (when present) and department. |
| `engine/definitions.ts:41, 118, 204` | figure `comp-market-by-family`; "The job family chart ranks families of n or more people" | Figure `comp-market-by-function` (not in the access matrix snapshot, so no snapshot update); "The job function chart ranks functions of n or more people". |
| `engine/rules.ts:32-33, 80, 114` | `marketGap.minFamily` | `marketGap.minFunction`. |
| `metrics.ts:671-690` | param `minFamily` "Smallest job family ranked"; `jobWatch` "Job family and level pairs …" | Param `minFunction` "Smallest job function ranked" (saved values carried over, section 6.5); "Job function and level pairs …". |
| `metrics.ts:711-726` | `comp.market.belowMarket` "A job family whose median market ratio …", population "Only job families ranked on the job family chart", uses `employees.jobFamily` | "A job function whose …", "Only job functions ranked on the job function chart", uses `employees.jobFunction`. |
| `columns.ts:185-189` | `MARKET_BY_FAMILY`, `JOBS_COLUMNS` "Job family" | `MARKET_BY_FUNCTION`, "Job function". |
| `tabs/Market.tsx:2, 58-94, 130-136, 182-188` | "Is it pay or the range? Job families against the market", "Gap to market by job family", "The job family and level pairs furthest below market." | "Job functions against the market", "Gap to market by job function", "The job function and level pairs furthest below market." |
| `engine/test-fixtures.ts:26` | `jobFamily: null` | Add `jobFunction: null`. |

The planted Market story holds: Analog & Mixed-Signal keeps its name as a function and its
people, and the sample keeps every market median (section 4.3).

### 2.11 Ask (`src/ask`)

Another workflow is editing `src/ask` now. Make these changes after it lands.

- `engine/allowlist.ts:15-16` (comment) and `:369-401`: the `org.*` fields add only
  `org.jobFunction`. Add `org.jobFamily` ("Job family of the person") before it, through the same
  employee join.
- `engine/privacy.ts:629-630` adds both fields' values to the category names Ask knows are not
  people. Unchanged.
- `query_records` already allows both as categorical fields (`docs/ASK.md:105`). Unchanged.

### 2.12 Help and docs

- `src/help/articles/data.ts:133`: "Job architecture: function to job family to job title, and a
  job family by level matrix." becomes "job family to job function to job title, and a job
  function by level matrix."
- `data.ts:136`: "a family under several functions, titles outside their family's usual levels
  and people with no family" becomes "a job function under several families, titles outside
  their function's usual levels and people with no job function".
- `data.ts:141`: "or a job family to another function" becomes "or a job function to another
  family".
- `data.ts:171-172, 181`: list order "job families, job functions"; add one paragraph: "A job
  family is the broad group, such as Silicon Engineering, and holds job functions, such as
  Design RTL. Each job function names its family. Stage order places engineering functions in
  the chip development flow, and the special analyses on People stats read it."
- `src/help/articles/views.ts:663`: "by job family" becomes "by job function".
- Docs: `docs/DATA-TIERS.md:141-148, 161` (job architecture and the "new field" note),
  `docs/SETTINGS-LISTS.md:33-34` (list table), `docs/CHARTS.md:176-179` (the pay or range scatter),
  `docs/VIEWS.md:803, 823` (Compensation finding and Market figure), `src/data/sample/README.md`
  (section 4.4).

## 3. The new hierarchy

1. A **job family** is the broad group of related jobs (Silicon Engineering). A **job function**
   is a discipline inside one family (Design RTL). A job title sits under a function.
2. Each function belongs to one family. The official Job functions list holds that family as
   the function's parent. In the data, a function whose rows name more than one family is a
   conflict, fixed with a `move-function` mapping or at the source.
3. A person carries both. When a row has a function and no family, Census groups it under the
   function's official family (`ctx.jobs.familyOf`, section 7) and never writes that back into
   the row. When a row has a family and no function, the function reads "No job function".
4. Level ladders and market pricing belong to the function: the level outlier check and
   Compensation Market group by function. Broad cuts (the pyramid by family, colors on the org
   chart) use the family.
5. Business unit and department are org structure, not job taxonomy, and a family is not derived
   from them. In the sample, Post-Silicon Validation engineers sit in the Systems Validation
   department (Systems & Software business unit) and in the Silicon Engineering family.
6. **Stage order** is an optional number on each job function: 1 is the first stage of chip
   development; blank means the function is not a development stage. It is an attribute of the
   official list, so a company sets its own order in Settings and in the Official lists
   workbook. The sample sets it on Silicon Engineering's eight functions.
   **Superseded by docs/ANALYSES.md 4.2 and 4.3.** The attribute is a chip development stage chosen from `CHIP_STAGES`,
   proposed from keywords while blank. The sample saves stages on the functions of Silicon
   Engineering and Systems & Software Engineering, on the product, test and quality functions of
   Product & Test Operations, and on EDA & CAD Infrastructure (Corporate), and leaves Packaging
   proposed. One stage per function: static timing and physical verification are titles in the
   Physical Design function, so they count in Physical design, signal integrity counts with
   Hardware Engineering in Post-silicon validation, and Signoff and tape-out holds Packaging.
7. Neither field is a protected characteristic or a proxy for one, so no privacy rule changes.
   Every rate or count by family or function follows `MIN_GROUP`: groups under 5 are hidden or
   fold into "Other (k)".

## 4. Sample values

Departments and business units stay exactly as they are. Every sample person, current and former,
employees, contractors, interns and pre-hires, gets a family and a function from their department
and job title.

### 4.1 Families and functions

Six families, 38 functions. Active headcount counts employees active on 30 Sep 2026 (contractors,
interns and pre-hires left out). The counts come from running the rules below on today's
generator; pin them in `jobs.test.ts` once implemented.

| Job family (active) | Job function | Stage | Who (department: titles) | Active |
|---|---|---|---|---|
| Silicon Engineering (585) | Architecture | 1 | Architecture: all | 44 |
| | Design RTL | 2 | Digital Design: all (RTL, ASIC, Digital IP, Low Power Design engineers, managers, directors, interns) | 128 |
| | Analog & Mixed-Signal | 3 | Analog & Mixed-Signal: all | 70 |
| | Design Verification | 4 | Design Verification: all (incl. Formal Verification, Emulation) | 149 |
| | DFT | 5 | DFT: all (incl. Memory BIST) | 50 |
| | Physical Design | 6 | Physical Design: all (incl. STA, Physical Verification) | 111 |
| | Packaging | 7 | Hardware Engineering: Package Design Engineer | 11 |
| | Post-Silicon Validation | 8 | Systems Validation: Post-Silicon Validation Engineer | 22 |
| Systems & Software Engineering (301) | Hardware Engineering | | Hardware Engineering: everyone else (Hardware, Signal Integrity, Board Design engineers, managers, directors, interns) | 44 |
| | Firmware | | Firmware: all (incl. Embedded Software, Security Firmware) | 90 |
| | Software | | Software: all (incl. Driver, Compiler, SDK, Software Tools) | 120 |
| | Systems Validation | | Systems Validation: everyone else (incl. Validation Automation, managers, directors) | 47 |
| Product & Test Operations (167) | Product Engineering | | Test & Product Engineering: everyone else (Product, Yield engineers, managers, directors, interns) | 53 |
| | Test Engineering | | Test & Product Engineering: Test Engineer, Test Technician | 37 |
| | Quality & Reliability | | Quality & Reliability: all | 34 |
| | Supply Chain | | Supply Chain: everyone else (planners, logistics, managers, director) | 22 |
| | Procurement | | Supply Chain: Procurement Specialist | 11 |
| | Foundry Operations | | Supply Chain: Foundry Operations Engineer | 10 |
| Go-to-Market (180) | Sales | | Sales: everyone else | 71 |
| | Sales Operations | | Sales: Sales Operations Analyst | 13 |
| | Field Applications | | Field Applications: all (incl. Customer Program Manager) | 63 |
| | Product Marketing | | Product Marketing: all (incl. Technical Marketing, Marketing Communications) | 33 |
| Corporate (197) | Accounting | | Finance: everyone else (accountants, Finance Manager, Director, Accounting) | 21 |
| | FP&A | | Finance: Financial Analyst, Director, FP&A | 19 |
| | Tax & Treasury | | Finance: Tax, Treasury analysts, Director, Tax & Treasury | 8 |
| | Talent Acquisition | | People: recruiters, coordinators, TA managers, Director, Talent Acquisition | 16 |
| | HR Business Partnering | | People: HR business partners, Director, HR Business Partners, Employee Relations Partner | 8 |
| | People Operations | | People: everyone else (HR operations, payroll, benefits, HRIS, global mobility, leave, People Operations managers and director) | 15 |
| | Total Rewards | | People: compensation and equity, Total Rewards Manager | 4 |
| | Learning & Development | | People: Learning and Development Partner | 2 |
| | Legal | | Legal: all (incl. paralegals, contracts, Trade Compliance) | 19 |
| | Information Technology | | IT: everyone else (support, systems administration, enterprise applications, managers, directors) | 34 |
| | Information Security | | IT: Security Engineer | 7 |
| | EDA & CAD Infrastructure | | IT: CAD Infrastructure Engineer | 8 |
| | Facilities | | Facilities: all (incl. EHS, lab operations, workplace) | 30 |
| | Strategy & Communications | | Executive Office: everyone else (Chief of Staff, strategy, Communications Lead) | 4 |
| | Executive Administration | | Executive Office: Executive Business Partner | 2 |
| Executive (20) | Executive Leadership | | Every E1-E3 person, whatever the department (CEO, C-suite, SVPs, VPs) | 20 |

Total 1,450 active employees, the sample's headcount. For comparison, the Silicon Engineering
business unit has 556: the family adds Packaging and Post-Silicon Validation (33) from Systems &
Software and leaves out the four Silicon Engineering executives.

Names follow the user's examples, in title case like the departments. Two spellings are
deliberate calls: "Analog & Mixed-Signal" matches the department and the industry form (the
Compensation market story keys on it), and "Post-Silicon Validation" matches the job title.

Small groups are kept on purpose: Total Rewards (4), Learning & Development (2), Strategy &
Communications (4) and Executive Administration (2) are under the anonymity minimum, so
breakdowns hide them or fold them into Other, as with real small teams. Every Silicon
Engineering function has at least 11, so the stage view hides none.

### 4.2 Assignment rule

A new module `src/data/sample/jobs.ts` holds the sample's job architecture and one rule:

```ts
/** Families in order, each with its functions in order; stage on Silicon Engineering's only. */
export const JOB_ARCHITECTURE: readonly { family: string; functions: readonly { name: string; stage?: number }[] }[]
export const FAMILY_OF_FUNCTION: ReadonlyMap<string, string>
/** The family and function for a person: E1-E3 are Executive Leadership; otherwise the first
 *  title rule of the department that matches, else the department's own function. */
export function sampleJob(department: string, jobTitle: string, level: Level | null): { jobFamily: string; jobFunction: string }
/** Rows with jobFamily and jobFunction set right after jobTitle (the column order the roster has today). */
export function withJobs(rows: readonly Employee[]): Employee[]
```

Department rules (title patterns are matched as substrings, so "Senior …", "Lead …" and
"(Contract)" titles follow their track):

| Department | Title contains | Function | Otherwise |
|---|---|---|---|
| Systems Validation | Post-Silicon Validation | Post-Silicon Validation | Systems Validation |
| Hardware Engineering | Package Design | Packaging | Hardware Engineering |
| Test & Product Engineering | Test Engineer, Test Technician | Test Engineering | Product Engineering |
| Supply Chain | Procurement / Foundry Operations | Procurement / Foundry Operations | Supply Chain |
| Sales | Sales Operations | Sales Operations | Sales |
| Finance | Financial Analyst, FP&A / Tax, Treasury | FP&A / Tax & Treasury | Accounting |
| People | Recruit, Talent Acquisition / HR Business Partner, Employee Relations / Compensation, Total Rewards, Equity / Learning | Talent Acquisition / HR Business Partnering / Total Rewards / Learning & Development | People Operations |
| IT | Security Engineer / CAD | Information Security / EDA & CAD Infrastructure | Information Technology |
| Executive Office | Executive Business Partner | Executive Administration | Strategy & Communications |
| Digital Design | | | Design RTL |
| Any other department | | | the function of the same name |

Changes in the generator:

- `index.ts:31, 67`: `withJobFunction(employeeRows(world))` becomes `withJobs(employeeRows(world))`.
- `employees.ts:1143`: `employeeRows` stops writing `jobFamily` from the person; `withJobs` sets both.
- `raw/jobFunction.ts`: deleted; `raw/index.ts:8` drops its exports.
- `prehires.ts:13, 60-61`: `sampleJob(req.department, req.jobTitle, req.level)` instead of the
  department's most common family and the unit's function. The 25 pre-hires land in their title's
  function (Software 4, Field Applications 3, Firmware 3, and so on).
- `onboarding.ts:33, 67, 210, 283`: `SCREENED_FUNCTIONS` by function becomes
  `SCREENED_UNITS = new Set([SE, SS, OPS])` checked against `businessUnit`. Same people as today,
  so every onboarding story holds.

### 4.3 What stays the same on purpose

`Person.family` becomes `Person.marketKey` (and `Track.family` becomes `Track.marketKey`) with
the same values, assigned in the same places (`model.ts:53, 113`, `titles.ts:82`,
`employees.ts:350, 722`, `org.ts:219-341, 435`, `departments.ts:23` and the 14 tracks). Its only
reader is `comp.ts:116-121, 291`. It is the seed of the market spread, not a job family any
more, and keeping its strings keeps every `marketP50` and so every Compensation number where it
is. The doc comment says so.

Departments, business units, cost centers, titles, levels, managers, hire and exit dates and every
other dataset are untouched. The only sample rows that change are the two fields on Employees.

### 4.4 Sample README

Replace the `raw/` table note (`README.md:42`) and the paragraph at `:307-312` with a "Job
architecture" section: the table in 4.1 without the Who column, the rule in one paragraph, the
note that Packaging and Post-Silicon Validation sit outside the Silicon Engineering business
unit, and the stage order.

## 5. Header names for HRIS exports

The names a column carries, and where Census puts it:

| Export | Column | Census field |
|---|---|---|
| Workday | Job Family Group | `jobFamily` |
| Workday | Job Family, Job Family Name | `jobFunction` when the file also has a Job Family Group column; otherwise `jobFamily` |
| Workday | Job Profile | `jobTitle` (already a synonym) |
| SuccessFactors Employee Central | Job Family | `jobFamily` |
| SuccessFactors Employee Central | Job Function | `jobFunction` |
| SuccessFactors Job Profile Builder | Family, Role | `jobFamily`, `jobTitle` (both already synonyms) |
| Greenhouse | custom job fields "Job Family", "Job Function" | Only on job and requisition exports, which have no such fields in Census (Decision needed 1). Employees never come from Greenhouse. |
| Darwinbox and others | Function with Sub Function (or Job Sub Function) | `jobFamily` and `jobFunction` |
| Any | Discipline | `jobFunction` |
| Any | Functional Area | `jobFamily` |
| Any | Job Category, Job Classification | not mapped (they group jobs by type of work or pay rules, not by family) |

**Synonym lists.** Schema (2.1): `jobFamily` `['job family', 'family', 'functional area']`;
`jobFunction` `['job function', 'function', 'job function name', 'discipline']`.
`EXTRA_SYNONYMS.employees` (`synonyms.ts:21`): `jobFamily: ['job family group', 'job family
group name', 'family group', 'job family name']`, `jobFunction: ['sub function', 'job sub
function', 'sub-function']`.

**Pair rule** (`resolveJobPair` in `automap.ts`, run on the auto-mapping after scoring, never on
a mapping the person chose or a saved profile):

1. When one header is a family-group name ("Job Family Group", "Job Family Group Name", "Family
   Group") and another is "Job Family" or "Job Family Name", and no header maps to `jobFunction`
   with high confidence: the group column goes to `jobFamily` and the "Job Family" column to
   `jobFunction`, both high. Reason lines: "Workday names the broad group Job Family Group" and
   "Next to Job Family Group, Job Family is the job function".
2. When one header is "Function" or "Job Function" and another is a sub-function name: the
   function column goes to `jobFamily` and the sub function to `jobFunction`. Reason: "Next to
   Sub Function, Function is the broad group".

**Swapped check** (`jobLevelsSwapped(rows)`, pure, in `src/data/import`). Over rows with both
fields filled, at least 20 of them: F distinct families, N distinct functions; `familyNest` is the
share of rows whose function is the most common function of their family; `functionNest` is the
share whose family is the most common family of their function. The columns look swapped when
F > N, `familyNest` ≥ 0.9 and `functionNest` < 0.75: families sit inside functions. The user's
data (6 families, 38 functions, each function in one family) never trips it; a file where "Job
Family" holds disciplines and "Job Function" holds Engineering or G&A does.

- In the import columns step: "These two columns look swapped. In Census a job family contains
  job functions, but here 34 job families sit inside 5 job functions." with a Swap button that
  exchanges the two fields' headers in the mapping before anything is imported.
- In Categories & mapping (`job-levels-swapped`, info, no fix button): the same sentence, then
  "Upload Employees again and swap the two columns in the mapping step."

## 6. Saved state

### 6.1 Official lists in this browser (`census:lists`, `src/data/lists/persist.ts`)

`LISTS_STORE_VERSION` goes to 2. `loadLists` runs `migrateListsV1` on a saved state with no
version or version 1, then saves it at once so it runs once:

- **Saved from the sample** (`basis: 'sample'`): the saved `jobFamily` and `jobFunction` lists
  hold the old sample's values, which no longer match it. Both are dropped; they fall back to the
  new sample's official lists (or to lists proposed from your data).
- **Built from your data or a file** (`basis: 'data'` or `'file'`): each list checks the same
  field as before (the field keys did not change), so its values stay where they are. `jobFamily`
  values lose their parent (the list has none now). `jobFunction` values get `parent: null`
  (version 1 had no parent there). "Fill parents from the data" (2.4) then proposes each
  function's family from the rows. The old parents are not inverted: "most rows of family F name
  function P" says nothing about which family most rows of P name.
- **Drafts and "keep checking" flags** (`draft`, `always`) stay as saved.
- **Change log**: one entry is added at the top: what "Job families now contain job functions.
  The saved job family and job function lists were moved to match.", lists `['jobFamily',
  'jobFunction']`, no steps. Because it is a later change to those lists, `canUndo` already
  refuses every earlier change to them (their steps assume the old shape). The entry itself can't
  be undone either: `canUndo` returns false for an entry with no steps (2.4).

### 6.2 Settings file

`SETTINGS_FILE_VERSION` stays 1: each section carries its own version. `importListsSection`
(`persist.ts:212`) runs the same migration on a lists section below version 2 before comparing.
When it drops lists saved from the sample, the summary says so: "The file's job family and job
function lists were copied from the old sample company, so they were left out." Files written
from now on carry lists version 2.

### 6.3 Official lists workbook exported before the change

The old layout has a "Job families" sheet with a "Job function" column and a "Job functions"
sheet with none. On import, that layout skips both sheets and the preview says: "This workbook
was saved before job families contained job functions. Its Job families and Job functions sheets
were left out; export a new workbook to edit them." Every other sheet imports as usual. The
defined names `JobFamilies` and `JobFunctions` keep their names.

### 6.4 Reference mappings (`census:reference`, IndexedDB)

Saved `move-family` mappings are data corrections someone made, so they are never dropped or
rewritten. They keep applying exactly as saved (the transform names fields, and the fields kept
their keys). They show in the change list with the legacy description (2.5) and the tag "Made
before job families held job functions", and can be removed or undone like any mapping. New ones
can't be made. On the sample they match no rows (no sample family is called Digital Design any
more) and count 0 rows changed. In a reference mapping workbook, rows of kind "Move job family"
are refused on import with "Made before job families held job functions; not imported."

### 6.5 Metric dictionary (`census:metrics` and the settings file's metrics section)

- Add `{ from: { metricId: 'comp.market.gap', key: 'minFamily' }, to: { metricId:
  'comp.market.gap', key: 'minFunction' } }` to `MOVED_SETTINGS` (`src/metrics/moved.ts:22`).
  `moveSettings` already handles a key that moved within one metric, for saved overrides and
  settings files alike.
- Your own wording (definition, formula, population) is never rewritten, even where it says "job
  family". It keeps its "Changed from default" mark, and Metric definitions shows the new default
  beside it.
- Change log entries that name `params.minFamily` stay as history.

### 6.6 Column mapping profiles and learned names (`census:profile:`, `census:synonyms:`)

Both map header names to field keys, which kept their names, so they stay. One case gets help: a
profile saved from a Workday file before the change maps "Job Family" to `jobFamily` and leaves
"Job Family Group" unmapped. When a saved profile does exactly that, the columns step applies
the pair rule and marks both columns as changed suggestions, so the person confirms the new
mapping once and the profile is saved again.

### 6.7 Org chart preferences (`census:org:prefs`)

A saved `colorBy: 'jobFunction'` stays valid and now colors by discipline. No migration.

### 6.8 Action center marks (`census:actions`)

Compensation's below-market finding ids follow the group (`comp-below-market-${group}`). Marks
on old family names that are no longer groups stop matching and drop out; Analog & Mixed-Signal
keeps its id and its marks.

### 6.9 Everything else

Uploaded datasets (`census:dataset:*`) are never rewritten: values stay as uploaded and only their
meaning changes. Saved views, filters and the address never name the fields. The sample is built
in memory on every load, so nothing cached holds the old sample values.

## 7. What the special analyses can rely on

- **Field meanings** as in section 3.
- **`ctx.jobs`**, a new, additive field on `AnalyticsContext` (`src/data/context.tsx`, a lead
  contract), built by a pure `jobArchitecture(lists, employees)` in `src/data/lists/jobs.ts` and
  memoized on the lists like `officialParentMaps`:

  ```ts
  interface JobArchitecture {
    /** Families by active headcount; each family's functions by stage order, then the rest by active headcount. */
    families: readonly { name: string; functions: readonly { name: string; stage: number | null }[] }[]
    /** The official family of a function, else the family most of its rows name, else null. */
    familyOf(jobFunction: string): string | null
    /** Superseded (ANALYSES 4.3): the position, 1 to 11, of the function's chip development stage. */
    stageOf(jobFunction: string): number | null
    /** Where the shape came from: the official lists, or the data alone. */
    source: 'official' | 'data'
  }
  ```

  `buildContext` fills it, so engine tests get it from the sample.
- **Engineering resources by stage** reads the family Silicon Engineering by default. Make the
  family a setting of the analysis' metric rather than a constant, so a company whose engineering
  family has another name can point it there.
  **Superseded by docs/ANALYSES.md 4.2 and 4.3.** Which families count is the Job families list's Engineering attribute
  (saved, else proposed from the family name), not a metric setting. `ctx.jobs` also has
  `stageFor(fn)` (the saved or proposed stage), `engineeringOf(family)` and
  `engineeringPlace(e)`.
- **Drills**: neither field is a filter, so figures grouped by family or function set no
  `filter`; every count drills to the people, who show both fields (2.7).
- **Uses**: `employees.jobFamily` and `employees.jobFunction`, with tiers, like any field.

## 8. Test plan

Each item names the test file and what it checks.

**Schema and import**

- `src/data/quality/core.test.ts:51-59`: the two synonym lists as in section 5; `jobFamily` has
  neither "function" nor "discipline"; `jobFunction` has no "family" word.
- `src/data/import/automap.test.ts`: Workday "Job Family Group" + "Job Family" maps group to
  family and family to function; "Job Family" + "Job Function" maps by name; "Job Family" alone
  maps to family; "Function" + "Sub Function" maps to family and function; "Discipline" maps to
  function; a chosen mapping and a saved profile are not overridden by the pair rule.
- New `src/data/import/swap.test.ts`: `jobLevelsSwapped` is false on the new sample and true on
  the same rows with the two fields exchanged; false under 20 rows; false for one-to-one data.
- `src/data/import/e2e.test.ts`: the Workday-style export imports to exactly the clean roster
  with nothing unmapped; `test-fixtures.ts` in the new orientation.

**Sample**

- New `src/data/sample/jobs.test.ts`: every employee row (all types, leavers and pre-hires) has
  both fields; every function is on `JOB_ARCHITECTURE` under the row's family; `JOB_FAMILIES` in
  the schema equals the architecture's families; the active headcount per family and function
  equals section 4.1; every E1-E3 person is Executive Leadership and nobody else is; Packaging
  people are all Package Design Engineers in Hardware Engineering; Post-Silicon Validation people
  are all in Systems Validation; at least one family differs from the person's business unit;
  every Silicon Engineering function has 5 or more active employees.
- `src/data/sample/raw/raw.test.ts:4, 25, 190-197`: replace "job function comes from the business
  unit" with "every person's function sits in their family", and both fields are gold.
- `src/data/sample/sample.test.ts` and `raw/stories.test.ts`: unchanged and passing (every planted
  story holds). Add one guard: the sum and count of `comp.marketP50`, captured before the change,
  are unchanged after it (4.3).
- Onboarding engine tests: unchanged and passing (screening by business unit).

**Official lists**

- `src/data/lists/lists.test.ts:41-90, 328, 479-529`: the sample's Job functions carry their
  family as parent (Design RTL under Silicon Engineering, stage 2; Packaging stage 7, superseded:
  stages are chip development stage keys, and Packaging is left proposed); Job
  families have no parent; the "Executive leadership has no parent" check is replaced; renaming a
  family renames the parent on its functions; deleting a family still used as a parent is refused.
- `src/data/lists/sample.test.ts:46, 101-102`: both refs are checked; nothing in the sample is off
  the two lists; every tier is unchanged with the lists on.
- `src/data/lists/workbook.test.ts`: Job families sheet comes before Job functions; Job functions
  has a Job family column with the JobFamilies dropdown and a Stage order column; round trip
  keeps parents and stages; an old-layout workbook skips both sheets with the message in 6.3.
- New `src/data/lists/migrate.test.ts`: a version 1 state with sample-based lists drops them; with
  data-based lists keeps the values, without family parents and with blank function parents; adds
  one migration entry that can't be undone; earlier entries on those lists can't be undone, others
  still can; a version 2 state is left alone; a version 1 settings file section migrates the same
  way and its summary says what was left out.
- `src/app/settings/lists/listModel.test.ts`: "Fill parents from the data" proposes the majority
  family and nothing where no family has over half the rows.

**Reference mappings and Categories & mapping**

- `src/data/reference/reference.test.ts:19-33, 98-109, 196-199, 250-330`: `move-function` writes
  `employees.jobFamily`; validation messages; descriptions; a legacy `move-family` mapping still
  applies and describes; the structure report flags a function under several families, finds
  level outliers within a function, and reports `swapped`.
- `src/data/store.test.ts:210-212`: `addReferenceMapping` with `move-function`; a legacy kind is
  refused.
- `src/views/data/mapping/engine/test-company.ts:34-54` in the new orientation, then
  `conflicts.test.ts:94-112`, `official.test.ts:21-30, 78-87`, `structure.test.ts:121-160`,
  `edit.test.ts:4, 43, 49, 172-178`, `workbook.test.ts:27, 69, 105` (and a refused legacy row),
  `lists.test.ts:62`, `drills.test.ts` for the flipped texts, columns and fixes.

**Views**

- `src/views/org/engine/misc.test.ts:54-72`: color by job family, largest first, "No job family"
  grouped; `jobFunction` still a valid option. `lineage.test.ts:188-267`: the job family gate and
  uses. Org table columns in order.
- `src/views/comp/engine/*.test.ts` (`charts.test.ts:172-215, 340, 401-404`, `drill.test.ts:206`,
  `filterTo.test.ts:4, 211-243`, `lineage.test.ts:20, 97-102`, `metrics.test.ts:389`,
  `market.test.ts`): grouping by job function with department fallback; no filter on a function
  group; uses name `employees.jobFunction`; the Analog & Mixed-Signal story still found.
- `src/metrics/moved.test.ts`: a saved `minFamily` arrives as `minFunction`; a saved `minFunction`
  wins over it.
- `src/drill/records.test.ts`: Job family and Job function columns show when a row has them and
  not otherwise.
- New `src/data/lists/jobs.test.ts`: `jobArchitecture` on the sample (Silicon Engineering's
  functions in stage order, `familyOf('Design RTL')`, `source: 'official'`) and on data without
  lists (`source: 'data'`, majority family).
- Ask, after its workflow lands: `org.jobFamily` is in the allowlist for datasets joined to
  employees.

**Whole app**

- `npx tsc --noEmit -p .`, `npx vitest run`, `npx biome check src`, `npm run build`.
- The access matrix snapshot should not change; if it does, read the diff before updating it.
- In the app (`npm run dev` on a free port): Settings > Official lists shows Job families then Job
  functions with parents and stage order; Data room > Categories & mapping draws family →
  function → title with no conflicts on the sample; an upload of a Workday-style roster maps the
  pair correctly and a swapped file shows the hint; Org chart colors by job family; Compensation >
  Market reads by job function; a browser with version 1 lists saved migrates once with the log
  entry.

## 9. Order of work

1. Schema, import synonyms, the pair rule and the swapped check, with their tests.
2. Sample: `jobs.ts`, generator changes, README, sample tests (capture the `marketP50` guard
   values before touching the generator).
3. Official lists: defs, seed, migration, workbook, `canUndo`, Fill parents from the data.
4. Reference mappings and Categories & mapping, engine then UI.
5. Compensation, Org chart, drill columns, Help and docs.
6. `ctx.jobs` for the special analyses.
7. Ask, once the Ask workflow has landed.

Run `npx tsc --noEmit -p .` and the touched folders' tests after each step; the type changes in
steps 3 and 4 ripple, so steps 1 to 5 land as one change.

## 10. Calls made, and what is open

Calls made in this plan:

- Field keys keep their names; meanings and hierarchy flip. No dataset rows are rewritten.
- Six sample families, including Executive for E1-E3, so VPs who lead several functions are not
  forced into one; the stage view counts the people doing the work and their managers.
- Stage order is an attribute of the Job functions list, so a company sets its own flow. It became
  one `stage` attribute holding a chip development stage from `CHIP_STAGES` (docs/ANALYSES.md 4.2);
  numbers saved before the change read as stage positions, so there is never a second attribute.
- Compensation Market moves to job function, falling back to department.
- Saved lists copied from the old sample are dropped; lists built from your data keep their
  values; parents are proposed again from the data, never inverted.
- Saved `move-family` mappings keep applying as legacy and can't be created.
- The comp market seed keeps the old family strings, so no Compensation number moves.
- Onboarding export screening keys on business unit directly, so no onboarding number moves.

Decision needed: should Requisitions and the Hiring plan gain Job family and Job function
fields? They would let the engineering view show open roles and planned hires by stage, and let
Workday Recruiting and Greenhouse job exports map their "Job Family" and "Job Function" columns.
It adds two fields to two datasets, their templates and the sample's recruiting extracts.
Recommendation: not in this change; the special analyses count people only.

Decision needed: should job family and job function become filter dimensions (filter bar, address,
saved views, "Filter to this")? It would let a leader scope every view to Silicon Engineering. It
touches `Filters`, `urlScope`, saved views and Manager mode's lock. Recommendation: not in this
change.
