import { describe, expect, it } from 'vitest'
import type { Candidate } from '@/data/schema'
import { metricsWith } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { M } from '../metrics'
import { readSettings } from './settings'
import { emp, fixtureContext, task } from './testkit'
import { POLICY_TASK, policyAcks } from './training'

// As of Wed 30 Sep 2026; acknowledgments are due five business days after the start.
const T1 = emp({ hireDate: '2026-09-01' })
const T2 = emp({ hireDate: '2026-09-01' })
const T3 = emp({ hireDate: '2026-09-28' })
const T4 = emp({ hireDate: '2026-09-01' })
const T7 = emp({ hireDate: '2026-05-04' })
const cand: Candidate = {
  applicationId: 'A-1',
  candidateName: 'Pat Doe',
  reqId: 'R-1',
  source: 'Referral',
  currentStage: 'Hired',
  status: 'Hired',
  appliedDate: '2026-06-01',
  hiredDate: '2026-07-01',
  startDate: '2026-08-03',
}
const tasks = [
  task({ employeeId: T1.employeeId, completedDate: '2026-09-07' }),
  task({ employeeId: T2.employeeId, completedDate: '2026-09-10' }),
  task({ employeeId: T3.employeeId, status: 'Not started' }),
  task({ employeeId: T4.employeeId, status: 'Not needed' }),
  task({ applicationId: 'A-1', status: 'Not started' }),
  task({ employeeId: 'GONE', dueDate: '2026-07-01', completedDate: '2026-06-30' }),
  task({ employeeId: T7.employeeId, completedDate: '2026-05-05' }),
  task({ employeeId: T1.employeeId, task: 'Laptop shipped', completedDate: '2026-09-30' }),
]

function acks(metrics?: MetricsApi) {
  const ctx = fixtureContext(
    { employees: [T1, T2, T3, T4, T7], candidates: [cand], onboardingTasks: tasks },
    { metrics },
  )
  return policyAcks(ctx, ctx.window, readSettings(ctx.metrics))
}

describe('policy acknowledgments within 5 business days', () => {
  it('judges acknowledgment tasks whose deadline has passed, from the start date', () => {
    const p = acks()
    expect(p.available).toBe(true)
    // T3 is not due yet; T4 is not needed; the laptop task is another task.
    expect(p.judged).toHaveLength(5)
    expect(p.onTime).toHaveLength(3)
    expect(p.rate).toBe(0.6)
    // The candidate's start comes from the accepted offer; an unknown person falls back to the due date.
    expect(p.judged.find((x) => x.task.applicationId === 'A-1')?.deadline).toBe('2026-08-10')
    expect(p.judged.find((x) => x.task.employeeId === 'GONE')?.deadline).toBe('2026-07-01')
    expect(p.judged.every((x) => x.task.task === POLICY_TASK)).toBe(true)
  })

  it('reads the business days allowed from the dictionary', () => {
    const p = acks(metricsWith({ [M.policyAcks]: { businessDays: 10 } }))
    expect(p.onTime).toHaveLength(4)
  })

  it('is unavailable without acknowledgment tasks', () => {
    const ctx = fixtureContext({ employees: [T1] })
    expect(policyAcks(ctx, ctx.window, readSettings(ctx.metrics))).toEqual({
      available: false,
      judged: [],
      onTime: [],
      rate: null,
    })
  })
})
