import { describe, expect, it } from 'vitest'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Tier } from '@/data/quality/tier'
import type { FieldStats } from '@/data/quality/types'
import { defaultMetrics } from '@/metrics/api'
import { METRICS } from '@/metrics/catalog'
import { metricsWithEdits } from '@/metrics/testing'
import {
  countText,
  EXPORT_COLUMNS,
  exportRows,
  type FormulaRow,
  filterRows,
  formulaIndexMeta,
  formulaIndexTable,
  formulaRows,
  formulaText,
  groupFormulaRows,
  humanize,
  isFiltered,
  NO_FORMULA_FILTERS,
  placeOf,
  settingText,
  viewOptions,
} from './formulaIndex'

/** Every field gold, except termination type at silver. */
const quality = {
  fieldStats: (ref: FieldRef) =>
    ({ ref, tier: (ref === 'employees.terminationType' ? 'silver' : 'gold') as Tier }) as FieldStats,
}

const rows = formulaRows(defaultMetrics(), quality)
const row = (list: readonly FormulaRow[], id: string) => {
  const r = list.find((x) => x.id === id)
  if (!r) throw new Error(`no row ${id}`)
  return r
}
const ids = (list: readonly FormulaRow[]) => list.map((r) => r.id)
const search = (query: string) => ids(filterRows(rows, { ...NO_FORMULA_FILTERS, query }))

describe('formula index rows', () => {
  it('lists every registered metric once, in catalog order, each with a formula', () => {
    expect(ids(rows)).toEqual(METRICS.map((d) => d.id))
    expect(rows.filter((r) => !r.formula).map((r) => r.id)).toEqual([])
  })

  it('gives every number computed from data a population and a window', () => {
    const data = rows.filter((r) => r.section !== 'rules')
    expect(data.filter((r) => !r.population?.trim()).map((r) => r.id)).toEqual([])
    expect(data.filter((r) => !r.window?.trim()).map((r) => r.id)).toEqual([])
  })

  it('shows the wording, unit and target in force', () => {
    const vol = row(rows, 'hrbp.attrition.voluntary')
    expect(vol).toMatchObject({
      name: 'Voluntary attrition',
      formula: 'voluntary exits ÷ average headcount, × (12 ÷ window months) when annualized',
      unit: 'Percent (%)',
      target: 'At most 10.0%',
      section: 'hrbp',
      sectionLabel: 'People stats',
      groupLabel: 'Attrition',
      viewsText: 'People stats, Compensation and Talent',
      changed: false,
      changedText: null,
    })
    expect(row(rows, 'hrbp.flow.hires').target).toBeNull()
  })

  it('lists its own settings and those of the metrics it depends on, with values in force', () => {
    const fy = row(rows, 'hrbp.attrition.firstYear')
    expect(fy.settings[0]).toMatchObject({
      label: 'First-year window',
      value: '365 d',
      defaultValue: '365 d',
      changed: false,
      from: null,
    })
    const vol = row(rows, 'hrbp.attrition.voluntary')
    expect(vol.settings.map(settingText)).toEqual([
      'Count contractors in headcount (Headcount): Off',
      'Annualize turnover rates (Attrition): On',
    ])
    // The anonymity minimum applies to every number: it is listed on its own row only.
    expect(vol.settings.some((s) => s.metricId === 'privacy.anonymity')).toBe(false)
    expect(row(rows, 'privacy.anonymity').settings.map(settingText)).toEqual(['Smallest group shown: 5'])
  })

  it('names the fields read with their tier, and none for a rule', () => {
    const vol = row(rows, 'hrbp.attrition.voluntary')
    expect(vol.fields.map((f) => `${f.ref} ${f.tierText}`)).toContain('employees.terminationType Silver')
    expect(vol.fields.find((f) => f.ref === 'employees.terminationDate')).toMatchObject({
      label: 'Employees: Termination date',
      tier: 'gold',
    })
    expect(row(rows, 'privacy.payAmounts')).toMatchObject({ fields: [], readsNoData: true })
    // Without a quality index the tier is unknown, not a guess.
    expect(formulaRows(defaultMetrics(), null)[0].fields.every((f) => f.tier === 'none')).toBe(true)
  })

  it('follows edits: wording, settings and the settings of a metric it depends on', () => {
    const api = metricsWithEdits([
      { metricId: 'hrbp.attrition.firstYear', field: 'params.days', value: 180 },
      { metricId: 'hrbp.attrition.voluntary', field: 'formula', value: 'resignations ÷ average headcount' },
      { metricId: 'hrbp.headcount.employees', field: 'params.countContractors', value: true },
      { metricId: 'quality.rules.fill', field: 'params.minCoverage', value: 0.9 },
    ])
    const edited = formulaRows(api, quality)
    const fy = row(edited, 'hrbp.attrition.firstYear')
    expect(fy.settings[0]).toMatchObject({ value: '180 d', defaultValue: '365 d', changed: true })
    expect(settingText(fy.settings[0])).toBe('First-year window: 180 d (default 365 d)')
    expect(fy.changedText).toBe('First-year window, Count contractors in headcount (Headcount)')
    const vol = row(edited, 'hrbp.attrition.voluntary')
    expect(vol.formula).toBe('resignations ÷ average headcount')
    expect(vol.changedText).toBe('Formula, Count contractors in headcount (Headcount)')
    // A changed data quality rule changes tiers, not calculations: no mark for that alone.
    expect(row(edited, 'recruiting.reqs.open').changed).toBe(false)
    expect(row(edited, 'quality.rules.fill').changed).toBe(true)
  })

  it('keeps a cleared formula empty', () => {
    const api = metricsWithEdits([{ metricId: 'hrbp.flow.hires', field: 'formula', value: '' }])
    const hires = row(formulaRows(api, quality), 'hrbp.flow.hires')
    expect(hires.formula).toBeNull()
    expect(formulaText(hires)).toBe('Hires: no formula recorded')
  })
})

describe('sections and groups', () => {
  const sections = groupFormulaRows(rows)

  it('runs in folder-tab order, then the Action center, then the rules and settings', () => {
    expect(sections.map((s) => s.label)).toEqual([
      'Scorecard',
      'Recruiting',
      'Onboarding',
      'People stats',
      'Org chart',
      'HR ops',
      'Talent',
      'Compensation',
      'Compliance',
      'Listening',
      'Action center',
      'Rules and settings',
    ])
    expect(sections.reduce((n, s) => n + s.count, 0)).toBe(rows.length)
  })

  it('gives the privacy rules, data quality rules and calculation settings their own groups', () => {
    const rules = sections.at(-1)!
    expect(rules.groups.map((g) => [g.label, g.rows.length])).toEqual([
      ['Privacy rules', 6],
      ['Data quality rules', 4],
      ['Calculation settings', 3],
    ])
    expect(ids(rules.groups[2].rows)).toEqual([
      'scorecard.status.watch',
      'scorecard.findings.top',
      'hrbp.rules.materialChange',
    ])
  })

  it('groups by the group in the id, named for people, in catalog order', () => {
    const recruiting = sections.find((s) => s.key === 'recruiting')!
    expect(recruiting.groups.map((g) => g.label)).toEqual([
      'Requisitions',
      'Hires',
      'Offers',
      'Pipeline',
      'Candidate flow',
      'Recruiters',
      'Sources',
      'Data checks',
    ])
    // The Org chart's key figures are one group, though each has its own id group.
    const org = sections.find((s) => s.key === 'org')!
    expect(org.groups.find((g) => g.label === 'Key figures')?.rows).toHaveLength(5)
    expect(placeOf({ id: 'talent.newThing.x', views: ['talent'], uses: [] })).toEqual({
      section: 'talent',
      group: 'New thing',
      groupLabel: 'New thing',
    })
  })

  it('files only privacy ids under Privacy rules, any other rule under Other rules', () => {
    const rule = { id: 'talent.rules.x', views: ['talent'], uses: [], kind: 'rule' } as const
    expect(placeOf(rule)).toEqual({ section: 'rules', group: 'other', groupLabel: 'Other rules' })
    // A locked entry that names no fields reads no data, so it is a rule, but not a privacy one.
    expect(
      placeOf({ id: 'listening.rules.y', views: ['listening'], uses: [], locked: true }).groupLabel,
    ).toBe('Other rules')
    expect(placeOf({ id: 'privacy.z', views: ['hrbp'], uses: [], kind: 'rule' }).groupLabel).toBe(
      'Privacy rules',
    )
    // The extra group sorts after the calculation settings.
    const extra = {
      ...rows[0],
      id: rule.id,
      section: 'rules' as const,
      group: 'other',
      groupLabel: 'Other rules',
    }
    const grouped = groupFormulaRows([...rows, extra]).at(-1)!
    expect(grouped.groups.map((g) => g.label)).toEqual([
      'Privacy rules',
      'Data quality rules',
      'Calculation settings',
      'Other rules',
    ])
  })

  it('reads an unknown group from its id', () => {
    expect(humanize('openRoles')).toBe('Open roles')
    expect(humanize('first90')).toBe('First 90')
    expect(humanize('')).toBe('')
  })
})

describe('search and filters', () => {
  it('searches names, formulas, fields and setting names', () => {
    expect(search('headcount')).toEqual(
      expect.arrayContaining(['hrbp.headcount.employees', 'hrbp.attrition.all']),
    )
    // A field by its schema name, as the import templates spell it.
    expect(search('terminationDate')).toEqual(expect.arrayContaining(['hrbp.flow.exits', 'org.team.exits']))
    expect(search('SLA')).toEqual(expect.arrayContaining(['services.cases.resolutionSla']))
    expect(search('first-year window')).toEqual(expect.arrayContaining(['hrbp.attrition.firstYear']))
    // Every word must match.
    expect(search('voluntary annualized average')).toEqual(
      expect.arrayContaining(['hrbp.attrition.voluntary']),
    )
    expect(search('voluntary zzz')).toEqual([])
  })

  it('filters by view (home or not), changed only and has a target', () => {
    const comp = ids(filterRows(rows, { ...NO_FORMULA_FILTERS, view: 'comp' }))
    expect(comp).toContain('comp.compa.median')
    expect(comp).toContain('hrbp.attrition.voluntary')
    expect(comp).not.toContain('recruiting.reqs.open')
    const targets = filterRows(rows, { ...NO_FORMULA_FILTERS, target: true })
    expect(targets.length).toBeGreaterThan(10)
    expect(targets.every((r) => r.target)).toBe(true)
    expect(filterRows(rows, { ...NO_FORMULA_FILTERS, changed: true })).toEqual([])
    expect(isFiltered(NO_FORMULA_FILTERS)).toBe(false)
    expect(isFiltered({ ...NO_FORMULA_FILTERS, query: '  ' })).toBe(false)
    expect(isFiltered({ ...NO_FORMULA_FILTERS, target: true })).toBe(true)
  })

  it('offers the views some metric appears in, in folder-tab order', () => {
    const views = viewOptions(rows)
    expect(views[0]).toBe('scorecard')
    expect(views).toContain('actions')
    expect(views).toContain('data')
    expect(views).not.toContain('ai')
  })

  it('counts what is shown', () => {
    expect(countText(41, 309)).toBe('Showing 41 of 309 metrics')
    expect(countText(309, 309)).toBe('309 metrics')
    expect(countText(1, 1)).toBe('1 metric')
    expect(countText(1_204, 1_204)).toBe('1,204 metrics')
  })
})

describe('copy and export', () => {
  it('copies one formula as text', () => {
    expect(formulaText(row(rows, 'hrbp.attrition.voluntary'))).toBe(
      'Voluntary attrition: voluntary exits ÷ average headcount, × (12 ÷ window months) when annualized',
    )
  })

  it('exports the whole index, one row per metric, in the columns asked for', () => {
    expect(EXPORT_COLUMNS.map((c) => c.label)).toEqual([
      'View',
      'Group',
      'Metric',
      'ID',
      'Formula',
      'Population',
      'Window',
      'Unit',
      'Target',
      'Settings',
      'Fields read',
      'Changed from default',
    ])
    const out = exportRows(rows)
    expect(out).toHaveLength(rows.length)
    expect(new Set(out.map((r) => r.id)).size).toBe(rows.length)
    expect(out[0]).toMatchObject({ view: 'Scorecard', group: 'Measures', id: 'scorecard.measures.status' })
    const fy = out.find((r) => r.id === 'hrbp.attrition.firstYear')!
    expect(fy).toMatchObject({
      view: 'People stats',
      group: 'Attrition',
      metric: 'First-year attrition',
      unit: 'Percent (%)',
      target: 'At most 15.0%',
      changed: 'No',
    })
    expect(fy.settings).toContain('First-year window: 365 d')
    expect(fy.fields).toContain('Employees: Hire date (Gold)')
    const pay = out.find((r) => r.id === 'privacy.payAmounts')!
    expect(pay).toMatchObject({ view: 'Rules and settings', group: 'Privacy rules', fields: 'Reads no data' })
    expect(out.find((r) => r.id === 'recruiting.reqs.open')?.target).toBe('No target')
  })

  it('marks changes in the export', () => {
    const api = metricsWithEdits([{ metricId: 'hrbp.attrition.firstYear', field: 'params.days', value: 180 }])
    const fy = exportRows(formulaRows(api, quality)).find((r) => r.id === 'hrbp.attrition.firstYear')!
    expect(fy.changed).toBe('Yes: First-year window')
    expect(fy.settings).toContain('First-year window: 180 d (default 365 d)')
  })

  it('names the workbook and stamps it without scope or window', () => {
    const t = formulaIndexTable(rows)
    expect(t).toMatchObject({ name: 'Formula index', title: 'Formula index' })
    expect(t.rows).toHaveLength(rows.length)
    expect(t.note).toBe(`${rows.length} metrics. Edit definitions in the Data room, Metric definitions.`)
    expect(
      formulaIndexMeta({ asOf: '2026-09-30', isSample: true, company: 'Northgate', standard: 'silver' }),
    ).toEqual({
      view: 'Settings',
      viewKey: 'settings',
      tab: 'Formulas',
      scope: '',
      window: '',
      asOf: '2026-09-30',
      isSample: true,
      company: 'Northgate',
      standard: 'silver',
    })
  })
})
