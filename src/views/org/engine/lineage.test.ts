/**
 * Lineage for the Org chart: every field a key figure or figure declares is in the schema, every
 * tile on the sample declares at least one, the lists follow what the numbers really read (the
 * filters, the reporting lines, Job changes only when the flags use them), and chart layers below
 * the data standard are held back with a reason instead of hiding the chart.
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { type DataStandard, type FieldRef, invalidRefs } from '@/data/quality'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { COLOR_BY_OPTIONS } from './colorBy'
import { orgKeyFigures } from './figures'
import { AS_OF, ctxFor, sampleCtx, smallCompany } from './fixtures'
import { orgKpis } from './kpis'
import {
  ACTIVE_USES,
  COLOR_USES,
  chartUses,
  filterUses,
  flagTableUses,
  heldBackNotes,
  keyFigureUses,
  MANAGING_SINCE_USES,
  OPEN_ROLE_USES,
  type OrgLineage,
  REPORTING_USES,
  REQ_CARD_USES,
  refs,
  SCENARIO_USES,
  sandboxUses,
  usableColor,
} from './lineage'
import { buildOrgModel, orgLineage } from './model'

const NO_DIMS = { businessUnit: [], department: [], location: [], level: [] }
const SOME_DIMS = {
  businessUnit: ['Silicon Engineering'],
  department: [],
  location: ['Hsinchu'],
  level: ['L3'],
}

/** Every combination the view can be in. */
function* lineages(): Generator<OrgLineage> {
  for (const subOrg of [false, true])
    for (const jobChanges of [false, true])
      for (const filters of [NO_DIMS, SOME_DIMS]) yield { subOrg, jobChanges, filters }
}

function kpisFor(ctx: ReturnType<typeof sampleCtx>, rootOverride?: string, openRoles = true) {
  const m = buildOrgModel(ctx)
  const rootId = rootOverride ?? m.rootId
  const key = orgKeyFigures(m, rootId, m.dims ? m.matches : null)
  return orgKpis({
    tree: m.tree,
    rootId,
    key,
    scope: { label: 'Whole company', asOf: ctx.asOf, filtered: m.dims },
    flags: m.flags,
    reqRecords: m.reqRecords,
    lineage: orgLineage(m, rootId, ctx.filters),
    dims: m.dims,
    openRoles,
  })
}

const sources = Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 }])) as Record<
  DatasetKey,
  SourceMeta
>
let sample: Datasets | null = null
/** The sample at a data standard. Without version records every dataset is bronze. */
function sampleAt(standard: DataStandard, filters: Partial<Filters> = {}) {
  sample ??= generateSample()
  return buildContext({
    data: sample,
    sources,
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
    standard,
  })
}

describe('org lineage: every field is in the schema', () => {
  it('lists only schema fields in the constants', () => {
    const all: FieldRef[] = [
      ...ACTIVE_USES,
      ...REPORTING_USES,
      ...MANAGING_SINCE_USES,
      ...OPEN_ROLE_USES,
      ...REQ_CARD_USES,
      ...SCENARIO_USES,
      ...Object.values(COLOR_USES).flat(),
      ...filterUses(SOME_DIMS),
    ]
    expect(invalidRefs(all)).toEqual([])
  })

  it('builds valid, non-empty, duplicate-free lists for every key figure and figure', () => {
    for (const l of lineages()) {
      const lists: FieldRef[][] = [
        ...Object.values(keyFigureUses(l)),
        flagTableUses(l),
        [...SCENARIO_USES],
        ...COLOR_BY_OPTIONS.flatMap((colorBy) => [
          chartUses({ ...l, colorBy, reqCards: false }),
          chartUses({ ...l, colorBy, reqCards: true }),
          sandboxUses({ ...l, colorBy }),
        ]),
      ]
      for (const list of lists) {
        expect(list.length).toBeGreaterThan(0)
        expect(invalidRefs(list)).toEqual([])
        expect(new Set(list).size).toBe(list.length)
      }
    }
  })
})

describe('org lineage on the sample company', () => {
  it('gives every key figure tile at least one valid field, in every scope', () => {
    const ctxs = [
      sampleCtx(),
      sampleCtx({ leaderId: 'E10002' }),
      sampleCtx({ businessUnit: ['Silicon Engineering'], level: ['L3', 'L4'] }),
    ]
    for (const ctx of ctxs) {
      const kpis = kpisFor(ctx)
      expect(kpis.map((k) => k.id)).toEqual([
        'org-people',
        'org-managers',
        'org-span',
        'org-layers',
        'org-open-roles',
        'org-flags',
      ])
      for (const k of kpis) {
        expect(k.uses?.length, k.id).toBeGreaterThan(0)
        expect(invalidRefs(k.uses ?? []), k.id).toEqual([])
        expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
      }
    }
  })

  it('shows the open roles tile only with the Open roles overlay on (off by default)', () => {
    const off = kpisFor(sampleCtx(), undefined, false).map((k) => k.id)
    expect(off).not.toContain('org-open-roles')
    expect(off).toEqual(['org-people', 'org-managers', 'org-span', 'org-layers', 'org-flags'])
  })

  it('opens each tile drill with the tile fields, so the panel shows its tier', () => {
    for (const k of kpisFor(sampleCtx())) {
      const spec = resolveDrill(k.drill)
      if (spec) expect(spec.uses, k.id).toEqual(k.uses)
    }
  })

  it('names the fields each number really reads', () => {
    const [people, managers, , , openRoles, flagged] = kpisFor(sampleCtx())
    // At the top of the chart everyone active counts, whatever their manager ID says.
    expect(people.uses).toEqual(['employees.employeeId', 'employees.hireDate', 'employees.terminationDate'])
    expect(managers.uses).toContain('employees.managerId')
    expect(openRoles.uses).toEqual(expect.arrayContaining([...OPEN_ROLE_USES]))
    // The sample has Job changes and every dataset is bronze, which the default standard shows.
    expect(flagged.uses).toEqual(expect.arrayContaining([...MANAGING_SINCE_USES]))
    expect(flagged.definition).toContain('Job changes')
  })

  it('adds the manager ID under a leader and the filter fields when filters count only matches', () => {
    const [underLeader] = kpisFor(sampleCtx({ leaderId: 'E10002' }))
    expect(underLeader.uses).toContain('employees.managerId')
    const [matching, , , , , flagged] = kpisFor(
      sampleCtx({ businessUnit: ['Silicon Engineering'], level: ['L3'] }),
    )
    expect(matching.label).toBe('People matching')
    expect(matching.uses).toEqual(expect.arrayContaining(['employees.businessUnit', 'employees.level']))
    expect(matching.uses).not.toContain('employees.location')
    expect(flagged.uses).toEqual(expect.arrayContaining(['employees.businessUnit', 'employees.level']))
  })

  it('lists the color field, open-role cards and filters on the chart only when they are drawn', () => {
    const l: OrgLineage = { subOrg: false, jobChanges: true, filters: NO_DIMS }
    expect(chartUses({ ...l, colorBy: 'jobFunction', reqCards: false })).toContain('employees.jobFunction')
    expect(chartUses({ ...l, colorBy: 'tenure', reqCards: false })).not.toContain('employees.jobFunction')
    expect(chartUses({ ...l, colorBy: 'none', reqCards: false })).toEqual(
      refs(REPORTING_USES, MANAGING_SINCE_USES),
    )
    expect(chartUses({ ...l, colorBy: 'none', reqCards: true })).toEqual(
      expect.arrayContaining([...REQ_CARD_USES]),
    )
    expect(sandboxUses({ ...l, colorBy: 'level' }).some((r) => r.startsWith('requisitions.'))).toBe(false)
    expect(flagTableUses({ ...l, jobChanges: false })).toEqual([...REPORTING_USES])
  })
})

describe('chart layers held to the data standard', () => {
  it('lets every loaded layer through at the default standard', () => {
    const m = buildOrgModel(sampleAt('bronze'))
    expect(m.gates.jobChanges).toMatchObject({ ok: true, loaded: true, reason: null })
    expect(m.gates.reqCards.ok).toBe(true)
    expect(m.flagJobChanges.length).toBeGreaterThan(0)
    for (const c of COLOR_BY_OPTIONS) expect(m.gates.color[c].ok, c).toBe(true)
  })

  it('switches off a color key whose field is blank in every row', () => {
    // The hand-built roster has no job function.
    const m = buildOrgModel(ctxFor({ employees: smallCompany() }))
    expect(m.gates.color.jobFunction).toEqual({ ok: false, noData: true, reason: 'Job function has no data' })
    expect(m.gates.color.department.ok).toBe(true)
  })

  it('holds back open roles and Job changes below the standard, with a reason', () => {
    // No dataset is certified in the test context, so Production lets nothing through.
    const ctx = sampleAt('gold')
    const m = buildOrgModel(ctx)
    expect(m.gates.reqCards).toEqual({
      ok: false,
      noData: false,
      reason: 'Requisitions data is not yet confirmed for production',
    })
    expect(m.gates.jobChanges.ok).toBe(false)
    expect(m.gates.jobChanges.reason).toBe('Job changes data is not yet confirmed for production')
    expect(m.flagJobChanges).toEqual([])
    expect(buildOrgModel(sampleAt('silver')).gates.reqCards.reason).toBe(
      'Requisitions data is not yet validated',
    )

    // Flags fall back to the hire date, and the tile stops naming Job changes.
    const flagged = kpisFor(ctx).find((k) => k.id === 'org-flags')!
    expect(flagged.uses?.some((r) => r.startsWith('jobChanges.'))).toBe(false)
    expect(flagged.definition).toContain('hire date here')
    const all = buildOrgModel(sampleAt('bronze'))
    const newMgr = (mm: typeof m) =>
      [...mm.flags.values()].flat().filter((f) => f.kind === 'new-manager-large-team').length
    expect(newMgr(m)).toBeLessThanOrEqual(newMgr(all))
  })

  it('does not note Job changes that are not loaded, and keeps the roster flags', () => {
    const m = buildOrgModel(ctxFor({ employees: smallCompany() }))
    expect(m.gates.jobChanges).toEqual({ ok: false, noData: true, reason: null, loaded: false })
    expect(m.gates.reqCards.ok).toBe(true)
    expect(m.tree.asOf).toBe(AS_OF)
    expect([...m.flags.values()].flat().some((f) => f.kind === 'single-report-chain')).toBe(true)
    expect(orgLineage(m, m.rootId, DEFAULT_FILTERS)).toEqual({
      subOrg: false,
      filters: DEFAULT_FILTERS,
      jobChanges: false,
    })
  })

  it('says which layers it held back, only for layers the reader asked for', () => {
    const gold = buildOrgModel(sampleAt('gold')).gates
    expect(usableColor(gold, 'department')).toBe('none')
    expect(heldBackNotes(gold, { colorBy: 'department', openRoles: true, flags: true })).toEqual([
      'Color is off: Department is not yet confirmed for production.',
      'Open roles are not drawn: Requisitions data is not yet confirmed for production.',
      'New-manager flags use hire dates: Job changes data is not yet confirmed for production.',
    ])
    expect(heldBackNotes(gold, { colorBy: 'none', openRoles: false, flags: false })).toEqual([])
    const all = buildOrgModel(sampleAt('bronze')).gates
    expect(usableColor(all, 'jobFunction')).toBe('jobFunction')
    expect(heldBackNotes(all, { colorBy: 'jobFunction', openRoles: true, flags: true })).toEqual([])
  })
})
