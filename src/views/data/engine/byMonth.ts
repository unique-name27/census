/**
 * Records by month (docs/CHARTS.md, Data room): how many rows of each dataset are dated in each of
 * the last 24 months, by the dataset's own event date, so a gap (an extract cut short, a stale
 * load) shows before it moves a number. Datasets with no event date (comp, right to work,
 * succession, survey items) are snapshots and are listed apart. Pure.
 *
 * A row counts once in a month when any of its event dates falls in it (an employee hired and gone
 * in the same month is one row). Each cell's share is of the dataset's busiest month in the 24,
 * so datasets of very different sizes read on one scale.
 */
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  datasetDef,
  MIN_GROUP,
  type SurveyResponse,
  type SurveyType,
} from '@/data/schema'
import type { DrillRecordMap, DrillSpec } from '@/drill/types'
import { addMonths, formatMonth, formatMonthShort, monthStart, monthsBetween } from '@/lib/dates'
import { breakdown, groupRows, type SurveyGroupRow } from '@/lib/surveys'

/** The event dates a dataset is placed in time by, and what happened on them. */
export const MONTH_RULES: Partial<Record<DatasetKey, { fields: readonly string[]; event: string }>> = {
  employees: { fields: ['hireDate', 'terminationDate'], event: 'hired or left' },
  jobChanges: { fields: ['effectiveDate'], event: 'effective' },
  requisitions: { fields: ['openedDate'], event: 'opened' },
  candidates: { fields: ['appliedDate'], event: 'applied' },
  cases: { fields: ['openedAt'], event: 'opened' },
  transactions: { fields: ['submittedDate'], event: 'submitted' },
  reviews: { fields: ['cycleDate'], event: 'with a review cycle date' },
  learning: { fields: ['assignedDate'], event: 'assigned' },
  hiringPlan: { fields: ['period'], event: 'for starts' },
  onboardingTasks: { fields: ['dueDate'], event: 'due' },
  surveyResponses: { fields: ['responseDate'], event: 'given' },
}

/** Datasets with no event date: what they hold is as of the load. */
export const SNAPSHOT_DATASETS: readonly DatasetKey[] = DATASET_KEYS.filter((k) => !MONTH_RULES[k])

export interface MonthCell {
  key: DatasetKey
  dataset: string
  /** YYYY-MM */
  month: string
  /** "Jul '26" */
  monthLabel: string
  /** Rows dated in the month. */
  rows: number
  /** Of the dataset's busiest month in the range (0 when no month has a row). */
  share: number
  /** Row positions in the loaded dataset, for the drill. */
  indexes: number[]
}

export interface RecordsByMonth {
  months: string[]
  /** Dated datasets with rows loaded, in dataset order. */
  datasets: DatasetKey[]
  /** Dated datasets with nothing loaded. */
  empty: DatasetKey[]
  cells: MonthCell[]
}

const monthOf = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : null

/** Rows of each dated dataset by month, over the `n` months ending with the as-of month. */
export function rowsByMonth(data: Datasets, asOf: string, n = 24): RecordsByMonth {
  const months = monthsBetween(addMonths(monthStart(asOf), -(n - 1)), asOf)
  const at = new Map(months.map((m, i) => [m, i]))
  const datasets: DatasetKey[] = []
  const empty: DatasetKey[] = []
  const cells: MonthCell[] = []
  for (const key of DATASET_KEYS) {
    const rule = MONTH_RULES[key]
    if (!rule) continue
    const rows = data[key] as unknown as readonly Record<string, unknown>[]
    if (!rows.length) {
      empty.push(key)
      continue
    }
    datasets.push(key)
    const byMonth: number[][] = months.map(() => [])
    rows.forEach((r, i) => {
      const seen = new Set<number>()
      for (const f of rule.fields) {
        const m = monthOf(r[f])
        const j = m == null ? undefined : at.get(m)
        if (j !== undefined && !seen.has(j)) {
          seen.add(j)
          byMonth[j].push(i)
        }
      }
    })
    const busiest = Math.max(0, ...byMonth.map((x) => x.length))
    const label = datasetDef(key).label
    months.forEach((month, j) => {
      cells.push({
        key,
        dataset: label,
        month,
        monthLabel: formatMonthShort(`${month}-01`, true),
        rows: byMonth[j].length,
        share: busiest ? byMonth[j].length / busiest : 0,
        indexes: byMonth[j],
      })
    })
  }
  return { months, datasets, empty, cells }
}

/**
 * The rows behind a cell: the dataset's rows dated in the month. Survey answers open grouped by
 * survey and wave (respondents and answers counted, never one answer); a group under `min`
 * respondents shows its count only, and so does every engagement group while engagement surveys
 * are off (`engagement` false). Null for an empty cell.
 */
export function byMonthDrill(
  c: MonthCell,
  data: Datasets,
  o: { source?: string; min?: number; engagement?: boolean } = {},
): DrillSpec | null {
  if (!c.rows) return null
  const rule = MONTH_RULES[c.key]
  const month = formatMonth(`${c.month}-01`)
  const title = `${c.dataset} ${rule?.event ?? 'dated'} in ${month}`
  const subtitle = [c.dataset, o.source].filter(Boolean).join(' · ')
  const list = data[c.key] as unknown as readonly DrillRecordMap[DatasetKey][]
  const rows = c.indexes.map((i) => list[i])
  if (c.key !== 'surveyResponses') return { kind: c.key, title, subtitle, rows } as DrillSpec
  const min = o.min ?? MIN_GROUP
  const answers = rows as unknown as SurveyResponse[]
  const surveys = [...new Set(answers.map((r) => r.survey))].sort() as SurveyType[]
  const grouped: SurveyGroupRow[] = surveys.flatMap((survey) =>
    groupRows(
      breakdown(
        answers.filter((r) => r.survey === survey),
        (r) => r.wave,
        { min, keepSmall: true },
      ),
      { survey, groupBy: 'Wave' },
    ).map((g) =>
      survey === 'Engagement' && o.engagement === false
        ? { ...g, mean: null, topBox: null, nps: null, suppressed: true }
        : g,
    ),
  )
  return {
    kind: 'surveyGroups',
    title,
    subtitle,
    rows: grouped,
    note: `Answers are grouped by survey and wave, never listed one by one. Each row counts distinct respondents; a group under ${min} shows its count only.`,
  }
}
