/**
 * Overview, "Pay and retention": whether the places paid lowest in the range also lose the most
 * people, and whether low pay position is a whole site or certain levels. Ratios and counts only.
 * Every dot, cell and table count opens the people behind it; groups of an org filter offer
 * "Filter to" in the records panel.
 */
import { useState } from 'react'
import { type Column, Figure, Heatmap, Scatter } from '@/charts'
import { Section, Segmented } from '@/components'
import { useMinWidth } from '@/components/useNarrow'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import {
  type CompaCell,
  compaCellDrill,
  type PayAttritionDim,
  type PayAttritionRow,
  payGroupDrill,
  payLeaversDrill,
} from '../engine/charts'
import { FIGURE_METRIC } from '../engine/definitions'
import { lazyDrill } from '../engine/drill'
import type { CompModel } from '../engine/model'
import { asOfNote, emptyIf, MISSING } from '../shared'

const DIM_WORD: Record<PayAttritionDim, [string, string, string]> = {
  location: ['Location', 'location', 'locations'],
  department: ['Department', 'department', 'departments'],
}

export function PayAndRetention({ m }: { m: CompModel }) {
  const [dim, setDim] = useState<PayAttritionDim>('location')
  const wide = useMinWidth(1280)
  const pa = m.overview.payAttrition[dim]
  const grid = m.overview.compaGrid
  const asOf = formatDate(m.asOf)
  const [Label, one, many] = DIM_WORD[dim]
  const min = fmt(m.rules.minGroup, 'int')
  const people = (d: PayAttritionRow) => lazyDrill(d.members.length, () => payGroupDrill(m, d))
  const leavers = (d: PayAttritionRow) => lazyDrill(d.leavers.length, () => payLeaversDrill(m, pa, d))
  const columns: Column<PayAttritionRow>[] = [
    { key: 'group', label: Label, format: 'text' },
    { key: 'people', label: 'People with a compa-ratio', format: 'int', drill: people },
    { key: 'compa', label: 'Median compa-ratio', format: 'ratio', drill: people },
    { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
    { key: 'exits', label: 'Voluntary exits', format: 'int', drill: leavers },
    { key: 'voluntary', label: 'Voluntary attrition', format: 'pct', drill: leavers },
  ]
  const hiddenNote = pa.hidden
    ? ` · ${fmt(pa.hidden, 'int')} ${pa.hidden === 1 ? one : many} under ${min} people not drawn`
    : ''
  const cellDrill = (c: CompaCell) => lazyDrill(c.members.length, () => compaCellDrill(m, c))
  const gridHidden = grid.hiddenCells
    ? ` · ${fmt(grid.hiddenCells, 'int')} ${grid.hiddenCells === 1 ? 'cell' : 'cells'} under ${min} people hidden`
    : ''
  const noLevel = grid.noLevel ? ` · ${fmt(grid.noLevel, 'int')} without a level left out` : ''

  return (
    <Section
      title="Pay and retention"
      dek={`Whether the groups paid lowest in their ranges also lose the most people, and whether low pay position covers a whole site or certain levels. Compa-ratios as of ${asOf}; voluntary attrition over ${pa.window.label}.`}
    >
      <Figure
        id="comp-pay-attrition"
        uses={m.uses['comp-pay-attrition']}
        metric={FIGURE_METRIC['comp-pay-attrition']}
        title={`Pay position and voluntary attrition by ${one}`}
        subtitle={`Median compa-ratio against voluntary attrition, ${pa.window.label}; dot size is people`}
        data={pa.rows}
        columns={columns}
        definitions={m.definitions['comp-pay-attrition']}
        note={`${fmt(pa.shown.length, 'int')} ${pa.shown.length === 1 ? one : many} shown${hiddenNote} · ${asOfNote(m)}`}
        span={wide ? 7 : 12}
        // Shorter than the location and level grid beside it: end the sheet at its content.
        className="self-start"
        actions={
          <Segmented<PayAttritionDim>
            label="Dots"
            value={dim}
            onChange={setDim}
            options={[
              { value: 'location', label: 'Location' },
              { value: 'department', label: 'Department' },
            ]}
          />
        }
        detail={{
          label: 'Voluntary leavers',
          columns: [
            { key: 'group', label: Label, format: 'text' },
            { key: 'employeeId', label: 'Employee ID', format: 'text' },
            { key: 'name', label: 'Name', format: 'text' },
            { key: 'department', label: 'Department', format: 'text' },
            { key: 'level', label: 'Level', format: 'text' },
            { key: 'terminationDate', label: 'Exit date', format: 'date' },
          ],
          rows: () =>
            pa.shown.flatMap((r) =>
              r.leavers.map((e) => ({
                group: r.group,
                employeeId: e.employeeId,
                name: e.name,
                department: e.department,
                level: e.level,
                terminationDate: e.terminationDate,
              })),
            ),
        }}
        empty={emptyIf(
          pa.shown,
          m.pop.has.ranges ? null : MISSING.ranges,
          `No ${one} has ${min} or more people with a compa-ratio and in headcount.`,
        )}
      >
        <Scatter
          data={pa.shown}
          x="compa"
          y="voluntary"
          r="people"
          label="group"
          labelCount={4}
          xFormat="ratio"
          yFormat="pct"
          rFormat="int"
          xLabel="Median compa-ratio"
          yLabel="Voluntary attrition"
          rLabel="People"
          refX={
            pa.company.compa == null
              ? undefined
              : { value: pa.company.compa, label: `Company ${fmt(pa.company.compa, 'ratio')}` }
          }
          refY={
            pa.company.voluntary == null
              ? undefined
              : { value: pa.company.voluntary, label: `Company ${fmt(pa.company.voluntary, 'pct')}` }
          }
          height={wide ? 300 : 260}
          ariaLabel={`Median compa-ratio against voluntary attrition by ${one}`}
          onSelect={(d) => drill(people(d))}
        />
      </Figure>
      <Figure
        id="comp-compa-location-level"
        uses={m.uses['comp-compa-location-level']}
        metric={FIGURE_METRIC['comp-compa-location-level']}
        title="Median compa-ratio by location and level"
        subtitle={`Median base salary ÷ range midpoint by level group, 1.00 at the midpoint, as of ${asOf}`}
        data={grid.cells}
        columns={[
          { key: 'location', label: 'Location', format: 'text' },
          { key: 'levelGroup', label: 'Level group', format: 'text' },
          { key: 'n', label: 'People', format: 'int', drill: cellDrill },
          { key: 'median', label: 'Median compa-ratio', format: 'ratio', drill: cellDrill },
        ]}
        definitions={m.definitions['comp-compa-location-level']}
        note={`${fmt(grid.locations.length, 'int')} locations${gridHidden}${noLevel} · ${asOfNote(m)}`}
        span={wide ? 5 : 12}
        empty={emptyIf(
          grid.cells,
          m.pop.has.ranges ? null : MISSING.ranges,
          'No compa-ratios in this scope.',
        )}
      >
        <Heatmap
          data={grid.cells}
          x="levelGroup"
          y="location"
          value="median"
          n="n"
          format="ratio"
          scheme="diverging"
          mid={1}
          domain={[0.85, 1.15]}
          xOrder={grid.groups}
          yOrder={grid.locations}
          rowHeight={26}
          ariaLabel="Median compa-ratio by location and level group"
          onSelect={(c) => drill(cellDrill(c))}
        />
      </Figure>
    </Section>
  )
}
