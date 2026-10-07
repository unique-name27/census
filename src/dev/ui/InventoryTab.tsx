/**
 * Developer > Inventory (docs/ROLES.md, 5.3): pick a list, search it, export it. Every list is one
 * table-only Figure with the decision in each mode beside every row. Figures come from a scan
 * ("Scan figures", "Scan as Manager"); engine functions can be run on the live context; storage
 * keys can be copied (never the Ask key) or removed after an in-page confirm.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { openDatasetQuality } from '@/app/datasetFocus'
import { formulaRows } from '@/app/settings/formulaIndex'
import { QUERY_DATASETS } from '@/ask/engine/allowlist'
import { TOOL_DEFINITIONS } from '@/ask/engine/tools'
import { Columns, Figure } from '@/charts'
import { IconCopy, IconSearch, IconWarning } from '@/components/icons'
import { KpiStrip } from '@/components/KpiStrip'
import { goTo } from '@/components/navigation'
import { Grid } from '@/components/Section'
import { toast } from '@/components/toast'
import type { Kpi } from '@/components/types'
import { Button, Segmented } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { openSettings, type RouteView } from '@/data/store'
import { DRILL_KINDS, drillKindFacts } from '@/drill/records'
import { drillDataset } from '@/drill/types'
import { ARTICLES } from '@/help/articles'
import { openHelp, startTour } from '@/help/store'
import { TOURS } from '@/help/tours'
import { plural } from '@/lib/format'
import { DATA_TABS, DATASET_PANELS } from '@/views/data/links'
import { openMetricDefinition } from '@/views/data/metrics/open'
import { VIEWS } from '@/views/registry'
import { engineJson, runAllEngines, runOne } from '../engines'
import {
  askToolRows,
  datasetFieldRows,
  drillRows,
  type EngineFn,
  engineRows,
  figureRows,
  helpRows,
  INVENTORY_LISTS,
  type InventoryList,
  type InventoryTable,
  isInventoryList,
  metricRows,
  type Row,
  routeRows,
  searchRows,
  settingRows,
  shortcutRows,
  storageKeyRows,
  tabRows,
  viewRows,
} from '../inventory'
import { freshContext, localValue, removeLocalKey, settingsSnapshot } from '../live'
import { bytesText } from '../overview'
import { scanLine } from '../scan'
import { settingFacts } from '../settingsFacts'
import { SHORTCUTS } from '../shortcuts'
import { canCopyValue, describeKey } from '../storageKeys'
import { useDev } from '../store'
import { devTab } from '../tabs'
import { useRunScan } from '../useScan'
import { useStorageRows } from './OverviewTab'
import { ABOUT_APP, copyText, JsonSheet, ListPicker } from './shared'

const ROUTE_INPUT = {
  views: VIEWS,
  dataTabs: DATA_TABS,
  datasetPanels: DATASET_PANELS,
  datasetKeys: DATASET_KEYS,
}

const askFields = (key: DatasetKey) =>
  QUERY_DATASETS.find((d) => d.key === key)?.fields.map((f) => f.name) ?? []

/** "#hrbp.attrition" → the route it names, when it is one Census can open. */
function routeOf(address: string): { view: RouteView; tab: string } | null {
  if (!address.startsWith('#') || address.includes('<')) return null
  const [view, ...rest] = address.slice(1).split('.')
  return { view: view as RouteView, tab: rest.join('.') }
}

export function InventoryTab({ sub }: { sub: string }) {
  const ctx = useAnalytics()
  const list: InventoryList = isInventoryList(sub) ? sub : 'views'
  const focus = useDev((s) => s.inventoryFocus)
  const scans = useDev((s) => s.scans)
  const scanning = useDev((s) => s.scanning)
  const engineRuns = useDev((s) => s.engineRuns)
  const setEngineRuns = useDev((s) => s.setEngineRuns)
  const { run: runScan } = useRunScan()
  const storage = useStorageRows()
  const [scanMode, setScanMode] = useState<'developer' | 'manager'>('developer')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [sheet, setSheet] = useState<{ title: string; text: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const searchId = useId()

  // A new list starts with nothing selected and no search.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on a change of list only
  useEffect(() => {
    setSelected(null)
    setConfirmRemove(false)
    setQuery('')
  }, [list])
  // A number elsewhere opens a list at a search, taken once (after the reset above).
  useEffect(() => {
    if (!focus || focus.list !== list) return
    setQuery(focus.query)
    useDev.setState({ inventoryFocus: null })
  }, [focus, list])

  const scan = scans[scanMode] ?? null
  const formulas = useMemo(() => formulaRows(ctx.metrics, ctx.quality), [ctx.metrics, ctx.quality])
  const tables: Record<InventoryList, () => InventoryTable> = {
    views: () => viewRows(VIEWS),
    tabs: () => tabRows(VIEWS),
    figures: () => figureRows(scan),
    metrics: () => metricRows(formulas, ctx.metrics),
    engines: () => engineRows(VIEWS, engineRuns),
    ask: () => askToolRows(TOOL_DEFINITIONS),
    drills: () => drillRows(DRILL_KINDS, drillKindFacts, drillDataset),
    datasets: () => datasetFieldRows({ askFields, quality: ctx.quality }),
    storage: () => storageKeyRows(storage.rows),
    routes: () => routeRows(ROUTE_INPUT),
    settings: () => settingRows(settingFacts(settingsSnapshot(ctx))),
    shortcuts: () => shortcutRows(SHORTCUTS),
    help: () => helpRows(ARTICLES, TOURS),
  }
  const table = tables[list]()
  const rows = searchRows(table.rows, query)
  const meta = INVENTORY_LISTS.find((l) => l.key === list) ?? INVENTORY_LISTS[0]

  const counts: Partial<Record<InventoryList, number | null>> = {
    views: VIEWS.length,
    tabs: VIEWS.reduce((n, v) => n + v.tabs.length, 0),
    figures: scan ? figureRows(scan).rows.length : null,
    metrics: ctx.metrics.list.length,
    ask: TOOL_DEFINITIONS.length,
    drills: DRILL_KINDS.length,
    storage: storage.rows?.length ?? null,
  }
  const loaded = DATASET_KEYS.filter((k) => ctx.all[k].length > 0).length
  const kpis: Kpi[] = [
    {
      id: 'dev-views',
      label: 'Views',
      value: VIEWS.length,
      format: 'int',
      link: { view: 'dev', tab: devTab('inventory', 'views'), label: 'Views' },
    },
    {
      id: 'dev-tabs',
      label: 'Tabs',
      value: counts.tabs ?? null,
      format: 'int',
      link: { view: 'dev', tab: devTab('inventory', 'tabs'), label: 'Tabs' },
    },
    {
      id: 'dev-figures',
      label: 'Figures',
      value: counts.figures ?? null,
      format: 'int',
      note: scan
        ? `From the last ${scanMode === 'manager' ? 'Manager' : 'Developer'} scan`
        : 'Scan figures to count',
      link: { view: 'dev', tab: devTab('inventory', 'figures'), label: 'Figures' },
    },
    {
      id: 'dev-metrics',
      label: 'Metrics',
      value: ctx.metrics.list.length,
      format: 'int',
      link: { view: 'dev', tab: devTab('inventory', 'metrics'), label: 'Metrics' },
    },
    {
      id: 'dev-ask-tools',
      label: 'Ask tools',
      value: TOOL_DEFINITIONS.length,
      format: 'int',
      link: { view: 'dev', tab: devTab('inventory', 'ask'), label: 'Ask tools' },
    },
    {
      id: 'dev-drill-kinds',
      label: 'Drill kinds',
      value: DRILL_KINDS.length,
      format: 'int',
      link: { view: 'dev', tab: devTab('inventory', 'drills'), label: 'Drill kinds' },
    },
    {
      id: 'dev-datasets',
      label: 'Datasets loaded',
      value: loaded,
      format: 'int',
      note: `of ${DATASET_KEYS.length}`,
      link: { view: 'dev', tab: devTab('inventory', 'datasets'), label: 'Datasets and fields' },
    },
    {
      id: 'dev-storage-keys',
      label: 'Storage keys',
      value: storage.rows?.length ?? null,
      format: 'int',
      note: storage.rows ? bytesText(storage.rows.reduce((n, r) => n + (r.bytes ?? 0), 0)) : undefined,
      link: { view: 'dev', tab: devTab('inventory', 'storage'), label: 'Storage keys' },
    },
  ]

  const perView = useMemo(() => {
    if (!scan) return []
    return scan.views.map((v) => ({
      view: v.label,
      figures: scan.figures.filter((f) => f.view === v.key && f.kind === 'figure').length,
    }))
  }, [scan])

  const onRowClick = (r: Row) => {
    switch (list) {
      case 'views':
        goTo(r.key as RouteView)
        return
      case 'tabs':
        goTo(r.viewKey as RouteView, String(r.tab))
        return
      case 'figures':
        goTo(r.viewKey as RouteView, String(r.tabKey))
        return
      case 'metrics':
        openMetricDefinition(String(r.id))
        return
      case 'ask':
        goTo('dev', devTab('ask', String(r.name)))
        return
      case 'datasets':
        openDatasetQuality(r.datasetKey as DatasetKey)
        return
      case 'routes': {
        const route = routeOf(String(r.address))
        if (route) goTo(route.view, route.tab)
        return
      }
      case 'settings':
        openSettings()
        return
      case 'help':
        if (r.kind === 'Tour') startTour(String(r.id))
        else openHelp(String(r.id))
        return
      default:
        setSelected(r)
        setConfirmRemove(false)
    }
  }

  const runEngine = (id: string) => {
    const [key, fn] = id.split('.') as [string, EngineFn]
    const view = VIEWS.find((v) => v.key === key)
    if (!view) return
    const out = runOne(view, fn, ctx)
    setEngineRuns([out.run])
    setSheet({ title: `${view.label}: ${fn}`, text: engineJson(out.value) })
  }

  const runAll = async () => {
    setRunning('Running every engine twice.')
    try {
      const runs = await runAllEngines(
        VIEWS,
        ctx,
        () => freshContext(ctx),
        (done, total) => setRunning(`Running engines: ${done} of ${total} views.`),
      )
      setEngineRuns(runs)
      toast('Engines run', {
        tone: 'good',
        description: `${plural(runs.length, 'function')}, cold and warm.`,
      })
    } finally {
      setRunning(null)
    }
  }

  const managerName = ctx.access.lock?.managerName ?? null
  const actions =
    list === 'figures' ? (
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<'developer' | 'manager'>
          label="Scan to show"
          value={scanMode}
          onChange={setScanMode}
          options={[
            { value: 'developer', label: 'Developer' },
            { value: 'manager', label: 'Manager' },
          ]}
        />
        <Button size="sm" disabled={!!scanning} onClick={() => void runScan('developer')}>
          Scan figures
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!!scanning}
          onClick={() => {
            setScanMode('manager')
            void runScan('manager')
          }}
        >
          Scan as Manager
        </Button>
      </div>
    ) : list === 'engines' ? (
      <Button size="sm" disabled={!!running} onClick={() => void runAll()}>
        {running ? 'Running…' : 'Run all engines'}
      </Button>
    ) : list === 'storage' ? (
      <Button size="sm" variant="ghost" onClick={storage.refresh}>
        Read again
      </Button>
    ) : undefined

  const subtitle: Record<InventoryList, string> = {
    views: 'Every view in the registry with its tabs, datasets and engine functions',
    tabs: 'Every tab of every view and its address',
    figures: scan
      ? scanLine(scan, scanMode === 'manager' ? managerName : null)
      : 'Lays out every view’s tabs off screen and lists the figures each one registers',
    metrics: 'Every entry of the metric dictionary with the settings and fields in force',
    engines: 'Each view’s headline, summary and actions, with the last run',
    ask: 'The tools Ask Census can call, with their input schemas',
    drills: 'Every kind of records the records panel lists',
    datasets: 'Every field of every dataset: type, requirement, tier and coverage',
    storage: 'Every census: key in this browser’s localStorage, sessionStorage and IndexedDB',
    routes: 'Every address Census opens, and where each mode sends it',
    settings: 'Every setting with its value, default and where it is kept',
    shortcuts: 'Every keyboard shortcut',
    help: 'Every help article and tour',
  }

  const selectedKey = selected && list === 'storage' ? String(selected.key) : null
  const selectedEngine = selected && list === 'engines' ? String(selected.id) : null

  return (
    <>
      <Grid>
        <KpiStrip id="dev-inventory-kpis" title="Inventory key figures" kpis={kpis} />
      </Grid>
      <div data-tour="dev-inventory-list" className="mt-6 flex flex-col gap-3">
        <ListPicker<InventoryList>
          label="Inventory list"
          value={list}
          options={INVENTORY_LISTS.map((l) => ({
            value: l.key,
            label: l.label,
            count: counts[l.key] ?? null,
          }))}
          onChange={(v) => goTo('dev', devTab('inventory', v))}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={searchId} className="relative flex min-w-0 flex-1 basis-64 items-center">
            <span className="sr-only">Search {meta.label.toLowerCase()}</span>
            <IconSearch className="pointer-events-none absolute left-2.5 size-4 text-muted" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${meta.label.toLowerCase()}`}
              className="h-8 w-full max-w-md rounded-control bg-sheet pr-2.5 pl-8 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]"
            />
          </label>
          {scanning && list === 'figures' && <span className="text-meta text-muted">{scanning.text}</span>}
          {running && list === 'engines' && <span className="text-meta text-muted">{running}</span>}
        </div>
      </div>
      {list === 'figures' && scan && (
        <Grid className="mt-4">
          <Figure
            id="dev-figures-per-view"
            title="Figures per view"
            subtitle={`Figures each view registers in ${scanMode === 'manager' ? 'Manager' : 'Developer'} mode, from the last scan`}
            data={perView}
            columns={[
              { key: 'view', label: 'View' },
              { key: 'figures', label: 'Figures', format: 'int' },
            ]}
            definitions={[ABOUT_APP]}
            note={scanLine(scan, scanMode === 'manager' ? managerName : null)}
            gate={false}
            span={12}
          >
            <Columns
              data={perView}
              x="view"
              y="figures"
              format="int"
              onSelect={(d) => setQuery(d.view)}
              ariaLabel="Figures per view from the last scan"
            />
          </Figure>
        </Grid>
      )}
      <Grid className="mt-4">
        <Figure
          id={`dev-inventory-${list}`}
          title={meta.label}
          subtitle={subtitle[list]}
          data={rows}
          columns={table.columns}
          definitions={[
            ABOUT_APP,
            {
              term: 'Developer, HR, Manager',
              text: 'The decision in each mode, from the same policy the Access tab and the access matrix test read: shown, limited (shown with limits) or hidden.',
            },
          ]}
          note={`${plural(rows.length, meta.noun)}${query ? ` match "${query}"` : ''}${rows.length !== table.rows.length ? ` of ${table.rows.length}` : ''}`}
          gate={false}
          span={12}
          tableOnly
          actions={actions}
          table={{ maxRows: 25, onRowClick }}
          empty={
            list === 'figures' && !scan
              ? scanning
                ? scanning.text
                : 'Scan figures to list every figure each view registers.'
              : list === 'storage' && !storage.rows
                ? 'Reading the browser’s stores.'
                : rows.length
                  ? null
                  : query
                    ? `Nothing matches "${query}".`
                    : 'Nothing to list.'
          }
          emptyAction={
            list === 'figures' && !scan && !scanning ? (
              <Button size="sm" onClick={() => void runScan(scanMode)}>
                {scanMode === 'manager' ? 'Scan as Manager' : 'Scan figures'}
              </Button>
            ) : undefined
          }
        />
      </Grid>
      {selectedKey && (
        <section
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sheet bg-sheet px-4 py-3"
          aria-label="Selected key"
        >
          <code className="font-mono text-meta text-ink">{selectedKey}</code>
          <span className="text-meta text-muted">{describeKey(selectedKey)?.holds ?? 'Not described'}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {canCopyValue(selectedKey) && describeKey(selectedKey)?.secret !== 'workspace' && (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconCopy />}
                onClick={() => {
                  const v = localValue(selectedKey)
                  if (v == null)
                    toast('This key has no value in web storage', {
                      description: 'IndexedDB values are not copied.',
                    })
                  else void copyText(v, selectedKey)
                }}
              >
                Copy value
              </Button>
            )}
            {selected?.where === 'localStorage' && !confirmRemove && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            )}
          </div>
          {confirmRemove && (
            <div className="flex w-full flex-wrap items-center gap-3 border-t border-rule pt-3">
              <IconWarning className="size-4 shrink-0 text-warning" />
              <p className="min-w-0 flex-1 text-small">
                <span className="font-semibold">Remove {selectedKey} from this browser?</span>{' '}
                <span className="text-ink-2">
                  Census reads it again on the next load, so what it held is gone then.
                </span>
              </p>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const ok = removeLocalKey(selectedKey)
                  toast(ok ? `Removed ${selectedKey}` : `${selectedKey} could not be removed`, {
                    tone: ok ? 'good' : 'critical',
                  })
                  setSelected(null)
                  setConfirmRemove(false)
                  storage.refresh()
                }}
              >
                Remove
              </Button>
            </div>
          )}
        </section>
      )}
      {selectedEngine && (
        <section
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sheet bg-sheet px-4 py-3"
          aria-label="Selected function"
        >
          <code className="font-mono text-meta text-ink">{selectedEngine}</code>
          <span className="text-meta text-muted">Runs on the live context and shows what it returns.</span>
          <Button size="sm" className="ml-auto" onClick={() => runEngine(selectedEngine)}>
            Run
          </Button>
        </section>
      )}
      <JsonSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.title ?? ''}
        description="What the function returned on the live context. Functions are left out and long lists cut to their first 25 items."
        text={sheet?.text ?? ''}
      />
    </>
  )
}
