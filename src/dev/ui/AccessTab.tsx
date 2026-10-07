/**
 * Developer > Access (docs/ROLES.md, 5.4): `accessMatrix` over the registries, the same rows the
 * matrix test snapshots, as one table-only Figure with filters (kind, mode, decision, only where
 * modes differ), and how many surfaces each mode shows, limits and hides.
 */
import { useId, useMemo, useState } from 'react'
import { type MatrixRow, matrixCounts } from '@/access/matrix'
import { MODE_LABEL, MODES, type Mode } from '@/access/modes'
import { Figure, HBars, useChartTheme } from '@/charts'
import { IconSearch } from '@/components/icons'
import { Grid } from '@/components/Section'
import { Switch } from '@/components/ui'
import { plural } from '@/lib/format'
import { VIEWS } from '@/views/registry'
import {
  type AccessFilter,
  accessKinds,
  accessRows,
  filterAccessRows,
  NO_ACCESS_FILTER,
} from '../accessInventory'
import { ACCESS_WORD } from '../inventory'
import { ABOUT_APP } from './shared'

const SELECT =
  'h-8 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]'

const howText = (r: MatrixRow) =>
  [r.hr.how && `HR: ${r.hr.how}`, r.manager.how && `Manager: ${r.manager.how}`].filter(Boolean).join(' ')

export function AccessTab() {
  const theme = useChartTheme()
  const rows = useMemo(() => accessRows(VIEWS), [])
  const kinds = useMemo(() => accessKinds(rows), [rows])
  const [f, setF] = useState<AccessFilter>(NO_ACCESS_FILTER)
  const shown = filterAccessRows(rows, f)
  const counts = matrixCounts(rows)
  const ids = { kind: useId(), mode: useId(), decision: useId(), search: useId() }
  const byMode = MODES.slice()
    .sort((a, b) => (a === 'developer' ? -1 : b === 'developer' ? 1 : 0))
    .flatMap((m: Mode) =>
      (['shown', 'limited', 'hidden'] as const).map((d) => ({
        mode: MODE_LABEL[m],
        modeKey: m,
        decision: ACCESS_WORD[d],
        decisionKey: d,
        count: counts[m][d],
      })),
    )
  const table = shown.map((r) => ({
    surface: r.surface,
    kind: r.kind,
    developer: ACCESS_WORD[r.developer.access],
    hr: ACCESS_WORD[r.hr.access],
    manager: ACCESS_WORD[r.manager.access],
    how: howText(r),
  }))
  return (
    <>
      <Grid>
        <Figure
          id="dev-access-by-mode"
          title="Surfaces by mode"
          subtitle="Every surface the policy decides, as shown, limited or hidden in each mode"
          data={byMode}
          columns={[
            { key: 'mode', label: 'Mode' },
            { key: 'decision', label: 'Decision' },
            { key: 'count', label: 'Surfaces', format: 'int' },
          ]}
          definitions={[
            ABOUT_APP,
            {
              term: 'Limited',
              text: 'Shown with limits the policy states, such as Manager mode’s org-only rows.',
            },
          ]}
          note={`${plural(rows.length, 'surface')} in the matrix`}
          gate={false}
          span={4}
        >
          <HBars
            data={byMode}
            y="mode"
            x="count"
            series="decision"
            stack="normalize"
            seriesOrder={['Shown', 'Limited', 'Hidden']}
            colors={{ Shown: theme.seq[600], Limited: theme.seq[400], Hidden: theme.deemph }}
            format="int"
            onSelect={(d) => setF({ ...NO_ACCESS_FILTER, mode: d.modeKey, decision: d.decisionKey })}
            onSelectSegment={(d) => setF({ ...NO_ACCESS_FILTER, mode: d.modeKey, decision: d.decisionKey })}
            ariaLabel="Share of surfaces shown, limited and hidden in each mode"
          />
        </Figure>
        <div className="col-span-full flex flex-col gap-3 self-start rounded-sheet bg-sheet px-4 pt-4 pb-5 lg:col-span-8 lg:px-5">
          <h2 className="cut-head text-title font-semibold">Filters</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor={ids.kind} className="flex flex-col gap-1 text-meta text-ink-2">
              Kind
              <select
                id={ids.kind}
                className={SELECT}
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value })}
              >
                <option value="all">Every kind</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={ids.mode} className="flex flex-col gap-1 text-meta text-ink-2">
              Mode
              <select
                id={ids.mode}
                className={SELECT}
                value={f.mode}
                onChange={(e) => setF({ ...f, mode: e.target.value as AccessFilter['mode'] })}
              >
                <option value="all">Any mode</option>
                {(['developer', 'hr', 'manager'] as const).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={ids.decision} className="flex flex-col gap-1 text-meta text-ink-2">
              Decision
              <select
                id={ids.decision}
                className={SELECT}
                value={f.decision}
                onChange={(e) => setF({ ...f, decision: e.target.value as AccessFilter['decision'] })}
              >
                <option value="all">Any decision</option>
                <option value="shown">Shown</option>
                <option value="limited">Limited</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <label
              htmlFor={ids.search}
              className="relative flex min-w-0 flex-1 basis-48 flex-col gap-1 text-meta text-ink-2"
            >
              Search
              <span className="relative flex items-center">
                <IconSearch className="pointer-events-none absolute left-2.5 size-4 text-muted" />
                <input
                  id={ids.search}
                  type="search"
                  value={f.query}
                  onChange={(e) => setF({ ...f, query: e.target.value })}
                  placeholder="Surface or how"
                  className={`${SELECT} w-full pl-8`}
                />
              </span>
            </label>
          </div>
          <Switch
            checked={f.differ}
            onChange={(on) => setF({ ...f, differ: on })}
            label="Only where modes differ"
          />
          <p className="text-meta text-muted">
            {plural(shown.length, 'surface')} of {rows.length}. The same rows the access matrix test snapshots
            in src/access/__snapshots__/access-matrix.txt.
          </p>
        </div>
      </Grid>
      <Grid className="mt-4">
        <Figure
          id="dev-access-matrix"
          title="Access matrix"
          subtitle="Every surface with its decision in Developer, HR and Manager mode, and how a mode limits or hides it"
          data={table}
          columns={[
            { key: 'surface', label: 'Surface', width: 34 },
            { key: 'kind', label: 'Kind', width: 10 },
            { key: 'developer', label: 'Developer', width: 9 },
            { key: 'hr', label: 'HR', width: 8 },
            { key: 'manager', label: 'Manager', width: 9 },
            { key: 'how', label: 'How it is limited', width: 60 },
          ]}
          definitions={[ABOUT_APP]}
          note={`${plural(table.length, 'surface')}`}
          gate={false}
          span={12}
          tableOnly
          table={{ maxRows: 30 }}
          empty={table.length ? null : 'No surface matches these filters.'}
        />
      </Grid>
    </>
  )
}
