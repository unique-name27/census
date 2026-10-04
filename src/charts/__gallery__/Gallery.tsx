/**
 * Chart kit gallery (dev only, served at /gallery.html): every kit chart inside a Figure with
 * fake data, the data tier badges and the below-standard states, a theme switch to check light
 * and dark, the pay-amounts switch, and the view exports driven by the figure registry.
 */
import { useState } from 'react'
import { IconDownload, IconSlides } from '@/components/icons'
import { Button, Segmented, Switch, TooltipProvider } from '@/components/ui'
import { AnalyticsProvider, useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { exportViewDeck, exportViewWorkbook } from '@/lib/export/view'
import { DataTable } from '../DataTable'
import { Figure } from '../Figure'
import { BarList } from '../kit/BarList'
import { Columns } from '../kit/Columns'
import { DotStrip } from '../kit/DotStrip'
import { HBars } from '../kit/HBars'
import { Heatmap } from '../kit/Heatmap'
import { Histogram } from '../kit/Histogram'
import { Lines } from '../kit/Lines'
import { Meter } from '../kit/Meter'
import { RangeBars } from '../kit/RangeBars'
import { Scatter } from '../kit/Scatter'
import { Legend } from '../Legend'
import { FigureRegistryProvider, useFigureRegistry } from '../registry'
import { useChartTheme } from '../theme'
import type { Column, ExportMeta } from '../types'
import * as D from './data'
import { TierGallery } from './Tiers'

type ThemeChoice = 'system' | 'light' | 'dark'

function applyTheme(v: ThemeChoice) {
  if (v === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', v)
}

function Toolbar() {
  const [theme, setTheme] = useState<ThemeChoice>('system')
  const showPay = useCensus((s) => s.showPay)
  const setShowPay = useCensus((s) => s.setShowPay)
  const registry = useFigureRegistry()
  const ctx = useAnalytics()
  const [busy, setBusy] = useState(false)
  const meta: ExportMeta = {
    view: 'Chart kit',
    tab: 'Gallery',
    scope: ctx.scopeLabel,
    window: ctx.window.label,
    asOf: ctx.asOf,
    isSample: true,
    company: 'Northgate Semiconductor',
  }
  const run = async (fn: typeof exportViewWorkbook) => {
    if (!registry) return
    setBusy(true)
    try {
      await fn(registry.list(), meta, { showPay })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented<ThemeChoice>
        label="Theme"
        value={theme}
        onChange={(v) => {
          setTheme(v)
          applyTheme(v)
        }}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <Switch checked={showPay} onChange={setShowPay} label="Show pay amounts" />
      <Button icon={<IconDownload />} disabled={busy} onClick={() => void run(exportViewWorkbook)}>
        Export workbook
      </Button>
      <Button icon={<IconSlides />} disabled={busy} onClick={() => void run(exportViewDeck)}>
        Export slides
      </Button>
    </div>
  )
}

const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${(Math.abs(v) * 100).toFixed(1)}%`

const reqColumns: Column<(typeof D.reqLinks)[number]>[] = [
  { key: 'id', label: 'Req ID', href: (r) => r.url },
  { key: 'title', label: 'Title' },
  { key: 'daysOpen', label: 'Days open', format: 'days' },
]

function Charts() {
  const [picked, setPicked] = useState('')
  const theme = useChartTheme()
  return (
    <div className="grid grid-cols-12 gap-4">
      <p className="col-span-12 text-[13px] text-ink-2" aria-live="polite">
        Click a bar, segment, line or Other row to test drill-down. {picked && `Selected: ${picked}`}
      </p>
      <TierGallery onOpen={(tier) => setPicked(`${tier} badge`)} />
      <Figure
        id="gal-attrition-by-dept"
        title="Voluntary attrition by department"
        subtitle="Annualized, last 12 months"
        data={D.attritionByDept}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'rate', label: 'Attrition', format: 'pct' },
          { key: 'leavers', label: 'Leavers', format: 'int' },
          { key: 'headcount', label: 'Avg headcount', format: 'int' },
        ]}
        definitions={[
          {
            term: 'Voluntary attrition',
            text: 'Voluntary exits in the window divided by average headcount, annualized.',
            formula: 'voluntary exits ÷ avg headcount × 12 ÷ months',
          },
          { term: 'Average headcount', text: 'Mean of month-end headcount snapshots across the window.' },
        ]}
        note="Groups under 5 people are hidden · as of 30 Sep 2026"
        span={6}
      >
        <BarList
          data={D.attritionByDept}
          label="department"
          value="rate"
          format="pct"
          secondary={(d) => `${d.leavers} of ${d.headcount}`}
          ref={{ value: 0.118, label: 'Company 11.8%' }}
          tone={(d) => ((d.rate ?? 0) > 0.14 ? 'critical' : (d.rate ?? 0) > 0.12 ? 'warning' : 'default')}
          top={8}
          onSelect={(d) => setPicked(d.department)}
          onSelectOther={(rows) => setPicked(`Other: ${rows.map((r) => r.department).join(', ')}`)}
          other={(rest) => {
            const l = rest.reduce((a, b) => a + b.leavers, 0)
            const h = rest.reduce((a, b) => a + b.headcount, 0)
            return h ? l / h : null
          }}
        />
      </Figure>

      <Figure
        id="gal-time-to-fill"
        title="Time to fill by department"
        subtitle="Median days from req opened to offer accepted"
        data={D.timeToFill}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'days', label: 'Median days', format: 'days' },
          { key: 'n', label: 'Reqs filled', format: 'int' },
        ]}
        note="80 reqs filled"
        span={6}
        detail={{
          label: 'Requisitions',
          columns: [
            { key: 'department', label: 'Department' },
            { key: 'days', label: 'Days', format: 'days' },
          ],
          rows: () => D.timeToFill,
        }}
      >
        <Columns
          data={D.timeToFill}
          x="department"
          y="days"
          format="days"
          ref={{ value: 45, label: 'Target 45 d' }}
        />
      </Figure>

      <Figure
        id="gal-hires-by-source"
        title="Hires by month and source"
        subtitle="Accepted offers, last 12 months"
        data={D.hiresByMonth}
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'source', label: 'Source' },
          { key: 'hires', label: 'Hires', format: 'int' },
        ]}
        span={8}
      >
        <Columns
          data={D.hiresByMonth}
          x="month"
          xType="month"
          y="hires"
          series="source"
          stack
          seriesOrder={D.SOURCES}
          onSelect={(d) => setPicked(`${d.month} (all sources)`)}
          onSelectSegment={(d) => setPicked(`${d.month} · ${d.source}: ${d.hires}`)}
        />
      </Figure>

      <Figure
        id="gal-hires-total"
        title="Hires per month"
        data={D.hiresTotal}
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'hires', label: 'Hires', format: 'int' },
        ]}
        span={4}
      >
        <Columns data={D.hiresTotal} x="month" xType="month" y="hires" height={200} />
      </Figure>

      <Figure
        id="gal-hires-grouped"
        title="Hires by source, grouped"
        data={D.hiresByMonth.filter((h) => h.month >= '2026-04')}
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'source', label: 'Source' },
          { key: 'hires', label: 'Hires', format: 'int' },
        ]}
        span={12}
      >
        <Columns
          data={D.hiresByMonth.filter((h) => h.month >= '2026-04')}
          x="month"
          xType="month"
          y="hires"
          series="source"
          seriesOrder={D.SOURCES}
          onSelectSegment={(d) => setPicked(`${d.month} · ${d.source}: ${d.hires}`)}
        />
      </Figure>

      <Figure
        id="gal-table-only"
        title="Leavers by department"
        subtitle="Table-only figure with pay column"
        data={D.attritionByDept.map((d, i) => ({ ...d, cost: d.leavers * 42_000 + i * 1000 }))}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'leavers', label: 'Leavers', format: 'int' },
          { key: 'regretted', label: 'Regretted', format: 'int' },
          { key: 'rate', label: 'Attrition', format: 'pct' },
          { key: 'cost', label: 'Replacement cost', format: 'money', pay: true },
        ]}
        tableOnly
        table={{ search: true, maxRows: 6, rowTone: (r) => ((r.rate ?? 0) > 0.14 ? 'critical' : null) }}
        span={6}
      />

      <Figure
        id="gal-empty"
        title="Offers declined by reason"
        data={[]}
        columns={[]}
        empty="No declined offers in this period."
        span={6}
      />

      <Figure
        id="gal-headcount-trend"
        title="Headcount by business unit"
        subtitle="Month-end employees"
        data={D.headcountTrend}
        columns={[
          { key: 'date', label: 'Month', format: 'date' },
          { key: 'unit', label: 'Business unit' },
          { key: 'headcount', label: 'Headcount', format: 'int' },
        ]}
        span={8}
      >
        <Lines
          data={D.headcountTrend}
          x="date"
          y="headcount"
          series="unit"
          format="int"
          onSelect={(d) => setPicked(`${d.unit} on ${d.date}: ${d.headcount}`)}
        />
      </Figure>

      <Figure
        id="gal-attrition-trend"
        title="Attrition, trailing 12 months"
        data={D.attritionTrend}
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'rate', label: 'Attrition', format: 'pct' },
        ]}
        span={4}
      >
        <Lines
          data={D.attritionTrend}
          x="month"
          y="rate"
          format="pct"
          area
          ref={{ value: 0.12, label: 'Plan 12%' }}
          height={200}
        />
      </Figure>

      <Figure
        id="gal-headcount-emph"
        title="Memory is the only unit shrinking"
        subtitle="Emphasis: one series in the accent, the rest gray"
        data={D.headcountTrend}
        columns={[
          { key: 'date', label: 'Month', format: 'date' },
          { key: 'unit', label: 'Business unit' },
          { key: 'headcount', label: 'Headcount', format: 'int' },
        ]}
        span={6}
      >
        <Lines
          data={D.headcountTrend}
          x="date"
          y="headcount"
          series="unit"
          emphasize="Memory"
          format="int"
          height={220}
        />
      </Figure>

      <Figure
        id="gal-cases-mix"
        title="Case priority mix by category"
        subtitle="Share of cases opened, last 12 months"
        data={D.casesByCategory}
        columns={[
          { key: 'category', label: 'Category' },
          { key: 'priority', label: 'Priority' },
          { key: 'cases', label: 'Cases', format: 'int' },
        ]}
        span={6}
      >
        <HBars
          data={D.casesByCategory}
          y="category"
          x="cases"
          series="priority"
          stack="normalize"
          seriesOrder={D.PRIORITIES}
        />
      </Figure>

      <Figure
        id="gal-cases-stacked"
        title="Cases by category"
        data={D.casesByCategory}
        columns={[
          { key: 'category', label: 'Category' },
          { key: 'priority', label: 'Priority' },
          { key: 'cases', label: 'Cases', format: 'int' },
        ]}
        span={6}
      >
        <HBars
          data={D.casesByCategory}
          y="category"
          x="cases"
          series="priority"
          stack
          seriesOrder={D.PRIORITIES}
          onSelect={(d) => setPicked(`${d.category} (all priorities)`)}
          onSelectSegment={(d) => setPicked(`${d.category} · ${d.priority}: ${d.cases}`)}
        />
      </Figure>

      <Figure
        id="gal-cases-grouped"
        title="Cases by category, grouped"
        data={D.casesByCategory.filter((c) => c.priority !== 'P4')}
        columns={[
          { key: 'category', label: 'Category' },
          { key: 'priority', label: 'Priority' },
          { key: 'cases', label: 'Cases', format: 'int' },
        ]}
        span={6}
      >
        <HBars
          data={D.casesByCategory.filter((c) => c.priority !== 'P4')}
          y="category"
          x="cases"
          series="priority"
        />
      </Figure>

      <Figure
        id="gal-compa-hist"
        title="Compa-ratio distribution"
        subtitle="Salary ÷ range midpoint, employees in range"
        data={D.compaRatios}
        columns={[
          { key: 'id', label: 'Employee ID' },
          { key: 'level', label: 'Level' },
          { key: 'compaRatio', label: 'Compa-ratio', format: 'ratio' },
        ]}
        span={6}
      >
        <Histogram
          data={D.compaRatios}
          value="compaRatio"
          format="ratio"
          thresholds={24}
          band={[0.9, 1.1]}
          bandLabel="Target range"
          refs={[
            { value: 1, label: 'Midpoint' },
            { value: 0.8, label: 'Range min' },
          ]}
          unit="employees"
        />
      </Figure>

      <Figure
        id="gal-heat-seq"
        title="Attrition by department and level"
        subtitle="Annualized; hidden where fewer than 5 people"
        data={D.heat}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'level', label: 'Level' },
          { key: 'rate', label: 'Attrition', format: 'pct' },
          { key: 'n', label: 'Headcount', format: 'int' },
        ]}
        span={6}
      >
        <Heatmap data={D.heat} x="level" y="department" value="rate" n="n" format="pct" />
      </Figure>

      <Figure
        id="gal-heat-div"
        title="Change in attrition vs prior year"
        data={D.heat}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'level', label: 'Level' },
          { key: 'delta', label: 'Change', format: 'pts' },
        ]}
        span={6}
      >
        <Heatmap data={D.heat} x="department" y="level" value="delta" format="pts" scheme="diverging" />
      </Figure>

      <Figure
        id="gal-scatter"
        title="Span of control and attrition"
        subtitle="One dot per manager, sized by number of teams"
        data={D.managers}
        columns={[
          { key: 'name', label: 'Manager' },
          { key: 'span', label: 'Direct reports', format: 'int' },
          { key: 'attrition', label: 'Team attrition', format: 'pct' },
        ]}
        span={6}
      >
        <Scatter
          data={D.managers}
          x="span"
          y="attrition"
          r="teams"
          label="name"
          tone={(d) => d.tone}
          xFormat="int"
          yFormat="pct"
          xLabel="Direct reports"
          yLabel="Team attrition"
          rLabel="Teams"
          refY={{ value: 0.11, label: 'Company 11%' }}
        />
      </Figure>

      <Figure
        id="gal-dotstrip"
        title="Compa-ratio by level"
        subtitle="One dot per employee; tick is the level median"
        data={D.compaRatios}
        columns={[
          { key: 'id', label: 'Employee ID' },
          { key: 'level', label: 'Level' },
          { key: 'compaRatio', label: 'Compa-ratio', format: 'ratio' },
        ]}
        span={6}
      >
        <DotStrip
          data={D.compaRatios}
          x="compaRatio"
          y="level"
          id="id"
          label="id"
          xFormat="ratio"
          median
          ref={{ value: 1, label: 'Midpoint' }}
          tone={(d) => (d.compaRatio < 0.8 ? 'critical' : 'default')}
        />
      </Figure>

      <Figure
        id="gal-ranges"
        title="Salary ranges by level"
        subtitle="Range minimum to maximum, midpoint and median pay"
        data={D.ranges}
        columns={[
          { key: 'level', label: 'Level' },
          { key: 'min', label: 'Minimum', format: 'moneyFull', pay: true },
          { key: 'mid', label: 'Midpoint', format: 'moneyFull', pay: true },
          { key: 'max', label: 'Maximum', format: 'moneyFull', pay: true },
          { key: 'median', label: 'Median pay', format: 'moneyFull', pay: true },
        ]}
        span={6}
      >
        <RangeBars
          data={D.ranges}
          y="level"
          min="min"
          max="max"
          mid="mid"
          labels={{ range: 'Salary range' }}
          markers={[
            { key: 'median', label: 'Median pay' },
            { key: 'market', label: 'Market median' },
          ]}
        />
      </Figure>

      <Figure
        id="gal-quartiles"
        title="Pay spread by level"
        subtitle="10th to 90th percentile, middle 50% and median"
        data={D.ranges}
        columns={[
          { key: 'level', label: 'Level' },
          { key: 'p10', label: '10th percentile', format: 'moneyFull', pay: true },
          { key: 'q1', label: '25th percentile', format: 'moneyFull', pay: true },
          { key: 'median', label: 'Median', format: 'moneyFull', pay: true },
          { key: 'q3', label: '75th percentile', format: 'moneyFull', pay: true },
          { key: 'p90', label: '90th percentile', format: 'moneyFull', pay: true },
        ]}
        span={6}
      >
        <RangeBars data={D.ranges} y="level" min="p10" max="p90" q1="q1" q3="q3" mid="median" />
      </Figure>

      <Figure
        id="gal-rating-mix"
        title="Rating mix by group"
        subtitle="Ordinal scheme: ratings 1-5 on the sequential ramp"
        data={D.ratingMix}
        columns={[
          { key: 'group', label: 'Group' },
          { key: 'rating', label: 'Rating' },
          { key: 'people', label: 'People', format: 'int' },
        ]}
        span={6}
      >
        <HBars
          data={D.ratingMix}
          y="group"
          x="people"
          series="rating"
          stack="normalize"
          seriesOrder={D.RATINGS}
          scheme="ordinal"
        />
      </Figure>

      <Figure
        id="gal-hires-other"
        title="Hires by source, with Other"
        subtitle="Other is gray and listed last"
        data={D.hiresWithOther}
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'source', label: 'Source' },
          { key: 'hires', label: 'Hires', format: 'int' },
        ]}
        span={6}
      >
        <Columns data={D.hiresWithOther} x="month" xType="month" y="hires" series="source" stack />
      </Figure>

      <Figure
        id="gal-quarterly"
        title="Attrition by quarter"
        subtitle="Quarter-end ticks; Other in gray"
        data={D.quarterlyAttrition}
        columns={[
          { key: 'date', label: 'Quarter end', format: 'date' },
          { key: 'unit', label: 'Unit' },
          { key: 'rate', label: 'Attrition', format: 'pct2' },
        ]}
        span={6}
      >
        <Lines data={D.quarterlyAttrition} x="date" y="rate" series="unit" format="pct" xTicks="quarter" />
      </Figure>

      <Figure
        id="gal-glyph-tone"
        title="Time to fill against target"
        subtitle="Status glyph beside the value, bars keep slot 1"
        data={D.timeToFill}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'days', label: 'Median days', format: (r) => (r.days > 60 ? 'days' : 'int') },
        ]}
        span={6}
      >
        <BarList
          data={D.timeToFill}
          label="department"
          value="days"
          format="days"
          glyphTone={(d) => (d.days > 60 ? 'critical' : d.days > 45 ? 'warning' : 'default')}
        />
      </Figure>

      <Figure
        id="gal-attrition-change"
        title="Attrition change by department"
        subtitle="Signed value labels from valueText"
        data={D.attritionChange}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'change', label: 'Change', format: 'pts' },
        ]}
        span={6}
      >
        <BarList
          data={D.attritionChange}
          label="department"
          value="change"
          format="pct"
          valueText={(d) => signedPct(d.change)}
          ref={{ value: 0.006, label: 'Company +0.6%' }}
          onSelect={(d) => setPicked(d.department)}
        />
      </Figure>

      <Figure
        id="gal-successor-counts"
        title="Successors by readiness"
        subtitle="Small counts tick whole numbers; Q1 2026 is hidden (fewer than 5 roles)"
        data={D.successorCounts}
        columns={[
          { key: 'quarter', label: 'Quarter' },
          { key: 'band', label: 'Readiness' },
          { key: 'people', label: 'Successors', format: 'int' },
        ]}
        span={6}
      >
        <Columns
          data={D.successorCounts}
          x="quarter"
          y="people"
          series="band"
          stack
          seriesOrder={D.READINESS}
          scheme="ordinal"
          ref={{ value: 3, label: 'Plan 3' }}
          height={200}
          onSelectSegment={(d) => setPicked(`${d.quarter} · ${d.band}`)}
        />
      </Figure>

      <Figure
        id="gal-hidden-grid"
        title="Attrition in small groups"
        subtitle="Every group is under 5 people: no color legend"
        data={D.hiddenGrid}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'level', label: 'Level' },
          { key: 'rate', label: 'Attrition', format: 'pct' },
        ]}
        span={6}
      >
        <Heatmap data={D.hiddenGrid} x="level" y="department" value="rate" n="n" format="pct" />
      </Figure>

      <Figure
        id="gal-req-links"
        title="Open requisitions"
        subtitle="Body is a table with links: no table toggle"
        data={D.reqLinks}
        columns={reqColumns}
        span={6}
        image={false}
        tableToggle={false}
      >
        <DataTable columns={reqColumns} rows={D.reqLinks} caption="Open requisitions" />
      </Figure>

      <Figure
        id="gal-legend-shapes"
        title="Legend swatches"
        subtitle="Rect, line, dot and diamond"
        data={D.legendShapes}
        columns={[
          { key: 'shape', label: 'Shape' },
          { key: 'label', label: 'Use' },
        ]}
        span={6}
        image={false}
        tableToggle={false}
      >
        <Legend
          spec={{
            kind: 'swatch',
            items: D.legendShapes.map((s, i) => ({
              label: s.label,
              color: theme.series[i] ?? theme.ink,
              shape: s.shape,
            })),
          }}
        />
      </Figure>

      <Figure
        id="gal-meters"
        title="Training completion"
        subtitle="Required courses completed on time, target 95%"
        data={D.training}
        columns={[
          { key: 'course', label: 'Course' },
          { key: 'rate', label: 'Completed on time', format: 'pct' },
        ]}
        span={6}
        image={false}
      >
        <ul className="grid gap-3">
          {D.training.map((m) => (
            <li key={m.course} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
              <span className="text-[13px] text-ink-2">{m.course}</span>
              <span className="text-[13px] font-medium">{Math.round(m.rate * 100)}%</span>
              <div className="col-span-2">
                <Meter
                  value={m.rate}
                  target={0.95}
                  tone={m.tone}
                  label={m.course}
                  targetLabel="on-time target"
                />
              </div>
            </li>
          ))}
        </ul>
      </Figure>
    </div>
  )
}

export function Gallery() {
  return (
    <AnalyticsProvider>
      <TooltipProvider>
        <FigureRegistryProvider>
          <main className="mx-auto max-w-[1440px] px-(--gutter) py-8">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="eyebrow">Census · development</div>
                <h1 className="cut-head text-[28px] font-semibold">Chart kit</h1>
              </div>
              <Toolbar />
            </header>
            <Charts />
          </main>
        </FigureRegistryProvider>
      </TooltipProvider>
    </AnalyticsProvider>
  )
}
