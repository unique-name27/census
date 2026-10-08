/**
 * The pick dialogs' rows and the scope names (docs/ROLES-V2.md 1.3 and 1.6), on small fixtures:
 * units largest first with listed units that have nobody muted; recruiters named on a req open now
 * or opened in the last 12 months, matched case-insensitively, with the roster ID when one active
 * person has the name; scope labels with the narrowing after the scope.
 */
import { describe, expect, it } from 'vitest'
import type { Candidate, Employee, Requisition } from '@/data/schema'
import { buildOrgIndex, DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { modeButtonLabel } from '../modes'
import { scopeLabelOf, scopeName } from './label'
import { recruiterOptions, unitOptions } from './pickers'
import { emptyReqsScope, reqsScope } from './reqs'
import { emptyUnitScope, unitScope } from './unit'

const AS_OF = '2026-09-30'

const emp = (id: string, o: Partial<Employee> = {}): Employee =>
  ({
    employeeId: id,
    name: `Person ${id}`,
    businessUnit: 'Alpha',
    department: 'A1',
    location: 'Austin',
    country: 'United States',
    level: 'L3',
    managerId: null,
    hireDate: '2020-01-01',
    terminationDate: null,
    employmentType: 'Employee',
    ...o,
  }) as Employee

const req = (id: string, recruiter: string | null, o: Partial<Requisition> = {}): Requisition =>
  ({
    reqId: id,
    recruiter,
    status: 'Open',
    openedDate: '2026-06-01',
    department: 'A1',
    businessUnit: 'Alpha',
    location: 'Austin',
    ...o,
  }) as Requisition

const cand = (id: string, reqId: string, o: Partial<Candidate> = {}): Candidate =>
  ({
    applicationId: id,
    reqId,
    candidateName: `Cand ${id}`,
    status: 'Active',
    appliedDate: '2026-07-01',
    ...o,
  }) as Candidate

describe('unitOptions', () => {
  it('lists units with active employees, largest first, then listed units with nobody, muted', () => {
    const employees = [
      emp('1'),
      emp('2', { businessUnit: 'Beta', location: 'Munich' }),
      emp('3', { businessUnit: 'Beta' }),
      emp('4', { businessUnit: 'Gamma', terminationDate: '2026-01-01' }),
      emp('5', { businessUnit: 'Beta', employmentType: 'Contractor' as Employee['employmentType'] }),
    ]
    expect(unitOptions(employees, AS_OF, ['Delta', 'Alpha'])).toEqual([
      { unit: 'Beta', employees: 2, locations: 2, pickable: true },
      { unit: 'Alpha', employees: 1, locations: 1, pickable: true },
      { unit: 'Delta', employees: 0, locations: 0, pickable: false },
    ])
  })
})

describe('recruiterOptions', () => {
  it('groups spellings, keeps recent reqs only, and matches the roster when one active person has the name', () => {
    const data = {
      employees: [
        emp('E1', { name: 'Maya Chen' }),
        emp('E2', { name: 'Sam Ito' }),
        emp('E3', { name: 'Sam Ito' }),
      ],
      requisitions: [
        req('R1', 'Maya Chen'),
        req('R2', ' maya  chen '),
        req('R3', 'Maya Chen', { status: 'Filled', openedDate: '2026-03-01' }),
        req('R4', 'Sam Ito', { status: 'Filled', openedDate: '2026-02-01' }),
        req('R5', 'Old Hand', { status: 'Filled', openedDate: '2024-01-01' }),
        req('R6', null),
      ],
      candidates: [
        cand('A1', 'R1'),
        cand('A2', 'R2'),
        cand('A3', 'R2', { status: 'Rejected' }),
        cand('A4', 'R4'),
      ],
    }
    expect(recruiterOptions(data, AS_OF)).toEqual([
      { name: 'Maya Chen', id: 'E1', openReqs: 2, activeCandidates: 2 },
      // Two active people share the name: no ID.
      { name: 'Sam Ito', id: null, openReqs: 0, activeCandidates: 1 },
    ])
  })
})

describe('reqsScope', () => {
  it("holds the recruiter's reqs by name in any case, their applications, and is empty for nobody", () => {
    const data = {
      employees: [emp('E1', { name: 'Maya Chen' })],
      requisitions: [
        req('R1', 'Maya Chen'),
        req('R2', 'MAYA CHEN', { status: 'On hold' }),
        req('R3', 'Sam Ito'),
      ],
      candidates: [cand('A1', 'R1'), cand('A2', 'R2', { status: 'Withdrawn' }), cand('A3', 'R3')],
    }
    const s = reqsScope(data, AS_OF, { name: 'maya chen', id: 'E1' })
    expect([...s.reqIds]).toEqual(['R1', 'R2'])
    expect([...s.appIds]).toEqual(['A1', 'A2'])
    expect(s).toMatchObject({ openReqs: 1, activeCandidates: 1, size: 2, label: "maya chen's reqs" })
    expect(reqsScope(data, AS_OF, { name: 'Maya Chen', id: 'E1' })).toBe(
      reqsScope(data, AS_OF, { name: 'Maya Chen', id: 'E1' }),
    )
    expect(emptyReqsScope(null, AS_OF).reqIds.size).toBe(0)
  })

  it('counts a start on the reqs by the onboarding match: same name, the req department, start dates close', () => {
    const data = {
      employees: [
        emp('P1', { name: 'Ana Ruiz', hireDate: '2026-10-20', department: 'A1' }),
        emp('P2', { name: 'Ana Ruiz', hireDate: '2026-10-20', department: 'B9' }),
        emp('P3', { name: 'Lee Park', hireDate: '2026-12-20' }),
      ],
      requisitions: [req('R1', 'Maya Chen')],
      candidates: [
        cand('A1', 'R1', {
          candidateName: 'Ana Ruiz',
          status: 'Hired',
          hiredDate: '2026-09-01',
          startDate: '2026-10-19',
        }),
        cand('A2', 'R1', {
          candidateName: 'Lee Park',
          status: 'Hired',
          hiredDate: '2026-09-01',
          startDate: '2026-10-19',
        }),
      ],
    }
    const s = reqsScope(data, AS_OF, { name: 'Maya Chen', id: null }, 14)
    // P2 works in another department; P3 starts two months later than the offer says.
    expect([...s.startIds]).toEqual(['P1'])
  })
})

describe('scope names and labels', () => {
  const employees = [emp('M1', { name: 'Priya Raman' }), emp('E2', { managerId: 'M1', location: 'Munich' })]
  const org = buildOrgIndex(employees)
  const f = (p: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...p })

  it('names a unit and its narrowing', () => {
    const s = unitScope(employees, AS_OF, 'Alpha')
    expect(scopeName(s)).toBe('Alpha')
    expect(scopeLabelOf(s, f({ businessUnit: ['Alpha'] }), org)).toBe('Alpha')
    expect(
      scopeLabelOf(
        s,
        f({ businessUnit: ['Alpha'], location: ['Munich'], modes: { location: 'exclude' } }),
        org,
      ),
    ).toBe('Alpha, not Munich')
    expect(scopeLabelOf(s, f({ businessUnit: ['Alpha'], leaderId: 'M1' }), org)).toBe(
      "Alpha, Priya Raman's org",
    )
    expect(emptyUnitScope('Gone').unit).toBe('none')
  })

  it('reads the Mode button for every pick', () => {
    expect(modeButtonLabel('hrbp-unit', 'Silicon Engineering')).toBe('HRBP: Silicon Engineering')
    expect(modeButtonLabel('hrbp-region', 'APAC')).toBe('HRBP: APAC')
    expect(modeButtonLabel('hrbp-region')).toBe('HRBP mode')
    expect(modeButtonLabel('recruiter', 'Maya Chen')).toBe('Recruiter: Maya Chen')
    expect(modeButtonLabel('recruiter', '*')).toBe('Recruiter: every recruiter')
    expect(modeButtonLabel('recruiter', null)).toBe('Recruiter mode')
    expect(modeButtonLabel('manager', 'Priya Raman')).toBe('Manager: Priya Raman')
    expect(modeButtonLabel('talent-management')).toBe('Talent management mode')
    expect(modeButtonLabel('hr', 'ignored')).toBe('HR mode')
  })
})
