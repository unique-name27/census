/**
 * The AI in HR tab: a responsible-use note, "Agents by area" (its counts filter the list), the
 * filters, the agents grouped by area as sheets, and the whole catalog as an exportable table.
 */
import { useId } from 'react'
import { Figure } from '@/charts/Figure'
import type { Column, Definition } from '@/charts/types'
import { EmptyState } from '@/components/EmptyState'
import { IconCheck, IconInfo, IconSearch } from '@/components/icons'
import { MultiSelect } from '@/components/MultiSelect'
import { Grid } from '@/components/Section'
import { Button, cx } from '@/components/ui'
import { DRILL_CLASS } from '@/drill/Drill'
import { plural } from '@/lib/format'
import {
  AGENT_AREAS,
  AGENT_AUDIENCES,
  AGENT_STATUSES,
  type Agent,
  type AgentArea,
  type AgentAudience,
  type AgentStatus,
  AREA_LABEL,
  AUDIENCE_LABEL,
  areaCounts,
  catalogRows,
  facetCounts,
  filterAgents,
  groupByArea,
  hasFilters,
  isSampleCatalog,
  toggleArea,
} from '../catalog'
import { useAreasFromRoute } from '../link'
import { M } from '../metrics'
import { useAiAgents } from '../state'
import { AgentCard } from './AgentCard'
import { AgentDialog } from './AgentDialog'
import { CoverageFigure, SourcesFigure, sourceFilterText } from './CatalogCharts'
import { ImportDialog, ResetDialog } from './CatalogDialogs'
import { CATALOG_COLUMNS } from './catalogColumns'
import { useAiUi } from './uiState'

/* ───────── responsible use ───────── */

function UseNote({ sample }: { sample: boolean }) {
  return (
    <aside
      aria-label="Responsible use"
      data-tour="ai-use-note"
      className="col-span-full flex min-w-0 gap-3 rounded-sheet bg-sheet px-4 py-3.5 lg:col-span-4"
    >
      <IconInfo className="mt-0.5 shrink-0 text-ink-2" />
      <div className="min-w-0 text-small leading-snug">
        <h2 className="cut-head text-title font-semibold text-ink">Using agents well</h2>
        <p className="mt-1 text-ink-2">
          Agents assist and people decide: no agent makes a hiring, rating or pay decision. Share only the
          data an agent is approved for, and check what it gives you before you use it.
        </p>
        {sample && (
          <p className="mt-2 text-muted">
            Every agent here is a sample with a sample link. Replace them with the team's own from the Catalog
            menu.
          </p>
        )}
      </div>
    </aside>
  )
}

/* ───────── agents by area ───────── */

interface AreaRow {
  area: string
  agents: number
  inCatalog: number
}

function AreaSummary({ agents }: { agents: readonly Agent[] }) {
  const filters = useAiAgents((s) => s.filters)
  const setFilters = useAiAgents((s) => s.setFilters)
  const counts = areaCounts(agents, filters)
  const narrowed = filters.audiences.length > 0 || filters.statuses.length > 0 || filters.query.trim() !== ''
  const rows: AreaRow[] = counts.map((c) => ({ area: c.label, agents: c.count, inCatalog: c.total }))
  const columns: Column<AreaRow>[] = [
    { key: 'area', label: 'HR area' },
    { key: 'agents', label: narrowed ? 'Agents matching filters' : 'Agents', format: 'int' },
    ...(narrowed ? [{ key: 'inCatalog', label: 'In catalog', format: 'int' as const }] : []),
  ]
  return (
    <Figure
      id="ai-agents-by-area"
      metric={M.byArea}
      title="Agents by area"
      subtitle={
        narrowed
          ? 'Agents that match the audience, status and search filters'
          : 'Every agent in the catalog, by the HR area it serves'
      }
      data={rows}
      columns={columns}
      span={8}
      image={false}
      tableToggle={false}
      // Not a people number: no data tier applies, so the figure is never gated and shows no tier badge.
      uses={[]}
      gate={false}
      note={`${plural(agents.length, 'agent')} in the catalog`}
    >
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-control bg-rule sm:grid-cols-4">
        {counts.map((c) => (
          <li key={c.area} className="min-w-0 bg-sheet">
            <button
              type="button"
              aria-pressed={c.selected}
              disabled={!c.count && !c.selected}
              onClick={() => setFilters(toggleArea(filters, c.area))}
              aria-label={`${c.label}: ${plural(c.count, 'agent')}${c.selected ? ', showing only this area' : ''}`}
              className={cx(
                'group flex h-full w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors focus-visible:-outline-offset-2 disabled:cursor-default',
                c.selected ? 'bg-sheet-2' : 'hover:bg-hover',
              )}
            >
              <span className="flex w-full items-center gap-1 text-meta font-medium text-ink-2">
                <span className="min-w-0 truncate">{c.label}</span>
                {c.selected && <IconCheck className="size-3.5 shrink-0 text-ink" />}
              </span>
              <span
                className={cx(
                  'cut-head text-page-title leading-none font-[650]',
                  c.count ? 'text-ink' : 'text-muted',
                  c.count > 0 && cx(DRILL_CLASS, 'group-hover:decoration-ink'),
                )}
              >
                {c.count}
              </span>
              {narrowed && c.total !== c.count && <span className="text-label text-muted">of {c.total}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Figure>
  )
}

/* ───────── filters ───────── */

function FilterRow({ agents, shown }: { agents: readonly Agent[]; shown: number }) {
  const filters = useAiAgents((s) => s.filters)
  const setFilters = useAiAgents((s) => s.setFilters)
  const clearFilters = useAiAgents((s) => s.clearFilters)
  const searchId = useId()
  const areas = areaCounts(agents, filters)
  const audiences = facetCounts(agents, filters, 'audiences', AGENT_AUDIENCES)
  const statuses = facetCounts(agents, filters, 'statuses', AGENT_STATUSES)
  return (
    <div data-tour="ai-filters" className="flex flex-wrap items-center gap-2">
      <label htmlFor={searchId} className="relative flex h-8 w-full items-center sm:w-72">
        <span className="sr-only">Search agents</span>
        <IconSearch className="pointer-events-none absolute left-2.5 text-muted" />
        <input
          id={searchId}
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          placeholder="Search names, descriptions and uses"
          className="h-8 w-full rounded-control bg-sheet pr-2.5 pl-8 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]"
        />
      </label>
      <MultiSelect
        label="HR area"
        options={AGENT_AREAS.map((a) => ({
          value: a,
          label: AREA_LABEL[a],
          count: areas.find((c) => c.area === a)?.count ?? 0,
        }))}
        value={filters.areas}
        onChange={(v) => setFilters({ areas: v as AgentArea[] })}
        width={260}
      />
      <MultiSelect
        label="Audience"
        options={AGENT_AUDIENCES.map((a) => ({
          value: a,
          label: AUDIENCE_LABEL[a],
          count: audiences.get(a) ?? 0,
        }))}
        value={filters.audiences}
        onChange={(v) => setFilters({ audiences: v as AgentAudience[] })}
        width={240}
      />
      <MultiSelect
        label="Status"
        options={AGENT_STATUSES.map((s) => ({ value: s, label: s, count: statuses.get(s) ?? 0 }))}
        value={filters.statuses}
        onChange={(v) => setFilters({ statuses: v as AgentStatus[] })}
        width={220}
      />
      {filters.sources?.length ? (
        <span className="inline-flex h-8 items-center gap-1 rounded-chip bg-sheet-2 pr-1 pl-2.5 text-small text-ink">
          {sourceFilterText(agents, filters.sources)}
          <Button
            variant="ghost"
            size="sm"
            aria-label="Show agents for every data source"
            onClick={() => setFilters({ sources: [] })}
          >
            Remove
          </Button>
        </span>
      ) : null}
      {hasFilters(filters) && (
        <Button variant="ghost" onClick={clearFilters}>
          Clear filters
        </Button>
      )}
      <p role="status" className="ml-auto text-small text-ink-2">
        {hasFilters(filters)
          ? `Showing ${shown} of ${plural(agents.length, 'agent')}`
          : plural(agents.length, 'agent')}
      </p>
    </div>
  )
}

/* ───────── the catalog table ───────── */

const STATUS_DEFINITION: Definition = {
  term: 'Status',
  text: 'Sample: an example entry with a sample link, to be replaced. Pilot: in trial with a small group. Live: approved for everyday use.',
}

const CATALOG_DEFINITIONS: Definition[] = [
  STATUS_DEFINITION,
  {
    term: "Use it for / Don't use it for",
    text: 'What the agent is good at, and its guardrails. Agents assist and people decide.',
  },
  {
    term: 'Data sources',
    text: 'The systems and pages the agent draws on. Share only data the agent is approved for.',
  },
]

function CatalogFigure({ agents, sample }: { agents: readonly Agent[]; sample: boolean }) {
  const rows = catalogRows(agents, '; ')
  return (
    <Figure
      id="ai-agent-catalog"
      title="Agent catalog"
      subtitle="Every agent with the columns of the AI agents sheet. Lists are separated by semicolons."
      data={rows}
      columns={CATALOG_COLUMNS}
      definitions={CATALOG_DEFINITIONS}
      tableOnly
      table={{ search: 'Search the catalog', maxRows: 6 }}
      // Not a people number: no data tier applies, so the figure is never gated and shows no tier badge.
      uses={[]}
      gate={false}
      note={`${plural(agents.length, 'agent')}${sample ? ' · sample catalog' : ''} · kept in this browser`}
      empty={rows.length ? null : 'The catalog is empty.'}
    />
  )
}

/* ───────── the tab ───────── */

export function AgentsTab() {
  useAreasFromRoute()
  const agents = useAiAgents((s) => s.agents)
  const filters = useAiAgents((s) => s.filters)
  const clearFilters = useAiAgents((s) => s.clearFilters)
  const isDefault = useAiAgents((s) => s.isDefault)
  const openAdd = useAiUi((s) => s.openAdd)
  const confirmReset = useAiUi((s) => s.setConfirmReset)
  const sample = isSampleCatalog(agents)
  const shown = filterAgents(agents, filters)
  const groups = groupByArea(shown)

  return (
    <div className="flex flex-col gap-8">
      <Grid>
        <UseNote sample={sample} />
        <AreaSummary agents={agents} />
        <CoverageFigure agents={agents} />
        <SourcesFigure agents={agents} />
      </Grid>

      <section aria-labelledby="ai-agents-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h2 id="ai-agents-heading" className="cut-head text-section leading-tight font-semibold">
            Agents
          </h2>
          {agents.length > 0 && <FilterRow agents={agents} shown={shown.length} />}
        </div>

        {!agents.length ? (
          <Grid>
            <EmptyState
              title="The catalog is empty"
              body="Add an agent, import an AI agents sheet from the Catalog menu, or reset to the sample."
              action={
                <>
                  <Button variant="primary" size="sm" onClick={() => openAdd()}>
                    Add agent
                  </Button>
                  {!isDefault && (
                    <Button size="sm" onClick={() => confirmReset(true)}>
                      Reset to sample
                    </Button>
                  )}
                </>
              }
            />
          </Grid>
        ) : !shown.length ? (
          <Grid>
            <EmptyState
              title="No agents match these filters"
              body="Try fewer words, or clear the filters to see every agent."
              action={
                <Button size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          </Grid>
        ) : (
          groups.map((g) => (
            <section
              key={g.area}
              aria-labelledby={`ai-area-${g.area}`}
              className="mt-2 flex flex-col gap-2.5"
            >
              <h3 id={`ai-area-${g.area}`} className="flex items-baseline gap-2">
                <span className="cut-head text-title font-semibold text-ink">{g.label}</span>
                <span className="text-small text-muted">{plural(g.agents.length, 'agent')}</span>
              </h3>
              <Grid>
                {g.agents.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    className="col-span-full min-w-0 md:col-span-6 lg:col-span-4"
                  />
                ))}
              </Grid>
            </section>
          ))
        )}
      </section>

      <section aria-labelledby="ai-catalog-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="ai-catalog-heading" className="cut-head text-section leading-tight font-semibold">
            Catalog
          </h2>
          <p className="mt-1 max-w-[70ch] text-small text-ink-2">
            The same agents as a table, to export or paste into a deck. Download the AI agents sheet from the
            Catalog menu to edit it in Excel and import it back.
          </p>
        </div>
        <Grid>
          <CatalogFigure agents={agents} sample={sample} />
        </Grid>
      </section>

      <AgentDialog />
      <ImportDialog />
      <ResetDialog />
    </div>
  )
}
