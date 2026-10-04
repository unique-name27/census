/**
 * Survey answers as the survey platform's long export writes them: the platform's program names
 * ("Candidate Experience (cNPS)", "Upward Manager Feedback"), a participant ID, question IDs and
 * a free-text comments column. Census drops the comments column as the sheet is read (survey
 * privacy), so it never reaches the stored sheet. The HR case survey is sent by the help desk,
 * which does not tag drivers, so its answers have a blank driver and take it from the Questions
 * sheet. People analytics confirmed the mapping of both sheets.
 */
import type { Datasets, SurveyItem, SurveyResponse, SurveyType } from '../../../schema'
import type { RawExtract } from '../extract'
import { type Column, dMonY, toAoa } from '../format'
import { FILES } from '../plan'

/** How the survey platform names each program (the importer recognizes them). */
const PROGRAM: Record<SurveyType, string> = {
  'Candidate experience': 'Candidate Experience (cNPS)',
  'Hiring manager satisfaction': 'Hiring Manager Satisfaction',
  'Onboarding pulse day 30': 'Onboarding Pulse - Day 30',
  'Onboarding pulse day 90': 'Onboarding Pulse - Day 90',
  'Stay interview': 'Stay Interview',
  'Exit survey': 'Exit Survey',
  'Manager feedback': 'Upward Manager Feedback',
  'HR service survey': 'HR Case Survey',
  'Return to work': 'Return to Work',
  'Training evaluation': 'Course Evaluation',
  Engagement: 'Engagement Pulse',
}

/** Programs whose answers come without a driver. */
export const UNTAGGED_PROGRAM: SurveyType = 'HR service survey'

/** The rows the import yields: no driver on the help desk's answers. */
export function surveyResponsesPlanted(base: Datasets): SurveyResponse[] {
  return base.surveyResponses.map((r) => (r.survey === UNTAGGED_PROGRAM ? { ...r, driver: null } : r))
}

/** A few neutral comments, so the export has the column the importer drops. */
const COMMENTS = ['Thanks for asking.', 'Nothing to add.', 'See my earlier answers.']

export function surveyResponsesExtract(base: Datasets): RawExtract<'surveyResponses'> {
  const columns: Column<SurveyResponse>[] = [
    { header: 'Survey Name', cell: (r) => PROGRAM[r.survey] },
    { header: 'Wave', cell: (r) => r.wave },
    { header: 'Submitted At', cell: (r) => dMonY(r.responseDate) },
    { header: 'Participant ID', cell: (r) => r.respondentKey },
    { header: 'Question ID', cell: (r) => r.item },
    { header: 'Driver', cell: (r) => (r.survey === UNTAGGED_PROGRAM ? null : (r.driver ?? null)) },
    { header: 'Response', cell: (r) => r.score },
    { header: 'Scale', cell: (r) => r.scale },
    { header: 'Reason', cell: (r) => r.reason ?? null },
    { header: 'Subject ID', cell: (r) => r.subjectKey ?? null },
    { header: 'Touchpoint', cell: (r) => r.touchpoint ?? null },
    { header: 'Comments', cell: (_r, i) => (i % 97 === 0 ? COMMENTS[i % COMMENTS.length] : null) },
  ]
  return { dataset: 'surveyResponses', ...FILES.surveyResponses, aoa: toAoa(base.surveyResponses, columns) }
}

export function surveyItemsPlanted(base: Datasets): SurveyItem[] {
  return base.surveyItems
}

export function surveyItemsExtract(base: Datasets): RawExtract<'surveyItems'> {
  const columns: Column<SurveyItem>[] = [
    { header: 'Question ID', cell: (r) => r.item },
    { header: 'Survey Name', cell: (r) => (r.survey ? PROGRAM[r.survey] : null) },
    { header: 'Driver', cell: (r) => r.driver },
    { header: 'Question Text', cell: (r) => r.text ?? null },
    { header: 'Scale', cell: (r) => r.scale ?? null },
    { header: 'Target', cell: (r) => r.target ?? null },
  ]
  return { dataset: 'surveyItems', ...FILES.surveyItems, aoa: toAoa(base.surveyItems, columns) }
}
