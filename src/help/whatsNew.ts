/**
 * Release notes for "What's new" in the Help sheet, newest first. `APP_VERSION` is the version the
 * diagnostic summary reports; a test keeps it in step with package.json.
 */

export const APP_VERSION = '0.1.0'

export interface ReleaseNote {
  /** ISO date of the release. */
  date: string
  title: string
  items: readonly string[]
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: '2026-10-04',
    title: 'Help and guided tours',
    items: [
      'A Help button in the masthead opens help articles, a glossary of every metric, keyboard shortcuts and "Report a problem". Press ? to open it from anywhere.',
      'Guided tours: Getting started, Using your own data, Data quality and definitions, and one for every view.',
      '"About this view" in every view header, and "Learn more" in the info buttons.',
    ],
  },
  {
    date: '2026-10-04',
    title: 'Scorecard home and five new areas',
    items: [
      'Census now opens on the Scorecard: each practice against its targets, the top findings and a monthly people report.',
      'Onboarding: upcoming starts and their day-one readiness, the first 90 days, and the hiring plan.',
      'Compliance: right to work, reverification, Form I-9, export control and statutory deadlines.',
      'Listening: every survey program, grouped and private, tied to the operational numbers.',
      'HR ops gains Leave & return. The Action center lists open items from every view by who they wait on.',
    ],
  },
  {
    date: '2026-10-04',
    title: 'Editable metric definitions and data quality',
    items: [
      "Metric definitions in the Data room: every metric's wording, target and settings, editable, logged and undoable.",
      'The Data quality tab and the "Show data quality" switch show what holds each number back.',
    ],
  },
  {
    date: '2026-10-03',
    title: 'AI in HR',
    items: ["A catalog of the HR team's AI agents, what each is for and when not to use it."],
  },
  {
    date: '2026-10-03',
    title: 'Data tiers and Settings',
    items: [
      'Every number carries a tier (bronze, silver or gold), and the data standard sets the lowest tier shown.',
      'One Settings sheet for display, data, privacy, tools and this device. Categories & mapping in the Data room.',
    ],
  },
  {
    date: '2026-10-03',
    title: 'Click down to the people',
    items: [
      'Every number opens the records behind it, and a record opens the person card.',
      'The Org chart, with a reorg sandbox.',
    ],
  },
]
