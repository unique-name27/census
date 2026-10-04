import { describe, expect, it } from 'vitest'
import { metricsWith } from '@/metrics/testing'
import { DEFAULTS, M } from '../metrics'
import { isShareFormat, judge, missSeverity, watchMargin, watchMargins } from './status'

const m = { share: 0.05, relative: 0.1 }

describe('judge', () => {
  it('is Met when the value meets the target, either way round', () => {
    expect(judge(0.96, { value: 0.95, comparator: '>=' }, 'pct', m)).toEqual({
      status: 'met',
      gap: 0,
      margin: 0.05,
    })
    expect(judge(0.95, { value: 0.95, comparator: '>=' }, 'pct', m).status).toBe('met')
    expect(judge(40, { value: 45, comparator: '<=' }, 'days', m).status).toBe('met')
    expect(judge(0.019, { value: 0.02, comparator: '<' }, 'pct', m).status).toBe('met')
  })

  it('is Watch within the margin: points for shares, a share of the target for other units', () => {
    // 91% against at least 95%: 4 pts short, inside 5 pts.
    const share = judge(0.91, { value: 0.95, comparator: '>=' }, 'pct', m)
    expect(share.status).toBe('watch')
    expect(share.gap).toBeCloseTo(0.04)
    // 48 d against at most 45 d: 3 d over, inside 4.5 d (10% of 45).
    expect(judge(48, { value: 45, comparator: '<=' }, 'days', m)).toMatchObject({
      status: 'watch',
      margin: 4.5,
    })
    // A score of 3.90 against at least 4.20: 0.30 short, inside 0.42.
    expect(judge(3.9, { value: 4.2, comparator: '>=' }, 'num2', m).status).toBe('watch')
  })

  it('is Missed at or beyond the margin', () => {
    expect(judge(0.9, { value: 0.95, comparator: '>=' }, 'pct', m).status).toBe('missed')
    expect(judge(52, { value: 45, comparator: '<=' }, 'days', m)).toMatchObject({ status: 'missed', gap: 7 })
    // A zero target has no room: one person working without a license is Missed.
    expect(judge(1, { value: 0, comparator: '<=' }, 'int', m)).toMatchObject({ status: 'missed', margin: 0 })
  })

  it('treats a value exactly on an "under" target as a miss by nothing', () => {
    expect(judge(0.02, { value: 0.02, comparator: '<' }, 'pct', m)).toMatchObject({ status: 'watch', gap: 0 })
    expect(judge(0.02, { value: 0.02, comparator: '<' }, 'pct', { share: 0, relative: 0 }).status).toBe(
      'missed',
    )
  })

  it('says No target without one, and nothing without a value', () => {
    expect(judge(31, null, 'int', m)).toEqual({ status: 'none', gap: null, margin: null })
    expect(judge(null, { value: 1, comparator: '>=' }, 'pct', m).status).toBe('unknown')
    expect(judge(Number.NaN, { value: 1, comparator: '>=' }, 'pct', m).status).toBe('unknown')
  })
})

describe('watch margins', () => {
  it('reads both margins from the dictionary', () => {
    expect(watchMargins(metricsWith({}))).toEqual({
      share: DEFAULTS.shareMargin,
      relative: DEFAULTS.relativeMargin,
    })
    const wide = watchMargins(metricsWith({ [M.watch]: { shareMargin: 0.1, relativeMargin: 0.2 } }))
    expect(wide).toEqual({ share: 0.1, relative: 0.2 })
    expect(judge(0.9, { value: 0.95, comparator: '>=' }, 'pct', wide).status).toBe('watch')
    expect(judge(52, { value: 45, comparator: '<=' }, 'days', wide).status).toBe('watch')
  })

  it('uses points for shares and differences in points only', () => {
    for (const f of ['pct', 'pct0', 'pct2', 'pts', 'pts2'] as const) expect(isShareFormat(f), f).toBe(true)
    for (const f of ['days', 'int', 'num2', 'ratio'] as const) expect(isShareFormat(f), f).toBe(false)
    expect(watchMargin({ value: -20, comparator: '>=' }, 'int', m)).toBe(2)
  })

  it('ranks misses by how far past the margin they are', () => {
    const near = judge(0.89, { value: 0.95, comparator: '>=' }, 'pct', m)
    const far = judge(0.5, { value: 0.95, comparator: '>=' }, 'pct', m)
    const noRoom = judge(1, { value: 0, comparator: '<=' }, 'int', m)
    expect(missSeverity(far)).toBeGreaterThan(missSeverity(near))
    expect(missSeverity(noRoom)).toBe(Number.POSITIVE_INFINITY)
    expect(missSeverity(judge(0.96, { value: 0.95, comparator: '>=' }, 'pct', m))).toBe(0)
  })
})
