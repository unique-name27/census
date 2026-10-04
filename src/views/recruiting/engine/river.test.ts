import { describe, expect, it } from 'vitest'
import { STAGES } from '@/data/schema'
import type { Flow, StageFlow } from './flow'
import { type RiverLabel, riverLayout } from './river'

/** Deterministic text width: 0.56 em per character. */
const measure = (text: string, size: number) => text.length * size * 0.56

function stage(i: number, v: Partial<StageFlow>): StageFlow {
  const s = {
    stage: i,
    entered: 0,
    advanced: 0,
    rejected: 0,
    withdrawn: 0,
    declined: 0,
    active: 0,
    resolved: 0,
    pass: null,
    medianDays: null,
    nDays: 0,
    priorMedianDays: null,
    deltaDays: null,
    ...v,
  }
  return { ...s, resolved: s.advanced + s.rejected + s.withdrawn + s.declined }
}

const FLOW: Flow = {
  stages: [
    stage(0, {
      entered: 5370,
      advanced: 2001,
      active: 220,
      rejected: 2998,
      withdrawn: 151,
      pass: 0.39,
      medianDays: 4,
    }),
    stage(1, {
      entered: 2001,
      advanced: 1078,
      active: 106,
      rejected: 723,
      withdrawn: 94,
      pass: 0.57,
      medianDays: 7,
    }),
    stage(2, {
      entered: 1078,
      advanced: 664,
      active: 61,
      rejected: 309,
      withdrawn: 44,
      pass: 0.65,
      medianDays: 8,
    }),
    stage(3, {
      entered: 664,
      advanced: 321,
      active: 59,
      rejected: 268,
      withdrawn: 16,
      pass: 0.53,
      medianDays: 9,
    }),
    stage(4, { entered: 321, advanced: 249, active: 11, declined: 61, pass: 0.8, medianDays: 4 }),
  ],
  hired: 249,
  total: 5370,
  left: { rejected: 4298, withdrawn: 305, declined: 61 },
  active: 457,
}

function box(l: RiverLabel) {
  const w = measure(l.text, l.size) + (l.tracking ?? 0) * l.text.length
  const x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2
  return { x0, x1: x0 + w, y0: l.y - l.size * 0.78, y1: l.y + l.size * 0.24 }
}

describe('riverLayout', () => {
  it.each([320, 375, 640, 900, 1100, 1400])('keeps every label on the canvas and apart at %ipx', (width) => {
    const L = riverLayout(FLOW, STAGES, width, measure)
    const boxes = L.labels.map(box)
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(-0.5)
      expect(b.x1).toBeLessThanOrEqual(L.width + 0.5)
      expect(b.y0).toBeGreaterThanOrEqual(0)
      expect(b.y1).toBeLessThanOrEqual(L.height)
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const hit = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
        expect(hit, `${L.labels[i].text} / ${L.labels[j].text}`).toBe(false)
      }
    // Every stage keeps its name and count.
    expect(L.labels.filter((l) => l.role === 'kicker')).toHaveLength(6)
    expect(L.labels.filter((l) => l.role === 'count')).toHaveLength(6)
  })

  it('switches to two label rows when names would collide', () => {
    expect(riverLayout(FLOW, STAGES, 375, measure).twoRows).toBe(true)
    expect(riverLayout(FLOW, STAGES, 1200, measure).twoRows).toBe(false)
  })

  it('draws one ribbon per non-empty flow and scales nodes to the cohort', () => {
    const L = riverLayout(FLOW, STAGES, 1200, measure)
    expect(L.ribbons.filter((r) => r.kind === 'advanced')).toHaveLength(5)
    expect(L.ribbons.filter((r) => r.kind === 'active')).toHaveLength(5)
    expect(L.ribbons.filter((r) => r.kind === 'declined')).toHaveLength(1)
    expect(L.ribbons.every((r) => !/NaN|Infinity/.test(r.d))).toBe(true)
    const [applied, screen] = L.nodes
    expect(screen.h / applied.h).toBeCloseTo(2001 / 5370, 1)
    expect(L.band).not.toBeNull()
    expect(L.fades).toHaveLength(5)
  })

  it.each([375, 1200])('points every number label at the part of the flow it counts at %ipx', (width) => {
    const L = riverLayout(FLOW, STAGES, width, measure)
    const counted = (t: NonNullable<RiverLabel['target']>): number => {
      if (t.kind === 'node') return t.stage === 5 ? FLOW.hired : FLOW.stages[t.stage].entered
      const s = FLOW.stages[t.stage]
      return t.kind === 'left' ? s.rejected + s.withdrawn + s.declined : s[t.kind]
    }
    for (const l of L.labels) {
      if (l.role === 'note') {
        expect(l.target).toEqual({ kind: 'node', stage: 5 })
        continue
      }
      expect(l.target, l.id).toBeDefined()
      // A label that leads with a count (not a pass rate) shows the number its drill lists.
      const lead = /^([\d,]+)(?![\d,%])/.exec(l.text)
      if (lead && l.role !== 'kicker')
        expect(Number(lead[1].replace(/,/g, '')), l.id).toBe(counted(l.target!))
    }
    // Exit lines name their own outcome.
    for (const l of L.labels.filter((x) => x.role === 'exit'))
      expect(l.text.endsWith(l.target!.kind) || l.text.endsWith('left')).toBe(true)
  })

  it('handles an empty cohort without NaN', () => {
    const empty: Flow = {
      stages: [0, 1, 2, 3, 4].map((i) => stage(i, {})),
      hired: 0,
      total: 0,
      left: { rejected: 0, withdrawn: 0, declined: 0 },
      active: 0,
    }
    const L = riverLayout(empty, STAGES, 800, measure)
    expect(L.ribbons).toHaveLength(0)
    expect(L.band).toBeNull()
    expect(Number.isFinite(L.height)).toBe(true)
  })
})
