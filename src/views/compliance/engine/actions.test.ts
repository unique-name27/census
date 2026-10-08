/**
 * Compliance's Action center items (docs/ACTION-CENTER-AUDIT.md 4.2 and part 6; docs/ROLES-V2.md
 * 5.14): a license breach is due on the start date (overdue, never "Due today"), every legal
 * breach carries `exposure`, and each item is one matter per person so Onboarding's I-9 and
 * screening fold into it.
 */
import { describe, expect, it } from 'vitest'
import { resolveDrill } from '@/drill/Drill'
import { actions } from './index'
import { sampleContext } from './testkit'

describe('Compliance items on the sample', () => {
  const ctx = sampleContext()
  const items = actions(ctx)
  const of = (kind: string) => items.filter((i) => i.id.startsWith(`compliance:${kind}:`))

  it('dates a license breach from the start date: overdue, never the as-of date', () => {
    const breaches = of('license').filter((i) => i.what.startsWith('Working since'))
    expect(breaches.length).toBeGreaterThan(0)
    for (const x of breaches) {
      expect(x.due && x.due < ctx.asOf, x.id).toBe(true)
      expect(x).toMatchObject({ exposure: true, severity: 'critical' })
    }
  })

  it('names one matter per person, with the employee ID, and legal exposure on every breach', () => {
    for (const x of items) {
      const id = x.id.split(':').at(-1)
      const kind = x.id.split(':')[1]
      const matter = { reverification: 'work-auth', i9: 'i9', license: 'license' }[kind]
      expect(x.matter, x.id).toBe(`${matter}:${id}`)
      expect(x.place?.location, x.id).toBeTruthy()
      expect(resolveDrill(x.drill), x.id).not.toBeNull()
    }
    for (const x of of('i9')) expect(x.exposure, x.id).toBe(true)
    for (const x of of('reverification'))
      expect(!!x.exposure, x.id).toBe(x.what.startsWith('Work authorization ended'))
  })

  it('calls exposure a breach in force on the as-of date, never one still to come', () => {
    // One rule: working without a license, an I-9 past due, an authorization that ended.
    for (const x of of('license'))
      expect(!!x.exposure, x.id).toBe(x.what.startsWith('Working since') && !!x.due && x.due < ctx.asOf)
    const pending = of('license').filter((i) => i.what.startsWith('Starts '))
    expect(pending.length).toBeGreaterThan(0)
    for (const x of pending) {
      expect(x.exposure, x.id).toBeUndefined()
      expect(x.severity, x.id).not.toBe('critical')
      expect(x.due && x.due >= ctx.asOf, x.id).toBe(true)
    }
    // An overdue reverification whose authorization has not ended is not exposure either.
    for (const x of of('reverification').filter((i) => /reverification has not started/.test(i.what)))
      expect(x.exposure, x.id).toBeUndefined()
  })

  it('never names an authorization type in the words', () => {
    for (const x of items) expect(`${x.what} ${x.note}`, x.id).not.toMatch(/\b(H-1B|L-1|O-1|TN|visa)\b/i)
  })
})
