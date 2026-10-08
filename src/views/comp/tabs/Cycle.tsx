/**
 * Merit cycle: the cycle's dates and progress (proposals entered as a share of eligible people),
 * spend against budget, the merit distribution, exceptions, promotions and the rewards mix.
 * Tiles, bars, bins, segments and counts open the proposals behind them with merit %; a person's
 * row opens their card.
 */
import { BarList, BulletList, Figure, HBars, Histogram } from '@/charts'
import { KpiStrip, Section, type Severity } from '@/components'
import { LEVELS } from '@/data/schema'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { PROGRESS_COLUMNS } from '../columns'
import {
  binColumns,
  binItems,
  exceptionColumns,
  mixColumns,
  progressColumns,
  promotionColumns,
  spendColumns,
} from '../drillColumns'
import { type ExceptionRow, PROGRESS_STATUS_LABEL, type ProgressRow, type SpendRow } from '../engine/cycle'
import { cycleDatesSentence, FIGURE_METRIC } from '../engine/definitions'
import { meritBinDrill, mixDrill, progressDrill, spendDrill } from '../engine/drill'
import { smallSpend } from '../engine/kpis'
import { type CompModel, MERIT_STEP } from '../engine/model'
import { pts2 } from '../engine/text'
import { emptyIf, MISSING, note } from '../shared'
import { edges } from './Overview'

/** Business units over budget by the flag gap or more ('comp.merit.overBudget') are marked. */
const spendTone = (flag: number) => (d: SpendRow) =>
  d.delta != null && d.delta >= flag ? 'warning' : 'default'
const spendGap = (d: SpendRow) => (d.delta == null ? null : pts2(d.delta))
const pct2 = (v: number | null) => fmt(v, 'pct2')
const exceptionTone = (r: ExceptionRow): Severity => (r.kind === 'outlier' ? 'info' : 'warning')
const MIX_SERIES = ['Base', 'Target bonus', 'Equity']
/** Person rows open that person's card. */
const personRow = (r: { id: string }) => openPerson(r.id)

/** A progress row with its status in words, for the table and every export. */
export const progressRows = (m: CompModel) =>
  m.cycle.progress.rows.map((r) => ({ ...r, statusLabel: r.status ? PROGRESS_STATUS_LABEL[r.status] : null }))

/**
 * Merit cycle progress by business unit: proposals entered against 100% of eligible people, spend
 * against budget as each row's status. Compensation's home reuses it (`home-comp-cycle`).
 */
export function ProgressChart({ m, rows }: { m: CompModel; rows: readonly ProgressRow[] }) {
  return (
    <BulletList
      data={rows}
      label="group"
      value="share"
      target={() => 1}
      format={(_, v) => fmt(v, 'pct')}
      scale="shared"
      status={(r) =>
        r.status === 'over'
          ? { tone: 'warning', label: PROGRESS_STATUS_LABEL.over }
          : r.status === 'within'
            ? { tone: 'good', label: PROGRESS_STATUS_LABEL.within }
            : null
      }
      onSelect={(r) => drill(progressDrill(m, r))}
    />
  )
}

/** "1,299 of 1,299 eligible people have a proposal · eligible if hired by 30 Mar 2026 · as of 30 Sep 2026" */
function progressNote(m: CompModel): string {
  const t = m.cycle.progress.total
  const cal = m.cycle.calendar
  const parts = [`${fmt(t.proposed, 'int')} of ${fmt(t.eligible, 'int')} eligible have a proposal`]
  if (cal.cutoff)
    parts.push(
      `eligible if hired by ${formatDate(cal.cutoff)}${cal.cutoffInferred ? ', the latest hire with a proposal' : ''}`,
    )
  parts.push(`as of ${formatDate(m.asOf)}`)
  return parts.join(' · ')
}

export function Cycle({ m }: { m: CompModel }) {
  const c = m.cycle
  const s = m.settings
  const asOf = formatDate(m.asOf)
  const noMerit = m.pop.has.merit ? null : MISSING.merit
  const merits = c.hist.reduce((a, b) => a + b.n, 0)
  const lastBin = c.hist.length - 1
  const mixRow = new Map(c.mix.map((r) => [r.level, r]))
  const onMix = (d: { level: string; part: string | null }) => {
    const row = mixRow.get(d.level)
    if (row) drill(mixDrill(m, row, d.part))
  }
  const mixChart = c.mix.flatMap((r) =>
    [
      { level: r.level, part: 'Base', share: r.base },
      { level: r.level, part: 'Target bonus', share: r.bonus },
      { level: r.level, part: 'Equity', share: r.equity },
    ].filter((x) => x.share != null),
  )
  // Totals over fewer proposals than the anonymity minimum would give away individual merit: no
  // overall rate or amount.
  const hide = smallSpend(c.spend, m.rules.minGroup)
  const overall = hide || c.spend.spendPct == null ? '' : ` · ${pct2(c.spend.spendPct)} overall`
  const money =
    !hide && m.showPay && c.spend.overUsd != null
      ? ` · ${fmt(Math.abs(c.spend.overUsd), 'money')} ${c.spend.overUsd > 0 ? 'over' : 'under'} budget`
      : ''

  const progress = progressRows(m)
  return (
    <div>
      <KpiStrip kpis={c.kpis} id="comp-cycle-figures" title="Merit cycle figures" />

      <Section
        title="Progress and spend"
        dek={`${cycleDatesSentence(m.rules)}${m.cycle.calendar.close ? '' : ' Set the dates in Settings, Compensation cycle.'} Merit proposals are weighed against eligible base salary in USD and the ${pct2(s.meritBudget)} merit budget; promotion increases are kept apart.`}
      >
        <Figure
          id="comp-cycle-progress"
          uses={m.uses['comp-cycle-progress']}
          metric={FIGURE_METRIC['comp-cycle-progress']}
          title="Merit cycle progress"
          subtitle="Proposals entered as a share of eligible people, by business unit, with spend against budget"
          data={progress}
          columns={progressColumns(m, PROGRESS_COLUMNS)}
          definitions={m.definitions['comp-cycle-progress']}
          note={progressNote(m)}
          span={6}
          empty={emptyIf(progress, noMerit, 'No one in this scope is eligible this cycle.')}
        >
          <ProgressChart m={m} rows={progress} />
        </Figure>
        <Figure
          id="comp-spend-by-bu"
          uses={m.uses['comp-spend-by-bu']}
          metric={FIGURE_METRIC['comp-spend-by-bu']}
          title="Merit spend by business unit"
          subtitle={`Σ merit ÷ Σ eligible base, USD, this cycle against the ${pct2(s.meritBudget)} budget`}
          data={c.byBu}
          columns={spendColumns(m)}
          definitions={m.definitions['comp-spend-by-bu']}
          note={`${note(m, c.spend.eligible, 'proposals', true)}${overall}${money}`}
          span={6}
          empty={emptyIf(c.byBu, noMerit, 'No merit proposals in this scope.')}
        >
          <BarList
            data={c.byBu}
            label="group"
            value="spendPct"
            format="pct2"
            ref={{ value: s.meritBudget, label: `Budget ${pct2(s.meritBudget)}` }}
            glyphTone={spendTone(m.rules.overBudget.flag)}
            secondary={spendGap}
            onSelect={(d) => drill(spendDrill(m, d, 'priced'))}
          />
        </Figure>
        <Figure
          id="comp-merit-distribution"
          uses={m.uses['comp-merit-distribution']}
          metric={FIGURE_METRIC['comp-merit-distribution']}
          title="Merit distribution"
          subtitle="Proposed merit % per person, this cycle"
          data={c.hist}
          columns={binColumns(m, c.hist, 'merit')}
          definitions={m.definitions['comp-merit-distribution']}
          note={`${note(m, merits, 'proposals')}${c.spend.meanMerit == null ? '' : ` · mean ${pct2(c.spend.meanMerit)}`}`}
          span={12}
          empty={emptyIf(c.hist, noMerit, 'No merit proposals in this scope.')}
        >
          <Histogram
            data={binItems(c.hist)}
            value="v"
            thresholds={edges(c.histDomain, MERIT_STEP)}
            domain={c.histDomain ?? undefined}
            format="pct2"
            refs={[{ value: s.meritBudget, label: `Budget ${pct2(s.meritBudget)}` }]}
            unit="proposals"
            onSelect={(b) => {
              const i = b.rows[0]?.bin
              if (i != null) drill(meritBinDrill(m, c.hist[i], i === lastBin))
            }}
          />
        </Figure>
      </Section>

      <Section
        title="Exceptions"
        dek="Proposals that break the guideline rules come first, then proposals that are unusual for the rating, judged against everyone with the same rating across the company."
      >
        <Figure
          id="comp-guideline-exceptions"
          uses={m.uses['comp-guideline-exceptions']}
          metric={FIGURE_METRIC['comp-guideline-exceptions']}
          title="Guideline exceptions"
          subtitle={`Rule breaks first, then the largest gaps to the guideline, as of ${asOf}`}
          data={c.exceptions}
          columns={exceptionColumns(m)}
          definitions={m.definitions['comp-guideline-exceptions']}
          note={note(m, c.exceptions.length, 'proposals')}
          tableOnly
          table={{
            rowTone: exceptionTone,
            search: 'Search people or departments',
            maxRows: 15,
            onRowClick: personRow,
          }}
          empty={emptyIf(
            c.exceptions,
            noMerit ?? (m.pop.has.reviews ? null : MISSING.reviews),
            'No exceptions in this scope.',
          )}
        />
      </Section>

      <Section
        title="Promotions and total rewards"
        dek="Promotion increases proposed this cycle, and how target pay splits between base, bonus and equity at each level."
      >
        <Figure
          id="comp-promotions"
          uses={m.uses['comp-promotions']}
          metric={FIGURE_METRIC['comp-promotions']}
          title="Promotions in this cycle"
          subtitle="Promotion increases proposed this cycle, kept apart from merit"
          data={c.promotions.rows}
          columns={promotionColumns(m)}
          definitions={m.definitions['comp-promotions']}
          note={note(m, c.promotions.rows.length)}
          span={6}
          tableOnly
          table={{ search: 'Search people', maxRows: 12, onRowClick: personRow }}
          empty={emptyIf(c.promotions.rows, null, MISSING.promotion)}
        />
        <Figure
          id="comp-rewards-mix"
          uses={m.uses['comp-rewards-mix']}
          metric={FIGURE_METRIC['comp-rewards-mix']}
          title="Total rewards mix by level"
          subtitle="Share of target pay from base, target bonus and annual equity, USD"
          data={c.mix}
          columns={mixColumns(m)}
          definitions={m.definitions['comp-rewards-mix']}
          note={note(
            m,
            c.mix.reduce((a, r) => a + r.n, 0),
            'people',
            true,
          )}
          span={6}
          empty={emptyIf(
            c.mix,
            m.pop.has.bonusTarget ? null : MISSING.bonusTarget,
            'No target pay data in this scope.',
          )}
        >
          <HBars
            data={mixChart}
            y="level"
            x="share"
            series="part"
            stack
            seriesOrder={MIX_SERIES}
            yOrder={LEVELS}
            format="pct"
            xDomain={[0, 1]}
            labels
            onSelect={(d) => onMix({ level: d.level, part: null })}
            onSelectSegment={onMix}
          />
        </Figure>
      </Section>
    </div>
  )
}
