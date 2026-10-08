/**
 * The two guard rails a review found open (docs/SECURITY-CENTER.md):
 *  - "A role never sees outside its scope": a scoped role can never show what reads the whole
 *    company's records (the Data room and its kin), and Recruiter, whose scope keeps the roster for
 *    names only, can show no other view, no hidden tab and no dataset or drill kind outside the reqs.
 *  - Cost totals without the pay switch: Finance's only (its filters keep to whole business units),
 *    so a role that keeps every filter can never difference two totals down to one person's pay.
 * Each line is refused in the editor and left out by the loader, with the rule as the reason.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { MODE_NAME, type Mode } from '@/access/modes'
import {
  buildPolicyFile,
  emptyDraft,
  GUARD_RAILS,
  type GuardId,
  guardEnv,
  guardRailFor,
  type PolicyLine,
  type PolicyRole,
  PREVIEW_KEY,
  policyFileText,
  policyStore,
  readPolicyFile,
  resetPolicyState,
  resumePreview,
  screenLines,
  startPreview,
} from '@/access/overrides'
import { payView, showCostIn } from '@/access/pay'
import { decide, decideUnder, setPolicyOverrides } from '@/access/policy'
import { clampFilters, clampReason } from '@/access/scopes'
import { DEFAULT_FILTERS } from '@/data/scope'
import { surfaceCatalog } from './inventory'
import { refusal } from './model'
import { screenDraft, useDraft } from './store'
import { paySpec } from './ui/specs'

afterEach(() => resetPolicyState())

const AT = '2026-10-08T09:00:00.000Z'
const line = (role: PolicyRole, surface: string, decision: string): PolicyLine => ({
  role,
  surface,
  decision,
  reason: 'Red-team check',
  by: 'QA',
  at: AT,
})
const catalog = surfaceCatalog()

/** Refused in the editor and left out of a published file, with the rail's sentence. */
function expectRefused(l: PolicyLine, rail: GuardId) {
  const label = `${l.role} ${l.surface} ${l.decision}`
  expect(refusal([], l)?.rail, label).toBe(rail)
  const file = buildPolicyFile({ lines: [l], publishedBy: 'QA', notes: '', now: new Date(AT) })
  const r = readPolicyFile(policyFileText(file), catalog)
  expect(r.ok, label).toBe(true)
  if (!r.ok) return
  expect(r.lines, label).toEqual([])
  expect(
    r.skipped.map((s) => s.why),
    label,
  ).toEqual([GUARD_RAILS[rail]])
}

const SCOPED: readonly PolicyRole[] = ['manager', 'hrbp-unit', 'hrbp-region', 'recruiter']

/** What reads the whole company whatever the scope. */
const UNSCOPED_LINES = [
  'page:data',
  'data:datasets',
  'data:quality',
  'data:metrics',
  'data:mapping',
  'data-panel:raw',
  'data-panel:quality',
  'export:data-room',
  'ask:explain_quality',
  'settings:data',
  'settings:lists',
]

describe('a scoped role never sees outside its scope', () => {
  it('cannot show the Data room or anything else that reads every record', () => {
    for (const role of SCOPED)
      for (const s of UNSCOPED_LINES) {
        expect(decideUnder(null, role, s).access, `${role} ${s} by default`).toBe('hidden')
        for (const d of ['shown', 'limited']) expectRefused(line(role, s, d), 'scope')
      }
  })

  it('the review’s case: "Manager: The Data room shown" is refused', () => {
    expect(refusal([], { role: 'manager', surface: 'page:data', decision: 'shown' })).toEqual({
      rail: 'scope',
      why: GUARD_RAILS.scope,
    })
  })

  it('Recruiter shows no other view, no hidden tab, and no dataset or drill outside the reqs', () => {
    for (const s of [
      'view:hrbp',
      'view:org',
      'view:services',
      'view:talent',
      'view:comp',
      'view:scorecard',
      'view:listening',
      'view:compliance',
      'view:team',
      'header:hrbp',
      'tab:onboarding.first90',
      'tab:hrbp.workforce',
      'dataset:employees',
      'dataset:comp',
      'dataset:reviews',
      'dataset:cases',
      'drill:comp',
      'drill:reviews',
      'drill:jobChanges',
      'drill:succession',
    ])
      expectRefused(line('recruiter', s, 'shown'), 'scope')
  })

  it('still takes lines that narrow, and lines inside the scope', () => {
    const ok = [
      line('recruiter', 'view:recruiting', 'shown'),
      line('recruiter', 'tab:recruiting.pipeline', 'hidden'),
      line('recruiter', 'dataset:candidates', 'hidden'),
      line('manager', 'page:data', 'hidden'),
      line('hrbp-unit', 'view:services', 'shown'),
      line('hr-ops', 'page:data', 'shown'),
    ]
    const { lines, skipped } = screenLines(ok, catalog)
    expect(skipped).toEqual([])
    expect(lines).toHaveLength(ok.length)
  })
})

describe('cost totals without the pay switch are Finance’s only', () => {
  it('refuses totals for every other role that has no switch', () => {
    for (const role of [
      'hrbp-unit',
      'hrbp-region',
      'manager',
      'recruiter',
      'talent-management',
      'hr-ops',
    ] as PolicyRole[])
      for (const d of ['shown', 'limited']) expectRefused(line(role, 'pay:totals', d), 'cost-totals')
  })

  it('refuses hiding the amounts while the totals stay shown, in a switch role', () => {
    for (const role of ['compensation', 'hr', 'chro'] as PolicyRole[])
      expectRefused(line(role, 'pay:amounts', 'hidden'), 'cost-totals')
    // The switch hidden under shown amounts names the switch rule.
    expect(refusal([], line('compensation', 'pay:switch', 'hidden'))?.rail).toBe('switches')
  })

  it('takes the pay surfaces weighed together: none at all, or amounts behind the switch', () => {
    const none = ['pay:switch', 'pay:amounts', 'pay:totals'].map((s) => line('compensation', s, 'hidden'))
    expect(screenLines(none, catalog).skipped).toEqual([])
    const both = [
      line('hr-ops', 'pay:switch', 'shown'),
      line('hr-ops', 'pay:amounts', 'shown'),
      line('hr-ops', 'pay:totals', 'shown'),
    ]
    expect(screenLines(both, catalog).skipped).toEqual([])
    // Hiding only two of the three leaves totals without the switch: both are left out.
    const half = [line('compensation', 'pay:switch', 'hidden'), line('compensation', 'pay:amounts', 'hidden')]
    const r = screenLines(half, catalog)
    expect(r.lines).toEqual([])
    expect(new Set(r.skipped.map((s) => s.why))).toEqual(new Set([GUARD_RAILS['cost-totals']]))
  })

  it('the role page’s pay control refuses Totals outside Finance and takes the rest', () => {
    const why = (role: PolicyRole, level: string) => paySpec(role, [], []).refuse(level)
    expect(why('hrbp-unit', 'totals')).toBe(GUARD_RAILS['cost-totals'])
    expect(why('compensation', 'totals')).toBe(GUARD_RAILS['cost-totals'])
    expect(why('compensation', 'none')).toBeNull()
    expect(why('compensation', 'ratios')).toBeNull()
    expect(why('hr-ops', 'switch')).toBeNull()
    expect(why('finance', 'totals')).toBeNull()
    expect(why('finance', 'switch')).toBeNull()
    expect(why('finance', 'none')).toBeNull()
  })

  it('Finance keeps one reporting date: the date settings stay hidden', () => {
    expectRefused(line('finance', 'settings:data', 'shown'), 'cost-totals')
    expectRefused(line('finance', 'settings:device-files', 'limited'), 'cost-totals')
    // With amounts behind the switch instead, Finance is a switch role like Compensation.
    const lines = [
      line('finance', 'pay:switch', 'shown'),
      line('finance', 'pay:amounts', 'shown'),
      line('finance', 'settings:data', 'shown'),
    ]
    expect(guardRailFor(lines[2], guardEnv(lines))).toBeNull()
  })

  it('even laid over without the loader, totals follow Finance’s whole business units', () => {
    // `setPolicyOverrides` straight, as nothing in the app does: the clamp and the context still hold.
    setPolicyOverrides(
      new Map<Mode, Map<string, { access: 'limited'; how: string }>>([
        ['hr-ops', new Map([['pay:totals', { access: 'limited', how: 'Totals.' }]])],
        ['manager', new Map([['pay:totals', { access: 'limited', how: 'Totals.' }]])],
      ]),
    )
    expect(payView('hr-ops')).toBe('totals')
    const asked = { ...DEFAULT_FILTERS, leaderId: 'E10001', level: ['L3'], businessUnit: ['Corporate'] }
    const kept = clampFilters(asked, null, 'hr-ops')
    expect(kept).toMatchObject({ leaderId: null, level: [], businessUnit: ['Corporate'] })
    expect(clampReason('hr-ops', null, asked, kept)).toBe(
      `${MODE_NAME['hr-ops']} mode filters by business unit and period, so the link's other filters were left out.`,
    )
    // A scoped role never shows totals without the switch.
    expect(payView('manager')).toBe('totals')
    expect(showCostIn('manager', false)).toBe(false)
    expect(showCostIn('hr-ops', false)).toBe(true)
  })
})

describe('drafts and previews go through the same screening as a policy file', () => {
  const bad = line('manager', 'page:data', 'shown')
  const good = line('finance', 'view:talent', 'hidden')

  it('a draft read from this browser or a settings file loses the lines the loader would leave out', () => {
    const { draft, skipped } = screenDraft({ ...emptyDraft([bad, good]), author: 'QA' }, catalog)
    expect(draft.lines).toEqual([good])
    expect(skipped.map((x) => [x.role, x.surface, x.why])).toEqual([
      ['manager', 'page:data', GUARD_RAILS.scope],
    ])
    // Rails only, without the catalog (a settings file read from Settings).
    expect(screenDraft(emptyDraft([bad, good]), null).draft.lines).toEqual([good])
    const r = useDraft.getState().importSection({ draft: emptyDraft([bad, good]) })
    expect(r).toEqual({ ok: true, lines: 1, skipped: 1 })
    expect(useDraft.getState().draft?.lines).toEqual([good])
    expect(useDraft.getState().skipped).toHaveLength(1)
  })

  it('a preview, started or kept in this tab by hand, never lays over a line that crosses a rail', () => {
    const m = new Map<string, string>()
    const storage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    }
    const session = {
      role: 'manager' as const,
      lines: [bad, good],
      from: 'developer' as Mode,
      returnTo: '',
      startedAt: AT,
    }
    startPreview(session, storage)
    expect(decide('manager', 'page:data').access).toBe('hidden')
    expect(decide('finance', 'view:talent').access).toBe('hidden')
    expect(policyStore.getState().preview?.skipped).toHaveLength(1)
    resetPolicyState()
    // Written by hand into this tab's storage, then a reload.
    m.set(
      PREVIEW_KEY,
      JSON.stringify({ ...session, lines: [bad, line('recruiter', 'dataset:employees', 'shown')] }),
    )
    const p = resumePreview(storage)
    expect(p?.lines).toEqual([])
    expect(p?.skipped?.map((x) => x.why)).toEqual([GUARD_RAILS.scope, GUARD_RAILS.scope])
    expect(decide('manager', 'page:data').access).toBe('hidden')
    expect(decide('recruiter', 'dataset:employees').access).toBe('hidden')
  })
})
