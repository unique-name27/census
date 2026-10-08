/**
 * The Talent items new in docs/ROLES-V2.md 5.14 (courses below their on-time target, ratings
 * missing in the latest cycle), the review coverage rows by business unit, roll-up fingerprints,
 * and the audit's rule that no flight-risk model score reaches item text.
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DEFAULT_FILTERS } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import type { ActionItem } from '../../types'
import { talentActions } from './actions'
import { talentModel } from './index'
import { course, ctxFor, emp, review, sourcesFor } from './test-fixtures'

const byId = (items: readonly ActionItem[], id: string) => {
  const x = items.find((i) => i.id === id)
  if (!x) throw new Error(`no item ${id}: ${items.map((i) => i.id).join(', ')}`)
  return x
}

const team = Array.from({ length: 6 }, (_, i) => emp(`P${i}`, { name: `Person ${i}`, managerId: 'MGR' }))
const manager = emp('MGR', { name: 'Priya Raman', level: 'M1' })

describe('required courses below their on-time target', () => {
  const learning = [
    // Export control: 6 due in the period, 4 on time (67%), 2 still open past due.
    ...team.map((e, i) =>
      course(e.employeeId, 'Export control', {
        dueDate: '2026-08-26',
        completedDate: i < 4 ? '2026-08-20' : null,
      }),
    ),
    // Code of conduct: 6 due, all on time.
    ...team.map((e) =>
      course(e.employeeId, 'Code of conduct', { dueDate: '2026-08-26', completedDate: '2026-08-01' }),
    ),
    // Ethics: 4 due (under the minimum), none on time.
    ...team.slice(0, 4).map((e) => course(e.employeeId, 'Ethics', { dueDate: '2026-08-26' })),
  ]
  const items = talentActions(ctxFor({ employees: [manager, ...team], learning }))

  it('lists one item per course under the target, with 5 or more due, for Talent management', () => {
    const x = byId(items, 'talent:course-below-target:Export control')
    expect(x).toMatchObject({
      kind: 'Required course below target',
      ownerRole: 'talent',
      ownerName: 'Talent management',
      severity: 'warning',
      tab: 'learning',
      subject: { kind: 'none', label: 'Export control' },
      fingerprint: '4/6/2',
    })
    expect(x.what).toBe(
      'Export control: 67% completed on time against a target of 95%, 2 assignments overdue',
    )
    const spec = resolveDrill(x.drill)!
    expect(spec.kind).toBe('learning')
    expect(spec.rows).toHaveLength(2)
    expect(items.some((i) => i.id === 'talent:course-below-target:Code of conduct')).toBe(false)
    expect(items.some((i) => i.id === 'talent:course-below-target:Ethics')).toBe(false)
  })

  it('reopens a handled training roll-up when its content changes', () => {
    const fp = byId(items, 'talent:training-overdue:MGR').fingerprint
    const more = talentActions(
      ctxFor({
        employees: [manager, ...team],
        learning: [...learning, course('P0', 'Privacy', { dueDate: '2026-09-01' })],
      }),
    )
    expect(byId(more, 'talent:training-overdue:MGR').fingerprint).not.toBe(fp)
  })
})

describe('ratings missing in the latest cycle', () => {
  const people = [
    manager,
    ...team,
    // Hired 60 days before the cycle: not expected to have a rating.
    emp('NEW', { managerId: 'MGR', hireDate: '2026-05-01' }),
    // Left after the cycle: nobody can rate them now.
    emp('LEFT', { managerId: 'MGR', terminationDate: '2026-08-01', terminationType: 'Voluntary' }),
  ]
  const reviews = [
    // Rated in the mid-year cycle: P0 to P3 and the manager. P4 and P5 are not.
    ...['MGR', 'P0', 'P1', 'P2', 'P3'].map((id) => review(id, '2026 Mid-year', '2026-06-30', 3)),
    // A cycle 15 days before the as-of date is still inside its grace days.
    review('P0', '2026 Q3 check-in', '2026-09-15', 3),
  ]
  const items = talentActions(ctxFor({ employees: people, reviews }))

  it('groups the unrated eligible people by manager, for the manager, critical 60 days on', () => {
    const x = byId(items, 'talent:review-missing:MGR')
    expect(x).toMatchObject({
      kind: 'Ratings missing',
      ownerRole: 'manager',
      ownerId: 'MGR',
      ownerName: 'Priya Raman',
      severity: 'critical',
      due: '2026-07-30',
      tab: 'performance',
      subject: { kind: 'none', label: "Priya Raman's team" },
    })
    expect(x.what).toBe("2 people on Priya Raman's team have no rating in the 2026 Mid-year cycle")
    expect(x.note).toBe('Could you complete these ratings or let me know when they will be in?')
    const spec = resolveDrill(x.drill)!
    expect(spec.kind).toBe('employees')
    expect(spec.rows.map((e) => (e as { employeeId: string }).employeeId)).toEqual(['P4', 'P5'])
  })

  it('reopens when the unrated people change', () => {
    const fp = byId(items, 'talent:review-missing:MGR').fingerprint
    const later = talentActions(
      ctxFor({ employees: people, reviews: [...reviews, review('P4', '2026 Mid-year', '2026-06-30', 4)] }),
    )
    const x = byId(later, 'talent:review-missing:MGR')
    expect(x.what).toBe("1 person on Priya Raman's team has no rating in the 2026 Mid-year cycle")
    expect(x.fingerprint).not.toBe(fp)
  })
})

describe('review coverage by business unit', () => {
  it('counts the active employees rated in the latest cycle per unit, with the unrated people', () => {
    const people = [...team, ...Array.from({ length: 3 }, (_, i) => emp(`S${i}`, { businessUnit: 'Sales' }))]
    const reviews = ['P0', 'P1', 'P2', 'S0'].map((id) => review(id, '2026 Mid-year', '2026-06-30', 3))
    const rows = talentModel(ctxFor({ employees: people, reviews })).performance.coverageByUnit
    expect(rows.map((r) => [r.businessUnit, r.active, r.rated, r.share])).toEqual([
      ['Engineering', 6, 3, 0.5],
      // Under the anonymity minimum: counted, the share hidden.
      ['Sales', 3, 1, null],
    ])
    expect(rows[0].unrated.map((e) => e.employeeId)).toEqual(['P3', 'P4', 'P5'])
  })
})

describe('no flight-risk model score in item text', () => {
  it('words Critical roles from the recorded risk of loss only, even when the plans record none', () => {
    const data = generateSample()
    const stripped = {
      ...data,
      succession: data.succession.map((p) => ({ ...p, incumbentRiskOfLoss: null })),
    }
    const ctx = buildContext({
      data: stripped,
      sources: sourcesFor(stripped, 'sample'),
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: false,
    })
    const roles = talentActions(ctx).filter((i) => i.id.startsWith('talent:critical-role:'))
    expect(roles.length).toBeGreaterThan(0)
    // The model still scores incumbents; none of it reaches the words.
    expect(talentModel(ctx).succession.roles.some((r) => r.modelRisk === 'High')).toBe(true)
    for (const x of roles) expect(`${x.what} ${x.note}`, x.id).not.toMatch(/risk/i)
  })
})
