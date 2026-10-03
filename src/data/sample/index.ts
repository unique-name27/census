/**
 * Deterministic sample company: Northgate Semiconductor, a Nasdaq-listed fabless chip company
 * founded in 2014, as of 30 Sep 2026. Every run produces identical data from fixed seeds. The
 * planted stories each view should surface are documented in README.md next to this file.
 */
import type { Datasets, ISODate } from '../schema'
import { compRows } from './comp'
import {
  addContingent,
  addLeavers,
  assignHires,
  assignIds,
  assignLeaderHires,
  buildHistory,
  employeeRows,
  jobChangeRows,
  plantLongTenureL4,
  plantStagnant,
} from './employees'
import { NameBook } from './names'
import { buildOrg } from './org'
import { rngFor } from './prng'
import { recruitingRows } from './recruiting'
import { caseRows, transactionRows } from './services'
import { isConsecutiveHigh, learningRows, rateCycles, reviewRows, successionRows } from './talent'

/** Fixed reference date for the sample company: the end of Q3 2026. */
export const SAMPLE_AS_OF: ISODate = '2026-09-30'
export const SAMPLE_COMPANY = 'Northgate Semiconductor'

export function generateSample(): Datasets {
  const names = new NameBook(rngFor('names'))
  const world = buildOrg(rngFor('org'), names)
  assignLeaderHires(world, rngFor('leader-hires'))
  addLeavers(world, names, rngFor('leavers'))
  assignHires(world, rngFor('hires'))
  addContingent(world, names, rngFor('contingent'))
  plantStagnant(world, rngFor('stagnant'))
  rateCycles(world, rngFor('ratings'))
  plantLongTenureL4(world, rngFor('long-l4'), isConsecutiveHigh)
  buildHistory(world, rngFor('history'), isConsecutiveHigh)
  assignIds(world)

  const { requisitions, candidates } = recruitingRows(world, names, rngFor('recruiting'))
  return {
    employees: employeeRows(world),
    jobChanges: jobChangeRows(world),
    requisitions,
    candidates,
    cases: caseRows(world, rngFor('cases')),
    transactions: transactionRows(world, rngFor('transactions')),
    reviews: reviewRows(world),
    succession: successionRows(world, rngFor('succession')),
    learning: learningRows(world, rngFor('learning')),
    comp: compRows(world, rngFor('comp')),
  }
}
