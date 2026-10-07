/**
 * The AI in HR charts (docs/CHARTS.md, AI in HR): which HR areas have an agent for each audience,
 * and which data sources the most agents draw on. A mark narrows the agent list to the agents it
 * counts and brings the list into view; the detail export lists them.
 */
import { BarList, type Column, Figure, Heatmap } from '@/charts'
import { plural } from '@/lib/format'
import {
  AGENT_AREAS,
  AGENT_AUDIENCES,
  type Agent,
  type AgentFilters,
  AREA_LABEL,
  AUDIENCE_LABEL,
  type CoverageCell,
  coverage,
  NO_FILTERS,
  type SourceRow,
  sourceCounts,
} from '../catalog'
import { M } from '../metrics'
import { useAiAgents } from '../state'

/** How many sources the chart names before folding the rest into Other. */
const TOP_SOURCES = 8

/** Show the list filtered to exactly these agents' facet, and bring it into view. */
function showList(filters: AgentFilters) {
  useAiAgents.getState().setFilters({ ...NO_FILTERS, ...filters })
  const el = typeof document === 'undefined' ? null : document.getElementById('ai-agents-heading')
  const reduce =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
}

const AGENT_COLUMNS: Column[] = [
  { key: 'name', label: 'Agent' },
  { key: 'area', label: 'HR area' },
  { key: 'audience', label: 'Audience' },
  { key: 'status', label: 'Status' },
  { key: 'ownerTeam', label: 'Owner team' },
]

const agentRow = (a: Agent) => ({
  name: a.name,
  area: AREA_LABEL[a.area],
  audience: a.audience.map((x) => AUDIENCE_LABEL[x]).join(', '),
  status: a.status,
  ownerTeam: a.ownerTeam,
})

/* ───────────── agents by area and audience ───────────── */

export function CoverageFigure({ agents }: { agents: readonly Agent[] }) {
  const cells = coverage(agents)
  const gaps = cells.filter((c) => c.agents === 0).length
  const byId = new Map(agents.map((a) => [a.id, a]))
  const columns: Column<CoverageCell>[] = [
    { key: 'areaLabel', label: 'HR area' },
    { key: 'audienceLabel', label: 'Audience' },
    { key: 'agents', label: 'Agents', format: 'int' },
  ]
  return (
    <Figure
      id="ai-agent-coverage"
      metric={M.coverage}
      // Not a people number: no data tier applies, so the figure is never gated and shows no tier badge.
      uses={[]}
      gate={false}
      span={7}
      title="Agents by HR area and audience"
      subtitle="How many agents serve the HR team, managers and employees in each HR area"
      data={cells}
      columns={columns}
      note={`${plural(agents.length, 'agent')} in the catalog · ${plural(gaps, 'area and audience', 'areas and audiences')} with no agent`}
      empty={agents.length ? null : 'The catalog is empty.'}
      detail={{
        label: 'Agents',
        columns: [{ key: 'cell', label: 'Area and audience' }, ...AGENT_COLUMNS],
        rows: () =>
          cells.flatMap((c) =>
            c.ids.flatMap((id) => {
              const a = byId.get(id)
              return a ? [{ cell: `${c.areaLabel}, ${c.audienceLabel}`, ...agentRow(a) }] : []
            }),
          ),
      }}
    >
      <Heatmap
        data={cells}
        x="audienceLabel"
        y="areaLabel"
        value="agents"
        format="int"
        scheme="sequential"
        xOrder={AGENT_AUDIENCES.map((a) => AUDIENCE_LABEL[a])}
        yOrder={AGENT_AREAS.map((a) => AREA_LABEL[a])}
        onSelect={(c) => showList({ ...NO_FILTERS, areas: [c.area], audiences: [c.audience] })}
        selectable={(c) => c.agents > 0}
        lockedNote={(c) => (c.agents ? null : 'No agent')}
      />
    </Figure>
  )
}

/* ───────────── what agents draw on ───────────── */

export function SourcesFigure({ agents }: { agents: readonly Agent[] }) {
  const all = sourceCounts(agents)
  // The bars are the sources two or more agents share: a source one agent reads says little about
  // what agents draw on, and dozens of ties would be ranked by name. The rest are counted in the note.
  const shared = sourceCounts(agents, TOP_SOURCES, 2)
  const rows = shared.length ? shared : sourceCounts(agents, TOP_SOURCES)
  const single = all.filter((r) => r.agents === 1).length
  const columns: Column<SourceRow>[] = [
    { key: 'source', label: 'Data source' },
    { key: 'agents', label: 'Agents', format: 'int' },
    { key: 'areas', label: 'HR areas' },
  ]
  return (
    <Figure
      id="ai-agent-sources"
      metric={M.sources}
      // Not a people number: no data tier applies, so the figure is never gated and shows no tier badge.
      uses={[]}
      gate={false}
      span={5}
      title="What agents draw on"
      subtitle={
        shared.length
          ? 'The systems and documents two or more agents read, most shared first'
          : `The systems and documents the most agents read, top ${TOP_SOURCES}`
      }
      data={rows}
      columns={columns}
      note={[
        `${plural(all.length, 'data source')} across ${plural(agents.length, 'agent')}`,
        shared.length && single
          ? `${plural(single, 'source')} used by one agent each, in All data sources`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      empty={all.length ? null : 'No agent in the catalog lists a data source.'}
      detail={{ label: 'All data sources', columns: columns as Column[], rows: () => all }}
    >
      <BarList
        data={rows}
        label="source"
        value="agents"
        format="int"
        sort="none"
        secondary="areas"
        tone={(d) => (d.source.startsWith('Other (') ? 'deemph' : 'default')}
        onSelect={(d) => showList({ ...NO_FILTERS, sources: d.keys })}
      />
    </Figure>
  )
}

/** "Draws on Greenhouse" or "Draws on any of 6 sources", for the active source filter. */
export function sourceFilterText(agents: readonly Agent[], keys: readonly string[]): string {
  if (keys.length !== 1) return `Draws on any of ${keys.length} sources`
  const row = sourceCounts(agents).find((r) => r.keys[0] === keys[0])
  return `Draws on ${row?.source ?? keys[0]}`
}
