/**
 * Routes in every mode (docs/ROLES-V2.md 4.13 and 8.8 test 2; docs/ROLES.md 3.15): `routeDecision`
 * leaves shown routes alone, sends a hidden view or page to the mode's home and a hidden tab to the
 * view's first shown tab, for every one of the eleven modes and every route and tab (including
 * `#home`, `#team`, `#dev.*`, Data room addresses, `#comp.cost` and `#actions`). Then, with the
 * store and the address writer over a stub browser (as in src/app/addressHistory.test.ts): a
 * redirect replaces the entry, the address shows where Census went, Back never returns to the
 * hidden route, and a scoped mode with no pick lands on its home's empty state.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { ROUTE_VIEWS, type Route, type RouteView } from '@/data/store'
import { DATA_TABS } from '@/views/data/links'
import { VIEWS } from '@/views/registry'
import { HOME_OF, homeOf, MODES, type Mode, NO_PICKS, PICK_OF } from './modes'
import { baseTab, policyOf, type RoleTab, routeDecision, routeShown } from './policy'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const tabsOf = (view: RouteView): string[] => {
  if (view === 'data') return DATA_TABS.map((t) => t.route)
  if (view === 'actions') return ['', 'open']
  if (view === 'dev') return ['', 'overview', 'inventory:figures', 'ask:query_records']
  if (view === 'home') return ['', 'overview']
  return ['', ...(VIEWS.find((v) => v.key === view)?.tabs.map((t) => t.key) ?? [])]
}

/** Every route an address can name, with each tab, plus the deep addresses the spec lists. */
const ROUTES: Route[] = [
  ...ROUTE_VIEWS.flatMap((view) => tabsOf(view).map((tab) => ({ view, tab }))),
  { view: 'data', tab: 'metrics/hrbp/attrition/voluntary' },
  { view: 'data', tab: 'employees-raw' },
  { view: 'ai', tab: 'agents:compliance' },
  { view: 'comp', tab: 'cost' },
  { view: 'hrbp', tab: 'analyses:quality' },
  { view: 'hrbp', tab: 'analyses:pyramid' },
]

const PAGES = new Set(['actions', 'data', 'dev'])

/** What 4.13 says each mode does with a route, read from the mode's table (or HR's rule). */
function expected(mode: Mode, r: Route): Route {
  if (mode === 'developer') return r
  if (mode === 'hr') return r.view === 'dev' || r.view === 'team' || r.view === 'home' ? homeOf('hr') : r
  if (mode === 'chro') return r.view === 'dev' || r.view === 'team' ? homeOf('chro') : r
  const t = policyOf(mode)!
  const place = t.views[r.view as keyof typeof t.views]
  if (!place || place.access === 'hidden') return r.view === HOME_OF[mode] ? r : homeOf(mode)
  if (PAGES.has(r.view) && !(t.tabs as Record<string, unknown>)[r.view]) return r
  const tabs = (t.tabs as Record<string, readonly RoleTab[] | undefined>)[r.view]
  if (!tabs || !r.tab) return r
  const named = tabs.find((x) => x.key === baseTab(r.tab))
  const part = t.hiddenParts[`${r.view}.${r.tab}`]
  if (part && named && named.decision.access !== 'hidden') return { view: r.view, tab: part.instead }
  if (named?.decision.access === 'hidden')
    return { view: r.view, tab: tabs.find((x) => x.decision.access !== 'hidden')?.key ?? '' }
  return r
}

describe('routeDecision', () => {
  for (const mode of MODES)
    it(`in ${mode} mode follows 4.13 for every route and tab`, () => {
      for (const r of ROUTES) {
        const d = routeDecision(mode, r)
        const at = `${mode} #${r.view}.${r.tab}`
        expect(d.route, at).toEqual(expected(mode, r))
        expect(d.redirected, at).toBe(d.route.view !== r.view || d.route.tab !== r.tab)
        if (d.redirected) expect(d.reason?.title, at).toMatch(/is not shown in/)
        // A shown route is one routeShown agrees with, and a redirect never lands on a hidden view.
        if (!d.redirected && r.view !== HOME_OF[mode]) expect(routeShown(mode, r.view, r.tab), at).toBe(true)
        if (d.redirected) expect(routeShown(mode, d.route.view, d.route.tab), at).toBe(true)
      }
    })

  it('never redirects a mode away from its own home', () => {
    for (const mode of MODES) {
      expect(routeDecision(mode, homeOf(mode)).redirected, mode).toBe(false)
      expect(routeShown(mode, HOME_OF[mode]), mode).toBe(true)
    }
  })

  it('names the redirects the spec lists', () => {
    expect(routeDecision('hr', { view: 'dev', tab: 'inventory:figures' }).route).toEqual(homeOf('hr'))
    expect(routeDecision('hr', { view: 'team', tab: '' }).route).toEqual({ view: 'scorecard', tab: '' })
    // #home in HR goes to the Scorecard; in Manager to My team; CHRO opens on it.
    expect(routeDecision('hr', { view: 'home', tab: '' })).toMatchObject({
      route: { view: 'scorecard', tab: '' },
      reason: { title: 'Home is not shown in HR mode', description: 'Census opened the Scorecard instead.' },
    })
    expect(routeDecision('manager', { view: 'home', tab: '' }).route).toEqual({ view: 'team', tab: '' })
    expect(routeDecision('chro', { view: 'home', tab: 'overview' }).redirected).toBe(false)
    // #team in every mode but Manager and Developer goes to the mode's home.
    for (const mode of MODES) {
      const d = routeDecision(mode, { view: 'team', tab: '' })
      if (mode === 'manager' || mode === 'developer') expect(d.redirected, mode).toBe(false)
      else expect(d.route, mode).toEqual(homeOf(mode))
    }
    for (const view of [
      'scorecard',
      'services',
      'comp',
      'compliance',
      'listening',
      'ai',
      'data',
      'dev',
    ] as const)
      expect(routeDecision('manager', { view, tab: '' }).route, view).toEqual({ view: 'team', tab: '' })
    expect(routeDecision('manager', { view: 'recruiting', tab: 'sources' }).route).toEqual({
      view: 'recruiting',
      tab: 'overview',
    })
    expect(routeDecision('manager', { view: 'onboarding', tab: 'plan' }).route).toEqual({
      view: 'onboarding',
      tab: 'upcoming',
    })
    expect(routeDecision('manager', { view: 'org', tab: 'sandbox' }).route).toEqual({
      view: 'org',
      tab: 'chart',
    })
    expect(routeDecision('manager', { view: 'talent', tab: 'retention' })).toMatchObject({
      route: { view: 'talent', tab: 'overview' },
      reason: {
        title: 'Talent, Retention risk is not shown in Manager mode',
        description: 'Census opened Overview instead.',
      },
    })
    expect(routeDecision('manager', { view: 'comp', tab: 'ranges' }).reason).toEqual({
      title: 'Compensation is not shown in Manager mode',
      description: 'Census opened My team instead.',
    })
    expect(routeDecision('manager', { view: 'hrbp', tab: 'analyses:quality' })).toMatchObject({
      route: { view: 'hrbp', tab: 'analyses:stages' },
      reason: { description: 'Census opened Engineering by stage instead.' },
    })
    // Finance sees only Workforce cost of Compensation (docs/ROLES-V2.md 4.13's example).
    expect(routeDecision('finance', { view: 'comp', tab: 'ranges' })).toEqual({
      route: { view: 'comp', tab: 'cost' },
      redirected: true,
      reason: {
        title: 'Compensation, Range position is not shown in Finance mode',
        description: 'Census opened Workforce cost instead.',
      },
    })
    expect(routeDecision('finance', { view: 'talent', tab: '' }).reason).toEqual({
      title: 'Talent is not shown in Finance mode',
      description: 'Census opened Home instead.',
    })
    expect(routeDecision('hrbp-region', { view: 'data', tab: '' }).reason?.title).toBe(
      'The Data room is not shown in HRBP mode',
    )
    expect(routeDecision('recruiter', { view: 'hrbp', tab: '' }).reason?.title).toBe(
      'People stats is not shown in Recruiter mode',
    )
    // The Action center is limited per mode like any other page (docs/ROLES-V2.md 6.3): it opens everywhere.
    for (const mode of MODES)
      expect(routeDecision(mode, { view: 'actions', tab: '' }).redirected, mode).toBe(false)
    expect(routeDecision('developer', { view: 'team', tab: '' }).redirected).toBe(false)
    expect(routeDecision('developer', { view: 'home', tab: '' }).redirected).toBe(false)
    expect(HOME_OF).toEqual({
      hr: 'scorecard',
      chro: 'home',
      'hrbp-unit': 'home',
      'hrbp-region': 'home',
      compensation: 'home',
      'talent-management': 'home',
      recruiter: 'home',
      'hr-ops': 'home',
      finance: 'home',
      manager: 'team',
      developer: 'dev',
    })
  })
})

/* ───────── with the store and the address writer ───────── */

/* ───────── a stub browser, set up before any module reads it ───────── */

const browser = vi.hoisted(() => {
  class MemoryStorage {
    m = new Map<string, string>()
    get length() {
      return this.m.size
    }
    key(i: number) {
      return [...this.m.keys()][i] ?? null
    }
    getItem(k: string) {
      return this.m.get(k) ?? null
    }
    setItem(k: string, v: string) {
      this.m.set(k, v)
    }
    removeItem(k: string) {
      this.m.delete(k)
    }
    clear() {
      this.m.clear()
    }
  }
  const entries: { hash: string; state: unknown }[] = [{ hash: '#recruiting', state: null }]
  const pos = { at: 0 }
  const win = Object.assign(new EventTarget(), { scrollTo: () => undefined })
  const history = {
    get state() {
      return entries[pos.at].state
    },
    get length() {
      return entries.length
    },
    pushState(state: unknown, _title: string, url: string) {
      entries.splice(pos.at + 1)
      entries.push({ hash: url, state })
      pos.at++
    },
    replaceState(state: unknown, _title: string, url: string) {
      entries[pos.at] = { hash: url, state }
    },
  }
  const location = {
    get hash() {
      return entries[pos.at].hash
    },
    set hash(h: string) {
      history.pushState(null, '', h)
    },
    get href() {
      return `http://census.test/${entries[pos.at].hash}`
    },
  }
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())
  vi.stubGlobal('window', win)
  vi.stubGlobal('location', location)
  vi.stubGlobal('history', history)
  vi.stubGlobal('BroadcastChannel', undefined)
  return { entries, pos, win, history, location }
})
const { entries, win } = browser
const fakeLocation = browser.location
const fakeHistory = browser.history

/** Type an address and press Enter: a new entry, then the browser's hashchange. */
function typeAddress(hash: string): void {
  fakeHistory.pushState(null, '', hash)
  win.dispatchEvent(new Event('hashchange'))
}
function go(delta: number): void {
  browser.pos.at += delta
  win.dispatchEvent(new Event('popstate'))
}

const ctx = {
  isSample: true,
  asOf: '2026-09-30',
  all: { employees: [], requisitions: [], hiringPlan: [] },
  org: { byId: new Map() },
} as unknown as AnalyticsContext

type Mods = {
  store: typeof import('@/data/store')
  address: typeof import('@/app/address')
  connect: typeof import('./connect')
  modes: typeof import('./store')
}
let m: Mods
const stops: (() => void)[] = []
const notices: string[] = []

beforeAll(async () => {
  m = {
    store: await import('@/data/store'),
    address: await import('@/app/address'),
    connect: await import('./connect'),
    modes: await import('./store'),
  }
  stops.push(m.connect.connectAccess({ notify: (n) => notices.push(n.title) }))
  m.address.loadAddress(ctx)
  stops.push(m.address.connectAddress(() => ctx))
}, 60_000)

afterAll(() => {
  for (const s of stops) s()
  vi.unstubAllGlobals()
})

const route = () => m.store.useCensus.getState().route

describe('a hidden route in the address', () => {
  it('opens the home in HR mode, replacing the entry, and Back skips it', () => {
    expect(route()).toEqual({ view: 'recruiting', tab: '' })
    const before = entries.length
    typeAddress('#dev.inventory:figures')
    expect(route()).toEqual({ view: 'scorecard', tab: '' })
    expect(fakeLocation.hash.startsWith('#scorecard')).toBe(true)
    // The typed entry now holds the home: nothing in history names the Developer page.
    expect(entries).toHaveLength(before + 1)
    expect(entries.some((e) => e.hash.startsWith('#dev'))).toBe(false)
    expect(notices.at(-1)).toBe('The Developer page is not shown in HR mode')
    typeAddress('#home')
    expect(route()).toEqual({ view: 'scorecard', tab: '' })
    expect(notices.at(-1)).toBe('Home is not shown in HR mode')
    go(-1)
    expect(route().view).toBe('scorecard')
    go(-1)
    expect(route().view).toBe('recruiting')
    go(1)
    expect(route().view).toBe('scorecard')
    go(1)
    expect(route().view).toBe('scorecard')
  })

  it('in Manager mode, sends a hidden view to My team and a hidden tab to the first shown tab', () => {
    m.modes.useMode.setState({ mode: 'manager', managerId: 'E-nobody' })
    // Entering Manager mode leaves the Scorecard (hidden) for My team, without a history entry.
    expect(route()).toEqual({ view: 'team', tab: '' })
    const n = entries.length
    typeAddress('#talent.retention')
    expect(route()).toEqual({ view: 'talent', tab: 'overview' })
    expect(fakeLocation.hash.startsWith('#talent.overview')).toBe(true)
    expect(entries).toHaveLength(n + 1)
    expect(notices.at(-1)).toBe('Talent, Retention risk is not shown in Manager mode')
    typeAddress('#comp.ranges')
    expect(route()).toEqual({ view: 'team', tab: '' })
    expect(entries.some((e) => e.hash.startsWith('#comp') || e.hash.startsWith('#talent.retention'))).toBe(
      false,
    )
    go(-1)
    expect(route()).toEqual({ view: 'talent', tab: 'overview' })
    // goTo refuses a hidden route too.
    m.store.useCensus.getState().navigate('services', 'cases', { history: 'push' })
    expect(route()).toEqual({ view: 'team', tab: '' })
    expect(entries.some((e) => e.hash.startsWith('#services'))).toBe(false)
  })

  it('keeps every filter change inside the lock while Manager mode is on', () => {
    const st = m.store.useCensus.getState()
    st.setFilters({ leaderId: 'E-elsewhere' })
    expect(m.store.useCensus.getState().filters.leaderId).toBe('E-nobody')
    st.setFilters({ leaderId: 'E-nobody', modes: { leaderId: 'exclude' } })
    expect(m.store.useCensus.getState().filters.modes.leaderId).toBeUndefined()
    st.resetFilters()
    expect(m.store.useCensus.getState().filters.leaderId).toBe('E-nobody')
    // Back to HR: the lock lifts and the filters stay as they are.
    m.modes.useMode.setState({ mode: 'hr', managerId: null, picks: NO_PICKS })
    m.store.useCensus.getState().setFilters({ leaderId: null })
    expect(m.store.useCensus.getState().filters.leaderId).toBeNull()
    expect(m.store.homeView()).toBe('scorecard')
  })

  it('in Finance mode opens Home for a hidden page, and keeps the filters to business unit and period', () => {
    m.modes.useMode.setState({ mode: 'finance' })
    expect(route()).toEqual({ view: 'home', tab: '' })
    expect(m.store.homeView()).toBe('home')
    typeAddress('#listening.stay-exit')
    expect(route()).toEqual({ view: 'home', tab: '' })
    expect(notices.at(-1)).toBe('Listening is not shown in Finance mode')
    expect(entries.some((e) => e.hash.startsWith('#listening'))).toBe(false)
    // A hidden tab of a shown view opens its first shown tab: Compensation is Workforce cost only.
    typeAddress('#comp.ranges')
    expect(route()).toEqual({ view: 'comp', tab: 'cost' })
    expect(notices.at(-1)).toBe('Compensation, Range position is not shown in Finance mode')
    expect(entries.some((e) => e.hash.startsWith('#comp.ranges'))).toBe(false)
    m.store.useCensus.getState().setFilters({ location: ['Munich'], businessUnit: ['Silicon Engineering'] })
    expect(m.store.useCensus.getState().filters).toMatchObject({
      location: [],
      businessUnit: ['Silicon Engineering'],
    })
    m.store.useCensus.getState().setFilters({ businessUnit: [] })
    m.modes.useMode.setState({ mode: 'hr' })
    expect(m.store.homeView()).toBe('scorecard')
  })

  it('in a scoped mode with no pick, shows only the home and opens the pick dialog', () => {
    m.store.useCensus.setState({ ready: true })
    for (const mode of MODES.filter((x) => PICK_OF[x] && x !== 'manager')) {
      m.modes.useMode.setState({ mode, picks: NO_PICKS, managerId: null, picking: null })
      expect(route(), mode).toEqual(homeOf(mode))
      expect(m.modes.useMode.getState().picking, mode).toBe(PICK_OF[mode])
      typeAddress('#recruiting.pipeline')
      expect(route(), mode).toEqual(homeOf(mode))
      expect(
        entries.some((e) => e.hash.startsWith('#recruiting.pipeline')),
        mode,
      ).toBe(false)
      go(-1)
      expect(route().view, mode).not.toBe('recruiting')
      m.modes.useMode.getState().cancelPick()
    }
    m.modes.useMode.setState({ mode: 'hr', picks: NO_PICKS, managerId: null, picking: null })
    m.store.useCensus.setState({ ready: false })
  })
})
