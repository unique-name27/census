/**
 * The Data quality tab (#data.quality): the quality story for the whole dashboard.
 *
 * 1. Datasets: each dataset's tier, version, mapping, certification, freshness and issue rate.
 * 2. Fields: a matrix of every field's fill rate; each square opens its blank or invalid rows.
 * 3. Metric impact: the single fixes that would lift the most metrics, and every metric with its
 *    tier and the field or dataset limiting it.
 * 4. Checks: every rule result across datasets, each failure opening its rows.
 * 5. Trend: tier and issue rate per dataset version.
 *
 * The whole tab downloads as one "Data quality report" workbook. `#data.quality/<dataset>` opens
 * it at one dataset: its row is marked and the checks and metrics narrow to it.
 */
import { useEffect, useMemo, useState } from 'react'
import { openDatasetQuality } from '@/app/datasetFocus'
import { type Column, type Definition, Figure, Lines } from '@/charts'
import { IconDownload, IconWarning } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Section } from '@/components/Section'
import { TABLE_HEAD } from '@/components/styles'
import { TierBadge } from '@/components/tier/TierBadge'
import { tierCounts, tierCountsText } from '@/components/tier/tierModel'
import { Button, cx, Segmented } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { FIELD_REFS, type FieldRef } from '@/data/quality/fieldRef'
import { limitText } from '@/data/quality/text'
import { TIER_LABEL } from '@/data/quality/tier'
import type { QualityIndex } from '@/data/quality/types'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { Drill, drill } from '@/drill/Drill'
import { fmt, plural } from '@/lib/format'
import { readsNoData } from '@/metrics/registry'
import { openMetricDefinition } from '@/views/data/metrics/open'
import { VIEWS } from '@/views/registry'
import { type SourceInfo, sourceInfo } from '../engine/manifest'
import { rowsSpec as allRowsSpec } from '../ui/drillSpecs'
import { roomMeta } from '../ui/meta'
import { useBusy } from '../ui/useBusy'
import { fieldProblemSpec, type ProblemKind, rowsSpec } from './drills'
import { fixRows, withDrillRows } from './engine/checks'
import {
  belowGoldText,
  type Fix,
  type ImpactMetric,
  metricImpact,
  metricTierCounts,
  type UnjudgedEntry,
} from './engine/impact'
import {
  CHECK_COLUMNS,
  checkExportRows,
  DATASET_COLUMNS,
  datasetExportRows,
  FIELD_COLUMNS,
  FIX_COLUMNS,
  fieldExportRows,
  fixExportRows,
  METRIC_COLUMNS,
  metricExportRows,
  qualityReportSheets,
  TREND_COLUMNS,
  trendExportRows,
} from './engine/report'
import { shareText } from './engine/share'
import {
  type CheckRow,
  checkRows,
  type DatasetSummaryRow,
  datasetSummary,
  type FieldCell,
  fieldCells,
  type TrendRow,
  trendRows,
} from './engine/summary'
import { FieldMatrix, type MatrixRow } from './FieldMatrix'
import { datasetOfQualityRoute, qualityRoute, useQualityFocus } from './lens'
import { type MetricPick, MetricsByViewFigure, unjudgedNote } from './MetricsByView'
import { useDrillQuality } from './useDrillQuality'

type Row = Record<string, unknown>

const VIEW_DATASETS = new Map<string, readonly DatasetKey[]>(VIEWS.map((v) => [v.key, v.datasets]))

/**
 * A metric that names no fields is judged by its home view's datasets, as on screen. A rule or a
 * setting reads no data, so it is judged by none.
 */
const fallbackOf = (m: ImpactMetric): readonly DatasetKey[] =>
  readsNoData(m) ? [] : (VIEW_DATASETS.get(m.views[0]) ?? [])

const rowId = (key: DatasetKey) => `data-quality-${key}`

const LINK =
  'rounded-mark text-left font-medium text-link underline-offset-2 hover:underline focus-visible:underline'

const TIER_DEFINITION: Definition = {
  term: 'Tier',
  text: 'How far the data has come. No data: nothing loaded, or the field is blank in every row. Bronze: loaded as it came in. Silver: mapping confirmed and the checks pass. Gold: certified by its data owner for this version, reconciled and fresh.',
}

/* ───────────── the tab ───────────── */

export function QualityTab() {
  const ctx = useAnalytics()
  const routeTab = useCensus((s) => (s.route.view === 'data' ? s.route.tab : ''))
  const focus = datasetOfQualityRoute(routeTab)
  const nonce = useQualityFocus((s) => s.nonce)
  const versions = useCensus((s) => s.versions)
  const history = useCensus((s) => s.history)
  const drillQ = useDrillQuality()
  const { isBusy, run } = useBusy()
  const [fixId, setFixId] = useState<string | null>(null)
  const [pick, setPick] = useState<MetricPick | null>(null)

  const sources = useMemo(() => {
    const out = {} as Record<DatasetKey, SourceInfo>
    for (const k of DATASET_KEYS) out[k] = sourceInfo(ctx.sources[k] ?? { kind: 'sample', rowCount: 0 })
    return out
  }, [ctx.sources])
  const datasets = useMemo(
    () =>
      DATASET_KEYS.map((key) =>
        datasetSummary({
          key,
          quality: ctx.quality,
          version: versions[key],
          asOf: ctx.asOf,
        }),
      ),
    [ctx.quality, versions, ctx.asOf],
  )
  const cells = useMemo(() => DATASET_KEYS.flatMap((k) => fieldCells(k, ctx.quality)), [ctx.quality])
  const impact = useMemo(
    () => metricImpact({ metrics: ctx.metrics.list, quality: ctx.quality, fallbackOf }),
    [ctx.metrics, ctx.quality],
  )
  const checks = useMemo(
    () => DATASET_KEYS.flatMap((k) => checkRows(k, withDrillRows(ctx.quality, drillQ, k))),
    [ctx.quality, drillQ],
  )
  const trend = useMemo(
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

  // A request for one dataset (the view header strip, a link) brings its row into view. `nonce`
  // changes on every request, so asking for the same dataset again scrolls to it again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` re-runs the scroll on a repeat request
  useEffect(() => {
    if (!focus) return
    const el = document.getElementById(rowId(focus))
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [focus, nonce])

  const download = () =>
    run(
      'report',
      async () => {
        const { downloadXlsx, fileStem } = await import('@/lib/export')
        await downloadXlsx(
          qualityReportSheets({
            rules: ctx.quality.rules,
            datasets,
            fields: cells,
            fixes: impact.fixes,
            metrics: impact.metrics,
            checks,
            trend,
          }),
          roomMeta(ctx, 'Data quality'),
          // Named by the as-of date, like every other export of data: the report describes that data.
          { showPay: false, fileName: fileStem(roomMeta(ctx), 'data quality report') },
        )
      },
      'The data quality report could not be exported.',
    )

  const counts = tierCounts(ctx.quality)
  const short = cells.filter((c) => c.short)
  const metricCounts = metricTierCounts(impact.metrics)
  const belowGold = impact.metrics.length - metricCounts.gold
  const shared = { focus, sources, drillQ }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[420px]">
          <p className="max-w-[78ch] text-small text-ink-2">
            The data under every number on the dashboard: where each dataset and field stands, which metrics
            each one holds back, and the single fixes that would lift the most. Every count opens the rows
            behind it.
          </p>
          <p className="mt-1.5 text-small text-ink">
            {tierCountsText(counts)}. {plural(short.length, 'field')} of {fmt(cells.length, 'int')} short of
            silver on {short.length === 1 ? 'its' : 'their'} own.{' '}
            {impact.metrics.length > 0 && belowGoldText(belowGold, impact.metrics.length)}
          </p>
          {focus && (
            <p className="mt-1.5 text-small text-ink-2">
              Showing {datasetDef(focus).label}: its row is marked, and the checks and metrics narrow to it.{' '}
              <button type="button" className={LINK} onClick={() => goTo('data', qualityRoute())}>
                Show every dataset
              </button>
            </p>
          )}
        </div>
        <Button size="sm" icon={<IconDownload />} disabled={isBusy('report')} onClick={() => void download()}>
          {isBusy('report') ? 'Preparing report…' : 'Download data quality report'}
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-12 gap-4">
        <MetricsByViewFigure
          rows={impact.metrics}
          unjudged={impact.unjudgedList}
          onPick={(p) => {
            setFixId(null)
            setPick(p)
          }}
        />
      </div>

      <Section
        title="Datasets"
        dek="Each dataset’s tier and what holds it there. A dataset is silver once its mapping is confirmed and its checks pass, and gold once its owner certifies this version."
        className="mt-8"
      >
        <DatasetsFigure rows={datasets} checks={checks} {...shared} />
      </Section>

      <Section
        title="Fields"
        dek={`Fill rate of every field over the rows it applies to. Silver needs a field at least ${limitText(ctx.quality.rules.minCoverage)} filled, with no more than ${limitText(ctx.quality.rules.maxProblemShare)} of values not recognized or defaulted.`}
      >
        <FieldsFigure cells={cells} {...shared} />
      </Section>

      <Section
        title="Metric impact"
        dek="Every metric takes the lowest tier of the fields it reads. These are the single fixes that would raise the most metrics, each judged as if it were the only thing done."
      >
        <FixesFigure
          fixes={impact.fixes}
          cells={cells}
          selected={fixId}
          onSelect={(id) => {
            setPick(null)
            setFixId(id)
          }}
          {...shared}
        />
        <MetricsFigure
          impact={impact.metrics}
          unjudged={impact.unjudgedList}
          fix={impact.fixes.find((f) => f.id === fixId) ?? null}
          pick={pick}
          onClearFix={() => {
            setFixId(null)
            setPick(null)
          }}
          metrics={ctx.metrics.list}
          focus={focus}
        />
      </Section>

      <Section
        title="Checks"
        dek="Every rule behind the tiers, for every dataset. A check that fails opens the rows it is about."
      >
        <ChecksFigure rows={checks} {...shared} />
      </Section>

      <Section
        title="Trend"
        dek="Tier and import error rate of each version loaded. The last three versions of each dataset are kept besides the current one."
      >
        <TrendFigure rows={trend} focus={focus} sources={sources} />
      </Section>
    </div>
  )
}

interface Shared {
  focus: DatasetKey | null
  sources: Record<DatasetKey, SourceInfo>
  drillQ: QualityIndex
}

/* ───────────── 1. datasets ───────────── */

function DatasetsFigure({
  rows,
  checks,
  focus,
  sources,
}: Shared & { rows: DatasetSummaryRow[]; checks: CheckRow[] }) {
  const ctx = useAnalytics()
  const issueRows = (key: DatasetKey) =>
    checks.find((c) => c.key === key && c.id === 'issue-rate')?.rows ?? []
  const th = `${TABLE_HEAD} py-1.5 pr-3 text-left`
  return (
    <Figure
      id="data-quality-datasets"
      title="Datasets by tier"
      subtitle="Tier, version, mapping, certification, freshness and import error rate."
      data={datasetExportRows(rows)}
      columns={DATASET_COLUMNS}
      definitions={[
        TIER_DEFINITION,
        {
          term: 'Freshness',
          text: 'Days from the latest event in the rows (a hire, an application, a case) to the as-of date. Compensation has no event dates, so the date its pay extract was taken is used.',
        },
        IMPORT_ERROR_DEFINITION,
      ]}
      uses={FIELD_REFS}
      gate={false}
      image={false}
      tableToggle={false}
    >
      <div className="scroll-x">
        <table className="w-full border-collapse text-small md:min-w-[860px]">
          <caption className="sr-only">Datasets by tier</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className={th}>
                Dataset
              </th>
              <th scope="col" className={th}>
                Tier
              </th>
              <th scope="col" className={cx(th, 'hidden md:table-cell')}>
                Mapping
              </th>
              <th scope="col" className={cx(th, 'hidden md:table-cell')}>
                Certification
              </th>
              <th scope="col" className={cx(th, 'hidden lg:table-cell')}>
                Freshness
              </th>
              <th scope="col" className={cx(th, 'text-right')}>
                Import error rate
              </th>
              <th scope="col" className={cx(th, 'hidden lg:table-cell')}>
                Next tier needs
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const errorRows = issueRows(r.key)
              return (
                <tr
                  key={r.key}
                  id={rowId(r.key)}
                  className={cx(
                    'scroll-mt-24 border-b border-rule align-top last:border-b-0',
                    focus === r.key && 'bg-sheet-2',
                  )}
                >
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      className={cx(LINK, 'text-ink')}
                      onClick={() => goTo('data', qualityRoute(r.key))}
                      aria-label={`Mark ${r.dataset} and narrow the checks and metrics to it`}
                    >
                      {r.dataset}
                    </button>
                    <span className="block text-meta text-muted">
                      {r.version} ·{' '}
                      {r.rows ? (
                        <Drill
                          spec={() =>
                            allRowsSpec({ key: r.key, label: r.dataset, source: sources[r.key] }, ctx.all)
                          }
                          label={`Show the ${fmt(r.rows, 'int')} rows loaded in ${r.dataset}`}
                        >
                          {plural(r.rows, 'row')}
                        </Drill>
                      ) : (
                        'no rows'
                      )}
                    </span>
                    {/* Below md the mapping and certification sit under the name. */}
                    <span className="block text-meta text-ink-2 md:hidden">
                      {r.mapping}. {r.certification}.
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <TierBadge tier={r.tier} explain={ctx.quality.explain(r.key)} dataset={r.key} />
                  </td>
                  <td className="hidden py-2 pr-3 text-ink-2 md:table-cell">
                    {r.mappingConfirmed ? (
                      r.mapping
                    ) : (
                      <>
                        {r.mapping}.{' '}
                        <button
                          type="button"
                          className={LINK}
                          onClick={() => openDatasetQuality(r.key, 'mapping')}
                        >
                          Review
                        </button>
                      </>
                    )}
                  </td>
                  <td className="hidden py-2 pr-3 text-ink-2 md:table-cell">{r.certification}</td>
                  <td className="hidden py-2 pr-3 text-ink-2 lg:table-cell">
                    <span className="inline-flex items-start gap-1">
                      {r.fresh === false && <IconWarning className="mt-0.5 size-3.5 shrink-0 text-warning" />}
                      <span>
                        {r.fresh === false && <span className="sr-only">Not fresh: </span>}
                        {r.freshness}
                      </span>
                    </span>
                  </td>
                  <td className="tnum py-2 pr-3 text-right">
                    {r.issueRate == null ? (
                      <span className="text-muted">—</span>
                    ) : errorRows.length ? (
                      <Drill
                        spec={() =>
                          rowsSpec({
                            key: r.key,
                            data: ctx.all,
                            indexes: errorRows,
                            title: `${r.dataset} rows with an import error`,
                            source: sources[r.key],
                            note: 'Rows the last import logged with an error that are still in the loaded data.',
                          })
                        }
                        label={`Show the ${fmt(errorRows.length, 'int')} ${r.dataset} rows with an import error`}
                      >
                        {shareText(r.issueRate)}
                      </Drill>
                    ) : (
                      shareText(r.issueRate)
                    )}
                  </td>
                  <td className="hidden py-2 text-ink-2 lg:table-cell">
                    {r.next ?? <span className="text-muted">At gold</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Figure>
  )
}

/* ───────────── 2. fields ───────────── */

const ROW_KINDS: Record<'applicable' | ProblemKind | 'remapped', string> = {
  applicable: 'rows it applies to',
  blank: 'rows with no value',
  invalid: 'rows with a value not recognized',
  defaulted: 'rows filled by a default',
  remapped: 'rows changed by your reference mappings',
}

function FieldsFigure({ cells, focus, sources, drillQ }: Shared & { cells: FieldCell[] }) {
  const ctx = useAnalytics()
  const byRef = new Map(cells.map((c) => [c.ref, c]))
  const matrix: MatrixRow[] = DATASET_KEYS.map((key) => ({
    key,
    tier: ctx.quality.datasetTier(key),
    cells: cells.filter((c) => c.key === key),
  }))
  const problemsOf = (cell: FieldCell, kinds?: readonly ProblemKind[]) =>
    fieldProblemSpec({
      cell,
      data: ctx.all,
      // Blank rows are the same in both indexes; import problems need the import logs.
      rowsOf: (k) =>
        k === 'blank' ? ctx.quality.fieldRows(cell.ref, 'blank') : drillQ.fieldRows(cell.ref, k),
      source: sources[cell.key],
      minCoverage: ctx.quality.rules.minCoverage,
      ...(kinds ? { kinds } : {}),
    })
  const countDrill = (kind: keyof typeof ROW_KINDS) => (row: Row) => {
    const cell = byRef.get(row.ref as FieldRef)
    const n = row[kind]
    if (!cell || typeof n !== 'number' || n <= 0) return null
    if (kind === 'blank' || kind === 'invalid' || kind === 'defaulted') return () => problemsOf(cell, [kind])
    const q = kind === 'remapped' ? ctx.quality : drillQ
    return () =>
      rowsSpec({
        key: cell.key,
        data: ctx.all,
        indexes: q.fieldRows(cell.ref, kind),
        title: `${cell.dataset}: ${ROW_KINDS[kind]} (${cell.field})`,
        source: sources[cell.key],
        uses: [cell.ref],
      })
  }
  const columns: Column[] = FIELD_COLUMNS.map((c) =>
    c.key === 'applicable' ||
    c.key === 'blank' ||
    c.key === 'invalid' ||
    c.key === 'defaulted' ||
    c.key === 'remapped'
      ? { ...c, drill: countDrill(c.key) }
      : c,
  )
  const short = cells.filter((c) => c.short)
  const noData = cells.filter((c) => c.tier === 'none' && ctx.quality.datasetTier(c.key) !== 'none')
  return (
    <Figure
      id="data-quality-fields"
      title="Field quality"
      subtitle="Each row is a dataset and each square one of its fields, required fields first, shaded by fill rate."
      data={fieldExportRows(cells, ctx.quality.rules)}
      columns={columns}
      definitions={[
        {
          term: 'Fill rate',
          text: 'Rows holding a value as a share of the rows the field applies to. Termination type applies to leavers only, an offer date to candidates who reached the offer stage. Values set to Unknown count as blank.',
          formula: 'filled rows ÷ rows the field applies to',
        },
        {
          term: 'Short of silver',
          text: `A field filled for under ${limitText(ctx.quality.rules.minCoverage)} of its rows, or with over ${limitText(ctx.quality.rules.maxProblemShare)} of values not recognized or defaulted, is bronze in a silver or gold dataset, and so is every number that reads it. In a bronze dataset it holds those numbers back as soon as the dataset reaches silver. A gold field remapped after certification is silver.`,
        },
        TIER_DEFINITION,
      ]}
      note={`${plural(short.length, 'field')} short of silver on ${short.length === 1 ? 'its' : 'their'} own${noData.length ? `; ${plural(noData.length, 'field')} blank in every row` : ''} · as of ${fmt(ctx.asOf, 'date')}`}
      uses={FIELD_REFS}
      gate={false}
      table={{ search: 'Find a field', maxRows: 15, rowTone: (r: Row) => (r.why ? 'warning' : null) }}
    >
      <FieldMatrix
        rows={matrix}
        minCoverage={ctx.quality.rules.minCoverage}
        focus={focus}
        onOpen={(cell) => drill(() => problemsOf(cell))}
      />
    </Figure>
  )
}

/* ───────────── 3. metric impact ───────────── */

/** The rows a fix touches, as its drill opens them, and how many there are. */
function fixRowsSpec(
  fix: Fix,
  cells: readonly FieldCell[],
  shared: Shared,
  ctx: ReturnType<typeof useAnalytics>,
): { count: number; spec: () => ReturnType<typeof rowsSpec> } | null {
  if (!fix.rows) return null
  if (fix.ref) {
    const cell = cells.find((c) => c.ref === fix.ref)
    if (!cell) return null
    return {
      count: fix.rows,
      spec: () =>
        fieldProblemSpec({
          cell,
          data: ctx.all,
          rowsOf: (k) =>
            k === 'blank' ? ctx.quality.fieldRows(cell.ref, 'blank') : shared.drillQ.fieldRows(cell.ref, k),
          source: shared.sources[cell.key],
          kinds: fix.rowKinds,
          minCoverage: ctx.quality.rules.minCoverage,
        }),
    }
  }
  if (!fix.rules?.length) return null
  const rules = withDrillRows(ctx.quality, shared.drillQ, fix.dataset).filter((r) =>
    fix.rules?.includes(r.id),
  )
  // Each row once, however many checks it fails; rows the import skipped can't be listed.
  const { indexes, notLoaded } = fixRows(rules)
  if (!indexes.length) return null
  const skipped = notLoaded
    ? ` ${plural(notLoaded, 'more row')} logged with an import error ${notLoaded === 1 ? 'is' : 'are'} not loaded, so ${notLoaded === 1 ? 'it is' : 'they are'} not listed.`
    : ''
  return {
    count: indexes.length,
    spec: () =>
      rowsSpec({
        key: fix.dataset,
        data: ctx.all,
        indexes,
        title: `${datasetDef(fix.dataset).label} rows to fix`,
        source: shared.sources[fix.dataset],
        note: `${rules.map((r) => r.detail).join(' ')}${skipped}`,
      }),
  }
}

/** How many fixes show before "Show all". */
const FIRST_FIXES = 8

function FixesFigure({
  fixes,
  cells,
  selected,
  onSelect,
  ...shared
}: Shared & {
  fixes: Fix[]
  cells: FieldCell[]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const ctx = useAnalytics()
  const [all, setAll] = useState(false)
  const lifting = fixes.filter((f) => f.lifts.length > 0)
  const shown = all ? lifting : lifting.slice(0, FIRST_FIXES)
  const most = Math.max(1, ...lifting.map((f) => f.lifts.length))
  const metricUses = [...new Set(ctx.metrics.list.flatMap((m) => m.uses))]
  const idle = fixes.length - lifting.length
  return (
    <Figure
      id="data-quality-fixes"
      title="What would lift the most metrics"
      subtitle="Single fixes ranked by how many metrics each would raise to a higher tier"
      data={fixExportRows(fixes)}
      columns={FIX_COLUMNS}
      definitions={[
        {
          term: 'A fix',
          text: 'One thing a person can do: fill a field’s blanks and correct its values not recognized, or pass the checks a dataset’s next tier needs (confirm the mapping, certify the version).',
        },
        {
          term: 'Lift',
          text: 'A metric rises when its lowest field rises. Each fix is judged on its own, so a metric that also reads another weak field stays where it is.',
        },
      ]}
      note={
        lifting.length
          ? `${plural(lifting.length, 'fix', 'fixes')} would lift at least one metric${idle ? `; ${plural(idle, 'other')} would not on ${idle === 1 ? 'its' : 'their'} own` : ''}`
          : undefined
      }
      uses={metricUses.length ? metricUses : FIELD_REFS}
      gate={false}
      image={false}
      tableToggle={false}
      empty={
        lifting.length
          ? null
          : fixes.length
            ? 'No single fix would lift a metric right now. Each remaining gap needs more than one step.'
            : 'Every field and dataset is as high as it can go.'
      }
    >
      <ol className="space-y-0">
        {shown.map((f, i) => {
          const rows = fixRowsSpec(f, cells, shared, ctx)
          const isSelected = selected === f.id
          return (
            <li
              key={f.id}
              className={cx(
                'grid grid-cols-[2rem_1fr] gap-x-2 border-t border-rule py-2.5 first:border-t-0',
                isSelected && 'bg-sheet-2',
              )}
            >
              <span className="tnum pt-px text-right text-small text-muted">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-small leading-snug text-ink">{f.sentence}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta">
                  <span className="inline-flex min-w-[120px] flex-1 items-center gap-2" aria-hidden="true">
                    <span
                      className="h-1.5 rounded-full bg-s1"
                      style={{ width: `${(f.lifts.length / most) * 100}%` }}
                    />
                  </span>
                  <button
                    type="button"
                    className={LINK}
                    aria-pressed={isSelected}
                    onClick={() => {
                      onSelect(isSelected ? null : f.id)
                      if (!isSelected)
                        document
                          .getElementById('data-quality-metrics-anchor')
                          ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                    }}
                  >
                    {isSelected
                      ? 'Show every metric'
                      : f.lifts.length === 1
                        ? 'Show the metric'
                        : `Show the ${plural(f.lifts.length, 'metric')}`}
                  </button>
                  {rows && (
                    <Drill
                      spec={rows.spec}
                      label={`Show the ${fmt(rows.count, 'int')} ${rows.count === 1 ? 'row' : 'rows'} this fix touches`}
                    >
                      {`${plural(rows.count, 'row')} to fix`}
                    </Drill>
                  )}
                  {f.kind === 'dataset' && (
                    <button
                      type="button"
                      className={LINK}
                      // The panel where the step is done: Certify for gold, Mapping for silver.
                      onClick={() =>
                        openDatasetQuality(
                          f.dataset,
                          f.to === 'gold' ? 'certify' : f.to === 'silver' ? 'mapping' : 'quality',
                        )
                      }
                    >
                      Open {datasetDef(f.dataset).label}
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {lifting.length > FIRST_FIXES && (
        <div className="mt-1 border-t border-rule pt-2">
          <button type="button" className={LINK} onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${lifting.length} fixes`}
          </button>
        </div>
      )}
    </Figure>
  )
}

function MetricsFigure({
  impact,
  unjudged,
  fix,
  pick,
  onClearFix,
  metrics,
  focus,
}: {
  impact: ReturnType<typeof metricImpact>['metrics']
  unjudged: readonly UnjudgedEntry[]
  fix: Fix | null
  /** Narrowed from "Metrics by view and tier": one view, and a tier within it. */
  pick: MetricPick | null
  onClearFix: () => void
  metrics: readonly ImpactMetric[]
  focus: DatasetKey | null
}) {
  const lifted = fix ? new Set(fix.lifts.map((l) => l.metricId)) : null
  const reads = (id: string, key: DatasetKey) => {
    const m = metrics.find((x) => x.id === id)
    if (!m) return false
    return m.uses.length ? m.uses.some((r) => r.startsWith(`${key}.`)) : fallbackOf(m).includes(key)
  }
  const picked = (r: (typeof impact)[number]) =>
    !pick || (r.view === pick.view && (pick.tier == null || r.tier === pick.tier))
  const shown = impact.filter(
    (r) => picked(r) && (lifted ? lifted.has(r.id) : focus ? reads(r.id, focus) : true),
  )
  const counts = metricTierCounts(shown)
  const parts = (['gold', 'silver', 'bronze', 'none'] as const)
    .filter((t) => counts[t])
    .map((t) => `${fmt(counts[t], 'int')} ${TIER_LABEL[t].toLowerCase()}`)
  const columns: Column[] = METRIC_COLUMNS.filter((c) => c.key !== 'id')
  const rows = metricExportRows(shown)
  const metricUses = [...new Set(metrics.flatMap((m) => m.uses))]
  return (
    <>
      <span id="data-quality-metrics-anchor" className="col-span-full -mb-4 block scroll-mt-4" />
      <Figure
        id="data-quality-metrics"
        title={
          fix
            ? 'Metrics this fix would lift'
            : pick
              ? `${pick.viewLabel} metrics${pick.tier ? `, ${TIER_LABEL[pick.tier].toLowerCase()}` : ''}`
              : focus
                ? `Metrics that read ${datasetDef(focus).label}`
                : 'Metrics by tier'
        }
        subtitle={
          fix
            ? fix.sentence
            : `${pick ? `Each ${pick.viewLabel} metric${pick.tier ? ` at ${TIER_LABEL[pick.tier].toLowerCase()}` : ''}${focus ? ` that reads ${datasetDef(focus).label}` : ''}` : focus ? `Each metric that reads ${datasetDef(focus).label}` : 'Every registered metric'} with its tier and the field or dataset limiting it${parts.length ? `: ${parts.join(', ')}` : ''}.`
        }
        data={rows}
        columns={columns}
        definitions={[
          {
            term: 'Limited by',
            text: 'The field that sets the metric’s tier: the lowest of the fields it reads, the one that explains it best when several tie. A metric that names no fields takes the lowest tier of its view’s datasets.',
          },
          TIER_DEFINITION,
        ]}
        note={unjudgedNote(unjudged, 'listed') ?? undefined}
        actions={
          fix || pick ? (
            <Button size="sm" variant="ghost" onClick={onClearFix}>
              Show every metric
            </Button>
          ) : undefined
        }
        uses={metricUses.length ? metricUses : FIELD_REFS}
        gate={false}
        tableOnly
        empty={
          impact.length
            ? shown.length
              ? null
              : 'No registered metric reads this dataset.'
            : 'No metrics are registered yet. Each view lists its metrics in the dictionary as it is built.'
        }
        table={{
          search: 'Find a metric',
          maxRows: 15,
          onRowClick: (r: Row) => openMetricDefinition(String(r.id)),
          rowTone: (r: Row) => (r.tier === 'Bronze' || r.tier === 'No data' ? 'warning' : null),
        }}
      />
    </>
  )
}

/* ───────────── 4. checks ───────────── */

/** What the rows behind a check are, for the drill panel's title. */
const CHECK_ROWS_TITLE: Partial<Record<CheckRow['id'], (dataset: string) => string>> = {
  'issue-rate': (d) => `${d} rows with an import error`,
  references: (d) => `${d} rows that refer to records that are not loaded`,
  'dates-in-order': (d) => `${d} rows with a later step dated before an earlier one`,
  'no-duplicates': (d) => `${d} rows that repeat an earlier row`,
}

function ChecksFigure({ rows, focus, sources }: Shared & { rows: CheckRow[] }) {
  const ctx = useAnalytics()
  const [which, setWhich] = useState<'failing' | 'all'>('failing')
  const inFocus = focus ? rows.filter((r) => r.key === focus) : rows
  const shown = which === 'failing' ? inFocus.filter((r) => !r.pass) : inFocus
  const failing = inFocus.filter((r) => !r.pass)
  const failingDatasets = new Set(failing.map((r) => r.key)).size
  const byKey = new Map(shown.map((r) => [`${r.key}|${r.id}`, r]))
  const columns: Column[] = CHECK_COLUMNS.map((c) =>
    c.key === 'count'
      ? {
          ...c,
          drill: (row: Row) => {
            const r = byKey.get(`${row.key}|${row.id}`)
            if (!r?.rows.length) return null
            return () =>
              rowsSpec({
                key: r.key,
                data: ctx.all,
                indexes: r.rows,
                title: CHECK_ROWS_TITLE[r.id]?.(r.dataset) ?? `${r.dataset} rows behind “${r.check}”`,
                source: sources[r.key],
                note: r.detail,
              })
          },
        }
      : c,
  )
  return (
    <Figure
      id="data-quality-checks"
      title={focus ? `Checks on ${datasetDef(focus).label}` : 'Checks across datasets'}
      subtitle="References resolve, no duplicates, dates in order, freshness, mapping, certification and control totals. Silver and gold gates first."
      data={checkExportRows(shown)}
      columns={columns}
      definitions={[
        {
          term: 'Needed for',
          text: 'The tier a check gates. Information checks (dates in order, duplicates) don’t change a tier but are worth a look.',
        },
      ]}
      note={
        focus
          ? `${plural(failing.length, 'check')} not passing on ${datasetDef(focus).label}`
          : `${plural(failing.length, 'check')} not passing across ${plural(failingDatasets, 'dataset')}`
      }
      actions={
        <Segmented
          label="Which checks"
          value={which}
          onChange={setWhich}
          options={[
            { value: 'failing', label: 'Not passing' },
            { value: 'all', label: 'All checks' },
          ]}
        />
      }
      uses={FIELD_REFS}
      gate={false}
      tableOnly
      empty={shown.length ? null : 'Every check passes.'}
      table={{
        maxRows: 20,
        rowTone: (r: Row) =>
          r.result === 'Pass' ? null : r.needed === 'Information' ? 'warning' : 'critical',
      }}
    />
  )
}

/* ───────────── 5. trend ───────────── */

const IMPORT_ERROR_DEFINITION: Definition = {
  term: 'Import error rate',
  text: 'Rows the import logged with an error, as a share of the rows read: a value it could not read, or did not recognize and left blank. A value kept as it came, such as a source that is not on the list, is not an import error; Field quality counts it as not recognized. Datasets with no import log show "—". The “Issue rate within 2%” check uses this rate.',
  formula: 'rows with an import error ÷ rows read',
}

function TrendFigure({
  rows,
  focus,
  sources,
}: {
  rows: TrendRow[]
  focus: DatasetKey | null
  sources: Record<DatasetKey, SourceInfo>
}) {
  const ctx = useAnalytics()
  // The current version's rows are loaded and open; an earlier version keeps only its record.
  const columns: Column[] = TREND_COLUMNS.map((c) =>
    c.key === 'rows'
      ? {
          ...c,
          drill: (row: Row) => {
            const key = row.key as DatasetKey
            if (row.status !== 'Current' || !ctx.all[key]?.length) return null
            return () => allRowsSpec({ key, label: datasetDef(key).label, source: sources[key] }, ctx.all)
          },
        }
      : c,
  )
  const dated = rows.filter((r) => r.loaded && r.issueRate != null)
  const perDataset = new Map<string, number>()
  for (const r of dated) perDataset.set(r.dataset, (perDataset.get(r.dataset) ?? 0) + 1)
  const chartable = [...perDataset.values()].some((n) => n > 1)
  const withHistory = new Set(rows.filter((r) => !r.current).map((r) => r.key)).size
  const points = dated.map((r) => ({ ...r, date: r.loaded as string }))
  return (
    <Figure
      id="data-quality-trend"
      title="Tier and import error rate by version"
      subtitle="Each dataset’s current version and the earlier versions kept, oldest first"
      data={trendExportRows(rows)}
      columns={columns}
      definitions={[
        {
          term: 'Tier judged by',
          text: 'The current version is judged by every check. An earlier version keeps only its record: rows, mapping, blocking issues, issue rate and certification, so its references and freshness can’t be judged again.',
        },
        IMPORT_ERROR_DEFINITION,
      ]}
      note={
        withHistory
          ? `${plural(withHistory, 'dataset')} with earlier versions kept · as of ${fmt(ctx.asOf, 'date')}`
          : 'Only the current version of each dataset is loaded, so there is no trend yet. Each replacement adds a point.'
      }
      uses={FIELD_REFS}
      gate={false}
      tableOnly={!chartable}
      table={{ maxRows: 15 }}
    >
      {chartable && (
        <Lines
          data={points}
          x="date"
          y="issueRate"
          series="dataset"
          format="pct"
          zero
          emphasize={focus ? datasetDef(focus).label : undefined}
          ariaLabel="Import error rate of each dataset by the date each version was loaded"
        />
      )}
    </Figure>
  )
}
