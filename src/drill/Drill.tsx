/**
 * Makes any number open the records behind it. Wrap the number:
 *   <Drill spec={() => drillSpec({ kind: 'employees', title: 'Voluntary leavers', rows: leavers })}>12.4%</Drill>
 * The spec is a function so the rows are only gathered when someone clicks.
 *
 * Inside the drill panel (a count in a records table, on a person card) a number opens its
 * records on top of what the panel shows, so Back returns to where the reader was.
 */
import { createContext, type ReactNode, useContext } from 'react'
import { cx } from '@/components/ui'
import { openDrill, pushDrill } from './store'
import type { DrillSpec } from './types'

export type DrillSource = DrillSpec | (() => DrillSpec | null) | null | undefined

export function resolveDrill(src: DrillSource): DrillSpec | null {
  if (!src) return null
  return typeof src === 'function' ? src() : src
}

/** Open a drill from an event handler (charts' onSelect, table cells). No-op without records. */
export function drill(src: DrillSource): void {
  const spec = resolveDrill(src)
  if (spec) openDrill(spec)
}

/** True inside the drill panel: numbers there stack their records instead of replacing the panel. */
const InDrillPanel = createContext(false)

/** Wraps the drill panel's body so the numbers in it open on top of it. */
export function DrillNesting({ children }: { children: ReactNode }) {
  return <InDrillPanel.Provider value>{children}</InDrillPanel.Provider>
}

/** Dotted underline that firms up on hover: clickable without shouting. */
export const DRILL_CLASS =
  'cursor-pointer rounded-[2px] underline decoration-dotted decoration-rule-strong decoration-1 underline-offset-[3px] hover:decoration-ink hover:decoration-solid focus-visible:decoration-solid'

export function Drill({
  spec,
  children,
  className,
  label,
}: {
  spec: DrillSource
  children: ReactNode
  className?: string
  /** Accessible name, e.g. "Show the 57 leavers". Defaults to "Show the records behind this number". */
  label?: string
}) {
  const nested = useContext(InDrillPanel)
  if (!spec) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      className={cx(DRILL_CLASS, 'text-inherit', className)}
      aria-label={label}
      title={label ?? 'Show the records behind this number'}
      onClick={(e) => {
        e.stopPropagation()
        const s = resolveDrill(spec)
        if (s) (nested ? pushDrill : openDrill)(s)
      }}
    >
      {children}
    </button>
  )
}
