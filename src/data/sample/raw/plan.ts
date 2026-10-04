/**
 * Where each sample dataset starts (docs/DATA-TIERS.md, "Sample data that sucks"): which ones
 * arrive as raw extracts, whose mapping someone already confirmed, and which ones the data
 * owner certified, with what note and control totals.
 */
import type { ControlMetricId } from '../../quality/types'
import type { DatasetKey } from '../../schema'

/** 'none': a dataset the sample has no rows for loads as No data. */
export type StartTier = 'gold' | 'silver' | 'bronze' | 'none'

/** The tier each dataset loads at. */
export const SAMPLE_TIERS: Record<DatasetKey, StartTier> = {
  employees: 'gold',
  jobChanges: 'silver',
  requisitions: 'silver',
  candidates: 'bronze',
  cases: 'bronze',
  transactions: 'silver',
  reviews: 'gold',
  succession: 'bronze',
  learning: 'silver',
  comp: 'gold',
  hiringPlan: 'silver',
  onboardingTasks: 'bronze',
  rightToWork: 'silver',
  surveyResponses: 'silver',
  surveyItems: 'silver',
}

/** Datasets that arrive as raw extracts and run through the importer on load. */
export const RAW_DATASETS = [
  'jobChanges',
  'requisitions',
  'candidates',
  'cases',
  'transactions',
  'succession',
  'learning',
  'hiringPlan',
  'onboardingTasks',
  'rightToWork',
  'surveyResponses',
  'surveyItems',
] as const
export type RawDataset = (typeof RAW_DATASETS)[number]

/** The file and sheet each raw extract arrives as. */
export const FILES: Record<RawDataset, { fileName: string; sheetName: string }> = {
  jobChanges: { fileName: 'Job history report.xlsx', sheetName: 'Job History' },
  requisitions: { fileName: 'ATS job report.csv', sheetName: 'ATS job report' },
  candidates: { fileName: 'ATS candidate export.csv', sheetName: 'ATS candidate export' },
  cases: { fileName: 'Help desk case export.csv', sheetName: 'Help desk case export' },
  transactions: { fileName: 'Business process audit.xlsx', sheetName: 'BP Audit' },
  succession: { fileName: 'Succession tracker FY26.xlsx', sheetName: 'Tracker' },
  learning: { fileName: 'LMS completion export.csv', sheetName: 'LMS completion export' },
  hiringPlan: { fileName: 'FY27 hiring plan v2.xlsx', sheetName: 'Plan lines' },
  onboardingTasks: { fileName: 'Onboarding tracker export.csv', sheetName: 'Onboarding tracker export' },
  rightToWork: { fileName: 'Immigration and I-9 tracker.xlsx', sheetName: 'Tracker' },
  surveyResponses: { fileName: 'Survey platform export.xlsx', sheetName: 'Responses' },
  surveyItems: { fileName: 'Survey platform export.xlsx', sheetName: 'Questions' },
}

/** When each raw extract was loaded (the morning of the as-of date). */
export const IMPORTED_AT: Record<RawDataset, string> = {
  jobChanges: '2026-09-30T07:05:00.000Z',
  requisitions: '2026-09-30T07:20:00.000Z',
  candidates: '2026-09-30T07:22:00.000Z',
  cases: '2026-09-30T07:40:00.000Z',
  transactions: '2026-09-30T07:45:00.000Z',
  succession: '2026-09-30T08:10:00.000Z',
  learning: '2026-09-30T08:30:00.000Z',
  hiringPlan: '2026-09-30T08:45:00.000Z',
  onboardingTasks: '2026-09-30T08:50:00.000Z',
  rightToWork: '2026-09-30T09:00:00.000Z',
  surveyResponses: '2026-09-30T09:05:00.000Z',
  surveyItems: '2026-09-30T09:05:00.000Z',
}

/** Who reviewed the mapping of each silver dataset, and when. */
export const CONFIRMED: Partial<Record<DatasetKey, { by: string; at: string }>> = {
  jobChanges: { by: 'HRIS team', at: '2026-09-30T09:15:00.000Z' },
  requisitions: { by: 'Talent acquisition operations', at: '2026-09-30T10:05:00.000Z' },
  transactions: { by: 'HR operations', at: '2026-09-30T10:40:00.000Z' },
  learning: { by: 'Learning team', at: '2026-09-30T11:20:00.000Z' },
  hiringPlan: { by: 'Finance and talent acquisition', at: '2026-09-30T11:40:00.000Z' },
  rightToWork: { by: 'Global mobility', at: '2026-09-30T12:10:00.000Z' },
  surveyResponses: { by: 'People analytics', at: '2026-09-30T12:30:00.000Z' },
  surveyItems: { by: 'People analytics', at: '2026-09-30T12:30:00.000Z' },
}

export interface StarterTotal {
  label: string
  metric: ControlMetricId
  /** Round the expected value to this step, the way a report states it (1 = exact). */
  roundTo: number
}

export interface StarterCertification {
  by: string
  at: string
  note: string
  controlTotals: StarterTotal[]
}

/** The data owners' certifications of the gold datasets. */
export const CERTIFIED: Partial<Record<DatasetKey, StarterCertification>> = {
  employees: {
    by: 'HRIS team',
    at: '2026-09-30T16:00:00.000Z',
    note: 'Headcount and exits reconcile to the HRIS headcount report for 30 Sep 2026. Exit reasons before Oct 2025 were not migrated.',
    controlTotals: [
      { label: 'Headcount per the HRIS report', metric: 'activeHeadcount', roundTo: 1 },
      { label: 'Exits in the last 12 months per the HRIS report', metric: 'exits12m', roundTo: 1 },
    ],
  },
  reviews: {
    by: 'Talent team',
    at: '2026-09-30T16:30:00.000Z',
    note: 'Certified after calibration of the 2026 mid-year cycle.',
    controlTotals: [
      { label: 'People rated in 2026 mid-year per the calibration file', metric: 'ratedPeople', roundTo: 1 },
    ],
  },
  comp: {
    by: 'Total rewards',
    at: '2026-09-30T17:00:00.000Z',
    note: 'Reconciles to the September 2026 payroll register. Market medians cover the jobs the survey matched.',
    controlTotals: [
      { label: 'Employees on the payroll register', metric: 'rows', roundTo: 1 },
      { label: 'Total base in USD per payroll', metric: 'totalBaseUsd', roundTo: 1000 },
    ],
  },
}
