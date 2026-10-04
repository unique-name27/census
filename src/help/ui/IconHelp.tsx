import type { SVGProps } from 'react'

/** A question mark in a circle: 16px, 1.5px stroke like the icon set. */
export function IconHelp(p: SVGProps<SVGSVGElement>) {
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
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.2 6.3a1.9 1.9 0 0 1 3.65.55c0 1.25-1.85 1.6-1.85 2.75" />
      <path d="M8 11.4v.1" />
    </svg>
  )
}
