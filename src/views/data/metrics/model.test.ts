import { describe, expect, it } from 'vitest'
import type { FieldRef } from '@/data/quality/fieldRef'
import { lowestTier, type Tier } from '@/data/quality/tier'
import type { FieldStats, Limiting } from '@/data/quality/types'
import type { DatasetKey } from '@/data/schema'
import { metricsApi } from '@/metrics/api'
import { applyEdits, EMPTY_METRICS } from '@/metrics/overrides'
import { parseParamInput } from '@/metrics/params'
import { FIXTURE } from '@/metrics/test-fixtures'
import type { MetricEdit, ParamDef, ParamValue } from '@/metrics/types'
import {
  changeRows,
  countText,
  dictionarySummary,
  directionText,
  draftValue,
  fieldRows,
  filterRows,
  filtersShowing,
  groupOf,
  groupRows,
  inputUnit,
  isFiltered,
  matchesQuery,
  metricRows,
  metricTier,
  NO_FILTERS,
  numberDraft,
  numberInput,
  parseTargetDraft,
  previewSummary,
  refText,
  settingDraft,
  settingRows,
  summaryText,
  targetDraft,
  targetUnit,
  tierNote,
  unitText,
  type ViewDatasets,
  viewOptions,
  whenText,
  whereRows,
} from './model'

/* A quality index with hand-set field stats: just what the dictionary reads. */
function stats(ref: FieldRef, patch: Partial<FieldStats>): FieldStats {
  return {
    ref,
    label: ref.split('.')[1],
    rows: 100,
    applicableRows: 100,
    filled: 100,
    blank: 0,
    coverage: 1,
    invalid: 0,
    defaulted: 0,
    problemRate: 0,
    scope: null,
    blankOk: false,
    remapped: 0,
    tier: 'gold',
    capReason: null,
    capKind: null,
    ...patch,
  }
}

const STATS: Record<string, FieldStats> = {
  'employees.hireDate': stats('employees.hireDate', { label: 'Hire date' }),
  'employees.terminationDate': stats('employees.terminationDate', {
    label: 'Termination date',
    blankOk: true,
    coverage: 0.2,
    filled: 20,
    blank: 80,
  }),
  'employees.terminationType': stats('employees.terminationType', {
    label: 'Termination type',
    tier: 'bronze',
    scope: 'Leavers',
    applicableRows: 200,
    filled: 189,
    blank: 11,
    coverage: 0.946,
    invalid: 3,
    defaulted: 2,
    capReason: 'Termination type is 94.6% filled; silver needs 95%.',
    capKind: 'coverage',
  }),
  'comp.meritPct': stats('comp.meritPct', { label: 'Merit %', tier: 'silver' }),
  'comp.baseSalary': stats('comp.baseSalary', { label: 'Base salary' }),
}

const DATASET_TIER: Partial<Record<DatasetKey, Tier>> = { employees: 'gold', comp: 'gold', reviews: 'silver' }

const quality = {
  rules: { minCoverage: 0.95 },
  fieldStats: (ref: FieldRef) => STATS[ref],
  limitingOf(uses: readonly FieldRef[] | undefined, fallback: readonly DatasetKey[]): Limiting {
    if (uses?.length) {
      const tier = lowestTier(uses.map((r) => STATS[r].tier))
      const ref = uses.find((r) => STATS[r].tier === tier) ?? null
      return { tier, ref, dataset: ref ? (ref.split('.')[0] as DatasetKey) : null }
    }
    const tier = lowestTier(fallback.map((k) => DATASET_TIER[k] ?? 'none'))
    return { tier, ref: null, dataset: fallback.find((k) => DATASET_TIER[k] === tier) ?? null }
  },
  explainOf(uses: readonly FieldRef[] | undefined, fallback: readonly DatasetKey[]): string {
    const l = quality.limitingOf(uses, fallback)
    return `${l.tier}: ${l.ref ?? l.dataset ?? 'nothing'}`
  },
}

const VIEW_DATASETS: ViewDatasets = { hrbp: ['employees', 'jobChanges'], comp: ['comp', 'reviews'] }

const AT = '2026-10-01T09:30:00.000Z'
function apiWith(edits: MetricEdit[] = []) {
  const r = applyEdits(EMPTY_METRICS, FIXTURE, edits, { at: AT, by: 'Jamie' })
  if (r.rejected.length) throw new Error(r.rejected.map((x) => x.error).join('\n'))
  return metricsApi(r.state, FIXTURE)
}

const VOLUNTARY = 'hrbp.attrition.voluntary'
const MERIT = 'comp.merit.spend'
const ANONYMITY = 'privacy.anonymity'

describe('where a metric is listed', () => {
  it('puts rules under their kind and every other metric under its home view', () => {
    expect(groupOf({ id: VOLUNTARY, views: ['hrbp', 'comp'] })).toBe('hrbp')
    expect(groupOf({ id: ANONYMITY, views: ['hrbp'] })).toBe('privacy')
    expect(groupOf({ id: 'quality.rules.fill', views: ['data'] })).toBe('quality')
  })

  it('lists the views a metric appears in, home first', () => {
    const def = FIXTURE.byId.get(VOLUNTARY)!
    expect(whereRows(def)).toEqual([
      { view: 'hrbp', label: 'People stats', home: true },
      { view: 'comp', label: 'Compensation', home: false },
      { view: 'talent', label: 'Talent', home: false },
    ])
  })
})

describe('metricTier', () => {
  it('is the lowest tier among the fields it uses, naming the field', () => {
    const t = metricTier(FIXTURE.byId.get(VOLUNTARY)!, quality, VIEW_DATASETS)
    expect(t.tier).toBe('bronze')
    expect(t.limiting?.ref).toBe('employees.terminationType')
    expect(t.explain).toContain('terminationType')
  })

  it('falls back to the home view’s datasets when no field is named', () => {
    const def = { ...FIXTURE.byId.get(MERIT)!, uses: [] }
    expect(metricTier(def, quality, VIEW_DATASETS).tier).toBe('silver')
    expect(metricTier(def, quality, {}).tier).toBeNull()
  })

  it('gives rules no tier', () => {
    expect(metricTier(FIXTURE.byId.get(ANONYMITY)!, quality, VIEW_DATASETS)).toEqual({
      tier: null,
      limiting: null,
      explain: null,
    })
  })
})

describe('list rows', () => {
  const api = apiWith([
    { metricId: MERIT, field: 'params.meritBudget', value: 0.04 },
    { metricId: MERIT, field: 'definition', value: 'Merit as a share of eligible base, as proposed.' },
    { metricId: MERIT, field: 'target', value: { value: 0.035, comparator: '<=' } },
  ])
  const rows = metricRows(api, quality, VIEW_DATASETS)
  const row = (id: string) => rows.find((r) => r.id === id)!

  it('carry the tier, target, changes and settings of each metric', () => {
    expect(row(VOLUNTARY)).toMatchObject({
      group: 'hrbp',
      tier: 'bronze',
      tierText: 'Bronze',
      limitingText: 'Employees: Termination type',
      targetText: 'At most 8.0%',
      changed: false,
      settings: 3,
      viewsText: 'People stats, Compensation and Talent',
    })
    expect(row(MERIT)).toMatchObject({
      changed: true,
      changedText: 'Definition, Target, Merit budget',
      targetText: 'At most 3.50%',
    })
    expect(row(ANONYMITY)).toMatchObject({ tier: null, tierText: 'Rule', locked: true })
  })

  it('search every word in the name, id, wording, fields and settings', () => {
    expect(matchesQuery(row(VOLUNTARY), 'voluntary')).toBe(true)
    expect(matchesQuery(row(VOLUNTARY), 'first-year window')).toBe(true)
    expect(matchesQuery(row(VOLUNTARY), 'termination type')).toBe(true)
    expect(matchesQuery(row(VOLUNTARY), 'HRBP.ATTRITION')).toBe(true)
    expect(matchesQuery(row(VOLUNTARY), 'voluntary merit')).toBe(false)
    expect(matchesQuery(row(MERIT), 'proposed')).toBe(true)
  })

  it('filter by view (home or not), tier, changed and target', () => {
    const ids = (f: Partial<typeof NO_FILTERS>) => filterRows(rows, { ...NO_FILTERS, ...f }).map((r) => r.id)
    expect(ids({})).toEqual([VOLUNTARY, MERIT, ANONYMITY])
    expect(ids({ view: 'comp' })).toEqual([VOLUNTARY, MERIT])
    expect(ids({ tier: 'bronze' })).toEqual([VOLUNTARY])
    expect(ids({ tier: 'gold' })).toEqual([])
    expect(ids({ changed: true })).toEqual([MERIT])
    expect(ids({ target: true })).toEqual([VOLUNTARY, MERIT])
    expect(ids({ query: 'merit', changed: true })).toEqual([MERIT])
    expect(isFiltered(NO_FILTERS)).toBe(false)
    expect(isFiltered({ ...NO_FILTERS, query: '  ' })).toBe(false)
    expect(isFiltered({ ...NO_FILTERS, target: true })).toBe(true)
  })

  it('group in tab order with the rules last, and offer only views that have metrics', () => {
    expect(groupRows([row(ANONYMITY), row(MERIT), row(VOLUNTARY)]).map((g) => g.label)).toEqual([
      'People stats',
      'Compensation',
      'Privacy rules',
    ])
    expect(viewOptions(rows)).toEqual(['hrbp', 'talent', 'comp'])
  })

  it('count what is shown', () => {
    expect(countText(3, 3)).toBe('3 metrics')
    expect(countText(1, 140)).toBe('Showing 1 of 140 metrics')
  })

  it('clear filters that would hide a metric asked for by address', () => {
    const f = { ...NO_FILTERS, view: 'comp' as const, changed: true }
    expect(filtersShowing(f, row(MERIT))).toBe(f)
    expect(filtersShowing(f, row(VOLUNTARY))).toEqual({ ...NO_FILTERS, view: 'comp' })
    expect(filtersShowing({ ...NO_FILTERS, view: 'org' }, row(VOLUNTARY))).toEqual(NO_FILTERS)
    expect(filtersShowing(f, undefined)).toBe(f)
  })
})

describe('detail tables', () => {
  it('list each field with its tier and a fill rate that never rounds past the threshold', () => {
    const def = FIXTURE.byId.get(VOLUNTARY)!
    const rows = fieldRows(def, quality, 'employees.terminationType')
    expect(rows.map((r) => [r.field, r.tierText, r.fillText, r.limiting])).toEqual([
      ['Hire date', 'Gold', '100%', false],
      ['Termination date', 'Gold', '20%', false],
      ['Termination type', 'Bronze', '94.6%', true],
    ])
    expect(rows[2]).toMatchObject({
      dataset: 'employees',
      datasetLabel: 'Employees',
      invalid: 3,
      defaulted: 2,
    })
    expect(refText('employees.terminationType')).toBe('Employees: Termination type')
  })

  it('show each setting with its default and the value in force', () => {
    const api = apiWith([{ metricId: MERIT, field: 'params.meritBudget', value: 0.04 }])
    const rows = settingRows(FIXTURE.byId.get(MERIT)!, api)
    expect(rows[0]).toMatchObject({
      key: 'meritBudget',
      defaultText: '3.5%',
      currentText: '4%',
      changed: true,
      allowed: '0% to 20%',
    })
    expect(rows.find((r) => r.key === 'healthyBand')).toMatchObject({
      currentText: '0.90 to 1.10',
      changed: false,
    })
    const anon = settingRows(FIXTURE.byId.get(ANONYMITY)!, api)
    expect(anon.map((r) => r.locked)).toEqual(['raiseOnly', true])
  })

  it('log each change with who and when, and offer undo only on the latest for its field', () => {
    const api = apiWith([
      { metricId: MERIT, field: 'params.meritBudget', value: 0.04 },
      { metricId: MERIT, field: 'params.meritBudget', value: 0.045 },
      { metricId: VOLUNTARY, field: 'formula', value: 'exits ÷ headcount' },
    ])
    const all = changeRows(api.state, FIXTURE)
    expect(all).toHaveLength(3)
    const merit = changeRows(api.state, FIXTURE, MERIT)
    expect(merit.map((c) => [c.what, c.canUndo, c.by, c.kindText])).toEqual([
      ['Merit spend, merit budget: 4% to 4.5%', true, 'Jamie', 'Edited'],
      ['Merit spend, merit budget: 3.5% to 4%', false, 'Jamie', 'Edited'],
    ])
    const wording = changeRows(api.state, FIXTURE, VOLUNTARY)[0]
    expect(wording).toMatchObject({ wording: true, to: 'exits ÷ headcount', field: 'Formula' })
    expect(whenText('not a date')).toBe('not a date')
  })

  it('sum up the dictionary', () => {
    const api = apiWith([{ metricId: MERIT, field: 'params.meritBudget', value: 0.04 }])
    const s = dictionarySummary(api)
    expect(s).toEqual({ metrics: 3, settings: 9, targets: 1, changed: 1 })
    expect(summaryText(s)).toBe('3 metrics with 9 settings and 1 target. 1 changed from defaults.')
    expect(summaryText({ ...s, changed: 0 })).toContain('All at their defaults.')
  })

  it('word units, directions and the tier note', () => {
    expect(unitText('pct')).toBe('Percent (%)')
    expect(unitText('days')).toBe('Days (d)')
    expect(directionText('down')).toBe('Lower is better')
    expect(directionText(null)).toBe('Neither: read it in context')
    const vol = FIXTURE.byId.get(VOLUNTARY)!
    expect(tierNote(vol, metricTier(vol, quality, VIEW_DATASETS), VIEW_DATASETS)).toBe(
      'Bronze, set by Employees: Termination type.',
    )
    const gold = { ...vol, uses: ['employees.hireDate' as FieldRef] }
    expect(tierNote(gold, metricTier(gold, quality, VIEW_DATASETS), VIEW_DATASETS)).toBe(
      'Gold: every field it reads is gold.',
    )
    const bare = { ...FIXTURE.byId.get(MERIT)!, uses: [] }
    expect(tierNote(bare, metricTier(bare, quality, VIEW_DATASETS), VIEW_DATASETS)).toBe(
      'It takes the lowest tier of the datasets Compensation reads: Compensation and Performance reviews.',
    )
    const anon = FIXTURE.byId.get(ANONYMITY)!
    expect(tierNote(anon, metricTier(anon, quality, VIEW_DATASETS), VIEW_DATASETS)).toBeNull()
  })
})

describe('setting inputs', () => {
  const param = (id: string, key: string): ParamDef =>
    FIXTURE.byId.get(id)!.params.find((p) => p.key === key)!
  const roundTrip = (p: ParamDef, v: ParamValue) => parseParamInput(p, draftValue(p, settingDraft(p, v)))

  it('show numbers in the unit after the box', () => {
    const budget = param(MERIT, 'meritBudget')
    expect(inputUnit(budget)).toBe('%')
    expect(numberDraft(budget, 0.035)).toBe('3.5')
    expect(numberInput(budget, '0.5')).toBe('0.5%')
    expect(numberInput(budget, '4%')).toBe('4%')
    expect(inputUnit(param(VOLUNTARY, 'firstYearDays'))).toBe('d')
    expect(inputUnit(param(MERIT, 'reviewMonths'))).toBe('months')
    expect(numberDraft(param(MERIT, 'healthyBand'), 0.9)).toBe('0.90')
  })

  it('read a small share as percent, not as a fraction', () => {
    const budget = param(MERIT, 'meritBudget')
    expect(parseParamInput(budget, numberInput(budget, '0.5'))).toEqual({ ok: true, value: 0.005 })
    expect(parseParamInput(budget, numberInput(budget, '25')).ok).toBe(false)
  })

  it('round-trip every kind of setting through its draft', () => {
    expect(roundTrip(param(MERIT, 'meritBudget'), 0.035)).toEqual({ ok: true, value: 0.035 })
    expect(roundTrip(param(VOLUNTARY, 'firstYearDays'), 365)).toEqual({ ok: true, value: 365 })
    expect(roundTrip(param(VOLUNTARY, 'annualize'), false)).toEqual({ ok: true, value: false })
    expect(roundTrip(param(VOLUNTARY, 'regretted'), 'allVoluntary')).toEqual({
      ok: true,
      value: 'allVoluntary',
    })
    expect(roundTrip(param(MERIT, 'healthyBand'), [0.85, 1.15])).toEqual({ ok: true, value: [0.85, 1.15] })
    const guide = { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 }
    expect(roundTrip(param(MERIT, 'guideline'), guide)).toEqual({ ok: true, value: guide })
  })

  it('refuse a draft below a raise-only floor', () => {
    const min = param(ANONYMITY, 'minGroup')
    const r = parseParamInput(min, draftValue(min, { kind: 'text', text: '4' }))
    expect(r.ok).toBe(false)
    expect(parseParamInput(min, draftValue(min, { kind: 'text', text: '8' }))).toEqual({ ok: true, value: 8 })
  })
})

describe('target input', () => {
  const vol = FIXTURE.byId.get(VOLUNTARY)!

  it('reads a share typed as a percent', () => {
    expect(targetUnit(vol)).toBe('%')
    expect(parseTargetDraft(vol, { rule: '<=', text: '8' })).toEqual({
      ok: true,
      value: { value: 0.08, comparator: '<=' },
    })
    expect(parseTargetDraft(vol, { rule: '>=', text: '7.5%' })).toEqual({
      ok: true,
      value: { value: 0.075, comparator: '>=' },
    })
  })

  it('removes the target, or says what is wrong', () => {
    expect(parseTargetDraft(vol, { rule: 'none', text: 'x' })).toEqual({ ok: true, value: null })
    expect(parseTargetDraft(vol, { rule: '<=', text: '' })).toEqual({
      ok: false,
      error: 'Enter a number for the target.',
    })
    expect(parseTargetDraft(vol, { rule: '<=', text: 'eight' })).toEqual({
      ok: false,
      error: '"eight" is not a number.',
    })
  })

  it('fills the draft from the target in force', () => {
    expect(targetDraft(vol, { value: 0.08, comparator: '<=' })).toEqual({ rule: '<=', text: '8' })
    expect(targetDraft(vol, null)).toEqual({ rule: 'none', text: '' })
    const days = { unit: 'days' as const }
    expect(targetUnit(days)).toBe('d')
    expect(parseTargetDraft(days, { rule: '<=', text: '45' })).toEqual({
      ok: true,
      value: { value: 45, comparator: '<=' },
    })
  })
})

describe('import preview', () => {
  it('says what applying the file would do, in the future tense', () => {
    const c = (metricId: string) => ({ metricId })
    expect(previewSummary({ changed: [c('a'), c('a'), c('b')], rejected: [{}], unknown: [] })).toBe(
      'Applying it changes 3 values in 2 metrics. 1 value can’t be applied; it is listed below.',
    )
    expect(previewSummary({ changed: [], rejected: [], unknown: ['x.y.z', 'x.y.w'] })).toBe(
      'Nothing in the file differs from what is in force. 2 metric IDs in the file are not in Census and will be skipped.',
    )
  })
})
