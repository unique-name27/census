/**
 * Smoke test on the generated sample (whole company, last 12 months): every planted onboarding
 * and hiring plan story in src/data/sample/README.md is detected, every number is finite or null,
 * every count opens exactly the records it counts, and the engine runs inside its budget.
 */
import { describe, expect, it } from 'vitest'
import type { Finding, Kpi } from '@/components/types'
import type { Employee, HiringPlanLine, OnboardingTask } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { formatRange } from '@/lib/dates'
import { hiresVsPlan } from '../api'
import { coverageDrills, dayOneTasksDrill, readinessDrill } from './drills'
import { actions, computeOnboarding, computeOnboardingUncached, headline, summary } from './index'
import { sampleContext } from './testkit'

const ctx = sampleContext()
const m = computeOnboarding(ctx)
const allKpis: Kpi[] = [...m.kpis.upcoming, ...m.kpis.first90, ...m.kpis.plan]
const kpi = (id: string): Kpi => {
  const k = allKpis.find((x) => x.id === id)
  if (!k) throw new Error(`No KPI ${id}`)
  return k
}
const find = (id: string): Finding => {
  const f = m.findings.find((x) => x.id === id)
  if (!f) throw new Error(`Missing finding ${id}. Have: ${m.findings.map((x) => x.id).join(', ')}`)
  return f
}
const rowsOf = (src: unknown) => resolveDrill(src as never)?.rows.length ?? 0

describe('Onboarding on the sample company', () => {
  it('runs inside its budget', () => {
    computeOnboardingUncached(ctx)
    const t0 = performance.now()
    computeOnboardingUncached(ctx)
    expect(performance.now() - t0).toBeLessThan(400)
  })

  it('returns finite or null numbers, each with a metric, the fields it reads and its records', () => {
    for (const k of allKpis) {
      expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
      expect(k.delta == null || Number.isFinite(k.delta), k.id).toBe(true)
      for (const s of k.spark ?? []) expect(s === null || Number.isFinite(s), k.id).toBe(true)
      expect(k.metricId, k.id).toMatch(/^onboarding\./)
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(resolveDrill(k.drill), k.id).not.toBeNull()
    }
    for (const f of m.findings) {
      expect(f.metricId, f.id).toMatch(/^onboarding\./)
      expect(f.uses?.length, f.id).toBeGreaterThan(0)
      expect(rowsOf(f.drill), f.id).toBeGreaterThan(0)
    }
  })

  it('opens exactly the records each count shows', () => {
    for (const id of ['starts-30', 'day-minus-3', 'contingencies', 'probation', 'committed'])
      expect(rowsOf(kpi(id).drill), id).toBe(kpi(id).value)
  })

  it('words the day -3 drill subtitle like every snapshot drill', () => {
    const spec = resolveDrill(kpi('day-minus-3').drill)!
    expect(spec.subtitle).toMatch(
      /^As of 30 Sep 2026 · Whole company · starts by \d{1,2} [A-Z][a-z]{2} \d{4}$/,
    )
  })

  it('opens the records behind every note on the scorecard measures', () => {
    const first = (text: string | undefined) => Number(/^([\d,]+) /.exec(text ?? '')![1].replace(/\D/g, ''))
    // "223 of 269 starts ready": the ready ones.
    expect(rowsOf(kpi('day-one').noteDrill)).toBe(first(kpi('day-one').note))
    // "0 of 186 starts" still opens the starts; with leavers it opens the leavers.
    const a = kpi('attrition-90')
    const leavers = first(a.note)
    const cohort = Number(/of ([\d,]+) start/.exec(a.note ?? '')![1].replace(/\D/g, ''))
    expect(rowsOf(a.noteDrill)).toBe(leavers || cohort)
    for (const k of summary(ctx).kpis) expect(resolveDrill(k.noteDrill), k.id).not.toBeNull()
  })

  it('drills plan year-to-date starts with the plan year as the window, and the gap to its open lines', () => {
    const p = m.plan!
    const vs = resolveDrill(kpi('vs-plan').drill)!
    expect(vs.subtitle).toContain('1 Apr 2026')
    expect(vs.subtitle).not.toContain('1 Oct 2025')
    const gap = resolveDrill(kpi('gap').drill)!
    expect(gap.rows.length).toBe(p.noReq.length)
    expect(gap.note).toMatch(/^Gap = [\d,]+ planned − \(/)
    // Plan lines carry their planned starts in the subtitle when the two differ.
    const planned = resolveDrill(kpi('vs-plan').noteDrill)!
    expect(planned.subtitle).toMatch(new RegExp(`^${p.planYtd} planned starts · `))
  })

  it('story 1: 59 people start in Q4 2026, 44 of them in October; Bengaluru notice periods run 60 d or more', () => {
    expect(m.base.upcoming.starts).toHaveLength(59)
    expect(kpi('starts-30').value).toBe(44)
    expect(kpi('starts-30').note).toBe('60 d: 54 · 90 d: 59')
    const bengaluru = m.upcoming.acceptToStart.byLocation.find((r) => r.location === 'Bengaluru')
    expect(bengaluru?.days).toBeGreaterThanOrEqual(60)
    for (const site of ['San Jose', 'Austin', 'Raleigh', 'Seattle', 'Boulder'])
      expect(
        m.upcoming.acceptToStart.byLocation.find((r) => r.location === site)?.days ?? 0,
        site,
      ).toBeLessThan(40)
  })

  it('story 2: the 25 pre-hires are matched to their accepted offers, including the two moved a week', () => {
    expect(m.base.upcoming.duplicates).toHaveLength(25)
    expect(m.base.upcoming.starts.filter((s) => s.employee && s.candidate)).toHaveLength(25)
    const moved = m.base.upcoming.starts.filter(
      (s) => s.employee && s.candidate && s.candidate.startDate !== s.startDate,
    )
    expect(moved).toHaveLength(2)
  })

  it('story 3: two Bengaluru reneges; India 2.3%, the company 0.6%', () => {
    const r = m.upcoming.renege
    expect(r.reneged).toHaveLength(2)
    expect(r.tracked.country).toBe('India')
    expect(r.tracked.rate).toBeCloseTo(2 / 86)
    expect(r.rate).toBeLessThan(0.01)
    const f = find('onboarding-renege-location')
    expect(f.title).toBe(
      'Both reneges in the last 12 months were in Bengaluru: 2 of 86 accepted offers (2.3%).',
    )
  })

  it('story 4: laptops shipped late for 41.1% of Asia Pacific starts; day-one readiness 83%, 72% there', () => {
    const f = find('onboarding-late-laptop-shipped')
    expect(f.title).toBe('Laptops shipped late for 41.1% of Asia Pacific starts, against 6.2% elsewhere.')
    expect(f.detail).toContain('51 of 124 starts')
    expect(f.detail).toContain('"I had what I needed" 3.42 of 5 at day 30, against 4.28 elsewhere')
    expect(kpi('day-one').value).toBeCloseTo(0.83, 2)
    const apac = m.first90.dayOne.byRegion.find((g) => g.group === 'Asia Pacific')
    expect(apac?.rate).toBeCloseTo(0.72, 2)
    expect(find('onboarding-day-one').severity).toBe('critical')
  })

  it('story 5: three people start on 5 Oct without a cleared background check; five open contingencies', () => {
    expect(kpi('contingencies').value).toBe(5)
    const f = find('onboarding-contingencies')
    expect(f.severity).toBe('critical')
    expect(f.title).toBe('3 people start on 5 Oct 2026 without a cleared background check.')
    expect(f.detail).toBe('2 more starting on 12 Oct 2026 have their export-control screening blocked.')
    expect(f.action).toBe('Ask People operations to confirm the background checks before 2 Oct 2026.')
  })

  it('story 6: four probation decisions are overdue, all in Sales', () => {
    expect(kpi('probation').value).toBe(4)
    const f = find('onboarding-probation')
    expect(f.title).toBe('4 probation decisions are overdue, all in Sales.')
    expect(f.detail).toContain('3 in Bengaluru and 1 in Shanghai')
  })

  it('story 7: check-ins in Software are on time for under half, against 88% elsewhere', () => {
    const f = find('onboarding-check-ins')
    expect(f.title).toMatch(
      /^Check-ins in Software were on time for 4\d% \(32 of 6\d\), against 88% elsewhere\.$/,
    )
  })

  it('story 8: I-9 Section 2 was on time for 115 of 120 US starts', () => {
    expect(m.first90.i9.judged).toHaveLength(120)
    expect(m.first90.i9.late).toHaveLength(5)
    expect(find('onboarding-i9').title).toContain('95.8% on time against a 100% target')
  })

  it('hiring plan story 2: Silicon Engineering is 14 starts behind its Q4 plan', () => {
    const f = find('onboarding-plan-behind-silicon-engineering')
    expect(f.title).toBe(
      'Silicon Engineering is 14 starts behind its Q4 2026 plan: 9 planned roles have no req and 5 sit on reqs on hold.',
    )
    expect(f.detail).toContain('Its Q4 2026 plan is 88 starts: 13 have an accepted offer and 61 an open req.')
    expect(m.plan?.quarter.units.filter((u) => u.uncovered > 0).map((u) => u.businessUnit)).toEqual([
      'Silicon Engineering',
    ])
    expect(kpi('quarter-uncovered').value).toBe(14)
  })

  it('hiring plan story 3: year to date Silicon Engineering is behind at 86%, Go-to-Market ahead at 120%', () => {
    const p = m.plan!
    expect(p.version).toBe('FY27 v2')
    const unit = (bu: string) => p.byUnit.find((r) => r.businessUnit === bu)
    expect([unit('Silicon Engineering')?.actualYtd, unit('Silicon Engineering')?.planYtd]).toEqual([88, 102])
    expect(unit('Silicon Engineering')?.status).toBe('Behind')
    expect(unit('Go-to-Market')?.status).toBe('Ahead')
    expect([p.actual.length, p.planYtd, p.status]).toEqual([153, 167, 'On plan'])
    expect(p.months.filter((x) => x.month >= '2026-10' && x.month <= '2026-12').map((x) => x.plan)).toEqual([
      79, 53, 38,
    ])
  })

  it('hiring plan story 4: 12 open reqs are not in the plan, 9 of them backfills', () => {
    expect(m.plan?.notInPlan.backfills).toHaveLength(9)
    expect(m.plan?.notInPlan.added.map((r) => r.businessUnit).sort()).toEqual([
      'Go-to-Market',
      'Operations',
      'Operations',
    ])
    expect(find('onboarding-not-in-plan').title).toBe(
      '12 open reqs are not in the hiring plan, 9 of them backfills.',
    )
  })

  it('forecasts the open reqs with Recruiting time to fill, inside the plan year', () => {
    const f = m.forecast!
    expect(f.ttf).toBe(52)
    expect(f.fillRate).toBeGreaterThan(0.8)
    expect(kpi('forecast').value).toBeGreaterThan(0)
    expect(kpi('forecast').value).toBeLessThanOrEqual(114)
  })

  it('gives the folder tab, the People scorecard and Recruiting their numbers', () => {
    expect(headline(ctx)).toMatchObject({ value: '44', label: 'starts in 30 days' })
    expect(headline(ctx).spark).toHaveLength(8)
    const s = summary(ctx)
    expect(s.kpis.map((k) => k.id)).toEqual(['day-one', 'i9', 'attrition-90'])
    for (const k of s.kpis) {
      expect(k.tab).toBe('first90')
      expect(resolveDrill(k.drill)).not.toBeNull()
    }
    expect(s.findings.length).toBeGreaterThan(0)
    const h = hiresVsPlan(ctx)
    expect([h?.actual, h?.planned, h?.status]).toEqual([153, 167, 'On plan'])
    expect(rowsOf(h?.kpi.drill)).toBe(153)
  })

  it('hands the Action center the contingencies, probation decisions and their owners', () => {
    const items = actions(ctx)
    const ids = items.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    const bgc = items.filter((x) => x.id.endsWith(':Background check cleared'))
    expect(bgc).toHaveLength(3)
    expect(bgc.every((x) => x.ownerRole === 'hr-ops')).toBe(true)
    const screening = items.filter((x) => x.id.endsWith(':Export-control screening'))
    expect(screening.map((x) => x.ownerRole)).toEqual(['trade-compliance', 'trade-compliance'])
    const probation = items.filter(
      (x) => x.id.startsWith('onboarding:probation:') && x.severity === 'warning',
    )
    expect(probation).toHaveLength(4)
    expect(probation.every((x) => x.ownerRole === 'manager' && x.ownerId)).toBe(true)
    for (const x of items) {
      expect(x.view).toBe('onboarding')
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      expect(resolveDrill(x.drill), x.id).not.toBeNull()
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(/\b(chase|push|nag|ping|hound)\b/i)
    }
  })
})

describe('Onboarding drills open what was clicked (sample)', () => {
  const b = m.base
  const p = m.plan!
  const ytd = `${formatRange(p.start, p.toDate)} · Whole company`
  const planned = (rows: readonly unknown[]) =>
    (rows as HiringPlanLine[]).reduce((n, l) => n + l.plannedHires, 0)
  const none = { plan: undefined, actual: undefined, gap: undefined }

  it('plan coverage: every count opens its own records, starts to date over the plan year to date', () => {
    expect(p.start).toBe('2026-04-01')
    for (const r of [...p.byUnit, ...p.byDepartment]) {
      const where = r.department ?? r.businessUnit
      const d = coverageDrills(b, p, r, where, none)
      if (r.actualYtd) {
        const spec = resolveDrill(d.actualYtd)!
        expect(spec.rows.length, where).toBe(r.actualYtd)
        expect(spec.subtitle, where).toBe(ytd)
        for (const e of spec.rows as Employee[])
          expect(e.hireDate >= p.start && e.hireDate <= p.toDate).toBe(true)
      } else expect(d.actualYtd, where).toBeNull()
      // Planned starts open plan lines whose planned starts add up to the number clicked.
      if (r.planYtd) {
        const spec = resolveDrill(d.planYtd)!
        expect(planned(spec.rows), where).toBe(r.planYtd)
        if (r.planYtd !== spec.rows.length)
          expect(spec.subtitle, where).toMatch(/^[\d,]+ planned starts · As of /)
      } else expect(d.planYtd, where).toBeNull()
      if (r.planFull) expect(planned(resolveDrill(d.planFull)!.rows), where).toBe(r.planFull)
      // The gap opens the uncovered future lines of this row, with the sum in the note.
      if (Math.round(r.gap) > 0) {
        const spec = resolveDrill(d.gap)!
        const open = p.noReq.filter((v) => r.lines.includes(v.line)).map((v) => v.line)
        if (open.length) expect(spec.rows).toEqual(open)
        expect(spec.note, where).toMatch(/^Gap = [\d,]+ planned − \(/)
      } else expect(d.gap, where).toBeNull()
    }
  })

  it('the "ahead of plan" finding opens the starts to date with the plan year to date as the window', () => {
    const f = find('onboarding-plan-ytd-go-to-market')
    const unit = p.byUnit.find((r) => r.businessUnit === 'Go-to-Market')!
    const spec = resolveDrill(f.drill)!
    expect(spec.subtitle).toBe(ytd)
    expect(spec.rows.length).toBe(unit.actualYtd)
    // The Hiring plan KPI and Recruiting's Hires vs plan tile say the same.
    expect(resolveDrill(kpi('vs-plan').drill)!.subtitle).toBe(ytd)
    expect(resolveDrill(hiresVsPlan(ctx)!.kpi.drill)!.subtitle).toBe(ytd)
  })

  it('a start’s "7 of 10 done" opens exactly those day-one tasks, not the later check-ins', () => {
    let fewer = 0
    for (const row of m.upcoming.rows) {
      const r = row.readiness
      const spec = dayOneTasksDrill(b, r, row.start.name)
      if (!r.total) {
        expect(spec).toBeNull()
        continue
      }
      const tasks = spec!.rows as OnboardingTask[]
      expect(tasks.length, row.start.name).toBe(r.total)
      expect(
        tasks.some((t) => /check-in|probation/i.test(t.task)),
        row.start.name,
      ).toBe(false)
      expect(spec!.note?.startsWith(`${r.done} of ${r.total} done. `)).toBe(true)
      if (row.start.tasks.length > r.total) fewer++
    }
    // The sample's starts have later tasks too (the check-ins), which stay out of the panel.
    expect(fewer).toBeGreaterThan(0)
  })

  it('a day-one readiness bar opens the starts not ready, and everyone on a 100% bar', () => {
    const ready = new Set(m.first90.dayOne.ready)
    const groups = [...m.first90.dayOne.bySite, ...m.first90.dayOne.byRegion].filter((g) => g.rate != null)
    expect(groups.some((g) => g.met === g.n)).toBe(true)
    for (const g of groups) {
      const spec = readinessDrill(b, g.rows, ready, g.group)!
      expect(spec, g.group).not.toBeNull()
      if (g.met === g.n) {
        expect(spec.title).toBe(`Ready on day one, ${g.group}`)
        expect(spec.rows.length).toBe(g.n)
      } else {
        expect(spec.title).toBe(`Not ready on day one, ${g.group}`)
        expect(spec.rows.length, g.group).toBe(g.n - (g.met ?? 0))
      }
    }
  })
})
