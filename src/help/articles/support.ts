/** Help articles, Help and support: shortcuts, reporting a problem, troubleshooting and the FAQ. */
import type { HelpArticle } from '../types'

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
          'Alt+A opens [Ask Census](article:ask-census) (Option+A on a Mac) from anywhere outside a text field.',
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
          'Esc closes the sheet. The conversation lasts until you choose New chat, reload the page or close the tab.',
          'Records or a person card opened from an answer sit on top of the sheet: Esc closes them first.',
        ],
      },
      { h: 'Org chart' },
      {
        ul: [
          '/ jumps to Find a person. Up and down arrows pick a match, Enter goes to it.',
          'In the chart, up and down arrows move between people on the same team. Right opens a card or steps to its first report; left closes it or steps up to the manager.',
          'Home goes to the top of the chart, End to the last person on the team.',
          'Enter or Space opens or closes a card. Esc clears the selection.',
          '+ and - zoom in and out.',
        ],
      },
      { h: 'Reorg sandbox' },
      { ul: ['Ctrl+Z undoes the last move.', 'Ctrl+Shift+Z or Ctrl+Y redoes it.'] },
      { h: 'Metric definitions' },
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
          'Settings, This device, "Clear everything on this device" removes everything Census stored here and starts over on the sample. Download a settings file first if you want to keep your settings and metric definitions.',
          'Then [report a problem](article:report-problem).',
        ],
      },
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
      },
      { h: 'How do I show only numbers we trust for a leadership meeting?' },
      { p: 'Set the data standard to Production. Only gold numbers show. [Data tiers](article:data-tiers)' },
      { h: "How do I see one leader's organization?" },
      {
        p: 'Pick them in the Leader filter, or use "Focus on their org" on their person card. Every view follows. [Moving around](article:moving-around)',
      },
      { h: 'Why can I not see salaries?' },
      {
        p: 'Pay amounts are off by default and last one session when turned on. [Pay amounts](article:privacy-pay)',
      },
      { h: 'Can I see who answered a survey?' },
      { p: 'No. Survey results are always grouped. [Surveys](article:privacy-surveys)' },
      { h: 'Will my settings follow me to another computer?' },
      {
        p: 'Not on their own. Download a settings file in [Settings, This device](settings:device) and import it on the other computer. Data files need to be added again.',
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
]
