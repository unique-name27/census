/**
 * The privacy matrix on an upload with the mistakes real HR extracts have: a "Manager" column
 * mapped to Cost center (every manager's name in a category column), free text with names and
 * health details in reason, subcategory and course columns, and people's names typed into the Data
 * room as certifier, confirmer and remapper. Every tool runs on it, in the whole company and in a
 * one-person scope, and no serialized result may hold a name (however it is spelled), an ID, a pay
 * amount or any of the free text.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { sampleVersion } from '@/data/quality/seed'
import type { DatasetVersion } from '@/data/quality/types'
import type { ReferenceMapping } from '@/data/reference/types'
import { DATASET_KEYS, DATASETS, type DatasetKey, type Datasets } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { VIEWS } from '@/views/registry'
import { groupableFields, QUERY_DATASETS } from './allowlist'
import { Conversation } from './conversation'
import { call, envOf, leaks, type Secrets, sampleCtx, sampleData, secretsOf } from './testkit'

const OUTSIDERS = ['Dana Whitfield', 'Sam', 'Robin Okafor']

let ctx: AnalyticsContext
let secrets: Secrets
const problems: string[] = []

function check(conv: Conversation, c: AnalyticsContext, name: string, input: unknown) {
  const r = call(conv, envOf(c), name, input)
  const l = leaks(r.content, secrets)
  if (l.length) problems.push(`${name} ${JSON.stringify(input)}: ${l.slice(0, 3).join(', ')}`)
  return r
}

beforeAll(() => {
  const base = sampleData()
  const byId = new Map(base.employees.map((e) => [e.employeeId, e]))
  const names = base.employees.map((e) => e.name).filter(Boolean)
  const leavers = base.employees.filter((e) => e.terminationDate)
  const texts = [
    `${names[10]} left to care for her mother after a cancer diagnosis`,
    `Moved to Google with ${names[11]} from the same team`,
    'Pregnancy; did not return from leave',
    `Manager ${names[12]} was dismissive after my surgery`,
    'Candidate disclosed a pregnancy at the onsite',
    `Medical leave for chemotherapy, ${names[13]}`,
    `Coaching plan for ${names[14]} after the written warning`,
  ]
  const free = new Map(leavers.slice(0, 3).map((e, i) => [e.employeeId, texts[i] as string]))
  const data: Datasets = {
    ...base,
    // A "Manager" column mapped to Cost center: every manager's name in a category column.
    employees: base.employees.map((e) => ({
      ...e,
      costCenter: (e.managerId && byId.get(e.managerId)?.name) || e.costCenter,
      ...(free.has(e.employeeId) ? { terminationReason: free.get(e.employeeId) as string } : {}),
    })),
    surveyResponses: base.surveyResponses.map((r, i) =>
      r.survey === 'Exit survey' && i % 97 === 0 ? { ...r, reason: texts[3] as string } : r,
    ),
    candidates: base.candidates.map((c, i) => (i === 7 ? { ...c, rejectionReason: texts[4] as string } : c)),
    cases: base.cases.map((c, i) =>
      i === 3 && c.category !== 'Employee relations' ? { ...c, subcategory: texts[5] as string } : c,
    ),
    learning: base.learning.map((l, i) => (i === 5 ? { ...l, course: texts[6] as string } : l)),
  }
  const versions: Partial<Record<DatasetKey, DatasetVersion>> = {}
  for (const k of DATASET_KEYS)
    versions[k] = sampleVersion(
      k,
      data,
      k === 'employees'
        ? { certification: { by: 'Dana Whitfield, People analytics', at: '2026-09-30T10:00' } }
        : k === 'requisitions'
          ? { mappingConfirmed: { by: 'Sam (HR)', at: '2026-09-30T10:00' } }
          : k === 'cases'
            ? { mappingConfirmed: { by: 'Sam', at: '2026-09-30T10:00' } }
            : null,
      '2026-09-30',
    )
  const bu = base.employees[5]?.businessUnit as string
  const mappings: ReferenceMapping[] = [
    {
      id: 'm1',
      kind: 'rename',
      ref: 'employees.businessUnit',
      from: [bu],
      to: `${bu} group`,
      scope: 'category',
      by: 'Robin Okafor',
      at: '2026-09-30T11:00',
    },
  ]
  ctx = sampleCtx({ data, versions, mappings, showPay: true, showImmigration: true, engagement: true })
  secrets = secretsOf(ctx.all, { names: OUTSIDERS, texts })
}, 60_000)

describe('the privacy matrix on an upload with mistakes', () => {
  it('sends no name, ID, pay amount or free text from any tool', () => {
    const conv = new Conversation()
    check(conv, ctx, 'get_context', {})
    for (const v of VIEWS.filter((x) => x.datasets.length)) {
      const s = check(conv, ctx, 'view_summary', { view: v.key })
      const kpi = (s.json.key_figures as { id?: string }[] | undefined)?.[0]?.id
      if (kpi && v.key !== 'scorecard' && v.key !== 'org')
        for (const by of ['department', 'leader'])
          check(conv, ctx, 'compare_groups', { view: v.key, kpi, by })
    }
    for (const d of QUERY_DATASETS) {
      for (const g of groupableFields(d))
        check(conv, ctx, 'query_records', {
          dataset: d.key,
          group_by: [{ field: g.name, ...(g.kind === 'date' ? { by: 'year' } : {}) }],
          limit: 50,
        })
    }
    check(conv, ctx, 'explain_quality', {})
    for (const d of DATASETS) {
      check(conv, ctx, 'explain_quality', { dataset: d.key })
      for (const f of d.fields) check(conv, ctx, 'explain_quality', { dataset: d.key, field: f.key })
    }
    check(conv, ctx, 'open_items', {})
    expect(problems.slice(0, 10)).toEqual([])
  }, 240_000)

  it('still names the Data room attributions, as tokens', () => {
    const conv = new Conversation()
    const e = call(conv, envOf(ctx), 'explain_quality', { dataset: 'employees' })
    expect(e.content).toMatch(/by \{\{P\d+\}\}/)
    const r = call(conv, envOf(ctx), 'explain_quality', { dataset: 'requisitions' })
    expect(r.content).toMatch(/by \{\{P\d+\}\}/)
    const b = call(conv, envOf(ctx), 'explain_quality', { dataset: 'employees', field: 'businessUnit' })
    expect(leaks(b.content, secrets)).toEqual([])
  })

  it('answers nothing about a one-person scope, in any dataset', () => {
    const sizes = new Map<string, number>()
    for (const e of ctx.all.employees) {
      const k = JSON.stringify([e.department, e.location, e.level])
      sizes.set(k, (sizes.get(k) ?? 0) + 1)
    }
    const one = [...sizes].find(([, n]) => n === 1)?.[0]
    expect(one).toBeDefined()
    const [department, location, level] = JSON.parse(one as string) as string[]
    const filters = { department: [department], location: [location], level: [level] }
    const conv = new Conversation()
    for (const d of QUERY_DATASETS) {
      const r = check(conv, ctx, 'query_records', {
        dataset: d.key,
        filters,
        group_by: groupableFields(d)
          .slice(0, 1)
          .map((f) => f.name),
      })
      if (d.person && d.key !== 'candidates') expect(r.isError, d.key).toBe(true)
    }
    // The leader route: an individual contributor is not a leader.
    const ic = ctx.all.employees.find(
      (e) => isEmployee(e) && isActiveAt(e, ctx.asOf) && !ctx.org.children.get(e.employeeId)?.length,
    )
    conv.tokens.index(ctx)
    const token = conv.tokens.forEmployee(ic?.employeeId as string)
    for (const d of QUERY_DATASETS) {
      const r = check(conv, ctx, 'query_records', { dataset: d.key, filters: { leader: token } })
      expect(r.isError, d.key).toBe(true)
    }
    expect(problems).toEqual([])
  })

  it('tokenizes a question however the names in it are typed', () => {
    const conv = new Conversation()
    const people = ctx.all.employees.filter((e) => /^[A-Za-z]+ [A-Za-z]+$/.test(e.name)).slice(0, 25)
    const variants = (n: string): string[] => {
      const [first, last] = n.split(' ') as [string, string]
      return [
        n,
        n.toUpperCase(),
        n.toLowerCase(),
        `${first}  ${last}`,
        `${last}, ${first}`,
        `${last},${first}`,
        `${last} ${first}`,
        `${n}’s team`,
      ]
    }
    for (const p of people)
      for (const v of variants(p.name)) {
        const sent = conv.tokenize(`How is ${v} doing, and who reports to ${v}?`, ctx)
        expect(leaks(sent, secrets), v).toEqual([])
      }
    // The cost center column holds managers' names: those are tokenized too.
    const mgr = ctx.all.employees.find((e) => e.costCenter && ctx.org.byId.has(e.managerId ?? ''))
    expect(conv.tokenize(`Cost center ${mgr?.costCenter}`, ctx)).toMatch(/^Cost center \{\{P\d+\}\}$/)
  })
})
