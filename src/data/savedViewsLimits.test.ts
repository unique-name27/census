/**
 * Saved views at their limit and through a settings file (docs/FILTERS.md, part 2): nothing is
 * dropped to make room, "Open Census with this view" never points at a view that is gone, the
 * import summary counts what came in, and an import never leaves two views with one name.
 */
import { describe, expect, it } from 'vitest'
import {
  addView,
  importViewsSection,
  nameProblem,
  type SavedViewsState,
  STARTING_VIEWS,
  sanitizeViews,
  uniqueName,
  VIEWS_MAX,
  viewsFull,
} from './savedViews'
import { DEFAULT_SCOPE } from './urlScope'

const isRoute = () => true
const named = (n: number, prefix = 'v'): SavedViewsState =>
  sanitizeViews(
    { views: Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}` })) },
    isRoute,
  )

describe('the saved views limit', () => {
  it('refuses a new view once the list is full, leaving the list and the startup view as they were', () => {
    const full = { ...named(VIEWS_MAX), startupId: 'v0' }
    expect(viewsFull(full)).toBe(true)
    const after = addView(full, { name: 'One more', scope: DEFAULT_SCOPE, page: null }, 'extra')
    expect(after).toBe(full)
    expect(after.views[0].id).toBe('v0')
    expect(after.startupId).toBe('v0')
    expect(viewsFull(named(VIEWS_MAX - 1))).toBe(false)
  })

  it('reads a stored list over the limit without pointing the startup view at a view it dropped', () => {
    const raw = {
      views: Array.from({ length: VIEWS_MAX + 2 }, (_, i) => ({ id: `k${i}`, name: `k${i}` })),
      startupId: `k${VIEWS_MAX + 1}`,
    }
    const s = sanitizeViews(raw, isRoute)
    expect(s.views).toHaveLength(VIEWS_MAX)
    expect(s.startupId).toBeNull()
  })
})

describe('importing saved views from a settings file', () => {
  it('counts the views that came in, not the views in the file', () => {
    const r = importViewsSection(
      named(VIEWS_MAX - 1),
      { views: Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, name: `n${i}` })) },
      isRoute,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.views).toHaveLength(VIEWS_MAX)
    expect(r.summary).toBe(`1 saved view (4 more left out: Census keeps at most ${VIEWS_MAX} saved views)`)
  })

  it('replaces a view by id, else by name, and never leaves two views with one name', () => {
    const s = sanitizeViews(
      {
        views: [
          { id: 'a', name: 'X' },
          { id: 'b', name: 'Y' },
        ],
      },
      isRoute,
    )
    const byId = importViewsSection(s, { views: [{ id: 'a', name: 'Y' }] }, isRoute)
    expect(byId.ok && byId.state.views.map((v) => [v.id, v.name])).toEqual([
      ['a', 'Y (2)'],
      ['b', 'Y'],
    ])
    const byName = importViewsSection(s, { views: [{ id: 'c', name: 'y' }] }, isRoute)
    expect(byName.ok && byName.state.views.map((v) => [v.id, v.name])).toEqual([
      ['a', 'X'],
      ['c', 'y'],
    ])
    expect(byName.ok && byName.summary).toBe('1 saved view')
  })

  it('keeps your startup view when a file view replaces it by name', () => {
    const s = { ...sanitizeViews({ views: [{ id: 'a', name: 'Mine' }] }, isRoute), startupId: 'a' }
    const r = importViewsSection(s, { views: [{ id: 'z', name: 'mine' }] }, isRoute)
    expect(r.ok && r.state.views.map((v) => v.id)).toEqual(['z'])
    expect(r.ok && r.state.startupId).toBe('z')
  })

  it('never lets two views of the file replace each other', () => {
    const r = importViewsSection(
      named(1),
      {
        views: [
          { id: 'p', name: 'Same' },
          { id: 'q', name: 'same' },
        ],
      },
      isRoute,
    )
    expect(r.ok && r.state.views.map((v) => [v.id, v.name])).toEqual([
      ['v0', 'v0'],
      ['p', 'Same'],
      ['q', 'same (2)'],
    ])
    expect(r.ok && r.summary).toBe('2 saved views')
  })

  it('keeps the file’s startup view only when it came in', () => {
    const r = importViewsSection(
      named(VIEWS_MAX),
      { views: [{ id: 'new', name: 'New' }], startupId: 'new' },
      isRoute,
    )
    expect(r.ok && r.state.startupId).toBeNull()
    expect(r.ok && r.summary).toBe(
      `0 saved views (1 more left out: Census keeps at most ${VIEWS_MAX} saved views)`,
    )
  })

  it('makes names unique with a number, within the name length', () => {
    const views = named(2).views.map((v, i) => ({ ...v, name: i ? 'Report (2)' : 'Report' }))
    expect(uniqueName(views, 'Report')).toBe('Report (3)')
    expect(uniqueName(views, 'Other')).toBe('Other')
    expect(uniqueName(views, 'report', views[0].id)).toBe('report')
  })
})

describe('what a saved view stores', () => {
  it('never an exclude mode without values', () => {
    const scope = {
      ...DEFAULT_SCOPE,
      filters: {
        ...DEFAULT_SCOPE.filters,
        level: ['L1'],
        modes: { level: 'exclude' as const, leaderId: 'exclude' as const },
      },
    }
    const s = addView({ views: [], startupId: null }, { name: 'R&D, not L1', scope, page: null }, 'x')
    expect(s.views[0].filters.modes).toEqual({ level: 'exclude' })
  })
})

describe('names', () => {
  it('are checked against the views you can see: a hidden example’s name is free', () => {
    const own = STARTING_VIEWS.views.filter((v) => !v.example)
    expect(nameProblem({ views: own }, 'Bengaluru, year to date')).toBeNull()
    expect(nameProblem(STARTING_VIEWS, 'Bengaluru, year to date')).toBe('A saved view already has this name.')
  })
})
