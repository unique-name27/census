/**
 * Whose an item is, per mode (docs/ACTION-CENTER-AUDIT.md 4.4, 5.12 and part 6, Roles;
 * docs/ROLES-V2.md 6.1): `roleItems` splits what a mode lists into Needs attention and Waiting on
 * others by the routing table, which is plain data and snapshotted, so a change to who sees an item
 * kind shows in review. On the sample: Finance lists no item about one person, and Recruiter none
 * about compensation, an HR ops case, talent risk or a survey.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Severity } from '@/components/types'
import { collectActions, type OpenAction } from '@/views/actions/engine'
import { KIND_LABEL } from '@/views/actions/engine/kind'
import { everyMode } from '@/views/actions/engine/roleKit'
import { VIEWS } from '@/views/registry'
import { ACTION_OWNER_LABEL, type ActionItem, type ActionOwnerRole } from '@/views/types'
import { escalationRank, isMine, type RoleLens, type RoutedItem, roleItems } from './items'
import { MODES, type Mode } from './modes'
import { can } from './policy'
import { itemKindOf, kindMatches, ROUTING, routingText } from './policy/routing'

const AS_OF = '2026-09-30'

let n = 0
function routed(
  id: string,
  role: ActionOwnerRole,
  patch: Partial<ActionItem> & { ownerId?: string | null; ownerName?: string } = {},
): RoutedItem {
  n++
  const item: ActionItem = {
    id,
    ownerRole: role,
    ownerName: patch.ownerName ?? ACTION_OWNER_LABEL[role],
    ownerId: patch.ownerId ?? null,
    due: AS_OF,
    severity: 'warning' as Severity,
    what: `Item ${n} is open`,
    subject: { kind: 'none', label: 'A group' },
    view: id.split(':')[0] as ActionItem['view'],
    ...patch,
  }
  return { item, ownerId: item.ownerId ?? null, ownerName: item.ownerName, role }
}

const lens = (mode: Mode, me: RoleLens['me'] = null): RoleLens => ({
  mode,
  me,
  asOf: AS_OF,
  escalationDays: 14,
})

const ids = (xs: readonly RoutedItem[]) => xs.map((x) => x.item.id)

describe('roleItems', () => {
  it("routes by kind and owner group: a recruiter's steps are theirs, a hiring manager's decision is waiting", () => {
    const review = routed('recruiting:review:APP-1', 'recruiter', { ownerName: 'Maya Chen', ownerId: 'E9' })
    const other = routed('recruiting:review:APP-2', 'recruiter', { ownerName: 'Ravi Shah', ownerId: 'E8' })
    const decision = routed('recruiting:decision:APP-3', 'manager', {
      ownerName: 'Priya Raman',
      ownerId: 'E2',
    })
    const start = routed('onboarding:task:APP-4:Laptop shipped', 'it')
    const pay = routed('comp:below-minimum:all', 'total-rewards')
    const all = [review, other, decision, start, pay]
    // One recruiter: their own steps are Needs attention, another recruiter's are waiting.
    const one = roleItems(all, lens('recruiter', { id: 'E9', name: 'Maya Chen' }))
    expect(ids(one.needs)).toEqual(['recruiting:review:APP-1'])
    expect(ids(one.waiting)).toEqual(['recruiting:review:APP-2', 'recruiting:decision:APP-3', start.item.id])
    expect(one.left).toBe(1)
    // Every recruiter (a talent acquisition lead): every recruiter's steps.
    const lead = roleItems(all, lens('recruiter'))
    expect(ids(lead.needs)).toEqual(['recruiting:review:APP-1', 'recruiting:review:APP-2'])
  })

  it("gives a manager their own items, and lists their org's items with others as waiting", () => {
    const mine = routed('onboarding:probation:E5', 'manager', { ownerId: 'E2', ownerName: 'Sam Lee' })
    const theirs = routed('talent:training-overdue:E3', 'manager', { ownerId: 'E3', ownerName: 'Person 3' })
    const span = routed('hrbp:span:E2', 'hrbp', { ownerId: 'E50', ownerName: 'Michael Thomas' })
    const r = roleItems([mine, theirs, span], lens('manager', { id: 'E2', name: 'Sam Lee' }))
    expect(ids(r.needs)).toEqual(['onboarding:probation:E5'])
    expect(ids(r.waiting)).toEqual(['talent:training-overdue:E3'])
    expect(r.left).toBe(1)
  })

  it('matches "me" by employee ID, else by name, and says nothing without a person', () => {
    expect(isMine({ me: { id: 'E9', name: 'Maya Chen' } }, { ownerId: 'E9', ownerName: 'x' })).toBe(true)
    expect(isMine({ me: { id: 'E9', name: 'Maya Chen' } }, { ownerId: 'E8', ownerName: 'Maya Chen' })).toBe(
      false,
    )
    expect(isMine({ me: { id: null, name: 'Maya Chen' } }, { ownerId: null, ownerName: ' maya chen ' })).toBe(
      true,
    )
    expect(isMine({ me: null }, { ownerId: 'E9', ownerName: 'Maya Chen' })).toBeNull()
  })

  it('makes the escalations HR and the CHRO need: legal exposure, critical roles and exit clusters, long overdue critical items', () => {
    const license = routed('compliance:license:E1', 'trade-compliance', {
      exposure: true,
      severity: 'critical',
    })
    const role = routed('talent:critical-role:SP-1', 'talent', { severity: 'critical', due: null })
    const cluster = routed('hrbp:stay-conversations:E2', 'manager', { severity: 'critical' })
    const late = routed('services:case:HR-1', 'hr-ops', { severity: 'critical', due: '2026-09-01' })
    const recent = routed('services:case:HR-2', 'hr-ops', { severity: 'critical', due: '2026-09-25' })
    const watch = routed('services:case:HR-3', 'hr-ops', { severity: 'warning', due: '2026-01-01' })
    expect(
      [license, role, cluster, late, recent, watch].map((x) => escalationRank(x.item, lens('chro'))),
    ).toEqual([0, 1, 1, 2, null, null])
    for (const mode of ['developer', 'hr', 'chro'] as const) {
      const r = roleItems([late, recent, watch, cluster, role, license], lens(mode))
      // Escalations by their reason: exposure, then the critical kinds, then long overdue.
      expect(ids(r.needs), mode).toEqual([license, cluster, role, late].map((x) => x.item.id))
      // The other critical items wait on others; every item is in the full list.
      expect(ids(r.waiting), mode).toEqual([recent.item.id])
      expect(r.listed, mode).toHaveLength(6)
      expect(r.left, mode).toBe(0)
    }
    // The escalation days are a setting.
    expect(escalationRank(late.item, { asOf: AS_OF, escalationDays: 60 })).toBeNull()
  })

  it("lists training by course for HR and the CHRO: per-manager roll-ups stay the managers'", () => {
    const team = routed('talent:training-overdue:E3', 'manager', { ownerId: 'E3', ownerName: 'Sam Lee' })
    const nobody = routed('talent:training-overdue:none', 'talent')
    const course = routed('talent:course-below-target:Export control', 'talent')
    for (const mode of ['hr', 'chro'] as const) {
      const r = roleItems([team, nobody, course], lens(mode))
      expect(ids(r.listed), mode).toEqual([nobody.item.id, course.item.id])
      expect(r.left, mode).toBe(1)
    }
    // Developer lists everything; Manager mode keeps the team's own roll-up.
    expect(roleItems([team, nobody, course], lens('developer')).listed).toHaveLength(3)
    expect(ids(roleItems([team], lens('manager', { id: 'E3', name: 'Sam Lee' })).needs)).toEqual([
      team.item.id,
    ])
  })

  it('routes every role by the audit table: Finance its plan items, HR ops its queues, Talent its roles and courses', () => {
    const plan = routed('onboarding:plan-behind:Corporate:Legal', 'finance')
    const spend = routed('comp:over-budget:Corporate', 'total-rewards')
    const caseItem = routed('services:case:HR-1', 'hr-ops')
    const license = routed('compliance:license:E1', 'trade-compliance')
    const laptop = routed('onboarding:task:APP-1:Laptop shipped', 'it')
    const welcome = routed('onboarding:task:APP-1:Manager welcome', 'manager')
    const probation = routed('onboarding:probation:E5', 'manager')
    const role = routed('talent:critical-role:SP-1', 'talent')
    const course = routed('talent:course-below-target:Export control', 'talent')
    const training = routed('talent:training-overdue:E3', 'manager')
    const exitPay = routed('listening:exit:Bengaluru', 'total-rewards')
    const exitOther = routed('listening:exit:Austin', 'hrbp')
    const span = routed('hrbp:span:E2', 'hrbp')
    const all = [
      plan,
      spend,
      caseItem,
      license,
      laptop,
      welcome,
      probation,
      role,
      course,
      training,
      exitPay,
      exitOther,
      span,
    ]
    const split = (mode: Mode) => {
      const r = roleItems(all, lens(mode))
      return { needs: ids(r.needs), waiting: ids(r.waiting) }
    }
    expect(split('finance')).toEqual({ needs: [plan.item.id], waiting: [spend.item.id] })
    expect(split('hr-ops')).toEqual({
      needs: [caseItem.item.id, license.item.id, laptop.item.id],
      waiting: [welcome.item.id, probation.item.id],
    })
    expect(split('talent-management')).toEqual({ needs: [role.item.id, course.item.id], waiting: [] })
    expect(split('compensation')).toEqual({ needs: [spend.item.id, exitPay.item.id], waiting: [] })
    for (const mode of ['hrbp-unit', 'hrbp-region'] as const)
      expect(split(mode), mode).toEqual({
        needs: [exitOther.item.id, span.item.id],
        waiting: [
          caseItem.item.id,
          license.item.id,
          laptop.item.id,
          welcome.item.id,
          probation.item.id,
          role.item.id,
          course.item.id,
          training.item.id,
          exitPay.item.id,
        ],
      })
  })
})

describe('the routing table', () => {
  let open: OpenAction[]
  beforeAll(() => {
    open = everyMode().find((m) => m.mode === 'developer')!.collected.items
  }, 120_000)

  it('is plain data with a rule list for every mode, and matches kinds by id', () => {
    for (const m of MODES) expect(ROUTING[m].rules.length, m).toBeGreaterThan(0)
    expect(JSON.parse(JSON.stringify(ROUTING))).toEqual(ROUTING)
    expect(itemKindOf('recruiting:schedule-screen:APP-1')).toBe('recruiting:schedule-screen')
    expect(kindMatches('recruiting:schedule-screen', ['recruiting:schedule-*'])).toBe(true)
    expect(kindMatches('compliance:i9', ['compliance:*'])).toBe(true)
    expect(kindMatches('comp:over-budget', ['comp:below-minimum'])).toBe(false)
  })

  it('is in the access snapshot: one row per kind, one column per mode', async () => {
    // The kinds the views raise on the sample, with the owner groups they come with, plus the
    // named kinds the sample does not raise today.
    const owners = new Map<string, Set<ActionOwnerRole>>()
    for (const a of open) {
      const k = itemKindOf(a.id)
      const s = owners.get(k) ?? new Set()
      s.add(a.role)
      owners.set(k, s)
    }
    const NOT_ON_SAMPLE: Record<string, ActionOwnerRole[]> = {
      'onboarding:i9': ['hr-ops'],
      'compliance:i9': ['hr-ops'],
      'recruiting:offer': ['recruiter'],
      'talent:review-missing': ['manager', 'talent'],
      'comp:no-proposal': ['total-rewards'],
    }
    for (const [k, o] of Object.entries(NOT_ON_SAMPLE)) if (!owners.has(k)) owners.set(k, new Set(o))
    for (const k of Object.keys(KIND_LABEL))
      if (!k.endsWith('-') && k !== 'report:scorecard') expect(owners.has(k), k).toBe(true)
    const kinds = [...owners.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([kind, o]) => ({ kind, owners: [...o].sort() }))
    const text = routingText(
      kinds,
      (mode, kind) => can(mode, `view:${kind.split(':')[0]}`) && can(mode, `item:${kind}:`),
    )
    await expect(text).toMatchFileSnapshot('./__snapshots__/access-routing.txt')
  })
})

describe('each mode on the sample', () => {
  let modes: ReturnType<typeof everyMode>
  beforeAll(() => {
    modes = everyMode()
  }, 300_000)

  const PERSON = new Set([
    'employees',
    'comp',
    'rightToWork',
    'learning',
    'reviews',
    'candidates',
    'jobChanges',
  ])

  it('Finance lists no item about one person', () => {
    const fin = modes.find((m) => m.mode === 'finance')!
    for (const a of [...fin.lists.needs, ...fin.lists.waiting]) {
      expect(PERSON.has(a.item.subject.kind), a.id).toBe(false)
      expect(a.personId, a.id).toBeNull()
    }
    expect(fin.lists.needs.length).toBeGreaterThan(0)
    // Nothing the Finance policy leaves out even reaches its collection.
    for (const a of fin.collected.items)
      expect(PERSON.has(a.item.subject.kind) && a.item.view !== 'recruiting', a.id).toBe(false)
  })

  it('Recruiter lists no item about compensation, an HR ops case, talent risk or a survey', () => {
    const rec = modes.find((m) => m.mode === 'recruiter')!
    const listed = [...rec.lists.needs, ...rec.lists.waiting]
    expect(listed.length).toBeGreaterThan(0)
    for (const a of listed) {
      expect(['recruiting', 'onboarding'], a.id).toContain(a.item.view)
      expect(a.id, a.id).not.toMatch(/^(comp|services|talent|listening|compliance):/)
    }
    for (const a of rec.collected.items) expect(a.id, a.id).not.toMatch(/^(comp|services|talent|listening):/)
  })

  it('splits what each mode lists into its two lists and the count left, with nothing twice', () => {
    for (const { mode, collected, lists } of modes) {
      if (lists.lists)
        expect(lists.needs.length + lists.waiting.length + lists.left, mode).toBe(collected.items.length)
      else expect(lists.open.length + lists.left, mode).toBe(collected.items.length)
      const seen = new Set([...lists.needs, ...lists.waiting].map((a) => a.id))
      expect(seen.size, mode).toBe(lists.needs.length + lists.waiting.length)
    }
  })

  it('collects the same items whichever views array a reader passes', () => {
    const hr = modes.find((m) => m.mode === 'hr')!
    const others = VIEWS.filter((v) => v.key !== 'scorecard')
    expect(collectActions(hr.ctx, others)).toBe(hr.collected)
  })
})
