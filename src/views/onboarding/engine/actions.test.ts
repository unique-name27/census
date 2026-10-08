/**
 * Onboarding's Action center items (docs/ROLES-V2.md 5.14; docs/ACTION-CENTER-AUDIT.md 4.2, 4.3
 * and part 6): ids that survive the hire, the trimmed day-one tasks, `matter` for the I-9 and the
 * export license, no closing full stop, the three hiring plan items for Finance, and the
 * Recruiter and Finance wording of Upcoming starts.
 */
import { describe, expect, it } from 'vitest'
import type { Mode } from '@/access/modes'
import { buildContext } from '@/data/context'
import { DATASET_KEYS, type DatasetKey, type Datasets, emptyDatasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import type { ActionItem } from '../../types'
import { onboardingBase } from './base'
import { actions, computeOnboarding } from './index'
import { AS_OF, cand, emp, fixtureContext, line, req, sampleContext, task } from './testkit'

const byId = (items: readonly ActionItem[], id: string) => {
  const x = items.find((i) => i.id === id)
  if (!x) throw new Error(`no item ${id}: ${items.map((i) => i.id).join(', ')}`)
  return x
}

/** A context over hand-built rows in a mode (no picks: the modes here need none). */
function modeContext(partial: Partial<Datasets>, mode: Mode) {
  const data = { ...emptyDatasets(), ...partial }
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: data[k].length } satisfies SourceMeta]),
  ) as Record<DatasetKey, SourceMeta>
  return buildContext({
    data,
    sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: AS_OF,
    showPay: false,
    access: { mode },
  })
}

describe('a start keeps its item ids across the hire', () => {
  const r = req('R1')
  const c = cand('APP-1', 'R1', { candidateName: 'Ana Ruiz', startDate: '2026-10-05' })
  const laptop = { task: 'Laptop shipped', dueDate: '2026-09-29', status: 'In progress' as const }

  it('keys a day-one task by the application ID before and after the HRIS enters the pre-hire', () => {
    const before = actions(
      fixtureContext({
        requisitions: [r],
        candidates: [c],
        onboardingTasks: [task({ ...laptop, applicationId: 'APP-1' })],
      }),
    )
    const after = actions(
      fixtureContext({
        requisitions: [r],
        candidates: [c],
        employees: [emp('E9', { name: 'Ana Ruiz', hireDate: '2026-10-05' })],
        onboardingTasks: [task({ ...laptop, employeeId: 'E9' })],
      }),
    )
    const id = 'onboarding:task:APP-1:Laptop shipped'
    expect(byId(before, id).subject).toMatchObject({ kind: 'candidates', id: 'APP-1' })
    // The same id once the employee row exists; the subject is now the pre-hire.
    expect(byId(after, id).subject).toMatchObject({ kind: 'employees', id: 'E9' })
  })
})

describe('day-one tasks that need someone now', () => {
  const start = '2026-10-05'
  const ctx = fixtureContext({
    employees: [
      emp('E1', { name: 'Ben Ito', hireDate: start, businessUnit: 'Operations', location: 'Austin' }),
    ],
    onboardingTasks: [
      // Overdue, blocked, not started and due soon: items.
      task({ employeeId: 'E1', task: 'Laptop shipped', dueDate: '2026-09-29', status: 'In progress' }),
      task({ employeeId: 'E1', task: 'Badge ready', dueDate: '2026-10-02', status: 'Blocked' }),
      task({ employeeId: 'E1', task: 'Accounts created', dueDate: '2026-10-01', status: 'Not started' }),
      // In progress and not yet due: normal workflow, on the countdown only.
      task({ employeeId: 'E1', task: 'Orientation booked', dueDate: '2026-10-01', status: 'In progress' }),
      task({ employeeId: 'E1', task: 'Benefits packet sent', status: 'Done', completedDate: '2026-09-20' }),
    ],
  })
  const items = actions(ctx).filter((i) => i.id.startsWith('onboarding:task:'))

  it('lists overdue, blocked and not-started tasks, and leaves tasks in progress and not yet due out', () => {
    expect(items.map((i) => i.id.split(':').at(-1)).sort()).toEqual([
      'Accounts created',
      'Badge ready',
      'Laptop shipped',
    ])
  })

  it('words the state with the date and no closing full stop, with its place', () => {
    const x = byId(items, 'onboarding:task:E1:Laptop shipped')
    expect(x.what).toBe('Laptop shipped is overdue for Ben Ito, who starts on 5 Oct, due 29 Sep')
    expect(x.place).toEqual({ businessUnit: 'Operations', location: 'Austin', region: 'Americas' })
    for (const i of items) expect(i.what.endsWith('.'), i.id).toBe(false)
  })
})

describe('the I-9 and the export license are one matter with Compliance', () => {
  it('gives a late I-9 Section 2 the matter of the person and legal exposure', () => {
    const ctx = fixtureContext({
      employees: [emp('E2', { name: 'Cy Doe', hireDate: '2026-09-21' })],
      onboardingTasks: [task({ employeeId: 'E2', task: 'I-9 Section 2', status: 'Not started' })],
    })
    const x = byId(actions(ctx), 'onboarding:i9:E2')
    expect(x).toMatchObject({ matter: 'i9:E2', exposure: true, severity: 'critical' })
    expect(x.what).toBe('I-9 Section 2 is not complete for Cy Doe, 6 d past its deadline of 24 Sep')
  })
})

describe('the hiring plan, for Finance', () => {
  const lines = [
    // Behind to date: 1 start against 6 planned; the full-year gap is most of the plan.
    line({ period: '2026-05-01', plannedHires: 6, department: 'Digital Design' }),
    // Future roles with nothing behind them: one soon, one later, one on a held req.
    line({ period: '2026-11-01', jobTitle: 'Design engineer', positionId: 'POS-1' }),
    line({ period: '2027-02-01', jobTitle: 'Verification engineer', positionId: 'POS-2' }),
    line({ period: '2027-01-01', jobTitle: 'Layout engineer', positionId: 'POS-3', reqId: 'R-HOLD' }),
    line({ period: '2026-12-01', reqId: 'R-PLANNED' }),
  ]
  const reqs = [
    req('R-NEW', { jobTitle: 'Test engineer', businessUnit: 'Operations', location: 'Austin' }),
    req('R-BACK', { reqType: 'Backfill' }),
    req('R-PLANNED'),
    req('R-HOLD', { status: 'On hold' }),
  ]
  const ctx = fixtureContext({
    hiringPlan: lines,
    requisitions: reqs,
    employees: [emp('E3', { hireDate: '2026-05-04' })],
  })
  const items = actions(ctx)

  it('lists an open req on no plan line, backfills apart, for Finance', () => {
    const x = byId(items, 'onboarding:not-in-plan:R-NEW')
    expect(x).toMatchObject({ ownerRole: 'finance', ownerName: 'Finance', severity: 'warning', tab: 'plan' })
    expect(x.what).toBe('Req R-NEW Test engineer is open but on no line of the FY27 v1 plan')
    expect(x.note).toBe('Could you confirm whether this req has budget, or add it to the plan?')
    expect(x.place).toMatchObject({ businessUnit: 'Operations', location: 'Austin' })
    expect(items.some((i) => i.id === 'onboarding:not-in-plan:R-BACK')).toBe(false)
    expect(resolveDrill(x.drill)?.kind).toBe('requisitions')
  })

  it('rolls a department behind plan into one item, critical past the gap share, with Filter to its unit', () => {
    const x = byId(items, 'onboarding:plan-behind:Silicon Engineering:Digital Design')
    expect(x).toMatchObject({ ownerRole: 'finance', severity: 'critical', subject: { kind: 'none' } })
    expect(x.what).toBe(
      'Digital Design, Silicon Engineering has 1 start against 6 planned to date (17%); the full-year gap is 9 of 10 planned starts',
    )
    expect(x.fingerprint).toBe('1/6')
    const spec = resolveDrill(x.drill)!
    expect(spec.kind).toBe('hiringPlan')
    expect(spec.filter?.businessUnit).toEqual(['Silicon Engineering'])
  })

  it('rolls future roles with no open req up per business unit, a warning within 60 days of the first start', () => {
    const x = byId(items, 'onboarding:plan-no-req:Silicon Engineering')
    expect(x).toMatchObject({
      ownerRole: 'finance',
      severity: 'warning',
      due: '2026-11-01',
      subject: { kind: 'none' },
    })
    expect(x.what).toBe(
      '3 planned roles in Silicon Engineering have no open req, the first planned to start in Nov; 1 has its req on hold or cancelled',
    )
    expect(x.fingerprint).toBeTruthy()
    const spec = resolveDrill(x.drill)!
    expect(spec.kind).toBe('hiringPlan')
    expect(spec.rows).toHaveLength(3)
    expect(spec.filter?.businessUnit).toEqual(['Silicon Engineering'])
    // A line whose req is open is covered; one roll-up per unit, never one per line.
    expect(items.filter((i) => i.id.startsWith('onboarding:plan-no-req:')).map((i) => i.id)).toEqual([
      'onboarding:plan-no-req:Silicon Engineering',
    ])
    for (const i of items) expect(i.subject.kind === 'employees', i.id).toBe(false)
  })
})

describe('Upcoming starts by mode', () => {
  const data = { employees: [emp('E1', { hireDate: '2026-10-05' })] }
  const base = (mode: Mode) => onboardingBase(modeContext(data, mode))

  it('words contingencies as the team holding them in Manager and Finance mode', () => {
    expect(base('manager').masked).toBe(true)
    expect(base('finance').masked).toBe(true)
    expect(base('recruiter').masked).toBe(false)
    expect(base('hr').masked).toBe(false)
  })

  it('leaves I-9 tasks out of readiness by task in Manager and Recruiter mode', () => {
    expect(base('manager').hideI9).toBe(true)
    expect(base('recruiter').hideI9).toBe(true)
    expect(base('finance').hideI9).toBe(false)
    expect(base('hr-ops').hideI9).toBe(false)
  })
})

describe('on the sample', () => {
  const ctx = sampleContext()
  const items = actions(ctx)

  it('every item has a drill, uses, a place, and no closing full stop', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    for (const x of items) {
      expect(resolveDrill(x.drill), x.id).not.toBeNull()
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      expect(x.place, x.id).toBeDefined()
      expect(x.what.endsWith('.'), x.id).toBe(false)
    }
  })

  it('has the plan items when a plan is loaded', () => {
    expect(computeOnboarding(ctx).plan).not.toBeNull()
    expect(items.some((i) => i.id.startsWith('onboarding:not-in-plan:'))).toBe(true)
    expect(items.some((i) => i.id.startsWith('onboarding:plan-behind:'))).toBe(true)
    expect(items.some((i) => i.id.startsWith('onboarding:plan-no-req:'))).toBe(true)
  })
})
