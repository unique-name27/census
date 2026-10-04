/**
 * Lineage for the Org chart: the dataset fields each key figure and figure is computed from, so the
 * quality layer can give it a tier (docs/DATA-TIERS.md).
 *
 * Listed: fields that decide who counts (active on the as-of date, inside the org, matching the
 * filters), the reporting lines, what the flags read, the field the cards are colored by, and the
 * open requisitions drawn under their hiring manager. Not listed: labels that only describe a person
 * on a card or a row (name, job title, the department and location under a name), because no number
 * depends on them.
 *
 * Chart layers that would pull a figure below the data standard are held back instead of hiding the
 * whole chart: open-role cards are not drawn, new-manager flags fall back to the hire date (their
 * documented rule without Job changes), and a color key without data is switched off. `layerGates`
 * decides this and says why.
 */
import type { AnalyticsContext } from '@/data/context'
import {
  BELOW_STANDARD_TEXT,
  type DataStandard,
  type FieldRef,
  type KnownFieldRef,
  meetsStandard,
  type QualityIndex,
  type Tier,
} from '@/data/quality'
import type { DatasetKey } from '@/data/schema'
import type { Filters } from '@/data/scope'
import { COLOR_BY_LABELS, COLOR_BY_OPTIONS, type ColorBy } from './colorBy'

/** Who is on the chart: everyone active on the as-of date, one card per employee ID. */
export const ACTIVE_USES = [
  'employees.employeeId',
  'employees.hireDate',
  'employees.terminationDate',
] as const satisfies readonly KnownFieldRef[]

/** Reporting lines on top of that: spans, layers and the org under a leader. */
export const REPORTING_USES = [
  ...ACTIVE_USES,
  'employees.managerId',
] as const satisfies readonly KnownFieldRef[]

/** "Managing since" for new-manager flags: the move from an individual contributor to a manager level. */
export const MANAGING_SINCE_USES = [
  'jobChanges.employeeId',
  'jobChanges.effectiveDate',
  'jobChanges.fromLevel',
  'jobChanges.toLevel',
] as const satisfies readonly KnownFieldRef[]

/** Open requisitions counted under their hiring manager. */
export const OPEN_ROLE_USES = [
  'requisitions.reqId',
  'requisitions.status',
  'requisitions.hiringManagerId',
  'requisitions.openedDate',
] as const satisfies readonly KnownFieldRef[]

/** Open-role cards on the chart also show the number of openings. */
export const REQ_CARD_USES = [
  ...OPEN_ROLE_USES,
  'requisitions.openings',
] as const satisfies readonly KnownFieldRef[]

/** The field each color key encodes (tenure is measured from the hire date). */
export const COLOR_USES: Record<ColorBy, readonly KnownFieldRef[]> = {
  department: ['employees.department'],
  businessUnit: ['employees.businessUnit'],
  jobFunction: ['employees.jobFunction'],
  location: ['employees.location'],
  level: ['employees.level'],
  tenure: ['employees.hireDate'],
  none: [],
}

type DimFilters = Pick<Filters, 'businessUnit' | 'department' | 'location' | 'level'>

const FILTER_USES: Record<keyof DimFilters, KnownFieldRef> = {
  businessUnit: 'employees.businessUnit',
  department: 'employees.department',
  location: 'employees.location',
  level: 'employees.level',
}

/** The roster fields behind the filters that are set (they decide who is counted, or dimmed). */
export function filterUses(f: DimFilters): FieldRef[] {
  return (Object.keys(FILTER_USES) as (keyof DimFilters)[])
    .filter((k) => f[k].length > 0)
    .map((k) => FILTER_USES[k])
}

/** The lists joined, each field once, in first-seen order. */
export const refs = (...lists: readonly (readonly FieldRef[])[]): FieldRef[] => [...new Set(lists.flat())]

/** What the numbers on screen depend on beyond the reporting lines. */
export interface OrgLineage {
  /** The org starts below the top of the chart (leader filter or focus): reporting lines decide who is in it. */
  subOrg: boolean
  /** The dimming filters: business unit, department, location, level. */
  filters: DimFilters
  /** New-manager flags read Job changes (otherwise the hire date). */
  jobChanges: boolean
}

/** Flags: spans and chains from the reporting lines, new hires and new managers from dates. */
export const flagUses = (jobChanges: boolean): FieldRef[] =>
  refs(REPORTING_USES, jobChanges ? MANAGING_SINCE_USES : [])

export interface KeyFigureUses {
  people: FieldRef[]
  managers: FieldRef[]
  medianSpan: FieldRef[]
  layers: FieldRef[]
  openRoles: FieldRef[]
  flagged: FieldRef[]
}

export function keyFigureUses(l: OrgLineage): KeyFigureUses {
  const dims = filterUses(l.filters)
  // At the top of the chart everyone active is in the org, whatever their manager ID says.
  const inOrg = refs(ACTIVE_USES, l.subOrg ? ['employees.managerId'] : [])
  const structure = refs(REPORTING_USES, dims)
  return {
    people: refs(inOrg, dims),
    managers: structure,
    medianSpan: structure,
    layers: structure,
    openRoles: refs(inOrg, OPEN_ROLE_USES, dims),
    flagged: refs(flagUses(l.jobChanges), dims),
  }
}

/** The org chart: reporting lines, the flags in its rows, the color key, open-role cards, the filters. */
export const chartUses = (l: OrgLineage & { colorBy: ColorBy; reqCards: boolean }): FieldRef[] =>
  refs(
    REPORTING_USES,
    flagUses(l.jobChanges),
    COLOR_USES[l.colorBy],
    l.reqCards ? REQ_CARD_USES : [],
    filterUses(l.filters),
  )

/** The flags table (span outliers, chains, new managers, placement notes). */
export const flagTableUses = (l: OrgLineage): FieldRef[] =>
  refs(flagUses(l.jobChanges), filterUses(l.filters))

/** The reorg sandbox chart: the org today with the scenario's moves, flags always on, no open roles. */
export const sandboxUses = (l: OrgLineage & { colorBy: ColorBy }): FieldRef[] =>
  chartUses({ ...l, reqCards: false })

/** The scenario's moves and span changes: who reported to whom before and after each step. */
export const SCENARIO_USES: readonly FieldRef[] = REPORTING_USES

/* ───────── layers held to the data standard ───────── */

export interface LayerGate {
  /** The layer's fields meet the data standard (or the data is not loaded at all). */
  ok: boolean
  /** A field the layer needs is blank in every row. */
  noData: boolean
  /** Why the layer is held back, as a short clause: "Requisitions data is not yet confirmed for production". */
  reason: string | null
}

const OPEN: LayerGate = { ok: true, noData: false, reason: null }

export interface LayerGates {
  /** New-manager flags can read Job changes: loaded, and meeting the standard. */
  jobChanges: LayerGate & { loaded: boolean }
  /** Open-role cards can be drawn. */
  reqCards: LayerGate
  /** Which color keys have data that meets the standard. */
  color: Record<ColorBy, LayerGate>
}

function gate(
  q: Pick<QualityIndex, 'tierOf'> | undefined,
  standard: DataStandard | undefined,
  uses: readonly FieldRef[],
  fallback: readonly DatasetKey[],
  subject: string,
): LayerGate {
  if (!q || !standard || !uses.length) return OPEN
  const tier: Tier = q.tierOf(uses, fallback)
  if (meetsStandard(tier, standard)) return OPEN
  const noData = tier === 'none'
  const why = noData ? 'has no data' : `is ${lowerFirst(BELOW_STANDARD_TEXT[standard])}`
  return { ok: false, noData, reason: `${subject} ${why}` }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Which chart layers the data standard lets through. Without a quality index everything does. */
export function layerGates(
  ctx: Pick<AnalyticsContext, 'all'> & Partial<Pick<AnalyticsContext, 'quality' | 'standard'>>,
): LayerGates {
  const { quality: q, standard } = ctx
  const loaded = ctx.all.jobChanges.length > 0
  const jc = loaded
    ? gate(q, standard, MANAGING_SINCE_USES, ['jobChanges'], 'Job changes data')
    : { ok: false, noData: true, reason: null }
  const reqCards = ctx.all.requisitions.length
    ? gate(q, standard, REQ_CARD_USES, ['requisitions'], 'Requisitions data')
    : OPEN
  const color = Object.fromEntries(
    COLOR_BY_OPTIONS.map((c) => [c, gate(q, standard, COLOR_USES[c], ['employees'], COLOR_BY_LABELS[c])]),
  ) as Record<ColorBy, LayerGate>
  return { jobChanges: { ...jc, loaded }, reqCards, color }
}

/** The color key the chart can use: the one picked, or no color when its field is held back. */
export const usableColor = (g: LayerGates, picked: ColorBy): ColorBy => (g.color[picked].ok ? picked : 'none')

/** One sentence per layer the reader asked for that is held back, for a note under the controls. */
export function heldBackNotes(
  g: LayerGates,
  asked: { colorBy: ColorBy; openRoles: boolean; flags: boolean },
): string[] {
  const color = g.color[asked.colorBy]
  return [
    color.ok ? null : `Color is off: ${color.reason}.`,
    asked.openRoles && !g.reqCards.ok ? `Open roles are not drawn: ${g.reqCards.reason}.` : null,
    asked.flags && g.jobChanges.reason ? `New-manager flags use hire dates: ${g.jobChanges.reason}.` : null,
  ].filter((t): t is string => !!t)
}
