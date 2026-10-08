/**
 * Small hand-built datasets for the quality and reference tests.
 */
import type { Datasets, Employee, Requisition } from '../schema'

export const emptyDatasets = (): Datasets => ({
  employees: [],
  jobChanges: [],
  requisitions: [],
  candidates: [],
  cases: [],
  transactions: [],
  reviews: [],
  succession: [],
  learning: [],
  comp: [],
  hiringPlan: [],
  onboardingTasks: [],
  rightToWork: [],
  surveyResponses: [],
  surveyItems: [],
})

export function emp(n: number, patch: Partial<Employee> = {}): Employee {
  return {
    employeeId: `E${String(n).padStart(3, '0')}`,
    name: `Person ${n}`,
    jobTitle: 'Engineer',
    jobFamily: 'Silicon Engineering',
    jobFunction: 'Design Verification',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'San Jose',
    country: 'United States',
    level: 'L3',
    managerId: n === 1 ? null : 'E001',
    hireDate: '2020-01-01',
    terminationDate: null,
    terminationType: null,
    terminationReason: null,
    regrettable: null,
    employmentType: 'Employee',
    hrbp: 'Dana Ortiz',
    costCenter: 'CC-100',
    ...patch,
  }
}

export function req(n: number, patch: Partial<Requisition> = {}): Requisition {
  return {
    reqId: `R${n}`,
    jobTitle: 'Engineer',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'San Jose',
    level: 'L3',
    hiringManagerId: 'E001',
    hiringManager: 'Person 1',
    recruiter: 'Sam',
    openedDate: '2026-08-01',
    targetStartDate: null,
    filledDate: null,
    closedDate: null,
    status: 'Open',
    reqType: 'New',
    priority: 'Standard',
    openings: 1,
    ...patch,
  }
}

/** 40 people: 30 active, 10 leavers (all voluntary, every exit field filled), hires up to Sep 2026. */
export function roster(): Employee[] {
  const out: Employee[] = []
  for (let i = 1; i <= 40; i++) {
    const leaver = i > 30
    out.push(
      emp(i, {
        hireDate: i === 30 ? '2026-09-01' : '2020-01-01',
        terminationDate: leaver ? '2026-06-30' : null,
        terminationType: leaver ? 'Voluntary' : null,
        terminationReason: leaver ? 'Base salary' : null,
        regrettable: leaver ? false : null,
        level: i === 1 ? 'E3' : 'L3',
      }),
    )
  }
  return out
}

export function smallCompany(): Datasets {
  return { ...emptyDatasets(), employees: roster(), requisitions: [req(1), req(2)] }
}
