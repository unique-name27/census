/**
 * The region scope's owner (docs/ACTION-CENTER-AUDIT.md 5.8): the regional HR business partner the
 * Regions list names, matched on the roster by employee ID or name, carried on the scope and read
 * as the Action center's "me" in HRBP for a region mode.
 */
import { describe, expect, it } from 'vitest'
import { EMPTY_LISTS } from '@/data/lists/edit'
import type { SourceKinds } from '@/data/lists/effective'
import { regionOwners } from '@/data/lists/regions'
import { cachedSample } from '@/data/sample'
import { DATASET_KEYS, type Employee } from '@/data/schema'
import { buildOrgIndex } from '@/data/scope'
import { accessFor } from '../context'
import { lensOf } from '../items'
import { scopeFor } from './index'
import { regionOwnerOf, regionScope } from './region'
import { regionIndex } from './regions'

const AS_OF = '2026-09-30'
const SAMPLE = Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample' }])) as SourceKinds

const person = (employeeId: string, name: string, extra: Partial<Employee> = {}): Employee => ({
  employeeId,
  name,
  jobTitle: 'HR Business Partner',
  businessUnit: 'Corporate',
  department: 'People',
  location: 'Hsinchu',
  country: 'Taiwan',
  level: 'L5',
  managerId: null,
  hireDate: '2020-01-06',
  terminationDate: null,
  terminationType: null,
  terminationReason: null,
  regrettable: null,
  employmentType: 'Employee',
  ...extra,
})

describe('regionOwnerOf', () => {
  const roster = [
    person('E1', 'Ya-Wen Chang'),
    person('E2', 'Sam Lee'),
    person('E3', 'Sam Lee', { terminationDate: '2025-01-31' }),
    person('E4', 'Kim Park'),
    person('E5', 'Kim Park'),
  ]

  it('matches an employee ID, then a name (case and spacing aside)', () => {
    expect(regionOwnerOf('E1', roster, AS_OF)).toEqual({ name: 'Ya-Wen Chang', id: 'E1' })
    expect(regionOwnerOf('  ya-wen   chang ', roster, AS_OF)).toEqual({ name: 'Ya-Wen Chang', id: 'E1' })
  })

  it('takes the active one of two people with the name, and no ID when two are active', () => {
    expect(regionOwnerOf('Sam Lee', roster, AS_OF)).toEqual({ name: 'Sam Lee', id: 'E2' })
    expect(regionOwnerOf('Kim Park', roster, AS_OF)).toEqual({ name: 'Kim Park', id: null })
  })

  it('keeps a name nobody on the roster has, and names nobody for a blank', () => {
    expect(regionOwnerOf('Alex Moreau', roster, AS_OF)).toEqual({ name: 'Alex Moreau', id: null })
    expect(regionOwnerOf('  ', roster, AS_OF)).toBeNull()
    expect(regionOwnerOf(null, roster, AS_OF)).toBeNull()
  })
})

describe('the region scope on the sample', () => {
  const all = cachedSample()
  const org = buildOrgIndex(all.employees)
  const regions = regionIndex(null, all)
  const env = { org, asOf: AS_OF, all, regions, regionOwners: regionOwners(EMPTY_LISTS, SAMPLE) }

  it('carries the regional HR business partner, who is the lens’s person in HRBP for a region', () => {
    const { scope } = scopeFor('hrbp-region', { region: 'APAC' }, env)
    expect(scope?.kind === 'region' && scope.owner).toEqual({ name: 'Ya-Wen Chang', id: 'E10458' })
    const lens = lensOf(accessFor('hrbp-region', scope), AS_OF)
    expect(lens.me).toEqual({ name: 'Ya-Wen Chang', id: 'E10458' })
  })

  it('names nobody without the list, so region items route by kind as before', () => {
    const { scope } = scopeFor('hrbp-region', { region: 'APAC' }, { ...env, regionOwners: null })
    expect(scope?.kind === 'region' && scope.owner).toBeNull()
    expect(lensOf(accessFor('hrbp-region', scope), AS_OF).me).toBeNull()
  })

  it('keeps one scope object per owner', () => {
    const owner = { name: 'Ya-Wen Chang', id: 'E10458' }
    const a = regionScope(all.employees, AS_OF, 'APAC', regions, owner)
    expect(regionScope(all.employees, AS_OF, 'APAC', regions, { ...owner })).toBe(a)
    expect(regionScope(all.employees, AS_OF, 'APAC', regions, null)).not.toBe(a)
  })
})
