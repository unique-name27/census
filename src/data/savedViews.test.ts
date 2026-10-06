import { describe, expect, it } from 'vitest'
import {
  addView,
  EMPTY_VIEWS,
  EXAMPLE_VIEWS,
  importViewsSection,
  listedViews,
  loadViews,
  matchView,
  moveView,
  nameProblem,
  removeView,
  renameView,
  restoreView,
  type SavedViewsState,
  STARTING_VIEWS,
  sanitizeViews,
  saveViews,
  setStartup,
  updateView,
  VIEWS_KEY,
  viewScope,
  viewsFileSection,
} from './savedViews'
import { DEFAULT_FILTERS, type Filters } from './scope'
import { DEFAULT_SETTINGS, parseSettingsFile, settingsBlob } from './settings'
import { initialScopeOf } from './store'
import { checkScope, DEFAULT_SCOPE, leftOutMessage, type UrlScope } from './urlScope'

const isRoute = (v: string) => ['hrbp', 'scorecard', 'recruiting', 'data', 'actions'].includes(v)
const scope = (f: Partial<Filters> = {}, rest: Partial<UrlScope> = {}): UrlScope => ({
  ...DEFAULT_SCOPE,
  filters: { ...DEFAULT_FILTERS, modes: {}, ...f },
  ...rest,
})

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('saved views', () => {
  it('start with the two examples on the sample, and none with your own data', () => {
    const s = loadViews(isRoute, memoryStorage())
    expect(s).toBe(STARTING_VIEWS)
    expect(listedViews(s, true).map((v) => v.name)).toEqual([
      'Silicon Engineering, last 6 months',
      'Bengaluru, year to date',
    ])
    expect(listedViews(s, false)).toEqual([])
    // Removable like any other: once removed they stay removed.
    const store = memoryStorage()
    const after = removeView(s, EXAMPLE_VIEWS[0].id).state
    saveViews(after, store)
    expect(loadViews(isRoute, store).views.map((v) => v.id)).toEqual([EXAMPLE_VIEWS[1].id])
  })

  it('add, update, rename, reorder, delete with undo, and choose the one Census opens with', () => {
    let s: SavedViewsState = EMPTY_VIEWS
    s = addView(
      s,
      {
        name: '  My org,   last quarter ',
        scope: scope({ leaderId: 'E1', period: 'lastQuarter' }),
        page: null,
      },
      'a',
    )
    s = addView(
      s,
      {
        name: 'Not Sales',
        scope: scope({ businessUnit: ['Sales'], modes: { businessUnit: 'exclude' } }),
        page: { view: 'hrbp', tab: 'attrition' },
      },
      'b',
    )
    s = addView(s, { name: 'Gold only', scope: scope({}, { standard: 'gold', lens: true }), page: null }, 'c')
    expect(s.views.map((v) => v.name)).toEqual(['My org, last quarter', 'Not Sales', 'Gold only'])
    expect(nameProblem(s, 'not sales')).toBe('A saved view already has this name.')
    expect(nameProblem(s, 'not sales', 'b')).toBeNull()
    expect(nameProblem(s, '   ')).toBe('Enter a name.')
    s = updateView(s, 'a', scope({ leaderId: 'E1', period: 't6m' }))
    expect(s.views[0].filters.period).toBe('t6m')
    s = renameView(s, 'a', 'My org')
    s = moveView(s, 'c', -2)
    expect(s.views.map((v) => v.id)).toEqual(['c', 'a', 'b'])
    expect(moveView(s, 'c', -1)).toBe(s)
    s = setStartup(s, 'b')
    expect(s.startupId).toBe('b')
    const r = removeView(s, 'b')
    expect(r.state.startupId).toBeNull()
    expect(r.state.views.map((v) => v.id)).toEqual(['c', 'a'])
    const back = restoreView(r.state, r.removed!)
    expect(back.views.map((v) => v.id)).toEqual(['c', 'a', 'b'])
    expect(back.startupId).toBe('b')
    expect(setStartup(back, 'nope').startupId).toBeNull()
  })

  it('match the scope exactly, then say "edited" once it changes', () => {
    let s: SavedViewsState = EMPTY_VIEWS
    s = addView(s, { name: 'Hsinchu', scope: scope({ location: ['Hsinchu'] }), page: null }, 'h')
    s = addView(
      s,
      {
        name: 'Not Hsinchu',
        scope: scope({ location: ['Hsinchu'], modes: { location: 'exclude' } }),
        page: null,
      },
      'n',
    )
    expect(matchView(s.views, scope({ location: ['Hsinchu'] }), null)).toEqual({
      view: s.views[0],
      edited: false,
    })
    // Exclude is another view, not the same one.
    expect(
      matchView(s.views, scope({ location: ['Hsinchu'], modes: { location: 'exclude' } }), 'h').view?.id,
    ).toBe('n')
    // An idle mode and the order of values don't make it edited.
    expect(
      matchView(s.views, scope({ location: ['Hsinchu'], modes: { level: 'exclude' } }), 'h').edited,
    ).toBe(false)
    expect(matchView(s.views, scope({ location: ['Hsinchu'], period: 'ytd' }), 'h')).toEqual({
      view: s.views[0],
      edited: true,
    })
    expect(matchView(s.views, scope({ location: ['Hsinchu'] }, { standard: 'gold' }), 'h').edited).toBe(true)
    expect(matchView(s.views, scope({ location: ['Munich'] }), null)).toEqual({ view: null, edited: false })
  })

  it('travel in the settings file and merge on import', () => {
    let s: SavedViewsState = EMPTY_VIEWS
    s = addView(
      s,
      {
        name: 'Not Sales',
        scope: scope({ businessUnit: ['Sales'], modes: { businessUnit: 'exclude' } }),
        page: { view: 'hrbp', tab: 'attrition' },
      },
      'b',
    )
    s = setStartup(s, 'b')
    const blob = settingsBlob(
      DEFAULT_SETTINGS,
      new Date('2026-10-04T00:00:00Z'),
      undefined,
      undefined,
      viewsFileSection(s),
    )
    return blob.text().then((text) => {
      const parsed = parseSettingsFile(text, DEFAULT_SETTINGS, '2026-10-04')
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      let mine: SavedViewsState = addView(EMPTY_VIEWS, { name: 'not sales', scope: scope(), page: null }, 'x')
      mine = addView(mine, { name: 'Keep me', scope: scope({ period: 'ytd' }), page: null }, 'k')
      const r = importViewsSection(mine, parsed.viewsSection, isRoute)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      // The file's view replaces the one with the same name; the others stay.
      expect(r.state.views.map((v) => v.name)).toEqual(['Not Sales', 'Keep me'])
      expect(r.state.views[0].filters.modes).toEqual({ businessUnit: 'exclude' })
      expect(r.state.views[0].page).toEqual({ view: 'hrbp', tab: 'attrition' })
      expect(r.state.startupId).toBe('b')
      expect(r.summary).toBe('1 saved view')
      // A file with only views in it is still a settings file.
      const only = parseSettingsFile(
        JSON.stringify({ kind: 'census-settings', version: 1, settings: {}, views: viewsFileSection(s) }),
        DEFAULT_SETTINGS,
      )
      expect(only.ok && only.viewsSection).toBeTruthy()
      expect(importViewsSection(mine, { views: 'nope' }, isRoute).ok).toBe(false)
    })
  })

  it('drop invalid entries from storage and load filters saved before modes as include', () => {
    const store = memoryStorage({
      [VIEWS_KEY]: JSON.stringify({
        version: 1,
        views: [
          {
            id: 'ok',
            name: 'Old',
            filters: { period: 'ytd', businessUnit: ['Sales'] },
            standard: 'silver',
            page: { view: 'nowhere', tab: '' },
          },
          { id: 'bad id!', name: 'x' },
          { id: 'noname', name: '  ' },
          'junk',
        ],
        startupId: 'gone',
      }),
    })
    const s = loadViews(isRoute, store)
    expect(s.views).toHaveLength(1)
    expect(s.views[0]).toMatchObject({ id: 'ok', standard: 'silver', page: null, lens: false })
    expect(s.views[0].filters.modes).toEqual({})
    expect(s.startupId).toBeNull()
    expect(loadViews(isRoute, memoryStorage({ [VIEWS_KEY]: '{not json' }))).toBe(STARTING_VIEWS)
    expect(sanitizeViews(null, isRoute)).toEqual(EMPTY_VIEWS)
  })

  it('apply without a leader who is not in the loaded data, and say so', () => {
    const v = addView(
      EMPTY_VIEWS,
      { name: 'Gone leader', scope: scope({ leaderId: 'E404', location: ['Hsinchu'] }), page: null },
      'g',
    ).views[0]
    const r = checkScope(viewScope(v), { hasLeader: () => false, hasValue: () => true })
    expect(r.scope.filters.leaderId).toBeNull()
    expect(r.scope.filters.location).toEqual(['Hsinchu'])
    expect(leftOutMessage(r.leftOut, "The view's")).toBe(
      "The view's leader with ID E404 is not in your data, so it was left out.",
    )
  })
})

describe('the scope Census opens with', () => {
  const views: SavedViewsState = setStartup(
    addView(
      EMPTY_VIEWS,
      {
        name: 'Start',
        scope: scope({ location: ['Munich'] }),
        page: { view: 'recruiting', tab: 'pipeline' },
      },
      's',
    ),
    's',
  )

  it('is the link’s scope when the address has one, exactly', () => {
    const i = initialScopeOf({ hash: '#hrbp.attrition?bu=Sales&not=bu', historyState: null, views })
    expect(i.source).toBe('link')
    expect(i.scope?.filters).toMatchObject({ businessUnit: ['Sales'], modes: { businessUnit: 'exclude' } })
    expect(
      initialScopeOf({ hash: '#hrbp?scope=all', historyState: null, views }).scope?.filters,
    ).toMatchObject({
      businessUnit: [],
      location: [],
    })
  })

  it('is the defaults for an entry Census wrote with no scope (a reload at the defaults)', () => {
    const i = initialScopeOf({ hash: '#hrbp', historyState: { census: 1 }, views })
    expect(i.source).toBe('link')
    expect(i.scope?.filters.location).toEqual([])
  })

  it('is the startup view without a scope in the address, and its page only when the address names none', () => {
    const a = initialScopeOf({ hash: '', historyState: null, views })
    expect(a).toMatchObject({ source: 'startup', viewId: 's', page: { view: 'recruiting', tab: 'pipeline' } })
    const b = initialScopeOf({ hash: '#hrbp.attrition', historyState: null, views })
    expect(b.source).toBe('startup')
    expect(b.page).toBeUndefined()
  })

  it('is your last filters otherwise', () => {
    expect(initialScopeOf({ hash: '#hrbp', historyState: null, views: EMPTY_VIEWS }).source).toBe('last')
  })
})
