/**
 * The nineteen official lists: what each holds, the fields it checks, its parent list and the
 * attributes its values carry (docs/SETTINGS-LISTS.md, the list table).
 */
import type { FieldRef } from '../quality/fieldRef'
import { CHIP_STAGES, OFFER_DECLINE_THEMES, REGIONS } from '../schema'
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

/** A job family's engineering attribute: whether Engineering by stage counts its people. */
export const YES_NO = ['Yes', 'No'] as const

/** The Job functions list's stage choices: the chip development stages, in lifecycle order. */
export const STAGE_OPTIONS: readonly string[] = CHIP_STAGES.map((s) => s.label)

const STAGES_READ = 'Engineering by stage, in People stats special analyses, reads it.'

export const LIST_DEFS: readonly ListDef[] = [
  {
    id: 'businessUnit',
    label: 'Business units',
    singular: 'Business unit',
    kind: 'org',
    refs: [
      'employees.businessUnit',
      'requisitions.businessUnit',
      'hiringPlan.businessUnit',
      'budget.businessUnit',
    ],
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
      'budget.department',
    ],
    parent: 'businessUnit',
    attrs: [{ key: 'code', label: 'Code' }],
    sheet: 'Departments',
    name: 'Departments',
    about: 'Each department sits under one business unit and owns its cost centers.',
  },
  {
    id: 'jobFamily',
    label: 'Job families',
    singular: 'Job family',
    kind: 'org',
    refs: ['employees.jobFamily'],
    attrs: [{ key: 'engineering', label: 'Engineering', options: YES_NO, readBy: STAGES_READ }],
    sheet: 'Job families',
    name: 'JobFamilies',
    about:
      'The broad groups of related jobs, such as Silicon Engineering. Each contains job functions. Engineering Yes counts every function in the family in Engineering by stage; a function in another family counts when it has a saved stage.',
  },
  {
    id: 'jobFunction',
    label: 'Job functions',
    singular: 'Job function',
    kind: 'org',
    refs: ['employees.jobFunction'],
    parent: 'jobFamily',
    attrs: [{ key: 'stage', label: 'Chip development stage', options: STAGE_OPTIONS, readBy: STAGES_READ }],
    sheet: 'Job functions',
    name: 'JobFunctions',
    about:
      'Each job function sits under one job family. Its chip development stage places it in the flow from architecture to production test.',
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
    about: 'The level ladder, L1 to E3. Census reads these exact codes.',
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
    id: 'region',
    label: 'Regions',
    singular: 'Region',
    kind: 'fixed',
    // No field holds a region: each location's region is on the Locations list.
    refs: [],
    reads: ['employees'],
    attrs: [
      {
        key: 'hrbp',
        label: 'HR business partner',
        readBy:
          'HRBP for a region mode lists the site matters of the region, and this person’s own items, as their Needs attention.',
      },
    ],
    sheet: 'Regions',
    name: 'Regions',
    about:
      "The regions that locations roll up to, each with its regional HR business partner: a name or employee ID from Employees. Each location's region is set in the Locations list; this list names who partners each region.",
  },
  {
    id: 'costCenter',
    label: 'Cost centers',
    singular: 'Cost center',
    kind: 'org',
    refs: ['employees.costCenter', 'budget.costCenter'],
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
  {
    id: 'university',
    label: 'Universities',
    singular: 'University',
    kind: 'org',
    refs: ['employees.university'],
    attrs: [],
    sheet: 'Universities',
    name: 'Universities',
    about:
      'The schools of the highest degrees in Employees. Map other spellings of a school to its name here.',
  },
  {
    id: 'degreeLevel',
    label: 'Degree levels',
    singular: 'Degree level',
    kind: 'fixed',
    refs: ['employees.degreeLevel'],
    attrs: [{ key: 'label', label: 'Label' }],
    sheet: 'Degree levels',
    name: 'DegreeLevels',
    about: 'The five degree levels Census reads, in this order.',
  },
  {
    id: 'fieldOfStudy',
    label: 'Fields of study',
    singular: 'Field of study',
    kind: 'vocab',
    refs: ['employees.fieldOfStudy'],
    attrs: [],
    sheet: 'Fields of study',
    name: 'FieldsOfStudy',
    about: 'The subjects of the highest degrees. Add the ones your people studied.',
  },
  {
    id: 'offerDeclineReason',
    label: 'Offer decline reasons',
    singular: 'Offer decline reason',
    kind: 'vocab',
    // Not a check on Rejection reason: that field also holds why candidates were turned down.
    refs: [],
    attrs: [
      {
        key: 'theme',
        label: 'Theme',
        options: OFFER_DECLINE_THEMES,
        builtInFixed: true,
        readBy: 'Offer declines, in People stats special analyses, groups declines by it.',
      },
    ],
    sheet: 'Offer decline reasons',
    name: 'OfferDeclineReasons',
    about: 'Why candidates decline offers, each in a theme such as Competition or Pay.',
  },
  {
    id: 'chipStage',
    label: 'Chip development stages',
    singular: 'Chip development stage',
    kind: 'fixed',
    refs: [],
    attrs: [
      { key: 'label', label: 'Label' },
      { key: 'phase', label: 'Phase', derived: true },
    ],
    sheet: 'Chip development stages',
    name: 'ChipStages',
    about:
      'The stages of chip development in lifecycle order, with the two that run across it. Census reads these stages in this order.',
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
