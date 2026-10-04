import { describe, expect, it } from 'vitest'
import { type DiagramSpec, fitScale, fitText, layoutDiagram, ribbonPath } from './diagram'

/** 6 px per character, bold or not: predictable widths for the layout. */
const measure = (text: string) => text.length * 6

const spec: DiagramSpec = {
  columns: ['Business unit', 'Department'],
  nodes: [
    { id: 'u:A', column: 0, label: 'Alpha', value: 100 },
    { id: 'u:B', column: 0, label: 'Beta', value: 20 },
    { id: 'd:1', column: 1, label: 'One', value: 60 },
    { id: 'd:2', column: 1, label: 'Two', value: 50, flag: 'warning' },
    { id: 'd:3', column: 1, label: 'Three', value: 10 },
  ],
  links: [
    { id: 'A>1', source: 'u:A', target: 'd:1', value: 60 },
    { id: 'A>2', source: 'u:A', target: 'd:2', value: 40 },
    { id: 'B>2', source: 'u:B', target: 'd:2', value: 10, flag: 'warning' },
    { id: 'B>3', source: 'u:B', target: 'd:3', value: 10 },
    { id: 'bad', source: 'u:A', target: 'd:missing', value: 5 },
  ],
}

describe('fitText', () => {
  it('keeps text that fits and shortens text that does not', () => {
    expect(fitText('Firmware', 60, measure, 12)).toBe('Firmware')
    const short = fitText('Design Verification', 60, measure, 12)
    expect(short.endsWith('…')).toBe(true)
    expect(measure(short)).toBeLessThanOrEqual(60)
  })
})

describe('fitScale', () => {
  it('finds the largest scale that keeps every column under the target', () => {
    const k = fitScale(
      [
        [100, 20],
        [60, 50, 10],
      ],
      10,
      4,
      200,
    )
    const h = (vals: number[]) => vals.reduce((s, v) => s + Math.max(10, v * k), 0) + (vals.length - 1) * 4
    expect(h([100, 20])).toBeLessThanOrEqual(200.01)
    expect(h([60, 50, 10])).toBeLessThanOrEqual(200.01)
    expect(Math.max(h([100, 20]), h([60, 50, 10]))).toBeGreaterThan(195)
  })

  it('grows past the target when the minimum heights alone overflow it', () => {
    const many = Array.from({ length: 40 }, () => 1)
    const k = fitScale([many], 16, 6, 200)
    expect(k).toBeGreaterThan(0)
  })

  it('is zero when there is nothing to size', () => {
    expect(fitScale([[0, 0]], 16, 6, 200)).toBe(0)
  })
})

describe('ribbonPath', () => {
  it('draws a closed ribbon between the two ends', () => {
    const d = ribbonPath(10, 20, 110, 60, 5)
    expect(d.startsWith('M10,20C60,20 60,60 110,60L110,65')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })
})

describe('layoutDiagram', () => {
  const layout = layoutDiagram(spec, { width: 600, measure, maxHeight: 240, minNodeHeight: 14, gap: 6 })

  it('stacks nodes in their given order within each column', () => {
    const col1 = layout.nodes.filter((n) => n.column === 1)
    expect(col1.map((n) => n.id)).toEqual(['d:1', 'd:2', 'd:3'])
    for (let i = 1; i < col1.length; i++)
      expect(col1[i].y).toBeGreaterThanOrEqual(col1[i - 1].y + col1[i - 1].h)
  })

  it('labels the first column on the left and the last on the right', () => {
    const a = layout.nodes.find((n) => n.id === 'u:A')!
    const one = layout.nodes.find((n) => n.id === 'd:1')!
    expect(a.caption.anchor).toBe('end')
    expect(a.caption.x).toBeLessThan(a.x)
    expect(one.caption.anchor).toBe('start')
    expect(one.caption.x).toBeGreaterThan(one.x + one.w)
    expect(one.caption.value).toBe('60')
    expect(layout.columns.map((c) => c.title)).toEqual(['Business unit', 'Department'])
  })

  it('sizes nodes and ribbons by headcount and keeps flags', () => {
    const a = layout.nodes.find((n) => n.id === 'u:A')!
    const b = layout.nodes.find((n) => n.id === 'u:B')!
    expect(a.h / b.h).toBeCloseTo(5, 0)
    const a1 = layout.links.find((l) => l.id === 'A>1')!
    const a2 = layout.links.find((l) => l.id === 'A>2')!
    expect(a1.thickness / a2.thickness).toBeCloseTo(1.5, 1)
    expect(layout.links.find((l) => l.id === 'B>2')?.flag).toBe('warning')
  })

  it('drops links to nodes that do not exist', () => {
    expect(layout.links.some((l) => l.id === 'bad')).toBe(false)
  })

  it('stacks ribbons inside their nodes without overlapping', () => {
    const into2 = layout.links.filter((l) => l.target === 'd:2').sort((x, y) => x.ty - y.ty)
    const two = layout.nodes.find((n) => n.id === 'd:2')!
    expect(into2.map((l) => l.id)).toEqual(['A>2', 'B>2'])
    expect(into2[1].ty).toBeCloseTo(into2[0].ty + into2[0].thickness, 0)
    expect(into2[0].ty).toBeGreaterThanOrEqual(two.y - 0.1)
    expect(into2[1].ty + into2[1].thickness).toBeLessThanOrEqual(two.y + two.h + 0.1)
    const fromA = layout.links.filter((l) => l.source === 'u:A').sort((x, y) => x.sy - y.sy)
    expect(fromA.map((l) => l.id)).toEqual(['A>1', 'A>2'])
  })

  it('fits the height target and stays inside the width', () => {
    expect(layout.height).toBeLessThanOrEqual(240 + 22 + 3)
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x + n.w).toBeLessThanOrEqual(600)
      expect(Number.isFinite(n.y + n.h)).toBe(true)
    }
  })

  it('places middle columns between the outer ones', () => {
    const three = layoutDiagram(
      {
        columns: ['Location', 'Country', 'Region'],
        nodes: [
          { id: 'l', column: 0, label: 'San Jose', value: 5 },
          { id: 'c', column: 1, label: 'United States', value: 5 },
          { id: 'r', column: 2, label: 'Americas', value: 5 },
        ],
        links: [
          { id: 'l>c', source: 'l', target: 'c', value: 5 },
          { id: 'c>r', source: 'c', target: 'r', value: 5 },
        ],
      },
      { width: 500, measure },
    )
    const [l, c, r] = ['l', 'c', 'r'].map((id) => three.nodes.find((n) => n.id === id)!)
    expect(l.x).toBeLessThan(c.x)
    expect(c.x).toBeLessThan(r.x)
    expect(c.caption.anchor).toBe('start')
  })
})
