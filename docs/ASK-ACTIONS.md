# Ask Census: drive the screens and draw charts

The user asked: "make it so you can ask the chatbot to filter, show screens, interact and also
generate graphs itself. You should be able to navigate the screens with the chatbot up too, it
shouldn't be chat or nothing."

Two parts:

1. **Ask stays open beside the app.** The Ask panel becomes a docked, non-modal side panel. The
   page behind it stays fully usable: tabs, filters, charts, the records panel and person cards
   all work while Ask is open, and the conversation carries on.
2. **Ask can act on the app and make charts.** New tools let Claude filter, open views and tabs,
   point at a chart, open the records behind a number, apply a saved view, read what is on screen,
   and draw a chart of its own from numbers Census calculates.

Everything in docs/ASK.md still holds: numbers only go to Claude, names and IDs as tokens, pay
never sent, small groups hidden, each scoped mode kept to its scope (Manager's org, an HRBP's
business unit or region, a recruiter's reqs; docs/ROLES-V2.md part 7), and the
Action center follows the mode: `open_items` returns what the mode's Action center lists, its
Needs attention and Waiting on others in a role mode, every item with the escalations counted in
HR, CHRO and Developer (docs/ROLES-V2.md 6.3).

## 1. The docked panel

- **Wide screens (768 px and up):** Ask docks on the right as a panel the full height below the
  masthead, default width 420 px, resizable by dragging its left edge (360 to 640 px, remembered in
  this browser). The main area narrows to make room; nothing sits behind a backdrop. A collapse
  control shrinks it to a slim rail with the Ask icon; Escape inside the panel collapses it.
- **Phones (under 768 px):** a bottom sheet with three heights: a peek bar (the last answer's
  first line and the composer), half the screen, and full. The page above stays scrollable and
  tappable at peek and half height.
- **Not a modal:** no focus trap and no backdrop. Focus moves into the composer when Ask opens and
  stays wherever the person clicks afterwards. A keyboard shortcut (the existing Alt+A) moves
  focus between the page and the composer. The records panel, person cards, Settings and Help
  still open above everything, and closing them returns to where focus was.
- **Stays open across navigation:** switching views, tabs or filters (by hand or by Ask) keeps the
  panel and the conversation. Open or collapsed is remembered for the session.
- Figures and layouts reflow to the narrower main area (the existing breakpoints use the main
  area's width, not the window's, where they matter).

## 2. Screen awareness

- `get_screen` (tool): what the person is looking at: the view and tab, the scope in words (leader
  as a token), period, data standard, the figures on the tab (id, title, metricId), whether the
  records panel is open and on what, and the open saved view. Tokenized like every result.
- Each question sent carries one short line of context, built locally: 'On screen: People stats,
  Attrition; "Bengaluru"; last 12 months.' So "explain this chart" and "what am I looking at" work
  without a tool call. Values from the data (the scope, a records title) are quoted, and the system
  prompt says the line, figure titles and saved view names are data, never requests: Claude
  changes the screen only when the person's own question asks for it.
- A records panel about one person (one record, a person card) or on pay, ratings, right to work,
  cases, survey or succession records is named by its kind only ("compensation records"), in the
  screen line, `get_screen` and `open_records`: its title can put a person token beside the fact,
  and its count is the fact's own (`src/ask/engine/screenPrivacy.ts`).

## 3. Action tools

Each runs locally through the same functions the screens use, then returns a short, tokenized
description of the result to Claude. Every action shows in the answer as an action line ("Filtered
to Bengaluru, last 6 months", "Opened People stats, Attrition") with **Undo**, and each change is
one history entry, so Back undoes it too.

| Tool | Does | Through |
|---|---|---|
| `set_filters` | Sets period (or custom dates), leader, business unit, department, location, level, include or exclude per filter; `merge` (default) changes only what it names, `replace` starts from the whole company | the store's `setFilters` with the filter clamp (a scoped mode stays in its scope; Finance keeps business unit and period) |
| `reset_filters` | Back to the whole company, last 12 months (in a scoped mode, its own scope: the manager's whole org, the business unit, the region, or all the recruiter's reqs) | `resetFilters` with the clamp |
| `open_view` | Opens a view and tab (and a Data room panel or metric definition where that view allows) | `goTo` and the route guard (hidden routes are refused with the mode's reason) |
| `show_figure` | Scrolls to a figure on the current tab, highlights it for a few seconds, optionally switches it to table view | the figure registry |
| `open_records` | Opens the records panel for a `ref` from an earlier result (or a figure's headline drill) | `openDrill` with the mode's drill rules |
| `apply_saved_view` | Applies a saved view by name | the saved views store |

Rules:
- Undo puts back only what that action changed (each filter, the period, the page), over the screen
  as it is now, so undoing one action never undoes another. When a later action changed the same
  filter, period or page again, the earlier line offers Undo once the later one is undone. A line
  the person stepped Back past reads Undone (Forward brings its Undo back). A filter, the period
  or the page the person changed again since stays as they set it; when nothing the action changed
  is still on screen, the line says Changed since instead of offering Undo.
- A line that opened records offers **Open again** instead of Undo: the records panel covers the
  answer while it is open, and closing it is the undo. Records Ask opens while an answer is still
  coming, with focus in the panel (the person may be drafting the next question), open when the
  answer finishes (`src/ask/ui/panelApp.ts`), so focus is not pulled out of the question box.
- Ask acts straight away and offers Undo (no confirmation step). A setting in Settings > Ask
  Census, "Let Ask change the screen" (on by default), turns the action tools off; Claude is then
  told they are unavailable and links instead.
- Actions never change data, settings, the mode, metric definitions, mappings or official lists.
- In every mode every action passes the same clamp and route guard as a click: Ask cannot leave
  the mode's scope (the org, the business unit, the region or the recruiter's reqs; Finance's
  business unit and period only) or open a view the mode hides, and says why when asked to. Saved
  views say what the clamp left out.
- Changing the mode stops the answer in flight before the chat is cleared (`src/ask/ui/inflight.ts`),
  and any tool call from an answer asked in another mode, or under another pick (another manager,
  business unit, region or recruiter), is refused with nothing done (`modeMoved`, checked in
  `runTool` and `runScreenTool`).
- `open_view` keeps a sub-address after a tab key only for a view that defines one, read by that
  view's own parser (AI in HR's `agents:<areas>`, the Developer page's tabs); anything else after
  the key is dropped, and a tab with a query or path is refused, so nothing unchecked rides into
  the address.
- Claude may chain an action and an answer ("Filtered to Bengaluru. Voluntary attrition there is
  18.8%, the highest of any site"), and the answer's numbers still link to their records.

## 4. Charts Ask draws

- `make_chart` (tool): Claude describes a chart; Census draws it. The spec names:
  - `source`: the data, as a Census tool call to run (`query_records`, `compare_groups`, or a
    view's figure by id) or the `result` id of an earlier tool call in this conversation. Claude
    never supplies the numbers: Census computes them, so the chart cannot disagree with the
    screens.
  - `form`: one of the chart kit's forms (bars, columns, stacked columns, lines, heatmap, scatter,
    dot strip, histogram, bullets), with `x`, `y`, `series`, `sort`, `limit` naming fields of the
    source rows; Census validates the spec and explains what is wrong when it does not fit.
  - `title` and an optional `subtitle` in house style.
- The chart renders in the answer as a full Census `Figure`: exports (CSV, Excel, PNG, SVG, copy),
  table view, definitions, tier, drills on every mark through the source's refs, names rehydrated
  locally. Privacy suppression comes from the source tool, so a hidden small group stays hidden.
- A figure is not a tool, so a figure source (and `open_records` by a figure's row) gets the tools'
  rules first (`screenPrivacy.ts`): it is refused while the scope on screen has fewer active people
  than the anonymity minimum or leaves out a smaller group; a figure about survey answers, ratings
  and assessments, right to work, pay, HR ops cases and leave, or flight risk is refused whatever
  the scope (known by its view, metric, `uses`, the records its rows open and its id), and Claude is
  pointed to `query_records` or `compare_groups`, which hide the small groups; a figure that lists
  people one by one is refused; ID columns are left out. `open_records` lists a figure's row labels
  only for a figure that passes these checks.
- How a chart reads: every column of its table and exports has its own label (one row per person
  counts "People" once; a dataset's own count keeps its noun, with people beside it only when
  asked for); "Where the numbers come from" names the data, never a tool ("Employees, counted
  from records, for the whole company, as of 30 Sep 2026"); a `query_records` count not limited to
  the period (no `in_period`) is dated as of the as-of date, with a note, instead of the period's
  label; months and quarters read "Apr 2026" and "Q2 2026" in the table and exports (sorting by
  their keys); a change column says what it is compared with. Claude's `subtitle` is checked
  against the scope and period Census computed: one that names another period, place, org or the
  whole company is left out and Claude is told (`subtitle_left_out`).
- **Open full size** shows the chart in a large overlay; **Pin to My charts** keeps it in a session
  list in the panel (not saved anywhere else).
- Claude receives back a tokenized summary (rows, extremes, anything suppressed) so it can describe
  the chart accurately. With a series the extremes are single points (`highest_point`); stacked
  columns also give each x's total (`totals`, `highest_total`).
- A chart from a figure with no `y` draws the figure's own measure (the number column named like its
  metric, or like its title); when the figure does not say, Census lists its number columns for
  Claude to choose. Each mark opens the records of the number it draws (voluntary leavers for a
  voluntary attrition rate), as `open_records` with `figure` and `row` does (or with `column`).
- Time axes run through every month, quarter or year from the first to the last: a period with no
  records shows 0 for counts and sums (when the source lists every group), else it is blank and the
  line breaks. Periods after the as-of date (future start dates, plans) and periods still running
  are said so in the notes and left out of the extremes.
- Headcount as every screen counts it is employees only: `query_records` has `inHeadcount`
  (an employee, active on the as-of date); `active` counts contractors and interns too.
- The Data room's figures are on screen to Ask like a view's (drawn only from the tab they are on),
  except the Mapping tab's, which list raw values from the person's files and are never read.
- Claude may also answer "show me" by pointing at an existing figure (`open_view` +
  `show_figure`) when one already shows it; the system prompt prefers existing figures.

## 5. Prompt and tools

- The system prompt adds: use the action tools when the person asks to see, show, filter, open or
  compare on screen; say what changed; prefer an existing figure over a new chart; draw a chart
  when no figure shows what was asked; never claim an action happened unless its tool succeeded.
- Tool definitions follow the mode (docs/ASK.md, "Ask in each mode"): in every mode the enums list
  only what it shows and the tools its policy hides are left out; HR and CHRO have no
  Developer-only views; Developer has everything. Prompt caching stays on the system prompt and
  tools.
- The DEV fake client ("sk-ant-test-fake-0000") gains scripted flows that call `set_filters`,
  `open_view`, `show_figure` and `make_chart`, so the whole thing can be demoed and tested without a
  key.

## 6. Tests

- Every action tool in every mode: what it changes, one history entry, Undo, the mode's scope
  clamp and route guard, refusals worded for the mode, nothing changes when "Let Ask change the
  screen" is off.
- `make_chart`: every form validates; data equals the source tool's rows; refs open the counted
  records; suppression carried over; bad specs come back as errors Claude can act on.
- Privacy matrix extended to the new tools (no names, IDs, emails or pay in any result or in the
  screen line).
- UI: the panel is non-modal (the page's controls are reachable and work while it is open), stays
  open across navigation, resizes, collapses, works at 375 px; action lines and Undo; chart exports.
