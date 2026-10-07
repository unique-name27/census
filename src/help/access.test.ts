/**
 * Help in each mode (docs/ROLES.md, 3.8 and 6.8 test 6): every article and tour has a decision in
 * every mode; each mode's tours keep at least 3 steps once hidden ones are skipped, and every kept
 * step's page and figure are shown; links to hidden targets read as text; the mode wording follows
 * the copy rules; the developer shortcut is listed only for developers; and Report a problem names
 * the mode, never the manager.
 */
import { describe, expect, it } from 'vitest'
import { BANNED_MODE_WORDS } from '@/access/copy'
import { routeShown } from '@/access/policy'
import { leaderOptions } from '@/app/filterOptions'
import { sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { DEFAULT_SETTINGS } from '@/data/settings'
import { articleShown, linkShown, stepShown, tourInMode, tourShown } from './access'
import { ARTICLES, articleById } from './articles'
import { type DiagnosticState, diagnosticInput } from './diagnosticInput'
import { diagnosticText } from './diagnostics'
import { articleLinks, blockTexts } from './markup'
import { TOURS } from './tours'

const hr = sampleCtx()
const dev = sampleCtx({ access: { mode: 'developer' } })
const leader = leaderOptions(hr.org, hr.asOf).find((l) => l.size >= 25 && l.size <= 90)!
const manager = sampleCtx({ access: { mode: 'manager', managerId: leader.id } })
const MODES: [string, AnalyticsContext][] = [
  ['developer', dev],
  ['hr', hr],
  ['manager', manager],
]

describe('help in each mode', () => {
  it('has a decision for every article and tour in every mode', () => {
    for (const [, ctx] of MODES) {
      for (const a of ARTICLES)
        expect(['shown', 'limited', 'hidden']).toContain(ctx.access.decide(`help:article:${a.id}`).access)
      for (const t of TOURS)
        expect(['shown', 'limited', 'hidden']).toContain(ctx.access.decide(`help:tour:${t.id}`).access)
    }
    // The articles each mode adds or drops.
    expect(articleShown(hr.access, 'modes')).toBe(true)
    expect(articleShown(manager.access, 'modes')).toBe(true)
    expect(articleShown(hr.access, 'view-team')).toBe(false)
    expect(articleShown(manager.access, 'view-team')).toBe(true)
    expect(articleShown(manager.access, 'privacy-pay')).toBe(false)
    expect(articleShown(manager.access, 'data-loading')).toBe(false)
    expect(tourShown(manager.access, 'getting-started')).toBe(false)
    expect(tourShown(manager.access, 'manager-start')).toBe(true)
    expect(tourShown(hr.access, 'manager-start')).toBe(false)
  })

  it("keeps at least 3 steps of each mode's tours, each on a page and figure the mode shows", () => {
    for (const [mode, ctx] of MODES)
      for (const t of TOURS) {
        const run = tourInMode(ctx.access, t)
        if (!tourShown(ctx.access, t.id)) {
          expect(run, `${mode} ${t.id}`).toBeNull()
          continue
        }
        expect(run, `${mode} ${t.id}`).not.toBeNull()
        expect(run!.steps.length, `${mode} ${t.id}`).toBeGreaterThanOrEqual(3)
        for (const s of run!.steps) {
          expect(stepShown(ctx.access, s), `${mode} ${t.id} ${s.title}`).toBe(true)
          if (s.view)
            expect(routeShown(ctx.access.mode, s.view, s.tab ?? ''), `${mode} ${t.id} ${s.title}`).toBe(true)
        }
      }
    // Steps on controls Manager mode hides are skipped.
    const people = tourInMode(manager.access, TOURS.find((t) => t.id === 'view-hrbp') ?? null)
    expect(people?.steps.some((s) => s.target?.includes('hrbp-talking-points'))).toBe(false)
    const onboarding = tourInMode(manager.access, TOURS.find((t) => t.id === 'view-onboarding') ?? null)
    expect(onboarding?.steps.some((s) => s.tab === 'plan')).toBe(false)
  })

  it('reads a link to a hidden target as text in a shown article', () => {
    let texted = 0
    for (const a of ARTICLES) {
      if (!articleShown(manager.access, a.id)) continue
      for (const l of articleLinks(a)) {
        const shown = linkShown(manager.access, l)
        if (l.kind === 'route') {
          const [view, ...tab] = l.target.split('.')
          expect(shown, `${a.id} ${l.target}`).toBe(routeShown('manager', view as never, tab.join('.')))
        }
        if (l.kind === 'metric') expect(shown, `${a.id} ${l.target}`).toBe(false)
        if (l.kind === 'article')
          expect(shown, `${a.id} ${l.target}`).toBe(articleShown(manager.access, l.target))
        if (l.kind === 'settings')
          expect(shown, `${a.id} ${l.target}`).toBe(manager.access.can(`settings:${l.target}`))
        if (!shown) texted++
      }
    }
    // Manager mode's articles do link into the Data room in HR mode: those read as text here.
    expect(texted).toBeGreaterThan(0)
    // HR mode keeps every link.
    for (const a of ARTICLES)
      for (const l of articleLinks(a)) expect(linkShown(hr.access, l), `${a.id} ${l.target}`).toBe(true)
  })

  it('keeps the modes article plain: no em dash and none of the words that make a mode sound like security', () => {
    const a = articleById('modes')!
    const text = [a.title, a.summary, ...a.body.flatMap((b) => blockTexts(b))].join(' ').toLowerCase()
    expect(text.includes('—')).toBe(false)
    for (const w of BANNED_MODE_WORDS) expect(text.includes(w), w).toBe(false)
  })

  it('lists the developer shortcut only where developers read it', () => {
    const shortcuts = articleById('shortcuts')!
    const text = shortcuts.body.flatMap((b) => blockTexts(b)).join(' ')
    expect(text).not.toMatch(/Alt\+Shift\+D|Option\+Shift\+D/)
    const devArticle = articleById('developer-tools')
    if (devArticle) expect(devArticle.body.flatMap((b) => blockTexts(b)).join(' ')).toMatch(/Alt\+Shift\+D/)
  })

  it('names the mode in Report a problem, never the manager', () => {
    const state = {
      ...DEFAULT_SETTINGS,
      route: { view: 'team', tab: '' },
      filters: manager.filters,
      reference: { mappings: [], changes: [] },
      showPay: false,
      showImmigration: false,
      storageUnavailable: false,
    } as unknown as DiagnosticState
    const env = {
      hash: '#team',
      browser: 'test',
      windowSize: '1440 × 900',
      at: '2026-10-01T00:00:00Z',
      lensOn: false,
    }
    const text = diagnosticText(diagnosticInput(manager, state, env))
    expect(text).toContain('Mode: Manager (manager set, name left out)')
    const lock = manager.access.lock!
    expect(text).not.toContain(lock.managerName)
    expect(text).not.toContain(lock.managerId)
    expect(diagnosticText(diagnosticInput(hr, { ...state, filters: hr.filters }, env))).toContain('Mode: HR')
    expect(diagnosticText(diagnosticInput(dev, { ...state, filters: dev.filters }, env))).toContain(
      'Mode: Developer',
    )
  })
})
