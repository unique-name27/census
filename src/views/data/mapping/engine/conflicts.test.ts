import { describe, expect, it } from 'vitest'
import { inferStructure } from '@/data/reference'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { closestValue, countByKind, jobConflicts, listText, orgConflicts } from './conflicts'
import { AS_OF, messyCompany } from './test-company'

const data = messyCompany()
const report = inferStructure(data, { asOf: AS_OF })

describe('closestValue', () => {
  const depts = ['Design Verification', 'Digital Design', 'Firmware', 'Facilities', 'Supply Chain']

  it('matches initials, prefixes, case and shared words', () => {
    expect(closestValue('DV', depts)).toBe('Design Verification')
    expect(closestValue('design verification', depts)).toBe('Design Verification')
    expect(closestValue('Design verif.', depts)).toBe('Design Verification')
    expect(closestValue('Supply chain & logistics', depts)).toBe('Supply Chain')
  })

  it('matches a value that contains every word of one candidate, or the same stem', () => {
    const sources = ['Referral', 'Sourced', 'Careers site', 'Job board', 'Agency', 'University', 'Internal']
    expect(closestValue('Third-party agency', sources)).toBe('Agency')
    expect(closestValue('Referred by employee', sources)).toBe('Referral')
    expect(closestValue('Indeed', sources)).toBeNull()
    expect(closestValue('Northgate careers page', sources)).toBeNull()
  })

  it('returns null when nothing is close or the match is ambiguous', () => {
    expect(closestValue('Legal', depts)).toBeNull()
    expect(closestValue('D', depts)).toBeNull()
    expect(closestValue('', depts)).toBeNull()
  })

  it('never offers the value itself', () => {
    expect(closestValue('Firmware', depts)).toBeNull()
  })
})

describe('listText', () => {
  it('joins with commas and a final and', () => {
    expect(listText(['A'])).toBe('A')
    expect(listText(['A', 'B', 'C'])).toBe('A, B and C')
  })
})

describe('orgConflicts', () => {
  const conflicts = orgConflicts(report)
  const byKind = (k: string) => conflicts.filter((c) => c.kind === k)

  it('flags a department under several units with a move to its main unit', () => {
    const [c] = byKind('department-several-units')
    expect(c.text).toBe(
      'Design Verification appears under 2 business units: Silicon (3 people) and Systems (1 person).',
    )
    // The contractor in Silicon is left out, as in the diagram and the table.
    expect(c.count).toBe(4)
    expect(c.rows).toEqual([0, 1, 2, 4])
    expect(c.fix).toEqual({
      kind: 'move-department',
      department: 'Design Verification',
      from: 'Systems',
      to: 'Silicon',
    })
    expect(c.severity).toBe('warning')
  })

  it('flags a department with no unit and offers the unit to choose', () => {
    const [c] = byKind('department-no-unit')
    expect(c.text).toBe('Facilities has no business unit for 1 person.')
    expect(c.fix).toEqual({ kind: 'move-department', department: 'Facilities', from: null, to: '' })
    expect(c.fixLabel).toBe('Choose a business unit')
  })

  it('flags requisition departments missing from the roster with a likely merge', () => {
    const [c] = byKind('req-department-missing')
    expect(c.dataset).toBe('requisitions')
    expect(c.text).toBe(
      '2 requisitions (1 open) name DV in Silicon, a department with no active people in Employees.',
    )
    expect(c.rows).toEqual([1, 2])
    expect(c.fix).toEqual({
      kind: 'merge',
      ref: 'requisitions.department',
      from: ['DV'],
      to: 'Design Verification',
    })
  })
})

describe('jobConflicts', () => {
  const conflicts = jobConflicts(report, data.employees)

  it('flags a family under several functions and people with no family', () => {
    expect(countByKind(conflicts)).toEqual({ 'family-several-functions': 1, 'people-no-family': 1 })
    const fam = conflicts.find((c) => c.kind === 'family-several-functions')!
    expect(fam.text).toBe(
      'Firmware appears under 2 job functions: Engineering (1 person) and Operations (1 person).',
    )
    expect(fam.fix).toEqual({ kind: 'move-family', jobFamily: 'Firmware', from: null, to: 'Engineering' })
    const none = conflicts.find((c) => c.kind === 'people-no-family')!
    expect(none.rows).toEqual([7])
    expect(none.fix).toBeNull()
  })

  it('flags families with no function when the data has none', () => {
    const d = messyCompany()
    d.employees = d.employees.map((e) => ({ ...e, jobFunction: null }))
    const cs = jobConflicts(inferStructure(d, { asOf: AS_OF }), d.employees)
    const c = cs.find((x) => x.kind === 'family-no-function')!
    expect(c.text).toBe('2 job families have no job function (6 people).')
    expect(c.rows).not.toContain(3)
    expect(c.fix).toMatchObject({ kind: 'move-family', jobFamily: 'Design Verification', to: '' })
  })
})

describe('on the sample company', () => {
  const sample = generateSample()
  const r = inferStructure(sample, { asOf: SAMPLE_AS_OF })
  const all = [...orgConflicts(r), ...jobConflicts(r, sample.employees)]

  it('reports conflicts with counts that match their rows, all of them employees', () => {
    for (const c of all) {
      expect(c.count).toBe(c.rows.length)
      expect(c.text).not.toMatch(/—/)
      if (c.dataset === 'employees')
        for (const i of c.rows) expect(sample.employees[i].employmentType).toBe('Employee')
    }
  })

  it('flags a handful of level outliers, not every end of a career ladder', () => {
    const outliers = all.filter((c) => c.kind === 'title-level-outlier')
    expect(outliers.length).toBeLessThanOrEqual(5)
    // Directors sit one rung above managers: the same track, not an outlier.
    expect(outliers.some((c) => c.text.startsWith('Director'))).toBe(false)
    // A large family's entry-level associates sit at the bottom of a normal ladder.
    expect(outliers.some((c) => c.text.startsWith('Associate Design Verification Engineer'))).toBe(false)
  })
})
