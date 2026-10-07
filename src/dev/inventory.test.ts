/**
 * Developer > Inventory (docs/ROLES.md, 6.8 test 7): the builders are pure, their counts equal the
 * registries' (views, tabs, metrics, tools, drill kinds, datasets, routes, settings), they cover
 * every registered view, figure of a scan and metric, and every row carries the same decision in
 * each mode as the access policy.
 */
import { describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import { formulaRows } from '@/app/settings/formulaIndex'
import { QUERY_DATASETS } from '@/ask/engine/allowlist'
import { TOOL_DEFINITIONS, TOOL_NAMES } from '@/ask/engine/tools'
import type { FigureFacts } from '@/charts/types'
import { DATASET_KEYS, DATASETS } from '@/data/schema'
import { DEFAULT_SETTINGS, SETTINGS_SECTIONS } from '@/data/settings'
import { DRILL_KINDS, drillKindFacts } from '@/drill/records'
import { drillDataset } from '@/drill/types'
import { ARTICLES } from '@/help/articles'
import { TOURS } from '@/help/tours'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG, METRICS } from '@/metrics/catalog'
import { DATA_TABS, DATASET_PANELS } from '@/views/data/links'
import { VIEWS } from '@/views/registry'
import { accessInventory, accessRows, filterAccessRows, NO_ACCESS_FILTER } from './accessInventory'
import {
  ACCESS_WORD,
  accessCells,
  askToolRows,
  datasetFieldRows,
  drillRows,
  engineIds,
  engineRows,
  figureRows,
  helpRows,
  INVENTORY_LISTS,
  isInventoryList,
  metricRows,
  routeCount,
  routeRows,
  schemaFieldCount,
  searchRows,
  settingRows,
  shortcutRows,
  storageKeyRows,
  tabRows,
  viewRows,
} from './inventory'
import { type FigureScan, scannedFigures } from './scanModel'
import { SETTING_KEYS, type SettingsSnapshot, settingFacts } from './settingsFacts'
import { SHORTCUTS } from './shortcuts'

const metrics = defaultMetrics()
const routeInput = {
  views: VIEWS,
  dataTabs: DATA_TABS,
  datasetPanels: DATASET_PANELS,
  datasetKeys: DATASET_KEYS,
}
const askFields = (key: string) => QUERY_DATASETS.find((d) => d.key === key)?.fields.map((f) => f.name) ?? []

const snapshot: SettingsSnapshot = {
  settings: { ...DEFAULT_SETTINGS },
  showPay: false,
  showImmigration: false,
  mode: 'developer',
  managerName: null,
  overlays: { figures: false, tours: true, metrics: false },
  lens: false,
  askModel: 'claude-opus-5-5',
  defaultAskModel: 'claude-opus-5-5',
  askKey: 'not set',
  workspaceSet: false,
}

const facts = (id: string, extra: Partial<FigureFacts> = {}): FigureFacts => ({
  id,
  title: `Title of ${id}`,
  gated: true,
  rows: 3,
  image: true,
  kind: 'figure',
  order: 1,
  ...extra,
})

/** A scan of every view and tab, two figures and a key figure strip on each tab. */
function syntheticScan(): FigureScan {
  return {
    mode: 'developer',
    managerId: null,
    at: '2026-10-01T10:00:00Z',
    ms: 1000,
    views: VIEWS.map((v) => ({
      key: v.key,
      label: v.label,
      tabs: v.tabs.map((t) => ({ key: t.key, label: t.label, failed: false, ms: 10 })),
    })),
    figures: VIEWS.flatMap((v) =>
      v.tabs.flatMap((t) =>
        scannedFigures(v, t, [
          facts(`${v.key}-${t.key}-a`, {
            metric: 'hrbp.attrition.voluntary',
            uses: ['employees.terminationDate'],
          }),
          facts(`${v.key}-${t.key}-empty`, { rows: 0 }),
          facts('key-figures', {
            kind: 'table',
            gated: false,
            image: false,
            items: { kind: 'kpi', list: [{ id: 'k', metricId: 'x', uses: true, drill: true }] },
          }),
        ]),
      ),
    ),
  }
}

describe('inventory counts equal the registries', () => {
  it('views and tabs', () => {
    const v = viewRows(VIEWS)
    expect(v.rows).toHaveLength(VIEWS.length)
    expect(v.rows.map((r) => r.key)).toEqual(VIEWS.map((x) => x.key))
    const t = tabRows(VIEWS)
    expect(t.rows).toHaveLength(VIEWS.reduce((n, x) => n + x.tabs.length, 0))
    for (const view of VIEWS)
      for (const tab of view.tabs)
        expect(
          t.rows.some((r) => r.viewKey === view.key && r.tab === tab.key),
          `${view.key}.${tab.key}`,
        ).toBe(true)
  })

  it('metrics: every entry of the dictionary, once', () => {
    const m = metricRows(formulaRows(metrics, null), metrics)
    expect(m.rows).toHaveLength(METRICS.length)
    expect(new Set(m.rows.map((r) => r.id))).toEqual(new Set(CATALOG.list.map((d) => d.id)))
  })

  it('engine functions, Ask tools, drill kinds and dataset fields', () => {
    expect(engineRows(VIEWS, {}).rows.map((r) => r.id)).toEqual(engineIds(VIEWS))
    // Every view has a headline; the scorecard reads every summary.
    for (const v of VIEWS) expect(engineIds(VIEWS)).toContain(`${v.key}.headline`)
    const ask = askToolRows(TOOL_DEFINITIONS)
    expect(ask.rows.map((r) => r.name)).toEqual([...TOOL_NAMES])
    const drills = drillRows(DRILL_KINDS, drillKindFacts, drillDataset)
    expect(drills.rows.map((r) => r.kind)).toEqual([...DRILL_KINDS])
    for (const r of drills.rows) expect(DATASET_KEYS, String(r.kind)).toContain(r.dataset)
    const fields = datasetFieldRows({ askFields, quality: null })
    expect(fields.rows).toHaveLength(schemaFieldCount())
    expect(new Set(fields.rows.map((r) => r.datasetKey))).toEqual(new Set(DATASETS.map((d) => d.key)))
  })

  it('routes: every view and tab, the Data room tabs and panels, the metric address, the Action center and the Developer tabs', () => {
    const r = routeRows(routeInput)
    expect(r.rows).toHaveLength(routeCount(routeInput))
    const addresses = new Set(r.rows.map((x) => x.address))
    for (const v of VIEWS) {
      expect(addresses.has(`#${v.key}`), v.key).toBe(true)
      for (const t of v.tabs) expect(addresses.has(`#${v.key}.${t.key}`)).toBe(true)
    }
    for (const a of [
      '#actions',
      '#data',
      '#data.quality',
      '#data.employees-raw',
      '#dev',
      '#dev.inventory',
      '#dev.ask',
    ])
      expect(addresses.has(a), a).toBe(true)
    // Where a mode redirects an address, the row says hidden.
    const row = (a: string) => r.rows.find((x) => x.address === a)
    expect(row('#dev.inventory')).toMatchObject({ developer: 'Shown', hr: 'Hidden', manager: 'Hidden' })
    expect(row('#comp')).toMatchObject({ developer: 'Shown', hr: 'Shown', manager: 'Hidden' })
    expect(row('#talent.retention')).toMatchObject({ hr: 'Shown', manager: 'Hidden' })
    expect(row('#team')).toMatchObject({ hr: 'Hidden', manager: 'Shown' })
  })

  it('settings: every saved setting, the session switches, the mode and the overlays', () => {
    const facts = settingFacts(snapshot)
    const rows = settingRows(facts).rows
    // Every saved setting but the old compensation cycle mirror (now in the metric dictionary).
    const saved = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== 'compCycle')
    expect([...SETTING_KEYS].sort()).toEqual(saved.sort())
    expect(rows.length).toBe(SETTING_KEYS.length + 2 + 1 + 3 + 4)
    expect(rows.find((r) => r.setting === 'Debug overlay: tour targets')).toMatchObject({
      value: 'On',
      developer: 'Shown',
      hr: 'Hidden',
      manager: 'Hidden',
    })
    expect(rows.find((r) => r.setting === 'Quality lens')?.manager).toBe('Hidden')
    expect(rows.find((r) => r.setting === 'Ask key')?.value).toBe('not set')
    // Each row's section is a real Settings section or the session.
    for (const f of facts) expect(['session', ...SETTINGS_SECTIONS], f.setting).toContain(f.section)
  })

  it('shortcuts and help', () => {
    expect(shortcutRows(SHORTCUTS).rows).toHaveLength(SHORTCUTS.length)
    const help = helpRows(ARTICLES, TOURS).rows
    expect(help).toHaveLength(ARTICLES.length + TOURS.length)
    expect(help.find((r) => r.id === 'developer-tools' && r.kind === 'Tour')).toMatchObject({
      developer: 'Shown',
      hr: 'Hidden',
      manager: 'Hidden',
    })
  })

  it('lists every list the picker offers', () => {
    expect(INVENTORY_LISTS.map((l) => l.key)).toEqual([
      'views',
      'tabs',
      'figures',
      'metrics',
      'engines',
      'ask',
      'drills',
      'datasets',
      'storage',
      'routes',
      'settings',
      'shortcuts',
      'help',
    ])
    expect(isInventoryList('figures')).toBe(true)
    expect(isInventoryList('nope')).toBe(false)
  })
})

describe('figures from a scan', () => {
  it('lists every figure the scan saw on every view and tab, empty ones included, and no table registrations', () => {
    const scan = syntheticScan()
    const rows = figureRows(scan).rows
    const tabs = VIEWS.reduce((n, v) => n + v.tabs.length, 0)
    expect(rows).toHaveLength(tabs * 2)
    for (const v of VIEWS)
      for (const t of v.tabs) {
        expect(
          rows.some((r) => r.id === `${v.key}-${t.key}-a` && r.viewKey === v.key && r.tabKey === t.key),
        ).toBe(true)
        expect(rows.find((r) => r.id === `${v.key}-${t.key}-empty`)?.rows).toBe(0)
      }
    expect(rows.some((r) => r.id === 'key-figures')).toBe(false)
    expect(rows[0]).toMatchObject({
      metric: 'hrbp.attrition.voluntary',
      uses: 1,
      image: 'Yes',
      heldBack: 'No',
    })
    expect(figureRows(null).rows).toEqual([])
  })
})

describe('the decision in each mode', () => {
  it('matches the policy, and Developer shows everything', () => {
    for (const s of [
      'view:comp',
      'tab:talent.retention',
      'masthead:dev',
      'ask:explain_quality',
      'drill:cases',
    ]) {
      const cells = accessCells(s)
      expect(cells.developer).toBe('Shown')
      expect(cells.hr).toBe(ACCESS_WORD[decide('hr', s).access])
      expect(cells.manager).toBe(ACCESS_WORD[decide('manager', s).access])
    }
    for (const r of [
      ...viewRows(VIEWS).rows,
      ...tabRows(VIEWS).rows,
      ...askToolRows(TOOL_DEFINITIONS).rows,
      ...shortcutRows(SHORTCUTS).rows,
    ])
      expect(r.developer).toBe('Shown')
    expect(viewRows(VIEWS).rows.find((r) => r.key === 'team')).toMatchObject({
      hr: 'Hidden',
      manager: 'Shown',
    })
    const metricRow = metricRows(formulaRows(metrics, null), metrics).rows.find((r) =>
      String(r.id).startsWith('comp.'),
    )
    expect(metricRow?.manager).toBe('Hidden')
  })

  it('agrees with the access matrix the Access tab shows', () => {
    const rows = accessRows(VIEWS)
    const inv = accessInventory(VIEWS)
    expect(inv.views.map((v) => v.key)).toEqual(VIEWS.map((v) => v.key))
    for (const v of viewRows(VIEWS).rows) {
      const m = rows.find((r) => r.surface === `view:${v.key}`)
      expect(m, String(v.key)).toBeDefined()
      expect(ACCESS_WORD[m!.manager.access]).toBe(v.manager)
      expect(ACCESS_WORD[m!.hr.access]).toBe(v.hr)
    }
    expect(filterAccessRows(rows, NO_ACCESS_FILTER)).toHaveLength(rows.length)
    const differ = filterAccessRows(rows, { ...NO_ACCESS_FILTER, differ: true })
    expect(differ.length).toBeGreaterThan(0)
    for (const r of differ)
      expect(r.developer.access === r.hr.access && r.hr.access === r.manager.access).toBe(false)
    const hiddenForManager = filterAccessRows(rows, {
      ...NO_ACCESS_FILTER,
      mode: 'manager',
      decision: 'hidden',
    })
    for (const r of hiddenForManager) expect(r.manager.access).toBe('hidden')
  })
})

describe('purity', () => {
  it('builds the same rows twice and never changes its inputs', () => {
    const views = Object.freeze([...VIEWS])
    const before = JSON.stringify(views.map((v) => [v.key, v.tabs]))
    expect(viewRows(views)).toEqual(viewRows(views))
    expect(routeRows({ ...routeInput, views })).toEqual(routeRows({ ...routeInput, views }))
    expect(helpRows(ARTICLES, TOURS)).toEqual(helpRows(ARTICLES, TOURS))
    expect(JSON.stringify(views.map((v) => [v.key, v.tabs]))).toBe(before)
    const scan = syntheticScan()
    const copy = JSON.stringify(scan)
    figureRows(scan)
    expect(JSON.stringify(scan)).toBe(copy)
  })

  it('searches every cell, all words', () => {
    const rows = viewRows(VIEWS).rows
    expect(searchRows(rows, '')).toHaveLength(rows.length)
    const hits = searchRows(rows, 'people stats')
    expect(hits.map((r) => r.key)).toContain('hrbp')
    expect(searchRows(rows, 'people zzz')).toEqual([])
  })

  it('lists storage rows as given', () => {
    expect(storageKeyRows(null).rows).toEqual([])
    const rows = storageKeyRows([
      {
        key: 'census:views',
        where: 'localStorage',
        bytes: 40,
        holds: 'Saved views',
        unknown: false,
        inSettingsFile: false,
        secret: false,
      },
    ]).rows
    expect(rows).toEqual([
      { key: 'census:views', where: 'localStorage', bytes: 40, holds: 'Saved views', inFile: 'No' },
    ])
  })
})
