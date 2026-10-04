/**
 * Range position: penetration by level, compa-ratio by tenure, who is outside the range,
 * compression. Levels, cells and counts open the people behind them; a person's mark or row opens
 * their card.
 */
import { Figure, RangeBars } from '@/charts'
import type { Severity } from '@/components'
import { Section } from '@/components'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { Dumbbell } from '../charts/Dumbbell'
import { PositionStrip } from '../charts/PositionStrip'
import { TENURE_DOT_COLUMNS } from '../columns'
import { compressionColumns, outsideColumns, penetrationColumns } from '../drillColumns'
import { FIGURE_METRIC } from '../engine/definitions'
import { compressionDrill, penetrationDrill } from '../engine/drill'
import type { CompModel } from '../engine/model'
import { type OutsideRangeRow, TENURE_ORDER } from '../engine/ranges'
import { asOfNote, emptyIf, MISSING, note } from '../shared'

const COMPRESSION_SHOWN = 20

/** Increases to minimum this large or larger ('comp.position.increaseToMin') are marked critical. */
const gapTone =
  (largeGap: number) =>
  (r: OutsideRangeRow): Severity =>
    r.gapPct >= largeGap ? 'critical' : 'warning'
/** Person rows open that person's card. */
const personRow = (r: { id: string }) => openPerson(r.id)

export function Ranges({ m }: { m: CompModel }) {
  const r = m.ranges
  const asOf = formatDate(m.asOf)
  const noRanges = m.pop.has.ranges ? null : MISSING.ranges
  const cost =
    m.showPay && r.below.length
      ? ` · ${fmt(r.costToMin.usd, 'money')} a year to bring everyone to minimum`
      : ''
  // Recent promotions come from Job changes: below the data standard the column drops out.
  const belowColumns = outsideColumns(m, 'below').filter((c) => m.promotionsShown || c.key !== 'promoted')
  const promoted = m.promotionsShown ? '' : ` · promotions not shown: ${m.belowStandard.toLowerCase()}`
  const sides = fmt(m.rules.compression.minGroup, 'int')

  return (
    <div>
      <Section
        title="Position in the range"
        dek={`How far into their salary range people sit, by level and by tenure, as of ${asOf}. Long tenure high in the range and new arrivals low in it are both worth a look.`}
      >
        <Figure
          id="comp-penetration-by-level"
          uses={m.uses['comp-penetration-by-level']}
          metric={FIGURE_METRIC['comp-penetration-by-level']}
          title="Range penetration by level"
          subtitle="Box from the 25th to the 75th percentile, line from the 10th to the 90th, tick at the median"
          data={r.penetration}
          columns={penetrationColumns(m)}
          definitions={m.definitions['comp-penetration-by-level']}
          note={note(
            m,
            r.penetration.reduce((a, x) => a + x.n, 0),
          )}
          span={7}
          empty={emptyIf(r.penetration, noRanges, 'No range data in this scope.')}
        >
          <RangeBars
            data={r.penetration}
            y="level"
            min="p10"
            max="p90"
            q1="q1"
            q3="q3"
            mid="median"
            format="pct0"
            labels={{ min: '10th percentile', max: '90th percentile', mid: 'Median' }}
            onSelect={(row) => drill(penetrationDrill(m, row))}
          />
        </Figure>
        <Figure
          id="comp-compa-by-tenure"
          uses={m.uses['comp-compa-by-tenure']}
          metric={FIGURE_METRIC['comp-compa-by-tenure']}
          title="Compa-ratio by tenure"
          subtitle={`One mark per person, tick at the median; shape shows range position, as of ${asOf}`}
          data={r.tenure}
          columns={TENURE_DOT_COLUMNS}
          definitions={m.definitions['comp-compa-by-tenure']}
          note={note(m, r.tenure.length)}
          span={5}
          empty={emptyIf(r.tenure, null, 'No compa-ratios in this scope.')}
          table={{ onRowClick: personRow, search: 'Search people' }}
        >
          <PositionStrip
            data={r.tenure}
            yOrder={TENURE_ORDER}
            ariaLabel="Compa-ratio of each person by tenure band, shaped by range position"
            onSelect={personRow}
          />
        </Figure>
      </Section>

      <Section
        title="Outside the range"
        dek="People paid below the minimum or above the maximum of their salary range. Amounts appear only with Show pay amounts on."
      >
        <Figure
          id="comp-below-minimum"
          uses={m.uses['comp-below-minimum']}
          metric={FIGURE_METRIC['comp-below-minimum']}
          title="Below range minimum"
          subtitle={`Largest gap first, as of ${asOf}`}
          data={r.below}
          columns={belowColumns}
          definitions={m.definitions['comp-below-minimum']}
          note={`${note(m, r.below.length, 'people', m.showPay)}${cost}${promoted}`}
          tableOnly
          table={{
            rowTone: gapTone(m.rules.increaseToMin.largeGap),
            search: 'Search people',
            maxRows: 12,
            onRowClick: personRow,
          }}
          empty={emptyIf(r.below, noRanges, 'Nobody in this scope is paid below range minimum.')}
        />
        <Figure
          id="comp-above-maximum"
          uses={m.uses['comp-above-maximum']}
          metric={FIGURE_METRIC['comp-above-maximum']}
          title="Above range maximum"
          subtitle={`Largest overage first, as of ${asOf}`}
          data={r.above}
          columns={outsideColumns(m, 'above')}
          definitions={m.definitions['comp-above-maximum']}
          note={note(m, r.above.length, 'people', m.showPay)}
          tableOnly
          table={{ search: 'Search people', maxRows: 12, onRowClick: personRow }}
          empty={emptyIf(r.above, noRanges, 'Nobody in this scope is paid above range maximum.')}
        />
      </Section>

      <Section
        title="Pay compression"
        dek="New hires against people already in the same department and level. When this year's offers land above the people doing the job today, incumbents fall behind the market the company is paying."
      >
        <Figure
          id="comp-compression"
          uses={m.uses['comp-compression']}
          metric={FIGURE_METRIC['comp-compression']}
          title="New hires vs incumbents"
          subtitle={`Median compa-ratio by department and level, hired in the last 12 months vs before, as of ${asOf}`}
          data={r.compression}
          columns={compressionColumns(m)}
          definitions={m.definitions['comp-compression']}
          note={`${fmt(r.compression.length, 'int')} department and level pairs with ${sides} or more people on each side${r.compression.length > COMPRESSION_SHOWN ? `; the chart shows the ${COMPRESSION_SHOWN} largest gaps and the table has them all` : ''} · ${asOfNote(m)}`}
          empty={emptyIf(
            r.compression,
            null,
            `No department and level has ${sides} or more new hires and incumbents.`,
          )}
        >
          <Dumbbell
            rows={r.compression.slice(0, COMPRESSION_SHOWN)}
            ariaLabel="Median compa-ratio of new hires and incumbents"
            onSelect={(row, side) => drill(compressionDrill(m, row, side))}
          />
        </Figure>
      </Section>
    </div>
  )
}
