import { describe, expect, it } from 'vitest'
import { computeQuality } from '@/data/quality/compute'
import { DEFAULT_QUALITY_RULES } from '@/data/quality/rules'
import { req } from '@/data/quality/test-fixtures'
import { defaultMetrics } from '@/metrics/api'
import { cand } from '@/views/recruiting/engine/fixtures'
import { VIEWS } from '@/views/registry'
import {
  belowGoldText,
  distinctRows,
  fieldAction,
  type ImpactMetric,
  liftText,
  metricImpact,
  metricTierCounts,
  rowsOfScope,
} from './impact'
import {
  AS_OF,
  fallbackOf,
  gappyCompany,
  gappyQuality,
  gappyVersions,
  METRICS,
  version,
} from './test-fixtures'

describe('metric impact', () => {
  const quality = gappyQuality()
  const impact = metricImpact({ metrics: METRICS, quality, fallbackOf })
  const byId = new Map(impact.metrics.map((r) => [r.id, r]))

  it('gives every metric that names data its tier, as the quality index does', () => {
    expect(quality.datasetTier('employees')).toBe('gold')
    expect(quality.datasetTier('requisitions')).toBe('silver')
    expect(quality.datasetTier('candidates')).toBe('none')
    expect(impact.unjudged).toBe(1)
    expect(impact.metrics).toHaveLength(6)
    for (const r of impact.metrics) {
      const def = METRICS.find((x) => x.id === r.id)!
      const uses = def.uses.length ? def.uses : undefined
      expect(r.tier).toBe(quality.tierOf(uses, fallbackOf(def)))
    }
    expect(byId.get('hrbp.exits.byReason')?.tier).toBe('bronze')
    expect(byId.get('hrbp.headcount.total')?.tier).toBe('gold')
    expect(byId.get('recruiting.reqs.age')?.tier).toBe('silver')
  })

  it('names the field limiting each metric and lists the lowest tier first', () => {
    const reason = byId.get('hrbp.exits.byReason')!
    expect(reason.limiting.ref).toBe('employees.terminationReason')
    expect(reason.limitingLabel).toBe('Employees termination reason')
    expect(reason.why).toMatch(/Termination reason is 70% filled for leavers; silver needs 95%/)
    // A field that is fine on its own doesn't hold a metric back: its dataset does.
    const age = byId.get('recruiting.reqs.age')!
    expect(age.limitingLabel).toBe('Requisitions')
    expect(age.why).toBe('Requisitions mapping confirmed 29 Sep by TA ops; not certified.')
    expect(impact.metrics[0].tier).toBe('none')
    const ranks = impact.metrics.map((r) => ['none', 'bronze', 'silver', 'gold'].indexOf(r.tier))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(metricTierCounts(impact.metrics)).toEqual({ none: 1, bronze: 2, silver: 1, gold: 2 })
  })

  it('ranks single fixes by how many metrics each would lift', () => {
    const [first, second, third] = impact.fixes
    expect(first.id).toBe('field:employees.terminationReason')
    expect(first.rows).toBe(3)
    expect(first.lifts.map((l) => l.metricId).sort()).toEqual([
      'hrbp.exits.byReason',
      'hrbp.exits.reasonShare',
    ])
    expect(first.lifts.every((l) => l.from === 'bronze' && l.to === 'gold')).toBe(true)
    expect(first.sentence).toBe('Filling termination reason for 3 leavers would lift 2 metrics to Gold.')
    // Certifying Requisitions lifts the req age metric to gold; loading Candidates only reaches bronze.
    expect(second.id).toBe('dataset:requisitions')
    expect(second.sentence).toBe('Certifying this Requisitions version would lift 1 metric to Gold.')
    expect(third.id).toBe('dataset:candidates')
    expect(third.sentence).toBe('Loading Candidates would lift 1 metric to Bronze.')
    expect(byId.get('hrbp.exits.byReason')?.bestFix).toBe('Filling termination reason for 3 leavers')
    expect(byId.get('hrbp.headcount.hires')?.bestFix).toBeNull()
  })

  it('judges each fix as if only it were done', () => {
    // Filling the reasons does nothing for a metric that also needs a silver dataset to be certified.
    const withReq = metricImpact({
      metrics: [
        {
          id: 'x.y.z',
          name: 'Mixed',
          views: ['hrbp'],
          uses: ['employees.terminationReason', 'requisitions.openedDate'],
        },
      ],
      quality,
      fallbackOf,
    })
    const fill = withReq.fixes.find((f) => f.id === 'field:employees.terminationReason')!
    expect(fill.lifts).toEqual([{ metricId: 'x.y.z', name: 'Mixed', from: 'bronze', to: 'silver' }])
    expect(fill.sentence).toBe('Filling termination reason for 3 leavers would lift 1 metric to Silver.')
    const cert = withReq.fixes.find((f) => f.id === 'dataset:requisitions')!
    expect(cert.lifts).toEqual([])
    expect(cert.sentence).toBe('Certifying this Requisitions version would not lift a metric on its own.')
  })

  it('says what else a dataset fix needs when a field of it falls short too', () => {
    const data = gappyCompany()
    const versions = gappyVersions(data)
    // Employees only confirmed (silver), so certifying it lifts what reads clean fields to gold.
    const q = computeQuality(
      data,
      { ...versions, employees: { ...versions.employees!, certification: null } },
      undefined,
      {
        asOf: AS_OF,
      },
    )
    expect(q.datasetTier('employees')).toBe('silver')
    const out = metricImpact({ metrics: METRICS, quality: q, fallbackOf })
    const cert = out.fixes.find((f) => f.id === 'dataset:employees')!
    expect(cert.lifts.map((l) => l.metricId).sort()).toEqual(['hrbp.headcount.hires', 'hrbp.headcount.total'])
    expect(cert.alsoNeeded).toEqual({ metrics: 2, fields: ['Termination reason'] })
    expect(cert.sentence).toBe(
      'Certifying this Employees version would lift 2 metrics to Gold. 2 more would also need termination reason fixed.',
    )
  })

  it('offers a new certification when mappings changed certified rows', () => {
    const data = gappyCompany()
    const q = computeQuality(data, gappyVersions(data), undefined, {
      asOf: AS_OF,
      reference: {
        changes: { 'employees.hireDate': 4 },
        at: { 'employees.hireDate': '2026-09-30T08:00:00.000Z' },
      },
    })
    expect(q.fieldTier('employees.hireDate')).toBe('silver')
    const out = metricImpact({ metrics: METRICS, quality: q, fallbackOf })
    const again = out.fixes.find((f) => f.id === 'dataset:employees:recertify')!
    expect(again.action).toBe('Certifying Employees again with your mapping changes')
    expect(again.lifts).toEqual([
      { metricId: 'hrbp.headcount.hires', name: 'hires', from: 'silver', to: 'gold' },
    ])
    // The req age metric reads silver Requisitions too, so it only reaches silver.
    expect(again.lifts.find((l) => l.metricId === 'recruiting.reqs.age')).toBeUndefined()
  })
})

describe('rules and settings that read no data', () => {
  // Their home view is Recruiting, so a view fallback would judge them by Candidates.
  const rules: ImpactMetric[] = [
    {
      id: 'privacy.anonymity',
      name: 'Anonymity minimum',
      views: ['recruiting', 'hrbp'],
      uses: [],
      locked: true,
    },
    { id: 'hrbp.rules.materialChange', name: 'Material change', views: ['hrbp'], uses: [], kind: 'setting' },
    { id: 'recruiting.rules.locked', name: 'A locked rule', views: ['recruiting'], uses: [], locked: true },
  ]

  it('are never judged, listed or lifted, whatever their home view reads', () => {
    const out = metricImpact({ metrics: [...METRICS, ...rules], quality: gappyQuality(), fallbackOf })
    expect(out.unjudged).toBe(1 + rules.length)
    expect(out.metrics.map((r) => r.id)).not.toEqual(expect.arrayContaining(['privacy.anonymity']))
    for (const r of rules) {
      expect(out.metrics.some((x) => x.id === r.id)).toBe(false)
      for (const f of out.fixes) expect(f.lifts.some((l) => l.metricId === r.id)).toBe(false)
    }
    // Loading Candidates lifts only the metric that reads it, not the rules homed in Recruiting.
    const load = out.fixes.find((f) => f.id === 'dataset:candidates')!
    expect(load.lifts.map((l) => l.metricId)).toEqual(['recruiting.funnel.sources'])
  })
})

describe('a metric held by a bronze dataset and a field of it', () => {
  // Candidates loaded but not confirmed (bronze), with 5 of 50 sources not recognized.
  const data = gappyCompany()
  data.candidates = Array.from({ length: 50 }, (_, i) =>
    cand('R1', { source: i < 5 ? 'Billboard' : 'Referral' }),
  )
  const q = computeQuality(
    data,
    { ...gappyVersions(data), candidates: version('candidates', data) },
    undefined,
    { asOf: AS_OF },
  )
  const metric: ImpactMetric = {
    id: 'recruiting.sources.mix',
    name: 'Source mix',
    views: ['recruiting'],
    uses: ['candidates.source', 'candidates.appliedDate'],
  }
  const out = metricImpact({ metrics: [metric], quality: q, fallbackOf })
  const row = out.metrics[0]

  it('names the field that falls short beside the dataset', () => {
    expect(q.datasetTier('candidates')).toBe('bronze')
    expect(row.tier).toBe('bronze')
    expect(row.limitingLabel).toBe('Candidates source')
    expect(row.limiting.ref).toBe('candidates.source')
    expect(row.why).toBe(
      'Candidates mapping not yet confirmed. 10% of source values are not recognized or defaulted; silver allows 2%.',
    )
  })

  it('says what would lift it when no single fix does: the dataset step and the field together', () => {
    const confirm = out.fixes.find((f) => f.id === 'dataset:candidates')!
    expect(confirm.lifts).toEqual([])
    expect(confirm.alsoNeeded).toEqual({ metrics: 1, fields: ['Source'] })
    expect(confirm.sentence).toBe(
      'Confirming the Candidates mapping would not lift a metric on its own. 1 more would also need source fixed.',
    )
    expect(row.bestFix).toBe(
      'Confirming the Candidates mapping and fixing 5 source values that are not recognized',
    )
  })
})

describe('fix wording', () => {
  it('names the dataset once in a fix with several steps', () => {
    const data = gappyCompany()
    const versions = gappyVersions(data)
    // Requisitions unconfirmed, with a hiring manager who is not in the roster.
    data.requisitions = [...data.requisitions, req(3, { hiringManagerId: 'E999' })]
    const q = computeQuality(
      data,
      { ...versions, requisitions: { ...versions.requisitions!, mappingConfirmedAt: null } },
      undefined,
      { asOf: AS_OF },
    )
    const fix = metricImpact({ metrics: METRICS, quality: q, fallbackOf }).fixes.find(
      (f) => f.id === 'dataset:requisitions',
    )!
    expect(fix.action).toBe(
      'Confirming the Requisitions mapping and fixing the 1 row that refers to a missing record',
    )
    expect(fix.rows).toBe(1)
    expect(fix.rules).toEqual(['references'])
  })

  const rules = DEFAULT_QUALITY_RULES
  const base = {
    label: 'Source',
    scope: null,
    blank: 0,
    invalid: 0,
    defaulted: 0,
    coverage: 1,
    problemRate: 0,
    blankOk: false,
  }

  it('fills a thin field and fixes values not recognized', () => {
    expect(fieldAction({ ...base, invalid: 37, problemRate: 0.04 }, 'candidates', rules)).toEqual({
      action: 'Fixing 37 source values that are not recognized',
      rows: 37,
      kinds: ['invalid'],
    })
    expect(fieldAction({ ...base, defaulted: 5, problemRate: 0.05 }, 'candidates', rules).action).toBe(
      'Fixing 5 source values that were filled by a default',
    )
    expect(
      fieldAction(
        {
          ...base,
          label: 'First response',
          scope: 'Cases past the New status',
          blank: 40,
          coverage: 0.92,
          invalid: 30,
          problemRate: 0.03,
        },
        'cases',
        rules,
      ),
    ).toEqual({
      action:
        'Filling first response for 40 cases past the New status and fixing 30 first response values that are not recognized',
      rows: 70,
      kinds: ['blank', 'invalid'],
    })
  })

  it('counts a value the importer left blank once, not as a blank and a value not recognized', () => {
    const out = fieldAction(
      {
        ...base,
        label: 'From level',
        scope: 'Promotions and demotions',
        blank: 10,
        coverage: 0.9,
        invalid: 10,
        invalidBlank: 8,
        problemRate: 0.1,
      },
      'jobChanges',
      rules,
    )
    // 10 blanks, 8 of them the values not recognized, and 2 more values not recognized: 12 rows.
    expect(out.rows).toBe(12)
    expect(out.kinds).toEqual(['blank', 'invalid'])
  })

  it('counts each row behind a dataset fix once', () => {
    expect(
      distinctRows([
        { rows: [1, 2, 3], count: 3 },
        { rows: [2, 3, 4], count: 3 },
      ]),
    ).toBe(4)
    // Import errors with no import log loaded: their rows can't be named, so they add their count.
    expect(
      distinctRows([
        { rows: [], count: 5 },
        { rows: [7], count: 1 },
      ]),
    ).toBe(6)
  })

  it('counts rows with the scope as a noun, or the dataset’s noun for every row', () => {
    expect(rowsOfScope({ scope: 'Leavers' }, 'employees', 141)).toBe('141 leavers')
    expect(rowsOfScope({ scope: 'Everyone except the top of the organization' }, 'employees', 3)).toBe(
      '3 people',
    )
    expect(rowsOfScope({ scope: null }, 'candidates', 1)).toBe('1 application')
    expect(rowsOfScope({ scope: 'Transaction types that track retro adjustments' }, 'transactions', 4)).toBe(
      '4 transactions',
    )
  })

  it('states the tiers reached', () => {
    expect(liftText([])).toBe('would not lift a metric on its own')
    expect(liftText([{ to: 'gold' }])).toBe('would lift 1 metric to Gold')
    expect(liftText([{ to: 'silver' }, { to: 'gold' }, { to: 'gold' }])).toBe(
      'would lift 3 metrics: 2 to Gold and 1 to Silver',
    )
  })
})

describe('over the registered catalog', () => {
  it('judges every registered metric against the sample without throwing', async () => {
    const { generateSample } = await import('@/data/sample')
    const data = generateSample()
    const q = computeQuality(data, {}, undefined, { asOf: AS_OF })
    const views = new Map(VIEWS.map((v) => [v.key as string, v.datasets]))
    const out = metricImpact({
      metrics: defaultMetrics().list,
      quality: q,
      fallbackOf: (x) => views.get(x.views[0]) ?? [],
    })
    expect(out.metrics.length + out.unjudged).toBe(defaultMetrics().list.length)
    for (const f of out.fixes) expect(f.sentence).not.toMatch(/—|!/)
    // The privacy rules, the data quality rules and the materiality floor read no data.
    const listed = new Set(out.metrics.map((r) => r.id))
    for (const id of [
      'privacy.anonymity',
      'privacy.payAmounts',
      'privacy.protectedFields',
      'hrbp.rules.materialChange',
    ])
      expect(listed.has(id), id).toBe(false)
    for (const f of out.fixes)
      expect(f.lifts.some((l) => l.metricId.startsWith('privacy.') || l.metricId.includes('.rules.'))).toBe(
        false,
      )
  })
})

describe('belowGoldText', () => {
  it('counts the metrics that read data, so the gap to the whole dictionary is explained', () => {
    expect(belowGoldText(117, 207)).toBe('117 of the 207 metrics that read data are below gold.')
    expect(belowGoldText(1, 1_207)).toBe('1 of the 1,207 metrics that read data is below gold.')
    expect(belowGoldText(0, 1)).toBe('0 of the 1 metric that reads data are below gold.')
  })
})
