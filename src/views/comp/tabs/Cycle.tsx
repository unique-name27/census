/** Merit cycle: spend against budget, the merit distribution, exceptions, promotions and the rewards mix. */
import { BarList, Figure, HBars, Histogram } from '@/charts'
import { KpiStrip, Section, type Severity } from '@/components'
import { LEVELS } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import {
  budgetDefinition,
  DEF_EXCEPTIONS,
  DEF_FX,
  DEF_LATEST_RATING,
  DEF_SPEND,
  EXCEPTION_COLUMNS,
  guidelineDefinition,
  MERIT_BIN_COLUMNS,
  MIX_COLUMNS,
  PROMOTION_COLUMNS,
  SPEND_COLUMNS,
} from '../columns'
import { type ExceptionRow, OVER_BUDGET, type SpendRow } from '../engine/cycle'
import { smallSpend } from '../engine/kpis'
import { type CompModel, MERIT_STEP } from '../engine/model'
import { pts2 } from '../engine/text'
import { emptyIf, MISSING, note } from '../shared'
import { edges } from './Overview'

const spendTone = (d: SpendRow) => (d.delta != null && d.delta >= OVER_BUDGET ? 'warning' : 'default')
const spendGap = (d: SpendRow) => (d.delta == null ? null : pts2(d.delta))
const pct2 = (v: number | null) => fmt(v, 'pct2')
const exceptionTone = (r: ExceptionRow): Severity => (r.kind === 'outlier' ? 'info' : 'warning')
const MIX_SERIES = ['Base', 'Target bonus', 'Equity']

export function Cycle({ m }: { m: CompModel }) {
  const c = m.cycle
  const s = m.settings
  const asOf = formatDate(m.asOf)
  const noMerit = m.pop.has.merit ? null : MISSING.merit
  const merits = m.pop.people.map((p) => p.merit).filter((v): v is number => v != null)
  const mixChart = c.mix.flatMap((r) =>
    [
      { level: r.level, part: 'Base', share: r.base },
      { level: r.level, part: 'Target bonus', share: r.bonus },
      { level: r.level, part: 'Equity', share: r.equity },
    ].filter((x) => x.share != null),
  )
  // Totals over 1-4 proposals would give away individual merit: no overall rate or amount.
  const hide = smallSpend(c.spend)
  const overall = hide || c.spend.spendPct == null ? '' : ` · ${pct2(c.spend.spendPct)} overall`
  const money =
    !hide && m.showPay && c.spend.overUsd != null
      ? ` · ${fmt(Math.abs(c.spend.overUsd), 'money')} ${c.spend.overUsd > 0 ? 'over' : 'under'} budget`
      : ''

  return (
    <div>
      <KpiStrip kpis={c.kpis} id="comp-cycle-figures" title="Merit cycle figures" />

      <Section
        title="Spend against budget"
        dek={`Merit proposals as a share of eligible base salary in USD, against the ${pct2(s.meritBudget)} budget from Cycle settings. Promotion increases are kept apart.`}
      >
        <Figure
          id="comp-spend-by-bu"
          title="Merit spend by business unit"
          subtitle={`Σ merit ÷ Σ eligible base, USD, this cycle against the ${pct2(s.meritBudget)} budget`}
          data={c.byBu}
          columns={SPEND_COLUMNS}
          definitions={[DEF_SPEND, budgetDefinition(s), DEF_FX]}
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
            tone={spendTone}
            secondary={spendGap}
          />
        </Figure>
        <Figure
          id="comp-merit-distribution"
          title="Merit distribution"
          subtitle="Proposed merit % per person, this cycle"
          data={c.hist}
          columns={MERIT_BIN_COLUMNS}
          definitions={[DEF_SPEND, guidelineDefinition(s)]}
          note={`${note(m, merits.length, 'proposals')}${c.spend.meanMerit == null ? '' : ` · mean ${pct2(c.spend.meanMerit)}`}`}
          span={6}
          empty={emptyIf(c.hist, noMerit, 'No merit proposals in this scope.')}
        >
          <Histogram
            values={merits}
            thresholds={edges(c.histDomain, MERIT_STEP)}
            domain={c.histDomain ?? undefined}
            format="pct2"
            refs={[{ value: s.meritBudget, label: `Budget ${pct2(s.meritBudget)}` }]}
            unit="proposals"
          />
        </Figure>
      </Section>

      <Section
        title="Exceptions"
        dek="Proposals that break the guideline rules come first, then proposals that are unusual for the rating, judged against everyone with the same rating across the company."
      >
        <Figure
          id="comp-guideline-exceptions"
          title="Guideline exceptions"
          subtitle={`Rule breaks first, then the largest gaps to the guideline, as of ${asOf}`}
          data={c.exceptions}
          columns={EXCEPTION_COLUMNS}
          definitions={[DEF_EXCEPTIONS, guidelineDefinition(s), DEF_LATEST_RATING]}
          note={note(m, c.exceptions.length, 'proposals')}
          tableOnly
          table={{ rowTone: exceptionTone, search: 'Search people or departments', maxRows: 15 }}
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
          title="Promotions in this cycle"
          subtitle="Promotion increases proposed this cycle, kept apart from merit"
          data={c.promotions.rows}
          columns={PROMOTION_COLUMNS}
          definitions={[
            {
              term: 'Promotion %',
              text: 'The promotion increase proposed this cycle. It is reported on its own and left out of merit spend and merit checks.',
            },
            DEF_LATEST_RATING,
          ]}
          note={note(m, c.promotions.rows.length)}
          span={6}
          tableOnly
          table={{ search: 'Search people', maxRows: 12 }}
          empty={emptyIf(c.promotions.rows, null, MISSING.promotion)}
        />
        <Figure
          id="comp-rewards-mix"
          title="Total rewards mix by level"
          subtitle="Share of target pay from base, target bonus and annual equity, USD"
          data={c.mix}
          columns={MIX_COLUMNS}
          definitions={[
            {
              term: 'Target pay',
              text: 'Base salary plus target bonus plus annualized equity, all in US dollars. Shares only, so no amounts are shown.',
              formula: 'base + base × target bonus % + annual equity',
            },
            DEF_FX,
          ]}
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
          />
        </Figure>
      </Section>
    </div>
  )
}
