/**
 * The fields the People stats special analyses read (docs/ANALYSES.md, 2.3, 3.3, 4.4): their
 * header names, how degree levels are read, FTE and position in range as shares, and the
 * graduation year that is never read.
 */
import { describe, expect, it } from 'vitest'
import { datasetDef } from '../schema'
import { autoMap } from './automap'
import { coerceValue } from './normalize'
import { dropReason } from './protected'
import { normText } from './text'
import { normalizeDegreeLevel } from './vocab'

const field = (dataset: 'employees' | 'candidates', key: string) => {
  const f = datasetDef(dataset).fields.find((x) => x.key === key)
  if (!f) throw new Error(key)
  return f
}
const COL = { dateOrder: 'MDY' as const, percentWhole: false }

describe('header names for the analysis fields', () => {
  it.each([
    ['University', 'university'],
    ['School Name', 'university'],
    ['Alma Mater', 'university'],
    ['Highest Degree', 'degreeLevel'],
    ['Education Level', 'degreeLevel'],
    ['Major', 'fieldOfStudy'],
    ['Field of Study', 'fieldOfStudy'],
    ['Specialisation', 'fieldOfStudy'],
    ['FTE', 'fte'],
    ['FTE %', 'fte'],
    ['Scheduled Hours Percent', 'fte'],
  ])('maps the Employees header %s to %s', (header, key) => {
    const m = autoMap(['Employee ID', 'Hire date', header], [], datasetDef('employees'))
    expect(m[key].header).toBe(header)
  })

  it('never reads Discipline as the field of study: it is the job function', () => {
    const m = autoMap(['Employee ID', 'Hire date', 'Discipline'], [], datasetDef('employees'))
    expect(m.fieldOfStudy.header).toBe(null)
    expect(m.jobFunction.header).toBe('Discipline')
  })

  it.each([
    ['Competing Offer?', 'competingOffer'],
    ['Other offer', 'competingOffer'],
    ['Offer Revised', 'offerRevised'],
    ['Renegotiated', 'offerRevised'],
    ['Offer Range Position', 'offerPositionInRange'],
    ['Position in range', 'offerPositionInRange'],
  ])('maps the Candidates header %s to %s', (header, key) => {
    const m = autoMap(['Application ID', 'Applied date', header], [], datasetDef('candidates'))
    expect(m[key].header).toBe(header)
  })

  it('drops graduation year headers before mapping', () => {
    for (const h of ['Graduation Year', 'Grad year', 'Class of', 'Year graduated'])
      expect(dropReason(h)).toBe('proxy')
  })
})

describe('degree levels', () => {
  it.each([
    ['AA', 'Associate'],
    ['A.S.', 'Associate'],
    ['Associate degree', 'Associate'],
    ['BS', "Bachelor's"],
    ['B.Sc.', "Bachelor's"],
    ['BA', "Bachelor's"],
    ['B.Tech', "Bachelor's"],
    ['BEng', "Bachelor's"],
    ["Bachelor's degree", "Bachelor's"],
    ['Undergraduate', "Bachelor's"],
    ['MS', "Master's"],
    ['M.Tech', "Master's"],
    ['MEng', "Master's"],
    ['MBA', "Master's"],
    ['Masters', "Master's"],
    ['Graduate degree', "Master's"],
    ['PhD', 'PhD'],
    ['Ph.D.', 'PhD'],
    ['DPhil', 'PhD'],
    ['Doctorate', 'PhD'],
    ['Diploma', 'Other'],
    ['High school', 'Other'],
    ['Certificate', 'Other'],
    ['BS, MS', "Master's"],
  ])('reads %s as %s', (raw, level) => {
    expect(normalizeDegreeLevel(normText(raw))).toBe(level)
  })

  it('logs a value it does not know instead of guessing', () => {
    const c = coerceValue('employees', field('employees', 'degreeLevel'), 'Some college', COL)
    expect(c.value).toBe(null)
    expect(c.code).toBe('unknown-value')
    expect(coerceValue('employees', field('employees', 'degreeLevel'), 'Ph.D.', COL).value).toBe('PhD')
  })
})

describe('shares: FTE and offer position in range', () => {
  const fte = (v: unknown) => coerceValue('employees', field('employees', 'fte'), v, COL)
  const pos = (v: unknown) => coerceValue('candidates', field('candidates', 'offerPositionInRange'), v, COL)

  it('reads FTE as a fraction, and values above 1.5 or with a % sign as percentages', () => {
    expect(fte(1).value).toBe(1)
    expect(fte(0.8).value).toBe(0.8)
    expect(fte(80).value).toBe(0.8)
    expect(fte('100').value).toBe(1)
    expect(fte('50%').value).toBe(0.5)
    expect(fte(null).value).toBe(null)
    expect(fte(0).code).toBe('out-of-range')
    expect(fte(-0.5).code).toBe('out-of-range')
    expect(fte(250).code).toBe('out-of-range')
  })

  it('reads position in range the same way, from 0 at the minimum', () => {
    expect(pos(0.35).value).toBe(0.35)
    expect(pos(35).value).toBeCloseTo(0.35)
    expect(pos('35%').value).toBeCloseTo(0.35)
    expect(pos(0).value).toBe(0)
    expect(pos(1.2).value).toBe(1.2)
    expect(pos(120).value).toBeCloseTo(1.2)
    expect(pos(-0.1).code).toBe('out-of-range')
    expect(pos(180).code).toBe('out-of-range')
  })
})
