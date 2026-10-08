/** Help articles, Privacy and trust: what Census keeps, shows and never shows. */
import type { HelpArticle } from '../types'
import { DATA_ROOM, NO_DATA_ROOM, NO_PAY, PAY_SWITCH, PAY_TOTALS } from './when'

export const PRIVACY_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'privacy-browser',
    group: 'privacy',
    title: 'What stays in the browser',
    summary: 'Census runs on this device. Files, settings and changes are stored in this browser only.',
    keywords: [
      'privacy',
      'security',
      'local',
      'storage',
      'upload',
      'server',
      'cloud',
      'protected',
      'gender',
      'ethnicity',
      'age',
      'confidential',
      'clear',
    ],
    metrics: ['privacy.protectedFields'],
    body: [
      {
        p: "Census runs entirely in your browser. Files you add are read on this device and stored in this browser's own storage. They are never sent anywhere.",
      },
      {
        p: 'Ask Census is the one exception, and only once you add your own Claude API key or your team’s passcode: your question and the numbers Census calculates to answer it go to Anthropic, directly or through your team’s relay. Names, IDs and pay amounts never do. [Ask Census](article:ask-census)',
      },
      { h: 'What is kept in this browser' },
      {
        ul: [
          'Uploaded datasets, their versions, the original sheets and your saved column choices.',
          'Certifications, your category mappings and your metric definition changes, with their change logs.',
          'Settings, filters, the AI agent catalog, tool links, and the items you marked handled or snoozed in the Action center.',
          'Whether you dismissed the welcome card and which tours you finished.',
        ],
      },
      {
        p: 'Another browser or computer starts on the sample. To move your settings, use the settings file in [Settings, This device](settings:device); it never holds data or pay amounts. "Clear everything on this device" removes everything Census stored here and starts over on the sample.',
        surface: 'settings:device-files',
      },
      {
        p: 'Another browser or computer starts on the sample. "Clear everything on this device", in [Settings, This device](settings:device), removes everything Census stored here and starts over on the sample.',
        unless: 'settings:device-files',
      },
      { h: 'What never comes in' },
      {
        p: 'Census has no fields for gender, ethnicity, age or any other protected characteristic. When a file has columns such as gender, ethnicity, age or birth date, nationality, citizenship, religion, disability, veteran status, sexual orientation or marital status, they are dropped as the file is read. Free-text comment columns are dropped too.',
      },
      {
        note: "Exports are files like any other: once downloaded, they follow your company's rules for confidential data.",
      },
    ],
  },
  {
    id: 'privacy-pay',
    group: 'privacy',
    title: 'Pay amounts',
    summary:
      "How pay shows in each mode: ratios, one person's amounts behind a session switch, and cost totals over groups.",
    without: [
      {
        when: NO_PAY,
        summary: 'This mode shows pay as ratios only, never an amount or a cost total.',
      },
      {
        when: PAY_TOTALS,
        summary: "Finance mode shows cost totals over groups of 5 or more people, never one person's pay.",
      },
    ],
    keywords: [
      'salary',
      'pay',
      'amounts',
      'show pay amounts',
      'compensation',
      'confidential',
      'money',
      'dollars',
      'cost',
      'cost totals',
      'ratios',
    ],
    metrics: ['privacy.payAmounts'],
    body: [
      {
        p: "Census shows pay in three ways: ratios, the amounts of one person's pay, and cost totals over groups. Which ones you see depends on the mode.",
      },
      { h: 'Ratios', surface: 'filter:leader' },
      {
        p: 'Pay ratios, such as compa-ratio, range penetration and merit %, describe pay against its range, the market or a budget. They show wherever a view shows them.',
      },
      { h: 'Pay amounts', ...PAY_SWITCH },
      {
        p: 'Pay amounts (salary, range minimum, midpoint and maximum, market median, equity value, merit dollars and the cost to bring someone to minimum) show and export only while "Show pay amounts" is on. HR, CHRO, Compensation and Developer mode have the switch.',
      },
      {
        ul: [
          'Turn it on with the switch in the [Compensation](route:comp) header, or in [Settings, Privacy](settings:privacy). Both are the same setting.',
          'It lasts for this session only, and every mode change turns it off. Amounts are hidden again the next time Census opens.',
          'While it is on, the masthead says "Pay amounts shown" on every page, with Hide next to it.',
          'Figures, tables, drills and every export drop amount columns while it is off.',
        ],
      },
      { h: 'Cost totals', surface: 'pay:totals' },
      {
        p: "Workforce cost, a tab of [Compensation](route:comp.cost), adds pay up over groups: target cash, base, equity and cost per employee by cost center, business unit, level and site, and against the budget when one is loaded. Every total covers 5 or more costed people. Groups under 5 fold into Other, and Other always holds 5 or more, so no one's pay can be worked out by subtracting one total from another.",
      },
      {
        p: 'In this mode the totals show while "Show pay amounts" is on, and a total opens the people it counts with their amounts.',
        ...PAY_SWITCH,
      },
      {
        p: "Finance mode sees the totals at all times and never one person's pay. It filters by business unit and period only, so two totals always differ by whole business units. A total opens the people it counts, without amounts, and every export says that individual pay is left out.",
        ...PAY_TOTALS,
      },
      {
        p: 'Every amount Finance mode sees is rounded down to the nearest $0.1M ($12,345,678 reads "$12.3M"; a total under $100,000 reads "under $0.1M"), on screen, in tooltips and tables, and in every export. A total over several business units adds each unit’s rounded amount, plus $0.1M for every two units, since rounding down takes about $0.05M off each. Percentages and amounts against budget are worked out from the rounded amounts, so comparing one breakdown with another, one set of business units with another, or one date with another never narrows one person’s pay to less than a $100,000 range.',
        ...PAY_TOTALS,
      },
      { h: 'In this mode', ...NO_PAY },
      {
        p: 'This mode shows pay as ratios only. No figure, table, record list or export holds a pay amount or a cost total; those stay with Total rewards.',
      },
      { h: 'In every mode' },
      {
        ul: [
          'Ask never sends a pay amount or a cost total to Anthropic.',
          'An Action center item never holds an amount in its text, so a copied note never carries one. Where amounts show, they sit in a column of their own.',
        ],
      },
      { ul: ['The settings file never holds pay amounts.'], surface: 'settings:device-files' },
      {
        note: 'Turn pay amounts off before you share your screen or export for an audience that should not see salaries.',
        ...PAY_SWITCH,
      },
    ],
  },
  {
    id: 'privacy-small-groups',
    group: 'privacy',
    title: 'Small groups',
    summary: 'Any rate or average over fewer than five people is hidden.',
    keywords: ['anonymity', 'minimum', 'n < 5', 'hidden', 'suppressed', 'other', 'small', 'dash'],
    metrics: ['privacy.anonymity'],
    body: [
      {
        p: 'A rate or average over a group of fewer than five people could point to one person. So Census hides it: the number shows "—" with "Hidden to protect anonymity (n < 5)".',
      },
      {
        ul: [
          'Breakdowns fold groups under five into "Other", with the number of groups folded in.',
          'Findings never describe a group under the minimum.',
        ],
      },
      {
        ul: [
          'The minimum is the Anonymity minimum in Metric definitions. It can be raised for your organization, never lowered.',
        ],
        ...DATA_ROOM,
      },
      {
        ul: [
          'The minimum is kept with the metric definitions. HR can raise it for your organization, never lower it.',
        ],
        ...NO_DATA_ROOM,
      },
      {
        p: 'Counts of people can still open the list of who they are, because HR works with named records. The rule protects rates and averages, where a small group would reveal something about a person.',
      },
    ],
  },
  {
    id: 'privacy-er',
    group: 'privacy',
    title: 'Employee relations',
    summary: 'Employee relations cases show as counts and timeliness only, never tied to a person.',
    keywords: ['er', 'employee relations', 'investigation', 'complaint', 'grievance', 'case', 'confidential'],
    body: [
      {
        p: 'Employee relations cases are among the most sensitive records HR keeps. Census shows them only as counts and timeliness (for example the ER-02 median days to close).',
      },
      {
        ul: [
          'No detail below the category level is shown.',
          "A person card's open case count leaves employee relations cases out, so neither the count nor a note can reveal that someone has one.",
          'In the Action center, an employee relations item never names a person, does not open a list, and is left out entirely in a scope under the anonymity minimum.',
        ],
      },
    ],
  },
  {
    id: 'privacy-surveys',
    group: 'privacy',
    title: 'Surveys',
    summary: 'Every survey number is grouped; answers and respondents are never shown.',
    keywords: [
      'survey',
      'anonymous',
      'confidential',
      'respondents',
      'answers',
      'comments',
      'manager cuts',
      'engagement',
    ],
    metrics: ['privacy.surveyAnswers', 'privacy.surveyManagerCuts'],
    body: [
      {
        p: 'Survey results are the one place where Census does not click down to people. Every survey number is grouped:',
      },
      {
        ul: [
          'A group needs at least five distinct respondents. Smaller groups are hidden and say why.',
          'A cut by manager needs ten respondents over the last four quarters.',
          'Numbers open grouped results (counts and scores), never answers or the people who gave them.',
          'Respondent keys are used only to group answers by org, stage or req, and are never shown or exported.',
          'Free-text comment columns are never imported.',
        ],
      },
      {
        p: 'Engagement and eNPS surveys are off unless someone turns them on in [Settings, Privacy](settings:privacy). While off, their answers are ignored everywhere.',
        surface: ['pay:switch', 'header:compliance'],
      },
      {
        p: 'Engagement and eNPS surveys are off unless HR turns them on. While off, their answers are ignored everywhere.',
        unless: ['pay:switch', 'header:compliance'],
      },
    ],
  },
  {
    id: 'privacy-immigration',
    group: 'privacy',
    title: 'Immigration details',
    summary: 'Work authorization types show per person only while you turn them on for the session.',
    without: [
      {
        surface: 'header:compliance',
        summary: 'Work authorization types show as counts by type in this mode, never per person.',
      },
    ],
    keywords: [
      'immigration',
      'visa',
      'work authorization',
      'right to work',
      'citizenship',
      'nationality',
      'show immigration details',
    ],
    metrics: ['privacy.immigrationDetails'],
    body: [
      {
        p: "Compliance needs to know whose work authorization expires and when. It does not need to show everyone's immigration status. So:",
      },
      {
        ul: [
          'Authorization types are broad categories only. Citizens and permanent residents are both "Permanent (no expiry)".',
          'No nationality or citizenship field exists, and such columns are dropped on import.',
        ],
      },
      {
        ul: [
          'Each person\'s authorization type shows in tables, drills and exports only while "Show immigration details" is on. Turn it on in the [Compliance](route:compliance) header or in [Settings, Privacy](settings:privacy). It lasts for this session only, and every mode change turns it off.',
        ],
        surface: 'header:compliance',
      },
      {
        ul: [
          "This mode never shows a person's authorization type, in tables, drills or exports. That stays with HR ops and Compliance.",
        ],
        unless: 'header:compliance',
      },
      {
        ul: [
          'Counts by type always show, with small groups folded into Other.',
          'Expiry dates and reverification status show per person, because they are what people operations acts on.',
        ],
      },
    ],
  },
  {
    id: 'privacy-sample',
    group: 'privacy',
    title: 'Sample data',
    summary: 'Northgate Semiconductor is a fictional company. Its people and numbers are generated.',
    keywords: ['sample', 'demo', 'fake', 'fictional', 'northgate', 'test data', 'reset'],
    body: [
      {
        p: "Census ships with a sample company, Northgate Semiconductor, so you can explore every view before loading your own data. Its people and numbers are generated; any resemblance to real people is chance. The sample's as-of date is 30 Sep 2026.",
      },
      {
        ul: [
          'While every dataset is the sample, the masthead shows a "Sample data" tag and exports carry a "Sample data" stamp. The view header says which datasets are the sample and which are yours.',
        ],
      },
      {
        ul: [
          'The sample arrives the way real data does: some datasets are bronze or silver on purpose, with gaps and odd spellings, so the Data room has real issues to show.',
          'Replace any dataset with your own export and the rest keeps running on the sample. [Loading files](article:data-loading)',
          'Reset everything to sample in the Data room puts the sample back.',
        ],
        ...DATA_ROOM,
      },
      {
        ul: [
          'The sample arrives the way real data does: some datasets are bronze or silver on purpose, with gaps and odd spellings.',
          'When your own data replaces a dataset, the rest keeps running on the sample.',
        ],
        ...NO_DATA_ROOM,
      },
    ],
  },
]
