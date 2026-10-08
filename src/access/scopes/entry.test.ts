/**
 * Every way into the filters keeps to the scope (docs/ROLES-V2.md 2.3 and 8.8 test 3), with the
 * store, the mode connection and the address writer over a stub browser and the sample loaded:
 * entering the mode, setFilters, resetFilters, an opening address, a saved view at company scope,
 * focusScope (Filter to and Leave out), Ask's resolveFilters with and without filters, and Back and
 * Forward. For `unit`, `region` and `reqs`, and Finance's restriction; Manager's `org` is covered
 * by src/access/managerScope.test.ts the same way.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveFilters } from '@/ask/engine/scope'
import { sampleCtx, sampleData } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters, isExcluded } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { Mode, ModePicks } from '../modes'
import { recruiterKey } from './reqs'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

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
  const entries: { hash: string; state: unknown }[] = [{ hash: '#hrbp', state: null }]
  const pos = { at: 0 }
  const win = Object.assign(new EventTarget(), { scrollTo: () => undefined })
  const history = {
    get state() {
      return entries[pos.at].state
    },
    get length() {
      return entries.length
    },
    back() {
      pos.at = Math.max(0, pos.at - 1)
      win.dispatchEvent(new Event('popstate'))
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
  return { entries, pos, win, history }
})

function typeAddress(hash: string): void {
  browser.history.pushState(null, '', hash)
  browser.win.dispatchEvent(new Event('hashchange'))
}
function go(delta: number): void {
  browser.pos.at += delta
  browser.win.dispatchEvent(new Event('popstate'))
}

const SE = 'Silicon Engineering'
const APAC = ['Bengaluru', 'Ho Chi Minh City', 'Hsinchu', 'Shanghai']
const RECRUITER = 'Agnieszka Nielsen'
const hr = sampleCtx()

type Mods = {
  store: typeof import('@/data/store')
  address: typeof import('@/app/address')
  views: typeof import('@/app/viewActions')
  focus: typeof import('@/drill/focus')
  connect: typeof import('../connect')
  modes: typeof import('../store')
}
let m: Mods
const stops: (() => void)[] = []
const notices: { title: string; description?: string; action?: { label: string } }[] = []

beforeAll(async () => {
  m = {
    store: await import('@/data/store'),
    address: await import('@/app/address'),
    views: await import('@/app/viewActions'),
    focus: await import('@/drill/focus'),
    connect: await import('../connect'),
    modes: await import('../store'),
  }
  const data = sampleData()
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  m.store.useCensus.setState({ data, sources, ready: true })
  stops.push(m.connect.connectAccess({ notify: (n) => notices.push(n) }))
  m.address.loadAddress(hr)
  stops.push(m.address.connectAddress(() => hr))
}, 60_000)

afterAll(() => {
  for (const s of stops) s()
  vi.unstubAllGlobals()
})

const filters = (): Filters => m.store.useCensus.getState().filters

/** The context the app would build now, from the store's state. */
function liveCtx(): AnalyticsContext {
  const st = m.modes.useMode.getState()
  return sampleCtx({ filters: filters(), access: { mode: st.mode, picks: m.modes.picksOfState(st) } })
}

interface Case {
  name: string
  mode: Mode
  picks: Partial<ModePicks>
  /** The store's filters are inside the scope. */
  inside: (f: Filters) => boolean
  /** Every row of the context built from them is too. */
  rows: (ctx: AnalyticsContext) => boolean
}

const CASES: Case[] = [
  {
    name: 'unit',
    mode: 'hrbp-unit',
    picks: { unit: SE },
    inside: (f) => f.businessUnit.length === 1 && f.businessUnit[0] === SE && !isExcluded(f, 'businessUnit'),
    rows: (c) => c.data.employees.length > 0 && c.data.employees.every((e) => e.businessUnit === SE),
  },
  {
    name: 'region',
    mode: 'hrbp-region',
    picks: { region: 'APAC' },
    inside: (f) =>
      f.location.length > 0 && f.location.every((l) => APAC.includes(l)) && !isExcluded(f, 'location'),
    rows: (c) => c.data.employees.length > 0 && c.data.employees.every((e) => APAC.includes(e.location)),
  },
  {
    name: 'reqs',
    mode: 'recruiter',
    picks: { recruiter: { name: RECRUITER, id: null } },
    inside: () => true,
    rows: (c) =>
      c.data.requisitions.every((r) => recruiterKey(r.recruiter) === recruiterKey(RECRUITER)) &&
      c.data.reviews.length === 0,
  },
  {
    name: 'finance',
    mode: 'finance',
    picks: {},
    inside: (f) =>
      !f.leaderId &&
      !f.department.length &&
      !f.location.length &&
      !f.level.length &&
      !Object.keys(f.modes).length,
    rows: () => true,
  },
]

function expectInside(c: Case, how: string): void {
  const f = filters()
  expect(c.inside(f), `${c.name}: ${how} ${JSON.stringify(f)}`).toBe(true)
  expect(c.rows(liveCtx()), `${c.name}: ${how}`).toBe(true)
}

const outsideLeader = hr.org.byId.get(
  hr.all.employees.find((e) => e.businessUnit === 'Corporate' && e.level === 'E1')?.employeeId ?? '',
)
const corpDept = hr.all.employees.find((e) => e.businessUnit === 'Corporate')!.department

describe('every way into the filters keeps to the scope', () => {
  for (const c of CASES)
    it(`${c.name}: entering, setFilters, reset, an address, a saved view, Filter to, Leave out, Ask, Back and Forward`, () => {
      m.store.useCensus
        .getState()
        .setFilters(
          { ...DEFAULT_FILTERS, businessUnit: ['Corporate'], location: ['Munich'], level: ['L4'], modes: {} },
          { history: 'push' },
        )
      // Entering the mode (a pick enters its mode; Finance needs none).
      if (c.mode === 'finance') m.modes.useMode.getState().setMode('finance')
      else if (c.mode === 'hrbp-unit') m.modes.useMode.getState().choose({ kind: 'unit', unit: SE })
      else if (c.mode === 'hrbp-region') m.modes.useMode.getState().choose({ kind: 'region', region: 'APAC' })
      else m.modes.useMode.getState().choose({ kind: 'recruiter', name: RECRUITER, id: null })
      expect(m.modes.useMode.getState().mode).toBe(c.mode)
      expectInside(c, 'entering')

      const st = () => m.store.useCensus.getState()
      st().setFilters({
        businessUnit: ['Corporate', 'Operations'],
        location: ['Munich'],
        modes: { location: 'exclude' },
      })
      expectInside(c, 'setFilters')
      st().setFilters({ leaderId: outsideLeader?.employeeId ?? null, department: [corpDept] })
      expectInside(c, 'setFilters with a leader and department')
      st().resetFilters()
      expectInside(c, 'resetFilters')

      typeAddress('#hrbp.workforce?bu=Corporate&loc=Munich&level=L4')
      expectInside(c, 'an opening address')
      typeAddress('#hrbp.workforce?bu=Silicon+Engineering&not=bu')
      expectInside(c, 'an address that excludes')

      m.views.applySavedView(
        {
          id: 'company',
          name: 'Whole company',
          filters: { ...DEFAULT_FILTERS, modes: {} },
          standard: 'bronze',
          lens: false,
          page: null,
        },
        hr,
      )
      expectInside(c, 'a saved view at company scope')

      m.focus.focusScope({ businessUnit: ['Corporate'] }, { org: hr.org, mode: 'include' })
      expectInside(c, 'Filter to another business unit')
      m.focus.focusScope({ location: ['Hsinchu'] }, { org: hr.org, mode: 'include' })
      expectInside(c, 'Filter to a site')
      m.focus.focusScope({ location: ['Hsinchu'] }, { org: hr.org, mode: 'exclude' })
      expectInside(c, 'Leave out a site')

      const ask = liveCtx()
      for (const input of [{}, { business_unit: ['Corporate'], location: ['Munich'] }]) {
        const r = resolveFilters(ask, input, new Map() as never)
        if (!r.ok) continue
        expect(c.inside(r.filters), `${c.name}: Ask ${JSON.stringify(input)}`).toBe(true)
      }

      go(-1)
      expectInside(c, 'Back')
      go(-1)
      expectInside(c, 'Back again')
      go(1)
      expectInside(c, 'Forward')
      go(1)

      // Leaving the mode lifts the scope: its values stay as ordinary filters.
      m.modes.useMode.getState().setMode('hr')
      m.store.useCensus.getState().resetFilters()
      expect(filters()).toEqual({ ...DEFAULT_FILTERS, modes: {} })
    })

  it('turns pay amounts and immigration details off on every mode change', () => {
    const st = m.store.useCensus.getState()
    st.setShowPay(true)
    st.setShowImmigration(true)
    m.modes.useMode.getState().setMode('compensation')
    expect(m.store.useCensus.getState().showPay).toBe(false)
    expect(m.store.useCensus.getState().showImmigration).toBe(false)
    m.modes.useMode.getState().setMode('hr')
  })

  it('says what a scoped mode left when leaving it, with Whole company', () => {
    m.modes.useMode.getState().choose({ kind: 'unit', unit: SE })
    expect(notices.at(-1)?.title).toBe('HRBP: Silicon Engineering')
    m.modes.useMode.getState().setMode('hr')
    expect(notices.at(-1)).toMatchObject({
      title: 'HR mode',
      description: 'The filters still show Silicon Engineering.',
      action: { label: 'Whole company' },
    })
    expect(filters().businessUnit).toEqual([SE])
    m.modes.useMode.getState().setMode('finance')
    expect(notices.at(-1)?.description).toBe(
      'Finance mode filters by business unit and period, so every cost total covers whole business units.',
    )
    m.modes.useMode.getState().setMode('hr')
    m.store.useCensus.getState().resetFilters()
  })
})
