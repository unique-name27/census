# Filters: links, saved views, exclude, and "Filter to this"

The user picked four additions to the one filter row that scopes every tab (period, leader,
business unit, department, location, level; see `src/data/scope.ts`):

1. Filters in the URL, so links share the exact view and Back undoes a filter change.
2. Saved views, such as "My org, last quarter".
3. An exclude option on each filter.
4. "Filter to this" as a second action in the records panel: click a bar, see its records, then
   narrow everything to it.

The filter model stays global: one scope for every tab, never per-tab or per-chart filters, and a
click on a number still opens its records.

## 1. Filters in the URL

**Format.** The route stays as it is (`#view.tab`, including the views' own suffixes such as
`#data.metrics/hrbp/attrition/voluntary`, `#ai.agents:compliance`, `#data.candidates-mapping`), and
the scope follows a `?` at the end of the hash, written with `URLSearchParams`:

`#hrbp.attrition?period=t6m&bu=Silicon+Engineering&dept=Design+Verification&dept=Physical+Design&level=L4`

- Keys: `period` (`t12m`, `ytd`, `lastQuarter`, `t6m`, `t3m`, `custom`), `from` and `to` (ISO dates,
  custom only), `leader` (employee ID, never a name), `bu`, `dept`, `loc`, `level` (repeated for
  several values), `not` (the dimensions in exclude mode, e.g. `not=bu&not=loc`), `std` (data
  standard, when not the default) and `lens=1` (the data quality lens, when on). Defaults are left
  out, so the whole company over the last 12 months is just `#hrbp.attrition`.
- The hash never reaches a server; that is why the scope lives there. Names never go in the URL.
- `parseHash` strips the `?…` part before reading the route, so every existing route and
  view-suffix parser keeps working. One function writes the hash for both route and scope; every
  link and `goTo`/`navigate` call keeps the current scope.

**Loading.**
- A URL with scope parameters applies exactly that scope (and `scope=all` means "whole company,
  defaults", for links that must reset a recipient's filters).
- A URL without them restores your last filters from this browser, as today, and writes them into
  the address with `replaceState`.
- Values the loaded data doesn't have (a leader not in the roster, a department that doesn't
  exist) are left out, and a toast says which ("The link's department Photonics is not in your data,
  so it was left out."). A link only reproduces a view for someone with the same data loaded; the
  sample data always matches.
- A custom period follows the period control's rules: real dates, and an end no later than the
  reporting date (a later end is cut to it; a period that starts after it gives way to the default),
  with a toast. The same goes for a saved view.
- The data standard and the lens in an address are the tab's own: a link, Back and Forward or a
  saved view shows them in that tab without saving them, so other open tabs never follow. The data
  standard control and Settings save it.

**History.**
- Each filter change and each change of view or tab pushes one history entry, so Back undoes a
  filter change and Forward redoes it. Rapid changes (typing a custom date, ticking several
  departments in one open menu) collapse into one entry: push when the menu closes or after
  ~600 ms of quiet.
- Back and Forward restore the route and the scope together, without pushing new entries.
- Opening a drill, Settings, Help or Ask does not touch history, and neither do guided tours or
  another open tab's changes (they correct this tab's address in place).

**Copy link.** "Copy link to this view" in the view header's export menu copies the full address
with explicit scope (`scope=all` when at defaults), with a toast. It also sits in each saved
view's menu.

## 2. Saved views

- A **Views** menu at the start of the filter row: the saved views (the active one checked),
  **Save current view…**, and **Manage views…**.
- A saved view holds a name, the scope (period and custom dates, leader, org filters with their
  include or exclude modes, data standard, quality lens) and, optionally, the page (view and tab;
  "Open on this page" in the save dialog, off by default).
- Applying a saved view sets the scope in one step (one history entry) and, when it has a page,
  goes there.
- The filter row shows the active saved view's name while the scope matches it exactly, and
  "edited" once you change something. **Update "My org"** saves the change; **Save as new** keeps
  both.
- Manage: rename, reorder, delete with undo, copy link, and **Open Census with this view** (one at
  most; otherwise Census opens with your last filters).
- Stored in this browser under `census:views` and part of the settings file (export and import).
  At most 50: a full list refuses a new view rather than dropping one.
  Leaders are stored by employee ID; a saved view whose leader is not in the loaded data applies
  without that filter and says so.
- Two starting examples on the sample data, removable like any other: "Silicon Engineering, last
  6 months" and "Bengaluru, year to date". None when your own data is loaded (an example set to
  open Census is then forgotten, and Census opens with your last filters).

## 3. Exclude on each filter

- Each org filter (leader, business unit, department, location, level) gets an **Include / Exclude**
  switch at the top of its menu. Exclude keeps everyone except the chosen values; for the leader,
  everyone except that leader's whole org.
- One mode per filter; filters combine with AND as today ("Silicon Engineering, not Bengaluru, not
  L1"). Exclude without values lasts only while its menu is open: removing the last value, a link
  or a saved view drops it, as the address does.
- Chips and scope labels read naturally: "Not Sales", "Not in Allison Carter's org", and exports
  say "Whole company except Sales". Filter option counts and the leader picker reflect the other
  active filters, exclusions included.
- With Exclude on, a value or leader that would leave out between 1 and the anonymity minimum − 1
  active employees (1 to 4 by default) can't be picked, and the menu says why: comparing the scope
  with and without it would single those people out. It is the rule Ask applies to its scopes and
  the records panel to "Leave out" (`src/data/exclusion.ts`). A value already picked stays, so it
  can be taken off.
- `scopeDatasets` applies exclusions to every dataset the way it applies inclusions today: each
  dataset follows its people; requisitions by their own org fields (leader exclude: the hiring
  manager is not in that org); hiring plan lines by their own org fields; cases with an unknown
  requester under a location-only scope by the case's own location. A record with a blank value
  for an excluded dimension stays in (it is not one of the excluded values).
- "vs company" comparisons, the Scorecard, the Action center, the Org chart (excluded cards
  dimmed, like non-matching cards today) and Ask's tools all follow exclusions. Ask's tool schemas
  (`src/ask/engine`) gain the same exclude modes, and `get_context` describes them.
- Old saved filters without modes load as include.

## 4. "Filter to this" in the records panel

- `DrillSpec` gains an optional `filter?: Partial<Filters>` (the same shape findings already use for
  "Focus on"): the scope that reproduces the group the number counts, set by the code that builds
  the drill. A bar for Bengaluru sets `{ location: ['Bengaluru'] }`; a department row sets
  `{ department: [...] }`; a leader's row sets `{ leaderId }`; a level column sets `{ level: [...] }`.
  A month or quarter bar may set a custom period. Numbers that are not a filterable group (offer
  acceptance, a single req, a survey driver) set nothing.
- When the open records have a `filter`, the panel header shows **Filter to Bengaluru** and
  **Leave out Bengaluru**. Either one closes the panel, narrows the scope you are in (other
  dimensions unchanged), pushes one history entry and shows a toast with Undo. The toast names the
  new scope, and the period too when the action set one. Focus then goes to the same figure's
  title (or the main region), never to the page body.
- The actions narrow the scope; they never widen it (`narrowFilters` in `src/drill/filter.ts`):
  - **Filter to X** keeps the people in both the scope and X. From "San Jose, Bengaluru", Filter to
    Bengaluru gives Bengaluru; from "not Hsinchu", Filter to Asia Pacific gives its other sites. A
    month or quarter replaces the period.
  - **Leave out X** keeps the scope without X, so its numbers drop by exactly X's. An included list
    loses X ("San Jose, Bengaluru" becomes "San Jose"), an excluded list gains it ("not Hsinchu"
    becomes "not Hsinchu, Bengaluru"), and a dimension with no filter excludes X. It takes one group
    of one dimension, never a period.
  - There is one leader slot. Inside a leader's org, Filter to a sub-org narrows to it, and Leave
    out a sub-org is not offered ("L's org but not M's" can't be said). Outside a leader's org,
    Filter to an org apart from it is exact, an org around or inside it is not offered, and Leave
    out an org around it replaces it.
- An action is not offered when the filters can't say it, when it changes nothing (Filter to a
  group that is the whole scope, such as the top leader's org), when it would leave no one, or
  when it would leave out between 1 and the anonymity minimum − 1 active employees, or add an
  exclusion that does (the rule in part 3). Neither is offered when a value is not in the loaded
  data.
- The actions name the group as the row does. A drill whose group is several values that readers
  call something else sets `filterLabel` ("Filter to Asia Pacific", "Filter to Design Verification
  L1-L3"); quarters read "Q4 2024", as in the figures.
- Invariant, tested: after "Filter to X" from a number N, the same figure's number for X in the
  new scope is N, and for a count so is its total. A rate keeps its value. A share of the scope
  becomes 100%, since X is then the whole scope, and its count stays N. After "Leave out X" the
  figure's total drops by exactly N. The tests check this from the default scope and from inside
  other filters: the same dimension included, excluded and with one value, a leader's org, and
  everyone except a leader's org (`src/drill/testing.ts`).
- Producers: every view engine's drills for groups of a filterable dimension set `filter`. Chart
  kit helpers that build per-group drills take the dimension so they can set it once. A month or
  quarter bar sets a custom period when the figure follows the period. Figures with a fixed history
  that the period doesn't change (People stats' 8 quarters, HR ops' 24-month trends) set no period:
  "Filter to" could not reproduce their number.
- The person card's "Focus on their org" and findings' "Focus on" use the same history entry, toast
  and Undo. They merge the group in rather than narrow: each dimension the filter names replaces
  that dimension's values and mode (`mergeFilter`).

## Help and tests

- Help: update the filters article (URL and Back, saved views, exclude, Filter to this), add
  saved views and exclude to the Getting started tour's filter step, and mention Copy link in the
  exports article. Help content tests pass.
- Tests: URL round trip for every filter combination including exclusions, custom dates and
  special routes; unknown values left out with the message; history coalescing; saved views CRUD,
  matching and "edited", settings file round trip, missing leaders; `scopeDatasets` with
  exclusions for every dataset (recount from raw rows); the "Filter to this" invariant on a
  sample of drills from every view.
