/**
 * Team shape, under the org chart: the org's silhouette by layer, each manager's span, the size of
 * the org under each direct report with its open roles, and how long people in each of those orgs
 * have been here. Everything follows the chart's root and the dimming filters (only matching
 * people count, as in the key figures). Every bar, segment and dot opens the people (or
 * requisitions) it counts; an org opens with "Filter to" that leader's org.
 */
import { useMemo } from 'react'
import { DotStrip, Figure, HBars } from '@/charts'
import { Section } from '@/components'
import { useAnalytics } from '@/data/context'
import type { Requisition } from '@/data/schema'
import { drill } from '@/drill'
import type { DrillAction, DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { TENURE_BANDS } from '@/lib/people'
import {
  COMPANY_ROOT,
  type DrillScope,
  FIGURE_METRIC,
  type OrgLineage,
  type OrgRules,
  type OrgTree,
  type ReqStub,
  teamShapeDefinitions,
} from '../engine'
import {
  LAYER_ROLES,
  type LayerRow,
  layerPeopleDrill,
  type SpanDot,
  spanDrill,
  TEAM_PARTS,
  type TeamRow,
  type TenureMixRow,
  teamPartDrill,
  teamShape,
  teamShapeUses,
  tenureMixDrill,
} from '../engine/shape'

export function TeamShape({
  tree,
  rootId,
  matcher,
  reqs,
  reqRecords,
  rules,
  lineage,
  scope,
  onShowLayer,
  onShowPerson,
}: {
  tree: OrgTree
  rootId: string
  /** The dimming filters' matcher (null when none is set): only matching people count. */
  matcher: ((id: string) => boolean) | null
  /** Open requisitions per hiring manager, when the Open roles switch is on and meets the standard. */
  reqs?: ReadonlyMap<string, readonly ReqStub[]>
  reqRecords: ReadonlyMap<string, Requisition>
  rules: OrgRules
  lineage: OrgLineage
  scope: DrillScope
  /** Opens the chart down to a layer (1 is the root's layer): "Show on chart" for a layer. */
  onShowLayer?: (layer: number) => void
  /** Selects a person on the chart: "Show on chart" for a manager. */
  onShowPerson?: (id: string) => void
}) {
  const ctx = useAnalytics()
  const shape = useMemo(
    () => teamShape({ tree, rules }, rootId, matcher, reqs),
    [tree, rules, rootId, matcher, reqs],
  )
  const defs = teamShapeDefinitions(ctx.metrics, rules)
  const uses = teamShapeUses(lineage, !!reqs)
  const asOf = formatDate(ctx.asOf)
  const rootName = rootId === COMPANY_ROOT ? 'the whole company' : (tree.people.get(rootId)?.name ?? rootId)
  const counted = matcher ? 'people matching the filters' : 'everyone active, every worker type'
  const { layers, spans, teams, tenure } = shape

  // A layer's records offer "Show on chart" (the chart opened down to that layer), a manager's
  // direct reports offer it too (the manager selected on the chart).
  const showLayer = (layer: string): DrillAction | undefined => {
    const n = Number(layer.match(/\d+/)?.[0])
    return onShowLayer && n ? { label: 'Show on chart', run: () => onShowLayer(n) } : undefined
  }
  const withAction = <S extends DrillSpec>(spec: S | null, action: DrillAction | undefined): S | null =>
    spec && action ? { ...spec, action } : spec
  const layerSeg = (d: LayerRow) =>
    d.people
      ? () => withAction(layerPeopleDrill(tree, rootId, layers, d.layer, d.role, scope), showLayer(d.layer))
      : null
  const layerRow = (d: { layer: string }) => () =>
    withAction(layerPeopleDrill(tree, rootId, layers, d.layer, null, scope), showLayer(d.layer))
  const spanOpen = (d: SpanDot) => () =>
    withAction(
      spanDrill(tree, d, scope),
      onShowPerson ? { label: 'Show on chart', run: () => onShowPerson(d.id) } : undefined,
    )
  const teamSeg = (d: TeamRow) => (d.value ? () => teamPartDrill(tree, teams, d, reqRecords, scope) : null)
  const teamRow = (d: { leaderId: string }) => () =>
    teamPartDrill(tree, teams, { leaderId: d.leaderId, part: null }, reqRecords, scope)
  const tenureSeg = (d: TenureMixRow) =>
    d.people ? () => tenureMixDrill(tree, tenure, d.team, d.band, scope) : null
  const tenureRow = (d: { team: string }) => () => tenureMixDrill(tree, tenure, d.team, null, scope)
  const managersAt = layers.rows.filter((r) => r.role === 'People managers').reduce((a, r) => a + r.people, 0)
  const openTotal = teams.rows.filter((r) => r.part === 'Open roles').reduce((a, r) => a + r.value, 0)

  return (
    <Section
      title="Team shape"
      dek={`Under ${rootName}: people at each layer, each manager's span, and the size and tenure of each org below. Counts ${counted}, as of ${asOf}.`}
    >
      <Figure
        id="org-shape-layers"
        metric={FIGURE_METRIC['org-shape-layers']}
        title="People at each layer"
        subtitle="Layer 1 is the top of this org; people managers lead at least one person"
        data={layers.rows}
        columns={[
          { key: 'layer', label: 'Layer', format: 'text' },
          { key: 'role', label: 'Role', format: 'text' },
          { key: 'people', label: 'People', format: 'int', drill: layerSeg },
        ]}
        definitions={defs.layers}
        uses={uses.layers}
        note={`${plural(layers.total, 'person', 'people')} in ${plural(layers.layers.length, 'layer')} · ${plural(managersAt, 'people manager')} · as of ${asOf}`}
        span={7}
        empty={layers.total ? null : 'Nobody in this org matches the filters.'}
      >
        <HBars
          data={layers.rows}
          y="layer"
          x="people"
          series="role"
          stack
          seriesOrder={LAYER_ROLES}
          yOrder={layers.layers}
          format="int"
          rowHeight={28}
          ariaLabel="People at each layer by role"
          onSelect={(d) => drill(layerRow(d))}
          onSelectSegment={(d) => drill(layerSeg(d))}
        />
      </Figure>
      <Figure
        id="org-span-by-layer"
        metric={FIGURE_METRIC['org-span-by-layer']}
        title="Span of each manager"
        subtitle="Direct reports of every people manager by layer, tick at each layer’s median; wide and narrow spans stand out"
        data={spans.dots}
        columns={[
          { key: 'name', label: 'Manager', format: 'text' },
          { key: 'layer', label: 'Layer', format: 'text' },
          { key: 'directs', label: 'Direct reports', format: 'int', drill: spanOpen },
          { key: 'flag', label: 'Flag', format: 'text' },
        ]}
        definitions={defs.spans}
        uses={uses.spans}
        note={`${plural(spans.dots.length, 'manager')}${spans.median != null ? ` · median ${fmt(spans.median, 'num1')}` : ''} · ${fmt(spans.wide, 'int')} wide (${rules.wideSpan}+), ${fmt(spans.narrow, 'int')} narrow (${
          rules.narrowSpan <= 1 ? '1 report' : `${rules.narrowSpan} or fewer reports`
        })`}
        span={5}
        table={{ search: 'Search managers' }}
        empty={spans.dots.length ? null : 'Nobody in this org manages anyone.'}
      >
        <DotStrip
          data={spans.dots}
          x="directs"
          y="layer"
          id="id"
          label="name"
          xFormat="int"
          yOrder={spans.layers}
          median
          ref={{ value: rules.wideSpan, label: `Wide ${rules.wideSpan}+` }}
          tone={(d) => (d.flag ? 'default' : 'deemph')}
          rowHeight={30}
          ariaLabel="Direct reports of each manager by layer"
          onSelect={(d) => drill(spanOpen(d))}
        />
      </Figure>
      <Figure
        id="org-team-sizes"
        metric={FIGURE_METRIC['org-team-sizes']}
        title={`Orgs under each of ${rootName === 'the whole company' ? 'the top leaders' : `${rootName}'s direct reports`}`}
        subtitle={`Everyone below each leader at every level${teams.openRoles ? ', with their open requisitions' : ''}; largest first`}
        data={teams.rows}
        columns={[
          { key: 'team', label: 'Leader', format: 'text' },
          { key: 'part', label: 'Part', format: 'text' },
          { key: 'value', label: 'Count', format: 'int', drill: teamSeg },
        ]}
        definitions={defs.teams}
        uses={uses.teams}
        note={`${plural(teams.leaders.length, 'org')}${teams.openRoles ? ` · ${plural(openTotal, 'open role')}` : ' · turn on Open roles to add requisitions'}${
          teams.individuals
            ? ` · ${plural(teams.individuals, 'direct report who leads', 'direct reports who lead')} nobody, not shown`
            : ''
        }`}
        span={7}
        empty={teams.leaders.length ? null : 'No direct report of this person leads anyone.'}
      >
        <HBars
          data={teams.rows}
          y="team"
          x="value"
          series="part"
          stack
          seriesOrder={TEAM_PARTS}
          yOrder={teams.leaders.map((l) => l.name)}
          format="int"
          rowHeight={28}
          ariaLabel="People and open roles in each org under this leader"
          onSelect={(d) => drill(teamRow(d))}
          onSelectSegment={(d) => drill(teamSeg(d))}
        />
      </Figure>
      <Figure
        id="org-tenure-mix"
        metric={FIGURE_METRIC['org-tenure-mix']}
        title="Tenure mix by org"
        subtitle="Share of each org by years since hire, newest first"
        data={tenure.rows}
        columns={[
          { key: 'team', label: 'Org', format: 'text' },
          { key: 'band', label: 'Tenure', format: 'text' },
          { key: 'people', label: 'People', format: 'int', drill: tenureSeg },
          { key: 'share', label: 'Share of org', format: 'pct', drill: tenureSeg },
        ]}
        definitions={defs.tenure}
        uses={uses.tenure}
        note={`${plural(tenure.teams.length, 'org')}${
          tenure.folded
            ? ` · ${plural(tenure.folded, 'org')} under ${rules.minGroup} people folded into Other`
            : ''
        }${tenure.hiddenPeople ? ` · ${plural(tenure.hiddenPeople, 'person', 'people')} in small orgs not shown` : ''} · ${
          matcher ? 'people matching the filters' : 'contractors and interns included'
        }`}
        span={5}
        empty={
          tenure.teams.length
            ? null
            : `No org under this person has ${rules.minGroup} or more people, so the mix is hidden to protect anonymity.`
        }
      >
        <HBars
          data={tenure.rows}
          y="team"
          x="people"
          series="band"
          stack="normalize"
          seriesOrder={TENURE_BANDS}
          scheme="ordinal"
          yOrder={tenure.teams}
          rowHeight={28}
          ariaLabel="Tenure mix of each org under this leader"
          onSelect={(d) => drill(tenureRow(d))}
          onSelectSegment={(d) => drill(tenureSeg(d))}
        />
      </Figure>
    </Section>
  )
}
