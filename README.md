# Census

People analytics for an HR team: recruiting, HR business partners, the org chart, employee
services, talent and compensation in one place. It runs entirely in your browser. Files you add
stay on your machine.

## Open it

- **Double-click `census.html`** (or `Launch Census.bat` on Windows for an app-style window). No
  install, server or internet needed. Build it with `npm run build:single`.
- For development: `npm install`, then `npm run dev` and open http://localhost:8820.

It opens on a fictional sample company, Northgate Semiconductor (about 1,450 employees in 13
locations, as of 30 Sep 2026), so every view works before you load anything.

## Views

| Tab | Answers | Sub-tabs |
|---|---|---|
| Recruiting | Are we hiring the people we need, fast enough, and where is the process stuck? | Overview · Pipeline · Requisitions · Sources & offers |
| HR business partners | What does a leader's organization look like, how is it changing, what should come up in the next 1:1? | Overview · Workforce · Attrition · Movement · Org design |
| Org chart | Who reports to whom, how is each team shaped, and what would a reorganization change? | Chart · Reorg sandbox |
| HR ops | Are employees getting fast, correct answers, and are HR transactions on time? | Overview · Cases · HR transactions · Service levels |
| Talent | Is performance assessed fairly, are critical roles covered, who might we lose, is required training done? | Overview · Performance · Potential & succession · Retention risk · Learning |
| Compensation | Is pay where policy says, fair against performance and the market, and is the merit cycle on budget? | Overview · Range position · Pay for performance · Market · Merit cycle |

Every view opens with headline numbers and a **readout**: findings in plain sentences, each with
the number, where it concentrates, and a suggested next step.

One filter row scopes everything: period, a leader's organization, business unit, department,
location and level.

## Every number opens the records behind it

Click a headline number, a bar, a point, a table cell or a finding to see the people or records
behind it: leavers behind an attrition rate, applications behind a funnel stage, cases behind an
SLA miss. The list sorts, searches and exports. Click a person to see their card: role, reporting
line, team, reviews, job history and open items.

## Exports

Every chart has an export menu: CSV, Excel, copy as a table, PNG and SVG. The view header exports
the current tab, or the whole view, as an Excel workbook (a sheet per chart) or a PowerPoint deck
(a slide per chart). Exports carry the scope, window and as-of date, and say "Sample data" when
they come from the sample.

## Your data

Open the **Data room** (top right). Drop one or more Excel or CSV files; a workbook with several
sheets works too. Census recognizes each sheet's dataset from its columns, proposes a column
mapping you can change, shows what will import and what needs attention, then replaces that
dataset. It remembers your mapping for files with the same layout. Download the sample workbook
or a blank template to see the expected columns.

Ten datasets: Employees, Job changes, Requisitions, Candidates, HR cases, HR transactions,
Reviews, Succession, Learning, Compensation. Any of them can stay on sample data while you replace
the others.

## Privacy

- Nothing is sent anywhere. Uploaded data is kept in this browser's local storage only.
- No gender or other protected characteristics are used.
- Pay amounts are hidden until you switch on "Show pay amounts" for the session; ratios such as
  compa-ratio are always shown.
- Rates for groups smaller than five people are hidden.

## Related tools

The **Tools** menu links to the pipeline dashboard, career lattice, manager toolkit and the HR
process catalog (Hire-to-Retire Atlas). Service-level measures link to the Atlas process that
governs them.

## Built with

Vite 8, React 19.3 with the React Compiler, TypeScript 7, Tailwind CSS 4.3, Observable Plot and
d3, Zustand, Base UI, SheetJS and ExcelJS, pptxgenjs, Vitest and Biome. `npm run verify` runs the
type check, lint, tests and both builds. See `ARCHITECTURE.md` for the design system, data model,
metric definitions and module ownership, and `docs/VIEWS.md` for what each view measures.
