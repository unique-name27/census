/**
 * The address sync over a page's history (docs/FILTERS.md, parts 1 and 2), with a stub browser:
 *
 * - An example set to open Census is forgotten once your own data is loaded (examples are not
 *   listed then, so it could be neither seen nor unset), and Census opens with your last filters.
 * - Back and Forward show the saved view each entry was in: never "edited" over a scope the view
 *   was not applied to.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'

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

/* ───────── a browser tab: one history stack, the hash and popstate ───────── */

const entries: { hash: string; state: unknown }[] = [{ hash: '', state: null }]
let at = 0
const win = Object.assign(new EventTarget(), { scrollTo: () => undefined })
const fakeLocation = {
  get hash() {
    return entries[at].hash
  },
  set hash(h: string) {
    fakeHistory.pushState(null, '', h)
  },
  get href() {
    return `http://census.test/${entries[at].hash}`
  },
}
const fakeHistory = {
  get state() {
    return entries[at].state
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
}
/** Back (-1) or Forward (+1), as the browser does it. */
function go(delta: number): void {
  at += delta
  win.dispatchEvent(new Event('popstate'))
}

const own = {
  id: 'mine',
  name: 'Bengaluru L3',
  filters: { period: 't12m', location: ['Bengaluru'], level: ['L3'], modes: {} },
  standard: 'bronze',
  lens: false,
  page: null,
}

const storage = new MemoryStorage()
storage.setItem('census:filters', JSON.stringify({ period: 't6m', level: ['L4'] }))
// "Bengaluru, year to date" (an example) set to open Census, next to a view of your own.
storage.setItem(
  'census:views',
  JSON.stringify({
    version: 1,
    views: [
      {
        id: 'example-bengaluru-ytd',
        name: 'Bengaluru, year to date',
        filters: { period: 'ytd', location: ['Bengaluru'], modes: {} },
        standard: 'bronze',
        lens: false,
        page: { view: 'comp', tab: '' },
        example: true,
      },
      own,
    ],
    startupId: 'example-bengaluru-ytd',
  }),
)
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', win)
vi.stubGlobal('location', fakeLocation)
vi.stubGlobal('history', fakeHistory)
vi.stubGlobal('BroadcastChannel', undefined)

/** Your own data: the vocabulary a scope is checked against (Bengaluru, L3 and L4 exist). */
const ctx = {
  isSample: false,
  asOf: '2026-09-30',
  all: {
    employees: [
      { employeeId: 'E1', location: 'Bengaluru', level: 'L3', department: 'D', businessUnit: 'B' },
      { employeeId: 'E2', location: 'Hsinchu', level: 'L4', department: 'D', businessUnit: 'B' },
    ],
    requisitions: [],
    hiringPlan: [],
  },
  org: { byId: new Map([['E1', {}]]) },
} as unknown as AnalyticsContext

type Mods = {
  store: typeof import('@/data/store')
  address: typeof import('./address')
  views: typeof import('@/data/viewsStore')
  actions: typeof import('./viewActions')
  saved: typeof import('@/data/savedViews')
}
let m: Mods
let stop: () => void = () => undefined

beforeAll(async () => {
  m = {
    store: await import('@/data/store'),
    address: await import('./address'),
    views: await import('@/data/viewsStore'),
    actions: await import('./viewActions'),
    saved: await import('@/data/savedViews'),
  }
}, 60_000)

afterAll(() => {
  stop()
  vi.unstubAllGlobals()
})

/** What the filter row's Views button shows for the scope on screen. */
function viewsButton(): string {
  const st = m.store.useCensus.getState()
  const v = m.views.useSavedViews.getState()
  const listed = m.saved.listedViews(v, ctx.isSample)
  const { view, edited } = m.saved.matchView(
    listed,
    { filters: st.filters, standard: st.dataStandard, lens: false },
    v.appliedId,
  )
  return view ? `${view.name}${edited ? ', edited' : ''}` : 'Views'
}

describe('an example set to open Census, with your own data loaded', () => {
  it('is forgotten: Census opens on your last filters and the page the address names', () => {
    m.address.loadAddress(ctx)
    const views = m.views.useSavedViews.getState()
    expect(views.startupId).toBeNull()
    expect(views.appliedId).toBeNull()
    expect(
      (JSON.parse(storage.getItem('census:views') ?? '{}') as { startupId?: unknown }).startupId,
    ).toBeNull()
    const st = m.store.useCensus.getState()
    expect(st.filters.period).toBe('t6m')
    expect(st.filters.level).toEqual(['L4'])
    expect(st.filters.location).toEqual([])
    // Not the example's page: the address named none, so the home view.
    expect(st.route.view).toBe(m.store.HOME_VIEW)
    expect(fakeLocation.hash).toBe(`#${m.store.HOME_VIEW}?period=t6m&level=L4`)
    expect(entries).toHaveLength(1)
  })
})

describe('Back and Forward over a saved view', () => {
  it('show the view each entry was in, never "edited" over another scope', () => {
    stop = m.address.connectAddress(() => ctx)
    const st = m.store.useCensus
    st.getState().setFilters({ period: 't12m', level: ['L3', 'L4'] }, { history: 'push' })
    expect(entries).toHaveLength(2)
    expect(viewsButton()).toBe('Views')

    const view = m.views.useSavedViews.getState().views.find((v) => v.id === 'mine')
    if (!view) throw new Error('the own view did not load')
    m.actions.applySavedView(view, ctx)
    expect(entries).toHaveLength(3)
    expect(fakeLocation.hash).toBe(`#${m.store.HOME_VIEW}?loc=Bengaluru&level=L3`)
    expect(viewsButton()).toBe('Bengaluru L3')

    go(-1)
    expect(st.getState().filters.level).toEqual(['L3', 'L4'])
    expect(m.views.useSavedViews.getState().appliedId).toBeNull()
    expect(viewsButton()).toBe('Views')

    go(1)
    expect(st.getState().filters.location).toEqual(['Bengaluru'])
    expect(viewsButton()).toBe('Bengaluru L3')

    // Changing the scope after applying it is "edited", and Back from there shows the view again.
    st.getState().setFilters({ level: ['L4'] }, { history: 'push' })
    expect(viewsButton()).toBe('Bengaluru L3, edited')
    go(-1)
    expect(viewsButton()).toBe('Bengaluru L3')
    // The first entry, from before any view was applied.
    go(-1)
    go(-1)
    expect(at).toBe(0)
    expect(viewsButton()).toBe('Views')
    expect(st.getState().filters.level).toEqual(['L4'])
    expect(entries).toHaveLength(4)
  })
})
