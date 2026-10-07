/** Help articles, Start here: what Census is and how to read and use it. */
import { NOT_SECURITY_LONG } from '@/access/copy'
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
    summary: 'Folder tabs, sub-tabs, the filter row, saved views, links and Back, leaving groups out.',
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
      'saved view',
      'views',
      'exclude',
      'leave out',
      'except',
      'link',
      'share',
      'back',
      'bookmark',
    ],
    tour: 'getting-started',
    body: [
      { h: 'Folder tabs and headline numbers' },
      {
        p: 'The folder tabs along the top are the practices. Each tab shows one live number for the current scope, such as open reqs or median compa-ratio, often with a small trend line. Click a tab to open the view. With the keyboard, move to the tabs and use the left and right arrow keys.',
      },
      {
        p: 'Inside a view, the sub-tabs under its name (Overview, Pipeline and so on) go deeper.',
      },
      { h: 'The filter row' },
      {
        ul: [
          'Views: your saved views, and saving the current one. See below.',
          'Period: the window most numbers cover. The default is the last 12 months. You can also pick year to date, the last full quarter, the last 6 or 3 months, or a custom range.',
          'Leader: focus on one leader and everyone who reports to them, directly or through others. The chip under the filters shows the reporting line above them; click a name in it to widen to that leader.',
          'Business unit, department, location and level: narrow who is in scope. Pick one or several values in each.',
          'The count at the end of the row says how many people are in scope. The counts in each filter menu say how many people each choice would leave in scope, with the other filters applied.',
        ],
      },
      {
        p: 'Filters apply to every view and are remembered in this browser. Remove one with the cross on its chip, or use Reset to clear them all. The view header always says the scope, the window and the as-of date.',
      },
      { h: 'Leaving a group out' },
      {
        p: 'Each filter menu starts with Include and Exclude. Include keeps only the values you pick; Exclude keeps everyone except them. For the leader, Exclude leaves out that leader and their whole org. With Exclude on, the count next to each choice says how many people it leaves out, and a group of fewer than five cannot be left out, since comparing the scope with and without it would single those people out. Filters combine, so you can ask for Silicon Engineering, not Bengaluru, not L1.',
      },
      {
        p: 'Chips read "Not Sales" or "Not in Allison Carter\'s org", the view header and exports say "Whole company except Sales", and "vs company" comparisons, the Org chart (left-out people are dimmed), the Scorecard, the Action center and Ask all follow. Someone with no value for a filter you exclude stays in.',
      },
      { h: 'Links, Back and Forward' },
      {
        p: "The address in the address bar holds the view, the tab and the filters, so a bookmark or a link opens the same page with the same scope. Copy link to this view, in the view header's Export menu, copies it with every filter spelled out. Names are never in the address; a leader is there by employee ID.",
      },
      {
        p: "The browser's Back and Forward buttons move between views and tabs and also undo and redo filter changes. Several quick changes, such as ticking three departments in one open menu, are one step. Opening the records panel, Settings, Help or Ask is not a step.",
      },
      {
        p: "A link shows the same numbers only to someone with the same data loaded. If the link names a leader, department or other value your data doesn't have, it is left out and a message says which. A link's data standard and data quality setting apply to that tab only; they don't change the data standard you saved.",
      },
      { h: 'Saved views' },
      {
        p: 'Save the scope you use often, such as "My org, last quarter", from Views at the start of the filter row. A saved view holds the period, the leader and the other filters with their Include or Exclude, the data standard and whether data quality is shown. Turn on "Open on this page" to have it open a view and tab as well.',
      },
      {
        ul: [
          'Pick a saved view from Views to apply it in one step. The menu shows its name while the scope matches it, and "edited" once you change something.',
          'Update saves your change to the view; Save as new keeps both.',
          'Manage views renames, reorders and deletes views (with Undo), copies a link to one, and sets Open Census with this view, the view Census starts with when the address names no filters.',
          'Saved views are kept in this browser and travel in the settings file. The sample data comes with two examples you can remove.',
        ],
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
          'When the number counts one group, such as a bar for Bengaluru, the header offers Filter to Bengaluru and Leave out Bengaluru. Either one closes the panel and narrows the scope for every view, keeping your other filters: Filter to keeps only the people in both, and Leave out takes the group away, so the totals drop by its number. An action that would change nothing, leave no one, or leave out fewer than five people is not offered. Undo in the message, or Back, returns to the scope you had.',
        ],
      },
      { h: 'The person card' },
      {
        p: 'A person opens on a card: title, level, department, location, who they report to, hire date and tenure, their team, latest rating, compa-ratio, open cases and courses, and their job history. From there:',
      },
      {
        ul: [
          'Focus on their org sets the leader filter to them, so every view shows them and their teams. Undo, or Back, returns to the scope you had.',
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
      { h: 'A link instead of a file' },
      {
        p: 'Copy link to this view, at the end of the same Export menu, copies the address of the tab with its filters, period, data standard and data quality setting spelled out. Someone with the same data loaded who opens it sees the same numbers. A saved view has its own Copy link in Manage views.',
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
        surface: 'tab:org.sandbox',
      },
      {
        p: 'Other ready-made exports: the Org chart "Org slides", and "Export list" in the [Action center](route:actions).',
        unless: 'tab:org.sandbox',
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
      'workspace',
      'workspace id',
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
          'Use Check key to try it: it sends one tiny request, so it also tells you when the account has no API credits. Then pick a model: Claude Opus 5.5 by default, or Sonnet or Haiku for faster answers.',
        ],
      },
      {
        p: 'The key is never part of the settings file, Report a problem, exports or the page address. Forget key removes it.',
      },
      { h: 'If Anthropic asks for a workspace ID' },
      {
        p: 'A key that is not tied to a workspace gets "This key needs a workspace ID." Either of these fixes it:',
      },
      {
        ul: [
          'Add the workspace ID: in the Claude Console, open Settings, Workspaces and copy the ID of the workspace to use. It starts with wrkspc_. Paste it under Workspace ID in [Settings, Ask Census](settings:ask) and save it.',
          'Or create a key inside a workspace: in the Claude Console, open the workspace, create an API key there, and replace your key with it. Such a key needs no workspace ID, so clear the field.',
        ],
      },
      {
        p: 'If Census says "Anthropic did not accept this workspace ID.", check the ID in the Claude Console under Settings, Workspaces, or clear it when the key already belongs to a workspace.',
      },
      {
        p: 'The workspace ID is kept on this device and goes to Anthropic with each request, nowhere else. Forget key leaves it; Clear removes it.',
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
  {
    id: 'modes',
    group: 'start',
    title: 'Modes',
    summary:
      'What HR, Manager and Developer mode show, how to switch, and how Manager mode keeps to one org.',
    keywords: ['mode', 'manager mode', 'hr mode', 'developer mode', 'my team', 'switch', 'role'],
    body: [
      {
        p: 'Census has three modes. Each shows the views and tools that fit how you use Census. Switch with the Mode button in the masthead, or in [Settings, Mode](settings:mode).',
      },
      { h: 'What each mode shows' },
      {
        ul: [
          'HR mode is for the HR team: every view, the Data room and Settings. Census opens on the Scorecard.',
          "Manager mode is for one people manager: My team, Recruiting, Onboarding, People stats, Org chart and Talent, all kept to that manager's org. Compensation, surveys, HR ops, compliance, AI in HR and the Data room are not shown.",
          'Developer mode is for whoever builds, tests or supports Census: everything in HR mode, plus the Developer page.',
        ],
      },
      { h: 'Choosing a manager' },
      {
        p: 'Choosing Manager mode asks you to pick the manager from the people who lead 3 or more employees, the same list as the leader filter. Pick yourself. "Change manager…" in the Mode menu picks again.',
      },
      { h: 'How Manager mode keeps to the org' },
      {
        ul: [
          'The leader filter is pinned to the manager. You can narrow to a leader inside the org; Whole org goes back to all of it.',
          "Links and saved views open inside the org. A link for another leader opens the manager's org instead, and Census says so.",
          'Company numbers stay as comparisons, such as attrition against the company. They open no records.',
          'Records and person cards open only for people in the org. Successors outside the org show by readiness only.',
          'Ask answers about the org only, and needs an org of 5 or more employees.',
        ],
      },
      { h: 'A view, not security' },
      { note: NOT_SECURITY_LONG },
      {
        p: 'The mode is remembered in this browser. It is not part of a link or the settings file, so a link you share opens in the mode of whoever opens it.',
      },
    ],
  },
]
