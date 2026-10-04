/**
 * Lineage of the HR business partner view: every KPI, figure and finding declares the dataset
 * fields behind it, every declared field exists in the schema, optional refinements are declared
 * only when their data is loaded, and the talking points follow the data standard.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Finding, Kpi } from '@/components/types'
import { buildContext } from '@/data/context'
import { type FieldRef, invalidRefs, type QualityIndex, type Tier } from '@/data/quality'
import { DEFAULT_FILTERS } from '@/data/scope'
import { computeHrbp, type HrbpModel, talkingPoints } from '.'
import { prepare } from './base'
import { ctxOf, emp, leaver, many, sampleCtx } from './fixtures'
import * as L from './lineage'
import {
  all,
  allRefs,
  FIGURE,
  HEADCOUNT,
  ifPresent,
  type Lineage,
  need,
  optional,
  REASON,
  resolveLineage,
  scopeLineage,
} from './lineage'

const isLineage = (v: unknown): v is Lineage =>
  typeof v === 'object' && v !== null && 'need' in v && 'optional' in v

/** Every figure lineage, with each variant its UI can ask for. */
function figureLineages(): [string, Lineage][] {
  const out: [string, Lineage][] = []
  for (const [key, value] of Object.entries(FIGURE)) {
    if (isLineage(value)) out.push([key, value])
  }
  for (const dim of ['leader', 'businessUnit', 'department', 'location'] as const)
    for (const withPromotions of [true, false])
      out.push([`scorecard(${dim}, ${withPromotions})`, FIGURE.scorecard(dim, withPromotions)])
  for (const dim of ['location', 'businessUnit'] as const)
    out.push([`workerMix(${dim})`, FIGURE.workerMix(dim)])
  for (const by of ['businessUnit', 'department'] as const) out.push([`growth(${by})`, FIGURE.growth(by)])
  for (const dim of ['department', 'location'] as const)
    out.push([`attritionByGroup(${dim})`, FIGURE.attritionByGroup(dim)])
  for (const withReason of [true, false])
    out.push([`regrettedLeavers(${withReason})`, FIGURE.regrettedLeavers(withReason)])
  return out
}

const tiles = (m: HrbpModel): Kpi[] => [...m.kpi.kpis, ...m.movementKpis, ...m.orgKpis]

function expectDeclared(item: Kpi | Finding, what: string) {
  const uses = item.uses ?? []
  expect(uses.length, `${what} ${item.id} declares no fields`).toBeGreaterThan(0)
  expect(invalidRefs(uses), `${what} ${item.id}`).toEqual([])
  expect(new Set(uses).size, `${what} ${item.id} repeats a field`).toBe(uses.length)
}

describe('lineage building blocks', () => {
  it('names only fields that exist in the schema', () => {
    for (const [name, value] of Object.entries(L)) {
      if (isLineage(value)) expect(invalidRefs(allRefs(value)), name).toEqual([])
    }
    for (const [name, l] of figureLineages()) {
      expect(invalidRefs(allRefs(l)), name).toEqual([])
      expect(allRefs(l).length, name).toBeGreaterThan(0)
    }
  })

  it('keeps an optional group only when every field in it holds data', () => {
    const l = all(
      need('employees.hireDate'),
      optional('jobChanges.fromLevel', 'jobChanges.toLevel'),
      ifPresent(need('employees.regrettable')),
    )
    const has = new Set<string>(['employees.hireDate', 'jobChanges.fromLevel', 'employees.regrettable'])
    expect(resolveLineage(l, (r) => has.has(r))).toEqual(['employees.hireDate', 'employees.regrettable'])
    has.add('jobChanges.toLevel')
    expect(resolveLineage(l, (r) => has.has(r))).toEqual([
      'employees.hireDate',
      'jobChanges.fromLevel',
      'jobChanges.toLevel',
      'employees.regrettable',
    ])
  })

  it('adds the fields each active org filter reads', () => {
    const none = () => false
    expect(resolveLineage(scopeLineage(DEFAULT_FILTERS), none)).toEqual([])
    expect(
      resolveLineage(
        scopeLineage({ ...DEFAULT_FILTERS, leaderId: 'E1', location: ['Bengaluru'], level: ['L3'] }),
        none,
      ),
    ).toEqual(['employees.employeeId', 'employees.managerId', 'employees.location', 'employees.level'])
  })
})

describe('every UI figure declares its lineage', () => {
  const dir = fileURLToPath(new URL('../ui', import.meta.url))
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }))

  it('passes uses from FIGURE to each <Figure>', () => {
    for (const { file, text } of sources) {
      const figures = text.split('<Figure').length - 1
      const declared = text.split('uses={p.uses(FIGURE.').length - 1
      expect(declared, file).toBe(figures)
    }
  })

  it('uses every FIGURE entry somewhere', () => {
    const text = sources.map((s) => s.text).join('\n')
    for (const key of Object.keys(FIGURE)) expect(text, key).toContain(`FIGURE.${key}`)
  })
})

describe('every KPI and finding on the sample declares its fields', () => {
  const ceo = sampleCtx().data.employees.find((e) => !e.managerId)!
  const scopes = [
    {},
    { location: ['Bengaluru'] },
    { businessUnit: ['Silicon Engineering'] },
    { leaderId: ceo.employeeId },
    { period: 't3m' as const },
  ]

  it.each(scopes.map((s) => [JSON.stringify(s), s] as const))('%s', (_, filters) => {
    const ctx = sampleCtx(filters)
    const m = computeHrbp(ctx)
    expect(m.findings.length).toBeGreaterThan(0)
    for (const k of tiles(m)) expectDeclared(k, 'KPI')
    for (const f of m.findings) expectDeclared(f, 'finding')
    const scope = resolveLineage(scopeLineage(ctx.filters), () => true)
    for (const item of [...tiles(m), ...m.findings])
      for (const ref of scope) expect(item.uses, `${item.id} under ${JSON.stringify(filters)}`).toContain(ref)
  })

  it('declares exactly what voluntary attrition reads', () => {
    const m = computeHrbp(sampleCtx())
    // The field most characteristic of the number comes first: the badge names it on a tie.
    expect(m.kpi.kpis.find((k) => k.id === 'voluntary')!.uses).toEqual([
      'employees.terminationType',
      'employees.terminationDate',
      'employees.hireDate',
      'employees.employmentType',
    ])
    expect(m.kpi.kpis.find((k) => k.id === 'regretted')!.uses![0]).toBe('employees.regrettable')
    const promo = m.kpi.kpis.find((k) => k.id === 'promotion-rate')!.uses!
    expect(promo[0]).toBe('jobChanges.changeType')
    expect(promo).toEqual(expect.arrayContaining(['jobChanges.effectiveDate', 'jobChanges.employeeId']))
  })

  it('reads job history for a past department only when it is loaded', () => {
    const p = computeHrbp(sampleCtx()).prep
    expect(p.uses(FIGURE.attritionByGroup('department'))).toContain('jobChanges.fromDepartment')
    const bare = computeHrbp(ctxOf({ employees: [...many(20), leaver('2026-03-02', 'Voluntary')] })).prep
    const refs = bare.uses(FIGURE.attritionByGroup('department'))
    expect(refs).toContain('employees.department')
    expect(refs.some((r) => r.startsWith('jobChanges.'))).toBe(false)
  })

  it('counts an active-only roster without its blank termination dates', () => {
    const m = computeHrbp(ctxOf({ employees: [...many(30), emp({ employeeId: 'X1' })] }))
    const k = (id: string) => m.kpi.kpis.find((x) => x.id === id)!.uses
    expect(k('headcount')).toEqual(['employees.employmentType', 'employees.hireDate'])
    // Exit rates need the dates: their tier is "No data" with the reason.
    expect(k('attrition')).toContain('employees.terminationDate')
    expect(m.prep.uses(HEADCOUNT)).not.toContain('employees.terminationDate')
  })
})

/** A quality index stub: every field gold except the ones named. */
function stubQuality(low: Partial<Record<FieldRef, Tier>>): QualityIndex {
  const tier = (ref: FieldRef): Tier => low[ref] ?? 'gold'
  const order: Tier[] = ['none', 'bronze', 'silver', 'gold']
  return {
    fieldTier: tier,
    tierOf: (uses: readonly FieldRef[] | undefined) =>
      (uses ?? []).map(tier).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'gold',
  } as unknown as QualityIndex
}

const base = sampleCtx()
/** The sample under a data standard, with every field gold except the ones named. */
const withQuality = (
  standard: 'gold' | 'silver' | 'bronze',
  low: Partial<Record<FieldRef, Tier>>,
  filters = base.filters,
) =>
  buildContext({
    data: base.all,
    sources: base.sources,
    filters,
    asOfOverride: null,
    showPay: false,
    standard,
    quality: stubQuality(low),
  })

describe('findings cite exit reasons only when they meet the standard', () => {
  const bengaluru = (m: HrbpModel) => m.findings.find((f) => f.id === 'hrbp-voluntary-location')!

  it('keeps a confirmed rate and leaves out reasons below the standard', () => {
    const m = computeHrbp(withQuality('gold', { 'employees.terminationReason': 'bronze' }))
    const f = bengaluru(m)
    expect(f.title).toBe('Voluntary attrition in Bengaluru is 18.8%, 9.4 pts above the company.')
    expect(f.detail).not.toContain('most often')
    // The next step does not send the reader to reasons the page no longer shows.
    expect(f.action).toBe('Hold stay conversations in the most affected Bengaluru teams.')
    expect(f.uses).not.toContain('employees.terminationReason')
    expect(f.people!.every((x) => !x.note!.includes('Career growth'))).toBe(true)
    const cluster = m.findings.find((x) => x.id === 'hrbp-regretted-cluster')!
    expect(cluster.detail).toMatch(/^They left between/)
    expect(cluster.uses).not.toContain('employees.terminationReason')
    expect(talkingPoints(m)).not.toContain('The top reason given')
  })

  it("drops the exit reasons from a filtered scope's next step too", () => {
    const scoped = (standard: 'gold' | 'bronze') =>
      computeHrbp(
        withQuality(
          standard,
          { 'employees.terminationReason': 'bronze' },
          { ...base.filters, location: ['Bengaluru'] },
        ),
      ).findings.find((f) => f.id === 'hrbp-voluntary-scope')!
    expect(scoped('gold').action).toBe('Hold stay conversations in the most affected Bengaluru teams.')
    expect(scoped('bronze').action).toBe(
      'Review the top exit reasons with the Bengaluru leaders and hold stay conversations in the most affected teams.',
    )
  })

  it('shows a supporting detail under Everything, else only when it meets the standard', () => {
    const meets = (standard: 'gold' | 'silver' | 'bronze', tier: Tier) =>
      prepare(withQuality(standard, { 'employees.terminationReason': tier })).meets(REASON)
    expect(meets('bronze', 'none')).toBe(true)
    expect(meets('silver', 'silver')).toBe(true)
    expect(meets('gold', 'silver')).toBe(false)
    expect(meets('silver', 'bronze')).toBe(false)
  })

  it('cites them, and declares them, when they meet it', () => {
    const m = computeHrbp(withQuality('bronze', { 'employees.terminationReason': 'bronze' }))
    const f = bengaluru(m)
    expect(f.detail).toContain('“Career growth or promotion” (20)')
    expect(f.action).toBe(
      'Review the top exit reasons with the Bengaluru leaders and hold stay conversations in the most affected teams.',
    )
    expect(f.uses).toContain('employees.terminationReason')
    expect(m.findings.find((x) => x.id === 'hrbp-regretted-cluster')!.detail).toContain(
      '“My manager” (5 of 5)',
    )
  })
})

describe('talking points follow the data standard', () => {
  const bullets = (text: string) => text.split('\n').filter((l) => l.startsWith('- '))

  it('keeps every point when the data meets the standard', () => {
    const text = talkingPoints(computeHrbp(withQuality('gold', {})))
    expect(text.split('\n')[0]).toMatch(/, production data only$/)
    expect(text).not.toContain('left out')
    expect(bullets(text).length).toBe(bullets(talkingPoints(computeHrbp(base))).length)
  })

  it('leaves out and counts the points below the standard', () => {
    const text = talkingPoints(computeHrbp(withQuality('gold', { 'employees.regrettable': 'bronze' })))
    expect(text).not.toMatch(/regretted exits over/)
    // The top item comes from the findings shown under the standard, so it is never the regretted cluster.
    expect(text).toContain('Top item to raise:')
    expect(text).not.toContain('regretted exits in the last 12 months')
    expect(text).toContain('Voluntary attrition is')
    expect(bullets(text).at(-1)).toBe(
      '- One point is left out because its data is not yet confirmed for production.',
    )
  })

  it('counts several points left out', () => {
    const text = talkingPoints(
      computeHrbp(
        withQuality('silver', { 'jobChanges.changeType': 'bronze', 'employees.regrettable': 'none' }),
      ),
    )
    expect(bullets(text).at(-1)).toBe('- 2 points are left out because their data is not yet validated.')
  })

  it('says one point when one is left out, under the validated standard', () => {
    const text = talkingPoints(computeHrbp(withQuality('silver', { 'jobChanges.changeType': 'bronze' })))
    expect(text.split('\n')[0]).toMatch(/, validated data only$/)
    expect(text).not.toContain('Promotion rate is')
    expect(bullets(text).at(-1)).toBe('- One point is left out because its data is not yet validated.')
  })
})
