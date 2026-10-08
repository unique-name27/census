import { beforeAll, describe, expect, it } from 'vitest'
import { activeAt } from '@/lib/people'
import { proposeStage } from '../lists/stages'
import { type Datasets, type Employee, JOB_FAMILIES } from '../schema'
import { generateSample, SAMPLE_AS_OF } from '.'
import {
  ENGINEERING_OF_FAMILY,
  FAMILY_OF_FUNCTION,
  JOB_ARCHITECTURE,
  STAGE_OF_FUNCTION,
  sampleJob,
  withJobs,
} from './jobs'

let data: Datasets
let active: Employee[]

beforeAll(() => {
  data = generateSample()
  active = activeAt(data.employees, SAMPLE_AS_OF)
})

const count = (rows: readonly Employee[], key: 'jobFamily' | 'jobFunction') => {
  const out: Record<string, number> = {}
  for (const e of rows) out[e[key] ?? ''] = (out[e[key] ?? ''] ?? 0) + 1
  return out
}

/** docs/TAXONOMY.md, section 4.1: active employees on 30 Sep 2026. */
const FAMILY_COUNTS = {
  'Silicon Engineering': 585,
  'Systems & Software Engineering': 301,
  'Product & Test Operations': 167,
  'Go-to-Market': 180,
  Corporate: 197,
  Executive: 20,
}
const FUNCTION_COUNTS = {
  Architecture: 44,
  'Design RTL': 128,
  'Analog & Mixed-Signal': 70,
  'Design Verification': 149,
  DFT: 50,
  'Physical Design': 111,
  Packaging: 11,
  'Post-Silicon Validation': 22,
  'Hardware Engineering': 44,
  Firmware: 90,
  Software: 120,
  'Systems Validation': 47,
  'Product Engineering': 53,
  'Test Engineering': 37,
  'Quality & Reliability': 34,
  'Supply Chain': 22,
  Procurement: 11,
  'Foundry Operations': 10,
  Sales: 71,
  'Sales Operations': 13,
  'Field Applications': 63,
  'Product Marketing': 33,
  Accounting: 21,
  'FP&A': 19,
  'Tax & Treasury': 8,
  'Talent Acquisition': 16,
  'HR Business Partnering': 8,
  'People Operations': 15,
  'Total Rewards': 4,
  'Learning & Development': 2,
  Legal: 19,
  'Information Technology': 34,
  'Information Security': 7,
  'EDA & CAD Infrastructure': 8,
  Facilities: 30,
  'Strategy & Communications': 4,
  'Executive Administration': 2,
  'Executive Leadership': 20,
}

describe('sample job architecture', () => {
  it('lists six families and 38 functions, a saved stage on every engineering function but Packaging', () => {
    expect(JOB_ARCHITECTURE.map((f) => f.family)).toEqual([...JOB_FAMILIES])
    expect(FAMILY_OF_FUNCTION.size).toBe(38)
    expect([...STAGE_OF_FUNCTION]).toEqual([
      ['Architecture', 'architecture'],
      ['Design RTL', 'rtl'],
      ['Analog & Mixed-Signal', 'ams'],
      ['Design Verification', 'verification'],
      ['DFT', 'dft'],
      ['Physical Design', 'physical'],
      ['Post-Silicon Validation', 'postSilicon'],
      ['Hardware Engineering', 'postSilicon'],
      ['Firmware', 'software'],
      ['Software', 'software'],
      ['Systems Validation', 'postSilicon'],
      ['Product Engineering', 'productTest'],
      ['Test Engineering', 'productTest'],
      ['Quality & Reliability', 'productTest'],
      ['EDA & CAD Infrastructure', 'shared'],
    ])
    // The one engineering function left unsaved gets the stage its name proposes.
    const packaging = JOB_ARCHITECTURE[0].functions.find((f) => f.name === 'Packaging')
    expect(packaging).toEqual({ name: 'Packaging', proposed: 'signoff' })
    expect(proposeStage('Packaging')).toBe('signoff')
    // Every saved stage is the one the keywords would propose too.
    for (const [fn, stage] of STAGE_OF_FUNCTION) expect(proposeStage(fn), fn).toBe(stage)
    expect([...ENGINEERING_OF_FAMILY].filter(([, v]) => v === 'Yes').map(([f]) => f)).toEqual([
      'Silicon Engineering',
      'Systems & Software Engineering',
    ])
  })

  it('gives every employee row both fields, with the function under the row family', () => {
    const types = new Set(data.employees.map((e) => e.employmentType))
    expect(types).toEqual(new Set(['Employee', 'Contractor', 'Intern']))
    expect(data.employees.some((e) => e.terminationDate)).toBe(true)
    expect(data.employees.some((e) => e.hireDate > SAMPLE_AS_OF)).toBe(true)
    for (const e of data.employees) {
      expect(e.jobFamily, e.employeeId).toBeTruthy()
      expect(e.jobFunction, e.employeeId).toBeTruthy()
      expect(FAMILY_OF_FUNCTION.get(e.jobFunction ?? ''), e.employeeId).toBe(e.jobFamily)
    }
  })

  it('keeps the roster column order: job family and job function right after the title', () => {
    expect(Object.keys(data.employees[0]).slice(0, 6)).toEqual([
      'employeeId',
      'name',
      'jobTitle',
      'jobFamily',
      'jobFunction',
      'businessUnit',
    ])
  })

  it('matches the active headcount per family and function in the plan', () => {
    expect(active).toHaveLength(1450)
    expect(count(active, 'jobFamily')).toEqual(FAMILY_COUNTS)
    expect(count(active, 'jobFunction')).toEqual(FUNCTION_COUNTS)
  })

  it('puts every E1-E3 person in Executive Leadership and nobody else', () => {
    for (const e of data.employees) {
      const exec = e.level === 'E1' || e.level === 'E2' || e.level === 'E3'
      expect(e.jobFunction === 'Executive Leadership', e.employeeId).toBe(exec)
      expect(e.jobFamily === 'Executive', e.employeeId).toBe(exec)
    }
  })

  it('Packaging is Package Design Engineers in Hardware Engineering; Post-Silicon Validation is in Systems Validation', () => {
    const packaging = data.employees.filter((e) => e.jobFunction === 'Packaging')
    expect(packaging.length).toBeGreaterThan(0)
    for (const e of packaging) {
      expect(e.department).toBe('Hardware Engineering')
      expect(e.jobTitle).toContain('Package Design Engineer')
    }
    const psv = data.employees.filter((e) => e.jobFunction === 'Post-Silicon Validation')
    expect(psv.length).toBeGreaterThan(0)
    for (const e of psv) expect(e.department).toBe('Systems Validation')
  })

  it('a family is not the business unit', () => {
    expect(active.some((e) => e.jobFamily !== e.businessUnit)).toBe(true)
    const se = active.filter((e) => e.jobFamily === 'Silicon Engineering')
    expect(se.filter((e) => e.businessUnit === 'Systems & Software')).toHaveLength(33)
  })

  it('every Silicon Engineering function has 5 or more active employees', () => {
    const counts = count(active, 'jobFunction')
    for (const f of JOB_ARCHITECTURE[0].functions) expect(counts[f.name], f.name).toBeGreaterThanOrEqual(5)
  })

  it('pre-hires land in their title function', () => {
    const pre = data.employees.filter((e) => e.hireDate > SAMPLE_AS_OF)
    expect(pre).toHaveLength(25)
    for (const e of pre) expect(e).toMatchObject(sampleJob(e.department, e.jobTitle, e.level))
  })

  it('reads titles by department rule, substrings first match', () => {
    expect(sampleJob('Test & Product Engineering', 'Senior Test Engineer', 'L4').jobFunction).toBe(
      'Test Engineering',
    )
    expect(sampleJob('Test & Product Engineering', 'Product Engineering Manager', 'M1').jobFunction).toBe(
      'Product Engineering',
    )
    expect(sampleJob('Finance', 'Director, Tax & Treasury', 'M2').jobFunction).toBe('Tax & Treasury')
    expect(sampleJob('People', 'Technical Recruiter II', 'L3').jobFunction).toBe('Talent Acquisition')
    expect(sampleJob('Hardware Engineering', 'Package Design Engineer (Contract)', 'L3')).toEqual({
      jobFamily: 'Silicon Engineering',
      jobFunction: 'Packaging',
    })
    expect(sampleJob('Digital Design', 'Digital Design Intern', 'L1').jobFunction).toBe('Design RTL')
    expect(sampleJob('Software', 'Vice President, Software', 'E1').jobFunction).toBe('Executive Leadership')
    expect(() => sampleJob('Unknown', 'Anything', 'L3')).toThrow()
  })

  it('withJobs replaces whatever the rows held', () => {
    const [row] = withJobs([{ ...active[0], jobFamily: 'Old', jobFunction: 'Old' }])
    expect(row).toMatchObject(sampleJob(active[0].department, active[0].jobTitle, active[0].level))
  })

  it('keeps every comp market median where it was (sum and count before the flip)', () => {
    const vals = data.comp.map((c) => c.marketP50).filter((v): v is number => typeof v === 'number')
    expect(vals).toHaveLength(1450)
    expect(vals.reduce((a, b) => a + b, 0)).toBe(33_744_079_000)
  })
})
