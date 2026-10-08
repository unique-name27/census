/**
 * The sample's data for the People stats special analyses (docs/ANALYSES.md, 2.10, 3.10, 4.10):
 * education with its planted stories, FTE, and the offer details. Measured the way the analyses
 * read them at their default settings (`./outcomes`), with the tolerances the spec gives.
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '../context'
import { DATASET_KEYS, type DatasetKey, SITES } from '../schema'
import { DEFAULT_FILTERS } from '../scope'
import type { SourceMeta } from '../store'
import { generateSample, SAMPLE_AS_OF } from '.'
import { BARTON_CREEK, COYOTE_VALLEY, SAMPLE_UNIVERSITIES, SMALL_SCHOOLS, VRISHABHA_HILLS } from './education'
import { expectedScore, groupScore, type HireOutcome, hireOutcomes } from './outcomes'

const data = generateSample()
const cohort = hireOutcomes(data.employees, data.reviews, data.jobChanges, SAMPLE_AS_OF)
const company = groupScore(cohort)
const cQ = company.Q as number
const by = (pred: (h: HireOutcome) => boolean, hs: readonly HireOutcome[] = cohort) => hs.filter(pred)
const school = (name: string) => by((h) => h.e.university === name)
/** Shown on their own: 10 or more scored hires. */
const universities = [...new Set(cohort.map((h) => h.e.university).filter((u): u is string => !!u))]
const shown = universities.filter((u) => groupScore(school(u)).n >= 10)

describe('education on the sample', () => {
  it('measures the cohort as the spec does: 488 hires, quality of hire 66.9', () => {
    expect(cohort).toHaveLength(488)
    expect(company.n).toBe(488)
    expect(cQ).toBeCloseTo(66.9, 1)
    expect(company.P).toBeCloseTo(54.2, 1)
    expect(company.R).toBeCloseTo(84.2, 1)
  })

  it('fills about 85% of employee rows, never with a graduation year', () => {
    const filled = data.employees.filter((e) => e.university || e.degreeLevel).length
    expect(filled / data.employees.length).toBeGreaterThan(0.82)
    expect(filled / data.employees.length).toBeLessThan(0.9)
    for (const e of data.employees)
      expect(Object.keys(e).some((k) => /^(grad|graduation|birth|dob|age)/i.test(k))).toBe(false)
  })

  it('uses fictional schools by site, story schools first', () => {
    expect(SAMPLE_UNIVERSITIES).toContain(COYOTE_VALLEY)
    expect(SAMPLE_UNIVERSITIES.length).toBeGreaterThanOrEqual(30)
    const used = new Set(data.employees.map((e) => e.university).filter(Boolean))
    for (const u of used) expect(SAMPLE_UNIVERSITIES, String(u)).toContain(u)
    for (const site of SITES)
      if (data.employees.some((e) => e.location === site.location))
        expect(
          data.employees.some((e) => e.location === site.location && e.university),
          site.location,
        ).toBe(true)
  })

  it('Coyote Valley University: clearly above the company and its expected score', () => {
    const g = school(COYOTE_VALLEY)
    const s = groupScore(g)
    const exp = expectedScore(g, cohort) as number
    expect(g.every((h) => h.e.location === 'San Jose')).toBe(true)
    expect(s.n).toBeGreaterThanOrEqual(35)
    expect(s.n).toBeLessThanOrEqual(45)
    expect(s.Q as number).toBeGreaterThanOrEqual(cQ + 9)
    expect(s.low as number).toBeGreaterThan(cQ)
    expect(Math.abs(exp - 65)).toBeLessThanOrEqual(3)
    expect((s.Q as number) - exp).toBeGreaterThanOrEqual(8)
  })

  it('Vrishabha Hills: the strongest first reviews, a third gone, as other Bengaluru hires score', () => {
    const g = school(VRISHABHA_HILLS)
    const s = groupScore(g)
    const exp = expectedScore(g, cohort) as number
    expect(g.every((h) => h.e.location === 'Bengaluru')).toBe(true)
    expect(s.n).toBeGreaterThanOrEqual(28)
    expect(s.n).toBeLessThanOrEqual(36)
    expect(s.P as number).toBeGreaterThanOrEqual(66)
    for (const u of shown)
      if (u !== VRISHABHA_HILLS) expect(groupScore(school(u)).P as number, u).toBeLessThan(s.P as number)
    expect(s.R as number).toBeLessThanOrEqual(70)
    expect(Math.abs((s.Q as number) - exp)).toBeLessThanOrEqual(3)
    // Finding 2's test: reviews at least 8 above the company, retention at least 10 below.
    expect(s.P as number).toBeGreaterThanOrEqual((company.P as number) + 8)
    expect(s.R as number).toBeLessThanOrEqual((company.R as number) - 10)
  })

  it('Barton Creek Polytechnic: well below the company, but too few to be sure', () => {
    const s = groupScore(school(BARTON_CREEK))
    expect(s.n).toBeGreaterThanOrEqual(10)
    expect(s.n).toBeLessThanOrEqual(14)
    expect(s.Q as number).toBeLessThanOrEqual(cQ - 8)
    expect(s.high as number).toBeGreaterThan(cQ)
  })

  it('no other school is clearly away from the company by the readout rule, and 12+ fold into Other', () => {
    for (const u of shown) {
      if (u === COYOTE_VALLEY) continue
      const g = school(u)
      const s = groupScore(g)
      const exp = expectedScore(g, cohort) as number
      const clear = (s.low as number) > cQ || (s.high as number) < cQ
      const fires = clear && Math.abs((s.Q as number) - cQ) >= 5 && Math.abs((s.Q as number) - exp) >= 2.5
      expect(fires, u).toBe(false)
    }
    const folded = universities.filter((u) => {
      const n = groupScore(school(u)).n
      return n >= 1 && n <= 9
    })
    expect(folded.length).toBeGreaterThanOrEqual(12)
    for (const s of SMALL_SCHOOLS) expect(groupScore(school(s)).n, s).toBeLessThanOrEqual(9)
  })

  it("degree levels: Master's above Bachelor's, PhDs strongest with the company's retention, Associate for technicians", () => {
    const level = (d: string) => by((h) => h.e.degreeLevel === d)
    const masters = groupScore(level("Master's"))
    const bachelors = groupScore(level("Bachelor's"))
    expect((masters.Q as number) - (bachelors.Q as number)).toBeGreaterThanOrEqual(4)
    const phd = groupScore(level('PhD'))
    expect(phd.n).toBeGreaterThanOrEqual(18)
    expect(phd.n).toBeLessThanOrEqual(30)
    for (const d of ["Master's", "Bachelor's", 'Associate', 'Other'])
      expect(groupScore(level(d)).P as number, d).toBeLessThan(phd.P as number)
    expect(Math.abs((phd.R as number) - (company.R as number))).toBeLessThanOrEqual(6)
    const associate = level('Associate')
    expect(associate.length).toBeGreaterThanOrEqual(8)
    expect(associate.length).toBeLessThanOrEqual(15)
    expect(associate.filter((h) => /Technician/.test(h.e.jobTitle)).length * 2).toBeGreaterThan(
      associate.length,
    )
  })

  it("computer science bachelor's in Silicon Engineering design and verification: most did not stay", () => {
    const cs = (h: HireOutcome) => h.e.degreeLevel === "Bachelor's" && h.e.fieldOfStudy === 'Computer Science'
    const ee = (h: HireOutcome) =>
      h.e.degreeLevel === "Bachelor's" && h.e.fieldOfStudy === 'Electrical Engineering'
    const design = by(
      (h) =>
        cs(h) &&
        h.e.businessUnit === 'Silicon Engineering' &&
        (h.e.jobFunction === 'Design RTL' || h.e.jobFunction === 'Design Verification'),
    )
    expect(design.length).toBeGreaterThanOrEqual(10)
    expect(groupScore(design).R as number).toBeLessThanOrEqual(65)
    const companyCs = groupScore(by(cs))
    const companyEe = groupScore(by(ee))
    expect(companyCs.n).toBeGreaterThanOrEqual(10)
    expect((companyEe.Q as number) - (companyCs.Q as number)).toBeGreaterThanOrEqual(6)
    const se = by((h) => h.e.businessUnit === 'Silicon Engineering')
    const seCs = groupScore(by(cs, se))
    const seEe = groupScore(by(ee, se))
    expect(seCs.n).toBeGreaterThanOrEqual(10)
    expect(seEe.n).toBeGreaterThanOrEqual(10)
    expect((seEe.Q as number) - (seCs.Q as number)).toBeGreaterThanOrEqual(12)
  })

  it('records education for 88% of the cohort, about 70% in Go-to-Market and Corporate', () => {
    const recorded = (hs: readonly HireOutcome[]) =>
      hs.filter((h) => h.e.university || h.e.degreeLevel).length / hs.length
    expect(Math.abs(recorded(cohort) - 0.88)).toBeLessThanOrEqual(0.02)
    for (const unit of ['Go-to-Market', 'Corporate']) {
      const r = recorded(by((h) => h.e.businessUnit === unit))
      expect(r, unit).toBeGreaterThanOrEqual(0.65)
      expect(r, unit).toBeLessThanOrEqual(0.75)
    }
    for (const unit of new Set(cohort.map((h) => h.e.businessUnit)))
      if (unit !== 'Go-to-Market' && unit !== 'Corporate')
        expect(recorded(by((h) => h.e.businessUnit === unit)), unit).toBeGreaterThanOrEqual(0.93)
  })
})

describe('FTE on the sample', () => {
  const active = data.employees.filter(
    (e) => e.hireDate <= SAMPLE_AS_OF && (!e.terminationDate || e.terminationDate > SAMPLE_AS_OF),
  )
  const part = active.filter((e) => e.fte != null && e.fte < 1)

  it('has 20 part-time employees by site and 6 contractors at half time; everyone else is 1', () => {
    const employees = part.filter((e) => e.employmentType === 'Employee')
    expect(employees).toHaveLength(20)
    const at = (site: string) => employees.filter((e) => e.location === site).length
    expect([at('Munich'), at('Haifa'), at('Toronto'), at('San Jose')]).toEqual([8, 5, 4, 3])
    for (const e of employees) expect([0.5, 0.6, 0.8]).toContain(e.fte)
    const contractors = part.filter((e) => e.employmentType === 'Contractor')
    expect(contractors).toHaveLength(6)
    for (const e of contractors) expect(e.fte).toBe(0.5)
    for (const e of data.employees) if (!part.includes(e)) expect(e.fte, e.employeeId).toBe(1)
  })

  it('puts 9 of the part-timers in engineering stages: verification 3, RTL design 2, software and firmware 4', () => {
    const employees = part.filter((e) => e.employmentType === 'Employee')
    const fn = (...names: string[]) => employees.filter((e) => names.includes(e.jobFunction ?? '')).length
    expect(fn('Design Verification')).toBe(3)
    expect(fn('Design RTL')).toBe(2)
    expect(fn('Software', 'Firmware')).toBe(4)
    const engineering = employees.filter(
      (e) => e.jobFamily === 'Silicon Engineering' || e.jobFamily === 'Systems & Software Engineering',
    )
    expect(engineering).toHaveLength(9)
  })
})

describe('offer details on the sample', () => {
  const reqs = new Map(data.requisitions.map((r) => [r.reqId, r]))
  const from = '2025-10-01'
  // Recruiting's resolved offers: accepted is status Hired by its accepted date (reneges are not declines).
  const accepted = data.candidates.filter(
    (c) => c.status === 'Hired' && !!c.hiredDate && c.hiredDate >= from && c.hiredDate <= SAMPLE_AS_OF,
  )
  const declined = data.candidates.filter(
    (c) =>
      c.status === 'Declined' && !!c.rejectedDate && c.rejectedDate >= from && c.rejectedDate <= SAMPLE_AS_OF,
  )
  const resolved = [...accepted, ...declined]
  const acceptance = (cs: readonly (typeof resolved)[number][]) =>
    cs.filter((c) => accepted.includes(c)).length / cs.length
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }

  it('keeps the measured decline story: 88 of 401 declined in the last 12 months', () => {
    expect(resolved).toHaveLength(401)
    expect(declined).toHaveLength(88)
  })

  it('records the three fields on every offer resolved since 1 Oct 2025, and none before', () => {
    for (const c of resolved) {
      expect(typeof c.competingOffer, c.applicationId).toBe('boolean')
      expect(typeof c.offerRevised, c.applicationId).toBe('boolean')
      expect(typeof c.offerPositionInRange, c.applicationId).toBe('number')
    }
    // Reneges were accepted offers too, so they carry them; everything else resolved earlier or open does not.
    const before = data.candidates.filter(
      (c) => !resolved.includes(c) && !(c.hiredDate && c.hiredDate >= from),
    )
    for (const c of before) expect(c.competingOffer ?? null, c.applicationId).toBe(null)
  })

  it('competing offers: most competing-offer declines, a third of pay declines, no counteroffers', () => {
    const share = (reason: string) => {
      const g = declined.filter((c) => c.rejectionReason === reason)
      return g.filter((c) => c.competingOffer).length / g.length
    }
    expect(share('Accepted competing offer')).toBeGreaterThanOrEqual(0.8)
    expect(share('Accepted competing offer')).toBeLessThanOrEqual(0.9)
    expect(share('Compensation below expectations')).toBeGreaterThanOrEqual(0.25)
    expect(share('Compensation below expectations')).toBeLessThanOrEqual(0.35)
    expect(share('Counteroffer from current employer')).toBe(0)
    const withOffer = resolved.filter((c) => c.competingOffer)
    expect(acceptance(withOffer)).toBeGreaterThanOrEqual(0.25)
    expect(acceptance(withOffer)).toBeLessThanOrEqual(0.35)
  })

  it('revised offers: a quarter of those with a competing offer, most of them accepted', () => {
    const withOffer = resolved.filter((c) => c.competingOffer)
    const revised = withOffer.filter((c) => c.offerRevised)
    expect(revised.length / withOffer.length).toBeGreaterThanOrEqual(0.2)
    expect(revised.length / withOffer.length).toBeLessThanOrEqual(0.3)
    expect(acceptance(revised)).toBeGreaterThanOrEqual(0.55)
    expect(acceptance(withOffer.filter((c) => !c.offerRevised))).toBeLessThanOrEqual(0.25)
  })

  it('position in range: Bengaluru low, declined lowest, senior declines below the rest', () => {
    const blr = (c: (typeof resolved)[number]) => reqs.get(c.reqId)?.location === 'Bengaluru'
    const pos = (cs: typeof resolved) => median(cs.map((c) => c.offerPositionInRange as number))
    const within = (v: number, lo: number, hi: number) => {
      expect(v).toBeGreaterThanOrEqual(lo)
      expect(v).toBeLessThanOrEqual(hi)
    }
    within(pos(declined.filter(blr)), 0.18, 0.24)
    within(pos(accepted.filter(blr)), 0.35, 0.42)
    within(pos(declined.filter((c) => !blr(c))), 0.42, 0.5)
    within(pos(accepted.filter((c) => !blr(c))), 0.48, 0.56)
    within(pos(declined.filter((c) => ['L5', 'L6'].includes(reqs.get(c.reqId)?.level ?? ''))), 0.3, 0.38)
  })

  it('slow decisions: offers decided after a week are mostly declined; within a week, rarely', () => {
    const days = (c: (typeof resolved)[number]) => {
      const d = (accepted.includes(c) ? c.hiredDate : c.rejectedDate) as string
      return (Date.parse(d) - Date.parse(c.offerDate as string)) / 86_400_000
    }
    const slow = resolved.filter((c) => c.offerDate && days(c) > 7)
    const fast = resolved.filter((c) => c.offerDate && days(c) <= 7)
    const declineRate = (cs: typeof resolved) => cs.filter((c) => declined.includes(c)).length / cs.length
    expect(declineRate(slow)).toBeGreaterThanOrEqual(0.45)
    expect(declineRate(slow)).toBeLessThanOrEqual(0.6)
    expect(declineRate(fast)).toBeLessThanOrEqual(0.17)
    // Decline dates stay in their quarter and never pass the as-of date; offer dates stay too.
    for (const c of declined) expect(c.rejectedDate! <= SAMPLE_AS_OF).toBe(true)
  })
})

describe('engineering by stage on the sample', () => {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as unknown as Record<DatasetKey, SourceMeta>
  const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
  const active = data.employees.filter(
    (e) => e.hireDate <= SAMPLE_AS_OF && (!e.terminationDate || e.terminationDate > SAMPLE_AS_OF),
  )
  const placed = active
    .filter((e) => e.employmentType === 'Employee' || e.employmentType === 'Contractor')
    .map((e) => ({ e, at: ctx.jobs.engineeringPlace(e) }))
    .filter((x) => x.at)
  const inStage = (stage: string) => placed.filter((x) => x.at?.stage === stage)

  it('saves a stage on every engineering function but Packaging, which Census proposes', () => {
    const proposed = placed.filter((x) => x.at?.source === 'proposed')
    expect(new Set(proposed.map((x) => x.e.jobFunction))).toEqual(new Set(['Packaging']))
    expect(proposed.every((x) => x.at?.stage === 'signoff')).toBe(true)
    const employees = placed.filter((x) => x.e.employmentType === 'Employee')
    const saved = employees.filter((x) => x.at?.source === 'saved').length / employees.length
    expect(saved).toBeGreaterThanOrEqual(0.985)
    expect(saved).toBeLessThan(1)
    expect(placed.some((x) => x.at?.stage == null)).toBe(false)
  })

  it('verification sits below 1.5 per RTL designer, and 40% or more of verification and DFT is in Bengaluru', () => {
    expect(inStage('verification').length / inStage('rtl').length).toBeLessThan(1.5)
    for (const stage of ['verification', 'dft']) {
      const g = inStage(stage).filter((x) => x.e.employmentType === 'Employee')
      expect(g.filter((x) => x.e.location === 'Bengaluru').length / g.length, stage).toBeGreaterThanOrEqual(
        0.4,
      )
    }
  })

  it('counts Product & Test engineering and EDA through their saved stage, and leaves supply chain out', () => {
    expect(inStage('productTest').length).toBeGreaterThan(100)
    expect(inStage('shared').every((x) => x.e.jobFunction === 'EDA & CAD Infrastructure')).toBe(true)
    expect(placed.some((x) => x.e.jobFunction === 'Supply Chain' || x.e.jobFunction === 'Sales')).toBe(false)
  })
})
