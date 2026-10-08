/**
 * The role homes' engines: Needs attention's rows (on fixtures), the page titles, and each home's
 * breakdowns and lists on the sample, counted against the producing views' own numbers.
 */
import { describe, expect, it } from 'vitest'
import { collectActions, roleView } from '@/views/actions/engine'
import { modeCtx } from '@/views/actions/engine/roleKit'
import { AS_OF, ctxOf, open } from '@/views/actions/engine/testkit'
import { compModel } from '@/views/comp/engine/model'
import { hrbpModel } from '@/views/hrbp/engine'
import { computeOnboarding } from '@/views/onboarding/engine'
import { computeRecruiting } from '@/views/recruiting/engine'
import { VIEWS } from '@/views/registry'
import { scorecardNow } from '@/views/scorecard/engine/schedule'
import { OTHER_VIEWS } from '@/views/scorecard/views'
import { computeCached } from '@/views/services/engine'
import { slaStateOf } from '@/views/services/engine/cases'
import { talentModel } from '@/views/talent/engine'
import { attentionRows, belowLine, OTHER, waitRows } from './attention'
import { aboutOrg, leaderRows, practiceStatus, topLeader, withCritical } from './chro'
import { outsideList, positionParts } from './comp'
import { budgetParts, comparable, planParts, reqsAgainstPlan } from './fin'
import { groupAttrition, hrbpLists, LEADER_MIN_ORG, leaderList } from './hrbp'
import { returnsSoon, slaParts, txInFlight } from './ops'
import { healthWithAge, lackingParts, onOpenReqs, queueRows } from './rec'
import { coverageParts, highPotentials } from './talent'
import { homeTitle, recHomeCopy } from './title'

describe('Needs attention rows', () => {
  const ctx = ctxOf()
  const day = (n: number) => {
    const d = new Date(`${AS_OF}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  it('groups items by kind and due state, folding past six kinds into Other', () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      open({ kind: `Kind ${i}`, due: i % 2 ? day(-3) : day(30) }),
    )
    // One kind twice, so it ranks first.
    items.push(open({ kind: 'Kind 0', due: null }))
    const w = waitRows(items, ctx, 'kind')
    expect(w.groups).toHaveLength(7)
    expect(w.groups[0]).toBe('Kind 0')
    expect(w.groups.at(-1)).toBe(OTHER)
    const other = w.rows.find((r) => r.group === OTHER)!
    expect(other.folded).toBe(3)
    expect(other.open).toBe(3)
    expect(w.rows.reduce((n, r) => n + r.open, 0)).toBe(items.length)
    const k0 = w.rows.find((r) => r.group === 'Kind 0')!
    expect([k0.overdue, k0.soon, k0.later, k0.none]).toEqual([0, 0, 1, 1])
    // Segments carry exactly their items.
    for (const s of w.segments) expect(s.items).toBe(s.list.length)
  })

  it('keeps seven kinds on their own rows rather than folding one into Other', () => {
    const items = Array.from({ length: 7 }, (_, i) => open({ kind: `K${i}` }))
    expect(waitRows(items, ctx, 'kind').groups).not.toContain(OTHER)
  })

  it('groups the escalations by the practice that raised them', () => {
    const a = open({}, { viewLabel: 'HR ops' })
    const b = open({}, { viewLabel: 'Compliance' })
    const c = open({}, { viewLabel: 'HR ops' })
    expect(waitRows([a, b, c], ctx, 'practice').groups).toEqual(['HR ops', 'Compliance'])
  })

  it('writes the list rows with the legal exposure flag and no amount in the text', () => {
    const rows = attentionRows(
      [open({ exposure: true }), open({ amount: { usd: 4008, label: 'Gap' } })],
      AS_OF,
    )
    expect(rows[0].exposure).toBe('Legal exposure')
    expect(rows[1].exposure).toBe('')
    expect(rows[1].amount).toBe(4008)
    expect(rows[1].what).not.toMatch(/4,?008/)
  })

  it('counts the items from data below the standard in one line', () => {
    const below = { tier: 'bronze' as const, subject: 'Succession', dataset: null }
    expect(belowLine([open()])).toBeNull()
    expect(belowLine([open({}, { below })])).toBe('1 item comes from data below your standard')
    expect(belowLine([open({}, { below }), open({}, { below })])).toBe(
      '2 items come from data below your standard',
    )
  })
})

describe('page titles', () => {
  it('names each home', () => {
    expect(homeTitle(modeCtx('chro'))).toBe('Executive home')
    expect(homeTitle(modeCtx('hrbp-unit'))).toBe('Silicon Engineering')
    expect(homeTitle(modeCtx('hrbp-region'))).toBe('APAC')
    expect(homeTitle(modeCtx('compensation'))).toBe('Compensation')
    expect(homeTitle(modeCtx('talent-management'))).toBe('Talent management')
    expect(homeTitle(modeCtx('hr-ops'))).toBe('HR ops')
    expect(homeTitle(modeCtx('recruiter'))).toMatch(/'s reqs$/)
    expect(homeTitle(modeCtx('finance'))).toBe('Finance')
  })

  it('speaks to one recruiter, and names every recruiter’s reqs plainly', () => {
    const one = recHomeCopy(modeCtx('recruiter'))
    expect(one.reqs('20')).toBe('My open reqs (20)')
    expect(one.attentionDek).toMatch(/^Your own steps: /)
    expect(one.startsSubtitle('30 d')).toMatch(/^Your starts in the next 30 d /)
    // "Every recruiter" holds no scope.
    const every = recHomeCopy({ access: { ...modeCtx('recruiter').access, scope: null } })
    expect(every.reqs('114')).toBe('Open reqs (114)')
    expect(every.queue('172')).toBe('Candidates in the queue (172)')
    expect(every.reqsTitle).toBe('Open reqs')
    expect(every.attentionDek).toMatch(/^Every recruiter's steps: /)
    expect(every.startsSubtitle('30 d')).toMatch(/^Starts in the next 30 d /)
    for (const text of [
      every.reqsTitle,
      every.queueTitle,
      every.attentionDek,
      every.listDek,
      every.startsSubtitle('30 d'),
    ])
      expect(text).not.toMatch(/\b(My|my|Your|your)\b/)
  })
})

describe('the CHRO home', () => {
  it('splits every measure by practice and status, as the Scorecard counts them', () => {
    const ctx = modeCtx('chro')
    const model = scorecardNow(ctx, OTHER_VIEWS)
    const { rows, segments } = practiceStatus(model)
    expect(rows.reduce((n, r) => n + r.measures, 0)).toBe(model.counts.measures)
    expect(rows.reduce((n, r) => n + r.met, 0)).toBe(model.counts.met)
    expect(rows.reduce((n, r) => n + r.missed, 0)).toBe(model.counts.missed)
    expect(segments.reduce((n, s) => n + s.measures, 0)).toBe(model.counts.measures)
  })

  it("lists the top leader's direct reports' orgs with People stats' rates and their critical items", () => {
    const ctx = modeCtx('chro')
    const top = topLeader(ctx)!
    expect(top).toBeTruthy()
    const t = talentModel(ctx)
    const r = computeRecruiting(ctx)
    const leaders = leaderRows(ctx, { roles: t.succession.roles, openReqs: r.base.req.open })
    expect(leaders.top?.employeeId).toBe(top.employeeId)
    expect(leaders.rows.length).toBeGreaterThan(3)
    for (const row of leaders.rows) {
      expect(ctx.org.byId.get(row.id)?.managerId).toBe(top.employeeId)
      expect(row.headcount).toBe(row.score.records.active.length)
      expect(row.openReqs).toBe(row.reqs.length)
      expect(row.covered).toBeLessThanOrEqual(row.criticalRoles)
      expect(row.hrbp).not.toBe('')
    }
    // Open reqs in leaders' orgs never exceed the company's.
    expect(leaders.rows.reduce((n, x) => n + x.openReqs, 0)).toBeLessThanOrEqual(r.base.req.open.length)
    const critical = open({ severity: 'critical' }, { ownerId: leaders.rows[0].id, role: 'manager' })
    const counted = withCritical(leaders.rows, [
      critical,
      open({ severity: 'warning' }, { ownerId: leaders.rows[0].id, role: 'manager' }),
    ])
    expect(counted[0].critical).toBe(1)
    expect(withCritical(leaders.rows, null)[0].critical).toBeNull()
  })

  it("counts a critical item for the org it is about, never for the HR queue's own org", () => {
    const ctx = modeCtx('chro')
    const leaders = leaderRows(ctx, {
      roles: talentModel(ctx).succession.roles,
      openReqs: computeRecruiting(ctx).base.req.open,
    })
    const items = collectActions(ctx, VIEWS).items
    const rows = withCritical(leaders.rows, items)
    // The Chief People Officer's org holds the HR queues (recruiters, coordinators, Global
    // mobility): their casework about other orgs never counts toward it.
    const cpo = rows.find((r) => /people/i.test(r.title))
    expect(cpo).toBeTruthy()
    const heldOnly = items.filter(
      (a) =>
        a.item.severity === 'critical' &&
        a.role !== 'manager' &&
        !!a.ownerId &&
        cpo?.ids.has(a.ownerId) &&
        !aboutOrg(a, cpo),
    )
    expect(heldOnly.length).toBeGreaterThan(10)
    for (const a of heldOnly) expect(cpo?.criticalItems.includes(a), a.id).toBe(false)
    // The org with the most critical items about it is a business unit's, not the CPO's.
    const most = [...rows].sort((a, b) => (b.critical ?? 0) - (a.critical ?? 0))[0]
    expect(most.id).not.toBe(cpo?.id)
    for (const r of rows)
      for (const a of r.criticalItems) expect(aboutOrg(a, r), `${r.leader} ${a.id}`).toBe(true)
  })
})

describe('the HRBP homes', () => {
  it("lists the unit's leaders with their org's numbers", () => {
    const ctx = modeCtx('hrbp-unit')
    const m = hrbpModel(ctx)
    const rows = leaderList(ctx, m, computeRecruiting(ctx).base.req.open)
    expect(rows.length).toBeGreaterThan(5)
    for (const r of rows) {
      const e = ctx.org.byId.get(r.id)!
      const leaderLevel = e.level === 'M2' || !!e.level?.startsWith('E')
      expect(leaderLevel || r.headcount >= LEADER_MIN_ORG, r.leader).toBe(true)
      expect(r.netChange).toBe(r.joined.length - r.left.length)
      expect(r.openReqs).toBe(r.reqs.length)
      if (r.voluntary != null) expect(r.voluntaryLeavers.length).toBeGreaterThanOrEqual(0)
    }
    // Largest org first.
    for (let i = 1; i < rows.length; i++)
      expect(rows[i - 1].headcount).toBeGreaterThanOrEqual(rows[i].headcount)
  })

  it('marks which sites are in the US, where I-9 Section 2 applies', () => {
    // The sample's APAC region: Bengaluru, Ho Chi Minh City, Hsinchu, Shanghai. No US site, so the
    // Sites list leaves its I-9 column out.
    const { sites } = hrbpLists(modeCtx('hrbp-region'))
    expect(sites.length).toBeGreaterThan(0)
    expect(sites.some((r) => r.usSite)).toBe(false)
    expect(sites.every((r) => r.i9.length === 0)).toBe(true)
  })

  it('marks departments well above the company, the highest rate first', () => {
    const m = hrbpModel(modeCtx('hrbp-unit'))
    const { rows, company } = groupAttrition(m, 'department')
    expect(company).not.toBeNull()
    const rates = rows.map((r) => r.voluntaryRate).filter((v): v is number => v != null)
    expect(rates).toEqual([...rates].sort((a, b) => b - a))
    for (const r of rows.filter((x) => x.above))
      expect((r.voluntaryRate ?? 0) - (company ?? 0)).toBeGreaterThanOrEqual(0.03 - 1e-9)
  })
})

describe('the Compensation home', () => {
  it('splits everyone with a range by position, and lists those outside it, below the minimum first', () => {
    const m = compModel(modeCtx('compensation'))
    const parts = positionParts(m.overview.positionAll)
    expect(parts.reduce((n, p) => n + p.count, 0)).toBe(m.overview.positionAll.members.length)
    const list = outsideList(m)
    expect(list.filter((r) => r.side === 'below')).toHaveLength(m.ranges.below.length)
    expect(list.filter((r) => r.side === 'above')).toHaveLength(m.ranges.above.length)
    expect(list[0].side).toBe('below')
    const below = list.filter((r) => r.side === 'below').map((r) => r.gapPct)
    expect(below).toEqual([...below].sort((a, b) => b - a))
  })
})

describe('the Talent management home', () => {
  it("splits the critical roles by their best successor, and lists the 9-box's top row", () => {
    const ctx = modeCtx('talent-management')
    const t = talentModel(ctx)
    const critical = t.succession.roles.filter((r) => r.criticality === 'Critical')
    const parts = coverageParts(critical)
    expect(parts.reduce((n, p) => n + p.count, 0)).toBe(critical.length)
    expect(parts.find((p) => p.key === 'Ready now')?.count).toBe(t.succession.criticalCovered)
    const hipos = highPotentials(t.nineBox, t.riskShown, ctx.org.byId)
    const top = t.nineBox.cells.filter((c) => c.potential === 'High').reduce((n, c) => n + c.people.length, 0)
    expect(hipos).toHaveLength(top)
    // No flight-risk band where the mode hides scores about named people.
    expect(highPotentials(t.nineBox, false, ctx.org.byId).every((r) => r.riskBand == null)).toBe(true)
  })
})

describe('the HR ops home', () => {
  it('splits the open cases by SLA state, leaving employee relations out of the count in a small scope', () => {
    const ctx = modeCtx('hr-ops')
    const m = computeCached(ctx)
    const parts = slaParts(m.cases, m.asOf, true)
    const open = m.cases.filter((f) => f.open)
    expect(parts.reduce((n, p) => n + p.count, 0)).toBe(open.length)
    for (const p of parts) for (const f of p.facts) expect(slaStateOf(f, m.asOf)).toBe(p.key)
    const without = slaParts(m.cases, m.asOf, false)
    expect(without.reduce((n, p) => n + p.private, 0)).toBe(0)
  })

  it('lists transactions in flight, the most overdue first, and returns soonest first without a reason', () => {
    const ctx = modeCtx('hr-ops')
    const m = computeCached(ctx)
    const tx = txInFlight(m.tx, m.asOf)
    for (const r of tx) expect(r.fact.completed).toBeNull()
    const firstLater = tx.findIndex((r) => r.dueState !== 'Overdue')
    if (firstLater > 0) for (const r of tx.slice(firstLater)) expect(r.dueState).not.toBe('Overdue')
    const back = returnsSoon(m.leave.upcoming)
    for (const r of back) {
      expect(r.daysAway).toBeLessThanOrEqual(30)
      expect(Object.keys(r)).not.toContain('reason')
    }
  })
})

describe('the Recruiter home', () => {
  it('splits the candidates lacking a next step by what they wait on, and lists the queue', () => {
    const ctx = modeCtx('recruiter')
    const b = computeRecruiting(ctx).base
    const parts = lackingParts(b.actives)
    expect(parts.reduce((n, p) => n + p.count, 0)).toBe(b.actives.filter((x) => x.tier).length)
    for (const p of parts) expect(p.red + p.amber).toBe(p.count)
    const q = queueRows(b.actives, String)
    for (let i = 1; i < q.length; i++) expect(q[i - 1].days).toBeGreaterThanOrEqual(q[i].days)
  })

  it('counts candidates on open reqs only, as Needs attention does, and says the held ones', () => {
    const ctx = modeCtx('recruiter')
    const b = computeRecruiting(ctx).base
    const { open, held } = onOpenReqs(b.actives, b.asOf)
    expect(open.length + held.length).toBe(b.actives.length)
    for (const x of held) expect(x.app.req?.status, x.app.id).not.toBe('Open')
    // Every candidate step in Needs attention sits on an open req.
    const ids = new Set(open.map((x) => x.app.id))
    const needs = roleView(collectActions(ctx, VIEWS), ctx, () => true).needs
    for (const a of needs.flatMap((x) => x.members ?? [x]))
      if (a.item.subject.kind === 'candidates') expect(ids.has(a.item.subject.id ?? ''), a.id).toBe(true)
  })

  it("says a req's age against its bar in Health once it is past it", () => {
    const bar = { past: 45, critical: 112.5, words: 'the target is 45 d' }
    expect(healthWithAge('1 lacks a next step', 165, bar)).toBe(
      '1 lacks a next step; open 165 d against a target of 45 d',
    )
    expect(healthWithAge('On track', 30, bar)).toBe('On track')
    expect(healthWithAge('On track', 72, bar)).toBe('Open 72 d against a target of 45 d')
    expect(healthWithAge('On track', 90, null)).toBe('On track')
  })
})

describe('the Finance home', () => {
  it('compares against the budget when one is loaded, by business unit', () => {
    const ctx = modeCtx('finance')
    const b = compModel(ctx).cost.budget
    expect(comparable(b)).toBe(true)
    if (!comparable(b)) return
    const parts = budgetParts(b)
    const units = b.byUnit.filter((r) => !r.isOther && r.headcountStatus)
    expect(parts.reduce((n, p) => n + p.count, 0)).toBe(units.length)
    // The sample's story: Go-to-Market over on headcount, Silicon Engineering under.
    expect(parts.find((p) => p.key === 'over')?.units).toContain('Go-to-Market')
    expect(parts.find((p) => p.key === 'under')?.units).toContain('Silicon Engineering')
  })

  it('falls back to the hiring plan: units by plan status and open reqs against the plan', () => {
    const ctx = modeCtx('finance')
    const p = computeOnboarding(ctx).plan!
    expect(p).toBeTruthy()
    const parts = planParts(p)
    expect(parts.reduce((n, x) => n + x.count, 0)).toBe(p.byUnit.filter((r) => r.status).length)
    const open = computeRecruiting(ctx).base.req.open
    const rows = reqsAgainstPlan(p, open)
    expect(rows.reduce((n, r) => n + r.inPlan + r.notInPlan + r.backfills, 0)).toBe(open.length)
    expect(rows.reduce((n, r) => n + r.notInPlan, 0)).toBe(p.notInPlan.added.length)
  })
})

describe('Needs attention volume (docs/ACTION-CENTER-AUDIT.md 4.3: roll-ups and lists, not more items)', () => {
  it("keeps Compensation's and Finance's Needs attention to 15 items or fewer on the sample", () => {
    for (const mode of ['compensation', 'finance'] as const) {
      const ctx = modeCtx(mode)
      const lists = roleView(collectActions(ctx, VIEWS), ctx, () => true)
      expect(lists.needs.length, mode).toBeGreaterThan(0)
      expect(lists.needs.length, mode).toBeLessThanOrEqual(15)
      // Per business unit roll-ups, never one item a person or a plan line.
      for (const a of lists.needs)
        if (/^(comp:guideline-exception|onboarding:plan-no-req):/.test(a.id))
          expect(a.item.subject.kind, a.id).toBe('none')
    }
  }, 120_000)
})
