/**
 * Everything the Categories & mapping tab shows, computed once per change of the data, your
 * mappings or the as-of date. The structure is read from the mapped datasets (`ctx.all`), so a
 * change you make shows up here the moment it is made.
 */
import { useMemo } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { inventoryVocab, officialParentMaps } from '@/data/lists/effective'
import { useOfficialLists } from '@/data/lists/useOfficialLists'
import { applyReferenceMappings, inferStructure, type StructureReport } from '@/data/reference'
import { useCensus } from '@/data/store'
import {
  type Conflict,
  jobConflicts,
  officialConflicts,
  orgConflicts,
  withOfficialParents,
} from '../engine/conflicts'
import { type EditOptions, editOptions } from '../engine/edit'
import { remapSpellings } from '../engine/lists'
import {
  activeManagerIds,
  functionLevelCells,
  jobRows,
  locationDiagram,
  locationRows,
  type MappedDiagram,
  orgDiagram,
  orgRows,
  titleRows,
} from '../engine/structure'
import { type RawLogs, useRawLogs } from './hooks'

export interface MappingModel {
  ctx: AnalyticsContext
  report: StructureReport
  raw: RawLogs
  org: MappedDiagram
  orgRows: ReturnType<typeof orgRows>
  locations: MappedDiagram
  locationRows: ReturnType<typeof locationRows>
  jobRows: ReturnType<typeof jobRows>
  titleRows: ReturnType<typeof titleRows>
  heat: ReturnType<typeof functionLevelCells>
  orgConflicts: Conflict[]
  jobConflicts: Conflict[]
  options: EditOptions
  /** Rows each of your mappings changed. */
  perMapping: Record<string, number>
  /** Your mappings that could not be applied. */
  skipped: ReadonlySet<string>
}

export function useMappingModel(): MappingModel {
  const ctx = useAnalytics()
  const raw = useRawLogs()
  const imported = useCensus((s) => s.data)
  const mappings = useCensus((s) => s.reference.mappings)
  const skippedList = ctx.reference.skipped

  const perMapping = useMemo(
    () => (mappings.length ? applyReferenceMappings(imported, mappings).perMapping : {}),
    [imported, mappings],
  )
  const skipped = useMemo(() => new Set(skippedList.map((s) => s.id)), [skippedList])
  const spellings = useMemo(
    () => remapSpellings(raw.spellings, mappings, skipped),
    [raw.spellings, mappings, skipped],
  )

  const data = ctx.all
  const asOf = ctx.asOf
  const issues = raw.issues
  // The official lists (Settings > Official lists): their values decide what is "not in the list",
  // and their parents what sits in the wrong place.
  const { lists } = useOfficialLists()
  const vocab = inventoryVocab(lists)
  const parents = officialParentMaps(lists)
  const derived = useMemo(() => {
    const report = inferStructure(data, { asOf, spellings, issues, vocab })
    const emps = data.employees
    const official = officialConflicts(report, parents, emps)
    const active = report.org.flatMap((e) => e.rows)
    return {
      report,
      org: orgDiagram(report, emps),
      orgRows: orgRows(report, emps, activeManagerIds(emps, active)),
      locations: locationDiagram(report, emps),
      locationRows: locationRows(report, emps),
      jobRows: jobRows(report, emps),
      titleRows: titleRows(report, emps),
      heat: functionLevelCells(report, emps),
      orgConflicts: withOfficialParents(orgConflicts(report), official, parents, 'org'),
      jobConflicts: withOfficialParents(jobConflicts(report, emps), official, parents, 'job'),
      options: editOptions(report, data),
    }
  }, [data, asOf, spellings, issues, vocab, parents])

  return { ctx, raw, perMapping, skipped, ...derived }
}
