import { describe, expect, it } from 'vitest'
import { computeQuality } from '@/data/quality/compute'
import { emptyDatasets, roster } from '@/data/quality/test-fixtures'
import type { CompRecord, Datasets, HrCase } from '@/data/schema'
import {
  excludedText,
  fieldLeftOutText,
  PERIOD_RULES,
  partFields,
  partRows,
  periodTestOf,
  refsByDataset,
  rowReasonText,
  rowsLeftOut,
  usedText,
} from './leftOut'
import { AS_OF } from './test-fixtures'

/** 40 people: leavers 31-40, three of them with no reason; person 5 and 6 at an unknown level. */
function company(): Datasets {
  const employees = roster().map((e, i) => {
    if (i >= 37) return { ...e, terminationReason: null }
    if (i === 4 || i === 5) return { ...e, level: 'Q9' as never }
    return e
  })
  const comp: CompRecord[] = employees.slice(0, 4).map((e, i) => ({
    employeeId: e.employeeId,
    currency: 'USD',
    baseSalary: 100_000,
    rangeMin: 80_000,
    rangeMid: 100_000,
    rangeMax: 120_000,
    fxToUsd: 1,
    // Blank merit is normal (not in the cycle), so it is never a gap.
    meritPct: i === 0 ? null : 0.03,
  }))
  return { ...emptyDatasets(), employees, comp }
}

const quality = (data = company()) => computeQuality(data, {}, undefined, { asOf: AS_OF })
const WINDOW = { start: '2025-10-01', end: '2026-09-30' }

describe('the gaps under a number', () => {
  it('counts rows a field applies to, and the rows with a blank or a value not recognized', () => {
    const out = rowsLeftOut(quality(), ['employees.terminationReason', 'employees.level'])
    expect(out.parts).toHaveLength(1)
    const p = out.parts[0]
    expect(p.dataset).toBe('employees')
    // Level applies to everyone, so all 40 rows count.
    expect(p.considered).toBe(40)
    expect(p.gaps).toBe(5)
    expect(p.complete).toBe(35)
    expect(p.rows).toEqual([4, 5, 37, 38, 39])
    expect(p.fields).toEqual([
      { ref: 'employees.terminationReason', label: 'Termination reason', blank: 3, invalid: 0 },
      { ref: 'employees.level', label: 'Level', blank: 0, invalid: 2 },
    ])
    expect(rowReasonText(p.reasons.get(38) ?? [])).toBe('No termination reason')
    expect(rowReasonText(p.reasons.get(4) ?? [])).toBe('Level not recognized')
    expect(out).toMatchObject({ considered: 40, gaps: 5 })
  })

  it('calls no row left out when the number does not say which fields it requires', () => {
    const out = rowsLeftOut(quality(), ['employees.terminationReason', 'employees.level'])
    expect(out.leftOut).toBeNull()
    expect(out.parts[0]).toMatchObject({ leftOut: null, used: null, leftOutRows: [] })
    expect(usedText(out.parts[0])).toBe('35 of 40 rows complete')
  })

  it('leaves a row out only for a gap in a field the number requires, never for a side field', () => {
    // Attrition by reason needs the level to place a person; the reason only labels a bar.
    const out = rowsLeftOut(quality(), ['employees.terminationReason', 'employees.level'], {
      requires: ['employees.level'],
    })
    const p = out.parts[0]
    expect(p.leftOut).toBe(2)
    expect(p.used).toBe(38)
    expect(p.leftOutRows).toEqual([4, 5])
    expect(out.leftOut).toBe(2)
    expect(usedText(p)).toBe('38 of 40 rows used')
    // The three leavers with no reason are counted, under Other: kept with a gap, not left out.
    expect(partRows(p, 'kept')).toEqual([37, 38, 39])
    expect(partFields(p, 'leftOut')).toEqual([
      { ref: 'employees.level', label: 'Level', blank: 0, invalid: 2, required: true },
    ])
    expect(partFields(p, 'kept')).toEqual([
      {
        ref: 'employees.terminationReason',
        label: 'Termination reason',
        blank: 3,
        invalid: 0,
        required: false,
      },
    ])
    // A number that reads only the side field leaves nothing out.
    const reasonOnly = rowsLeftOut(quality(), ['employees.terminationReason'], { requires: [] }).parts[0]
    expect(reasonOnly).toMatchObject({ leftOut: 0, used: 10, gaps: 3 })
  })

  it('only counts the rows a field applies to', () => {
    const p = rowsLeftOut(quality(), ['employees.terminationReason']).parts[0]
    expect(p.considered).toBe(10)
    expect(p.gaps).toBe(3)
    expect(usedText(p)).toBe('7 of 10 rows complete')
  })

  it('never counts a blank that is normal as a gap', () => {
    const p = rowsLeftOut(quality(), ['comp.meritPct', 'comp.baseSalary']).parts[0]
    expect(p).toMatchObject({ dataset: 'comp', considered: 4, complete: 4, gaps: 0, rows: [] })
  })

  it('keeps to the rows in scope', () => {
    const inScope = (key: string) => (key === 'employees' ? (i: number) => i >= 30 : null)
    const p = rowsLeftOut(quality(), ['employees.terminationReason', 'employees.level'], inScope).parts[0]
    expect(p.considered).toBe(10)
    expect(p.rows).toEqual([37, 38, 39])
    expect(p.fields).toEqual([
      { ref: 'employees.terminationReason', label: 'Termination reason', blank: 3, invalid: 0 },
    ])
  })

  it('keeps to the period, and counts the gaps outside it apart', () => {
    // The three leavers with no reason left in 2024, before the last 12 months.
    const data = company()
    data.employees = data.employees.map((e, i) => (i >= 37 ? { ...e, terminationDate: '2024-03-31' } : e))
    const q = quality(data)
    const p = rowsLeftOut(q, ['employees.terminationReason'], {
      inPeriod: periodTestOf(data, WINDOW),
    }).parts[0]
    expect(p).toMatchObject({ considered: 7, gaps: 0, complete: 7, inPeriod: true, rows: [] })
    expect(p.outside).toEqual([37, 38, 39])
    expect(partRows(p, 'outside')).toEqual([37, 38, 39])
    expect(partFields(p, 'outside')).toEqual([
      { ref: 'employees.terminationReason', label: 'Termination reason', blank: 3, invalid: 0 },
    ])
    expect(usedText(p)).toBe('7 of 7 rows in the period complete')
    // Without the period every leaver counts again.
    expect(rowsLeftOut(q, ['employees.terminationReason']).parts[0].gaps).toBe(3)
  })

  it('places rows in the period by their dates, and leaves snapshots whole', () => {
    const test = periodTestOf(company(), WINDOW)
    expect(test('comp')).toBeNull()
    expect(test('reviews')).toBeNull()
    const caseRule = PERIOD_RULES.cases!
    const c = (openedAt: string, resolvedAt: string | null) =>
      ({ openedAt, resolvedAt }) as Partial<HrCase> as Record<string, unknown>
    expect(caseRule(c('2025-06-01T09:00', '2025-07-01T09:00'), WINDOW)).toBe(false)
    expect(caseRule(c('2025-06-01T09:00', null), WINDOW)).toBe(true)
    expect(caseRule(c('2025-09-20T09:00', '2025-10-02T10:00'), WINDOW)).toBe(true)
    expect(caseRule(c('2026-10-02T09:00', null), WINDOW)).toBe(false)
    // A person employed at any point in the window; no hire date still shows its gaps.
    expect(PERIOD_RULES.employees!({ hireDate: '2020-01-01', terminationDate: '2025-09-30' }, WINDOW)).toBe(
      false,
    )
    expect(PERIOD_RULES.employees!({ hireDate: null, terminationDate: null }, WINDOW)).toBe(true)
  })

  it('gives one part per dataset in the order the fields name them, ignoring unknown fields', () => {
    const out = rowsLeftOut(quality(), [
      'comp.baseSalary',
      'employees.level',
      'employees.nope',
      'comp.baseSalary',
    ])
    expect(out.parts.map((p) => p.dataset)).toEqual(['comp', 'employees'])
    expect(out.gaps).toBe(2)
    expect(rowsLeftOut(quality(), undefined).parts).toEqual([])
    expect([...refsByDataset(['comp.baseSalary', 'comp.baseSalary', 'x.y']).entries()]).toEqual([
      ['comp', ['comp.baseSalary']],
    ])
  })

  it('agrees with the quality index’s own counts', () => {
    const q = quality()
    const s = q.fieldStats('employees.terminationReason')
    const p = rowsLeftOut(q, ['employees.terminationReason']).parts[0]
    expect(p.gaps).toBe(s.blank + s.invalid)
    expect(p.considered).toBe(s.applicableRows)
  })
})

describe('gap wording', () => {
  it('says what the gaps are, field by field', () => {
    expect(fieldLeftOutText({ label: 'Level', blank: 38, invalid: 2 })).toEqual([
      '38 with no level',
      '2 with level not recognized',
    ])
    const fields = [
      { ref: 'employees.terminationType' as const, label: 'Termination type', blank: 38, invalid: 0 },
      { ref: 'employees.level' as const, label: 'Level', blank: 0, invalid: 2 },
    ]
    expect(excludedText(fields)).toBe('38 with no termination type and 2 with level not recognized')
    expect(excludedText([])).toBe('')
    expect(
      excludedText(
        [
          { ref: 'employees.level', label: 'Level', blank: 1, invalid: 2 },
          { ref: 'employees.department', label: 'Department', blank: 3, invalid: 4 },
        ],
        2,
      ),
    ).toBe('1 with no level, 2 with level not recognized and 2 more reasons')
    expect(usedText({ used: 1410, complete: 1400, considered: 1450 })).toBe('1,410 of 1,450 rows used')
    expect(usedText({ used: null, complete: 1400, considered: 1450, inPeriod: true })).toBe(
      '1,400 of 1,450 rows in the period complete',
    )
  })
})
