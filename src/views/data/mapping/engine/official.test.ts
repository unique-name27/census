import { describe, expect, it } from 'vitest'
import { applyReferenceMappings, inferStructure } from '@/data/reference'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import {
  jobConflicts,
  type OfficialParents,
  officialConflicts,
  orgConflicts,
  withOfficialParents,
} from './conflicts'
import { unlistedValues } from './lists'
import { AS_OF, messyCompany } from './test-company'

const data = messyCompany()
const report = inferStructure(data, { asOf: AS_OF })
const parents: OfficialParents = {
  department: new Map([
    ['Design Verification', 'Silicon'],
    ['Firmware', 'Silicon'],
  ]),
  jobFamily: new Map([['Firmware', 'Engineering']]),
}

describe('official parents in Categories & mapping', () => {
  it('flag rows under a parent other than the official one, with a one-step fix', () => {
    const found = officialConflicts(report, parents, data.employees)
    expect(found.map((c) => c.text)).toEqual([
      'Firmware sits under Systems for 2 people; its official business unit is Silicon.',
      'Design Verification sits under Systems for 1 person; its official business unit is Silicon.',
      'Firmware sits under Operations for 1 person; its official job function is Engineering.',
    ])
    const dv = found[1]
    expect(dv).toMatchObject({
      kind: 'department-official-unit',
      section: 'org',
      severity: 'warning',
      rows: [4],
      direct: true,
      fixLabel: 'Move to Silicon',
      fix: { kind: 'move-department', department: 'Design Verification', from: 'Systems', to: 'Silicon' },
    })
    // The fix moves exactly those rows: applied, nothing is left to flag for the department.
    const fixed = applyReferenceMappings(data, [
      {
        id: 'm1',
        by: null,
        at: '2026-10-01T00:00:00Z',
        ...(dv.fix as { kind: 'move-department'; department: string; from: string; to: string }),
      },
    ])
    const after = officialConflicts(
      inferStructure(fixed.datasets, { asOf: AS_OF }),
      parents,
      fixed.datasets.employees,
    )
    expect(after.some((c) => c.id.startsWith('dept-official:Design Verification'))).toBe(false)
  })

  it('replace "under several units" for a department with an official parent, and keep the rest', () => {
    const plain = orgConflicts(report)
    expect(plain.some((c) => c.id === 'dept-units:Design Verification')).toBe(true)
    const merged = withOfficialParents(
      plain,
      officialConflicts(report, parents, data.employees),
      parents,
      'org',
    )
    expect(merged.some((c) => c.id === 'dept-units:Design Verification')).toBe(false)
    expect(merged[0].kind).toBe('department-official-unit')
    // Conflicts the lists say nothing about stay.
    expect(merged.some((c) => c.kind === 'department-no-unit')).toBe(true)
    const jobs = withOfficialParents(
      jobConflicts(report, data.employees),
      officialConflicts(report, parents, data.employees),
      parents,
      'job',
    )
    expect(jobs.some((c) => c.kind === 'family-several-functions')).toBe(false)
    expect(jobs[0].kind).toBe('family-official-function')
  })

  it('find nothing on the sample company with its shipped lists', () => {
    const sample = generateSample()
    const r = inferStructure(sample, { asOf: SAMPLE_AS_OF })
    const dept = new Map<string, string>()
    for (const e of r.org) if (e.department && e.businessUnit) dept.set(e.department, e.businessUnit)
    expect(officialConflicts(r, { department: dept, jobFamily: new Map() }, sample.employees)).toEqual([])
  })

  it('check category values against an official list when one is given', () => {
    const inv = inferStructure(data, {
      asOf: AS_OF,
      categories: ['department'],
      vocab: { department: ['Design Verification', 'Firmware', 'Facilities'] },
    }).categories
    const off = unlistedValues(inv)
    expect(off.map((u) => [u.ref, u.value, u.count, u.suggestion])).toEqual([
      ['requisitions.department', 'DV', 2, 'Design Verification'],
    ])
    expect(inv[0].vocab).toEqual(['Design Verification', 'Firmware', 'Facilities'])
  })
})
