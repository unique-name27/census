import { describe, expect, it } from 'vitest'
import { emp, leaver, many, prepOf } from './fixtures'
import { computeScorecard, isMaterialOff } from './scorecard'

describe('isMaterialOff', () => {
  it('needs more than max(1 pt, 10% of the company) for rates', () => {
    expect(isMaterialOff('voluntary', 0.105, 0.094)).toBe('above')
    expect(isMaterialOff('voluntary', 0.103, 0.094)).toBeNull()
    // 10% of a 30% company rate is 3 pts.
    expect(isMaterialOff('voluntary', 0.28, 0.3)).toBeNull()
    expect(isMaterialOff('voluntary', 0.26, 0.3)).toBe('below')
  })
  it('needs more than max(0.5, 10%) for span', () => {
    expect(isMaterialOff('avgSpan', 6.4, 6)).toBeNull()
    expect(isMaterialOff('avgSpan', 6.7, 6)).toBe('above')
  })
  it('is null for missing values', () => {
    expect(isMaterialOff('regretted', null, 0.05)).toBeNull()
    expect(isMaterialOff('regretted', 0.05, null)).toBeNull()
  })
})

describe('computeScorecard', () => {
  const ceo = emp({ employeeId: 'CEO', name: 'Chief', businessUnit: 'Executive Office', level: 'E3' })
  const vpA = emp({
    employeeId: 'VA',
    name: 'Vee A',
    managerId: 'CEO',
    businessUnit: 'Silicon Engineering',
    jobTitle: 'VP A',
  })
  const vpB = emp({
    employeeId: 'VB',
    name: 'Vee B',
    managerId: 'CEO',
    businessUnit: 'Operations',
    jobTitle: 'VP B',
  })
  const ic = emp({ employeeId: 'IC', name: 'Solo IC', managerId: 'CEO', businessUnit: 'Executive Office' })
  const teamA = [
    ...many(20, { managerId: 'VA', businessUnit: 'Silicon Engineering' }),
    ...Array.from({ length: 4 }, (_, i) =>
      leaver(`2026-0${i + 2}-02`, 'Voluntary', { managerId: 'VA', businessUnit: 'Silicon Engineering' }),
    ),
  ]
  const teamB = many(12, { managerId: 'VB', businessUnit: 'Operations' })
  const all = [ceo, vpA, vpB, ic, ...teamA, ...teamB]

  it('uses business units at company scope, with the company as a pinned benchmark row', () => {
    const card = computeScorecard(prepOf({ employees: all }))
    expect(card.rowsLabel).toBe('Business units')
    const labels = card.rows.map((r) => r.label)
    expect(labels[0]).toBe('Silicon Engineering')
    expect(labels.at(-1)).toBe('Company')
    // Executive Office has 2 employees: folded into Other.
    expect(labels).toContain('Other (1)')
    const se = card.rows[0]
    expect(se.filter).toEqual({ businessUnit: ['Silicon Engineering'] })
    expect(se.shade.voluntary).toBe('above')
  })

  it("uses the leader's direct reports when a leader is selected, and folds orgs under 5", () => {
    const card = computeScorecard(prepOf({ employees: all }, { leaderId: 'CEO' }))
    expect(card.rowsLabel).toBe("Chief's direct reports")
    const a = card.rows.find((r) => r.key === 'VA')!
    expect(a).toMatchObject({ kind: 'leader', filter: { leaderId: 'VA' }, headcount: 21, sublabel: 'VP A' })
    expect(card.rows.find((r) => r.kind === 'other')!.label).toBe('Other (1)')
    expect(card.rows.find((r) => r.key === 'IC')).toBeUndefined()
  })

  it('does not mark orgs under 10 employees', () => {
    const small = [
      ceo,
      vpA,
      ...many(6, { managerId: 'VA', businessUnit: 'Silicon Engineering' }),
      leaver('2026-03-02', 'Voluntary', { managerId: 'VA', businessUnit: 'Silicon Engineering' }),
      ...teamB,
      vpB,
    ]
    const card = computeScorecard(prepOf({ employees: small }))
    const se = card.rows.find((r) => r.label === 'Silicon Engineering')!
    expect(se.headcount).toBeLessThan(10)
    expect(se.shade).toEqual({})
  })

  it('returns no rows for an empty roster', () => {
    expect(computeScorecard(prepOf({ employees: [] })).rows).toEqual([])
  })
})
