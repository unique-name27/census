/**
 * What the Org chart's details panel shows per mode (docs/ROLES-V2.md 4.2): each team figure only
 * where the mode shows its metric, "See this org elsewhere" only to views the mode shows and only
 * when the mode keeps a leader filter, and "Focus on this org" on the same rule. Finance shows no
 * team figures but Open roles, no named leavers, and keeps no leader filter.
 */
import { describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { routeShown } from '@/access/policy'
import { S } from '@/access/surfaces'
import { DEFAULT_FILTERS } from '@/data/scope'
import { leaderFocusKept } from '@/drill/person'
import { ORG_METRIC, ORG_TEAM_METRICS } from '../metrics'

describe('the details panel per mode', () => {
  it('Finance: no team figure, no regretted leavers, Open roles kept, no leader filter', () => {
    const fin = accessFor('finance')
    for (const m of ORG_TEAM_METRICS) expect(fin.can(S.metric(m)), m).toBe(false)
    expect(fin.can(S.metric(ORG_METRIC.openRoles))).toBe(true)
    expect(fin.can(S.figure('hrbp-regretted-leavers'))).toBe(false)
    expect(leaderFocusKept(fin, DEFAULT_FILTERS, 'E10001')).toBe(false)
    expect(routeShown('finance', 'talent')).toBe(false)
  })

  it('HR shows every team figure and both links, and keeps the leader filter', () => {
    const hr = accessFor('hr')
    for (const m of [...ORG_TEAM_METRICS, ORG_METRIC.openRoles]) expect(hr.can(S.metric(m)), m).toBe(true)
    expect(leaderFocusKept(hr, DEFAULT_FILTERS, 'E10001')).toBe(true)
    expect(routeShown('hr', 'hrbp') && routeShown('hr', 'talent')).toBe(true)
  })
})
