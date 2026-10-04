/**
 * A ratio against a target, for tiles and table cells. The fill carries the tone; the track is
 * a lighter step of the same hue so the state reads across the whole bar; the target is an ink
 * tick. Missing values show the track alone.
 */
import { cx } from '@/components/ui'
import { fmt } from '@/lib/format'
import { toneColor } from '../core/color'
import { useChartTheme } from '../theme'
import type { Tone } from './shared'

export interface MeterProps {
  /** 0 to 1 (clamped). */
  value: number | null
  /** 0 to 1. */
  target?: number | null
  tone?: Tone
  /** Bar thickness in px (default 6). */
  height?: number
  /** Accessible name, e.g. "Training completion". */
  label?: string
  /**
   * What the tick marks (default 'target'), e.g. 'company rate' or 'plan': read out as
   * "82% of a 95% target" and shown as the tick's hover title ("Target 95%").
   */
  targetLabel?: string
  className?: string
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The meter's spoken value ("82% of a 95% target", "No data, target 95%") and the target
 * tick's hover title ("Target 95%"), for clamped value and target in 0-1.
 */
export function meterText(
  value: number | null,
  target: number | null,
  targetLabel = 'target',
): { valueText: string; tickTitle: string | null } {
  const goal = target == null ? null : fmt(target, 'pct0')
  return {
    valueText:
      value == null
        ? `No data${goal == null ? '' : `, ${targetLabel} ${goal}`}`
        : `${fmt(value, 'pct0')}${goal == null ? '' : ` of a ${goal} ${targetLabel}`}`,
    tickTitle: goal == null ? null : `${sentenceCase(targetLabel)} ${goal}`,
  }
}

export function Meter({
  value,
  target,
  tone = 'default',
  height = 6,
  label,
  targetLabel = 'target',
  className,
}: MeterProps) {
  const t = useChartTheme()
  const fill = toneColor(t, tone)
  const track = tone === 'default' ? t.seq[100] : tone === 'deemph' ? t.sheet2 : fill
  const trackOpacity = tone === 'default' || tone === 'deemph' ? 1 : 0.2
  const v = value == null || !Number.isFinite(value) ? null : clamp(value)
  const goal = target == null || !Number.isFinite(target) ? null : clamp(target)
  const pad = goal == null ? 0 : 3
  const text = meterText(v, goal, targetLabel)
  return (
    // biome-ignore lint/a11y/useSemanticElements: a native <meter> can't carry the target tick or theme colors
    <svg
      width="100%"
      height={height + pad * 2}
      className={cx('block overflow-visible', className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={v ?? undefined}
      aria-valuetext={text.valueText}
    >
      <rect
        x="0"
        y={pad}
        width="100%"
        height={height}
        rx={Math.min(2, height / 2)}
        fill={track}
        fillOpacity={trackOpacity}
      />
      {v != null && v > 0 && (
        <rect x="0" y={pad} width={`${v * 100}%`} height={height} rx={Math.min(2, height / 2)} fill={fill} />
      )}
      {goal != null && (
        <rect
          x={`${goal * 100}%`}
          y={0}
          width={2}
          height={height + pad * 2}
          transform="translate(-1,0)"
          fill={t.ink}
        >
          <title>{text.tickTitle}</title>
        </rect>
      )}
    </svg>
  )
}
