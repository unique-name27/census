/**
 * Column definitions for every Talent figure and table: they drive the table views and every
 * export, so labels carry units and formats match the numbers. Count and rate cells open the
 * records behind them (`drill`); tables of people open the person from the row instead.
 */
import type { Column } from '@/charts'
import type { HighShareDim, TalentDrill, TalentDrills } from '../engine/drills'
import type {
  CompletionRow,
  CourseRow,
  HoursRow,
  OverdueCell,
  OverdueRow as TrainingOverdueRow,
} from '../engine/learning'
import type { NineBoxCell, NineBoxPerson } from '../engine/ninebox'
import type {
  CalibrationRow,
  CycleRow,
  DistributionRow,
  ExitByRatingRow,
  HighShareRow,
  MixRow,
} from '../engine/performance'
import { RATING_ORDER } from '../engine/performance'
import type { OverdueRow } from '../engine/promotion'
import type { DriverRow, ExitPerson, RiskPersonRow } from '../engine/retention'
import type { BackTestBand, FactorEvidence, RiskBand } from '../engine/risk'
import type { BenchScope, BenchTableRow, CoverageRow, HipoGroupRow, RoleRow } from '../engine/succession'

export type NineBoxRow = Omit<NineBoxCell, 'people'>

/** `risk` false leaves out the flight-risk overlay (below the data standard). */
export const nineBoxColumns = (d: TalentDrills, risk = true): Column<NineBoxRow>[] => {
  const all = (r: NineBoxRow) => d.nineBox(r.performance, r.potential, 'all')
  const cols: Column<NineBoxRow>[] = [
    { key: 'performance', label: 'Performance' },
    { key: 'potential', label: 'Potential' },
    { key: 'label', label: 'Box' },
    { key: 'count', label: 'People', format: 'int', drill: all },
    { key: 'share', label: 'Share of placed', format: 'pct', drill: all },
    {
      key: 'highRisk',
      label: 'High flight risk',
      format: 'int',
      drill: (r) => d.nineBox(r.performance, r.potential, 'highRisk'),
    },
  ]
  return risk ? cols : cols.filter((c) => c.key !== 'highRisk')
}

/** "Rating (2025 Annual)": the 9-box reads the annual cycle, which can differ from the latest one. */
const cycleLabel = (label: string, cycle: string | null | undefined) =>
  cycle ? `${label} (${cycle})` : label

export const nineBoxPeopleColumns = (cycle?: string | null, risk = true): Column<NineBoxPerson>[] => [
  { key: 'name', label: 'Name' },
  { key: 'employeeId', label: 'ID' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'level', label: 'Level' },
  { key: 'location', label: 'Location' },
  { key: 'manager', label: 'Manager' },
  { key: 'rating', label: cycleLabel('Rating', cycle), format: 'int' },
  { key: 'potential', label: cycleLabel('Potential', cycle) },
  ...(risk ? [{ key: 'riskBand', label: 'Flight risk' }] : []),
]

export const nineBoxDetailColumns = (cycle?: string | null, risk = true): Column[] => [
  { key: 'box', label: 'Box' },
  ...nineBoxPeopleColumns(cycle, risk),
  ...(risk ? [{ key: 'riskScore', label: 'Flight-risk score', format: 'int' as const }] : []),
]

export const distributionColumns = (d: TalentDrills): Column<DistributionRow>[] => [
  { key: 'label', label: 'Rating' },
  { key: 'people', label: 'People', format: 'int', drill: (r) => d.rating(r.rating) },
  { key: 'share', label: 'Actual share', format: 'pct', drill: (r) => d.rating(r.rating) },
  { key: 'guideline', label: 'Guideline', format: 'pct0' },
  { key: 'gap', label: 'Gap to guideline', format: 'pts' },
]

export const highShareColumns = (
  groupLabel: string,
  d?: TalentDrills,
  dim?: HighShareDim,
): Column<HighShareRow>[] => {
  const open = (part: 'rated' | 'high') =>
    d && dim ? { drill: (r: HighShareRow) => d.highShare(dim, r, part) } : {}
  return [
    { key: 'group', label: groupLabel },
    { key: 'rated', label: 'People rated', format: 'int', ...open('rated') },
    { key: 'high', label: 'Rated 4-5', format: 'int', ...open('high') },
    { key: 'share', label: 'Share rated 4-5', format: 'pct', ...open('high') },
  ]
}

export const mixColumns = (d: TalentDrills): Column<MixRow>[] => [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'rated', label: 'People rated', format: 'int', drill: (r) => d.mix(r.businessUnit, null) },
  ...([1, 2, 3, 4, 5] as const).map(
    (k): Column<MixRow> => ({
      key: `r${k}`,
      label: RATING_ORDER[k - 1],
      format: 'pct',
      drill: (r) => d.mix(r.businessUnit, k),
    }),
  ),
]

export const calibrationColumns = (d: TalentDrills): Column<CalibrationRow>[] => {
  const all = (r: CalibrationRow) => d.calibration(r.businessUnit, 'all')
  return [
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'n', label: 'People', format: 'int', drill: all },
    { key: 'proposed', label: 'Average proposed', format: 'num2', drill: all },
    { key: 'final', label: 'Average final', format: 'num2', drill: all },
    { key: 'shift', label: 'Calibration shift', format: 'num2', drill: all },
    {
      key: 'movedDown',
      label: 'Moved down',
      format: 'pct',
      drill: (r) => d.calibration(r.businessUnit, 'down'),
    },
    { key: 'movedUp', label: 'Moved up', format: 'pct', drill: (r) => d.calibration(r.businessUnit, 'up') },
  ]
}

export const cycleColumns = (d: TalentDrills): Column<CycleRow>[] => {
  const open = (r: CycleRow) => d.cycleUnit(r.cycle, r.businessUnit)
  return [
    { key: 'cycle', label: 'Cycle' },
    { key: 'cycleDate', label: 'Cycle date', format: 'date' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'rated', label: 'People rated', format: 'int', drill: open },
    { key: 'mean', label: 'Average rating', format: 'num2', drill: open },
  ]
}

/** 4 for "4 Exceeds". */
export const ratingOf = (label: string): number => RATING_ORDER.indexOf(label) + 1

export const exitByRatingColumns = (d: TalentDrills): Column<ExitByRatingRow>[] => {
  const open =
    (part: 'rated' | 'Voluntary' | 'Involuntary' | 'left') =>
    (r: ExitByRatingRow): TalentDrill =>
      d.exitCohort(ratingOf(r.rating), part)
  return [
    { key: 'rating', label: 'Rating' },
    { key: 'rated', label: 'People rated', format: 'int', drill: open('rated') },
    { key: 'voluntary', label: 'Left voluntarily', format: 'int', drill: open('Voluntary') },
    { key: 'involuntary', label: 'Left involuntarily', format: 'int', drill: open('Involuntary') },
    { key: 'voluntaryRate', label: 'Voluntary exit rate', format: 'pct', drill: open('Voluntary') },
    { key: 'involuntaryRate', label: 'Involuntary exit rate', format: 'pct', drill: open('Involuntary') },
    { key: 'rate', label: 'Exit rate', format: 'pct', drill: open('left') },
  ]
}

export const coverageColumns = (d: TalentDrills): Column<CoverageRow>[] => [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'coverage', label: 'Best successor readiness' },
  { key: 'roles', label: 'Roles', format: 'int', drill: (r) => d.coverageCell(r.businessUnit, r.coverage) },
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

/** The roles table: successor counts open the bench behind them. */
export const roleColumns = (d: TalentDrills): Column<RoleRow>[] =>
  ROLE_COLUMNS.map((c) =>
    c.key === 'successors'
      ? { ...c, drill: (r: RoleRow) => d.roleBench(r.roleId, null) }
      : c.key === 'readyNow'
        ? { ...c, drill: (r: RoleRow) => d.roleBench(r.roleId, 'Ready now') }
        : c,
  )

export const ROLE_DETAIL_COLUMNS: Column[] = [
  ...(ROLE_COLUMNS as Column[]),
  { key: 'incumbentId', label: 'Incumbent ID' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'successorNames', label: 'Successors named' },
  { key: 'updatedDate', label: 'Plan updated', format: 'date' },
]

export const benchColumns = (d: TalentDrills, scope: BenchScope): Column<BenchTableRow>[] => [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'roles', label: 'Roles', format: 'int', drill: (r) => d.benchRoles(scope, r.businessUnit, 'all') },
  {
    key: 'successors',
    label: 'Successors named',
    format: 'int',
    drill: (r) => d.bench(scope, r.businessUnit, null),
  },
  {
    key: 'perRole',
    label: 'Successors per role',
    format: 'num1',
    drill: (r) => d.bench(scope, r.businessUnit, null, true),
  },
  {
    key: 'readyNow',
    label: 'Ready now',
    format: 'int',
    drill: (r) => d.bench(scope, r.businessUnit, 'Ready now'),
  },
  {
    key: 'ready1to2',
    label: 'Ready in 1-2 years',
    format: 'int',
    drill: (r) => d.bench(scope, r.businessUnit, 'Ready in 1-2 years'),
  },
  {
    key: 'ready3plus',
    label: 'Ready in 3+ years',
    format: 'int',
    drill: (r) => d.bench(scope, r.businessUnit, 'Ready in 3+ years'),
  },
  {
    key: 'noSuccessor',
    label: 'Roles with no successor',
    format: 'int',
    drill: (r) => d.benchRoles(scope, r.businessUnit, 'none'),
  },
]

export const hipoColumns = (
  groupLabel: string,
  d?: TalentDrills,
  dim?: 'level' | 'businessUnit',
): Column<HipoGroupRow>[] => {
  const open = (part: 'assessed' | 'high') =>
    d && dim ? { drill: (r: HipoGroupRow) => d.hipo(dim, r, part) } : {}
  return [
    { key: 'group', label: groupLabel },
    { key: 'assessed', label: 'People assessed', format: 'int', ...open('assessed') },
    { key: 'high', label: 'High potential', format: 'int', ...open('high') },
    { key: 'share', label: 'Share high potential', format: 'pct', ...open('high') },
  ]
}

type BandTableRow = { band: RiskBand; people: number; share: number | null; companyShare: number | null }

export const bandColumns = (d: TalentDrills): Column<BandTableRow>[] => [
  { key: 'band', label: 'Flight-risk band' },
  { key: 'people', label: 'People', format: 'int', drill: (r) => d.band(r.band, 'scope') },
  { key: 'share', label: 'Share of people scored', format: 'pct', drill: (r) => d.band(r.band, 'scope') },
  {
    key: 'companyShare',
    label: 'Share company-wide',
    format: 'pct',
    drill: (r) => d.band(r.band, 'company'),
  },
]

export const backTestColumns = (d: TalentDrills): Column<BackTestBand>[] => {
  const left = (r: BackTestBand) => d.backTest(r.band, 'left')
  return [
    { key: 'band', label: 'Band a year ago' },
    { key: 'people', label: 'People scored', format: 'int', drill: (r) => d.backTest(r.band, 'scored') },
    { key: 'leavers', label: 'Left within 12 months', format: 'int', drill: left },
    { key: 'rate', label: 'Exit rate', format: 'pct', drill: left },
    {
      key: 'shareOfLeavers',
      label: 'Share of all leavers',
      format: 'pct',
      drill: (r) => d.backTest(r.band, 'shareOfLeavers'),
    },
  ]
}

type DriverTableRow = DriverRow & { share: number | null }

export const driverColumns = (d: TalentDrills): Column<DriverTableRow>[] => [
  { key: 'factor', label: 'Factor' },
  { key: 'points', label: 'Points', format: 'int' },
  {
    key: 'anyReason',
    label: 'People in high band with it',
    format: 'int',
    drill: (r) => d.driver(r.key, 'any'),
  },
  { key: 'share', label: 'Share of high band', format: 'pct', drill: (r) => d.driver(r.key, 'any') },
  { key: 'topReason', label: 'Main reason for', format: 'int', drill: (r) => d.driver(r.key, 'main') },
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

export const courseColumns = (d: TalentDrills): Column<CourseRow>[] => [
  { key: 'course', label: 'Course' },
  { key: 'category', label: 'Category' },
  { key: 'due', label: 'Assignments due', format: 'int', drill: (r) => d.onTime(r.course, 'due') },
  { key: 'onTime', label: 'On time', format: 'int', drill: (r) => d.onTime(r.course, 'onTime') },
  { key: 'late', label: 'Completed late', format: 'int', drill: (r) => d.onTime(r.course, 'late') },
  { key: 'open', label: 'Not completed', format: 'int', drill: (r) => d.onTime(r.course, 'open') },
  { key: 'onTimeRate', label: 'On time', format: 'pct', drill: (r) => d.onTime(r.course, 'onTime') },
]

export const overdueCellColumns = (
  groupLabel: string,
  d?: TalentDrills,
  dim?: 'department' | 'location',
): Column<OverdueCell>[] => {
  const open = (part: 'pastDue' | 'overdue') =>
    d && dim ? { drill: (r: OverdueCell) => d.overdueCell(dim, r, part) } : {}
  return [
    { key: 'course', label: 'Course' },
    { key: 'group', label: groupLabel },
    { key: 'pastDue', label: 'Assignments past due', format: 'int', ...open('pastDue') },
    { key: 'overdue', label: 'Overdue', format: 'int', ...open('overdue') },
    { key: 'share', label: 'Share overdue', format: 'pct', ...open('overdue') },
  ]
}

export const completionColumns = (d: TalentDrills): Column<CompletionRow>[] => [
  { key: 'month', label: 'Month' },
  { key: 'kind', label: 'Assignment' },
  {
    key: 'completions',
    label: 'Completions',
    format: 'int',
    drill: (r) => d.completions(r.month, r.kind),
  },
]

export const hoursColumns = (d: TalentDrills): Column<HoursRow>[] => [
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'hours', label: 'Hours completed', format: 'hours', drill: (r) => d.hours(r.businessUnit) },
  { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
  { key: 'perEmployee', label: 'Hours per employee', format: 'hours', drill: (r) => d.hours(r.businessUnit) },
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
