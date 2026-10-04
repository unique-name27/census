import { BarList, type Column, Columns, Figure, type Tone } from '@/charts'
import { Section, type Span } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import { FINAL_PAY_RULES } from '../engine/catalog'
import { servicesDefinitions } from '../engine/definitions'
import {
  changesDrill,
  type DrillScope,
  drillWhen,
  isLateTx,
  monthName,
  monthSub,
  onTimeDrill,
  retroDrill,
  txDrill,
  txOutcomeDrill,
} from '../engine/drills'
import type { TxFact } from '../engine/facts'
import { onTimeRate } from '../engine/facts'
import type { ServicesFigureId } from '../engine/lineage'
import { pctWords } from '../engine/settings'
import type { FinalPayRow, RetroMonthRow, SiteRow, TimingRow, TypeRow } from '../engine/transactions'
import { TIMING_BINS } from '../engine/transactions'
import { isOther } from '../engine/util'
import { FIGURE_METRIC } from '../metrics'
import { asOfNote, count, NeedData, NO_TX, period, rateTone, titled, useProcessHref } from './shared'

const TX_DETAIL_COLUMNS = [
  { key: 'transactionId', label: 'Transaction ID' },
  { key: 'type', label: 'Type' },
  { key: 'processId', label: 'Atlas process' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'location', label: 'Site' },
  { key: 'exitType', label: 'Exit type' },
  { key: 'effective', label: 'Effective', format: 'date' as const },
  { key: 'due', label: 'Due', format: 'date' as const },
  { key: 'completed', label: 'Completed', format: 'date' as const },
  { key: 'daysVsDue', label: 'Days after due', format: 'int' as const },
  { key: 'outcome', label: 'Outcome' },
]

const OUTCOME_WORD: Record<string, string> = {
  'on-time': 'On time',
  late: 'Late',
  overdue: 'Open past due',
  pending: 'Not yet due',
}

/** Detail rows for an export: the transactions behind a figure, outcome in words. */
const txDetail = (rows: readonly TxFact[]) => () =>
  rows.map((f) => ({ ...f, outcome: f.outcome ? OUTCOME_WORD[f.outcome] : '—' }))

const inWindow = (m: ServicesModel) =>
  m.tx.filter((f) => f.due != null && f.due >= m.window.start && f.due <= m.window.end)

/**
 * Final pay status: critical under the readout's floor (95% by default), warning under the OF-05
 * target (100% by default).
 */
const finalPayTone = (rate: number | null, floor: number, target: number): Tone =>
  rate == null ? 'deemph' : rate < floor ? 'critical' : rate < target ? 'warning' : 'default'

const isOnTime = (f: TxFact) => f.outcome === 'on-time'
const isCompletedLate = (f: TxFact) => f.outcome === 'late'
const isOverdue = (f: TxFact) => f.outcome === 'overdue'

/** "Completed 3-5 d late": the bin label read inside a sentence. */
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

/**
 * Drills for a breakdown of judged transactions (by type, site, jurisdiction): every judged row
 * for the count and the rate, and the on-time, late and open-past-due ones for their counts.
 * A hidden rate hides its counts and their records with it.
 */
function onTimeCells<T extends { rate: number | null; records: TxFact[] }>(
  s: DrillScope,
  noun: string,
  group: (r: T) => string,
  o: { exitType?: boolean } = {},
) {
  const all = (r: T) =>
    r.rate == null ? null : () => onTimeDrill(s, r.records, titled(`${noun} due`, group(r), s.per), o)
  const some = (pick: (f: TxFact) => boolean, words: string) => (r: T) =>
    r.rate == null || !r.records.some(pick)
      ? null
      : () => txOutcomeDrill(s, r.records, pick, titled(`${noun} ${words}`, group(r), s.per), o)
  return {
    all,
    onTime: some(isOnTime, 'on time'),
    late: some(isLateTx, 'late or open past due'),
    completedLate: some(isCompletedLate, 'completed late'),
    overdue: some(isOverdue, 'open past due'),
  }
}

function TypeOnTimeFigure({
  id,
  m,
  ctx,
  span,
}: {
  id: ServicesFigureId
  m: ServicesModel
  ctx: AnalyticsContext
  span: Span
}) {
  const processHref = useProcessHref()
  const due = inWindow(m)
  const all = onTimeRate(due, m.settings.minGroup)
  const per = period(ctx)
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const target = m.settings.onTimeTarget
  const cell = onTimeCells<TypeRow>(m.scope, 'Transactions', (r) => r.type)
  const columns: Column<TypeRow>[] = [
    { key: 'type', label: 'Transaction type' },
    {
      key: 'processId',
      label: 'Atlas process',
      href: (r) => (r.processId ? processHref(r.processId) : null),
    },
    { key: 'deadline', label: 'Deadline' },
    { key: 'due', label: 'Due in period', format: 'int', drill: cell.all },
    { key: 'onTime', label: 'On time', format: 'int', drill: cell.onTime },
    { key: 'late', label: 'Completed late', format: 'int', drill: cell.completedLate },
    { key: 'open', label: 'Open past due', format: 'int', drill: cell.overdue },
    { key: 'rate', label: 'On time %', format: 'pct', drill: cell.all },
  ]
  return (
    <Figure
      id={id}
      uses={m.uses[id]}
      metric={FIGURE_METRIC[id]}
      span={span}
      title="On time by transaction type"
      subtitle={`Transactions due in the ${per} completed by their due date, against the ${pctWords(target)} target`}
      data={m.types}
      columns={columns}
      definitions={[D.onTime, D.anonymity]}
      note={asOfNote(m.asOf, count(all.n, 'transaction'), `target ${pctWords(target)}`)}
      empty={m.types.length ? null : 'No transactions were due in this period.'}
      detail={
        m.small ? undefined : { label: 'Transactions', columns: TX_DETAIL_COLUMNS, rows: txDetail(due) }
      }
    >
      <BarList
        data={m.types}
        label="type"
        value="rate"
        format="pct"
        sort="none"
        domain={[0, 1]}
        ref={{ value: target, label: `Target ${pctWords(target)}` }}
        secondary={(d) => `${fmt(d.due, 'int')} due`}
        tone={(d) => rateTone(d.rate, target)}
        onSelect={(d) => drill(cell.all(d))}
      />
    </Figure>
  )
}

/** The deadline rule for each jurisdiction in the chart, beside it. */
function FinalPayRules({ rows }: { rows: readonly FinalPayRow[] }) {
  const named = rows.filter((r) => !isOther(r.name) && FINAL_PAY_RULES.has(r.jurisdiction))
  if (!named.length) return null
  return (
    <div className="min-w-0 lg:border-l lg:border-rule lg:pl-4">
      <h4 className="eyebrow mb-1.5">Deadline rule</h4>
      <dl className="m-0 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 text-[12px] leading-snug">
        {named.map((r) => (
          <div key={r.jurisdiction} className="contents">
            <dt className="border-t border-rule py-1.5 font-semibold text-ink">{r.name}</dt>
            <dd className="m-0 border-t border-rule py-1.5 text-ink-2">{r.rule}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function TransactionsTab({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  if (!m.hasTx) return <NeedData {...NO_TX} />
  if (!m.txCols.dueDate)
    return (
      <NeedData
        title="Upload HR transactions with a due date to see this"
        body="On-time measures compare each transaction's completed date with the deadline its process sets (Day −3 for new hires, the final pay rule for exits, the payroll cut-off for changes). Map a due date column in the Data room."
      />
    )
  const per = period(ctx)
  const cfg = m.settings
  const k = cfg.minGroup
  const D = servicesDefinitions(ctx.metrics, cfg)
  const of05 = cfg.levelTargets['of05-final-pay']
  const on03 = cfg.levelTargets['on03-hire-day-minus-3']
  const ds01 = cfg.levelTargets['ds01-retro-share']
  const hireFloor = cfg.newHire.regionFloor
  const due = inWindow(m)
  const exits = due.filter((f) => f.type === 'Termination')
  const hires = due.filter((f) => f.type === 'New hire')
  const hireRate = onTimeRate(hires, k).rate
  const hireN = onTimeRate(hires, k).n
  const finalPayN = m.finalPay.reduce((a, r) => a + r.exits, 0)
  const completed = m.timing.reduce((a, r) => a + r.transactions, 0)
  const timingHidden = m.timing.length > 0 && m.timing.every((r) => r.share == null)
  const { retro: retroTotal, n: retroChanges, rate: retroRate } = m.retroSummary
  const retroRows = m.retro.filter((r) => r.changes > 0)
  const retroShown = retroRows.some((r) => r.share != null)
  const s = m.scope

  /* Drill sources, shared by the charts and their table views. */
  const timingBin = (d: TimingRow) =>
    d.share == null
      ? null
      : drillWhen(s, d.records, () =>
          txDrill(s, d.records, {
            title: titled(`Transactions completed ${lowerFirst(d.timing)}`, per),
            order: (a, b) => (b.daysVsDue ?? 0) - (a.daysVsDue ?? 0),
          }),
        )
  const finalPay = onTimeCells<FinalPayRow>(s, 'Final pay', (r) => r.name, { exitType: true })
  const byExitType = (type: 'Involuntary' | 'Voluntary') => (r: FinalPayRow) => {
    const rate = type === 'Involuntary' ? r.involuntaryRate : r.voluntaryRate
    return rate == null
      ? null
      : () =>
          onTimeDrill(
            s,
            r.records.filter((f) => f.exitType === type),
            titled(`Final pay due, ${type.toLowerCase()} exits`, r.name, per),
            { exitType: true },
          )
  }
  const hire = onTimeCells<SiteRow>(s, 'New hires', (r) => r.location)
  const retroMonth = (d: RetroMonthRow) =>
    d.share == null
      ? null
      : () =>
          retroDrill(
            s,
            d.records,
            titled('Retro adjustments', `${monthName(d.month)} cut-off`),
            monthSub(s, d.month),
          )
  const finalPayColumns: Column<FinalPayRow>[] = [
    { key: 'name', label: 'Jurisdiction' },
    { key: 'sites', label: 'Sites' },
    { key: 'exits', label: 'Exits', format: 'int', drill: finalPay.all },
    { key: 'late', label: 'Late', format: 'int', drill: finalPay.late },
    { key: 'rate', label: 'On time', format: 'pct', drill: finalPay.all },
    { key: 'involuntaryRate', label: 'Involuntary on time', format: 'pct', drill: byExitType('Involuntary') },
    { key: 'voluntaryRate', label: 'Voluntary on time', format: 'pct', drill: byExitType('Voluntary') },
    {
      key: 'medianDaysLate',
      label: 'Median days late',
      format: 'days',
      drill: (r) => (r.medianDaysLate == null ? null : finalPay.completedLate(r)),
    },
    { key: 'rule', label: 'Deadline rule' },
  ]
  const hireColumns: Column<SiteRow>[] = [
    { key: 'location', label: 'Site' },
    { key: 'region', label: 'Region' },
    { key: 'starts', label: 'New hires', format: 'int', drill: hire.all },
    { key: 'ready', label: 'Ready by Day −3', format: 'int', drill: hire.onTime },
    { key: 'late', label: 'Late', format: 'int', drill: hire.late },
    { key: 'rate', label: 'Ready %', format: 'pct', drill: hire.all },
  ]
  const retroColumns: Column<RetroMonthRow>[] = [
    { key: 'month', label: 'Cut-off month' },
    {
      key: 'changes',
      label: 'Job and pay changes',
      format: 'int',
      drill: (r) =>
        r.share == null
          ? null
          : () =>
              changesDrill(
                s,
                r.records,
                titled('Job and pay changes', `${monthName(r.month)} cut-off`),
                monthSub(s, r.month),
              ),
    },
    {
      key: 'retro',
      label: 'Retro adjustments',
      format: 'int',
      drill: (r) => (r.retro ? retroMonth(r) : null),
    },
    { key: 'share', label: 'Retro share', format: 'pct', drill: (r) => (r.retro ? retroMonth(r) : null) },
  ]

  return (
    <>
      <Section
        title="Timeliness"
        dek="Whether HR transactions were processed by the deadline their Atlas process sets, and how early or late they landed."
      >
        <TypeOnTimeFigure id="services-tx-on-time-by-type" m={m} ctx={ctx} span={6} />
        <Figure
          id="services-tx-days-early-late"
          uses={m.uses['services-tx-days-early-late']}
          metric={FIGURE_METRIC['services-tx-days-early-late']}
          span={6}
          title="Days early or late"
          subtitle={`Completed date minus due date, for completed transactions due in the ${per}`}
          data={m.timing}
          columns={[
            { key: 'timing', label: 'Completed' },
            { key: 'transactions', label: 'Transactions', format: 'int', drill: timingBin },
            { key: 'share', label: 'Share', format: 'pct', drill: timingBin },
          ]}
          definitions={[D.daysVsDue, D.onTime]}
          note={asOfNote(m.asOf, count(completed, 'completed transaction'))}
          empty={
            !m.timing.length
              ? 'No completed transactions were due in this period.'
              : timingHidden
                ? `Fewer than ${k} people are behind these transactions, so their timing is hidden to protect anonymity.`
                : null
          }
        >
          <Columns
            data={m.timing}
            x="timing"
            y="transactions"
            xOrder={TIMING_BINS.map((b) => b.label)}
            tone={(d) => (d.late ? 'critical' : 'default')}
            onSelect={(d) => drill(timingBin(d))}
          />
        </Figure>
      </Section>

      <Section
        title="Final pay"
        dek={`Final pay against each jurisdiction's deadline (Atlas OF-05, target ${pctWords(of05)}). The rule comes from the Atlas jurisdiction notes and depends on the exit type.`}
      >
        <Figure
          id="services-final-pay"
          uses={m.uses['services-final-pay']}
          metric={FIGURE_METRIC['services-final-pay']}
          span={12}
          title="Final pay on time by jurisdiction"
          subtitle={`Termination transactions due in the ${per}, paid by the local final pay deadline, lowest first`}
          data={m.finalPay}
          columns={finalPayColumns}
          definitions={[D.finalPay, D.jurisdiction, D.anonymity]}
          note={asOfNote(
            m.asOf,
            count(finalPayN, 'exit'),
            `target ${pctWords(of05)}`,
            'the table view adds exit types and days late',
          )}
          empty={m.finalPay.length ? null : 'No final pay was due in this period.'}
          detail={m.small ? undefined : { label: 'Exits', columns: TX_DETAIL_COLUMNS, rows: txDetail(exits) }}
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <BarList
                data={m.finalPay}
                label="name"
                value="rate"
                format="pct"
                sort="asc"
                domain={[0, 1]}
                secondary={(d) =>
                  d.late == null
                    ? count(d.exits, 'exit')
                    : `${fmt(d.late, 'int')} of ${count(d.exits, 'exit')} late`
                }
                tone={(d) => (d.rate == null ? 'deemph' : 'default')}
                glyphTone={(d) => finalPayTone(d.rate, cfg.finalPay.floor, of05)}
                onSelect={(d) => drill(finalPay.all(d))}
              />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <FinalPayRules rows={m.finalPay} />
            </div>
          </div>
        </Figure>
      </Section>

      <Section
        title="New hires and payroll cut-off"
        dek={`New hires entered and approved by Day −3 (Atlas ON-03), and job and pay changes that missed the payroll cut-off and needed a retro adjustment (Atlas DS-01 target: under ${pctWords(ds01)} of changes).`}
      >
        <Figure
          id="services-new-hire-readiness"
          uses={m.uses['services-new-hire-readiness']}
          metric={FIGURE_METRIC['services-new-hire-readiness']}
          span={6}
          title="New hire readiness by site"
          subtitle={`New hire transactions due in the ${per} that were completed by Day −3`}
          data={m.newHireSites}
          columns={hireColumns}
          definitions={[D.newHireReady, D.anonymity]}
          note={asOfNote(m.asOf, count(hireN, 'new hire'), `target ${pctWords(on03)}`)}
          empty={m.newHireSites.length ? null : 'No new hires were due in this period.'}
          detail={
            m.small ? undefined : { label: 'New hires', columns: TX_DETAIL_COLUMNS, rows: txDetail(hires) }
          }
        >
          <BarList
            data={m.newHireSites}
            label="location"
            value="rate"
            format="pct"
            sort="asc"
            domain={[0, 1]}
            ref={
              hireRate == null ? undefined : { value: hireRate, label: `All sites ${fmt(hireRate, 'pct')}` }
            }
            secondary={(d) => count(d.starts, 'hire')}
            tone={(d) => rateTone(d.rate, hireFloor)}
            onSelect={(d) => drill(hire.all(d))}
          />
        </Figure>
        <Figure
          id="services-retro-by-month"
          uses={m.uses['services-retro-by-month']}
          metric={FIGURE_METRIC['services-retro-by-month']}
          span={6}
          title="Retro adjustments by month"
          subtitle={`Share of job and pay changes completed after their payroll cut-off, by cut-off month, ${per}`}
          data={m.retro}
          columns={retroColumns}
          definitions={[D.retro, D.anonymity]}
          note={asOfNote(
            m.asOf,
            retroTotal == null
              ? count(retroChanges, 'change')
              : `${fmt(retroTotal, 'int')} of ${count(retroChanges, 'change')}`,
            retroRate == null ? null : `${fmt(retroRate, 'pct')} retro`,
            `target under ${pctWords(ds01)}`,
          )}
          empty={
            !m.txCols.retro
              ? 'Upload HR transactions with a retro column to see this.'
              : !retroChanges
                ? 'No job or pay changes were due in this period.'
                : retroShown
                  ? null
                  : `Each month has fewer than ${k} changes or ${k} people behind it, so monthly shares are hidden to protect anonymity.`
          }
        >
          <Columns
            data={retroRows}
            x="month"
            y="share"
            xType="month"
            format="pct"
            ref={{ value: ds01, label: `DS-01 target ${pctWords(ds01)}` }}
            onSelect={(d) => drill(retroMonth(d))}
          />
        </Figure>
      </Section>
    </>
  )
}
