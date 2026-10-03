import { BarList, Columns, Figure, type FigureSpan } from '@/charts'
import { Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import { TRANSACTION_ON_TIME_TARGET } from '../engine/catalog'
import type { TxFact } from '../engine/facts'
import { onTimeRate } from '../engine/facts'
import { TIMING_BINS } from '../engine/transactions'
import { asOfNote, count, DEF, NeedData, NO_TX, period, rateTone } from './shared'

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

export function TypeOnTimeFigure({
  id,
  m,
  ctx,
  span,
  onSelect,
}: {
  id: string
  m: ServicesModel
  ctx: AnalyticsContext
  span: FigureSpan
  onSelect?: () => void
}) {
  const due = inWindow(m)
  const all = onTimeRate(due)
  return (
    <Figure
      id={id}
      span={span}
      title="On time by transaction type"
      subtitle={`Transactions due in the ${period(ctx)} completed by their due date, against the ${fmt(TRANSACTION_ON_TIME_TARGET, 'pct0')} target`}
      data={m.types}
      columns={[
        { key: 'type', label: 'Transaction type' },
        { key: 'processId', label: 'Atlas process' },
        { key: 'deadline', label: 'Deadline' },
        { key: 'due', label: 'Due in period', format: 'int' },
        { key: 'onTime', label: 'On time', format: 'int' },
        { key: 'late', label: 'Completed late', format: 'int' },
        { key: 'open', label: 'Open past due', format: 'int' },
        { key: 'rate', label: 'On time %', format: 'pct' },
      ]}
      definitions={[DEF.onTime, DEF.anonymity]}
      note={asOfNote(
        m.asOf,
        count(all.n, 'transaction'),
        `target ${fmt(TRANSACTION_ON_TIME_TARGET, 'pct0')}`,
      )}
      empty={
        !m.hasTx
          ? 'Upload HR transactions to see this.'
          : !m.txCols.dueDate
            ? 'Upload HR transactions with a due date column to see this.'
            : m.types.length
              ? null
              : 'No transactions were due in this period.'
      }
      detail={{ label: 'Transactions', columns: TX_DETAIL_COLUMNS, rows: txDetail(due) }}
    >
      <BarList
        data={m.types}
        label="type"
        value="rate"
        format="pct"
        sort="none"
        domain={[0, 1]}
        ref={{
          value: TRANSACTION_ON_TIME_TARGET,
          label: `Target ${fmt(TRANSACTION_ON_TIME_TARGET, 'pct0')}`,
        }}
        secondary={(d) => `n = ${fmt(d.due, 'int')}`}
        tone={(d) => rateTone(d.rate, TRANSACTION_ON_TIME_TARGET)}
        onSelect={onSelect}
      />
    </Figure>
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
  const due = inWindow(m)
  const exits = due.filter((f) => f.type === 'Termination')
  const hires = due.filter((f) => f.type === 'New hire')
  const hireAll = onTimeRate(hires)
  const hireRate = hireAll.n >= 5 ? (hireAll.n - hireAll.late) / hireAll.n : null
  const completed = m.timing.reduce((a, r) => a + r.transactions, 0)
  const retroTotal = m.retro.reduce((a, r) => a + r.retro, 0)
  const retroChanges = m.retro.reduce((a, r) => a + r.changes, 0)

  return (
    <>
      <Section
        title="Timeliness"
        dek="Whether HR transactions were processed by the deadline their Atlas process sets, and how early or late they landed."
      >
        <TypeOnTimeFigure id="services-tx-on-time-by-type" m={m} ctx={ctx} span={6} />
        <Figure
          id="services-tx-days-early-late"
          span={6}
          title="Days early or late"
          subtitle={`Completed date minus due date, for completed transactions due in the ${per}`}
          data={m.timing}
          columns={[
            { key: 'timing', label: 'Completed' },
            { key: 'transactions', label: 'Transactions', format: 'int' },
            { key: 'share', label: 'Share', format: 'pct' },
          ]}
          definitions={[
            DEF.onTime,
            {
              term: 'Days early or late',
              text: 'Calendar days between the due date and the completed date. On the due date or earlier is on time.',
              formula: 'completedDate − dueDate',
            },
          ]}
          note={asOfNote(m.asOf, count(completed, 'completed transaction'))}
          empty={m.timing.length ? null : 'No completed transactions were due in this period.'}
        >
          <Columns
            data={m.timing}
            x="timing"
            y="transactions"
            xOrder={TIMING_BINS.map((b) => b.label)}
            tone={(d) => (d.late ? 'critical' : 'default')}
          />
        </Figure>
      </Section>

      <Section
        title="Final pay"
        dek="Final pay against each jurisdiction's deadline (Atlas OF-05). The rule comes from the Atlas jurisdiction notes and depends on the exit type."
      >
        <Figure
          id="services-final-pay-table"
          span={7}
          title="Final pay timeliness by jurisdiction"
          subtitle={`Termination transactions due in the ${per}, on time against the local final pay deadline`}
          data={m.finalPay}
          columns={[
            { key: 'name', label: 'Jurisdiction' },
            { key: 'sites', label: 'Sites' },
            { key: 'rule', label: 'Deadline rule' },
            { key: 'exits', label: 'Exits', format: 'int' },
            { key: 'late', label: 'Late', format: 'int' },
            { key: 'rate', label: 'On time', format: 'pct' },
            { key: 'involuntaryRate', label: 'Involuntary on time', format: 'pct' },
            { key: 'voluntaryRate', label: 'Voluntary on time', format: 'pct' },
            { key: 'medianDaysLate', label: 'Median days late', format: 'days' },
          ]}
          definitions={[
            {
              term: 'Final pay on time',
              text: "Termination transactions completed on or before the final pay deadline for the leaver's site and exit type. Target 100% (Atlas OF-05).",
              formula: 'completedDate ≤ dueDate',
            },
            {
              term: 'Jurisdiction',
              text: "From the leaver's site in the roster (San Jose is California, Bengaluru is India, and so on).",
            },
            DEF.anonymity,
          ]}
          note={asOfNote(m.asOf, count(exits.length, 'exit'))}
          tableOnly
          table={{
            rowTone: (r) =>
              r.rate == null ? null : r.rate < 0.95 ? 'critical' : r.rate < 1 ? 'warning' : 'good',
            maxRows: 15,
          }}
          empty={m.finalPay.length ? null : 'No final pay was due in this period.'}
          detail={{ label: 'Exits', columns: TX_DETAIL_COLUMNS, rows: txDetail(exits) }}
        />
        <Figure
          id="services-final-pay-chart"
          span={5}
          title="Final pay on time by jurisdiction"
          subtitle={`Share of exits paid by the deadline, ${per}, lowest first`}
          data={m.finalPay}
          columns={[
            { key: 'name', label: 'Jurisdiction' },
            { key: 'exits', label: 'Exits', format: 'int' },
            { key: 'rate', label: 'On time', format: 'pct' },
          ]}
          definitions={[DEF.onTime, DEF.anonymity]}
          note={asOfNote(m.asOf, count(exits.length, 'exit'), 'target 100%')}
          empty={m.finalPay.length ? null : 'No final pay was due in this period.'}
        >
          <BarList
            data={m.finalPay}
            label="name"
            value="rate"
            format="pct"
            sort="asc"
            domain={[0, 1]}
            secondary={(d) => `n = ${fmt(d.exits, 'int')}`}
            tone={(d) =>
              d.rate == null ? 'deemph' : d.rate < 0.95 ? 'critical' : d.rate < 1 ? 'warning' : 'default'
            }
          />
        </Figure>
      </Section>

      <Section
        title="New hires and payroll cut-off"
        dek="New hires entered and approved by Day −3 (Atlas ON-03), and job and pay changes that missed the payroll cut-off and needed a retro adjustment (Atlas DS-01 target: under 2% of changes)."
      >
        <Figure
          id="services-new-hire-readiness"
          span={6}
          title="New hire readiness by site"
          subtitle={`New hire transactions due in the ${per} that were completed by Day −3`}
          data={m.newHireSites}
          columns={[
            { key: 'location', label: 'Site' },
            { key: 'region', label: 'Region' },
            { key: 'starts', label: 'New hires', format: 'int' },
            { key: 'ready', label: 'Ready by Day −3', format: 'int' },
            { key: 'late', label: 'Late', format: 'int' },
            { key: 'rate', label: 'Ready %', format: 'pct' },
          ]}
          definitions={[
            {
              term: 'Ready by Day −3',
              text: 'The hire was entered and approved in the HRIS at least three business days before the start date (the due date). Target 100% (Atlas ON-03).',
              formula: 'completedDate ≤ start date − 3 business days',
            },
            DEF.anonymity,
          ]}
          note={asOfNote(m.asOf, count(hireAll.n, 'new hire'))}
          empty={m.newHireSites.length ? null : 'No new hires were due in this period.'}
          detail={{ label: 'New hires', columns: TX_DETAIL_COLUMNS, rows: txDetail(hires) }}
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
            secondary={(d) => `n = ${fmt(d.starts, 'int')}`}
            tone={(d) =>
              d.rate == null ? 'deemph' : d.rate < 0.85 ? 'critical' : d.rate < 0.95 ? 'warning' : 'default'
            }
          />
        </Figure>
        <Figure
          id="services-retro-by-month"
          span={6}
          title="Retro adjustments by month"
          subtitle={`Job and pay changes completed after their payroll cut-off, by cut-off month, ${per}`}
          data={m.retro}
          columns={[
            { key: 'month', label: 'Cut-off month' },
            { key: 'changes', label: 'Job and pay changes', format: 'int' },
            { key: 'retro', label: 'Retro adjustments', format: 'int' },
            { key: 'share', label: 'Retro share', format: 'pct' },
          ]}
          definitions={[
            {
              term: 'Retro adjustment',
              text: 'A job or compensation change processed after the payroll cut-off for its effective month, so pay had to be corrected on a later payslip. Atlas DS-01 target: under 2% of changes.',
              formula: 'retro ÷ job and pay changes',
            },
          ]}
          note={asOfNote(
            m.asOf,
            `${fmt(retroTotal, 'int')} of ${count(retroChanges, 'change')}`,
            retroChanges ? `${fmt(retroTotal / retroChanges, 'pct')} retro` : null,
          )}
          empty={
            !m.txCols.retro
              ? 'Upload HR transactions with a retro column to see this.'
              : retroChanges
                ? null
                : 'No job or pay changes were due in this period.'
          }
        >
          <Columns data={m.retro} x="month" y="retro" xType="month" />
        </Figure>
      </Section>
    </>
  )
}
