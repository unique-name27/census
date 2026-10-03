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

const people = new Map([
  ['SJ1', emp({ employeeId: 'SJ1', name: 'Ana Ruiz', location: 'San Jose', terminationType: 'Involuntary' })],
  ['SJ2', emp({ employeeId: 'SJ2', name: 'Ben Ito', location: 'San Jose', terminationType: 'Voluntary' })],
  ['BLR', emp({ employeeId: 'BLR', name: 'Dev Rao', location: 'Bengaluru', terminationType: 'Voluntary' })],
])
const facts = (rows: ReturnType<typeof tx>[]) => txFacts(rows, AS_OF, people)

describe('on time by type', () => {
  it('counts deadlines in the window and keeps pending items out', () => {
    const rows = facts([
      ...times(5, () => tx({ type: 'Leave start', employeeId: 'SJ2' })),
      tx({ type: 'Leave start', employeeId: 'SJ2', dueDate: '2026-09-10', completedDate: null }),
      tx({ type: 'Leave start', employeeId: 'SJ2', dueDate: '2026-10-10', completedDate: null }),
      tx({ type: 'Leave start', employeeId: 'SJ2', dueDate: '2026-08-10' }),
    ])
    const [r] = onTimeByType(rows, W)
    expect(r).toMatchObject({ type: 'Leave start', processId: 'LV-01', due: 6, onTime: 5, open: 1, late: 0 })
    expect(r.rate).toBeCloseTo(5 / 6)
  })
})

describe('final pay', () => {
  it('splits a jurisdiction by exit type and states its rule', () => {
    const rows = facts([
      ...times(3, () =>
        tx({ type: 'Termination', employeeId: 'SJ1', dueDate: '2026-09-04', completedDate: '2026-09-04' }),
      ),
      ...times(2, () =>
        tx({ type: 'Termination', employeeId: 'SJ1', dueDate: '2026-09-04', completedDate: '2026-09-07' }),
      ),
      ...times(5, () =>
        tx({ type: 'Termination', employeeId: 'SJ2', dueDate: '2026-09-04', completedDate: '2026-09-03' }),
      ),
      ...times(2, () =>
        tx({ type: 'Termination', employeeId: 'BLR', dueDate: '2026-09-04', completedDate: '2026-09-04' }),
      ),
    ])
    const [ca, india] = finalPayByJurisdiction(rows, W)
    expect(ca).toMatchObject({
      jurisdiction: 'us-ca',
      name: 'California',
      sites: 'San Jose',
      exits: 10,
      late: 2,
    })
    expect(ca.rate).toBeCloseTo(0.8)
    expect(ca.involuntaryRate).toBeCloseTo(0.6)
    expect(ca.voluntaryRate).toBe(1)
    expect(ca.medianDaysLate).toBe(3)
    expect(ca.rule).toMatch(/^Same day for involuntary/)
    expect(india.rate).toBeNull()
    expect(india.exits).toBe(2)
  })
})

describe('new hire readiness', () => {
  it('folds sites with fewer than 5 starts', () => {
    const rows = facts([
      ...times(5, () => tx({ employeeId: 'SJ1' })),
      ...times(2, () => tx({ employeeId: 'BLR', completedDate: '2026-09-05' })),
    ])
    const out = newHireBySite(rows, W)
    expect(out.map((r) => r.location)).toEqual(['San Jose', 'Other (1)'])
    expect(out[0].rate).toBe(1)
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
    expect(retroShare(rows, W)).toEqual({ rate: 0.2, retro: 1, n: 5 })
    expect(retroByMonth(rows, ['2026-08', '2026-09'])).toEqual([
      { month: '2026-08', changes: 0, retro: 0, share: null },
      { month: '2026-09', changes: 5, retro: 1, share: 0.2 },
    ])
  })
})
