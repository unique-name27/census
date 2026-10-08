/**
 * The Org chart's open items for the Action center: single-report chains and new managers with
 * large teams, for the manager's HR business partner, scoped by the filters.
 */
import { describe, expect, it } from 'vitest'
import { resolveDrill } from '@/drill/Drill'
import { ACTION_OWNER_ROLES } from '../../types'
import { orgActions } from './actions'
import { ctxFor, person, sampleCtx, smallCompany } from './fixtures'
import { orgModel } from './model'

const NAGGING = /\b(chas\w*|push\w*|nag\w*|ping\w*|hound\w*|remind\w*)\b/i

describe('on a small company (as of 30 Sep 2026)', () => {
  const rows = smallCompany().map((e) =>
    e.employeeId === 'DIR-1' ? { ...e, hrbp: 'Mei Chen', name: 'Dana Director' } : e,
  )
  rows.push(person('HR-1', 'CEO', { name: 'Mei Chen', department: 'People' }))
  // A manager hired in March with 8 direct reports.
  rows.push(
    person('NEW', 'VP-A', { name: 'Arjun New', level: 'M1', hireDate: '2026-03-02', hrbp: 'Mei Chen' }),
  )
  for (let i = 1; i <= 8; i++) rows.push(person(`N-${i}`, 'NEW'))
  const ctx = ctxFor({ employees: rows })
  const items = orgActions(ctx)

  it('lists the single-report chain for the HR business partner', () => {
    const x = items.find((i) => i.id === 'org:single-report-chain:DIR-1')!
    expect(x).toMatchObject({
      ownerRole: 'hrbp',
      ownerName: 'Mei Chen',
      ownerId: 'HR-1',
      severity: 'warning',
      view: 'org',
      tab: 'chart',
      subject: { kind: 'employees', id: 'DIR-1', label: 'Dana Director' },
    })
    expect(x.what).toBe('Dana Director manages only Name MGR-3, who leads 5 people')
    expect(x.note).toBe(
      'Could we review with Dana whether this layer is still needed, or whether Name MGR-3 could report one level up?',
    )
    expect(resolveDrill(x.drill)!.rows.map((e) => (e as { employeeId: string }).employeeId)).toEqual([
      'DIR-1',
      'MGR-3',
    ])
    // MGR-2's only report leads nobody: a narrow span, not a chain.
    expect(items.some((i) => i.id === 'org:single-report-chain:MGR-2')).toBe(false)
  })

  it('lists a new manager with a large team', () => {
    const x = items.find((i) => i.id === 'org:new-manager:NEW')!
    expect(x).toMatchObject({ ownerRole: 'hrbp', ownerName: 'Mei Chen', severity: 'warning' })
    expect(x.what).toBe('Arjun New has managed since 2 Mar and already leads 8 direct reports')
    expect(x.note).toBe(
      'Could we set up a monthly check-in with Arjun on team load for their first year as a manager?',
    )
    expect(resolveDrill(x.drill)!.rows).toHaveLength(8)
  })

  it('keeps to the people in scope', () => {
    const scoped = orgActions(ctxFor({ employees: rows }, { leaderId: 'VP-A' }))
    expect(scoped.map((i) => i.id)).toEqual(['org:new-manager:NEW'])
    expect(orgActions(ctxFor({}))).toEqual([])
  })

  it('shares one model per context', () => {
    expect(orgModel(ctx)).toBe(orgModel(ctx))
  })
})

describe('on the sample company', () => {
  const ctx = sampleCtx()
  const items = orgActions(ctx)

  it('story 4: Arjun Deshpande, the new manager with 9 direct reports', () => {
    const fresh = items.filter((i) => i.id.startsWith('org:new-manager:'))
    expect(fresh.map((i) => i.subject.label)).toEqual(['Arjun Deshpande'])
    expect(fresh[0].what).toContain('9 direct reports')
    expect(fresh[0].ownerId).toBeTruthy()
  })

  it('every single-report chain on the chart is listed once, with a named HR business partner', () => {
    const m = orgModel(ctx)
    const chains = [...m.flags].filter(([, fs]) => fs.some((f) => f.kind === 'single-report-chain'))
    const listed = items.filter((i) => i.id.startsWith('org:single-report-chain:'))
    expect(listed.map((i) => i.subject.id).sort()).toEqual(chains.map(([id]) => id).sort())
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    for (const x of items) {
      expect(ACTION_OWNER_ROLES, x.id).toContain(x.ownerRole)
      expect(x.ownerId, x.id).toBeTruthy()
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(NAGGING)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(/—|!/)
      expect(resolveDrill(x.drill)?.rows.length, x.id).toBeGreaterThan(0)
    }
  })
})
