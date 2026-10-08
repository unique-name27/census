/** Help articles, Help and support: shortcuts, reporting a problem, troubleshooting and the FAQ. */
import type { HelpArticle } from '../types'
import {
  ALL_RECRUITERS,
  DATA_ROOM,
  NO_DATA_ROOM,
  NO_PAY,
  ONE_RECRUITER,
  PAY_SWITCH,
  PAY_TOTALS,
} from './when'

export const SUPPORT_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'shortcuts',
    group: 'support',
    title: 'Keyboard shortcuts',
    summary: 'Every control works from the keyboard. These keys make it faster.',
    keywords: ['keyboard', 'keys', 'hotkeys', 'shortcut', 'accessibility', 'tab', 'arrow', 'escape'],
    body: [
      { h: 'Everywhere' },
      {
        ul: [
          '? opens Help.',
          'Alt+A opens [Ask Census](article:ask-census) (Option+A on a Mac) from anywhere outside a text field. While Ask is open, it moves you between the page and the question box.',
          'Tab and Shift+Tab move between controls. The first Tab on a page offers "Skip to content".',
          'Left and right arrows move between folder tabs, and between sub-tabs; Home and End go to the first and last.',
          'Enter or Space on an underlined number opens the records behind it.',
          'Esc closes the open panel, menu or popover: the records panel, Settings or Help.',
        ],
      },
      { h: 'Guided tours' },
      {
        ul: ['Right arrow: next step.', 'Left arrow: previous step.', 'Esc: end the tour.'],
      },
      { h: 'Ask Census' },
      {
        ul: [
          'Enter asks the question. Shift+Enter starts a new line.',
          'Esc in the panel collapses it to a slim strip. The conversation lasts until you choose New chat, reload the page or close the tab.',
          "On the panel's left edge, the left and right arrows make it wider or narrower; Home and End go to the narrowest and widest.",
          'Records or a person card opened from an answer open above the panel: Esc closes them first.',
        ],
      },
      { h: 'Org chart', surface: 'view:org' },
      {
        ul: [
          '/ jumps to Find a person. Up and down arrows pick a match, Enter goes to it.',
          'In the chart, up and down arrows move between people on the same team. Right opens a card or steps to its first report; left closes it or steps up to the manager.',
          'Home goes to the top of the chart, End to the last person on the team.',
          'Enter or Space opens or closes a card. Esc clears the selection.',
          '+ and - zoom in and out.',
        ],
      },
      { h: 'Reorg sandbox', surface: 'tab:org.sandbox' },
      { ul: ['Ctrl+Z undoes the last move.', 'Ctrl+Shift+Z or Ctrl+Y redoes it.'] },
      { h: 'Metric definitions', surface: 'page:data' },
      {
        ul: [
          'In a one-line field, Enter saves.',
          'In a longer text box, Ctrl+Enter saves.',
          'Esc cancels the edit.',
        ],
      },
      { note: 'On a Mac, use Cmd where this says Ctrl.' },
    ],
  },
  {
    id: 'report-problem',
    group: 'support',
    title: 'Report a problem',
    summary:
      'Copy a summary of your view and data setup to paste into a message or ticket, with no people data.',
    keywords: ['bug', 'issue', 'support', 'ticket', 'feedback', 'diagnostic', 'contact', 'broken', 'error'],
    body: [
      {
        p: 'When something looks wrong, "Report a problem" in the Help sheet copies a short summary to your clipboard. Paste it into an email, a chat message or a ticket to the team that looks after Census, and add what you expected to see.',
      },
      { h: 'What the summary holds' },
      {
        ul: [
          'The mode, with the business unit or region an HRBP mode keeps to. A manager or a recruiter is never named.',
          'The view and tab you are on, the period, and which filters are set.',
          "The data standard, the as-of date, and each dataset's tier and row count, and whether it is the sample or uploaded.",
          'How many metric definitions differ from the defaults, and your display settings.',
          'The app version, your browser and the window size.',
        ],
      },
      { h: 'What it never holds' },
      {
        p: 'No people data: no names, no employee IDs, no file names and no values from your data. The leader filter is reported only as set or not set, and department, location and level filters as how many values are picked. Read the summary before you send it; it is plain text.',
      },
      {
        p: 'Before you report, the [When numbers look wrong](article:data-wrong) checklist solves most surprises.',
        surface: 'help:article:data-wrong',
      },
    ],
  },
  {
    id: 'troubleshooting',
    group: 'support',
    title: 'Troubleshooting',
    summary: 'Storage that will not open, large files, and older browsers.',
    keywords: [
      'problem',
      'slow',
      'storage',
      'blocked',
      'private',
      'incognito',
      'large file',
      'browser',
      'old browser',
      'not loading',
      'reset',
      'clear',
    ],
    body: [
      { h: '"Showing sample data" when you expected your files' },
      {
        p: "Census keeps your uploads in this browser's storage. If the browser does not open its storage in time, Census starts on the sample and says so. Reload the page to try again. Private or incognito windows, strict privacy settings and some managed browsers block or clear site storage; use a normal window, and allow site data for Census.",
      },
      {
        p: 'Your files live in the browser you added them in. Another browser, another computer or a cleared browser starts on the sample.',
      },
      { h: 'Large files' },
      {
        ul: [
          'Big workbooks take a few seconds to read. Nothing changes until you apply a sheet.',
          'Save only the sheets you need, or export each dataset as its own .csv file.',
          'Close other heavy tabs if the browser is short of memory.',
        ],
      },
      { h: 'Older browsers' },
      {
        p: 'Census needs a current version of Chrome, Edge, Firefox or Safari. In an older browser, parts of the layout may not show correctly. Update the browser, or open Census in another one.',
      },
      { h: 'Something still looks broken' },
      {
        ul: [
          'If a view fails to load, it offers to reset the filters. Try that first.',
          'Settings, This device, "Clear everything on this device" removes everything Census stored here and starts over on the sample.',
        ],
      },
      {
        ul: ['Download a settings file first if you want to keep your settings and metric definitions.'],
        surface: 'settings:device-files',
      },
      { ul: ['Then [report a problem](article:report-problem).'] },
    ],
  },
  {
    id: 'faq',
    group: 'support',
    title: 'Frequently asked questions',
    summary: 'Short answers to the questions people ask most.',
    keywords: ['faq', 'questions', 'why', 'how do i'],
    body: [
      { h: 'Is my data sent anywhere?' },
      {
        p: 'No. Census runs in your browser and keeps files on this device. [What stays in the browser](article:privacy-browser)',
      },
      { h: 'Why does a number show "—"?' },
      {
        p: 'Fewer than five people are in the group, the number is below the data standard, or the data it needs is missing. Hover or read the note under it. [Reading a number](article:reading-a-number)',
      },
      { h: 'Why does Census not match our HRIS report?' },
      {
        p: 'Check the scope, the window, the as-of date and the definition first. Headcount counts employees only, and attrition is annualized. [When numbers look wrong](article:data-wrong)',
      },
      { h: 'Can I change how a metric is calculated?' },
      {
        p: 'Yes, within its settings. Open "Edit definition" from the info button. [How metrics are defined and changed](article:definitions-how)',
        ...DATA_ROOM,
      },
      {
        p: 'HR can, within its settings, and the change reaches every view. [How metrics are defined and changed](article:definitions-how)',
        ...NO_DATA_ROOM,
      },
      { h: 'How do I show only numbers we trust for a leadership meeting?', surface: 'filter:lens' },
      { p: 'Set the data standard to Production. Only gold numbers show. [Data tiers](article:data-tiers)' },
      { h: "How do I see one leader's organization?", surface: 'filter:leader' },
      {
        p: 'Pick them in the Leader filter, or use "Focus on their org" on their person card. Every view follows. [Moving around](article:moving-around)',
        surface: 'person:focus',
      },
      {
        p: 'Pick them in the Leader filter: your reqs then keep to the ones whose hiring manager is in their org. [Moving around](article:moving-around)',
        ...ONE_RECRUITER,
      },
      {
        p: 'Pick them in the Leader filter: the reqs then keep to the ones whose hiring manager is in their org. [Moving around](article:moving-around)',
        ...ALL_RECRUITERS,
      },
      { h: 'Why can I not see salaries?' },
      {
        p: 'Pay amounts are off by default and last one session when turned on. [Pay amounts](article:privacy-pay)',
        ...PAY_SWITCH,
      },
      {
        p: "Finance mode shows cost totals over groups of 5 or more people, never one person's pay. [Pay amounts](article:privacy-pay)",
        ...PAY_TOTALS,
      },
      {
        p: 'This mode never shows a pay amount. Pay amounts stay with Total rewards. [Pay amounts](article:privacy-pay)',
        ...NO_PAY,
      },
      { h: 'Can I see who answered a survey?', surface: 'view:listening' },
      { p: 'No. Survey results are always grouped. [Surveys](article:privacy-surveys)' },
      { h: 'Will my settings follow me to another computer?' },
      {
        p: 'Not on their own. Download a settings file in [Settings, This device](settings:device) and import it on the other computer. Data files need to be added again.',
        surface: 'settings:device-files',
      },
      {
        p: 'Not on their own. Your mode, filters, saved views and display settings are kept in this browser, so on another computer you choose them again.',
        unless: 'settings:device-files',
      },
    ],
  },
  {
    id: 'whats-new',
    group: 'support',
    title: "What's new",
    summary: 'Short notes on what changed in each release.',
    keywords: ['release notes', 'changes', 'new', 'updates', 'version', 'changelog'],
    generated: 'whats-new',
    body: [],
  },
  {
    id: 'developer-tools',
    group: 'support',
    title: 'Developer tools',
    summary: 'The Developer page and the debug overlays, for whoever builds, tests or supports Census.',
    keywords: [
      'developer',
      'debug',
      'inventory',
      'figure id',
      'metric id',
      'timings',
      'console',
      'state',
      'overlay',
      'scan as role',
      'role homes',
      'preview a role',
    ],
    route: { view: 'dev' },
    tour: 'developer-tools',
    body: [
      {
        p: "Developer mode shows everything HR mode shows, plus every role's home, My team, the Developer page and three debug overlays. Switch to it with the Mode button. Nothing on the Developer page is sent anywhere.",
      },
      { h: 'The Developer page' },
      {
        ul: [
          "Overview: whether the data, the metric dictionary, the view contracts and the runtime are healthy. Run contract checks lays out every view off screen, and each role's Home in that role's mode, and lists each figure, key figure or finding that lacks a metric id, the fields it reads or its records.",
          'Inventory: every view, tab, figure, metric, engine function, Ask tool, drill kind, dataset field, storage key, route, setting, shortcut and help article, each with what all eleven modes show. Search a list, or export it like any table.',
          'Access: every surface and its decision in each of the eleven modes, the same rows the access matrix test checks. Pick one mode, or show only the surfaces where modes differ.',
          'Security center: what each role sees and can do, edited as a draft and published as a policy file. [Security center](article:security-center)',
          'Ask tools: run one Ask tool in this browser and see exactly what Claude would get. Nothing is sent to Anthropic.',
          'State: the route, the mode with the scope it holds and the picks remembered, switches, quality index, saved views, panels and storage, each copyable as JSON. The Ask key and the workspace ID are never copied.',
          'Timings: how long the engines, records lists, exports and Ask tools took. Timings record in Developer mode only.',
        ],
      },
      { h: 'Scan as role' },
      {
        ul: [
          'Inventory, Figures: "Scan figures" lays out every view as Developer mode sees it and lists every figure it registers.',
          'Pick another mode in Mode, and its pick where it needs one (a manager, a business unit, a region or a recruiter), then "Scan as role" lists what that role gets. The result line names the mode and the pick.',
          'A pick made on this page lasts until reload. It never changes your mode or the pick Census remembers.',
        ],
      },
      { h: 'Role homes' },
      {
        ul: [
          "Inventory, Role homes lists each role's Home: how many figures it has, the pick it needs and the one in use, its scope and its pay view.",
          '"Preview a role" lays out that role\'s Home on this page, with the role\'s own numbers, lists and exports, while the rest of Census stays in Developer mode. Home in Developer mode links to each preview. [Role homes](route:dev.inventory:homes)',
        ],
      },
      { h: 'Debug overlays' },
      {
        ul: [
          'Figure ids: a label on each figure with its id. Click it to copy the id.',
          'Tour targets: an outline and a label on every element a tour can point at.',
          'Metric ids on hover: hovering a key figure, figure or finding shows its metric id and the fields it reads.',
          'Alt+Shift+D (Option+Shift+D on a Mac) switches every overlay on or off. Settings, Mode has the same switches.',
        ],
      },
      {
        note: 'Errors caught this session are listed on the Overview. A tab that could not be drawn shows Details with the message and the component stack in this mode.',
      },
    ],
  },
  {
    id: 'security-center',
    group: 'support',
    title: 'Security center',
    summary:
      'Decide what each role sees and can do in Census, as a draft in this browser, and publish it as a policy file for everyone.',
    keywords: [
      'access',
      'policy',
      'access-policy.json',
      'roles',
      'permissions',
      'override',
      'guard rails',
      'publish',
      'preview as role',
      'draft',
    ],
    route: { view: 'dev', tab: 'security' },
    body: [
      {
        p: 'The Security center is a tab of the Developer page. It changes what each role (HR, CHRO, both HRBP modes, Compensation, Talent management, HR ops, Recruiter, Finance and Manager) sees and can do. Developer mode always shows everything and cannot be changed.',
      },
      {
        note: "Census runs in the browser with no sign-in. Anyone can still switch roles, and data already on a computer can be read with the browser's own tools. Keep sensitive data off computers that should not have it.",
      },
      { h: 'What you can change' },
      {
        ul: [
          'Role: whether the Mode menu offers it, and the page it opens on.',
          'Views and tabs, each Special analysis among them.',
          'Figures and metrics, found by id, title or metric.',
          'Data: the datasets a role reads, the records it opens and its person card (full, limited or none).',
          'Pay: none, ratios, totals, or amounts per person behind the session switch.',
          'Ask: on or off, each data tool, the screen tools and charts.',
          'Exports, the Action center, the Data room, Settings sections, Tools, and help articles and tours.',
        ],
      },
      {
        p: 'The scope stays fixed by the role: a manager keeps to an org, an HR business partner to a business unit or region, and a recruiter to their reqs. Only what shows inside the scope can change.',
      },
      { h: 'Sections' },
      {
        ul: [
          'Matrix: roles as columns and surfaces as rows, grouped by kind, with search and "Changed only". Each cell says whether its decision is built in, set by the file in force, or changed in the draft. Click a cell to change it; a reason and your name are needed, and the dialog says what else the change carries along.',
          'Role: one role at a time as a checklist by area, with its own controls and "Reset this role to defaults".',
          'Changes: the draft against what is in force, and what is in force against the defaults, with Undo on each change and a change log you can export.',
          'In force: the policy file loaded (published by, date, notes, format version and checksum), or "Built-in defaults", and every line that was left out and why.',
          'Publish and import: Publish checks the draft and downloads access-policy.json. Import shows what a file would change before it goes into the draft.',
        ],
      },
      {
        p: 'Each section has its own address, such as #dev.security:role:finance for the role page on Finance, so a link or a reload opens the same place.',
      },
      { h: 'Preview as role' },
      {
        p: 'Preview lays the draft over this tab only and switches to the role, asking for its pick where it needs one. A bar says which role you are previewing, with "Back to the Security center". Nothing is in force for anyone else.',
      },
      { h: 'Putting a policy in force' },
      {
        ol: [
          'Publish downloads access-policy.json.',
          'Put it at public/access-policy.json in the Census repository.',
          'Run npm run deploy. The one-file build embeds the file, and the site gets a copy beside its page.',
          'Census loads it for everyone when it starts. In force says which file is loaded.',
        ],
      },
      {
        p: 'A file that is not valid, has another format version or a checksum that does not match is ignored as a whole, and Developer mode says why. Unknown roles or surfaces, and lines that cross a guard rail, are skipped one by one and listed under In force.',
      },
      { h: 'Guard rails' },
      {
        ul: [
          'Protected characteristics are never shown.',
          'Employee relations items never name a person.',
          'Survey answers are never shown per person, and manager cuts keep their minimum.',
          'Anonymity minimums can only be raised, never lowered.',
          'Pay amounts and immigration details per person only ever show behind their session switches.',
          'The Security center, debug overlays and the Ask tools console stay Developer-only.',
          'A role never sees outside its scope: a scoped role never gets the Data room, and a recruiter never gets views or datasets beyond their reqs.',
          'Cost totals without the pay switch are for Finance mode only, over whole business units at the reporting date HR sets.',
        ],
      },
      {
        note: 'The draft is kept in this browser and in the settings file. It changes nothing in force until it is published and deployed.',
      },
    ],
  },
]
