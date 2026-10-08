/**
 * The privacy matrix in every mode (docs/ROLES-V2.md 8.8 tests 5 and 8): in each of the eleven
 * modes, with its test pick and Show pay amounts, Show immigration details and engagement surveys
 * switched on, every tool the mode offers runs over the views and datasets it lists (every view's
 * summary and comparisons, every readable dataset by every field it shows, the Action center, the
 * screen line's tools). No result may hold a name, an ID, an email, a money amount, a pay amount
 * from the Compensation data or a cost total (Finance sees totals on screen; Ask never sends one),
 * or a pay field. In HRBP for a business unit and for a region, every person a result names by
 * token is in the scope, above it, or an owner of its work (an HR business partner, a recruiter, a
 * hiring manager, a case assignee, an item's owner, a successor the HRBPs see by name).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES, type Mode } from '@/access/modes'
import type { RegionScope, UnitScope } from '@/access/scopes/types'
import type { AnalyticsContext } from '@/data/context'
import { DATASETS } from '@/data/schema'
import { collectActions } from '@/views/actions/engine'
import { samplePicks } from '@/views/actions/engine/roleKit'
import { compModel } from '@/views/comp/engine/model'
import { VIEWS } from '@/views/registry'
import { groupableFields, QUERY_DATASETS, shownFields } from './allowlist'
import { Conversation } from './conversation'
import { TOKEN_RE } from './privacy'
import { call, envOf, leaks, type Secrets, sampleCtx, sampleSecrets } from './testkit'
import { toolDefinitionsFor } from './tools'

/** Field keys whose values are pay amounts: never a key of any result object. */
const PAY_KEYS = DATASETS.flatMap((d) =>
  d.fields.filter((f) => f.pay || f.type === 'money').map((f) => f.key),
)

/** The sample in a mode with every session switch on. */
const switchedOn = (mode: Mode): AnalyticsContext =>
  sampleCtx({
    access: { mode, picks: samplePicks() },
    showPay: true,
    showImmigration: true,
    engagement: true,
  })

/** Every amount of a cost model (totals, breakdowns, people, budget): numbers from 25,000 up. */
function costAmounts(ctx: AnalyticsContext): Set<number> {
  const out = new Set<number>()
  const seen = new Set<unknown>()
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null || seen.has(v)) return
    if (typeof v === 'number') {
      if (Number.isFinite(v) && Math.abs(v) >= 25_000) {
        out.add(v)
        out.add(Math.round(v))
        out.add(Math.round(v * 10_000) / 10_000)
      }
      return
    }
    if (typeof v !== 'object') return
    seen.add(v)
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1)
  }
  walk(compModel(ctx).cost, 0)
  return out
}

/** Who may appear by token in a business unit or region scope (see the file comment). */
function allowedIn(ctx: AnalyticsContext): { ids: Set<string>; names: Set<string> } {
  const s = ctx.access.scope as UnitScope | RegionScope
  const ids = new Set<string>(s.memberIds)
  const names = new Set<string>()
  // Everyone above a member (the unit's leaderIds hold them already).
  for (const id of s.memberIds) {
    let m = ctx.org.byId.get(id)?.managerId
    while (m && !ids.has(m)) {
      ids.add(m)
      m = ctx.org.byId.get(m)?.managerId
    }
    if (m) ids.add(m)
  }
  const add = (v: string | null | undefined) => {
    if (!v) return
    names.add(v)
    if (ctx.org.byId.has(v)) ids.add(v)
  }
  const d = ctx.data
  for (const e of d.employees) add(e.hrbp)
  for (const r of d.requisitions) {
    add(r.recruiter)
    add(r.hiringManager)
    add(r.hiringManagerId)
  }
  for (const c of d.candidates) {
    add(c.recruiter)
    add(c.coordinator)
  }
  for (const c of d.cases) add(c.assignee)
  for (const r of d.succession) add(r.successorId)
  for (const a of collectActions(ctx, VIEWS).items) {
    add(a.ownerId)
    add(a.ownerName)
  }
  return { ids, names }
}

interface Run {
  mode: Mode
  calls: number
  problems: string[]
  /** Person tokens checked against the scope (HRBP modes). */
  people: number
}

function runMode(mode: Mode): Run {
  const ctx = switchedOn(mode)
  const access = ctx.access
  const tools = toolDefinitionsFor(access)
  const offered = new Set(tools.map((t) => t.name))
  const enumOf = (tool: string, prop: string): string[] =>
    (
      (tools.find((t) => t.name === tool)?.input_schema.properties ?? {}) as Record<
        string,
        { enum?: string[] }
      >
    )[prop]?.enum ?? []
  const pay =
    access.pay === 'none' ? sampleSecrets().pay : new Set([...sampleSecrets().pay, ...costAmounts(ctx)])
  const secrets: Secrets = { ...sampleSecrets(), pay }
  const scoped = access.scope?.kind === 'unit' || access.scope?.kind === 'region'
  const allowed = scoped ? allowedIn(ctx) : null
  const conv = new Conversation()
  const problems: string[] = []
  let calls = 0
  let people = 0
  const check = (name: string, input: unknown) => {
    if (!offered.has(name)) return null
    const r = call(conv, envOf(ctx), name, input)
    calls++
    const where = `${mode} ${name} ${JSON.stringify(input)}`
    const l = leaks(r.content, secrets)
    if (l.length) problems.push(`${where}: ${l.slice(0, 3).join(', ')}`)
    for (const k of PAY_KEYS) if (r.content.includes(`"${k}":`)) problems.push(`${where}: pay key ${k}`)
    if (allowed)
      for (const t of r.content.match(new RegExp(TOKEN_RE.source, 'g')) ?? []) {
        const p = conv.tokens.resolve(t)
        if (!p) continue
        people++
        const ok = (p.employeeId && allowed.ids.has(p.employeeId)) || allowed.names.has(p.name)
        if (!ok) problems.push(`${where}: ${p.name} is outside the scope`)
      }
    return r.isError ? null : r.json
  }

  const context = check('get_context', {})
  if (!context) return { mode, calls, people, problems: [...problems, `${mode}: get_context failed`] }
  check('find_metrics', {})
  check('find_metrics', { query: 'salary pay compa-ratio merit cost budget' })
  for (const v of enumOf('view_summary', 'view')) {
    check('find_metrics', { view: v })
    const s = check('view_summary', { view: v })
    const kpi = ((s?.key_figures as { id?: string }[] | undefined) ?? [])[0]?.id
    if (!kpi || !enumOf('compare_groups', 'view').includes(v)) continue
    for (const by of enumOf('compare_groups', 'by')) check('compare_groups', { view: v, kpi, by })
  }
  for (const key of enumOf('query_records', 'dataset')) {
    const d = QUERY_DATASETS.find((x) => x.key === key)
    if (!d) continue
    const shown = new Set(shownFields(d, access).map((f) => f.name))
    const people = d.person ? [{ op: 'distinct_people' }] : []
    const numbers = d.fields.filter((f) => f.kind === 'number' && shown.has(f.name))
    check('query_records', { dataset: key, measures: [{ op: 'count' }, ...people] })
    for (const f of numbers)
      check('query_records', {
        dataset: key,
        measures: [
          { op: 'mean', field: f.name },
          { op: 'median', field: f.name },
        ],
      })
    for (const g of groupableFields(d).filter((f) => shown.has(f.name)))
      check('query_records', {
        dataset: key,
        group_by: [{ field: g.name, ...(g.kind === 'date' ? { by: 'quarter' } : {}) }],
        measures: g.countsOnly ? [{ op: 'count' }] : [{ op: 'count' }, ...people],
        limit: 50,
      })
  }
  check('explain_quality', {})
  check('open_items', {})
  check('open_items', { overdue_only: true })
  return { mode, calls, people, problems }
}

let runs: Run[] = []

beforeAll(() => {
  runs = MODES.map(runMode)
}, 600_000)

describe('the privacy matrix in every mode', () => {
  it('holds for every tool, view, dataset and field each mode offers, with every session switch on', () => {
    const calls = runs.reduce((t, r) => t + r.calls, 0)
    console.info(`Privacy matrix over ${runs.length} modes: ${calls} tool calls`)
    for (const r of runs) expect(r.calls, r.mode).toBeGreaterThan(20)
    // The scope check is not vacuous: the HRBP modes' results name people by token.
    for (const r of runs.filter((x) => x.mode === 'hrbp-unit' || x.mode === 'hrbp-region'))
      expect(r.people, r.mode).toBeGreaterThan(50)
    expect(runs.flatMap((r) => r.problems.slice(0, 5))).toEqual([])
  })

  it('would catch a cost total: the cost amounts are known and large', () => {
    const fin = switchedOn('finance')
    expect(fin.showCost).toBe(true)
    const amounts = costAmounts(fin)
    expect(amounts.size).toBeGreaterThan(10)
    const total = compModel(fin).cost.total.targetCashUsd as number
    expect(amounts.has(Math.round(total))).toBe(true)
    expect(
      leaks(JSON.stringify({ total: Math.round(total) }), { ...sampleSecrets(), pay: amounts }),
    ).not.toEqual([])
  })
})
