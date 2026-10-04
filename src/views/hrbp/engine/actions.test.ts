/**
 * People stats for the Scorecard and the Action center: the summary's measures and the open
 * items (stay conversations after a regretted-exit cluster, span outliers for the HR business
 * partner), on hand-built data and on the sample company.
 */
import { describe, expect, it } from 'vitest'
import { resolveDrill } from '@/drill/Drill'
import { metricsWith } from '@/metrics/testing'
import { ACTION_OWNER_ROLES, type ActionItem } from '../../types'
import { ID } from '../metrics'
import { hrbpActions, hrbpSummary, SUMMARY_KPIS } from './actions'
import { ctxOf, emp, leaver, many, sampleCtx } from './fixtures'
import { hrbpModel } from './index'
import { HRBP_FALLBACK, ownerLookup } from './owners'

const NAGGING = /\b(chas\w*|push\w*|nag\w*|ping\w*|hound\w*|remind\w*)\b/i

const byId = (items: readonly ActionItem[], id: string) => {
  const x = items.find((i) => i.id === id)
  if (!x) throw new Error(`no item ${id}: ${items.map((i) => i.id).join(', ')}`)
  return x
}

describe('owners named in the data', () => {
  it('resolves a unique active name to an employee ID, never an ambiguous or departed one', () => {
    const people = [
      emp({ employeeId: 'H1', name: 'Mei Chen' }),
      emp({ employeeId: 'H2', name: 'Sam Lee' }),
      emp({ employeeId: 'H3', name: 'Sam  lee' }),
      emp({
        employeeId: 'H4',
        name: 'Old Partner',
        terminationDate: '2026-01-31',
        terminationType: 'Voluntary',
      }),
    ]
    const look = ownerLookup(people, '2026-09-30')
    expect(look('mei chen')).toBe('H1')
    expect(look('Sam Lee')).toBeNull()
    expect(look('Old Partner')).toBeNull()
    expect(look(null)).toBeNull()
  })
})

describe('action items on hand-built data (as of 30 Sep 2026)', () => {
  const partner = emp({ employeeId: 'HR1', name: 'Mei Chen', department: 'People' })
  const hayes = emp({ employeeId: 'M1', name: 'Heather Hayes', level: 'M1', hrbp: 'Mei Chen' })
  const team = many(6, { managerId: 'M1', hrbp: 'Mei Chen' })
  const regretted = (date: string) =>
    leaver(date, 'Voluntary', { managerId: 'M1', regrettable: true, terminationReason: 'My manager' })
  const left = [regretted('2025-11-10'), regretted('2026-03-02'), regretted('2026-08-14')]
  // A manager who has left, with two regretted exits from their old team.
  const gone = emp({
    employeeId: 'M2',
    name: 'Ola Gone',
    hrbp: 'Mei Chen',
    terminationDate: '2026-06-30',
    terminationType: 'Voluntary',
  })
  const goneTeam = [
    leaver('2026-02-01', 'Voluntary', { managerId: 'M2', regrettable: true }),
    leaver('2026-05-01', 'Voluntary', { managerId: 'M2', regrettable: true }),
  ]
  // Span outliers: a wide team of 12 and a manager with one report.
  const wide = emp({ employeeId: 'M3', name: 'Wide Manager', level: 'M2', hrbp: 'Mei Chen' })
  const wideTeam = many(12, { managerId: 'M3' })
  const narrow = emp({ employeeId: 'M4', name: 'Narrow Manager', level: 'M1', hrbp: null })
  const only = emp({ employeeId: 'R1', managerId: 'M4' })
  const ctx = ctxOf({
    employees: [partner, hayes, ...team, ...left, gone, ...goneTeam, wide, ...wideTeam, narrow, only],
  })
  const items = hrbpActions(ctx)

  it('asks the manager for stay conversations, due a month after the latest regretted exit', () => {
    const x = byId(items, 'hrbp:stay-conversations:M1')
    expect(x).toMatchObject({
      ownerRole: 'manager',
      ownerId: 'M1',
      ownerName: 'Heather Hayes',
      severity: 'critical',
      due: '2026-09-13',
      view: 'hrbp',
      tab: 'attrition',
      subject: { kind: 'employees', id: 'M1', label: "Heather Hayes's team" },
    })
    expect(x.what).toBe(
      "3 regretted exits from Heather Hayes's team in the last 12 months, the latest on 14 Aug 2026",
    )
    expect(x.note).toMatch(/^Could you hold stay conversations with the rest of your team this month\?/)
    expect(resolveDrill(x.drill)!.rows).toHaveLength(3)
    // No leaver is named in the item's words.
    for (const e of left) expect(`${x.what} ${x.note}`).not.toContain(e.name)
  })

  it('reads the due window from the dictionary', () => {
    const later = hrbpActions(
      ctxOf(
        { employees: [partner, hayes, ...team, ...left] },
        {},
        undefined,
        metricsWith({ [ID.regrettedCluster]: { stayWithinDays: 60 } }),
      ),
    )
    expect(byId(later, 'hrbp:stay-conversations:M1').due).toBe('2026-10-13')
  })

  it('gives a departed manager’s team to the HR business partner', () => {
    const x = byId(items, 'hrbp:stay-conversations:M2')
    expect(x).toMatchObject({ ownerRole: 'hrbp', ownerName: 'Mei Chen', ownerId: 'HR1', severity: 'warning' })
  })

  it('sends span outliers to the HR business partner', () => {
    const w = byId(items, 'hrbp:span:M3')
    expect(w).toMatchObject({
      ownerRole: 'hrbp',
      ownerName: 'Mei Chen',
      ownerId: 'HR1',
      severity: 'warning',
      tab: 'org',
    })
    expect(w.what).toBe('Wide Manager has 12 direct reports, at or above the wide span of 12')
    expect(w.note).toBe(
      'Could we review with Wide whether the team would benefit from a team lead or a split?',
    )
    const n = byId(items, 'hrbp:span:M4')
    expect(n).toMatchObject({ ownerName: HRBP_FALLBACK, ownerId: null, severity: 'info' })
    expect(n.what).toBe('Narrow Manager has a single direct report, at or below the narrow span of 1')
    // Hayes leads 6: not an outlier.
    expect(items.some((i) => i.id === 'hrbp:span:M1')).toBe(false)
  })

  it('is empty without employees', () => {
    expect(hrbpActions(ctxOf({}))).toEqual([])
  })
})

describe('on the sample company', () => {
  const ctx = sampleCtx()
  const items = hrbpActions(ctx)
  const m = hrbpModel(ctx)

  it('summary: voluntary, regretted and first-year attrition, each with a target, and the readout', () => {
    const s = hrbpSummary(ctx)
    expect(s.kpis.map((k) => k.id)).toEqual([...SUMMARY_KPIS])
    expect(s.kpis.map((k) => k.metricId)).toEqual([ID.voluntary, ID.regretted, ID.firstYear])
    expect(s.kpis[0].value).toBeCloseTo(0.094, 3)
    for (const k of s.kpis) {
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(k.drill, k.id).toBeDefined()
      expect(ctx.metrics.target(k.metricId!), k.id).not.toBeNull()
    }
    expect(s.findings).toBe(m.findings)
    expect(hrbpModel(ctx)).toBe(m)
  })

  it('story 1: stay conversations for Heather Hayes, the largest cluster, critical', () => {
    const x = byId(items, 'hrbp:stay-conversations:E10599')
    expect(x).toMatchObject({ ownerRole: 'manager', ownerName: 'Heather Hayes', severity: 'critical' })
    expect(resolveDrill(x.drill)!.rows).toHaveLength(5)
    const others = items.filter((i) => i.id.startsWith('hrbp:stay-conversations:') && i !== x)
    // Every other cluster is smaller than hers, and at least the cluster minimum (2).
    for (const o of others) {
      const n = resolveDrill(o.drill)!.rows.length
      expect(n, o.id).toBeLessThan(5)
      expect(n, o.id).toBeGreaterThanOrEqual(2)
      expect(o.severity, o.id).toBe(n >= 3 ? 'critical' : 'warning')
    }
  })

  it('story 4: the three wide spans, and narrow spans that are not single-report chains', () => {
    const wide = items.filter((i) => i.id.startsWith('hrbp:span:') && i.severity === 'warning')
    expect(wide.map((i) => i.subject.label).sort()).toEqual(['Nisha Iyer', 'Rohan Murthy', 'Wei-Lun Lee'])
    const chains = new Set(m.org.chains.map((c) => c.managerId))
    const narrow = items.filter((i) => i.id.startsWith('hrbp:span:') && i.severity === 'info')
    for (const n of narrow) expect(chains.has(n.subject.id!), n.id).toBe(false)
    const ones = m.org.managers.filter((r) => r.directs === 1)
    expect(ones).toHaveLength(4)
    expect(narrow.length + ones.filter((r) => chains.has(r.managerId)).length).toBe(4)
    // HR business partners are on the roster, so every span item names one by ID.
    for (const w of [...wide, ...narrow]) expect(w.ownerId, w.id).toBeTruthy()
  })

  it('keeps ids unique and stable, owners known and words polite', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(hrbpActions(sampleCtx()).map((i) => i.id)).toEqual(items.map((i) => i.id))
    for (const x of items) {
      expect(ACTION_OWNER_ROLES, x.id).toContain(x.ownerRole)
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(NAGGING)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(/—|!/)
      expect(resolveDrill(x.drill)?.rows.length, x.id).toBeGreaterThan(0)
    }
  })

  it('a leader filter keeps the leader’s own teams', () => {
    const scoped = hrbpActions(sampleCtx({ leaderId: 'E10599' }))
    expect(scoped.map((i) => i.id)).toContain('hrbp:stay-conversations:E10599')
    expect(scoped.length).toBeLessThan(items.length)
  })
})
