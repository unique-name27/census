import { describe, expect, it } from 'vitest'
import { emp, leaver, many, prepOf } from './fixtures'
import { computeWorkforce, LAST_YEAR, YEAR_BEFORE } from './workforce'

describe('computeWorkforce', () => {
  const people = [
    ...many(20, { location: 'San Jose', hireDate: '2020-01-06' }),
    ...many(5, { location: 'Bengaluru', hireDate: '2026-02-02' }),
    emp({ location: 'Bengaluru', employmentType: 'Contractor' }),
    emp({ location: 'Bengaluru', employmentType: 'Contractor' }),
    emp({ location: 'San Jose', employmentType: 'Intern', hireDate: '2026-06-01' }),
    leaver('2025-12-01', 'Voluntary', { location: 'San Jose' }),
  ]
  const wf = computeWorkforce(prepOf({ employees: people }))

  it('draws the year before on the same months as the last 12, both 13 points long', () => {
    const before = wf.overlay.filter((r) => r.period === YEAR_BEFORE)
    const last = wf.overlay.filter((r) => r.period === LAST_YEAR)
    expect(before).toHaveLength(13)
    expect(last).toHaveLength(13)
    expect(before[0]).toMatchObject({ x: '2025-09-30', date: '2024-09-30' })
    expect(before.at(-1)).toMatchObject({ x: '2026-09-30', date: '2025-09-30' })
    expect(last[0]).toMatchObject({ x: '2025-09-30', date: '2025-09-30' })
    expect(last.at(-1)).toMatchObject({ x: '2026-09-30', headcount: 25 })
    // A year earlier on the same axis point: 21 people on 30 Sep 2025 (the leaver was still here).
    expect(before.at(-1)!.headcount).toBe(21)
    // February month ends stay month ends when moved forward.
    expect(before.find((r) => r.date === '2025-02-28')!.x).toBe('2026-02-28')
  })

  it('counts contractors and interns by site, sites with the most first', () => {
    const rows = wf.mix.location
    expect(rows[0].group).toBe('Bengaluru')
    const cell = (g: string, t: string) => rows.find((r) => r.group === g && r.workerType === t)!
    expect(cell('Bengaluru', 'Contractors')).toMatchObject({ people: 2 })
    expect(cell('Bengaluru', 'Contractors').share).toBeCloseTo(2 / 7, 10)
    expect(cell('San Jose', 'Interns')).toMatchObject({ people: 1 })
    expect(cell('San Jose', 'Employees')).toMatchObject({ people: 20 })
    expect(wf.mix.businessUnit.every((r) => r.group === 'Silicon Engineering')).toBe(true)
  })
})
