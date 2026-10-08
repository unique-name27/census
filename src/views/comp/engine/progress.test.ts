/**
 * The comp cycle's dates and merit cycle progress (docs/ROLES-V2.md 5.6 and 5.14): where the
 * as-of date sits among the cycle dates, who is eligible, and proposals entered as a share of
 * eligible people by business unit with spend against budget as each row's status.
 */
import { describe, expect, it } from 'vitest'
import type { CycleDates } from '@/metrics/compCycle'
import { metricsWith } from '@/metrics/testing'
import { M } from '../metrics'
import { cycleCalendar, isEligible, proposalProgress } from './cycle'
import { cycleDatesSentence } from './definitions'
import { compModel } from './model'
import { defaultRules } from './rules'
import { AS_OF, context, dataset, team } from './test-fixtures'

const NONE: CycleDates = {
  open: null,
  calibration: null,
  close: null,
  effective: null,
  eligibleHiredBy: null,
}

describe('the cycle calendar', () => {
  const proposals = [
    { merit: 0.03, hireDate: '2024-01-01' },
    { merit: 0.03, hireDate: '2026-03-30' },
    { merit: null, hireDate: '2026-05-01' },
  ]

  it('is open with proposals and no dates, eligibility from the latest hire with a proposal', () => {
    expect(cycleCalendar(NONE, proposals, AS_OF, 14)).toMatchObject({
      state: 'open',
      cutoff: '2026-03-30',
      cutoffInferred: true,
      daysToClose: null,
    })
    expect(cycleCalendar(NONE, [], AS_OF, 14)).toMatchObject({ state: 'not-started', cutoff: null })
  })

  it('reads the dates: not open before the open date, closed after the close date', () => {
    expect(cycleCalendar({ ...NONE, open: '2026-10-15' }, proposals, AS_OF, 14).state).toBe('not-open')
    expect(cycleCalendar({ ...NONE, close: '2026-09-29' }, proposals, AS_OF, 14).state).toBe('closed')
    // The close day itself is still open.
    const last = cycleCalendar({ ...NONE, close: AS_OF }, proposals, AS_OF, 14)
    expect(last).toMatchObject({ state: 'open', daysToClose: 0 })
    expect(cycleCalendar({ ...NONE, open: '2026-09-01' }, [], AS_OF, 14).state).toBe('open')
  })

  it('takes the eligibility date over the inferred one', () => {
    const cal = cycleCalendar({ ...NONE, eligibleHiredBy: '2026-06-30' }, proposals, AS_OF, 14)
    expect(cal).toMatchObject({ cutoff: '2026-06-30', cutoffInferred: false })
    expect(isEligible({ merit: null, hireDate: '2026-05-01' }, cal.cutoff)).toBe(true)
    expect(isEligible({ merit: null, hireDate: '2026-07-01' }, cal.cutoff)).toBe(false)
    // A proposal makes someone eligible whatever their hire date.
    expect(isEligible({ merit: 0.02, hireDate: '2026-09-01' }, cal.cutoff)).toBe(true)
  })

  it('reads the dates from Settings, Compensation cycle, and says them', () => {
    const metrics = metricsWith({
      [M.proposals]: { openDate: '2026-09-01', closeDate: '2026-10-30', eligibleHiredBy: '2026-04-01' },
    })
    const m = compModel(context(dataset({}), { metrics }))
    expect(m.rules.cycleDates).toMatchObject({ open: '2026-09-01', close: '2026-10-30', calibration: null })
    expect(cycleDatesSentence(m.rules)).toBe(
      'The cycle opens 1 Sep 2026 and closes 30 Oct 2026. People hired by 1 Apr 2026 are eligible.',
    )
    expect(cycleDatesSentence(defaultRules())).toBe(
      'No cycle dates are set. Eligible means hired by the latest hire date among people with a proposal.',
    )
  })
})

describe('merit cycle progress', () => {
  it('proposals entered as a share of eligible people by business unit, spend against budget as status', () => {
    const hot = team(6, { businessUnit: 'Go-to-Market', hireDate: '2024-02-01' }, (_, i) => ({
      meritPct: i < 5 ? 0.06 : null,
    }))
    const calm = team(5, { businessUnit: 'Operations', hireDate: '2024-02-01' })
    const small = team(2, { businessUnit: 'Corporate', hireDate: '2024-02-01' })
    const d = dataset({
      employees: [...hot.employees, ...calm.employees, ...small.employees],
      comp: [...hot.comp, ...calm.comp, ...small.comp],
    })
    const m = compModel(context(d))
    const p = proposalProgress(m)
    expect(p.total).toMatchObject({ eligible: 13, proposed: 12, missing: 1 })
    const gtm = p.rows.find((r) => r.group === 'Go-to-Market')!
    expect(gtm).toMatchObject({ eligible: 6, proposed: 5, missing: 1, status: 'over', dim: 'businessUnit' })
    expect(gtm.share).toBeCloseTo(5 / 6, 9)
    expect(gtm.missingPeople).toHaveLength(1)
    expect(p.rows.find((r) => r.group === 'Operations')).toMatchObject({ share: 1, status: 'within' })
    // A unit under the anonymity minimum keeps its counts, never its share or spend.
    const corp = p.rows.find((r) => r.group === 'Corporate')!
    expect(corp).toMatchObject({ eligible: 2, proposed: 2, share: null, spendPct: null, status: null })
    // The model holds the same progress.
    expect(m.cycle.progress.rows.map((r) => r.group)).toEqual(p.rows.map((r) => r.group))
  })
})
