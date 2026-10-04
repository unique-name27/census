/**
 * Chart tab: key figures, the org chart (search, levels, color key, open roles, flags, pan and zoom,
 * detail panel, slides) and the table of flagged people. Every number opens the records behind it:
 * the tiles, the cards' "6 direct · 41 org", the table cells and the detail panel's team figures.
 */
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DataTable, Figure } from '@/charts'
import { Button, Grid, IconSlides, KpiStrip, Switch, toast } from '@/components'
import { useAnalytics } from '@/data/context'
import type { Employee } from '@/data/schema'
import { useCensus } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import {
  COMPANY_ROOT,
  canExpand,
  chartDefinitions,
  chartUses,
  colorScheme,
  type DrillScope,
  defaultSlideLeaders,
  directsDrill,
  entryPoints,
  exportCut,
  FIGURE_METRIC,
  flagRows,
  flagTableDefinitions,
  flagTableUses,
  heldBackNotes,
  isWithin,
  layoutTree,
  openRoleDrill,
  orgDrill,
  orgKeyFigures,
  orgKpis,
  orgLineage,
  STRUCTURAL,
  scopeLabel,
  shownRows,
  subtreeOf,
  usableColor,
  visibleIds,
  visibleTree,
} from '../engine'
import { ORG_JUMP_EVENT, takeOrgJump } from '../link'
import { Canvas } from './Canvas'
import { ColorControl, ColorLegend, LevelsControl, RootTrail } from './Controls'
import { DetailPanel } from './DetailPanel'
import { ExitDialog } from './ExitDialog'
import { ExportSvg } from './ExportSvg'
import { PersonSearch } from './PersonSearch'
import { SlidesDialog } from './SlidesDialog'
import { useChartPrefs } from './state'
import { flagColumns, personColumns, TableToggle } from './tables'
import { useExpansion } from './useExpansion'
import { useOrgModel } from './useOrgModel'

const FLAG_KINDS = new Set([...STRUCTURAL, 'placement'])

const isPerson = (e: Employee | undefined): e is Employee => !!e

/** Under the lg breakpoint the detail panel sits below the chart. */
const panelBelow = () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches

export function ChartTab() {
  const ctx = useAnalytics()
  const model = useOrgModel()
  const setFilters = useCensus((s) => s.setFilters)
  const { tree, flags } = model
  const [prefs, setPrefs] = useChartPrefs()
  const [focusId, setFocusId] = useState<string | null>(null)
  const rootId =
    focusId && tree.people.has(focusId) && isWithin(tree, focusId, model.rootId) ? focusId : model.rootId
  const f = ctx.filters
  const dimKey = JSON.stringify([f.businessUnit, f.department, f.location, f.level])
  const expanded = useExpansion(tree, rootId, model.dims ? model.matches : null, dimKey)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId && tree.people.has(selectedId) ? selectedId : null
  const [centerReq, setCenterReq] = useState<{ id: string; n: number } | null>(null)
  const [exitId, setExitId] = useState<string | null>(null)
  const [slidesOpen, setSlidesOpen] = useState(false)
  const [slideLeaders, setSlideLeaders] = useState<string[]>([])
  const [pendingJump, setPendingJump] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)

  // When the dimming filters change, bring the largest matching group into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the filter key changes
  useEffect(() => {
    if (!model.dims) return
    const first = entryPoints(tree, rootId, model.matches)[0]
    if (first) setCenterReq((r) => ({ id: first, n: (r?.n ?? 0) + 1 }))
  }, [dimKey])
  const chartRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Layers whose data is below the data standard are held back; the chart itself stays.
  const reqs = prefs.showReqs && model.gates.reqCards.ok ? model.reqs : undefined
  const colorBy = usableColor(model.gates, prefs.colorBy)
  const orgIds = useMemo(() => subtreeOf(tree, rootId), [tree, rootId])
  // Color slots come from the whole roster, so a department keeps its color in any focus.
  const allPeople = useMemo(() => [...tree.people.values()], [tree])
  const scheme = useMemo(
    () => colorScheme(colorBy, allPeople, ctx.asOf, orgIds.map((id) => tree.people.get(id)).filter(isPerson)),
    [colorBy, allPeople, orgIds, tree, ctx.asOf],
  )
  const vtree = useMemo(
    () => visibleTree(tree, rootId, expanded.ids, { reqs }),
    [tree, rootId, expanded.ids, reqs],
  )
  const layout = useMemo(() => layoutTree(vtree), [vtree])
  // The image export keeps to a readable number of cards: the top levels of a bigger chart.
  const exportImage = useMemo(() => {
    const cut = exportCut(tree, rootId, expanded.ids, { vtree, layout }, reqs)
    return {
      layout: cut.layout,
      caption:
        cut.depth == null
          ? null
          : `Top ${cut.depth + 1} levels of the chart. Use Org slides for each leader's team.`,
    }
  }, [tree, rootId, expanded.ids, vtree, layout, reqs])
  // The export mirror catches up after the chart paints.
  const exportView = useDeferredValue(exportImage)
  const rows = useMemo(() => shownRows(tree, visibleIds(vtree), flags), [tree, vtree, flags])
  const matcher = model.dims ? model.matches : null
  const key = useMemo(() => orgKeyFigures(model, rootId, matcher), [model, rootId, matcher])
  const scopeIds = key.people
  const flagTable = useMemo(
    () => flagRows(tree, model.dims ? scopeIds : orgIds, flags, FLAG_KINDS),
    [tree, model.dims, scopeIds, orgIds, flags],
  )

  const rootName = rootId === COMPANY_ROOT ? 'Whole company' : (tree.people.get(rootId)?.name ?? '')
  const scope: DrillScope = { label: scopeLabel(tree, rootId), asOf: ctx.asOf, filtered: model.dims }
  /**
   * Scope for one person's numbers (cards, rows, detail panel): the org the chart shows, without
   * the dimming filters (a card counts everyone under the person).
   */
  const chartScope: DrillScope = { label: scope.label, asOf: ctx.asOf }
  const countDrill = (id: string, which: 'directs' | 'org') =>
    which === 'directs' ? directsDrill(tree, id, chartScope) : orgDrill(tree, id, chartScope)
  const reqDrill = (reqId: string) => openRoleDrill(tree, model.reqRecords, reqId, chartScope)

  // On narrow screens the panel sits below the chart: bring it into view once it shows the card
  // the reader just picked on the chart.
  const revealPanel = useRef(false)
  const select = (id: string | null) => {
    setSelectedId(id)
    revealPanel.current = !!id && panelBelow()
  }
  useEffect(() => {
    if (!revealPanel.current || !selectedId) return
    revealPanel.current = false
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const jump = (id: string, opts: { scroll?: boolean } = {}) => {
    if (!tree.people.has(id)) {
      const e = ctx.org.byId.get(id)
      if (!e) return
      const left = !!e.terminationDate && e.terminationDate <= ctx.asOf
      toast(`${e.name} is not on the chart`, {
        description: left
          ? `They left on ${formatDate(e.terminationDate)}. The chart shows people active on ${formatDate(ctx.asOf)}.`
          : e.hireDate > ctx.asOf
            ? `They start on ${formatDate(e.hireDate)}. The chart shows people active on ${formatDate(ctx.asOf)}.`
            : `The chart shows people active on ${formatDate(ctx.asOf)}.`,
      })
      return
    }
    if (!isWithin(tree, id, model.rootId)) {
      const leader = tree.people.get(model.rootId)?.name ?? 'the selected leader'
      toast(`${tree.people.get(id)!.name} is outside ${leader}'s org`, {
        description: 'The leader filter limits the chart to that org.',
        action: {
          label: 'Show whole company',
          onClick: () => {
            setFilters({ leaderId: null })
            setPendingJump(id)
          },
        },
      })
      return
    }
    let root = rootId
    if (!isWithin(tree, id, rootId)) {
      setFocusId(null)
      root = model.rootId
    }
    expanded.reveal(id, { root })
    setShowTable(false)
    setSelectedId(id)
    setCenterReq((r) => ({ id, n: (r?.n ?? 0) + 1 }))
    if (opts.scroll) chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  // Window events and timers call the latest jump (the tree, root and expansion change).
  const jumpRef = useRef(jump)
  useLayoutEffect(() => {
    jumpRef.current = jump
  })

  // After "Show whole company" widens the filter, finish the jump on the new model.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per model change for a pending jump
  useEffect(() => {
    if (!pendingJump || !isWithin(tree, pendingJump, model.rootId)) return
    const id = pendingJump
    setPendingJump(null)
    jump(id)
  }, [model])

  // Jumps requested from other views and from person cards (openInOrgChart): one pending on
  // mount, plus a window event while this tab is open.
  useEffect(() => {
    const pending = takeOrgJump()
    if (pending) jumpRef.current(pending, { scroll: true })
    const onJump = (ev: Event) => {
      const id = (ev as CustomEvent<string>).detail
      if (typeof id === 'string' && takeOrgJump() === id) jumpRef.current(id, { scroll: true })
    }
    window.addEventListener(ORG_JUMP_EVENT, onJump)
    return () => window.removeEventListener(ORG_JUMP_EVENT, onJump)
  }, [])

  const focus = (id: string | null) => {
    setFocusId(id)
    setSelectedId(id)
  }

  const openSlides = (leader?: string) => {
    setSlideLeaders(leader ? [leader] : defaultSlideLeaders(tree, rootId))
    setSlidesOpen(true)
  }

  if (!tree.people.size) return null

  // Key figures for the org on screen (only the people matching the filters when they are on).
  const people = orgIds.length
  const lineage = orgLineage(model, rootId, f)
  const chartFields = chartUses({ ...lineage, colorBy, reqCards: !!reqs })
  const kpis = orgKpis({
    tree,
    rootId,
    key,
    scope,
    flags,
    reqRecords: model.reqRecords,
    lineage,
    dims: model.dims,
    openRoles: prefs.showReqs,
    metrics: ctx.metrics,
  })
  const { gates } = model
  const heldBack = heldBackNotes(gates, {
    colorBy: prefs.colorBy,
    openRoles: prefs.showReqs,
    flags: prefs.showFlags,
  })

  const title = rootId === tree.rootId ? 'Org chart' : `Org chart: ${rootName}`
  const dimNote = model.dims
    ? ` ${plural(key.people.length, 'person matches', 'people match')} the filters; everyone else is dimmed so reporting lines stay readable.`
    : ''
  const flaggedPeople = new Set(flagTable.filter((r) => STRUCTURAL.has(r.kind)).map((r) => r.employeeId)).size

  return (
    <div className="space-y-4">
      <KpiStrip kpis={kpis} id="org-key-figures" />
      <Grid>
        <Figure
          id="org-chart"
          title={title}
          subtitle={`Reporting lines on ${formatDate(ctx.asOf)}, everyone active including contractors and interns`}
          data={rows}
          columns={personColumns(tree, chartScope)}
          metric={FIGURE_METRIC['org-chart']}
          definitions={chartDefinitions(ctx.metrics, model.rules)}
          note={`${plural(rows.length, 'person', 'people')} shown of ${fmt(people, 'int')} in this org.${dimNote} Drag to pan, or click the chart and scroll. Ctrl and scroll, or pinch, to zoom. Arrow keys move through the tree. Click a count on a card to list those people.`}
          tableToggle={false}
          uses={chartFields}
          actions={
            <>
              <Button size="sm" icon={<IconSlides />} onClick={() => openSlides()}>
                Org slides
              </Button>
              <TableToggle showTable={showTable} onChange={setShowTable} />
            </>
          }
        >
          <div ref={chartRef} className="relative scroll-mt-4">
            {showTable && (
              <DataTable
                columns={personColumns(tree, chartScope)}
                rows={rows}
                caption={title}
                maxRows={15}
                search="Search people"
                onRowClick={(r) => jump(r.employeeId)}
              />
            )}
            <div hidden={showTable}>
              <div data-tour="org-controls" className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <PersonSearch
                  people={tree.people}
                  orgSize={(id) => tree.total.get(id) ?? 0}
                  onPick={jump}
                  slashKey
                  className="w-full sm:w-64"
                  placeholder="Find a person"
                />
                <LevelsControl value={expanded.preset} onChange={expanded.setLevels} />
                <ColorControl
                  value={colorBy}
                  onChange={(c) => setPrefs({ colorBy: c })}
                  gates={gates.color}
                />
                <Switch
                  checked={prefs.showReqs}
                  onChange={(v) => setPrefs({ showReqs: v })}
                  label="Open roles"
                />
                <Switch
                  checked={prefs.showFlags}
                  onChange={(v) => setPrefs({ showFlags: v })}
                  label="Flags"
                />
              </div>
              <div className="mt-2.5 flex flex-wrap items-start gap-x-6 gap-y-2">
                <RootTrail
                  tree={tree}
                  rootId={rootId}
                  globalRootId={model.rootId}
                  onFocus={(id) => focus(id)}
                  onWiden={(id) => {
                    setFocusId(null)
                    setFilters({ leaderId: id })
                  }}
                />
                <ColorLegend scheme={scheme} className="ml-auto" />
              </div>
              {heldBack.length > 0 && <p className="mt-2 text-[12px] text-muted">{heldBack.join(' ')}</p>}

              <div className="mt-3 flex flex-col gap-3 lg:flex-row">
                <Canvas
                  tree={tree}
                  layout={layout}
                  rootId={rootId}
                  expanded={expanded.ids}
                  canOpen={(id) => canExpand(tree, id, reqs)}
                  onToggle={expanded.toggle}
                  selectedId={selected}
                  onSelect={select}
                  flags={flags}
                  showFlags={prefs.showFlags}
                  scheme={scheme}
                  matches={model.matches}
                  reqByCardId={model.reqByCardId}
                  centerRequest={centerReq}
                  placeKey={String(expanded.levelsPicked)}
                  countDrill={countDrill}
                  reqDrill={reqDrill}
                  label={`Org chart for ${rootName}`}
                  className="h-[60vh] min-h-[360px] min-w-0 flex-1 lg:h-[min(74vh,780px)]"
                />
                {selected && (
                  <div
                    ref={panelRef}
                    className="flex max-h-[70vh] min-h-0 shrink-0 scroll-mt-4 flex-col rounded-control shadow-[0_0_0_1px_var(--rule)] lg:max-h-[min(74vh,780px)] lg:w-[320px]"
                  >
                    <DetailPanel
                      model={model}
                      tree={tree}
                      id={selected}
                      employees={ctx.all.employees}
                      mode="chart"
                      scope={chartScope}
                      onClose={() => setSelectedId(null)}
                      onJump={jump}
                      onFocus={(id) => focus(id)}
                      onExit={setExitId}
                      onSlides={(id) => openSlides(id)}
                    />
                  </div>
                )}
              </div>
            </div>
            <ExportSvg
              tree={tree}
              layout={exportView.layout}
              caption={exportView.caption}
              scheme={scheme}
              matches={model.matches}
              flags={flags}
              showFlags={prefs.showFlags}
              reqByCardId={model.reqByCardId}
              title={title}
            />
          </div>
        </Figure>

        <Figure
          id="org-flags"
          title="Flags in this org"
          subtitle={`Span outliers, single-report chains, new managers with large teams, and people shown away from their data manager${model.dims ? ', among people matching the filters' : ''}`}
          data={flagTable}
          columns={flagColumns(tree, model.dims ? scopeIds : orgIds, flags, scope)}
          metric={FIGURE_METRIC['org-flags']}
          definitions={flagTableDefinitions(ctx.metrics, model.rules)}
          uses={flagTableUses(lineage)}
          tableOnly
          empty={flagTable.length ? null : 'No flags in this org.'}
          table={{
            maxRows: 12,
            search: 'Search flags',
            onRowClick: (r) => jump(r.employeeId, { scroll: true }),
          }}
          note={
            [
              flagTable.length
                ? `${plural(flaggedPeople, 'person', 'people')} with a structure flag. Click a row to find the person on the chart, or a count to list the people.`
                : null,
              gates.jobChanges.reason
                ? `New-manager flags use hire dates: ${gates.jobChanges.reason}.`
                : null,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
      </Grid>

      <ExitDialog model={model} tree={tree} id={exitId} scope={chartScope} onClose={() => setExitId(null)} />
      <SlidesDialog
        open={slidesOpen}
        onOpenChange={setSlidesOpen}
        tree={tree}
        rootId={rootId}
        leaders={slideLeaders}
        onLeadersChange={setSlideLeaders}
        scheme={scheme}
        reqs={reqs}
        reqByCardId={model.reqByCardId}
        uses={chartFields}
      />
    </div>
  )
}
