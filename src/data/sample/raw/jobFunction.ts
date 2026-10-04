/**
 * Job function for the sample roster: the broad function above the job family, derived from
 * the business unit the way Northgate's HRIS assigns it.
 */
import type { Employee } from '../../schema'
import { CORP, EO, GTM, OPS, SE, SS } from '../departments'

/** Business unit → job function (`JOB_FUNCTIONS` in the schema). */
export const FUNCTION_BY_UNIT: Readonly<Record<string, string>> = {
  [SE]: 'Engineering',
  [SS]: 'Engineering',
  [OPS]: 'Operations',
  [GTM]: 'Sales & marketing',
  [CORP]: 'G&A',
  [EO]: 'Executive',
}

/** The job function for a business unit, or null for a unit the sample does not have. */
export const jobFunctionOf = (businessUnit: string | null | undefined): string | null =>
  (businessUnit && FUNCTION_BY_UNIT[businessUnit]) || null

/** Employees with `jobFunction` set from their business unit, right after `jobFamily`. */
export function withJobFunction(rows: readonly Employee[]): Employee[] {
  return rows.map((e) => {
    const { employeeId, name, jobTitle, jobFamily, ...rest } = e
    return { employeeId, name, jobTitle, jobFamily, jobFunction: jobFunctionOf(e.businessUnit), ...rest }
  })
}
