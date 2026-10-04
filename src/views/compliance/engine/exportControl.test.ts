import { describe, expect, it } from 'vitest'
import { metricsWith } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { M } from '../metrics'
import { buildBase } from './base'
import { computeExport } from './exportControl'
import { emp, fixtureContext, rtw } from './testkit'

const X1 = emp({ name: 'X1' })
const X2 = emp({ name: 'X2' })
const X3 = emp({ name: 'X3' })
const X4 = emp({ name: 'X4' })
const X5 = emp({ name: 'X5', hireDate: '2026-10-12' })
const X6 = emp({ name: 'X6', hireDate: '2027-03-01' })
const X7 = emp({ name: 'X7' })
const X8 = emp({ name: 'X8', terminationDate: '2026-08-01', terminationType: 'Voluntary' })
const req = { exportLicenseRequired: true } as const
const rightToWork = [
  rtw(X1, { ...req, exportLicenseStatus: 'Pending' }),
  rtw(X2, { ...req, exportLicenseStatus: 'Approved', exportLicenseExpiry: '2026-09-01' }),
  rtw(X3, { ...req, exportLicenseStatus: 'Approved', exportLicenseExpiry: '2027-06-01' }),
  rtw(X4, { ...req, exportLicenseStatus: 'Denied' }),
  rtw(X5, { ...req, exportLicenseStatus: 'Pending' }),
  rtw(X6, { ...req, exportLicenseStatus: 'Pending' }),
  rtw(X7),
  rtw(X8, { ...req, exportLicenseStatus: 'Pending' }),
]
const employees = [X1, X2, X3, X4, X5, X6, X7, X8]

function exp(metrics?: MetricsApi) {
  const ctx = fixtureContext({ employees, rightToWork }, { metrics })
  return computeExport(buildBase(ctx))
}
const names = (xs: readonly { e: { name: string } }[]) => xs.map((x) => x.e.name)

describe('export control', () => {
  it('lists active people working without a license in force: pending, denied or expired', () => {
    const m = exp()
    expect(names(m.without).sort()).toEqual(['X1', 'X2', 'X4'])
    expect(m.without.find((x) => x.e.name === 'X2')?.status).toBe('Expired')
    expect(m.approved).toBe(1)
  })

  it('counts licenses by status for people active or starting, never leavers', () => {
    expect(exp().byStatus.map((r) => [r.status, r.people])).toEqual([
      ['Pending', 3],
      ['Approved', 1],
      ['Denied', 1],
      ['Expired', 1],
    ])
  })

  it('lists starts in the look-ahead whose license is not in force, soonest first', () => {
    expect(names(exp().pendingStarts)).toEqual(['X5'])
    expect(names(exp(metricsWith({ [M.pendingStarts]: { days: 180 } })).pendingStarts)).toEqual(['X5', 'X6'])
  })
})
