/**
 * Ask in every mode (docs/ROLES-V2.md part 7 and 8.8 test 8), on the sample: the tools each mode
 * offers and their view and dataset enums (`toolDefinitionsFor`, cached per mode and scope kind,
 * one cache breakpoint), refusals worded for the mode, the filters inside each scope kind and
 * Finance's restriction, the prompt block per mode, Ask off for a small scope of every kind, a
 * recruiter's name as a token, and the screen action tools inside each scope kind.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { askScopeTooSmall, kindNotShown, modeName, toolNotInMode } from '@/access/copy'
import { MODES, type Mode } from '@/access/modes'
import { clampFilters } from '@/access/scopes/clamp'
import type { RegionScope, ReqsScope, ScopeLock, UnitScope } from '@/access/scopes/types'
import type { AnalyticsContext } from '@/data/context'
import { DATASETS, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { modeCtx, samplePicks } from '@/views/actions/engine/roleKit'
import { VIEWS } from '@/views/registry'
import { MODE_CHANGED } from './app'
import { Conversation } from './conversation'
import { fakeClient } from './fakeApi'
import { ask } from './loop'
import { managerPromptLine, rolePromptLine } from './prompt'
import { askNeedsPick, askOff, FINANCE_NO_EXCLUDE, financeFilterRefused, scopePerson } from './roles'
import { call, callScreen, envOf, fakeApp, leaks, sampleCtx, sampleData } from './testkit'
import { TOOL_DEFINITIONS, toolDefinitionsFor } from './tools'
import { COMPARE_BY } from './tools/summary'

type Tool = ReturnType<typeof toolDefinitionsFor>[number]
type Props = Record<
  string,
  { enum?: string[]; properties?: Record<string, unknown>; items?: { enum?: string[] } }
>

const propsOf = (t: Tool | undefined): Props => (t?.input_schema.properties ?? {}) as Props
const toolOf = (tools: readonly Tool[], name: string) => tools.find((t) => t.name === name)
const breakpoints = (tools: readonly Tool[]) => tools.filter((t) => t.cache_control).length

/** Views whose summary Ask computes (the views with a summary, the Scorecard and Org chart). */
const SUMMARIZED = VIEWS.filter((v) => v.datasets.length > 0 && (v.summary || v.key === 'scorecard'))

const ctxOf = (mode: Mode): AnalyticsContext => modeCtx(mode)

let unit: AnalyticsContext
let region: AnalyticsContext
let reqs: AnalyticsContext
let finance: AnalyticsContext

beforeAll(() => {
  unit = ctxOf('hrbp-unit')
  region = ctxOf('hrbp-region')
  reqs = ctxOf('recruiter')
  finance = ctxOf('finance')
}, 120_000)

describe('the tools each mode offers', () => {
  it('lists the tools the mode shows, explain_quality only in Developer, HR, CHRO and HR ops, with one cache breakpoint on the last tool', () => {
    for (const mode of MODES) {
      const access = ctxOf(mode).access
      const tools = toolDefinitionsFor(access)
      expect(
        tools.map((t) => t.name),
        mode,
      ).toEqual(TOOL_DEFINITIONS.filter((t) => access.can(`ask:${t.name}`)).map((t) => t.name))
      expect(
        tools.some((t) => t.name === 'explain_quality'),
        mode,
      ).toBe(['developer', 'hr', 'chro', 'hr-ops'].includes(mode))
      expect(breakpoints(tools), mode).toBe(1)
      expect(tools.at(-1)?.cache_control, mode).toEqual({ type: 'ephemeral' })
      // With the screen tools, still one breakpoint, on the last of all.
      for (const actions of [true, false]) {
        const all = toolDefinitionsFor(access, { views: VIEWS, actions })
        expect(breakpoints(all), `${mode} screen ${actions}`).toBe(1)
        expect(all.at(-1)?.cache_control, mode).toEqual({ type: 'ephemeral' })
        expect(all.at(-1)?.name).toBe('make_chart')
        for (const t of all) expect(access.can(`ask:${t.name}`), `${mode} ${t.name}`).toBe(true)
      }
    }
  })

  it("lists only the mode's views, and only the datasets it reads (decide('dataset:…')), with their field help", () => {
    for (const mode of MODES) {
      const access = ctxOf(mode).access
      const tools = toolDefinitionsFor(access)
      const summary = toolOf(tools, 'view_summary')
      const views = propsOf(summary).view?.enum ?? []
      for (const v of views) expect(access.can(`view:${v}`), `${mode} view_summary ${v}`).toBe(true)
      for (const v of SUMMARIZED)
        if (access.can(`view:${v.key}`)) expect(views, `${mode} lists ${v.key}`).toContain(v.key)
      const compare = toolOf(tools, 'compare_groups')
      for (const v of propsOf(compare).view?.enum ?? []) {
        expect(views).toContain(v)
        expect(['scorecard', 'org']).not.toContain(v)
      }
      const query = toolOf(tools, 'query_records')
      const datasets = propsOf(query).dataset?.enum ?? []
      expect(datasets, mode).toEqual(DATASETS.filter((d) => access.can(`dataset:${d.key}`)).map((d) => d.key))
      // The field help names only those datasets.
      const help = (query?.description ?? '').split('Fields per dataset:\n')[1] ?? ''
      const named = help.split('\n').map((l) => l.split(':')[0])
      expect(named, mode).toEqual(datasets)
    }
    // Finance never reads compensation rows, and Recruiter never reads the roster.
    expect(propsOf(toolOf(toolDefinitionsFor(finance.access), 'query_records')).dataset?.enum).not.toContain(
      'comp',
    )
    expect(propsOf(toolOf(toolDefinitionsFor(reqs.access), 'query_records')).dataset?.enum).not.toContain(
      'employees',
    )
  })

  it("gives Finance's tools business unit and period filters only, and no exclude", () => {
    const tools = toolDefinitionsFor(finance.access, { views: VIEWS, actions: true })
    for (const name of ['view_summary', 'compare_groups', 'query_records']) {
      const filters = propsOf(toolOf(tools, name)).filters?.properties ?? {}
      expect(Object.keys(filters).sort(), name).toEqual(['business_unit', 'end', 'period', 'start'])
    }
    expect(propsOf(toolOf(tools, 'compare_groups')).by?.enum).toEqual(['business_unit'])
    expect(Object.keys(propsOf(toolOf(tools, 'set_filters'))).sort()).toEqual([
      'business_unit',
      'end',
      'mode',
      'period',
      'start',
    ])
    // Every other mode keeps every filter; Manager mode never leaves a leader out, HRBP for a unit never its unit.
    const hr = toolDefinitionsFor(ctxOf('hr').access)
    expect(propsOf(toolOf(hr, 'compare_groups')).by?.enum).toEqual([...COMPARE_BY])
    const excl = (c: AnalyticsContext): string[] => {
      const filters = propsOf(toolOf(toolDefinitionsFor(c.access), 'view_summary')).filters
      const exclude = filters?.properties?.exclude as { items?: { enum?: string[] } } | undefined
      return exclude?.items?.enum ?? []
    }
    expect(excl(ctxOf('manager'))).not.toContain('leader')
    expect(excl(unit)).not.toContain('business_unit')
    expect(excl(region)).toContain('location')
  })

  it('is cached per mode and scope kind: two business units share one list, other modes have their own', () => {
    const other = sampleCtx({ access: { mode: 'hrbp-unit', picks: { unit: 'Corporate' } } })
    expect(other.access.scope?.kind).toBe('unit')
    expect(toolDefinitionsFor(other.access)).toBe(toolDefinitionsFor(unit.access))
    expect(toolDefinitionsFor(unit.access)).not.toBe(toolDefinitionsFor(region.access))
    expect(toolDefinitionsFor(ctxOf('hr').access)).not.toBe(toolDefinitionsFor(ctxOf('chro').access))
    // The screen tools too.
    expect(toolDefinitionsFor(other.access, { views: VIEWS, actions: true })).toBe(
      toolDefinitionsFor(unit.access, { views: VIEWS, actions: true }),
    )
    // Nothing in them names the scope: the unit goes in the prompt block, not the tools.
    expect(JSON.stringify(toolDefinitionsFor(unit.access, { views: VIEWS, actions: true }))).not.toContain(
      'Silicon Engineering',
    )
  })
})

describe('refusals, worded for the mode', () => {
  it('refuses a tool the mode hides', () => {
    for (const mode of MODES) {
      const c = ctxOf(mode)
      if (c.access.can('ask:explain_quality')) continue
      const r = call(new Conversation(), envOf(c), 'explain_quality', {})
      expect(r.isError, mode).toBe(true)
      expect(r.json.error, mode).toBe(toolNotInMode('explain_quality', mode))
    }
    expect(toolNotInMode('compare_groups', 'recruiter')).toBe(
      'compare_groups is not available in Recruiter mode.',
    )
  })

  it('refuses the views and datasets the mode hides, saying so in its name', () => {
    for (const mode of MODES) {
      const c = ctxOf(mode)
      const conv = new Conversation()
      for (const v of SUMMARIZED) {
        if (c.access.can(`view:${v.key}`)) continue
        const r = call(conv, envOf(c), 'view_summary', { view: v.key })
        expect(r.isError, `${mode} ${v.key}`).toBe(true)
        expect(String(r.json.error), `${mode} ${v.key}`).toContain(`not shown in ${modeName(mode)}`)
      }
      for (const d of DATASETS) {
        if (c.access.can(`dataset:${d.key}`)) continue
        const r = call(conv, envOf(c), 'query_records', { dataset: d.key })
        expect(r.isError, `${mode} ${d.key}`).toBe(true)
        expect(String(r.json.error), `${mode} ${d.key}`).toContain(`is not available in ${modeName(mode)}`)
      }
    }
  })
})

describe('the scope of every tool call', () => {
  it('keeps HRBP for a business unit inside the unit: no business unit is the unit, another is refused', () => {
    const s = unit.access.scope as UnitScope
    const conv = new Conversation()
    const own = call(conv, envOf(unit), 'view_summary', { view: 'hrbp', filters: { period: 't6m' } })
    expect(own.isError).toBe(false)
    expect(own.json.scope).toBe(s.unit)
    expect((own.json.filters as { business_unit: string[] }).business_unit).toEqual([s.unit])
    const there = call(conv, envOf(unit), 'view_summary', {
      view: 'hrbp',
      filters: { location: ['Bengaluru'] },
    })
    expect(there.isError).toBe(false)
    expect(there.json.scope).toBe(`${s.unit} · Bengaluru`)
    const other = call(conv, envOf(unit), 'view_summary', {
      view: 'hrbp',
      filters: { business_unit: ['Corporate'] },
    })
    expect(other.json.error).toBe('In HRBP mode a business unit filter must be Silicon Engineering.')
    const left = call(conv, envOf(unit), 'query_records', {
      dataset: 'employees',
      filters: { business_unit: [s.unit], exclude: ['business_unit'] },
    })
    expect(left.isError).toBe(true)
    const dept = [...s.otherDepartments][0]
    if (dept) {
      const r = call(conv, envOf(unit), 'query_records', {
        dataset: 'employees',
        filters: { department: [dept] },
      })
      expect(r.json.error).toMatch(
        /^.+ is not a department of Silicon Engineering\. In HRBP mode a department filter must be inside it: /,
      )
    }
    // Every row a tool counts is in the unit.
    const rows = call(conv, envOf(unit), 'query_records', {
      dataset: 'employees',
      group_by: [{ field: 'businessUnit' }],
    })
    expect(
      (rows.json.rows as { group: { businessUnit: string } }[]).map((r) => r.group.businessUnit),
    ).toEqual([s.unit])
    // compare_groups by business unit has the unit alone; by department, the unit's own.
    const kpi = 'voluntary'
    const byUnit = call(conv, envOf(unit), 'compare_groups', { view: 'hrbp', kpi, by: 'business_unit' })
    expect((byUnit.json.groups as { group: string }[]).map((g) => g.group)).toEqual([s.unit])
    expect(byUnit.json.groups_scope).toBeUndefined()
    const byDept = call(conv, envOf(unit), 'compare_groups', { view: 'hrbp', kpi, by: 'department' })
    for (const g of byDept.json.groups as { group: string }[])
      expect(s.otherDepartments.has(g.group)).toBe(false)
  })

  it('keeps HRBP for a region inside the region: no location is the region, a site outside is refused', () => {
    const s = region.access.scope as RegionScope
    expect(s.sites.length).toBeGreaterThan(0)
    const conv = new Conversation()
    const own = call(conv, envOf(region), 'view_summary', { view: 'hrbp', filters: { period: 't6m' } })
    expect(own.json.scope).toBe(s.region)
    const out = call(conv, envOf(region), 'view_summary', { view: 'hrbp', filters: { location: ['Munich'] } })
    expect(out.json.error).toBe(
      `In HRBP mode a location filter must be in ${s.region}: ${s.sites.join(', ')}.`,
    )
    // A business unit narrows inside the region.
    const bu = call(conv, envOf(region), 'view_summary', {
      view: 'hrbp',
      filters: { business_unit: ['Silicon Engineering'] },
    })
    expect(bu.isError).toBe(false)
    expect(bu.json.scope).toBe(`Silicon Engineering · ${s.region}`)
    // Leaving every site out leaves nobody: refused.
    const none = call(conv, envOf(region), 'view_summary', {
      view: 'hrbp',
      filters: { location: [...s.sites], exclude: ['location'] },
    })
    expect(none.isError).toBe(true)
    // compare_groups by location lists the region's sites only.
    const sites = call(conv, envOf(region), 'compare_groups', {
      view: 'hrbp',
      kpi: 'voluntary',
      by: 'location',
    })
    for (const g of sites.json.groups as { group: string }[]) expect(s.sites).toContain(g.group)
    const rows = call(conv, envOf(region), 'query_records', {
      dataset: 'employees',
      group_by: [{ field: 'location' }],
    })
    for (const r of rows.json.rows as { group: { location: string } }[])
      expect(s.sites).toContain(r.group.location)
  })

  it("runs Recruiter mode's tools on the reqs; compare_groups by leader lists hiring managers' orgs inside them", () => {
    const s = reqs.access.scope as ReqsScope
    const conv = new Conversation()
    const count = call(conv, envOf(reqs), 'query_records', { dataset: 'requisitions' })
    expect(count.isError).toBe(false)
    const n = (count.json.rows as { count: number }[])[0]?.count
    expect(n).toBe(reqs.data.requisitions.length)
    expect(n).toBeGreaterThan(0)
    for (const r of reqs.data.requisitions) expect(s.reqIds.has(r.reqId)).toBe(true)
    // The scope reads as the recruiter's reqs, the recruiter as a token.
    expect(String(count.json.scope)).toMatch(/^\{\{P\d+\}\}'s reqs$/)
    expect(leaks(count.content)).toEqual([])
    const summary = call(conv, envOf(reqs), 'view_summary', { view: 'recruiting' })
    const kpi = (summary.json.key_figures as { id: string }[])[0]?.id as string
    const byLeader = call(conv, envOf(reqs), 'compare_groups', { view: 'recruiting', kpi, by: 'leader' })
    expect(byLeader.isError).toBe(false)
    const groups = byLeader.json.groups as { group: string; reqs: number }[]
    expect(groups.length).toBeGreaterThan(0)
    // Each leader's org holds a hiring manager of the reqs.
    const managers = new Set(reqs.data.requisitions.map((r) => r.hiringManagerId))
    for (const g of groups) {
      expect(g.reqs).toBeGreaterThan(0)
      const id = conv.tokens.employeeIdOf(g.group) as string
      const below = new Set<string>()
      const walk = (x: string) => {
        below.add(x)
        for (const c of reqs.org.children.get(x) ?? []) if (!below.has(c.employeeId)) walk(c.employeeId)
      }
      walk(id)
      expect(
        [...managers].some((m) => !!m && below.has(m)),
        g.group,
      ).toBe(true)
    }
    expect(groups.reduce((t, g) => t + g.reqs, 0)).toBeLessThanOrEqual(reqs.data.requisitions.length)
    expect((byLeader.json.notes as string[])[0]).toMatch(/hiring managers' orgs inside the reqs/)
  })

  it('refuses every filter but business unit and period in Finance mode, with the reason', () => {
    const conv = new Conversation()
    conv.tokens.index(finance)
    for (const [arg, value, word] of [
      ['department', ['Physical Design'], 'department'],
      ['location', ['Bengaluru'], 'location'],
      ['level', ['L4'], 'level'],
    ] as const) {
      const r = call(conv, envOf(finance), 'view_summary', { view: 'hrbp', filters: { [arg]: value } })
      expect(r.json.error, arg).toBe(financeFilterRefused(word))
    }
    const leader = call(conv, envOf(finance), 'view_summary', { view: 'hrbp', filters: { leader: '{{P1}}' } })
    expect(leader.json.error).toBe(financeFilterRefused('leader'))
    const excl = call(conv, envOf(finance), 'view_summary', {
      view: 'hrbp',
      filters: { business_unit: ['Go-to-Market'], exclude: ['business_unit'] },
    })
    expect(excl.json.error).toBe(FINANCE_NO_EXCLUDE)
    const bu = call(conv, envOf(finance), 'view_summary', {
      view: 'hrbp',
      filters: { business_unit: ['Go-to-Market'] },
    })
    expect(bu.isError).toBe(false)
    expect(bu.json.scope).toBe('Go-to-Market')
    const by = call(conv, envOf(finance), 'compare_groups', {
      view: 'hrbp',
      kpi: 'voluntary',
      by: 'location',
    })
    expect(by.json.error).toMatch(
      /^Finance mode filters by business unit and period only, so compare_groups compares by business_unit\.$/,
    )
    // get_context lists business units only.
    const context = call(conv, envOf(finance), 'get_context')
    expect(Object.keys(context.json.vocabularies as object).sort()).toEqual(['business_unit', 'note'])
    expect(context.json.mode).toBe('finance')
  })

  it("lists each scope's own vocabularies in get_context", () => {
    const u = unit.access.scope as UnitScope
    const conv = new Conversation()
    const v = (c: AnalyticsContext) =>
      call(conv, envOf(c), 'get_context').json.vocabularies as Record<string, { value: string }[]>
    expect(v(unit).business_unit?.map((x) => x.value)).toEqual([u.unit])
    const r = region.access.scope as RegionScope
    for (const l of v(region).location ?? []) expect(r.sites).toContain(l.value)
    const rec = v(reqs) as unknown as { business_unit: { reqs: number }[]; leaders: { reqs: number }[] }
    for (const b of rec.business_unit) expect(b.reqs).toBeGreaterThan(0)
    for (const l of rec.leaders) expect(l.reqs).toBeGreaterThan(0)
  })
})

describe('the prompt block per mode', () => {
  const tokenFor = (c: AnalyticsContext, conv: Conversation) => {
    conv.tokens.index(c)
    return scopePerson(c.access.scope, conv.tokens)
  }

  it('says the mode, its scope and what it does not show, a manager or recruiter as a token', () => {
    const conv = new Conversation()
    const line = (mode: Mode) => {
      const c = ctxOf(mode)
      return rolePromptLine(mode, c.access.scope, tokenFor(c, conv))
    }
    expect(line('hr')).toBeNull()
    expect(line('developer')).toBeNull()
    expect(line('chro')).toBe(
      'Census is in CHRO mode: every HR view. When asked for an overview, lead with the people scorecard and the top risks across practices.',
    )
    expect(line('hrbp-unit')).toBe(
      'Census is in HRBP mode for the Silicon Engineering business unit, at every location. Every number is for that unit; company numbers are comparisons only. The Data room and pay amounts are not available in this mode: say so when asked, and do not estimate them.',
    )
    const r = region.access.scope as RegionScope
    expect(line('hrbp-region')).toBe(
      `Census is in HRBP mode for the APAC region (${r.sites.join(', ')}), across business units. Every number is for that region; company numbers are comparisons only. The Data room and pay amounts are not available in this mode: say so when asked, and do not estimate them.`,
    )
    expect(line('finance')).toBe(
      'Census is in Finance mode: headcount, the hiring plan, requisitions and contractors, filtered by business unit. Cost totals are on Compensation, Workforce cost; they are never sent to you, so point there when asked. Individual pay is not available in any form.',
    )
    expect(line('recruiter')).toMatch(
      /^Census is in Recruiter mode for \{\{P\d+\}\}'s reqs\. Every number is about those reqs, their candidates and their starts; numbers for all reqs are comparisons only\. Other views are not available in this mode: say so when asked, and do not estimate them\.$/,
    )
    expect(line('manager')).toBe(managerPromptLine(tokenFor(ctxOf('manager'), conv) as string))
    // The practice modes name their own view first and what they do not show, from the policy.
    expect(line('compensation')).toBe(
      'Census is in Compensation mode for the whole company: Compensation, the Scorecard, People stats, Org chart (Chart), Talent (Overview, Performance) and Listening (Overview, Stay & exit). Recruiting, Onboarding, HR ops, Compliance and the Data room are not available in this mode: say so when asked, and do not estimate them.',
    )
    expect(line('talent-management')).toMatch(
      /^Census is in Talent management mode for the whole company: Talent, /,
    )
    expect(line('talent-management')).toMatch(
      /Recruiting, HR ops, Compensation, Compliance and the Data room are not available/,
    )
    // HR ops owns the data: the Data room is shown.
    expect(line('hr-ops')).toMatch(
      /^Census is in HR ops mode for the whole company: HR ops, .*the Data room\. /,
    )
    for (const mode of MODES) {
      const l = line(mode) ?? ''
      expect(l, mode).not.toMatch(/—/)
      expect(leaks(l), mode).toEqual([])
    }
  })

  it('goes after the cached system prompt in every request, and the tools carry one cache breakpoint', async () => {
    for (const mode of MODES) {
      const c = ctxOf(mode)
      const client = fakeClient([{ blocks: [{ type: 'text', text: 'Hello.' }] }])
      const conversation = new Conversation()
      await ask({ client, conversation, question: 'Hi', env: envOf(c) })
      const body = client.log.bodies[0] as unknown as {
        system: { text: string; cache_control?: unknown }[]
        tools: { name: string; cache_control?: unknown }[]
      }
      expect(body, mode).toBeDefined()
      const want = rolePromptLine(mode, c.access.scope, scopePerson(c.access.scope, conversation.tokens))
      expect(body.system[0]?.cache_control, mode).toEqual({ type: 'ephemeral' })
      if (want) {
        expect(body.system.length, mode).toBe(2)
        expect(body.system[1]?.text, mode).toBe(want)
        expect(body.system[1]?.cache_control, mode).toBeUndefined()
      } else expect(body.system.length, mode).toBe(1)
      expect(body.tools.filter((t) => t.cache_control).length, mode).toBe(1)
      expect(
        body.tools.map((t) => t.name),
        mode,
      ).toEqual(toolDefinitionsFor(c.access).map((t) => t.name))
      expect(leaks(JSON.stringify(body)), mode).toEqual([])
    }
  })
})

describe('Ask off for a scope under the anonymity minimum, in every scope kind', () => {
  const metrics = () => sampleCtx().metrics
  const at = (mode: Mode, scope: Partial<ScopeLock>, unset = false) =>
    askOff({ access: { mode, scope: scope as ScopeLock, unset }, metrics: metrics() })

  it('turns Ask off with a plain reason for each kind, and when the pick is missing', () => {
    expect(at('manager', { kind: 'org', size: 4 })).toBe(askScopeTooSmall('manager', 5))
    expect(at('hrbp-unit', { kind: 'unit', size: 4 })).toBe(
      'Ask needs a business unit of 5 or more employees in HRBP mode, so that no answer is about one person.',
    )
    expect(at('hrbp-region', { kind: 'region', size: 4 })).toBe(
      'Ask needs a region of 5 or more employees in HRBP mode, so that no answer is about one person.',
    )
    expect(at('recruiter', { kind: 'reqs', size: 4 })).toBe(
      'Ask needs 5 or more candidates on your reqs in Recruiter mode, so that no answer is about one person.',
    )
    for (const [mode, kind] of [
      ['manager', 'org'],
      ['hrbp-unit', 'unit'],
      ['hrbp-region', 'region'],
      ['recruiter', 'reqs'],
    ] as const)
      expect(at(mode, { kind, size: 5 }), mode).toBeNull()
    expect(at('hrbp-unit', { kind: 'unit', size: 0 }, true)).toBe(askNeedsPick('unit', 'hrbp-unit'))
    expect(askNeedsPick('recruiter', 'recruiter')).toBe(
      'Ask needs a recruiter picked in Recruiter mode. Choose one with Mode.',
    )
    // No scope (HR, Finance, Every recruiter): never off for its size.
    for (const mode of ['hr', 'finance', 'recruiter', 'chro'] as const)
      expect(askOff({ access: { mode, scope: null }, metrics: metrics() }), mode).toBeNull()
  })

  it('sends nothing for a small business unit, and runs no tool', async () => {
    // A business unit of 3 people, added to a copy of the sample.
    const base = sampleData()
    const extra = base.employees.slice(0, 3).map((e, i) => ({
      ...e,
      employeeId: `E9990${i}`,
      name: `Tiny Unit Person ${i}`,
      businessUnit: 'Tiny unit',
      managerId: base.employees[0]?.employeeId ?? null,
      terminationDate: null,
    }))
    const data: Datasets = { ...base, employees: [...base.employees, ...extra] }
    const tiny = sampleCtx({ data, access: { mode: 'hrbp-unit', picks: { unit: 'Tiny unit' } } })
    expect(tiny.access.scope?.kind).toBe('unit')
    expect(tiny.access.scope?.size).toBe(3)
    const r = call(new Conversation(), envOf(tiny), 'get_context')
    expect(r.json.error).toBe(askScopeTooSmall('unit', 5))
    const client = fakeClient(() => {
      throw new Error('Nothing may be sent')
    })
    const res = await ask({
      client,
      conversation: new Conversation(),
      question: 'How many people?',
      env: envOf(tiny),
    })
    expect(res.status).toBe('error')
    expect(res.error?.title).toBe(askScopeTooSmall('unit', 5))
    expect(client.log.bodies).toHaveLength(0)
  })

  it('turns Ask off in a scoped mode with no pick', () => {
    const none = sampleCtx({ access: { mode: 'hrbp-region', picks: {} } })
    expect(none.access.unset).toBe(true)
    expect(call(new Conversation(), envOf(none), 'view_summary', { view: 'hrbp' }).json.error).toBe(
      askNeedsPick('region', 'hrbp-region'),
    )
  })
})

describe('a recruiter by token', () => {
  it("never sends the recruiter's name: get_context, the scope and the prompt carry a token", () => {
    const s = reqs.access.scope as ReqsScope
    const conv = new Conversation()
    const r = call(conv, envOf(reqs), 'get_context')
    expect(String(r.json.mode_note)).toMatch(/^Census is in Recruiter mode for \{\{P\d+\}\}'s reqs\./)
    expect(r.content).not.toContain(s.recruiter)
    expect(leaks(r.content)).toEqual([])
    const token = scopePerson(s, conv.tokens) as string
    expect(conv.tokens.resolve(token)?.name).toBe(s.recruiter)
    expect(rolePromptLine('recruiter', s, token)).not.toContain(s.recruiter)
    expect(samplePicks().recruiter?.name).toBe(s.recruiter)
  })
})

describe('the screen tools inside each scope kind', () => {
  it('set_filters and reset_filters keep HRBP for a business unit inside it', async () => {
    const s = unit.access.scope as UnitScope
    const f = fakeApp(unit, { route: { view: 'hrbp', tab: 'overview' } })
    const env = envOf(unit, { app: f.app })
    const conv = new Conversation()
    const out = await callScreen(conv, env, 'set_filters', { business_unit: ['Corporate'] })
    expect(out.json.error).toBe('In HRBP mode a business unit filter must be Silicon Engineering.')
    const there = await callScreen(conv, env, 'set_filters', { location: ['Bengaluru'] })
    expect(there.isError).toBe(false)
    expect(f.app.screen().filters).toMatchObject({ businessUnit: [s.unit], location: ['Bengaluru'] })
    const reset = await callScreen(conv, env, 'reset_filters')
    expect(reset.isError).toBe(false)
    expect(f.app.screen().filters).toEqual(clampFilters({ ...DEFAULT_FILTERS, modes: {} }, s, 'hrbp-unit'))
    expect(reset.json.line).toBe('Reset the filters to Silicon Engineering, last 12 months')
  })

  it('set_filters and reset_filters keep HRBP for a region inside it', async () => {
    const s = region.access.scope as RegionScope
    const f = fakeApp(region, { route: { view: 'hrbp', tab: 'overview' } })
    const env = envOf(region, { app: f.app })
    const conv = new Conversation()
    const out = await callScreen(conv, env, 'set_filters', { location: ['Munich'] })
    expect(out.json.error).toBe(
      `In HRBP mode a location filter must be in ${s.region}: ${s.sites.join(', ')}.`,
    )
    const one = await callScreen(conv, env, 'set_filters', { location: [s.sites[0] as string] })
    expect(one.isError).toBe(false)
    expect(f.app.screen().filters.location).toEqual([s.sites[0]])
    const reset = await callScreen(conv, env, 'reset_filters')
    expect(f.app.screen().filters.location).toEqual([...s.sites])
    expect(reset.json.line).toBe(`Reset the filters to ${s.region}, last 12 months`)
  })

  it("refuses Finance's other filters on screen, and what Recruiter mode hides", async () => {
    const f = fakeApp(finance, { route: { view: 'home', tab: 'overview' } })
    const conv = new Conversation()
    const env = envOf(finance, { app: f.app })
    expect((await callScreen(conv, env, 'set_filters', { location: ['Bengaluru'] })).json.error).toBe(
      financeFilterRefused('location'),
    )
    expect(
      (await callScreen(conv, env, 'show_figure', { figure: 'talent-succession-exposure' })).json.error,
    ).toBe('That figure is not shown in Finance mode.')
    const ref = conv.refs.add({ kind: 'cases', title: 'Open cases', rows: [] } as never, 'Open cases')
    expect((await callScreen(conv, env, 'open_records', { ref })).json.error).toBe(kindNotShown('finance'))
    const r = fakeApp(reqs, { route: { view: 'home', tab: 'overview' } })
    const rEnv = envOf(reqs, { app: r.app })
    const hidden = await callScreen(new Conversation(), rEnv, 'open_view', { view: 'hrbp' })
    expect(hidden.json.error).toMatch(
      /^People stats is not shown in Recruiter mode\. Ask opens only what this mode shows/,
    )
    // Reset in Recruiter mode: every one of the recruiter's reqs, as a token.
    await callScreen(new Conversation(), rEnv, 'set_filters', { location: ['Bengaluru'] })
    const reset = await callScreen(new Conversation(), rEnv, 'reset_filters')
    expect(String(reset.json.line)).toMatch(/^Reset the filters to \{\{P\d+\}\}'s reqs, last 12 months$/)
  })

  it('refuses a call from an answer asked for another pick', async () => {
    const f = fakeApp(unit, { route: { view: 'hrbp', tab: 'overview' } })
    const env = envOf(unit, { app: f.app })
    expect((await callScreen(new Conversation(), env, 'get_screen')).isError).toBe(false)
    f.state.pick = 'Corporate'
    expect((await callScreen(new Conversation(), env, 'get_screen')).json.error).toBe(MODE_CHANGED)
    expect(call(new Conversation(), env, 'get_context').json.error).toBe(MODE_CHANGED)
    f.state.pick = undefined
    f.state.mode = 'hr'
    expect(call(new Conversation(), env, 'get_context').json.error).toBe(MODE_CHANGED)
  })
})
