/**
 * The debug overlays (docs/ROLES.md, 5.8), mounted by the shell while any is on in Developer mode.
 * It sets `data-dev-overlay` on <html> (the tour-target outlines are CSS in src/styles/index.css)
 * and draws the labels in one positioned layer that follows layout:
 *
 *  - Figure ids: a small label on each figure's top-left corner; clicking it copies the id.
 *  - Tour targets: a label with the `data-tour` name on every element a tour can point at.
 *  - Metric ids on hover: hovering a KPI tile, figure or finding (`data-metric`) shows its metric
 *    id and the fields it reads.
 *
 * No glows, shadows or color washes; tokens only. Off-screen renders (whole-view exports, figure
 * scans) are left alone.
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '@/components/toast'
import { useAnalytics } from '@/data/context'
import type { Overlays } from './store'

interface Label {
  key: string
  text: string
  x: number
  y: number
  copy: boolean
}

const FIGURE_SELECTOR = '[data-tour^="figure-"]:not([data-tour="figure-actions"])'
const OFFSCREEN = '[data-census-offscreen]'
/** Most labels drawn at once, so a long page stays responsive. */
const MAX_LABELS = 400

function collect(overlays: Overlays): Label[] {
  const out: Label[] = []
  const sx = window.scrollX
  const sy = window.scrollY
  const visible = (el: Element) => {
    if (el.closest(OFFSCREEN)) return null
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) return null
    return r
  }
  if (overlays.figures)
    for (const el of document.querySelectorAll(FIGURE_SELECTOR)) {
      const r = visible(el)
      const id = el.getAttribute('data-tour')?.slice('figure-'.length)
      if (!r || !id) continue
      out.push({ key: `f:${id}:${out.length}`, text: id, x: r.left + sx, y: r.top + sy, copy: true })
      if (out.length >= MAX_LABELS) return out
    }
  if (overlays.tours)
    for (const el of document.querySelectorAll('[data-tour]')) {
      if (el.matches(FIGURE_SELECTOR)) continue
      const r = visible(el)
      const name = el.getAttribute('data-tour')
      if (!r || !name) continue
      out.push({ key: `t:${name}:${out.length}`, text: name, x: r.left + sx, y: r.top + sy, copy: false })
      if (out.length >= MAX_LABELS) return out
    }
  return out
}

function useLabels(overlays: Overlays): Label[] {
  const [labels, setLabels] = useState<Label[]>([])
  useLayoutEffect(() => {
    if (!overlays.figures && !overlays.tours) {
      setLabels([])
      return
    }
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLabels(collect(overlays)))
    }
    update()
    // Follow layout: size changes, DOM changes (a tab switch, a chart drawn) and window resizes.
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
    const mo = new MutationObserver(update)
    mo.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    window.addEventListener('resize', update)
    // Fall back to a slow poll where frames do not run (a background tab).
    const poll = window.setInterval(update, 1500)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', update)
      window.clearInterval(poll)
    }
  }, [overlays])
  return labels
}

function MetricTip({ on }: { on: boolean }) {
  const { metrics } = useAnalytics()
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!on) {
      setTip(null)
      return
    }
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-metric]')
      const id = el?.getAttribute('data-metric')
      if (!el || !id || el.closest(OFFSCREEN)) {
        setTip(null)
        return
      }
      setTip({ id, x: e.clientX, y: e.clientY })
    }
    window.addEventListener('pointermove', over)
    return () => window.removeEventListener('pointermove', over)
  }, [on])
  if (!tip) return null
  const def = metrics.def(tip.id)
  const fields = def ? metrics.usesOf(tip.id) : []
  const left = Math.min(tip.x + 14, window.innerWidth - 320)
  const top = Math.min(tip.y + 16, window.innerHeight - 140)
  return (
    <div
      role="status"
      className="pointer-events-none fixed z-[70] max-w-[300px] rounded-control bg-ink px-2.5 py-2 text-on-ink"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
    >
      <p className="font-mono text-label break-all">{tip.id}</p>
      <p className="mt-1 text-label">
        {def
          ? fields.length
            ? `Reads ${fields.join(', ')}`
            : 'Reads no fields'
          : 'Not in the metric dictionary'}
      </p>
    </div>
  )
}

export default function DevOverlay({ overlays }: { overlays: Overlays }) {
  const labels = useLabels(overlays)
  // One layer for every label, in document coordinates, under the side sheets and dialogs.
  const [el] = useState(() => {
    const d = document.createElement('div')
    d.setAttribute('data-dev-layer', '')
    Object.assign(d.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '0',
      height: '0',
      zIndex: '30',
    })
    return d
  })
  useEffect(() => {
    document.body.append(el)
    return () => el.remove()
  }, [el])
  useEffect(() => {
    const on = (['figures', 'tours', 'metrics'] as const).filter((k) => overlays[k])
    const root = document.documentElement
    if (on.length) root.setAttribute('data-dev-overlay', on.join(' '))
    else root.removeAttribute('data-dev-overlay')
    return () => root.removeAttribute('data-dev-overlay')
  }, [overlays])
  return (
    <>
      {createPortal(
        labels.map((l) =>
          l.copy ? (
            <button
              key={l.key}
              type="button"
              title="Copy the figure id"
              onClick={() => {
                void navigator.clipboard?.writeText(l.text).then(
                  () => toast(`Copied ${l.text}`, { tone: 'good' }),
                  () => toast('The browser blocked copying', { tone: 'critical' }),
                )
              }}
              className="absolute rounded-chip bg-ink px-1 font-mono text-label whitespace-nowrap text-on-ink"
              style={{ left: l.x, top: l.y }}
            >
              {l.text}
            </button>
          ) : (
            <span
              key={l.key}
              aria-hidden="true"
              className="pointer-events-none absolute rounded-chip border border-rule-strong bg-sheet px-1 font-mono text-label whitespace-nowrap text-ink-2"
              style={{ left: l.x, top: l.y, transform: 'translateY(-100%)' }}
            >
              {l.text}
            </span>
          ),
        ),
        el,
      )}
      <MetricTip on={overlays.metrics} />
    </>
  )
}
