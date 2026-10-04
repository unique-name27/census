/** Help articles, Your data: loading files, mapping, tiers, certifying and checking quality. */
import type { HelpArticle } from '../types'

export const DATA_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'data-loading',
    group: 'data',
    title: 'Loading files',
    summary: 'Replace the sample with your own exports, one dataset at a time.',
    keywords: [
      'upload',
      'import',
      'excel',
      'csv',
      'xlsx',
      'file',
      'workbook',
      'template',
      'replace',
      'hris',
      'ats',
      'export',
    ],
    route: { view: 'data' },
    tour: 'own-data',
    body: [
      {
        p: 'Census reads fifteen datasets: Employees, Job changes, Requisitions, Candidates, HR cases, HR transactions, Performance reviews, Succession plans, Learning, Compensation, Hiring plan, Onboarding tasks, Right to work, Survey responses and Survey items. The last five are optional. You can replace any one with your own export; the others keep running on the sample.',
      },
      { h: 'Add files' },
      {
        ol: [
          'Open the [Data room](route:data) from the masthead.',
          'Drop one or more files on "Replace the sample with your exports", or use Choose files. Census reads .xlsx, .xls, .csv and .tsv files, with any number of sheets.',
          'Each sheet is matched to a dataset by its columns. Check the match, change it, or skip the sheet.',
          'Columns: check which of your columns feeds each field. Required fields are marked. [Fixing the mapping](article:data-mapping)',
          'Values: if some values are not recognized (a stage or a level spelled your way), pick what each one means.',
          'Check and apply: see how many rows come in, are skipped or are defaulted, and the issues found. Download the issues as CSV if you want to fix them at the source. Apply replaces the dataset.',
        ],
      },
      {
        p: 'Nothing changes until you apply a sheet. Census remembers your column choices for each file layout and applies them the next time a file with the same columns arrives, with a note.',
      },
      { h: 'Templates and the sample' },
      {
        ul: [
          'Download blank template: an empty workbook with the expected columns for every dataset.',
          'Download sample workbook: the sample company as a workbook, to see what good data looks like.',
          'Each dataset row has its own Upload button, a download of its current rows or a blank template, and a reset to the sample.',
          'Reset everything to sample removes your uploads (it asks first). Saved column choices are kept.',
        ],
      },
      {
        note: 'Files you add stay in this browser. Census reads them on this device and never sends them anywhere. Columns for protected characteristics and free-text comments are dropped as the file is read. [What stays in the browser](article:privacy-browser)',
      },
    ],
  },
  {
    id: 'data-mapping',
    group: 'data',
    title: 'Fixing the mapping',
    summary: 'Check which of your columns feeds each field, confirm it, and re-map without uploading again.',
    keywords: [
      'mapping',
      'columns',
      'headers',
      'fields',
      'confirm mapping',
      're-map',
      'remap',
      'unrecognized',
      'defaulted',
      'date format',
    ],
    route: { view: 'data' },
    tour: 'own-data',
    body: [
      {
        p: 'When a file comes in, Census guesses which column feeds each field from its header and its values, with a confidence for each guess. A guess is a starting point, not a review.',
      },
      { h: 'During the upload' },
      {
        ul: [
          'Pick a different column for any field, or leave an optional field empty.',
          'Tell Census how to read dates (month first or day first) and percentages (fractions or whole numbers) when the file is ambiguous.',
          'Map unrecognized values to the right category. Rows with values Census cannot place are counted, never guessed.',
        ],
      },
      { h: 'After the upload' },
      {
        p: 'Open the dataset in the Datasets tab and go to its Mapping panel. It shows the lineage of every field: the source column, the conversion applied, the confidence and who confirmed it.',
      },
      {
        ul: [
          'Confirm mapping records that a person reviewed it. With no blocking issues, that is what makes the dataset silver.',
          'Re-map opens the mapping step again on the original sheet, which Census keeps for each version, so you do not need to upload again.',
          'The Raw panel shows the rows exactly as uploaded, with cells that failed conversion or were defaulted highlighted.',
        ],
      },
      {
        p: 'Spellings that differ across systems, such as "DV" and "Design Verification", are fixed once in [Categories & mapping](article:data-categories).',
      },
    ],
  },
  {
    id: 'data-categories',
    group: 'data',
    title: 'Categories & mapping',
    summary:
      'See how org units, jobs and category lists relate, find where they disagree, and fix them in one place.',
    keywords: [
      'categories',
      'reference',
      'business unit',
      'department',
      'job family',
      'job function',
      'merge',
      'rename',
      'move',
      'conflicts',
      'spellings',
    ],
    route: { view: 'data', tab: 'mapping' },
    body: [
      {
        p: 'The [Categories & mapping](route:data.mapping) tab in the Data room shows how the categories in your data relate to each other and lets you fix them. Every view then uses the fixed categories.',
      },
      { h: 'What it shows' },
      {
        ul: [
          'Org structure: business unit to department, weighted by headcount, and location to country to region.',
          'Job architecture: function to job family to job title, and a job family by level matrix.',
          'Category lists: every categorical field across the datasets, with counts, the raw spellings mapped to each value and any values not recognized.',
          "Conflicts, with a status pill and a drill to the people: a department under more than one business unit, a department with no business unit, requisition departments missing from the roster, a family under several functions, titles outside their family's usual levels and people with no family.",
        ],
      },
      { h: 'Fixing a category' },
      {
        ul: [
          'Move a department to another business unit, or a job family to another function.',
          'Merge two spellings into one value.',
          'Rename a value.',
        ],
      },
      {
        p: 'Each change is listed with who made it and when, can be undone, and can be exported as an Excel reference mapping to send to the HRIS team. Changes are kept in this browser and applied before every metric. Tier explanations mention them, for example "Department remapped by you for 14 rows".',
      },
      {
        note: 'Remapping rows of a certified dataset caps it at silver until its data owner certifies again.',
      },
      {
        p: 'The approved values themselves, and the official business unit of each department, are kept in [Official lists](article:data-official-lists). A department under a business unit other than its official one shows as a conflict here, with a one-click move.',
      },
    ],
  },
  {
    id: 'data-official-lists',
    group: 'data',
    title: 'Official lists',
    summary:
      'The approved business units, departments, functions, sites, cost centers and other values Census checks your data against.',
    keywords: [
      'official lists',
      'data validation',
      'approved values',
      'picklist',
      'dropdown',
      'business units',
      'departments',
      'job functions',
      'job families',
      'cost centers',
      'locations',
      'retire',
      'make official',
      'not on the list',
    ],
    body: [
      {
        p: "[Settings, Official lists](settings:lists) holds one list per category: business units, departments, job functions, job families, levels, locations, cost centers, case categories, candidate sources, termination reasons, leave reasons, learning categories and survey programs. Each value carries its parent (a department its business unit, a cost center its department) and its details, such as a site's country, region and currency.",
      },
      { h: 'Official or proposed' },
      {
        ul: [
          'On the sample, every list is official and built from the sample company.',
          'When you load your own data, each of your lists is proposed from it and checks nothing until you choose Make official. Changes to a proposed list are kept, and it stays proposed until then.',
          'A list you saved stays as you saved it, and checks the kind of data it was built for: one saved while the sample was loaded checks the sample, and one built from your data or a file checks yours. With the other kind loaded it reads as proposed and checks nothing, until you choose Keep checking against this list or rebuild it.',
          'Rebuild from data offers the values your data has that the list does not.',
        ],
      },
      { h: 'What a list checks' },
      {
        p: 'A value in the data that is not on an official list counts as not recognized for its field, which can hold the field at bronze. Each list shows the values in the data that are not on it, with the rows behind each: Map to… merges them into a value on the list through [Categories & mapping](article:data-categories), and Add to list accepts them. Values on the list that no row uses are listed too.',
      },
      { h: 'Changing a list' },
      {
        ul: [
          'Add, rename, move under another parent and change details. A rename or a move can carry the rows in your data along.',
          'Retire a value instead of deleting it: older rows that use it are still recognized, but it leaves the template dropdowns.',
          'Every change is listed with who made it and when, and can be undone.',
        ],
      },
      {
        p: 'Export the lists as an Official lists workbook, edit it in Excel and import it again: Census shows what will change before applying it. Its hidden Lists sheet names each list (for example Departments) so it can feed Excel dropdowns, and the Data room templates offer the same values in theirs.',
      },
    ],
  },
  {
    id: 'data-tiers',
    group: 'data',
    title: 'Data tiers',
    summary: "No data, bronze, silver and gold: how far a number's data has come, and the data standard.",
    keywords: [
      'tier',
      'tiers',
      'bronze',
      'silver',
      'gold',
      'no data',
      'data standard',
      'production',
      'validated',
      'everything',
      'badge',
      'trust',
      'quality',
    ],
    tour: 'quality-definitions',
    metrics: [
      'quality.rules.fill',
      'quality.rules.problemRate',
      'quality.rules.controlTolerance',
      'quality.rules.freshness',
    ],
    body: [
      {
        p: 'Assume data is messy. Every number in Census carries a tier that says how far its data has come:',
      },
      {
        ul: [
          'No data: the dataset, or a field the number needs, is missing.',
          'Bronze: loaded as it came in. The mapping is automatic and not reviewed, and some values may be defaulted or unrecognized.',
          'Silver: a person confirmed the mapping, no blocking issues remain and the checks pass.',
          'Gold: silver, certified by its data owner for this exact version, reconciled to control totals and fresh.',
        ],
      },
      { h: 'How a number gets its tier' },
      {
        p: "Each number declares the fields it uses, and its tier is the lowest of theirs. A field takes its dataset's tier, capped by its own quality: silver or better needs it filled for at least 95% of the rows it applies to, with no more than 2% of values unrecognized or defaulted. For example, voluntary attrition is bronze when termination type is only 60% filled, even if the roster is certified.",
      },
      {
        p: "A value is not recognized when it is outside its field's list: the [official lists](article:data-official-lists) for org units, sites, cost centers and categories, and Census's own for levels and other fixed values.",
      },
      {
        p: "The badge explains itself on hover or focus, naming the field that holds it back. Click it to open that dataset's Quality panel in the Data room.",
      },
      { h: 'The data standard' },
      {
        ul: [
          'Production: only gold numbers show. Use this in leadership meetings.',
          'Validated: silver and gold.',
          'Everything: every number, raw data included, each with its tier badge. This is the default, so nothing looks missing while data is being cleaned up.',
        ],
      },
      {
        p: 'A number below the standard shows "—" with the reason and a link to its dataset. Findings and folder-tab numbers follow the same rule. Exports state the standard and each figure\'s tier, and a held-back figure exports only the reason.',
      },
      {
        p: 'Turn on "Show data quality" in any view header to see, on every number, its tier, the field limiting it and the rows used and left out. [Data quality tab](article:data-quality-tab)',
      },
    ],
  },
  {
    id: 'data-certify',
    group: 'data',
    title: 'Certifying data',
    summary: 'How a data owner takes a dataset to gold, and what ends a certification.',
    keywords: [
      'certify',
      'certification',
      'gold',
      'control totals',
      'reconcile',
      'attest',
      'revoke',
      'data owner',
      'sign off',
    ],
    tour: 'own-data',
    body: [
      {
        p: 'Certifying is how a dataset becomes gold. Open the dataset in the [Data room](route:data) and go to its Certify panel.',
      },
      { h: 'Before you certify' },
      {
        p: 'The checklist must pass: mapping confirmed, no blocking issues, issue rate within 2%, references resolve, and the data is fresh. Certify stays disabled until every silver check passes, and the panel says which one is missing.',
      },
      { h: 'Certify' },
      {
        ol: [
          'Add control totals if you have them, such as "headcount per the HRIS report is 1,452" or total base pay in USD per payroll. Each must reconcile within 0.5%.',
          'Enter your name and a note.',
          'Select Certify.',
        ],
      },
      {
        p: 'A certification belongs to one version of the data. Replacing the dataset ends it, and remapping certified rows in Categories & mapping caps the dataset at silver. Revoke ends it on purpose. The panel keeps the history of the last three versions.',
      },
      {
        note: 'A certification is a local attestation kept in this browser, like everything else. It is not a login or an approval workflow.',
      },
    ],
  },
  {
    id: 'data-quality-tab',
    group: 'data',
    title: 'Data quality tab',
    summary:
      'The quality story for the whole dashboard, and the single fixes that would lift the most metrics.',
    keywords: [
      'quality',
      'fill rate',
      'fields',
      'checks',
      'metric impact',
      'fixes',
      'lens',
      'show data quality',
      'report',
    ],
    route: { view: 'data', tab: 'quality' },
    tour: 'quality-definitions',
    body: [
      {
        p: 'The [Data quality](route:data.quality) tab in the Data room tells the quality story for the whole dashboard:',
      },
      {
        ul: [
          "Datasets by tier: each dataset's tier, version, mapping, certification, freshness and import error rate. Click a tier to open the dataset.",
          "Field quality: each dataset's fields shaded by fill rate. Click a square for its blank or invalid rows.",
          'What would lift the most metrics: single fixes ranked by how many metrics each would raise to a higher tier, for example filling termination reason for the leavers who lack one.',
          'Metric impact: every metric with its tier and the field limiting it.',
          'Checks: every rule result across datasets (references, duplicates, dates in order, freshness, mapping, certification and control totals), each one drillable.',
          'Trend: tier and import error rate by dataset version.',
        ],
      },
      {
        p: '"Download data quality report" saves the whole tab as one workbook.',
      },
      { h: 'The quality lens' },
      {
        p: 'The "Show data quality" switch in every view header turns on a quiet line under each key figure, figure and finding: its tier, the field limiting it, and the rows used and left out, with the left-out rows one click away. A strip under the tabs names the datasets the view reads with their tiers. It is off by default so the dashboard stays clean for meetings, and it is remembered in this browser.',
      },
    ],
  },
  {
    id: 'data-wrong',
    group: 'data',
    title: 'When numbers look wrong',
    summary: 'A checklist to work through before you report a problem.',
    keywords: [
      'wrong',
      'incorrect',
      'missing',
      'zero',
      'blank',
      'dash',
      'different',
      'mismatch',
      'checklist',
      'does not match',
      'hris',
    ],
    body: [
      { p: 'Most surprises have a plain cause. Work down this list:' },
      {
        ol: [
          'Check the scope. The view header names the filters, the window and the as-of date. A leader or department filter left on from earlier changes every view.',
          'Check the period. Rates such as attrition are annualized over the window; a 3-month window moves more than a 12-month one.',
          'Check the as-of date. With your own data it is the latest date in the data, which may not be today. [Settings, Data](settings:data) shows the date in use.',
          'Open the records. Click the number and look at who is counted. Sort and search the list.',
          'Read the definition. The info button shows what is counted and who is left out, such as contractors and interns. A "Definition changed" mark means a setting differs from the default.',
          'Check the tier. Hover the badge for the field holding it back, or turn on "Show data quality" to see the rows left out.',
          "Look at the source. In the Data room, the dataset's Raw panel shows rows as uploaded, Mapping shows which column fed each field, and Quality shows blanks and unrecognized values.",
          'Check the categories. A department under two business units, or two spellings of one location, splits a group. [Categories & mapping](article:data-categories)',
          'Check privacy rules. "—" with "Hidden to protect anonymity" means fewer than five people, not zero.',
        ],
      },
      {
        p: 'Still stuck? [Report a problem](article:report-problem) copies a summary of your view, filters and data setup, with no people data, to paste into a message.',
      },
    ],
  },
]
