/**
 * The linked survey number other views show: where each one sits, and its words and export row,
 * including a headline hidden below the minimum (nothing about the group shows).
 */
import { describe, expect, it } from 'vitest'
import { fmt } from '@/lib/format'
import { surveyHeadline } from './api'
import { answers, fixtureContext, sampleContext, sampleData } from './engine/testkit'
import {
  changeText,
  headlineSentence,
  linkedHeadline,
  linkedMinimum,
  linkedSpots,
  linkedSurveyRow,
  scaleText,
  sentWhen,
  targetWords,
} from './linked'

describe('linkedSpots', () => {
  it('puts each survey in the view and tab the roadmap names, and Engagement nowhere else', () => {
    expect(linkedSpots()).toEqual([
      { survey: 'Candidate experience', view: 'recruiting', tab: 'sources' },
      { survey: 'Hiring manager satisfaction', view: 'recruiting', tab: 'requisitions' },
      { survey: 'Onboarding pulse day 30', view: 'onboarding', tab: 'first90' },
      { survey: 'Onboarding pulse day 90', view: 'onboarding', tab: 'first90' },
      { survey: 'Stay interview', view: 'talent', tab: 'retention' },
      { survey: 'Exit survey', view: 'hrbp', tab: 'attrition' },
      { survey: 'Manager feedback', view: 'hrbp', tab: 'org' },
      { survey: 'HR service survey', view: 'services', tab: 'cases' },
      { survey: 'Return to work', view: 'services', tab: 'leave' },
      { survey: 'Training evaluation', view: 'talent', tab: 'learning' },
    ])
  })
})

describe('words', () => {
  it('says when a survey is sent, in a sentence', () => {
    expect(sentWhen('Candidate experience')).toBe('Sent after each interview stage and after a decline')
    expect(sentWhen('Exit survey')).toBe('Sent at notice of resignation')
    expect(sentWhen('HR service survey')).toBe('Sent when a case is resolved')
  })

  it('names the scale: NPS from −100 to 100, else a 1 to 5 mean', () => {
    expect(scaleText({ format: 'int' })).toBe('Net promoter score, −100 to 100')
    expect(scaleText({ format: 'num2' })).toBe('Mean score on a 1 to 5 scale')
  })

  it('words the target and the change in the headline unit', () => {
    expect(targetWords({ unit: 'int' }, { value: 20, comparator: '>=' })).toBe('At least 20')
    expect(targetWords({ unit: 'num2' }, { value: 4, comparator: '>=' })).toBe('At least 4.00')
    expect(targetWords({ unit: 'int' }, null)).toBeNull()
    expect(targetWords(undefined, { value: 4, comparator: '>=' })).toBeNull()
    expect(changeText({ change: 3, format: 'int', suppressed: false })).toBe('+3')
    expect(changeText({ change: -0.124, format: 'num2', suppressed: false })).toBe('−0.12')
    expect(changeText({ change: null, format: 'int', suppressed: false })).toBeNull()
    expect(changeText({ change: 3, format: 'int', suppressed: true })).toBeNull()
  })
})

describe('linkedSurveyRow on the sample', () => {
  const ctx = sampleContext()

  it('carries the latest wave, its target status and the change since the wave before', () => {
    const h = surveyHeadline(ctx, 'Candidate experience')!
    const row = linkedSurveyRow(h)
    expect(row).toMatchObject({
      survey: 'Candidate experience',
      measure: 'Candidate NPS',
      wave: '2026 Q3',
      value: h.value,
      target: 20,
      respondents: h.respondents,
      change: h.change,
    })
    expect(['Met', 'Watch', 'Missed']).toContain(row.status)
    expect(headlineSentence(h)).toBe(`Candidate NPS is ${fmt(h.value, 'int')} in 2026 Q3`)
  })

  it('exports no value, change or count for a headline hidden below the minimum', () => {
    const hidden = surveyHeadline(
      fixtureContext({ surveyResponses: answers(4, [5]) }),
      'Hiring manager satisfaction',
    )!
    expect(hidden.suppressed).toBe(true)
    expect(linkedSurveyRow(hidden)).toMatchObject({
      value: null,
      change: null,
      respondents: null,
      status: 'Hidden',
    })
    expect(headlineSentence(hidden)).toBe('Hiring manager satisfaction: hidden to protect anonymity')
  })
})

describe('manager feedback outside the whole company', () => {
  const data = sampleData()
  /** A first-line manager whose latest-wave upward feedback has 5 to 9 respondents. */
  function smallTeamManager(): string {
    const mf = data.surveyResponses.filter((r) => r.survey === 'Manager feedback')
    const latest = [...new Set(mf.map((r) => r.wave))].sort().at(-1)
    const by = new Map<string, Set<string>>()
    for (const r of mf)
      if (r.wave === latest && r.subjectKey)
        by.set(r.subjectKey, (by.get(r.subjectKey) ?? new Set()).add(r.respondentKey))
    const managers = new Set(data.employees.map((e) => e.managerId).filter(Boolean))
    const firstLine = (id: string) =>
      !data.employees.some((e) => e.managerId === id && managers.has(e.employeeId))
    const hit = [...by].find(([id, s]) => s.size >= 5 && s.size < 10 && firstLine(id))
    if (!hit) throw new Error('no small first-line team in the sample')
    return hit[0]
  }

  it('needs the manager-cut minimum: a leader filter on one small team hides the number', () => {
    const scoped = sampleContext({ filters: { leaderId: smallTeamManager() } })
    expect(linkedMinimum(scoped, 'Manager feedback')).toBe(10)
    const h = linkedHeadline(scoped, 'Manager feedback')!
    expect(h).toMatchObject({ value: null, suppressed: true, change: null, drill: null })
    expect(h.respondents).toBeLessThan(10)
    // Other surveys keep the group minimum in any scope.
    expect(linkedMinimum(scoped, 'Exit survey')).toBe(5)
  })

  it('shows a wider scope without the change since the wave before, and the company with it', () => {
    const company = sampleContext()
    expect(linkedMinimum(company, 'Manager feedback')).toBe(5)
    const whole = linkedHeadline(company, 'Manager feedback')!
    const listening = surveyHeadline(company, 'Manager feedback')!
    expect({ ...whole, drill: null }).toEqual({ ...listening, drill: null })
    const unit = sampleContext({ filters: { businessUnit: ['Silicon Engineering'] } })
    const h = linkedHeadline(unit, 'Manager feedback')!
    expect(h.respondents).toBeGreaterThanOrEqual(10)
    expect(h.value).not.toBeNull()
    expect(h.change).toBeNull()
  })
})
