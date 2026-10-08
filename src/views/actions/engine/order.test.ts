/**
 * Order and severity (docs/ACTION-CENTER-AUDIT.md 3.6, 4.2 and part 6): every item with legal
 * exposure carries `exposure: true` and sorts before every other item, in every mode and in each
 * mode's Needs attention; then severity, then days overdue. One rubric: legal exposure and a person
 * blocked past the overdue limit are critical, overdue is at least Watch.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { compareActions } from './collect'
import { daysToDue } from './due'
import { everyMode } from './roleKit'
import { severityOf } from './severity'
import { open } from './testkit'

const AS_OF = '2026-09-30'

describe('the order', () => {
  it('puts legal exposure first, then severity, then the most overdue', () => {
    const breach = open({
      id: 'compliance:license:E1',
      severity: 'warning',
      exposure: true,
      due: '2026-10-12',
    })
    const critical = open({ id: 'services:case:A', severity: 'critical', due: '2026-06-01' })
    const older = open({ id: 'talent:t:1', severity: 'warning', due: '2026-07-01' })
    const newer = open({ id: 'talent:t:2', severity: 'warning', due: '2026-09-01' })
    const none = open({ id: 'talent:t:3', severity: 'warning', due: null })
    const sorted = [none, newer, critical, older, breach].sort(compareActions).map((a) => a.id)
    expect(sorted).toEqual([
      'compliance:license:E1',
      'services:case:A',
      'talent:t:1',
      'talent:t:2',
      'talent:t:3',
    ])
  })
})

describe('the severity rubric', () => {
  const r = (patch: Parameters<typeof severityOf>[0]) => severityOf(patch, AS_OF, 14)
  it('makes legal exposure critical whatever the view says', () => {
    expect(r({ id: 'compliance:license:E1', severity: 'info', due: null, exposure: true })).toBe('critical')
  })
  it('makes a waiting person critical only past the overdue limit', () => {
    const id = 'recruiting:review:APP-1'
    expect(r({ id, severity: 'critical', due: '2026-09-10' })).toBe('critical')
    expect(r({ id, severity: 'critical', due: '2026-09-20' })).toBe('warning')
    expect(r({ id, severity: 'warning', due: '2026-10-05' })).toBe('warning')
    expect(r({ id, severity: 'critical', due: '2026-10-05' })).toBe('warning')
    expect(r({ id: 'onboarding:task:APP-1:Laptop', severity: 'info', due: '2026-09-01' })).toBe('critical')
    // The limit is a setting.
    expect(severityOf({ id, severity: 'warning', due: '2026-09-20' }, AS_OF, 5)).toBe('critical')
  })
  it('keeps the view thresholds for items about a group or a record, and never leaves an overdue item a Note', () => {
    expect(r({ id: 'talent:critical-role:SP-1', severity: 'critical', due: null })).toBe('critical')
    expect(r({ id: 'onboarding:plan-behind:A:B', severity: 'critical', due: null })).toBe('critical')
    expect(r({ id: 'onboarding:probation:E1', severity: 'info', due: '2026-09-01' })).toBe('warning')
    expect(r({ id: 'onboarding:probation:E1', severity: 'info', due: '2026-10-09' })).toBe('info')
  })
})

describe('on the sample, in every mode', () => {
  let modes: ReturnType<typeof everyMode>
  beforeAll(() => {
    modes = everyMode()
  }, 300_000)

  it('marks every legal matter with exposure and lists it before every other item', () => {
    let exposed = 0
    for (const { mode, collected, lists } of modes) {
      const items = collected.items
      for (const a of items) {
        // Export licenses not in force, late I-9s and final pay past due are legal exposure.
        if (a.id.startsWith('compliance:license:')) expect(a.item.exposure, `${mode} ${a.id}`).toBe(true)
        if (a.item.exposure) expect(a.item.severity, `${mode} ${a.id}`).toBe('critical')
      }
      const first = items.findIndex((a) => !a.item.exposure)
      const last = items.map((a) => !!a.item.exposure).lastIndexOf(true)
      if (last >= 0) expect(last, mode).toBeLessThan(first < 0 ? Infinity : first)
      // The same in the mode's own Needs attention.
      const nFirst = lists.needs.findIndex((a) => !a.item.exposure)
      const nLast = lists.needs.map((a) => !!a.item.exposure).lastIndexOf(true)
      if (nLast >= 0) expect(nLast, mode).toBeLessThan(nFirst < 0 ? Infinity : nFirst)
      exposed += items.filter((a) => a.item.exposure).length
    }
    expect(exposed).toBeGreaterThan(0)
  })

  it('puts the export-license breach at the top of HR, CHRO, HR ops and Developer', () => {
    for (const mode of ['hr', 'chro', 'hr-ops', 'developer'] as const) {
      const m = modes.find((x) => x.mode === mode)!
      expect(m.collected.items[0]?.id, mode).toMatch(/^compliance:license:/)
      expect(m.lists.needs[0]?.id, mode).toMatch(/^compliance:license:/)
    }
  })

  it('rates critical only legal exposure, a person blocked past the limit, or a view threshold on a group or record', () => {
    const hr = modes.find((m) => m.mode === 'hr')!
    for (const a of hr.collected.items) {
      if (a.item.severity !== 'critical' || a.item.exposure) continue
      const late = -(daysToDue(a.item.due, hr.ctx.asOf) ?? 0)
      if (/^(recruiting:(review|schedule-|decision|offer)|onboarding:(task|i9))/.test(a.id))
        expect(late, a.id).toBeGreaterThan(14)
    }
  })
})
