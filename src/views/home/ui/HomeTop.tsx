/**
 * A role home's top band and its Needs attention, in the order the screen calls for
 * (docs/ACTION-CENTER-AUDIT.md part 6, Layout; docs/ROLES-V2.md 5.1): from 768px the hero beside
 * the key figures with the lead charts, then Needs attention; on a phone the hero, then Needs
 * attention with its list first, then the key figures and charts, so the first item is within the
 * first two screens. Each part has its own h2 (visually hidden for the band), so headings run h1,
 * h2, h3 with no skip.
 */
import type { ReactNode } from 'react'
import { Grid } from '@/components'
import { useNarrow } from '@/components/useNarrow'

function Band({
  id,
  title,
  children,
  className,
}: {
  id: string
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="sr-only">
        {title}
      </h2>
      <Grid>{children}</Grid>
    </section>
  )
}

export function HomeTop({
  hero,
  overview,
  attention,
}: {
  /** The one hero figure (span 4). */
  hero: ReactNode
  /** The key figures and the lead charts. */
  overview: ReactNode
  /** The Needs attention section. */
  attention: ReactNode
}) {
  const narrow = useNarrow()
  if (narrow)
    return (
      <>
        <Band id="band-overview" title="Overview">
          {hero}
        </Band>
        {attention}
        <Band id="band-key-figures" title="Key figures" className="mt-10">
          {overview}
        </Band>
      </>
    )
  return (
    <>
      <Band id="band-overview" title="Overview">
        {hero}
        {overview}
      </Band>
      {attention}
    </>
  )
}
