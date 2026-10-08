/**
 * Developer > Access (docs/ROLES.md, 5.4; docs/ROLES-V2.md 5.13 and 8.3): `accessMatrix` over the
 * registries, the same rows the matrix test snapshots, as one table-only Figure with a column for
 * each of the eleven modes and filters (kind, mode, decision, only where modes differ), and how
 * many surfaces each mode shows, limits and hides.
 */
import { useId, useMemo, useState } from 'react'
import { NOT_SECURITY_LONG } from '@/access/copy'
import { MATRIX_MODES, matrixCounts } from '@/access/matrix'
import { MODE_LABEL, type Mode } from '@/access/modes'
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
  rowHow,
} from '../accessInventory'
import { ACCESS_WORD, MODE_COLUMN_LABEL } from '../inventory'
import { ABOUT_APP, SELECT } from './shared'

const MODE_DEFINITIONS = [
  ABOUT_APP,
  {
    term: 'Limited',
    text: 'Shown with limits the policy states, such as Manager mode’s org-only rows or Finance mode’s cost totals.',
  },
  { term: 'Modes', text: NOT_SECURITY_LONG },
]

export function AccessTab() {
  const theme = useChartTheme()
  const rows = useMemo(() => accessRows(VIEWS), [])
  const kinds = useMemo(() => accessKinds(rows), [rows])
  const [f, setF] = useState<AccessFilter>(NO_ACCESS_FILTER)
  const shown = filterAccessRows(rows, f)
  const counts = matrixCounts(rows)
  const ids = { kind: useId(), mode: useId(), decision: useId(), search: useId() }
  const byMode = MATRIX_MODES.flatMap((m: Mode) =>
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
    ...Object.fromEntries(MATRIX_MODES.map((m) => [m, ACCESS_WORD[r.decisions[m].access]])),
    how: rowHow(r, f.mode),
  }))
  const pick = (d: (typeof byMode)[number]) =>
    setF({ ...NO_ACCESS_FILTER, mode: d.modeKey, decision: d.decisionKey })
  return (
    <>
      <Grid>
        <Figure
          id="dev-access-by-mode"
          title="Surfaces by mode"
          subtitle="Every surface the policy decides, as shown, limited or hidden in each of the eleven modes"
          data={byMode}
          columns={[
            { key: 'mode', label: 'Mode' },
            { key: 'decision', label: 'Decision' },
            { key: 'count', label: 'Surfaces', format: 'int' },
          ]}
          definitions={MODE_DEFINITIONS}
          note={`${plural(rows.length, 'surface')} in the matrix`}
          gate={false}
          span={5}
        >
          <HBars
            data={byMode}
            y="mode"
            x="count"
            series="decision"
            stack="normalize"
            yOrder={MATRIX_MODES.map((m) => MODE_LABEL[m])}
            seriesOrder={['Shown', 'Limited', 'Hidden']}
            colors={{ Shown: theme.seq[600], Limited: theme.seq[400], Hidden: theme.deemph }}
            format="int"
            onSelect={pick}
            onSelectSegment={pick}
            ariaLabel="Share of surfaces shown, limited and hidden in each mode"
          />
        </Figure>
        <div className="col-span-full flex flex-col gap-3 self-start rounded-sheet bg-sheet px-4 pt-4 pb-5 lg:col-span-7 lg:px-5">
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
                {MATRIX_MODES.map((m) => (
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
            {plural(shown.length, 'surface')} of {rows.length}
            {f.mode !== 'all' ? `, read in ${MODE_LABEL[f.mode]} mode` : ''}. The same rows the access matrix
            test snapshots in src/access/__snapshots__/access-matrix.txt.
          </p>
        </div>
      </Grid>
      <Grid className="mt-4">
        <Figure
          id="dev-access-matrix"
          title="Access matrix"
          subtitle="Every surface with its decision in each of the eleven modes, and how a mode limits or hides it"
          data={table}
          columns={[
            { key: 'surface', label: 'Surface', width: 34 },
            { key: 'kind', label: 'Kind', width: 10 },
            ...MATRIX_MODES.map((m) => ({ key: m, label: MODE_COLUMN_LABEL[m], width: 9 })),
            {
              key: 'how',
              label: f.mode === 'all' ? 'How it is limited' : `How ${MODE_LABEL[f.mode]} mode limits it`,
              width: 60,
            },
          ]}
          definitions={MODE_DEFINITIONS}
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
