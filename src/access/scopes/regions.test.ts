/**
 * One region index (docs/ROLES-V2.md 1.3 and 8.8 test 3): region sites come from the Region column
 * of the Locations list in force; a location in the data with no list entry takes its known site's
 * region (else its country's); a location without a region is in no region. The region scope and
 * the region picker read the same index.
 */
import { describe, expect, it } from 'vitest'
import { sampleCtx, sampleData } from '@/ask/engine/testkit'
import { buildContext, contextRegions } from '@/data/context'
import { EMPTY_LISTS } from '@/data/lists/edit'
import type { ListValue } from '@/data/lists/types'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { regionOptions } from './pickers'
import { regionIndex } from './regions'

const hr = sampleCtx()

const loc = (value: string, region: string | null): ListValue => ({ value, attrs: { region } })

describe('regionIndex', () => {
  it("gives the sample's three regions, from the sample's Locations list", () => {
    const r = contextRegions(EMPTY_LISTS, hr.all, hr.sources)
    expect(r.regions).toEqual(['Americas', 'EMEA', 'APAC'])
    expect(r.sitesOf('APAC')).toEqual(['Bengaluru', 'Ho Chi Minh City', 'Hsinchu', 'Shanghai'])
    expect(r.sitesOf('EMEA')).toEqual(['Haifa', 'Munich'])
    expect(r.noRegion).toEqual([])
    expect(r.regionOf('Hsinchu')).toBe('APAC')
    expect(r.regionOf(null)).toBeNull()
    // Without a list, the known sites say the same.
    const plain = regionIndex(null, hr.all)
    for (const region of r.regions) expect(plain.sitesOf(region)).toEqual(r.sitesOf(region))
  })

  it("reads the list's Region column first, keeps list order, and leaves a location without one in no region", () => {
    const list = [loc('Toronto', 'EMEA'), loc('Munich', null), loc('Haifa', 'EMEA'), loc('Atlantis', 'EMEA')]
    const r = regionIndex(list, hr.all)
    // Toronto follows the list; Haifa next in list order; Atlantis has no records, so it is no site.
    expect(r.sitesOf('EMEA')).toEqual(['Toronto', 'Haifa'])
    expect(r.regionOf('Munich')).toBeNull()
    expect(r.noRegion).toEqual(['Munich'])
    expect(r.regionOf('Atlantis')).toBe('EMEA')
    // Locations not on the list take their known site's region, sorted after the list's.
    expect(r.sitesOf('APAC')).toEqual(['Bengaluru', 'Ho Chi Minh City', 'Hsinchu', 'Shanghai'])
    expect(r.sitesOf('Americas')).not.toContain('Toronto')
    const opts = regionOptions(r, hr.all.employees, hr.asOf)
    const munich = hr.all.employees.filter(
      (e) =>
        e.location === 'Munich' &&
        e.employmentType === 'Employee' &&
        e.hireDate <= hr.asOf &&
        (!e.terminationDate || e.terminationDate > hr.asOf),
    ).length
    expect(opts.noRegionPeople).toBe(munich)
  })

  it('gives a location in no list and no known site the region of its country, else none', () => {
    const data = {
      ...hr.all,
      employees: [
        { ...hr.all.employees[0], employeeId: 'X1', location: 'Stuttgart', country: 'Germany' },
        { ...hr.all.employees[0], employeeId: 'X2', location: 'Lima', country: 'Peru' },
      ],
      requisitions: [],
      cases: [],
      hiringPlan: [],
    }
    const r = regionIndex(null, data)
    expect(r.regionOf('Stuttgart')).toBe('EMEA')
    expect(r.regionOf('Lima')).toBeNull()
    expect(r.noRegion).toEqual(['Lima'])
  })
})

describe('the region scope reads the index it is given', () => {
  it('leaves a location without a region out of every region', () => {
    const data = sampleData()
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    const list = [loc('Munich', null), loc('Haifa', 'EMEA')]
    const ctx = buildContext({
      data,
      sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: false,
      access: { mode: 'hrbp-region', picks: { region: 'EMEA' } },
      regions: regionIndex(list, data),
    })
    expect(ctx.access.scope).toMatchObject({ kind: 'region', sites: ['Haifa'] })
    expect(ctx.data.employees.length).toBeGreaterThan(0)
    for (const e of ctx.data.employees) expect(e.location).toBe('Haifa')
    // A region no location is in is gone: the scope holds nobody.
    const gone = buildContext({
      data,
      sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: false,
      access: { mode: 'hrbp-region', picks: { region: 'APAC' } },
      regions: regionIndex([loc('Bengaluru', null)], {
        ...data,
        employees: data.employees.filter((e) => e.location === 'Bengaluru'),
        requisitions: [],
        cases: [],
        hiringPlan: [],
      }),
    })
    expect(gone.access.unset).toBe(true)
    expect(gone.data.employees).toEqual([])
  })
})
