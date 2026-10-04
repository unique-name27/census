/**
 * The Compliance metric dictionary and house rules (docs/METRICS.md, ARCHITECTURE.md): every
 * KPI, figure and finding links to a registered metric and declares valid lineage, every setting
 * is read through the registry and changes the numbers it governs, copy follows the writing
 * rules, and the privacy rules hold.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isFieldRef } from '@/data/quality/fieldRef'
import { AUTHORIZATION_TYPES } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramsOfView, recordParamReads } from '@/metrics/testing'
import { DEFAULTS, M, metrics, TALENT_REQUIRED_TRAINING } from '../metrics'
import { buildBase } from './base'
import { mixDrill } from './drills'
import { actions, compute, headline, summary } from './index'
import { emp, fixtureContext, rtw, sampleContext } from './testkit'
import { computeWork } from './work'

describe('the registry', () => {
  it('passes the catalog checks, every entry at home in Compliance with lineage', () => {
    expect(validateCatalog(metrics)).toEqual([])
    for (const d of metrics) {
      expect(d.id.startsWith('compliance.'), d.id).toBe(true)
      expect(d.views[0], d.id).toBe('compliance')
      expect(d.uses.length, d.id).toBeGreaterThan(0)
      for (const ref of d.uses) expect(isFieldRef(ref), `${d.id} ${ref}`).toBe(true)
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
    }
    expect(CATALOG.byId.get(TALENT_REQUIRED_TRAINING)).toBeTruthy()
  })

  it('holds the Atlas targets: 100% reverification and I-9, 0 without a license', () => {
    const t = (id: string) => CATALOG.byId.get(id)?.target
    expect(t(M.reverificationOnTime)).toEqual({ value: 1, comparator: '>=' })
    expect(t(M.i9Section2)).toEqual({ value: 1, comparator: '>=' })
    expect(t(M.withoutLicense)).toEqual({ value: 0, comparator: '<=' })
    expect(t(M.policyAcks)).toEqual({ value: 0.95, comparator: '>=' })
  })

  it('never quotes a governed number in a metric name', () => {
    // Form names (I-9, Section 2) are not numbers a setting governs.
    for (const d of metrics) expect(d.name.replace(/I-9|Section \d/g, ''), d.id).not.toMatch(/\d/)
  })
})

describe('settings are read through the registry', () => {
  it('reads every registered compliance setting when the view, summary and actions run', () => {
    const { metrics: api, reads } = recordParamReads(metricsWith({}))
    const ctx = sampleContext({ metrics: api })
    compute(ctx)
    summary(ctx)
    actions(ctx)
    headline(ctx)
    for (const ref of paramsOfView('compliance')) expect(reads, ref).toContain(ref)
  })

  it('changes the numbers they govern', () => {
    const base = compute(sampleContext())
    const wider = compute(sampleContext({ metrics: metricsWith({ [M.expiring]: { headlineDays: 180 } }) }))
    expect(wider.kpis.find((k) => k.id === 'compliance-expiring')?.value).toBe(26)
    expect(wider.kpis.find((k) => k.id === 'compliance-expiring')?.label).toBe('Expiring in 180 days')
    const lead = compute(
      sampleContext({ metrics: metricsWith({ [M.reverificationOnTime]: { leadDays: 30 } }) }),
    )
    expect(lead.work.overdue.length).toBeLessThan(base.work.overdue.length)
    const i9 = compute(sampleContext({ metrics: metricsWith({ [M.i9Section2]: { businessDays: 10 } }) }))
    expect(i9.i9.current.onTime.length).toBeGreaterThan(base.i9.current.onTime.length)
    const look = compute(sampleContext({ metrics: metricsWith({ [M.deadlines]: { days: 14 } }) }))
    expect(look.deadlines.upcoming.length).toBeLessThan(base.deadlines.upcoming.length)
    expect(DEFAULTS.deadlineDays).toBe(60)
  })

  it('judges the I-9 finding against the target in force', () => {
    const lower = metricsWithEdits([
      { metricId: M.i9Section2, field: 'target', value: { value: 0.95, comparator: '>=' } },
    ])
    const m = compute(sampleContext({ metrics: lower }))
    expect(m.findings.some((f) => f.id === 'compliance-i9-late')).toBe(false)
    const critical = compute(sampleContext({ metrics: metricsWith({ [M.i9Rule]: { criticalShare: 0.97 } }) }))
    expect(critical.findings.find((f) => f.id === 'compliance-i9-late')?.severity).toBe('critical')
  })
})

describe('lineage and metric links', () => {
  const m = compute(sampleContext())

  it('every KPI and finding names a registered metric and valid fields', () => {
    for (const x of [...m.kpis, ...m.findings, ...summary(sampleContext()).kpis]) {
      expect(x.metricId && CATALOG.byId.has(x.metricId), x.id).toBe(true)
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      for (const ref of x.uses ?? []) expect(isFieldRef(ref), `${x.id} ${ref}`).toBe(true)
    }
  })

  it('every finding drills to its records', () => {
    for (const f of m.findings) expect(resolveDrill(f.drill)?.rows.length, f.id).toBeGreaterThan(0)
  })

  it('every action carries lineage, a drill and an owner', () => {
    for (const a of actions(sampleContext())) {
      expect(a.uses?.length, a.id).toBeGreaterThan(0)
      expect(resolveDrill(a.drill)?.rows, a.id).toHaveLength(1)
      expect(a.id).toMatch(/^compliance:(reverification|i9|license):E\d+$/)
    }
  })

  it('every Figure in the UI declares a metric and its lineage', () => {
    const dir = new URL('../ui/', import.meta.url)
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const text = readFileSync(new URL(file, dir), 'utf8')
      const figures = text.split('<Figure').slice(1)
      for (const f of figures) {
        const props = f.slice(0, f.indexOf('>'))
        expect(props, file).toMatch(/\bmetric=\{/)
        expect(props, file).toMatch(/\buses=\{/)
      }
    }
  })
})

describe('copy', () => {
  const m = compute(sampleContext())
  const texts = [
    ...m.kpis.flatMap((k) => [k.label, k.note ?? '']),
    ...m.findings.flatMap((f) => [f.title, f.detail ?? '', f.action ?? '']),
    ...actions(sampleContext()).flatMap((a) => [a.what, a.note ?? '']),
  ]

  it('has no em dash in a sentence, no exclamation mark and no nagging verbs', () => {
    for (const t of texts) {
      expect(t, t).not.toMatch(/\w\s*—\s*\w/)
      expect(t, t).not.toMatch(/!/)
      expect(t, t).not.toMatch(/\b(chase|chasing|push|nag|ping|hound|unblock)\b/i)
    }
  })

  it('writes findings as one sentence with the number in it', () => {
    for (const f of m.findings) {
      expect(f.title, f.id).toMatch(/\d/)
      expect(f.title.endsWith('.'), f.id).toBe(true)
    }
  })
})

describe('privacy', () => {
  it('never puts an authorization type in a finding, KPI or action', () => {
    const m = compute(sampleContext({ showImmigration: true }))
    const texts = [
      ...m.kpis.flatMap((k) => [k.label, k.note ?? '']),
      ...m.findings.flatMap((f) => [
        f.title,
        f.detail ?? '',
        f.action ?? '',
        ...(f.people ?? []).map((p) => p.note ?? ''),
      ]),
      ...actions(sampleContext()).flatMap((a) => [a.what, a.note ?? '', a.subject.label]),
    ]
    for (const t of texts) for (const type of AUTHORIZATION_TYPES) expect(t, t).not.toContain(type)
  })

  it('hides the type in drills, and opens the people behind a type count only with immigration details on', () => {
    const off = compute(sampleContext())
    const spec = resolveDrill(off.kpis.find((k) => k.id === 'compliance-expiring')?.drill)
    expect(spec?.hide).toContain('authorizationType')
    const visa = off.work.mix.find((r) => r.type === 'Employer-sponsored visa')!
    expect(mixDrill(off.scope, visa.rows, visa.type, [])).toBeNull()
    const on = compute(sampleContext({ showImmigration: true }))
    const onSpec = resolveDrill(on.kpis.find((k) => k.id === 'compliance-expiring')?.drill)
    expect(onSpec?.hide ?? []).not.toContain('authorizationType')
    expect(mixDrill(on.scope, visa.rows, visa.type, [])?.rows).toHaveLength(visa.rows.length)
  })

  it('folds categories under the anonymity minimum, which can be raised', () => {
    const a = emp()
    const b = emp()
    const ctx = fixtureContext({
      employees: [a, b],
      rightToWork: [rtw(a, { authorizationType: 'Work permit', expiryDate: '2027-01-01' }), rtw(b)],
    })
    const w = computeWork(buildBase(ctx), ctx.window)
    expect(w.mix.map((r) => [r.type, r.people])).toEqual([['Other (2)', null]])
    const raised = sampleContext({ metrics: metricsWith({ 'privacy.anonymity': { minGroup: 12 } }) })
    const types = compute(raised).work.mix.map((r) => r.type)
    expect(types).not.toContain('Intra-company transfer')
    expect(types.some((t) => t.startsWith('Other'))).toBe(true)
  })

  it('holds no nationality or citizenship field', () => {
    const r = rtw(emp())
    expect(Object.keys(r).some((k) => /nationality|citizen/i.test(k))).toBe(false)
  })
})

describe('missing and scoped data', () => {
  it('shows "—" with a reason, never 0, when Right to work and Learning are not loaded', () => {
    const ctx = fixtureContext({ employees: [emp()] })
    const m = compute(ctx)
    for (const id of [
      'compliance-expiring',
      'compliance-reverification',
      'compliance-i9',
      'compliance-without-license',
    ]) {
      const k = m.kpis.find((x) => x.id === id)
      expect(k?.value, id).toBeNull()
      expect(k?.note, id).toBe('Upload Right to work to see this')
    }
    expect(m.kpis.find((x) => x.id === 'compliance-training')?.note).toBe('Upload Learning to see this')
    expect(headline(ctx).value).toBe('—')
    expect(actions(ctx)).toEqual([])
    expect(m.findings.map((f) => f.id)).toEqual(['compliance-deadlines'])
  })

  it('narrows every number to an org scope', () => {
    const scoped = compute(sampleContext({ filters: { businessUnit: ['Silicon Engineering'] } }))
    const all = compute(sampleContext())
    expect(scoped.work.expiringHorizon.length).toBeLessThan(all.work.expiringHorizon.length)
    expect(scoped.work.expiringHorizon.every((x) => x.e.businessUnit === 'Silicon Engineering')).toBe(true)
    expect(scoped.i9.current.judged.length).toBeLessThan(all.i9.current.judged.length)
  })
})
