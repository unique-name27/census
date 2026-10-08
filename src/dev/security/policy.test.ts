/**
 * The Security center's policy layer (docs/SECURITY-CENTER.md, "Tests"): overrides change exactly
 * the targeted decisions in the matrix and never Developer's; a view an override hides takes what
 * sits on it along; pay, home and the Mode menu follow the role settings; every guard rail is
 * refused in the editor and line by line in a file; loading every kind of file; and a publish round
 * trip gives the same decisions.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { accessMatrix, matrixText } from '@/access/matrix'
import { homeOf, MODES, type Mode, modeOffered } from '@/access/modes'
import {
  buildPolicyFile,
  checksumOf,
  draftChanges,
  emptyDraft,
  GUARD_ORDER,
  GUARD_RAILS,
  type GuardId,
  guardEnv,
  guardRailFor,
  loadInForce,
  overridesOf,
  type PolicyLine,
  type PolicyRole,
  policyFileText,
  readPolicyFile,
  resetPolicyState,
  setInDraft,
  setInForce,
} from '@/access/overrides'
import { payView, showCostIn, showPayIn } from '@/access/pay'
import { decide, decideUnder, routeDecision, setPolicyOverrides } from '@/access/policy'
import { SECURITY_INVENTORY, surfaceCatalog, surfaceLabel } from './inventory'

afterEach(() => resetPolicyState())

const AT = '2026-10-08T09:00:00.000Z'
const line = (
  role: PolicyRole,
  surface: string,
  decision: string,
  extra: Partial<PolicyLine> = {},
): PolicyLine => ({
  role,
  surface,
  decision,
  reason: 'Finance asked for the hiring plan',
  by: 'Ana Ruiz',
  at: AT,
  ...extra,
})

const catalog = surfaceCatalog()
const grid = () => accessMatrix(SECURITY_INVENTORY)

/** Every cell that differs between two matrices, as "surface mode". */
function diff(a: ReturnType<typeof grid>, b: ReturnType<typeof grid>): string[] {
  const out: string[] = []
  for (let i = 0; i < a.length; i++)
    for (const m of MODES)
      if (a[i].decisions[m].access !== b[i].decisions[m].access) out.push(`${a[i].surface} ${m}`)
  return out
}

describe('overrides on the matrix', () => {
  const before = grid()

  it('change exactly the targeted decisions, and never Developer', () => {
    const lines = [
      line('finance', 'ask:make_chart', 'hidden'),
      line('hr-ops', 'export:monthly-report', 'hidden'),
      line('compensation', 'settings:device', 'hidden'),
      line('recruiter', 'help:article:exporting', 'hidden'),
      line('talent-management', 'export:view', 'shown'),
    ]
    setPolicyOverrides(overridesOf(lines))
    const after = grid()
    expect(after.map((r) => r.surface)).toEqual(before.map((r) => r.surface))
    const changed = diff(before, after)
    // `export:view` is limited for Talent management by default, so shown changes its cell too.
    expect(changed.sort()).toEqual(
      [
        'ask:make_chart finance',
        'export:monthly-report hr-ops',
        'settings:device compensation',
        'help:article:exporting recruiter',
        'export:view talent-management',
      ].sort(),
    )
    for (const r of after) expect(r.decisions.developer.access).toBe('shown')
  })

  it('leaves the snapshot text as it was once the overrides are gone', () => {
    setPolicyOverrides(overridesOf([line('finance', 'view:recruiting', 'hidden')]))
    expect(matrixText(grid())).not.toBe(matrixText(before))
    setPolicyOverrides(null)
    expect(matrixText(grid())).toBe(matrixText(before))
  })

  it('carries a hidden view to its tabs, figures, header, metrics and address, in that role only', () => {
    setPolicyOverrides(overridesOf([line('hr', 'view:recruiting', 'hidden')]))
    const after = grid()
    const changed = diff(before, after)
    expect(changed.every((c) => c.endsWith(' hr'))).toBe(true)
    expect(changed).toContain('view:recruiting hr')
    expect(changed).toContain('tab:recruiting.pipeline hr')
    expect(changed).toContain('header:recruiting hr')
    expect(decide('hr', 'figure:recruiting-time-to-fill').access).toBe('hidden')
    expect(decide('hr', 'kpi:x', { view: 'recruiting', tab: 'overview' }).access).toBe('hidden')
    expect(
      decide('hr', 'metric:recruiting.reqs.open', undefined, { metricViews: () => ['recruiting'] }).access,
    ).toBe('hidden')
    // A metric also listed on a view still shown stays.
    expect(
      decide('hr', 'metric:recruiting.reqs.open', undefined, {
        metricViews: () => ['recruiting', 'scorecard'],
      }).access,
    ).toBe('shown')
    const r = routeDecision('hr', { view: 'recruiting', tab: 'pipeline' })
    expect(r.redirected).toBe(true)
    expect(r.route.view).toBe('scorecard')
    expect(decide('chro', 'view:recruiting').access).toBe('shown')
  })

  it('brings a hidden view back with its tabs and figures in an allowlist role', () => {
    expect(decide('finance', 'view:services').access).toBe('hidden')
    expect(decide('finance', 'figure:services-backlog', { view: 'services', tab: 'cases' }).access).toBe(
      'hidden',
    )
    setPolicyOverrides(overridesOf([line('finance', 'view:services', 'shown')]))
    expect(decide('finance', 'view:services').access).toBe('shown')
    expect(decide('finance', 'tab:services.cases').access).toBe('shown')
    expect(decide('finance', 'figure:services-backlog', { view: 'services', tab: 'cases' }).access).toBe(
      'shown',
    )
    expect(routeDecision('finance', { view: 'services', tab: 'cases' }).redirected).toBe(false)
    // A tab hidden next to the view stays hidden, and its address goes to the first shown tab.
    setPolicyOverrides(
      overridesOf([
        line('finance', 'view:services', 'shown'),
        line('finance', 'tab:services.cases', 'hidden'),
      ]),
    )
    expect(decide('finance', 'tab:services.cases').access).toBe('hidden')
    const r = routeDecision('finance', { view: 'services', tab: 'cases' })
    expect(r.redirected).toBe(true)
    expect(r.route.tab).toBe('overview')
  })

  it('keeps a shown figure hidden while its view is hidden, and Ask tools off with Ask', () => {
    setPolicyOverrides(
      overridesOf([
        line('hr', 'view:comp', 'hidden'),
        line('hr', 'figure:comp-compa-distribution', 'shown'),
        line('hr', 'ask', 'hidden'),
      ]),
    )
    expect(decide('hr', 'figure:comp-compa-distribution').access).toBe('hidden')
    expect(decide('hr', 'ask:query_records').access).toBe('hidden')
  })

  it('hides a Special analysis and sends its address to one still shown', () => {
    setPolicyOverrides(overridesOf([line('hrbp-unit', 'tab:hrbp.analyses:quality', 'hidden')]))
    expect(decide('hrbp-unit', 'tab:hrbp.analyses:quality').access).toBe('hidden')
    const r = routeDecision('hrbp-unit', { view: 'hrbp', tab: 'analyses:quality' })
    expect(r.redirected).toBe(true)
    expect(r.route.tab).toBe('analyses:declines')
  })

  it('never shows a Developer-only surface outside Developer, whatever the line says', () => {
    setPolicyOverrides(new Map([['hr', new Map([['ask:console', { access: 'shown' as const }]])]]))
    expect(decide('hr', 'ask:console').access).toBe('hidden')
    expect(decide('developer', 'ask:console').access).toBe('shown')
  })

  it('sets the pay view from the pay surfaces, amounts still behind the switch', () => {
    setPolicyOverrides(
      overridesOf([
        line('finance', 'pay:switch', 'shown'),
        line('finance', 'pay:amounts', 'shown'),
        line('finance', 'pay:totals', 'shown'),
        line('hr-ops', 'pay:totals', 'limited'),
      ]),
    )
    expect(payView('finance')).toBe('switch')
    expect(showPayIn('finance', false)).toBe(false)
    expect(showPayIn('finance', true)).toBe(true)
    expect(payView('hr-ops')).toBe('totals')
    expect(showCostIn('hr-ops', false)).toBe(true)
    expect(payView('compensation')).toBe('switch')
    setPolicyOverrides(null)
    expect(payView('finance')).toBe('totals')
  })

  it('sets a role home and its place in the Mode menu', () => {
    setPolicyOverrides(
      overridesOf([line('finance', 'role:home', 'comp'), line('chro', 'role:offered', 'hidden')]),
    )
    expect(homeOf('finance').view).toBe('comp')
    expect(modeOffered('chro')).toBe(false)
    expect(modeOffered('developer')).toBe(true)
    const r = routeDecision('finance', { view: 'talent', tab: '' })
    expect(r.route.view).toBe('comp')
    setPolicyOverrides(null)
    expect(homeOf('finance').view).toBe('home')
    expect(modeOffered('chro')).toBe(true)
  })
})

/* ───────────── guard rails ───────────── */

/** One attempt per guard rail, each a line a person might try. */
const ATTEMPTS: Readonly<Record<GuardId, PolicyLine>> = {
  'developer-role': line('hr', 'view:recruiting', 'hidden', { role: 'developer' as PolicyRole }),
  protected: line('hr', 'person:gender', 'shown'),
  'er-names': line('hr-ops', 'person:er-cases', 'shown'),
  'survey-person': line('hr', 'drill:surveyRespondents', 'shown'),
  minimums: line('hr', 'minimum:group', '3'),
  switches: line('finance', 'pay:amounts', 'shown'),
  'developer-only': line('hr', 'tab:dev.security', 'shown'),
  scope: line('manager', 'person:outside-org', 'shown'),
  'cost-totals': line('hr-ops', 'pay:totals', 'limited'),
}

describe('guard rails', () => {
  it('lists every rail with a sentence', () => {
    for (const id of GUARD_ORDER) expect(GUARD_RAILS[id]).toMatch(/^[A-Z].*\.$/)
  })

  it('are refused in the editor, with the rule as the reason', () => {
    for (const [id, l] of Object.entries(ATTEMPTS) as [GuardId, PolicyLine][]) {
      const env = guardEnv([l])
      expect(guardRailFor(l, env), id).toBe(id)
    }
    // Hiding never crosses one, and a pay amount shown with its switch passes.
    expect(guardRailFor(line('hr', 'person:gender', 'hidden'), guardEnv([]))).toBeNull()
    const both = [line('finance', 'pay:switch', 'shown'), line('finance', 'pay:amounts', 'shown')]
    expect(guardRailFor(both[1], guardEnv(both))).toBeNull()
    // A scoped role's edge can be narrowed, never widened.
    expect(guardRailFor(line('manager', 'person:outside-org', 'hidden'), guardEnv([]))).toBeNull()
    expect(guardRailFor(line('finance', 'filter:leader', 'shown'), guardEnv([]))).toBe('scope')
    expect(guardRailFor(line('hrbp-unit', 'ui:kpi-delta-company', 'shown'), guardEnv([]))).toBe('scope')
    expect(guardRailFor(line('hr', 'minimum:group', '8'), guardEnv([]))).toBeNull()
    expect(guardRailFor(line('hr', 'minimum:survey-manager-cut', '6'), guardEnv([]))).toBe('survey-person')
  })

  it('are rejected line by line in a policy file, while the rest applies', () => {
    for (const [id, bad] of Object.entries(ATTEMPTS) as [GuardId, PolicyLine][]) {
      const good = line('finance', 'ask:make_chart', 'hidden')
      const file = buildPolicyFile({
        lines: [good, bad],
        publishedBy: 'Ana Ruiz',
        notes: '',
        now: new Date(AT),
      })
      const r = readPolicyFile(policyFileText(file), catalog)
      expect(r.ok, id).toBe(true)
      if (!r.ok) continue
      expect(r.lines, id).toEqual([good])
      expect(
        r.skipped.map((s) => [s.index, s.kind, s.why]),
        id,
      ).toEqual([[1, 'guard', GUARD_RAILS[id]]])
    }
  })
})

/* ───────────── loading ───────────── */

const envOf = (
  got: { status: 'ok'; text: string } | { status: 'missing' } | Error,
  oneFile = false,
  embedded: string | null = null,
) => ({
  oneFile,
  embedded,
  catalog,
  fetchFile: async () => {
    if (got instanceof Error) throw got
    return got
  },
})

const goodLines = [
  line('finance', 'view:recruiting', 'hidden'),
  line('chro', 'export:monthly-report', 'hidden'),
]
const goodFile = () =>
  buildPolicyFile({ lines: goodLines, publishedBy: 'Ana Ruiz', notes: 'First rules', now: new Date(AT) })

describe('loading the policy file', () => {
  it('uses the built-in defaults when there is no file, or the site cannot be reached', async () => {
    for (const got of [
      { status: 'missing' as const },
      new Error('offline'),
      { status: 'ok' as const, text: '  ' },
    ]) {
      const f = await loadInForce(envOf(got))
      expect(f.source).toBe('defaults')
      expect(f.lines).toEqual([])
      expect(f.ignored).toBeNull()
    }
  })

  it('applies a valid file, with its facts', async () => {
    const f = await loadInForce(envOf({ status: 'ok', text: policyFileText(goodFile()) }))
    expect(f.source).toBe('site')
    expect(f.lines).toEqual(goodLines)
    expect(f.file).toMatchObject({
      publishedBy: 'Ana Ruiz',
      notes: 'First rules',
      version: 1,
      publishedAt: AT,
    })
    expect(f.file?.checksum).toMatch(/^sha256-[0-9a-f]{64}$/)
    setInForce(f)
    expect(decide('finance', 'view:recruiting').access).toBe('hidden')
    expect(decide('chro', 'export:monthly-report').access).toBe('hidden')
  })

  it('ignores a file as a whole when it is not JSON, another format version or its checksum does not match', async () => {
    const text = policyFileText(goodFile())
    const cases: [string, RegExp][] = [
      ['{ "format": ', /not valid JSON/],
      [JSON.stringify({ ...goodFile(), format: 'something-else' }), /not a Census policy file/],
      [JSON.stringify({ ...goodFile(), version: 2 }), /format version 2/],
      [text.replace('"hidden"', '"shown"'), /checksum does not match/],
      [JSON.stringify({ ...goodFile(), notes: 'Changed by hand' }), /checksum does not match/],
    ]
    for (const [t, why] of cases) {
      const f = await loadInForce(envOf({ status: 'ok', text: t }))
      expect(f.source, t).toBe('defaults')
      expect(f.lines).toEqual([])
      expect(f.ignored ?? '', t).toMatch(why)
    }
  })

  it('skips unknown roles and surfaces one by one, and a line that conflicts with a scope', async () => {
    const lines = [
      ...goodLines,
      line('finance', 'view:recruiting', 'hidden', { role: 'auditor' as PolicyRole }),
      line('finance', 'view:payroll', 'hidden'),
      line('hrbp-unit', 'person:outside-org', 'shown'),
      line('hrbp-region', 'scope:kind', 'none'),
    ]
    const file = buildPolicyFile({ lines, publishedBy: 'Ana Ruiz', notes: '', now: new Date(AT) })
    const f = await loadInForce(envOf({ status: 'ok', text: policyFileText(file) }))
    expect(f.lines).toEqual(goodLines)
    expect(f.skipped.map((s) => [s.index, s.kind])).toEqual([
      [2, 'unknown-role'],
      [3, 'unknown-surface'],
      [4, 'guard'],
      [5, 'guard'],
    ])
    expect(f.skipped[2].why).toBe(GUARD_RAILS.scope)
  })

  it('reads the one-file build’s embedded copy, and never fetches there', async () => {
    let fetched = false
    const env = {
      ...envOf({ status: 'ok', text: '' }),
      oneFile: true,
      embedded: policyFileText(goodFile()),
      fetchFile: async () => {
        fetched = true
        return { status: 'missing' as const }
      },
    }
    const f = await loadInForce(env)
    expect(fetched).toBe(false)
    expect(f).toMatchObject({ source: 'embedded', oneFile: true })
    expect(f.lines).toEqual(goodLines)
    const none = await loadInForce({ ...env, embedded: null })
    expect(none).toMatchObject({ source: 'defaults', oneFile: true, ignored: null })
  })

  it('checks the checksum over the fields, not the spacing', () => {
    const f = goodFile()
    const compact = JSON.stringify(f)
    expect(readPolicyFile(compact, catalog).ok).toBe(true)
    expect(f.checksum).toBe(checksumOf(f))
  })
})

/* ───────────── publish round trip ───────────── */

describe('publish round trip', () => {
  it('draft, publish, load: the same decisions in every mode', async () => {
    const label = (s: string) => surfaceLabel(s)
    let draft = emptyDraft()
    const stamp = { reason: 'Finance asked for the hiring plan', by: 'Ana Ruiz', at: AT }
    draft = setInDraft(
      draft,
      { role: 'finance', surface: 'tab:onboarding.first90', decision: 'shown' },
      stamp,
      label,
    )
    draft = setInDraft(
      draft,
      { role: 'manager', surface: 'export:records', decision: 'hidden' },
      stamp,
      label,
    )
    draft = setInDraft(draft, { role: 'hr', surface: 'view:ai', decision: 'hidden' }, stamp, label)
    draft = setInDraft(
      draft,
      { role: 'compensation', surface: 'export:view', decision: 'limited', how: 'Workbooks only.' },
      stamp,
      label,
    )
    // Setting a surface back to its default takes the override out.
    draft = setInDraft(draft, { role: 'hr', surface: 'view:ai', decision: 'shown' }, stamp, label)
    expect(draft.lines.map((l) => `${l.role} ${l.surface}`)).toEqual([
      'finance tab:onboarding.first90',
      'manager export:records',
      'compensation export:view',
    ])
    expect(draft.log).toHaveLength(5)
    expect(draft.log[0].what).toBe(`Finance: ${surfaceLabel('tab:onboarding.first90')} shown (was hidden)`)
    const drafted = overridesOf(draft.lines)
    const text = policyFileText(
      buildPolicyFile({ lines: draft.lines, publishedBy: 'Ana Ruiz', notes: 'Round trip' }),
    )
    const f = await loadInForce(envOf({ status: 'ok', text }))
    expect(f.skipped).toEqual([])
    setInForce(f)
    for (const r of grid())
      for (const m of MODES as readonly Mode[])
        expect(decide(m, r.surface).access, `${r.surface} ${m}`).toBe(
          decideUnder(drafted, m, r.surface).access,
        )
    expect(decide('compensation', 'export:view')).toEqual({ access: 'limited', how: 'Workbooks only.' })
    expect(draftChanges(draft.lines, f.lines, label)).toEqual([])
  })
})
