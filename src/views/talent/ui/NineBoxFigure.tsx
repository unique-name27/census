import { Figure, type FigureSpan } from '@/charts'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import { type NineBoxRow, nineBoxColumns, nineBoxDetailColumns } from './columns'
import { DEF } from './defs'
import { NineBox } from './NineBox'

export function NineBoxFigure({ m, span }: { m: TalentModel; span: FigureSpan }) {
  const ctx = useAnalytics()
  const nb = m.nineBox
  const rows: NineBoxRow[] = nb.cells.map(({ people: _people, ...cell }) => cell)
  const cycle = nb.cycle?.cycle
  const empty = !m.has.reviews
    ? 'Upload Reviews to see the 9-box.'
    : !m.has.potential
      ? 'Upload Reviews with a potential rating (Low, Moderate or High) to see the 9-box.'
      : nb.placed === 0
        ? `Nobody in this scope has both a rating and a potential rating in ${cycle ?? 'the latest annual cycle'}.`
        : null
  return (
    <Figure
      id="talent-nine-box"
      title="Performance and potential"
      subtitle={`Active employees by rating and potential${cycle ? ` in ${cycle}` : ''}, as of ${formatDate(ctx.asOf)}`}
      data={rows}
      columns={nineBoxColumns(m.drill)}
      definitions={[DEF.nineBox, DEF.highPerformer, DEF.flightRisk]}
      note={`${plural(nb.placed, 'person', 'people')} placed · ${plural(nb.notPlaced, 'person', 'people')} without a rating and potential in that cycle`}
      span={span}
      className="self-start"
      empty={empty}
      detail={{
        label: 'People',
        columns: nineBoxDetailColumns(cycle),
        rows: () => nb.cells.flatMap((c) => c.people.map((p) => ({ box: c.label, ...p }))),
      }}
    >
      <NineBox
        cells={nb.cells}
        cycle={cycle}
        drillFor={(c, part) => m.drill.nineBox(c.performance, c.potential, part)}
      />
    </Figure>
  )
}
