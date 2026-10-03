import { describe, expect, it } from 'vitest'
import type { Employee, LearningRecord } from '@/data/schema'
import { buildBase } from './base'
import { computeLearning } from './learning'
import { course, ctxFor, emp } from './test-fixtures'

const COC = 'Code of conduct'

describe('computeLearning', () => {
  const people: Employee[] = [
    ...Array.from({ length: 8 }, (_, i) => emp(`P${i}`)),
    // Left before the due date: not counted anywhere.
    emp('L', { terminationDate: '2026-08-01', terminationType: 'Voluntary' }),
  ]
  const learning: LearningRecord[] = [
    ...Array.from({ length: 6 }, (_, i) => course(`P${i}`, COC, { completedDate: '2026-08-20' })),
    course('P6', COC, { completedDate: '2026-09-02' }),
    course('P7', COC),
    course('L', COC),
    // Optional courses never count toward on time or overdue.
    course('P7', 'Leadership basics', {
      required: false,
      category: 'Leadership',
      completedDate: '2026-09-10',
      hours: 4,
    }),
    // Not due yet.
    course('P0', 'Insider trading', { dueDate: '2026-10-15' }),
  ]
  const r = computeLearning(buildBase(ctxFor({ employees: people, learning })))

  it('measures on time over assignments due in the window, for people employed on the due date', () => {
    expect(r.current).toEqual({ rate: 0.75, due: 8, onTime: 6 })
    expect(r.prior.rate).toBeNull()
    expect(r.byCourse).toHaveLength(1)
    expect(r.byCourse[0]).toMatchObject({
      course: COC,
      due: 8,
      onTime: 6,
      late: 1,
      open: 1,
      onTimeRate: 0.75,
    })
  })

  it('lists overdue assignments for people active today', () => {
    expect(r.overdue).toHaveLength(1)
    expect(r.overdue[0]).toMatchObject({
      employeeId: 'P7',
      course: COC,
      dueDate: '2026-08-26',
      daysOverdue: 35,
    })
    expect(r.overdueCourses).toEqual([COC])
    const cell = r.overdueByDepartment.find((c) => c.course === COC && c.group === 'Design')!
    expect(cell).toMatchObject({ pastDue: 8, overdue: 1, share: 1 / 8 })
  })

  it('counts completions by month and kind across the window', () => {
    expect(r.completions).toHaveLength(24)
    const at = (month: string, kind: 'Required' | 'Optional') =>
      r.completions.find((c) => c.month === month && c.kind === kind)?.completions
    expect(at('2026-08', 'Required')).toBe(6)
    expect(at('2026-09', 'Required')).toBe(1)
    expect(at('2026-09', 'Optional')).toBe(1)
    expect(at('2025-10', 'Required')).toBe(0)
  })

  it('divides learning hours by average headcount', () => {
    const unit = r.hours.find((h) => h.businessUnit === 'Engineering')!
    expect(unit.hours).toBe(11)
    expect(unit.perEmployee).toBeCloseTo(11 / unit.avgHeadcount, 9)
  })

  it('finds where the most overdue course concentrates', () => {
    const ops = Array.from({ length: 20 }, (_, i) =>
      emp(`O${i}`, { businessUnit: 'Ops', department: 'Supply' }),
    )
    const eng = Array.from({ length: 20 }, (_, i) =>
      emp(`E${i}`, { businessUnit: 'Eng', department: 'Design' }),
    )
    const rows = [
      ...ops.map((e, i) =>
        course(e.employeeId, 'Export control', i < 8 ? {} : { completedDate: '2026-08-01' }),
      ),
      ...eng.map((e, i) =>
        course(e.employeeId, 'Export control', i < 1 ? {} : { completedDate: '2026-08-01' }),
      ),
    ]
    const c = computeLearning(buildBase(ctxFor({ employees: [...ops, ...eng], learning: rows })))
      .concentration!
    expect(c.course).toBe('Export control')
    expect(c.overdue).toBe(9)
    expect(c.pastDue).toBe(40)
    expect(c.top?.value).toBe('Ops')
    expect(c.top?.segValue).toBeCloseTo(0.4, 9)
    expect(c.top?.compValue).toBeCloseTo(0.05, 9)
    expect(c.people).toHaveLength(9)
  })

  it('returns null rates, not zeros, without due dates', () => {
    const noDue = computeLearning(
      buildBase(ctxFor({ employees: people, learning: learning.map((l) => ({ ...l, dueDate: null })) })),
    )
    expect(noDue.hasDueDates).toBe(false)
    expect(noDue.current.rate).toBeNull()
    expect(noDue.overdue).toEqual([])
  })

  it('handles no learning data', () => {
    const none = computeLearning(buildBase(ctxFor({ employees: people })))
    expect(none.current).toEqual({ rate: null, due: 0, onTime: 0 })
    expect(none.byCourse).toEqual([])
    expect(none.concentration).toBeNull()
    expect(none.hours).toEqual([])
  })
})
