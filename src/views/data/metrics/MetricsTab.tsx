/**
 * Data room → Metric definitions (#data.metrics): the dictionary of every metric Census shows
 * (docs/METRICS.md). A searchable list on the left, filtered by view, tier, "changed from
 * default" and "has a target"; the open metric on the right, with its wording, target and
 * settings edited in place, the data it uses with each field's tier and fill rate, where it
 * appears and its change log. The whole dictionary downloads as an Excel "Metric dictionary"
 * and an edited copy imports back after a preview.
 *
 * The address carries the open metric and a view filter (`./links.ts`), so "Edit definition"
 * links from any KPI or figure land on the metric, and Back walks through the metrics opened.
 */
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { goTo } from '@/components/navigation'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { VIEWS } from '@/views/registry'
import { useYourName } from '../mapping/ui/hooks'
import { type Arrival, arrivalAt, metricsTab, parseMetricsTab } from './links'
import {
  filterRows,
  filtersShowing,
  type MetricFilters,
  metricRows,
  NO_FILTERS,
  type ViewDatasets,
} from './model'
import { DictionaryBar } from './ui/DictionaryBar'
import { MetricDetail } from './ui/MetricDetail'
import { MetricList } from './ui/MetricList'
import { Overview } from './ui/Overview'

/** The datasets each view reads: the tier of a metric that names no fields. */
const VIEW_DATASETS: ViewDatasets = Object.fromEntries(VIEWS.map((v) => [v.key, v.datasets]))

const LG = '(min-width: 1024px)'

export function MetricsTab() {
  const ctx = useAnalytics()
  const api = ctx.metrics
  const routeTab = useCensus((s) => (s.route.view === 'data' ? s.route.tab : ''))
  const route = parseMetricsTab(routeTab)
  const [name, setName] = useYourName()
  const rows = useMemo(() => metricRows(api, ctx.quality, VIEW_DATASETS), [api, ctx.quality])
  const [filters, setFilters] = useState<MetricFilters>(() => ({
    ...NO_FILTERS,
    view: route.view ?? 'all',
  }))
  const detailRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const selected = route.metric && api.def(route.metric) ? route.metric : null
  const def = selected ? api.def(selected) : undefined
  const base = selected ? api.defaultDef(selected) : undefined
  const shown = filterRows(rows, filters)

  // The metric the list itself just opened, so arriving at it keeps focus in the list side by side.
  const fromList = useRef<string | null>(null)
  // A request to bring the open metric into view (`arrivalAt`). It is state, so it is carried out
  // after the render that applies the filters below, once the list above the detail has settled.
  const [reveal, setReveal] = useState<(Arrival & { n: number }) | null>(null)
  const revealNow = (a: Arrival | null) => {
    if (a) setReveal((r) => ({ ...a, n: (r?.n ?? 0) + 1 }))
  }
  const narrow = () => typeof window !== 'undefined' && !window.matchMedia(LG).matches

  // An address that names a view or a metric (a link from a KPI, Back) shows it: the view becomes
  // the filter, filters that would hide the metric are cleared, and the metric is brought into view.
  const follow = useEffectEvent((tab: string) => {
    const r = parseMetricsTab(tab)
    setFilters((f) => {
      const next = r.view ? { ...f, view: r.view } : f
      return r.metric
        ? filtersShowing(
            next,
            rows.find((x) => x.id === r.metric),
          )
        : next
    })
    const listed = fromList.current
    fromList.current = null
    const metric = r.metric && api.def(r.metric) ? r.metric : null
    revealNow(arrivalAt(metric, { narrow: narrow(), fromList: !!metric && listed === metric }))
  })
  useEffect(() => {
    follow(routeTab)
  }, [routeTab])
  useEffect(() => {
    if (!reveal) return
    if (reveal.scroll) detailRef.current?.scrollIntoView({ block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [reveal])

  const open = (id: string | null) => {
    const view = filters.view === 'all' ? null : filters.view
    const tab = metricsTab({ view, metric: id })
    if (tab === routeTab) {
      // The address stays put (the metric is already open): on one column, bring it up again.
      revealNow(arrivalAt(id, { narrow: narrow(), fromList: true }))
      return
    }
    fromList.current = id
    goTo('data', tab)
  }

  return (
    <div>
      <p className="max-w-[80ch] text-[13px] text-ink-2">
        The definition, formula, settings and target of every metric Census shows. Change one and every view
        recalculates with it. Changes are logged with who made them and when, and can be undone.
      </p>
      <div className="mt-4">
        <DictionaryBar api={api} isSample={ctx.isSample} name={name} setName={setName} />
      </div>
      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <MetricList
          rows={rows}
          shown={shown}
          filters={filters}
          setFilters={setFilters}
          selected={selected}
          onOpen={open}
          className="lg:sticky lg:top-4 lg:col-span-5"
        />
        <div ref={detailRef} className="min-w-0 scroll-mt-4 lg:col-span-7">
          {def && base ? (
            <MetricDetail
              key={def.id}
              ctx={ctx}
              def={def}
              base={base}
              by={name}
              viewDatasets={VIEW_DATASETS}
              onClose={() => open(null)}
              headingRef={headingRef}
            />
          ) : (
            <Overview api={api} rows={rows} by={name} onOpen={open} />
          )}
          {route.metric && !def && (
            <p className="mt-3 text-[13px] text-ink-2" role="status">
              No metric has the ID <span className="font-mono">{route.metric}</span>. It may have been
              renamed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
