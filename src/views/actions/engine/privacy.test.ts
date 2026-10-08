/**
 * Money and private details in items (docs/ACTION-CENTER-AUDIT.md 3.13 and part 6, Privacy;
 * docs/ROLES-V2.md 3.2): no item's `what` or `note` holds a currency amount, with pay amounts on or
 * off, in any mode; an amount lives in `amount` and reaches an export only in a `pay: true` column
 * (one person's) or a `cost: true` column (a group's total), so the pay rules drop it; Copy note
 * never holds an amount, an employee relations case ID, an authorization type or a model score;
 * employee relations items name no one and are left out under the anonymity minimum in every
 * scope.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES, type Mode } from '@/access/modes'
import { sampleCtx } from '@/ask/engine/testkit'
import { AUTHORIZATION_TYPES } from '@/data/schema'
import { subtreeIds } from '@/data/scope'
import { visibleColumns } from '@/lib/export/columns'
import { minGroupOf } from '@/metrics/privacy'
import { VIEWS } from '@/views/registry'
import { type Collected, collectUncached, isPrivateItem } from './collect'
import { groupByOwner } from './group'
import { composeNote } from './note'
import { modeCtx, samplePicks } from './roleKit'
import { EXPORT_COLUMNS, exportRows } from './rows'

/** A money amount in text: a currency sign or code beside a number. */
const MONEY =
  /[$€£¥₹₩]\s?\d|\d[\d,.]*\s?(USD|EUR|GBP|INR|TWD|CNY|RMB|JPY|KRW|SGD|VND|ILS|CAD|MXN|CHF)\b|\b(USD|EUR|GBP|INR|TWD|CNY|JPY|KRW|SGD|VND)\s?\d/

const MODEL_WORDS = /flight[- ]risk|model score|risk score|predicted|likelihood/i

describe('no money in item text', () => {
  const runs: { mode: Mode; pay: boolean; c: Collected }[] = []
  beforeAll(() => {
    for (const mode of MODES)
      for (const pay of [false, true]) {
        const ctx = sampleCtx({ access: { mode, picks: samplePicks() }, showPay: pay })
        runs.push({ mode, pay, c: collectUncached(ctx, VIEWS) })
      }
  }, 600_000)

  it('keeps every amount out of what and note, switch on or off, in every mode', () => {
    let amounts = 0
    for (const { mode, pay, c } of runs)
      for (const a of c.items) {
        expect(a.item.what, `${mode} ${pay} ${a.id}`).not.toMatch(MONEY)
        expect(a.item.note ?? '', `${mode} ${pay} ${a.id}`).not.toMatch(MONEY)
        expect(a.item.subject.label, `${mode} ${pay} ${a.id}`).not.toMatch(MONEY)
        if (a.item.amount) amounts++
      }
    // The comp roll-ups carry their totals in `amount`.
    expect(amounts).toBeGreaterThan(0)
  })

  it('exports an amount only under the pay rules: pay columns for a person, cost columns for a group', () => {
    const hr = runs.find((r) => r.mode === 'hr' && !r.pay)!.c
    const withAmount = hr.items.filter((a) => a.item.amount)
    const rows = exportRows(withAmount, '2026-09-30')
    const amountCol = EXPORT_COLUMNS.find((c) => c.key === 'amount')
    const totalCol = EXPORT_COLUMNS.find((c) => c.key === 'total')
    expect(amountCol?.pay).toBe(true)
    expect(totalCol?.cost).toBe(true)
    // Ratios only (every mode but the switch modes and Finance): neither column.
    const none = visibleColumns(EXPORT_COLUMNS, { pay: false, cost: false }).map((c) => c.key)
    expect(none).not.toContain('amount')
    expect(none).not.toContain('total')
    // Finance: totals over groups only, never one person's amount.
    const totals = visibleColumns(EXPORT_COLUMNS, { pay: false, cost: true }).map((c) => c.key)
    expect(totals).toContain('total')
    expect(totals).not.toContain('amount')
    // Switch on: both.
    expect(visibleColumns(EXPORT_COLUMNS, { pay: true, cost: true }).map((c) => c.key)).toEqual(
      expect.arrayContaining(['amount', 'total']),
    )
    for (const [i, a] of withAmount.entries()) {
      const group = a.item.subject.kind === 'none'
      expect(rows[i].total, a.id).toBe(group ? a.item.amount?.usd : null)
      expect(rows[i].amount, a.id).toBe(group ? null : a.item.amount?.usd)
    }
  })

  it('writes Copy note without an amount, an employee relations case ID, an authorization type or a model score', () => {
    for (const { mode, pay, c } of runs) {
      const caseIds = c.items.filter((a) => isPrivateItem(a.item)).map((a) => a.id.split(':')[2])
      for (const g of groupByOwner(c.items, '2026-09-30'))
        for (const b of g.owners) {
          const text = composeNote({ name: b.name, isTeam: b.isTeam }, b.items, '2026-09-30')
          const at = `${mode} ${pay} ${b.name}`
          expect(text, at).not.toMatch(MONEY)
          expect(text, at).not.toMatch(MODEL_WORDS)
          for (const id of caseIds) expect(text, at).not.toContain(id)
          for (const t of AUTHORIZATION_TYPES)
            expect(text.toLowerCase(), `${at} ${t}`).not.toContain(t.toLowerCase())
        }
    }
  })
})

describe('employee relations', () => {
  it('names no one and carries no case ID, and is left out under the anonymity minimum in every scoped mode', () => {
    const scoped = MODES.filter((m) => ['hrbp-unit', 'hrbp-region', 'recruiter', 'manager'].includes(m))
    for (const mode of [...scoped, 'hr', 'hr-ops'] as Mode[]) {
      const ctx = modeCtx(mode)
      const c = collectUncached(ctx, VIEWS)
      for (const a of c.items.filter((x) => isPrivateItem(x.item))) {
        expect(a.item.subject, `${mode} ${a.id}`).toEqual({ kind: 'none', label: 'Employee relations case' })
        expect(a.personId, mode).toBeNull()
        const caseId = a.id.split(':')[2]
        expect(a.markKey, mode).not.toContain(caseId)
        expect(JSON.stringify(exportRows([a], ctx.asOf)), mode).not.toContain(caseId)
      }
      const small = c.smallScope
      if (small)
        expect(
          c.items.some((a) => isPrivateItem(a.item)),
          mode,
        ).toBe(false)
    }
    // A scope under the minimum ("My team" on a manager of two): nothing about an employee relations case.
    const hr = sampleCtx()
    const active = (id: string) => {
      const e = hr.org.byId.get(id)
      return !!e && !e.terminationDate
    }
    const team = [...hr.org.byId.values()].find((e) => {
      if (e.terminationDate) return false
      const org = [...subtreeIds(hr.org, e.employeeId)].filter(active)
      return org.length >= 2 && org.length < 5
    })
    expect(team).toBeTruthy()
    const tiny = sampleCtx({ filters: { leaderId: team!.employeeId } })
    const cTiny = collectUncached(tiny, VIEWS)
    expect(cTiny.smallScope).toBe(true)
    expect(cTiny.items.some((a) => isPrivateItem(a.item))).toBe(false)
    expect(minGroupOf(tiny.metrics)).toBeGreaterThan(3)
  })
})
