/**
 * The access matrix (docs/ROLES.md, 6.8 test 1): every surface in every mode, rendered as text and
 * compared with `__snapshots__/access-matrix.txt`, so every change to who sees what shows in
 * review (`npx vitest run src/access -u` after an intended change). Plus the invariants.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOLS } from '@/app/tools'
import { ALL_TOOL_NAMES } from '@/ask/engine/tools'
import { DATASET_KEYS, VIEW_KEYS } from '@/data/schema'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { DRILL_KINDS } from '@/drill/records'
import { ARTICLES } from '@/help/articles'
import { TOURS } from '@/help/tours'
import { CATALOG, METRICS } from '@/metrics/catalog'
import { DATA_TABS, DATASET_PANELS } from '@/views/data/links'
import { VIEWS } from '@/views/registry'
import { SCORECARD_FIGURES } from '@/views/scorecard/engine/figures'
import { TEAM_FIGURES } from '@/views/team/engine/figures'
import { BANNED_MODE_WORDS, NOT_SECURITY_LONG, NOT_SECURITY_SHORT } from './copy'
import { type AccessInventory, accessMatrix, matrixText } from './matrix'
import {
  decide,
  isDeveloperOnly,
  isNotReady,
  MANAGER_DATASETS,
  MANAGER_DRILL_KINDS,
  MANAGER_HIDDEN_FIGURES,
  MANAGER_HIDDEN_METRIC_PREFIXES,
  MANAGER_HIDDEN_METRICS,
  MANAGER_TABS,
  MANAGER_VIEWS,
} from './policy'

const inventory: AccessInventory = {
  views: VIEWS.map((v) => ({
    key: v.key,
    label: v.label,
    tabs: v.tabs.map((t) => ({ key: t.key, label: t.label })),
  })),
  dataTabs: DATA_TABS.map((t) => t.route || t.key),
  datasetPanels: DATASET_PANELS,
  settings: SETTINGS_SECTIONS,
  tools: DEFAULT_TOOLS.map((t) => t.id),
  articles: ARTICLES.map((a) => a.id),
  tours: TOURS.map((t) => t.id),
  askTools: ALL_TOOL_NAMES,
  drillKinds: DRILL_KINDS,
  datasets: DATASET_KEYS,
  // The role homes' figures (docs/ROLES.md 2.1 and 2.2), on their page.
  figures: [
    ...TEAM_FIGURES.map((id) => ({ id, view: 'team', tab: 'overview' })),
    ...SCORECARD_FIGURES.map((id) => ({ id, view: 'scorecard', tab: 'overview' })),
  ],
}

const rows = accessMatrix(inventory)

/** Every .ts and .tsx file under src, except tests, for the figure id scan. */
function sources(dir = join(__dirname, '..'), out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__gallery__' || name === '__snapshots__') continue
      sources(p, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('access matrix', () => {
  it('matches the reviewed snapshot', async () => {
    await expect(matrixText(rows)).toMatchFileSnapshot('./__snapshots__/access-matrix.txt')
  })

  it('shows every surface in Developer mode', () => {
    for (const r of rows) expect(r.developer.access, r.surface).toBe('shown')
  })

  it('differs between HR and Developer only on the developer surfaces and the ones not ready yet', () => {
    for (const r of rows) {
      if (isDeveloperOnly(r.surface) || isNotReady(r.surface)) expect(r.hr.access, r.surface).toBe('hidden')
      else expect(r.hr.access, r.surface).toBe('shown')
    }
  })

  it('keeps the Action center in Developer mode only while it is not ready', () => {
    for (const r of rows.filter((x) => isNotReady(x.surface))) {
      expect(r.developer.access, r.surface).toBe('shown')
      expect(r.hr.access, r.surface).toBe('hidden')
      expect(r.manager.access, r.surface).toBe('hidden')
    }
    for (const s of ['page:actions', 'masthead:actions', 'ask:open_items', 'drill:actionItems'])
      expect(
        rows.some((r) => r.surface === s),
        s,
      ).toBe(true)
    // Its numbers on other pages go with it.
    expect(decide('hr', 'kpi:critical', undefined, { metric: 'actions.items.critical' }).access).toBe(
      'hidden',
    )
    expect(decide('manager', 'metric:actions.items.open').access).toBe('hidden')
    expect(decide('developer', 'metric:actions.items.open').access).toBe('shown')
  })

  it('names every view and every tab of a shown view in Manager mode, in tab order', () => {
    expect(Object.keys(MANAGER_VIEWS).sort()).toEqual([...VIEW_KEYS].sort())
    for (const v of VIEWS) {
      if (MANAGER_VIEWS[v.key].access === 'hidden') continue
      const tabs = MANAGER_TABS[v.key]
      expect(tabs, v.key).toBeDefined()
      expect(
        tabs?.map((t) => t.key),
        v.key,
      ).toEqual(v.tabs.map((t) => t.key))
      expect(
        tabs?.map((t) => t.label),
        v.key,
      ).toEqual(v.tabs.map((t) => t.label))
      // The first tab of a shown view is shown, so a hidden tab always has somewhere to go.
      expect(tabs?.[0]?.decision.access, v.key).not.toBe('hidden')
    }
  })

  it('says how for every limited or hidden decision', () => {
    for (const r of rows) {
      if (r.manager.access !== 'shown') expect(r.manager.how, r.surface).toBeTruthy()
      if (r.hr.access !== 'shown') expect(r.hr.how, r.surface).toBeTruthy()
    }
  })

  it('hides only figure ids that exist in the source', () => {
    const all = sources()
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n')
    for (const id of MANAGER_HIDDEN_FIGURES)
      expect(all.includes(`'${id}'`) || all.includes(`"${id}"`), id).toBe(true)
  })

  it('hides only metric ids and prefixes the catalog has, and keeps dev. out of it', () => {
    for (const id of MANAGER_HIDDEN_METRICS) expect(CATALOG.byId.has(id), id).toBe(true)
    for (const p of MANAGER_HIDDEN_METRIC_PREFIXES)
      expect(
        METRICS.some((m) => m.id.startsWith(p)),
        p,
      ).toBe(true)
    expect(METRICS.filter((m) => m.id.startsWith('dev.'))).toEqual([])
  })

  it('lists real drill kinds and datasets for Manager mode', () => {
    for (const k of MANAGER_DRILL_KINDS) expect(DRILL_KINDS, k).toContain(k)
    for (const d of MANAGER_DATASETS) expect(DATASET_KEYS, d).toContain(d)
    // The view's own datasets are the eight Manager mode reads.
    expect([...(VIEWS.find((v) => v.key === 'team')?.datasets ?? [])].sort()).toEqual(
      [...MANAGER_DATASETS].sort(),
    )
  })

  it('hides a metric of a view Manager mode hides, and shows one of a shown view', () => {
    const views = (id: string) => CATALOG.byId.get(id)?.views
    expect(
      decide('manager', 'metric:hrbp.attrition.voluntary', undefined, { metricViews: views }).access,
    ).toBe('shown')
    const compOnly = METRICS.find((m) => m.views.length === 1 && m.views[0] === 'comp')
    if (compOnly)
      expect(decide('manager', `metric:${compOnly.id}`, undefined, { metricViews: views }).access).toBe(
        'hidden',
      )
  })

  it('shows My team in Manager and Developer mode and the Scorecard in HR and Developer mode', () => {
    const at = (id: string) => rows.find((r) => r.surface === `figure:${id}`)
    for (const id of TEAM_FIGURES) {
      // "Waiting on this org" comes from the Action center, which is Developer mode only for now.
      if (isNotReady(`figure:${id}`)) continue
      expect(at(id)?.manager.access, id).toBe('shown')
      expect(at(id)?.hr.access, id).toBe('hidden')
    }
    for (const id of SCORECARD_FIGURES) {
      expect(at(id)?.manager.access, id).toBe('hidden')
      if (isNotReady(`figure:${id}`)) continue
      expect(at(id)?.hr.access, id).toBe('shown')
    }
  })

  it('lists exactly the figure ids the home pages draw', () => {
    const idsIn = (dir: string, prefix: string) =>
      [
        ...new Set(
          sources(join(__dirname, '..', 'views', dir, 'ui'))
            .map((p) => readFileSync(p, 'utf8'))
            .flatMap((t) => [...t.matchAll(new RegExp(`id="(${prefix}-[a-z0-9-]+)"`, 'g'))].map((m) => m[1])),
        ),
      ].sort()
    expect(idsIn('team', 'team')).toEqual([...TEAM_FIGURES].sort())
    expect(idsIn('scorecard', 'scorecard')).toEqual([...SCORECARD_FIGURES].sort())
  })

  it('keeps the wording that modes are not security plain', () => {
    for (const text of [NOT_SECURITY_SHORT, NOT_SECURITY_LONG]) {
      expect(text.includes('—'), text).toBe(false)
      for (const w of BANNED_MODE_WORDS) expect(text.toLowerCase().includes(w), `${w} in ${text}`).toBe(false)
    }
  })
})
