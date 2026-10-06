/**
 * What a link (or a saved view) can't set (docs/FILTERS.md, parts 1 to 3): custom periods the
 * period control would refuse, and an exclude mode with no values that the address can't carry.
 */
import { describe, expect, it } from 'vitest'
import { filterChips } from '@/components/filterLabels'
import { isCalendarDate } from '@/lib/dates'
import { DEFAULT_FILTERS, dropIdleModes, type Filters, normalizeFilters, sameFilters } from './scope'
import {
  checkScope,
  DEFAULT_SCOPE,
  hashWithScope,
  periodMessage,
  readScope,
  type ScopeVocabulary,
  splitHash,
  type UrlScope,
} from './urlScope'

const f = (patch: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })
const scope = (patch: Partial<Filters> = {}): UrlScope => ({ ...DEFAULT_SCOPE, filters: f(patch) })
const vocab: ScopeVocabulary = { hasLeader: (id) => id === 'E1', hasValue: () => true, asOf: '2026-09-30' }

describe('custom periods in a link', () => {
  it('are real calendar dates', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true)
    expect(isCalendarDate('2024-02-29')).toBe(true)
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('2026-9-30')).toBe(false)
    expect(isCalendarDate('2026-09-30T10:00')).toBe(false)
    const r = readScope('period=custom&from=2026-02-30&to=2026-03-31')
    expect(r.unreadable).toEqual(['custom dates'])
    expect(r.scope.filters.period).toBe('t12m')
    expect(r.scope.filters.customStart).toBeNull()
  })

  it('end on the reporting date at the latest: a later end is cut to it, and the toast says so', () => {
    const read = readScope('period=custom&from=2026-01-01&to=2030-12-31')
    expect(read.unreadable).toEqual([])
    const r = checkScope(read.scope, vocab)
    expect(r.scope.filters).toMatchObject({
      period: 'custom',
      customStart: '2026-01-01',
      customEnd: '2026-09-30',
    })
    expect(r.period).toEqual({ kind: 'clamped', asOf: '2026-09-30' })
    expect(periodMessage(r.period ?? { kind: 'dates' })).toBe(
      "The link's custom period ends after the reporting date, 30 Sep 2026, so it ends there instead.",
    )
  })

  it('that start after the reporting date give way to the default period', () => {
    const r = checkScope(readScope('period=custom&from=2027-01-01&to=2027-03-31').scope, vocab)
    expect(r.scope.filters).toMatchObject({ period: 't12m', customStart: null, customEnd: null })
    expect(r.period).toEqual({ kind: 'after', asOf: '2026-09-30' })
    expect(periodMessage(r.period ?? { kind: 'dates' }, "The view's")).toBe(
      "The view's custom period starts after the reporting date, 30 Sep 2026, so the default period was used.",
    )
  })

  it('in a saved view or a settings file are checked the same way', () => {
    // A view saved before this check, with a date that is not one: no custom dates are kept.
    const n = normalizeFilters({ period: 'custom', customStart: '2026-02-30', customEnd: '2026-03-31' })
    expect(n).toMatchObject({ period: 'custom', customStart: null, customEnd: null })
    expect(
      normalizeFilters({ period: 'custom', customStart: '2026-05-01', customEnd: '2026-01-01' }).customStart,
    ).toBeNull()
    const r = checkScope({ ...DEFAULT_SCOPE, filters: n }, vocab)
    expect(r.period).toEqual({ kind: 'dates' })
    expect(r.scope.filters.period).toBe('t12m')
    expect(periodMessage({ kind: 'dates' })).toBe(
      "The link's custom dates could not be read, so the default period was used.",
    )
  })

  it('a valid custom period inside the data is applied as it is', () => {
    const s = readScope('period=custom&from=2026-01-01&to=2026-06-30').scope
    const r = checkScope(s, vocab)
    expect(r.period).toBeNull()
    expect(r.scope).toBe(s)
  })
})

describe('an exclude mode with no values', () => {
  it('is dropped, like the address drops it, so the address round-trips what is on screen', () => {
    expect(dropIdleModes(f({ modes: { department: 'exclude' } })).modes).toEqual({})
    const kept = f({ location: ['Bengaluru'], modes: { location: 'exclude', level: 'exclude' } })
    expect(dropIdleModes(kept).modes).toEqual({ location: 'exclude' })
    const clean = f({ location: ['Bengaluru'], modes: { location: 'exclude' } })
    expect(dropIdleModes(clean)).toBe(clean)
    // A link naming a dimension to exclude without values.
    expect(readScope('not=dept&loc=Hsinchu').scope.filters.modes).toEqual({})
  })

  it('goes when a link’s only excluded leader is left out', () => {
    const r = checkScope(readScope('leader=E99999&not=leader').scope, vocab)
    expect(r.scope.filters.leaderId).toBeNull()
    expect(r.scope.filters.modes).toEqual({})
    expect(r.leftOut).toEqual([{ dim: 'leaderId', value: 'E99999' }])
  })

  it('goes with the last excluded chip', () => {
    const two = f({ department: ['Architecture', 'Digital Design'], modes: { department: 'exclude' } })
    const [first] = filterChips(two, () => undefined)
    expect(first.remove).toEqual({ department: ['Digital Design'] })
    const one = { ...two, ...first.remove }
    const [last] = filterChips(one, () => undefined)
    const after = normalizeFilters({ ...one, ...last.remove })
    expect(after.modes).toEqual({})
    expect(hashWithScope('hrbp.overview', { ...DEFAULT_SCOPE, filters: after })).toBe('#hrbp.overview')
    // The leader chip too.
    const leader = f({ leaderId: 'E1', modes: { leaderId: 'exclude' } })
    const [chip] = filterChips(leader, () => 'Allison Carter')
    expect(chip.label).toBe("Not in Allison Carter's org")
    expect(chip.value).toBe("Allison Carter's org")
    expect(normalizeFilters({ ...leader, ...chip.remove }).modes).toEqual({})
    expect(filterChips(leader, () => undefined)[0].label).toBe("Not in the leader's org")
  })

  it('reads back from the address as what was written', () => {
    const s = scope({ level: ['L1'], modes: { level: 'exclude', department: 'exclude' } })
    const back = readScope(splitHash(hashWithScope('hrbp', s)).query).scope
    expect(back.filters.modes).toEqual({ level: 'exclude' })
    expect(sameFilters(back.filters, s.filters)).toBe(true)
  })
})
