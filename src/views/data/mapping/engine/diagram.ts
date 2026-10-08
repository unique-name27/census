/**
 * Layout for the column mapping diagrams (business unit → department, location → country →
 * region, job family → job function → job title): nodes stacked in columns, sized by active
 * headcount, joined by ribbons as thick as the people they carry. Pure: text is measured by the
 * function passed in, so the layout is tested without a browser.
 */

export type DiagramFlag = 'warning' | null

export interface DiagramNodeInput {
  /** Unique across the diagram. */
  id: string
  column: number
  label: string
  /** Active headcount behind the node. */
  value: number
  /** Part of a conflict: drawn with a warning glyph. */
  flag?: DiagramFlag
}

export interface DiagramLinkInput {
  id: string
  source: string
  target: string
  value: number
  flag?: DiagramFlag
}

export interface DiagramSpec {
  /** Column titles, left to right. */
  columns: readonly string[]
  /** Nodes in the order they are stacked within their column. */
  nodes: readonly DiagramNodeInput[]
  links: readonly DiagramLinkInput[]
}

export type Measure = (text: string, size: number, weight?: number) => number

export interface DiagramOptions {
  width: number
  measure: Measure
  nodeWidth?: number
  gap?: number
  /** Every node is at least this tall, so its label fits beside it. */
  minNodeHeight?: number
  /** Height the tallest column aims for; a column of many small nodes may need more. */
  maxHeight?: number
  labelSize?: number
  /** Room above the nodes for the column titles. */
  header?: number
  /** How far past the minimum heights a crowded column may grow, as a share (default 0.25). */
  growth?: number
}

export interface NodeLabel {
  x: number
  y: number
  anchor: 'start' | 'end'
  /** The label, shortened with an ellipsis when it does not fit. */
  text: string
  value: string
}

export interface PlacedNode extends DiagramNodeInput {
  x: number
  y: number
  w: number
  h: number
  caption: NodeLabel
  /** The label was shortened. */
  truncated: boolean
}

export interface PlacedLink extends DiagramLinkInput {
  d: string
  thickness: number
  /** Top of the ribbon at its source and at its target. */
  sy: number
  ty: number
  x0: number
  x1: number
}

export interface DiagramLayout {
  width: number
  height: number
  nodes: PlacedNode[]
  links: PlacedLink[]
  columns: { title: string; x: number; anchor: 'start' | 'end' }[]
  /** Pixels per person. */
  scale: number
}

/** Room beside a flagged node's label for its warning diamond. */
export const FLAG_ROOM = 13

const round = (n: number) => Math.round(n * 10) / 10
const intText = (n: number) => n.toLocaleString('en-US')

/** Shorten `text` with an ellipsis to fit `max` px. */
export function fitText(text: string, max: number, measure: Measure, size: number): string {
  if (measure(text, size) <= max) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (measure(`${text.slice(0, mid).trimEnd()}…`, size) <= max) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? `${text.slice(0, lo).trimEnd()}…` : '…'
}

/** Height of a column at `scale` px per person. */
function columnHeight(values: readonly number[], scale: number, minH: number, gap: number): number {
  let h = Math.max(0, values.length - 1) * gap
  for (const v of values) h += Math.max(minH, v * scale)
  return h
}

/**
 * The largest scale (px per person) at which no column is taller than `target`. When even the
 * minimum node heights overflow, the target grows past them (a quarter by default) so sizes
 * still differ.
 */
export function fitScale(
  columns: readonly (readonly number[])[],
  minH: number,
  gap: number,
  target: number,
  growth = 0.25,
): number {
  const floor = Math.max(0, ...columns.map((c) => columnHeight(c, 0, minH, gap)))
  const goal = Math.max(target, floor * (1 + growth))
  const maxV = Math.max(0, ...columns.flat())
  if (maxV <= 0) return 0
  let lo = 0
  let hi = goal / maxV
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const tallest = Math.max(...columns.map((c) => columnHeight(c, mid, minH, gap)))
    if (tallest <= goal) lo = mid
    else hi = mid
  }
  return lo
}

/** A ribbon from (x0, sy) to (x1, ty), `t` thick at both ends. */
export function ribbonPath(x0: number, sy: number, x1: number, ty: number, t: number): string {
  const xm = round((x0 + x1) / 2)
  const [a, b, c, d, e] = [x0, sy, x1, ty, t].map(round)
  return `M${a},${b}C${xm},${b} ${xm},${d} ${c},${d}L${c},${round(d + e)}C${xm},${round(d + e)} ${xm},${round(b + e)} ${a},${round(b + e)}Z`
}

export function layoutDiagram(spec: DiagramSpec, opts: DiagramOptions): DiagramLayout {
  const {
    width,
    measure,
    nodeWidth = 8,
    gap = 6,
    minNodeHeight = 16,
    maxHeight = 520,
    labelSize = 12,
    header = 22,
    growth = 0.25,
  } = opts
  const C = Math.max(1, spec.columns.length)
  const byColumn: DiagramNodeInput[][] = Array.from({ length: C }, () => [])
  for (const n of spec.nodes) byColumn[Math.min(C - 1, Math.max(0, n.column))].push(n)

  // Label room: the first column's labels sit left of its bars, every other column's to the right.
  const labelGap = 6
  const valueGap = 5
  const flagRoom = (n: DiagramNodeInput) => (n.flag ? FLAG_ROOM : 0)
  const textOf = (n: DiagramNodeInput) =>
    measure(n.label, labelSize) + valueGap + measure(intText(n.value), labelSize, 600) + flagRoom(n)
  const widest = (col: DiagramNodeInput[]) => Math.max(0, ...col.map(textOf))
  const leftRoom = C > 1 ? Math.min(widest(byColumn[0]), width * (C > 2 ? 0.26 : 0.34)) : 0
  const rightRoom = Math.min(widest(byColumn[C - 1]), width * (C > 2 ? 0.3 : 0.38))
  const x0 = leftRoom + labelGap
  const xLast = Math.max(x0 + nodeWidth, width - rightRoom - labelGap - nodeWidth)
  const colX = (c: number) => (C === 1 ? x0 : x0 + ((xLast - x0) * c) / (C - 1))

  const scale = fitScale(
    byColumn.map((col) => col.map((n) => n.value)),
    minNodeHeight,
    gap,
    maxHeight,
    growth,
  )
  const heights = byColumn.map((col) =>
    columnHeight(
      col.map((n) => n.value),
      scale,
      minNodeHeight,
      gap,
    ),
  )
  const bodyH = Math.max(minNodeHeight, ...heights)

  const placed = new Map<string, PlacedNode>()
  const nodes: PlacedNode[] = []
  byColumn.forEach((col, c) => {
    let y = header + (bodyH - heights[c]) / 2
    const x = colX(c)
    const left = C > 1 && c === 0
    // Middle columns may not run past the next column's bars.
    const room =
      c === 0 ? leftRoom : c === C - 1 ? rightRoom : Math.max(40, colX(c + 1) - x - nodeWidth - labelGap * 2)
    for (const n of col) {
      const h = Math.max(minNodeHeight, n.value * scale)
      const value = intText(n.value)
      const textRoom = Math.max(12, room - valueGap - measure(value, labelSize, 600) - flagRoom(n))
      const text = fitText(n.label, textRoom, measure, labelSize)
      const p: PlacedNode = {
        ...n,
        x: round(x),
        y: round(y),
        w: nodeWidth,
        h: round(h),
        truncated: text !== n.label,
        caption: {
          x: round(left ? x - labelGap : x + nodeWidth + labelGap),
          y: round(y + h / 2),
          anchor: left ? 'end' : 'start',
          text,
          value,
        },
      }
      placed.set(n.id, p)
      nodes.push(p)
      y += h + gap
    }
  })

  // Stack each node's ribbons in the order of the nodes at their other end, centered on the node.
  const thick = (v: number) => Math.max(1, v * scale)
  const links = spec.links.filter((l) => placed.has(l.source) && placed.has(l.target))
  const out = new Map<string, DiagramLinkInput[]>()
  const into = new Map<string, DiagramLinkInput[]>()
  for (const l of links) {
    const o = out.get(l.source) ?? []
    o.push(l)
    out.set(l.source, o)
    const i = into.get(l.target) ?? []
    i.push(l)
    into.set(l.target, i)
  }
  const center = (n: PlacedNode) => n.y + n.h / 2
  const offsets = new Map<string, { sy: number; ty: number }>()
  for (const [id, ls] of out) {
    const n = placed.get(id)!
    ls.sort((a, b) => center(placed.get(a.target)!) - center(placed.get(b.target)!))
    const total = ls.reduce((s, l) => s + thick(l.value), 0)
    let y = n.y + Math.max(0, (n.h - total) / 2)
    for (const l of ls) {
      offsets.set(l.id, { sy: y, ty: 0 })
      y += thick(l.value)
    }
  }
  for (const [id, ls] of into) {
    const n = placed.get(id)!
    ls.sort((a, b) => center(placed.get(a.source)!) - center(placed.get(b.source)!))
    const total = ls.reduce((s, l) => s + thick(l.value), 0)
    let y = n.y + Math.max(0, (n.h - total) / 2)
    for (const l of ls) {
      const o = offsets.get(l.id)!
      o.ty = y
      y += thick(l.value)
    }
  }
  const placedLinks: PlacedLink[] = links.map((l) => {
    const s = placed.get(l.source)!
    const t = placed.get(l.target)!
    const { sy, ty } = offsets.get(l.id)!
    const lx0 = s.x + s.w
    const lx1 = t.x
    const thickness = thick(l.value)
    return {
      ...l,
      sy: round(sy),
      ty: round(ty),
      x0: round(lx0),
      x1: round(lx1),
      thickness: round(thickness),
      d: ribbonPath(lx0, sy, lx1, ty, thickness),
    }
  })

  return {
    width,
    height: Math.ceil(header + bodyH + 2),
    nodes,
    links: placedLinks,
    columns: spec.columns.map((title, c) => {
      const left = C > 1 && c === 0
      return { title, x: round(left ? colX(c) + nodeWidth : colX(c)), anchor: left ? 'end' : 'start' }
    }),
    scale,
  }
}
