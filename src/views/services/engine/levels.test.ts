import { describe, expect, it } from 'vitest'
import { CASE_CATEGORIES, caseCategoryByName, TRANSACTION_PROCESS } from '@/data/schema'
import { ATLAS_PROCESSES, processLabel, SERVICE_LEVELS, type ServiceLevelId } from './catalog'
import { caseColumns, caseFacts, txFacts } from './facts'
import { levelGap, levelStatus, processCoverage, scorecard } from './levels'
import { emp, kase, tx, win } from './testkit'

const AS_OF = '2026-09-30'
const W = win('2026-09-01', '2026-09-30')
const def = (id: ServiceLevelId) => SERVICE_LEVELS.find((d) => d.id === id)!
const times = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))

function card(cases: ReturnType<typeof kase>[], rows: ReturnType<typeof tx>[] = []) {
  const cols = caseColumns(cases)
  return scorecard({
    cases: caseFacts(cases, AS_OF, cols),
    tx: txFacts(rows, AS_OF, new Map([['E1', emp()]])),
    window: W,
    asOf: AS_OF,
    hasResolved: cols.resolvedAt,
    hasResponse: cols.firstResponseAt,
    hasDue: rows.some((r) => !!r.dueDate),
  })
}

describe('catalog', () => {
  it('cites an Atlas process and keeps a unique id for every measure', () => {
    expect(new Set(SERVICE_LEVELS.map((d) => d.id)).size).toBe(SERVICE_LEVELS.length)
    for (const d of SERVICE_LEVELS) {
      expect(d.processId).toMatch(/^[A-Z]{2}-\d{2}$/)
      expect(d.atlas.length).toBeGreaterThan(10)
    }
    for (const id of [
      'PY-05',
      'DS-07',
      'LV-01',
      'ON-03',
      'OF-05',
      'DS-01',
      'DS-04',
      'ER-02',
      'BN-03',
      'MV-06',
    ])
      expect(SERVICE_LEVELS.some((d) => d.processId === id)).toBe(true)
  })

  it('names and owns every Atlas process a case category or transaction type maps to', () => {
    const ids = [...CASE_CATEGORIES.map((c) => c.processId), ...Object.values(TRANSACTION_PROCESS)]
    for (const id of ids) {
      const p = ATLAS_PROCESSES.get(id)
      expect(p, id).toBeDefined()
      expect(processLabel(id)).toBe(`${id} ${p!.name}`)
      expect(p!.owner.length, id).toBeGreaterThan(2)
    }
    // Policy questions go to policy lifecycle governance; pay and equity questions to the annual review.
    expect(ATLAS_PROCESSES.get(caseCategoryByName.get('Policy question')!.processId)).toMatchObject({
      id: 'DS-08',
      name: 'Policy lifecycle governance',
      owner: 'People Ops (HR Policy & Governance)',
    })
    expect(ATLAS_PROCESSES.get(caseCategoryByName.get('Compensation & equity')!.processId)).toMatchObject({
      id: 'CO-02',
      name: 'Annual compensation review',
      owner: 'Total Rewards',
    })
  })
})

describe('status and gap', () => {
  it('sets Met, At risk within 5 pts and Missed for a minimum share', () => {
    const d = def('ds07-verification-2bd')
    expect(levelStatus(d, 0.95)).toBe('Met')
    expect(levelStatus(d, 0.9)).toBe('At risk')
    expect(levelStatus(d, 0.899)).toBe('Missed')
    expect(levelStatus(d, null)).toBeNull()
    expect(levelGap(d, 0.9)).toBeCloseTo(-0.05)
  })

  it('treats "under 2%" strictly and gives a positive gap when better', () => {
    const d = def('ds01-retro-share')
    expect(levelStatus(d, 0.019)).toBe('Met')
    expect(levelStatus(d, 0.02)).toBe('At risk')
    expect(levelGap(d, 0.01)).toBeCloseTo(0.01)
  })

  it('uses a relative band above a ceiling share, so 3.5 times the target is Missed', () => {
    const d = def('ds01-retro-share')
    expect(levelStatus(d, 0.025)).toBe('At risk')
    expect(levelStatus(d, 0.026)).toBe('Missed')
    expect(levelStatus(d, 0.069)).toBe('Missed')
  })

  it('uses a 10% band for day targets', () => {
    const d = def('er02-median-days')
    expect(levelStatus(d, 30)).toBe('Met')
    expect(levelStatus(d, 33)).toBe('At risk')
    expect(levelStatus(d, 33.5)).toBe('Missed')
    expect(levelGap(d, 25)).toBe(5)
  })
})

describe('scorecard', () => {
  it('counts business days Monday to Friday and open cases past the clock as missed', () => {
    // Friday 4 Sep to Tuesday 8 Sep is 2 business days; to Wednesday 9 Sep is 3.
    const rows = [
      ...times(4, () => kase({ openedAt: '2026-09-04T16:00', resolvedAt: '2026-09-08T10:00' })),
      kase({ openedAt: '2026-09-04T16:00', resolvedAt: '2026-09-09T10:00' }),
      kase({ openedAt: '2026-09-21T09:00', resolvedAt: null, status: 'In progress' }),
      kase({ openedAt: '2026-09-29T09:00', resolvedAt: null, status: 'In progress' }),
    ]
    const py = card(rows).find((r) => r.id === 'py05-payroll-2bd')!
    expect(py.n).toBe(6)
    expect(py.actual).toBeCloseTo(4 / 6)
    expect(py.status).toBe('Missed')
    expect(py.misses).toHaveLength(2)
    expect(py.window).toBe(W.label)
  })

  it('measures first response for leave cases on a 1 business day clock', () => {
    const rows = times(5, (i) =>
      kase({
        category: 'Leave & accommodation',
        openedAt: '2026-09-07T09:00',
        firstResponseAt: i === 0 ? '2026-09-09T09:00' : '2026-09-08T09:00',
      }),
    )
    const lv = card(rows).find((r) => r.id === 'lv01-leave-response-1bd')!
    expect(lv.actual).toBeCloseTo(0.8)
    expect(lv.status).toBe('Missed')
  })

  it('takes the median days to close for employee relations', () => {
    const rows = times(5, (i) =>
      kase({
        category: 'Employee relations',
        openedAt: '2026-08-01T09:00',
        resolvedAt: `2026-09-${String(10 + i * 5).padStart(2, '0')}T09:00`,
      }),
    )
    const er = card(rows).find((r) => r.id === 'er02-median-days')!
    expect(er.actual).toBe(50)
    expect(er.status).toBe('Missed')
    expect(er.gap).toBe(-20)
  })

  it('scores transactions against their due dates and the retro share', () => {
    const hires = [
      ...times(9, () => tx({ type: 'New hire', dueDate: '2026-09-10', completedDate: '2026-09-09' })),
      tx({ type: 'New hire', dueDate: '2026-09-10', completedDate: '2026-09-12' }),
    ]
    const changes = [
      ...times(49, () =>
        tx({ type: 'Job change', dueDate: '2026-09-23', completedDate: '2026-09-20', retro: false }),
      ),
      tx({ type: 'Compensation change', dueDate: '2026-09-23', completedDate: '2026-09-25', retro: true }),
    ]
    const rows = card([], [...hires, ...changes])
    const on03 = rows.find((r) => r.id === 'on03-hire-day-minus-3')!
    expect(on03.actual).toBeCloseTo(0.9)
    expect(on03.status).toBe('Missed')
    const ds01 = rows.find((r) => r.id === 'ds01-retro-share')!
    expect(ds01.actual).toBeCloseTo(0.02)
    expect(ds01.n).toBe(50)
    expect(ds01.status).toBe('At risk')
  })

  it('scores leave designation on a 5 business day clock beside the calendar-hour case SLA', () => {
    // Opened Monday 7 Sep. Resolved Friday 11 Sep (4 bd, 4 d: inside both clocks), Monday 14 Sep
    // (5 bd but 7 d 1 h: inside the Atlas clock, past the 168 h case target) or Tuesday 15 Sep (6 bd).
    const leave = (resolvedAt: string) =>
      kase({
        category: 'Leave & accommodation',
        resolutionTargetHours: 168,
        openedAt: '2026-09-07T09:00',
        resolvedAt,
      })
    const rows = [
      ...times(6, () => leave('2026-09-11T09:00')),
      ...times(2, () => leave('2026-09-14T10:00')),
      ...times(2, () => leave('2026-09-15T10:00')),
    ]
    const lv = card(rows).find((r) => r.id === 'lv01-leave-designation-5bd')!
    expect(lv.processId).toBe('LV-01')
    expect(lv.actual).toBeCloseTo(0.8)
    expect(lv.status).toBe('Missed')
    expect(lv.caseSla).toBeCloseTo(0.6)
    expect(lv.caseSlaTarget).toBe('7 d')
    const py = card(times(5, () => kase())).find((r) => r.id === 'py05-payroll-2bd')!
    expect(py.caseSla).toBe(1)
    expect(py.caseSlaTarget).toBe('48 h')
    expect(card([]).find((r) => r.id === 'on03-hire-day-minus-3')!.caseSla).toBeNull()
  })

  it('needs 5 people behind a measure, not just 5 cases', () => {
    const rows = times(9, (i) => kase({ requesterId: `EX${i % 4}` }))
    const py = card(rows).find((r) => r.id === 'py05-payroll-2bd')!
    // Nine cases from four people: no rate, and the count itself is hidden.
    expect(py.n).toBeNull()
    expect(py.actual).toBeNull()
    expect(py.caseSla).toBeNull()
  })

  it('gives no actual below 5 rows or without the needed columns', () => {
    const few = card(times(3, () => kase()))
    expect(few.find((r) => r.id === 'py05-payroll-2bd')!.actual).toBeNull()
    expect(few.find((r) => r.id === 'py05-payroll-2bd')!.n).toBeNull()
    const empty = card([])
    expect(empty.every((r) => r.actual === null && r.status === null)).toBe(true)
  })
})

describe('process coverage', () => {
  it('lists every governing process with cases opened and transactions due in the window', () => {
    const cases = caseFacts(
      [...times(5, () => kase()), kase({ category: 'Benefits' })],
      AS_OF,
      caseColumns([kase()]),
    )
    const exits = times(5, () => tx({ type: 'Termination' }))
    const rows = processCoverage(cases, txFacts(exits, AS_OF, new Map()), W)
    const py05 = rows.find((r) => r.processId === 'PY-05')!
    expect(py05).toMatchObject({
      process: 'Payroll error correction & overpayment recovery',
      cases: 5,
      transactions: 0,
    })
    expect(py05.covers).toBe('Payroll cases')
    expect(rows.find((r) => r.processId === 'OF-05')).toMatchObject({ cases: 0, transactions: 5 })
    // One benefits case is one person: the count is hidden, not shown as 1.
    expect(rows.find((r) => r.processId === 'BN-03')).toMatchObject({ cases: null, transactions: 0 })
    expect(rows.find((r) => r.processId === 'DS-01')?.covers).toBe(
      'HR data & records cases, Personal data change transactions',
    )
    expect(rows.map((r) => r.processId)).toEqual([...rows.map((r) => r.processId)].sort())
  })
})
