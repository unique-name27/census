/**
 * What Listening numbers drill to: grouped survey results (drill kind `surveyGroups`), one row
 * per driver, item, wave or group with its respondents and score. Never an answer, a respondent,
 * a date or a person. Groups under the minimum show their count only, and the panel note says why.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import type { SurveyResponse, SurveyType } from '@/data/schema'
import { type DrillExtra, type DrillFilter, type DrillSpec, drillSpec } from '@/drill/types'
import {
  type Breakdown,
  breakdown,
  type GroupKey,
  groupRows,
  type SurveyGroup,
  type SurveyGroupRow,
} from '@/lib/surveys'

/**
 * The panel note every survey drill carries (the panel itself says results open as groups):
 * the minimum in force, after any note of the drill's own.
 */
export function groupedNote(min: number, extra?: string): string {
  return [extra, `Each row counts distinct respondents; a group under ${min} shows its count only.`]
    .filter(Boolean)
    .join(' ')
}

export interface SurveyDrillMeta {
  /** The survey, when the rows come from one. */
  survey?: SurveyType
  /** The wave, or null when the rows pool several waves. */
  wave: string | null
  title: string
  subtitle?: string
  min: number
  uses?: readonly FieldRef[]
  note?: string
  extra?: DrillExtra<SurveyGroupRow>
  /**
   * The scope that reproduces the group the answers come from ("Filter to Bengaluru"), only for a
   * group at the survey minimum. Never a leader from a manager cut.
   */
  filter?: DrillFilter
}

/** A drill over prepared group rows. */
export function groupsDrill(rows: readonly SurveyGroupRow[], m: SurveyDrillMeta): DrillSpec<'surveyGroups'> {
  return drillSpec({
    kind: 'surveyGroups',
    title: m.title,
    subtitle: m.subtitle,
    rows,
    note: groupedNote(m.min, m.note),
    uses: m.uses,
    extra: m.extra,
    ...(m.filter ? { filter: m.filter } : {}),
  })
}

/** Rows of one breakdown. */
export function breakdownRows(
  b: Breakdown | readonly SurveyGroup[],
  meta: {
    survey: SurveyType
    wave: string | null
    groupBy: string
    driver?: string | null
    item?: string | null
  },
): SurveyGroupRow[] {
  return groupRows(b, meta)
}

/** Answers grouped by a key (every group kept, small ones hidden), as drill rows. */
export function rowsBy(
  answers: readonly SurveyResponse[],
  key: GroupKey,
  meta: { survey: SurveyType; wave: string | null; groupBy: string; driver?: string | null; min: number },
): SurveyGroupRow[] {
  return groupRows(breakdown(answers, key, { min: meta.min, keepSmall: true }), meta)
}

/** The answers by driver (every driver a row). */
export const driverRowsOf = (
  answers: readonly SurveyResponse[],
  survey: SurveyType,
  wave: string | null,
  min: number,
): SurveyGroupRow[] => rowsBy(answers, (r) => r.driver ?? r.item, { survey, wave, groupBy: 'Driver', min })

/** One driver's answers by item. */
export const itemRowsOf = (
  answers: readonly SurveyResponse[],
  survey: SurveyType,
  wave: string | null,
  driver: string,
  min: number,
): SurveyGroupRow[] =>
  rowsBy(
    answers.filter((r) => (r.driver ?? r.item) === driver),
    (r) => r.item,
    { survey, wave, groupBy: 'Item', driver, min },
  )

/** A drill of one driver: its items, in the wave or pooled. */
export function driverDrill(
  answers: readonly SurveyResponse[],
  driver: string,
  m: SurveyDrillMeta & { survey: SurveyType },
): DrillSpec<'surveyGroups'> {
  return groupsDrill(itemRowsOf(answers, m.survey, m.wave, driver, m.min), m)
}

/** A drill of a set of answers by driver. */
export function answersDrill(
  answers: readonly SurveyResponse[],
  m: SurveyDrillMeta & { survey: SurveyType },
): DrillSpec<'surveyGroups'> {
  return groupsDrill(driverRowsOf(answers, m.survey, m.wave, m.min), m)
}
