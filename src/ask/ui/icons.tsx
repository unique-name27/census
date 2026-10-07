/**
 * Icons for Ask Census, drawn like the icon set: 16px, 1.5px stroke, currentColor.
 */
import type { SVGProps } from 'react'

function Svg({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  )
}

/** A query field with its prompt: type a question. */
export const IconAsk = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" />
    <path d="m4.75 6.25 2 1.75-2 1.75M8.75 9.75h2.5" />
  </Svg>
)

/** Stop: a square. */
export const IconStop = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.25" />
  </Svg>
)

/** Work in progress: an open ring that turns (still when motion is reduced). */
export const IconWorking = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M8 2.75a5.25 5.25 0 1 1-5.25 5.25" />
  </Svg>
)

/** A new, empty sheet. */
export const IconNewChat = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 2.75H4.25a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V7" />
    <path d="M11.5 2v4M9.5 4h4" />
  </Svg>
)

/** Collapse the panel to its rail: a bar with an arrow out to the right edge. */
export const IconCollapse = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
    <path d="M10 2.75v10.5M5 6.25 6.75 8 5 9.75" />
  </Svg>
)

/** Undo: an arrow turning back. */
export const IconUndo = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5.5 4.25 2.75 7l2.75 2.75" />
    <path d="M2.75 7h6.5a3.5 3.5 0 0 1 0 7H7.5" />
  </Svg>
)

/** Open full size: corners pulled out. */
export const IconExpand = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9.5 2.75h3.75V6.5M6.5 13.25H2.75V9.5M13.25 2.75 9 7M2.75 13.25 7 9" />
  </Svg>
)

/** An action Ask took on the screen: a pointer on a frame. */
export const IconAction = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M13.25 7.25V4.25a1.5 1.5 0 0 0-1.5-1.5h-7.5a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h3" />
    <path d="m9.25 9.25 4.5 1.5-2 .75-.75 2-1.75-4.25Z" />
  </Svg>
)

/** The phone sheet's height: a chevron up (taller) or down (shorter). */
export const IconChevronUp = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m4.5 10 3.5-3.5 3.5 3.5" />
  </Svg>
)
