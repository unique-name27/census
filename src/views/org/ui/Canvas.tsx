/**
 * The pan-and-zoom surface for the org chart. Cards are DOM, connectors one SVG path, both inside
 * one transformed layer. Drag the background to pan (or a card, outside the sandbox), wheel or
 * pinch to zoom around the pointer, buttons for zoom, fit and 100%. Arrow keys move the selection
 * along reporting lines. In the sandbox, dragging a card onto another card proposes a move.
 */
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconButton } from '@/components'
import { cx } from '@/components/ui'
import type { ColorScheme, Flag, Layout, OrgTree, ReqStub } from '../engine'
import { COMPANY_ROOT, swatchCss } from '../engine'
import { Card, type DropState } from './Card'

export interface DragHandlers {
  /** The pointer moved over a card (or off every card) while dragging `dragId`. */
  onHover: (dragId: string, targetId: string | null) => void
  onDrop: (dragId: string, targetId: string | null) => void
  /** Drop state of a card while dragging. */
  dropState: (id: string) => DropState
  /** Id being dragged, owned by the parent so the side panel can follow it. */
  dragId: string | null
}

export interface CanvasProps {
  tree: OrgTree
  layout: Layout
  rootId: string
  expanded: ReadonlySet<string>
  canOpen: (id: string) => boolean
  onToggle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  flags: ReadonlyMap<string, readonly Flag[]>
  showFlags: boolean
  scheme: ColorScheme
  matches: (id: string) => boolean
  reqByCardId: ReadonlyMap<string, ReqStub>
  /** When this changes (for example the levels shown), the view returns to the top of the chart. */
  placeKey?: string
  /** Bump `n` to pan to a card. */
  centerRequest?: { id: string; n: number } | null
  label: string
  drag?: DragHandlers
  changed?: ReadonlySet<string>
  /** Extra overlay content (e.g. a hint) in the top-left corner. */
  overlay?: ReactNode
  className?: string
}

interface View {
  x: number
  y: number
  k: number
}

const PAD = 32
/** Charts with more cards than this render only the cards near the viewport. */
const CULL_OVER = 250
const CHUNK = 512
const MIN_K = 0.08
const MAX_K = 2
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k))

type Gesture =
  | { kind: 'pending'; id: number; sx: number; sy: number; view: View; dragId: string | null }
  | { kind: 'pan'; id: number; sx: number; sy: number; view: View }
  | { kind: 'drag'; id: number; dragId: string }
  | { kind: 'pinch'; dist: number; mid: { x: number; y: number }; view: View }

export function Canvas(p: CanvasProps) {
  const vpRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setViewState] = useState<View>({ x: PAD, y: PAD, k: 1 })
  const viewRef = useRef(view)
  const [animate, setAnimate] = useState(false)
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const suppressClick = useRef(false)
  const anchor = useRef<{ id: string; sx: number; sy: number } | null>(null)
  const placedRoot = useRef<string | null>(null)
  const animTimer = useRef<number | undefined>(undefined)
  const [panning, setPanning] = useState(false)
  const [wheelHint, setWheelHint] = useState(false)
  const hintTimer = useRef<number | undefined>(undefined)
  // Latest props for event handlers and gestures (kept out of render so the compiler can memoize).
  const props = useRef(p)
  useLayoutEffect(() => {
    props.current = p
  })

  const setView = (v: View, anim = false) => {
    viewRef.current = v
    setViewState(v)
    if (anim) {
      setAnimate(true)
      window.clearTimeout(animTimer.current)
      animTimer.current = window.setTimeout(() => setAnimate(false), 240)
    }
  }

  // Track the viewport size.
  useLayoutEffect(() => {
    const el = vpRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const topView = (k = viewRef.current.k): View => {
    const { layout, rootId } = props.current
    const root = layout.byId.get(rootId)
    const w = vpRef.current?.clientWidth ?? 0
    if (!root) return { x: PAD, y: PAD, k }
    const fits = layout.width * k + 2 * PAD <= w
    return {
      x: fits ? (w - layout.width * k) / 2 : w / 2 - (root.x + root.w / 2) * k,
      y: PAD,
      k,
    }
  }

  const fitView = (): View => {
    const { layout } = props.current
    const w = vpRef.current?.clientWidth ?? 0
    const h = vpRef.current?.clientHeight ?? 0
    const k = clampK(Math.min((w - 2 * PAD) / layout.width, (h - 2 * PAD) / layout.height, 1))
    return {
      x: (w - layout.width * k) / 2,
      y: Math.max(PAD, (h - layout.height * k) / 2),
      k,
    }
  }

  // Place the root at the top when the chart opens or its root changes; keep a toggled card
  // where it was on screen when the layout changes under it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: placement reads the latest props through a ref; it should run only when the layout, root or width change
  useLayoutEffect(() => {
    if (!size.w) return
    const placeKey = `${p.rootId}|${p.placeKey ?? ''}`
    if (placedRoot.current !== placeKey) {
      placedRoot.current = placeKey
      anchor.current = null
      // Fit the width when it can be done at a readable size; otherwise start at the root.
      const fitK = (size.w - 2 * PAD) / Math.max(1, p.layout.width)
      const k = clampK(Math.min(1, Math.max(size.w < 640 ? 0.6 : 0.55, fitK)))
      setView(topView(k))
      return
    }
    const a = anchor.current
    anchor.current = null
    if (!a) return
    const c = p.layout.byId.get(a.id)
    if (!c) return
    const v = viewRef.current
    setView({ ...v, x: v.x + a.sx - (v.x + c.x * v.k), y: v.y + a.sy - (v.y + c.y * v.k) })
  }, [p.layout, p.rootId, p.placeKey, size.w])

  const centerOn = (id: string, anim = true) => {
    const c = props.current.layout.byId.get(id)
    const el = vpRef.current
    if (!c || !el) return
    const v = viewRef.current
    const k = Math.max(v.k, 0.6)
    setView(
      { x: el.clientWidth / 2 - (c.x + c.w / 2) * k, y: el.clientHeight / 3 - (c.y + c.h / 2) * k, k },
      anim,
    )
  }

  // External "jump to" requests (search, detail panel links).
  const req = p.centerRequest
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new request is signalled by bumping n
  useEffect(() => {
    if (!req) return
    // Next task, so a just-expanded layout is in place.
    const t = window.setTimeout(() => centerOn(req.id), 0)
    return () => window.clearTimeout(t)
  }, [req?.n])

  const zoomAt = (factor: number, cx: number, cy: number, anim = false) => {
    const v = viewRef.current
    const k = clampK(v.k * factor)
    const r = k / v.k
    setView({ k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }, anim)
  }

  // Wheel and trackpad pinch zoom around the pointer (non-passive so the page doesn't scroll).
  // biome-ignore lint/correctness/useExhaustiveDependencies: attach once; zoomAt reads the current view through a ref
  useEffect(() => {
    const el = vpRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      // Zoom with Ctrl or Cmd held (trackpad pinch arrives that way too) or once the chart has
      // been clicked; otherwise let the page scroll past and say how to zoom.
      const engaged = ev.ctrlKey || ev.metaKey || el.contains(document.activeElement)
      if (!engaged) {
        setWheelHint(true)
        window.clearTimeout(hintTimer.current)
        hintTimer.current = window.setTimeout(() => setWheelHint(false), 1400)
        return
      }
      ev.preventDefault()
      setWheelHint(false)
      const rect = el.getBoundingClientRect()
      const scale = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1
      const factor = Math.exp(-ev.deltaY * scale * (ev.ctrlKey ? 0.01 : 0.0015))
      zoomAt(factor, ev.clientX - rect.left, ev.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ───────── pointer gestures ───────── */

  const cardAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const card = el?.closest<HTMLElement>('[data-card][data-person]')
    return card && vpRef.current?.contains(card) ? (card.dataset.card ?? null) : null
  }

  const onMove = (ev: PointerEvent) => {
    if (!pointers.current.has(ev.pointerId)) return
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    const g = gesture.current
    if (!g) return
    const el = vpRef.current
    const rect = el?.getBoundingClientRect()
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!a || !b || !rect) return
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const k = clampK(g.view.k * (dist / g.dist))
      const r = k / g.view.k
      const mx = (a.x + b.x) / 2 - rect.left
      const my = (a.y + b.y) / 2 - rect.top
      setView({ k, x: mx - (g.mid.x - g.view.x) * r, y: my - (g.mid.y - g.view.y) * r })
      return
    }
    if (ev.pointerId !== g.id) return
    if (g.kind === 'pending') {
      if (Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) < 5) return
      if (g.dragId && props.current.drag) {
        gesture.current = { kind: 'drag', id: g.id, dragId: g.dragId }
        props.current.drag.onHover(g.dragId, null)
      } else {
        gesture.current = { kind: 'pan', id: g.id, sx: g.sx, sy: g.sy, view: g.view }
        setPanning(true)
      }
    }
    const cur = gesture.current
    if (cur?.kind === 'pan') {
      setView({ ...cur.view, x: cur.view.x + ev.clientX - cur.sx, y: cur.view.y + ev.clientY - cur.sy })
    } else if (cur?.kind === 'drag' && rect) {
      const lx = ev.clientX - rect.left
      const ly = ev.clientY - rect.top
      const name = props.current.tree.people.get(cur.dragId)?.name ?? ''
      setGhost({ x: lx, y: ly, label: name })
      props.current.drag?.onHover(cur.dragId, cardAt(ev.clientX, ev.clientY))
      // Pan when the pointer nears an edge so far-away managers are reachable.
      const edge = 36
      const dx = lx < edge ? 14 : lx > rect.width - edge ? -14 : 0
      const dy = ly < edge ? 14 : ly > rect.height - edge ? -14 : 0
      if (dx || dy) {
        const v = viewRef.current
        setView({ ...v, x: v.x + dx, y: v.y + dy })
      }
    }
  }

  const endGesture = (ev: PointerEvent) => {
    pointers.current.delete(ev.pointerId)
    const g = gesture.current
    if (g?.kind === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null
      suppressNextClick()
      cleanup()
      return
    }
    if (!g || ev.pointerId !== g.id) return
    gesture.current = null
    if (g.kind === 'drag') {
      const target = ev.type === 'pointercancel' ? null : cardAt(ev.clientX, ev.clientY)
      setGhost(null)
      props.current.drag?.onDrop(g.dragId, target)
      suppressNextClick()
    } else if (g.kind === 'pan') {
      setPanning(false)
      suppressNextClick()
    }
    cleanup()
  }

  const suppressNextClick = () => {
    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const cleanup = () => {
    if (pointers.current.size > 0) return
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', endGesture)
    window.removeEventListener('pointercancel', endGesture)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount cleanup only
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endGesture)
      window.removeEventListener('pointercancel', endGesture)
      window.clearTimeout(animTimer.current)
      window.clearTimeout(hintTimer.current)
    },
    [],
  )

  const onPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    const target = ev.target as HTMLElement
    if (target.closest('button, input, a, [data-no-pan]')) return
    const rect = vpRef.current!.getBoundingClientRect()
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      if (gesture.current?.kind === 'drag') setGhost(null)
      gesture.current = {
        kind: 'pinch',
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
        view: viewRef.current,
      }
      return
    }
    const card = target.closest<HTMLElement>('[data-card][data-person]')
    const dragId = p.drag && card ? (card.dataset.card ?? null) : null
    gesture.current = {
      kind: 'pending',
      id: ev.pointerId,
      sx: ev.clientX,
      sy: ev.clientY,
      view: viewRef.current,
      dragId: dragId === COMPANY_ROOT ? null : dragId,
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endGesture)
    window.addEventListener('pointercancel', endGesture)
  }

  /* ───────── keyboard ───────── */

  // Visible children per parent, in on-screen order (requisition cards are skipped).
  const kids = new Map<string, string[]>()
  for (const c of p.layout.cards) {
    if (c.kind === 'req' || !c.parentId) continue
    const arr = kids.get(c.parentId)
    if (arr) arr.push(c.id)
    else kids.set(c.parentId, [c.id])
  }

  const ensureVisible = (id: string) => {
    const c = props.current.layout.byId.get(id)
    const el = vpRef.current
    if (!c || !el) return
    const v = viewRef.current
    const x0 = v.x + c.x * v.k
    const y0 = v.y + c.y * v.k
    const x1 = x0 + c.w * v.k
    const y1 = y0 + c.h * v.k
    if (x0 < 8 || y0 < 8 || x1 > el.clientWidth - 8 || y1 > el.clientHeight - 8) centerOn(id)
  }

  const selectAndFocus = (id: string) => {
    props.current.onSelect(id)
    window.setTimeout(() => {
      const el = vpRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)
      el?.focus({ preventScroll: true })
      ensureVisible(id)
    })
  }

  const onToggle = (id: string) => {
    const c = props.current.layout.byId.get(id)
    const v = viewRef.current
    if (c) anchor.current = { id, sx: v.x + c.x * v.k, sy: v.y + c.y * v.k }
    props.current.onToggle(id)
  }

  const onSelectCard = (id: string) => {
    if (suppressClick.current) return
    const card = props.current.layout.byId.get(id)
    if (!card || card.kind === 'req') return
    props.current.onSelect(id)
  }

  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    const { layout, selectedId, rootId, tree, expanded, canOpen } = props.current
    const vp = vpRef.current
    if (!vp) return
    const cx = vp.clientWidth / 2
    const cy = vp.clientHeight / 2
    if (ev.key === '+' || ev.key === '=') {
      ev.preventDefault()
      zoomAt(1.25, cx, cy, true)
      return
    }
    if (ev.key === '-' || ev.key === '_') {
      ev.preventDefault()
      zoomAt(0.8, cx, cy, true)
      return
    }
    // The card with focus wins over the selection (Tab can land on the root before anything is selected).
    const focused = (ev.target as HTMLElement).closest<HTMLElement>('[data-card][data-person]')?.dataset.card
    const cur =
      focused && layout.byId.has(focused)
        ? focused
        : selectedId && layout.byId.has(selectedId)
          ? selectedId
          : null
    if (ev.key === 'Escape') {
      if (cur) {
        ev.preventDefault()
        props.current.onSelect(null)
      }
      return
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Home'].includes(ev.key)) return
    ev.preventDefault()
    if (!cur || ev.key === 'Home') {
      selectAndFocus(rootId)
      return
    }
    const card = layout.byId.get(cur)!
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (canOpen(cur)) onToggle(cur)
      return
    }
    if (ev.key === 'ArrowUp') {
      if (card.parentId) selectAndFocus(card.parentId)
      return
    }
    if (ev.key === 'ArrowDown') {
      const first = kids.get(cur)?.[0] ?? tree.children.get(cur)?.[0]
      if (!first) return
      if (!expanded.has(cur) && canOpen(cur)) onToggle(cur)
      selectAndFocus(first)
      return
    }
    const sibs = card.parentId ? (kids.get(card.parentId) ?? []) : [cur]
    const i = sibs.indexOf(cur)
    const next = sibs[i + (ev.key === 'ArrowRight' ? 1 : -1)]
    if (next) selectAndFocus(next)
  }

  /* ───────── render ───────── */

  const t = p.tree
  const dragId = p.drag?.dragId ?? null
  // Big charts render only the cards near the viewport: a window about three viewports wide,
  // snapped to a grid so it only changes when the view moves a fair way.
  let [cx0, cy0, cx1, cy1] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ]
  if (p.layout.cards.length > CULL_OVER && size.w) {
    const vw = size.w / view.k
    const vh = size.h / view.k
    cx0 = Math.floor((-view.x / view.k - vw) / CHUNK) * CHUNK
    cy0 = Math.floor((-view.y / view.k - vh) / CHUNK) * CHUNK
    cx1 = Math.ceil((-view.x / view.k + 2 * vw) / CHUNK) * CHUNK
    cy1 = Math.ceil((-view.y / view.k + 2 * vh) / CHUNK) * CHUNK
  }
  // One tab stop for the whole tree: the selected card, else the root.
  const tabStop = p.selectedId && p.layout.byId.has(p.selectedId) ? p.selectedId : p.rootId
  const shown = p.layout.cards.filter(
    (c) => c.id === tabStop || (c.x + c.w >= cx0 && c.x <= cx1 && c.y + c.h >= cy0 && c.y <= cy1),
  )
  const cards = shown.map((c) => {
    const e = t.people.get(c.id)
    const sibs = c.parentId ? (kids.get(c.parentId) ?? []) : [c.id]
    return (
      <Card
        key={c.id}
        card={c}
        person={e}
        req={c.kind === 'req' ? p.reqByCardId.get(c.id) : undefined}
        companySize={t.people.size}
        directs={t.directs.get(c.id) ?? 0}
        total={t.total.get(c.id) ?? 0}
        flags={p.flags.get(c.id)}
        showFlags={p.showFlags}
        color={e ? swatchCss(p.scheme.swatchOf(e)) : 'var(--ink)'}
        selected={p.selectedId === c.id}
        tabbable={c.id === tabStop}
        dimmed={!!e && !p.matches(c.id)}
        expandable={p.canOpen(c.id)}
        expanded={p.expanded.has(c.id)}
        changed={!!p.changed?.has(c.id)}
        dragging={dragId === c.id}
        drop={dragId ? (p.drag?.dropState(c.id) ?? null) : null}
        setSize={sibs.length}
        posInSet={sibs.indexOf(c.id) + 1}
        onToggle={onToggle}
        onSelect={onSelectCard}
      />
    )
  })

  const zoomBtn = (factor: number) => () => zoomAt(factor, size.w / 2, size.h / 2, true)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pan surface for pointer users; keyboard users move through the tree items and the zoom buttons
    <div
      ref={vpRef}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onScroll={(ev) => {
        // The browser can scroll this clipped box (focus, find in page); turn that into a pan.
        const el = ev.currentTarget
        if (!el.scrollLeft && !el.scrollTop) return
        const v = viewRef.current
        setView({ ...v, x: v.x - el.scrollLeft, y: v.y - el.scrollTop })
        el.scrollLeft = 0
        el.scrollTop = 0
      }}
      onClick={(ev) => {
        if (suppressClick.current) return
        if (!(ev.target as HTMLElement).closest('[data-card], button')) p.onSelect(null)
      }}
      className={cx(
        'relative touch-none overflow-hidden rounded-control bg-sheet-2 outline-none select-none',
        panning ? 'cursor-grabbing' : 'cursor-grab',
        p.className,
      )}
    >
      <div
        role="tree"
        aria-label={p.label}
        onKeyDown={onKeyDown}
        className={cx(
          'absolute top-0 left-0 origin-top-left',
          animate && 'transition-transform duration-200 ease-out',
        )}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          width: p.layout.width,
          height: p.layout.height,
        }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          width={p.layout.width}
          height={p.layout.height}
        >
          <path
            d={connectorPath(p.layout)}
            fill="none"
            stroke="var(--rule-strong)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {cards}
      </div>

      {p.overlay && <div className="pointer-events-none absolute top-2 left-2 max-w-[70%]">{p.overlay}</div>}

      <div
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute inset-x-0 top-3 flex justify-center transition-opacity duration-150',
          wheelHint ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="rounded-control bg-ink px-2.5 py-1 text-[12px] text-on-ink">
          Click the chart or hold Ctrl to zoom with the scroll wheel
        </span>
      </div>

      {ghost && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 rounded-control bg-ink px-2 py-1 text-[12px] font-medium whitespace-nowrap text-on-ink shadow-(--shadow-pop)"
          style={{ left: ghost.x + 12, top: ghost.y + 12 }}
        >
          {ghost.label}
        </div>
      )}

      <div
        data-no-pan
        className="absolute right-2 bottom-2 flex items-center gap-0.5 rounded-control bg-sheet p-0.5 shadow-[0_0_0_1px_var(--rule)]"
      >
        <IconButton label="Zoom out" size="sm" onClick={zoomBtn(0.8)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
        <span className="tnum w-11 text-center text-[12px] text-ink-2" aria-live="polite">
          {Math.round(view.k * 100)}%
        </span>
        <IconButton label="Zoom in" size="sm" onClick={zoomBtn(1.25)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 8h8M8 4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-rule" />
        <button
          type="button"
          onClick={() => setView(fitView(), true)}
          className="h-7 rounded-control px-2 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={() => {
            const sel = props.current.selectedId
            if (sel && props.current.layout.byId.has(sel)) {
              const c = props.current.layout.byId.get(sel)!
              setView({ k: 1, x: size.w / 2 - (c.x + c.w / 2), y: size.h / 3 - (c.y + c.h / 2) }, true)
            } else setView(topView(1), true)
          }}
          className="h-7 rounded-control px-2 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
        >
          100%
        </button>
      </div>
    </div>
  )
}

function connectorPath(layout: Layout): string {
  let d = ''
  for (const [x1, y1, x2, y2] of layout.segments) {
    const a = Math.round(x1) + 0.5
    const b = Math.round(y1) + 0.5
    d += x1 === x2 ? `M${a} ${b}V${Math.round(y2) + 0.5}` : `M${a} ${b}H${Math.round(x2) + 0.5}`
  }
  return d
}
