/**
 * Help in each mode (docs/ROLES.md 3.8; docs/ROLES-V2.md 4.8 and test 9 of 8.8), over all eleven
 * modes: every article and tour has a decision in every mode, and the ones 4.8 names have the
 * decision it gives; each mode's tours keep at least 3 steps once hidden ones are skipped, every kept
 * step's page, figure and condition are shown, and each role reads its own wording; links to hidden
 * targets read as text; no article or step a mode shows names a page, tab or control the mode hides;
 * the new copy follows the copy rules; the home tour and welcome line fit each mode; and Report a
 * problem names the mode (with a business unit or region), never a manager or a recruiter.
 */
import { describe, expect, it } from 'vitest'
import { type AccessContext, accessFor } from '@/access/context'
import { BANNED_MODE_WORDS } from '@/access/copy'
import { MODES as EVERY_MODE, HOME_OF, type Mode } from '@/access/modes'
import { decide, routeShown } from '@/access/policy'
import { recruiterOptions } from '@/access/scopes/pickers'
import { leaderOptions } from '@/app/filterOptions'
import { sampleCtx, sampleData } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { DATASET_KEYS, datasetDef } from '@/data/schema'
import { DEFAULT_SETTINGS } from '@/data/settings'
import { VIEWS } from '@/views/registry'
import {
  articleInMode,
  articleShown,
  blocksInMode,
  holds,
  homeTourOf,
  linkShown,
  stepShown,
  stepWording,
  tourInMode,
  tourShown,
} from './access'
import { ARTICLES, articleById } from './articles'
import { type DiagnosticState, diagnosticInput, modeLine } from './diagnosticInput'
import { diagnosticText } from './diagnostics'
import { articleLinks, blockTexts, plainText } from './markup'
import { parsePrefs, welcomeDismissed, withCompleted, withDismissed, withTourDone } from './store'
import { TOURS, tourById } from './tours'
import type { Block, TourStep } from './types'
import { welcomeCopy, welcomeFor } from './welcome'

const hr = sampleCtx()
const dev = sampleCtx({ access: { mode: 'developer' } })
const leader = leaderOptions(hr.org, hr.asOf).find((l) => l.size >= 25 && l.size <= 90)!
const manager = sampleCtx({ access: { mode: 'manager', managerId: leader.id } })

/** Every mode's decisions, with the metric dictionary bound so a metric on hidden views is hidden. */
const ACCESS = Object.fromEntries(EVERY_MODE.map((m) => [m, accessFor(m, null, hr.metrics)])) as Record<
  Mode,
  AccessContext
>

/** The columns of docs/ROLES-V2.md 4.8, in its order. */
const COLUMNS: readonly Mode[] = [
  'developer',
  'hr',
  'chro',
  'hrbp-unit',
  'hrbp-region',
  'compensation',
  'talent-management',
  'hr-ops',
  'recruiter',
  'finance',
  'manager',
]

/** Rows of the 4.8 table: S (shown or limited) or H, one letter per column. */
const TABLE_48: Readonly<Record<string, string>> = {
  'help:article:what-census-is': 'SSSSSSSSSSS',
  'help:article:modes': 'SSSSSSSSSSS',
  'help:article:view-home': 'SHSSSSSSSSH',
  'help:article:view-team': 'SHHHHHHHHHS',
  'help:article:view-actions': 'SSSSSSSSSSS',
  'help:article:data-loading': 'SSSHHHHSHHH',
  'help:article:definitions-how': 'SSSSSSSSSSS',
  'help:article:glossary': 'SSSSSSSSSSS',
  'help:article:privacy-browser': 'SSSSSSSSSSS',
  'help:article:privacy-small-groups': 'SSSSSSSSSSS',
  'help:article:privacy-sample': 'SSSSSSSSSSS',
  'help:article:privacy-pay': 'SSSSSSHHHSH',
  'help:article:privacy-er': 'SSSSSHHSHHH',
  'help:article:privacy-surveys': 'SSSSSSSSHHH',
  'help:article:privacy-immigration': 'SSSSSHHSHHH',
  'help:article:shortcuts': 'SSSSSSSSSSS',
  'help:article:report-problem': 'SSSSSSSSSSS',
  'help:article:troubleshooting': 'SSSSSSSSSSS',
  'help:article:faq': 'SSSSSSSSSSS',
  'help:article:whats-new': 'SSSSSSSSSSS',
  'help:article:developer-tools': 'SHHHHHHHHHH',
  'help:article:security-center': 'SHHHHHHHHHH',
  'help:tour:own-data': 'SSSHHHHSHHH',
  'help:tour:quality-definitions': 'SSSHHHHSHHH',
  'help:tour:developer-tools': 'SHHHHHHHHHH',
  'help:tour:getting-started': 'SSSHHHHHHHH',
  'help:tour:home-start': 'SHSSSSSSSSH',
  'help:tour:manager-start': 'SHHHHHHHHHS',
  'help:tour:view-team': 'SHHHHHHHHHS',
  'help:tour:view-actions': 'SSSSSSSSSSS',
}

/** Words that name a page, tab or control, and the surface that shows it. */
const NAMES: readonly { phrase: string; surface: string }[] = [
  ...VIEWS.filter((v) => v.key !== 'home').map((v) => ({ phrase: v.label, surface: `view:${v.key}` })),
  { phrase: 'Home', surface: 'view:home' },
  { phrase: 'Data room', surface: 'page:data' },
  { phrase: 'Metric definitions', surface: 'page:data' },
  { phrase: 'Developer page', surface: 'page:dev' },
  { phrase: 'Show pay amounts', surface: 'pay:switch' },
  { phrase: 'Show immigration details', surface: 'header:compliance' },
  { phrase: 'Copy talking points', surface: 'export:talking-points' },
  { phrase: 'Monthly people report', surface: 'export:monthly-report' },
  { phrase: 'monthly people report', surface: 'export:monthly-report' },
  { phrase: 'Exclude', surface: 'filter:exclude' },
  { phrase: 'Leave out', surface: 'focus:leave-out' },
  { phrase: 'talking points', surface: 'export:talking-points' },
  { phrase: 'Edit definition', surface: 'ui:edit-definition' },
  { phrase: 'Simulate exit', surface: 'org:simulate-exit' },
  { phrase: 'Cycle settings', surface: 'header:comp' },
  { phrase: 'Reorg sandbox', surface: 'tab:org.sandbox' },
  { phrase: 'reorg sandbox', surface: 'tab:org.sandbox' },
  { phrase: 'Workforce cost', surface: 'tab:comp.cost' },
  { phrase: 'Hiring plan', surface: 'tab:onboarding.plan' },
  { phrase: 'Retention risk', surface: 'tab:talent.retention' },
  { phrase: 'Potential & succession', surface: 'tab:talent.succession' },
  { phrase: 'Special analyses', surface: 'tab:hrbp.analyses' },
  { phrase: 'Settings, Data', surface: 'settings:data' },
  { phrase: 'Official lists', surface: 'settings:lists' },
  { phrase: 'Settings, Privacy', surface: 'settings:privacy' },
  { phrase: 'Related tools', surface: 'settings:tools' },
  { phrase: 'Compensation cycle', surface: 'settings:compensation' },
  { phrase: 'Org slides', surface: 'export:org-slide' },
  { phrase: 'Export scenario', surface: 'export:reorg' },
]

/** Mode names and other words that share a page's name without naming the page. */
const NOT_A_PAGE = [
  /Talent management/g,
  /\b(HR|CHRO|HRBP|Compensation|Recruiter|HR ops|Finance|Manager|Developer) mode/g,
  /Home and End/g,
  /Home goes/g,
  /Onboarding tasks/g,
]

/**
 * Reviewed exceptions: the modes article describes every mode; the Action center's "My team"
 * picker shares the page's name; a data article names the datasets by their labels.
 */
const NAMED_ON_PURPOSE = (where: string, phrase: string): boolean =>
  where.startsWith('modes') ||
  (where.startsWith('view-actions') && phrase === 'My team') ||
  (where.startsWith('tour view-actions') && phrase === 'My team') ||
  (where.startsWith('data-') && DATASET_KEYS.some((k) => datasetDef(k).label === phrase))

function namesHidden(access: AccessContext, where: string, text: string): string[] {
  const raw = plainText(text)
  let rest = raw
  for (const r of NOT_A_PAGE) rest = rest.replace(r, '')
  const out: string[] = []
  for (const n of NAMES) {
    if (access.can(n.surface) || NAMED_ON_PURPOSE(where, n.phrase)) continue
    const inText = n.phrase === 'Compensation cycle' ? raw : rest
    if (new RegExp(`(^|[^A-Za-z])${n.phrase}([^A-Za-z]|$)`).test(inText))
      out.push(`${access.mode} | ${where} | ${n.phrase}`)
  }
  return out
}

describe('help in each mode', () => {
  it('has a decision for every article and tour in every mode', () => {
    for (const mode of EVERY_MODE) {
      const access = ACCESS[mode]
      for (const a of ARTICLES)
        expect(['shown', 'limited', 'hidden'], `${mode} ${a.id}`).toContain(
          access.decide(`help:article:${a.id}`).access,
        )
      for (const t of TOURS)
        expect(['shown', 'limited', 'hidden'], `${mode} ${t.id}`).toContain(
          access.decide(`help:tour:${t.id}`).access,
        )
      // Every view article and tour follows its view.
      for (const v of VIEWS) {
        const shown = routeShown(mode, v.key, '')
        expect(articleShown(access, `view-${v.key}`), `${mode} view-${v.key}`).toBe(shown)
      }
    }
  })

  it('shows each article and tour docs/ROLES-V2.md 4.8 names in the modes it gives', () => {
    for (const [surface, row] of Object.entries(TABLE_48))
      COLUMNS.forEach((mode, i) => {
        const shown = decide(mode, surface).access !== 'hidden'
        expect(shown, `${surface} in ${mode}`).toBe(row[i] === 'S')
      })
    // "L" for definitions-how and the glossary: limited wherever the Data room is hidden.
    for (const mode of EVERY_MODE) {
      const limited = !ACCESS[mode].can('page:data')
      for (const id of ['definitions-how', 'glossary'])
        expect(decide(mode, `help:article:${id}`).access, `${mode} ${id}`).toBe(limited ? 'limited' : 'shown')
    }
  })

  it("keeps at least 3 steps of each mode's tours, each on a page, figure and condition the mode shows", () => {
    for (const mode of EVERY_MODE) {
      const access = ACCESS[mode]
      for (const t of TOURS) {
        const run = tourInMode(access, t)
        if (!tourShown(access, t.id)) {
          expect(run, `${mode} ${t.id}`).toBeNull()
          continue
        }
        expect(run, `${mode} ${t.id}`).not.toBeNull()
        expect(run!.steps.length, `${mode} ${t.id}`).toBeGreaterThanOrEqual(3)
        for (const s of run!.steps) {
          expect(stepShown(access, s), `${mode} ${t.id} ${s.title}`).toBe(true)
          expect(holds(access, s), `${mode} ${t.id} ${s.title}`).toBe(true)
          expect(s.wording, `${mode} ${t.id} ${s.title}`).toBeUndefined()
          if (s.view)
            expect(routeShown(access.mode, s.view, s.tab ?? ''), `${mode} ${t.id} ${s.title}`).toBe(true)
        }
      }
    }
    // Steps on controls Manager mode hides are skipped.
    const people = tourInMode(manager.access, TOURS.find((t) => t.id === 'view-hrbp') ?? null)
    expect(people?.steps.some((s) => s.target?.includes('hrbp-talking-points'))).toBe(false)
    const onboarding = tourInMode(manager.access, TOURS.find((t) => t.id === 'view-onboarding') ?? null)
    expect(onboarding?.steps.some((s) => s.tab === 'plan')).toBe(false)
    // A switch a mode hides is never a step: the pay switch outside the switch modes, the
    // immigration switch outside HR, CHRO and HR ops, the catalog controls outside HR.
    for (const mode of EVERY_MODE) {
      const steps = TOURS.flatMap((t) => tourInMode(ACCESS[mode], t)?.steps ?? [])
      const has = (name: string) => steps.some((s) => s.target === `[data-tour="${name}"]`)
      expect(has('comp-pay-switch'), mode).toBe(
        ACCESS[mode].can('pay:switch') && routeShown(mode, 'comp', ''),
      )
      if (has('compliance-immigration-switch')) expect(ACCESS[mode].can('header:compliance'), mode).toBe(true)
      if (has('view-controls')) expect(ACCESS[mode].can('header:ai'), mode).toBe(true)
    }
  })

  it('reads a link to a hidden target as text, and HR keeps every link it shows', () => {
    let texted = 0
    for (const mode of EVERY_MODE) {
      const access = ACCESS[mode]
      for (const a of ARTICLES) {
        if (!articleShown(access, a.id)) continue
        for (const l of articleLinks(articleInMode(access, a))) {
          const shown = linkShown(access, l)
          if (l.kind === 'route') {
            const [view, ...tab] = l.target.split('.')
            expect(shown, `${mode} ${a.id} ${l.target}`).toBe(routeShown(mode, view as never, tab.join('.')))
          }
          if (l.kind === 'metric')
            expect(shown, `${mode} ${a.id} ${l.target}`).toBe(
              access.can('page:data') && access.can(`metric:${l.target}`),
            )
          if (l.kind === 'article')
            expect(shown, `${mode} ${a.id} ${l.target}`).toBe(articleShown(access, l.target))
          if (l.kind === 'settings')
            expect(shown, `${mode} ${a.id} ${l.target}`).toBe(access.can(`settings:${l.target}`))
          if (l.kind === 'tour')
            expect(shown, `${mode} ${a.id} ${l.target}`).toBe(tourShown(access, l.target))
          if (!shown) texted++
        }
      }
    }
    // Some links do read as text somewhere (the Data room's tiers article, say).
    expect(texted).toBeGreaterThan(0)
    // HR mode keeps every link in what it shows, the Action center's included (6.3).
    for (const a of ARTICLES) {
      if (!articleShown(hr.access, a.id)) continue
      for (const l of articleLinks(articleInMode(hr.access, a)))
        expect(linkShown(hr.access, l), `${a.id} ${l.target}`).toBe(true)
    }
  })

  it('names no page, tab or control a mode hides, in any article or tour step it shows', () => {
    const found: string[] = []
    for (const mode of EVERY_MODE) {
      const access = ACCESS[mode]
      for (const a0 of ARTICLES) {
        if (!articleShown(access, a0.id)) continue
        const a = articleInMode(access, a0)
        found.push(...namesHidden(access, `${a.id} summary`, a.summary))
        for (const b of a.body) for (const t of blockTexts(b)) found.push(...namesHidden(access, a.id, t))
      }
      for (const t0 of TOURS) {
        const t = tourInMode(access, t0)
        if (!t) continue
        found.push(...namesHidden(access, `tour ${t.id} summary`, t.summary))
        for (const s of t.steps) found.push(...namesHidden(access, `tour ${t.id}`, `${s.title}. ${s.body}`))
      }
    }
    expect(found).toEqual([])
    // The check is not vacuous: Recruiter mode hides People stats, and the HR wording names it.
    expect(namesHidden(ACCESS.recruiter, 'x', 'Open People stats.')).toHaveLength(1)
  })

  it('keeps the new copy plain: no em dash, and none of the words that make a mode sound like security', () => {
    const texts: string[] = []
    for (const id of ['modes', 'view-home', 'privacy-pay']) {
      const a = articleById(id)!
      texts.push(a.title, a.summary, ...(a.without ?? []).map((w) => w.summary))
      texts.push(...a.body.flatMap((b) => blockTexts(b)))
    }
    for (const id of ['home-start', 'view-home']) {
      const t = tourById(id)!
      texts.push(t.title, t.summary)
      for (const s of t.steps)
        texts.push(s.title, s.body, ...(s.wording ?? []).flatMap((w) => [w.title ?? '', w.body]))
    }
    const text = texts.join(' ').toLowerCase()
    expect(text.includes('—')).toBe(false)
    for (const w of BANNED_MODE_WORDS) expect(text.includes(w), w).toBe(false)
    // The modes article covers all eleven modes and their groups.
    const modes = articleById('modes')!
      .body.flatMap((b) => blockTexts(b))
      .join(' ')
    for (const name of [
      'HR:',
      'CHRO:',
      'HRBP for a business unit:',
      'HRBP for a region:',
      'Compensation:',
      'Talent management:',
      'Recruiter:',
      'HR ops:',
      'Finance:',
      'Manager:',
      'Developer:',
    ])
      expect(modes, name).toContain(name)
  })

  it('gives each role home its own section of the Home article, and Developer every one', () => {
    const sections = (mode: Mode) =>
      articleInMode(ACCESS[mode], articleById('view-home')!)
        .body.filter((b): b is Block & { h: string } => 'h' in b)
        .map((b) => b.h)
    const ROLE_SECTION: Partial<Record<Mode, string>> = {
      chro: 'Executive home (CHRO)',
      'hrbp-unit': 'HR business partner',
      'hrbp-region': 'HR business partner',
      compensation: 'Compensation',
      'talent-management': 'Talent management',
      'hr-ops': 'HR ops',
      recruiter: 'Recruiter',
      finance: 'Finance',
    }
    const all = new Set(Object.values(ROLE_SECTION))
    for (const [mode, own] of Object.entries(ROLE_SECTION) as [Mode, string][]) {
      const h = sections(mode)
      expect(h, mode).toContain(own)
      for (const other of all) if (other !== own) expect(h, `${mode} ${other}`).not.toContain(other)
    }
    for (const s of all) expect(sections('developer')).toContain(s)
  })

  it("gives the pay article each mode's own pay rule", () => {
    const text = (mode: Mode) => {
      const a = articleInMode(ACCESS[mode], articleById('privacy-pay')!)
      return [a.summary, ...a.body.flatMap((b) => blockTexts(b))].join(' ')
    }
    for (const mode of ['hr', 'chro', 'compensation', 'developer'] as const)
      expect(text(mode), mode).toContain('"Show pay amounts" is on')
    expect(text('finance')).toMatch(/never one person's pay/)
    expect(text('finance')).not.toContain('Show pay amounts')
    for (const mode of ['hrbp-unit', 'hrbp-region'] as const) {
      expect(text(mode), mode).toMatch(/ratios only/)
      expect(text(mode), mode).not.toMatch(/Show pay amounts|Workforce cost/)
    }
  })
})

describe('the home tour', () => {
  it("starts each mode's own first tour, shown in that mode with at least 3 steps", () => {
    for (const mode of EVERY_MODE) {
      const id = homeTourOf(mode)
      expect(id, mode).toBe(
        mode === 'manager' ? 'manager-start' : HOME_OF[mode] === 'home' ? 'home-start' : 'getting-started',
      )
      const run = tourInMode(ACCESS[mode], tourById(id))
      expect(run, mode).not.toBeNull()
      expect(run!.steps.length, mode).toBeGreaterThanOrEqual(3)
    }
  })

  it('walks through the Mode button, the hero, Needs attention, My list and the Action center', () => {
    const steps = tourById('home-start')!.steps.map((s) => s.target)
    expect(steps).toEqual([
      '[data-tour="masthead-mode"]',
      '[data-tour="home-hero"]',
      '[data-tour="home-attention"]',
      '[data-tour="figure-home-list"]',
      '[data-tour="masthead-actions"]',
    ])
  })

  it("reads each role's own words, and Developer reads the general ones", () => {
    const HERO: Partial<Record<Mode, string>> = {
      chro: 'Targets met',
      'hrbp-unit': 'Targets met in your scope',
      'hrbp-region': 'Targets met in your scope',
      compensation: 'In the healthy band',
      'talent-management': 'Succession coverage',
      'hr-ops': 'Resolution SLA met',
      recruiter: 'Lacking a next step',
      finance: 'Against the budget',
    }
    const tour = tourById('home-start')!
    const bodies = new Set<string>()
    for (const [mode, title] of Object.entries(HERO) as [Mode, string][]) {
      const run = tourInMode(ACCESS[mode], tour)!
      expect(run.steps[1].title, mode).toBe(title)
      bodies.add(run.steps[0].body)
    }
    // Every role's Mode step is its own (the two HRBP modes share one).
    expect(bodies.size).toBe(7)
    const devRun = tourInMode(ACCESS.developer, tour)!
    expect(devRun.steps.map((s) => s.title)).toEqual(tour.steps.map((s) => s.title))
    // The CHRO's Needs attention is the escalations; the Action center step counts every item there.
    const chro = tourInMode(ACCESS.chro, tour)!
    expect(chro.steps[2].title).toBe('Escalations')
    expect(chro.steps[4].body).toMatch(/counts every open item/)
    expect(tourInMode(ACCESS.compensation, tour)!.steps[4].body).toMatch(/counts your Needs attention/)
  })

  it('points the Home page tour at each role home and its own lead chart', () => {
    const LEAD: Partial<Record<Mode, string>> = {
      chro: 'home-chro-measures',
      'hrbp-unit': 'home-hrbp-measures',
      compensation: 'home-comp-distribution',
      'talent-management': 'home-talent-exposure',
      'hr-ops': 'home-ops-backlog',
      recruiter: 'home-rec-pipeline',
      finance: 'home-fin-plan',
    }
    for (const [mode, figure] of Object.entries(LEAD) as [Mode, string][]) {
      const run = tourInMode(ACCESS[mode], tourById('view-home'))!
      expect(
        run.steps.some((s) => s.target === `[data-tour="figure-${figure}"]`),
        mode,
      ).toBe(true)
    }
  })

  it("puts the welcome line on each mode's own home only", () => {
    for (const mode of EVERY_MODE) {
      const lines = (['hr', 'manager', 'home'] as const).filter((v) => welcomeCopy(v, mode))
      const expected =
        mode === 'developer'
          ? []
          : [HOME_OF[mode] === 'team' ? 'manager' : HOME_OF[mode] === 'home' ? 'home' : 'hr']
      expect(lines, mode).toEqual(expected)
      for (const v of lines) {
        const copy = welcomeCopy(v, mode)!
        expect(copy.tour, mode).toBe(homeTourOf(mode))
        expect(tourShown(ACCESS[mode], copy.tour), mode).toBe(true)
        expect(copy.title, mode).not.toMatch(/[!—]/)
      }
    }
    expect(welcomeCopy('home', 'compensation')!.title).toBe('New to Compensation mode?')
    expect(welcomeCopy('home', 'hrbp-region')!.title).toBe('New to HRBP mode?')
  })
})

describe('the welcome line, remembered per mode', () => {
  it("dismisses one role's line without the others, and reads what it stored", () => {
    let p = parsePrefs(null)
    expect(welcomeDismissed(p, { home: 'compensation' })).toBe(false)
    p = withDismissed(p, { home: 'compensation' })
    expect(withDismissed(p, { home: 'compensation' })).toBe(p)
    expect(welcomeDismissed(p, { home: 'compensation' })).toBe(true)
    expect(welcomeDismissed(p, { home: 'finance' })).toBe(false)
    expect(welcomeDismissed(p, 'hr')).toBe(false)
    const back = parsePrefs(JSON.stringify(p))
    expect(back.homeWelcomeDismissed).toEqual(['compensation'])
    // Finishing the home tour ends the Home line of the mode it was taken in, and no other mode's;
    // HR's and Manager's keep their own tours.
    const done = withTourDone(parsePrefs(null), 'home-start', 'finance')
    expect(done.completed).toEqual(['home-start'])
    expect(welcomeDismissed(done, { home: 'finance' })).toBe(true)
    for (const m of EVERY_MODE.filter((x) => HOME_OF[x] === 'home' && x !== 'finance'))
      expect(welcomeDismissed(done, { home: m }), m).toBe(false)
    expect(welcomeDismissed(withCompleted(parsePrefs(null), 'home-start'), { home: 'chro' })).toBe(false)
    expect(withTourDone(parsePrefs(null), 'view-comp', 'compensation').homeWelcomeDismissed).toBeUndefined()
    expect(welcomeDismissed(done, 'hr')).toBe(false)
    expect(welcomeDismissed(withDismissed(done, 'manager'), 'manager')).toBe(true)
    // Unreadable values fall back to nothing dismissed.
    expect(parsePrefs('{"homeWelcomeDismissed": [3, "chro", "chro"]}').homeWelcomeDismissed).toEqual(['chro'])
    expect(parsePrefs('nope').homeWelcomeDismissed).toBeUndefined()
  })
})

describe('the welcome line follows the live mode', () => {
  it('shows only where the page is drawn in the live mode', () => {
    // The Developer page's preview of the Finance home: drawn in Finance, while Developer is live.
    expect(welcomeFor('home', 'finance', 'developer')).toBeNull()
    expect(welcomeFor('home', 'finance', 'finance')?.title).toBe('New to Finance mode?')
    // An off-screen render in another mode, and Developer itself, have none.
    expect(welcomeFor('hr', 'hr', 'compensation')).toBeNull()
    expect(welcomeFor('home', 'developer', 'developer')).toBeNull()
    // Outside the provider, the live mode decides.
    expect(welcomeFor('hr', undefined, 'hr')?.line).toBe('hr')
    expect(welcomeFor('hr', undefined, 'finance')).toBeNull()
    expect(welcomeFor('manager', undefined, 'manager')?.line).toBe('manager')
    expect(welcomeFor('home', undefined, 'chro')?.line).toEqual({ home: 'chro' })
  })
})

describe('Recruiter text with "Every recruiter" picked', () => {
  const who = recruiterOptions(sampleData(), hr.asOf)[0]
  const one = sampleCtx({
    access: { mode: 'recruiter', picks: { recruiter: { name: who.name, id: who.id } } },
  })
  const every = sampleCtx({ access: { mode: 'recruiter', picks: { recruiter: { name: '*', id: null } } } })
  const textOf = (ctx: AnalyticsContext, id: string) =>
    articleInMode(ctx.access, articleById(id)!)
      .body.flatMap((b) => blockTexts(b))
      .join(' ')
  const stepsOf = (ctx: AnalyticsContext, id: string) =>
    tourInMode(ctx.access, tourById(id))!
      .steps.map((s) => s.body)
      .join(' ')

  it("holds a scope on one recruiter's reqs and none for every recruiter", () => {
    expect(one.access.scope?.kind).toBe('reqs')
    expect(every.access.scope).toBeNull()
    expect(holds(one.access, { scoped: true })).toBe(true)
    expect(holds(every.access, { scoped: true })).toBe(false)
    expect(holds(every.access, { scoped: false })).toBe(true)
    // An access that says nothing of its scope (a test's) counts as holding it.
    expect(holds({ mode: 'hr', can: () => true }, { scoped: true })).toBe(true)
  })

  it('leaves out what is said of a scope when every recruiter is picked', () => {
    const scoped = [
      'Records outside your scope are not listed',
      'Someone outside your scope opens on a short card',
      'A link or saved view always opens inside the mode',
      'It stays inside your scope',
      'Every filter works inside your reqs',
      'a link carries the filters but not your reqs',
      'compare your reqs with all reqs',
      'about to start on one of your reqs',
    ]
    const oneText = ['moving-around', 'clicking-down', 'ask-census', 'reading-a-number', 'exporting']
      .map((id) => textOf(one, id))
      .join(' ')
    const everyText = ['moving-around', 'clicking-down', 'ask-census', 'reading-a-number', 'exporting']
      .map((id) => textOf(every, id))
      .join(' ')
    for (const s of scoped) {
      expect(oneText, s).toContain(s)
      expect(everyText, s).not.toContain(s)
    }
    expect(everyText).toContain('With Every recruiter picked, the filters cover every req.')
    expect(everyText).toContain('about to start on a req')
    expect(textOf(one, 'view-recruiting')).toContain('every tab keeps to your reqs')
    expect(textOf(every, 'view-recruiting')).not.toContain('your reqs')
    expect(textOf(every, 'view-recruiting')).toContain('every tab shows every req')
    expect(textOf(one, 'faq')).toContain('your reqs then keep')
    expect(textOf(every, 'faq')).toContain('the reqs then keep')
    expect(stepsOf(one, 'view-recruiting')).toContain('compare with all reqs')
    expect(stepsOf(every, 'view-recruiting')).not.toContain('all reqs')
  })
})

describe('mode conditions', () => {
  const access = (shown: readonly string[]) => ({
    mode: 'hr' as const,
    can: (s: string) => shown.includes(s),
  })

  it('reads surface as every one shown, and unless as not every one shown', () => {
    const a = access(['x', 'y'])
    expect(holds(a, {})).toBe(true)
    expect(holds(a, { surface: 'x' })).toBe(true)
    expect(holds(a, { surface: ['x', 'z'] })).toBe(false)
    expect(holds(a, { unless: 'x' })).toBe(false)
    expect(holds(a, { unless: 'z' })).toBe(true)
    expect(holds(a, { unless: ['x', 'y'] })).toBe(false)
    expect(holds(a, { unless: ['x', 'z'] })).toBe(true)
    expect(holds(a, { surface: 'x', unless: 'z' })).toBe(true)
  })

  it('drops a section with its heading, and reads lists left side by side as one', () => {
    const body: Block[] = [
      { p: 'a' },
      { ul: ['one'] },
      { ul: ['two'], surface: 'z' },
      { ul: ['three'], unless: 'z' },
      { h: 'Hidden', surface: 'z' },
      { p: 'inside' },
      { h: 'Shown' },
      { ol: ['1'] },
      { ol: ['2'] },
    ]
    expect(blocksInMode(access(['x']), body)).toEqual([
      { p: 'a' },
      { ul: ['one', 'three'] },
      { h: 'Shown' },
      { ol: ['1', '2'] },
    ])
  })

  it('picks the first wording that applies, else the step as written', () => {
    const step: TourStep = {
      title: 'T',
      body: 'B',
      target: '[data-tour="a"]',
      wording: [
        { surface: 'z', body: 'Z' },
        { unless: 'z', title: 'U', body: 'U body', target: '[data-tour="b"]' },
      ],
    }
    expect(stepWording(access(['z']), step)).toEqual({ title: 'T', body: 'Z', target: '[data-tour="a"]' })
    expect(stepWording(access([]), step)).toEqual({ title: 'U', body: 'U body', target: '[data-tour="b"]' })
    const plain: TourStep = { title: 'T', body: 'B' }
    expect(stepWording(access([]), plain)).toBe(plain)
  })
})

describe('Report a problem', () => {
  const state = (ctx: AnalyticsContext) =>
    ({
      ...DEFAULT_SETTINGS,
      route: { view: 'home', tab: '' },
      filters: ctx.filters,
      reference: { mappings: [], changes: [] },
      showPay: false,
      showImmigration: false,
      storageUnavailable: false,
    }) as unknown as DiagnosticState
  const env = {
    hash: '#home',
    browser: 'test',
    windowSize: '1440 × 900',
    at: '2026-10-01T00:00:00Z',
    lensOn: false,
  }
  const report = (ctx: AnalyticsContext) => diagnosticText(diagnosticInput(ctx, state(ctx), env))

  it('names the mode, never the manager', () => {
    const text = report(manager)
    expect(text).toContain('Mode: Manager (manager set, name left out)')
    const lock = manager.access.lock!
    expect(text).not.toContain(lock.managerName)
    expect(text).not.toContain(lock.managerId)
    expect(report(hr)).toContain('Mode: HR')
    expect(report(dev)).toContain('Mode: Developer')
  })

  it('names a business unit or region, never a recruiter', () => {
    const unit = sampleCtx({ access: { mode: 'hrbp-unit', picks: { unit: 'Silicon Engineering' } } })
    expect(report(unit)).toContain('Mode: HRBP for a business unit (Silicon Engineering)')
    const region = sampleCtx({ access: { mode: 'hrbp-region', picks: { region: 'APAC' } } })
    expect(report(region)).toContain('Mode: HRBP for a region (APAC)')
    const who = recruiterOptions(sampleData(), hr.asOf)[0]
    const rec = sampleCtx({
      access: { mode: 'recruiter', picks: { recruiter: { name: who.name, id: who.id } } },
    })
    const text = report(rec)
    expect(text).toContain('Mode: Recruiter (recruiter set, name left out)')
    expect(text).not.toContain(who.name)
    const every = sampleCtx({ access: { mode: 'recruiter', picks: { recruiter: { name: '*', id: null } } } })
    expect(report(every)).toContain('Mode: Recruiter (every recruiter)')
    // A mode waiting for its pick says so, and names nothing.
    expect(modeLine(sampleCtx({ access: { mode: 'hrbp-unit' } }).access)).toBe(
      'Mode: HRBP for a business unit',
    )
    expect(modeLine(sampleCtx({ access: { mode: 'recruiter' } }).access)).toBe(
      'Mode: Recruiter (no recruiter set)',
    )
    for (const mode of ['chro', 'compensation', 'talent-management', 'hr-ops', 'finance'] as const)
      expect(modeLine(ACCESS[mode])).toMatch(/^Mode: (CHRO|Compensation|Talent management|HR ops|Finance)$/)
  })
})

describe('the Action center in Help, in every mode', () => {
  it('shows its article and tour in every mode, with the steps and sections of the mode', () => {
    const tour = TOURS.find((t) => t.id === 'view-actions')!
    for (const mode of EVERY_MODE) {
      const access = sampleCtx({ access: { mode } }).access
      expect(articleShown(access, 'view-actions'), mode).toBe(true)
      expect(tourShown(access, 'view-actions'), mode).toBe(true)
      expect(decide(mode, 'page:actions').access, mode).not.toBe('hidden')
      const steps = tourInMode(access, tour)?.steps ?? []
      expect(steps.length, mode).toBeGreaterThanOrEqual(3)
      const lists = access.can('ui:attention-lists')
      // The role modes walk through their two lists; Developer, HR and CHRO through "My team".
      expect(
        steps.some((s) => s.surface === 'ui:attention-lists'),
        mode,
      ).toBe(lists)
      expect(
        steps.some((s) => s.surface === 'ui:actions-team'),
        mode,
      ).toBe(access.can('ui:actions-team'))
    }
  })

  it('links to the Action center again from Start here', () => {
    const links = ARTICLES.flatMap((a) => articleLinks(a).map((l) => ({ a: a.id, l })))
    const toActions = links.filter((x) => x.l.kind === 'route' && x.l.target.startsWith('actions'))
    expect(toActions.map((x) => x.a)).toEqual(expect.arrayContaining(['what-census-is']))
    for (const x of toActions) expect(linkShown(hr.access, x.l), x.a).toBe(true)
  })
})

describe('shortcuts', () => {
  it('lists the developer shortcut only where developers read it', () => {
    const shortcuts = articleById('shortcuts')!
    const text = shortcuts.body.flatMap((b) => blockTexts(b)).join(' ')
    expect(text).not.toMatch(/Alt\+Shift\+D|Option\+Shift\+D/)
    const devArticle = articleById('developer-tools')
    if (devArticle) expect(devArticle.body.flatMap((b) => blockTexts(b)).join(' ')).toMatch(/Alt\+Shift\+D/)
  })
})
