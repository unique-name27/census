/**
 * Writes the org slides as a native, editable PowerPoint deck (pptxgenjs, loaded on demand): cards
 * are rounded rectangles with text, connectors are lines, so the deck can be adjusted in
 * PowerPoint. Colors come from the light theme so slides are ink on white whatever the screen.
 */
import type PptxGenJS from 'pptxgenjs'
import { type ChartTheme, readChartTheme } from '@/charts/theme'
import type { ExportMeta } from '@/charts/types'
import { downloadBlob, MIME } from '@/lib/export/download'
import { withLightTheme } from '@/lib/export/image'
import { NAME_PX, SLIDE, type SlidePlan, SMALL_PX, type Swatch } from '../engine'
import { orgSlideText, type SlideTier } from './slideFooter'

const FONT = 'Archivo'
const hex = (c: string) => {
  const s = c.trim()
  if (s.startsWith('#')) {
    const h = s.slice(1)
    return (h.length === 3 ? [...h].map((x) => x + x).join('') : h.slice(0, 6)).toUpperCase()
  }
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s)
  return m
    ? [m[1], m[2], m[3]]
        .map((v) => Number(v).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    : '616A78'
}

/** The resolved colors the deck needs (light theme). */
export type DeckTheme = Pick<
  ChartTheme,
  'ink' | 'ink2' | 'muted' | 'rule' | 'axis' | 'sheet2' | 'series' | 'seq' | 'deemph'
>

function swatchHex(t: DeckTheme, s: Swatch | null): string {
  if (!s) return hex(t.axis)
  if (s.kind === 'series') return hex(t.series[s.index] ?? t.deemph)
  if (s.kind === 'other') return hex(t.deemph)
  return hex(t.seq[s.step])
}

const clampPt = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10

export interface LegendKey {
  label: string
  swatch: Swatch
}

/** Download the deck: loads pptxgenjs, reads the light theme, builds and saves the file. */
export async function downloadOrgSlides(
  plans: readonly SlidePlan[],
  meta: ExportMeta,
  opts: { fileName: string; legend: LegendKey[]; data?: SlideTier },
): Promise<void> {
  const [{ default: Pptx }, t] = await Promise.all([
    import('pptxgenjs'),
    withLightTheme(async () => readChartTheme()),
  ])
  const pptx = new Pptx()
  buildOrgDeck(pptx, plans, meta, opts.legend, t, opts.data)
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  downloadBlob(new Blob([blob], { type: MIME.pptx }), `${opts.fileName}.pptx`)
}

/** Add one slide per plan to a deck. */
export function buildOrgDeck(
  pptx: PptxGenJS,
  plans: readonly SlidePlan[],
  meta: ExportMeta,
  legend: readonly LegendKey[],
  t: DeckTheme,
  data: SlideTier = {},
): void {
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Census'
  pptx.company = meta.company
  pptx.title = 'Org slides'
  const C = {
    ink: hex(t.ink),
    ink2: hex(t.ink2),
    muted: hex(t.muted),
    rule: hex(t.rule),
    line: hex(t.axis),
    box: hex(t.sheet2),
  }
  const M = SLIDE.margin

  plans.forEach((plan, i) => {
    const s = pptx.addSlide()
    const text = orgSlideText(plan, meta, i + 1, data)
    s.background = { color: 'FFFFFF' }
    s.addText(plan.title, {
      x: M,
      y: 0.42,
      w: SLIDE.w - 2 * M,
      h: 0.5,
      fontFace: FONT,
      fontSize: 22,
      bold: true,
      color: C.ink,
      margin: 0,
      valign: 'top',
      fit: 'shrink',
    })
    s.addText(plan.subtitle, {
      x: M,
      y: 0.95,
      w: SLIDE.w - 2 * M,
      h: 0.35,
      fontFace: FONT,
      fontSize: 13,
      color: C.ink2,
      margin: 0,
      valign: 'top',
    })

    for (const b of plan.boxes) {
      s.addShape(pptx.ShapeType.roundRect, {
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        rectRadius: 0.05,
        fill: { color: C.box },
        line: { color: C.box, width: 0 },
      })
    }
    for (const [x1, y1, x2, y2] of plan.lines) {
      s.addShape(pptx.ShapeType.line, {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
        line: { color: C.line, width: 0.75 },
      })
    }

    const k = plan.ptPerPx
    const namePt = clampPt(NAME_PX * k, 6, 16)
    const smallPt = clampPt(SMALL_PX * k, 5, 12)
    for (const c of plan.cards) {
      const runs =
        c.kind === 'req'
          ? [
              {
                text: 'OPEN ROLE',
                options: { fontSize: clampPt(10 * k, 5, 10), bold: true, color: C.muted, breakLine: true },
              },
              { text: c.title, options: { fontSize: namePt, bold: true, color: C.ink2, breakLine: true } },
              {
                text: [c.meta, c.counts].filter(Boolean).join(' · '),
                options: { fontSize: smallPt, color: C.muted },
              },
            ]
          : [
              { text: c.name, options: { fontSize: namePt, bold: true, color: C.ink, breakLine: true } },
              { text: c.title, options: { fontSize: smallPt, color: C.ink2, breakLine: true } },
              { text: c.meta, options: { fontSize: smallPt, color: C.muted, breakLine: !!c.counts } },
              ...(c.counts ? [{ text: c.counts, options: { fontSize: smallPt, color: C.ink2 } }] : []),
            ]
      s.addText(runs, {
        shape: pptx.ShapeType.roundRect,
        rectRadius: Math.min(0.06, c.h * 0.08),
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        fill: { color: 'FFFFFF' },
        line:
          c.kind === 'req'
            ? { color: C.line, width: 0.75, dashType: 'dash' }
            : c.leader
              ? { color: C.ink, width: 1.25 }
              : { color: C.rule, width: 0.75 },
        fontFace: FONT,
        align: 'left',
        valign: 'top',
        margin: [Math.max(2, 7 * k), Math.max(2, 9 * k), 1, Math.max(2, 9 * k)],
        paraSpaceAfter: 0,
      })
      if (c.kind === 'person') {
        s.addShape(pptx.ShapeType.rect, {
          x: c.x + 0.02,
          y: c.y,
          w: c.w - 0.04,
          h: Math.max(0.025, (3 * k) / 72),
          fill: { color: swatchHex(t, c.swatch) },
          line: { color: swatchHex(t, c.swatch), width: 0 },
        })
      }
    }

    // Color key, top right under the subtitle, when coloring is on.
    const used = new Set(plan.cards.map((c) => JSON.stringify(c.swatch)))
    const items = legend.filter((k) => used.has(JSON.stringify(k.swatch))).slice(0, 8)
    if (items.length) {
      let x = M
      const y = 1.3
      for (const it of items) {
        s.addShape(pptx.ShapeType.rect, {
          x,
          y: y + 0.05,
          w: 0.12,
          h: 0.12,
          fill: { color: swatchHex(t, it.swatch) },
          line: { color: swatchHex(t, it.swatch), width: 0 },
        })
        const w = Math.min(2.2, 0.12 + it.label.length * 0.066)
        s.addText(it.label, {
          x: x + 0.17,
          y,
          w,
          h: 0.22,
          fontFace: FONT,
          fontSize: 9,
          color: C.ink2,
          margin: 0,
          valign: 'middle',
        })
        x += 0.17 + w + 0.2
        if (x > SLIDE.w - M - 1) break
      }
    }

    s.addShape(pptx.ShapeType.line, {
      x: M,
      y: SLIDE.h - 0.62,
      w: SLIDE.w - 2 * M,
      h: 0,
      line: { color: C.rule, width: 0.75 },
    })
    s.addText(
      text.left.map((line, j) => ({ text: line, options: { breakLine: j < text.left.length - 1 } })),
      {
        x: M,
        y: SLIDE.h - 0.55,
        w: (SLIDE.w - 2 * M) * 0.5,
        h: 0.32,
        fontFace: FONT,
        fontSize: 9,
        color: C.muted,
        margin: 0,
        valign: 'top',
        fit: 'shrink',
      },
    )
    s.addText(text.right, {
      x: M + (SLIDE.w - 2 * M) * 0.5,
      y: SLIDE.h - 0.55,
      w: (SLIDE.w - 2 * M) * 0.5,
      h: 0.3,
      fontFace: FONT,
      fontSize: 9,
      color: C.muted,
      align: 'right',
      margin: 0,
      valign: 'top',
    })
    s.addNotes(text.notes)
  })
}
