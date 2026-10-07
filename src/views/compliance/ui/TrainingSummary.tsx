/**
 * Required training and policy acknowledgments: two numbers, each linking to the view that owns
 * the detail (Talent > Learning, Onboarding > First 90 days). Not a copy of their charts.
 */
import { type Column, Figure } from '@/charts'
import { Button, cx, goTo, IconChevronRight, type Span, StatusPill } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { Drill, type DrillSource } from '@/drill'
import { fmt } from '@/lib/format'
import { targetStatus } from '@/metrics/api'
import type { ComplianceView } from '../engine'
import { policyDrill, trainingDrill } from '../engine/drills'
import { USES, union } from '../engine/lineage'
import { businessDaysText, ofText, periodWords, targetPct } from '../engine/wording'
import { M, TALENT_REQUIRED_TRAINING } from '../metrics'
import { defs } from './shared'

interface Row {
  measure: string
  value: number | null
  onTime: number
  due: number
  target: number | null
  source: string
  drill: DrillSource
}

const COLUMNS: Column<Row>[] = [
  { key: 'measure', label: 'Measure' },
  { key: 'value', label: 'On time %', format: 'pct', drill: (r) => r.drill },
  { key: 'onTime', label: 'On time', format: 'int', drill: (r) => r.drill },
  { key: 'due', label: 'Due', format: 'int', drill: (r) => r.drill },
  { key: 'target', label: 'Target', format: 'pct' },
  { key: 'source', label: 'Detail in' },
]

export function TrainingSummary({ m, ctx, span }: { m: ComplianceView; ctx: AnalyticsContext; span: Span }) {
  const s = m.scope
  const { required, policy } = m.training
  const cfg = m.settings
  const trainingUses = ctx.metrics.usesOf(TALENT_REQUIRED_TRAINING)
  const trainingTarget = ctx.metrics.target(TALENT_REQUIRED_TRAINING)?.value ?? null
  const rows: Row[] = [
    {
      measure: 'Required training on time',
      value: required.available ? required.rate : null,
      onTime: required.onTime,
      due: required.due,
      target: trainingTarget,
      source: 'Talent > Learning',
      drill:
        required.rate != null
          ? () =>
              trainingDrill(s, required.records, {
                title: 'Required assignments due in the period',
                note: `${ofText(required.onTime, required.due)} were completed by the due date.`,
                uses: trainingUses,
              })
          : null,
    },
    {
      measure: `Policy acknowledgments within ${businessDaysText(cfg.policyDays)}`,
      value: policy.rate,
      onTime: policy.onTime.length,
      due: policy.judged.length,
      target: cfg.targets.policyAcks,
      source: 'Onboarding > First 90 days',
      drill:
        policy.rate != null
          ? () =>
              policyDrill(s, policy.judged, {
                title: 'Policy acknowledgments due in the period',
                note: `${ofText(policy.onTime.length, policy.judged.length)} were completed within ${businessDaysText(cfg.policyDays)} of the start. Late ones come first.`,
                uses: USES.policyAcks,
              })
          : null,
    },
  ]
  const uses: FieldRef[] = union(trainingUses, USES.policyAcks)
  return (
    <Figure
      id="compliance-training-summary"
      uses={uses}
      metric={M.policyAcks}
      span={span}
      title="Training and acknowledgments"
      subtitle={`Required training and policy acknowledgments due in the ${periodWords(ctx)}`}
      data={rows}
      columns={COLUMNS}
      definitions={defs(ctx.metrics, [TALENT_REQUIRED_TRAINING, M.policyAcks])}
      image={false}
      tableToggle={false}
      note="Summary only: the charts live in Talent and Onboarding"
    >
      <div className="grid grid-cols-1 divide-y divide-rule sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Measure
          row={rows[0]}
          missing={
            required.available
              ? null
              : required.loaded
                ? 'Required assignments in Learning carry no due date.'
                : 'Upload Learning to see this.'
          }
          link={{ label: 'Open Talent > Learning', onClick: () => goTo('talent', 'learning') }}
          className="pb-4 sm:pr-5 sm:pb-0"
        />
        <Measure
          row={rows[1]}
          missing={
            policy.available
              ? null
              : 'Upload Onboarding tasks with a Policy acknowledgments task to see this.'
          }
          link={{ label: 'Open Onboarding > First 90 days', onClick: () => goTo('onboarding', 'first90') }}
          className="pt-4 sm:pt-0 sm:pl-5"
        />
      </div>
    </Figure>
  )
}

function Measure({
  row,
  missing,
  link,
  className,
}: {
  row: Row
  missing: string | null
  link: { label: string; onClick: () => void }
  className?: string
}) {
  const status = row.target != null ? targetStatus(row.value, { value: row.target, comparator: '>=' }) : null
  const small = !missing && row.value == null && row.due > 0
  return (
    <div className={cx('flex min-w-0 flex-col gap-2', className)}>
      <p className="eyebrow text-muted">{row.measure}</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="cut-head text-page-title leading-none font-semibold">
          {missing || row.value == null ? '—' : <Drill spec={row.drill}>{fmt(row.value, 'pct')}</Drill>}
        </span>
        {status && (
          <StatusPill
            severity={status === 'met' ? 'good' : 'warning'}
            label={`${status === 'met' ? 'Met' : 'Missed'}: target ${targetPct(row.target!)}`}
          />
        )}
      </div>
      <p className="text-small text-ink-2">
        {missing ??
          (small ? (
            `Hidden to protect anonymity (fewer than the minimum due).`
          ) : row.due ? (
            <>
              <Drill spec={row.drill}>{ofText(row.onTime, row.due)}</Drill> on time
            </>
          ) : (
            'Nothing due in the period'
          ))}
      </p>
      <div className="min-w-0">
        {/* The label wraps in a narrow column (the page beside Ask) instead of running past it. */}
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2.5 min-h-7 max-w-full justify-start py-1 text-left"
          style={{ height: 'auto' }}
          onClick={link.onClick}
        >
          <span className="min-w-0 whitespace-normal">{link.label}</span>
          <IconChevronRight className="size-3.5 shrink-0" />
        </Button>
      </div>
    </div>
  )
}
