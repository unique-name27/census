/**
 * Chart layout: which cards are visible for an expansion state, and where each card and connector
 * goes. Pure geometry in CSS pixels, shared by the on-screen chart, the SVG/PNG export and the
 * PowerPoint slides, so all three always match.
 *
 * The layout is the old org chart tool's tidy tree (each subtree is a block, children side by side,
 * the manager centred over its reports) with one change that keeps big teams compact: four or more
 * reports with nothing expanded below them stack in two columns on a spine instead of one long row.
 */
import type { OrgTree } from './tree'

/** A requisition shown as a dashed placeholder card under its hiring manager. */
export interface ReqStub {
  reqId: string
  jobTitle: string
  level: string | null
  openings: number
  openedDate: string
  location: string
}

export type CardKind = 'person' | 'company' | 'req'

export interface VNode {
  id: string
  kind: CardKind
  children: VNode[]
  depth: number
  /** Has reports in the tree that are not shown (collapsed, or cut off by maxDepth). */
  collapsed: boolean
}

/** Id used for a requisition placeholder card. */
export const reqCardId = (reqId: string) => `req:${reqId}`

export interface VisibleOptions {
  /** Open requisitions per hiring manager, shown when that manager is expanded. */
  reqs?: ReadonlyMap<string, readonly ReqStub[]>
  /** Hide everything more than this many levels below the root (slides). */
  maxDepth?: number
}

/** True when a card can open: it has reports, or open reqs when those are shown. */
export function canExpand(
  tree: OrgTree,
  id: string,
  reqs?: ReadonlyMap<string, readonly ReqStub[]>,
): boolean {
  return (tree.children.get(id)?.length ?? 0) > 0 || (reqs?.get(id)?.length ?? 0) > 0
}

/** The visible part of the tree under `rootId` for a set of expanded ids. */
export function visibleTree(
  tree: OrgTree,
  rootId: string,
  expanded: ReadonlySet<string>,
  opts: VisibleOptions = {},
): VNode {
  const kindOf = (id: string): CardKind => (tree.people.has(id) ? 'person' : 'company')
  const build = (id: string, depth: number, seen: Set<string>): VNode => {
    const hasKids = (tree.children.get(id)?.length ?? 0) > 0 || (opts.reqs?.get(id)?.length ?? 0) > 0
    const open = expanded.has(id) && (opts.maxDepth === undefined || depth < opts.maxDepth)
    const node: VNode = { id, kind: kindOf(id), children: [], depth, collapsed: hasKids && !open }
    seen.add(id)
    if (!open) return node
    for (const c of tree.children.get(id) ?? []) {
      if (!seen.has(c)) node.children.push(build(c, depth + 1, seen))
    }
    for (const r of opts.reqs?.get(id) ?? []) {
      node.children.push({
        id: reqCardId(r.reqId),
        kind: 'req',
        children: [],
        depth: depth + 1,
        collapsed: false,
      })
    }
    return node
  }
  return build(rootId, 0, new Set())
}

/** Ids of every card in a visible tree, in pre-order. */
export function visibleIds(root: VNode): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length) {
    const n = stack.pop()!
    out.push(n.id)
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i])
  }
  return out
}

/* ───────── geometry ───────── */

export interface LayoutSizes {
  cardW: number
  cardH: number
  /** Horizontal gap between sibling blocks. */
  gapX: number
  /** Vertical gap between a manager and their reports' row. */
  gapY: number
  /** Vertical gap between rows of a stack. */
  stackGap: number
  /** Distance from the spine to a stacked card's edge. */
  stackIndent: number
  /** Teams of this many leaf reports or more stack instead of forming one long row. */
  stackMin: number
  /** Stack collapsed managers too (slides), not only people without reports (screen). */
  stackCollapsed: boolean
  /**
   * How stacked teams are arranged: 2 = two columns either side of a spine (the screen default);
   * 'grid' = a compact grid inside a team box, about 1.6 columns per row (slides).
   */
  stack: 2 | 'grid'
  /** Padding inside a team box. */
  boxPad: number
}

export const SCREEN_SIZES: LayoutSizes = {
  cardW: 212,
  cardH: 92,
  gapX: 20,
  gapY: 48,
  stackGap: 12,
  stackIndent: 14,
  stackMin: 4,
  stackCollapsed: false,
  stack: 2,
  boxPad: 10,
}

export interface PlacedCard {
  id: string
  kind: CardKind
  x: number
  y: number
  w: number
  h: number
  depth: number
  parentId: string | null
}

/** Axis-aligned connector segment [x1, y1, x2, y2]. */
export type Segment = [number, number, number, number]

/** A team box behind a grid of stacked reports. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Layout {
  cards: PlacedCard[]
  byId: Map<string, PlacedCard>
  segments: Segment[]
  boxes: Box[]
  width: number
  height: number
}

interface Block {
  /** Width and height of the block. */
  w: number
  h: number
  /** X of the point a parent's connector drops to, relative to the block's left edge. */
  anchor: number
  /** Place at (left, top) in absolute coordinates. */
  place: (left: number, top: number, parentId: string | null) => void
}

/** Lay out a visible tree. Coordinates start at (0, 0); width/height bound every card. */
export function layoutTree(root: VNode, s: LayoutSizes = SCREEN_SIZES): Layout {
  const cards: PlacedCard[] = []
  const segments: Segment[] = []
  const boxes: Box[] = []
  const { cardW: CW, cardH: CH } = s

  const card = (n: VNode, x: number, y: number, parentId: string | null) => {
    cards.push({ id: n.id, kind: n.kind, x, y, w: CW, h: CH, depth: n.depth, parentId })
  }

  /** Leaf reports in a grid inside a team box; the box's top centre is the drop point. */
  const gridBlock = (leaves: VNode[]): Block => {
    const n = leaves.length
    const cols = Math.max(2, Math.min(n, Math.round(Math.sqrt(n) * 1.6)))
    const rows = Math.ceil(n / cols)
    const P = s.boxPad
    const w = cols * CW + (cols - 1) * s.gapX + 2 * P
    const h = rows * CH + (rows - 1) * s.stackGap + 2 * P
    return {
      w,
      h,
      anchor: w / 2,
      place(left, top, parentId) {
        boxes.push({ x: left, y: top, w, h })
        leaves.forEach((leaf, i) => {
          const x = left + P + (i % cols) * (CW + s.gapX)
          const y = top + P + Math.floor(i / cols) * (CH + s.stackGap)
          card(leaf, x, y, parentId)
        })
      },
    }
  }

  /** Leaf reports in two columns either side of a spine; the spine's top is the drop point. */
  const stackBlock = (leaves: VNode[]): Block => {
    if (s.stack === 'grid') return gridBlock(leaves)
    const rows = Math.ceil(leaves.length / 2)
    const w = 2 * CW + 2 * s.stackIndent
    const h = rows * CH + (rows - 1) * s.stackGap
    return {
      w,
      h,
      anchor: w / 2,
      place(left, top, parentId) {
        const spine = left + w / 2
        leaves.forEach((leaf, i) => {
          const row = Math.floor(i / 2)
          const y = top + row * (CH + s.stackGap)
          const cy = y + CH / 2
          if (i % 2 === 0) {
            card(leaf, left, y, parentId)
            segments.push([spine - s.stackIndent, cy, spine, cy])
          } else {
            card(leaf, spine + s.stackIndent, y, parentId)
            segments.push([spine, cy, spine + s.stackIndent, cy])
          }
        })
        const lastCy = top + (rows - 1) * (CH + s.stackGap) + CH / 2
        segments.push([spine, top, spine, lastCy])
      },
    }
  }

  const nodeBlock = (n: VNode): Block => {
    if (!n.children.length) {
      return { w: CW, h: CH, anchor: CW / 2, place: (left, top, pid) => card(n, left, top, pid) }
    }
    const stackable = (c: VNode) => !c.children.length && (s.stackCollapsed || !c.collapsed)
    const leaves = n.children.filter(stackable)
    const branches = n.children.filter((c) => !stackable(c))
    const items: Block[] =
      leaves.length >= s.stackMin
        ? [...branches.map(nodeBlock), stackBlock(leaves)]
        : n.children.map(nodeBlock)

    // Children side by side; the manager centres over the first and last drop points.
    let rowW = 0
    const offsets: number[] = []
    for (const [i, it] of items.entries()) {
      offsets.push(rowW)
      rowW += it.w + (i < items.length - 1 ? s.gapX : 0)
    }
    const firstA = offsets[0] + items[0].anchor
    const lastA = offsets[items.length - 1] + items[items.length - 1].anchor
    const parentCx = (firstA + lastA) / 2
    const minX = Math.min(0, parentCx - CW / 2)
    const maxX = Math.max(rowW, parentCx + CW / 2)
    const w = maxX - minX
    const h = CH + s.gapY + Math.max(...items.map((it) => it.h))
    return {
      w,
      h,
      anchor: parentCx - minX,
      place(left, top, parentId) {
        const rowLeft = left - minX
        const px = rowLeft + parentCx
        card(n, px - CW / 2, top, parentId)
        const rowTop = top + CH + s.gapY
        const busY = top + CH + s.gapY / 2
        const anchors = items.map((it, i) => rowLeft + offsets[i] + it.anchor)
        if (items.length === 1 && Math.abs(anchors[0] - px) < 0.5) {
          segments.push([px, top + CH, px, rowTop])
        } else {
          segments.push([px, top + CH, px, busY])
          segments.push([Math.min(px, ...anchors), busY, Math.max(px, ...anchors), busY])
          for (const a of anchors) segments.push([a, busY, a, rowTop])
        }
        items.forEach((it, i) => {
          it.place(rowLeft + offsets[i], rowTop, n.id)
        })
      },
    }
  }

  const rootBlock = nodeBlock(root)
  rootBlock.place(0, 0, null)
  const byId = new Map(cards.map((c) => [c.id, c]))
  let width = 0
  let height = 0
  for (const c of cards) {
    width = Math.max(width, c.x + c.w)
    height = Math.max(height, c.y + c.h)
  }
  for (const b of boxes) {
    width = Math.max(width, b.x + b.w)
    height = Math.max(height, b.y + b.h)
  }
  return { cards, byId, segments, boxes, width, height }
}

/** Connector segments as one SVG path. */
export function segmentsPath(segments: readonly Segment[], dx = 0, dy = 0): string {
  let d = ''
  for (const [x1, y1, x2, y2] of segments) {
    d += `M${r(x1 + dx)} ${r(y1 + dy)}${x1 === x2 ? `V${r(y2 + dy)}` : `H${r(x2 + dx)}`}`
  }
  return d
}
// Half-pixel aligned so 1px hairlines stay crisp.
const r = (v: number) => Math.round(v) + 0.5
