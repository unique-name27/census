/** Help articles, Definitions: how metrics are defined and changed, and the generated glossary. */
import type { HelpArticle } from '../types'

export const DEFINITION_ARTICLES: readonly HelpArticle[] = [
  {
    id: 'definitions-how',
    group: 'definitions',
    title: 'How metrics are defined and changed',
    summary:
      'One definition per metric, kept in Metric definitions, where wording, targets and settings can change.',
    keywords: [
      'metric',
      'definition',
      'dictionary',
      'target',
      'setting',
      'formula',
      'edit definition',
      'undo',
      'change log',
      'reset',
      'definition changed',
      'formula index',
      'calculation',
    ],
    route: { view: 'data', tab: 'metrics' },
    tour: 'quality-definitions',
    body: [
      {
        p: 'Every metric Census shows has one entry in [Metric definitions](route:data.metrics), a tab of the Data room. That entry is the single source of truth for what the info buttons and figure definitions say, the target it is judged against and the settings its calculation reads.',
      },
      { h: 'What an entry holds' },
      {
        ul: [
          'The definition, formula, population (who counts) and window.',
          'The unit and which direction is good.',
          'The target, if it has one.',
          'The data used: each field with its tier and fill rate.',
          'Settings: the values its calculation reads, such as the first-year window or the merit budget, with their defaults.',
          'The owner, the change log, and where the metric appears.',
        ],
      },
      { h: 'Changing a metric' },
      {
        ol: [
          'Open the metric: use "Edit definition" in any info button, or pick it from the list. Filter by view, tier, "changed from default" or "has a target", or search.',
          'Select the wording, target or setting to change, enter the new value and save. In a text box, Ctrl+Enter saves and Esc cancels.',
          'Every view recalculates at once. Add your name above the list so the change log says who made it.',
        ],
      },
      {
        p: 'Each change can be undone from the change log, a metric can be reset to its defaults, and "Reset all to defaults" starts over. Values are checked against each setting\'s allowed range.',
      },
      { h: 'What changes carry' },
      {
        ul: [
          'A "Definition changed" mark on every number calculated differently from the default, whether or not the quality lens is on.',
          'A "Definitions changed" stamp on every export.',
          'Changes are kept in this browser and travel with the settings file. "Download metric dictionary" exports every entry to Excel; an edited workbook can be imported back, checked field by field.',
        ],
      },
      { h: 'Every formula in one place' },
      {
        p: '[Settings, Formulas](settings:formulas) is an index of how every number is calculated, by view: the formula, who counts and the window, with the unit, the target, the settings it reads and their values, the fields it reads with their tier, and whether anything differs from the default. It follows the definitions in force, so your changes show there too.',
      },
      {
        ul: [
          'Search by name, formula, field or setting, such as "headcount", "terminationDate" or "SLA". Filter by view, "changed only" or "has a target".',
          'Copy one formula as text, or export the whole index as an Excel workbook or a CSV.',
          'The index is read-only. "Open in Metric definitions" opens the entry to change it.',
        ],
      },
      {
        note: 'Privacy rules are locked. The anonymity minimum can be raised, never lowered, and pay amounts stay opt-in.',
      },
    ],
  },
  {
    id: 'glossary',
    group: 'definitions',
    title: 'Glossary',
    summary: 'Every metric Census shows, with its definition, generated from Metric definitions.',
    keywords: ['terms', 'dictionary', 'definitions', 'what does it mean', 'meaning'],
    generated: 'glossary',
    body: [
      {
        p: 'This list is built from [Metric definitions](route:data.metrics), so it always matches what the app calculates, including any wording you changed. Search the Help sheet for a term, or open a metric to see its formula, settings and data.',
      },
    ],
  },
]
