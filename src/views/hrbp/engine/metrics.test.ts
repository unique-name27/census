/**
 * People stats in the metric dictionary (docs/METRICS.md): every KPI, figure and finding links to
 * a registered metric, every registered setting is read by the engine through `ctx.metrics`,
 * changing a setting changes the numbers built on it, and at the defaults the numbers are the
 * shared definitions of `@/lib/people`, exactly.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Finding, Kpi } from '@/components/types'
import { invalidRefs } from '@/data/quality'
import type { Employee } from '@/data/schema'
import { firstYearAttrition, attrition as sharedAttrition, avgHeadcount as sharedAvg } from '@/lib/people'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { ANONYMITY } from '@/metrics/privacy'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { ORG_METRIC } from '@/views/org/metrics'
import { ID, INHERITS, metrics, SET } from '../metrics'
import { computeHrbp, type HrbpModel, hrbpHeadline, talkingPoints } from '.'
import { hrbpActions } from './actions'
import { cohortSummary } from './attrition'
import { ctxOf, emp, leaver, many, sampleCtx } from './fixtures'
import { allRefs, FIGURE } from './lineage'
import { attrition, avgHeadcount } from './population'
import { settingsOf } from './settings'

const IDS = Object.values(ID) as string[]
const tiles = (m: HrbpModel): Kpi[] => [...m.kpi.kpis, ...m.movementKpis, ...m.orgKpis]
const tile = (m: HrbpModel, id: string) => tiles(m).find((k) => k.id === id)!
const finding = (m: HrbpModel, id: string): Finding | undefined => m.findings.find((f) => f.id === id)
const ceo = () => sampleCtx().data.employees.find((e) => !e.managerId)!

describe('the People stats entries', () => {
  it('pass the catalog checks and are all in the assembled catalog', () => {
    expect(validateCatalog(metrics)).toEqual([])
    for (const d of metrics) {
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
      expect(d.views[0]).toBe('hrbp')
      expect(d.owner).toBe('People analytics')
      expect(invalidRefs(d.uses), d.id).toEqual([])
    }
  })

  it('registers exactly the ids the view uses, once each', () => {
    expect(metrics.map((d) => d.id).sort()).toEqual([...IDS].sort())
    expect(new Set(IDS).size).toBe(IDS.length)
  })

  it('names every setting the engine reads, and registers no other', () => {
    const registered = paramsOfView('hrbp').sort()
    const own = Object.values(SET).filter((r) => r.metricId.startsWith('hrbp.'))
    const named = own.map((r) => paramRef(r.metricId, r.key)).sort()
    expect(named).toEqual(registered)
    // The org design thresholds have one home, on the Org chart, and are read there.
    const elsewhere = Object.values(SET).filter((r) => !r.metricId.startsWith('hrbp.'))
    expect(elsewhere.map((r) => r.metricId.split('.')[0])).toEqual(['org', 'org', 'org', 'org', 'org'])
    for (const r of elsewhere)
      expect(CATALOG.byId.get(r.metricId)?.params.some((p) => p.key === r.key)).toBe(true)
    for (const [id, from] of Object.entries(INHERITS)) {
      expect(IDS, id).toContain(id)
      for (const f of from ?? []) expect(CATALOG.byId.has(f), f).toBe(true)
      expect(CATALOG.byId.get(id)?.dependsOn, id).toEqual(from)
    }
  })

  it('holds no second copy of an org design threshold', () => {
    const labels = metrics.flatMap((d) => d.params.map((p) => p.label.toLowerCase()))
    for (const gone of ['wide span at', 'narrow span at or below', 'overloaded at', 'new manager window'])
      expect(labels).not.toContain(gone)
    expect(
      labels.some((l) => l.includes('levels below the top') || l.includes('people below the only report')),
    ).toBe(false)
  })

  it('reuses the lineage the view declares (voluntary attrition)', () => {
    expect(CATALOG.byId.get(ID.voluntary)!.uses).toEqual([
      'employees.terminationType',
      'employees.terminationDate',
      'employees.hireDate',
      'employees.employmentType',
    ])
  })

  it('keeps wording plain: no em dashes, no exclamation marks', () => {
    for (const d of metrics) {
      for (const text of [
        d.definition,
        d.formula,
        d.population,
        d.window,
        ...d.params.map((p) => p.description),
      ])
        expect(text ?? '', d.id).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]|!/)
    }
  })
})

describe('every KPI, figure and finding links to a registered metric', () => {
  const scopes = [
    {},
    { location: ['Bengaluru'] },
    { businessUnit: ['Silicon Engineering'] },
    { leaderId: ceo().employeeId },
    { period: 't3m' as const },
  ]

  it.each(scopes.map((s) => [JSON.stringify(s), s] as const))('KPIs and findings under %s', (_, filters) => {
    const ctx = sampleCtx(filters)
    const m = computeHrbp(ctx)
    for (const k of tiles(m)) {
      expect(k.metricId, k.id).toBeDefined()
      expect(IDS, k.id).toContain(k.metricId)
      // The info popover reads the dictionary's wording.
      expect(k.definition, k.id).toBe(ctx.metrics.def(k.metricId!)!.definition)
    }
    expect(m.findings.length).toBeGreaterThan(0)
    for (const f of m.findings) {
      expect(f.metricId, f.id).toBeDefined()
      expect(IDS, f.id).toContain(f.metricId)
    }
  })

  it('links the folder-tab headline to headcount', () => {
    expect(hrbpHeadline(sampleCtx()).metricId).toBe(ID.headcount)
  })

  const dir = fileURLToPath(new URL('../ui', import.meta.url))
  const ui = readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }))

  it('gives every <Figure> a registered metric and definitions from the dictionary', () => {
    for (const { file, text } of ui) {
      const figures = text.split('<Figure').length - 1
      expect(text.split('metric={').length - 1, file).toBe(figures)
      // Figure datasheets are built from the registry (p.defs), never written inline as metric wording.
      expect(text.split('definitions={').length - 1, file).toBe(figures)
      expect(text, file).not.toMatch(/definitions=\{\[\s*\{/)
      for (const [, key] of text.matchAll(/\bID\.(\w+)/g))
        expect(Object.keys(ID), `${file}: ID.${key}`).toContain(key)
    }
  })

  it('shows every registered metric somewhere, or is a rule whose settings the engine reads', () => {
    const engineDir = fileURLToPath(new URL('.', import.meta.url))
    const sources = [
      ...ui.map((u) => u.text),
      ...readdirSync(engineDir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .map((f) => readFileSync(join(engineDir, f), 'utf8')),
    ].join('\n')
    for (const [key, id] of Object.entries(ID)) {
      const shown = new RegExp(`\\bID\\.${key}\\b`).test(sources)
      expect(shown || CATALOG.byId.get(id)!.params.length > 0, `ID.${key}`).toBe(true)
    }
  })
})

describe('every registered setting is read by the engine', () => {
  it('reads each one through ctx.metrics while computing the view', () => {
    const { metrics: recorded, reads } = recordParamReads(defaultMetrics())
    for (const filters of [
      {},
      { location: ['Bengaluru'] },
      { leaderId: ceo().employeeId },
      { period: 't3m' as const },
    ]) {
      const ctx = sampleCtx(filters, recorded)
      const m = computeHrbp(ctx)
      talkingPoints(m)
      hrbpHeadline(ctx)
      // The Action center's stay conversations read their due window.
      hrbpActions(ctx)
    }
    const missing = paramsOfView('hrbp').filter((r) => !reads.has(r))
    expect(missing).toEqual([])
    // The anonymity minimum too, instead of the MIN_GROUP constant.
    expect(reads.has(paramRef(ANONYMITY.metricId, ANONYMITY.key))).toBe(true)
  })
})

describe('defaults reproduce the shared definitions exactly', () => {
  it('attrition, average headcount and first-year attrition equal @/lib/people', () => {
    for (const filters of [
      {},
      { location: ['Bengaluru'] },
      { period: 't3m' as const },
      { period: 'ytd' as const },
    ]) {
      const ctx = sampleCtx(filters)
      const emps = ctx.data.employees
      for (const kind of ['all', 'voluntary', 'involuntary', 'regretted'] as const) {
        expect(attrition(emps, ctx.window, kind)).toEqual(sharedAttrition(emps, ctx.window, kind))
        expect(attrition(emps, ctx.prior, kind)).toEqual(sharedAttrition(emps, ctx.prior, kind))
      }
      expect(avgHeadcount(emps, ctx.window)).toBe(sharedAvg(emps, ctx.window))
      const fy = firstYearAttrition(emps, ctx.asOf)
      expect(cohortSummary(emps, ctx.asOf)).toMatchObject({
        rate: fy.rate,
        cohort: fy.cohort,
        leavers: fy.leavers,
      })
    }
  })

  it('reads every setting at its registered default', () => {
    const s = settingsOf(defaultMetrics())
    expect(s).toMatchObject({
      minGroup: 5,
      countContractors: false,
      annualize: true,
      regretted: 'voluntaryFlagged',
      firstYearDays: 365,
      engineeringReference: 0.65,
      newManagerMonths: 12,
      chainMinBelow: 5,
      rapidGrowth: 0.35,
    })
    expect({ ...s.material }).toEqual({ relative: 0.02, absolute: 0.0015 })
    expect({ ...s.spanOutliers }).toEqual({ wide: 12, narrow: 1 })
    expect({ ...s.newHires }).toEqual({ share: 0.5, minTeam: 5, warnShare: 0.65 })
    expect({ ...s.managerFlag }).toEqual({ overloaded: 12, heavy: 9, light: 3 })
  })
})

/** The hand-built company under a dictionary with some settings changed. */
const withSettings = (
  employees: Employee[],
  params: Parameters<typeof metricsWith>[0],
  filters: Parameters<typeof ctxOf>[1] = {},
) => computeHrbp(ctxOf({ employees }, filters, undefined, metricsWith(params)))

describe('changing a setting changes the numbers built on it', () => {
  it('counts contractors in headcount, hires, exits and every rate when switched on', () => {
    const staff = [
      ...many(20),
      ...many(4, { employmentType: 'Contractor' }),
      emp({ employmentType: 'Intern' }),
      emp({ employmentType: 'Contractor', hireDate: '2026-02-02' }),
      leaver('2026-03-02', 'Voluntary'),
      leaver('2026-04-06', 'Voluntary', { employmentType: 'Contractor' }),
    ]
    const before = computeHrbp(ctxOf({ employees: staff }))
    const after = withSettings(staff, { [ID.headcount]: { countContractors: true } })
    expect(tile(before, 'headcount').value).toBe(20)
    expect(tile(after, 'headcount').value).toBe(25)
    expect(tile(before, 'hires').value).toBe(0)
    expect(tile(after, 'hires').value).toBe(1)
    expect(tile(after, 'headcount').note).toBe('Plus 1 intern')
    // The trends count the same people as the tiles: the last headcount point is the tile's value,
    // and the contractor hired in February shows in the hires trend.
    for (const m of [before, after]) {
      expect(tile(m, 'headcount').spark?.at(-1)).toBe(tile(m, 'headcount').value)
    }
    const hiresSpark = (m: HrbpModel) => tile(m, 'hires').spark ?? []
    expect(hiresSpark(after)).not.toEqual(hiresSpark(before))
    const total = (m: HrbpModel) => hiresSpark(m).reduce<number>((a, v) => a + (v ?? 0), 0)
    expect(total(after)).toBe(total(before) + 1)
    // The comparison drill names who it lists.
    const yearAgo = tile(after, 'headcount').deltaDrill
    const spec = typeof yearAgo === 'function' ? yearAgo() : yearAgo
    expect(spec?.title).toMatch(/^Employees and contractors on /)
    expect(spec?.note).toMatch(/^Employees and contractors active 12 months earlier/)
    expect(spec?.note).toContain('the 25 people on')
    expect(spec?.hide ?? []).not.toContain('employmentType')
    // The rate is the shared definition over a roster where contractors are employees.
    const relabeled = staff.map((e) =>
      e.employmentType === 'Contractor' ? { ...e, employmentType: 'Employee' as const } : e,
    )
    const ctx = ctxOf({ employees: staff })
    expect(tile(after, 'voluntary').value).toBeCloseTo(
      sharedAttrition(relabeled, ctx.window, 'voluntary').rate!,
      12,
    )
    expect(tile(before, 'voluntary').value).toBeCloseTo(
      sharedAttrition(staff, ctx.window, 'voluntary').rate!,
      12,
    )
    expect(after.workforce.headcount).toBe(25)
    expect(
      hrbpHeadline(
        ctxOf(
          { employees: staff },
          {},
          undefined,
          metricsWith({ [ID.headcount]: { countContractors: true } }),
        ),
      ).value,
    ).toBe(25)
  })

  it('stops annualizing turnover rates when switched off', () => {
    const staff = [...many(40), leaver('2026-08-03', 'Voluntary'), leaver('2026-09-01', 'Voluntary')]
    const on = computeHrbp(ctxOf({ employees: staff }, { period: 't3m' }))
    const off = withSettings(staff, { [ID.attrition]: { annualize: false } }, { period: 't3m' })
    const v = (m: HrbpModel) => tile(m, 'voluntary').value as number
    expect(v(on)).toBeGreaterThan(0)
    expect(v(off)).toBeCloseTo(v(on) / 4, 12)
    expect(tile(on, 'voluntary').note).toMatch(/, annualized$/)
    expect(tile(off, 'voluntary').note).not.toMatch(/annualized/)
    const q = (m: HrbpModel) =>
      m.attrition.quarters.find((r) => r.quarter === "Q3 '26" && r.type === 'Voluntary')!
    expect(q(off).rate).toBeCloseTo(q(on).rate! / 4, 12)
    // The definition says the setting differs from its default.
    expect(tile(off, 'voluntary').definition).toContain(
      'Changed setting: Annualize turnover rates Off (default On).',
    )
  })

  it('counts first-year leavers inside the first-year window', () => {
    const hire = '2025-03-03'
    const cohort = [
      ...many(8, { hireDate: hire }),
      leaver('2025-06-11', 'Voluntary', { hireDate: hire }), // 100 days
      leaver('2025-12-28', 'Voluntary', { hireDate: hire }), // 300 days
      ...many(30),
    ]
    const before = computeHrbp(ctxOf({ employees: cohort }))
    const after = withSettings(cohort, { [ID.firstYear]: { days: 180 } })
    expect(tile(before, 'first-year').value).toBeCloseTo(2 / 10, 12)
    expect(tile(after, 'first-year').value).toBeCloseTo(1 / 10, 12)
    expect(after.kpi.records.firstYear).toHaveLength(1)
    expect(tile(after, 'first-year').definition).toContain(
      'Changed setting: First-year window 180 d (default 365 d).',
    )
  })

  it('counts any exit flagged regrettable when that is what counts as regretted', () => {
    const staff = [
      ...many(30),
      leaver('2026-03-02', 'Voluntary', { regrettable: true }),
      leaver('2026-04-06', 'Involuntary', { regrettable: true }),
    ]
    const before = computeHrbp(ctxOf({ employees: staff }))
    const after = withSettings(staff, { [ID.regretted]: { rule: 'anyFlagged' } })
    expect(before.kpi.regretted.events).toBe(1)
    expect(after.kpi.regretted.events).toBe(2)
    expect(tile(after, 'regretted').value).toBeCloseTo(2 * (tile(before, 'regretted').value as number), 12)
    // Under that rule regretted attrition no longer reads the termination type.
    expect(tile(before, 'regretted').uses).toContain('employees.terminationType')
    expect(tile(after, 'regretted').uses).not.toContain('employees.terminationType')
    expect(after.attrition.regretted).toHaveLength(2)
  })

  it('colors a change only when it clears the materiality floor', () => {
    // Austin: 2 voluntary exits over about 61 people (3.3%) against the company's 2.0%.
    const people = [
      ...many(40, { location: 'San Jose' }),
      ...many(60, { location: 'Austin' }),
      leaver('2026-02-02', 'Voluntary', { location: 'Austin', regrettable: true }),
      leaver('2026-03-02', 'Voluntary', { location: 'Austin' }),
    ]
    const austin = { location: ['Austin'] }
    expect(tile(computeHrbp(ctxOf({ employees: people }, austin)), 'voluntary').deltaMaterial).toBe(true)
    const raised = withSettings(people, { [ID.material]: { absolute: 0.05 } }, austin)
    expect(tile(raised, 'voluntary').deltaMaterial).toBe(false)
  })

  it('hides more groups when the anonymity minimum is raised', () => {
    const staff = [...many(20), leaver('2026-02-02', 'Voluntary')]
    expect(tile(computeHrbp(ctxOf({ employees: staff })), 'voluntary').suppressed).toBe(false)
    const raised = computeHrbp(
      ctxOf(
        { employees: staff },
        {},
        undefined,
        metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 25 } }),
      ),
    )
    expect(tile(raised, 'voluntary')).toMatchObject({ value: null, suppressed: true })
  })

  it('flags new-hire concentration at the share and team size set', () => {
    const team = [
      emp({ employeeId: 'M', name: 'Morgan Diaz', level: 'M1' }),
      ...many(3, { managerId: 'M', hireDate: '2025-01-06' }),
      ...many(3, { managerId: 'M', hireDate: '2026-06-01' }),
      ...many(20),
    ]
    const id = 'hrbp-new-hire-concentration'
    expect(finding(computeHrbp(ctxOf({ employees: team })), id)?.title).toBe(
      "3 of Morgan Diaz's 6 direct reports were hired in the last 6 months.",
    )
    expect(finding(withSettings(team, { [ID.newHires]: { share: 0.6 } }), id)).toBeUndefined()
    expect(finding(withSettings(team, { [ID.newHires]: { minTeam: 7 } }), id)).toBeUndefined()
  })
})

describe('the readout rules follow their settings on the sample company', () => {
  const run = (params: Parameters<typeof metricsWith>[0], filters = {}) =>
    computeHrbp(sampleCtx(filters, metricsWith(params)))
  const base = computeHrbp(sampleCtx())

  it('span outliers: wide and narrow thresholds', () => {
    expect(finding(base, 'hrbp-span-outliers')!.title).toBe(
      '3 managers have 12 or more direct reports and 4 have only one.',
    )
    const m = run({ [ORG_METRIC.wideSpan]: { minDirects: 14 }, [ORG_METRIC.narrowSpan]: { maxDirects: 2 } })
    const f = finding(m, 'hrbp-span-outliers')!
    expect(f.title).toMatch(/^1 manager has 14 or more direct reports and \d+ have 2 or fewer\.$/)
    expect(f.metricId).toBe(ID.spanOutliers)
    // The span chart marks the buckets the thresholds cover.
    expect(m.org.spanBuckets.filter((b) => b.outlier).map((b) => b.bucket)).toEqual(['1', '2'])
    expect(base.org.spanBuckets.filter((b) => b.outlier).map((b) => b.bucket)).toEqual(['1', '12+'])
  })

  it('regretted clusters: exits to flag and to mark critical', () => {
    expect(finding(base, 'hrbp-regretted-cluster')!.severity).toBe('critical')
    expect(
      finding(run({ [ID.regrettedCluster]: { criticalExits: 6 } }), 'hrbp-regretted-cluster')!.severity,
    ).toBe('warning')
    expect(finding(run({ [ID.regrettedCluster]: { minExits: 6 } }), 'hrbp-regretted-cluster')).toBeUndefined()
  })

  it('voluntary attrition against the company: the gap', () => {
    expect(finding(base, 'hrbp-voluntary-location')!.title).toContain('Bengaluru')
    // Bengaluru sits 9.4 pts above the company: a 10 pt gap no longer flags it.
    expect(finding(run({ [ID.voluntaryAbove]: { gap: 0.1 } }), 'hrbp-voluntary-location')).toBeUndefined()
  })

  it('first-year attrition: the rate to flag', () => {
    expect(finding(base, 'hrbp-first-year')!.title).toContain('Go-to-Market is 27.0%')
    // Above 30% only Sales qualifies (7 of 18 hires left); above 40% nothing does.
    expect(finding(run({ [ID.firstYearHigh]: { threshold: 0.3 } }), 'hrbp-first-year')!.title).toBe(
      'First-year attrition in Sales is 38.9% (7 of 18 hires), against 9.0% elsewhere.',
    )
    expect(finding(run({ [ID.firstYearHigh]: { threshold: 0.4 } }), 'hrbp-first-year')).toBeUndefined()
  })

  it('uneven growth: the growth to note', () => {
    expect(finding(base, 'hrbp-uneven-growth')!.title).toContain('Silicon Engineering grew 13.9%')
    expect(finding(run({ [ID.unevenGrowth]: { minGrowth: 0.15 } }), 'hrbp-uneven-growth')).toBeUndefined()
  })

  it('new managers: the window and the team size', () => {
    const newOnes = (m: HrbpModel) => m.org.managers.filter((x) => x.newManager).length
    expect(newOnes(run({ [ORG_METRIC.newManager]: { months: 24 } }))).toBeGreaterThan(newOnes(base))
    expect(finding(run({ [ID.newManagers]: { minTeam: 20 } }), 'hrbp-new-managers')).toBeUndefined()
  })

  it('manager flags, scorecard marking and the engineering reference', () => {
    // Overloaded is the Org chart's wide span.
    const flags = run({ [ORG_METRIC.wideSpan]: { minDirects: 30 }, [ID.managerFlag]: { heavy: 25 } })
    expect(flags.org.managers.some((x) => x.flag === 'Overloaded' || x.flag === 'Heavy')).toBe(false)
    expect(base.org.managers.some((x) => x.flag === 'Overloaded')).toBe(true)
    expect(base.scorecard.rows.some((r) => Object.keys(r.shade).length > 0)).toBe(true)
    const card = run({ [ID.scorecard]: { minHeadcount: 1000 } }).scorecard
    expect(card.rows.every((r) => Object.keys(r.shade).length === 0)).toBe(true)
    expect(card.rule.minHeadcount).toBe(1000)
    expect(run({ [ID.engineering]: { reference: 0.7 } }).workforce.engineering.reference).toBe(0.7)
  })
})

describe('wording edits show everywhere the metric appears', () => {
  const edited = (api: MetricsApi) => computeHrbp(sampleCtx({}, api))

  it('puts your definition in the tile popover and the figure datasheet', () => {
    const text = 'Resignations in the period over average headcount, annualized.'
    const m = edited(metricsWithEdits([{ metricId: ID.voluntary, field: 'definition', value: text }]))
    expect(tile(m, 'voluntary').definition).toBe(text)
    expect(m.prep.defs(ID.voluntary)).toEqual([
      {
        term: 'Voluntary attrition',
        text,
        formula: 'voluntary exits ÷ average headcount, × (12 ÷ window months) when annualized',
        metricId: ID.voluntary,
      },
    ])
  })

  it('notes a changed setting on every metric it changes', () => {
    const m = edited(metricsWith({ [ID.headcount]: { countContractors: true } }))
    const note = 'Changed setting: Count contractors in headcount On (default Off).'
    for (const id of [
      'headcount',
      'hires',
      'attrition',
      'voluntary',
      'regretted',
      'first-year',
      'promotion-rate',
    ])
      expect(tile(m, id).definition, id).toContain(note)
    // Settings that do not touch a metric stay out of its definition.
    expect(tile(m, 'mean-span').definition).not.toContain('Changed setting')
  })
})

describe('lineage variants for what counts as regretted', () => {
  it('name only schema fields, with or without the termination type', () => {
    for (const rule of ['voluntaryFlagged', 'anyFlagged'] as const) {
      for (const l of [
        FIGURE.regrettedByQuarter(rule),
        FIGURE.managers(rule),
        FIGURE.regrettedLeavers(true, rule),
        FIGURE.scorecard('businessUnit', true, rule),
      ]) {
        expect(invalidRefs(allRefs(l))).toEqual([])
        expect(allRefs(l)).toContain('employees.regrettable')
      }
      expect(allRefs(FIGURE.regrettedByQuarter(rule)).includes('employees.terminationType')).toBe(
        rule === 'voluntaryFlagged',
      )
    }
  })
})
