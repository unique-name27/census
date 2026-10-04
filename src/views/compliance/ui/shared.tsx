/**
 * Shared UI pieces for the Compliance view: definitions from the metric dictionary, status
 * words and tones, the Atlas link, and empty states.
 */
import { useTools } from '@/app/ToolsMenu'
import type { Definition } from '@/charts'
import { Button, EmptyState, goTo, IconDatabase, type Severity, type Span } from '@/components'
import { definitionOf } from '@/metrics/api'
import type { MetricsApi } from '@/metrics/types'
import type { ReverificationStatus } from '../engine/work'

/** Figure definitions, each from the registry (with your wording), in order. */
export function defs(
  m: Pick<MetricsApi, 'def'>,
  ids: readonly string[],
  extra: Definition[] = [],
): Definition[] {
  return [...ids.flatMap((id) => definitionOf(m, id) ?? []), ...extra]
}

export const STATUS_SEVERITY: Record<ReverificationStatus, Severity | null> = {
  Expired: 'critical',
  'Not started': 'critical',
  'Started late': 'warning',
  'Not due yet': null,
  'On time': 'good',
}

/** The Atlas page of a jurisdiction (Tools menu > HR process catalog), for Column.href. */
export function useAtlasHref(): (jurisdiction: string) => string | null {
  const tools = useTools()
  const catalog = tools.find((t) => t.id === 'catalog')?.url
  return (id) =>
    catalog && /^[a-z]{2}(-[a-z]{2})?$/.test(id) ? `${catalog.split('#')[0]}#country.${id}` : null
}

/** A missing dataset, with a way to the Data room. */
export function NeedData({ title, body, span = 12 }: { title: string; body: string; span?: Span }) {
  return (
    <EmptyState
      span={span}
      icon={<IconDatabase />}
      title={title}
      body={body}
      action={
        <Button size="sm" onClick={() => goTo('data')}>
          Open the Data room
        </Button>
      }
    />
  )
}

export const NO_RTW = {
  title: 'Upload Right to work to see this',
  body: 'This tab reads the Right to work dataset: one row per employee with the work authorization expiry, reverification start, Form I-9 dates and export license status. It never holds nationality or citizenship. Add it in the Data room.',
}

/** The note every statutory calendar figure carries. */
export const COUNSEL_NOTE =
  'Reference from the Hire-to-Retire Atlas, a working draft: confirm dates and obligations with employment counsel'
