/**
 * Drill-down consistency: every number the HRBP view shows opens exactly the records it counts
 * (the leavers behind a rate's numerator, the employees behind a headcount bar …), and a value
 * hidden for anonymity has no records behind it.
 */
import { describe, expect, it } from 'vitest'
import type { DrillSource } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'
import { inWindow } from '@/lib/people'
import { mean } from '@/lib/stats'
import { computeHrbp } from '.'
import {
  bridgeSpec,
  countOtherSpec,
  countSpec,
  deptMoveSpec,
  flowMonthSpec,
  flowSpec,
  groupExitSpec,
  groupOtherSpec,
  growthCellSpec,
  layerBuSpec,
  managerCellSpec,
  movementTileSpec,
  orgTileSpec,
  promotionLevelSpec,
  promotionQuarterSpec,
  quarterExitSpec,
  reasonSpec,
  regrettedQuarterSpec,
  scoreSpec,
  sinceSpec,
  spanBucketSpec,
  typedCountSpec,
} from './buckets'
import { avgText, rateNote, shareNote } from './drill'
import { ctxOf, emp, leaver, many, sampleCtx } from './fixtures'

const resolve = (src: DrillSource): DrillSpec | null =>
  !src ? null : typeof src === 'function' ? src() : src
const rowsOf = (src: DrillSource | DrillSpec | null): number => resolve(src)?.rows.length ?? -1

const m = computeHrbp(sampleCtx())
const p = m.prep
const kpi = (id: string) => {
  const k = m.kpi.kpis.find((x) => x.id === id)
  if (!k) throw new Error(`missing kpi ${id}`)
  return k
}

describe('drill notes', () => {
  it('names the numerator and the denominator of a rate', () => {
    expect(rateNote(57, ['exit', 'exits'], 1410.4, 12)).toBe('Rate = 57 exits ÷ 1,410 average employees.')
    expect(rateNote(1, ['exit', 'exits'], 22.46, 3)).toBe(
      'Rate = 1 exit ÷ 22.5 average employees, annualized (× 4).',
    )
    expect(shareNote(149, ['promotion', 'promotions'], 1380)).toBe(
      'Rate = 149 promotions ÷ 1,380 average employees, not annualized.',
    )
    expect(avgText(5)).toBe('5')
  })
})

describe('KPI tiles open the records they count', () => {
  it('headcount and hires list exactly the people counted', () => {
    expect(rowsOf(kpi('headcount').drill)).toBe(kpi('headcount').value)
    expect(rowsOf(kpi('hires').drill)).toBe(kpi('hires').value)
  })

  it('each attrition rate opens the leavers in its numerator, with the denominator in the note', () => {
    const cases = [
      ['attrition', m.kpi.all],
      ['voluntary', m.kpi.vol],
      ['regretted', m.kpi.regretted],
    ] as const
    for (const [id, r] of cases) {
      const spec = resolve(kpi(id).drill)
      expect(spec?.rows.length).toBe(r.events)
      // The shown rate is exactly those leavers over the average headcount, annualized.
      expect(kpi(id).value).toBeCloseTo((r.events / r.avgHeadcount) * (12 / p.window.months), 10)
      expect(spec?.note).toContain(`Rate = ${r.events.toLocaleString('en-US')} `)
      expect(spec?.note).toContain(`÷ ${avgText(r.avgHeadcount)} average employees`)
      for (const e of (spec?.rows ?? []) as readonly { terminationDate: string | null }[])
        expect(inWindow(e.terminationDate, p.window)).toBe(true)
    }
  })

  it('first-year attrition opens the cohort leavers; promotion rate the promotions', () => {
    const fy = m.kpi.firstYear
    expect(rowsOf(kpi('first-year').drill)).toBe(fy.leavers)
    expect(kpi('first-year').value).toBeCloseTo(fy.leavers / fy.cohort, 10)
    const promo = m.movement.promotions
    expect(rowsOf(kpi('promotion-rate').drill)).toBe(promo.promotions)
    expect(kpi('promotion-rate').value).toBeCloseTo(promo.promotions / promo.avgHeadcount, 10)
  })
})

describe('findings open the records behind their headline', () => {
  it('every finding drills to a non-empty list', () => {
    expect(m.findings.length).toBeGreaterThan(3)
    for (const f of m.findings) expect(rowsOf(f.drill), f.id).toBeGreaterThan(0)
  })

  it('the regretted cluster opens that many leavers', () => {
    const f = m.findings.find((x) => x.id === 'hrbp-regretted-cluster')
    const n = Number(/had (\d+) regretted exits/.exec(f?.title ?? '')?.[1])
    expect(n).toBeGreaterThan(1)
    expect(rowsOf(f?.drill)).toBe(n)
  })

  it('a voluntary attrition finding opens the exits its detail counts', () => {
    const scoped = computeHrbp(sampleCtx({ location: ['Bengaluru'] }))
    const f = scoped.findings.find((x) => x.id === 'hrbp-voluntary-scope')
    const n = Number(/^(\d+) voluntary exits/.exec(f?.detail ?? '')?.[1])
    expect(n).toBeGreaterThan(0)
    expect(rowsOf(f?.drill)).toBe(n)
  })
})

describe('workforce buckets', () => {
  const wf = m.workforce
  it('every headcount bar lists its employees, and the bars add up to the headcount', () => {
    for (const [dim, rows] of [
      ['department', wf.byDepartment],
      ['location', wf.byLocation],
      ['level', wf.byLevel],
      ['tenure', wf.tenure],
    ] as const) {
      for (const r of rows) {
        expect(r.records.length).toBe(r.headcount)
        if (r.headcount) expect(rowsOf(countSpec(p, dim, r))).toBe(r.headcount)
      }
      expect(rows.reduce((s, r) => s + r.records.length, 0)).toBe(wf.headcount)
    }
    const tail = wf.byDepartment.slice(-3)
    expect(rowsOf(countOtherSpec(p, 'department', tail))).toBe(tail.reduce((s, r) => s + r.headcount, 0))
  })

  it('worker mix, flows and the bridge carry their people', () => {
    for (const r of [...wf.mix.location, ...wf.mix.businessUnit]) expect(r.records.length).toBe(r.people)
    for (const r of wf.flows) {
      expect(r.records.length).toBe(r.people)
      if (r.people) expect(rowsOf(flowSpec(p, r))).toBe(r.people)
    }
    const month = wf.flows[0].month
    const both = wf.flows.filter((r) => r.month === month)
    const ids = new Set(both.flatMap((r) => r.records.map((e) => e.employeeId)))
    expect(rowsOf(flowMonthSpec(p, wf.flows, month))).toBe(ids.size)
    for (const r of wf.bridge) {
      if (r.key === 'other') continue
      expect(r.records.length).toBe(Math.abs(r.people))
      expect(rowsOf(bridgeSpec(p, r))).toBe(Math.abs(r.people))
    }
  })

  it('growth splits into who joined and who left, exactly the change', () => {
    for (const g of wf.growth) {
      expect(g.records.before.length).toBe(g.yearAgo)
      expect(g.records.now.length).toBe(g.now)
      if (g.growth == null) continue
      expect(g.records.joined.length - g.records.left.length).toBe(g.change)
      expect(rowsOf(growthCellSpec(p, g, 'growth'))).toBe(g.records.joined.length + g.records.left.length)
      expect(rowsOf(growthCellSpec(p, g, 'yearAgo'))).toBe(g.yearAgo)
    }
  })
})

describe('attrition buckets', () => {
  const a = m.attrition
  it('quarter segments and whole quarters list their leavers', () => {
    for (const q of a.quarters) {
      expect(q.records.length).toBe(q.exits)
      if (q.exits) expect(rowsOf(quarterExitSpec(p, [q]))).toBe(q.exits)
    }
    const last = a.quarters.at(-1)?.quarter
    const column = a.quarters.filter((q) => q.quarter === last)
    expect(rowsOf(quarterExitSpec(p, column))).toBe(column.reduce((s, q) => s + q.exits, 0))
    for (const r of a.regrettedByQuarter) {
      expect(r.records.length).toBe(r.regretted)
      if (r.regretted) expect(rowsOf(regrettedQuarterSpec(p, r, r.quarterEnd))).toBe(r.regretted)
    }
  })

  it('group rates open the leavers in their numerator, Other folds included', () => {
    for (const r of [...a.byDepartment, ...a.byLocation]) {
      if (r.rate == null) continue
      expect(r.leavers.length).toBe(r.exits)
      if (r.exits) expect(rowsOf(groupExitSpec(p, 'department', r, false))).toBe(r.exits)
      if (r.voluntary) expect(rowsOf(groupExitSpec(p, 'department', r, true))).toBe(r.voluntary)
    }
    const tail = a.byLocation.slice(-4)
    const avg = tail.reduce((s, r) => s + r.avgHeadcount, 0)
    if (avg >= 5)
      expect(rowsOf(groupOtherSpec(p, a, 'location', tail, true))).toBe(
        tail.reduce((s, r) => s + r.voluntary, 0),
      )
    for (const r of a.byLevel) if (r.rate != null && r.exits) expect(r.leavers.length).toBe(r.exits)
  })

  it('reasons, tenure and rating counts list their leavers', () => {
    for (const r of a.reasons) expect(rowsOf(reasonSpec(p, r))).toBe(r.exits)
    for (const r of [...a.byTenure, ...a.byRating]) {
      expect(r.records.length).toBe(r.exits)
      if (r.exits) expect(rowsOf(typedCountSpec(p, a, 'tenure', [r]))).toBe(r.exits)
    }
    expect(a.byTenure.reduce((s, r) => s + r.records.length, 0)).toBe(m.kpi.all.events)
  })
})

describe('movement buckets', () => {
  const mv = m.movement
  it('promotions per quarter, per level and moves per department list their events', () => {
    for (const q of mv.byQuarter) {
      expect(q.records.length).toBe(q.promotions)
      if (q.promotions) expect(rowsOf(promotionQuarterSpec(p, q))).toBe(q.promotions)
    }
    for (const r of mv.byLevel)
      if (r.rate != null) expect(rowsOf(promotionLevelSpec(p, r))).toBe(r.promotions || -1)
    for (const r of mv.byDepartment) if (r.moves) expect(rowsOf(deptMoveSpec(p, [r]))).toBe(r.moves)
    for (const r of mv.sincePromotion) if (r.people) expect(rowsOf(sinceSpec(p, r))).toBe(r.people)
  })

  it('tiles: promotions, moves, mobility', () => {
    expect(rowsOf(movementTileSpec(p, mv, 'promotions'))).toBe(mv.promotions.promotions)
    expect(rowsOf(movementTileSpec(p, mv, 'moves'))).toBe(mv.transfers + mv.lateral)
    expect(rowsOf(movementTileSpec(p, mv, 'mobility'))).toBe(mv.mobility.movers)
    expect(mv.mobility.rate).toBeCloseTo(mv.mobility.movers / mv.promotions.avgHeadcount, 10)
  })
})

describe('org design buckets', () => {
  const org = m.org
  it('span buckets, layers and manager cells list the people behind them', () => {
    for (const b of org.spanBuckets) {
      expect(b.records.length).toBe(b.managers)
      if (b.managers) expect(rowsOf(spanBucketSpec(p, b))).toBe(b.managers)
    }
    for (const l of org.layersByBu) expect(rowsOf(layerBuSpec(p, org, l))).toBe(l.people)
    for (const mg of org.managers.slice(0, 25)) {
      expect(rowsOf(managerCellSpec(p, org, mg, 'directs'))).toBe(mg.directs)
      expect(rowsOf(managerCellSpec(p, org, mg, 'totalOrg'))).toBe(mg.totalOrg)
      expect(mg.regrettedLeavers.length).toBe(mg.regretted12)
    }
    for (const c of org.chains) expect(org.peopleBelow(c.reportId).length).toBe(c.below)
  })

  it('tiles: managers, spans and the manager ratio', () => {
    expect(rowsOf(orgTileSpec(p, org, 'managers'))).toBe(org.managers.length)
    expect(org.individuals.length).toBe(org.activeWorkers - org.managers.length)
    expect(rowsOf(orgTileSpec(p, org, 'managerRatio'))).toBe(org.individuals.length)
    const spans = resolve(orgTileSpec(p, org, 'meanSpan'))
    const directs = spans?.rows.map((e) => spans.extra?.values(e).directs as number) ?? []
    expect(mean(directs)).toBeCloseTo(org.meanSpan ?? Number.NaN, 10)
    const deepest = resolve(orgTileSpec(p, org, 'layers'))
    expect(deepest?.rows.length).toBeGreaterThan(0)
    for (const e of deepest?.rows ?? []) expect(deepest?.extra?.values(e).layer).toBe(org.layers)
  })
})

describe('scorecard cells', () => {
  it('every cell opens the records its number is computed from', () => {
    for (const row of m.scorecard.rows) {
      const r = row.records
      expect(r.active.length).toBe(row.headcount)
      if (row.netChange != null) expect(r.joined.length - r.left.length).toBe(row.netChange)
      const annual = 12 / p.window.months
      if (row.voluntary != null) {
        expect(row.voluntary).toBeCloseTo((r.voluntary.length / r.avgHeadcount) * annual, 10)
        if (r.voluntary.length) expect(rowsOf(scoreSpec(p, row, 'voluntary'))).toBe(r.voluntary.length)
      }
      if (row.regretted != null)
        expect(row.regretted).toBeCloseTo((r.regretted.length / r.avgHeadcount) * annual, 10)
      if (row.promotionRate != null)
        expect(row.promotionRate).toBeCloseTo(r.promotions.length / r.avgHeadcount, 10)
      if (row.firstYear != null) expect(row.firstYear).toBeCloseTo(r.firstYear.length / r.cohort, 10)
      if (row.avgSpan != null)
        expect(row.avgSpan).toBeCloseTo(mean(r.managers.map((x) => x.directs)) ?? Number.NaN, 10)
      expect(rowsOf(scoreSpec(p, row, 'headcount'))).toBe(row.headcount)
    }
  })
})

describe('suppressed values have no records', () => {
  // Three employees and one leaver: every rate is hidden (average headcount under 5).
  const tiny = computeHrbp(
    ctxOf({
      employees: [
        ...many(3, { location: 'Austin' }),
        leaver('2026-05-04', 'Voluntary', { location: 'Austin' }),
      ],
    }),
  )

  it('hidden KPI rates carry no drill', () => {
    for (const id of ['attrition', 'voluntary', 'regretted', 'first-year', 'promotion-rate']) {
      const k = tiny.kpi.kpis.find((x) => x.id === id)
      expect(k?.value ?? null, id).toBeNull()
      expect(k?.drill, id).toBeUndefined()
    }
    // A count is never hidden: headcount still lists its three people.
    expect(rowsOf(tiny.kpi.kpis.find((x) => x.id === 'headcount')?.drill)).toBe(3)
  })

  it('hidden buckets carry no records and build no drill', () => {
    const tp = tiny.prep
    expect(tiny.attrition.quarters.length).toBeGreaterThan(0)
    expect(tiny.attrition.byLocation.length).toBeGreaterThan(0)
    expect(tiny.workforce.growth.length).toBeGreaterThan(0)
    for (const q of tiny.attrition.quarters) {
      expect(q.rate).toBeNull()
      expect(q.records).toEqual([])
      expect(quarterExitSpec(tp, [q])).toBeNull()
    }
    for (const r of tiny.attrition.byLocation) {
      expect(r.rate).toBeNull()
      expect(r.leavers).toEqual([])
      expect(groupExitSpec(tp, 'location', r, false)).toBeNull()
    }
    expect(groupOtherSpec(tp, tiny.attrition, 'location', tiny.attrition.byLocation, false)).toBeNull()
    for (const q of tiny.movement.byQuarter) expect(q.records).toEqual([])
    for (const g of tiny.workforce.growth) {
      expect(g.growth).toBeNull()
      expect(g.records.joined).toEqual([])
      expect(growthCellSpec(tp, g, 'growth')).toBeNull()
    }
  })

  it('a small group beside a large one: only the small one is hidden', () => {
    const big = many(30, { location: 'San Jose' })
    const small = many(2, { location: 'Austin' })
    const hrbp = computeHrbp(
      ctxOf({
        employees: [
          ...big,
          ...small,
          leaver('2026-03-02', 'Voluntary', { location: 'San Jose' }),
          leaver('2026-04-06', 'Voluntary', { location: 'Austin' }),
          emp({ location: 'Austin', hireDate: '2026-08-03' }),
        ],
      }),
    )
    const rows = hrbp.attrition.byLocation
    const sj = rows.find((r) => r.group === 'San Jose')
    const au = rows.find((r) => r.group === 'Austin')
    expect(sj?.rate).not.toBeNull()
    expect(rowsOf(groupExitSpec(hrbp.prep, 'location', sj as never, false))).toBe(1)
    expect(au?.rate).toBeNull()
    expect(au?.leavers).toEqual([])
    expect(groupExitSpec(hrbp.prep, 'location', au as never, false)).toBeNull()
  })

  it('a hidden scorecard value has no records', () => {
    const sc = computeHrbp(
      ctxOf({
        employees: [
          ...many(12, { businessUnit: 'Silicon Engineering', hireDate: '2020-01-06' }),
          ...many(12, { businessUnit: 'Go-to-Market', hireDate: '2020-01-06' }),
        ],
      }),
    )
    expect(sc.scorecard.rows.length).toBe(3)
    for (const row of sc.scorecard.rows) {
      // Nobody was hired 12 to 24 months ago: first-year attrition is hidden everywhere.
      expect(row.firstYear).toBeNull()
      expect(row.records.firstYear).toEqual([])
      expect(scoreSpec(sc.prep, row, 'firstYear')).toBeNull()
    }
  })
})

describe('KPI changes and notes open the records they state', () => {
  /** The first count in a note: 108 in "Plus 108 contractors and interns". */
  const first = (text: string | undefined, re = /\d[\d,]*/) => Number(text!.match(re)![0].replace(/\D/g, ''))
  const all = [...m.kpi.kpis, ...m.movementKpis, ...m.orgKpis]

  it('headcount: the change opens the employees 12 months earlier, the note the contractors and interns', () => {
    const k = kpi('headcount')
    expect(k.value! - rowsOf(k.deltaDrill)).toBe(k.delta)
    expect(rowsOf(k.noteDrill)).toBe(first(k.note))
    expect(
      resolve(k.noteDrill)!.rows.every(
        (e) => (e as { employmentType: string }).employmentType !== 'Employee',
      ),
    ).toBe(true)
  })

  it('hires: the change opens the prior period hires', () => {
    const k = kpi('hires')
    expect(k.value! - rowsOf(k.deltaDrill)).toBe(k.delta)
    expect(k.noteDrill).toBeUndefined()
  })

  it('rates: the change opens the comparison leavers, the note the leavers it counts', () => {
    for (const id of ['attrition', 'voluntary', 'regretted']) {
      const k = kpi(id)
      expect(rowsOf(k.noteDrill), id).toBe(first(k.note))
      const cmp = resolve(k.deltaDrill)!
      // The panel note spells out the comparison rate; its event count matches the rows.
      expect(cmp.rows.length, id).toBe(first(cmp.note, /= [\d,]+/))
    }
  })

  it('first-year: the change opens the comparison cohort leavers, the note the whole cohort', () => {
    const k = kpi('first-year')
    const cmp = resolve(k.deltaDrill)!
    expect(cmp.note).toMatch(/^Rate = [\d,]+ leavers? ÷/)
    expect(cmp.rows.length).toBe(first(cmp.note, /= [\d,]+/))
    expect(rowsOf(k.noteDrill)).toBe(first(k.note, /n = [\d,]+/))
  })

  it('promotion rate and movement tiles', () => {
    const rate = kpi('promotion-rate')
    const cmp = resolve(rate.deltaDrill)!
    expect(cmp.rows.length).toBe(first(cmp.note, /= [\d,]+/))
    expect(rowsOf(rate.noteDrill)).toBe(first(rate.note))
    const tile = (id: string) => m.movementKpis.find((k) => k.id === id)!
    const promos = tile('promotions')
    expect(promos.value! - rowsOf(promos.deltaDrill)).toBe(promos.delta)
    const moves = tile('moves')
    const [transfers, lateral] = moves.note!.match(/\d[\d,]*/g)!.map((x) => Number(x.replace(/\D/g, '')))
    expect(rowsOf(moves.noteDrill)).toBe(transfers + lateral)
    const mobility = tile('mobility')
    expect(rowsOf(mobility.noteDrill)).toBe(first(mobility.note))
  })

  it('org design: the note counts open their people', () => {
    const tile = (id: string) => m.orgKpis.find((k) => k.id === id)!
    const managers = tile('managers')
    expect(rowsOf(managers.noteDrill)).toBe(first(managers.note))
    const median = tile('median-span')
    const half = first(median.note)
    const list = resolve(median.noteDrill)!
    expect(list.rows.length).toBe(m.org.managers.filter((x) => x.directs >= half).length)
    expect(list.rows.length).toBeGreaterThanOrEqual(m.org.managers.length / 2)
  })

  it('every drill on a tile carries the tile fields, so the panel shows its tier', () => {
    for (const k of all)
      for (const src of [k.drill, k.deltaDrill, k.noteDrill]) {
        const spec = resolve(src)
        if (spec) expect(spec.uses, k.id).toEqual(k.uses)
      }
  })

  it('compares with the company under an org filter', () => {
    const scoped = computeHrbp(sampleCtx({ location: ['Bengaluru'] }))
    const vol = scoped.kpi.kpis.find((k) => k.id === 'voluntary')!
    expect(vol.deltaLabel).toBe('vs company')
    const cmp = resolve(vol.deltaDrill)!
    expect(cmp.subtitle).toMatch(/· Whole company$/)
    expect(cmp.rows.length).toBe(first(cmp.note, /= [\d,]+/))
    expect(cmp.rows.length).toBeGreaterThan(rowsOf(vol.noteDrill))
  })
})
