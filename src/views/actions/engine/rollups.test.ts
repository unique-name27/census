/**
 * Roll-ups for a role's lists (rollups.ts; docs/ACTION-CENTER-AUDIT.md part 6, Volume): each mode
 * folds the items one person or queue works through into one line, never drops one, keeps legal
 * exposure and employee relations cases alone, and a roll-up's marks hold to it. Fixtures here; the
 * sample's counts per mode are in roles.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { lensOf } from '@/access/items'
import type { Mode } from '@/access/modes'
import type { ActionItem } from '@/views/types'
import type { OpenAction } from './collect'
import { compareActions } from './collect'
import { withHandled } from './marks'
import { composeNote } from './note'
import { foldRoleLists, isRollup, listWords, rollupOf, unfold } from './rollups'
import { AS_OF, ctxOf, open } from './testkit'

const ctx = ctxOf()
const lens = (mode: Mode, me: { id: string | null; name: string } | null = null) => ({
  ...lensOf({ mode, scope: null, lock: null }, AS_OF, 14),
  me,
})
const fold = (
  mode: Mode,
  needs: OpenAction[],
  waiting: OpenAction[] = [],
  me = null as Parameters<typeof lens>[1],
) => foldRoleLists({ needs, waiting }, lens(mode, me), ctx)

/** An item with an id of a given kind. */
const of = (id: string, patch: Partial<ActionItem> = {}, extra: Partial<OpenAction> = {}) =>
  open({ id, ...patch }, extra)

describe('one roll-up', () => {
  it('is as pressing as its worst item, due on the earliest, carries exposure, and opens its items', () => {
    const a = of('services:case:A', { severity: 'warning', due: '2026-09-20' })
    const b = of('services:case:B', { severity: 'critical', due: '2026-09-25', exposure: true })
    const r = rollupOf(
      [a, b],
      { key: 'k', what: 'Two cases', subject: 'Cases', kind: 'Case past target', title: 'Cases' },
      ctx,
    )
    expect(r.id).toBe('rollup:k')
    expect(isRollup(r)).toBe(true)
    expect(r.item.severity).toBe('critical')
    expect(r.item.due).toBe('2026-09-20')
    expect(r.item.exposure).toBe(true)
    expect(r.item.size).toBe(2)
    expect(r.members).toEqual([a, b])
    const spec = typeof r.item.drill === 'function' ? r.item.drill() : r.item.drill
    expect(spec?.kind).toBe('actionItems')
    expect(spec?.rows.map((x) => (x as { id: string }).id)).toEqual([a.id, b.id])
  })

  it('opens again once marked handled when an item joins or leaves it', () => {
    const a = of('services:case:A')
    const b = of('services:case:B')
    const c = of('services:case:C')
    const spec = { key: 'k', what: 'Cases', subject: 'Cases', kind: 'Case past target', title: 'Cases' }
    const two = rollupOf([a, b], spec, ctx)
    const marks = withHandled({}, [two], Date.parse(`${AS_OF}T12:00:00Z`))
    const isOpenNow = (r: OpenAction) => {
      const m = marks[r.markKey]
      return !m || (!!r.item.fingerprint && m.fingerprint !== r.item.fingerprint)
    }
    expect(isOpenNow(rollupOf([a, b], spec, ctx))).toBe(false)
    expect(isOpenNow(rollupOf([a, b, c], spec, ctx))).toBe(true)
    expect(isOpenNow(rollupOf([a], spec, ctx))).toBe(true)
  })

  it('says its owners in a list, or by group past three', () => {
    expect(listWords(['A', 'B', 'C'])).toBe('A, B and C')
    expect(listWords(['A'])).toBe('A')
  })
})

describe('HR ops', () => {
  const cases = (owner: string, n: number, extra: Partial<ActionItem> = {}) =>
    Array.from({ length: n }, (_, i) =>
      of(
        `services:case:${owner}-${i}`,
        {
          ownerRole: 'immigration',
          ownerId: null,
          ownerName: owner,
          due: `2026-08-${String(10 + i).padStart(2, '0')}`,
          severity: 'critical',
          what: `Immigration & mobility case open 60 d, 50 d past its 10 d resolution target${i % 2 ? ', waiting on a third party' : ''}`,
          subject: {
            kind: 'cases',
            id: `HR-${owner.length}${i}`,
            label: `Immigration & mobility case HR-${owner.length}${i}`,
          },
          view: 'services',
          ...extra,
        },
        { role: 'immigration', ownerKey: `team:immigration:${owner.toLowerCase()}` },
      ),
    )

  it("folds one agent's cases from three, never legal exposure or an employee relations case", () => {
    const mine = cases('Amanda Wright', 4)
    const two = cases('Vinay Mishra', 2)
    const breach = of('compliance:license:E1', { exposure: true, severity: 'critical', view: 'compliance' })
    const er = of('services:case:HR-9', {
      view: 'services',
      ownerRole: 'hr-ops',
      ownerName: 'Employee relations',
      subject: { kind: 'none', label: 'Employee relations case' },
    })
    const ers = [
      er,
      of('services:case:HR-10', { ...er.item, id: 'services:case:HR-10' }),
      of('services:case:HR-11', { ...er.item, id: 'services:case:HR-11' }),
    ]
    const { needs } = fold('hr-ops', [breach, ...mine, ...two, ...ers])
    const line = needs.find(isRollup)
    expect(line?.members).toHaveLength(4)
    expect(line?.item.what).toBe(
      '4 Immigration & mobility cases past their resolution target, 2 waiting on a third party; the oldest is 51 d past target',
    )
    expect(line?.item.subject.label).toBe('Cases with Amanda Wright')
    // Two of one agent's stay as they are; legal exposure and employee relations never fold.
    expect(needs.filter((a) => !isRollup(a)).map((a) => a.id)).toEqual([
      breach.id,
      ...two.map((a) => a.id),
      ...ers.map((a) => a.id),
    ])
    expect(unfold(needs)).toHaveLength(1 + 4 + 2 + 3)
  })

  it('folds day-one tasks not started and not yet due per start date, and keeps blocked and overdue ones', () => {
    const batch = { key: 'start:2026-10-05', label: 'the starts on 5 Oct' }
    const task = (n: number, patch: Partial<ActionItem> = {}) =>
      of(`onboarding:task:APP-${n}:Badge ready`, {
        view: 'onboarding',
        ownerRole: 'facilities',
        ownerName: 'Facilities',
        due: '2026-10-03',
        subject: { kind: 'candidates', id: `APP-${n}`, label: `Start ${n}` },
        batch,
        ...patch,
      })
    const late = task(9, {
      due: '2026-09-28',
      batch: undefined,
      what: 'Laptop shipped is overdue for Start 9',
    })
    const { needs } = fold('hr-ops', [
      late,
      task(1),
      task(2),
      task(3, {
        id: 'onboarding:task:APP-1:Day -1 readiness check',
        subject: { kind: 'candidates', id: 'APP-1', label: 'Start 1' },
      }),
    ])
    expect(needs[0].id).toBe(late.id)
    expect(needs[1].item.what).toBe(
      '3 day-one tasks not started for 2 starts on 5 Oct; the first is due 3 Oct',
    )
    expect(needs).toHaveLength(2)
  })
})

describe('Recruiter', () => {
  const me = { id: 'E9', name: 'Rita Rao' }
  const step = (kind: string, app: string, req: string, patch: Partial<ActionItem> = {}) =>
    of(`recruiting:${kind}:${app}`, {
      view: 'recruiting',
      ownerRole: 'recruiter',
      ownerId: 'E9',
      ownerName: 'Rita Rao',
      subject: { kind: 'candidates', id: app, label: `${app} (${req})` },
      batch: { key: `req:${req}`, label: `${req} Verification Engineer` },
      ...patch,
    })
  const age = (req: string, severity: ActionItem['severity'], days = 57) =>
    of(`recruiting:past-target:${req}`, {
      view: 'recruiting',
      ownerRole: 'recruiter',
      ownerId: 'E9',
      ownerName: 'Rita Rao',
      severity,
      due: '2026-09-01',
      what: `Req ${req} Verification Engineer has been open ${days} d; the target is 45 d`,
      subject: { kind: 'requisitions', id: req, label: `${req} Verification Engineer` },
    })

  it('gives one recruiter one line per req for its candidate steps and its age', () => {
    const items = [
      step('review', 'APP-1', 'REQ-1'),
      step('review', 'APP-2', 'REQ-1'),
      step('schedule-screen', 'APP-3', 'REQ-1'),
      age('REQ-1', 'warning'),
      step('review', 'APP-4', 'REQ-2'),
      age('REQ-3', 'critical', 165),
      age('REQ-4', 'warning'),
      age('REQ-5', 'warning'),
    ].sort(compareActions)
    const { needs } = fold('recruiter', items, [], me)
    const req1 = needs.find((a) => a.id === 'rollup:recruiter:req:REQ-1')
    expect(req1?.item.what).toBe(
      '2 applications to review and 1 interview to schedule; open 57 d against a target of 45 d',
    )
    expect(req1?.item.subject.label).toBe('REQ-1 Verification Engineer')
    // One step on a req stays itself; a req far past target with no step stands alone; the rest share a line.
    expect(needs.some((a) => a.id === 'recruiting:review:APP-4')).toBe(true)
    expect(needs.some((a) => a.id === 'recruiting:past-target:REQ-3')).toBe(true)
    const quiet = needs.find((a) => a.id === 'rollup:recruiter:quiet-reqs')
    expect(quiet?.members?.map((a) => a.item.subject.id)).toEqual(['REQ-4', 'REQ-5'])
    expect(needs).toHaveLength(4)
  })

  it('gives "Every recruiter" one line per recruiter and one for the reqs far past target', () => {
    const other = (patch: Partial<ActionItem>) => ({ ownerId: 'E10', ownerName: 'Tom Fox', ...patch })
    const items = [
      step('review', 'APP-1', 'REQ-1'),
      step('review', 'APP-2', 'REQ-2'),
      step('review', 'APP-3', 'REQ-3', other({})),
      of('recruiting:review:APP-5', other({ view: 'recruiting', ownerRole: 'recruiter' }), {
        ownerKey: 'id:E10',
      }),
      age('REQ-6', 'critical', 165),
      { ...age('REQ-7', 'critical', 170), ownerKey: 'id:E10' },
    ]
    items[2] = { ...items[2], ownerKey: 'id:E10', ownerId: 'E10', ownerName: 'Tom Fox' }
    items[3] = { ...items[3], ownerId: 'E10', ownerName: 'Tom Fox' }
    const { needs } = fold('recruiter', items.sort(compareActions))
    expect(needs.map((a) => a.id).sort()).toEqual([
      'rollup:recruiter:long-open',
      'rollup:recruiter:owner:id:E10',
      'rollup:recruiter:owner:id:E9',
    ])
    expect(needs.find((a) => a.id === 'rollup:recruiter:owner:id:E9')?.item.what).toMatch(
      /^2 items on 2 reqs, /,
    )
  })
})

describe('Manager', () => {
  it("folds interview decisions per req, in the manager's own words", () => {
    const decision = (app: string, req: string, due: string) =>
      of(`recruiting:decision:${app}`, {
        view: 'recruiting',
        due,
        subject: { kind: 'candidates', id: app, label: `${app} (${req})` },
        batch: { key: `req:${req}`, label: `${req} Emulation Engineer` },
      })
    const items = [
      decision('APP-1', 'REQ-1', '2026-09-29'),
      decision('APP-2', 'REQ-1', '2026-10-02'),
      decision('APP-3', 'REQ-2', '2026-09-30'),
    ]
    const { needs } = fold('manager', items, [], { id: 'E2', name: 'Sam Lee' })
    expect(needs).toHaveLength(2)
    expect(needs[0].item.what).toBe(
      '2 candidates waiting on your decision after their interviews, due 29 Sep to 2 Oct',
    )
    expect(needs[0].item.subject.label).toBe('REQ-1 Emulation Engineer')
    expect(needs[1].id).toBe('recruiting:decision:APP-3')
  })
})

describe('HRBP', () => {
  it('rolls Waiting on others up by owner group and kind, stay conversations and critical items one by one', () => {
    const training = (n: number) =>
      of(
        `talent:training-overdue:M${n}`,
        { ownerId: `M${n}`, ownerName: `Manager ${n}` },
        { ownerKey: `id:M${n}` },
      )
    const stay = of('hrbp:stay-conversations:M1', { severity: 'warning' })
    const critical = of(
      'talent:training-overdue:M9',
      { severity: 'critical', ownerId: 'M9' },
      { ownerKey: 'id:M9' },
    )
    const { waiting } = fold('hrbp-unit', [], [training(1), training(2), training(3), stay, critical])
    const line = waiting.find(isRollup)
    expect(line?.item.what).toBe(
      '3 teams with overdue training, each with its own manager; the first is due 30 Sep',
    )
    expect(line?.ownerName).toBe('Managers')
    expect(line?.ownerKey).toBe('group:manager')
    expect(waiting.filter((a) => !isRollup(a)).map((a) => a.id)).toEqual([stay.id, critical.id])
  })
})

describe('HR and CHRO escalations', () => {
  it('keep legal exposure and the critical kinds one by one, and fold long-overdue items per practice', () => {
    const late = (n: number, view: ActionItem['view'], ownerName: string) =>
      of(
        `${view}:test:${n}`,
        { view, severity: 'critical', due: '2026-08-01', ownerName, ownerId: null },
        { viewLabel: view === 'services' ? 'HR ops' : 'Recruiting', ownerKey: `team:x:${ownerName}` },
      )
    const breach = of('compliance:license:E1', { exposure: true, severity: 'critical' })
    const role = of('talent:critical-role:SP-1', { severity: 'critical', due: null })
    const needs = [
      breach,
      role,
      late(1, 'services', 'A'),
      late(2, 'services', 'A'),
      late(3, 'recruiting', 'B'),
    ]
    const out = fold('chro', needs).needs
    expect(out.map((a) => a.id)).toEqual([
      breach.id,
      role.id,
      'rollup:escalation:services',
      'recruiting:test:3',
    ])
    expect(out[2].item.what).toMatch(/^2 .* more than 14 d overdue, all with A; the oldest is 60 d overdue$/)
  })
})

describe('Copy note to a manager', () => {
  it('never says "regretted" and never names the reader', () => {
    // HR's stay-conversation item, sent to the manager it waits on: "exits" and "your team".
    const item = of('hrbp:stay-conversations:E1', {
      what: "4 regretted exits from Aishwarya Krishnan's team in the last 12 months, the latest on 15 May",
      subject: { kind: 'none', label: "Aishwarya Krishnan's team" },
      forOwner: {
        what: '4 exits from your team in the last 12 months, the latest on 15 May',
        subject: 'Your team',
      },
      note: 'Could you hold stay conversations with the rest of your team this month?',
    })
    const note = composeNote({ name: 'Aishwarya Krishnan', isTeam: false }, [item], AS_OF)
    expect(note).not.toMatch(/regretted/i)
    expect(note).toContain('1. Your team')
    expect(note).toContain('4 exits from your team in the last 12 months')
    // Past the greeting ("Hi Aishwarya,"), the reader is never named.
    expect(note.slice(note.indexOf('\n'))).not.toContain('Aishwarya Krishnan')
  })

  it('says "together" where an ask would name the manager sending it', () => {
    const item = of('recruiting:past-target:REQ-1', {
      note: 'Could we review the req with Ji-woo Lim this week?',
      ownerName: 'Agnieszka Nielsen',
    })
    const note = composeNote({ name: 'Agnieszka Nielsen', isTeam: false }, [item], AS_OF, {
      me: 'Ji-woo Lim',
    })
    expect(note).toContain('Could we review the req together this week?')
    expect(note).not.toContain('Ji-woo')
  })
})
