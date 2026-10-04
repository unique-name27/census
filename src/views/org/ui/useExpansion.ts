/**
 * Which cards are open. Starts at two levels below the root plus the chain down to each filtered
 * group, and starts over when the root or the dimming filters change.
 */
import { useState } from 'react'
import { chainTo, defaultExpanded, type LevelsPreset, type OrgTree } from '../engine'

export interface Expansion {
  ids: Set<string>
  preset: LevelsPreset
  /** Bumps each time a levels preset is picked (the view returns to the top). */
  levelsPicked: number
  toggle: (id: string) => void
  setLevels: (v: LevelsPreset) => void
  /** Open the chain down to `id` under `root` (default: the current root); `self` opens `id` too. */
  reveal: (id: string, opts?: { root?: string; self?: boolean }) => void
}

export function useExpansion(
  tree: OrgTree,
  rootId: string,
  matches: ((id: string) => boolean) | null,
  filterKey: string,
): Expansion {
  const [exp, setExp] = useState<{ key: string; ids: Set<string>; preset: LevelsPreset } | null>(null)
  const [levelsPicked, setLevelsPicked] = useState(0)
  const keyFor = (root: string) => `${root}|${filterKey}`
  const base = (root: string) =>
    exp && exp.key === keyFor(root)
      ? exp
      : { key: keyFor(root), ids: defaultExpanded(tree, root, '2', matches), preset: '2' as LevelsPreset }
  const cur = base(rootId)

  return {
    ids: cur.ids,
    preset: cur.preset,
    levelsPicked,
    toggle: (id) => {
      const ids = new Set(cur.ids)
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      setExp({ key: cur.key, ids, preset: 'custom' })
    },
    setLevels: (v) => {
      setExp({ key: cur.key, ids: defaultExpanded(tree, rootId, v, matches), preset: v })
      setLevelsPicked((n) => n + 1)
    },
    reveal: (id, opts = {}) => {
      const b = base(opts.root ?? rootId)
      const ids = new Set(b.ids)
      for (const a of chainTo(tree, id).slice(0, opts.self ? undefined : -1)) ids.add(a)
      setExp({ key: b.key, ids, preset: ids.size === b.ids.size ? b.preset : 'custom' })
    },
  }
}
