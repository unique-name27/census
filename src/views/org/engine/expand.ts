/**
 * Which cards start open: a number of levels below the chart's root, plus the chain down to each
 * group that matches the dimming filters, so filtered people are visible without opening everything.
 */
import { chainTo, entryPoints, type OrgTree } from './tree'

export type LevelsPreset = '2' | '3' | '4' | 'all' | 'custom'

/** Ids to expand so `levels` levels show below and including the root ('all' opens everything). */
export function expandedForLevels(tree: OrgTree, rootId: string, levels: LevelsPreset): Set<string> {
  const max = levels === 'all' ? Number.POSITIVE_INFINITY : levels === 'custom' ? 3 : Number(levels)
  const out = new Set<string>()
  const stack: [string, number][] = [[rootId, 1]]
  while (stack.length) {
    const [id, lvl] = stack.pop()!
    if (lvl >= max) continue
    const kids = tree.children.get(id)
    if (!kids?.length) continue
    out.add(id)
    for (const k of kids) stack.push([k, lvl + 1])
  }
  out.add(rootId)
  return out
}

/** Default expansion: `levels` levels, plus the chain down to each filtered group (up to `cap`). */
export function defaultExpanded(
  tree: OrgTree,
  rootId: string,
  levels: LevelsPreset,
  matches: ((id: string) => boolean) | null,
  cap = 120,
): Set<string> {
  const ids = expandedForLevels(tree, rootId, levels)
  if (!matches) return ids
  for (const id of entryPoints(tree, rootId, matches).slice(0, cap)) {
    for (const a of chainTo(tree, id).slice(0, -1)) ids.add(a)
  }
  return ids
}
