/**
 * Managers see exits, never regretted exits, and no breakdown of why people left (docs/ROLES-V2.md,
 * "Decisions made", 7 and 8 Oct 2026): whether an exit was regretted is HR's call about named
 * leavers, and in a manager's org a reason group points at people.
 *
 * A crawl over every surface Manager mode shows, for an org under the anonymity minimum, a
 * mid-size org and a large one: each shown view's folder number, key figures and findings with the
 * records they open; People stats' tiles on every tab and the special analyses it shows; My team;
 * the Action center's lists, their records and the notes they copy; the person card of every
 * leaver; Ask's tools, its tool descriptions and its suggested questions; Help, the glossary, the
 * tours and the metric dictionary; and the Attrition tab's section words. None says "regretted",
 * none breaks exits down by reason, and none names a leaver's or a candidate's reason. HR on the
 * same org runs the same crawl and finds both, so a leak would be noticed.
 *
 * The figures, sections and panel stats are judged from the source: each one on a view Manager
 * mode shows whose words name regretted exits or reasons is hidden by the policy tables, or sits
 * behind a check of a metric Manager mode hides.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { HR_ACCESS } from '@/access/context'
import { leaderOptions } from '@/app/filterOptions'
import { Conversation } from '@/ask/engine/conversation'
import { noKeyQuestions, suggestionsFor } from '@/ask/engine/copy'
import { call, envOf, sampleCtx, sampleData } from '@/ask/engine/testkit'
import { toolDefinitionsFor } from '@/ask/engine/tools'
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Employee } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { personCardPlan } from '@/drill/person'
import { buildDrillTable, modeHiddenColumns } from '@/drill/records'
import { articleInMode, articlesInMode, glossaryInMode, tourInMode } from '@/help/access'
import { ARTICLES } from '@/help/articles'
import { buildGlossary } from '@/help/glossary'
import { articleText } from '@/help/markup'
import { TOURS } from '@/help/tours'
import { addMonths } from '@/lib/dates'
import { METRICS } from '@/metrics/catalog'
import { collectActions, composeNote, groupByOwner, type OpenAction, roleView } from '@/views/actions/engine'
import { view as hrbpView } from '@/views/hrbp'
import { analysisSummary } from '@/views/hrbp/analyses/registry'
import { ANALYSIS_KEYS, analysesTab, analysisSurface } from '@/views/hrbp/analyses/tab'
import { hrbpModel } from '@/views/hrbp/engine'
import { hrbpActions } from '@/views/hrbp/engine/actions'
import { attritionSections } from '@/views/hrbp/engine/attrition'
import { view as onboardingView } from '@/views/onboarding'
import { onboardingBase } from '@/views/onboarding/engine/base'
import { ORG_METRIC } from '@/views/org/metrics'
import { view as recruitingView } from '@/views/recruiting'
import { computeBase } from '@/views/recruiting/engine/base'
import { VIEWS } from '@/views/registry'
import { view as talentView } from '@/views/talent'
import { attritionCompare, practiceFindings, teamFindings, teamKpis, teamSources } from '@/views/team/engine'
import { findingsInMode, kpisInMode } from './numbers'
import { decide, MANAGER_POLICY } from './policy'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

/* ───────────── what must not show ───────────── */

const REGRET = /regret/i
/** Words only a breakdown of why people left uses. */
const REASON_WORDS =
  /why (people|candidates) left|\bexit reasons?\b|reasons? given|\btop reasons?\b|most common reason|most often [“"]|reasons? for (declining|leaving|withdrawing)/i

const data = sampleData()
/** Every reason of more than one word a leaver or a candidate gave in the sample ("My manager", "Accepted another offer"). */
const REASON_VALUES: readonly string[] = [
  ...new Set(
    [
      ...data.employees.map((e) => e.terminationReason),
      ...data.candidates.map((c) => c.rejectionReason),
    ].filter((r): r is string => !!r && /\s/.test(r)),
  ),
]

interface Hit {
  where: string
  text: string
}

/** The text a crawl collects, with what in it breaks the rule. */
class Crawl {
  readonly hits: Hit[] = []
  /** How many strings were read (so a crawl that reads nothing fails). */
  read = 0

  constructor(readonly ctx: AnalyticsContext) {}

  /** Every string in a value: objects and lists read through, field references (`uses`) left out. */
  text(where: string, v: unknown, depth = 0): void {
    if (v == null || depth > 8 || typeof v === 'function') return
    if (typeof v === 'string') {
      this.read++
      const reason = REASON_VALUES.find((r) => v.includes(r))
      if (REGRET.test(v) || REASON_WORDS.test(v) || reason) this.hits.push({ where, text: v.slice(0, 240) })
      return
    }
    if (Array.isArray(v)) {
      for (const [i, x] of v.entries()) this.text(`${where}[${i}]`, x, depth + 1)
      return
    }
    if (typeof v === 'object')
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (k === 'uses' || k === 'fingerprint') continue
        this.text(`${where}.${k}`, x, depth + 1)
      }
  }

  /** A drill's records as the panel lists and exports them: title, notes, column labels and cells. */
  records(where: string, src: Parameters<typeof resolveDrill>[0] | undefined): void {
    if (!src) return
    const spec = resolveDrill(src)
    if (!spec) return
    const t = buildDrillTable(spec, this.ctx)
    this.text(`${where} records`, [spec.title, spec.subtitle, (spec as { note?: string }).note])
    this.text(
      `${where} columns`,
      t.columns.map((c) => c.label),
    )
    for (const [i, r] of t.rows.slice(0, 60).entries())
      this.text(
        `${where} row ${i}`,
        t.columns.map((c) => r[c.key]),
      )
  }

  /** Key figures and findings as the strip and the readout show them, with their records. */
  numbers(where: string, kpis: readonly Kpi[], findings: readonly Finding[]): void {
    const access = this.ctx.access
    for (const k of kpisInMode(access, kpis)) {
      const { drill, deltaDrill, noteDrill, ...rest } = k
      this.text(`${where} tile ${k.id}`, rest)
      for (const d of [drill, deltaDrill, noteDrill]) this.records(`${where} tile ${k.id}`, d)
    }
    for (const f of findingsInMode(access, findings)) {
      const { drill, ...rest } = f
      this.text(`${where} finding ${f.id}`, rest)
      this.records(`${where} finding ${f.id}`, drill)
    }
  }
}

/* ───────────── the orgs ───────────── */

const hr = sampleCtx()
const leaders = leaderOptions(hr.org, hr.asOf, 3)
const withManager = (id: string) => !!hr.org.byId.get(id)?.managerId
/** Under the anonymity minimum (Ask is off there). */
const small = leaders.find((l) => l.size < 5 && withManager(l.id))!
/** The reviewer's mid-size org, or one like it. */
const mid = leaders.find((l) => l.id === 'E10427') ?? leaders.find((l) => l.size >= 25 && l.size <= 90)!
/** The largest org with a manager above it (a business unit). */
const large = leaders.filter((l) => withManager(l.id)).sort((a, b) => b.size - a.size)[0]

const managerCtx = (managerId: string): AnalyticsContext =>
  sampleCtx({ access: { mode: 'manager', managerId } })

const labels = new Map(VIEWS.map((v) => [v.key as string, v]))
const labelOf = (view: string, tab: string) => {
  const v = labels.get(view)
  const t = v?.tabs.find((x) => x.key === tab)
  return t ? `${v?.label}, ${t.label}` : (v?.label ?? view)
}

/** The crawl of one context: every surface it shows. */
function crawl(ctx: AnalyticsContext): Crawl {
  const c = new Crawl(ctx)
  const access = ctx.access
  const shown = (s: string) => access.can(s)

  // Each shown view's folder number, key figures, findings and their records.
  for (const v of VIEWS) {
    if (!shown(`view:${v.key}`) || v.key === 'home') continue
    c.text(`${v.key} headline`, v.headline(ctx))
    const s = v.summary?.(ctx)
    if (s) c.numbers(v.key, s.kpis, s.findings)
  }

  // People stats: the tiles of every tab, and each special analysis the mode shows.
  const m = hrbpModel(ctx)
  c.numbers('hrbp tabs', [...m.kpi.kpis, ...m.movementKpis, ...m.orgKpis], m.findings)
  for (const key of ANALYSIS_KEYS) {
    if (!shown(analysisSurface(key))) continue
    const a = analysisSummary(ctx, key)
    c.numbers(`hrbp ${key}`, a.kpis, a.findings)
    c.text(`hrbp ${key} tables`, a.tables)
  }
  // The Attrition tab's section words, as the mode reads them.
  c.text(
    'hrbp attrition sections',
    attritionSections(
      {
        reasons: shown('metric:hrbp.attrition.exitReasons'),
        regretted: shown('metric:hrbp.attrition.regretted'),
      },
      ctx.window.label,
    ),
  )

  // My team (Manager mode's home): its tiles, its findings and the attrition comparison.
  if (shown('view:team')) {
    const s = teamSources(ctx)
    c.numbers('team', teamKpis(s, labelOf, ctx), [])
    for (const f of teamFindings(
      ctx,
      practiceFindings(s, {
        hrbp: hrbpView,
        recruiting: recruitingView,
        onboarding: onboardingView,
        talent: talentView,
      }),
    )) {
      const { drill, ...rest } = f.finding
      c.text(`team finding ${f.finding.id}`, rest)
      c.records(`team finding ${f.finding.id}`, drill)
    }
    c.text(
      'team attrition',
      attritionCompare(s.hrbp, shown).map((r) => r.measure),
    )
    c.numbers('recruiting tabs', s.recruiting.kpis, s.recruiting.findings)
    c.numbers(
      'onboarding tabs',
      [...s.onboarding.kpis.upcoming, ...s.onboarding.kpis.first90],
      s.onboarding.findings,
    )
    c.numbers('talent tabs', s.talent.kpis, s.talent.findings)
  }

  // The Action center: both lists, every open item, their records and the notes they copy.
  if (shown('page:actions')) {
    const v = roleView(collectActions(ctx, VIEWS), ctx, () => true)
    const items: OpenAction[] = [...v.needs, ...v.waiting, ...v.open]
    for (const a of items) {
      const { what, note, forOwner, subject, closesWhen } = a.item
      c.text(`item ${a.id}`, { what, note, forOwner, subject, closesWhen })
      c.records(`item ${a.id}`, a.item.drill)
    }
    for (const g of groupByOwner(items, ctx.asOf))
      for (const o of g.owners)
        c.text(`note to ${o.name}`, composeNote({ name: o.name, isTeam: o.isTeam }, o.items, ctx.asOf))
  }

  // The person card of every leaver in the scope.
  for (const e of ctx.data.employees.filter((x) => x.terminationDate))
    if (personCardPlan(ctx, e).exitDetail)
      c.hits.push({ where: `person ${e.employeeId}`, text: 'exit reason and regrettable' })

  // Ask: its tools, its tool descriptions and its suggested questions.
  if (shown('ask')) {
    const conv = new Conversation()
    const env = envOf(ctx)
    const ask = (name: string, input: unknown) => {
      const r = call(conv, env, name, input)
      c.text(`ask ${name} ${JSON.stringify(input)}`, r.json)
      return r.json
    }
    for (const v of VIEWS)
      if (shown(`view:${v.key}`) && v.summary && v.key !== 'home') ask('view_summary', { view: v.key })
    for (const key of ANALYSIS_KEYS)
      if (shown(analysisSurface(key))) ask('view_summary', { view: 'hrbp', tab: analysesTab(key) })
    for (const query of ['regretted', 'exit reasons', 'why people left', 'reasons', 'attrition', 'exits'])
      ask('find_metrics', { query })
    ask('get_context', {})
    ask('open_items', {})
    // A refusal lists only the key figures the mode shows.
    ask('compare_groups', { view: 'hrbp', kpi: 'nothing', by: 'department' })
    for (const k of kpisInMode(access, hrbpView.summary?.(ctx).kpis ?? []))
      ask('compare_groups', { view: 'hrbp', kpi: k.id, by: 'department' })
    c.text(
      'ask tools',
      toolDefinitionsFor(access).map((t) => t.description),
    )
  }
  for (const v of VIEWS) {
    if (!shown(`view:${v.key}`)) continue
    c.text(
      `ask questions ${v.key}`,
      suggestionsFor(v.key, null, (k) => shown(analysisSurface(k)), access.mode),
    )
    c.text(
      `ask questions before a key ${v.key}`,
      noKeyQuestions({
        mode: access.mode,
        scoped: !!access.scope,
        viewShown: (x) => shown(`view:${x}`),
        view: v.key,
      }),
    )
  }

  // Help: the articles, the glossary and the tours as the mode shows them.
  for (const a of articlesInMode(access, ARTICLES))
    c.text(`article ${a.id}`, articleText(articleInMode(access, a)))
  c.text('glossary', glossaryInMode(access, buildGlossary(METRICS)))
  for (const t of TOURS) {
    const tour = tourInMode(access, t)
    if (tour) c.text(`tour ${t.id}`, [tour.summary, ...tour.steps.map((s) => [s.title, s.body])])
  }

  // The metric dictionary as Settings, Formulas lists it.
  for (const d of METRICS) {
    if (!access.can(`metric:${d.id}`, undefined, { metricViews: () => d.views as readonly string[] }))
      continue
    c.text(`metric ${d.id}`, {
      name: d.name,
      definition: d.definition,
      formula: d.formula,
      population: d.population,
      window: d.window,
      params: (d.params ?? []).map((p) => [p.label, p.description]),
    })
  }
  return c
}

const report = (hits: readonly Hit[]) => hits.slice(0, 12).map((h) => `${h.where}: ${h.text}`)

/* ───────────── the crawl ───────────── */

describe('a Manager mode crawl over every shown surface', () => {
  it('has the orgs it needs: under 5, mid-size and large', () => {
    expect(small.size).toBeLessThan(5)
    expect(mid.size).toBeGreaterThanOrEqual(25)
    expect(large.size).toBeGreaterThan(300)
  })

  for (const [name, org] of [
    ['an org under 5', () => small],
    ['a mid-size org', () => mid],
    ['a large org', () => large],
  ] as const)
    it(`finds no "regretted" and no reason breakdown in ${name}`, () => {
      const ctx = managerCtx(org().id)
      expect(ctx.access.mode).toBe('manager')
      const c = crawl(ctx)
      expect(c.read, 'the crawl read the pages').toBeGreaterThan(2000)
      expect(report(c.hits)).toEqual([])
    }, 120_000)

  it('finds both in HR mode on the same org, so a leak would be noticed', () => {
    const c = crawl(sampleCtx({ filters: { leaderId: large.id } }))
    expect(c.hits.some((h) => REGRET.test(h.text))).toBe(true)
    expect(
      c.hits.some((h) => REASON_WORDS.test(h.text) || REASON_VALUES.some((r) => h.text.includes(r))),
    ).toBe(true)
  }, 120_000)
})

/* ───────────── the policy tables ───────────── */

describe('the policy tables say it, so the Security center sees it', () => {
  const at = (view: string, tab: string) => ({ view, tab })

  it('hides the regretted metrics, the reason breakdowns and their figures in Manager mode only', () => {
    const metrics = [
      'hrbp.attrition.regretted',
      'hrbp.findings.regrettedCluster',
      'talent.retention.regrettedHigh',
      'talent.finding.hipoExits',
      'org.team.regrettedExits',
      'hrbp.attrition.exitReasons',
      'recruiting.flow.exitReasons',
      'recruiting.offers.declineReasons',
    ]
    for (const id of metrics) {
      expect(decide('manager', `metric:${id}`).access, id).toBe('hidden')
      expect(decide('hr', `metric:${id}`).access, id).toBe('shown')
    }
    const figures: [string, string, string][] = [
      ['hrbp-regretted-quarter', 'hrbp', 'attrition'],
      ['hrbp-regretted-leavers', 'hrbp', 'attrition'],
      ['hrbp-exit-reasons', 'hrbp', 'attrition'],
      ['hrbp-exit-survey', 'hrbp', 'attrition'],
      ['recruiting-exit-reasons', 'recruiting', 'sources'],
      ['talent-regretted-high-performers', 'talent', 'retention'],
    ]
    for (const [id, view, tab] of figures) {
      expect(decide('manager', `figure:${id}`, at(view, tab)).access, id).toBe('hidden')
      expect(decide('hr', `figure:${id}`, at(view, tab)).access, id).toBe('shown')
    }
  })

  it("leaves a leaver's exit reason and regrettable flag and a candidate's reason out of the records", () => {
    expect(MANAGER_POLICY.hiddenColumns).toEqual([
      'employees.terminationReason',
      'employees.regrettable',
      'candidates.rejectionReason',
    ])
    const ctx = managerCtx(mid.id)
    for (const col of MANAGER_POLICY.hiddenColumns ?? []) {
      const d = decide('manager', `column:${col}`)
      expect(d.access, col).toBe('hidden')
      expect(d.how, col).toMatch(/\.$/)
      expect(decide('hr', `column:${col}`).access, col).toBe('shown')
      const [kind, key] = col.split('.')
      expect(modeHiddenColumns(kind as 'employees', ctx.access).has(key), col).toBe(true)
      expect(modeHiddenColumns(kind as 'employees', HR_ACCESS).has(key), col).toBe(false)
    }
    // A column Manager mode does not name follows its records.
    expect(decide('manager', 'column:employees.terminationDate').access).toBe('shown')
    expect(decide('manager', 'column:cases.subcategory').access).toBe('hidden')
  })

  it('reads the hidden columns nowhere: the person card, Ask and the engines', () => {
    const ctx = managerCtx(mid.id)
    const leavers = ctx.data.employees.filter((e) => e.terminationDate)
    expect(leavers.length).toBeGreaterThan(0)
    for (const e of leavers) expect(personCardPlan(ctx, e).exitDetail, e.employeeId).toBe(false)
    expect(personCardPlan(hr, leavers[0]).exitDetail).toBe(true)
    expect(computeBase(ctx).showCandidateReasons).toBe(false)
    expect(computeBase(ctx).showDeclineReasons).toBe(false)
    expect(onboardingBase(ctx).showsReasons).toBe(false)
    expect(onboardingBase(hr).showsReasons).toBe(true)
    // People stats' model holds no regretted exit and no reason group in Manager mode.
    const a = hrbpModel(ctx).attrition
    expect([a.reasons, a.regrettedByQuarter, a.regrettedLeavers, a.regretted]).toEqual([[], [], [], []])
    expect(a.company.regretted).toBeNull()
    expect(hrbpModel(sampleCtx({ filters: { leaderId: mid.id } })).attrition.reasons.length).toBeGreaterThan(
      0,
    )
    // Ask refuses a cut by any of the three, and says why.
    const conv = new Conversation()
    for (const [dataset, field] of [
      ['employees', 'terminationReason'],
      ['employees', 'regrettable'],
      ['candidates', 'rejectionReason'],
    ]) {
      const r = call(conv, envOf(ctx), 'query_records', { dataset, group_by: [{ field }] }).json
      expect(String(r.error), field).toMatch(/is not available\. .* not shown in Manager mode/)
      const where = call(conv, envOf(ctx), 'query_records', {
        dataset,
        where: [{ field, op: 'eq', value: true }],
      }).json
      expect(where.error, field).toBeTruthy()
    }
  })
})

/* ───────────── stay conversations ───────────── */

describe('stay conversations count every exit for the manager', () => {
  /** Employees who left the manager's team in the 12 months to the as-of date, recounted from the roster. */
  const exitsFrom = (c: AnalyticsContext, managerId: string): Employee[] => {
    const lo = addMonths(c.asOf, -12)
    return c.all.employees.filter(
      (e) =>
        e.managerId === managerId &&
        e.employmentType === 'Employee' &&
        !!e.terminationDate &&
        e.terminationDate > lo &&
        e.terminationDate <= c.asOf,
    )
  }

  it('lists the same leavers the Org chart counts, never only the regretted ones', () => {
    const hrItems = hrbpActions(hr).filter((i) => i.id.startsWith('hrbp:stay-conversations:'))
    // The sample's story: a team with regretted exits and other exits besides.
    const item = hrItems.find((i) => {
      const id = i.id.split(':')[2]
      return i.ownerRole === 'manager' && exitsFrom(hr, id).some((e) => !e.regrettable)
    })
    expect(item, 'a stay conversation for a team with other exits too').toBeDefined()
    if (!item) return
    const managerId = item.id.split(':')[2]
    const ctx = managerCtx(managerId)
    const mine = hrbpActions(ctx).find((i) => i.id === item.id)!
    const exits = resolveDrill(mine.drill)!.rows as Employee[]
    const regretted = resolveDrill(item.drill)!.rows as Employee[]
    expect(exits.length).toBeGreaterThan(regretted.length)
    expect(new Set(exits.map((e) => e.employeeId))).toEqual(
      new Set(exitsFrom(ctx, managerId).map((e) => e.employeeId)),
    )
    expect(mine.what).toMatch(new RegExp(`^${exits.length} exits from `))
    expect(`${mine.what} ${mine.note}`).not.toMatch(REGRET)
    // The note HR copies to the manager says the same, dated from the team's latest exit.
    expect(item.forOwner?.what).toMatch(new RegExp(`^${exits.length} exits from your team`))
    expect(item.forOwner?.due).toBe(mine.due)
    expect(item.what).toMatch(/regretted exits/)
  })
})

/* ───────────── the source: figures, sections and panel stats ───────────── */

const VIEWS_DIR = fileURLToPath(new URL('../views', import.meta.url))

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) tsxFiles(path, out)
    else if (name.endsWith('.tsx')) out.push(path)
  }
  return out
}

const BACKSLASH = String.fromCharCode(92)

/** Each opening tag of these components: its text (props only) and where it starts. */
function tags(src: string): { tag: string; at: number }[] {
  const out: { tag: string; at: number }[] = []
  const re = /<(Figure|Section|Stat|LinkedSurvey)\s/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const stack: string[] = []
    let i = m.index + m[0].length
    for (; i < src.length; i++) {
      const ch = src[i]
      const top = stack[stack.length - 1]
      if (top === "'" || top === '"' || top === '`') {
        if (ch === BACKSLASH) i++
        else if (ch === top) stack.pop()
        else if (top === '`' && ch === '$' && src[i + 1] === '{') {
          stack.push('{')
          i++
        }
        continue
      }
      if (ch === "'" || ch === '"' || ch === '`' || ch === '{') stack.push(ch)
      else if (ch === '}') stack.pop()
      else if (ch === '>' && !stack.length) break
    }
    out.push({ tag: src.slice(m.index, i + 1), at: m.index })
  }
  return out
}

/** The words in a tag: its string literals and the fixed parts of its template literals. */
const wordsOf = (tag: string): string =>
  [...tag.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '').join(' ')

/**
 * Figures and panel stats on a view Manager mode shows whose words name regretted exits, each
 * behind a check of the regretted metric (hidden in Manager mode): the check's name in the tag or
 * just before it, and where that name is set.
 */
const GATED: readonly { file: string; id: string; gate: RegExp; set: RegExp; surface: string }[] = [
  {
    file: 'hrbp/ui/OrgDesign.tsx',
    id: 'title="Managers"',
    gate: /withRegretted/,
    set: /const withRegretted = ctx\.access\.can\(`metric:\$\{ID\.regretted\}`\)/,
    surface: 'metric:hrbp.attrition.regretted',
  },
  {
    file: 'hrbp/ui/Overview.tsx',
    id: 'hrbp-scorecard',
    gate: /withRegretted/,
    set: /const withRegretted = ctx\.access\.can\(`metric:\$\{ID\.regretted\}`\)/,
    surface: 'metric:hrbp.attrition.regretted',
  },
  {
    file: 'hrbp/ui/OrgDesign.tsx',
    id: 'hrbp-managers',
    gate: /withRegretted/,
    set: /const withRegretted = ctx\.access\.can\(`metric:\$\{ID\.regretted\}`\)/,
    surface: 'metric:hrbp.attrition.regretted',
  },
  {
    file: 'hrbp/ui/Trends.tsx',
    id: 'hrbp-attrition-trailing',
    gate: /withRegretted|kind/,
    set: /const withRegretted = ctx\.access\.can\(`metric:\$\{ID\.regretted\}`\)\s+const kind: TrailingKind = withRegretted \? picked : 'voluntary'/,
    surface: 'metric:hrbp.attrition.regretted',
  },
  {
    file: 'team/ui/People.tsx',
    id: 'team-attrition-vs-company',
    gate: /regretted \?/,
    set: /const regretted = shownMetric\(ID\.regretted\)/,
    surface: 'metric:hrbp.attrition.regretted',
  },
  {
    file: 'org/ui/DetailPanel.tsx',
    id: 'Regretted, ',
    gate: /shows\(ORG_METRIC\.teamRegretted\) && \($/,
    set: /const shows = \(metric: string\) => access\.can\(S\.metric\(metric\)\)/,
    surface: `metric:${ORG_METRIC.teamRegretted}`,
  },
]

describe('every figure, section and panel stat Manager mode shows', () => {
  const managerViews = VIEWS.filter((v) => decide('manager', `view:${v.key}`).access !== 'hidden').map(
    (v) => v.key as string,
  )

  it('names regretted exits or reasons only where Manager mode hides it', () => {
    const problems: string[] = []
    let seen = 0
    for (const path of tsxFiles(VIEWS_DIR)) {
      const file = relative(VIEWS_DIR, path).replaceAll(BACKSLASH, '/')
      const view = file.split('/')[0]
      if (!managerViews.includes(view)) continue
      // A file that is one tab ("SourcesTab.tsx") on a tab Manager mode hides shows nothing there.
      const tab = file.match(/\/(\w+)Tab\.tsx$/)?.[1].toLowerCase()
      if (tab && VIEWS.find((v) => v.key === view)?.tabs.some((t) => t.key === tab))
        if (decide('manager', `tab:${view}.${tab}`).access === 'hidden') continue
      const src = readFileSync(path, 'utf8')
      for (const { tag, at } of tags(src)) {
        seen++
        const words = wordsOf(tag)
        if (!REGRET.test(words) && !REASON_WORDS.test(words)) continue
        const id = tag.match(/\bid="([^"]+)"/)?.[1]
        if (
          id &&
          /^<(Figure|LinkedSurvey)/.test(tag) &&
          decide('manager', `figure:${id}`).access === 'hidden'
        )
          continue
        const g = GATED.find((x) => file === x.file && (tag.includes(`id="${x.id}"`) || tag.includes(x.id)))
        const before = src.slice(Math.max(0, at - 160), at).trimEnd()
        if (
          g &&
          (g.gate.test(tag) || g.gate.test(before)) &&
          g.set.test(src) &&
          decide('manager', g.surface).access === 'hidden'
        )
          continue
        problems.push(`${file}: ${tag.replace(/\s+/g, ' ').slice(0, 160)}`)
      }
    }
    expect(seen).toBeGreaterThan(100)
    expect(problems).toEqual([])
  })
})

/* ───────────── Ask's questions ───────────── */

describe("Ask's suggested questions in Manager mode", () => {
  it('ask about the org, never about what the mode hides', () => {
    for (const view of ['hrbp', 'recruiting', 'onboarding', 'talent'] as const) {
      const qs = suggestionsFor(view, null, () => true, 'manager')
      expect(qs, view).toHaveLength(4)
      for (const q of qs) {
        expect(q, view).not.toMatch(REGRET)
        expect(q, view).not.toMatch(/reasons?|sources?|hiring plan|rate their|key talent at risk/i)
      }
      // HR keeps its own.
      expect(suggestionsFor(view, null, () => true, 'hr')).not.toEqual(qs)
    }
  })
})
