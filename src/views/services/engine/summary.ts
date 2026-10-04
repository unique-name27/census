/**
 * What the People scorecard reads from HR ops (`ViewDef.summary`): the three measures the
 * practice is judged on (resolution SLA met, transactions on time, final pay on time, each with
 * its metric's target in the dictionary) and the view's readout, ranked. Leave findings join the
 * readout except the HR-only one, and they name no one here.
 *
 * Computed from the cached model (`computeCached`), so the scorecard, the Action center and the
 * view share one computation per context.
 */
import type { Finding, Kpi, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { fmt } from '@/lib/format'
import type { ViewSummary } from '@/views/types'
import { levelMetric } from '../metrics'
import { drillWhen, onTimeDrill } from './drills'
import { tagKpis } from './drillUses'
import { dueIn, onTimeRate, type TxFact } from './facts'
import { computeCached, type ServicesModel } from './index'
import { rateMaterial } from './kpis'
import { HR_ONLY_FINDINGS } from './leaveModel'
import { lineage, union } from './lineage'
import { onTimeByMonth } from './transactions'

/** The scorecard measures, in order: the Overview tiles they reuse, then final pay. */
export const SUMMARY_KPIS = ['resolution-sla', 'tx-on-time', 'final-pay'] as const

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** Final pay on time (Atlas OF-05): termination transactions due in the period, paid by the deadline. */
export function finalPayKpi(m: ServicesModel, ctx: Pick<AnalyticsContext, 'prior' | 'metrics'>): Kpi {
  const metricId = levelMetric('of05-final-pay')
  const min = m.settings.minGroup
  const s = m.scope
  const exits = (w: { start: string; end: string }): TxFact[] =>
    dueIn(m.tx, w).filter((f) => f.type === 'Termination')
  const cur = exits(m.window)
  const prev = exits(ctx.prior)
  const r = onTimeRate(cur, min)
  const rp = onTimeRate(prev, min)
  const ok = m.hasTx && m.txCols.dueDate
  const spark = onTimeByMonth(
    m.tx.filter((f) => f.type === 'Termination'),
    m.months.slice(-12),
    min,
  ).map((x) => x.rate)
  const L = lineage(m.caseCols)
  return {
    id: 'final-pay',
    metricId,
    label: 'Final pay on time',
    value: ok ? r.rate : null,
    format: 'pct',
    delta: ok && r.rate != null && rp.rate != null ? r.rate - rp.rate : null,
    deltaLabel: 'vs prior period',
    goodDirection: 'up',
    deltaMaterial: rateMaterial(r, rp),
    spark,
    suppressed: ok && r.rate == null && r.n > 0,
    note: !m.hasTx
      ? 'Upload HR transactions to see this'
      : !m.txCols.dueDate
        ? 'Due date column missing'
        : `${fmt(r.n, 'int')} exits due`,
    tab: 'transactions',
    definition: ctx.metrics.def(metricId)?.definition,
    uses: union(L.onTime, L.txType),
    drill: drillWhen(s, cur, () => onTimeDrill(s, cur, `Final pay due, ${s.per}`, { exitType: true })),
    deltaDrill: drillWhen(s, prev, () =>
      onTimeDrill(s, prev, 'Final pay due, prior period', {
        subtitle: `${ctx.prior.label} · ${s.scope}`,
        exitType: true,
      }),
    ),
  }
}

/** The readout for the scorecard: case and transaction findings, then leave, by severity. */
export function summaryFindings(m: ServicesModel): Finding[] {
  const leave = m.leave.findings
    .filter((f) => !HR_ONLY_FINDINGS.has(f.id))
    .map(({ people: _people, peopleTotal: _total, ...f }) => f)
  return [...m.findings, ...leave]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity] || a.i - b.i)
    .map((x) => x.f)
}

export function servicesSummary(ctx: AnalyticsContext): ViewSummary {
  const m = computeCached(ctx)
  const tile = (id: string) => m.kpis.find((k) => k.id === id)
  const kpis = [tile('resolution-sla'), tile('tx-on-time'), ...tagKpis([finalPayKpi(m, ctx)])].filter(
    (k): k is Kpi => !!k,
  )
  return { kpis, findings: summaryFindings(m) }
}
