/** Help articles, Start here: what Census is and how to read and use it. */
import { NOT_SECURITY_LONG } from '@/access/copy'
import type { HelpArticle } from '../types'
import {
  ALL_PRACTICES,
  ALL_RECRUITERS,
  DATA_ROOM,
  DEVELOPER,
  EVERY_ITEM,
  FINANCE,
  HR,
  HRBP,
  MANAGER,
  NO_DATA_ROOM,
  NO_PAY,
  ONE_RECRUITER,
  PAY_SWITCH,
  PAY_TOTALS,
  ROLE_HOME,
  ROLE_LISTS,
  SCOPED,
  SOME_PRACTICES,
} from './when'

const HOME_PAGE =
  "[Home](route:home): your role's first page, with the number your role is judged on, Needs attention (your own open items) and My list (the records you work on)."
const SCORECARD_PAGE =
  '[Scorecard](route:scorecard): how each practice is doing against its targets, and the top findings across Census.'
const ACTIONS_EVERY_ITEM =
  '[Action center](route:actions): open items from every view, grouped by who they wait on.'
/** Exports outside HR and Developer mode (docs/ROLES-V2.md 4.11). */
const MADE_IN =
  'A line saying the mode it was made in, and the scope when the mode keeps to one: "Made in HRBP mode for APAC."'

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
        ...ALL_PRACTICES,
      },
      {
        p: "Census brings the HR team's numbers into one place, each practice in a folder tab along the top. Each mode shows the tabs that fit its role; [Modes](article:modes) says which.",
        ...SOME_PRACTICES,
      },
      {
        p: 'It is built for the way HR works. Specialists review the numbers during the week, then walk leaders through them in meetings. So every view leads with a readout of findings, every chart exports its data, and a whole view exports as an Excel workbook or a PowerPoint deck.',
      },
      { h: 'What you can count on' },
      {
        ul: [
          'Every number opens the records behind it, so you can see exactly who is counted. [Clicking down to the people](article:clicking-down)',
          'Every number carries a data tier (bronze, silver or gold) that says how far its data has come. [Data tiers](article:data-tiers)',
        ],
      },
      {
        ul: [
          'Every metric has one definition, kept in [Metric definitions](route:data.metrics), where you can read it and change it.',
        ],
        ...DATA_ROOM,
      },
      {
        ul: [
          'Every metric has one definition, the same in every view. The info button beside a number shows it, and [Settings, Formulas](settings:formulas) lists every formula.',
        ],
        ...NO_DATA_ROOM,
      },
      {
        ul: [
          'Everything runs in this browser. Files you add never leave your computer. [What stays in the browser](article:privacy-browser)',
        ],
      },
      { h: 'The pages' },
      { ul: [`${HOME_PAGE} Census opens here.`], ...ROLE_HOME },
      {
        ul: [
          '[My team](route:team): your org on one page, with your Needs attention and everyone on your team. Census opens here.',
        ],
        ...MANAGER,
      },
      { ul: [`${SCORECARD_PAGE} Census opens here.`], ...HR },
      { ul: [SCORECARD_PAGE], surface: ['view:scorecard', 'view:home'] },
      {
        ul: [
          'The practice views: Recruiting, Onboarding, People stats, Org chart, HR ops, Talent, Compensation, Compliance and Listening.',
        ],
        ...ALL_PRACTICES,
      },
      {
        ul: ['The practice views this mode shows, each leading with its key figures and findings.'],
        ...SOME_PRACTICES,
      },
      {
        ul: [
          '[AI in HR](route:ai): the AI agents the HR team has, what each is for, and when not to use one.',
        ],
        surface: 'view:ai',
      },
      { ul: [ACTIONS_EVERY_ITEM], ...EVERY_ITEM },
      { ul: [ACTIONS_EVERY_ITEM], ...DEVELOPER },
      {
        ul: [
          '[Action center](route:actions): your Needs attention (the open items that are yours) and what is waiting on others, from the views this mode shows.',
        ],
        ...ROLE_LISTS,
      },
      {
        ul: [
          '[Data room](route:data): what data is loaded and how good it is, the metric definitions, and how categories are mapped.',
        ],
        ...DATA_ROOM,
      },
      {
        ul: [
          "[Home](route:home) and [My team](route:team): the first pages of the role modes and of Manager mode. Each shows its own mode's numbers.",
          '[Developer page](route:dev): whether the data, the definitions and the views are healthy, and everything Census has. Census opens here.',
        ],
        ...DEVELOPER,
      },
      {
        p: 'Census starts on sample data for a fictional company, Northgate Semiconductor, so you can explore before you load your own. [Sample data](article:privacy-sample)',
      },
      {
        p: 'New here? [Take the 2-minute tour](tour:getting-started).',
        surface: 'help:tour:getting-started',
        unless: 'help:tour:home-start',
      },
      {
        p: 'New here? [Getting started with your home](tour:home-start) takes a minute, and [the 2-minute tour](tour:getting-started) shows the rest of Census.',
        surface: ['help:tour:getting-started', 'help:tour:home-start'],
      },
      {
        p: 'New here? [Getting started with your home](tour:home-start) takes a minute.',
        surface: 'help:tour:home-start',
        unless: 'help:tour:getting-started',
      },
      {
        p: 'New here? [Getting started as a manager](tour:manager-start) takes a minute.',
        surface: 'help:tour:manager-start',
        unless: 'page:dev',
      },
    ],
  },
  {
    id: 'moving-around',
    group: 'start',
    title: 'Moving around',
    summary: 'Folder tabs, sub-tabs, the filter row, saved views, links and Back, leaving groups out.',
    without: [
      {
        surface: 'filter:exclude',
        summary: 'Folder tabs, sub-tabs, the filter row, saved views, links and Back.',
      },
    ],
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
        p: 'The folder tabs along the top are the views this mode shows. Each tab shows one live number for the current scope, often with a small trend line. Click a tab to open the view. With the keyboard, move to the tabs and use the left and right arrow keys.',
      },
      {
        p: 'Inside a view, the sub-tabs under its name go deeper.',
      },
      { h: 'The filter row' },
      {
        ul: [
          'Views: your saved views, and saving the current one. See below.',
          'Period: the window most numbers cover. The default is the last 12 months. You can also pick year to date, the last full quarter, the last 6 or 3 months, or a custom range.',
        ],
      },
      {
        ul: [
          'Leader: focus on one leader and everyone who reports to them, directly or through others. The chip under the filters shows the reporting line above them; click a name in it to widen to that leader.',
          'Business unit, department, location and level: narrow who is in scope. Pick one or several values in each.',
        ],
        surface: 'filter:leader',
      },
      {
        ul: [
          'Business unit: Finance mode filters by business unit and period only, so every cost total covers whole business units.',
        ],
        ...FINANCE,
      },
      {
        ul: [
          'The count at the end of the row says how many people are in scope. The counts in each filter menu say how many people each choice would leave in scope, with the other filters applied.',
        ],
      },
      {
        ul: [
          'Your business unit or region is pinned: its filter shows a lock and names it. The other filters narrow inside it, and Reset goes back to the whole of it.',
        ],
        ...HRBP,
      },
      {
        ul: [
          'Your org is pinned: the leader filter keeps to it. Pick a leader inside it to narrow every view; Whole org goes back to all of it.',
        ],
        ...MANAGER,
      },
      {
        ul: [
          "Every filter works inside your reqs. A leader keeps the reqs whose hiring manager is in that leader's org.",
        ],
        ...ONE_RECRUITER,
      },
      {
        ul: [
          "With Every recruiter picked, the filters cover every req. A leader keeps the reqs whose hiring manager is in that leader's org.",
        ],
        ...ALL_RECRUITERS,
      },
      {
        p: 'Filters apply to every view and are remembered in this browser. Remove one with the cross on its chip, or use Reset to clear them all. The view header always says the scope, the window and the as-of date.',
      },
      { h: 'Leaving a group out', surface: 'filter:exclude' },
      {
        p: 'Each filter menu starts with Include and Exclude. Include keeps only the values you pick; Exclude keeps everyone except them. For the leader, Exclude leaves out that leader and their whole org. With Exclude on, the count next to each choice says how many people it leaves out, and a group of fewer than five cannot be left out, since comparing the scope with and without it would single those people out. Filters combine, so you can ask for Silicon Engineering, not Bengaluru, not L1.',
      },
      {
        p: 'Chips read "Not Sales" or "Not in Allison Carter\'s org", the view header and exports say "Whole company except Sales", and every view, "vs company" comparison, the Action center and Ask follow. Someone with no value for a filter you exclude stays in.',
      },
      {
        p: 'The Org chart dims the people left out instead of removing them, so reporting lines stay readable.',
        surface: 'view:org',
      },
      { h: 'Links, Back and Forward' },
      {
        p: "The address in the address bar holds the view, the tab and the filters, so a bookmark or a link opens the same page with the same scope. Copy link to this view, in the view header's Export menu, copies it with every filter spelled out. Names are never in the address; a leader is there by employee ID.",
      },
      {
        p: "In Recruiter mode a link carries the filters but not your reqs, so someone who opens it in another mode sees every recruiter's reqs.",
        ...ONE_RECRUITER,
      },
      {
        p: "The browser's Back and Forward buttons move between views and tabs and also undo and redo filter changes. Several quick changes, such as ticking three values in one open menu, are one step. Opening the records panel, Settings, Help or Ask is not a step.",
      },
      {
        p: "A link shows the same numbers only to someone with the same data loaded. If the link names a leader, department or other value your data doesn't have, it is left out and a message says which. A link's data standard and data quality setting apply to that tab only; they don't change the data standard you saved.",
      },
      {
        p: "A link or saved view always opens inside the mode's scope. When it names something outside, Census leaves that out and says so.",
        ...SCOPED,
      },
      { h: 'Saved views' },
      {
        p: 'Save the scope you use often, such as "My org, last quarter", from Views at the start of the filter row. A saved view holds the period, the filters, the data standard and whether data quality is shown. Turn on "Open on this page" to have it open a view and tab as well.',
      },
      {
        ul: [
          'Pick a saved view from Views to apply it in one step. The menu shows its name while the scope matches it, and "edited" once you change something.',
          'Update saves your change to the view; Save as new keeps both.',
          'Manage views renames, reorders and deletes views (with Undo), copies a link to one, and sets Open Census with this view, the view Census starts with when the address names no filters.',
          'Saved views are kept in this browser. The sample data comes with two examples you can remove.',
        ],
      },
      { ul: ['They travel in the settings file too.'], surface: 'settings:device-files' },
      { h: 'The data standard' },
      {
        p: 'Under the filters, the data standard sets the lowest data tier a number needs to be shown: Production (gold only), Validated (silver and up) or Everything. It applies to every view. [Data tiers](article:data-tiers)',
        surface: 'filter:lens',
      },
      {
        p: 'Under the filters, the data standard says the lowest data tier a number needs to be shown: Production (gold only), Validated (silver and up) or Everything. This mode uses the standard HR saved, in every view.',
        unless: 'filter:lens',
      },
      { h: 'The as-of date' },
      {
        p: 'Numbers are calculated as of one date, shown in the masthead and in each view header. On the sample it is 30 Sep 2026. With your own data it is the latest date in the data, up to today. You can set another reporting date in [Settings, Data](settings:data).',
        surface: 'settings:data',
      },
      {
        p: 'Numbers are calculated as of one date, shown in the masthead and in each view header. On the sample it is 30 Sep 2026. With your own data it is the latest date in the data, up to today, unless HR sets another reporting date.',
        unless: 'settings:data',
      },
      {
        note: 'AI in HR reads no data, so it shows no filter row, no scope line and no as-of date.',
        surface: 'view:ai',
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
        ul: ['The label. When the tile has a tab that explains it, the label opens that tab.'],
      },
      {
        ul: [
          'The info button. It shows the definition, with "Edit definition" to open the metric in Metric definitions and "Learn more" for the help article.',
        ],
        surface: 'ui:edit-definition',
      },
      {
        ul: ['The info button. It shows the definition, with "Learn more" for the help article.'],
        unless: 'ui:edit-definition',
      },
      {
        ul: [
          'The value. A dotted underline means you can click it to see the records behind it.',
          'The change, with the window it compares to. It is colored only when the change is large enough to matter: green when it moved the good way, red when it moved the bad way, gray otherwise.',
          'The target line, when the metric has a target: Met or Missed, with the target in words.',
        ],
      },
      {
        ul: [
          'The tier badge: bronze, silver or gold. Hover or focus it to see why; click it to open that dataset in the Data room.',
        ],
        ...DATA_ROOM,
      },
      {
        ul: ['The tier badge: bronze, silver or gold. Hover or focus it to see why.'],
        ...NO_DATA_ROOM,
      },
      { h: 'Comparisons' },
      { p: 'Changes compare with the window before the current one.' },
      {
        p: 'In People stats, when a leader or org filter is on, the tiles compare with the whole company instead and say so ("vs company").',
        surface: ['view:hrbp', 'ui:kpi-delta-company', 'filter:leader'],
      },
      {
        p: 'In People stats, with a business unit picked, the tiles compare with the whole company instead and say so ("vs company").',
        ...FINANCE,
      },
      {
        p: 'In People stats and on your home, the tiles compare your scope with the whole company and say so ("vs company"). The company number is a comparison only: it opens no records.',
        surface: 'view:hrbp',
        ...SCOPED,
      },
      {
        p: 'Time to fill, offer acceptance and days waiting compare your reqs with all reqs and say so ("vs all reqs"). That comparison opens no records.',
        ...ONE_RECRUITER,
      },
      { h: 'When a number shows "—"' },
      {
        ul: [
          'Hidden to protect anonymity (n < 5): fewer than five people are in the group. [Small groups](article:privacy-small-groups)',
        ],
      },
      {
        ul: [
          'Below the data standard: the number is shown with the reason and a link to the dataset that holds it back. [Data tiers](article:data-tiers)',
        ],
        ...DATA_ROOM,
      },
      {
        ul: ['Below the data standard: the reason shows in place of the number.'],
        ...NO_DATA_ROOM,
      },
      {
        ul: [
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
          'The list is the exact set of records the number counts: people, requisitions, candidates, tasks and so on.',
          'Sort by any column, search the list, and download it as CSV or Excel, or copy it to paste into a spreadsheet.',
          'The header shows the tier of the number, so you know how far to trust the list.',
          'Rows that lead somewhere are clickable. A count inside the panel opens its records on top; Back returns to where you were.',
        ],
      },
      {
        ul: [
          'When the number counts one group, such as a bar for Bengaluru, the header offers Filter to Bengaluru and Leave out Bengaluru. Either one closes the panel and narrows the scope for every view, keeping your other filters: Filter to keeps only the people in both, and Leave out takes the group away, so the totals drop by its number. An action that would change nothing, leave no one, or leave out fewer than five people is not offered. Undo in the message, or Back, returns to the scope you had.',
        ],
        surface: 'focus:leave-out',
      },
      {
        ul: [
          'When the number counts one business unit, the header offers Filter to that unit. It closes the panel and narrows every view to the unit, keeping the period. Undo in the message, or Back, returns to the scope you had.',
        ],
        ...FINANCE,
      },
      {
        ul: ['Records outside your scope are not listed, and the panel says how many were left out.'],
        ...SCOPED,
      },
      { h: 'The person card' },
      {
        p: 'A person opens on a card: title, level, department, location, who they report to, hire date and tenure, their team and their job history. It also shows:',
        surface: ['person:focus', 'filter:leader'],
      },
      { ul: ['Their latest rating and potential.'], surface: 'person:ratings' },
      { ul: ['Their compa-ratio.'], surface: 'person:compa-ratio' },
      { ul: ['Their pay amounts, while "Show pay amounts" is on.'], ...PAY_SWITCH },
      {
        ul: ['How many HR cases they have open. Employee relations cases are left out of that count.'],
        surface: ['person:open-cases', 'drill:cases'],
      },
      { ul: ['Their overdue required courses.'], surface: 'drill:learning' },
      {
        p: 'A person opens on a short card: title, department, level, location, cost center, hire date and who they report to.',
        ...FINANCE,
      },
      {
        p: 'A person opens on a card when they are about to start on one of your reqs: their role, start date, hiring manager and how ready day one is.',
        ...ONE_RECRUITER,
      },
      {
        p: 'A person opens on a card when they are about to start on a req: their role, start date, hiring manager and how ready day one is.',
        ...ALL_RECRUITERS,
      },
      { p: 'From there:', surface: 'person:org-chart' },
      {
        ul: [
          'Focus on their org sets the leader filter to them, so every view shows them and their teams. Undo, or Back, returns to the scope you had.',
        ],
        surface: ['person:focus', 'filter:leader'],
      },
      { ul: ['Show in org chart opens the Org chart at their card.'], surface: 'person:org-chart' },
      {
        p: 'Someone outside your scope opens on a short card that says so, with no actions.',
        ...SCOPED,
      },
      {
        p: 'A successor or a manager outside your business unit or region shows by name and readiness, as plain text that does not open.',
        ...HRBP,
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
    without: [
      {
        surface: 'export:monthly-report',
        summary: 'Figure exports, whole-view workbooks and decks, and links.',
      },
    ],
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
      {
        p: "In Recruiter mode the link carries the filters but not your reqs, so someone who opens it in another mode sees every recruiter's reqs.",
        ...ONE_RECRUITER,
      },
      { h: 'The monthly people report', surface: 'export:monthly-report' },
      {
        p: 'On the [Scorecard](route:scorecard), "Monthly people report" builds a PowerPoint deck or an Excel workbook in one click for the scope on screen: the scorecard, the top findings and each practice\'s lead chart. Org chart and AI in HR are not part of it.',
      },
      {
        p: 'Your home has the same button in its header.',
        surface: ['view:home', 'header:hrbp'],
        unless: 'page:dev',
      },
      { h: 'What exports carry' },
      {
        ul: [
          'Pay amounts only while "Show pay amounts" is on for the session. Ratios such as compa-ratio are always included. [Pay amounts](article:privacy-pay)',
        ],
        ...PAY_SWITCH,
      },
      {
        ul: [
          "Cost totals over groups of 5 or more people, never one person's pay, with a line that says so. [Pay amounts](article:privacy-pay)",
        ],
        ...PAY_TOTALS,
      },
      { ul: ['Never a pay amount or a cost total.'], ...NO_PAY },
      {
        ul: [
          'A figure held back by the data standard exports only the reason, never its rows.',
          'A "Sample data" stamp while you are on the sample, and "Definitions changed" when a definition differs from the default.',
          'Workbooks are marked "Company confidential".',
        ],
      },
      { ul: [MADE_IN], ...ROLE_HOME },
      { ul: [MADE_IN], ...MANAGER },
      { h: 'Other ready-made exports' },
      {
        ul: ['Copy talking points on People stats: five to seven bullets for a leader 1:1.'],
        surface: 'export:talking-points',
      },
      {
        ul: ['Org slides on the Org chart: a PowerPoint slide per leader with their direct org.'],
        surface: 'export:org-slide',
      },
      {
        ul: ['Export scenario in the reorg sandbox: the moves and the roster they make, in Excel.'],
        surface: 'export:reorg',
      },
      { ul: ['Export list in the [Action center](route:actions): the open items and a sheet per owner.'] },
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
      'team passcode',
      'passcode',
      'relay',
      'shared key',
      'conversation',
      'natural language',
      'chart',
      'graph',
      'undo',
      'my charts',
      'filter',
      'panel',
    ],
    body: [
      {
        p: 'Ask, in the masthead, opens a panel beside the page where you can ask about your people data in plain words, such as "What changed most in the last quarter, and where?" Claude reads the question and asks Census for the numbers it needs. Census works them out in this browser, with the same definitions, filters and data standard as the views, and Claude writes the answer. The page stays usable while Ask is open: change tabs and filters, open records, and the conversation carries on.',
      },
      { h: 'What it can answer' },
      {
        ul: [
          'The key figures and findings of the views this mode shows, for the whole scope or for a leader, business unit, department, location or level.',
        ],
        surface: 'filter:leader',
      },
      {
        ul: [
          'The key figures and findings of the views this mode shows, for the company or a business unit.',
        ],
        ...FINANCE,
      },
      {
        ul: [
          'One figure compared across groups, such as each business unit against the others.',
          'Counts and simple cuts of the data this mode reads.',
          'What a metric means and how it is calculated, and the open items the [Action center](route:actions) lists for your mode.',
        ],
      },
      {
        ul: ['Data quality and tiers: which fields hold a number back, and why.'],
        surface: 'ask:explain_quality',
      },
      {
        p: 'Every number in an answer opens its records in the records panel, as it does anywhere in Census, and a name opens the person card. A link to a view takes you there, and a metric name shows its definition. Tables in an answer download as CSV or Excel, or copy. Copy answer copies the whole answer with names, for your notes.',
      },
      { h: 'Ask on the screen' },
      {
        p: 'Ask can also change what is on screen as it answers. Ask it to "show the last 6 months", "point to the chart" or "open the records", and it does that straight away. Each change shows as a line at the top of the answer, with Undo. Undo puts back only what that change did. Back in the browser undoes it too. Records Ask opened offer Open again instead: closing the records panel is their undo.',
      },
      {
        ul: [
          'Ask can set or reset the filters and the period, open a view or tab, scroll to a figure and show it as a table, open the records behind a number, and apply a saved view.',
          'It never changes your data, your settings, the mode, metric definitions, mappings or official lists.',
          "It opens only the views this mode shows. When asked for something else, it says why it can't.",
        ],
      },
      {
        ul: [
          'It stays inside your scope, and it needs 5 or more employees in the scope (5 or more candidates on your reqs), so that no answer is about one person.',
        ],
        ...SCOPED,
      },
      {
        ul: [
          'It filters by business unit and period only, as the filter row does. Cost totals stay on the page.',
        ],
        ...FINANCE,
      },
      {
        ul: [
          'Each question tells Claude which view, tab, scope and period are on screen, so "explain this chart" works.',
          'To stop it changing the screen, turn off "Let Ask change the screen" in [Settings, Ask Census](settings:ask). Ask then answers with links to the views instead.',
        ],
      },
      { h: 'Charts Ask draws' },
      {
        p: 'Ask for a chart, such as "chart that by month", and Ask draws it in the answer. Census works out every number in it, never Claude, so the chart matches the views. It has what any figure in Census has: the table view, definitions, the tier, the records behind every bar or point, and exports to CSV, Excel, PNG and SVG. When a figure on screen already shows what you asked, Ask points to that figure instead.',
      },
      {
        ul: [
          'Open full size shows the chart large, for a meeting.',
          'Pin to My charts keeps it in the panel until you reload the page or close the tab. Once you pin one, My charts sits beside the conversation.',
          'Small groups stay hidden in a chart as they are everywhere else, and the note under it says so.',
          'A count that is not limited to the period, such as open reqs, says the date it is for: "as of 30 Sep 2026".',
        ],
      },
      { h: 'The panel' },
      {
        ul: [
          'On a wide screen the panel sits on the right and the page narrows to make room. Drag its left edge to make it wider or narrower; Census remembers the width on this device.',
          'Collapse shrinks it to a slim strip on the right, and Close puts it away. Esc in the panel collapses it.',
          "On a phone it is a sheet along the bottom: a short bar with the last answer's first line and the question box, half the screen, or the full screen. Drag the handle or use the arrow button. The page above stays usable at the short bar and at half height.",
          'Open or collapsed is remembered until you close the tab. The records panel, person cards, Settings and Help open above it.',
        ],
      },
      { h: 'What is sent, and what never is' },
      {
        ul: [
          "Sent to Anthropic under your API key, or through your team's relay: your question, and the counts, rates, definitions and org structure Census calculates to answer it.",
          "Never sent: names, employee, candidate and application IDs, emails, pay amounts, cost totals, one person's survey answers, or immigration details. People go as tokens such as {{P12}} that only this browser can turn back into names.",
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
        p: 'The key is never part of the settings file, Report a problem, exports or the page address. Forget key removes it. Where Census shares its address with other sites (a github.io address does), "Keep on this device" comes with a warning: those sites could read what Census keeps in the browser, so turn it on only if you trust them, for example on your own demo laptop.',
      },
      { h: 'If your team shares a key' },
      {
        p: "Your team may run a relay that holds one Claude API key for everyone, so you don't need your own. Settings, Ask Census then shows Team passcode instead of the key.",
      },
      {
        ol: [
          'Ask whoever set up Ask Census for the team passcode.',
          'Open [Settings, Ask Census](settings:ask) and paste it under Team passcode. Like a key, it is kept for this tab only unless you turn on "Keep on this device", and it is never part of the settings file, Report a problem, exports or the page address.',
          'Use Check passcode to try it: it sends one tiny request through the relay.',
        ],
      },
      {
        ul: [
          'Questions go from this browser to the relay and on to Anthropic. The relay keeps no copy, and names, IDs and pay amounts never leave the browser.',
          'Where Census shares its address with other sites, "Keep on this device" for the passcode carries the same warning.',
          '"The team passcode was not accepted." means it is wrong or has been changed: ask for the current one.',
          '"Too many requests through the team relay." means the relay\'s limit a minute was reached: wait a minute.',
          '"The team relay could not be reached." means the relay is off or out of reach. Try again, then tell whoever runs it.',
          'Problems with the team\'s key, credits or spend limit say "the team" and are for whoever runs the relay to fix.',
          'To use a key of your own instead, turn on "Use my own key instead" in the same section.',
        ],
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
          'The conversation stays when you collapse or close the panel. It lasts until you choose New chat, reload the page or close the tab.',
          'Alt+A (Option+A on a Mac) opens Ask from anywhere outside a text field, and moves you between the page and the question box. Enter asks; Shift+Enter starts a new line. [Keyboard shortcuts](article:shortcuts)',
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
      'The eleven modes, each shaped for a role: what each one shows, where it opens, its pick and how pay shows.',
    keywords: [
      'mode',
      'modes',
      'role',
      'hr mode',
      'chro',
      'hrbp',
      'business partner',
      'business unit',
      'region',
      'compensation mode',
      'talent management',
      'recruiter',
      'hr ops mode',
      'finance',
      'manager mode',
      'developer mode',
      'my team',
      'home',
      'switch',
      'every recruiter',
    ],
    body: [
      {
        p: 'Census has eleven modes, each shaped for a role. A mode decides which views, tabs, tools and help articles Census shows, which page it opens on, and what that page lists as yours. Switch with the Mode button in the masthead, or in [Settings, Mode](settings:mode). The Mode menu groups them as below.',
      },
      { h: 'HR team' },
      {
        ul: [
          "HR: the whole HR team's view. Every view, the Data room and Settings. Census opens on the Scorecard.",
          'CHRO: everything HR mode shows, opening on the executive home: targets met, the top risks across practices, the escalations and the monthly people report.',
        ],
      },
      { h: 'HR business partners' },
      {
        ul: [
          'HRBP for a business unit: one business unit at every location. Its scorecard, people, hiring, talent, pay ratios, HR ops and compliance.',
          'HRBP for a region: every employee in one region, across business units.',
        ],
      },
      { h: 'HR practices' },
      {
        ul: [
          'Compensation: pay position, the merit cycle, the market and workforce cost, with amounts behind "Show pay amounts".',
          'Talent management: performance, calibration, succession, retention risk, learning and the first 90 days.',
          "Recruiter: one recruiter's reqs, with their candidates, next steps, offers and the starts they produce.",
          'HR ops: cases, transactions, leave and return, day-one tasks, I-9s and compliance work, and the Data room.',
        ],
      },
      { h: 'Outside HR' },
      {
        ul: [
          'Finance: headcount, hiring against the plan or the budget, open reqs, contractors and cost totals, filtered by business unit and period.',
          "Manager: one people manager's org on My team, with Recruiting, Onboarding, People stats, Org chart and Talent kept to that org.",
        ],
      },
      { h: 'Building Census' },
      {
        ul: ['Developer: everything, plus the Developer page, for whoever builds, tests or supports Census.'],
      },
      { h: 'Where each mode opens' },
      {
        p: 'HR mode opens on the Scorecard, Manager mode on My team and Developer mode on the Developer page. Every other mode opens on its own Home: the number the role is judged on, Needs attention (the open items that are yours) and My list (the records you work on).',
      },
      { p: '[Home](article:view-home) describes each one.', surface: 'help:article:view-home' },
      {
        p: 'The Actions button in the masthead counts your Needs attention. In HR and CHRO mode it counts every open item, and in the Action center they see every item grouped by who it waits on.',
      },
      { h: 'Choosing a business unit, a region, a recruiter or a manager' },
      {
        p: 'Four modes ask for a pick the first time you choose them, and remember it in this browser. "Change…" in the Mode menu picks again.',
      },
      {
        ul: [
          'HRBP for a business unit: the business unit you support, from the business units in the Employees data.',
          "HRBP for a region: the region. Each location's region comes from the Locations list; the Regions list names each region's HR business partner.",
          'Recruiter: yourself, from everyone named as the recruiter on a req open now or opened in the last 12 months. "Every recruiter" shows every req, for a talent acquisition lead.',
          'Manager: the manager, from the people who lead 3 or more employees, the same list as the leader filter. Pick yourself.',
        ],
      },
      {
        p: 'When new data no longer holds the pick, Census stays in the mode and asks you to pick again.',
      },
      { h: 'Modes that keep to one scope' },
      {
        p: "Manager mode keeps to one org, the two HRBP modes to one business unit or region, and Recruiter mode to one recruiter's reqs.",
      },
      {
        ul: [
          "The scope is pinned in the filter row: the leader for Manager mode, the business unit or the region's locations for HRBP mode. Other filters narrow inside it. A recruiter's reqs are not a filter, so every filter works inside them.",
          'Links and saved views open inside the scope. When one names something outside, Census leaves it out and says so.',
          'Company numbers stay as comparisons, such as attrition against the company (in Recruiter mode, time to fill against all reqs). They open no records.',
          'Records and person cards open only inside the scope. An HR business partner sees a successor or manager outside the scope by name, without opening them.',
          'A scope of fewer than 5 employees (5 candidates, for a recruiter) shows counts and lists with every rate hidden. Ask needs a scope of 5 or more.',
        ],
      },
      { h: 'Pay in each mode' },
      {
        ul: [
          'HR, CHRO, Compensation and Developer: pay amounts while "Show pay amounts" is on, for the session only.',
          "Finance: cost totals over groups of 5 or more people, never one person's pay.",
          'Every other mode: ratios such as compa-ratio where its views show them, and never an amount.',
        ],
      },
      {
        p: 'Ask never sends a pay amount or a cost total, in any mode (see [Pay amounts](article:privacy-pay)).',
      },
      { h: 'What switching does' },
      {
        ul: [
          'Every mode change turns "Show pay amounts" and "Show immigration details" off.',
          'A page the new mode does not show is replaced by its home, and Census says so.',
          'Leaving a mode that keeps to a scope leaves its filters as ordinary filters you can remove. Entering Finance mode clears every filter but the business unit and the period.',
          'The records panel closes, and Ask starts a new chat.',
        ],
      },
      { h: 'A view, not security' },
      { note: NOT_SECURITY_LONG },
      {
        p: 'The mode and its picks are remembered in this browser. They are not part of a link or the settings file, so a link you share opens in the mode of whoever opens it.',
      },
    ],
  },
]
