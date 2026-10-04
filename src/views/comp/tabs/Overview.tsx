/**
 * Overview: headline tiles, the readout, the compa-ratio distribution and where pay sits. Every
 * tile, bar, bin, segment and table count opens the people behind it.
 */
import { BarList, Figure, Histogram, type RefLine } from '@/charts'
import { cx, Grid, KpiStrip, Readout, Section } from '@/components'
import { drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { spanClass } from '@/lib/spans'
import { PositionBars } from '../charts/PositionBars'
import { PERSON_COLUMNS } from '../columns'
import { binColumns, binItems, compaGroupColumns, positionColumns } from '../drillColumns'
import { FIGURE_METRIC } from '../engine/definitions'
import { compaBinDrill, compaGroupDrill, positionDrill } from '../engine/drill'
import { COMPA_STEP, type CompModel } from '../engine/model'
import type { CompaGroupRow } from '../engine/ranges'
import { lowCompaAt } from '../engine/rules'
import { emptyIf, MISSING, note } from '../shared'

/** Interior bin edges on the step grid; the domain supplies the outer two. */
export function edges(domain: [number, number] | null, step: number): number[] {
  if (!domain) return []
  const out: number[] = []
  for (let x = domain[0] + step; x < domain[1] - step / 2; x += step) out.push(Math.round(x * 1e6) / 1e6)
  return out
}

/** Bars at or below the low compa-ratio threshold ('comp.compa.lowGroup') are marked. */
const lowTone = (threshold: number) => (d: CompaGroupRow) =>
  lowCompaAt(d.median, threshold) ? 'serious' : 'default'
const nText = (d: { n: number }) => `n = ${fmt(d.n, 'int')}`

/** Click-to-drill on a compa-ratio group (a bar of a BarList). */
const compaBar = (m: CompModel) => (d: CompaGroupRow) => drill(compaGroupDrill(m, d, 'measured'))

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
  const lastBin = o.hist.length - 1
  const low = m.rules.lowCompa.threshold
  const tone = lowTone(low)

  const location = (
    <Figure
      id="comp-compa-by-location"
      uses={m.uses['comp-compa-by-location']}
      metric={FIGURE_METRIC['comp-compa-by-location']}
      title="Median compa-ratio by location"
      subtitle={`Lowest first; a square marks ${fmt(low, 'ratio')} or lower, as of ${asOf}`}
      data={o.byLocation}
      columns={compaGroupColumns('Location', m)}
      definitions={m.definitions['comp-compa-by-location']}
      note={note(m, n)}
      empty={emptyIf(o.byLocation, null, 'No compa-ratios in this scope.')}
    >
      <BarList
        data={o.byLocation}
        label="group"
        value="median"
        format="ratio"
        sort="asc"
        ref={companyRef(m)}
        tone={tone}
        secondary={nText}
        onSelect={compaBar(m)}
      />
    </Figure>
  )

  return (
    <div>
      <Grid>
        <KpiStrip kpis={m.kpis} />
        <Readout findings={m.findings} span={4} emptyText="Nothing stands out in this scope." />
        {/* The readout runs long; the lead figure and the two that explain it stack beside it
            instead of one chart stretching to the readout's height. */}
        <div className={cx(spanClass(8), 'grid content-start gap-4')}>
          <Figure
            id="comp-compa-distribution"
            uses={m.uses['comp-compa-distribution']}
            metric={FIGURE_METRIC['comp-compa-distribution']}
            title="Compa-ratio distribution"
            subtitle={`People per ${fmt(COMPA_STEP, 'ratio')} of compa-ratio (base salary ÷ range midpoint), active employees as of ${asOf}`}
            data={o.hist}
            columns={binColumns(m, o.hist, 'compa')}
            definitions={m.definitions['comp-compa-distribution']}
            note={`${note(m, n)}${o.median == null ? '' : ` · ${fmt(o.median, 'ratio')} median`}`}
            empty={emptyIf(o.hist, null, 'No compa-ratios in this scope.')}
            detail={{ label: 'People', columns: PERSON_COLUMNS, rows: () => o.people }}
          >
            <Histogram
              data={binItems(o.hist)}
              value="v"
              thresholds={edges(o.histDomain, COMPA_STEP)}
              domain={o.histDomain ?? undefined}
              format="ratio"
              band={[s.bandLow, s.bandHigh]}
              bandLabel={`Healthy band ${fmt(s.bandLow, 'ratio')}-${fmt(s.bandHigh, 'ratio')}`}
              refs={refs}
              height={260}
              unit="people"
              ariaLabel="Histogram of compa-ratios"
              onSelect={(b) => {
                const i = b.rows[0]?.bin
                if (i != null) drill(compaBinDrill(m, o.hist[i], i === lastBin))
              }}
            />
          </Figure>
          <Figure
            id="comp-position-by-bu"
            uses={m.uses['comp-position-by-bu']}
            metric={FIGURE_METRIC['comp-position-by-bu']}
            title="Range position by business unit"
            subtitle="Share of people below minimum, in each quarter of the range and above maximum"
            data={positionRows}
            columns={positionColumns(m)}
            definitions={m.definitions['comp-position-by-bu']}
            note={note(m, o.positionAll.n)}
            empty={emptyIf(
              positionRows,
              m.pop.has.ranges ? null : MISSING.ranges,
              'No range data in this scope.',
            )}
          >
            <PositionBars
              rows={positionRows}
              ariaLabel="Range position by business unit"
              onSelect={(row, pos) => drill(positionDrill(m, row, pos))}
            />
          </Figure>
          {location}
        </div>
      </Grid>

      <Section
        title="Where pay sits"
        dek={`Median compa-ratio by level and department, as of ${asOf}. Orange bars with a square marker sit at a median of ${fmt(low, 'ratio')} or lower.`}
      >
        <Figure
          id="comp-compa-by-level"
          uses={m.uses['comp-compa-by-level']}
          metric={FIGURE_METRIC['comp-compa-by-level']}
          title="Median compa-ratio by level"
          subtitle={`In level order, as of ${asOf}`}
          data={o.byLevel}
          columns={compaGroupColumns('Level', m)}
          definitions={m.definitions['comp-compa-by-level']}
          note={note(m, n)}
          span={5}
          // Shorter than the department list beside it: end the sheet at its content.
          className="self-start"
          empty={emptyIf(o.byLevel, null, 'No compa-ratios in this scope.')}
        >
          <BarList
            data={o.byLevel}
            label="group"
            value="median"
            format="ratio"
            sort="none"
            ref={companyRef(m)}
            tone={tone}
            secondary={nText}
            onSelect={compaBar(m)}
          />
        </Figure>
        <Figure
          id="comp-compa-by-department"
          uses={m.uses['comp-compa-by-department']}
          metric={FIGURE_METRIC['comp-compa-by-department']}
          title="Median compa-ratio by department"
          subtitle={`Lowest first, as of ${asOf}`}
          data={o.byDepartment}
          columns={compaGroupColumns('Department', m)}
          definitions={m.definitions['comp-compa-by-department']}
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
            tone={tone}
            secondary={nText}
            rowHeight={26}
            onSelect={compaBar(m)}
          />
        </Figure>
      </Section>
    </div>
  )
}
