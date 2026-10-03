/** Overview: headline tiles, the readout, the compa-ratio distribution and where pay sits. */
import { BarList, Figure, Histogram, type RefLine } from '@/charts'
import { Grid, KpiStrip, Readout, Section } from '@/components'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { PositionBars } from '../charts/PositionBars'
import {
  BIN_COLUMNS,
  bandDefinition,
  COMPA_BY_DEPARTMENT,
  COMPA_BY_LEVEL,
  COMPA_BY_LOCATION,
  DEF_COMPA,
  DEF_POPULATION,
  DEF_POSITION,
  PERSON_COLUMNS,
  POSITION_COLUMNS,
} from '../columns'
import { isLowCompa, LOW_COMPA } from '../engine/findings'
import { COMPA_STEP, type CompModel } from '../engine/model'
import type { CompaGroupRow } from '../engine/ranges'
import { emptyIf, MISSING, note } from '../shared'

/** Interior bin edges on the step grid; the domain supplies the outer two. */
export function edges(domain: [number, number] | null, step: number): number[] {
  if (!domain) return []
  const out: number[] = []
  for (let x = domain[0] + step; x < domain[1] - step / 2; x += step) out.push(Math.round(x * 1e6) / 1e6)
  return out
}

const lowTone = (d: CompaGroupRow) => (isLowCompa(d.median) ? 'serious' : 'default')
const nText = (d: { n: number }) => `n = ${fmt(d.n, 'int')}`

export function companyRef(m: CompModel): RefLine | undefined {
  const v = m.overview.companyMedian
  return v == null ? undefined : { value: v, label: `Company ${fmt(v, 'ratio')}` }
}

export function Overview({ m }: { m: CompModel }) {
  const s = m.settings
  const o = m.overview
  const asOf = formatDate(m.asOf)
  const n = o.people.length
  const refs: RefLine[] = [{ value: 1, label: 'Midpoint 1.00' }]
  if (!m.isCompany && o.companyMedian != null)
    refs.push({ value: o.companyMedian, label: `Company ${fmt(o.companyMedian, 'ratio')}` })
  // A total row only adds information when there is more than one business unit to compare.
  const positionRows = o.positionByBu.length > 1 ? [o.positionAll, ...o.positionByBu] : o.positionByBu
  const compas = o.people.map((p) => p.compa).filter((v): v is number => v != null)

  return (
    <div>
      <Grid>
        <KpiStrip kpis={m.kpis} />
        <Readout findings={m.findings} span={4} emptyText="Nothing stands out in this scope." />
        <Figure
          id="comp-compa-distribution"
          title="Compa-ratio distribution"
          subtitle={`Base salary ÷ range midpoint, active employees as of ${asOf}`}
          data={o.hist}
          columns={BIN_COLUMNS}
          definitions={[DEF_COMPA, bandDefinition(s), DEF_POPULATION]}
          note={`${note(m, n)} · ${fmt(o.median, 'ratio')} median`}
          span={8}
          empty={emptyIf(o.hist, null, 'No compa-ratios in this scope.')}
          detail={{ label: 'People', columns: PERSON_COLUMNS, rows: () => o.people }}
        >
          <Histogram
            values={compas}
            thresholds={edges(o.histDomain, COMPA_STEP)}
            domain={o.histDomain ?? undefined}
            format="ratio"
            band={[s.bandLow, s.bandHigh]}
            bandLabel={`Healthy band ${fmt(s.bandLow, 'ratio')}-${fmt(s.bandHigh, 'ratio')}`}
            refs={refs}
            height={260}
            ariaLabel="Histogram of compa-ratios"
          />
        </Figure>
      </Grid>

      <Section
        title="Where pay sits"
        dek={`Position in the salary range and median compa-ratio by business unit, location, level and department, as of ${asOf}. Orange bars with a square marker sit at a median of ${fmt(LOW_COMPA, 'ratio')} or lower.`}
      >
        <Figure
          id="comp-position-by-bu"
          title="Range position by business unit"
          subtitle="Share of people below minimum, in each quarter of the range and above maximum"
          data={positionRows}
          columns={POSITION_COLUMNS}
          definitions={[DEF_POSITION, DEF_POPULATION]}
          note={note(m, o.positionAll.n)}
          span={7}
          empty={emptyIf(
            positionRows,
            m.pop.has.ranges ? null : MISSING.ranges,
            'No range data in this scope.',
          )}
        >
          <PositionBars rows={positionRows} ariaLabel="Range position by business unit" />
        </Figure>
        <Figure
          id="comp-compa-by-location"
          title="Median compa-ratio by location"
          subtitle={`Lowest first, as of ${asOf}`}
          data={o.byLocation}
          columns={COMPA_BY_LOCATION}
          definitions={[DEF_COMPA, DEF_POPULATION]}
          note={note(m, n)}
          span={5}
          empty={emptyIf(o.byLocation, null, 'No compa-ratios in this scope.')}
        >
          <BarList
            data={o.byLocation}
            label="group"
            value="median"
            format="ratio"
            sort="asc"
            ref={companyRef(m)}
            tone={lowTone}
            secondary={nText}
          />
        </Figure>
        <Figure
          id="comp-compa-by-level"
          title="Median compa-ratio by level"
          subtitle={`In level order, as of ${asOf}`}
          data={o.byLevel}
          columns={COMPA_BY_LEVEL}
          definitions={[DEF_COMPA, DEF_POPULATION]}
          note={note(m, n)}
          span={5}
          empty={emptyIf(o.byLevel, null, 'No compa-ratios in this scope.')}
        >
          <BarList
            data={o.byLevel}
            label="group"
            value="median"
            format="ratio"
            sort="none"
            ref={companyRef(m)}
            tone={lowTone}
            secondary={nText}
          />
        </Figure>
        <Figure
          id="comp-compa-by-department"
          title="Median compa-ratio by department"
          subtitle={`Lowest first, as of ${asOf}`}
          data={o.byDepartment}
          columns={COMPA_BY_DEPARTMENT}
          definitions={[DEF_COMPA, DEF_POPULATION]}
          note={note(m, n)}
          span={7}
          empty={emptyIf(o.byDepartment, null, 'No compa-ratios in this scope.')}
        >
          <BarList
            data={o.byDepartment}
            label="group"
            value="median"
            format="ratio"
            sort="asc"
            ref={companyRef(m)}
            tone={lowTone}
            secondary={nText}
            rowHeight={26}
          />
        </Figure>
      </Section>
    </div>
  )
}
