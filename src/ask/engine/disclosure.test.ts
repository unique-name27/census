/**
 * The disclosure rules the privacy review tried to break, each by the route it used: a leader
 * filter that makes the scope one person, a hidden group that still names its key, survey cuts
 * by manager through a where clause or a leader, two results subtracted to give one person's
 * value, free text in category columns, and right to work dates.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import type { Employee } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { DIFFERENCING } from './audit'
import { Conversation } from './conversation'
import { call, envOf, sampleCtx, sampleData } from './testkit'
import { OTHER } from './tools/query'
import { NOT_OFFICIAL } from './values'

type QRow = {
  group?: Record<string, unknown>
  count: number | null
  people?: number | null
  hidden?: string
  ref: string | null
} & Record<string, unknown>

let ctx: AnalyticsContext
const rowsOf = (r: { json: Record<string, unknown> }) => (r.json.rows as QRow[] | undefined) ?? []

/** Direct reports on the as-of date. */
const reportsOf = (c: AnalyticsContext, id: string): Employee[] =>
  (c.org.children.get(id) ?? []).filter((e) => isActiveAt(e, c.asOf))

beforeAll(() => {
  ctx = sampleCtx({ engagement: true })
}, 60_000)

/** A token for an employee, as Claude would get one (the conversation indexed first). */
function tokenFor(conv: Conversation, c: AnalyticsContext, id: string): string {
  conv.tokens.index(c)
  return conv.tokens.forEmployee(id)
}

describe('a leader filter is a real leader with an org at the anonymity minimum', () => {
  it('refuses an individual contributor, a leaver and a small team, in every tool', () => {
    const conv = new Conversation()
    const env = envOf(ctx)
    const ic = ctx.all.employees.find(
      (e) => isEmployee(e) && isActiveAt(e, ctx.asOf) && !ctx.org.children.get(e.employeeId)?.length,
    ) as Employee
    const leaver = ctx.all.employees.find(
      (e) => !!e.terminationDate && e.terminationDate <= ctx.asOf,
    ) as Employee
    // A manager of one or two people, none of whom manages anyone.
    const tiny = ctx.all.employees.find((e) => {
      const team = reportsOf(ctx, e.employeeId)
      return (
        isActiveAt(e, ctx.asOf) &&
        team.length >= 1 &&
        team.length <= 2 &&
        team.every((r) => !reportsOf(ctx, r.employeeId).length)
      )
    }) as Employee
    expect(tiny).toBeDefined()
    for (const who of [ic, leaver, tiny]) {
      const token = tokenFor(conv, ctx, who.employeeId)
      for (const dataset of [
        'reviews',
        'rightToWork',
        'surveyResponses',
        'transactions',
        'employees',
        'cases',
      ]) {
        const r = call(conv, env, 'query_records', { dataset, filters: { leader: token } })
        expect(r.isError, `${dataset} ${who.employeeId}`).toBe(true)
        expect(r.json.error as string).toMatch(/is not a leader/)
      }
      expect(call(conv, env, 'view_summary', { view: 'hrbp', filters: { leader: token } }).isError).toBe(true)
      const cmp = call(conv, env, 'compare_groups', { view: 'hrbp', kpi: 'x', by: 'leader', values: [token] })
      expect(cmp.isError).toBe(true)
    }
  })

  it('refuses a leader whose org is under the minimum, and get_context lists only leaders at it', () => {
    const conv = new Conversation()
    const small = leaderOptions(ctx.org, ctx.asOf).find((l) => l.size < 5)
    if (small) {
      const token = tokenFor(conv, ctx, small.id)
      const r = call(conv, envOf(ctx), 'query_records', { dataset: 'reviews', filters: { leader: token } })
      expect(r.json.error as string).toMatch(/fewer than 5 people/)
    }
    const g = call(conv, envOf(ctx), 'get_context')
    const leaders = (g.json.vocabularies as { leaders: { org_size: number }[] }).leaders
    expect(leaders.length).toBeGreaterThan(0)
    for (const l of leaders) expect(l.org_size).toBeGreaterThanOrEqual(5)
  })

  it('refuses a typed name that is not a leader once it is a token', () => {
    const conv = new Conversation()
    const ic = ctx.all.employees.find(
      (e) => isEmployee(e) && isActiveAt(e, ctx.asOf) && !ctx.org.children.get(e.employeeId)?.length,
    ) as Employee
    const sent = conv.tokenize(`How is ${ic.name}'s team doing?`, ctx)
    const token = sent.match(/\{\{P\d+\}\}/)?.[0] as string
    expect(token).toBeTruthy()
    const r = call(conv, envOf(ctx), 'query_records', { dataset: 'reviews', filters: { leader: token } })
    expect(r.isError).toBe(true)
  })

  it('does not break down any scope under the minimum, however it is cut', () => {
    // The smallest department and level cut with people in it.
    const sizes = new Map<string, number>()
    for (const e of ctx.all.employees) {
      const k = JSON.stringify([e.department, e.location, e.level])
      sizes.set(k, (sizes.get(k) ?? 0) + 1)
    }
    const [key] = [...sizes].find(([, n]) => n < 5) as [string, number]
    const [department, location, level] = JSON.parse(key) as string[]
    const conv = new Conversation()
    const filters = { department: [department], location: [location], level: [level] }
    for (const dataset of ['employees', 'reviews', 'surveyResponses', 'rightToWork', 'comp']) {
      const r = call(conv, envOf(ctx), 'query_records', { dataset, filters })
      expect(r.json.error as string, dataset).toMatch(/fewer than 5 people, the anonymity minimum/)
    }
    // Data about no one in particular still answers.
    expect(call(conv, envOf(ctx), 'query_records', { dataset: 'requisitions', filters }).isError).toBe(false)
  })
})

describe('a hidden group is left out, name and all', () => {
  it('never lists a visa type, a low-scored item or a low-rated manager under the minimum', () => {
    const conv = new Conversation()
    const env = envOf(ctx)
    const visas = call(conv, env, 'query_records', {
      dataset: 'rightToWork',
      group_by: ['authorizationType'],
    })
    for (const row of rowsOf(visas)) {
      expect(row.count).not.toBeNull()
      expect(row.people).toBeGreaterThanOrEqual(5)
      expect(row.ref).toBeNull()
    }
    const low = call(conv, env, 'query_records', {
      dataset: 'reviews',
      where: [{ field: 'rating', op: 'lte', value: 1 }],
      group_by: ['org.manager', 'cycle'],
      limit: 50,
    })
    expect(low.json.groups_hidden as number).toBeGreaterThan(0)
    for (const row of rowsOf(low)) expect(row.people).toBeGreaterThanOrEqual(5)
    const items = call(conv, env, 'query_records', {
      dataset: 'surveyResponses',
      where: [
        { field: 'survey', op: 'eq', value: 'Exit survey' },
        { field: 'score', op: 'lte', value: 2 },
      ],
      group_by: ['org.department', 'item'],
      limit: 50,
    })
    for (const row of rowsOf(items)) expect(row.people).toBeGreaterThanOrEqual(5)
  })

  it('counts hidden groups together as Other only when that is at least the minimum', () => {
    const conv = new Conversation()
    const r = call(conv, envOf(ctx), 'query_records', {
      dataset: 'surveyResponses',
      where: [{ field: 'survey', op: 'eq', value: 'Exit survey' }],
      group_by: ['org.department', 'reason'],
      limit: 50,
    })
    const hidden = r.json.groups_hidden as number
    expect(hidden).toBeGreaterThan(0)
    const other = rowsOf(r).find((x) => x.group?.reason === OTHER)
    if (other) {
      expect(other.people).toBeGreaterThanOrEqual(5)
      expect(other.group?.['org.department']).toBe(OTHER)
    }
    for (const row of rowsOf(r)) expect(row.people, JSON.stringify(row.group)).toBeGreaterThanOrEqual(5)
    expect((r.json.notes as string[]).join(' ')).toMatch(/under the anonymity minimum (is|are) left out/)
  })

  it('never returns one respondent’s survey answer, even without narrowing', () => {
    const conv = new Conversation()
    for (const group_by of [
      ['reason'],
      ['org.department', 'reason'],
      ['org.location', 'touchpoint'],
      ['item'],
    ]) {
      const r = call(conv, envOf(ctx), 'query_records', { dataset: 'surveyResponses', group_by, limit: 50 })
      for (const row of rowsOf(r)) expect(row.people, group_by.join()).toBeGreaterThanOrEqual(5)
      const total = r.json.total as QRow
      if (total.people != null) expect(total.people).toBeGreaterThanOrEqual(5)
    }
  })
})

describe('survey cuts by manager need the manager-cut minimum by every route', () => {
  it('applies it under any leader filter, whatever the survey', () => {
    const conv = new Conversation()
    const leader = leaderOptions(ctx.org, ctx.asOf).find((l) => l.size >= 8 && l.size <= 30) as { id: string }
    const token = tokenFor(conv, ctx, leader.id)
    for (const survey of [
      'Onboarding pulse day 30',
      'Hiring manager satisfaction',
      'Engagement',
      'Exit survey',
    ]) {
      const r = call(conv, envOf(ctx), 'query_records', {
        dataset: 'surveyResponses',
        where: [{ field: 'survey', op: 'eq', value: survey }],
        group_by: ['item'],
        measures: [{ op: 'mean', field: 'score' }],
        filters: { leader: token },
        limit: 50,
      })
      expect(r.json.anonymity_minimum, survey).toBe(10)
      for (const row of rowsOf(r)) expect(row.people, survey).toBeGreaterThanOrEqual(10)
      const total = r.json.total as QRow
      if (total.mean_score != null) expect(total.people).toBeGreaterThanOrEqual(10)
    }
  })
})

describe('two results cannot be subtracted to give one person’s value', () => {
  /** A leader whose direct reports span two or more levels, one of them held by a single person. */
  function teamWithLoneLevel(c: AnalyticsContext) {
    for (const l of leaderOptions(c.org, c.asOf)) {
      const team = reportsOf(c, l.id).filter((e) => isEmployee(e))
      if (team.length < 6 || team.length > 12) continue
      const byLevel = new Map<string, Employee[]>()
      for (const e of team) byLevel.set(e.level ?? '', [...(byLevel.get(e.level ?? '') ?? []), e])
      const lone = [...byLevel].find(([, xs]) => xs.length === 1)
      const rated = c.all.reviews.filter((r) => team.some((e) => e.employeeId === r.employeeId))
      if (lone && rated.length) return { leader: l.id, lone: lone[0], team }
    }
    return null
  }

  it('withholds a mean rating over the same team minus one person', () => {
    const t = teamWithLoneLevel(ctx)
    expect(t).not.toBeNull()
    if (!t) return
    const conv = new Conversation()
    const mgr = tokenFor(conv, ctx, t.leader)
    const cycle = ctx.all.reviews.find((r) => r.employeeId === t.team[0]?.employeeId)?.cycle as string
    const base = [
      { field: 'org.manager', op: 'eq', value: mgr },
      { field: 'cycle', op: 'eq', value: cycle },
    ]
    const all = call(conv, envOf(ctx), 'query_records', {
      dataset: 'reviews',
      where: base,
      measures: [{ op: 'mean', field: 'rating' }],
    })
    const allTotal = all.json.total as QRow
    const minusOne = call(conv, envOf(ctx), 'query_records', {
      dataset: 'reviews',
      where: [...base, { field: 'org.level', op: 'ne', value: t.lone }],
      measures: [{ op: 'mean', field: 'rating' }],
    })
    const minusTotal = minusOne.json.total as QRow
    // At most one of the two goes out.
    expect(allTotal.mean_rating == null || minusTotal.mean_rating == null).toBe(true)
    if (allTotal.mean_rating != null) expect(minusTotal.hidden).toBe(DIFFERENCING(5))
    // A new chat starts over: the second question alone is answered there.
    const fresh = call(new Conversation(), envOf(ctx), 'query_records', {
      dataset: 'reviews',
      where: [{ field: 'cycle', op: 'eq', value: cycle }],
      measures: [{ op: 'mean', field: 'rating' }],
    })
    expect((fresh.json.total as QRow).mean_rating).not.toBeNull()
  })

  it('withholds a group total when the groups left out hold fewer than the minimum', () => {
    const t = teamWithLoneLevel(ctx)
    if (!t) return
    const conv = new Conversation()
    const mgr = tokenFor(conv, ctx, t.leader)
    const r = call(conv, envOf(ctx), 'query_records', {
      dataset: 'comp',
      where: [{ field: 'org.manager', op: 'eq', value: mgr }],
      group_by: ['org.level'],
      measures: [{ op: 'mean', field: 'compaRatio' }],
    })
    const shown = rowsOf(r).filter((x) => x.mean_compaRatio != null)
    const total = r.json.total as QRow
    const covered = shown.reduce((s, x) => s + (x.people ?? 0), 0)
    const left = (total.people ?? 0) - covered
    if (left > 0 && left < 5) expect(total.mean_compaRatio).toBeNull()
  })

  it('withholds a count of answers that differs from an earlier one by one respondent', () => {
    const conv = new Conversation()
    const exit = { field: 'survey', op: 'eq', value: 'Exit survey' }
    const first = call(conv, envOf(ctx), 'query_records', {
      dataset: 'surveyResponses',
      where: [exit],
      group_by: ['reason'],
      limit: 50,
    })
    const reasons = rowsOf(first).filter((x) => x.count != null && x.group?.reason !== OTHER)
    expect(reasons.length).toBeGreaterThan(0)
    // Every department with exactly one exit respondent for the first reason: leaving it out differs by one.
    let tried = 0
    for (const dept of new Set(ctx.all.employees.map((e) => e.department))) {
      const r = call(conv, envOf(ctx), 'query_records', {
        dataset: 'surveyResponses',
        where: [exit, { field: 'org.department', op: 'ne', value: dept }],
        group_by: ['reason'],
        limit: 50,
      })
      for (const row of rowsOf(r)) {
        const before = reasons.find((x) => x.group?.reason === row.group?.reason)
        if (!before || row.people == null || before.people == null) continue
        tried++
        const diff = before.people - row.people
        expect(diff === 0 || diff >= 5, `${dept} ${String(row.group?.reason)}`).toBe(true)
      }
    }
    expect(tried).toBeGreaterThan(0)
  })

  it('rounds sensitive means: ratings to 0.1, compa-ratios to 0.01', () => {
    const conv = new Conversation()
    const r = call(conv, envOf(ctx), 'query_records', {
      dataset: 'reviews',
      group_by: ['org.businessUnit'],
      measures: [{ op: 'mean', field: 'rating' }],
    })
    for (const row of rowsOf(r))
      if (row.mean_rating != null)
        expect(Math.round((row.mean_rating as number) * 10)).toBeCloseTo((row.mean_rating as number) * 10, 9)
    const c = call(conv, envOf(ctx), 'query_records', {
      dataset: 'comp',
      group_by: ['org.businessUnit'],
      measures: [{ op: 'median', field: 'compaRatio' }],
    })
    for (const row of rowsOf(c))
      if (row.median_compaRatio != null)
        expect(Math.round((row.median_compaRatio as number) * 100)).toBeCloseTo(
          (row.median_compaRatio as number) * 100,
          9,
        )
  })
})

describe('free text in category columns never goes out', () => {
  const FREE = [
    'Luis left to care for her mother after a cancer diagnosis',
    'Moved to Google with Trung from the same team',
    'Pregnancy; did not return from leave',
  ]
  let messy: AnalyticsContext
  beforeAll(() => {
    const base = sampleData()
    const leavers = base.employees
      .filter((e) => e.terminationDate)
      .slice(0, FREE.length)
      .map((e) => e.employeeId)
    const employees = base.employees.map((e) => {
      const i = leavers.indexOf(e.employeeId)
      return i < 0 ? e : { ...e, terminationReason: FREE[i] as string }
    })
    messy = sampleCtx({ data: { ...base, employees } })
  })

  it('groups them as one stand-in value in query_records and explain_quality', () => {
    const conv = new Conversation()
    const r = call(conv, envOf(messy), 'query_records', {
      dataset: 'employees',
      group_by: ['terminationReason'],
      limit: 50,
    })
    for (const text of FREE) expect(r.content).not.toContain(text)
    expect(r.content).toContain(NOT_OFFICIAL(5))
    const q = call(conv, envOf(messy), 'explain_quality', {
      dataset: 'employees',
      field: 'terminationReason',
    })
    for (const text of FREE) expect(q.content).not.toContain(text)
    const all = call(conv, envOf(messy), 'explain_quality', { dataset: 'employees' })
    for (const text of FREE) expect(all.content).not.toContain(text)
  })
})

describe('right to work is counts only', () => {
  it('never sends a small group of expiry dates, and gives no measure but counts', () => {
    const conv = new Conversation()
    const r = call(conv, envOf(ctx), 'query_records', {
      dataset: 'rightToWork',
      where: [{ field: 'expiryDate', op: 'not_null' }],
      group_by: ['org.manager', { field: 'expiryDate', by: 'month' }],
      limit: 50,
    })
    for (const row of rowsOf(r)) expect(row.people).toBeGreaterThanOrEqual(5)
    expect(
      call(conv, envOf(ctx), 'query_records', {
        dataset: 'rightToWork',
        measures: [{ op: 'share', field: 'exportLicenseRequired' }],
      }).json.error as string,
    ).toMatch(/grouped counts only/)
  })
})
