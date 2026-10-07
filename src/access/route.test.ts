/**
 * Routes in every mode (docs/ROLES.md, 3.15 and 6.8 test 2): `routeDecision` leaves shown routes
 * alone, sends a hidden view or page to the mode's home and a hidden tab to the view's first shown
 * tab. Then, with the store and the address writer over a stub browser (as in
 * src/app/addressHistory.test.ts): a redirect replaces the entry, the address shows where Census
 * went, and Back never returns to the hidden route.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { ROUTE_VIEWS, type Route, type RouteView } from '@/data/store'
import { DATA_TABS } from '@/views/data/links'
import { VIEWS } from '@/views/registry'
import { HOME_OF, homeOf, type Mode } from './modes'
import { firstManagerTab, MANAGER_TABS, MANAGER_VIEWS, routeDecision } from './policy'

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
  return ['', ...(VIEWS.find((v) => v.key === view)?.tabs.map((t) => t.key) ?? [])]
}

/** Every route an address can name, with each tab, plus the deep addresses the spec lists. */
const ROUTES: Route[] = [
  ...ROUTE_VIEWS.flatMap((view) => tabsOf(view).map((tab) => ({ view, tab }))),
  { view: 'data', tab: 'metrics/hrbp/attrition/voluntary' },
  { view: 'data', tab: 'employees-raw' },
  { view: 'ai', tab: 'agents:compliance' },
]

/** What 3.15 says each mode does with a route. */
function expected(mode: Mode, r: Route): Route {
  if (mode === 'developer') return r
  // The Action center is not ready yet: Developer mode only.
  if (r.view === 'actions') return homeOf(mode)
  if (mode === 'hr') return r.view === 'dev' || r.view === 'team' ? homeOf('hr') : r
  const hiddenPage =
    r.view === 'data' ||
    r.view === 'dev' ||
    MANAGER_VIEWS[r.view as keyof typeof MANAGER_VIEWS]?.access === 'hidden'
  if (hiddenPage) return homeOf('manager')
  const named = MANAGER_TABS[r.view as keyof typeof MANAGER_TABS]?.find(
    (t) => t.key === r.tab.split(/[:/]/)[0],
  )
  if (named?.decision.access === 'hidden') return { view: r.view, tab: firstManagerTab(r.view)?.key ?? '' }
  return r
}

describe('routeDecision', () => {
  for (const mode of ['developer', 'hr', 'manager'] as const)
    it(`in ${mode} mode follows 3.15 for every route and tab`, () => {
      for (const r of ROUTES) {
        const d = routeDecision(mode, r)
        expect(d.route, `${mode} #${r.view}.${r.tab}`).toEqual(expected(mode, r))
        expect(d.redirected, `${mode} #${r.view}.${r.tab}`).toBe(
          d.route.view !== r.view || d.route.tab !== r.tab,
        )
        if (d.redirected)
          expect(d.reason?.title, `${mode} #${r.view}.${r.tab}`).toMatch(/is not shown in|is not ready yet/)
      }
    })

  it('names the redirects the spec lists', () => {
    expect(routeDecision('hr', { view: 'dev', tab: 'inventory:figures' }).route).toEqual(homeOf('hr'))
    expect(routeDecision('hr', { view: 'team', tab: '' }).route).toEqual({ view: 'scorecard', tab: '' })
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
    expect(routeDecision('hr', { view: 'actions', tab: '' }).reason).toEqual({
      title: 'The Action center is not ready yet.',
      description: 'It is only in Developer mode for now. Census opened the Scorecard instead.',
    })
    expect(routeDecision('manager', { view: 'actions', tab: '' }).route).toEqual(homeOf('manager'))
    expect(routeDecision('developer', { view: 'actions', tab: '' }).redirected).toBe(false)
    expect(routeDecision('developer', { view: 'team', tab: '' }).redirected).toBe(false)
    expect(HOME_OF).toEqual({ hr: 'scorecard', manager: 'team', developer: 'dev' })
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
    go(-1)
    expect(route().view).toBe('recruiting')
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
    m.modes.useMode.setState({ mode: 'hr' })
    m.store.useCensus.getState().setFilters({ leaderId: null })
    expect(m.store.useCensus.getState().filters.leaderId).toBeNull()
    expect(m.store.homeView()).toBe('scorecard')
  })
})
