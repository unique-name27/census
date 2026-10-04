/**
 * 16px stroke icons (1.5px), drawn for Census. currentColor, no fills except where noted.
 */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
  </Svg>
)
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10" />
  </Svg>
)
export const IconTable = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="3" width="11" height="10" rx="1" />
    <path d="M2.5 6.5h11M2.5 9.75h11M6.5 6.5V13" />
  </Svg>
)
export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5" />
  </Svg>
)
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 7.25V11M8 5.1v.05" />
  </Svg>
)
export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
  </Svg>
)
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m6.5 4.5 3.5 3.5-3.5 3.5" />
  </Svg>
)
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m3.5 8.5 3 3 6-7" />
  </Svg>
)
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
  </Svg>
)
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3.25 3.25" />
  </Svg>
)
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M10.5 3.5V3a.5.5 0 0 0-.5-.5H3a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h.5" />
  </Svg>
)
export const IconImage = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="3" width="11" height="10" rx="1" />
    <path d="m2.5 11 3.25-3 2.5 2.25L10.5 8l3 2.75" />
    <circle cx="10.25" cy="5.75" r=".75" />
  </Svg>
)
export const IconFile = (p: P) => (
  <Svg {...p}>
    <path d="M4 2.5h5L12 5.5v8H4z" />
    <path d="M9 2.5v3h3" />
  </Svg>
)
export const IconSlides = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="3" width="12" height="8" rx="1" />
    <path d="M8 11v2.5M5.5 13.5h5" />
  </Svg>
)
export const IconFilter = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
  </Svg>
)
export const IconReset = (p: P) => (
  <Svg {...p}>
    <path d="M3 8a5 5 0 1 0 1.5-3.55M3 3v2.5h2.5" />
  </Svg>
)
export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
  </Svg>
)
export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M13 9.6A5.25 5.25 0 0 1 6.4 3a5.25 5.25 0 1 0 6.6 6.6z" />
  </Svg>
)
export const IconMonitor = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="2.75" width="12" height="8.5" rx="1" />
    <path d="M6 13.75h4M8 11.25v2.5" />
  </Svg>
)
export const IconDatabase = (p: P) => (
  <Svg {...p}>
    <ellipse cx="8" cy="4" rx="5" ry="1.75" />
    <path d="M3 4v8c0 .97 2.24 1.75 5 1.75s5-.78 5-1.75V4M3 8c0 .97 2.24 1.75 5 1.75S13 8.97 13 8" />
  </Svg>
)
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Svg>
)
export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8z" />
    <circle cx="8" cy="8" r="1.75" />
  </Svg>
)
export const IconArrowUp = (p: P) => (
  <Svg {...p}>
    <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
  </Svg>
)
export const IconArrowDown = (p: P) => (
  <Svg {...p}>
    <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
  </Svg>
)
export const IconPeople = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M2 13c.4-2.3 2-3.5 4-3.5s3.6 1.2 4 3.5" />
    <path d="M10.5 3.5a2.25 2.25 0 0 1 0 4.25M12 9.75c1 .5 1.75 1.6 2 3.25" />
  </Svg>
)

/* Status glyphs: filled shapes so state never depends on color alone. */
export const IconCritical = (p: P) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M8 1.5 15 14H1z" />
    <path d="M8 6v3.5M8 11.4v.1" stroke="var(--sheet)" strokeWidth={1.6} />
  </Svg>
)
export const IconWarning = (p: P) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" />
    <path d="M8 5.25v3.5M8 10.6v.1" stroke="var(--sheet)" strokeWidth={1.6} />
  </Svg>
)
export const IconInfoFilled = (p: P) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7.25V11M8 5.1v.05" stroke="var(--sheet)" strokeWidth={1.6} />
  </Svg>
)
export const IconGood = (p: P) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <circle cx="8" cy="8" r="6.5" />
    <path d="m5.25 8.25 1.9 1.9 3.6-4.15" stroke="var(--sheet)" strokeWidth={1.6} fill="none" />
  </Svg>
)
export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V4.5A.5.5 0 0 1 3 4h3.5" />
  </Svg>
)
export const IconApps = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="4.25" height="4.25" rx=".75" />
    <rect x="9.25" y="2.5" width="4.25" height="4.25" rx=".75" />
    <rect x="2.5" y="9.25" width="4.25" height="4.25" rx=".75" />
    <rect x="9.25" y="9.25" width="4.25" height="4.25" rx=".75" />
  </Svg>
)
export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="M10.5 3 13 5.5 6 12.5H3.5V10z" />
  </Svg>
)
export const IconGear = (p: P) => (
  <Svg {...p}>
    <path d="M6.59 3.1 6.97 1.48h2.06l.38 1.62 1.06.44 1.41-.88 1.46 1.46-.88 1.41.44 1.06 1.62.38v2.06l-1.62.38-.44 1.06.88 1.41-1.46 1.46-1.41-.88-1.06.44-.38 1.62H6.97l-.38-1.62-1.06-.44-1.41.88-1.46-1.46.88-1.41-.44-1.06-1.62-.38V6.97l1.62-.38.44-1.06-.88-1.41 1.46-1.46 1.41.88Z" />
    <circle cx="8" cy="8" r="2.1" />
  </Svg>
)
