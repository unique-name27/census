/**
 * Figure registry: every <Figure> on screen registers its title, columns, rows and SVG getter,
 * so the view-level "Export" menu can build a workbook (sheet per figure) or a slide deck
 * (slide per figure) from exactly what is on screen.
 */
import { createContext, type ReactNode, use, useCallback, useMemo, useRef } from 'react'
import type { FigureFacts, RegisteredFigure } from './types'

interface Registry {
  register: (fig: RegisteredFigure) => () => void
  list: () => RegisteredFigure[]
  /**
   * What every figure on screen declares, with or without rows (the Developer page's figure scan
   * and contract checks). Never exported.
   */
  track: (facts: FigureFacts) => () => void
  tracked: () => FigureFacts[]
}

const Ctx = createContext<Registry | null>(null)

export function FigureRegistryProvider({ children }: { children: ReactNode }) {
  const figs = useRef(new Map<string, RegisteredFigure>())
  const register = useCallback((fig: RegisteredFigure) => {
    figs.current.set(fig.id, fig)
    return () => {
      if (figs.current.get(fig.id) === fig) figs.current.delete(fig.id)
    }
  }, [])
  const list = useCallback(() => [...figs.current.values()].sort((a, b) => a.order - b.order), [])
  const facts = useRef(new Map<string, FigureFacts>())
  const track = useCallback((f: FigureFacts) => {
    facts.current.set(f.id, f)
    return () => {
      if (facts.current.get(f.id) === f) facts.current.delete(f.id)
    }
  }, [])
  const tracked = useCallback(() => [...facts.current.values()].sort((a, b) => a.order - b.order), [])
  const value = useMemo(() => ({ register, list, track, tracked }), [register, list, track, tracked])
  return <Ctx value={value}>{children}</Ctx>
}

/** Registry of the current view; null outside a provider (figures then simply don't register). */
export function useFigureRegistry(): Registry | null {
  return use(Ctx)
}

let orderSeq = 0
/** Monotonic order so figures export in on-screen order. */
export const nextFigureOrder = () => ++orderSeq
