/**
 * Developer > Inventory and Access (docs/ROLES.md, 6.8 test 7; docs/ROLES-V2.md 5.13 and 8.3): the
 * builders are pure, their counts equal the registries' (views, tabs, role homes, metrics, tools,
 * drill kinds, datasets, routes, settings), they cover every registered view, figure of a scan and
 * metric, every row carries the same decision in each of the eleven modes as the access policy,
 * and the Access tab's rows are the ones the access matrix test snapshots, letter for letter.
 */
import { describe, expect, it } from 'vitest'
import { accessMatrix, MATRIX_MODES, matrixText } from '@/access/matrix'
import { HOME_OF, MODES, NO_PICKS } from '@/access/modes'
import { decide } from '@/access/policy'
import { VIEW_TABS } from '@/access/policy/kit'
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
import { ALL_HOME_FIGURES, HOME_FIGURES } from '@/views/home/engine/figures'
import { VIEWS } from '@/views/registry'
import {
  accessInventory,
  accessRows,
  filterAccessRows,
  modesDiffer,
  NO_ACCESS_FILTER,
  rowHow,
} from './accessInventory'
import {
  ACCESS_COLUMNS,
  ACCESS_WORD,
  accessCells,
  askToolRows,
  datasetFieldRows,
  drillRows,
  engineIds,
  engineRows,
  figureRows,
  helpRows,
  homeFigureCount,
  homeRoleRows,
  howByMode,
  INVENTORY_LISTS,
  inventorySub,
  isInventoryList,
  MODE_COLUMN_LABEL,
  metricRows,
  parseInventorySub,
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
import { type FigureScan, figurePlace, scannedFigures } from './scanModel'
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
  picks: { ...NO_PICKS, unit: 'Silicon Engineering', recruiter: { name: '*', id: null } },
  managerName: () => null,
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
    picks: {},
    scope: null,
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
    // The saved settings, two session switches, the mode, its four picks, three overlays, four others.
    expect(rows.length).toBe(SETTING_KEYS.length + 2 + 1 + 4 + 3 + 4)
    expect(rows.find((r) => r.setting === 'Mode')?.value).toBe('Developer')
    expect(rows.find((r) => r.setting === 'Mode pick: business unit')?.value).toBe('Silicon Engineering')
    expect(rows.find((r) => r.setting === 'Mode pick: recruiter')?.value).toBe('every recruiter')
    expect(rows.find((r) => r.setting === 'Mode pick: region')?.value).toBe('None')
    expect(settingRows(settingFacts({ ...snapshot, mode: 'hrbp-unit' })).rows[0].value).toBe(
      'HRBP for a business unit: Silicon Engineering',
    )
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
      'homes',
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
    // A home preview rides on the Role homes list's address.
    expect(parseInventorySub('homes/finance')).toEqual({ list: 'homes', arg: 'finance' })
    expect(parseInventorySub('figures')).toEqual({ list: 'figures', arg: '' })
    expect(parseInventorySub('nope/finance')).toEqual({ list: 'views', arg: '' })
    expect(inventorySub('homes', 'hrbp-region')).toBe('homes/hrbp-region')
    expect(inventorySub('homes')).toBe('homes')
  })

  it('role homes: every mode once, with its home page, figures, pick, scope and pay', () => {
    const rows = homeRoleRows({
      picks: { ...NO_PICKS, region: 'APAC', managerId: 'E1' },
      managerName: (id) => (id === 'E1' ? 'Priya Raman' : null),
    }).rows
    expect(rows.map((r) => r.key)).toEqual([...MODES])
    for (const r of rows) expect(r.address).toBe(`#${HOME_OF[r.key as keyof typeof HOME_OF]}`)
    const row = (k: string) => rows.find((r) => r.key === k)
    expect(row('finance')).toMatchObject({
      home: 'Home',
      pick: 'None',
      pay: 'Cost totals',
      opens: 'A preview of this home',
    })
    expect(row('finance')?.figures).toBe(HOME_FIGURES.fin.length)
    expect(row('hrbp-region')).toMatchObject({ pick: 'Region', inUse: 'APAC', scope: 'One region' })
    expect(row('hrbp-unit')).toMatchObject({ pick: 'Business unit', inUse: 'Not picked yet' })
    expect(row('manager')).toMatchObject({ home: 'My team', inUse: "Priya Raman's org", opens: 'My team' })
    expect(row('hr')).toMatchObject({ home: 'Scorecard', pay: 'Amounts behind the switch' })
    expect(row('developer')?.figures).toBeNull()
    expect(homeFigureCount('chro')).toBe(HOME_FIGURES.chro.length)
    // Every home figure is counted on some role's home.
    const counted = new Set(Object.values(HOME_FIGURES).flat())
    expect([...counted].sort()).toEqual([...ALL_HOME_FIGURES].sort())
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
  it('has a column for each of the eleven modes, in the matrix order', () => {
    expect(ACCESS_COLUMNS.map((c) => c.key)).toEqual([...MATRIX_MODES, 'how'])
    for (const m of MODES) expect(MODE_COLUMN_LABEL[m].length, m).toBeLessThanOrEqual(11)
    for (const s of [
      'view:home',
      'tab:comp.cost',
      'figure:home-fin-kpis',
      'pay:totals',
      'ask:query_records',
    ]) {
      const cells = accessCells(s)
      for (const m of MATRIX_MODES) expect(cells[m], `${s} ${m}`).toBe(ACCESS_WORD[decide(m, s).access])
    }
  })

  it('says how, one sentence per group of modes that say the same', () => {
    const how = howByMode({
      developer: { access: 'shown' },
      hr: { access: 'hidden', how: 'Developer mode only.' },
      chro: { access: 'hidden', how: 'Developer mode only.' },
      finance: { access: 'limited', how: 'Cost totals only.' },
      manager: { access: 'shown', how: 'Never read.' },
    })
    expect(how).toBe('HR, CHRO: Developer mode only. Finance: Cost totals only.')
    expect(howByMode({})).toBe('')
  })

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
      for (const mode of MATRIX_MODES) expect(ACCESS_WORD[m!.decisions[mode].access], mode).toBe(v[mode])
    }
    expect(filterAccessRows(rows, NO_ACCESS_FILTER)).toHaveLength(rows.length)
    const differ = filterAccessRows(rows, { ...NO_ACCESS_FILTER, differ: true })
    expect(differ.length).toBeGreaterThan(0)
    for (const r of differ)
      expect(new Set(MATRIX_MODES.map((m) => r.decisions[m].access)).size).toBeGreaterThan(1)
    // A surface only a role mode hides still differs (Developer, HR and Manager can agree on it).
    expect(differ.some((r) => r.developer.access === r.hr.access && r.hr.access === r.manager.access)).toBe(
      true,
    )
    expect(rows.filter(modesDiffer)).toHaveLength(differ.length)
    for (const mode of MATRIX_MODES) {
      const hidden = filterAccessRows(rows, { ...NO_ACCESS_FILTER, mode, decision: 'hidden' })
      for (const r of hidden) expect(r.decisions[mode].access, `${mode} ${r.surface}`).toBe('hidden')
      if (mode !== 'developer') expect(hidden.length, mode).toBeGreaterThan(0)
      // Read in one mode, the how is that mode's own sentence.
      for (const r of hidden.slice(0, 20)) expect(rowHow(r, mode)).toBe(r.decisions[mode].how ?? '')
    }
    // The search reads every mode's sentence.
    const finance = rows.find((r) => r.decisions.finance.access === 'hidden' && r.decisions.finance.how)
    if (finance?.decisions.finance.how) {
      const words = finance.decisions.finance.how.slice(0, 24)
      expect(filterAccessRows(rows, { ...NO_ACCESS_FILTER, query: words }).length).toBeGreaterThan(0)
    }
  })

  it('lists the matrix test rows, letter for letter, home figures and analyses included', () => {
    // The inventory the matrix test snapshots (src/access/matrix.test.ts): the views in folder
    // order with every planned tab, the role homes' figures on their pages, the analyses.
    const registry = new Map(VIEWS.map((v) => [v.key as string, v]))
    const views = (Object.keys(VIEW_TABS) as (keyof typeof VIEW_TABS)[]).map((key) => {
      const v = registry.get(key)
      const tabs = (v?.tabs ?? []).map((t) => ({ key: t.key, label: t.label }))
      for (const t of VIEW_TABS[key]) if (!tabs.some((x) => x.key === t.key)) tabs.push({ ...t })
      return { key, label: v?.label ?? key, tabs }
    })
    const expected = accessMatrix({ ...accessInventory(VIEWS), views })
    const rows = accessRows(VIEWS)
    for (const id of ALL_HOME_FIGURES)
      expect(
        rows.some((r) => r.surface === `figure:${id}`),
        id,
      ).toBe(true)
    expect(rows.some((r) => r.surface === 'tab:hrbp.analyses:quality')).toBe(true)
    expect(matrixText(rows)).toBe(matrixText(expected))
  })
})

describe('figures of a home laid out as a role', () => {
  it('are decided on the Home view, and say which role', () => {
    const tab = { key: 'finance', label: 'Finance', as: 'finance' as const }
    const [f] = scannedFigures({ key: 'home', label: 'Home' }, tab, [facts('home-fin-kpis')])
    expect(f).toMatchObject({ view: 'home', tab: 'finance', as: 'finance' })
    expect(figurePlace(f)).toEqual({ view: 'home', tab: 'overview' })
    expect(figurePlace({ view: 'hrbp', tab: 'attrition' })).toEqual({ view: 'hrbp', tab: 'attrition' })
    const scan: FigureScan = { ...syntheticScan(), figures: [f] }
    const [row] = figureRows(scan).rows
    expect(row).toMatchObject({
      laidOutAs: 'Finance',
      developer: 'Shown',
      finance: 'Shown',
      hr: 'Hidden',
      chro: 'Hidden',
    })
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
