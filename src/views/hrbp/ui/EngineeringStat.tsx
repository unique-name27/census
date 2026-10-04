/**
 * Engineering share as one exportable SVG (marked `data-chart`): the big number, its caption and a
 * meter with the 65% reference tick, so PNG and SVG exports carry the value and not just the bar.
 */
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { textWidth, useChartTheme, useFontsVersion } from '@/charts'
import { fmt } from '@/lib/format'

/** Width of an element; keeps the last real width while it is hidden (table view), so exports still work. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** Greedy word wrap at a pixel width. */
function wrap(text: string, width: number, size: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, size) > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

const CAPTION = 'of employees work in engineering departments'

export function EngineeringStat({ share, reference }: { share: number; reference: number }) {
  // Layout reads text widths that change when fonts load; skip compiler memoization so it re-measures.
  'use no memo'
  const t = useChartTheme()
  useFontsVersion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const W = Math.max(200, useWidth(wrapRef))
  const caption = wrap(CAPTION, W, 13)
  const capTop = 52
  const barY = capTop + caption.length * 18 + 12
  const bar = 6
  const tickX = Math.round(reference * W)
  const refLabel = `${fmt(reference, 'pct0')} reference`
  const labelW = textWidth(refLabel, 11)
  const labelX = Math.min(Math.max(tickX, labelW / 2), W - labelW / 2)
  const H = barY + bar + 26
  const value = fmt(share, 'pct0')

  return (
    <div ref={wrapRef} className="pt-1">
      <svg
        data-chart
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Engineering share ${value} of employees, against a ${fmt(reference, 'pct0')} reference`}
        fontFamily={t.font}
        className="block max-w-full overflow-visible"
      >
        <text x={0} y={38} fontSize={40} fontWeight={600} fill={t.ink} style={{ fontStretch: '84%' }}>
          {value}
        </text>
        {caption.map((line, i) => (
          <text key={line} x={0} y={capTop + 13 + i * 18} fontSize={13} fill={t.ink2}>
            {line}
          </text>
        ))}
        <rect x={0} y={barY} width={W} height={bar} rx={2} fill={t.seq[100]} />
        <rect
          x={0}
          y={barY}
          width={Math.max(0, Math.min(1, share)) * W}
          height={bar}
          rx={2}
          fill={t.series[0]}
        />
        <rect x={tickX - 1} y={barY - 4} width={2} height={bar + 8} fill={t.ink} />
        <text x={labelX} y={barY + bar + 20} fontSize={11} fill={t.muted} textAnchor="middle">
          {refLabel}
        </text>
      </svg>
    </div>
  )
}
