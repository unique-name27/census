/**
 * The Org chart's metric dictionary entries (docs/METRICS.md): every tile, figure, flag rule and the
 * folder-tab headline links to a registered metric; every registered setting is read through
 * `ctx.metrics`; at the defaults every number is what it was with the old constants; and changing
 * a setting changes the numbers, labels and warnings that use it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { invalidRefs } from '@/data/quality'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type Employee, type Review } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { buildReviewIndex } from '@/lib/people'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { ANONYMITY } from '@/metrics/privacy'
import { paramField, validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { view } from '../index'
import { ORG_METRIC, metrics as ORG_METRICS, ORG_PARAM } from '../metrics'
import {
  chartDefinitions,
  FIGURE_METRIC,
  FLAG_METRIC,
  flagTableDefinitions,
  sandboxDefinitions,
} from './defs'
import { exitImpact, teamStats } from './detail'
import { flagKindDrill, keyFigureDrills, leaversDrill } from './drill'
import { orgKeyFigures } from './figures'
import { AS_OF, person, smallCompany } from './fixtures'
import { computeFlags, FLAG_KINDS, type Flag, type FlagKind, flagSummary } from './flags'
import { orgKpis } from './kpis'
import { buildOrgModel, orgLineage } from './model'
import { flagRows } from './rows'
import { defaultOrgRules, orgRules } from './rules'
import { applyScenario, diffTrees, rippleOf } from './scenario'
import { buildOrgTree } from './tree'

const ORG_IDS = Object.values(ORG_METRIC)

const emptyData = (): Datasets => Object.fromEntries(DATASET_KEYS.map((k) => [k, []])) as unknown as Datasets
const sources = (kind: SourceMeta['kind']) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: 0 }])) as Record<DatasetKey, SourceMeta>

let sample: Datasets | null = null
/** The sample company with a dictionary (the defaults when not given). */
function sampleWith(metrics?: MetricsApi, filters: Partial<Filters> = {}): AnalyticsContext {
  sample ??= generateSample()
  return buildContext({
    data: sample,
    sources: sources('sample'),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
    metrics,
  })
}

/** A hand-built roster with a dictionary. */
function ctxWith(data: Partial<Datasets>, metrics?: MetricsApi): AnalyticsContext {
  return buildContext({
    data: { ...emptyData(), ...data },
    sources: sources('upload'),
    filters: DEFAULT_FILTERS,
    asOfOverride: AS_OF,
    showPay: false,
    metrics,
  })
}

/** The key figure tiles as the Chart tab builds them, with the open roles tile on. */
function kpisOf(ctx: AnalyticsContext) {
  const m = buildOrgModel(ctx)
  const key = orgKeyFigures(m, m.rootId, m.dims ? m.matches : null)
  const kpis = orgKpis({
    tree: m.tree,
    rootId: m.rootId,
    key,
    scope: { label: 'Whole company', asOf: ctx.asOf, filtered: m.dims },
    flags: m.flags,
    reqRecords: m.reqRecords,
    lineage: orgLineage(m, m.rootId, ctx.filters),
    dims: m.dims,
    openRoles: true,
    metrics: ctx.metrics,
  })
  const byId = Object.fromEntries(kpis.map((k) => [k.id, k]))
  return { m, key, kpis, byId }
}

const countKind = (flags: ReadonlyMap<string, readonly Flag[]>, kind: FlagKind) =>
  [...flags.values()].filter((fs) => fs.some((f) => f.kind === kind)).length
const kindsOf = (flags: ReadonlyMap<string, readonly Flag[]>, id: string) =>
  (flags.get(id) ?? []).map((f) => f.kind)

describe('the org metric dictionary', () => {
  it('registers every org metric once, with valid wording, lineage and settings', () => {
    expect(validateCatalog(ORG_METRICS)).toEqual([])
    expect(ORG_METRICS.map((d) => d.id).sort()).toEqual([...ORG_IDS].sort())
    for (const id of ORG_IDS) {
      const d = CATALOG.byId.get(id)
      expect(d, id).toBeDefined()
      expect(d!.views[0], id).toBe('org')
      expect(d!.uses.length, id).toBeGreaterThan(0)
      expect(invalidRefs(d!.uses), id).toEqual([])
      expect(d!.owner, id).toBe('People analytics')
    }
    for (const p of Object.values(ORG_PARAM))
      expect(defaultMetrics().paramDef(p.metricId, p.key), `${p.metricId} ${p.key}`).toBeDefined()
  })

  it('links every key figure tile to a registered metric whose lineage it declares at the defaults', () => {
    const { kpis } = kpisOf(sampleWith())
    expect(kpis.map((k) => k.id)).toEqual([
      'org-people',
      'org-managers',
      'org-span',
      'org-layers',
      'org-open-roles',
      'org-flags',
    ])
    for (const k of kpis) {
      expect(k.metricId, k.id).toBeDefined()
      const d = CATALOG.byId.get(k.metricId!)
      expect(d?.views, k.id).toContain('org')
      // Whole company, no filters, Job changes loaded: the tile reads exactly the registered fields.
      expect(new Set(k.uses), k.id).toEqual(new Set(d!.uses))
      // The popover reads the registry's definition.
      expect(k.definition, k.id).toContain(d!.definition)
    }
  })

  it('links the folder-tab headline, every flag kind and every figure to a registered metric', () => {
    const h = view.headline(sampleWith())
    expect(h.metricId).toBe(ORG_METRIC.managers)
    for (const kind of FLAG_KINDS) expect(CATALOG.byId.has(FLAG_METRIC[kind]), kind).toBe(true)
    for (const id of Object.values(FIGURE_METRIC)) expect(CATALOG.byId.has(id), id).toBe(true)

    // Every <Figure> in the view names its metric, by its own id.
    const dir = join(__dirname, '..', 'ui')
    let figures = 0
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const src = readFileSync(join(dir, file), 'utf8')
      const blocks = src.split('<Figure').slice(1)
      for (const block of blocks) {
        const id = /^\s+id="([^"]+)"/.exec(block)?.[1]
        expect(id, `${file}: a Figure without a literal id`).toBeDefined()
        expect(Object.keys(FIGURE_METRIC), `${file}: ${id}`).toContain(id)
        expect(block, `${file}: ${id} has no metric`).toContain(`metric={FIGURE_METRIC['${id}']}`)
        figures++
      }
    }
    expect(figures).toBe(4)
  })

  it('reads every registered setting through ctx.metrics, and nothing it did not register', () => {
    const { metrics, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleWith(metrics)
    const { m } = kpisOf(ctx)
    const mgr = [...m.tree.people.keys()].find((id) => (m.tree.directs.get(id) ?? 0) > 3)!
    teamStats(m.tree, mgr, ctx.all.employees, 0, m.rules)
    exitImpact(m.tree, mgr, m.reviews, m.rules)
    const registered = paramsOfView('org')
    // Every setting but the high rating, which has one home on Talent.
    expect(registered.length).toBe(Object.keys(ORG_PARAM).length - 1)
    for (const ref of registered) expect(reads, ref).toContain(ref)
    expect(reads).toContain(paramRef(ORG_PARAM.backfillRating.metricId, ORG_PARAM.backfillRating.key))
    expect(ORG_PARAM.backfillRating.metricId.startsWith('talent.')).toBe(true)
    // Plus the anonymity minimum, which the privacy rules own.
    expect(reads).toContain(paramRef(ANONYMITY.metricId, ANONYMITY.key))
    const own = [...reads].filter((r) => r.startsWith('org.'))
    expect(own.sort()).toEqual([...registered].sort())
  })
})

describe('at the defaults, every number is what the old constants gave', () => {
  it('reads the old thresholds', () => {
    expect(orgRules(defaultMetrics())).toEqual({
      wideSpan: 12,
      narrowSpan: 1,
      chainMinBelow: 5,
      newManagerMonths: 12,
      largeTeam: 8,
      newHireDays: 90,
      deepChain: 7,
      exitMonths: 12,
      backfillRating: 4,
      minGroup: 5,
    })
    expect(defaultOrgRules()).toBe(orgRules(defaultMetrics()))
  })

  it('reproduces the sample company tiles and flags', () => {
    const { m, key, byId } = kpisOf(sampleWith())
    expect(
      Object.fromEntries(
        ['org-people', 'org-managers', 'org-span', 'org-layers', 'org-open-roles', 'org-flags'].map((id) => [
          id,
          byId[id].value,
        ]),
      ),
    ).toEqual({
      'org-people': 1558,
      'org-managers': 263,
      'org-span': 6,
      'org-layers': 6,
      'org-open-roles': 114,
      'org-flags': 8,
    })
    expect(flagSummary(m.flags).map((r) => [r.label, r.people])).toEqual([
      ['Wide span (12+)', 3],
      ['Span of 1', 4],
      ['Single-report chain', 2],
      ['New manager, large team', 1],
      ['New hire (90 days)', 120],
    ])
    // Six layers: nobody below layer 7, so the Layers tile has no note.
    expect(key.deep).toEqual([])
    expect(byId['org-layers'].note).toBeUndefined()
    expect(byId['org-layers'].noteDrill).toBeUndefined()
  })

  it('builds the same model with or without a dictionary in the context', () => {
    const withDefaults = buildOrgModel(sampleWith(defaultMetrics()))
    const { metrics: _drop, ...noMetrics } = sampleWith()
    const without = buildOrgModel(noMetrics)
    expect(without.rules).toEqual(withDefaults.rules)
    expect(flagSummary(without.flags)).toEqual(flagSummary(withDefaults.flags))
  })
})

describe('changing a setting changes the numbers that use it', () => {
  it('wide span: more managers are flagged, everywhere the size is used', () => {
    const before = kpisOf(sampleWith())
    const after = kpisOf(sampleWith(metricsWith({ [ORG_PARAM.wideSpan.metricId]: { minDirects: 8 } })))
    expect(after.m.rules.wideSpan).toBe(8)
    const wideBefore = countKind(before.m.flags, 'wide-span')
    const wideAfter = countKind(after.m.flags, 'wide-span')
    expect(wideBefore).toBe(3)
    expect(wideAfter).toBeGreaterThan(wideBefore)
    // Exactly the managers with 8 or more direct reports.
    const eightPlus = [...after.m.tree.people.keys()].filter((id) => (after.m.tree.directs.get(id) ?? 0) >= 8)
    expect(wideAfter).toBe(eightPlus.length)
    expect(after.byId['org-flags'].value).toBeGreaterThan(before.byId['org-flags'].value!)
    expect(after.byId['org-flags'].definition).toContain('wide span from 8 direct reports')
    expect(flagSummary(after.m.flags)[0].label).toBe('Wide span (8+)')

    // The sandbox warns, and the diff lists new wide spans, at the same size.
    const t = buildOrgTree(smallCompany(), AS_OF)
    const move = { kind: 'move', personId: 'IC-6', toManagerId: 'MGR-1', mode: 'person' } as const
    const rules = { ...defaultOrgRules(), wideSpan: 6 }
    expect(rippleOf(t, move).warnings.some((w) => w.includes('6 direct reports'))).toBe(false)
    expect(rippleOf(t, move, rules).warnings).toContain('Name MGR-1 would have 6 direct reports.')
    const moved = applyScenario(t, [move]).tree
    expect(diffTrees(t, moved).newWideSpans).toEqual([])
    expect(diffTrees(t, moved, rules).newWideSpans.map((w) => w.id)).toEqual(['MGR-1'])
    // ...and the exit simulation.
    // If MGR-1 left, VP-A would have 6 direct reports.
    expect(exitImpact(t, 'MGR-1', buildReviewIndex([])).wideAfter).toBe(false)
    expect(exitImpact(t, 'MGR-1', buildReviewIndex([]), rules).wideAfter).toBe(true)
  })

  it('narrow span: spans up to the setting are flagged and named for it', () => {
    const tree = buildOrgTree(smallCompany(), AS_OF)
    const m = metricsWith({ [ORG_PARAM.narrowSpan.metricId]: { maxDirects: 2 } })
    const before = computeFlags(tree)
    const after = computeFlags(tree, [], orgRules(m))
    // Spans: CEO 2, VP-A 2, VP-B 1, MGR-1 5, MGR-2 1, DIR-1 1, MGR-3 5.
    expect(countKind(before, 'narrow-span')).toBe(3)
    expect(countKind(after, 'narrow-span')).toBe(5)
    expect(kindsOf(after, 'CEO')).toEqual(['narrow-span'])
    expect(flagRows(tree, ['VP-A'], after, new Set(['narrow-span']))[0].flag).toBe('Span of 2 or fewer')
    const k = (f: Map<string, Flag[]>) =>
      orgKeyFigures({ tree, flags: f, reqs: new Map() }, tree.rootId, null).flagged.length
    expect(k(before)).toBe(3)
    expect(k(after)).toBe(5)
  })

  it('single-report chain: the team below the only report must reach the setting', () => {
    const tree = buildOrgTree(smallCompany(), AS_OF)
    const chains = (minBelow: number) => {
      const f = computeFlags(
        tree,
        [],
        orgRules(metricsWith({ [ORG_PARAM.chainMinBelow.metricId]: { minBelow } })),
      )
      return [...f]
        .filter(([, fs]) => fs.some((x) => x.kind === 'single-report-chain'))
        .map(([id]) => id)
        .sort()
    }
    // DIR-1's only report leads 5 people; VP-B's only report (DIR-1) leads 6.
    expect(chains(5)).toEqual(['DIR-1', 'VP-B'])
    expect(chains(6)).toEqual(['VP-B'])
    expect(chains(7)).toEqual([])
  })

  it('new manager: the window and the large-team size both count', () => {
    const team = (mgr: string, n: number) => Array.from({ length: n }, (_, i) => person(`${mgr}-${i}`, mgr))
    const rows: Employee[] = [
      person('TOP', null, { level: 'E3' }),
      // Managing for about 7.5 months.
      person('NEW', 'TOP', { level: 'M1', hireDate: '2026-02-16' }),
      // Managing for about 20 months.
      person('OLDER', 'TOP', { level: 'M1', hireDate: '2025-01-13' }),
      ...team('NEW', 8),
      ...team('OLDER', 6),
    ]
    const flagged = (values: Record<string, unknown>) => {
      const f = computeFlags(
        buildOrgTree(rows, AS_OF),
        [],
        orgRules(metricsWith({ [ORG_PARAM.newManagerMonths.metricId]: values })),
      )
      return [...f]
        .filter(([, fs]) => fs.some((x) => x.kind === 'new-manager-large-team'))
        .map(([id]) => id)
        .sort()
    }
    expect(flagged({})).toEqual(['NEW'])
    expect(flagged({ months: 6 })).toEqual([])
    expect(flagged({ months: 24, minDirects: 6 })).toEqual(['NEW', 'OLDER'])
    expect(flagged({ minDirects: 9 })).toEqual([])
    // On the sample, a longer window finds more new managers.
    const sampleCount = (months: number) =>
      countKind(
        buildOrgModel(sampleWith(metricsWith({ [ORG_PARAM.newManagerMonths.metricId]: { months } }))).flags,
        'new-manager-large-team',
      )
    expect(sampleCount(12)).toBe(1)
    expect(sampleCount(36)).toBeGreaterThan(1)
  })

  it('new hire: the window decides who is new, and the name says so', () => {
    const rows = [
      person('A', null),
      person('B', 'A', { hireDate: '2026-07-06' }),
      person('C', 'A', { hireDate: '2026-09-15' }),
    ]
    const tree = buildOrgTree(rows, AS_OF)
    const at = (days: number) =>
      computeFlags(tree, [], orgRules(metricsWith({ [ORG_PARAM.newHireDays.metricId]: { days } })))
    expect(countKind(at(90), 'new-hire')).toBe(2)
    expect(countKind(at(30), 'new-hire')).toBe(1)
    expect(at(30).get('C')![0].name).toBe('New hire (30 days)')
    const sample90 = countKind(buildOrgModel(sampleWith()).flags, 'new-hire')
    const sample30 = countKind(
      buildOrgModel(sampleWith(metricsWith({ [ORG_PARAM.newHireDays.metricId]: { days: 30 } }))).flags,
      'new-hire',
    )
    expect(sample90).toBe(120)
    expect(sample30).toBeLessThan(sample90)
  })

  it('deep chain: the Layers tile notes and opens the people below the layer', () => {
    const ctx = ctxWith(
      { employees: smallCompany() },
      metricsWith({ [ORG_PARAM.deepChain.metricId]: { deepChain: 3 } }),
    )
    const { key, byId, m } = kpisOf(ctx)
    // Layer 4: MGR-1's five reports, IC-6 and MGR-3; layer 5: MGR-3's five reports.
    expect(key.layers).toBe(5)
    expect(key.deepLayer).toBe(3)
    expect(key.deep).toHaveLength(12)
    expect(byId['org-layers'].value).toBe(5)
    expect(byId['org-layers'].note).toBe('12 people below layer 3')
    const spec = resolveDrill(byId['org-layers'].noteDrill)!
    expect(spec.rows).toHaveLength(12)
    expect(spec.title).toBe('People below layer 3 in the company')
    // The drill carries the tile's fields.
    expect(spec.uses).toEqual(byId['org-layers'].uses)
    // It opens exactly those people, deepest first.
    const scope = { label: 'Whole company', asOf: AS_OF }
    const deep = keyFigureDrills(m.tree, m.rootId, key, scope, m.flags, m.reqRecords).deepChain!
    expect(deep.rows.map((e) => e.employeeId).sort()).toEqual([...key.deep].sort())
    expect(deep.extra!.values(deep.rows[0]).orgLayer).toBe(5)
    // At the default (7) the same org has no deep chain.
    expect(kpisOf(ctxWith({ employees: smallCompany() })).byId['org-layers'].note).toBeUndefined()
  })

  it('exits window, backfill rating and the anonymity minimum change the detail panel and exit simulation', () => {
    const rows = [
      ...smallCompany(),
      person('LEFT-1', 'MGR-1', {
        terminationDate: '2026-05-01',
        terminationType: 'Voluntary',
        regrettable: true,
      }),
      person('LEFT-OLD', 'MGR-1', {
        terminationDate: '2024-05-01',
        terminationType: 'Voluntary',
        regrettable: true,
      }),
    ]
    const tree = buildOrgTree(rows, AS_OF)
    const longer = orgRules(metricsWith({ [ORG_PARAM.exitMonths.metricId]: { months: 36 } }))
    expect(teamStats(tree, 'MGR-1', rows).exits12).toBe(1)
    const s = teamStats(tree, 'MGR-1', rows, 0, longer)
    expect(s).toMatchObject({ exits12: 2, regrettedExits12: 2, exitMonths: 36 })
    expect(
      leaversDrill('Name MGR-1', s.exits, false, { label: 'Org chart', asOf: AS_OF }, s.exitMonths)!.title,
    ).toBe('Leavers who reported to Name MGR-1, last 36 months')

    const reviews: Review[] = [
      { employeeId: 'IC-1', cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating: 5 },
      { employeeId: 'IC-2', cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating: 4 },
      { employeeId: 'IC-3', cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating: 3 },
    ]
    const idx = buildReviewIndex(reviews)
    const backfills = (minRating?: number) =>
      exitImpact(
        tree,
        'MGR-1',
        idx,
        orgRules(metricsWith(minRating ? { [ORG_PARAM.backfillRating.metricId]: { minRating } } : {})),
      ).backfills.map((b) => b.id)
    expect(backfills()).toEqual(['IC-1', 'IC-2'])
    expect(backfills(5)).toEqual(['IC-1'])
    expect(backfills(3)).toEqual(['IC-1', 'IC-2', 'IC-3'])

    // MGR-1's org is 5 people: shown at the minimum of 5, hidden when it is raised to 6.
    expect(teamStats(tree, 'MGR-1', rows).avgTenure).not.toBeNull()
    const raised = orgRules(metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 6 } }))
    expect(raised.minGroup).toBe(6)
    const hidden = teamStats(tree, 'MGR-1', rows, 0, raised)
    expect(hidden.avgTenure).toBeNull()
    expect(hidden.ids.tenure).toEqual([])
    // The minimum can't be lowered.
    expect(() => metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 4 } })).toThrow()
  })
})

describe('edited wording shows wherever the metric appears', () => {
  it('on the tiles, the datasheets and the flags drill', () => {
    const m = metricsWithEdits([
      { metricId: ORG_METRIC.medianSpan, field: 'definition', value: 'Our span rule.' },
      { metricId: ORG_METRIC.wideSpan, field: 'definition', value: 'Our wide span rule.' },
      { metricId: ORG_METRIC.flagged, field: 'definition', value: 'Our flags rule.' },
      { metricId: ORG_METRIC.directReports, field: 'formula', value: 'reports on the chart' },
      { metricId: ORG_METRIC.wideSpan, field: paramField('minDirects'), value: 5 },
    ])
    const { byId, m: model } = kpisOf(ctxWith({ employees: smallCompany() }, m))
    expect(byId['org-span'].definition).toBe('Our span rule.')
    expect(byId['org-flags'].definition).toMatch(/^Our flags rule\. Settings in force: wide span from 5/)

    const rules = model.rules
    const chart = chartDefinitions(m, rules)
    expect(chart.find((d) => d.text === 'Our wide span rule.')?.term).toBe('Wide span (5+)')
    expect(chart.find((d) => d.term === 'Direct reports')?.formula).toBe('reports on the chart')
    expect(flagTableDefinitions(m, rules)[0].text).toBe('Our flags rule.')
    expect(sandboxDefinitions(m, rules).some((d) => d.text === 'Our wide span rule.')).toBe(true)
    // With the Open roles switch off the chart datasheet leaves them out.
    expect(chartDefinitions(m, rules, { openRoles: false }).some((d) => d.term === 'Open roles')).toBe(false)

    // MGR-1 and MGR-3 lead 5: wide at 5+, and the drill title carries the setting.
    const spec = flagKindDrill(model.tree, model.tree.people.keys(), 'wide-span', model.flags, {
      label: 'Whole company',
      asOf: AS_OF,
    })!
    expect(spec.title).toBe('Wide span (5+) in the company')
    expect(spec.rows.map((e) => e.employeeId).sort()).toEqual(['MGR-1', 'MGR-3'])
  })

  it('every default datasheet row is the registry text', () => {
    const m = defaultMetrics()
    for (const d of chartDefinitions(m, defaultOrgRules())) {
      const def = ORG_METRICS.find((x) => x.definition === d.text)
      expect(def, d.term).toBeDefined()
    }
  })
})
