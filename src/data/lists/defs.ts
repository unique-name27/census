/**
 * The thirteen official lists: what each holds, the fields it checks, its parent list and the
 * attributes its values carry (docs/SETTINGS-LISTS.md, the list table).
 */
import type { FieldRef } from '../quality/fieldRef'
import { REGIONS } from '../schema'
import type { ListDef, ListId } from './types'

/** How a candidate source reaches you. */
export const SOURCE_TYPES = ['Inbound', 'Outbound', 'Referral', 'Agency', 'Campus', 'Internal'] as const

/** Census's own sources and how each reaches you. */
export const SOURCE_TYPE_OF: Readonly<Record<string, string>> = {
  Referral: 'Referral',
  Sourced: 'Outbound',
  'Careers site': 'Inbound',
  'Job board': 'Inbound',
  Agency: 'Agency',
  University: 'Campus',
  Internal: 'Internal',
}

export const TERMINATION_KINDS = ['Voluntary', 'Involuntary'] as const

export const LIST_DEFS: readonly ListDef[] = [
  {
    id: 'businessUnit',
    label: 'Business units',
    singular: 'Business unit',
    kind: 'org',
    refs: ['employees.businessUnit', 'requisitions.businessUnit', 'hiringPlan.businessUnit'],
    attrs: [
      { key: 'code', label: 'Code' },
      { key: 'owner', label: 'Owner' },
    ],
    sheet: 'Business units',
    name: 'BusinessUnits',
    about: 'The top of the org structure. Departments roll up to one business unit each.',
  },
  {
    id: 'department',
    label: 'Departments',
    singular: 'Department',
    kind: 'org',
    refs: [
      'employees.department',
      'requisitions.department',
      'jobChanges.fromDepartment',
      'jobChanges.toDepartment',
      'hiringPlan.department',
    ],
    parent: 'businessUnit',
    attrs: [{ key: 'code', label: 'Code' }],
    sheet: 'Departments',
    name: 'Departments',
    about: 'Each department sits under one business unit and owns its cost centers.',
  },
  {
    id: 'jobFunction',
    label: 'Job functions',
    singular: 'Job function',
    kind: 'org',
    refs: ['employees.jobFunction'],
    attrs: [],
    sheet: 'Job functions',
    name: 'JobFunctions',
    about: 'The broad functions above job families, such as Engineering or G&A.',
  },
  {
    id: 'jobFamily',
    label: 'Job families',
    singular: 'Job family',
    kind: 'org',
    refs: ['employees.jobFamily'],
    parent: 'jobFunction',
    attrs: [],
    sheet: 'Job families',
    name: 'JobFamilies',
    about: 'Each job family sits under one job function.',
  },
  {
    id: 'level',
    label: 'Levels',
    singular: 'Level',
    kind: 'fixed',
    refs: [
      'employees.level',
      'requisitions.level',
      'jobChanges.fromLevel',
      'jobChanges.toLevel',
      'hiringPlan.level',
    ],
    attrs: [
      { key: 'label', label: 'Label' },
      { key: 'track', label: 'Track', derived: true },
    ],
    sheet: 'Levels',
    name: 'Levels',
    about: 'The level ladder, L1 to E3. The codes are fixed; you can change the labels.',
  },
  {
    id: 'location',
    label: 'Locations',
    singular: 'Location',
    kind: 'org',
    refs: ['employees.location', 'requisitions.location', 'cases.location', 'hiringPlan.location'],
    attrs: [
      { key: 'country', label: 'Country' },
      { key: 'region', label: 'Region', options: REGIONS },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'currency', label: 'Currency' },
    ],
    sheet: 'Locations',
    name: 'Locations',
    about: 'Work sites, with the country, region, jurisdiction and pay currency of each.',
  },
  {
    id: 'costCenter',
    label: 'Cost centers',
    singular: 'Cost center',
    kind: 'org',
    refs: ['employees.costCenter'],
    parent: 'department',
    attrs: [{ key: 'name', label: 'Name' }],
    sheet: 'Cost centers',
    name: 'CostCenters',
    about: 'Cost center codes, each owned by one department.',
  },
  {
    id: 'caseCategory',
    label: 'Case categories',
    singular: 'Case category',
    kind: 'vocab',
    refs: ['cases.category'],
    attrs: [
      { key: 'process', label: 'Atlas process', builtInFixed: true },
      { key: 'team', label: 'Team', builtInFixed: true },
      { key: 'responseHours', label: 'Response target (h)', type: 'number', builtInFixed: true },
      { key: 'resolutionHours', label: 'Resolution target (h)', type: 'number', builtInFixed: true },
    ],
    sheet: 'Case categories',
    name: 'CaseCategories',
    about: 'HR case categories, each tied to the Atlas process, team and service targets that govern it.',
  },
  {
    id: 'source',
    label: 'Candidate sources',
    singular: 'Candidate source',
    kind: 'vocab',
    refs: ['candidates.source'],
    attrs: [{ key: 'sourceType', label: 'Source type', options: SOURCE_TYPES, builtInFixed: true }],
    sheet: 'Candidate sources',
    name: 'CandidateSources',
    about: 'Where candidates come from, and how each source reaches you.',
  },
  {
    id: 'terminationReason',
    label: 'Termination reasons',
    singular: 'Termination reason',
    kind: 'vocab',
    refs: ['employees.terminationReason'],
    attrs: [{ key: 'type', label: 'Type', options: TERMINATION_KINDS, builtInFixed: true }],
    sheet: 'Termination reasons',
    name: 'TerminationReasons',
    about: 'The 12 voluntary exit reasons plus Other, and the involuntary reasons.',
  },
  {
    id: 'leaveReason',
    label: 'Leave reasons',
    singular: 'Leave reason',
    kind: 'fixed',
    refs: ['transactions.leaveReason'],
    attrs: [],
    sheet: 'Leave reasons',
    name: 'LeaveReasons',
    about: 'The Atlas leave categories. Census reads these exact values.',
  },
  {
    id: 'learningCategory',
    label: 'Learning categories',
    singular: 'Learning category',
    kind: 'vocab',
    refs: ['learning.category'],
    attrs: [],
    sheet: 'Learning categories',
    name: 'LearningCategories',
    about: 'The categories courses are grouped by.',
  },
  {
    id: 'surveyProgram',
    label: 'Survey programs',
    singular: 'Survey program',
    kind: 'fixed',
    refs: ['surveyResponses.survey', 'surveyItems.survey'],
    attrs: [{ key: 'when', label: 'When it is sent', builtInFixed: true }],
    sheet: 'Survey programs',
    name: 'SurveyPrograms',
    about: 'The survey programs Listening reads. Census reads these exact values.',
  },
]

export const LIST_IDS: readonly ListId[] = LIST_DEFS.map((d) => d.id)

const BY_ID = new Map(LIST_DEFS.map((d) => [d.id, d]))
const BY_REF = new Map<string, ListDef>()
for (const d of LIST_DEFS) for (const r of d.refs) BY_REF.set(r, d)

export const listDef = (id: ListId): ListDef => BY_ID.get(id) as ListDef

export const isListId = (v: unknown): v is ListId => typeof v === 'string' && BY_ID.has(v as ListId)

/** The list a field is checked against, or undefined. */
export const listOfRef = (ref: string): ListDef | undefined => BY_REF.get(ref)

/** Lists one level down: departments under business units, cost centers under departments. */
export const childLists = (id: ListId): ListDef[] => LIST_DEFS.filter((d) => d.parent === id)

/** Values can be added, renamed and moved (your own lists) or only added (Census's vocabularies). */
export const canAdd = (def: ListDef): boolean => def.kind !== 'fixed'

/**
 * Spellings that differ only in case or spacing ("Design Verification", "design verification",
 * "Design  Verification") are one value of a list: a list holds one of them, exactly as spelled.
 */
export const listKey = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Every field any list reads. */
export const LIST_REFS: readonly FieldRef[] = LIST_DEFS.flatMap((d) => d.refs)
