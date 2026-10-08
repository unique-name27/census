/**
 * The rows each pick dialog lists, read from the unscoped data (`ctx.all`) and the official lists
 * in force, and which pick kinds have anything to pick (the Mode menu greys out a mode with
 * nothing). Managers keep the leader filter's own list (`useManagers`).
 */
import { useMemo } from 'react'
import { contextRegions, useAnalytics } from '@/data/context'
import { effectiveLists } from '@/data/lists/effective'
import { useLists } from '@/data/lists/store'
import type { PickKind } from '../modes'
import { recruiterOptions, regionOptions, unitOptions } from '../scopes/pickers'
import {
  managerRows,
  type PickAvailability,
  type PickRow,
  recruiterRows,
  regionRows,
  unitRows,
} from './pickModel'
import { useManagers } from './useManagers'

export interface PickList {
  rows: PickRow[]
  /** Active employees at locations with no region (the region dialog's foot line). */
  noRegionPeople: number
}

const EMPTY: PickList = { rows: [], noRegionPeople: 0 }

/** The pick dialog's rows for a kind (nothing for null). */
export function usePickRows(kind: PickKind | null): PickList {
  const { all, asOf, sources } = useAnalytics()
  const lists = useLists((s) => s.state)
  const managers = useManagers()
  return useMemo(() => {
    switch (kind) {
      case 'manager':
        return { rows: managerRows(managers), noRegionPeople: 0 }
      case 'unit': {
        // Units on an official list with nobody in the data are listed muted.
        const list = effectiveLists(lists, all, sources).businessUnit
        const listed =
          list?.status === 'official' ? list.values.filter((v) => !v.retired).map((v) => v.value) : []
        return { rows: unitRows(unitOptions(all.employees, asOf, listed)), noRegionPeople: 0 }
      }
      case 'region': {
        const o = regionOptions(contextRegions(lists, all, sources), all.employees, asOf)
        return { rows: regionRows(o), noRegionPeople: o.noRegionPeople }
      }
      case 'recruiter':
        return { rows: recruiterRows(recruiterOptions(all, asOf)), noRegionPeople: 0 }
      default:
        return EMPTY
    }
  }, [kind, managers, all, asOf, sources, lists])
}

/**
 * Whether each pick kind has anything to pick in the loaded data: a manager leading 3 or more, an
 * active employee with a business unit, a location with a region, a recruiter on a recent req.
 */
export function usePickAvailability(): PickAvailability {
  const { all, asOf, sources } = useAnalytics()
  const lists = useLists((s) => s.state)
  const managers = useManagers()
  return useMemo(
    () => ({
      manager: managers.length > 0,
      unit: unitOptions(all.employees, asOf).some((u) => u.pickable),
      region: contextRegions(lists, all, sources).regions.length > 0,
      recruiter: recruiterOptions(all, asOf).length > 0,
    }),
    [managers, all, asOf, sources, lists],
  )
}
