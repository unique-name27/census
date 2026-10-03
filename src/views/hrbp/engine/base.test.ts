import { describe, expect, it } from 'vitest'
import { buildHistory, isMaterialGap, listJoin, monthEnds, nameList, quarterBlocks, trailing } from './base'
import { change, emp } from './fixtures'

describe('windows', () => {
  it('trailing 12 months from a month end is whole calendar months', () => {
    expect(trailing('2026-09-30', 12)).toMatchObject({ start: '2025-10-01', end: '2026-09-30', months: 12 })
    expect(trailing('2026-09-30', 6)).toMatchObject({ start: '2026-04-01', end: '2026-09-30', months: 6 })
  })

  it('quarter blocks are calendar quarters, oldest first, when asOf is a quarter end', () => {
    const q = quarterBlocks('2026-09-30', 8)
    expect(q).toHaveLength(8)
    expect(q[0]).toMatchObject({ start: '2024-10-01', end: '2024-12-31', label: '2024 Q4', months: 3 })
    expect(q[7]).toMatchObject({ start: '2026-07-01', end: '2026-09-30', label: '2026 Q3' })
    for (let i = 1; i < q.length; i++) expect(q[i].start > q[i - 1].end).toBe(true)
  })

  it('quarter blocks off a quarter end get month-range labels', () => {
    const q = quarterBlocks('2026-08-31', 2)
    expect(q[1]).toMatchObject({ start: '2026-06-01', end: '2026-08-31' })
    expect(q[1].label).toBe("Jun–Aug '26")
  })

  it('month ends end on asOf', () => {
    const pts = monthEnds('2026-09-30', 25)
    expect(pts).toHaveLength(25)
    expect(pts[0]).toBe('2024-09-30')
    expect(pts[24]).toBe('2026-09-30')
  })
})

describe('isMaterialGap (floor from the earlier HRBP dashboard)', () => {
  it('needs |Δ| ≥ 2% of the reference + 0.15 pts', () => {
    // reference 10%: floor = 0.002 + 0.0015 = 0.0035
    expect(isMaterialGap(0.0034, 0.1)).toBe(false)
    expect(isMaterialGap(0.0036, 0.1)).toBe(true)
    expect(isMaterialGap(-0.0036, 0.1)).toBe(true)
  })
  it('is false for missing values', () => {
    expect(isMaterialGap(null, 0.1)).toBe(false)
    expect(isMaterialGap(Number.NaN, 0.1)).toBe(false)
  })
})

describe('buildHistory', () => {
  const e = emp({ employeeId: 'H1', level: 'L5', department: 'Firmware', hireDate: '2019-01-07' })
  const h = buildHistory([
    change({
      employeeId: 'H1',
      effectiveDate: '2022-03-01',
      changeType: 'Promotion',
      fromLevel: 'L3',
      toLevel: 'L4',
    }),
    change({
      employeeId: 'H1',
      effectiveDate: '2025-03-01',
      changeType: 'Promotion',
      fromLevel: 'L4',
      toLevel: 'L5',
    }),
    change({
      employeeId: 'H1',
      effectiveDate: '2024-06-03',
      changeType: 'Transfer',
      fromDepartment: 'Software',
      toDepartment: 'Firmware',
    }),
  ])

  it('rebuilds the level held on a date from later level changes', () => {
    expect(h.levelAt(e, '2021-12-31')).toBe('L3')
    expect(h.levelAt(e, '2022-03-01')).toBe('L4')
    expect(h.levelAt(e, '2025-02-28')).toBe('L4')
    expect(h.levelAt(e, '2026-09-30')).toBe('L5')
  })

  it('rebuilds the department on a date from transfers', () => {
    expect(h.deptAt(e, '2024-01-01')).toBe('Software')
    expect(h.deptAt(e, '2024-06-03')).toBe('Firmware')
  })

  it('finds the latest promotion on or before a date', () => {
    expect(h.lastPromotion('H1', '2026-09-30')).toBe('2025-03-01')
    expect(h.lastPromotion('H1', '2023-01-01')).toBe('2022-03-01')
    expect(h.lastPromotion('H1', '2020-01-01')).toBeNull()
    expect(h.lastPromotion('nobody', '2026-09-30')).toBeNull()
  })

  it('records a move from an individual level into management', () => {
    const m = buildHistory([
      change({
        employeeId: 'M1',
        effectiveDate: '2026-03-01',
        changeType: 'Promotion',
        fromLevel: 'L6',
        toLevel: 'M1',
      }),
    ])
    expect(m.becameManager('M1')).toBe('2026-03-01')
    expect(h.becameManager('H1')).toBeNull()
  })
})

describe('copy helpers', () => {
  it('joins with commas and "and"', () => {
    expect(listJoin(['A'])).toBe('A')
    expect(listJoin(['A', 'B'])).toBe('A and B')
    expect(listJoin(['A', 'B', 'C'])).toBe('A, B and C')
  })
  it('names at most N, then "and N more"', () => {
    expect(nameList(['A', 'B', 'C', 'D'], 2)).toBe('A, B and 2 more')
    expect(nameList(['A', 'B'], 2)).toBe('A and B')
  })
})
