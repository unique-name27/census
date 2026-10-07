/**
 * The People scorecard table: practices as row groups, one row per measure with its value, the
 * target in force, a status pill, the change against the comparison, a trend line and the tier.
 * The value opens the records behind it, the change opens the comparison's records, the target
 * opens the measure in Metric definitions (where targets are edited), and the measure and the
 * practice open their view.
 */
import type { MouseEvent } from 'react'
import { Sparkline } from '@/charts/Sparkline'
import { IconArrowDown, IconArrowUp, IconLock } from '@/components/icons'
import { type DeltaTone, deltaDirection, deltaTone, kpiDeltaText } from '@/components/kpiModel'
import { goTo } from '@/components/navigation'
import { TABLE_HEAD } from '@/components/styles'
import { TierBadge } from '@/components/tier/TierBadge'
import { cx, StatusPill } from '@/components/ui'
import { Drill } from '@/drill/Drill'
import { DASH } from '@/lib/format'
import { metricHref, openMetricDefinition } from '@/views/data/metrics/open'
import { DefinitionChangedMark } from '@/views/data/metrics/ui/EditDefinition'
import type { Destination, Practice, ScoreRow } from '../engine/model'
import { STATUS_SEVERITY, STATUS_WORD } from '../engine/status'

const TONE_TEXT: Record<DeltaTone, string> = {
  good: 'text-good-text',
  bad: 'text-bad-text',
  neutral: 'text-muted',
}

const LINKISH =
  'rounded-mark text-left underline-offset-2 decoration-rule-strong hover:underline hover:decoration-ink'

const open = (d: Destination) => () => goTo(d.view, d.tab)

/** Opens the measure in Metric definitions, unless the reader asked for a new tab. */
const editTarget = (metricId: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  openMetricDefinition(metricId)
}

function Status({ row }: { row: ScoreRow }) {
  const severity = STATUS_SEVERITY[row.status]
  if (severity) return <StatusPill severity={severity} label={STATUS_WORD[row.status]} />
  return (
    <span className="text-meta text-muted">
      {row.status === 'none' ? (
        STATUS_WORD.none
      ) : (
        <>
          <span aria-hidden="true">{DASH}</span>
          <span className="sr-only">No status</span>
        </>
      )}
    </span>
  )
}

function Change({ row }: { row: ScoreRow }) {
  const k = row.kpi
  const text = row.hiddenReason ? null : kpiDeltaText(k)
  if (!text) return <span className="text-muted">{DASH}</span>
  const dir = deltaDirection(k.delta)
  const Arrow = dir === 'up' ? IconArrowUp : dir === 'down' ? IconArrowDown : null
  const tone = deltaTone({ ...k, goodDirection: row.goodDirection })
  return (
    <div className="leading-tight">
      <span className={cx('inline-flex items-center gap-0.5 font-medium whitespace-nowrap', TONE_TEXT[tone])}>
        {Arrow && <Arrow className="size-3" strokeWidth={2} />}
        {k.deltaDrill ? (
          <Drill
            spec={k.deltaDrill}
            label={`${k.label}: show the comparison records behind ${text}${k.deltaLabel ? ` ${k.deltaLabel}` : ''}`}
          >
            {text}
          </Drill>
        ) : (
          text
        )}
      </span>
      {k.deltaLabel && <div className="mt-0.5 text-label whitespace-nowrap text-muted">{k.deltaLabel}</div>}
    </div>
  )
}

function Value({ row }: { row: ScoreRow }) {
  const k = row.kpi
  if (row.hiddenReason || k.value == null) return <span className="text-muted">{row.valueText}</span>
  if (!k.drill) return <>{row.valueText}</>
  return (
    <Drill spec={k.drill} label={`${k.label}, ${row.practice}: show the records behind ${row.valueText}`}>
      {row.valueText}
    </Drill>
  )
}

function Note({ row }: { row: ScoreRow }) {
  const k = row.kpi
  if (row.hiddenReason)
    return (
      <div className="mt-0.5 flex items-start gap-1 text-meta leading-snug text-muted">
        {k.suppressed && row.shown && <IconLock className="mt-px size-3 shrink-0" />}
        {row.hiddenReason}
      </div>
    )
  if (!k.note) return null
  return (
    <div className="mt-0.5 text-meta leading-snug text-muted">
      {k.noteDrill ? (
        <Drill
          spec={k.noteDrill}
          className="text-left"
          label={`${k.label}: show the records behind "${k.note}"`}
        >
          {k.note}
        </Drill>
      ) : (
        k.note
      )}
    </div>
  )
}

function MeasureRow({ row }: { row: ScoreRow }) {
  const k = row.kpi
  return (
    <tr className="border-t border-rule align-top">
      {/* A readable measure column (the table scrolls sideways on phones) so a name such as
          "I-9 Section 2 within 3 business days" takes two or three lines, not six. */}
      <th
        scope="row"
        className="sticky left-0 z-[1] min-w-44 bg-sheet py-2.5 pr-4 pl-3 text-left font-normal"
      >
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <button
            type="button"
            onClick={open(row.opens)}
            title={`Open ${row.opens.label}`}
            aria-label={`${k.label}. Open ${row.opens.label}`}
            className={cx(LINKISH, 'text-left text-small text-ink')}
          >
            {k.label}
          </button>
          {row.metricId && <DefinitionChangedMark metricId={row.metricId} />}
        </div>
        <Note row={row} />
      </th>
      <td className="px-3 py-2.5 text-right text-body font-semibold whitespace-nowrap tnum">
        <Value row={row} />
      </td>
      <td className="px-3 py-2.5 text-meta whitespace-nowrap text-ink-2">
        {row.metricId ? (
          <a
            href={metricHref(row.metricId)}
            onClick={editTarget(row.metricId)}
            title="Targets are set in Metric definitions"
            aria-label={
              row.target
                ? `${row.targetText}. Edit the target of ${k.label} in Metric definitions`
                : `No target. Set a target for ${k.label} in Metric definitions`
            }
            className={cx(LINKISH, row.target ? 'text-ink-2' : 'text-link')}
          >
            {row.target ? row.targetText : 'Set a target'}
          </a>
        ) : (
          <span className="text-muted">{row.targetText}</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <Status row={row} />
      </td>
      <td className="px-3 py-2.5 text-right text-meta">
        <Change row={row} />
      </td>
      <td className="px-3 py-2.5">
        {!row.hiddenReason && k.spark && k.spark.length > 1 ? (
          <Sparkline values={k.spark} width={64} height={20} label={`${k.label}, recent trend`} />
        ) : (
          <span className="text-meta text-muted">{DASH}</span>
        )}
      </td>
      <td className="py-2.5 pr-3 pl-2">
        {row.gate && (
          <TierBadge
            compact
            tier={row.gate.tier}
            explain={row.gate.explain}
            dataset={row.gate.limiting.dataset}
          />
        )}
      </td>
    </tr>
  )
}

function PracticeRows({ practice }: { practice: Practice }) {
  const id = `scorecard-practice-${practice.view}`
  return (
    <tbody aria-labelledby={id}>
      <tr>
        <th
          colSpan={7}
          scope="colgroup"
          className="sticky left-0 bg-sheet px-3 pt-4 pb-1.5 text-left font-normal"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <button
              id={id}
              type="button"
              onClick={open(practice.opens)}
              aria-label={`${practice.label}. Open ${practice.opens.label}`}
              className={cx(LINKISH, 'cut-head text-title font-semibold text-ink')}
            >
              {practice.label}
            </button>
            {practice.judged > 0 && (
              <span className="text-meta text-muted">
                {practice.met} of {practice.judged} met
              </span>
            )}
          </div>
          {practice.empty && <p className="mt-0.5 text-meta leading-snug text-muted">{practice.empty}</p>}
        </th>
      </tr>
      {practice.rows.map((r) => (
        <MeasureRow key={r.id} row={r} />
      ))}
    </tbody>
  )
}

const HEAD = cx(TABLE_HEAD, 'px-3 pb-2 text-left')

export function ScoreTable({ practices, caption }: { practices: readonly Practice[]; caption: string }) {
  return (
    // Relative, so screen-reader-only words in the cells scroll with the table instead of
    // widening the page on phones.
    <div className="relative -mx-4 overflow-x-auto lg:-mx-5">
      <table className="w-full min-w-[720px] border-collapse text-small">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={cx(HEAD, 'sticky left-0 bg-sheet')}>
              Measure
            </th>
            <th scope="col" className={cx(HEAD, 'text-right')}>
              Value
            </th>
            <th scope="col" className={HEAD}>
              Target
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={cx(HEAD, 'text-right')}>
              Change
            </th>
            <th scope="col" className={HEAD}>
              Trend
            </th>
            <th scope="col" className={cx(HEAD, 'pr-3 pl-2')}>
              Tier
            </th>
          </tr>
        </thead>
        {practices.map((p) => (
          <PracticeRows key={p.view} practice={p} />
        ))}
      </table>
    </div>
  )
}
