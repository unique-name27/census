import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, type Filters, LIST_DIMENSIONS, type ListDimension } from './scope'
import { parseHash } from './store'
import {
  checkScope,
  DEFAULT_SCOPE,
  hashWithScope,
  leftOutMessage,
  readScope,
  type ScopeVocabulary,
  sameScope,
  scopeQuery,
  splitHash,
  type UrlScope,
} from './urlScope'

const scope = (f: Partial<Filters> = {}, rest: Partial<UrlScope> = {}): UrlScope => ({
  ...DEFAULT_SCOPE,
  filters: { ...DEFAULT_FILTERS, modes: {}, ...f },
  ...rest,
})

/** Write the scope into an address after a route, read it back. */
function roundTrip(route: string, s: UrlScope): { route: string; scope: UrlScope } {
  const hash = hashWithScope(route, s)
  const { route: r, query } = splitHash(hash)
  return { route: r, scope: readScope(query).scope }
}

describe('the scope in the address', () => {
  it('leaves defaults out, so the whole company over 12 months is just the route', () => {
    expect(hashWithScope('hrbp.attrition', DEFAULT_SCOPE)).toBe('#hrbp.attrition')
    expect(hashWithScope('hrbp.attrition', DEFAULT_SCOPE, { explicit: true })).toBe(
      '#hrbp.attrition?scope=all',
    )
    // A mode on a filter with no values filters nothing and is not written.
    expect(scopeQuery(scope({ modes: { location: 'exclude' } }))).toBe('')
  })

  it('writes the documented example', () => {
    const s = scope({
      period: 't6m',
      businessUnit: ['Silicon Engineering'],
      department: ['Design Verification', 'Physical Design'],
      level: ['L4'],
    })
    expect(hashWithScope('hrbp.attrition', s)).toBe(
      '#hrbp.attrition?period=t6m&bu=Silicon+Engineering&dept=Design+Verification&dept=Physical+Design&level=L4',
    )
  })

  it('round-trips every filter combination, with exclusions, custom dates and special routes', () => {
    const routes = [
      'hrbp.attrition',
      'data.metrics/hrbp/attrition/voluntary',
      'ai.agents:compliance',
      'data.candidates-mapping',
      'actions',
      'scorecard',
    ]
    const values: Record<ListDimension, string[]> = {
      businessUnit: ['Silicon Engineering', 'Sales & Marketing'],
      department: ['Design Verification', 'R&D / Labs'],
      location: ['Bengaluru', 'São Paulo'],
      level: ['L4', 'M1'],
    }
    let checked = 0
    // Every subset of the dimensions, each in include and exclude mode, with and without a leader.
    for (let mask = 0; mask < 1 << LIST_DIMENSIONS.length; mask++) {
      for (const exclude of [false, true])
        for (const leader of [null, 'E10042'])
          for (const period of [
            { period: 't12m' as const },
            { period: 'custom' as const, customStart: '2026-01-01', customEnd: '2026-03-31' },
          ]) {
            const f: Partial<Filters> = { ...period, leaderId: leader, modes: {} }
            LIST_DIMENSIONS.forEach((d, i) => {
              if (mask & (1 << i)) {
                f[d] = values[d]
                if (exclude) f.modes = { ...f.modes, [d]: 'exclude' }
              }
            })
            if (leader && exclude) f.modes = { ...f.modes, leaderId: 'exclude' }
            const s = scope(f, { standard: mask % 2 ? 'gold' : 'bronze', lens: !!(mask & 4) })
            for (const route of routes) {
              const back = roundTrip(route, s)
              expect(back.route).toBe(route)
              expect(sameScope(back.scope, s)).toBe(true)
              // The route parser never sees the scope.
              expect(parseHash(hashWithScope(route, s))).toEqual(parseHash(`#${route}`))
              checked++
            }
          }
    }
    expect(checked).toBe(16 * 2 * 2 * 2 * routes.length)
  })

  it('keeps every existing route parsing as before', () => {
    expect(parseHash('#data.metrics/hrbp/attrition/voluntary?bu=X')).toEqual({
      view: 'data',
      tab: 'metrics/hrbp/attrition/voluntary',
    })
    expect(parseHash('#ai.agents:compliance?period=ytd')).toEqual({ view: 'ai', tab: 'agents:compliance' })
    expect(parseHash('#actions?loc=Bengaluru')).toEqual({ view: 'actions', tab: '' })
    expect(parseHash('#nowhere?bu=X')).toBeNull()
  })

  it('says whether a query names a scope at all', () => {
    expect(readScope(null).present).toBe(false)
    expect(readScope('').present).toBe(false)
    expect(readScope('utm=1').present).toBe(false)
    expect(readScope('scope=all')).toMatchObject({ present: true, scope: DEFAULT_SCOPE })
    expect(readScope('std=gold').scope.standard).toBe('gold')
    expect(readScope('lens=1').scope.lens).toBe(true)
  })

  it('reads exclusions and ignores modes it does not know', () => {
    const r = readScope('bu=Sales&not=bu&not=planet&leader=E1&not=leader')
    expect(r.scope.filters.businessUnit).toEqual(['Sales'])
    expect(r.scope.filters.modes).toEqual({ businessUnit: 'exclude', leaderId: 'exclude' })
  })

  it('leaves unreadable periods and dates at the default and says so', () => {
    expect(readScope('period=forever')).toMatchObject({
      scope: { filters: { period: 't12m' } },
      unreadable: ['period "forever"'],
    })
    const r = readScope('period=custom&from=2026-02-30x&to=2026-01-01')
    expect(r.scope.filters.period).toBe('t12m')
    expect(r.unreadable).toEqual(['custom dates'])
    expect(readScope('std=platinum').unreadable).toEqual(['data standard "platinum"'])
  })
})

describe('values the data does not have', () => {
  const vocab: ScopeVocabulary = {
    hasLeader: (id) => id === 'E1',
    hasValue: (dim, v) => (dim === 'department' ? v === 'Design Verification' : v !== 'Mars'),
  }

  it('are left out, and the message names them', () => {
    const s = readScope('dept=Photonics&dept=Design+Verification&leader=E9&loc=Mars').scope
    const r = checkScope(s, vocab)
    expect(r.scope.filters.department).toEqual(['Design Verification'])
    expect(r.scope.filters.leaderId).toBeNull()
    expect(r.scope.filters.location).toEqual([])
    expect(r.leftOut).toEqual([
      { dim: 'leaderId', value: 'E9' },
      { dim: 'department', value: 'Photonics' },
      { dim: 'location', value: 'Mars' },
    ])
  })

  it('reads as one plain sentence', () => {
    expect(leftOutMessage([{ dim: 'department', value: 'Photonics' }])).toBe(
      "The link's department Photonics is not in your data, so it was left out.",
    )
    expect(
      leftOutMessage([
        { dim: 'department', value: 'Photonics' },
        { dim: 'department', value: 'Optics' },
      ]),
    ).toBe("The link's departments Photonics and Optics are not in your data, so they were left out.")
    expect(
      leftOutMessage([
        { dim: 'leaderId', value: 'E9' },
        { dim: 'location', value: 'Mars' },
      ]),
    ).toBe("The link's leader with ID E9 and location Mars are not in your data, so they were left out.")
  })

  it('keeps the scope object when nothing is left out', () => {
    const s = readScope('dept=Design+Verification').scope
    expect(checkScope(s, vocab).scope).toBe(s)
  })
})
