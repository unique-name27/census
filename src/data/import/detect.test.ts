import { describe, expect, it } from 'vitest'
import { DATASETS } from '../schema'
import { guessDataset, isTemplateHelpSheet } from './detect'
import type { ParsedSheet } from './types'

const sheet = (name: string, headers: string[], rows: Record<string, unknown>[] = []): ParsedSheet => ({
  name,
  headerRow: 0,
  headers,
  rows,
  rowNumbers: rows.map((_, i) => i + 2),
})

describe('guessDataset', () => {
  it.each(DATASETS.map((d) => [d.key, d] as const))(
    'recognizes a %s sheet by its columns alone',
    (key, def) => {
      const guesses = guessDataset(
        sheet(
          'Sheet1',
          def.fields.map((f) => f.label),
        ),
      )
      expect(guesses[0].key).toBe(key)
      expect(guesses[0].confidence).toBeGreaterThan(0.6)
      expect(guesses[0].missingRequired).toEqual([])
      expect(guesses[0].confidence).toBeGreaterThan(guesses[1].confidence)
      expect(guesses).toHaveLength(DATASETS.length)
    },
  )

  it('recognizes a Greenhouse export', () => {
    const g = guessDataset(
      sheet('Export', [
        'Candidate Name',
        'Job',
        'Current Stage',
        'Status',
        'Source',
        'Applied At',
        'Rejected At',
        'Hired At',
        'Hiring Manager',
      ]),
    )
    expect(g[0].key).toBe('candidates')
    expect(g[0].missingRequired).toEqual(['applicationId'])
  })

  it('recognizes a Workday roster', () => {
    const g = guessDataset(
      sheet('Workers', [
        'Employee Number',
        'Full Name',
        'Business Title',
        'Supervisory Organization',
        'Work Location',
        'Management Level',
        'Manager Employee ID',
        'Original Hire Date',
        'Termination Date',
        'Termination Category',
        'Regrettable',
      ]),
    )
    expect(g[0].key).toBe('employees')
    expect(g[0].matched).toBe(11)
  })

  it('uses the sheet name to break near ties', () => {
    const headers = ['Employee ID', 'Effective date']
    expect(guessDataset(sheet('Promotions', headers))[0].key).toBe('jobChanges')
    const conf = (name: string) =>
      guessDataset(sheet(name, headers)).find((g) => g.key === 'transactions')!.confidence
    expect(conf('HR actions')).toBeCloseTo(conf('Sheet1') + 0.2)
    expect(conf('Transactions 2026')).toBeCloseTo(conf('Sheet1') + 0.1)
  })

  it('scores unrelated sheets low', () => {
    const g = guessDataset(sheet('Budget', ['Account', 'FY26 plan', 'FY26 actual', 'Variance']))
    expect(g[0].confidence).toBeLessThan(0.35)
  })

  it('ignores the template help sheets', () => {
    expect(isTemplateHelpSheet('Read me')).toBe(true)
    expect(isTemplateHelpSheet('fields')).toBe(true)
    expect(isTemplateHelpSheet('Employees')).toBe(false)
    const g = guessDataset(
      sheet('Fields', [
        'Sheet',
        'Column',
        'Requirement',
        'Type',
        'Allowed values',
        'Description',
        'Pay amount',
      ]),
    )
    expect(g.every((x) => x.confidence === 0)).toBe(true)
  })
})
