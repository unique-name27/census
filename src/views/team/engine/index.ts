/**
 * My team's engine (docs/ROLES.md 2.2): pure functions over the producing views' models for the
 * scope on screen. No number here is computed a second way: tiles are the views' own KPI objects,
 * figures read their models' rows, and comparisons use People stats' definitions and settings.
 */

export {
  openReqRows,
  READY_ORDER,
  type ReqRow,
  type StartRow,
  startCalendar,
  startRows,
  startsAfterCalendar,
  type WeekRow,
} from './hiring'
export { FIRST_DAYS, type TeamPersonRow, teamPeople } from './list'
export {
  type LabelOf,
  orgUnderMinimum,
  type PracticeFindings,
  practiceFindings,
  relink,
  TEAM_FINDINGS,
  TEAM_TILES,
  teamFindings,
  teamKpis,
} from './numbers'
export {
  attritionCompare,
  COMPANY_SERIES,
  type CompareMeasure,
  type CompareRow,
  companyMedianSpan,
  companyRate,
  FLAG_TONE,
  ORG_SERIES,
  type SpanRow,
  spanRows,
} from './people'
export { managerAnswers, type TeamSources, teamLeader, teamSources } from './sources'
export {
  COURSES_SHOWN,
  type CourseBar,
  type CoverageCount,
  courseBars,
  criticalCoverage,
  criticalRoles,
  overdueRecords,
  overdueRows,
  overdueSpec,
} from './talent'
export { type TeamLists, teamLists, WAITING_SHOWN, waitingKpi } from './waiting'
