/**
 * An SVG mirror of the cards currently shown, used only by the figure's PNG/SVG export and the
 * view workbook and deck (marked `data-chart`). Colors are CSS variables in style attributes, so
 * the exporter's computed-style inlining resolves them in whichever theme is active at capture.
 * Very large charts keep their full geometry in the viewBox and are scaled down to a size a
 * browser can rasterize.
 */
import { truncateText, useChartTheme } from '@/charts'
import type { ChartTheme } from '@/charts/theme'
import type { ColorScheme, Flag, Layout, OrgTree, ReqStub, Swatch } from '../engine'
import { STRUCTURAL, segmentsPath } from '../engine'

const PAD = 16
const MAX_SIDE = 6000

function resolved(t: ChartTheme, s: Swatch): string {
  if (s.kind === 'series') return t.series[s.index] ?? t.deemph
  if (s.kind === 'other') return t.deemph
  return t.seq[s.step]
}

export function ExportSvg({
  tree,
  layout,
  scheme,
  matches,
  flags,
  showFlags,
  reqByCardId,
  title,
}: {
  tree: OrgTree
  layout: Layout
  scheme: ColorScheme
  matches: (id: string) => boolean
  flags: ReadonlyMap<string, readonly Flag[]>
  showFlags: boolean
  reqByCardId: ReadonlyMap<string, ReqStub>
  title: string
}) {
  const theme = useChartTheme()
  const W = layout.width + 2 * PAD
  const H = layout.height + 2 * PAD
  const s = Math.min(1, MAX_SIDE / Math.max(W, H))
  const legend = scheme.legend.length
    ? JSON.stringify({
        kind: 'swatch',
        items: scheme.legend.map((k) => ({
          label: k.label,
          color: resolved(theme, k.swatch),
          shape: 'rect',
        })),
      })
    : undefined
  const inner = (w: number) => w - 24

  return (
    <div aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <svg
        data-chart
        data-legend={legend}
        xmlns="http://www.w3.org/2000/svg"
        width={Math.round(W * s)}
        height={Math.round(H * s)}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <path
          d={segmentsPath(layout.segments, PAD, PAD)}
          fill="none"
          style={{ stroke: 'var(--rule-strong)', strokeWidth: 1 }}
        />
        {layout.cards.map((c) => {
          const x = c.x + PAD
          const y = c.y + PAD
          if (c.kind === 'req') {
            const r = reqByCardId.get(c.id)
            return (
              <g key={c.id}>
                <rect
                  x={x + 0.5}
                  y={y + 0.5}
                  width={c.w - 1}
                  height={c.h - 1}
                  rx={6}
                  style={{
                    fill: 'none',
                    stroke: 'var(--rule-strong)',
                    strokeWidth: 1,
                    strokeDasharray: '4 3',
                  }}
                />
                <text x={x + 12} y={y + 20} style={{ fill: 'var(--muted)', fontSize: 11, fontWeight: 600 }}>
                  OPEN ROLE
                </text>
                <text
                  x={x + 12}
                  y={y + 38}
                  style={{ fill: 'var(--ink-2)', fontSize: 13, fontWeight: 600, fontStretch: '84%' }}
                >
                  {truncateText(r?.jobTitle ?? 'Requisition', inner(c.w), 13, 600)}
                </text>
                <text x={x + 12} y={y + 55} style={{ fill: 'var(--muted)', fontSize: 11 }}>
                  {truncateText([r?.level, r?.location].filter(Boolean).join(' · '), inner(c.w), 11)}
                </text>
              </g>
            )
          }
          const e = tree.people.get(c.id)
          const sw = e ? scheme.swatchOf(e) : null
          const dim = !!e && !matches(c.id)
          const directs = tree.directs.get(c.id) ?? 0
          const counts = e
            ? directs
              ? `${directs} direct · ${tree.total.get(c.id) ?? 0} org`
              : ''
            : `${tree.people.size.toLocaleString('en-US')} people`
          const marks = showFlags ? (flags.get(c.id) ?? []).filter((f) => STRUCTURAL.has(f.kind)) : []
          return (
            <g key={c.id} style={{ opacity: dim ? 0.35 : 1 }}>
              <rect
                x={x + 0.5}
                y={y + 0.5}
                width={c.w - 1}
                height={c.h - 1}
                rx={6}
                style={{ fill: 'var(--sheet)', stroke: 'var(--rule)', strokeWidth: 1 }}
              />
              <rect
                x={x}
                y={y}
                width={c.w}
                height={3}
                rx={1.5}
                style={{ fill: sw ? `var(--${cssVar(sw)})` : 'var(--rule-strong)' }}
              />
              <text
                x={x + 12}
                y={y + 24}
                style={{ fill: 'var(--ink)', fontSize: 13.5, fontWeight: 600, fontStretch: '84%' }}
              >
                {truncateText(e?.name ?? 'Whole company', inner(c.w) - 24, 13.5, 600)}
              </text>
              {e?.level && (
                <text
                  x={x + c.w - 12}
                  y={y + 24}
                  textAnchor="end"
                  style={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                >
                  {e.level}
                </text>
              )}
              <text x={x + 12} y={y + 41} style={{ fill: 'var(--ink-2)', fontSize: 12 }}>
                {truncateText(e?.jobTitle ?? 'Everyone active on the as-of date', inner(c.w), 12)}
              </text>
              {e && (
                <text x={x + 12} y={y + 57} style={{ fill: 'var(--muted)', fontSize: 11 }}>
                  {truncateText(`${e.department} · ${e.location}`, inner(c.w), 11)}
                </text>
              )}
              {counts && (
                <text
                  x={x + 12}
                  y={y + c.h - 11}
                  style={{ fill: 'var(--ink-2)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
                >
                  {counts}
                </text>
              )}
              {marks.slice(0, 3).map((f, i) => (
                <text
                  key={f.kind}
                  x={x + c.w - 12 - i * 14}
                  y={y + c.h - 11}
                  textAnchor="end"
                  style={{
                    fill: f.severity === 'warning' ? 'var(--warning)' : 'var(--s1)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {f.severity === 'warning' ? '◆' : '●'}
                </text>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** CSS custom property name (without the leading dashes) for a swatch. */
function cssVar(s: Swatch): string {
  if (s.kind === 'series') return `s${s.index + 1}`
  if (s.kind === 'other') return 'deemph'
  return `seq-${s.step}`
}
