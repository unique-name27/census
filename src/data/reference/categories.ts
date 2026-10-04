/**
 * The categorical fields across the ten datasets, grouped into categories: the department of an
 * employee and the department of a requisition are one category, so a rename applies to both.
 *
 * Free-text person names (recruiters, assignees, HR partners) are not categories. Case
 * subcategories are left out on purpose: employee relations cases are only shown down to the
 * category level.
 */

import type { FieldRef } from '../quality/fieldRef'
import { vocabList } from '../quality/vocab'
import { DATASETS } from '../schema'

export type CategorySection = 'org' | 'job' | 'lists'

export interface CategoryDef {
  id: string
  /** Sentence case, singular: "Department". */
  label: string
  section: CategorySection
  refs: FieldRef[]
  /** Canonical values in order, when the category has a known list. */
  vocab: readonly string[] | null
  /** Values must come from `vocab` (enum and level fields): merges and renames must land on one. */
  strict: boolean
}

const c = (
  id: string,
  label: string,
  section: CategorySection,
  refs: FieldRef[],
  vocab?: readonly string[] | null,
): CategoryDef => {
  const fields = refs.map((r) => {
    const [d, f] = r.split('.')
    return DATASETS.find((x) => x.key === d)?.fields.find((x) => x.key === f)
  })
  const strict = fields.some((f) => f?.type === 'enum' || f?.type === 'level')
  return { id, label, section, refs, vocab: vocab ?? vocabList(refs[0]), strict }
}

export const CATEGORIES: readonly CategoryDef[] = [
  c('businessUnit', 'Business unit', 'org', [
    'employees.businessUnit',
    'requisitions.businessUnit',
    'hiringPlan.businessUnit',
  ]),
  c('department', 'Department', 'org', [
    'employees.department',
    'requisitions.department',
    'jobChanges.fromDepartment',
    'jobChanges.toDepartment',
    'hiringPlan.department',
  ]),
  c('costCenter', 'Cost center', 'org', ['employees.costCenter']),
  // Every company has its own sites, so locations and countries have no fixed list.
  c('location', 'Location', 'org', [
    'employees.location',
    'requisitions.location',
    'cases.location',
    'hiringPlan.location',
  ]),
  c('country', 'Country', 'org', ['employees.country']),
  // Functions are open: JOB_FUNCTIONS are the suggested values (the move form offers them), and a
  // company's own function is a value like any other, never "not in the list".
  c('jobFunction', 'Job function', 'job', ['employees.jobFunction']),
  c('jobFamily', 'Job family', 'job', ['employees.jobFamily']),
  c('jobTitle', 'Job title', 'job', ['employees.jobTitle', 'requisitions.jobTitle']),
  c('level', 'Level', 'job', [
    'employees.level',
    'requisitions.level',
    'jobChanges.fromLevel',
    'jobChanges.toLevel',
  ]),
  c('employmentType', 'Employment type', 'lists', ['employees.employmentType']),
  c('terminationType', 'Termination type', 'lists', ['employees.terminationType']),
  c('terminationReason', 'Termination reason', 'lists', ['employees.terminationReason']),
  c('changeType', 'Change type', 'lists', ['jobChanges.changeType']),
  c('reqStatus', 'Requisition status', 'lists', ['requisitions.status']),
  c('reqType', 'Requisition type', 'lists', ['requisitions.reqType']),
  c('reqPriority', 'Requisition priority', 'lists', ['requisitions.priority']),
  c('stage', 'Candidate stage', 'lists', ['candidates.currentStage']),
  c('candidateStatus', 'Candidate status', 'lists', ['candidates.status']),
  c('source', 'Candidate source', 'lists', ['candidates.source']),
  c('rejectionReason', 'Rejection reason', 'lists', ['candidates.rejectionReason']),
  c('caseCategory', 'Case category', 'lists', ['cases.category']),
  c('caseStatus', 'Case status', 'lists', ['cases.status']),
  c('caseChannel', 'Case channel', 'lists', ['cases.channel']),
  c('casePriority', 'Case priority', 'lists', ['cases.priority']),
  c('caseTier', 'Case tier', 'lists', ['cases.tier']),
  c('caseTeam', 'Case team', 'lists', ['cases.team']),
  c('transactionType', 'Transaction type', 'lists', ['transactions.type']),
  c('reviewCycle', 'Review cycle', 'lists', ['reviews.cycle']),
  c('potential', 'Potential', 'lists', ['reviews.potential']),
  c('criticality', 'Role criticality', 'lists', ['succession.criticality']),
  c('readiness', 'Readiness', 'lists', ['succession.readiness']),
  c('riskOfLoss', 'Risk of loss', 'lists', ['succession.incumbentRiskOfLoss']),
  c('learningCategory', 'Learning category', 'lists', ['learning.category']),
  c('course', 'Course', 'lists', ['learning.course']),
  c('currency', 'Currency', 'lists', ['comp.currency']),
]

const BY_REF = new Map<string, CategoryDef>()
for (const cat of CATEGORIES) for (const r of cat.refs) BY_REF.set(r, cat)

/** The category a field belongs to, or undefined when it is not categorical. */
export const categoryOf = (ref: string): CategoryDef | undefined => BY_REF.get(ref)

export const categoryById = (id: string): CategoryDef | undefined => CATEGORIES.find((x) => x.id === id)

/** Every categorical field reference. */
export const CATEGORICAL_REFS: readonly FieldRef[] = CATEGORIES.flatMap((x) => x.refs)
