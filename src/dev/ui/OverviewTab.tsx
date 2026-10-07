/**
 * The Developer home (docs/DESIGN-REFRESH.md 4.3): whether the data, the metric dictionary, the
 * view contracts and the runtime are healthy, with every developer tool one click away. Its
 * numbers are about datasets, metrics, figures and errors; each opens the dataset's Quality panel,
 * the metric entries, the data records, the gaps or the inventory rows it counts.
 *
 * Phones: tiles, Freshness, Developer tools, then the sections in order.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { openDatasetQuality } from '@/app/datasetFocus'
import { devErrors, subscribeDevErrors } from '@/app/devlog'
import { readKey } from '@/ask/engine/keys'
import { openAsk } from '@/ask/ui/store'
import {
  BarList,
  BulletList,
  type Column,
  type Definition,
  Figure,
  HBars,
  Lines,
  useChartTheme,
} from '@/charts'
import { KpiStrip } from '@/components/KpiStrip'
import { goTo } from '@/components/navigation'
import { Grid, Section } from '@/components/Section'
import type { Kpi } from '@/components/types'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { STANDARD_LABEL } from '@/data/quality/tier'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import { openSettings, type RouteView, useCensus } from '@/data/store'
import { drill } from '@/drill/Drill'
import { openHelp } from '@/help/store'
import { fmt, plural } from '@/lib/format'
import { timingEntries } from '@/lib/timing'
import { definitionOf } from '@/metrics/api'
import { sourceInfo } from '@/views/data/engine/manifest'
import { openMetricDefinitions } from '@/views/data/metrics/open'
import { fieldProblemSpec, rowsSpec as indexRowsSpec } from '@/views/data/quality-overview/drills'
import { fieldCells, type TrendRow, trendRows } from '@/views/data/quality-overview/engine/summary'
import { FieldMatrix, type MatrixRow } from '@/views/data/quality-overview/FieldMatrix'
import { rowsSpec } from '@/views/data/ui/drillSpecs'
import { VIEWS } from '@/views/registry'
import {
  CONTRACT_LABEL,
  CONTRACT_ORDER,
  type CoverageRow,
  checkedRows,
  contractCoverage,
  contractElements,
  coverageShare,
  gapRows,
} from '../contract'
import { readStorageSnapshot, storageEstimate } from '../live'
import {
  belowStandardCount,
  bytesText,
  type CheckCell,
  changedByView,
  checkCells,
  type FreshRow,
  freshnessRows,
  goldCount,
  METRIC_TIER_SERIES,
  type MetricTierCount,
  metricTierCounts,
  noTargetByView,
  rowsByDataset,
  SUMMARY_BUDGET_MS,
  type SummaryTime,
  scorecardMs,
  summaryTimes,
  type ViewCount,
} from '../overview'
import { type StorageRow, storageRows, storageTotals } from '../storageKeys'
import { useDev } from '../store'
import { devTab } from '../tabs'
import { useRunScan } from '../useScan'
import { ABOUT_APP } from './shared'

type Row = Record<string, unknown>

const VIEW_DATASETS = new Map<string, readonly DatasetKey[]>(VIEWS.map((v) => [v.key, v.datasets]))
const viewDatasets = (view: string) => VIEW_DATASETS.get(view) ?? []
const viewLabel = (key: string) => VIEWS.find((v) => v.key === key)?.label ?? key

/** Scroll a section of the page into view when the address names it (`#dev.overview:gaps`). */
function useSectionFocus(sub: string) {
  useEffect(() => {
    if (!sub) return
    const frame = requestAnimationFrame(() => {
      document.getElementById(`dev-section-${sub}`)?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [sub])
}

/** Storage rows read once when the page opens (and again on request). */
export function useStorageRows(): {
  rows: StorageRow[] | null
  estimate: number | null
  refresh: () => void
} {
  const [rows, setRows] = useState<StorageRow[] | null>(null)
  const [estimate, setEstimate] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` re-reads the stores on request
  useEffect(() => {
    let live = true
    void (async () => {
      const snap = await readStorageSnapshot()
      const est = await storageEstimate()
      if (!live) return
      setRows(storageRows(snap))
      setEstimate(est.usage)
    })()
    return () => {
      live = false
    }
  }, [nonce])
  return { rows, estimate, refresh: () => setNonce((n) => n + 1) }
}

/** The errors of this session, kept in step with the log. */
export function useDevErrors() {
  return useSyncExternalStore(subscribeDevErrors, devErrors, devErrors)
}

/** User Timing entries, read when the page renders and every few seconds while it is open. */
export function useTimings(intervalMs = 4000) {
  const [entries, setEntries] = useState(timingEntries)
  // Only a new measure re-renders the page: the poll keeps the same array while nothing changed.
  const read = () =>
    setEntries((prev) => {
      const next = timingEntries()
      const same = next.length === prev.length && next.at(-1)?.start === prev.at(-1)?.start
      return same ? prev : next
    })
  // biome-ignore lint/correctness/useExhaustiveDependencies: `read` only calls the state setter
  useEffect(() => {
    const id = window.setInterval(read, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return { entries, refresh: () => setEntries(timingEntries()) }
}

/* ───────────── the developer tools sheet ───────────── */

function ToolsSheet({ className }: { className?: string }) {
  const keySet = (() => {
    try {
      return !!readKey()
    } catch {
      return false
    }
  })()
  const tools: { name: string; what: string; open?: () => void; href?: string }[] = [
    import.meta.env?.DEV
      ? { name: 'Chart gallery', what: 'Every kit chart in both themes.', href: 'gallery.html' }
      : {
          name: 'Chart gallery',
          what: 'Every kit chart in both themes; open gallery.html on the dev server.',
        },
    {
      name: 'Metric definitions',
      what: 'The dictionary: wording, targets, settings.',
      open: () => goTo('data', 'metrics'),
    },
    {
      name: 'Formulas',
      what: 'Every formula, population and window, in Settings.',
      open: () => openSettings('formulas'),
    },
    {
      name: 'Data quality',
      what: 'Tiers, fill rates and checks across datasets.',
      open: () => goTo('data', 'quality'),
    },
    {
      name: 'Raw data',
      what: 'Each dataset’s Raw, Mapping, Quality and Certify panels.',
      open: () => goTo('data', ''),
    },
    {
      name: 'Categories & mapping',
      what: 'How the categories in the data relate.',
      open: () => goTo('data', 'mapping'),
    },
    {
      name: 'Official lists',
      what: 'The values Census recognizes, in Settings.',
      open: () => openSettings('lists'),
    },
    { name: 'Tours', what: 'Start any tour from the Help sheet.', open: () => openHelp() },
    ...(keySet
      ? [
          {
            name: 'Ask: what was sent',
            what: 'Each answer’s question, tool calls and results.',
            open: () => openAsk(),
          },
        ]
      : []),
    {
      name: 'Reset everything to the sample',
      what: 'In the Data room header, with a confirm.',
      open: () => goTo('data', ''),
    },
  ]
  return (
    <section
      aria-labelledby="dev-tools-title"
      data-tour="dev-tools"
      className={cx('col-span-full flex flex-col self-start rounded-sheet bg-sheet lg:col-span-4', className)}
    >
      <header className="border-b border-rule px-4 pt-4 pb-3 lg:px-5">
        <h2 id="dev-tools-title" className="cut-head text-title font-semibold">
          Developer tools
        </h2>
      </header>
      <ul className="flex flex-col py-1">
        {tools.map((t) => (
          <li key={t.name}>
            {t.href ? (
              <a
                href={t.href}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col px-4 py-2 hover:bg-hover lg:px-5"
              >
                <span className="text-small font-semibold text-link">{t.name}</span>
                <span className="text-meta text-muted">{t.what}</span>
              </a>
            ) : t.open ? (
              <button
                type="button"
                onClick={t.open}
                className="flex w-full flex-col px-4 py-2 text-left hover:bg-hover lg:px-5"
              >
                <span className="text-small font-semibold text-link">{t.name}</span>
                <span className="text-meta text-muted">{t.what}</span>
              </button>
            ) : (
              <div className="flex flex-col px-4 py-2 lg:px-5">
                <span className="text-small font-semibold text-ink">{t.name}</span>
                <span className="text-meta text-muted">{t.what}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ───────────── the page ───────────── */

const FRESH_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset' },
  { key: 'ageDays', label: 'Age', format: 'days' },
  { key: 'maxDays', label: 'Limit', format: 'days' },
  { key: 'state', label: 'State' },
  { key: 'what', label: 'Measured on' },
  { key: 'latest', label: 'Latest date', format: 'date' },
]

/** "Rows failing each row check": its own measure, not the import error rate beside it. */
const ROWS_FAILING: Definition = {
  term: 'Rows failing a row check',
  text: 'For one dataset and one row check (references resolve, dates in order, no duplicates), the rows the check flags ÷ the rows loaded. The import error rate beside it counts rows the import could not read; a row check flags rows that were read but break a rule, such as a reference to a record that is not loaded, so the two differ. The checks that judge a whole dataset (no blocking issues, issue rate within its limit) are pass or fail and are not drawn here.',
}

const CHECK_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset' },
  { key: 'check', label: 'Check' },
  { key: 'count', label: 'Rows failing', format: 'int' },
  { key: 'rows', label: 'Rows loaded', format: 'int' },
  { key: 'share', label: 'Share failing', format: 'pct' },
]

const TIER_COLUMNS: Column[] = [
  { key: 'viewLabel', label: 'View' },
  { key: 'tierLabel', label: 'Tier' },
  { key: 'count', label: 'Metrics', format: 'int' },
]

const VIEW_COUNT_COLUMNS: Column[] = [
  { key: 'viewLabel', label: 'View' },
  { key: 'count', label: 'Metrics', format: 'int' },
  { key: 'idsText', label: 'Metric ids' },
]

export function OverviewTab({ sub }: { sub: string }) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const versions = useCensus((s) => s.versions)
  const history = useCensus((s) => s.history)
  const scan = useDev((s) => s.scans.developer ?? null)
  const scanning = useDev((s) => s.scanning)
  const { run } = useRunScan()
  const errors = useDevErrors()
  const { entries } = useTimings()
  const storage = useStorageRows()
  const focusInventory = useDev((s) => s.focusInventory)
  useSectionFocus(sub)

  const sources = useMemo(
    () =>
      Object.fromEntries(DATASET_KEYS.map((k) => [k, sourceInfo(ctx.sources[k])])) as Record<
        DatasetKey,
        ReturnType<typeof sourceInfo>
      >,
    [ctx.sources],
  )
  const fresh = useMemo(() => freshnessRows(ctx.quality), [ctx.quality])
  const datasetRows = useMemo(() => rowsByDataset(ctx.quality), [ctx.quality])
  const gold = goldCount(ctx.quality)
  const checks = useMemo(() => checkCells(ctx.quality), [ctx.quality])
  const cells = useMemo(() => DATASET_KEYS.flatMap((k) => fieldCells(k, ctx.quality)), [ctx.quality])
  const matrix: MatrixRow[] = DATASET_KEYS.map((key) => ({
    key,
    tier: ctx.quality.datasetTier(key),
    cells: cells.filter((c) => c.key === key),
  }))
  const trend: TrendRow[] = useMemo(
    () =>
      DATASET_KEYS.flatMap((key) =>
        trendRows({
          key,
          current: versions[key],
          history: history[key] ?? [],
          currentTier: ctx.quality.datasetTier(key),
          currentIssueRate: ctx.quality.dataset(key).issueRate,
          rules: ctx.quality.rules,
        }),
      ),
    [versions, history, ctx.quality],
  )
  const tiers = useMemo(
    () => metricTierCounts(ctx.metrics, ctx.quality, viewDatasets),
    [ctx.metrics, ctx.quality],
  )
  const below = belowStandardCount(tiers, ctx.standard)
  const changed = useMemo(() => changedByView(ctx.metrics), [ctx.metrics])
  const noTarget = useMemo(() => noTargetByView(ctx.metrics), [ctx.metrics])
  const times = summaryTimes(
    entries,
    viewLabel,
    VIEWS.map((v) => v.key),
  )
  const scoreMs = scorecardMs(times)
  const elements = useMemo(() => (scan ? contractElements(scan) : []), [scan])
  const share = coverageShare(elements)
  const coverage = contractCoverage(elements)
  const checked = scan ? checkedRows(scan) : []
  const gaps = gapRows(elements)
  const storageBytes = storage.rows
    ? Object.values(storageTotals(storage.rows)).reduce((a, b) => a + b, 0)
    : null

  const kpis: Kpi[] = [
    {
      id: 'dev-gold',
      label: 'Datasets at gold',
      value: gold.gold,
      format: 'int',
      note: `of ${plural(gold.loaded, 'dataset')} loaded`,
      link: { view: 'data', tab: 'quality', label: 'Data room, Data quality' },
    },
    {
      id: 'dev-below',
      label: 'Metrics below the standard',
      value: below,
      format: 'int',
      note: `Standard: ${STANDARD_LABEL[ctx.standard]}`,
      link: { view: 'dev', tab: devTab('inventory', 'metrics'), label: 'Inventory, Metrics' },
    },
    {
      id: 'dev-contract',
      label: 'Figures meeting the contract',
      value: share,
      format: 'pct0',
      note: scan ? `${plural(elements.length, 'element')} checked` : 'Run contract checks to measure',
      link: { view: 'dev', tab: devTab('overview', 'contracts'), label: 'Contracts' },
    },
    {
      id: 'dev-scorecard',
      label: 'Scorecard compute time (ms)',
      value: scoreMs == null ? null : Math.round(scoreMs),
      format: 'int',
      note:
        times[0]?.ms != null
          ? `Slowest: ${times[0].label}, ${Math.round(times[0].ms)} ms`
          : 'Open the Scorecard to measure',
      link: { view: 'dev', tab: devTab('overview', 'runtime'), label: 'Runtime' },
    },
    {
      id: 'dev-errors',
      label: 'Errors this session',
      value: errors.length,
      format: 'int',
      note: errors.length ? `Last: ${errors[errors.length - 1].where}` : 'None caught',
      link: { view: 'dev', tab: devTab('overview', 'runtime'), label: 'Runtime' },
    },
    {
      id: 'dev-storage',
      label: 'Storage used (KB)',
      // One decimal, so a few hundred bytes read 0.4, not 0.
      value: storageBytes == null ? null : Math.round(storageBytes / 102.4) / 10,
      format: 'num1',
      note: storage.estimate != null ? `Browser estimate ${bytesText(storage.estimate)}` : 'Census keys only',
      link: { view: 'dev', tab: devTab('inventory', 'storage'), label: 'Inventory, Storage keys' },
    },
  ]

  /** The data quality rule's own definition first, then what the page is about. */
  const withRule = (id: string): Definition[] => {
    const d = definitionOf(ctx.metrics, id)
    return d ? [d, ABOUT_APP] : [ABOUT_APP]
  }

  const fieldDrill = (cell: (typeof cells)[number]) =>
    drill(() =>
      fieldProblemSpec({
        cell,
        data: ctx.all,
        rowsOf: (k) => ctx.quality.fieldRows(cell.ref, k),
        source: sources[cell.key],
        minCoverage: ctx.quality.rules.minCoverage,
      }),
    )
  const failing = checks
    .filter((c) => c.count > 0)
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || b.count - a.count)
    .map((c) => ({ ...c, name: `${c.dataset} · ${c.check}` }))
  const checkDrill = (c: CheckCell) =>
    drill(() =>
      indexRowsSpec({
        key: c.key,
        data: ctx.all,
        indexes: c.rowIndexes,
        title: `${c.dataset} rows failing "${c.check}"`,
        source: sources[c.key],
      }),
    )
  const datasetDrill = (key: DatasetKey) =>
    drill(() => rowsSpec({ key, label: datasetDef(key).label, source: sources[key] }, ctx.all))

  // The tiers' own medal colors (distinct hues in both themes), as the Data room's tier chart uses;
  // three steps of one blue ran together in dark mode.
  const tierColors: Record<string, string> = {
    Gold: theme.tier.gold,
    Silver: theme.tier.silver,
    Bronze: theme.tier.bronze,
    'No data': theme.deemph,
  }
  const statusColors: Record<string, string> = {
    [CONTRACT_LABEL.complete]: theme.status.good,
    [CONTRACT_LABEL['no-metric']]: theme.status.warning,
    [CONTRACT_LABEL['no-uses']]: theme.status.serious,
    [CONTRACT_LABEL['no-drill']]: theme.status.critical,
  }
  const chartable = (() => {
    const per = new Map<string, number>()
    for (const r of trend)
      if (r.loaded && r.issueRate != null) per.set(r.dataset, (per.get(r.dataset) ?? 0) + 1)
    return [...per.values()].some((n) => n > 1)
  })()

  return (
    <>
      <Grid>
        <KpiStrip id="dev-kpis" title="Developer key figures" kpis={kpis} />
      </Grid>
      <Grid className="mt-4">
        <Figure
          id="dev-freshness"
          title="Freshness against the limit"
          subtitle="Days from each dataset’s latest event to the as-of date, against its freshness limit"
          data={fresh.map((r) => ({ ...r, state: r.fresh ? 'Fresh' : 'Stale' }))}
          columns={FRESH_COLUMNS}
          metric="quality.rules.freshness"
          definitions={withRule('quality.rules.freshness')}
          note={`${plural(fresh.filter((r) => !r.fresh).length, 'dataset')} past the limit · as of ${fmt(ctx.asOf, 'date')}`}
          gate={false}
          span={8}
          empty={fresh.length ? null : 'No loaded dataset has a freshness limit.'}
        >
          <BulletList<FreshRow>
            data={fresh}
            label="dataset"
            value={(r) => r.ageDays}
            target={(r) => r.maxDays}
            format={(_r, v) => (v == null ? '—' : `${fmt(v, 'int')} d`)}
            status={(r) => (r.fresh ? { tone: 'good', label: 'Fresh' } : { tone: 'warning', label: 'Stale' })}
            onSelect={(r) => openDatasetQuality(r.key)}
            onSelectLabel={(r) => openDatasetQuality(r.key)}
            nullNote="No dated rows on or before the as-of date"
            ariaLabel="Age of each dataset in days against its freshness limit"
          />
        </Figure>
        {/* Phones and tablets: Freshness (the first chart) before the tools list. */}
        <ToolsSheet />
      </Grid>

      <Section
        title="Data"
        align="start"
        dek="Fill rates, row counts and the checks on the loaded rows, across every dataset."
        id="dev-section-data"
      >
        <Figure
          id="dev-fill"
          title="Field fill by dataset"
          subtitle="Each row a dataset, each square a field, required fields first, shaded by fill rate"
          data={cells.map((c) => ({
            dataset: c.dataset,
            field: c.field,
            requirement: c.requirement,
            coverage: c.coverage,
            blank: c.blank,
            invalid: c.invalid,
            defaulted: c.defaulted,
            tier: c.tier,
          }))}
          columns={[
            { key: 'dataset', label: 'Dataset' },
            { key: 'field', label: 'Field' },
            { key: 'requirement', label: 'Required or recommended' },
            { key: 'coverage', label: 'Fill rate', format: 'pct' },
            { key: 'blank', label: 'Blank', format: 'int' },
            { key: 'invalid', label: 'Not recognized', format: 'int' },
            { key: 'defaulted', label: 'Defaulted', format: 'int' },
            { key: 'tier', label: 'Tier' },
          ]}
          metric="quality.rules.fill"
          definitions={withRule('quality.rules.fill')}
          note={`${plural(cells.filter((c) => c.short).length, 'field')} short of silver · as of ${fmt(ctx.asOf, 'date')}`}
          gate={false}
          span={8}
          table={{ search: 'Find a field', maxRows: 15 }}
        >
          <FieldMatrix rows={matrix} minCoverage={ctx.quality.rules.minCoverage} onOpen={fieldDrill} />
        </Figure>
        <Figure
          id="dev-rows"
          title="Rows by dataset"
          subtitle="Rows loaded in each dataset, with its tier"
          data={datasetRows}
          columns={[
            { key: 'dataset', label: 'Dataset' },
            { key: 'rows', label: 'Rows', format: 'int' },
            { key: 'tierLabel', label: 'Tier' },
          ]}
          definitions={[ABOUT_APP]}
          note={`${fmt(
            datasetRows.reduce((n, r) => n + r.rows, 0),
            'int',
          )} rows in ${plural(datasetRows.filter((r) => r.rows).length, 'dataset')}`}
          gate={false}
          span={4}
        >
          <BarList
            data={datasetRows}
            label="dataset"
            value="rows"
            format="int"
            secondary={(r) => r.tierLabel}
            onSelect={(r) => datasetDrill(r.key)}
            selectable={(r) => r.rows > 0}
            ariaLabel="Rows loaded in each dataset"
          />
        </Figure>
        <Figure
          id="dev-import-errors"
          title="Import error rate by version"
          subtitle="Each dataset’s current version and the earlier versions kept, oldest first"
          data={trend.map((r) => ({
            dataset: r.dataset,
            version: r.version,
            status: r.current ? 'Current' : 'Earlier',
            loaded: r.loaded,
            rows: r.rows,
            issueRate: r.issueRate,
            tier: r.tierLabel,
            key: r.key,
          }))}
          columns={[
            { key: 'dataset', label: 'Dataset' },
            { key: 'version', label: 'Version' },
            { key: 'status', label: 'Status' },
            { key: 'loaded', label: 'Loaded', format: 'date' },
            {
              key: 'rows',
              label: 'Rows',
              format: 'int',
              drill: (r: Row) =>
                r.status === 'Current' && (r.rows as number) > 0
                  ? () =>
                      rowsSpec(
                        {
                          key: r.key as DatasetKey,
                          label: String(r.dataset),
                          source: sources[r.key as DatasetKey],
                        },
                        ctx.all,
                      )
                  : null,
            },
            { key: 'issueRate', label: 'Import error rate', format: 'pct' },
            { key: 'tier', label: 'Tier' },
          ]}
          metric="quality.rules.problemRate"
          definitions={withRule('quality.rules.problemRate')}
          note={
            chartable
              ? `As of ${fmt(ctx.asOf, 'date')}`
              : 'Only the current version of each dataset is loaded, so there is no trend yet. Each replacement adds a point.'
          }
          gate={false}
          span={6}
          tableOnly={!chartable}
          table={{ maxRows: 15 }}
        >
          {chartable && (
            <Lines
              data={trend
                .filter((r) => r.loaded && r.issueRate != null)
                .map((r) => ({ ...r, date: r.loaded as string }))}
              x="date"
              y="issueRate"
              series="dataset"
              format="pct"
              zero
              ariaLabel="Import error rate of each dataset by the date each version was loaded"
            />
          )}
        </Figure>
        <Figure
          id="dev-checks"
          title="Rows failing each row check"
          subtitle="Share of each dataset’s rows that a row check flags"
          data={checks.map((c) => ({
            dataset: c.dataset,
            check: c.check,
            count: c.count,
            rows: c.rows,
            share: c.share,
          }))}
          columns={CHECK_COLUMNS.map((c) =>
            c.key === 'count'
              ? {
                  ...c,
                  drill: (r: Row) => {
                    const cell = checks.find((x) => x.dataset === r.dataset && x.check === r.check)
                    return cell?.count
                      ? () =>
                          indexRowsSpec({
                            key: cell.key,
                            data: ctx.all,
                            indexes: cell.rowIndexes,
                            title: `${cell.dataset} rows failing "${cell.check}"`,
                            source: sources[cell.key],
                          })
                      : null
                  },
                }
              : c,
          )}
          definitions={[ROWS_FAILING, ABOUT_APP]}
          note={`${plural(checks.filter((c) => c.count > 0).length, 'check')} with failing rows · the import error rate is in the figure beside it`}
          gate={false}
          span={6}
          empty={checks.length ? null : 'No dataset has rows to check.'}
        >
          {/* A ranked list of the checks that flag rows: most pass on every row, so a grid of
              datasets by checks was nearly all 0%. The table keeps every dataset and check. */}
          {failing.length ? (
            <BarList<CheckCell & { name: string }>
              data={failing}
              label="name"
              value="share"
              format="pct"
              secondary={(c) => `${fmt(c.count, 'int')} of ${fmt(c.rows, 'int')} rows`}
              selectable={(c) => c.count > 0}
              onSelect={checkDrill}
              ariaLabel="Share of rows failing each row check, the most first"
            />
          ) : (
            <p className="py-6 text-small text-muted">Every row passes every row check.</p>
          )}
        </Figure>
      </Section>

      <Section
        title="Metric dictionary"
        align="start"
        dek="Where each view’s metrics stand: their tier under the data in force, what was changed from the defaults, and which have no target."
        id="dev-section-metrics"
      >
        <Figure
          id="dev-metric-tiers"
          title="Metrics by tier and view"
          subtitle="Metrics that read data, by home view and tier"
          data={tiers}
          columns={TIER_COLUMNS}
          definitions={[ABOUT_APP]}
          note={`${plural(below, 'metric')} below the standard (${STANDARD_LABEL[ctx.standard]})`}
          gate={false}
          span={6}
        >
          <HBars<MetricTierCount>
            data={tiers}
            y="viewLabel"
            x="count"
            series="tierLabel"
            stack
            seriesOrder={METRIC_TIER_SERIES}
            colors={tierColors}
            format="int"
            onSelect={(r) => openMetricDefinitions({ view: r.view })}
            ariaLabel="Metrics by tier for each view"
          />
        </Figure>
        <Figure
          id="dev-changed"
          title="Changed definitions by view"
          subtitle="Metrics whose wording, target or settings differ from the defaults"
          data={changed.map((r) => ({ ...r, idsText: r.ids.join(', ') }))}
          columns={VIEW_COUNT_COLUMNS}
          definitions={[ABOUT_APP]}
          note={`${plural(ctx.metrics.changedCount, 'metric')} changed`}
          gate={false}
          span={3}
          empty={changed.length ? null : 'Every metric is at its defaults.'}
        >
          <BarList<ViewCount>
            data={changed}
            label="viewLabel"
            value="count"
            format="int"
            onSelect={(r) => openMetricDefinitions({ view: r.view })}
            ariaLabel="Changed metric definitions by view"
          />
        </Figure>
        <Figure
          id="dev-no-target"
          title="Metrics with no target, by view"
          subtitle="Metrics that read data and have no target in force"
          data={noTarget.map((r) => ({ ...r, idsText: r.ids.join(', ') }))}
          columns={VIEW_COUNT_COLUMNS}
          definitions={[ABOUT_APP]}
          note={`${plural(
            noTarget.reduce((n, r) => n + r.count, 0),
            'metric',
          )} without a target`}
          gate={false}
          span={3}
          empty={noTarget.length ? null : 'Every metric that reads data has a target.'}
        >
          <BarList<ViewCount>
            data={noTarget}
            label="viewLabel"
            value="count"
            format="int"
            onSelect={(r) => {
              focusInventory('metrics', r.viewLabel)
              goTo('dev', devTab('inventory', 'metrics'))
            }}
            ariaLabel="Metrics with no target by view"
          />
        </Figure>
      </Section>

      <Section
        title="Contracts"
        dek="Every figure, key figure and finding carries a metric id and the fields it reads, and every key figure and finding opens its records. Run contract checks lays out every view’s tabs off screen to judge them."
        id="dev-section-contracts"
        actions={
          <Button size="sm" disabled={!!scanning} onClick={() => void run('developer')}>
            {scanning?.mode === 'developer' ? 'Checking…' : scan ? 'Run again' : 'Run contract checks'}
          </Button>
        }
      >
        <Figure
          id="dev-contract"
          title="Contract coverage by view"
          subtitle="Figures, key figures and findings by what they lack, each counted once by its most serious gap"
          data={coverage}
          columns={[
            { key: 'viewLabel', label: 'View' },
            { key: 'statusLabel', label: 'Status' },
            { key: 'count', label: 'Elements', format: 'int' },
          ]}
          definitions={[
            ABOUT_APP,
            {
              term: 'Not judged',
              text: 'Figures about the app or the data itself (the Data room’s, this page’s) are not judged: they carry no metric id by design.',
            },
          ]}
          note={
            scan ? `${plural(elements.length, 'element')} on ${plural(scan.views.length, 'view')}` : undefined
          }
          gate={false}
          span={8}
          empty={
            scanning
              ? scanning.text
              : scan
                ? elements.length
                  ? null
                  : 'The scan found nothing to judge.'
                : 'Run contract checks to lay out every view and judge it.'
          }
          emptyAction={
            !scan && !scanning ? (
              <Button size="sm" onClick={() => void run('developer')}>
                Run contract checks
              </Button>
            ) : undefined
          }
        >
          <HBars<CoverageRow>
            data={coverage}
            y="viewLabel"
            x="count"
            series="statusLabel"
            stack="normalize"
            seriesOrder={CONTRACT_ORDER.map((s) => CONTRACT_LABEL[s])}
            colors={statusColors}
            format="int"
            onSelect={() => document.getElementById('dev-section-gaps')?.scrollIntoView({ block: 'start' })}
            ariaLabel="Share of elements complete and with each gap, by view"
          />
        </Figure>
        <Figure
          id="dev-checked"
          title="What was checked"
          subtitle="Per view: tabs laid out, elements judged and the time it took"
          data={checked}
          columns={[
            { key: 'viewLabel', label: 'View' },
            { key: 'tabs', label: 'Tabs', format: 'int' },
            { key: 'figures', label: 'Figures', format: 'int' },
            { key: 'kpis', label: 'Key figures', format: 'int' },
            { key: 'findings', label: 'Findings', format: 'int' },
            { key: 'notJudged', label: 'Not judged', format: 'int' },
            { key: 'ms', label: 'Layout ms', format: 'int' },
            { key: 'failedTabs', label: 'Tabs that failed' },
          ]}
          definitions={[ABOUT_APP]}
          note={scan ? `Took ${(scan.ms / 1000).toFixed(1)} s` : undefined}
          gate={false}
          span={4}
          tableOnly
          table={{ maxRows: 12, onRowClick: (r) => goTo(r.view as RouteView) }}
          empty={scan ? null : 'Nothing checked yet.'}
        />
        <div id="dev-section-gaps" className="col-span-full scroll-mt-4" />
        <Figure
          id="dev-gaps"
          title="Gaps"
          subtitle="Each figure, key figure or finding that lacks part of the contract"
          data={gaps}
          columns={[
            { key: 'viewLabel', label: 'View' },
            { key: 'tabLabel', label: 'Tab' },
            { key: 'element', label: 'Element' },
            { key: 'id', label: 'Id' },
            { key: 'title', label: 'In' },
            { key: 'missing', label: 'What is missing' },
          ]}
          definitions={[ABOUT_APP]}
          note={scan ? `${plural(gaps.length, 'gap')}` : undefined}
          gate={false}
          span={12}
          tableOnly
          table={{
            search: 'Find a gap',
            maxRows: 15,
            onRowClick: (r) => openElement(r.view, r.tab, r.id, r.element),
          }}
          empty={
            scan
              ? gaps.length
                ? null
                : 'No gaps: every element meets the contract.'
              : 'Run contract checks to list the gaps.'
          }
        />
      </Section>

      <Section
        title="Runtime"
        align="start"
        dek="How long each view’s summary takes, and what failed this session."
        id="dev-section-runtime"
      >
        <Figure
          id="dev-timing"
          title="Summary time per view"
          subtitle={`The latest run of each view’s summary, in ms; budget ${SUMMARY_BUDGET_MS} ms a view`}
          data={times.map((t) => ({ ...t, over: t.overBudget ? 'Yes' : 'No', about: summaryNote(t) }))}
          columns={[
            { key: 'label', label: 'View' },
            { key: 'ms', label: 'Latest ms', format: 'num1' },
            { key: 'runs', label: 'Runs', format: 'int' },
            { key: 'over', label: 'Over budget' },
            { key: 'about', label: 'Note' },
          ]}
          definitions={[ABOUT_APP]}
          note={
            times.some((t) => t.ms != null)
              ? `${plural(times.filter((t) => t.overBudget).length, 'view')} over budget · a run read from the cache is marked; views with no summary are listed without a time`
              : undefined
          }
          gate={false}
          span={6}
          empty={
            times.some((t) => t.ms != null)
              ? null
              : 'No summary has run yet. Open the Scorecard, or run all engines on the Timings tab.'
          }
        >
          <BarList<SummaryTime>
            data={times}
            label="label"
            value="ms"
            format="num1"
            sort="none"
            valueText={(r) => `${fmt(r.ms, 'num1')} ms${r.cached ? ', cached' : ''}`}
            secondary={(r) => (r.none ? summaryNote(r) : null)}
            nullNote="No time: this view has no summary, or it has not run yet"
            ref={{ value: SUMMARY_BUDGET_MS, label: `Budget ${SUMMARY_BUDGET_MS} ms` }}
            glyphTone={(r) => (r.overBudget ? 'warning' : 'default')}
            onSelect={(r) => goTo(r.view as RouteView)}
            ariaLabel="Latest summary time of each view in milliseconds"
          />
        </Figure>
        <ErrorsFigure errors={errors} />
      </Section>
    </>
  )
}

/** Why a view's summary time reads as it does, for the table and the bar. */
function summaryNote(t: SummaryTime): string {
  if (t.cached) return 'Read from the cache; run all engines on the Timings tab for a cold run'
  if (!t.none) return ''
  return VIEWS.find((v) => v.key === t.view)?.summary ? 'Not run yet' : 'No summary'
}

/** Open the element a gap names: its view and tab, scrolled to the figure. */
function openElement(view: string, tab: string, id: string, element: string) {
  goTo(view as RouteView, tab)
  if (element !== 'Figure') return
  window.setTimeout(() => {
    document.querySelector(`[data-tour="figure-${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' })
  }, 300)
}

function ErrorsFigure({ errors }: { errors: ReturnType<typeof devErrors> }) {
  const rows = [...errors].reverse().map((e) => ({ ...e, viewLabel: e.view ? viewLabel(e.view) : '' }))
  return (
    <Figure
      id="dev-errors"
      title="Errors this session"
      subtitle="The last 100, newest first: where each was caught and its message"
      data={rows}
      columns={[
        { key: 'at', label: 'Time' },
        { key: 'viewLabel', label: 'View' },
        { key: 'tab', label: 'Tab or tool' },
        { key: 'where', label: 'Where' },
        { key: 'message', label: 'Message' },
      ]}
      definitions={[ABOUT_APP]}
      note={rows.length ? `${plural(rows.length, 'error')} this session` : undefined}
      gate={false}
      span={6}
      tableOnly
      table={{
        maxRows: 10,
        onRowClick: (r) => {
          if (r.view) goTo(r.view as RouteView, r.where === 'view render' ? (r.tab ?? undefined) : undefined)
        },
      }}
      empty={rows.length ? null : 'No errors caught this session.'}
    />
  )
}
