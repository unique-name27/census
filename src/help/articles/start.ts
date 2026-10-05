/** Help articles, Start here: what Census is and how to read and use it. */
import type { HelpArticle } from '../types'

export const START_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'what-census-is',
    group: 'start',
    title: 'What Census is',
    summary: 'A people analytics workbench for the HR team, built for weekly reviews and leader meetings.',
    keywords: ['about', 'overview', 'introduction', 'start', 'welcome'],
    tour: 'getting-started',
    body: [
      {
        p: "Census brings the HR team's numbers into one place: hiring, onboarding, headcount and attrition, the org chart, HR operations, talent, pay, compliance and what people tell us in surveys. Each practice has a folder tab along the top.",
      },
      {
        p: 'It is built for the way HR works. Specialists review the numbers during the week, then walk leaders through them in meetings. So every view leads with a readout of findings, every chart exports its data, and a whole view exports as an Excel workbook or a PowerPoint deck.',
      },
      { h: 'What you can count on' },
      {
        ul: [
          'Every number opens the records behind it, so you can see exactly who is counted. [Clicking down to the people](article:clicking-down)',
          'Every number carries a data tier (bronze, silver or gold) that says how far its data has come. [Data tiers](article:data-tiers)',
          'Every metric has one definition, kept in [Metric definitions](route:data.metrics), where you can read it and change it.',
          'Everything runs in this browser. Files you add never leave your computer. [What stays in the browser](article:privacy-browser)',
        ],
      },
      { h: 'The pages' },
      {
        ul: [
          '[Scorecard](route:scorecard): how each practice is doing against its targets, and the top findings across Census. Census opens here.',
          'The practice views: Recruiting, Onboarding, People stats, Org chart, HR ops, Talent, Compensation, Compliance and Listening.',
          '[AI in HR](route:ai): the AI agents the HR team has, what each is for, and when not to use one.',
          '[Action center](route:actions): open items from every view, grouped by who they wait on.',
          '[Data room](route:data): what data is loaded and how good it is, the metric definitions, and how categories are mapped.',
        ],
      },
      {
        p: 'Census starts on sample data for a fictional company, Northgate Semiconductor, so you can explore before you load your own. [Sample data](article:privacy-sample)',
      },
      { p: 'New here? [Take the 2-minute tour](tour:getting-started).' },
    ],
  },
  {
    id: 'moving-around',
    group: 'start',
    title: 'Moving around',
    summary: 'Folder tabs, sub-tabs, the filter row, the reporting period and the leader focus.',
    keywords: [
      'navigate',
      'navigation',
      'filter',
      'filters',
      'period',
      'window',
      'leader',
      'scope',
      'as of',
      'date',
    ],
    tour: 'getting-started',
    body: [
      { h: 'Folder tabs and headline numbers' },
      {
        p: 'The folder tabs along the top are the practices. Each tab shows one live number for the current scope, such as open reqs or median compa-ratio, often with a small trend line. Click a tab to open the view. With the keyboard, move to the tabs and use the left and right arrow keys.',
      },
      {
        p: "Inside a view, the sub-tabs under its name (Overview, Pipeline and so on) go deeper. The browser's Back and Forward buttons move between views and tabs, and the address in the address bar opens the same tab when you share or bookmark it.",
      },
      { h: 'The filter row' },
      {
        ul: [
          'Period: the window most numbers cover. The default is the last 12 months. You can also pick year to date, the last full quarter, the last 6 or 3 months, or a custom range.',
          'Leader: focus on one leader and everyone who reports to them, directly or through others. The chip under the filters shows the reporting line above them; click a name in it to widen to that leader.',
          'Business unit, department, location and level: narrow who is in scope. Pick one or several values in each.',
          'The count at the end of the row says how many people are in scope.',
        ],
      },
      {
        p: 'Filters apply to every view and are remembered in this browser. Remove one with the cross on its chip, or use Reset to clear them all. The view header always says the scope, the window and the as-of date.',
      },
      { h: 'The data standard' },
      {
        p: 'Under the filters, the data standard sets the lowest data tier a number needs to be shown: Production (gold only), Validated (silver and up) or Everything. It applies to every view. [Data tiers](article:data-tiers)',
      },
      { h: 'The as-of date' },
      {
        p: 'Numbers are calculated as of one date, shown in the masthead and in each view header. On the sample it is 30 Sep 2026. With your own data it is the latest date in the data, up to today. You can set another reporting date in [Settings, Data](settings:data).',
      },
      {
        note: 'AI in HR reads no data, so it shows no filter row, no scope line and no as-of date.',
      },
    ],
  },
  {
    id: 'reading-a-number',
    group: 'start',
    title: 'Reading a number',
    summary: 'What a key figure tile, a change, a target and a tier badge tell you.',
    keywords: [
      'kpi',
      'tile',
      'delta',
      'change',
      'target',
      'met',
      'missed',
      'tier',
      'badge',
      'dash',
      'hidden',
      'readout',
      'finding',
    ],
    tour: 'getting-started',
    body: [
      { h: 'Key figure tiles' },
      {
        p: 'Most views open with a row of key figures. Each tile carries the same parts:',
      },
      {
        ul: [
          'The label. When the tile has a tab that explains it, the label opens that tab.',
          'The info button. It shows the definition, with "Edit definition" to open the metric in Metric definitions and "Learn more" for the help article.',
          'The value. A dotted underline means you can click it to see the records behind it.',
          'The change, with the window it compares to. It is colored only when the change is large enough to matter: green when it moved the good way, red when it moved the bad way, gray otherwise.',
          'The target line, when the metric has a target: Met or Missed, with the target in words.',
          'The tier badge: bronze, silver or gold. Hover or focus it to see why; click it to open that dataset in the Data room.',
        ],
      },
      { h: 'Comparisons' },
      {
        p: 'Changes compare with the window before the current one. In People stats, when a leader or org filter is on, the tiles compare with the whole company instead and say so ("vs company").',
      },
      { h: 'When a number shows "—"' },
      {
        ul: [
          'Hidden to protect anonymity (n < 5): fewer than five people are in the group. [Small groups](article:privacy-small-groups)',
          'Below the data standard: the number is shown with the reason and a link to the dataset that holds it back. [Data tiers](article:data-tiers)',
          'Missing data: a field the metric needs is empty in every row. The note names the column. A missing number is never shown as 0.',
        ],
      },
      { h: 'Figures and the readout' },
      {
        p: 'Every chart sits on a sheet with a title that says what is measured and a subtitle that states the window. Its info button lists the definitions; its table button shows the rows behind the chart; its download button exports them. [Exporting and presenting](article:exporting)',
      },
      {
        p: 'The readout lists the findings for the view: one sentence with the number in it, up to two sentences of detail, then one neutral next step. Each finding carries Critical, Watch, Note or Good with an icon. The names in a finding and the numbers in it open the people behind them.',
      },
      {
        p: 'A "Definition changed" mark means the number is calculated with a setting that differs from the default. [How metrics are defined and changed](article:definitions-how)',
      },
    ],
  },
  {
    id: 'clicking-down',
    group: 'start',
    title: 'Clicking down to the people',
    summary: 'Every number opens the records behind it, and a record opens the person.',
    keywords: ['drill', 'drill down', 'records', 'person card', 'employee', 'list', 'who'],
    tour: 'getting-started',
    body: [
      {
        p: 'A number with a dotted underline opens the records behind it. This works on key figures, table cells, chart bars and points, names in findings and counts inside the panel itself. The panel slides in from the right.',
      },
      { h: 'The records panel' },
      {
        ul: [
          'The list is the exact set of records the number counts: people, requisitions, candidates, cases, tasks and so on.',
          'Sort by any column, search the list, and download it as CSV or Excel, or copy it to paste into a spreadsheet.',
          'The header shows the tier of the number, so you know how far to trust the list.',
          'Rows that lead somewhere are clickable. A count inside the panel opens its records on top; Back returns to where you were.',
        ],
      },
      { h: 'The person card' },
      {
        p: 'A person opens on a card: title, level, department, location, who they report to, hire date and tenure, their team, latest rating, compa-ratio, open cases and courses, and their job history. From there:',
      },
      {
        ul: [
          'Focus on their org sets the leader filter to them, so every view shows them and their teams.',
          'Show in org chart opens the Org chart at their card.',
        ],
      },
      {
        note: 'Some numbers never open a list of people, by design: survey results, groups under five people, and employee relations cases. [Privacy and trust](article:privacy-browser)',
      },
    ],
  },
  {
    id: 'exporting',
    group: 'start',
    title: 'Exporting and presenting',
    summary: 'Figure exports, whole-view workbooks and decks, and the monthly people report.',
    keywords: [
      'export',
      'download',
      'excel',
      'xlsx',
      'csv',
      'png',
      'svg',
      'powerpoint',
      'pptx',
      'slides',
      'deck',
      'report',
      'copy',
      'present',
      'meeting',
    ],
    body: [
      { h: 'One figure' },
      {
        p: "Each figure's download button offers Download CSV, Download Excel and Copy table (to paste into Excel), and for charts Download PNG (for slides) and Download SVG. Some figures also offer the detail rows behind them as Excel. What you download is exactly what the table view shows.",
      },
      { h: 'A whole tab or view' },
      {
        p: "The Export button in the view header builds an Excel workbook or a PowerPoint deck of every figure on the tab, or of every tab in the view. Each sheet and slide carries the scope, the window, the as-of date, the data standard and each figure's tier.",
      },
      { h: 'The monthly people report' },
      {
        p: 'On the [Scorecard](route:scorecard), "Monthly people report" builds a PowerPoint deck or an Excel workbook in one click: the scorecard, the top findings and each practice\'s lead chart. Org chart and AI in HR are not part of it.',
      },
      { h: 'What exports carry' },
      {
        ul: [
          'Pay amounts only while "Show pay amounts" is on for the session. Ratios such as compa-ratio are always included. [Pay amounts](article:privacy-pay)',
          'A figure held back by the data standard exports only the reason, never its rows.',
          'A "Sample data" stamp while you are on the sample, and "Definitions changed" when a definition differs from the default.',
          'Workbooks are marked "Company confidential".',
        ],
      },
      {
        p: 'Other ready-made exports: People stats "Copy talking points" for a leader 1:1, the Org chart "Org slides", the reorg sandbox scenario, and "Export list" in the [Action center](route:actions).',
      },
    ],
  },
  {
    id: 'ask-census',
    group: 'start',
    title: 'Ask Census',
    summary:
      'Ask a question in plain words. Claude answers with numbers Census works out, each linked to its records.',
    keywords: [
      'ask',
      'chat',
      'chatbot',
      'assistant',
      'question',
      'query',
      'claude',
      'anthropic',
      'ai',
      'api key',
      'conversation',
      'natural language',
    ],
    body: [
      {
        p: 'Ask, in the masthead, opens a sheet where you can ask about your people data in plain words, such as "Where is voluntary attrition highest, and how has it changed?" Claude reads the question and asks Census for the numbers it needs. Census works them out in this browser, with the same definitions, filters and data standard as the views, and Claude writes the answer.',
      },
      { h: 'What it can answer' },
      {
        ul: [
          'The key figures and findings of any view, for the whole company or for a leader, business unit, department, location or level.',
          'One figure compared across groups, such as voluntary attrition by location.',
          'Counts and simple cuts of a dataset, such as open reqs by recruiter or cases by category.',
          'Metric definitions, data quality and tiers, and the open items in the Action center.',
        ],
      },
      {
        p: 'Every number in an answer opens its records in the panel on the right, as it does anywhere in Census, and a name opens the person card. A link to a view takes you there, and a metric name shows its definition. Tables in an answer download as CSV or Excel, or copy. Copy answer copies the whole answer with names, for your notes.',
      },
      { h: 'What is sent, and what never is' },
      {
        ul: [
          'Sent to Anthropic under your API key: your question, and the counts, rates, definitions and org structure Census calculates to answer it.',
          "Never sent: names, employee, candidate and application IDs, emails, pay amounts, one person's survey answers, or immigration details. People go as tokens such as {{P12}} that only this browser can turn back into names.",
          'The rules on screen apply here too: small groups are hidden, employee relations cases are counted by category only, and numbers below the data standard are held back.',
        ],
      },
      {
        p: '"What was sent", under each answer, shows your question as it was sent, every result Census sent back and the tokens used, so you can check this for yourself.',
      },
      { h: 'Adding your key' },
      {
        ol: [
          'Create an API key in the Claude Console.',
          'Open [Settings, Ask Census](settings:ask) and paste it in. It is kept for this tab only, unless you turn on "Keep on this device".',
          'Use Check key to try it, and pick a model: Claude Opus 5.5 by default, or Sonnet or Haiku for faster answers.',
        ],
      },
      {
        p: 'The key is never part of the settings file, Report a problem, exports or the page address. Forget key removes it.',
      },
      { h: 'Good to know' },
      {
        ul: [
          'The conversation stays when you close the sheet. It lasts until you choose New chat, reload the page or close the tab.',
          'Alt+A (Option+A on a Mac) opens Ask from anywhere outside a text field. Enter asks; Shift+Enter starts a new line. [Keyboard shortcuts](article:shortcuts)',
          'When Census runs inside another page, such as a claude.ai artifact, the browser may block requests to Anthropic. Open Census in its own tab.',
          'Claude can misread a question. The numbers come from Census and each one opens its records, so check the ones you will repeat.',
        ],
      },
    ],
  },
]
