import { describe, expect, it } from 'vitest'
import { caseColumns, caseFacts, onTimeRate, txFacts } from './facts'
import { emp, kase, tx } from './testkit'

const AS_OF = '2026-09-30'
const facts = (rows: ReturnType<typeof kase>[], asOf = AS_OF) => caseFacts(rows, asOf, caseColumns(rows))

describe('case facts', () => {
  it('judges response and resolution against the row targets in calendar hours', () => {
    const [ok, slow] = facts([
      kase({
        openedAt: '2026-09-01T09:00',
        firstResponseAt: '2026-09-01T17:00',
        resolvedAt: '2026-09-03T09:00',
      }),
      kase({
        openedAt: '2026-09-01T09:00',
        firstResponseAt: '2026-09-01T17:01',
        resolvedAt: '2026-09-03T09:01',
      }),
    ])
    expect(ok.responseHours).toBe(8)
    expect(ok.responseMet).toBe(true)
    expect(ok.resolutionMet).toBe(true)
    expect(slow.responseMet).toBe(false)
    expect(slow.resolutionMet).toBe(false)
  })

  it('falls back to the category default target when the row has none', () => {
    const [f] = facts([
      kase({ category: 'Benefits', responseTargetHours: null, resolutionTargetHours: null }),
      kase(),
    ])
    expect(f.responseTarget).toBe(24)
    expect(f.resolutionTarget).toBe(120)
  })

  it('counts open cases past their target as missed and leaves the rest pending', () => {
    const [late, inside] = facts([
      kase({ openedAt: '2026-09-20T09:00', resolvedAt: null, status: 'In progress' }),
      kase({ openedAt: '2026-09-30T09:00', resolvedAt: null, firstResponseAt: null, status: 'New' }),
      kase(),
    ])
    expect(late.open).toBe(true)
    expect(late.resolutionMet).toBe(false)
    expect(late.ageDays).toBe(10)
    expect(inside.open).toBe(true)
    expect(inside.resolutionMet).toBeNull()
    expect(inside.responseMet).toBe(false)
  })

  it('treats timestamps after the as-of date as not yet happened', () => {
    const [f] = facts([kase({ openedAt: '2026-09-01T09:00', resolvedAt: '2026-10-02T09:00' })])
    expect(f.open).toBe(true)
    expect(f.resolved).toBeNull()
    expect(f.resolutionMet).toBe(false)
  })

  it('drops cases opened after the as-of date', () => {
    expect(facts([kase({ openedAt: '2026-10-01T09:00' })])).toHaveLength(0)
  })

  it('returns null outcomes when a timestamp column is absent from every row', () => {
    const rows = [kase({ firstResponseAt: null }), kase({ firstResponseAt: null })]
    const cols = caseColumns(rows)
    expect(cols.firstResponseAt).toBe(false)
    const [f] = caseFacts(rows, AS_OF, cols)
    expect(f.responseMet).toBeNull()
    expect(f.responseHours).toBeNull()
  })

  it('uses the resolution as the response when one case lacks a response time', () => {
    const [f] = facts([kase({ firstResponseAt: null, resolvedAt: '2026-09-01T12:00' }), kase()])
    expect(f.responseHours).toBe(3)
    expect(f.responseMet).toBe(true)
  })

  it('reads weekday (Monday = 0) and hour from the opened timestamp', () => {
    const [f] = facts([kase({ openedAt: '2026-09-06T14:30' })])
    expect(f.weekday).toBe(6)
    expect(f.hour).toBe(14)
    const [g] = facts([kase({ openedAt: '2026-09-07' })])
    expect(g.hour).toBeNull()
  })

  it('ignores satisfaction scores outside 1 to 5', () => {
    const [a, b] = facts([kase({ csat: 7 }), kase({ csat: 4 })])
    expect(a.csat).toBeNull()
    expect(b.csat).toBe(4)
  })
})

describe('transaction facts', () => {
  const people = new Map([['E1', emp({ terminationType: 'Involuntary' })]])

  it('classifies on time, late, overdue and pending against the due date', () => {
    const rows = [
      tx({ dueDate: '2026-09-02', completedDate: '2026-09-02' }),
      tx({ dueDate: '2026-09-02', completedDate: '2026-09-05' }),
      tx({ dueDate: '2026-09-02', completedDate: null }),
      tx({ dueDate: '2026-10-05', completedDate: null }),
      tx({ dueDate: '2026-09-30', completedDate: null }),
    ]
    const out = txFacts(rows, AS_OF, people).map((f) => f.outcome)
    expect(out).toEqual(['on-time', 'late', 'overdue', 'pending', 'pending'])
    // Three judged items for three people: counted, but no rate below 5.
    expect(onTimeRate(txFacts(rows, AS_OF, people))).toEqual({
      rate: null,
      n: 3,
      onTime: 1,
      late: 2,
      people: 3,
    })
  })

  it('needs 5 people, not just 5 transactions, for an on-time rate', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      tx({ dueDate: '2026-09-02', completedDate: i ? '2026-09-02' : '2026-09-05' }),
    )
    expect(onTimeRate(txFacts(many, AS_OF, people)).rate).toBeCloseTo(5 / 6)
    const onePerson = many.map((t) => ({ ...t, employeeId: 'E1' }))
    expect(onTimeRate(txFacts(onePerson, AS_OF, people))).toMatchObject({ rate: null, n: 6, people: 1 })
  })

  it('treats a completion after the as-of date as not completed', () => {
    const [f] = txFacts([tx({ dueDate: '2026-09-02', completedDate: '2026-10-01' })], AS_OF, people)
    expect(f.completed).toBeNull()
    expect(f.outcome).toBe('overdue')
  })

  it('has no outcome without a due date', () => {
    const [f] = txFacts([tx({ dueDate: '' })], AS_OF, people)
    expect(f.outcome).toBeNull()
    expect(onTimeRate([f]).rate).toBeNull()
  })

  it('joins the site, jurisdiction and exit type from the roster', () => {
    const [f] = txFacts(
      [tx({ type: 'Termination', employeeId: 'E1', completedDate: '2026-09-04' })],
      AS_OF,
      people,
    )
    expect(f.jurisdiction).toBe('us-ca')
    expect(f.region).toBe('Americas')
    expect(f.exitType).toBe('Involuntary')
    expect(f.daysVsDue).toBe(2)
    const [unknown] = txFacts([tx({ employeeId: 'X9' })], AS_OF, people)
    expect(unknown.location).toBeNull()
    expect(unknown.jurisdiction).toBeNull()
  })
})
