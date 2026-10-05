/**
 * The privacy promise, checked the hard way: every tool with a matrix of arguments (every view,
 * every dataset, every allowlisted group-by, the whole company and leader filters including a
 * scope smaller than the anonymity minimum, with Show pay amounts, Show immigration details and
 * engagement surveys all switched on in the session) on the sample. No serialized result may hold
 * an employee or candidate name, a person-name field value, an employee, application or candidate
 * ID, an email, a money amount, or any pay amount from the Compensation data.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import { DATASETS } from '@/data/schema'
import { VIEWS } from '@/views/registry'
import { ACTION_OWNER_ROLES } from '@/views/types'
import { groupableFields, QUERY_DATASETS } from './allowlist'
import { Conversation } from './conversation'
import { call, envOf, leaks, sampleCtx } from './testkit'
import { COMPARE_BY } from './tools/summary'

/** Field keys whose values are pay amounts: never a key of any result object. */
const PAY_KEYS = DATASETS.flatMap((d) =>
  d.fields.filter((f) => f.pay || f.type === 'money').map((f) => f.key),
)

interface Scope {
  name: string
  ctx: AnalyticsContext
}

let scopes: Scope[] = []
let calls = 0
const problems: string[] = []

function check(conv: Conversation, scope: Scope, name: string, input: unknown): Record<string, unknown> {
  const r = call(conv, envOf(scope.ctx), name, input)
  calls++
  const l = leaks(r.content)
  if (l.length) problems.push(`${scope.name} ${name} ${JSON.stringify(input)}: ${l.slice(0, 3).join(', ')}`)
  for (const k of PAY_KEYS)
    if (r.content.includes(`"${k}":`))
      problems.push(`${scope.name} ${name} ${JSON.stringify(input)}: pay key ${k}`)
  return r.json
}

beforeAll(() => {
  const company = sampleCtx({ showPay: true, showImmigration: true, engagement: true })
  const leaders = leaderOptions(company.org, company.asOf)
  const mid = leaders.find((l) => l.size >= 40 && l.size <= 150) ?? leaders[3]
  const small = leaders.find((l) => l.size < 5) ?? leaders[leaders.length - 1]
  scopes = [
    { name: 'company', ctx: company },
    {
      name: 'leader',
      ctx: sampleCtx({
        showPay: true,
        showImmigration: true,
        engagement: true,
        filters: { leaderId: mid?.id ?? null },
      }),
    },
    {
      name: 'small leader',
      ctx: sampleCtx({
        showPay: true,
        showImmigration: true,
        engagement: true,
        filters: { leaderId: small?.id ?? null },
      }),
    },
  ]
}, 60_000)

describe('the privacy matrix', () => {
  it('holds for every tool, view, dataset and group-by in every scope', () => {
    const t0 = performance.now()
    for (const scope of scopes) {
      const conv = new Conversation()
      const ctx = check(conv, scope, 'get_context', {})
      const views = (ctx.views as { view: string; has_key_figures: boolean }[]).filter((v) => v.view !== 'ai')
      const leaderTokens = (ctx.vocabularies as { leaders: { leader: string }[] }).leaders.map(
        (l) => l.leader,
      )

      check(conv, scope, 'find_metrics', {})
      check(conv, scope, 'find_metrics', { query: 'salary pay compa-ratio merit' })
      for (const v of views) check(conv, scope, 'find_metrics', { view: v.view })

      for (const v of views) {
        const s = check(conv, scope, 'view_summary', { view: v.view })
        check(conv, scope, 'view_summary', { view: v.view, filters: { leader: leaderTokens[2] } })
        const figs = (s.key_figures as { id?: string }[] | undefined) ?? []
        const kpi = figs[0]?.id
        if (!kpi || v.view === 'scorecard' || v.view === 'org') continue
        for (const by of v.view === 'hrbp' || v.view === 'comp'
          ? COMPARE_BY
          : (['leader', 'location'] as const))
          check(conv, scope, 'compare_groups', { view: v.view, kpi, by })
      }

      for (const d of QUERY_DATASETS) {
        const people = d.person ? [{ op: 'distinct_people' }] : []
        const numbers = d.fields.filter((f) => f.kind === 'number')
        const groupable = groupableFields(d)
        check(conv, scope, 'query_records', { dataset: d.key, measures: [{ op: 'count' }, ...people] })
        for (const f of numbers)
          check(conv, scope, 'query_records', {
            dataset: d.key,
            measures: [
              { op: 'mean', field: f.name },
              { op: 'median', field: f.name },
            ],
          })
        for (const g of groupable) {
          const measures = g.countsOnly
            ? [{ op: 'count' }, ...people]
            : [
                { op: 'count' },
                ...people,
                ...numbers
                  .filter((f) => !f.countsOnly)
                  .slice(0, 2)
                  .map((f) => ({ op: 'mean', field: f.name })),
              ]
          check(conv, scope, 'query_records', {
            dataset: d.key,
            group_by: [{ field: g.name, ...(g.kind === 'date' ? { by: 'quarter' } : {}) }],
            measures: numbers.some((f) => f.countsOnly) ? [{ op: 'count' }] : measures,
            limit: 50,
          })
        }
        // Two-field cuts with a person and a date.
        const person = groupable.find((g) => g.kind === 'person')
        const date = groupable.find((g) => g.kind === 'date')
        if (person && date)
          check(conv, scope, 'query_records', {
            dataset: d.key,
            group_by: [{ field: person.name }, { field: date.name, by: 'year' }],
            limit: 50,
          })
      }
      // Comp, survey, case and right-to-work data, with the filters that narrow groups most.
      check(conv, scope, 'query_records', {
        dataset: 'comp',
        group_by: ['org.manager'],
        measures: [
          { op: 'median', field: 'compaRatio' },
          { op: 'mean', field: 'meritPct' },
        ],
        limit: 50,
      })
      check(conv, scope, 'query_records', {
        dataset: 'surveyResponses',
        where: [{ field: 'survey', op: 'in', value: ['Exit survey', 'Engagement', 'Manager feedback'] }],
        group_by: ['org.manager', 'reason'],
        measures: [{ op: 'mean', field: 'score' }],
        limit: 50,
      })
      check(conv, scope, 'query_records', {
        dataset: 'cases',
        where: [{ field: 'category', op: 'eq', value: 'Employee relations' }],
        group_by: ['org.department', 'assignee'],
        measures: [{ op: 'median', field: 'resolutionHours' }],
      })
      check(conv, scope, 'query_records', {
        dataset: 'rightToWork',
        where: [{ field: 'expiryDate', op: 'not_null' }],
        group_by: ['authorizationType', 'org.location'],
        limit: 50,
      })
      check(conv, scope, 'query_records', {
        dataset: 'reviews',
        where: [{ field: 'rating', op: 'lte', value: 2 }],
        group_by: ['org.manager'],
        measures: [{ op: 'mean', field: 'rating' }],
        limit: 50,
      })

      check(conv, scope, 'explain_quality', {})
      for (const d of DATASETS) {
        check(conv, scope, 'explain_quality', { dataset: d.key })
        for (const f of d.fields) check(conv, scope, 'explain_quality', { dataset: d.key, field: f.key })
      }

      check(conv, scope, 'open_items', {})
      check(conv, scope, 'open_items', { overdue_only: true })
      for (const g of ACTION_OWNER_ROLES) check(conv, scope, 'open_items', { owner_group: g })
    }
    const ms = performance.now() - t0
    console.info(`Privacy matrix: ${calls} tool calls in ${Math.round(ms)} ms`)
    expect(calls).toBeGreaterThan(500)
    expect(problems.slice(0, 10)).toEqual([])
  }, 240_000)

  it('withholds counts in a scope smaller than the anonymity minimum where the app does', () => {
    const small = scopes[2] as Scope
    const conv = new Conversation()
    const r = call(conv, envOf(small.ctx), 'query_records', { dataset: 'cases', group_by: ['category'] })
    const cats = (r.json.rows as { group: { category: string } }[]).map((x) => x.group.category)
    expect(cats).not.toContain('Employee relations')
    expect((r.json.notes as string[]).join(' ')).toMatch(/fewer people than the anonymity minimum/)
  })

  it('would catch a leak: the check is not vacuous', () => {
    const ctx = (scopes[0] as Scope).ctx
    const raw = JSON.stringify(VIEWS.find((v) => v.key === 'hrbp')?.summary?.(ctx).findings)
    expect(leaks(raw).some((l) => l.startsWith('name '))).toBe(true)
    expect(leaks(JSON.stringify(ctx.all.comp.slice(0, 3))).some((l) => l.startsWith('pay '))).toBe(true)
    expect(leaks(JSON.stringify(ctx.all.candidates.slice(0, 1))).some((l) => l.startsWith('id '))).toBe(true)
  })
})
