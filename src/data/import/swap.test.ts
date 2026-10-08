import { describe, expect, it } from 'vitest'
import { generateSample } from '../sample'
import { jobLevelsShape, jobLevelsSwapped, swappedText } from './swap'

const flip = <T extends { jobFamily?: string | null; jobFunction?: string | null }>(rows: readonly T[]) =>
  rows.map((r) => ({ jobFamily: r.jobFunction, jobFunction: r.jobFamily }))

describe('jobLevelsSwapped', () => {
  const employees = generateSample().employees

  it('is false on the sample and true on the same rows with the two fields exchanged', () => {
    expect(jobLevelsSwapped(employees)).toBe(null)
    const s = jobLevelsSwapped(flip(employees))
    expect(s).not.toBe(null)
    expect(s?.families).toBeGreaterThan(s?.functions ?? 0)
    expect(s?.familyNest).toBeGreaterThanOrEqual(0.9)
    expect(s?.functionNest).toBeLessThan(0.75)
  })

  it('says what it found', () => {
    const s = jobLevelsSwapped(flip(employees))
    expect(s && swappedText(s)).toBe(
      `These two columns look swapped. In Census a job family contains job functions, but here ${s?.families} job families sit inside ${s?.functions} job functions.`,
    )
  })

  it('is false under 20 rows with both fields', () => {
    const rows = flip(employees).slice(0, 19)
    expect(jobLevelsShape(rows)).toBe(null)
    expect(jobLevelsSwapped(rows)).toBe(null)
    const blanks = [...rows, ...Array.from({ length: 30 }, () => ({ jobFamily: 'A', jobFunction: '' }))]
    expect(jobLevelsSwapped(blanks)).toBe(null)
  })

  it('is false for one-to-one data', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      jobFamily: `F${i % 12}`,
      jobFunction: `P${i % 12}`,
    }))
    expect(jobLevelsSwapped(rows)).toBe(null)
  })

  it('reads a file whose Job family holds disciplines and Job function holds broad groups', () => {
    const disciplines = Array.from({ length: 34 }, (_, i) => `Discipline ${i}`)
    const broad = ['Engineering', 'Operations', 'Sales & marketing', 'G&A', 'Executive']
    const rows = disciplines.flatMap((d, i) =>
      Array.from({ length: 3 }, () => ({ jobFamily: d, jobFunction: broad[i % broad.length] })),
    )
    const s = jobLevelsSwapped(rows)
    expect(s?.families).toBe(34)
    expect(s?.functions).toBe(5)
  })
})
