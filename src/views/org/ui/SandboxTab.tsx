/**
 * Reorg sandbox: drag a person (or their whole org) onto a new manager, or use "Move to…". Every
 * change is a step in a local scenario (undo, redo, reset) that never touches the datasets. A
 * live ripple preview follows the drag; the diff below compares the scenario with today; the
 * scenario exports as an Excel workbook of moves and the resulting roster.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Figure, useExportMeta } from '@/charts'
import { Button, Grid, IconDownload, IconReset, Segmented, toast } from '@/components'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { fileStem } from '@/lib/export/names'
import { downloadXlsx } from '@/lib/export/xlsx'
import { plural } from '@/lib/format'
import {
  applyScenario,
  canExpand,
  colorScheme,
  computeFlags,
  describeAction,
  diffSummary,
  diffTrees,
  entryPoints,
  layoutTree,
  MOVE_COLUMNS,
  type MoveMode,
  moveRows,
  type OrgTree,
  PERSON_COLUMNS,
  ROSTER_COLUMNS,
  rippleOf,
  rosterRows,
  type ScenarioAction,
  shownRows,
  subtreeOf,
  visibleIds,
  visibleTree,
} from '../engine'
import { Canvas } from './Canvas'
import { ColorControl, ColorLegend, LevelsControl } from './Controls'
import { DetailPanel } from './DetailPanel'
import { DiffPanel } from './DiffPanel'
import { ExitDialog } from './ExitDialog'
import { ExportSvg } from './ExportSvg'
import { MoveDialog } from './MoveDialog'
import { MovesPanel } from './MovesPanel'
import { PersonSearch } from './PersonSearch'
import { RipplePreview } from './Ripple'
import { useChartPrefs, useScenario } from './state'
import { useExpansion } from './useExpansion'
import { useOrgModel } from './useOrgModel'

const SPAN_COLUMNS = [
  { key: 'name', label: 'Manager' },
  { key: 'id', label: 'Employee ID' },
  { key: 'before', label: 'Direct reports today', format: 'int' as const },
  { key: 'after', label: 'In the scenario', format: 'int' as const },
  { key: 'delta', label: 'Change', format: 'int' as const },
]

export function SandboxTab() {
  const ctx = useAnalytics()
  const meta = useExportMeta()
  const model = useOrgModel()
  const base = model.tree
  const rootId = model.rootId
  const [prefs, setPrefs] = useChartPrefs()
  const sc = useScenario(`${ctx.asOf}:${ctx.all.employees.length}`)
  const [mode, setMode] = useState<MoveMode>('team')
  const f = ctx.filters
  const dimKey = JSON.stringify([f.businessUnit, f.department, f.location, f.level])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [centerReq, setCenterReq] = useState<{ id: string; n: number } | null>(null)
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null)
  const [moveId, setMoveId] = useState<string | null>(null)
  const [exitId, setExitId] = useState<string | null>(null)

  const result = useMemo(() => applyScenario(base, sc.active), [base, sc.active])
  const tree = result.tree
  const expanded = useExpansion(tree, rootId, model.dims ? model.matches : null, dimKey)

  // When the dimming filters change, bring the largest matching group into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the filter key changes
  useEffect(() => {
    if (!model.dims) return
    const first = entryPoints(tree, rootId, model.matches)[0]
    if (first) setCenterReq((r) => ({ id: first, n: (r?.n ?? 0) + 1 }))
  }, [dimKey])
  const flags = useMemo(() => computeFlags(tree, ctx.all.jobChanges), [tree, ctx.all.jobChanges])
  const diff = useMemo(() => diffTrees(base, tree), [base, tree])
  const changed = useMemo(
    () => new Set([...diff.reportingChanges.map((r) => r.id), ...diff.spanChanges.map((s) => s.id)]),
    [diff],
  )
  const orgIds = useMemo(() => subtreeOf(tree, rootId), [tree, rootId])
  const scheme = useMemo(
    () => colorScheme(prefs.colorBy, orgIds.map((id) => tree.people.get(id)!).filter(Boolean), ctx.asOf),
    [prefs.colorBy, orgIds, tree, ctx.asOf],
  )
  const vtree = useMemo(() => visibleTree(tree, rootId, expanded.ids), [tree, rootId, expanded.ids])
  const layout = useMemo(() => layoutTree(vtree), [vtree])
  // The export mirror catches up after the chart paints.
  const exportLayout = useDeferredValue(layout)
  const rows = useMemo(() => shownRows(tree, visibleIds(vtree), flags), [tree, vtree, flags])
  const selected = selectedId && tree.people.has(selectedId) ? selectedId : null
  const orgPeople = useMemo(() => new Map(orgIds.map((id) => [id, tree.people.get(id)!])), [orgIds, tree])

  const ripple =
    drag?.over && drag.over !== drag.id
      ? rippleOf(tree, { kind: 'move', personId: drag.id, toManagerId: drag.over, mode })
      : null

  // Trees before each step, for the moves table (who managed whom at the time).
  const stepTrees = useMemo(() => {
    const out: OrgTree[] = [base]
    for (let i = 1; i < result.applied.length; i++)
      out.push(applyScenario(base, result.applied.slice(0, i)).tree)
    return out
  }, [base, result.applied])
  const moves = useMemo(() => moveRows(stepTrees, result.applied), [stepTrees, result.applied])
  const spanRows = diff.spanChanges

  const jump = (id: string) => {
    if (!tree.people.has(id)) return
    expanded.reveal(id)
    setSelectedId(id)
    setCenterReq((r) => ({ id, n: (r?.n ?? 0) + 1 }))
  }

  const commit = (action: ScenarioAction) => {
    const r = rippleOf(tree, action)
    if (!r.ok) {
      if (r.code !== 'same-manager' && r.code !== 'self') {
        sc.block({ action, reason: r.reason ?? 'This move is not possible.' })
        toast('Move blocked', { tone: 'critical', description: r.reason })
      }
      return false
    }
    sc.push(action)
    const label = describeAction(tree, action)
    toast(label, { tone: 'good', action: { label: 'Undo', onClick: () => sc.undo() } })
    if (action.kind === 'move') {
      // Open the new manager so the moved person stays in view.
      expanded.reveal(action.toManagerId, { self: true })
      setSelectedId(action.personId)
      setCenterReq((c) => ({ id: action.personId, n: (c?.n ?? 0) + 1 }))
    } else {
      setSelectedId(null)
    }
    return true
  }

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo and redo while this tab is open.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      const t = ev.target as HTMLElement | null
      if (t?.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return
      const k = ev.key.toLowerCase()
      if (k === 'z' && !ev.shiftKey) {
        ev.preventDefault()
        sc.undo()
      } else if ((k === 'z' && ev.shiftKey) || k === 'y') {
        ev.preventDefault()
        sc.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sc])

  const exportScenario = async () => {
    try {
      const roster = rosterRows(base, tree, subtreeOf(base, rootId))
      await downloadXlsx(
        [
          {
            name: 'Moves',
            title: 'Reorg scenario: moves',
            subtitle: `${plural(moves.length, 'step')} · ${diffSummary(diff)}`,
            note: 'A what-if made in the Census reorg sandbox. The data was not changed.',
            columns: MOVE_COLUMNS,
            rows: moves as unknown as Record<string, unknown>[],
          },
          {
            name: 'Resulting roster',
            title: 'Reorg scenario: resulting roster',
            subtitle: `Everyone in the org on ${formatDate(ctx.asOf)} with their manager today and in the scenario`,
            columns: ROSTER_COLUMNS,
            rows: roster as unknown as Record<string, unknown>[],
          },
          {
            name: 'Span changes',
            title: 'Reorg scenario: span changes',
            columns: SPAN_COLUMNS,
            rows: spanRows as unknown as Record<string, unknown>[],
          },
        ],
        meta,
        { showPay: ctx.showPay, fileName: fileStem(meta, 'reorg-scenario') },
      )
      toast('Scenario exported', { tone: 'good', description: 'Moves, resulting roster and span changes.' })
    } catch (err) {
      console.error('Scenario export failed', err)
      toast('The scenario could not be exported. Try again.', { tone: 'critical' })
    }
  }

  const side = drag ? (
    <div className="px-4 py-3">
      <h3 className="cut-head text-[15px] font-semibold">Proposed move</h3>
      <p className="mt-0.5 mb-3 text-[12px] text-muted">
        {mode === 'team' ? 'Moving with their org.' : 'Moving alone; their reports stay behind.'} Drop on a
        card to move, anywhere else to cancel.
      </p>
      {ripple ? (
        <RipplePreview tree={tree} ripple={ripple} />
      ) : (
        <p className="text-[13px] text-ink-2">Hover over the new manager’s card.</p>
      )}
    </div>
  ) : selected ? (
    <DetailPanel
      model={{ ...model, flags }}
      tree={tree}
      id={selected}
      employees={ctx.all.employees}
      mode="sandbox"
      onClose={() => setSelectedId(null)}
      onJump={jump}
      onExit={setExitId}
      onMove={setMoveId}
    />
  ) : (
    <div className="space-y-3 px-4 py-3 text-[13px] text-ink-2">
      <h3 className="cut-head text-[15px] font-semibold text-ink">How the sandbox works</h3>
      <p>
        Drag a card onto the person who should become their manager. The panel shows who gains and loses
        reports while you drag.
      </p>
      <p>Or select a card and use “Move to…”, which also works from the keyboard.</p>
      <p>Moving someone under a person in their own reporting line is blocked, with the reason shown.</p>
      <p className="text-muted">Changes stay in this browser. The data is never edited.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented<MoveMode>
          label="What moves when you drag"
          value={mode}
          onChange={setMode}
          size="md"
          options={[
            { value: 'team', label: 'Move with their org' },
            { value: 'person', label: 'Move just the person' },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={!sc.canUndo} onClick={sc.undo} title="Undo (Ctrl+Z)">
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!sc.canRedo}
            onClick={sc.redo}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<IconReset />}
            disabled={!sc.actions.length && !sc.blocked.length}
            onClick={() => {
              const prev = sc.actions.length
              sc.reset()
              if (prev) toast('Scenario cleared', { description: `${plural(prev, 'step')} removed.` })
            }}
          >
            Reset
          </Button>
        </div>
        <Button
          size="sm"
          icon={<IconDownload />}
          disabled={!moves.length}
          onClick={() => void exportScenario()}
        >
          Export scenario
        </Button>
        <span className="text-[13px] text-muted">
          {moves.length ? `${plural(moves.length, 'step')} · ${diffSummary(diff)}` : 'No changes yet'}
        </span>
      </div>

      {result.skipped.length > 0 && (
        <p className="rounded-control bg-warning-wash px-3 py-2 text-[13px] text-ink">
          {plural(result.skipped.length, 'step no longer applies', 'steps no longer apply')} to this data and{' '}
          {result.skipped.length === 1 ? 'was' : 'were'} left out: {result.skipped[0].reason}
        </p>
      )}

      <Grid>
        <Figure
          id="org-sandbox"
          title="Reorg sandbox"
          subtitle={`The org on ${formatDate(ctx.asOf)} with the scenario applied. Outlined cards changed.`}
          data={rows}
          columns={PERSON_COLUMNS}
          note={`${plural(rows.length, 'person', 'people')} shown. Drag a card onto a new manager; drag the background to pan.`}
        >
          <div className="relative">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <PersonSearch
                people={orgPeople}
                orgSize={(id) => tree.total.get(id) ?? 0}
                onPick={jump}
                slashKey
                className="w-full sm:w-64"
              />
              <LevelsControl value={expanded.preset} onChange={expanded.setLevels} />
              <ColorControl value={prefs.colorBy} onChange={(c) => setPrefs({ colorBy: c })} />
              <ColorLegend scheme={scheme} className="ml-auto" />
            </div>
            <div className="mt-3 flex flex-col gap-3 lg:flex-row">
              <Canvas
                tree={tree}
                layout={layout}
                rootId={rootId}
                expanded={expanded.ids}
                canOpen={(id) => canExpand(tree, id)}
                onToggle={expanded.toggle}
                selectedId={selected}
                onSelect={setSelectedId}
                flags={flags}
                showFlags
                scheme={scheme}
                matches={model.matches}
                reqByCardId={model.reqByCardId}
                centerRequest={centerReq}
                placeKey={String(expanded.levelsPicked)}
                changed={changed}
                label="Reorg sandbox chart"
                drag={{
                  dragId: drag?.id ?? null,
                  onHover: (id, over) =>
                    setDrag((d) => (d && d.id === id && d.over === over ? d : { id, over })),
                  onDrop: (id, target) => {
                    setDrag(null)
                    if (target && target !== id)
                      commit({ kind: 'move', personId: id, toManagerId: target, mode })
                  },
                  dropState: (id) => (drag?.over === id && ripple ? (ripple.ok ? 'ok' : 'blocked') : null),
                }}
                className="h-[60vh] min-h-[360px] min-w-0 flex-1 lg:h-[min(72vh,760px)]"
              />
              <div className="flex max-h-[70vh] min-h-0 shrink-0 flex-col overflow-y-auto rounded-control shadow-[0_0_0_1px_var(--rule)] lg:max-h-[min(72vh,760px)] lg:w-[320px]">
                {side}
              </div>
            </div>
            <ExportSvg
              tree={tree}
              layout={exportLayout}
              scheme={scheme}
              matches={model.matches}
              flags={flags}
              showFlags
              reqByCardId={model.reqByCardId}
              title="Reorg sandbox"
            />
          </div>
        </Figure>

        <MovesPanel
          moves={moves}
          undone={sc.actions.slice(sc.cursor).map((a) => describeAction(tree, a))}
          onUndo={sc.undo}
          onRedo={sc.redo}
          canUndo={sc.canUndo}
          canRedo={sc.canRedo}
        />
        <DiffPanel
          diff={diff}
          blocked={sc.blocked}
          describe={(b) => describeAction(base, b.action)}
          onJump={jump}
          onClearBlocked={sc.clearBlocked}
        />
        <Figure
          id="org-sandbox-spans"
          title="Span changes"
          subtitle="Managers whose number of direct reports changes in the scenario"
          data={spanRows}
          columns={SPAN_COLUMNS}
          tableOnly
          empty={spanRows.length ? null : 'No spans change yet.'}
          table={{ maxRows: 10, onRowClick: (r) => jump(r.id) }}
        />
      </Grid>

      <MoveDialog
        tree={{ ...tree, people: orgPeople }}
        personId={moveId}
        mode={mode}
        onClose={() => setMoveId(null)}
        onConfirm={(personId, to, m) => {
          if (commit({ kind: 'move', personId, toManagerId: to, mode: m })) setMoveId(null)
        }}
      />
      <ExitDialog
        model={model}
        tree={tree}
        id={exitId}
        onClose={() => setExitId(null)}
        onAddToScenario={(id) => {
          if (commit({ kind: 'exit', personId: id })) setExitId(null)
        }}
      />
    </div>
  )
}
