/**
 * The app as Ask drives it (`liveAskApp`), on the real stores and the address writer over a stub
 * browser (as in src/app/addressHistory.test.ts): each action is one history entry, Undo steps
 * Back while that entry is on screen and otherwise puts the earlier state back as a new entry,
 * the mode's guards apply, a saved view applies in one step and says what it left out without an
 * ID, the records panel opens and closes, and the screen lists the registry's figures.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RegisteredFigure } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

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

const entries: { hash: string; state: unknown }[] = [{ hash: '', state: null }]
let at = 0
const win = Object.assign(new EventTarget(), { scrollTo: () => undefined })
const fakeLocation = {
  get hash() {
    return entries[at]?.hash ?? ''
  },
  set hash(h: string) {
    fakeHistory.pushState(null, '', h)
  },
  get href() {
    return `http://census.test/${entries[at]?.hash ?? ''}`
  },
}
/** Back (-1) or Forward (+1), as the browser does it. */
function go(delta: number): void {
  at += delta
  win.dispatchEvent(new Event('popstate'))
}
const fakeHistory = {
  get state() {
    return entries[at]?.state
  },
  get length() {
    return entries.length
  },
  pushState(state: unknown, _title: string, url: string) {
    entries.splice(at + 1)
    entries.push({ hash: url, state })
    at++
  },
  replaceState(state: unknown, _title: string, url: string) {
    entries[at] = { hash: url, state }
  },
  back: () => go(-1),
}

const storage = new MemoryStorage()
storage.setItem(
  'census:views',
  JSON.stringify({
    version: 1,
    views: [
      {
        id: 'mine',
        name: 'Bengaluru L3',
        filters: { period: 'ytd', location: ['Bengaluru'], level: ['L3'], leaderId: 'E404', modes: {} },
        standard: 'bronze',
        lens: false,
        page: { view: 'hrbp', tab: 'attrition' },
      },
    ],
    startupId: null,
  }),
)
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', win)
vi.stubGlobal('location', fakeLocation)
vi.stubGlobal('history', fakeHistory)
vi.stubGlobal('BroadcastChannel', undefined)

/** The data a scope is checked against: Bengaluru, Austin, L3 and L4 exist; E404 does not. */
const ctx = {
  isSample: false,
  asOf: '2026-09-30',
  filters: DEFAULT_FILTERS,
  standard: 'bronze',
  all: {
    employees: [
      { employeeId: 'E1', location: 'Bengaluru', level: 'L3', department: 'D', businessUnit: 'B' },
      { employeeId: 'E2', location: 'Austin', level: 'L4', department: 'D', businessUnit: 'B' },
    ],
    requisitions: [],
    hiringPlan: [],
  },
  org: { byId: new Map([['E1', { name: 'Someone' }]]) },
} as unknown as AnalyticsContext

type AskAction = import('./app').AskAction

type Mods = {
  store: typeof import('@/data/store')
  address: typeof import('@/app/address')
  drill: typeof import('@/drill/store')
  live: typeof import('./liveApp')
  app: typeof import('./app')
}
let m: Mods
let stop: () => void = () => undefined

beforeAll(async () => {
  m = {
    store: await import('@/data/store'),
    address: await import('@/app/address'),
    drill: await import('@/drill/store'),
    live: await import('./liveApp'),
    app: await import('./app'),
  }
  m.address.loadAddress(ctx)
  stop = m.address.connectAddress(() => ctx)
}, 60_000)

afterAll(() => {
  stop()
  m.store.setFilterGuard(null)
  vi.unstubAllGlobals()
})

const filters = () => m.store.useCensus.getState().filters
const route = () => m.store.useCensus.getState().route

describe('liveAskApp', () => {
  it('sets filters as one history entry, and Undo steps Back', () => {
    const app = m.live.liveAskApp
    const start = entries.length
    const before = app.snapshot()
    app.setFilters({ ...DEFAULT_FILTERS, location: ['Bengaluru'], period: 't6m', modes: {} })
    const after = app.snapshot()
    expect(entries.length).toBe(start + 1)
    expect(fakeLocation.hash).toMatch(/period=t6m&loc=Bengaluru/)
    expect(after.entry).not.toBe(before.entry)
    m.app.undoAction(app, {
      id: 'a',
      tool: 'set_filters',
      line: '',
      undo: { before, after, parts: ['scope'] },
    })
    expect(filters().location).toEqual([])
    expect(filters().period).toBe('t12m')
    expect(at).toBe(start - 1)
  })

  it('puts back only what the action changed, as a new entry, when something happened since', () => {
    const app = m.live.liveAskApp
    const before = app.snapshot()
    app.setFilters({ ...DEFAULT_FILTERS, location: ['Austin'], modes: {} })
    const after = app.snapshot()
    // The person changed the level by hand afterwards: Undo keeps their change.
    m.store.useCensus.getState().setFilters({ level: ['L4'] }, { history: 'push' })
    const n = entries.length
    m.app.undoAction(app, {
      id: 'b',
      tool: 'set_filters',
      line: '',
      undo: { before, after, parts: ['scope'] },
    })
    expect(entries.length).toBe(n + 1)
    expect(filters().location).toEqual([])
    expect(filters().level).toEqual(['L4'])
    m.store.useCensus.getState().setFilters({ level: [] }, { history: 'push' })
  })

  /** Two set_filters in one answer (location, then the period), as Ask runs them. */
  function twoActions(): AskAction[] {
    const app = m.live.liveAskApp
    const out: AskAction[] = []
    const steps: [string, Partial<Filters>][] = [
      ['loc', { location: ['Bengaluru'] }],
      ['period', { period: 't6m' }],
    ]
    for (const [id, next] of steps) {
      const before = app.snapshot()
      app.setFilters({ ...filters(), ...next })
      out.push({
        id,
        tool: 'set_filters',
        line: id,
        undo: { before, after: app.snapshot(), parts: ['scope'] },
      })
    }
    expect(fakeLocation.hash).toMatch(/period=t6m&loc=Bengaluru/)
    return out
  }

  it('undoes two filter actions of one answer in either order, each putting back only its own', () => {
    const app = m.live.liveAskApp
    m.live.liveAskApp.resetFilters()
    // The first one first: its location goes, the period stays; then the period goes too.
    const [loc, period] = twoActions() as [AskAction, AskAction]
    m.app.undoAction(app, loc)
    expect(filters()).toMatchObject({ location: [], period: 't6m' })
    m.app.undoAction(app, period)
    expect(filters()).toMatchObject({ location: [], period: 't12m' })
    // The last one first: Back, then Back again.
    const [loc2, period2] = twoActions() as [AskAction, AskAction]
    const n = entries.length
    m.app.undoAction(app, period2)
    expect(filters()).toMatchObject({ location: ['Bengaluru'], period: 't12m' })
    m.app.undoAction(app, loc2)
    expect(filters()).toMatchObject({ location: [], period: 't12m' })
    expect(entries.length).toBe(n)
    expect(at).toBe(n - 3)
  })

  it('holds an Undo back while a later action changed the same filter again', () => {
    const app = m.live.liveAskApp
    const [loc, period] = twoActions() as [AskAction, AskAction]
    const before = app.snapshot()
    app.setFilters({ ...filters(), location: ['Austin'] })
    const austin: AskAction = {
      id: 'austin',
      tool: 'set_filters',
      line: '',
      undo: { before, after: app.snapshot(), parts: ['scope'] },
    }
    const undone = new Set<string>()
    const waits = () => m.app.undoWaits([loc, period, austin], (a) => undone.has(a.id))
    expect([...waits()]).toEqual(['loc'])
    m.app.undoAction(app, austin)
    undone.add('austin')
    expect(filters().location).toEqual(['Bengaluru'])
    expect([...waits()]).toEqual([])
    m.app.undoAction(app, loc)
    expect(filters()).toMatchObject({ location: [], period: 't6m' })
    m.live.liveAskApp.resetFilters()
  })

  it('leaves a filter the person changed again since, and says when nothing is left to undo', () => {
    const app = m.live.liveAskApp
    m.live.liveAskApp.resetFilters()
    const before = app.snapshot()
    app.setFilters({ ...filters(), location: ['Austin'], period: 't6m' })
    const action: AskAction = {
      id: 'mixed',
      tool: 'set_filters',
      line: '',
      undo: { before, after: app.snapshot(), parts: ['scope'] },
    }
    // The person picks another location by hand: the location is theirs now, the period still Ask's.
    m.store.useCensus.getState().setFilters({ location: ['Bengaluru'] }, { history: 'push' })
    expect(m.app.stillShown(app.snapshot(), action.undo as NonNullable<AskAction['undo']>)).toEqual([
      'period',
    ])
    const n = entries.length
    m.app.undoAction(app, action)
    expect(filters()).toMatchObject({ location: ['Bengaluru'], period: 't12m' })
    expect(entries.length).toBe(n + 1)
    // Another action whose only change the person changed again: nothing is left to undo.
    const start = app.snapshot()
    app.setFilters({ ...filters(), location: ['Austin'] })
    const only: AskAction = {
      id: 'only',
      tool: 'set_filters',
      line: '',
      undo: { before: start, after: app.snapshot(), parts: ['scope'] },
    }
    m.store.useCensus.getState().setFilters({ location: ['Bengaluru'] }, { history: 'push' })
    expect(m.app.stillShown(app.snapshot(), only.undo as NonNullable<AskAction['undo']>)).toEqual([])
    const k = entries.length
    m.app.undoAction(app, only)
    expect(entries.length).toBe(k)
    expect(filters()).toMatchObject({ location: ['Bengaluru'], period: 't12m' })
    m.live.liveAskApp.resetFilters()
  })

  it('knows when the person stepped Back past an action, and Forward again', async () => {
    const { currentEntry } = await import('@/data/address')
    const [loc, period] = twoActions() as [AskAction, AskAction]
    expect(m.app.steppedBack(period, currentEntry())).toBe(false)
    go(-1)
    expect(filters()).toMatchObject({ location: ['Bengaluru'], period: 't12m' })
    expect(m.app.steppedBack(period, currentEntry())).toBe(true)
    expect(m.app.steppedBack(loc, currentEntry())).toBe(false)
    go(1)
    expect(m.app.steppedBack(period, currentEntry())).toBe(false)
    m.live.liveAskApp.resetFilters()
  })

  it('opens a view through goTo as one entry, and resets the filters as one entry', () => {
    const app = m.live.liveAskApp
    const n = entries.length
    app.goTo('hrbp', 'attrition')
    expect(route()).toEqual({ view: 'hrbp', tab: 'attrition' })
    expect(entries.length).toBe(n + 1)
    app.setFilters({ ...DEFAULT_FILTERS, location: ['Bengaluru'], modes: {} })
    app.resetFilters()
    expect(entries.length).toBe(n + 3)
    expect(filters()).toMatchObject({ location: [], period: 't12m' })
  })

  it('goes through the mode’s filter guard', () => {
    const lock = (f: Filters): Filters => ({ ...f, leaderId: 'E1' })
    m.store.setFilterGuard(lock)
    m.live.liveAskApp.setFilters({ ...DEFAULT_FILTERS, location: ['Austin'], modes: {} })
    expect(filters()).toMatchObject({ leaderId: 'E1', location: ['Austin'] })
    m.store.setFilterGuard(null)
    m.live.liveAskApp.resetFilters()
  })

  it('applies a saved view in one step and says what it left out, without the ID', () => {
    const n = entries.length
    // The bridge has reported a context, so the scope is checked against the data.
    const disconnect = m.live.connectScreen({
      registry: null,
      ctx,
      view: 'hrbp',
      tab: 'overview',
      pending: false,
    })
    const r = m.live.liveAskApp.applySavedView('mine')
    expect(entries.length).toBe(n + 1)
    expect(filters()).toMatchObject({ location: ['Bengaluru'], level: ['L3'], leaderId: null, period: 'ytd' })
    expect(route()).toEqual({ view: 'hrbp', tab: 'attrition' })
    expect(r.leftOut).toBe('Not in the loaded data, so left out: its leader.')
    expect(r.leftOut).not.toContain('E404')
    const s = m.live.liveAskApp.screen()
    // Without its leader the scope is not the view's own, as the filter row says too.
    expect(s.savedView).toEqual({ id: 'mine', name: 'Bengaluru L3', edited: true })
    expect(s.savedViews.map((v) => v.name)).toEqual(['Bengaluru L3'])
    disconnect()
  })

  it('says why Manager mode replaced a saved view’s leader and did not open its page', async () => {
    const { useMode } = await import('@/access/store')
    const { routeDecision } = await import('@/access/policy')
    const saved = JSON.parse(storage.getItem('census:views') as string)
    const views = (await import('@/data/viewsStore')).useSavedViews
    const other = {
      id: 'hr-comp',
      name: 'HR comp of other org',
      filters: { ...DEFAULT_FILTERS, leaderId: 'E1', modes: {} },
      standard: 'bronze',
      lens: false,
      page: { view: 'comp', tab: 'overview' },
    }
    views.setState({ views: [...views.getState().views, other as never] })
    const disconnect = m.live.connectScreen({
      registry: null,
      ctx,
      view: 'team',
      tab: 'overview',
      pending: false,
    })
    useMode.setState({ mode: 'manager', managerId: 'E2' })
    m.store.setFilterGuard((f) => ({ ...f, leaderId: 'E2' }))
    m.store.setRouteGuard({
      check: (r) => ({ route: routeDecision('manager', r).route }),
      home: () => 'team',
    })
    try {
      const r = m.live.liveAskApp.applySavedView('hr-comp')
      expect(route().view).toBe('team')
      expect(r.leftOut).toBe(
        "Manager mode keeps Census on the manager's org, so its leader was replaced. Its page was not opened: Compensation is not shown in Manager mode. Census opened My team instead.",
      )
      expect(r.leftOut).not.toMatch(/loaded data/)
    } finally {
      m.store.setFilterGuard(null)
      m.store.setRouteGuard(null)
      useMode.setState({ mode: 'hr', managerId: null })
      views.setState({ views: views.getState().views.filter((v) => v.id !== 'hr-comp') })
      storage.setItem('census:views', JSON.stringify(saved))
      disconnect()
    }
  })

  it('opens and closes the records panel, and lists the figures the registry holds', async () => {
    const app = m.live.liveAskApp
    const before = app.snapshot()
    app.openRecords({ kind: 'employees', title: 'Leavers', rows: [] })
    expect(app.screen().records).toEqual({ title: 'Leavers', subtitle: null, kind: 'employees', rows: 0 })
    m.app.undoAction(app, {
      id: 'c',
      tool: 'open_records',
      line: '',
      undo: { before, after: app.snapshot(), parts: ['records'] },
    })
    expect(m.drill.useDrillStore.getState().stack).toEqual([])
    const fig: RegisteredFigure = {
      id: 'hrbp-attrition-by-location',
      title: 'Voluntary attrition by location',
      columns: [{ key: 'location', label: 'Location' }],
      rows: [{ location: 'Bengaluru' }],
      getSvg: () => null,
      order: 1,
    }
    const st = m.store.useCensus.getState()
    const disconnect = m.live.connectScreen({
      registry: { list: () => [fig] },
      ctx: { ...ctx, filters: st.filters, standard: st.dataStandard },
      view: st.route.view,
      tab: st.route.tab,
      pending: false,
    })
    await app.settle(1000)
    expect(app.screen().figures.map((f) => f.id)).toEqual([fig.id])
    const data = await app.figure(fig.id)
    expect(data?.rows).toEqual(fig.rows)
    const seen: unknown[] = []
    const off = m.live.onScreenEvent((e) => seen.push(e))
    app.showFigure(fig.id, { table: true })
    expect(seen).toEqual([{ type: 'show_figure', id: fig.id, table: true }])
    off()
    disconnect()
  })

  it('reads "Let Ask change the screen" from this browser', async () => {
    const { saveScreenActions } = await import('./screenSetting')
    expect(m.live.liveAskApp.actionsOn()).toBe(true)
    saveScreenActions(false)
    expect(m.live.liveAskApp.actionsOn()).toBe(false)
    expect(storage.getItem('census:ask-actions')).toBe('off')
    saveScreenActions(true)
    expect(m.live.liveAskApp.actionsOn()).toBe(true)
    expect(storage.getItem('census:ask-actions')).toBeNull()
  })
})
