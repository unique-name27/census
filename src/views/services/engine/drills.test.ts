/**
 * Drill-downs: the records a number opens are exactly the records it counts (consistency), hidden
 * numbers and small groups open nothing, and employee relations cases are never listed.
 */
import { describe, expect, it } from 'vitest'
import type { Kpi } from '@/components/types'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { buildDrillTable } from '@/drill/records'
import type { DrillSpec } from '@/drill/types'
import { isRowPrivate } from './cases'
import {
  canDrill,
  caseDrill,
  drillScope,
  drillWhen,
  isLateTx,
  levelDrill,
  oneCaseDrill,
  onTimeDrill,
  reopenDrill,
  resolutionDrill,
  resolutionOutcomeDrill,
  retroDrill,
  txOutcomeDrill,
  withheldNote,
} from './drills'
import { type CaseFact, caseColumns, caseFacts } from './facts'
import { compute } from './index'
import { openAt } from './kpis'
import { fixtureContext, kase, sampleContext, win } from './testkit'

const ctx = sampleContext()
const m = compute(ctx)
const s = m.scope

const spec = (src: DrillSource): DrillSpec => {
  const out = resolveDrill(src)
  if (!out) throw new Error('Expected a drill')
  return out
}
const kpi = (id: string): Kpi => m.kpis.find((k) => k.id === id) as Kpi
const er = (rows: readonly CaseFact[]) => rows.filter(isRowPrivate).length
/** Rows listed plus employee relations cases counted but not listed. */
const shown = (d: DrillSpec | null, rows: readonly CaseFact[]) => (d ? d.rows.length + er(rows) : null)

describe('drills on the sample company', () => {
  it('opens the cases behind every case KPI, counted as the tile counts them', () => {
    const { opened, resolved } = m.summary.rows
    expect(shown(spec(kpi('cases-opened').drill), opened)).toBe(kpi('cases-opened').value)
    const backlog = m.cases.filter((f) => f.open)
    expect(shown(spec(kpi('open-backlog').drill), backlog)).toBe(48)

    const judged = opened.filter((f) => f.resolutionMet != null)
    const sla = spec(kpi('resolution-sla').drill)
    expect(shown(sla, judged)).toBe(m.summary.resolution.n)
    expect(sla.note).toContain(`÷ ${m.summary.resolution.n.toLocaleString('en-US')} cases with an outcome`)

    const responded = opened.filter((f) => f.responseMet != null)
    expect(shown(spec(kpi('response-sla').drill), responded)).toBe(m.summary.response.n)

    const timed = resolved.filter((f) => f.resolutionHours != null)
    expect(shown(spec(kpi('time-to-resolve').drill), timed)).toBe(m.summary.medianHours.n)

    const scored = resolved.filter((f) => f.csat != null)
    expect(shown(spec(kpi('csat').drill), scored)).toBe(m.summary.csat.n)
  })

  it('opens the judged transactions behind on time, late ones first', () => {
    const d = spec(kpi('tx-on-time').drill)
    const n = Number(/([\d,]+) due$/.exec(kpi('tx-on-time').note ?? '')?.[1].replace(/,/g, ''))
    expect(d.kind).toBe('transactions')
    expect(d.rows).toHaveLength(n)
    const t = buildDrillTable(d, ctx)
    expect(t.rows[0].svOutcome).not.toBe('On time')
    expect(t.columns.map((c) => c.key)).toEqual(expect.arrayContaining(['svOutcome', 'svDaysLate', 'svRule']))
    expect(t.columns.map((c) => c.key)).not.toContain('daysLate')
  })

  it('matches every breakdown cell with the records behind it', () => {
    for (const r of m.opened.rows) expect(r.records, `${r.month} ${r.category}`).toHaveLength(r.cases)
    for (const r of m.backlog) expect(r.records).toHaveLength(r.cases)
    for (const r of m.arrivals) expect(r.records).toHaveLength(r.cases)
    for (const r of m.timing) expect(r.records).toHaveLength(r.transactions)
    for (const r of m.categories) {
      expect(r.records).toHaveLength(r.cases)
      expect(r.openRecords).toHaveLength(r.open)
      const d = resolutionDrill(s, r.records, r.category)
      if (r.category === 'Employee relations') {
        // Counts and timeliness only: the rate shows, its cases are never listed.
        expect(r.slaRate).not.toBeNull()
        expect(d).toBeNull()
        continue
      }
      if (r.slaRate == null) continue
      expect(
        shown(
          d,
          r.records.filter((f) => f.resolutionMet != null),
        ),
      ).toBe(r.slaN)
      const met = resolutionOutcomeDrill(s, r.records, true, r.category)
      const metRows = r.records.filter((f) => f.resolutionMet === true)
      expect(shown(met, metRows)).toBe(r.slaMet)
    }
    for (const r of m.types) {
      if (r.rate == null) continue
      expect(spec(onTimeDrill(s, r.records, r.type)).rows).toHaveLength(r.due)
    }
    for (const r of m.finalPay) {
      if (r.rate == null) continue
      expect(spec(onTimeDrill(s, r.records, r.name)).rows).toHaveLength(r.exits)
      if (r.late) expect(spec(txOutcomeDrill(s, r.records, isLateTx, r.name)).rows).toHaveLength(r.late)
    }
    for (const r of m.newHireSites) if (r.rate != null) expect(r.records).toHaveLength(r.starts)
    for (const r of m.reopen) {
      if (!r.reopened) continue
      const d = reopenDrill(s, r.records, r.category)
      if (r.category === 'Employee relations') expect(d).toBeNull()
      else
        expect(
          shown(
            d,
            r.records.filter((f) => f.reopened && f.resolved),
          ),
        ).toBe(r.reopened)
    }
    for (const r of m.retro) {
      if (!r.retro) continue
      expect(spec(retroDrill(s, r.records, r.month)).rows).toHaveLength(r.retro)
    }
    for (const t of m.teams) {
      expect(t.openedRecords).toHaveLength(t.opened)
      expect(t.resolvedRecords).toHaveLength(t.resolved)
      expect(t.openRecords).toHaveLength(t.open)
    }
    for (const p of m.processes) {
      if (p.cases != null) expect(p.caseRecords).toHaveLength(p.cases)
      if (p.transactions != null) expect(p.txRecords).toHaveLength(p.transactions)
    }
  })

  it('opens the scorecard rows judged and the misses', () => {
    for (const r of m.levels) {
      if (r.id === 'er02-median-days') {
        // Every employee relations case stays at category level: nothing to list.
        expect(levelDrill(s, r, 'n')).toBeNull()
        continue
      }
      const n = levelDrill(s, r, 'n')
      expect(n?.rows.length, r.id).toBe(r.n)
      if (r.id === 'ds01-retro-share') continue
      expect(levelDrill(s, r, 'misses')?.rows.length ?? 0, r.id).toBe(r.misses.length)
    }
    const py = m.levels.find((l) => l.id === 'py05-payroll-2bd')!
    const t = buildDrillTable(spec(levelDrill(s, py, 'actual')), ctx)
    expect(t.columns.map((c) => c.label)).toContain('Within 2 business days')
    expect(t.rows[0].svClockWithin).toBe('No')
    expect(t.rows.filter((r) => r.svClockWithin === 'No')).toHaveLength(py.misses.length)
  })

  it('gives every finding the records behind its headline number', () => {
    for (const f of m.findings) expect(resolveDrill(f.drill), f.id).not.toBeNull()
    const spike = m.findings.find((f) => f.id === 'services-spike-payroll')!
    expect(spec(spike.drill).rows).toHaveLength(118)
    expect(spec(spike.drill).title).toBe('Cases opened, Payroll, Jul 2026')
    const india = m.findings.find((f) => f.id === 'services-final-pay-in')!
    const row = m.finalPay.find((r) => r.jurisdiction === 'in')!
    const d = spec(india.drill)
    expect(d.rows).toHaveLength(row.exits)
    expect(d.note).toContain(`Rate = ${row.onTime} on time ÷ ${row.exits} transactions`)
    const t = buildDrillTable(d, ctx)
    expect(t.rows[0].svRule).toMatch(/./)
    expect(t.columns.map((c) => c.key)).toContain('svExitType')
    const aged = m.findings.find((f) => f.id === 'services-aged-immigration-mobility')!
    expect(spec(aged.drill).rows).toHaveLength(15)
  })

  it('adds the case measures as extra columns and drops the standard ones they replace', () => {
    const t = buildDrillTable(spec(kpi('open-backlog').drill), ctx)
    const keys = t.columns.map((c) => c.key)
    expect(keys).toEqual(
      expect.arrayContaining(['svResponseHours', 'svResolveHours', 'svResolutionWithin', 'svAgeDays']),
    )
    expect(keys).not.toContain('hoursToResolve')
    expect(keys).not.toContain('withinTarget')
    const ages = t.rows.map((r) => r.svAgeDays as number)
    expect(ages).toEqual([...ages].sort((a, b) => b - a))
  })

  it('opens one aging case at a time', () => {
    const row = m.aged[0]
    const d = spec(oneCaseDrill(s, row.fact))
    expect(d.rows).toHaveLength(1)
    expect(d.title).toBe(`Case ${row.caseId}`)
    // The aging table's age, target and days past target cells open this case, and it shows them.
    const t = buildDrillTable(d, ctx)
    expect(t.rows[0]).toMatchObject({
      svAgeDays: row.ageDays,
      svTargetDays: row.targetDays,
      svDaysPastTarget: row.daysPastTarget,
    })
  })
})

describe('privacy', () => {
  it('lists no employee relations case, and says how many it leaves out', () => {
    const opened = m.summary.rows.opened
    const withheld = er(opened)
    expect(withheld).toBeGreaterThan(0)
    const d = spec(kpi('cases-opened').drill)
    expect(d.rows.some((r) => 'category' in r && r.category === 'Employee relations')).toBe(false)
    expect(d.note).toContain(withheldNote(withheld))
    const erRow = m.categories.find((r) => r.category === 'Employee relations')!
    expect(caseDrill(s, erRow.records, { title: 'ER' })).toBeNull()
    expect(drillWhen(s, erRow.records, () => 1)).toBeUndefined()
    expect(m.findings.every((f) => !f.id.includes('employee-relations') || f.drill === undefined)).toBe(true)
  })

  it('opens nothing in a small scope (the four executives at E2)', () => {
    const small = compute(sampleContext({ level: ['E2'] }))
    expect(small.scope.on).toBe(false)
    for (const k of small.kpis) expect(resolveDrill(k.drill), k.id).toBeNull()
    for (const r of small.categories) expect(caseDrill(small.scope, r.records, { title: 'x' })).toBeNull()
    for (const r of small.opened.rows) expect(drillWhen(small.scope, r.records, () => 1)).toBeUndefined()
    for (const l of small.levels) expect(levelDrill(small.scope, l, 'n'), l.id).toBeNull()
    for (const p of small.processes) expect(canDrill(small.scope, p.caseRecords)).toBe(false)
  })

  it('opens nothing for a group behind fewer than 5 people, even when its count shows', () => {
    const W = win('2026-09-01', '2026-09-30')
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => kase({ category: 'Payroll', requesterId: `P${i}` })),
      // Seven immigration cases from two people: folded into "Other (1)" with a hidden rate.
      ...Array.from({ length: 7 }, (_, i) =>
        kase({ category: 'Immigration & mobility', requesterId: `I${i % 2}` }),
      ),
    ]
    const c = fixtureContext({ cases: rows })
    const fm = compute(c)
    const other = fm.categories.find((r) => r.category.startsWith('Other'))!
    expect(other.cases).toBe(7)
    expect(other.slaRate).toBeNull()
    expect(caseDrill(fm.scope, other.records, { title: 'x' })).toBeNull()
    expect(resolutionDrill(fm.scope, other.records, 'x')).toBeNull()
    const payroll = fm.categories.find((r) => r.category === 'Payroll')!
    expect(spec(resolutionDrill(fm.scope, payroll.records, 'x')).rows).toHaveLength(12)

    // The gate counts people, not rows.
    const facts = caseFacts(rows, '2026-09-30', caseColumns(rows))
    const scope = drillScope({ ...c, window: W }, fm.caseCols, false)
    expect(canDrill(scope, facts.slice(12))).toBe(false)
    expect(canDrill(scope, facts.slice(0, 5))).toBe(true)
  })

  it('opens a rate exactly when the rate shows (outside employee relations)', () => {
    const scoped = compute(sampleContext({ location: ['Vancouver'] }))
    for (const model of [m, scoped]) {
      const groups = [
        ...model.slaMonths.map((r) => ({ id: r.month, rows: r.records, rate: r.slaRate })),
        ...model.categories.map((r) => ({ id: r.category, rows: r.records, rate: r.slaRate })),
        ...model.teams.map((r) => ({ id: r.team, rows: r.openedRecords, rate: r.slaRate })),
      ].filter((g) => g.rows.some((f) => !isRowPrivate(f) && f.resolutionMet != null))
      expect(groups.length).toBeGreaterThan(10)
      expect(groups.some((g) => g.rate == null)).toBe(model === scoped)
      for (const g of groups)
        expect(resolutionDrill(model.scope, g.rows, g.id) != null, g.id).toBe(g.rate != null)
    }
  })
})

describe('KPI changes and notes open the records they state', () => {
  const num = (text: string | null | undefined, re: RegExp) => Number(text!.match(re)![1].replace(/\D/g, ''))
  const prior = ctx.prior
  const prevOpened = m.cases.filter((f) => f.opened >= prior.start && f.opened <= prior.end)

  it('counts: the change opens the prior period, the note its subset', () => {
    const opened = kpi('cases-opened')
    expect(shown(spec(opened.deltaDrill), prevOpened)).toBe(opened.value! - opened.delta!)
    expect(spec(opened.deltaDrill).subtitle).toBe(`${prior.label} · ${s.scope}`)

    const backlog = kpi('open-backlog')
    const before = openAt(m.cases, prior.end)
    expect(shown(spec(backlog.deltaDrill), before)).toBe(backlog.value! - backlog.delta!)
    const open = m.cases.filter((f) => f.open)
    const older = open.filter((f) => (f.ageDays ?? 0) > 14)
    const note = spec(backlog.noteDrill)
    expect(shown(note, older)).toBe(older.length)
    expect(backlog.note).toBe(`${Math.round((100 * older.length) / open.length)}% older than 14 d`)
    expect(note.note).toContain(`Share = ${older.length} ÷ ${open.length} open cases.`)
  })

  it('rates: the change opens the prior cases with the prior rate in the note, the note the cases judged', () => {
    for (const id of ['resolution-sla', 'response-sla']) {
      const k = kpi(id)
      const d = spec(k.deltaDrill)
      const [met, judged] = d.note!.match(/\d[\d,]*/g)!.map((x) => Number(x.replace(/\D/g, '')))
      expect(met / judged, id).toBeCloseTo(k.value! - k.delta!, 10)
      const n = num(k.note, /([\d,]+) cases/)
      const opened = m.summary.rows.opened.filter(
        (f) => (id === 'resolution-sla' ? f.resolutionMet : f.responseMet) != null,
      )
      expect(shown(spec(k.noteDrill), opened), id).toBe(n)
    }
    const ttr = kpi('time-to-resolve')
    expect(spec(ttr.deltaDrill).subtitle).toBe(`${prior.label} · ${s.scope}`)
    const resolved = m.summary.rows.resolved.filter((f) => f.resolutionHours != null)
    expect(shown(spec(ttr.noteDrill), resolved)).toBe(num(ttr.note, /([\d,]+) cases resolved/))
    const csat = kpi('csat')
    const rated = m.summary.rows.resolved.filter((f) => f.csat != null)
    expect(shown(spec(csat.noteDrill), rated)).toBe(num(csat.note, /([\d,]+) responses/))
    const tx = kpi('tx-on-time')
    expect(spec(tx.noteDrill).rows.length).toBe(num(tx.note, /([\d,]+) due/))
    const [ok, due] = spec(tx.deltaDrill)
      .note!.match(/\d[\d,]*/g)!
      .map((x) => Number(x.replace(/\D/g, '')))
    expect(ok / due).toBeCloseTo(tx.value! - tx.delta!, 10)
  })

  it('every drill on a tile carries the tile fields', () => {
    for (const k of m.kpis)
      for (const src of [k.drill, k.deltaDrill, k.noteDrill]) {
        const d = resolveDrill(src)
        if (d) expect(d.uses, k.id).toEqual(k.uses)
      }
  })
})
