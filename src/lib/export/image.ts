/**
 * Chart images. A chart SVG is cloned with its computed styles inlined (so classes and CSS
 * variables resolve to literal colors), tooltips and hover marks are stripped, the Archivo font is
 * embedded as a data URL, and the figure title, legend and a context footer can be composed
 * around it. The result downloads as SVG or is rasterized through a canvas into a 2x PNG that
 * reads well on a slide. Uses only the DOM: no server, works offline and over file://.
 */
import archivoUrl from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url'
import { HOVER_CLASS } from '@/charts/core/attrs'
import { type LegendSpec, readLegend } from '@/charts/core/legend'
import { textWidth } from '@/charts/core/measure'
import { readChartTheme } from '@/charts/theme'
import { downloadBlob, MIME } from './download'

const SVG_NS = 'http://www.w3.org/2000/svg'

const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'visibility',
  'font-family',
  'font-size',
  'font-weight',
  'font-stretch',
  'font-style',
  'font-variant-numeric',
  'letter-spacing',
  'text-anchor',
  'paint-order',
] as const

/** Elements that only exist for on-screen interaction. */
const INTERACTIVE = `[aria-label="tip"], .${HOVER_CLASS}`

export interface ImageOptions {
  /** Figure title and subtitle drawn above the chart. */
  header?: { title: string; subtitle?: string }
  /** One muted line under the chart, e.g. "Whole company · As of 30 Sep 2026 · Census". */
  footer?: string
  /** Draw the chart's legend above it (read from the SVG's data-legend). Default true. */
  legend?: boolean
  /** Background; defaults to the current theme's sheet color. */
  background?: string
}

export interface ComposedSvg {
  markup: string
  width: number
  height: number
}

let fontCss: Promise<string> | null = null

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error ?? new Error('Could not read file'))
    fr.readAsDataURL(blob)
  })
}

/** @font-face rule with Archivo embedded; empty when the font can't be read (system fonts then apply). */
function embeddedFontCss(): Promise<string> {
  fontCss ??= fetch(archivoUrl)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`Font request failed (${r.status})`))))
    .then(blobToDataUrl)
    .then(
      (url) =>
        `@font-face{font-family:'Archivo Variable';font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(${url}) format('woff2')}`,
    )
    .catch(() => '')
  return fontCss
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const box = svg.viewBox?.baseVal
  const rect = svg.getBoundingClientRect()
  const width = Number(svg.getAttribute('width')) || box?.width || rect.width
  const height = Number(svg.getAttribute('height')) || box?.height || rect.height
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}

/** Deep clone with computed presentation styles copied inline; interaction layers removed. */
function inlineClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const src = [svg, ...svg.querySelectorAll('*')]
  const dst = [clone, ...clone.querySelectorAll('*')]
  for (let i = 0; i < src.length; i++) {
    const s = src[i]
    const d = dst[i]
    if (!(s instanceof SVGElement) || !(d instanceof SVGElement)) continue
    const tag = s.tagName.toLowerCase()
    if (tag === 'style' || tag === 'title' || tag === 'desc') continue
    const cs = getComputedStyle(s)
    const parts: string[] = []
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p)
      if (v) parts.push(`${p}:${v}`)
    }
    d.setAttribute('style', parts.join(';'))
  }
  for (const n of clone.querySelectorAll(INTERACTIVE)) n.remove()
  for (const n of clone.querySelectorAll('style')) n.remove()
  clone.removeAttribute('class')
  clone.removeAttribute('role')
  return clone
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
) {
  const e = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  if (text !== undefined) e.textContent = text
  return e
}

/** Greedy word wrap at `size` px. */
function wrap(text: string, maxWidth: number, size: number, weight = 400): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (line && textWidth(next, size, weight) > maxWidth) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

interface LegendLayoutItem {
  x: number
  y: number
  label: string
  color: string
  shape: 'rect' | 'line' | 'dot'
}

function layoutSwatches(spec: Extract<LegendSpec, { kind: 'swatch' }>, maxWidth: number) {
  const items: LegendLayoutItem[] = []
  let x = 0
  let row = 0
  for (const it of spec.items) {
    const w = 16 + textWidth(it.label, 12) + 16
    if (x > 0 && x + w > maxWidth) {
      x = 0
      row++
    }
    items.push({ x, y: row * 18, label: it.label, color: it.color, shape: it.shape ?? 'rect' })
    x += w
  }
  return { items, height: (row + 1) * 18 }
}

/** Build the standalone, self-contained SVG for a chart (optionally with title, legend and footer). */
export async function composeSvg(svg: SVGSVGElement, opts: ImageOptions = {}): Promise<ComposedSvg> {
  const t = readChartTheme()
  const font = await embeddedFontCss()
  const { width: w, height: h } = svgSize(svg)
  const chart = inlineClone(svg)
  const legend = opts.legend === false ? null : readLegend(svg)
  const framed = !!(opts.header || opts.footer)
  const pad = framed ? 24 : legend ? 12 : 0
  const innerW = Math.max(w, 280)
  const family = t.font.replace(/"/g, "'")

  const out = el('svg', { xmlns: SVG_NS, version: '1.1' })
  const style = el('style', {})
  style.textContent = `${font}text{font-family:${family}}`
  out.append(style)
  const bg = el('rect', { x: 0, y: 0, fill: opts.background ?? t.sheet })
  out.append(bg)

  let y = pad
  if (opts.header) {
    const title = el('text', { x: pad, y: y + 15, fill: t.ink }, opts.header.title)
    title.setAttribute('style', 'font-size:16px;font-weight:600;font-stretch:84%')
    out.append(title)
    y += 24
    if (opts.header.subtitle) {
      for (const line of wrap(opts.header.subtitle, innerW, 13)) {
        const sub = el('text', { x: pad, y: y + 12, fill: t.ink2 }, line)
        sub.setAttribute('style', 'font-size:13px')
        out.append(sub)
        y += 18
      }
    }
    y += 12
  }

  if (legend?.kind === 'swatch' && legend.items.length) {
    const lay = layoutSwatches(legend, innerW)
    for (const it of lay.items) {
      const cy = y + it.y + 9
      const sw =
        it.shape === 'line'
          ? el('rect', { x: pad + it.x, y: cy - 1, width: 14, height: 2, rx: 1, fill: it.color })
          : it.shape === 'dot'
            ? el('circle', { cx: pad + it.x + 4, cy, r: 4, fill: it.color })
            : el('rect', { x: pad + it.x, y: cy - 5, width: 10, height: 10, rx: 2, fill: it.color })
      out.append(sw)
      const label = el('text', { x: pad + it.x + 16, y: cy, dy: '0.32em', fill: t.ink2 }, it.label)
      label.setAttribute('style', 'font-size:12px')
      out.append(label)
    }
    y += lay.height + 10
  } else if (legend?.kind === 'ramp') {
    const id = 'census-ramp'
    const defs = el('defs', {})
    const grad = el('linearGradient', { id, x1: 0, x2: 1, y1: 0, y2: 0 })
    legend.colors.forEach((c, i) => {
      grad.append(
        el('stop', {
          offset: legend.colors.length > 1 ? i / (legend.colors.length - 1) : 0,
          'stop-color': c,
        }),
      )
    })
    defs.append(grad)
    out.append(defs)
    let x = pad
    if (legend.title) {
      const tt = el('text', { x, y: y + 4, dy: '0.32em', fill: t.ink2 }, legend.title)
      tt.setAttribute('style', 'font-size:12px')
      out.append(tt)
      x += textWidth(legend.title, 12) + 8
    }
    out.append(el('rect', { x, y, width: 128, height: 8, rx: 2, fill: `url(#${id})` }))
    legend.labels.forEach((l, i) => {
      const n = legend.labels.length
      const lx = x + (n > 1 ? (i / (n - 1)) * 128 : 0)
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
      const lt = el('text', { x: lx, y: y + 20, 'text-anchor': anchor, fill: t.muted }, l)
      lt.setAttribute('style', 'font-size:11px')
      out.append(lt)
    })
    y += 34
  }

  chart.setAttribute('x', String(pad))
  chart.setAttribute('y', String(y))
  chart.setAttribute('width', String(w))
  chart.setAttribute('height', String(h))
  if (!chart.getAttribute('viewBox')) chart.setAttribute('viewBox', `0 0 ${w} ${h}`)
  out.append(chart)
  y += h

  if (opts.footer) {
    y += 14
    const foot = el('text', { x: pad, y: y + 10, fill: t.muted }, opts.footer)
    foot.setAttribute('style', 'font-size:11px')
    out.append(foot)
    y += 14
  }
  y += pad

  const width = Math.ceil(Math.max(w, framed ? innerW : w) + pad * 2)
  const height = Math.ceil(y)
  out.setAttribute('width', String(width))
  out.setAttribute('height', String(height))
  out.setAttribute('viewBox', `0 0 ${width} ${height}`)
  bg.setAttribute('width', String(width))
  bg.setAttribute('height', String(height))
  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(out)}`
  return { markup, width, height }
}

export async function svgToString(svg: SVGSVGElement, opts?: ImageOptions): Promise<string> {
  return (await composeSvg(svg, opts)).markup
}

export interface RasterImage {
  blob: Blob
  /** CSS-pixel size (the bitmap is `scale` times larger). */
  width: number
  height: number
}

/** Rasterize a chart (and its optional frame) to PNG at `scale` (default 2x). */
export async function svgToPng(
  svg: SVGSVGElement,
  opts: ImageOptions & { scale?: number } = {},
): Promise<RasterImage> {
  const scale = opts.scale ?? 2
  const { markup, width, height } = await composeSvg(svg, opts)
  const url = URL.createObjectURL(new Blob([markup], { type: MIME.svg }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), MIME.png),
    )
    return { blob, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function pngDataUrl(image: RasterImage): Promise<string> {
  return blobToDataUrl(image.blob)
}

export async function downloadSvg(svg: SVGSVGElement, fileName: string, opts?: ImageOptions): Promise<void> {
  const markup = await svgToString(svg, opts)
  downloadBlob(new Blob([markup], { type: MIME.svg }), `${fileName}.svg`)
}

export async function downloadPng(
  svg: SVGSVGElement,
  fileName: string,
  opts?: ImageOptions & { scale?: number },
): Promise<void> {
  const { blob } = await svgToPng(svg, opts)
  downloadBlob(blob, `${fileName}.png`)
}

/**
 * Let React commit the re-themed charts. A theme switch re-renders synchronously after the
 * attribute change, so a short macrotask is enough; it also fires in background tabs, where
 * animation frames are paused.
 */
const settle = () => new Promise<void>((resolve) => window.setTimeout(resolve, 60))

/**
 * Run `fn` with the app temporarily in the light theme, so images captured for slides and
 * workbooks are ink on white whatever the viewer's theme. Charts re-render on the switch.
 */
export async function withLightTheme<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof document === 'undefined' || !readChartTheme().dark) return fn()
  const root = document.documentElement
  const prev = root.getAttribute('data-theme')
  root.setAttribute('data-theme', 'light')
  await settle()
  try {
    return await fn()
  } finally {
    if (prev === null) root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', prev)
  }
}
