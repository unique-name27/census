/**
 * Small hooks for the Recruiting view: the shared model, container width for the custom SVG
 * figures, and the chart tooltip (the same floating sheet the chart kit uses).
 */
import { type RefObject, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { placeTip, renderTip, type TipContent } from '@/charts/core/tooltip'
import { useAnalytics } from '@/data/context'
import { computeRecruiting, type RecruitingModel } from '../engine'

/** The recruiting model for the current scope, computed once per analytics context. */
export function useRecruiting(): RecruitingModel {
  const ctx = useAnalytics()
  return useMemo(() => computeRecruiting(ctx), [ctx])
}

/** Width of an element; keeps the last real width while it is hidden (table view), so exports still work. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
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

/** Tooltip bound to a positioned container: show at a pointer event, or at an element (keyboard focus). */
export function useTip() {
  const boxRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const at = (content: TipContent, x: number, y: number) => {
    const tip = tipRef.current
    const box = boxRef.current
    if (!tip || !box) return
    renderTip(tip, content)
    tip.hidden = false
    placeTip(tip, box, x, y)
  }
  return {
    boxRef,
    tipRef,
    show(content: TipContent, e: { clientX: number; clientY: number }) {
      const box = boxRef.current
      if (!box) return
      const r = box.getBoundingClientRect()
      at(content, e.clientX - r.left, e.clientY - r.top)
    },
    showAt(content: TipContent, el: Element) {
      const box = boxRef.current
      if (!box) return
      const r = box.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      at(content, b.left - r.left + b.width / 2, b.top - r.top + Math.min(b.height / 2, 24))
    },
    hide() {
      if (tipRef.current) tipRef.current.hidden = true
    },
  }
}
