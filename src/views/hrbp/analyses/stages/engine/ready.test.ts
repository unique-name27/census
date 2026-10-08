/**
 * Engineering by stage holds back on Employees whose two job columns look swapped (docs/TAXONOMY.md,
 * 6.3): data mapped before job families held job functions would read as plausible stages.
 */
import { describe, expect, it } from 'vitest'
import { sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { stagesReady } from '.'

describe('stagesReady', () => {
  it('is ready on the sample', () => {
    expect(stagesReady(sampleCtx())).toEqual({ ready: true })
  })

  it('holds back with the swapped sentence when families sit inside functions', () => {
    const ctx = sampleCtx()
    const swapped = {
      ...ctx,
      all: {
        ...ctx.all,
        employees: ctx.all.employees.map((e) => ({
          ...e,
          jobFamily: e.jobFunction,
          jobFunction: e.jobFamily,
        })),
      },
    } as AnalyticsContext
    const r = stagesReady(swapped)
    expect(r.ready).toBe(false)
    expect(r).toMatchObject({ dataRoom: true })
    expect(r.ready ? '' : r.message).toMatch(
      /^These two columns look swapped\. In Census a job family contains job functions, but here \d+ job families sit inside \d+ job functions\. Upload Employees again and swap the two columns in the mapping step\.$/,
    )
  })
})
