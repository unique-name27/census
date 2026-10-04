/**
 * Column definitions for every Talent figure and table: they drive the table views and every
 * export, so labels carry units and formats match the numbers.
 */
import type { Column } from '@/charts'
import type { CourseRow, HoursRow, OverdueCell, OverdueRow as TrainingOverdueRow } from '../engine/learning'
import type { NineBoxCell, NineBoxPerson } from '../engine/ninebox'
import type {
  CalibrationRow,
  CycleRow,
  DistributionRow,
  ExitByRatingRow,
  HighShareRow,
  MixRow,
} from '../engine/performance'
import type { OverdueRow } from '../engine/promotion'
import type { DriverRow, ExitPerson, RiskPersonRow } from '../engine/retention'
import type { BackTestBand, FactorEvidence } from '../engine/risk'
import type { BenchTableRow, CoverageRow, HipoGroupRow, RoleRow } from '../engine/succession'

export type NineBoxRow = Omit<NineBoxCell, 'people'>

export const NINE_BOX_COLUMNS: Column<NineBoxRow>[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'potential', label: 'Potential' },
  { key: 'label', label: 'Box' },
  { key: 'count', label: 'People', format: 'int' },
  { key: 'share', label: 'Share of placed', format: 'pct' },
  { key: 'highRisk', label: 'High flight risk', format: 'int' },
]

/** "Rating (2025 Annual)": the 9-box reads the annual cycle, which can differ from the latest one. */
const cycleLabel = (label: string, cycle: string | null | undefined) =>
  cycle ? `${label} (${cycle})` : label

export const nineBoxPeopleColumns = (cycle?: string | null): Column<NineBoxPerson>[] => [
  { key: 'name', label: 'Name' },
  { key: 'employeeId', label: 'ID' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'level', label: 'Level' },
  { key: 'location', label: 'Location' },
  { key: 'manager', label: 'Manager' },
  { key: 'rating', label: cycleLabel('Rating', cycle), format: 'int' },
  { key: 'potential', label: cycleLabel('Potential', cycle) },
  { key: 'riskBand', label: 'Flight risk' },
]

export const nineBoxDetailColumns = (cycle?: string | null): Column[] => [
  { key: 'box', label: 'Box' },
  ...nineBoxPeopleColumns(cycle),
  { key: 'riskScore', label: 'Flight-risk score', format: 'int' },
]

export const DISTRIBUTION_COLUMNS: Column<DistributionRow>[] = [
  { key: 'label', label: 'Rating' },
  { key: 'people', label: 'People', format: 'int' },
  { key: 'share', label: 'Actual share', format: 'pct' },
  { key: 'guideline', label: 'Guideline', format: 'pct0' },
  { key: 'gap', label: 'Gap to guideline', format: 'pts' },
]

export const highShareColumns = (groupLabel: string): Column<HighShareRow>[] => [
  { key: 'group', label: groupLabel },
  { key: 'rated', label: 'People rated', format: 'int' },
  { key: 'high', label: 'Rated 4-5', format: 'int' },
  { key: 'share', label: 'Share rated 4-5', format: 'pct' },
]

export const MIX_COLUMNS: Column<MixRow>[] = [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'rated', label: 'People rated', format: 'int' },
  { key: 'r1', label: '1 Does not meet', format: 'pct' },
  { key: 'r2', label: '2 Partially meets', format: 'pct' },
  { key: 'r3', label: '3 Meets', format: 'pct' },
  { key: 'r4', label: '4 Exceeds', format: 'pct' },
  { key: 'r5', label: '5 Far exceeds', format: 'pct' },
]

export const CALIBRATION_COLUMNS: Column<CalibrationRow>[] = [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'proposed', label: 'Average proposed', format: 'num2' },
  { key: 'final', label: 'Average final', format: 'num2' },
  { key: 'shift', label: 'Calibration shift', format: 'num2' },
  { key: 'movedDown', label: 'Moved down', format: 'pct' },
  { key: 'movedUp', label: 'Moved up', format: 'pct' },
]

export const CYCLE_COLUMNS: Column<CycleRow>[] = [
  { key: 'cycle', label: 'Cycle' },
  { key: 'cycleDate', label: 'Cycle date', format: 'date' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'rated', label: 'People rated', format: 'int' },
  { key: 'mean', label: 'Average rating', format: 'num2' },
]

export const EXIT_BY_RATING_COLUMNS: Column<ExitByRatingRow>[] = [
  { key: 'rating', label: 'Rating' },
  { key: 'rated', label: 'People rated', format: 'int' },
  { key: 'voluntary', label: 'Left voluntarily', format: 'int' },
  { key: 'involuntary', label: 'Left involuntarily', format: 'int' },
  { key: 'voluntaryRate', label: 'Voluntary exit rate', format: 'pct' },
  { key: 'involuntaryRate', label: 'Involuntary exit rate', format: 'pct' },
  { key: 'rate', label: 'Exit rate', format: 'pct' },
]

export const COVERAGE_COLUMNS: Column<CoverageRow>[] = [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'coverage', label: 'Best successor readiness' },
  { key: 'roles', label: 'Roles', format: 'int' },
]

export const ROLE_COLUMNS: Column<RoleRow>[] = [
  { key: 'roleId', label: 'Role ID' },
  { key: 'roleTitle', label: 'Role' },
  { key: 'incumbent', label: 'Incumbent' },
  { key: 'department', label: 'Department' },
  { key: 'criticality', label: 'Criticality' },
  { key: 'riskOfLoss', label: 'Risk of loss' },
  { key: 'modelRisk', label: 'Flight risk (model)' },
  { key: 'successors', label: 'Successors', format: 'int' },
  { key: 'readyNow', label: 'Ready now', format: 'int' },
  { key: 'readiness', label: 'Readiness mix' },
  { key: 'status', label: 'Bench' },
]

export const ROLE_DETAIL_COLUMNS: Column[] = [
  ...(ROLE_COLUMNS as Column[]),
  { key: 'incumbentId', label: 'Incumbent ID' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'successorNames', label: 'Successors named' },
  { key: 'updatedDate', label: 'Plan updated', format: 'date' },
]

export const BENCH_COLUMNS: Column<BenchTableRow>[] = [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'roles', label: 'Roles', format: 'int' },
  { key: 'successors', label: 'Successors named', format: 'int' },
  { key: 'perRole', label: 'Successors per role', format: 'num1' },
  { key: 'readyNow', label: 'Ready now', format: 'int' },
  { key: 'ready1to2', label: 'Ready in 1-2 years', format: 'int' },
  { key: 'ready3plus', label: 'Ready in 3+ years', format: 'int' },
  { key: 'noSuccessor', label: 'Roles with no successor', format: 'int' },
]

export const hipoColumns = (groupLabel: string): Column<HipoGroupRow>[] => [
  { key: 'group', label: groupLabel },
  { key: 'assessed', label: 'People assessed', format: 'int' },
  { key: 'high', label: 'High potential', format: 'int' },
  { key: 'share', label: 'Share high potential', format: 'pct' },
]

export const BAND_COLUMNS: Column<{
  band: string
  people: number
  share: number | null
  companyShare: number | null
}>[] = [
  { key: 'band', label: 'Flight-risk band' },
  { key: 'people', label: 'People', format: 'int' },
  { key: 'share', label: 'Share of people scored', format: 'pct' },
  { key: 'companyShare', label: 'Share company-wide', format: 'pct' },
]

export const BACKTEST_COLUMNS: Column<BackTestBand>[] = [
  { key: 'band', label: 'Band a year ago' },
  { key: 'people', label: 'People scored', format: 'int' },
  { key: 'leavers', label: 'Left within 12 months', format: 'int' },
  { key: 'rate', label: 'Exit rate', format: 'pct' },
  { key: 'shareOfLeavers', label: 'Share of all leavers', format: 'pct' },
]

export const DRIVER_COLUMNS: Column<DriverRow & { share: number | null }>[] = [
  { key: 'factor', label: 'Factor' },
  { key: 'points', label: 'Points', format: 'int' },
  { key: 'anyReason', label: 'People in high band with it', format: 'int' },
  { key: 'share', label: 'Share of high band', format: 'pct' },
  { key: 'topReason', label: 'Main reason for', format: 'int' },
]

export const EVIDENCE_COLUMNS: Column<FactorEvidence & { definition: string; how: string }>[] = [
  { key: 'label', label: 'Factor' },
  { key: 'points', label: 'Points now', format: 'int' },
  { key: 'how', label: 'Points set by' },
  { key: 'withFactor', label: 'With it (person-months)', format: 'int' },
  { key: 'withRate', label: 'Left within 12 months, with it', format: 'pct' },
  { key: 'without', label: 'Without it (person-months)', format: 'int' },
  { key: 'withoutRate', label: 'Left within 12 months, without it', format: 'pct' },
  { key: 'lift', label: 'Lift', format: 'times' },
  { key: 'definition', label: 'Definition' },
]

/**
 * The people tables of the risk model. The rating column names the cycle it comes from when
 * everyone's latest rating is from the same one, so it doesn't clash with the 9-box (annual cycle).
 */
export function riskPersonColumns(
  rows: readonly RiskPersonRow[],
  opts: { full: boolean },
): Column<RiskPersonRow>[] {
  const cycles = new Set(rows.map((r) => r.ratingCycle).filter(Boolean))
  const one = cycles.size === 1 ? [...cycles][0] : null
  const rating: Column<RiskPersonRow>[] = [
    { key: 'rating', label: one ? `Latest rating (${one})` : 'Latest rating', format: 'int' },
    ...(cycles.size > 1 ? [{ key: 'ratingCycle', label: 'Rating cycle' }] : []),
  ]
  return [
    { key: 'name', label: 'Name' },
    { key: 'employeeId', label: 'ID' },
    ...(opts.full ? [{ key: 'jobTitle', label: 'Job title' }] : []),
    { key: 'department', label: 'Department' },
    { key: 'level', label: 'Level' },
    { key: 'location', label: 'Location' },
    ...(opts.full ? [{ key: 'manager', label: 'Manager' }] : []),
    ...rating,
    ...(opts.full ? [{ key: 'band', label: 'Band' }] : []),
    { key: 'score', label: 'Score', format: 'int' },
    { key: 'reason1', label: 'Main reason' },
    { key: 'reason2', label: 'Also' },
  ]
}

export const PROMOTION_OVERDUE_COLUMNS: Column<OverdueRow>[] = [
  { key: 'name', label: 'Name' },
  { key: 'employeeId', label: 'ID' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'level', label: 'Level' },
  { key: 'location', label: 'Location' },
  { key: 'manager', label: 'Manager' },
  { key: 'tenure', label: 'Tenure', format: 'years' },
  { key: 'lastPromotion', label: 'Last promotion', format: 'date' },
  { key: 'ratings', label: 'Last two annual ratings' },
  { key: 'riskBand', label: 'Flight risk' },
]

export const EXIT_PERSON_COLUMNS: Column<ExitPerson>[] = [
  { key: 'name', label: 'Name' },
  { key: 'employeeId', label: 'ID' },
  { key: 'department', label: 'Department' },
  { key: 'level', label: 'Level' },
  { key: 'location', label: 'Location' },
  { key: 'terminationDate', label: 'Exit date', format: 'date' },
  { key: 'reason', label: 'Reason' },
  { key: 'rating', label: 'Last rating', format: 'int' },
]

export const COURSE_COLUMNS: Column<CourseRow>[] = [
  { key: 'course', label: 'Course' },
  { key: 'category', label: 'Category' },
  { key: 'due', label: 'Assignments due', format: 'int' },
  { key: 'onTime', label: 'On time', format: 'int' },
  { key: 'late', label: 'Completed late', format: 'int' },
  { key: 'open', label: 'Not completed', format: 'int' },
  { key: 'onTimeRate', label: 'On time', format: 'pct' },
]

export const overdueCellColumns = (groupLabel: string): Column<OverdueCell>[] => [
  { key: 'course', label: 'Course' },
  { key: 'group', label: groupLabel },
  { key: 'pastDue', label: 'Assignments past due', format: 'int' },
  { key: 'overdue', label: 'Overdue', format: 'int' },
  { key: 'share', label: 'Share overdue', format: 'pct' },
]

export const COMPLETION_COLUMNS: Column<{ month: string; kind: string; completions: number }>[] = [
  { key: 'month', label: 'Month' },
  { key: 'kind', label: 'Assignment' },
  { key: 'completions', label: 'Completions', format: 'int' },
]

export const HOURS_COLUMNS: Column<HoursRow>[] = [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'hours', label: 'Hours completed', format: 'hours' },
  { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
  { key: 'perEmployee', label: 'Hours per employee', format: 'hours' },
]

export const TRAINING_OVERDUE_COLUMNS: Column<TrainingOverdueRow>[] = [
  { key: 'name', label: 'Name' },
  { key: 'employeeId', label: 'ID' },
  { key: 'course', label: 'Course' },
  { key: 'department', label: 'Department' },
  { key: 'location', label: 'Location' },
  { key: 'manager', label: 'Manager' },
  { key: 'dueDate', label: 'Due date', format: 'date' },
  { key: 'daysOverdue', label: 'Days overdue', format: 'days' },
]
