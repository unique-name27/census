import { describe, expect, it } from 'vitest'
import { txFacts } from './facts'
import { emp, tx, win } from './testkit'
import {
  finalPayByJurisdiction,
  newHireBySite,
  onTimeByType,
  retroByMonth,
  retroShare,
  timingBins,
} from './transactions'

const AS_OF = '2026-09-30'
const W = win('2026-09-01', '2026-09-30')
const times = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))

/** Ten involuntary and ten voluntary leavers in San Jose, five voluntary in Bengaluru. */
const roster = [
  ...times(10, (i) => emp({ employeeId: `SJI${i}`, location: 'San Jose', terminationType: 'Involuntary' })),
  ...times(10, (i) => emp({ employeeId: `SJV${i}`, location: 'San Jose', terminationType: 'Voluntary' })),
  ...times(5, (i) => emp({ employeeId: `BLR${i}`, location: 'Bengaluru', terminationType: 'Voluntary' })),
]
const people = new Map(roster.map((e) => [e.employeeId, e]))
const facts = (rows: ReturnType<typeof tx>[]) => txFacts(rows, AS_OF, people)

describe('on time by type', () => {
  it('counts deadlines in the window and keeps pending items out', () => {
    const rows = facts([
      ...times(5, () => tx({ type: 'Leave start' })),
      tx({ type: 'Leave start', dueDate: '2026-09-10', completedDate: null }),
      tx({ type: 'Leave start', dueDate: '2026-10-10', completedDate: null }),
      tx({ type: 'Leave start', dueDate: '2026-08-10' }),
    ])
    const [r] = onTimeByType(rows, W)
    expect(r).toMatchObject({ type: 'Leave start', processId: 'LV-01', due: 6, onTime: 5, open: 1, late: 0 })
    expect(r.rate).toBeCloseTo(5 / 6)
  })

  it('folds types behind fewer than 5 employees into Other, counts and all', () => {
    const rows = facts([
      ...times(6, () => tx({ type: 'New hire' })),
      // Two returns from leave, and four leave starts for one person: neither shows on its own.
      ...times(2, () => tx({ type: 'Return from leave' })),
      ...times(4, () => tx({ type: 'Leave start', employeeId: 'SJV1' })),
    ])
    const out = onTimeByType(rows, W)
    expect(out.map((r) => r.type)).toEqual(['New hire', 'Other (2)'])
    expect(out[1]).toMatchObject({ due: 6, processId: null, deadline: 'Varies by type' })
    expect(out[1].rate).toBeNull()
    expect(out[1]).toMatchObject({ onTime: null, late: null, open: null })
  })
})

describe('final pay', () => {
  it('splits a jurisdiction by exit type and states its rule', () => {
    const exit = (employeeId: string, completedDate: string) =>
      tx({ type: 'Termination', employeeId, dueDate: '2026-09-04', completedDate })
    const rows = facts([
      ...times(5, (i) => exit(`SJI${i}`, '2026-09-04')),
      ...times(5, (i) => exit(`SJI${i + 5}`, '2026-09-07')),
      ...times(5, (i) => exit(`SJV${i}`, '2026-09-03')),
      ...times(2, (i) => exit(`BLR${i}`, '2026-09-05')),
    ])
    const [ca, other] = finalPayByJurisdiction(rows, W)
    expect(ca).toMatchObject({
      jurisdiction: 'us-ca',
      name: 'California',
      sites: 'San Jose',
      exits: 15,
      late: 5,
    })
    expect(ca.rate).toBeCloseTo(10 / 15)
    expect(ca.involuntaryRate).toBeCloseTo(0.5)
    expect(ca.voluntaryRate).toBe(1)
    expect(ca.medianDaysLate).toBe(3)
    expect(ca.rule).toMatch(/^Same day for involuntary/)
    // Two Bengaluru exits fold into Other: no rate, no median days late, no rule of their own.
    // ... and no count of late payments beside the hidden rate, which would give it away.
    expect(other).toMatchObject({
      jurisdiction: 'other',
      name: 'Other (1)',
      exits: 2,
      late: null,
      sites: '—',
    })
    expect(other.rate).toBeNull()
    expect(other.medianDaysLate).toBeNull()
  })

  it('gives no median days late behind fewer than 5 late payments', () => {
    const rows = facts(
      times(10, (i) =>
        tx({
          type: 'Termination',
          employeeId: `SJV${i}`,
          dueDate: '2026-09-04',
          completedDate: i < 2 ? '2026-09-09' : '2026-09-04',
        }),
      ),
    )
    const [ca] = finalPayByJurisdiction(rows, W)
    expect(ca.late).toBe(2)
    expect(ca.rate).toBeCloseTo(0.8)
    expect(ca.medianDaysLate).toBeNull()
  })
})

describe('new hire readiness', () => {
  it('folds sites with fewer than 5 starts', () => {
    const rows = facts([
      ...times(5, (i) => tx({ employeeId: `SJV${i}` })),
      ...times(2, (i) => tx({ employeeId: `BLR${i}`, completedDate: '2026-09-05' })),
      // Six starts for one person (a data error) are still one person.
      ...times(6, () => tx({ employeeId: 'BLR4' })),
    ])
    const out = newHireBySite(rows, W)
    expect(out.map((r) => r.location)).toEqual(['San Jose', 'Other (1)'])
    expect(out[0].rate).toBe(1)
    expect(out[1].starts).toBe(8)
    expect(out[1].rate).toBeNull()
  })
})

describe('timing and retro', () => {
  it('bins completion against the due date', () => {
    const rows = facts([
      tx({ dueDate: '2026-09-20', completedDate: '2026-09-01' }),
      tx({ dueDate: '2026-09-20', completedDate: '2026-09-20' }),
      tx({ dueDate: '2026-09-10', completedDate: '2026-09-13' }),
      tx({ dueDate: '2026-09-10', completedDate: null }),
    ])
    const bins = timingBins(rows, W)
    const by = new Map(bins.map((b) => [b.timing, b.transactions]))
    expect(by.get('15+ d early')).toBe(1)
    expect(by.get('On the due date')).toBe(1)
    expect(by.get('3-5 d late')).toBe(1)
    expect(bins.reduce((a, b) => a + b.transactions, 0)).toBe(3)
    expect(bins.filter((b) => b.late).map((b) => b.timing)[0]).toBe('1-2 d late')
    expect(timingBins([], W)).toEqual([])
  })

  it('shares retro adjustments over job and pay changes only', () => {
    const rows = facts([
      ...times(4, () => tx({ type: 'Job change', dueDate: '2026-09-23', retro: false })),
      tx({ type: 'Compensation change', dueDate: '2026-09-23', retro: true }),
      tx({ type: 'New hire', dueDate: '2026-09-23', retro: null }),
    ])
    expect(retroShare(rows, W)).toEqual({ rate: 0.2, retro: 1, n: 5, people: 5 })
    expect(retroByMonth(rows, ['2026-08', '2026-09'])).toEqual([
      { month: '2026-08', changes: 0, retro: null, share: null },
      { month: '2026-09', changes: 5, retro: 1, share: 0.2 },
    ])
  })
})
