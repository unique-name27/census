import { describe, expect, it } from 'vitest'
import type { RuleResult } from '@/data/quality/types'
import { fixRows, withDrillRows } from './checks'

const rule = (patch: Partial<RuleResult> & Pick<RuleResult, 'id'>): RuleResult => ({
  label: patch.id,
  pass: true,
  detail: '',
  gate: 'silver',
  count: 0,
  rows: [],
  ...patch,
})

const index = (rules: RuleResult[]) => ({ checks: () => rules })

describe('rule results with the rows behind them', () => {
  it('takes the rows the drill index finds, and keeps the verdict and count of the index in force', () => {
    // The index in force has no import log: 4 rows had an import error, none named.
    const q = index([
      rule({ id: 'issue-rate', pass: false, count: 4 }),
      rule({ id: 'references', pass: true }),
      rule({ id: 'fresh', gate: 'gold' }),
    ])
    // The drill index has the log (3 of the 4 rows are still loaded) and allows no problems.
    const drillQ = index([
      rule({ id: 'issue-rate', pass: false, count: 4, rows: [2, 5, 9] }),
      rule({ id: 'references', pass: false, count: 2, rows: [7, 8] }),
      rule({ id: 'fresh', gate: 'gold' }),
    ])
    const out = withDrillRows(q, drillQ, 'employees')
    expect(out.map((r) => [r.id, r.pass, r.count, r.rows])).toEqual([
      // Failing: its count stands (one of the rows was skipped at import).
      ['issue-rate', false, 4, [2, 5, 9]],
      // Passing within the share allowed: it still names its rows, and counts them.
      ['references', true, 2, [7, 8]],
      ['fresh', true, 0, []],
    ])
  })

  it('leaves a rule alone when the drill index finds the same rows or none', () => {
    const same = rule({ id: 'references', pass: false, count: 1, rows: [3] })
    const out = withDrillRows(index([same]), index([{ ...same }]), 'cases')
    expect(out[0]).toBe(same)
  })

  it('lists each row behind a fix once, and counts the rows that are not loaded', () => {
    expect(
      fixRows([
        { rows: [2, 5, 9], count: 4 },
        { rows: [5, 7], count: 2 },
      ]),
    ).toEqual({ indexes: [2, 5, 7, 9], notLoaded: 1 })
  })
})
