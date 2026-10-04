/**
 * Geometry for the "Candidate flow" river: a left-to-right sankey of the application cohort.
 *
 * Stage nodes are thin bars, top-aligned, with heights proportional to the candidates who reached
 * each stage. The advancing channel runs along the top; under it, still-active candidates leave
 * an open-ended fade, and rejected, withdrawn and declined candidates turn down in quarter-bends
 * into one band along the bottom that thickens as people leave (on its own, compressed scale).
 *
 * Pure: the caller passes a text measurer. Labels are placed with collision checks and dropped
 * (lowest priority first) rather than allowed to overlap or leave the canvas.
 */
import { fmt } from '@/lib/format'
import type { Flow, FlowKind } from './flow'

export type RibbonKind = 'advanced' | 'active' | 'rejected' | 'withdrawn' | 'declined'
export type Measure = (text: string, size: number, weight: number) => number

export interface RiverNode {
  stage: number
  x: number
  y: number
  w: number
  h: number
  value: number
}

export interface RiverRibbon {
  id: string
  kind: RibbonKind
  /** Stage the flow leaves from (advanced: from this stage to the next). */
  stage: number
  value: number
  d: string
}

export type LabelRole = 'kicker' | 'count' | 'flow' | 'flowSub' | 'onFlow' | 'onFlowSub' | 'exit' | 'note'

export interface RiverLabel {
  id: string
  x: number
  y: number
  text: string
  anchor: 'start' | 'middle' | 'end'
  role: LabelRole
  size: number
  weight: number
  /** Letter spacing in px (uppercase kickers). */
  tracking?: number
  /** The part of the flow the number belongs to: clicking the label drills to it. */
  target?: LabelTarget
}

export interface LabelTarget {
  kind: FlowKind
  stage: number
}

export interface RiverLayout {
  width: number
  height: number
  topY: number
  nodes: RiverNode[]
  ribbons: RiverRibbon[]
  band: { d: string; top: number; bottom: number } | null
  labels: RiverLabel[]
  /** Where the active fades end (for the gradient). */
  fades: { id: string; x0: number; x1: number }[]
  twoRows: boolean
}

/** One line of exit counts under the band ("12 rejected"), or the short "20 left". */
interface ExitLine {
  text: string
  kind: FlowKind
}

const NODE_W = 8
const MIN_H = 2
const KAPPA = 0.55

const SHORT: Record<string, string> = { 'Hiring manager': 'HM' }

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const overlaps = (a: Box, b: Box, pad = 3) =>
  a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad

/** Horizontal ribbon between two vertical cross-sections (cubic ease, control points at 45%). */
export function ribbonPath(x0: number, a0: number, a1: number, x1: number, b0: number, b1: number): string {
  const c0 = x0 + (x1 - x0) * 0.45
  const c1 = x1 - (x1 - x0) * 0.45
  return `M${r(x0)},${r(a0)}C${r(c0)},${r(a0)} ${r(c1)},${r(b0)} ${r(x1)},${r(b0)}L${r(x1)},${r(b1)}C${r(c1)},${r(b1)} ${r(c0)},${r(a1)} ${r(x0)},${r(a1)}Z`
}

/**
 * A quarter-bend from a vertical cross-section at x0 [s0, s1] (leaving rightwards) down onto the
 * band top between lx0 and lx1 (arriving downwards). The top edge is the outer curve.
 */
export function drainPath(
  x0: number,
  s0: number,
  s1: number,
  lx0: number,
  ly0: number,
  lx1: number,
  ly1: number,
): string {
  const outer = `C${r(x0 + (lx1 - x0) * KAPPA)},${r(s0)} ${r(lx1)},${r(ly1 - (ly1 - s0) * KAPPA)} ${r(lx1)},${r(ly1)}`
  const inner = `C${r(lx0)},${r(ly0 - (ly0 - s1) * KAPPA)} ${r(x0 + (lx0 - x0) * KAPPA)},${r(s1)} ${r(x0)},${r(s1)}`
  return `M${r(x0)},${r(s0)}${outer}L${r(lx0)},${r(ly0)}${inner}Z`
}

const r = (v: number) => Math.round(v * 10) / 10

export function riverLayout(
  flow: Flow,
  stageNames: readonly string[],
  width: number,
  measure: Measure,
): RiverLayout {
  const W = Math.max(280, Math.floor(width))
  const compact = W < 640
  const flowH = compact ? 150 : W < 1000 ? 190 : 220
  const bendRoom = compact ? 36 : 46
  const bandMax = compact ? 26 : 34
  const n = stageNames.length
  const step = (W - NODE_W) / (n - 1)
  const xs = stageNames.map((_, i) => i * step)
  const labels: RiverLabel[] = []
  const placed: Box[] = []

  const textBox = (
    l: Pick<RiverLabel, 'x' | 'y' | 'text' | 'anchor' | 'size' | 'weight' | 'tracking'>,
  ): Box => {
    const w = measure(l.text, l.size, l.weight) + (l.tracking ?? 0) * l.text.length
    const x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2
    return { x0, y0: l.y - l.size * 0.78, x1: x0 + w, y1: l.y + l.size * 0.24 }
  }
  const fits = (b: Box) => b.x0 >= 0 && b.x1 <= W
  /** Place the first alternative that fits and doesn't collide; returns false when all are dropped. */
  const place = (alts: RiverLabel[][], force = false): boolean => {
    for (const group of alts) {
      const boxes = group.map(textBox)
      if (boxes.every(fits) && boxes.every((b) => placed.every((p) => !overlaps(b, p)))) {
        labels.push(...group)
        placed.push(...boxes)
        return true
      }
    }
    if (force && alts.length) {
      const group = alts[alts.length - 1]
      labels.push(...group)
      placed.push(...group.map(textBox))
      return true
    }
    return false
  }

  /* ── node lockups (stage name + count), one row, or two alternating rows when crowded ── */
  const counts = [...flow.stages.map((s) => s.entered), flow.hired]
  const lockup = (i: number, short: boolean) => {
    const name = (short ? (SHORT[stageNames[i]] ?? stageNames[i]) : stageNames[i]).toUpperCase()
    const anchor: RiverLabel['anchor'] = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
    const x = i === 0 ? xs[i] : i === n - 1 ? xs[i] + NODE_W : xs[i] + NODE_W / 2
    const kw = measure(name, 11, 600) + 0.66 * name.length
    const cw = measure(fmt(counts[i], 'int'), 15, 650)
    const w = Math.max(kw, cw)
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2
    return { name, anchor, x, x0, x1: x0 + w }
  }
  const crowded = (short: boolean, gap: number) =>
    stageNames.some((_, i) => {
      if (i + gap >= n) return false
      const a = lockup(i, short)
      const b = lockup(i + gap, short)
      return a.x1 + 12 > b.x0
    })
  const twoRows = crowded(false, 1)
  const short = twoRows && crowded(false, 2)
  const rowY = (i: number) => (twoRows && i % 2 === 1 ? 38 : 0)
  const topY = twoRows ? 92 : 54
  for (let i = 0; i < n; i++) {
    const l = lockup(i, short)
    const y0 = rowY(i)
    place(
      [
        [
          {
            id: `kicker-${i}`,
            x: l.x,
            y: y0 + 12,
            text: l.name,
            anchor: l.anchor,
            role: 'kicker',
            target: { kind: 'node', stage: i },
            size: 11,
            weight: 600,
            tracking: 0.66,
          },
          {
            id: `count-${i}`,
            x: l.x,
            y: y0 + 31,
            text: fmt(counts[i], 'int'),
            anchor: l.anchor,
            role: 'count',
            target: { kind: 'node', stage: i },
            size: 15,
            weight: 650,
          },
        ],
      ],
      true,
    )
  }

  /* ── scales and node stacks ── */
  const total = Math.max(1, flow.stages[0]?.entered ?? 0)
  const k = flowH / total
  const hgt = (v: number) => (v > 0 ? Math.max(v * k, MIN_H) : 0)
  const segs = flow.stages.map((s) => ({
    advanced: hgt(s.advanced),
    active: hgt(s.active),
    rejected: hgt(s.rejected),
    withdrawn: hgt(s.withdrawn),
    declined: hgt(s.declined),
  }))
  const nodeH = [
    ...segs.map((s) => s.advanced + s.active + s.rejected + s.withdrawn + s.declined),
    hgt(flow.hired),
  ]
  const nodes: RiverNode[] = nodeH.map((h, i) => ({
    stage: i,
    x: xs[i],
    y: topY,
    w: NODE_W,
    h,
    value: counts[i],
  }))
  const nodeBoxes = nodes.map((nd) => ({ x0: nd.x, y0: nd.y, x1: nd.x + nd.w, y1: nd.y + Math.max(nd.h, 1) }))
  placed.push(...nodeBoxes)

  const riverBottom = topY + Math.max(...nodeH, 0)
  const exitsTotal = flow.left.rejected + flow.left.withdrawn + flow.left.declined
  const bandBottom = riverBottom + bendRoom + bandMax
  const kd = exitsTotal > 0 ? bandMax / exitsTotal : 0

  const ribbons: RiverRibbon[] = []
  const fades: RiverLayout['fades'] = []
  const bandPts: [number, number][] = []
  let cum = 0
  const exitLabelRows: { i: number; lines: ExitLine[]; left: number; x: number }[] = []

  flow.stages.forEach((s, i) => {
    const x0 = xs[i] + NODE_W
    const x1 = xs[i + 1]
    const g = segs[i]
    let y = topY
    // Advancing channel.
    if (s.advanced > 0) {
      ribbons.push({
        id: `advanced-${i}`,
        kind: 'advanced',
        stage: i,
        value: s.advanced,
        d: ribbonPath(x0, y, y + g.advanced, x1, topY, topY + nodeH[i + 1]),
      })
      y += g.advanced
    }
    // Still active: an open-ended fade.
    if (s.active > 0) {
      const len = Math.min((x1 - x0) * 0.55, 170)
      ribbons.push({
        id: `active-${i}`,
        kind: 'active',
        stage: i,
        value: s.active,
        d: `M${r(x0)},${r(y)}H${r(x0 + len)}V${r(y + g.active)}H${r(x0)}Z`,
      })
      fades.push({ id: `active-${i}`, x0, x1: x0 + len })
      const text = `${fmt(s.active, 'int')} active`
      const mid = y + g.active / 2
      place([
        ...(g.active >= 14
          ? [
              [
                {
                  id: `active-label-${i}`,
                  target: { kind: 'active' as const, stage: i },
                  x: x0 + 6,
                  y: mid + 4,
                  text,
                  anchor: 'start' as const,
                  role: 'flow' as const,
                  size: 11,
                  weight: 600,
                },
              ],
            ]
          : []),
        [
          {
            id: `active-label-${i}`,
            target: { kind: 'active' as const, stage: i },
            x: x0 + len + 4,
            y: Math.max(mid + 4, topY + g.advanced + 11),
            text,
            anchor: 'start' as const,
            role: 'flowSub' as const,
            size: 11,
            weight: 500,
          },
        ],
      ])
      y += g.active
    }
    // Exits: rejected, withdrawn, declined turn down into the band.
    const exits = (['rejected', 'withdrawn', 'declined'] as const).filter((kind) => s[kind] > 0)
    // Drains keep their width through the bend, squeezed only when they would reach the end of
    // the active fade; the band rises on its own, smaller scale.
    const landStart = x0 + 14
    const natural = exits.map((kind) => Math.max(g[kind], 1))
    const naturalTotal = natural.reduce((a, b) => a + b, 0)
    const maxLand = Math.max(8, (x1 - x0) * 0.5 - 14)
    const squeeze = naturalTotal > maxLand ? maxLand / naturalTotal : 1
    const landW = natural.map((v) => v * squeeze)
    const landTotal = landW.reduce((a, b) => a + b, 0)
    const rise = (s.rejected + s.withdrawn + s.declined) * kd
    const bandAt = (x: number) => {
      const t = landTotal > 0 ? Math.min(1, Math.max(0, (x - landStart) / landTotal)) : 1
      return bandBottom - (cum + t * rise)
    }
    // Inner (bottom) sources land leftmost, so nested bends never cross.
    let lx = landStart + landTotal
    const tops: number[] = []
    let sy = y
    for (const kind of exits) {
      tops.push(sy)
      sy += g[kind]
    }
    exits.forEach((kind, j) => {
      const lw = landW[j]
      const lx1 = lx
      const lx0 = lx - lw
      lx = lx0
      // Later labels keep clear of the drain.
      placed.push({ x0, y0: tops[j], x1: lx1, y1: bandAt(lx1) })
      ribbons.push({
        id: `${kind}-${i}`,
        kind,
        stage: i,
        value: s[kind],
        d: drainPath(x0, tops[j], tops[j] + g[kind], lx0, bandAt(lx0), lx1, bandAt(lx1)),
      })
    })
    if (landTotal > 0) {
      bandPts.push([landStart, bandBottom - cum])
      cum += rise
      bandPts.push([landStart + landTotal, bandBottom - cum])
      const lines = (['rejected', 'withdrawn', 'declined'] as const)
        .filter((kind) => s[kind] > 0)
        .map((kind) => ({ text: `${fmt(s[kind], 'int')} ${kind}`, kind }))
      exitLabelRows.push({ i, lines, left: s.rejected + s.withdrawn + s.declined, x: landStart })
    }
    // Pass-rate label on (or above) the advancing channel.
    if (s.advanced > 0) {
      const midX = (x0 + x1) / 2
      const pass = s.pass != null ? `${fmt(s.pass, 'pct0')} pass` : ''
      const daysText = s.medianDays != null ? `${fmt(Math.round(s.medianDays), 'days')} median` : ''
      const main = `${fmt(s.advanced, 'int')} advanced`
      const alts: RiverLabel[][] = []
      if (g.advanced >= 32)
        alts.push([
          {
            id: `adv-${i}`,
            target: { kind: 'advanced' as const, stage: i },
            x: midX,
            y: topY + g.advanced / 2 - 2,
            text: main,
            anchor: 'middle',
            role: 'onFlow',
            size: 12,
            weight: 600,
          },
          {
            id: `adv-sub-${i}`,
            target: { kind: 'advanced' as const, stage: i },
            x: midX,
            y: topY + g.advanced / 2 + 12,
            text: [pass, daysText].filter(Boolean).join(' · '),
            anchor: 'middle',
            role: 'onFlowSub',
            size: 11,
            weight: 500,
          },
        ])
      if (g.advanced >= 16)
        alts.push([
          {
            id: `adv-${i}`,
            target: { kind: 'advanced' as const, stage: i },
            x: midX,
            y: topY + g.advanced / 2 + 4,
            text: [fmt(s.advanced, 'int'), pass].filter(Boolean).join(' · '),
            anchor: 'middle',
            role: 'onFlow',
            size: 11,
            weight: 600,
          },
        ])
      alts.push([
        {
          id: `adv-${i}`,
          target: { kind: 'advanced' as const, stage: i },
          x: midX,
          y: topY - 6,
          text: [fmt(s.advanced, 'int'), pass].filter(Boolean).join(' · '),
          anchor: 'middle',
          role: 'flow',
          size: 11,
          weight: 600,
        },
      ])
      if (pass)
        alts.push([
          {
            id: `adv-${i}`,
            target: { kind: 'advanced' as const, stage: i },
            x: midX,
            y: topY - 6,
            text: pass,
            anchor: 'middle',
            role: 'flow',
            size: 11,
            weight: 600,
          },
        ])
      place(alts)
    }
  })

  // Band: rises at each landing and runs to the right edge.
  let band: RiverLayout['band'] = null
  if (bandPts.length) {
    const top = bandPts.map(([x, y]) => `L${r(x)},${r(y)}`).join('')
    const endY = bandPts[bandPts.length - 1][1]
    band = {
      d: `M${r(bandPts[0][0])},${r(bandBottom)}${top}L${r(W)},${r(endY)}L${r(W)},${r(bandBottom)}Z`,
      top: endY,
      bottom: bandBottom,
    }
  }

  // Hired share under the last node.
  if (flow.hired > 0 && flow.total > 0) {
    const text = `${fmt(flow.hired / flow.total, 'pct')} of applicants`
    place(
      [15, 31, 47].map((dy) => [
        {
          id: 'hired-share',
          target: { kind: 'node' as const, stage: n - 1 },
          x: xs[n - 1] + NODE_W,
          y: topY + nodeH[n - 1] + dy,
          text,
          anchor: 'end' as const,
          role: 'note' as const,
          size: 11,
          weight: 500,
        },
      ]),
    )
  }

  // Exit counts under the band, one block per stage (shortened, then dropped when crowded).
  let maxLines = 0
  for (const row of exitLabelRows) {
    const left = row.left
    const asLines = (texts: readonly ExitLine[], anchorEnd: boolean) =>
      texts.map(({ text, kind }, j) => ({
        id: `exit-${row.i}-${j}`,
        target: { kind, stage: row.i },
        x: anchorEnd ? W : row.x,
        y: bandBottom + 15 + j * 14,
        text,
        anchor: anchorEnd ? ('end' as const) : ('start' as const),
        role: 'exit' as const,
        size: 11,
        weight: 500,
      }))
    // Only the last stage may right-align against the edge; elsewhere that would sit under another stage.
    const last = row === exitLabelRows[exitLabelRows.length - 1]
    const short: ExitLine[] = [{ text: `${fmt(left, 'int')} left`, kind: 'left' }]
    const ok = place([
      asLines(row.lines, false),
      ...(last ? [asLines(row.lines, true)] : []),
      asLines(short, false),
      ...(last ? [asLines(short, true)] : []),
    ])
    if (ok) maxLines = Math.max(maxLines, labels.filter((l) => l.id.startsWith(`exit-${row.i}-`)).length)
  }

  const height = Math.ceil(bandBottom + (maxLines ? 15 + (maxLines - 1) * 14 + 6 : 8))
  return { width: W, height, topY, nodes, ribbons, band, labels, fades, twoRows }
}
