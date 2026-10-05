/**
 * Person tokens and the second-line scan on a small hand-built company, and the user's question
 * tokenized on the sample.
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { type Datasets, type Employee, emptyDatasets } from '@/data/schema'
import { AMOUNT_WITHHELD, TokenMap } from './privacy'
import { leaks, sampleCtx } from './testkit'

const emp = (employeeId: string, name: string, extra: Partial<Employee> = {}): Employee => ({
  employeeId,
  name,
  jobTitle: 'Engineer',
  businessUnit: 'Silicon Engineering',
  department: 'Design Verification',
  location: 'Austin',
  country: 'United States',
  level: 'L4',
  managerId: null,
  hireDate: '2020-01-06',
  employmentType: 'Employee',
  ...extra,
})

function company(): Pick<{ all: Datasets }, 'all'> {
  const all = emptyDatasets()
  all.employees = [
    emp('E100', 'Lena Ortiz', { hrbp: 'Maya Patel' }),
    emp('E101', "Sam O'Neil"),
    emp('E102', 'Kiran Gowda'),
    emp('E103', 'Kiran Gowda'),
    emp('E104', 'Maya Patel'),
    emp('E105', 'Austin'), // a name that is also a work site
  ]
  all.candidates = [
    {
      applicationId: 'APP-200001',
      candidateId: 'CAN-500001',
      candidateName: 'Yung-Chieh Hung',
      reqId: 'REQ-1',
      source: 'Referral',
      recruiter: 'Priya Nair',
      coordinator: 'Recruiting team',
      currentStage: 'Screen',
      status: 'Active',
      appliedDate: '2026-09-01',
    },
  ]
  all.cases = [
    {
      caseId: 'HR-1',
      openedAt: '2026-09-01T10:00',
      status: 'New',
      category: 'Payroll',
      channel: 'Email',
      priority: 'P3',
      tier: 'Tier 1',
      team: 'Payroll',
      assignee: 'People operations',
    },
  ]
  return { all }
}

describe('TokenMap', () => {
  it('hands out tokens on first use, the same token for the same person', () => {
    const t = new TokenMap()
    t.index(company())
    expect(t.forEmployee('E101')).toBe('{{P1}}')
    expect(t.forEmployee('E100')).toBe('{{P2}}')
    expect(t.forEmployee('E101')).toBe('{{P1}}')
    expect(t.forName("Sam O'Neil")).toBe('{{P1}}')
    expect(t.forCandidate('APP-200001')).toBe(t.forCandidate('CAN-500001'))
    expect(t.resolve('{{P2}}')).toEqual({
      token: 'P2',
      name: 'Lena Ortiz',
      employeeId: 'E100',
      kind: 'employee',
    })
    expect(t.resolve('P1')?.name).toBe("Sam O'Neil")
  })

  it('never resolves a token it did not hand out', () => {
    const t = new TokenMap()
    t.index(company())
    t.forEmployee('E100')
    expect(t.resolve('P2')).toBeNull()
    expect(t.resolve('{{P999}}')).toBeNull()
    expect(t.employeeIdOf('P7')).toBeNull()
  })

  it('scans text for full names, person IDs and emails, with possessives', () => {
    const t = new TokenMap()
    t.index(company())
    const out = t.scan(
      "Lena Ortiz's team: E101 and APP-200001 (Yung-Chieh Hung) wrote to sam.oneil@northgate.example; recruiter Priya Nair.",
    )
    expect(out).not.toMatch(/Lena|Ortiz|E101|APP-200001|Yung|Hung|northgate|Priya/)
    expect(out).toMatch(
      /^\{\{P\d+\}\}'s team: \{\{P\d+\}\} and \{\{P\d+\}\} \(\{\{P\d+\}\}\) wrote to \{\{P\d+\}\}; recruiter \{\{P\d+\}\}\.$/,
    )
    // The application ID and the candidate's name are the same person.
    const toks = out.match(/\{\{P\d+\}\}/g) ?? []
    expect(toks[2]).toBe(toks[3])
  })

  it('matches names whatever their case, and only whole names', () => {
    const t = new TokenMap()
    t.index(company())
    expect(t.scan('how is lena ortiz doing')).toMatch(/^how is \{\{P\d+\}\} doing$/)
    expect(t.scan('Lena Ortizson and E1011')).toBe('Lena Ortizson and E1011')
  })

  it('gives two people with one name a shared name-only token that opens no person card', () => {
    const t = new TokenMap()
    t.index(company())
    const tok = t.scan('Kiran Gowda')
    const p = t.resolve(tok)
    expect(p).toMatchObject({ name: 'Kiran Gowda', employeeId: null, kind: 'name' })
    // By ID each is themself.
    expect(t.forEmployee('E102')).not.toBe(t.forEmployee('E103'))
  })

  it('leaves teams, work sites and other category words alone', () => {
    const t = new TokenMap()
    t.index(company())
    expect(t.scan('Austin and People operations and Recruiting team')).toBe(
      'Austin and People operations and Recruiting team',
    )
    expect(t.forName('People operations')).toBe('People operations')
  })

  it('withholds money amounts', () => {
    const t = new TokenMap()
    t.index(company())
    expect(t.scan('Bringing them to minimum costs $1.2M a year, about USD 145,000 each or 80,000 EUR.')).toBe(
      `Bringing them to minimum costs ${AMOUNT_WITHHELD} a year, about ${AMOUNT_WITHHELD} each or ${AMOUNT_WITHHELD}.`,
    )
    expect(t.scan('Compa-ratio 0.95, 12.4% and 1,284 people')).toBe(
      'Compa-ratio 0.95, 12.4% and 1,284 people',
    )
  })

  it('leaves tokens already in the text alone and scans JSON values and keys', () => {
    const t = new TokenMap()
    t.index(company())
    const p = t.forEmployee('E100')
    expect(t.scan(`${p} and Lena Ortiz`)).toBe(`${p} and ${p}`)
    expect(t.scanDeep({ 'Maya Patel': ['E104', 3, null, { x: 'Lena Ortiz' }] })).toEqual({
      [t.forEmployee('E104')]: [t.forEmployee('E104'), 3, null, { x: p }],
    })
  })

  it('keeps every token when the data is reloaded', () => {
    const t = new TokenMap()
    const a = company()
    t.index(a)
    const before = t.forEmployee('E100')
    const b = company()
    b.all.employees.push(emp('E200', 'Noa Levi'))
    t.index(b)
    expect(t.forEmployee('E100')).toBe(before)
    expect(t.scan('Noa Levi')).toMatch(/^\{\{P\d+\}\}$/)
    expect(t.resolve(before)?.name).toBe('Lena Ortiz')
  })

  it('matches a token to a person field by ID or name', () => {
    const t = new TokenMap()
    t.index(company())
    const p = t.forEmployee('E104')
    expect(t.matches(p, 'E104', 'id')).toBe(true)
    expect(t.matches(p, 'maya patel', 'name')).toBe(true)
    expect(t.matches(p, 'E100', 'id')).toBe(false)
  })
})

describe('the user question on the sample', () => {
  const ctx = sampleCtx()
  const t = new TokenMap()
  t.index(ctx)
  const e = ctx.all.employees[1] as Employee
  const c = ctx.all.candidates[0]
  const r = ctx.all.requisitions[0]

  it('replaces typed names and IDs of employees, candidates and recruiters', () => {
    const q = `How is ${e.name}'s org doing? Is ${e.employeeId} a manager? What about ${c?.candidateName} (${c?.applicationId}, ${c?.candidateId}) and recruiter ${r?.recruiter}?`
    const sent = t.scan(q)
    expect(leaks(sent)).toEqual([])
    expect(sent).toContain('How is {{P')
    expect(t.resolve(sent.match(/\{\{P\d+\}\}/)?.[0] ?? '')?.employeeId).toBe(e.employeeId)
  })

  it('keeps ordinary words, places and numbers', () => {
    const q =
      'Where is voluntary attrition highest in Bengaluru and Physical Design over the last 12 months, and is it above 10%?'
    expect(t.scan(q)).toBe(q)
  })
})

describe('names as people type them', () => {
  function people(): Pick<{ all: Datasets }, 'all'> {
    const c = company()
    c.all.employees.push(
      emp('E300', 'Ankit Krishnan'),
      emp('E301', "Leah O'Brien"),
      emp('E302', 'Philippe Bélanger'),
      emp('E303', 'Yung-Chieh Hung'),
      // A cost center column that holds a manager's name (a mapping mistake), and a one-word site.
      emp('E304', 'Grace Mbeki', { costCenter: 'Ankit Krishnan', location: 'Austin' }),
    )
    return c
  }
  const cases: [string, string][] = [
    ['a curly apostrophe', 'How is Leah O’Brien doing?'],
    ['a modifier apostrophe', 'How is Leah Oʼbrien doing?'],
    ['a double space', 'Compare with Ankit  Krishnan.'],
    ['a line break', 'Compare with Ankit\nKrishnan.'],
    ['"Last, First"', 'What about Krishnan, Ankit and his manager?'],
    ['"Last,First"', 'What about Krishnan,Ankit?'],
    ['"Last First"', 'What about Krishnan Ankit?'],
    ['no accents', 'How is Philippe Belanger doing?'],
    ['decomposed accents', 'How is Philippe Be\u0301langer doing?'],
    ['upper case', 'HOW IS PHILIPPE BÉLANGER DOING?'],
    ['a space for a hyphen', 'Is Yung Chieh Hung a manager?'],
    ['an en dash for a hyphen', 'Is Yung–Chieh Hung a manager?'],
    ['a possessive with a curly apostrophe', 'Ankit Krishnan’s team'],
  ]
  for (const [what, text] of cases)
    it(`replaces a name typed with ${what}`, () => {
      const t = new TokenMap()
      t.index(people())
      const out = t.scan(text)
      expect(out, text).toMatch(/\{\{P\d+\}\}/)
      expect(out, text).not.toMatch(
        /Krishnan|Ankit|O.?Brien|Leah|Philippe|B.?langer|Yung|Hung|BÉLANGER|PHILIPPE/i,
      )
    })

  it('keeps the rest of the text as typed, accents and line breaks included', () => {
    const t = new TokenMap()
    t.index(people())
    expect(t.scan('Café in Austin:\nHow is Philippe Be\u0301langer?')).toMatch(
      /^Café in Austin:\nHow is \{\{P\d+\}\}\?$/,
    )
    expect(t.scan('Leah O’Brien’s org')).toMatch(/^\{\{P\d+\}\}’s org$/)
  })

  it('gives every spelling of a person the same token', () => {
    const t = new TokenMap()
    t.index(people())
    const tokens = ['Ankit Krishnan', 'Krishnan, Ankit', 'ankit  krishnan', 'Krishnan Ankit'].map((s) =>
      t.scan(s),
    )
    expect(new Set(tokens).size).toBe(1)
    expect(t.resolve(tokens[0] as string)?.employeeId).toBe('E300')
  })

  it('lets a full name win over a category value that spells it, but not a one-word site', () => {
    const t = new TokenMap()
    t.index(people())
    expect(t.scan('Cost center Ankit Krishnan has 1 person')).toMatch(
      /^Cost center \{\{P\d+\}\} has 1 person$/,
    )
    expect(t.scan('Austin')).toBe('Austin')
  })

  it('names the people who certified, confirmed or remapped data, never teams', () => {
    const versions: Record<string, unknown> = {
      employees: { certification: { by: 'Dana Whitfield, People analytics' }, mappingConfirmedBy: 'Sam' },
      requisitions: { mappingConfirmedBy: 'Sam (HR)' },
      cases: { certification: { by: 'HRIS team' }, mappingConfirmedBy: 'People analytics' },
    }
    const quality = {
      dataset: (k: string) => ({ version: versions[k] ?? null }),
    } as unknown as AnalyticsContext['quality']
    const t = new TokenMap()
    t.index({ ...people(), quality, reference: { mappings: [{ by: 'Robin Okafor' }, { by: null }] } })
    const text = [
      'Gold: Employees certified 30 Sep by Dana Whitfield, People analytics.',
      'Employees mapping confirmed 30 Sep by Sam.',
      'Silver: Requisitions mapping confirmed 30 Sep by Sam (HR); not certified.',
      'Business unit remapped by Robin Okafor for 7 rows.',
      'Cases certified 1 Oct by HRIS team; mapping confirmed by People analytics.',
    ].join(' ')
    const out = t.scan(text)
    expect(out).not.toMatch(/Dana|Whitfield|Sam\b|Robin|Okafor/)
    expect(out).toContain('by HRIS team')
    expect(out).toContain('by People analytics.')
    // "Sam" alone is not taken for a name elsewhere: it is matched only where the text says "by".
    expect(t.scan('Sample size and Sam')).toBe('Sample size and Sam')
  })
})
