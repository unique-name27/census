/**
 * Table views for the org chart figures: the people on the chart and the flags, with every count
 * opening the people behind it, and the chart/table switch the chart figures use instead of the
 * Figure's own (a row click has to bring the chart back, which needs the switch in this view).
 */
import type { Column } from '@/charts'
import { IconButton, IconChart, IconTable } from '@/components'
import { cx } from '@/components/ui'
import {
  type DrillScope,
  directsDrill,
  FLAG_COLUMNS,
  type Flag,
  type FlagRow,
  flagKindDrill,
  type OrgTree,
  orgDrill,
  PERSON_COLUMNS,
  type PersonRow,
} from '../engine'

/** The chart's people columns; Direct reports and Total org open those people. */
export function personColumns(tree: OrgTree, scope: DrillScope): Column<PersonRow>[] {
  return PERSON_COLUMNS.map((c) =>
    c.key === 'directs'
      ? { ...c, drill: (r: PersonRow) => (r.directs ? () => directsDrill(tree, r.employeeId, scope) : null) }
      : c.key === 'totalOrg'
        ? { ...c, drill: (r: PersonRow) => (r.totalOrg ? () => orgDrill(tree, r.employeeId, scope) : null) }
        : c,
  )
}

/** The flags table's columns: the counts open the people, the flag opens everyone with it. */
export function flagColumns(
  tree: OrgTree,
  ids: readonly string[],
  flags: ReadonlyMap<string, readonly Flag[]>,
  scope: DrillScope,
): Column<FlagRow>[] {
  return FLAG_COLUMNS.map((c) =>
    c.key === 'directs'
      ? { ...c, drill: (r: FlagRow) => (r.directs ? () => directsDrill(tree, r.employeeId, scope) : null) }
      : c.key === 'totalOrg'
        ? { ...c, drill: (r: FlagRow) => (r.totalOrg ? () => orgDrill(tree, r.employeeId, scope) : null) }
        : c.key === 'flag'
          ? { ...c, drill: (r: FlagRow) => () => flagKindDrill(tree, ids, r.kind, flags, scope) }
          : c,
  )
}

export function TableToggle({ showTable, onChange }: { showTable: boolean; onChange: (v: boolean) => void }) {
  return (
    <IconButton
      label={showTable ? 'Show chart' : 'Show table'}
      aria-pressed={showTable}
      size="sm"
      onClick={() => onChange(!showTable)}
      className={cx(showTable && 'bg-hover text-ink')}
    >
      {showTable ? <IconChart /> : <IconTable />}
    </IconButton>
  )
}
