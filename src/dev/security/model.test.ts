/**
 * The Security center's editor model and draft: cells read built in, in force or changed in the
 * draft; the filters; the role page's pay, person card and home controls write the surfaces they
 * should and refuse what crosses a guard rail; the draft logs who, when and why, undoes one change
 * at a time, is kept in this browser and rides in the settings file; and a file's lines are
 * screened one by one.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  ANALYSIS_PARTS,
  DRAFT_KEY,
  draftChanges,
  emptyDraft,
  inForceChanges,
  loadDraft,
  overridesOf,
  type PolicyLine,
  type PolicyRole,
  parseDraft,
  resetPolicyState,
  resetRoleInDraft,
  saveDraft,
  screenLines,
  setInDraft,
  undoInDraft,
} from '@/access/overrides'
import { decideUnder } from '@/access/policy'
import { DEFAULT_SETTINGS, parseSettingsFile, settingsBlob } from '@/data/settings'
import { ANALYSIS_LABEL } from '@/views/hrbp/analyses/tab'
import { editRows, surfaceCatalog, surfaceLabel } from './inventory'
import {
  cardLevelOf,
  cellOf,
  filterRows,
  homeChoices,
  indexLines,
  knockOn,
  payLevelOf,
  payLines,
  refusal,
} from './model'

afterEach(() => resetPolicyState())

const AT = '2026-10-08T09:00:00.000Z'
const stamp = { reason: 'Because', by: 'Ana Ruiz', at: AT }
const label = (s: string) => surfaceLabel(s)
const line = (role: PolicyRole, surface: string, decision: string): PolicyLine => ({
  role,
  surface,
  decision,
  reason: 'Because',
  by: 'Ana Ruiz',
  at: AT,
})

class MemoryStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
}

describe('the editor rows and cells', () => {
  const rows = editRows()

  it('lists the matrix rows in their groups, the metrics, and no overlay or shortcut', () => {
    const groups = new Set(rows.map((r) => r.group))
    for (const g of ['views', 'tabs', 'figures', 'metrics', 'data', 'pay', 'ask', 'exports', 'pages'])
      expect(groups.has(g as never), g).toBe(true)
    expect(rows.some((r) => r.surface.startsWith('overlay:'))).toBe(false)
    expect(rows.some((r) => r.surface === 'view:recruiting' && r.label === 'Recruiting')).toBe(true)
    expect(rows.find((r) => r.surface === 'tab:hrbp.analyses:quality')?.label).toMatch(/Quality of hire$/)
    expect(new Set(rows.map((r) => r.surface)).size).toBe(rows.length)
  })

  it('keeps the analyses’ labels equal to the view’s', () => {
    for (const p of ANALYSIS_PARTS) expect(ANALYSIS_LABEL[p.key as keyof typeof ANALYSIS_LABEL]).toBe(p.label)
  })

  it('reads each cell as built in, set in force, or changed in the draft', () => {
    const row = rows.find((r) => r.surface === 'view:ai')!
    const inForce = [line('finance', 'view:ai', 'shown'), line('hr', 'view:ai', 'hidden')]
    const draft = [line('finance', 'view:ai', 'shown'), line('recruiter', 'view:ai', 'hidden')]
    const ov = overridesOf(draft)
    const cell = (r: PolicyRole) => cellOf(row, r, ov, indexLines(draft), indexLines(inForce))
    expect(cell('finance')).toMatchObject({ state: 'in-force', decision: { access: 'shown' } })
    expect(cell('recruiter')).toMatchObject({ state: 'draft', decision: { access: 'hidden' } })
    // Taken out of the draft but still in force: a change too.
    expect(cell('hr')).toMatchObject({ state: 'draft', decision: { access: 'shown' } })
    expect(cell('chro').state).toBe('default')
  })

  it('filters by group, searches every group, and keeps the changed only', () => {
    const f = { group: 'views' as const, query: '', changedOnly: false }
    expect(filterRows(rows, f, [], []).every((r) => r.group === 'views')).toBe(true)
    const found = filterRows(rows, { ...f, query: 'make_chart' }, [], [])
    expect(found.map((r) => r.surface)).toContain('ask:make_chart')
    const changed = filterRows(
      rows,
      { ...f, group: 'all', changedOnly: true },
      [line('hr', 'export:view', 'hidden')],
      [],
    )
    expect(changed.map((r) => r.surface)).toEqual(['export:view'])
  })
})

describe('the role page controls', () => {
  const builtIn = (role: PolicyRole) => (s: string) => decideUnder(null, role, s).access

  it('reads and writes the pay levels', () => {
    expect(payLevelOf('finance', null)).toBe('totals')
    expect(payLevelOf('compensation', null)).toBe('switch')
    expect(payLevelOf('hrbp-unit', null)).toBe('ratios')
    const lines = payLines('switch', builtIn('finance')).map((c) => ({
      ...line('finance', c.surface, c.decision),
    }))
    expect(payLevelOf('finance', overridesOf(lines))).toBe('switch')
    const none = payLines('none', builtIn('hrbp-unit')).map((c) => line('hrbp-unit', c.surface, c.decision))
    expect(payLevelOf('hrbp-unit', overridesOf(none))).toBe('none')
    expect(decideUnder(overridesOf(none), 'hrbp-unit', 'metric:comp.compa.median').access).toBe('hidden')
    // Totals keep the role's own ratios.
    expect(
      payLines('totals', builtIn('finance')).find((c) => c.surface === 'person:compa-ratio')?.decision,
    ).toBe(builtIn('finance')('person:compa-ratio'))
  })

  it('refuses amounts without their switch, and a switch hidden under shown amounts', () => {
    expect(refusal([], { role: 'finance', surface: 'pay:amounts', decision: 'shown' })?.rail).toBe('switches')
    expect(
      refusal([line('finance', 'pay:switch', 'shown')], {
        role: 'finance',
        surface: 'pay:amounts',
        decision: 'shown',
      }),
    ).toBeNull()
    expect(refusal([], { role: 'compensation', surface: 'pay:switch', decision: 'hidden' })?.rail).toBe(
      'switches',
    )
  })

  it('reads the person card, and offers homes the role shows', () => {
    expect(cardLevelOf('hr', null)).toBe('full')
    expect(cardLevelOf('manager', null)).toBe('limited')
    const views = editRows()
      .filter((r) => r.surface.startsWith('view:'))
      .map((r) => ({ key: r.surface.slice(5), label: r.label }))
    const finance = homeChoices('finance', null, views).map((v) => v.key)
    expect(finance).toContain('home')
    expect(finance).toContain('comp')
    expect(finance).not.toContain('talent')
    expect(homeChoices('manager', null, views).map((v) => v.key)).toEqual(['team'])
    expect(refusal([], { role: 'manager', surface: 'role:home', decision: 'hrbp' })?.why).toMatch(/pick/)
    expect(refusal([], { role: 'finance', surface: 'role:home', decision: 'talent' })?.why).toMatch(/shows/)
  })

  it('says what a change takes along', () => {
    expect(knockOn('hr', 'view:recruiting', 'hidden', overridesOf([]))).toMatch(/tabs, figures/)
    expect(knockOn('finance', 'view:services', 'shown', overridesOf([]))).toMatch(/Cases/)
    expect(knockOn('hr', 'export:view', 'hidden', overridesOf([]))).toBeNull()
  })
})

describe('the draft', () => {
  it('logs every change with who, when and why, and keeps only what differs', () => {
    let d = emptyDraft()
    d = setInDraft(d, { role: 'hr', surface: 'view:ai', decision: 'hidden' }, stamp, label)
    d = setInDraft(d, { role: 'hr', surface: 'view:ai', decision: 'shown' }, stamp, label)
    expect(d.lines).toEqual([])
    expect(d.log.map((e) => e.what)).toEqual([
      'HR: AI in HR hidden (was shown)',
      'HR: AI in HR shown (was hidden)',
    ])
    expect(d.log[0]).toMatchObject({ by: 'Ana Ruiz', at: AT, why: 'Because' })
    expect(d.author).toBe('Ana Ruiz')
  })

  it('resets a role and undoes one change back to what is in force', () => {
    const inForce = [line('finance', 'view:ai', 'shown')]
    let d = emptyDraft(inForce)
    d = setInDraft(d, { role: 'finance', surface: 'view:ai', decision: 'hidden' }, stamp, label)
    d = setInDraft(d, { role: 'finance', surface: 'export:view', decision: 'hidden' }, stamp, label)
    d = setInDraft(d, { role: 'hr', surface: 'export:view', decision: 'hidden' }, stamp, label)
    expect(draftChanges(d.lines, inForce, label).map((c) => c.text)).toEqual([
      'Finance: AI in HR hidden (was shown)',
      'Finance: Whole-view exports hidden (was limited)',
      'HR: Whole-view exports hidden (was shown)',
    ])
    d = undoInDraft(d, inForce, 'finance', 'view:ai', stamp, label)
    expect(d.lines.find((l) => l.surface === 'view:ai')).toEqual(inForce[0])
    expect(d.log.at(-1)?.what).toBe('Undone: Finance: AI in HR shown (was hidden)')
    d = resetRoleInDraft(d, 'finance', stamp)
    expect(d.lines.map((l) => `${l.role} ${l.surface}`)).toEqual(['hr export:view'])
    expect(d.log.at(-1)?.what).toBe('Finance: back to the defaults')
    expect(inForceChanges(inForce, label).map((c) => c.text)).toEqual([
      'Finance: AI in HR shown (was hidden)',
    ])
  })

  it('is kept in this browser and read back, and anything unreadable is no draft', () => {
    const storage = new MemoryStorage()
    const d = setInDraft(emptyDraft(), { role: 'hr', surface: 'view:ai', decision: 'hidden' }, stamp, label)
    expect(saveDraft(d, storage)).toBe(true)
    expect(storage.getItem(DRAFT_KEY)).toContain('view:ai')
    expect(loadDraft(storage)).toEqual(d)
    expect(parseDraft({ v: 2 })).toBeNull()
    expect(
      parseDraft({ v: 1, lines: [{ role: 'auditor', surface: 'x', decision: 'hidden' }] })?.lines,
    ).toEqual([])
    expect(saveDraft(d, null)).toBe(false)
  })

  it('rides in the settings file and comes back out of it', async () => {
    const d = setInDraft(emptyDraft(), { role: 'hr', surface: 'view:ai', decision: 'hidden' }, stamp, label)
    const text = await settingsBlob(DEFAULT_SETTINGS, new Date(AT), undefined, undefined, undefined, {
      draft: d,
    }).text()
    const r = parseSettingsFile(text, DEFAULT_SETTINGS, '2026-10-08')
    expect(r.ok).toBe(true)
    if (r.ok) expect(parseDraft((r.accessDraftSection as { draft: unknown }).draft)).toEqual(d)
    const without = JSON.parse(await settingsBlob(DEFAULT_SETTINGS, new Date(AT)).text())
    expect(without.accessDraft).toBeUndefined()
  })
})

describe('screening a file’s lines', () => {
  const cat = surfaceCatalog()

  it('keeps the last of two lines for one role and surface', () => {
    const r = screenLines([line('hr', 'view:ai', 'hidden'), line('hr', 'view:ai', 'limited')], cat)
    expect(r.lines.map((l) => l.decision)).toEqual(['limited'])
    expect(r.skipped).toMatchObject([{ index: 0, kind: 'replaced' }])
  })

  it('takes role settings, figures by their shape, metric families and item prefixes', () => {
    const r = screenLines(
      [
        line('finance', 'role:home', 'comp'),
        line('chro', 'role:offered', 'hidden'),
        line('hr', 'figure:recruiting-some-new-chart', 'hidden'),
        line('hr', 'metric:listening.*', 'hidden'),
        line('hr', 'item:onboarding:i9:', 'hidden'),
        line('hr', 'role:home', 'nowhere'),
        line('hr', 'figure:Not An Id', 'hidden'),
        line('hr', 'view:ai', 'maybe'),
      ],
      cat,
    )
    expect(r.lines.map((l) => l.surface)).toEqual([
      'role:home',
      'role:offered',
      'figure:recruiting-some-new-chart',
      'metric:listening.*',
      'item:onboarding:i9:',
    ])
    expect(r.skipped.map((s) => [s.index, s.kind])).toEqual([
      [5, 'invalid'],
      [6, 'unknown-surface'],
      [7, 'invalid'],
    ])
  })
})
