/**
 * The fields each Compliance number reads (its lineage, docs/DATA-TIERS.md): KPIs, figures and
 * findings declare them as `uses` so their tier is the lowest of these fields' tiers. Plain data,
 * so the metric registry (../metrics.ts) can import it.
 */
import type { FieldRef } from '@/data/quality/fieldRef'

/** People with a right to work row who are active at the as-of date. */
const PERSON: readonly FieldRef[] = [
  'rightToWork.employeeId',
  'employees.hireDate',
  'employees.terminationDate',
]

export const USES = {
  expiring: [...PERSON, 'rightToWork.expiryDate'],
  expiringByUnit: [...PERSON, 'rightToWork.expiryDate', 'employees.businessUnit'],
  reverification: [...PERSON, 'rightToWork.expiryDate', 'rightToWork.reverificationStartedDate'],
  reverificationByUnit: [
    ...PERSON,
    'rightToWork.expiryDate',
    'rightToWork.reverificationStartedDate',
    'employees.businessUnit',
  ],
  mix: [...PERSON, 'rightToWork.authorizationType'],
  i9: [
    'rightToWork.employeeId',
    'employees.hireDate',
    'employees.location',
    'employees.employmentType',
    'rightToWork.i9Section2Date',
  ],
  i9Section1: [
    'rightToWork.employeeId',
    'employees.hireDate',
    'employees.location',
    'employees.employmentType',
    'rightToWork.i9Section1Date',
  ],
  exportLicense: [
    ...PERSON,
    'rightToWork.exportLicenseRequired',
    'rightToWork.exportLicenseStatus',
    'rightToWork.exportLicenseExpiry',
  ],
  policyAcks: [
    'onboardingTasks.task',
    'onboardingTasks.employeeId',
    'onboardingTasks.dueDate',
    'onboardingTasks.completedDate',
    'onboardingTasks.status',
    'employees.hireDate',
  ],
  deadlines: ['employees.location', 'employees.hireDate', 'employees.terminationDate'],
} as const satisfies Record<string, readonly FieldRef[]>

/** Fields in `a` or `b`, each once, in order. */
export function union(...lists: readonly (readonly FieldRef[])[]): FieldRef[] {
  return [...new Set(lists.flat())]
}
