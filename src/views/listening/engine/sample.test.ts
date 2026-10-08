/**
 * Smoke test on the generated sample (whole company, last 12 months): every planted listening
 * story in src/data/sample/README.md (Listening 1 to 6) is detected, every KPI is finite or null,
 * and every finding is grouped at the minimum and declares registered fields. The time budget is in
 * sample.perf.test.ts.
 */
import { describe, expect, it } from 'vitest'
import type { Finding } from '@/components/types'
import { invalidRefs } from '@/data/quality'
import { resolveDrill } from '@/drill/Drill'
import { CATALOG } from '@/metrics/catalog'
import { compute, headline, summary } from './index'
import { sampleContext } from './testkit'

const ctx = sampleContext()
const m = compute(ctx)
const find = (id: string): Finding => {
  const f = m.findings.find((x) => x.id === id)
  if (!f) throw new Error(`Missing finding ${id}. Have: ${m.findings.map((x) => x.id).join(', ')}`)
  return f
}
const num = (re: RegExp, text: string | undefined) =>
  Number((re.exec(text ?? '') ?? [])[1]?.replace('−', '-'))

describe('Listening on the sample company', () => {
  it('shows every program except engagement, which is off', () => {
    expect(m.programs.map((r) => r.survey)).not.toContain('Engagement')
    expect(m.programs).toHaveLength(10)
    expect(m.active).toBe(10)
    expect(m.engagementOn).toBe(false)
    expect(m.engagementHidden).toBeGreaterThan(0)
    expect(headline(ctx)).toMatchObject({ value: '10', label: 'survey programs' })
  })

  it('returns finite or null KPIs, each tied to a registered metric with fields', () => {
    expect(m.kpis.map((k) => k.id)).toEqual([
      'programs',
      'respondents',
      'response-rate',
      'score-candidateExperience',
      'readiness',
      'would-return',
    ])
    for (const k of m.kpis) {
      expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
      expect(k.delta == null || Number.isFinite(k.delta), k.id).toBe(true)
      expect(CATALOG.byId.has(k.metricId ?? ''), k.id).toBe(true)
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(invalidRefs(k.uses ?? []), k.id).toEqual([])
    }
  })

  it('the response rate note opens the programs, grouped, never the answers', () => {
    const k = m.kpis.find((x) => x.id === 'response-rate')!
    expect(k.note).toMatch(/invited/)
    const d = resolveDrill(k.noteDrill)
    expect(d?.kind).toBe('surveyGroups')
    expect(d?.rows.length).toBeGreaterThan(0)
    // "2,068 of 4,636 invited · 7 programs" opens those 7 programs, each with its invited count.
    const programs = num(/· (\d+) programs?/, k.note)
    expect(programs).toBe(m.pooledRate.programs)
    for (const drill of [k.noteDrill, k.drill]) {
      const spec = resolveDrill(drill)!
      expect(spec.rows).toHaveLength(programs)
      expect(spec.note).toContain(`The ${programs} programs whose invited population`)
    }
    const pooled = new Set(m.programs.filter((r) => r.rateKnown && !r.rateSuppressed).map((r) => r.survey))
    for (const row of resolveDrill(k.noteDrill)!.rows) {
      const survey = (row as { survey?: string }).survey ?? ''
      expect(pooled.has(survey as never), survey).toBe(true)
    }
    // The programs tile still opens every program with answers.
    const all = m.kpis.find((x) => x.id === 'programs')!
    expect(resolveDrill(all.drill)!.rows).toHaveLength(m.surveys.size)
  })

  it('story 1: candidate NPS at the Design Verification onsite is far below other onsites', () => {
    const f = find('listening-stage')
    expect(f.title).toContain('Design Verification onsite is −31 in 2026 Q3')
    expect(f.title).toContain('against +10')
    expect(f.detail).toContain('13 candidates answered')
    expect(f.filter).toEqual({ department: ['Design Verification'] })
    expect(m.stage?.flag).toMatchObject({
      stage: 'Onsite',
      department: 'Design Verification',
      respondents: 13,
    })
  })

  it('story 2: hiring managers rate Agnieszka Nielsen lowest, with her load as the tie', () => {
    const f = find('listening-recruiter')
    expect(f.title).toMatch(
      /^Hiring managers rate Agnieszka Nielsen 2\.\d\d of 5, against 3\.\d\d to 4\.\d\d for other recruiters\.$/,
    )
    expect(num(/Nielsen (\d\.\d\d)/, f.title)).toBeLessThan(3)
    expect(f.detail).toContain('29 open reqs and 136 active candidates, the most of any recruiter')
    expect(f.detail).toMatch(/speed \(2\.\d\d\) and communication \(2\.\d\d\) score lowest/)
  })

  it('story 3: day-30 readiness in APAC, tied to the late laptops', () => {
    const f = find('listening-readiness')
    expect(f.title).toBe(
      'Day-30 readiness is 3.42 of 5 in APAC, against 4.28 elsewhere; laptops shipped late for 41.1% of starts there.',
    )
    expect(f.detail).toContain('51 of 124 APAC starts')
    expect(m.readiness?.flag?.lateMean).toBeLessThan(3)
  })

  it('story 4: career growth is the top stay risk for Design Verification L4-L5 key talent', () => {
    const f = find('listening-stay-risk')
    expect(f.title).toBe(
      'Career growth is the top stay risk for Design Verification L4-L5 key talent, named in 68% of their stay interviews (23 of 34).',
    )
    expect(f.detail).toMatch(
      /"I can see a path to my next role here" scores 2\.\d\d of 5 for them, against 3\.\d\d/,
    )
    expect(f.filter).toEqual({ department: ['Design Verification'], level: ['L4', 'L5'] })
  })

  it('story 5: base salary is the top exit reason in Bengaluru', () => {
    const f = find('listening-exit-reason')
    expect(f.title).toBe(
      'Base salary is the top exit survey reason in Bengaluru, named by 17 of 32 leavers, against 5 for career growth or promotion.',
    )
    expect(f.action).toContain('total rewards')
    expect(f.detail).toContain('The HRIS records career growth or promotion')
  })

  it('story 6: the Austin Physical Design manager has the lowest upward feedback, at exactly 10 respondents', () => {
    const f = find('listening-manager-low')
    expect(f.title).toMatch(
      /^Upward feedback for Heather Hayes is 2\.1\d of 5, the lowest of 6 managers with 10 or more respondents\.$/,
    )
    expect(m.managers?.rows).toHaveLength(6)
    expect(m.managers?.rows[0]).toMatchObject({ managerId: 'E10599', respondents: 10, low: true })
    expect(m.managers?.rows.every((r) => r.respondents >= 10)).toBe(true)
  })

  it('ranks findings by severity, each with a number, a registered metric, valid fields and a tab', () => {
    const rank = { critical: 0, warning: 1, info: 2, good: 3 }
    const ranks = m.findings.map((f) => rank[f.severity])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    for (const f of m.findings) {
      expect(f.title, f.id).toMatch(/\d/)
      expect(f.title, f.id).not.toMatch(/[a-z] — [a-z]/i)
      expect(f.title, f.id).not.toContain('!')
      expect(CATALOG.byId.has(f.metricId ?? ''), f.id).toBe(true)
      expect(f.uses?.length, f.id).toBeGreaterThan(0)
      expect(invalidRefs(f.uses ?? []), f.id).toEqual([])
      expect(f.tab, f.id).toBeTruthy()
    }
  })

  it('drills every finding to grouped rows only, never to a respondent', () => {
    for (const f of m.findings) {
      const spec = typeof f.drill === 'function' ? f.drill() : f.drill
      if (!spec) continue
      expect(spec.kind, f.id).toBe('surveyGroups')
      for (const row of spec.rows as readonly unknown[] as readonly Record<string, unknown>[]) {
        expect(row, f.id).not.toHaveProperty('respondentKey')
        expect(row, f.id).not.toHaveProperty('responseDate')
        if (row.suppressed) expect(row.mean, f.id).toBeNull()
      }
      expect(spec.note, f.id).toContain('counts distinct respondents')
    }
  })

  it('gives the scorecard response rate, day-30 readiness and would return', () => {
    const s = summary(ctx)
    expect(s.kpis.map((k) => k.metricId)).toEqual([
      'listening.programs.responseRate',
      'listening.onboarding.readiness',
      'listening.exit.wouldReturn',
    ])
    expect(s.kpis.every((k) => k.tab)).toBe(true)
    expect(s.findings).toBe(m.findings)
  })

  it('computes a response rate for the programs whose invited population is known', () => {
    const known = m.programs.filter((r) => r.rateKnown).map((r) => r.survey)
    expect(known).toEqual([
      'Candidate experience',
      'Hiring manager satisfaction',
      'Onboarding pulse day 30',
      'Onboarding pulse day 90',
      'Exit survey',
      'HR service survey',
      'Return to work',
    ])
    for (const r of m.programs.filter((x) => x.rateKnown)) {
      expect(r.rate, r.survey).not.toBeNull()
      expect(r.rate as number, r.survey).toBeGreaterThan(0)
      expect(r.rate as number, r.survey).toBeLessThanOrEqual(1)
    }
  })
})
