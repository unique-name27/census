/**
 * Where lists start: Census's own vocabularies, the sample company's structure, and lists
 * proposed from your data. Pure.
 *
 * A value's parent (a department's business unit, a job function's family, a cost center's
 * department) is proposed only when most of its rows agree: over half of the rows that name a
 * parent name the same one. Otherwise it is left blank for you to set.
 */
import { isFilled } from '../quality/applicability'
import { parseFieldRef } from '../quality/fieldRef'
import { ENGINEERING_OF_FAMILY, STAGE_OF_FUNCTION } from '../sample/jobs'
import { OLD_DEPARTMENT_NAMES } from '../sample/raw/extracts/requisitions'
import { universityVariant, variantUniversityRows } from '../sample/raw/gold'
import {
  CASE_CATEGORIES,
  CHIP_STAGES,
  chipStageByKey,
  type DatasetKey,
  type Datasets,
  DEGREE_LEVELS,
  FIELDS_OF_STUDY,
  INVOLUNTARY_REASONS,
  LEARNING_CATEGORIES,
  LEAVE_REASONS,
  LEVEL_LABELS,
  LEVELS,
  levelIndex,
  levelTrack,
  OFFER_DECLINE_REASONS,
  REGIONS,
  SITES,
  SOURCES,
  SURVEY_PROGRAMS,
  siteByLocation,
  VOLUNTARY_REASONS,
} from '../schema'
import { listDef, listKey, SOURCE_TYPE_OF } from './defs'
import type { AttrValue, ListDef, ListId, ListValue } from './types'

type Row = Record<string, unknown>

const compare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
export const byValue = (a: ListValue, b: ListValue): number => compare(a.value, b.value)

/* ───────────── Census's own lists ───────────── */

/** "L4 Senior" → "Senior". */
const levelLabel = (l: (typeof LEVELS)[number]) => LEVEL_LABELS[l].replace(`${l} `, '')

/** The values of a vocabulary or fixed list as Census ships them. Empty for your own lists. */
export function censusValues(id: ListId): ListValue[] {
  const built = (value: string, attrs?: Record<string, AttrValue>): ListValue => ({
    value,
    ...(attrs ? { attrs } : {}),
    builtIn: true,
  })
  switch (id) {
    case 'level':
      return LEVELS.map((l) => built(l, { label: levelLabel(l), track: levelTrack(l) }))
    case 'caseCategory':
      return CASE_CATEGORIES.map((c) =>
        built(c.category, {
          process: c.processId,
          team: c.team,
          responseHours: c.responseHours,
          resolutionHours: c.resolutionHours,
        }),
      )
    case 'source':
      return SOURCES.map((s) => built(s, { sourceType: SOURCE_TYPE_OF[s] ?? null }))
    case 'terminationReason':
      return [
        ...VOLUNTARY_REASONS.map((r) => built(r, { type: 'Voluntary' })),
        ...INVOLUNTARY_REASONS.map((r) => built(r, { type: 'Involuntary' })),
      ]
    case 'leaveReason':
      return LEAVE_REASONS.map((r) => built(r))
    case 'learningCategory':
      return LEARNING_CATEGORIES.map((c) => built(c))
    case 'surveyProgram':
      return SURVEY_PROGRAMS.map((p) => built(p.survey, { when: p.when }))
    case 'degreeLevel':
      return DEGREE_LEVELS.map((d) => built(d, { label: d }))
    case 'fieldOfStudy':
      return FIELDS_OF_STUDY.map((f) => built(f))
    case 'offerDeclineReason':
      return OFFER_DECLINE_REASONS.map((r) => built(r.reason, { theme: r.theme }))
    case 'chipStage':
      return CHIP_STAGES.map((c) => built(c.label, { label: c.label, phase: c.phase }))
    case 'region':
      // No regional HR business partner until someone names one.
      return REGIONS.map((r) => built(r, { hrbp: null }))
    default:
      return []
  }
}

/** The values of Census's own list, for a field's static vocabulary. */
export const censusNames = (id: ListId): string[] => censusValues(id).map((v) => v.value)

/* ───────────── built from data ───────────── */

/** The field on the same row that names a value's parent, per dataset. */
const PARENT_FIELD: Partial<Record<ListId, Partial<Record<DatasetKey, string>>>> = {
  department: {
    employees: 'businessUnit',
    requisitions: 'businessUnit',
    hiringPlan: 'businessUnit',
    budget: 'businessUnit',
  },
  jobFunction: { employees: 'jobFamily' },
  costCenter: { employees: 'department', budget: 'department' },
}

class Tally {
  private readonly m = new Map<string, Map<string, number>>()
  add(key: string, value: string) {
    let c = this.m.get(key)
    if (!c) {
      c = new Map()
      this.m.set(key, c)
    }
    c.set(value, (c.get(value) ?? 0) + 1)
  }
  /** The value named most often (the first one found on a tie), or null. */
  top(key: string): string | null {
    let best: string | null = null
    let bestN = 0
    for (const [v, n] of this.m.get(key) ?? []) if (n > bestN) [best, bestN] = [v, n]
    return best
  }
  /** The value over half of the counts name, or null. */
  majority(key: string): string | null {
    const c = this.m.get(key)
    if (!c) return null
    let total = 0
    let best: string | null = null
    let bestN = 0
    for (const [v, n] of c) {
      total += n
      if (n > bestN) {
        best = v
        bestN = n
      }
    }
    return bestN * 2 > total ? best : null
  }
}

const text = (v: unknown): string | null => (isFilled(v) ? String(v).trim() : null)

/**
 * The values of one of your lists found in `data`, reading only the datasets `include` allows,
 * with the parent most rows agree on and, for locations, what the known sites say.
 *
 * Spellings that differ only in case or spacing are one value (`listKey`, the rule saved lists
 * follow too): the list holds the spelling most rows use (the first one found on a tie), and the
 * others show as values in the data that are not on the list, to map to it.
 */
export function listFromData(
  def: ListDef,
  data: Datasets,
  include: (key: DatasetKey) => boolean = () => true,
): ListValue[] {
  /** Spellings per value, with their row counts, in the order found. */
  const spellings = new Map<string, Map<string, number>>()
  const parents = new Tally()
  const countries = new Tally()
  const parentField = PARENT_FIELD[def.id] ?? {}
  for (const ref of def.refs) {
    const p = parseFieldRef(ref)
    if (!p || !include(p.dataset)) continue
    const pf = parentField[p.dataset]
    for (const r of data[p.dataset] as unknown as readonly Row[]) {
      const v = text(r[p.field])
      if (!v) continue
      const key = listKey(v)
      let s = spellings.get(key)
      if (!s) {
        s = new Map()
        spellings.set(key, s)
      }
      s.set(v, (s.get(v) ?? 0) + 1)
      if (pf) {
        const parent = text(r[pf])
        if (parent) parents.add(key, parent)
      }
      if (def.id === 'location' && p.dataset === 'employees') {
        const c = text(r.country)
        if (c) countries.add(key, c)
      }
    }
  }
  const values = [...spellings].map(([key, s]): ListValue => {
    let value = ''
    let most = 0
    for (const [v, n] of s)
      if (n > most) {
        value = v
        most = n
      }
    const out: ListValue = { value }
    if (def.parent) out.parent = parents.majority(key)
    if (def.id === 'location') out.attrs = locationAttrs(value, countries.majority(key))
    return out
  })
  return values.sort(byValue)
}

const SITE_BY_COUNTRY = new Map(SITES.map((s) => [s.country, s]))

/** A location's country, region, jurisdiction and currency: the known site, else from its country. */
export function locationAttrs(location: string, country: string | null): Record<string, AttrValue> {
  const site = siteByLocation.get(location)
  if (site)
    return {
      country: site.country,
      region: site.region,
      jurisdiction: site.jurisdiction,
      currency: site.currency,
    }
  const byCountry = country ? SITE_BY_COUNTRY.get(country) : undefined
  return {
    country,
    region: byCountry?.region ?? null,
    jurisdiction: null,
    currency: byCountry?.currency ?? null,
  }
}

/* ───────────── the sample company ───────────── */

const ownLists: ListId[] = [
  'businessUnit',
  'department',
  'jobFamily',
  'jobFunction',
  'location',
  'costCenter',
  'university',
]

/** "1110-SJC" → "1110". */
const ccNumber = (cc: string) => /^(\d+)/.exec(cc)?.[1] ?? null

/**
 * The sample company's lists, built from its clean structure: the org units, jobs, sites and cost
 * centers it has, with codes from its cost center scheme, each business unit's most senior person
 * as its owner, and the two department names the ATS used before the naming standard, retired
 * and pointing at the names that replaced them; the short forms of a few school names the HRIS
 * holds are retired the same way. Its job families say which are engineering, and
 * its job functions carry their chip development stage (all but Packaging, left for Census to
 * propose: docs/ANALYSES.md, 4.10).
 */
export function sampleListValues(clean: Datasets): Partial<Record<ListId, ListValue[]>> {
  const out: Partial<Record<ListId, ListValue[]>> = {}
  for (const id of ownLists) out[id] = listFromData(listDef(id), clean)
  const emps = clean.employees

  // Codes: a department's is the number its cost centers share; a business unit's is the
  // hundred its departments' numbers fall in.
  const deptCode = new Tally()
  const unitOwner = new Map<string, (typeof emps)[number]>()
  for (const e of emps) {
    const n = e.costCenter ? ccNumber(e.costCenter) : null
    if (n && e.department) deptCode.add(e.department, n)
    if (e.terminationDate || e.employmentType !== 'Employee' || !e.businessUnit) continue
    const cur = unitOwner.get(e.businessUnit)
    if (
      !cur ||
      levelIndex(e.level ?? '') > levelIndex(cur.level ?? '') ||
      (e.level === cur.level && e.hireDate < cur.hireDate)
    )
      unitOwner.set(e.businessUnit, e)
  }
  const departments = out.department ?? []
  for (const d of departments) d.attrs = { code: deptCode.majority(d.value) }
  const unitCode = new Tally()
  for (const d of departments) {
    const code = d.attrs?.code
    if (d.parent && typeof code === 'string' && code.length >= 2)
      unitCode.add(d.parent, `${code.slice(0, 2)}00`)
  }
  for (const u of out.businessUnit ?? [])
    u.attrs = { code: unitCode.majority(u.value), owner: unitOwner.get(u.value)?.name ?? null }

  // A cost center's name is its department and site, as the sample's scheme builds them.
  const ccName = new Tally()
  for (const e of emps) if (e.costCenter) ccName.add(e.costCenter, `${e.department}, ${e.location}`)
  for (const c of out.costCenter ?? []) c.attrs = { name: ccName.majority(c.value) }

  // Engineering families, and each engineering function's chip development stage.
  for (const f of out.jobFamily ?? []) f.attrs = { engineering: ENGINEERING_OF_FAMILY.get(f.value) ?? null }
  for (const f of out.jobFunction ?? []) {
    const stage = STAGE_OF_FUNCTION.get(f.value)
    f.attrs = { stage: stage ? (chipStageByKey.get(stage)?.label ?? null) : null }
  }

  // Old ATS names: still on closed requisitions, so retired rather than missing.
  for (const [current, old] of Object.entries(OLD_DEPARTMENT_NAMES)) {
    const now = departments.find((d) => d.value === current)
    if (!now || departments.some((d) => d.value === old)) continue
    departments.push({
      value: old,
      parent: now.parent ?? null,
      attrs: { code: now.attrs?.code ?? null },
      retired: true,
      replacedBy: current,
    })
  }
  departments.sort(byValue)

  // School names typed the short way on a few HRIS rows ("Coyote Valley Univ."): retired values
  // pointing at the school's name, so they are recognized and say what replaced them.
  const schools = out.university ?? []
  for (const i of variantUniversityRows(emps)) {
    const name = emps[i].university
    if (!name) continue
    const short = universityVariant(name)
    if (!schools.some((v) => v.value === short))
      schools.push({ value: short, retired: true, replacedBy: name })
  }
  schools.sort(byValue)

  out.region = sampleRegions(emps)
  return out
}

/** "Director, HR Business Partners", "Senior HR Business Partner". */
const HRBP_TITLE = /HR Business Partner/i

/**
 * The sample company's regional HR business partners (docs/ACTION-CENTER-AUDIT.md 5.8): in each
 * region, the most senior active HR business partner working at one of its sites; a region with
 * none takes the business unit HRBP who covers the most of its people.
 */
function sampleRegions(emps: Datasets['employees']): ListValue[] {
  const regionOf = (loc: string | null | undefined) =>
    loc ? (siteByLocation.get(loc)?.region ?? null) : null
  const active = emps.filter((e) => !e.terminationDate && e.employmentType === 'Employee')
  return REGIONS.map((region) => {
    const here = active.filter((e) => regionOf(e.location) === region)
    const partner = here
      .filter((e) => HRBP_TITLE.test(e.jobTitle ?? ''))
      .sort(
        (a, b) =>
          levelIndex(b.level ?? '') - levelIndex(a.level ?? '') || a.hireDate.localeCompare(b.hireDate),
      )[0]
    let name: string | null = partner?.name ?? null
    if (!name) {
      const covers = new Tally()
      for (const e of here) if (e.hrbp) covers.add(region, e.hrbp)
      name = covers.top(region)
    }
    return { value: region, attrs: { hrbp: name }, builtIn: true }
  })
}
