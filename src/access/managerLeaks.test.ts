/**
 * Manager mode leaks found in review (docs/ROLES.md, 3.3 and 4.5): no flight-risk score about a
 * named person anywhere in Talent (screen, records, exports); no decline reasons in Recruiting's
 * findings; a training rate never over fewer than 5 people; no exit what-if; no manager picked
 * means nobody in scope; the manager's own potential and succession stay with HR; Onboarding words
 * a contingency as the team holding it and leaves I-9 tasks out of readiness by task; and Help,
 * Report a problem and the saved-view notice say only what the mode shows.
 */
import { describe, expect, it, vi } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { Conversation } from '@/ask/engine/conversation'
import { call, envOf, sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { isActiveAt, isEmployee } from '@/data/scope'
import { personSummary } from '@/drill/person'
import type { DrillSpec } from '@/drill/types'
import { articleInMode, articlesInMode, glossaryInMode, tourInMode } from '@/help/access'
import { ARTICLES, articleById } from '@/help/articles'
import { type DiagnosticState, diagnosticInput } from '@/help/diagnosticInput'
import { buildGlossary } from '@/help/glossary'
import { blockTexts } from '@/help/markup'
import { buildIndex, search } from '@/help/search'
import { TOURS } from '@/help/tours'
import type { Block } from '@/help/types'
import { METRICS } from '@/metrics/catalog'
import { computeOnboarding } from '@/views/onboarding/engine'
import { blockingWords, CONTINGENCY_TASKS, isI9Task } from '@/views/onboarding/engine/upcoming'
import { computeBase } from '@/views/recruiting/engine/base'
import { allProblemFindings } from '@/views/recruiting/engine/findings'
import { computeTalent, type TalentModel } from '@/views/talent/engine'
import {
  nineBoxColumns,
  nineBoxDetailColumns,
  roleColumns,
  roleDetailColumns,
} from '@/views/talent/ui/columns'
import { linkLeaderReplaced, TOUR_NOT_SHOWN } from './copy'
import { decide, MANAGER_DATASETS } from './policy'
import { inLock } from './records'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const hr = sampleCtx()
const leaders = leaderOptions(hr.org, hr.asOf, 3)
/** The reviewer's manager (85 people, two director sub-orgs), or one like it. */
const mid =
  leaders.find((l) => l.id === 'E10427') ??
  leaders.find((l) => l.size >= 25 && l.size <= 90 && hr.org.byId.get(l.id)?.managerId)!
/** An org under the anonymity minimum (the reviewer's E10380 has 4 people). */
const small = leaders.find((l) => l.id === 'E10380') ?? leaders.find((l) => l.size < 5)!

const managerCtx = (managerId: string): AnalyticsContext =>
  sampleCtx({ access: { mode: 'manager', managerId } })

const manager = managerCtx(mid.id)
/** HR on the same org, to show what Manager mode leaves out. */
const hrSame = sampleCtx({ filters: { leaderId: mid.id } })

const RISK_KEY = /risk(Band|Score)|highRisk|modelRisk/
const RISK_LABEL = /flight/i

/** Every spec a Talent model's 9-box, promotion and role drills open. */
function talentSpecs(m: TalentModel): DrillSpec[] {
  const specs: DrillSpec[] = []
  const add = (src: (() => DrillSpec | null) | null) => {
    const s = src?.()
    if (s) specs.push(s)
  }
  for (const c of m.nineBox.cells) {
    add(m.drill.nineBox(c.performance, c.potential, 'all'))
    add(m.drill.nineBox(c.performance, c.potential, 'highRisk'))
  }
  add(m.drill.promotionOverdue())
  add(m.drill.roles(m.succession.roles, 'Roles'))
  return specs
}

const columnsOf = (s: DrillSpec) => s.extra?.columns ?? []

describe('Talent shows no flight-risk score about a named person in Manager mode', () => {
  const m = computeTalent(manager)
  const h = computeTalent(hrSame)

  it('reads no score at all: the 9-box, the roles and the promotion list carry none', () => {
    expect(m.riskShown).toBe(false)
    expect(m.riskOverlay).toBe(false)
    for (const c of m.nineBox.cells) {
      expect(c.highRisk).toBe(0)
      for (const p of c.people) expect([p.riskBand, p.riskScore]).toEqual([null, null])
    }
    for (const r of m.succession.roles) expect(r.modelRisk).toBeNull()
    for (const r of m.overdue.rows) expect(r.riskBand).toBeNull()
    // HR on the same org has them, so the test would notice a leak.
    expect(h.riskShown).toBe(true)
    expect(h.nineBox.cells.some((c) => c.people.some((p) => p.riskScore != null))).toBe(true)
  })

  it('leaves the risk columns out of the figure tables and the export rows', () => {
    const keys = [
      ...nineBoxColumns(m.drill, m.riskOverlay).map((c) => c.key),
      ...nineBoxDetailColumns('2025 Annual', m.riskOverlay).map((c) => c.key),
      ...roleColumns(m.drill, m.riskShown).map((c) => c.key),
      ...roleDetailColumns(m.riskShown).map((c) => c.key),
    ]
    for (const k of keys) expect(k, k).not.toMatch(RISK_KEY)
    expect(roleColumns(h.drill, h.riskShown).map((c) => c.key)).toContain('modelRisk')
  })

  it('opens records with no risk column or value, and no high-risk drill', () => {
    const specs = talentSpecs(m)
    expect(specs.length).toBeGreaterThan(3)
    for (const s of specs) {
      for (const c of columnsOf(s)) {
        expect(c.key, s.title).not.toMatch(RISK_KEY)
        expect(c.label, s.title).not.toMatch(RISK_LABEL)
      }
      expect(s.title).not.toMatch(RISK_LABEL)
      for (const row of s.rows.slice(0, 20)) {
        const values = s.extra?.values(row as never) ?? {}
        for (const k of Object.keys(values)) expect(k, s.title).not.toMatch(RISK_KEY)
      }
    }
    for (const c of m.nineBox.cells)
      expect(m.drill.nineBox(c.performance, c.potential, 'highRisk')).toBeNull()
    expect(m.drill.keyTalent()).toBeNull()
    expect(m.drill.activeHighPerformers()).toBeNull()
  })

  it('does not mark a succession finding from model scores', () => {
    const exposed = m.findings.find((f) => f.id === 'talent-succession-exposed')
    if (exposed)
      for (const p of exposed.people ?? [])
        expect(m.succession.roles.some((r) => r.incumbentId === p.id)).toBe(true)
  })
})

describe("the manager's own talent records stay with HR", () => {
  const m = computeTalent(manager)
  const root = mid.id

  it('leaves the manager out of the 9-box and their own succession plan out of the roles', () => {
    for (const c of m.nineBox.cells) expect(c.people.some((p) => p.employeeId === root)).toBe(false)
    for (const r of m.succession.roles) expect(r.incumbentId).not.toBe(root)
    const own = hr.all.succession.find((p) => p.incumbentId === root)
    if (own) expect(inLock('succession', own, manager)).toBe(false)
  })

  it('shows their final ratings on their card, with no potential, proposed rating or successor roles', () => {
    const p = personSummary(manager, root)!
    expect(p.reviews.length).toBe(hr.all.reviews.filter((r) => r.employeeId === root).length)
    for (const r of p.reviews) expect([r.potential, r.preCalibrationRating]).toEqual([null, null])
    expect(p.successorFor).toEqual([])
    // HR mode keeps the full card.
    const full = personSummary(hr, root)!
    expect(full.reviews.length).toBe(p.reviews.length)
  })

  it('names, for someone inside the org, only successor roles inside it', () => {
    const lock = manager.access.lock!
    for (const id of [...lock.orgIds].slice(0, 200)) {
      if (id === root) continue
      const titles = personSummary(manager, id)?.successorFor ?? []
      const allowed = new Set(
        hr.all.succession
          .filter((s) => s.successorId === id && lock.orgIds.has(s.incumbentId) && s.incumbentId !== root)
          .map((s) => s.roleTitle),
      )
      for (const t of titles) expect(allowed.has(t), `${id} ${t}`).toBe(true)
    }
  })
})

describe('Recruiting findings give no decline reasons in Manager mode', () => {
  it('drops the reasons from the offer acceptance finding and its people', () => {
    const mine = allProblemFindings(computeBase(manager)).find((f) => f.id === 'rec-offer-acceptance')
    const theirs = allProblemFindings(computeBase(hrSame)).find((f) => f.id === 'rec-offer-acceptance')
    if (!mine || !theirs) return
    expect(mine.detail ?? '').not.toMatch(/reasons? for declining/i)
    for (const p of mine.people ?? []) expect(p.note ?? '').toMatch(/^Declined · [^·]+$/)
    // HR on the same org names them, so the test would notice a leak.
    expect(theirs.detail ?? '').toMatch(/reasons for declining/i)
  })

  it("keeps them out of Ask's Recruiting summary and Talent's risk out of its Talent summary", () => {
    const conv = new Conversation()
    const rec = call(conv, envOf(manager), 'view_summary', { view: 'recruiting' }).content
    expect(rec).not.toMatch(/reasons? for declining|competing offer|compensation below/i)
    const tal = call(conv, envOf(manager), 'view_summary', { view: 'talent' }).content
    expect(tal).not.toMatch(/flight|high risk/i)
  })
})

describe('an org under 5 people shows no training rate', () => {
  it('hides required training on time however many assignments are due', () => {
    expect(small.size).toBeLessThan(5)
    const m = computeTalent(managerCtx(small.id))
    expect(m.learning.current.people).toBeLessThan(5)
    expect(m.learning.current.rate).toBeNull()
    for (const c of m.learning.byCourse) expect(c.onTimeRate).toBeNull()
    const tile = m.kpis.find((k) => k.id === 'talent-training-on-time')
    if (tile && m.learning.current.due > 0) expect(tile.value == null || tile.suppressed).toBe(true)
  })
})

describe('no usable manager means nobody in scope', () => {
  it('treats someone who leads fewer than 3 as no manager picked, not a one-person org', () => {
    const ic = hr.all.employees.find(
      (e) =>
        isEmployee(e) &&
        isActiveAt(e, hr.asOf) &&
        !hr.all.employees.some((x) => x.managerId === e.employeeId),
    )!
    for (const id of [ic.employeeId, 'E99999']) {
      const ctx = managerCtx(id)
      expect(ctx.access.unset, id).toBe(true)
      expect(ctx.data.employees, id).toEqual([])
      expect(ctx.scopeLabel).toBe('No manager picked')
      expect(ctx.access.lock?.managerName).toBe('')
    }
    expect(manager.access.unset).toBe(false)
  })
})

describe('Org chart and Onboarding in Manager mode', () => {
  it('hides the exit what-if', () => {
    expect(decide('manager', 'org:simulate-exit').access).toBe('hidden')
    expect(decide('hr', 'org:simulate-exit').access).toBe('shown')
    expect(decide('developer', 'org:simulate-exit').access).toBe('shown')
  })

  it('words a contingency as the team holding it and leaves I-9 tasks out of readiness by task', () => {
    const o = computeOnboarding(manager)
    expect(o.base.masked).toBe(true)
    for (const r of o.upcoming.byTask) expect(isI9Task(r.task), r.task).toBe(false)
    for (const r of o.upcoming.rows) {
      const b = r.readiness.blocking
      const words = blockingWords(r.readiness, true)
      if (b && CONTINGENCY_TASKS.includes(b.name)) expect(words).toBe(`With ${b.owner}`)
    }
    const fake = { blocking: { name: 'Background check cleared', owner: 'People ops', due: '2026-10-16' } }
    expect(blockingWords(fake as never, true)).toBe('With People ops')
    expect(blockingWords(fake as never, false)).toBe('Background check cleared, due 16 Oct 2026')
    expect(computeOnboarding(hrSame).base.masked).toBe(false)
  })
})

describe('Help, Report a problem and notices say only what the mode shows', () => {
  const access = manager.access
  const glossary = buildGlossary(METRICS)

  it('leaves hidden sections out of the articles, their summaries and search', () => {
    const talent = articleInMode(access, articleById('view-talent')!)
    const text = talent.body.flatMap((b) => blockTexts(b)).join(' ')
    expect(text).not.toMatch(/flight-risk score from 0 to 100|Retention risk/)
    expect(talent.summary).not.toMatch(/who might we lose/)
    const org = articleInMode(access, articleById('view-org')!)
    expect(org.body.some((b) => 'h' in b && b.h === 'Reorg sandbox')).toBe(false)
    const index = buildIndex(articlesInMode(access, ARTICLES), glossaryInMode(access, glossary))
    for (const [q, article] of [
      ['reorg', 'view-org'],
      ['flight risk', 'view-talent'],
    ]) {
      const r = search(index, q)
      expect(
        r.articles.map((a) => a.article.id),
        q,
      ).not.toContain(article)
      for (const t of r.terms) expect(t.entry.id, q).not.toMatch(/^org\.scenario\.|^talent\.retention\./)
    }
    // HR keeps everything it shows: every section, the usual summary. (Blocks written for one
    // mode, such as Manager's "successor outside your org", are left out of HR's.)
    const usual = articleById('view-talent')!
    const full = articleInMode(hr.access, usual)
    const headings = (body: readonly Block[]) => body.flatMap((b) => ('h' in b ? [b.h] : []))
    expect(headings(full.body)).toEqual(headings(usual.body))
    expect(full.summary).toBe(usual.summary)
    expect(full.body.flatMap((b) => blockTexts(b)).join(' ')).toMatch(/flight-risk score from 0 to 100/)
    expect(full.keywords).toContain('flight risk')
    expect(
      search(buildIndex(articlesInMode(hr.access, ARTICLES), glossary), 'reorg').articles.length,
    ).toBeGreaterThan(0)
  })

  it('gives tours a summary without the hidden parts', () => {
    for (const id of ['view-org', 'view-talent', 'view-onboarding']) {
      const t = tourInMode(access, TOURS.find((x) => x.id === id) ?? null)
      if (t) expect(t.summary, id).not.toMatch(/reorg|flight risk|hiring plan/i)
    }
  })

  it('leaves the pay, immigration and survey privacy rules out of the glossary', () => {
    const ids = glossaryInMode(access, glossary).map((e) => e.id)
    for (const id of ['privacy.payAmounts', 'privacy.immigrationDetails', 'privacy.surveyAnswers'])
      expect(ids).not.toContain(id)
    expect(ids).toContain('privacy.anonymity')
    expect(glossaryInMode(hr.access, glossary).map((e) => e.id)).toContain('privacy.payAmounts')
  })

  it('lists only the datasets Manager mode reads in Report a problem', () => {
    const state = {
      route: { view: 'team', tab: '' },
      filters: manager.filters,
      dataStandard: 'silver',
      reference: { mappings: [], changes: [] },
    } as unknown as DiagnosticState
    const env = { hash: '#team', browser: 'test', windowSize: '1440 × 900', at: '2026-10-01', lensOn: false }
    expect(diagnosticInput(manager, state, env).datasets).toHaveLength(MANAGER_DATASETS.length)
    expect(diagnosticInput(hr, { ...state, filters: hr.filters }, env).datasets.length).toBeGreaterThan(
      MANAGER_DATASETS.length,
    )
  })

  it("says a saved view's leader, not a link's, and that a tour is not shown", () => {
    expect(linkLeaderReplaced('Priya Raman', 'view')).toBe(
      "Manager mode shows Priya Raman's org, so the view's leader was replaced.",
    )
    expect(linkLeaderReplaced('Priya Raman')).toContain("the link's leader")
    expect(TOUR_NOT_SHOWN).toBe('That tour is not shown in this mode.')
  })
})
