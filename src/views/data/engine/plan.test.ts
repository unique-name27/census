import { describe, expect, it } from 'vitest'
import { isTemplateHelpSheet } from '@/data/import/detect'
import type { DatasetKey } from '@/data/schema'
import {
  isNotCensus,
  matchStrength,
  nextPending,
  orderPlan,
  pendingImports,
  planSheets,
  sameTarget,
  usableSheets,
} from './plan'

/** Guesses for a sheet: the named dataset first at `c`, everything else trailing. */
const guesses = (key: DatasetKey, c: number, second: DatasetKey = 'learning', c2 = 0.2) => [
  { key, confidence: c },
  { key: second, confidence: c2 },
]

const sheet = (sheetName: string, key: DatasetKey, c: number) => ({
  sheetName,
  rows: 10,
  guesses: guesses(key, c),
})

describe('planSheets', () => {
  it('assigns strong and possible matches, skips weak ones, puts Employees first and skipped sheets last', () => {
    const plan = planSheets([
      {
        fileName: 'hr.xlsx',
        sheets: [
          sheet('Ratings', 'reviews', 0.92),
          sheet('Notes', 'cases', 0.2),
          sheet('Roster', 'employees', 0.98),
          sheet('Pay', 'comp', 0.5),
        ],
      },
    ])
    expect(plan.map((p) => [p.sheetName, p.dataset, p.reason])).toEqual([
      ['Roster', 'employees', 'detected'],
      ['Ratings', 'reviews', 'detected'],
      ['Pay', 'comp', 'uncertain'],
      ['Notes', null, 'not-census'],
    ])
    expect(plan.map((p) => p.id)).toEqual(['0:2', '0:0', '0:3', '0:1'])
  })

  it('moves an Employees sheet from a later file ahead of every other sheet', () => {
    const plan = planSheets([
      { fileName: 'a.csv', sheets: [sheet('Sheet1', 'learning', 0.9)] },
      { fileName: 'b.csv', sheets: [sheet('Sheet1', 'employees', 0.9)] },
    ])
    expect(plan.map((p) => `${p.fileName}:${p.dataset}`)).toEqual(['b.csv:employees', 'a.csv:learning'])
  })

  it('with a target, sends the best-fitting sheet there, shows it first and skips the rest', () => {
    const plan = planSheets(
      [
        {
          fileName: 'export.xlsx',
          sheets: [
            { sheetName: 'A', rows: 5, guesses: guesses('cases', 0.8, 'requisitions', 0.3) },
            { sheetName: 'B', rows: 5, guesses: guesses('candidates', 0.7, 'requisitions', 0.6) },
          ],
        },
      ],
      'requisitions',
    )
    expect(plan.map((p) => [p.sheetName, p.dataset, p.reason])).toEqual([
      ['B', 'requisitions', 'target'],
      ['A', null, 'not-target'],
    ])
  })

  it('honours a target even when the only sheet is a weak match', () => {
    const plan = planSheets([{ fileName: 'x.csv', sheets: [sheet('Sheet1', 'cases', 0.1)] }], 'comp')
    expect(plan[0]).toMatchObject({ dataset: 'comp', reason: 'target' })
  })

  it('returns nothing for no sheets', () => {
    expect(planSheets([])).toEqual([])
    expect(planSheets([], 'employees')).toEqual([])
  })
})

describe('which sheets to walk', () => {
  const isHelp = (n: string) => n === 'Read me' || n === 'Fields'
  const book = (name: string, rows: number) => ({ name, rows: Array.from({ length: rows }, () => ({})) })

  it('leaves out help sheets and sheets with headers but no rows, and names them', () => {
    const wb = {
      sheets: [book('Read me', 30), book('Employees', 3), book('Job changes', 0), book('Fields', 90)],
      emptySheets: ['Sheet3'],
    }
    const { sheets, noRows } = usableSheets(wb, isHelp)
    expect(sheets.map((s) => s.name)).toEqual(['Employees'])
    expect(noRows).toEqual(['Job changes', 'Sheet3'])
  })

  it('skips a Lists sheet only beside the template’s Read me or Fields', () => {
    const template = {
      sheets: [book('Read me', 30), book('Employees', 3), book('Lists', 40)],
      emptySheets: [],
    }
    expect(usableSheets(template, isTemplateHelpSheet).sheets.map((s) => s.name)).toEqual(['Employees'])
    const yours = { sheets: [book('Employees', 3), book('Lists', 12)], emptySheets: [] }
    expect(usableSheets(yours, isTemplateHelpSheet).sheets.map((s) => s.name)).toEqual(['Employees', 'Lists'])
  })

  it('finds nothing to walk in a blank template', () => {
    const wb = { sheets: [book('Employees', 0), book('Requisitions', 0)], emptySheets: [] }
    expect(usableSheets(wb, isHelp)).toEqual({ sheets: [], noRows: ['Employees', 'Requisitions'] })
  })

  it('calls an upload not Census data only when every sheet is a weak match', () => {
    expect(isNotCensus([{ reason: 'not-census' }, { reason: 'not-census' }])).toBe(true)
    expect(isNotCensus([{ reason: 'not-census' }, { reason: 'uncertain' }])).toBe(false)
    expect(isNotCensus([])).toBe(false)
  })
})

describe('walking the plan', () => {
  const items = [
    { id: 'a', dataset: 'reviews' as DatasetKey },
    { id: 'b', dataset: null },
    { id: 'c', dataset: 'employees' as DatasetKey },
    { id: 'd', dataset: 'reviews' as DatasetKey },
  ]

  it('goes to a pending Employees sheet first, then in plan order, never to a sheet set to skip', () => {
    expect(nextPending(items, {}, null)).toBe('c')
    expect(nextPending(items, { c: 'applied' }, 'c')).toBe('a')
    expect(nextPending(items, { c: 'applied', a: 'skipped' }, 'a')).toBe('d')
    expect(nextPending(items, { c: 'applied', a: 'applied' }, 'd')).toBeNull()
    expect(pendingImports(items, { c: 'applied' }, 'a').map((i) => i.id)).toEqual(['d'])
    expect(nextPending(items, { a: 'applied', b: 'skipped', c: 'applied', d: 'applied' }, 'd')).toBeNull()
  })

  it('finds other sheets headed for the same dataset', () => {
    expect(sameTarget(items, {}, 'a')).toEqual(['d'])
    expect(sameTarget(items, { d: 'skipped' }, 'a')).toEqual([])
    expect(sameTarget(items, {}, 'b')).toEqual([])
  })

  it('orders Employees first and sheets to skip last, stable otherwise', () => {
    expect(orderPlan(items).map((i) => i.id)).toEqual(['c', 'a', 'd', 'b'])
  })

  it('grades match strength at the documented thresholds', () => {
    expect(matchStrength(0.6)).toBe('strong')
    expect(matchStrength(0.59)).toBe('possible')
    expect(matchStrength(0.35)).toBe('possible')
    expect(matchStrength(0.34)).toBe('weak')
  })
})
