/**
 * Chart tab: key figures, the org chart (search, levels, color key, open roles, flags, pan and zoom,
 * detail panel, slides) and the table of flagged people.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Figure } from '@/charts'
import type { Kpi } from '@/components'
import { Button, Grid, IconSlides, KpiStrip, Switch, toast } from '@/components'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { median } from '@/lib/stats'
import {
  COMPANY_ROOT,
  canExpand,
  colorScheme,
  defaultSlideLeaders,
  entryPoints,
  FLAG_COLUMNS,
  flagRows,
  isWithin,
  layersBelow,
  layoutTree,
  PERSON_COLUMNS,
  STRUCTURAL,
  shownRows,
  subtreeOf,
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
import { useExpansion } from './useExpansion'
import { CHART_DEFINITIONS, useOrgModel } from './useOrgModel'

const FLAG_KINDS = new Set([...STRUCTURAL, 'placement'])

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

  // When the dimming filters change, bring the largest matching group into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the filter key changes
  useEffect(() => {
    if (!model.dims) return
    const first = entryPoints(tree, rootId, model.matches)[0]
    if (first) setCenterReq((r) => ({ id: first, n: (r?.n ?? 0) + 1 }))
  }, [dimKey])
  const chartRef = useRef<HTMLDivElement>(null)

  const reqs = prefs.showReqs ? model.reqs : undefined
  const orgIds = useMemo(() => subtreeOf(tree, rootId), [tree, rootId])
  const scheme = useMemo(
    () => colorScheme(prefs.colorBy, orgIds.map((id) => tree.people.get(id)!).filter(Boolean), ctx.asOf),
    [prefs.colorBy, orgIds, tree, ctx.asOf],
  )
  const vtree = useMemo(
    () => visibleTree(tree, rootId, expanded.ids, { reqs }),
    [tree, rootId, expanded.ids, reqs],
  )
  const layout = useMemo(() => layoutTree(vtree), [vtree])
  // The export mirror catches up after the chart paints.
  const exportLayout = useDeferredValue(layout)
  const shownIds = visibleIds(vtree)
  const rows = useMemo(() => shownRows(tree, shownIds, flags), [tree, shownIds, flags])
  const flagTable = useMemo(() => flagRows(tree, orgIds, flags, FLAG_KINDS), [tree, orgIds, flags])

  const jump = (id: string) => {
    if (!tree.people.has(id)) return
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
    setSelectedId(id)
    setCenterReq((r) => ({ id, n: (r?.n ?? 0) + 1 }))
  }

  // After "Show whole company" widens the filter, finish the jump on the new model.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per model change for a pending jump
  useEffect(() => {
    if (!pendingJump || !isWithin(tree, pendingJump, model.rootId)) return
    const id = pendingJump
    setPendingJump(null)
    jump(id)
  }, [model])

  // Jumps requested from other views (openInOrgChart).
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount, plus a window event while open
  useEffect(() => {
    const pending = takeOrgJump()
    if (pending) jump(pending)
    const onJump = (ev: Event) => {
      const id = (ev as CustomEvent<string>).detail
      if (typeof id === 'string' && takeOrgJump() === id) jump(id)
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

  // Key figures for the org on screen.
  const people = orgIds.length
  const spans = orgIds.map((id) => tree.directs.get(id) ?? 0).filter((n) => n > 0)
  const openRoles = orgIds.reduce((s, id) => s + (model.reqs.get(id)?.length ?? 0), 0)
  const structural = flagTable.filter((r) => STRUCTURAL.has(r.kind))
  const kpis: Kpi[] = [
    {
      id: 'org-people',
      label: 'People in this org',
      value: people,
      format: 'int',
      note: 'Every worker type',
    },
    { id: 'org-managers', label: 'People managers', value: spans.length, format: 'int' },
    {
      id: 'org-span',
      label: 'Median span',
      value: median(spans),
      format: 'num1',
      note: 'Direct reports per manager',
      definition: 'Median number of direct reports among people with at least one, all worker types.',
    },
    {
      id: 'org-layers',
      label: 'Layers',
      value: layersBelow(tree, rootId),
      format: 'int',
      definition: 'Levels from the top of this org to its deepest report, counting the top as 1.',
    },
    { id: 'org-open-roles', label: 'Open roles', value: openRoles, format: 'int', note: 'Open requisitions' },
    {
      id: 'org-flags',
      label: 'Structure flags',
      value: new Set(structural.map((r) => r.employeeId)).size,
      format: 'int',
      note: 'People with a span or chain flag',
    },
  ]

  const rootName = rootId === COMPANY_ROOT ? 'Whole company' : (tree.people.get(rootId)?.name ?? '')
  const title = rootId === tree.rootId ? 'Org chart' : `Org chart: ${rootName}`
  const matching = model.dims ? orgIds.filter((id) => model.matches(id)).length : people
  const dimNote = model.dims
    ? ` ${plural(matching, 'person matches', 'people match')} the filters; everyone else is dimmed so reporting lines stay readable.`
    : ''

  return (
    <div className="space-y-4">
      <KpiStrip kpis={kpis} id="org-key-figures" />
      <Grid>
        <Figure
          id="org-chart"
          title={title}
          subtitle={`Reporting lines on ${formatDate(ctx.asOf)}, everyone active including contractors and interns`}
          data={rows}
          columns={PERSON_COLUMNS}
          definitions={CHART_DEFINITIONS}
          note={`${plural(rows.length, 'person', 'people')} shown of ${fmt(people, 'int')} in this org.${dimNote} Drag to pan. Click the chart and scroll, or pinch, to zoom. Arrow keys move between people.`}
          actions={
            <Button size="sm" icon={<IconSlides />} onClick={() => openSlides()}>
              Org slides
            </Button>
          }
          table={{ maxRows: 15, search: 'Search people', onRowClick: (r) => jump(r.employeeId) }}
        >
          <div ref={chartRef} className="relative scroll-mt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <PersonSearch
                people={tree.people}
                orgSize={(id) => tree.total.get(id) ?? 0}
                onPick={jump}
                slashKey
                className="w-full sm:w-64"
                placeholder="Find a person"
              />
              <LevelsControl value={expanded.preset} onChange={expanded.setLevels} />
              <ColorControl value={prefs.colorBy} onChange={(c) => setPrefs({ colorBy: c })} />
              <Switch
                checked={prefs.showReqs}
                onChange={(v) => setPrefs({ showReqs: v })}
                label="Open roles"
              />
              <Switch checked={prefs.showFlags} onChange={(v) => setPrefs({ showFlags: v })} label="Flags" />
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

            <div className="mt-3 flex flex-col gap-3 lg:flex-row">
              <Canvas
                tree={tree}
                layout={layout}
                rootId={rootId}
                expanded={expanded.ids}
                canOpen={(id) => canExpand(tree, id, reqs)}
                onToggle={expanded.toggle}
                selectedId={selected}
                onSelect={setSelectedId}
                flags={flags}
                showFlags={prefs.showFlags}
                scheme={scheme}
                matches={model.matches}
                reqByCardId={model.reqByCardId}
                centerRequest={centerReq}
                placeKey={String(expanded.levelsPicked)}
                label={`Org chart for ${rootName}`}
                className="h-[60vh] min-h-[360px] min-w-0 flex-1 lg:h-[min(74vh,780px)]"
              />
              {selected && (
                <div className="flex max-h-[70vh] min-h-0 shrink-0 flex-col rounded-control shadow-[0_0_0_1px_var(--rule)] lg:max-h-[min(74vh,780px)] lg:w-[320px]">
                  <DetailPanel
                    model={model}
                    tree={tree}
                    id={selected}
                    employees={ctx.all.employees}
                    mode="chart"
                    onClose={() => setSelectedId(null)}
                    onJump={jump}
                    onFocus={(id) => focus(id)}
                    onExit={setExitId}
                    onSlides={(id) => openSlides(id)}
                  />
                </div>
              )}
            </div>
            <ExportSvg
              tree={tree}
              layout={exportLayout}
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
          subtitle="Span outliers, single-report chains, new managers with large teams, and people shown away from their data manager"
          data={flagTable}
          columns={FLAG_COLUMNS}
          tableOnly
          empty={flagTable.length ? null : 'No flags in this org.'}
          table={{
            maxRows: 12,
            search: 'Search flags',
            onRowClick: (r) => {
              jump(r.employeeId)
              chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            },
          }}
          note={`${plural(new Set(structural.map((r) => r.employeeId)).size, 'person', 'people')} with a structure flag. Click a row to find the person on the chart.`}
        />
      </Grid>

      <ExitDialog model={model} tree={tree} id={exitId} onClose={() => setExitId(null)} />
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
      />
    </div>
  )
}
