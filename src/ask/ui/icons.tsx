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
