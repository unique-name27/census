import { describe, expect, it } from 'vitest'
import { type Box, lineBoxes, MAX_NOTES, NOTE_HEADROOM, placeNotes, shortNote, wrapNote } from './notes'

const area = { x: 40, y: 0, w: 300, h: 200 }

describe('placeNotes', () => {
  it('places a note above its datum with a leader, inside the plot', () => {
    const [n] = placeNotes([{ x: 200, y: 120, text: 'Fell to 68%', width: 60 }], area, [])
    expect(n.from).toEqual({ x: 200, y: 120 })
    expect(n.box.y + n.box.h).toBeLessThan(120)
    expect(n.box.x).toBe(170)
    expect(n.to.x).toBe(200)
  })

  it('slides a label sideways to stay inside the plot', () => {
    const [n] = placeNotes([{ x: 335, y: 120, text: 'Spike', width: 80 }], area, [])
    expect(n.box.x + n.box.w).toBeLessThanOrEqual(area.x + area.w)
  })

  it('goes right or below when above is taken, and drops a note with no free place', () => {
    // Datum near the top: above leaves the area, so it goes to the right.
    const [right] = placeNotes([{ x: 100, y: 10, text: 'Peak', width: 40 }], area, [])
    expect(right.box.x).toBeGreaterThan(100)
    // Everything covered: dropped.
    const none = placeNotes([{ x: 100, y: 100, text: 'Hidden', width: 40 }], area, [area])
    expect(none).toEqual([])
  })

  it('keeps two notes apart and draws at most two', () => {
    const anchors = [0, 1, 2].map((i) => ({ x: 150 + i * 4, y: 150, text: `Note ${i}`, width: 50 }))
    const placed = placeNotes(anchors, area, [])
    expect(placed.length).toBeLessThanOrEqual(MAX_NOTES)
    expect(placed).toHaveLength(2)
    const [a, b] = placed
    const apart =
      a.box.x + a.box.w <= b.box.x ||
      b.box.x + b.box.w <= a.box.x ||
      a.box.y + a.box.h <= b.box.y ||
      b.box.y + b.box.h <= a.box.y
    expect(apart).toBe(true)
  })

  it('keeps labels off a line between its vertices', () => {
    const line = lineBoxes([
      { x: 40, y: 90 },
      { x: 340, y: 90 },
    ])
    const [n] = placeNotes([{ x: 200, y: 120, text: 'Under the line', width: 80 }], area, line)
    // Above would cross the line at y=90 (label box from 86 to 100 for a 20px leader): it moves on.
    for (const b of line)
      expect(
        b.y + b.h < n.box.y || n.box.y + n.box.h < b.y || b.x + b.w < n.box.x || n.box.x + n.box.w < b.x,
      ).toBe(true)
  })
})

/** Boxes overlap (no padding), for checking a placed note against the marks. */
const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * A 24-month column chart the way Columns lays it out: the plot starts under the top margin plus
 * the note headroom, the tallest column is the latest one and reaches the top of the y domain
 * ("48, the most in 24 months", audit A13), and every column is an obstacle from its top down.
 */
function columnsAt(plotW: number) {
  const marginLeft = 32
  const marginTop = 8 + NOTE_HEADROOM
  const height = 260
  const plotH = height - marginTop - 24
  const n = 24
  const step = plotW / n
  const values = Array.from({ length: n }, (_, i) => (i === n - 1 ? 48 : 20 + ((i * 7) % 19)))
  const yOf = (v: number) => marginTop + plotH * (1 - v / 50)
  const bars: Box[] = values.map((v, i) => {
    const cx = marginLeft + step * (i + 0.5)
    const w = step * 0.62
    return { x: cx - w / 2, y: yOf(v) - 2, w, h: yOf(0) - yOf(v) + 2 }
  })
  const last = { x: marginLeft + step * (n - 0.5), y: yOf(48) }
  return { area: { x: marginLeft, y: 0, w: plotW, h: height - 24 }, bars, last }
}

describe('notes on the latest, highest datum', () => {
  for (const plotW of [367, 520]) {
    it(`places a note on the last column at the maximum, ${plotW}px plot`, () => {
      const { area, bars, last } = columnsAt(plotW)
      const text = '48, the most in 24 months'
      const [n] = placeNotes([{ ...last, text, width: text.length * 5.6 }], area, bars)
      expect(n).toBeDefined()
      expect(n.box.x).toBeGreaterThanOrEqual(area.x)
      expect(n.box.x + n.box.w).toBeLessThanOrEqual(area.x + area.w)
      expect(n.box.y).toBeGreaterThanOrEqual(area.y)
      for (const b of bars) expect(hits(n.box, b)).toBe(false)
    })
  }

  it('places a long note on the low last point of a falling line', () => {
    // Offer acceptance by quarter: 8 quarters falling to 68%, in a 5-column sheet.
    const marginTop = 10 + NOTE_HEADROOM
    const area = { x: 36, y: 0, w: 300, h: 200 }
    const pts = [0.84, 0.82, 0.83, 0.8, 0.79, 0.78, 0.74, 0.68].map((v, i) => ({
      x: 36 + (300 * i) / 7,
      y: marginTop + (200 - marginTop) * (1 - (v - 0.6) / 0.3),
    }))
    const text = 'Fell to 68% in Q3 2026, mostly Bengaluru'
    const [n] = placeNotes([{ ...pts[7], text, width: 214 }], area, lineBoxes(pts))
    expect(n).toBeDefined()
    for (const b of lineBoxes(pts)) expect(hits(n.box, b)).toBe(false)
    expect(n.box.x + n.box.w).toBeLessThanOrEqual(area.x + area.w)
  })

  it('wraps a note to two lines when one line does not fit', () => {
    const narrow = { x: 0, y: 0, w: 120, h: 200 }
    const text = 'Fell to 68%, mostly Bengaluru'
    const [n] = placeNotes([{ x: 60, y: 120, text, width: 170 }], narrow, [])
    expect(n.lines).toHaveLength(2)
    expect(n.lines.join(' ')).toBe(text)
    expect(n.box.h).toBe(28)
    expect(n.box.w).toBeLessThanOrEqual(narrow.w)
  })

  it('splits at the space nearest the middle', () => {
    expect(wrapNote('Up 4 in 12 months')).toEqual(['Up 4 in', '12 months'])
    expect(wrapNote('Peak')).toBeNull()
  })
})

describe('shortNote', () => {
  it('cuts a finding headline to the chart note', () => {
    expect(
      shortNote(
        'Offer acceptance fell to 68% in Q3 2026 from 80% in Q2 2026, mostly Bengaluru.',
        'Offer acceptance',
      ),
    ).toBe('Fell to 68% in Q3 2026, mostly Bengaluru')
    expect(shortNote('Resolution within SLA dropped to 81% in September, 9 pts under target.')).toBe(
      'Resolution within SLA dropped to 81% in September',
    )
    expect(
      shortNote('A very long headline that goes on and on without any comma or comparison at all in it.'),
    ).toBeNull()
  })
})
