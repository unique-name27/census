/**
 * Deterministic sample company: Northgate Semiconductor, a Nasdaq-listed fabless chip company
 * founded in 2014, as of 30 Sep 2026. Every run produces identical data from fixed seeds. The
 * planted stories each view should surface are documented in README.md next to this file.
 */
import type { Datasets, ISODate } from '../schema'
import { budgetRows } from './budget'
import { day } from './calendar'
import { compRows } from './comp'
import { planEducation, withEducation } from './education'
import {
  addContingent,
  addLeavers,
  addPriorFirstYearLeavers,
  assignHires,
  assignIds,
  assignLeaderHires,
  buildHistory,
  employeeRows,
  jobChangeRows,
  managerOn,
  plantLongTenureL4,
  plantStagnant,
} from './employees'
import { withFte } from './fte'
import { hiringPlanRows } from './hiringPlan'
import { withJobs } from './jobs'
import { withLeaveHistory } from './leave'
import type { World } from './model'
import { NameBook } from './names'
import { withOfferDetails } from './offerDetails'
import { onboardingTaskRows } from './onboarding'
import { buildOrg } from './org'
import { preHireRows } from './prehires'
import { rngFor } from './prng'
import { recruitingRows } from './recruiting'
import { exportPlantsOf, rightToWorkRows } from './rightToWork'
import { caseRows, transactionRows } from './services'
import { surveyRows } from './surveys'
import { isConsecutiveHigh, learningRows, rateCycles, reviewRows, successionRows } from './talent'

/** Fixed reference date for the sample company: the end of Q3 2026. */
export const SAMPLE_AS_OF: ISODate = '2026-09-30'
export const SAMPLE_COMPANY = 'Northgate Semiconductor'

/** A person's manager on a date, from the job history (people added later have none). */
function managerTimeline(world: World): (employeeId: string, date: string) => string | null {
  const byId = new Map(world.people.map((p) => [p.id, p]))
  return (employeeId, date) => {
    const p = byId.get(employeeId)
    const m = p ? managerOn(p, day(date)) : null
    return m == null ? null : world.people[m].id
  }
}

export function generateSample(): Datasets {
  const names = new NameBook(rngFor('names'))
  const world = buildOrg(rngFor('org'), names)
  assignLeaderHires(world, rngFor('leader-hires'))
  addLeavers(world, names, rngFor('leavers'))
  assignHires(world, rngFor('hires'))
  addContingent(world, names, rngFor('contingent'))
  addPriorFirstYearLeavers(world, names, rngFor('first-year-leavers'))
  plantStagnant(world, rngFor('stagnant'))
  rateCycles(world, rngFor('ratings'))
  plantLongTenureL4(world, rngFor('long-l4'), isConsecutiveHigh)
  buildHistory(world, rngFor('history'), isConsecutiveHigh)
  assignIds(world)

  const ats = recruitingRows(world, names, rngFor('recruiting'))
  const requisitions = ats.requisitions
  // Offer details (docs/ANALYSES.md, 3.10): their own stream, right after recruiting.
  const candidates = withOfferDetails(
    ats.candidates,
    requisitions,
    SAMPLE_AS_OF,
    rngFor('recruiting-offer-detail'),
  )
  const roster = withJobs(employeeRows(world))
  // Accepted offers that start within five weeks are in the HRIS already, as pre-hires.
  const employees = [...roster, ...preHireRows(roster, candidates, requisitions)]
  // The original modules, in their original order (each draws from its own stream).
  const jobChanges = jobChangeRows(world)
  const cases = caseRows(world, rngFor('cases'), rngFor('cases-late-additions'))
  const baseTransactions = transactionRows(
    world,
    rngFor('transactions'),
    rngFor('transactions-late-additions'),
  )
  const reviews = reviewRows(world)
  const succession = successionRows(world, rngFor('succession'))
  const learning = learningRows(world, rngFor('learning'))
  const comp = compRows(world, rngFor('comp'))
  const transactions = withLeaveHistory(baseTransactions, roster, rngFor('leave'))
  const exportPlants = exportPlantsOf(employees)
  const onboardingTasks = onboardingTaskRows(
    employees,
    candidates,
    requisitions,
    rngFor('onboarding'),
    exportPlants,
  )
  const surveys = surveyRows(
    {
      employees,
      candidates,
      requisitions,
      cases,
      transactions,
      learning,
      reviews,
      onboardingTasks,
      managerAt: managerTimeline(world),
    },
    rngFor('surveys'),
  )
  // Education and FTE (docs/ANALYSES.md, 2.10 and 4.10): new columns only, each from its own
  // stream after every other module, so no story above moves.
  const education = planEducation(employees, reviews, jobChanges, SAMPLE_AS_OF, rngFor('education'))
  const staff = withFte(withEducation(employees, education), SAMPLE_AS_OF, rngFor('fte'))
  return {
    employees: staff,
    jobChanges,
    requisitions,
    candidates,
    cases,
    transactions,
    reviews,
    succession,
    learning,
    comp,
    hiringPlan: hiringPlanRows(employees, requisitions, candidates, rngFor('hiring-plan')),
    onboardingTasks,
    rightToWork: rightToWorkRows(employees, onboardingTasks, exportPlants, rngFor('right-to-work')),
    surveyResponses: surveys.responses,
    surveyItems: surveys.items,
    // Finance's budget (docs/ROLES-V2.md, "Decisions made"): last, from its own stream, on the
    // finished roster and pay, so no other number moves.
    budget: budgetRows(staff, comp, rngFor('budget')),
  }
}

let cached: Datasets | null = null

/** The generated sample, built once and shared (the store and the messy sample both start from it). */
export function cachedSample(): Datasets {
  cached ??= generateSample()
  return cached
}
