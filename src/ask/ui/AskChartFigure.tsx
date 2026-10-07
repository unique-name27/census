/**
 * A chart Ask drew (docs/ASK-ACTIONS.md, part 4), drawn with the chart kit in a full Census
 * `Figure`: exports (CSV, Excel, PNG, SVG, copy) stamped "Ask Census" with the scope and period it
 * was calculated for, the table view, definitions, tier, and the records behind every mark through
 * the source's refs. Names are put back locally (`chartWithNames`), so the chart and its exports
 * show people by name; nothing of that goes to Claude. Open full size shows it in a large
 * overlay; Pin to My charts keeps it in the panel for the session.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { type ReactNode, useState } from 'react'
import { type AskChart, type Conversation, chartWithNames, SOMEONE } from '@/ask/engine'
import {
  BarList,
  BulletList,
  Columns,
  DotStrip,
  Figure,
  HBars,
  Heatmap,
  Histogram,
  Lines,
  Scatter,
} from '@/charts'
import type { Column, Definition } from '@/charts/types'
import { IconClose, IconPin } from '@/components/icons'
import { AreaContext, windowArea } from '@/components/mainArea'
import { TierBadge } from '@/components/tier/TierBadge'
import { cx, IconButton } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import { definitionOf } from '@/metrics/api'
import {
  type ChartRow,
  type ChartView,
  chartNote,
  chartSourceText,
  chartView,
  mergeDrills,
  refOf,
  refsOf,
  rowFormat,
} from './chartView'
import { IconExpand } from './icons'
import { useAsk } from './store'

/** The chart in the kit component its form uses. */
function KitChart({
  chart,
  view,
  conversation,
  big,
}: {
  chart: AskChart
  view: ChartView
  conversation: Conversation
  /** Full size: taller plots. */
  big: boolean
}) {
  const { rows, spec } = view
  const recordsOf = (row: ChartRow | null | undefined) => {
    const ref = refOf(chart, row)
    return ref ? conversation.records(ref) : null
  }
  const open = (row: ChartRow) => drill(recordsOf(row))
  const can = (row: ChartRow) => !!refOf(chart, row)
  const height = big ? 380 : undefined
  const label = chart.title
  switch (spec.kit) {
    case 'BarList':
      return (
        <BarList
          data={rows}
          label={spec.label}
          value={spec.value}
          format={spec.format}
          sort="none"
          rowHeight={big ? 32 : undefined}
          onSelect={open}
          selectable={can}
          ariaLabel={label}
        />
      )
    case 'HBars':
      return (
        <HBars
          data={rows}
          y={spec.y}
          x={spec.x}
          series={spec.series}
          seriesOrder={spec.seriesOrder}
          format={spec.format}
          onSelect={open}
          onSelectSegment={open}
          selectable={(d) => can(d)}
          ariaLabel={label}
        />
      )
    case 'Columns':
      return (
        <Columns
          data={rows}
          x={spec.x}
          y={spec.y}
          series={spec.series ?? undefined}
          seriesOrder={spec.seriesOrder}
          stack={spec.stack}
          xType={spec.xType}
          xOrder={spec.xOrder}
          format={spec.format}
          height={height}
          onSelect={open}
          onSelectSegment={open}
          selectable={(d) => can(d)}
          ariaLabel={label}
        />
      )
    case 'Lines': {
      const names = spec.xNames
      return (
        <Lines
          data={rows}
          x={spec.x}
          y={spec.y}
          series={spec.series ?? undefined}
          seriesOrder={spec.seriesOrder}
          format={spec.format}
          xLabel={names ? (x) => names[x] ?? x : undefined}
          height={height}
          onSelect={open}
          selectable={can}
          ariaLabel={label}
        />
      )
    }
    case 'Heatmap':
      return (
        <Heatmap
          data={rows}
          x={spec.x}
          y={spec.y}
          value={spec.value}
          xOrder={spec.xOrder}
          yOrder={spec.yOrder}
          format={spec.format}
          rowHeight={big ? 32 : undefined}
          onSelect={open}
          selectable={can}
          ariaLabel={label}
        />
      )
    case 'Scatter':
      return (
        <Scatter
          data={rows}
          x={spec.x}
          y={spec.y}
          label={spec.label}
          xFormat={spec.xFormat}
          yFormat={spec.yFormat}
          xLabel={spec.xLabel}
          yLabel={spec.yLabel}
          height={height}
          onSelect={open}
          selectable={can}
          ariaLabel={label}
        />
      )
    case 'DotStrip':
      return (
        <DotStrip
          data={rows}
          x={spec.x}
          y={spec.y}
          label={spec.label}
          xFormat={spec.xFormat}
          yOrder={spec.yOrder}
          onSelect={open}
          selectable={can}
          ariaLabel={label}
        />
      )
    case 'Histogram':
      return (
        <Histogram
          data={rows}
          value={spec.value}
          format={spec.format}
          unit={spec.unit}
          height={height}
          onSelect={(bin) => {
            const binTitle = `${chart.title}: ${fmt(bin.x0, spec.format)} to ${fmt(bin.x1, spec.format)}`
            const specs = refsOf(chart, bin.rows).map((r) => {
              const src = conversation.records(r)
              return typeof src === 'function' ? src() : (src ?? null)
            })
            drill(mergeDrills(specs, binTitle))
          }}
          selectable={(bin) => refsOf(chart, bin.rows).length > 0}
          ariaLabel={label}
        />
      )
    case 'BulletList': {
      const value = spec.value
      return (
        <BulletList
          data={rows}
          label={spec.label}
          value={spec.value}
          target={spec.target}
          format={(row, v) => fmt(v, rowFormat(chart, value, row))}
          onSelect={open}
          selectable={can}
          ariaLabel={label}
        />
      )
    }
  }
}

/** The Figure around the chart. */
function ChartSheet({
  chart,
  named,
  conversation,
  big,
  actions,
}: {
  chart: AskChart
  /** The chart with names in place of person tokens. */
  named: AskChart
  conversation: Conversation
  big: boolean
  actions: ReactNode
}) {
  const { metrics } = useAnalytics()
  const view = chartView(named)
  const columns: Column<ChartRow>[] = view.columns.map((c) => {
    const key = c.formatKey
    return {
      key: c.key,
      label: c.label,
      format: key ? (row: ChartRow) => rowFormat(named, c.key, row) : c.format,
      ...(c.sortKey ? { sortValue: (row: ChartRow) => row[c.sortKey as string] } : {}),
      ...(c.drills
        ? {
            drill: (row: ChartRow) => {
              const ref = refOf(chart, row)
              return ref ? conversation.records(ref) : null
            },
          }
        : {}),
    }
  })
  const metricDef = chart.metric ? definitionOf(metrics, chart.metric) : null
  const definitions: Definition[] = [
    ...(metricDef ? [metricDef] : []),
    {
      term: 'Where the numbers come from',
      text: chartSourceText(named),
    },
  ]
  return (
    <Figure
      id={chart.id}
      title={named.title}
      subtitle={named.subtitle ?? undefined}
      data={view.tableRows}
      columns={columns}
      definitions={definitions}
      note={chartNote(named)}
      metric={chart.metric ?? undefined}
      gate={false}
      exportMeta={{
        view: 'Ask Census',
        viewKey: 'ask',
        tab: undefined,
        scope: named.scope,
        window: named.period,
      }}
      actions={actions}
    >
      <KitChart chart={chart} view={view} conversation={conversation} big={big} />
    </Figure>
  )
}

/** The chart in a large overlay over everything, for reading and presenting. */
function FullSize({
  open,
  onOpenChange,
  children,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  title: string
}) {
  return (
    <BDialog.Root open={open} onOpenChange={onOpenChange}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup
          aria-label={`${title}, full size`}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[min(1120px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-sheet bg-page text-ink shadow-(--shadow-pop) outline-none transition-[opacity,scale] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0"
        >
          <div className="flex items-center justify-end px-2 pt-2">
            <BDialog.Close
              aria-label="Close full size"
              className="inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose />
            </BDialog.Close>
          </div>
          {/* The overlay is as wide as the window allows: it lays out for the window, not the panel. */}
          <AreaContext value={windowArea}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          </AreaContext>
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  )
}

/**
 * A chart in an answer (or in My charts). `pinKey` is its key in My charts: the current chat's for
 * a chart in the conversation, the pin's own in the list.
 */
export function AskChartFigure({
  chart,
  conversation,
  question,
  pinKey,
}: {
  chart: AskChart
  conversation: Conversation
  question: string
  pinKey: string
}) {
  const [full, setFull] = useState(false)
  const pinned = useAsk((s) => s.pinned.some((p) => p.key === pinKey))
  const pin = useAsk((s) => s.pin)
  const unpin = useAsk((s) => s.unpin)
  const named = chartWithNames(chart, (t) => conversation.person(t)?.name ?? SOMEONE)
  const tier = chart.tier
  const actions = (big: boolean) => (
    <>
      {tier && (
        <TierBadge
          compact
          tier={tier}
          explain={`Its numbers come from ${named.source}.`}
          className="mr-0.5"
        />
      )}
      {!big && (
        <IconButton label="Open full size" size="sm" onClick={() => setFull(true)}>
          <IconExpand />
        </IconButton>
      )}
      <IconButton
        label="Pin to My charts"
        size="sm"
        aria-pressed={pinned}
        className={cx(pinned && 'bg-hover text-ink')}
        onClick={() => (pinned ? unpin(pinKey) : pin({ chart, conversation, question }))}
      >
        <IconPin />
      </IconButton>
    </>
  )
  return (
    <>
      {/* Part of the answer: the panel's own sheet, set off by hairlines, its text aligned with the answer's. */}
      <div className="-mx-5 border-y border-rule px-1">
        <ChartSheet
          chart={chart}
          named={named}
          conversation={conversation}
          big={false}
          actions={actions(false)}
        />
      </div>
      <FullSize open={full} onOpenChange={setFull} title={named.title}>
        {full && (
          <ChartSheet chart={chart} named={named} conversation={conversation} big actions={actions(true)} />
        )}
      </FullSize>
    </>
  )
}
