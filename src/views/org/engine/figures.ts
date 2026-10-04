/**
 * Key figures for the org on screen, with the ids behind every number so each figure can open the
 * records it counts. Pure; one pass over the org per call.
 */
import { median } from '@/lib/stats'
import { type Flag, STRUCTURAL } from './flags'
import { type Layout, layoutTree, type ReqStub, SCREEN_SIZES, type VNode, visibleTree } from './layout'
import { defaultOrgRules, type OrgRules } from './rules'
import { COMPANY_ROOT, type OrgTree, subtreeOf } from './tree'

export interface OrgKeyFigures {
  /** Everyone counted: the org including its leader, or only those matching the filters. */
  people: string[]
  /** Counted people with at least one direct report. */
  managers: string[]
  /** Median direct reports among `managers` (all worker types count as reports). */
  medianSpan: number | null
  /** Deepest layer among the counted people, counting the top of the org as 1. */
  layers: number
  /** Open requisition IDs whose hiring manager is a counted person. */
  openReqIds: string[]
  /** Counted people with a structure flag (span, chain or new manager). */
  flagged: string[]
  /** Counted people below the deep-chain layer, deepest first. */
  deep: string[]
  /** That layer (the deep-chain setting the figures were computed with). */
  deepLayer: number
}

/** Layer of a person in the org under `rootId`: the top of that org is layer 1. */
export function layerIn(tree: Pick<OrgTree, 'depth'>, rootId: string): (id: string) => number {
  const base = rootId === COMPANY_ROOT ? 0 : (tree.depth.get(rootId) ?? 0)
  return (id) => (tree.depth.get(id) ?? 0) - base + 1
}

export function orgKeyFigures(
  m: {
    tree: OrgTree
    flags: ReadonlyMap<string, readonly Flag[]>
    reqs: ReadonlyMap<string, readonly ReqStub[]>
    /** The settings in force (the deep-chain layer); the defaults without it. */
    rules?: OrgRules
  },
  rootId: string,
  matches: ((id: string) => boolean) | null,
): OrgKeyFigures {
  const { tree } = m
  const deepAfter = (m.rules ?? defaultOrgRules()).deepChain
  const layer = layerIn(tree, rootId)
  const people: string[] = []
  const managers: string[] = []
  const spans: number[] = []
  const openReqIds: string[] = []
  const flagged: string[] = []
  const deep: { id: string; layer: number }[] = []
  let layers = 0
  for (const id of subtreeOf(tree, rootId)) {
    if (!tree.people.has(id) || (matches && !matches(id))) continue
    people.push(id)
    const n = tree.directs.get(id) ?? 0
    if (n > 0) {
      managers.push(id)
      spans.push(n)
    }
    const at = layer(id)
    layers = Math.max(layers, at)
    if (at > deepAfter) deep.push({ id, layer: at })
    for (const r of m.reqs.get(id) ?? []) openReqIds.push(r.reqId)
    if (m.flags.get(id)?.some((f) => STRUCTURAL.has(f.kind))) flagged.push(id)
  }
  deep.sort((a, b) => b.layer - a.layer)
  return {
    people,
    managers,
    medianSpan: median(spans),
    layers,
    openReqIds,
    flagged,
    deep: deep.map((d) => d.id),
    deepLayer: deepAfter,
  }
}

/** People at one layer of the org under `rootId` (layer 1 is its top). */
export function peopleAtLayer(tree: OrgTree, rootId: string, layer: number): string[] {
  const at = layerIn(tree, rootId)
  return subtreeOf(tree, rootId).filter((id) => tree.people.has(id) && at(id) === layer)
}

/** Everyone below a person (their whole org, not counting them). */
export const orgBelow = (tree: OrgTree, id: string): string[] =>
  subtreeOf(tree, id).filter((x) => x !== id && tree.people.has(x))

/** The PNG/SVG image of a chart keeps to this many cards; bigger charts export their top levels. */
export const EXPORT_MAX_CARDS = 150
/** ...and to this width in layout pixels, so cards stay legible once the image is scaled down. */
export const EXPORT_MAX_WIDTH = 8000
/** Cut layouts stack the bottom row of managers too, which keeps them narrow. */
const EXPORT_SIZES = { ...SCREEN_SIZES, stackCollapsed: true }

export interface ExportCut {
  layout: Layout
  /** The deepest level in the image (0 = the root), or null when it shows the whole chart. */
  depth: number | null
}

/**
 * The chart as one readable image: the visible chart when it fits the card and width limits,
 * otherwise its top levels (at least the root and its direct reports).
 */
export function exportCut(
  tree: OrgTree,
  rootId: string,
  expanded: ReadonlySet<string>,
  full: { vtree: VNode; layout: Layout },
  reqs?: ReadonlyMap<string, readonly ReqStub[]>,
): ExportCut {
  let depth = exportDepth(full.vtree, EXPORT_MAX_CARDS)
  if (depth == null && full.layout.width <= EXPORT_MAX_WIDTH) return { layout: full.layout, depth: null }
  let d = depth ?? deepest(full.vtree)
  let layout = layoutTree(visibleTree(tree, rootId, expanded, { reqs, maxDepth: d }), EXPORT_SIZES)
  while (layout.width > EXPORT_MAX_WIDTH && d > 1) {
    d--
    layout = layoutTree(visibleTree(tree, rootId, expanded, { reqs, maxDepth: d }), EXPORT_SIZES)
  }
  depth = d
  return { layout, depth }
}

function deepest(root: VNode): number {
  let max = 0
  const stack = [root]
  while (stack.length) {
    const n = stack.pop()!
    max = Math.max(max, n.depth)
    for (const c of n.children) stack.push(c)
  }
  return max
}

/**
 * The deepest level an image of a visible tree can show and stay readable: the largest depth whose
 * cards (counting every level above it) number at most `maxCards`, never less than the root and
 * its direct reports. Null when the whole visible tree fits.
 */
export function exportDepth(root: VNode, maxCards: number): number | null {
  const perDepth: number[] = []
  const stack = [root]
  while (stack.length) {
    const n = stack.pop()!
    perDepth[n.depth] = (perDepth[n.depth] ?? 0) + 1
    for (const c of n.children) stack.push(c)
  }
  let total = 0
  for (let d = 0; d < perDepth.length; d++) {
    total += perDepth[d] ?? 0
    if (total > maxCards) return Math.max(1, d - 1)
  }
  return null
}
