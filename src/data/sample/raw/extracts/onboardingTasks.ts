/**
 * Onboarding tasks as the onboarding tool exports them: its own activity names ("Background
 * verification", "Laptop delivered"), team names as owners ("IT Service Desk", "People
 * Operations"), statuses in its words ("Complete", "On Hold", "Waived") and checklist due dates
 * written relative to the start ("Day -3", "Day +3 BD"), which the importer converts with the
 * start date from the roster or the accepted candidate. Nobody has reviewed the mapping, so it
 * loads as bronze. The tool has no probation date yet for people who have not started outside
 * the US: it writes "TBD".
 */
import type { Datasets, OnboardingStatus, OnboardingTask } from '../../../schema'
import { onboardingTaskByName } from '../../../schema'
import type { RawExtract } from '../extract'
import { type Column, mdy, toAoa } from '../format'
import { FILES } from '../plan'

/** The tool's activity names (the importer recognizes them as the checklist's tasks). */
const ACTIVITY: Record<string, string> = {
  'Background check cleared': 'Background verification',
  'Export-control screening': 'Export control screening',
  'Laptop shipped': 'Laptop delivered',
  'Accounts created': 'IT accounts',
  'Badge ready': 'Security badge',
  'Benefits packet sent': 'Benefits packet',
  'Orientation booked': 'New hire orientation',
  'Manager welcome': 'Welcome call',
  'Day -1 readiness check': 'Pre start check',
  'I-9 Section 1': 'I9 Section 1',
  'I-9 Section 2': 'I9 Section 2',
  'Policy acknowledgments': 'Policy acknowledgement',
  '30-day check-in': '30 day check in',
  '60-day check-in': '60 day check in',
  '90-day check-in': '90 day check in',
  'Probation decision': 'Probation review',
}
const TEAM: Record<string, string> = {
  'People ops': 'People Operations',
  IT: 'IT Service Desk',
  Facilities: 'Workplace Services',
  'Trade compliance': 'Export Compliance',
  Manager: 'Hiring Manager',
  'New hire': 'New Joiner',
}
const STATUS: Record<OnboardingStatus, string> = {
  'Not started': 'Not Started',
  'In progress': 'In Progress',
  Blocked: 'On Hold',
  Done: 'Complete',
  'Not needed': 'Waived',
}

/** "Day -3", "Day +30", "Day +3 BD" for a checklist task; null when it has no fixed day. */
function relativeDue(task: string): string | null {
  const def = onboardingTaskByName.get(task)
  if (!def || def.dueDay == null) return null
  const sign = def.dueDay < 0 ? '-' : '+'
  const day = def.dueDay === 0 ? 'Day 0' : `Day ${sign}${Math.abs(def.dueDay)}`
  return def.businessDays ? `${day} BD` : day
}

/** Probation decisions of people who have not started outside the US: "TBD" in the tool. */
export function tbdRows(rows: readonly OnboardingTask[]): Set<number> {
  const out = new Set<number>()
  rows.forEach((r, i) => {
    if (r.task === 'Probation decision' && r.applicationId && !r.employeeId) out.add(i)
  })
  return out
}

/** The rows the import yields: "TBD" is not a date, so those due dates are blank. */
export function onboardingTasksPlanted(base: Datasets): OnboardingTask[] {
  const tbd = tbdRows(base.onboardingTasks)
  return base.onboardingTasks.map((r, i) => (tbd.has(i) ? { ...r, dueDate: null } : r))
}

export function onboardingTasksExtract(base: Datasets): RawExtract<'onboardingTasks'> {
  const tbd = tbdRows(base.onboardingTasks)
  const columns: Column<OnboardingTask>[] = [
    { header: 'Worker ID', cell: (r) => r.employeeId ?? null },
    { header: 'Application ID', cell: (r) => r.applicationId ?? null },
    { header: 'Activity', cell: (r) => ACTIVITY[r.task] ?? r.task },
    { header: 'Assigned To', cell: (r) => (r.owner ? (TEAM[r.owner] ?? r.owner) : null) },
    { header: 'Due', cell: (r, i) => (tbd.has(i) ? 'TBD' : (relativeDue(r.task) ?? mdy(r.dueDate))) },
    { header: 'Completed', cell: (r) => mdy(r.completedDate) },
    { header: 'Status', cell: (r) => (r.status ? STATUS[r.status] : null) },
  ]
  return { dataset: 'onboardingTasks', ...FILES.onboardingTasks, aoa: toAoa(base.onboardingTasks, columns) }
}
