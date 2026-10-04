# Help, tutorials and support

The user asked to "add tutorials and help support". People who open Census should be able to learn
it on their own, find an answer without asking anyone, and know where to go when something looks
wrong.

## One Help button, several ways in

- **Masthead "Help" button** (question-mark icon and the word) opens the **Help sheet**, a right-side panel like Settings. It has:
  - search across all help articles and the metric dictionary
  - "Take the tour", "What's on this page" and "Keyboard shortcuts"
  - "Report a problem": copies a diagnostic summary (view, tab, filters, data standard, dataset tiers, app version, browser) to paste into a message or ticket; never any people data
  - "What's new": short release notes
- **"About this view"**: a quiet link in every view header that opens that view's help article in the Help sheet. It is not a second help system.
- **Info popovers** on KPIs and figures already explain each metric; they keep their "Edit definition" link and gain "Learn more" when an article covers the topic.
- **First visit:** a small welcome card on the Scorecard offers "Take the 2-minute tour" or "Not now". Dismissing it is remembered in this browser. The welcome never opens a modal on its own.

## Guided tours

A light, accessible tour engine (no new dependency): a highlight ring plus a small popover anchored
to a real element, with Next, Back and Skip, keyboard support (arrows, Esc), a focus trap inside
the popover, and respect for reduced motion. If a step's element is missing (a filter hid it, or
the screen is narrow), the step falls back to a centered card. Tours:

1. **Getting started (2 minutes):**
   - folder tabs and headline numbers
   - the filter row (period, leader, org filters)
   - the data standard
   - KPI tiles with their info, tier badge and click-through
   - the readout
   - a figure's export menu and table view
   - the drill panel and person card
   - Tools, Data room, Settings and Help
2. **Using your own data:** Data room, drop a file, check the mapping, issues, apply, tiers, certify.
3. **Data quality and definitions:**
   - tier badges and the Show data quality switch
   - the Data quality tab and its ranked fixes
   - Metric definitions: edit a target, a setting, undo
4. **Per-view tours** (4-6 steps each): Scorecard, Recruiting, Onboarding, People stats, Org chart (including the reorg sandbox), HR ops, Talent, Compensation (including pay amounts and privacy), Compliance, Listening, AI in HR and the Action center.

Tours are data: an array of steps `{ target: '[data-tour="..."]', title, body, placement, view?, tab? }`.
Components get stable `data-tour` attributes. The tour switches view and tab when a step needs it
and puts filters back when it ends.

## Help articles

Plain-English articles, sentence case, short paragraphs, no em dashes, written for HR people.
They are kept in TypeScript content files so they ship in the one-file build and are searchable.

| Group | Articles |
|---|---|
| **Start here** | What Census is; Moving around (tabs, filters, periods, leader focus); Reading a number (tiles, changes, targets, tiers); Clicking down to the people; Exporting and presenting (figure exports, whole-view workbook and deck, monthly people report) |
| **Each view** | Scorecard, Recruiting, Onboarding, People stats, Org chart, HR ops, Talent, Compensation, Compliance, Listening, AI in HR, Action center. Each covers what it answers, how to read each tab, the questions to ask in a meeting, and its definitions linked to the dictionary. |
| **Your data** | Loading files; Fixing the mapping; Categories & mapping; Data tiers; Certifying data; Data quality tab; When numbers look wrong (a checklist) |
| **Definitions** | How metrics are defined and changed; the glossary (generated from the metric dictionary, so it is never out of date) |
| **Privacy and trust** | What stays in the browser; pay amounts; small groups; employee relations; surveys; immigration details; sample data |
| **Help and support** | Keyboard shortcuts; Report a problem; Troubleshooting (storage blocked, large files, old browsers); FAQ |

## Quality bar

- Every article and tour step is checked by a test: targets exist in the components, links resolve to real routes, tabs and metrics, there are no em dashes, and titles are sentence case.
- The QA crawl opens every article and runs every tour end to end in the browser.
