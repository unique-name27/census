/**
 * Tiny trend line for KPI tiles, folder tabs and table cells. Gaps (null) break the line.
 * The last point is emphasized; the series is drawn in the de-emphasis ink with the endpoint
 * in the accent so the current period reads first.
 */
import { useChartTheme } from './theme'

export function Sparkline({
  values,
  width = 72,
  height = 22,
  label,
}: {
  values: (number | null)[]
  width?: number
  height?: number
  /** Accessible description, e.g. "Headcount, last 8 quarters". */
  label?: string
}) {
  const t = useChartTheme()
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null && Number.isFinite(p.v))
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden="true" />
  const lo = Math.min(...pts.map((p) => p.v))
  const hi = Math.max(...pts.map((p) => p.v))
  const pad = 3
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2)
  const y = (v: number) =>
    hi === lo ? height / 2 : height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2)
  // Split into runs so nulls break the line.
  const runs: { v: number; i: number }[][] = []
  let cur: { v: number; i: number }[] = []
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      if (cur.length) runs.push(cur)
      cur = []
    } else cur.push({ v, i })
  })
  if (cur.length) runs.push(cur)
  const last = pts[pts.length - 1]
  const area = runs.length === 1 && runs[0].length > 1
  const d = (run: { v: number; i: number }[]) =>
    run.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  return (
    <svg
      width={width}
      height={height}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {area && (
        <path
          d={`${d(runs[0])}L${x(runs[0][runs[0].length - 1].i).toFixed(1)},${height - 1}L${x(runs[0][0].i).toFixed(1)},${height - 1}Z`}
          fill={t.series[0]}
          opacity={0.1}
        />
      )}
      {runs.map((run, k) => (
        <path
          key={k}
          d={d(run)}
          fill="none"
          stroke={t.muted}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      <circle cx={x(last.i)} cy={y(last.v)} r={3} fill={t.series[0]} stroke={t.sheet} strokeWidth={1.5} />
    </svg>
  )
}
