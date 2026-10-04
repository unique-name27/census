/**
 * The Action center's pure helpers: due dates in words and buckets, Mark handled and Snooze with
 * their storage, the page filters and the grouping by owner.
 */
import { describe, expect, it } from 'vitest'
import { dueBucket, dueBucketLabel, dueText } from './due'
import { filterActions, isFiltering, NO_FILTERS } from './filters'
import { groupByOwner, ownerCount } from './group'
import {
  loadMarks,
  type Marks,
  parseMarks,
  STORAGE_KEY,
  type StorageLike,
  saveMarks,
  serializeMarks,
  snapshotOf,
  statusOf,
  withHandled,
  withReopened,
  withSnapshot,
  withSnoozed,
} from './marks'
import { AS_OF, open } from './testkit'

const NOW = Date.parse('2026-10-04T12:00:00.000Z')
const DAY = 86_400_000

describe('due dates', () => {
  it('say how far off they are, against the as-of date', () => {
    expect(dueText('2026-09-26', AS_OF)).toBe('4 d overdue')
    expect(dueText(AS_OF, AS_OF)).toBe('Due today')
    expect(dueText('2026-10-03', AS_OF)).toBe('Due in 3 d')
    expect(dueText(null, AS_OF)).toBe('No due date')
    expect(dueText('not a date', AS_OF)).toBe('No due date')
  })

  it('fall into overdue, due soon (the look-ahead, inclusive), later or none', () => {
    expect(dueBucket('2026-09-29', AS_OF, 7)).toBe('overdue')
    expect(dueBucket(AS_OF, AS_OF, 7)).toBe('soon')
    expect(dueBucket('2026-10-07', AS_OF, 7)).toBe('soon')
    expect(dueBucket('2026-10-08', AS_OF, 7)).toBe('later')
    expect(dueBucket('2026-10-08', AS_OF, 14)).toBe('soon')
    expect(dueBucket(undefined, AS_OF, 7)).toBe('none')
    expect(dueBucketLabel('soon', 14)).toBe('Due within 14 d')
  })
})

describe('marks', () => {
  it('handle, snooze until a time, end a snooze on its own, and reopen', () => {
    let m: Marks = {}
    m = withHandled(m, ['a'], NOW)
    m = withSnoozed(m, ['b'], NOW, 7)
    expect(statusOf('a', m, NOW)).toMatchObject({ state: 'handled' })
    expect(statusOf('b', m, NOW + 6 * DAY)).toMatchObject({
      state: 'snoozed',
      until: '2026-10-11T12:00:00.000Z',
    })
    expect(statusOf('b', m, NOW + 7 * DAY)).toEqual({ state: 'open' })
    expect(statusOf('c', m, NOW)).toEqual({ state: 'open' })
    m = withReopened(m, ['a'])
    expect(statusOf('a', m, NOW)).toEqual({ state: 'open' })
  })

  it('undo puts back exactly what was there, including nothing', () => {
    const before: Marks = withHandled({}, ['a'], NOW)
    const snap = snapshotOf(before, ['a', 'b'])
    const after = withSnoozed(before, ['a', 'b'], NOW, 3)
    expect(withSnapshot(after, snap)).toEqual(before)
  })

  it('read back only valid, recent marks of this version', () => {
    const good = withSnoozed(withHandled({}, ['a'], NOW), ['b'], NOW, 7)
    expect(parseMarks(serializeMarks(good), NOW)).toEqual(good)
    expect(parseMarks(null, NOW)).toEqual({})
    expect(parseMarks('{bad json', NOW)).toEqual({})
    expect(parseMarks(JSON.stringify({ version: 99, marks: good }), NOW)).toEqual({})
    const messy = {
      version: 1,
      marks: {
        ok: { state: 'handled', at: '2026-10-01T00:00:00.000Z' },
        old: { state: 'handled', at: '2025-01-01T00:00:00.000Z' },
        ended: { state: 'snoozed', at: '2026-09-01T00:00:00.000Z', until: '2026-09-08T00:00:00.000Z' },
        broken: { state: 'snoozed', at: '2026-10-01T00:00:00.000Z' },
        odd: { state: 'done', at: '2026-10-01T00:00:00.000Z' },
      },
    }
    expect(Object.keys(parseMarks(JSON.stringify(messy), NOW))).toEqual(['ok'])
  })

  it('survive a storage that is missing or throws', () => {
    const map = new Map<string, string>()
    const store: StorageLike = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    }
    const m = withHandled({}, ['a'], NOW)
    expect(saveMarks(m, store)).toBe(true)
    expect(loadMarks(store, NOW)).toEqual(m)
    // Nothing marked: the key goes, so a clean browser stays clean.
    expect(saveMarks({}, store)).toBe(true)
    expect(map.has(STORAGE_KEY)).toBe(false)
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(saveMarks(m, broken)).toBe(false)
    expect(loadMarks(broken, NOW)).toEqual({})
    expect(saveMarks(m, null)).toBe(false)
    expect(loadMarks(null, NOW)).toEqual({})
  })
})

describe('filters', () => {
  const items = [
    open({
      ownerRole: 'manager',
      severity: 'critical',
      due: '2026-09-20',
      view: 'recruiting',
      what: 'Scorecards are not in',
    }),
    open(
      { ownerRole: 'hrbp', ownerId: 'E9', ownerName: 'Rita Rao', severity: 'warning', due: '2026-10-03' },
      {
        team: 'org',
      },
    ),
    open(
      { ownerRole: 'it', ownerId: null, ownerName: 'IT', severity: 'info', due: null, view: 'onboarding' },
      { team: 'other', isTeam: true },
    ),
  ]

  it('narrow by owner group, severity, due, view, who it waits on and words', () => {
    const f = (patch: Partial<typeof NO_FILTERS>) =>
      filterActions(items, { ...NO_FILTERS, ...patch }, AS_OF, 7)
    expect(f({})).toHaveLength(3)
    expect(f({ roles: ['hrbp', 'it'] }).map((a) => a.role)).toEqual(['hrbp', 'it'])
    expect(f({ severities: ['critical'] })).toHaveLength(1)
    expect(f({ due: ['overdue'] }).map((a) => a.item.due)).toEqual(['2026-09-20'])
    expect(f({ due: ['soon', 'none'] })).toHaveLength(2)
    expect(f({ views: ['onboarding'] })).toHaveLength(1)
    expect(f({ waitingOn: 'org' }).map((a) => a.ownerName)).toEqual(['Sam Lee', 'Rita Rao'])
    expect(f({ query: 'scorecards sam' })).toHaveLength(1)
    expect(f({ query: 'rita' })).toHaveLength(1)
    expect(isFiltering(NO_FILTERS)).toBe(false)
    expect(isFiltering({ ...NO_FILTERS, query: ' x ' })).toBe(true)
  })
})

describe('grouping by owner', () => {
  it('follows the owner-group order and puts the most pressing owner first', () => {
    const items = [
      open({ ownerRole: 'hrbp', ownerId: 'E9', ownerName: 'Rita Rao' }),
      open({ ownerId: 'E2', ownerName: 'Sam Lee', severity: 'warning', due: '2026-10-10' }),
      open({ ownerId: 'E2', ownerName: 'Sam Lee', severity: 'warning', due: '2026-09-01' }),
      open({ ownerId: 'E10', ownerName: 'Tom Fox', severity: 'critical', due: null }),
      // The same person owns an HRBP item too: one owner, a block in each group.
      open({ ownerRole: 'hrbp', ownerId: 'E10', ownerName: 'Tom Fox' }),
    ]
    const groups = groupByOwner(items, AS_OF)
    expect(groups.map((g) => g.label)).toEqual(['Managers', 'HR business partners'])
    const managers = groups[0]
    expect(managers.owners.map((b) => b.name)).toEqual(['Tom Fox', 'Sam Lee'])
    expect(managers.owners[1]).toMatchObject({ overdue: 1, critical: 0, worst: 'warning' })
    // Inside an owner: most severe, then earliest due.
    expect(managers.owners[1].items.map((a) => a.item.due)).toEqual(['2026-09-01', '2026-10-10'])
    expect(managers).toMatchObject({ overdue: 1, critical: 1 })
    expect(ownerCount(items)).toBe(3)
  })
})
