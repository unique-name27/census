/**
 * Everything the Categories & mapping tab shows, computed once per change of the data, your
 * mappings or the as-of date. The structure is read from the mapped datasets (`ctx.all`), so a
 * change you make shows up here the moment it is made.
 */
import { useMemo } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { applyReferenceMappings, inferStructure, type StructureReport } from '@/data/reference'
import { useCensus } from '@/data/store'
import { type Conflict, jobConflicts, orgConflicts } from '../engine/conflicts'
import { type EditOptions, editOptions } from '../engine/edit'
import { remapSpellings } from '../engine/lists'
import {
  activeManagerIds,
  familyLevelCells,
  familyRows,
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
  familyRows: ReturnType<typeof familyRows>
  titleRows: ReturnType<typeof titleRows>
  heat: ReturnType<typeof familyLevelCells>
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
  const derived = useMemo(() => {
    const report = inferStructure(data, { asOf, spellings, issues })
    const emps = data.employees
    const active = report.org.flatMap((e) => e.rows)
    return {
      report,
      org: orgDiagram(report, emps),
      orgRows: orgRows(report, emps, activeManagerIds(emps, active)),
      locations: locationDiagram(report, emps),
      locationRows: locationRows(report, emps),
      familyRows: familyRows(report, emps),
      titleRows: titleRows(report, emps),
      heat: familyLevelCells(report, emps),
      orgConflicts: orgConflicts(report),
      jobConflicts: jobConflicts(report, emps),
      options: editOptions(report, data),
    }
  }, [data, asOf, spellings, issues])

  return { ctx, raw, perMapping, skipped, ...derived }
}
