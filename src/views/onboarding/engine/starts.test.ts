/**
 * Who starts and where their tasks stand: de-duplication of pre-hires and accepted offers, due
 * dates from the checklist, task states and day-one readiness.
 */
import { describe, expect, it } from 'vitest'
import { onboardingTaskByName } from '@/data/schema'
import { defaultMetrics } from '@/metrics/api'
import { metricsWith } from '@/metrics/testing'
import { M } from '../metrics'
import { onboardingBase } from './base'
import { onboardingSettings } from './settings'
import { daysLateOf, dueOf, normalizeName, readinessOf, readyOnDayOne, stateOf, viewTask } from './starts'
import { AS_OF, cand, emp, fixtureContext, req, task } from './testkit'

const S = onboardingSettings(defaultMetrics())

describe('normalizeName', () => {
  it('drops accents, punctuation, case and single-letter initials', () => {
    expect(normalizeName('Sanjay B. Krishnan')).toBe('sanjay krishnan')
    expect(normalizeName('José  Núñez-Ortiz')).toBe('jose nunez ortiz')
  })
})

describe('upcoming starts', () => {
  const r1 = req('R1')
  const r2 = req('R2', { department: 'Software', businessUnit: 'Systems & Software' })

  it('counts a pre-hire and its accepted offer once, keeping both records and the HRIS date', () => {
    const ctx = fixtureContext({
      requisitions: [r1],
      employees: [emp('E1', { name: 'Ada B. Park', hireDate: '2026-10-19' })],
      candidates: [cand('A1', 'R1', { candidateName: 'Ada Park', startDate: '2026-10-12' })],
    })
    const b = onboardingBase(ctx)
    expect(b.upcoming.starts).toHaveLength(1)
    const s = b.upcoming.starts[0]
    expect(s.employee?.employeeId).toBe('E1')
    expect(s.candidate?.applicationId).toBe('A1')
    expect(s.startDate).toBe('2026-10-19')
    expect(s.recruiter).toBe('Rae Cruz')
    expect(b.upcoming.duplicates).toHaveLength(1)
  })

  it('keeps them apart in another department or outside the matching window, which is a setting', () => {
    const data = {
      requisitions: [r1, r2],
      employees: [emp('E1', { name: 'Ada Park', hireDate: '2026-11-02' })],
      candidates: [
        cand('A1', 'R2', { candidateName: 'Ada Park', startDate: '2026-11-02' }),
        cand('A2', 'R1', { candidateName: 'Ada Park', startDate: '2026-10-12' }),
      ],
    }
    expect(onboardingBase(fixtureContext(data)).upcoming.starts).toHaveLength(3)
    const wide = fixtureContext(data, { metrics: metricsWith({ [M.starts]: { dedupDays: 30 } }) })
    expect(onboardingBase(wide).upcoming.starts).toHaveLength(2)
  })

  it('lists recent accepted offers with no start date separately, never as a start', () => {
    const ctx = fixtureContext({
      requisitions: [r1],
      employees: [emp('E9', { name: 'Started Already', hireDate: '2026-09-14' })],
      candidates: [
        cand('A1', 'R1', { startDate: null, hiredDate: '2026-09-01' }),
        cand('A2', 'R1', { candidateName: 'Started Already', startDate: null, hiredDate: '2026-08-20' }),
        cand('A3', 'R1', { startDate: null, hiredDate: '2026-01-05' }),
      ],
    })
    const b = onboardingBase(ctx)
    expect(b.upcoming.starts).toHaveLength(0)
    expect(b.upcoming.unknownStart.map((c) => c.applicationId)).toEqual(['A1'])
  })
})

describe('tasks', () => {
  it('takes a blank due date from the checklist: calendar days, business days, or the probation length', () => {
    const def = (n: string) => onboardingTaskByName.get(n)
    expect(dueOf(task({ task: 'Laptop shipped' }), def('Laptop shipped'), '2026-10-05', 'India', S)).toBe(
      '2026-10-02',
    )
    // Friday start: three business days later is Wednesday.
    expect(
      dueOf(task({ task: 'I-9 Section 2' }), def('I-9 Section 2'), '2026-10-02', 'United States', S),
    ).toBe('2026-10-07')
    // Six months in India, less ten business days.
    expect(
      dueOf(task({ task: 'Probation decision' }), def('Probation decision'), '2026-04-01', 'India', S),
    ).toBe('2026-09-17')
    expect(
      dueOf(
        task({ task: 'Probation decision' }),
        def('Probation decision'),
        '2026-04-01',
        'United States',
        S,
      ),
    ).toBeNull()
    // The row's own due date wins.
    expect(
      dueOf(
        task({ task: 'Laptop shipped', dueDate: '2026-09-01' }),
        def('Laptop shipped'),
        '2026-10-05',
        null,
        S,
      ),
    ).toBe('2026-09-01')
  })

  it('reads the probation length and lead time from the dictionary', () => {
    const s = onboardingSettings(metricsWith({ [M.probation]: { monthsIndia: 3, leadBusinessDays: 0 } }))
    expect(
      dueOf(
        task({ task: 'Probation decision' }),
        onboardingTaskByName.get('Probation decision'),
        '2026-04-01',
        'India',
        s,
      ),
    ).toBe('2026-07-01')
  })

  it('names where a task stands', () => {
    expect(stateOf(task({ task: 'x', completedDate: '2026-09-02' }), '2026-09-01', AS_OF)).toBe('Done late')
    expect(stateOf(task({ task: 'x', completedDate: '2026-09-01' }), '2026-09-01', AS_OF)).toBe('Done')
    expect(stateOf(task({ task: 'x', status: 'Blocked' }), '2026-09-01', AS_OF)).toBe('Overdue')
    expect(stateOf(task({ task: 'x', status: 'Blocked' }), '2026-10-01', AS_OF)).toBe('Blocked')
    expect(stateOf(task({ task: 'x', status: 'Not needed' }), '2026-09-01', AS_OF)).toBe('Not needed')
    expect(stateOf(task({ task: 'x', status: 'In progress' }), null, AS_OF)).toBe('In progress')
  })

  it('counts days late from the effective due date, blank while a task is open and not yet due', () => {
    // Overdue: to the as-of date (30 Sep).
    expect(daysLateOf(task({ task: 'x' }), '2026-09-25', 'Overdue', AS_OF)).toBe(5)
    // Done late and done on time.
    expect(
      daysLateOf(task({ task: 'x', completedDate: '2026-09-03' }), '2026-09-01', 'Done late', AS_OF),
    ).toBe(2)
    expect(daysLateOf(task({ task: 'x', completedDate: '2026-08-30' }), '2026-09-01', 'Done', AS_OF)).toBe(0)
    // Not yet due, not needed, or no due date: nothing to measure.
    expect(daysLateOf(task({ task: 'x' }), '2026-11-11', 'Not started', AS_OF)).toBeNull()
    expect(daysLateOf(task({ task: 'x' }), '2026-10-02', 'Blocked', AS_OF)).toBeNull()
    expect(daysLateOf(task({ task: 'x' }), '2026-09-01', 'Not needed', AS_OF)).toBeNull()
    expect(daysLateOf(task({ task: 'x' }), null, 'In progress', AS_OF)).toBeNull()
  })
})

describe('readiness of one person', () => {
  const tasks = (employeeId: string, list: [string, string | null, string | null, string?][]) =>
    list.map(([name, due, done, status]) =>
      task({
        employeeId,
        task: name,
        dueDate: due,
        completedDate: done,
        status: (status ?? (done ? 'Done' : 'Not started')) as never,
      }),
    )
  const start = (hireDate: string, rows: ReturnType<typeof tasks>, location = 'San Jose') => {
    const ctx = fixtureContext({ employees: [emp('E1', { hireDate, location })], onboardingTasks: rows })
    const b = onboardingBase(ctx)
    return { b, s: b.upcoming.starts[0] }
  }

  it('is Ready when every day-one task is done, and counts only day-one tasks', () => {
    const { b, s } = start(
      '2026-10-12',
      tasks('E1', [
        ['Laptop shipped', '2026-10-09', '2026-10-01'],
        ['Badge ready', '2026-10-10', null, 'Not needed'],
        ['30-day check-in', '2026-11-11', null],
      ]),
    )
    const r = readinessOf(s, b.asOf, b.settings)
    expect([r.done, r.total, r.status]).toEqual([2, 2, 'Ready'])
  })

  it('is On track, Behind or Not ready, and names the open task due first', () => {
    const rows = tasks('E1', [
      ['Laptop shipped', '2026-10-09', null],
      ['Background check cleared', '2026-10-09', null, 'Blocked'],
      ['Badge ready', '2026-10-10', null],
    ])
    const onTrack = start('2026-10-12', rows)
    const r = readinessOf(onTrack.s, AS_OF, onTrack.b.settings)
    expect(r.status).toBe('On track')
    expect(r.blocking?.name).toBe('Background check cleared')
    const behind = start('2026-10-12', tasks('E1', [['Laptop shipped', '2026-09-25', null]]))
    expect(readinessOf(behind.s, AS_OF, behind.b.settings).status).toBe('Behind')
    const soon = start('2026-10-02', tasks('E1', [['Laptop shipped', '2026-10-01', null]]))
    expect(readinessOf(soon.s, AS_OF, soon.b.settings).status).toBe('Not ready')
  })

  it('leaves Form I-9 out outside the US, and has no status without tasks', () => {
    const rows = tasks('E1', [
      ['I-9 Section 1', '2026-10-12', null],
      ['Laptop shipped', '2026-10-09', '2026-10-01'],
    ])
    const munich = start('2026-10-12', rows, 'Munich')
    expect(readinessOf(munich.s, AS_OF, munich.b.settings)).toMatchObject({ total: 1, status: 'Ready' })
    const none = start('2026-10-12', [])
    expect(readinessOf(none.s, AS_OF, none.b.settings).status).toBe('No tasks')
  })

  it('is ready on day one only when every task was completed by the start date', () => {
    const v = (done: string | null, status?: string) =>
      viewTask(
        task({ task: 'Laptop shipped', dueDate: '2026-09-04', completedDate: done, status: status as never }),
        '2026-09-07',
        'United States',
        AS_OF,
        S,
      )
    const p = (t: ReturnType<typeof v>) =>
      ({ tasks: [t], us: true, startDate: '2026-09-07' }) as unknown as Parameters<typeof readyOnDayOne>[0]
    expect(readyOnDayOne(p(v('2026-09-05')))).toBe(true)
    expect(readyOnDayOne(p(v('2026-09-08')))).toBe(false)
    expect(readyOnDayOne(p(v(null, 'Not needed')))).toBe(true)
    expect(readyOnDayOne(p(v(null)))).toBe(false)
  })
})
