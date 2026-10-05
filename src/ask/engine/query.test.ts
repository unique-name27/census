/**
 * query_records on the sample: aggregates equal a recount from the raw rows, refs open exactly
 * those rows, and the privacy rules (allowlist, anonymity minimum, grouped-counts-only fields,
 * survey and employee relations rules, the data standard) hold.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Employee } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { tenureYears } from '@/lib/people'
import { median } from '@/lib/stats'
import { metricsWith } from '@/metrics/testing'
import { DENY_REASON, joinsFor, type QueryField, queryDataset } from './allowlist'
import { Conversation } from './conversation'
import { call, envOf, expectClean, sampleCtx, tieredCtx } from './testkit'
import { roundSensitive } from './tools/query'
import { num } from './tools/shared'

type QRow = {
  group?: Record<string, unknown>
  count: number | null
  people?: number | null
  ref: string | null
} & Record<string, unknown>

let ctx: AnalyticsContext
let conv: Conversation
const q = (input: Record<string, unknown>, c: AnalyticsContext = ctx) =>
  call(conv, envOf(c), 'query_records', input)
const rows = (r: ReturnType<typeof q>) => r.json.rows as QRow[]
const byGroup = (r: ReturnType<typeof q>, field: string) =>
  new Map(rows(r).map((x) => [String(x.group?.[field]), x]))
const countBy = <T>(xs: readonly T[], key: (x: T) => string | null | undefined) => {
  const m = new Map<string, number>()
  for (const x of xs) {
    const k = key(x)
    if (k == null) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

beforeAll(() => {
  ctx = sampleCtx()
  conv = new Conversation()
}, 60_000)

describe('query_records recounts', () => {
  it('counts voluntary leavers in the period by location, with the regretted share', () => {
    const r = q({
      dataset: 'employees',
      where: [
        { field: 'terminationType', op: 'eq', value: 'Voluntary' },
        { field: 'terminationDate', op: 'in_period', value: 'current' },
      ],
      group_by: [{ field: 'location' }],
      measures: [{ op: 'count' }, { op: 'share', field: 'regrettable' }],
      limit: 50,
    })
    const leavers = ctx.data.employees.filter(
      (e) =>
        e.terminationType === 'Voluntary' &&
        !!e.terminationDate &&
        e.terminationDate >= ctx.window.start &&
        e.terminationDate <= ctx.window.end,
    )
    const want = countBy(leavers, (e) => e.location)
    const got = byGroup(r, 'location')
    expect(got.size).toBe(want.size)
    for (const [loc, n] of want) {
      const row = got.get(loc) as QRow
      expect(row.count, loc).toBe(n)
      const mine = leavers.filter((e) => e.location === loc)
      const known = mine.filter((e) => typeof e.regrettable === 'boolean')
      if (n >= 5)
        expect(row.share_regrettable, loc).toBe(num(known.filter((e) => e.regrettable).length / known.length))
      else {
        expect(row.share_regrettable, loc).toBeNull()
        expect(row.hidden, loc).toMatch(/Hidden to protect anonymity \(n < 5\)/)
      }
    }
    expect((r.json.total as QRow).count).toBe(leavers.length)
  })

  it('opens exactly the rows behind each group', () => {
    const r = q({
      dataset: 'employees',
      where: [
        { field: 'active', op: 'eq', value: true },
        { field: 'employmentType', op: 'eq', value: 'Employee' },
      ],
      group_by: [{ field: 'businessUnit' }],
    })
    for (const row of rows(r)) {
      const spec = resolveDrill(conv.records(row.ref as string))
      expect(spec?.kind).toBe('employees')
      const want = ctx.data.employees.filter(
        (e) => isEmployee(e) && isActiveAt(e, ctx.asOf) && e.businessUnit === row.group?.businessUnit,
      )
      expect(spec?.rows).toEqual(want)
    }
  })

  it('averages tenure and takes medians of compa-ratio by a joined org field', () => {
    const t = q({
      dataset: 'employees',
      where: [{ field: 'active', op: 'eq', value: true }],
      group_by: ['businessUnit'],
      measures: [{ op: 'mean', field: 'tenureYears' }],
    })
    for (const row of rows(t)) {
      const people = ctx.data.employees.filter(
        (e) => isActiveAt(e, ctx.asOf) && e.businessUnit === row.group?.businessUnit,
      )
      const want = people.reduce((s, e) => s + tenureYears(e, ctx.asOf), 0) / people.length
      expect(row.mean_tenureYears).toBe(num(want))
    }
    const c = q({
      dataset: 'comp',
      group_by: [{ field: 'org.department' }],
      measures: [{ op: 'median', field: 'compaRatio' }],
      limit: 50,
    })
    for (const row of rows(c)) {
      const recs = ctx.data.comp.filter(
        (x) => ctx.org.byId.get(x.employeeId)?.department === row.group?.['org.department'],
      )
      const want = median(recs.filter((x) => x.rangeMid > 0).map((x) => x.baseSalary / x.rangeMid))
      expect(row.count).toBe(recs.length)
      expect(row.median_compaRatio).toBe(recs.length >= 5 ? roundSensitive(num(want), 'ratio') : null)
    }
    expectClean(c.content, 'compa-ratio by department')
  })

  it('buckets dates by quarter and sorts by group', () => {
    const r = q({
      dataset: 'employees',
      where: [{ field: 'hireDate', op: 'between', value: ['2025-01-01', '2026-09-30'] }],
      group_by: [{ field: 'hireDate', by: 'quarter' }],
      sort: { by: 'group' },
    })
    const hires = ctx.data.employees.filter((e) => e.hireDate >= '2025-01-01' && e.hireDate <= '2026-09-30')
    const quarters = rows(r).map((x) => x.group?.hireDate_quarter as string)
    expect(quarters).toEqual([...quarters].sort())
    expect(rows(r).reduce((s, x) => s + (x.count ?? 0), 0)).toBe(hires.length)
  })

  it('groups by a person as tokens and filters by a token', () => {
    const r = q({
      dataset: 'requisitions',
      where: [{ field: 'status', op: 'eq', value: 'Open' }],
      group_by: ['recruiter'],
    })
    const open = ctx.data.requisitions.filter((x) => x.status === 'Open')
    const want = countBy(open, (x) => x.recruiter ?? null)
    for (const row of rows(r)) {
      const token = row.group?.recruiter as string
      expect(token).toMatch(/^\{\{P\d+\}\}$/)
      const name = conv.person(token)?.name as string
      expect(row.count, name).toBe(want.get(name))
    }
    expectClean(r.content, 'reqs by recruiter')
    const first = rows(r)[0] as QRow
    const one = q({
      dataset: 'requisitions',
      where: [
        { field: 'status', op: 'eq', value: 'Open' },
        { field: 'recruiter', op: 'eq', value: first.group?.recruiter },
      ],
    })
    expect((one.json.total as QRow).count).toBe(first.count)
    const invented = q({
      dataset: 'requisitions',
      where: [{ field: 'recruiter', op: 'eq', value: '{{P99999}}' }],
    })
    expect(invented.isError).toBe(true)
  })

  it('groups direct reports by manager and candidates by their requisition’s org', () => {
    const r = q({
      dataset: 'employees',
      where: [
        { field: 'active', op: 'eq', value: true },
        { field: 'department', op: 'eq', value: 'Software' },
      ],
      group_by: ['managerId'],
      limit: 50,
    })
    const people = ctx.data.employees.filter((e) => isActiveAt(e, ctx.asOf) && e.department === 'Software')
    const want = countBy(people, (e) => e.managerId ?? null)
    for (const row of rows(r)) {
      const id = conv.tokens.employeeIdOf(row.group?.managerId as string) as string
      expect(row.count).toBe(want.get(id))
    }
    const c = q({ dataset: 'candidates', group_by: ['org.businessUnit'], measures: ['distinct_people'] })
    const reqs = new Map(ctx.data.requisitions.map((x) => [x.reqId, x]))
    const wantC = countBy(ctx.data.candidates, (x) => reqs.get(x.reqId)?.businessUnit)
    for (const row of rows(c)) expect(row.count).toBe(wantC.get(row.group?.['org.businessUnit'] as string))
  })

  it('applies the call’s filters like the app does', () => {
    const scoped = sampleCtx({ filters: { location: ['Hsinchu'] } })
    const r = q({ dataset: 'learning', group_by: ['category'], filters: { location: ['Hsinchu'] } })
    const want = countBy(scoped.data.learning, (x) => x.category)
    for (const row of rows(r)) expect(row.count).toBe(want.get(row.group?.category as string))
    expect(r.json.scope).toBe('Hsinchu')
  })
})

describe('query_records privacy', () => {
  it('refuses names, IDs, pay amounts and free text, saying why', () => {
    expect(q({ dataset: 'employees', group_by: ['name'] }).json.error).toContain(DENY_REASON.name)
    expect(q({ dataset: 'employees', group_by: ['employeeId'] }).json.error).toContain(DENY_REASON.id)
    expect(q({ dataset: 'comp', measures: [{ op: 'mean', field: 'baseSalary' }] }).json.error).toContain(
      DENY_REASON.pay,
    )
    expect(q({ dataset: 'employees', group_by: ['jobTitle'] }).json.error).toContain(DENY_REASON.text)
    expect(q({ dataset: 'surveyResponses', group_by: ['respondentKey'] }).json.error).toContain(
      DENY_REASON.respondent,
    )
    expect(
      q({ dataset: 'candidates', where: [{ field: 'candidateName', op: 'eq', value: 'x' }] }).isError,
    ).toBe(true)
  })

  it('gives one person’s rating, answer or pay ratio as means and medians only', () => {
    expect(q({ dataset: 'reviews', measures: [{ op: 'max', field: 'rating' }] }).json.error).toMatch(
      /mean and median/,
    )
    expect(q({ dataset: 'comp', measures: [{ op: 'min', field: 'compaRatio' }] }).isError).toBe(true)
    const r = q({
      dataset: 'reviews',
      where: [{ field: 'rating', op: 'eq', value: 1 }],
      group_by: ['org.department'],
      limit: 50,
    })
    for (const row of rows(r)) {
      expect(row.count).not.toBeNull()
      expect(row.people).toBeGreaterThanOrEqual(5)
    }
    expect(r.json.groups_hidden as number).toBeGreaterThan(0)
  })

  it('keeps immigration fields to grouped counts: small counts hidden, no records', () => {
    expect(
      q({ dataset: 'rightToWork', group_by: ['authorizationType'], measures: [{ op: 'share' }] }).isError,
    ).toBe(true)
    const r = q({ dataset: 'rightToWork', group_by: ['authorizationType'] })
    for (const row of rows(r)) {
      expect(row.ref).toBeNull()
      if (row.count != null) expect(row.count).toBeGreaterThanOrEqual(5)
    }
    expect((r.json.total as QRow).ref).toBeNull()
    const byDept = q({
      dataset: 'rightToWork',
      where: [{ field: 'authorizationType', op: 'eq', value: 'Employer-sponsored visa' }],
      group_by: ['org.department'],
      limit: 50,
    })
    for (const row of rows(byDept)) if (row.count != null) expect(row.count).toBeGreaterThanOrEqual(5)
  })

  it('opens leave by reason as grouped counts, never named people', () => {
    const r = q({
      dataset: 'transactions',
      where: [{ field: 'type', op: 'eq', value: 'Leave start' }],
      group_by: ['leaveReason'],
    })
    expect(rows(r).length).toBeGreaterThan(0)
    for (const row of rows(r)) {
      if (row.count == null) {
        expect(row.ref).toBeNull()
        continue
      }
      expect(row.count).toBeGreaterThanOrEqual(5)
      const spec = resolveDrill(conv.records(row.ref as string))
      expect(spec?.kind).toBe('leaveGroups')
      expect(spec?.rows).toHaveLength(1)
    }
  })

  it('keeps survey results grouped, leaves engagement out while it is off, and needs 10 for a manager cut', () => {
    const off = q({ dataset: 'surveyResponses', group_by: ['survey'] })
    expect(rows(off).some((x) => x.group?.survey === 'Engagement')).toBe(false)
    const on = q({ dataset: 'surveyResponses', group_by: ['survey'] }, sampleCtx({ engagement: true }))
    expect(rows(on).length).toBeGreaterThanOrEqual(rows(off).length)
    const row = rows(off)[0] as QRow
    expect(resolveDrill(conv.records(row.ref as string))?.kind).toBe('surveyGroups')
    const mgr = q({
      dataset: 'surveyResponses',
      where: [{ field: 'survey', op: 'eq', value: 'Manager feedback' }],
      group_by: ['org.manager'],
      measures: [{ op: 'mean', field: 'score' }],
      limit: 50,
    })
    expect(mgr.json.anonymity_minimum).toBe(10)
    for (const x of rows(mgr)) expect(x.people).toBeGreaterThanOrEqual(10)
    // Managers with fewer respondents are left out, not listed with a hidden mean.
    expect(mgr.json.groups_hidden as number).toBeGreaterThan(0)
    expectClean(mgr.content, 'manager cut')
  })

  it('needs the manager-cut minimum for a where clause on a manager and for a narrowed scope', () => {
    const on = sampleCtx({ engagement: true })
    const c = new Conversation()
    const mf = { field: 'survey', op: 'eq', value: 'Manager feedback' }
    // Managers whose team has 5 to 9 respondents: shown at 5, hidden at 10.
    const mgrField = queryDataset('surveyResponses')?.fields.find(
      (f) => f.name === 'org.manager',
    ) as QueryField
    const j = joinsFor(on)
    const respondents = new Map<string, Set<string>>()
    for (const r of on.all.surveyResponses) {
      if (r.survey !== 'Manager feedback') continue
      const m = mgrField.get(r as never, j)
      if (typeof m !== 'string') continue
      const set = respondents.get(m) ?? new Set<string>()
      set.add(r.respondentKey)
      respondents.set(m, set)
    }
    c.tokens.index(on)
    const small = [...respondents]
      .filter(([, who]) => who.size >= 5 && who.size < 10)
      .map(([id]) => c.tokens.forEmployee(id))
    expect(small.length).toBeGreaterThan(0)
    for (const token of small.slice(0, 6)) {
      // A where clause on the manager is a manager cut.
      const one = call(c, envOf(on), 'query_records', {
        dataset: 'surveyResponses',
        where: [mf, { field: 'org.manager', op: 'eq', value: token }],
        measures: [{ op: 'mean', field: 'score' }],
      })
      const total = one.json.total as QRow
      expect(one.json.anonymity_minimum, token).toBe(10)
      expect(total.mean_score, token).toBeNull()
      expect(total.hidden, token).toBe('Hidden to protect anonymity (n < 10)')
      expect((one.json.notes as string[]).join(' ')).toMatch(/cuts by manager need 10 or more respondents/)
      // A leader filter narrows the scope: Manager feedback needs 10 there too.
      const led = call(c, envOf(on), 'query_records', {
        dataset: 'surveyResponses',
        where: [mf],
        measures: [{ op: 'mean', field: 'score' }],
        filters: { leader: token },
      })
      expectClean(one.content + led.content, 'manager where and leader filter')
      // A manager who is not a leader the app's leader filter offers cannot be a scope.
      if (led.isError) {
        expect(led.json.error as string, token).toMatch(/not a leader|fewer than 5 people/)
        continue
      }
      const t = led.json.total as QRow
      expect(led.json.anonymity_minimum, token).toBe(10)
      if (t.mean_score != null) expect(t.people, token).toBeGreaterThanOrEqual(10)
    }
    // Under a leader, every survey group needs 10: a leader's org is a cut by manager.
    const lead = small.find(
      (t) =>
        !call(c, envOf(on), 'query_records', { dataset: 'surveyResponses', filters: { leader: t } }).isError,
    ) as string
    expect(lead).toBeDefined()
    const mixed = call(c, envOf(on), 'query_records', {
      dataset: 'surveyResponses',
      group_by: ['survey', 'org.department'],
      measures: [{ op: 'mean', field: 'score' }],
      filters: { leader: lead },
      limit: 50,
    })
    expect(mixed.json.anonymity_minimum).toBe(10)
    for (const x of mixed.json.rows as QRow[]) {
      const sv = x.group?.survey as string
      expect(x.people, sv).toBeGreaterThanOrEqual(10)
    }
    // A where clause on the person's org narrows like a filter, even at company scope.
    const dept = call(c, envOf(on), 'query_records', {
      dataset: 'surveyResponses',
      where: [mf, { field: 'org.department', op: 'eq', value: on.all.employees[0]?.department }],
      measures: [{ op: 'mean', field: 'score' }],
    })
    expect(dept.json.anonymity_minimum).toBe(10)
    expect((dept.json.notes as string[]).join(' ')).toMatch(/Manager feedback answers need 10/)
    // At company scope with one org cut, Manager feedback groups keep the anonymity minimum, as in Listening.
    const company = call(c, envOf(on), 'query_records', {
      dataset: 'surveyResponses',
      where: [mf],
      group_by: ['org.department'],
      measures: [{ op: 'mean', field: 'score' }],
    })
    expect(company.json.anonymity_minimum).toBe(5)
  })

  it('keeps a survey’s own raised minimum', () => {
    const raised = sampleCtx({
      metrics: metricsWith({ 'listening.score.exitSurvey': { minRespondents: 40 } }),
    })
    const r = call(new Conversation(), envOf(raised), 'query_records', {
      dataset: 'surveyResponses',
      group_by: ['survey', 'org.location'],
      measures: [{ op: 'mean', field: 'score' }],
      limit: 50,
    })
    const exits = (r.json.rows as QRow[]).filter((x) => x.group?.survey === 'Exit survey')
    // Exit survey groups under 40 respondents are left out; those shown have 40 or more.
    for (const x of exits) expect(x.people).toBeGreaterThanOrEqual(40)
    expect(r.json.groups_hidden as number).toBeGreaterThan(0)
    const others = (r.json.rows as QRow[]).filter((x) => x.group?.survey !== 'Exit survey')
    expect(others.some((x) => x.mean_score != null && (x.people ?? 0) < 40)).toBe(true)
  })

  it('counts employee relations cases by category only', () => {
    const byCat = q({ dataset: 'cases', group_by: ['category'] })
    const er = ctx.data.cases.filter((c) => c.category === 'Employee relations').length
    expect(byGroup(byCat, 'category').get('Employee relations')?.count).toBe(er)
    for (const field of ['assignee', 'subcategory', 'location', 'org.department', 'org.manager']) {
      const r = q({ dataset: 'cases', group_by: [field], limit: 50 })
      expect((r.json.total as QRow).count, field).toBe(ctx.data.cases.length - er)
      expect((r.json.notes as string[]).join(' '), field).toMatch(/Employee relations cases are left out/)
    }
    const filtered = q({
      dataset: 'cases',
      where: [{ field: 'category', op: 'eq', value: 'Employee relations' }],
      group_by: ['assignee'],
    })
    expect((filtered.json.total as QRow).count).toBe(0)
  })

  it('hides a number below the data standard with the reason', () => {
    const gold = tieredCtx('gold')
    const c = new Conversation()
    const hidden = ['employees', 'candidates', 'cases', 'reviews', 'comp'].map((dataset) =>
      call(c, envOf(gold), 'query_records', { dataset, measures: ['count'] }),
    )
    const held = hidden.filter((r) => r.json.hidden)
    expect(held.length).toBeGreaterThan(0)
    for (const r of held) {
      expect(r.json.rows).toEqual([])
      expect(r.json.total).toBeUndefined()
      expect(typeof r.json.hidden).toBe('string')
    }
  })

  it('caps rows at 50 and says how many groups there are', () => {
    const r = q({
      dataset: 'candidates',
      group_by: [{ field: 'appliedDate', by: 'month' }, 'source'],
      limit: 500,
    })
    expect(rows(r).length).toBeLessThanOrEqual(50)
    expect(r.json.groups_total as number).toBeGreaterThan(50)
  })
})

it('counts only active employees as headcount in get_context', () => {
  const r = call(new Conversation(), envOf(ctx), 'get_context')
  const bus = (r.json.vocabularies as { business_unit: { value: string; headcount: number }[] }).business_unit
  const want = countBy(
    ctx.all.employees.filter((e: Employee) => isEmployee(e) && isActiveAt(e, ctx.asOf)),
    (e) => e.businessUnit,
  )
  for (const b of bus) expect(b.headcount).toBe(want.get(b.value))
})
