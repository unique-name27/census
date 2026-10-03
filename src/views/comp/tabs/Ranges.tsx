/** Range position: penetration by level, compa-ratio by tenure, who is outside the range, compression. */
import { DotStrip, Figure, RangeBars } from '@/charts'
import type { Severity } from '@/components'
import { Section } from '@/components'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { Dumbbell } from '../charts/Dumbbell'
import {
  ABOVE_MAX_COLUMNS,
  BELOW_MIN_COLUMNS,
  COMPRESSION_COLUMNS,
  DEF_COMPA,
  DEF_COMPRESSION,
  DEF_FX,
  DEF_PENETRATION,
  DEF_POPULATION,
  DEF_POSITION,
  PENETRATION_COLUMNS,
  TENURE_DOT_COLUMNS,
} from '../columns'
import type { CompModel } from '../engine/model'
import { type OutsideRangeRow, TENURE_ORDER, type TenureDot } from '../engine/ranges'
import { emptyIf, MISSING, note } from '../shared'

const positionTone = (d: TenureDot) =>
  d.position === 'Below minimum' ? 'serious' : d.position === 'Above maximum' ? 'warning' : 'default'

const COMPRESSION_SHOWN = 20

const gapTone = (r: OutsideRangeRow): Severity => (r.gapPct >= 0.1 ? 'critical' : 'warning')

export function Ranges({ m }: { m: CompModel }) {
  const r = m.ranges
  const asOf = formatDate(m.asOf)
  const noRanges = m.pop.has.ranges ? null : MISSING.ranges
  const cost =
    m.showPay && r.below.length
      ? ` · ${fmt(r.costToMin.usd, 'money')} a year to bring everyone to minimum`
      : ''

  return (
    <div>
      <Section
        title="Position in the range"
        dek={`How far into their salary range people sit, by level and by tenure, as of ${asOf}. Long tenure high in the range and new arrivals low in it are both worth a look.`}
      >
        <Figure
          id="comp-penetration-by-level"
          title="Range penetration by level"
          subtitle="Box from the 25th to the 75th percentile, line from the 10th to the 90th, tick at the median"
          data={r.penetration}
          columns={PENETRATION_COLUMNS}
          definitions={[DEF_PENETRATION, DEF_POPULATION]}
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
          />
        </Figure>
        <Figure
          id="comp-compa-by-tenure"
          title="Compa-ratio by tenure"
          subtitle={`One dot per person, tick at the median, as of ${asOf}`}
          data={r.tenure}
          columns={TENURE_DOT_COLUMNS}
          definitions={[DEF_COMPA, DEF_POSITION]}
          note={note(m, r.tenure.length)}
          span={5}
          empty={emptyIf(r.tenure, null, 'No compa-ratios in this scope.')}
        >
          <DotStrip
            data={r.tenure}
            x="compa"
            y="tenureBand"
            id="id"
            label="name"
            xFormat="ratio"
            yOrder={TENURE_ORDER}
            tone={positionTone}
            ref={{ value: 1, label: 'Midpoint' }}
            median
          />
        </Figure>
      </Section>

      <Section
        title="Outside the range"
        dek="People paid below the minimum or above the maximum of their salary range. Amounts appear only with Show pay amounts on."
      >
        <Figure
          id="comp-below-minimum"
          title="Below range minimum"
          subtitle={`Largest gap first, as of ${asOf}`}
          data={r.below}
          columns={BELOW_MIN_COLUMNS}
          definitions={[
            DEF_POSITION,
            {
              term: 'Increase to minimum',
              text: 'The raise that brings base salary up to the range minimum.',
              formula: '(rangeMin − base) ÷ base',
            },
            DEF_FX,
          ]}
          note={`${note(m, r.below.length, 'people', m.showPay)}${cost}`}
          tableOnly
          table={{ rowTone: gapTone, search: 'Search people', maxRows: 12 }}
          empty={emptyIf(r.below, noRanges, 'Nobody in this scope is paid below range minimum.')}
        />
        <Figure
          id="comp-above-maximum"
          title="Above range maximum"
          subtitle={`Largest overage first, as of ${asOf}`}
          data={r.above}
          columns={ABOVE_MAX_COLUMNS}
          definitions={[
            DEF_POSITION,
            {
              term: 'Over maximum',
              text: 'How far base salary sits above the range maximum.',
              formula: '(base − rangeMax) ÷ rangeMax',
            },
            DEF_FX,
          ]}
          note={note(m, r.above.length, 'people', m.showPay)}
          tableOnly
          table={{ rowTone: () => 'warning', search: 'Search people', maxRows: 12 }}
          empty={emptyIf(r.above, noRanges, 'Nobody in this scope is paid above range maximum.')}
        />
      </Section>

      <Section
        title="Pay compression"
        dek="New hires against people already in the same department and level. When this year's offers land above the people doing the job today, incumbents fall behind the market the company is paying."
      >
        <Figure
          id="comp-compression"
          title="New hires vs incumbents"
          subtitle={`Median compa-ratio by department and level, hired in the last 12 months vs before, as of ${asOf}`}
          data={r.compression}
          columns={COMPRESSION_COLUMNS}
          definitions={[DEF_COMPRESSION, DEF_COMPA]}
          note={`${fmt(r.compression.length, 'int')} department and level pairs with 5 or more people on each side${r.compression.length > COMPRESSION_SHOWN ? `; the chart shows the ${COMPRESSION_SHOWN} largest gaps and the table has them all` : ''} · as of ${asOf}`}
          empty={emptyIf(
            r.compression,
            null,
            'No department and level has 5 or more new hires and incumbents.',
          )}
        >
          <Dumbbell
            rows={r.compression.slice(0, COMPRESSION_SHOWN)}
            ariaLabel="Median compa-ratio of new hires and incumbents"
          />
        </Figure>
      </Section>
    </div>
  )
}
