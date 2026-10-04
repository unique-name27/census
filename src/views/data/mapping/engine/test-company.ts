/**
 * A small company with every kind of disagreement the tab looks for, for the engine tests.
 */
import { emp, emptyDatasets, req } from '@/data/quality/test-fixtures'
import type { Datasets } from '@/data/schema'

export const AS_OF = '2026-09-30'

export function messyCompany(): Datasets {
  const d = emptyDatasets()
  d.employees = [
    // 0: the leader of Silicon (E1), Design Verification
    emp(1, {
      level: 'E1',
      businessUnit: 'Silicon',
      department: 'Design Verification',
      jobTitle: 'VP Silicon',
    }),
    // 1-3: Design Verification under Silicon
    emp(2, { businessUnit: 'Silicon', department: 'Design Verification', level: 'L3' }),
    emp(3, { businessUnit: 'Silicon', department: 'Design Verification', level: 'L4' }),
    emp(4, {
      businessUnit: 'Silicon',
      department: 'Design Verification',
      level: 'L4',
      employmentType: 'Contractor',
    }),
    // 4: Design Verification under Systems: the department sits under two units
    emp(5, { businessUnit: 'Systems', department: 'Design Verification', level: 'L3', managerId: 'E001' }),
    // 5-6: Firmware under Systems, function Operations for one of them
    emp(6, {
      businessUnit: 'Systems',
      department: 'Firmware',
      jobFamily: 'Firmware',
      jobFunction: 'Engineering',
      location: 'Bengaluru',
      country: 'India',
      costCenter: 'CC-200',
    }),
    emp(7, {
      businessUnit: 'Systems',
      department: 'Firmware',
      jobFamily: 'Firmware',
      jobFunction: 'Operations',
      location: 'Bengaluru',
      country: 'India',
      managerId: 'E006',
    }),
    // 7: Facilities with no business unit, no job family and an unknown location
    emp(8, {
      businessUnit: '',
      department: 'Facilities',
      jobFamily: null,
      jobFunction: null,
      location: 'Atlantis',
      country: 'Nowhere',
    }),
    // 8: left before the as-of date: not counted anywhere
    emp(9, { businessUnit: 'Silicon', department: 'Design Verification', terminationDate: '2026-01-31' }),
  ]
  d.requisitions = [
    req(1, { businessUnit: 'Silicon', department: 'Design Verification' }),
    req(2, { businessUnit: 'Silicon', department: 'DV', status: 'Open' }),
    req(3, { businessUnit: 'Silicon', department: 'DV', status: 'Filled' }),
  ]
  return d
}
