/**
 * The Developer page's numbers on the sample: the Overview's data, dictionary, runtime and storage
 * figures, the State tab's sections (never the Ask key), and the engine runs.
 */
import { describe, expect, it } from 'vitest'
import { matrixCounts } from '@/access/matrix'
import { sampleCtx } from '@/ask/engine/testkit'
import { DATASET_KEYS } from '@/data/schema'
import type { TimingEntry } from '@/lib/timing'
import { readsNoData } from '@/metrics/registry'
import { VIEWS } from '@/views/registry'
import { accessRows } from './accessInventory'
import { callEngine, engineJson, engineMeasure, returnedText, runAllEngines, runOne } from './engines'
import {
  belowStandardCount,
  bytesText,
  changedByView,
  checkCells,
  engineStats,
  freshnessRows,
  goldCount,
  metricTierCounts,
  noTargetByView,
  rowsByDataset,
  scorecardMs,
  storageBars,
  summaryTimes,
  timingStats,
} from './overview'
import { stateSections } from './state'
import type { StorageRow } from './storageKeys'

const ctx = sampleCtx()
const viewDatasets = (v: string) => VIEWS.find((x) => x.key === v)?.datasets ?? []
const label = (v: string) => VIEWS.find((x) => x.key === v)?.label ?? v

describe('the Overview on the sample', () => {
  it('data: freshness, rows, gold and row checks', () => {
    const fresh = freshnessRows(ctx.quality)
    expect(fresh.length).toBeGreaterThan(0)
    for (const r of fresh) {
      expect(r.maxDays).toBeGreaterThan(0)
      if (r.ageDays != null) expect(Number.isFinite(r.ageDays)).toBe(true)
      expect(r.fresh).toBe(r.ageDays != null && r.ageDays <= r.maxDays)
    }
    const rows = rowsByDataset(ctx.quality)
    expect(rows.map((r) => r.key)).toEqual([...DATASET_KEYS])
    expect(rows.find((r) => r.key === 'employees')?.rows).toBe(ctx.all.employees.length)
    const gold = goldCount(ctx.quality)
    expect(gold.loaded).toBeGreaterThan(0)
    expect(gold.gold).toBeLessThanOrEqual(gold.loaded)
    const checks = checkCells(ctx.quality)
    expect(checks.length).toBeGreaterThan(0)
    // Only checks that flag rows one by one: the dataset-level pass or fail rules are left out.
    expect(new Set(checks.map((c) => c.rule))).toEqual(
      new Set(['references', 'dates-in-order', 'no-duplicates']),
    )
    for (const c of checks) {
      expect(c.share).not.toBeNull()
      expect(c.share!).toBeGreaterThanOrEqual(0)
      expect(c.share!).toBeLessThanOrEqual(1)
      expect(c.rowIndexes.length).toBeLessThanOrEqual(c.rows)
    }
  })

  it('dictionary: every metric that reads data has one tier, by home view', () => {
    const tiers = metricTierCounts(ctx.metrics, ctx.quality, viewDatasets)
    const reading = ctx.metrics.list.filter((d) => !readsNoData(d)).length
    expect(tiers.reduce((n, r) => n + r.count, 0)).toBe(reading)
    expect(belowStandardCount(tiers, 'bronze')).toBe(
      tiers.filter((r) => r.tier === 'none').reduce((n, r) => n + r.count, 0),
    )
    expect(belowStandardCount(tiers, 'gold')).toBeGreaterThanOrEqual(belowStandardCount(tiers, 'silver'))
    // The sample's dictionary is at its defaults.
    expect(changedByView(ctx.metrics)).toEqual([])
    const noTarget = noTargetByView(ctx.metrics)
    for (const r of noTarget) for (const id of r.ids) expect(ctx.metrics.target(id)).toBeNull()
  })

  it('runtime: the latest summary per view, the scorecard total and the slowest measures', () => {
    const entries: TimingEntry[] = [
      { name: 'census:scorecard:hrbp', start: 1, ms: 100 },
      { name: 'census:scorecard:hrbp', start: 5, ms: 30 },
      { name: 'census:scorecard:talent', start: 2, ms: 500 },
      { name: 'census:headline:hrbp', start: 3, ms: 2 },
      { name: 'census:context', start: 4, ms: 50 },
    ]
    const times = summaryTimes(entries, label)
    expect(times.map((t) => [t.view, t.ms, t.runs, t.overBudget])).toEqual([
      ['talent', 500, 1, true],
      ['hrbp', 30, 2, false],
    ])
    expect(scorecardMs(times)).toBe(530)
    expect(scorecardMs([])).toBeNull()
    // A cache hit after a computed run doesn't hide it; a view with cache hits only says so; with
    // the view list, every view is listed, those with no run last.
    const withHits = summaryTimes(
      [
        ...entries,
        { name: 'census:scorecard:hrbp', start: 9, ms: 0.01 },
        { name: 'census:scorecard:comp', start: 9, ms: 0.02 },
      ],
      label,
      ['hrbp', 'talent', 'comp', 'org', 'ai'],
    )
    expect(withHits.map((t) => [t.view, t.ms, t.cached, t.none])).toEqual([
      ['talent', 500, false, false],
      ['hrbp', 30, false, false],
      ['comp', 0.02, true, false],
      ['org', null, false, true],
      ['ai', null, false, true],
    ])
    const stats = timingStats(entries)
    expect(stats.find((s) => s.name === 'census:scorecard:hrbp')).toMatchObject({
      runs: 2,
      median: 65,
      max: 100,
      last: 30,
    })
    expect(engineStats(stats).map((s) => s.name)).not.toContain('census:context')
  })

  it('storage: the 12 largest keys and the rest together', () => {
    const rows: StorageRow[] = Array.from({ length: 15 }, (_, i) => ({
      key: `census:k${i}`,
      where: 'localStorage',
      bytes: (i + 1) * 100,
      holds: '',
      unknown: false,
      inSettingsFile: false,
      secret: false,
    }))
    const bars = storageBars(rows)
    expect(bars).toHaveLength(13)
    expect(bars[0]).toMatchObject({ key: 'census:k14', bytes: 1500 })
    expect(bars[12]).toMatchObject({ key: 'Other (3)', bytes: 100 + 200 + 300 })
    expect(bars[12].folded).toEqual(['census:k2', 'census:k1', 'census:k0'])
    expect(bytesText(512)).toBe('512 B')
    expect(bytesText(2048)).toBe('2.0 KB')
    expect(bytesText(null)).toBe('—')
  })
})

describe('the State tab', () => {
  it('describes every section and never holds the Ask key', () => {
    const sections = stateSections({
      ctx,
      route: { view: 'dev', tab: 'state' },
      hash: '#dev.state',
      addressScope: { present: false },
      asOfOverride: null,
      savedStandard: 'bronze',
      lens: false,
      versions: {},
      counts: matrixCounts(accessRows(VIEWS)),
      savedViews: { count: 2, applied: null, startup: null },
      panels: {
        drillDepth: 0,
        drillTop: null,
        helpOpen: false,
        tour: null,
        askOpen: false,
        askTurns: 0,
        askKey: 'set for this tab',
        model: 'claude-opus-5-5',
        workspaceSet: true,
      },
      storage: { unavailable: false, rows: null },
    })
    expect(sections.map((s) => s.id)).toEqual([
      'route',
      'scope',
      'mode',
      'switches',
      'quality',
      'data',
      'views',
      'panels',
      'storage',
    ])
    for (const s of sections) {
      expect(s.rows.length, s.id).toBeGreaterThan(0)
      for (const r of s.rows) expect(r.value, `${s.id} ${r.label}`).not.toBe('')
    }
    const text = JSON.stringify(sections)
    expect(text.includes('sk-ant')).toBe(false)
    expect(text.includes('wrkspc_')).toBe(false)
    expect(sections.find((s) => s.id === 'mode')?.rows[0].value).toBe('HR')
  })
})

describe('engine runs', () => {
  const hrbp = VIEWS.find((v) => v.key === 'hrbp')!

  it('runs one function and counts what it returned', () => {
    const out = runOne(hrbp, 'summary', ctx)
    expect(out.run.id).toBe('hrbp.summary')
    expect(out.run.error).toBeNull()
    expect(out.run.returned).toMatch(/^\d+ KPIs?, \d+ findings?$/)
    expect(engineMeasure('hrbp', 'summary')).toBe('census:scorecard:hrbp')
    expect(returnedText('actions', [1, 2])).toBe('2 items')
    expect(returnedText('headline', { value: '9.1%', label: 'attrition' })).toBe('9.1% attrition')
    const broken = {
      ...hrbp,
      headline: () => {
        throw new Error('boom')
      },
    }
    expect(callEngine(broken, 'headline', ctx).error).toBe('boom')
  })

  it('runs each function cold and warm', async () => {
    const two = VIEWS.filter((v) => v.key === 'hrbp' || v.key === 'org')
    const runs = await runAllEngines(two, ctx, () => sampleCtx())
    const ids = runs.map((r) => r.id)
    expect(ids).toContain('hrbp.headline')
    expect(ids).toContain('hrbp.summary')
    for (const r of runs) {
      expect(r.coldMs, r.id).not.toBeNull()
      expect(r.ms, r.id).toBeGreaterThanOrEqual(0)
      expect(r.error, r.id).toBeNull()
    }
  })

  it('shows a value as JSON without functions, cutting long lists', () => {
    const text = engineJson(
      { f: () => 1, list: Array.from({ length: 30 }, (_, i) => i), set: new Set([1, 2]) },
      5,
    )
    const parsed = JSON.parse(text)
    expect(parsed.f).toBeUndefined()
    expect(parsed.list).toEqual([0, 1, 2, 3, 4, '… 25 more'])
    expect(parsed.set).toEqual([1, 2])
  })
})
