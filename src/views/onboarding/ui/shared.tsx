/**
 * Shared UI pieces for the Onboarding view: the model hook, status words and tones, definitions
 * from the metric dictionary, and empty states.
 */
import { useMemo } from 'react'
import type { Definition, Tone } from '@/charts'
import { Button, EmptyState, goTo, IconDatabase, IconDownload, type Severity, type Span } from '@/components'
import { useAnalytics } from '@/data/context'
import type { DatasetKey } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { DASH } from '@/lib/format'
import { definitionOf } from '@/metrics/api'
import type { MetricsApi } from '@/metrics/types'
import { downloadTemplate } from '@/views/data/ui/downloads'
import { computeOnboarding, type OnboardingModel } from '../engine'
import type { PlanStatus } from '../engine/plan'
import type { ReadyStatus } from '../engine/starts'

/** The view's model for the context in force (computed once per context, shared by the tabs). */
export function useOnboarding(): OnboardingModel {
  const ctx = useAnalytics()
  return useMemo(() => computeOnboarding(ctx), [ctx])
}

/** Figure definitions, each from the registry (with your wording), in order. */
export function defs(
  m: Pick<MetricsApi, 'def'>,
  ids: readonly string[],
  extra: Definition[] = [],
): Definition[] {
  return [...ids.flatMap((id) => definitionOf(m, id) ?? []), ...extra]
}

export const READY_SEVERITY: Record<ReadyStatus, Severity | null> = {
  'Not ready': 'critical',
  Behind: 'warning',
  'On track': null,
  Ready: 'good',
  'No tasks': null,
}

export const PLAN_SEVERITY: Record<PlanStatus, Severity> = {
  Behind: 'warning',
  'On plan': 'good',
  Ahead: 'info',
}

/** The bar color of a share: only a share far under its target (10 pts or more) stands out. */
export function barTone(v: number | null, target: number | null | undefined): Tone {
  if (v == null) return 'deemph'
  return target != null && v < target - 0.1 ? 'critical' : 'default'
}

/** A share against its target: under it warns, 10 pts under is critical (the glyph beside the value). */
export function shareTone(v: number | null, target: number | null | undefined): Tone {
  if (v == null) return 'deemph'
  if (target == null || v >= target) return 'default'
  return v < target - 0.1 ? 'critical' : 'warning'
}

/** "Hidden to protect anonymity (n < 5)". */
export const hiddenNote = (min: number) => `Hidden to protect anonymity (n < ${min})`

/** Footnote: "59 starts · as of 30 Sep 2026". */
export const asOfNote = (asOf: string, ...parts: (string | null | false | undefined)[]): string =>
  [...parts.filter(Boolean), `as of ${formatDate(asOf)}`].join(' · ')

/** A drill only when there are records behind the cell. */
export const drillIf = <T,>(n: number | null | undefined, src: () => T): (() => T) | null => (n ? src : null)

export const dash = (v: unknown): string => (v == null || v === '' ? DASH : String(v))

/** A missing dataset, with the template and a way to the Data room. */
export function NeedData({
  title,
  body,
  dataset,
  span = 12,
}: {
  title: string
  body: string
  dataset?: DatasetKey
  span?: Span
}) {
  return (
    <EmptyState
      span={span}
      icon={<IconDatabase />}
      title={title}
      body={body}
      action={
        <>
          {dataset && (
            <Button size="sm" icon={<IconDownload />} onClick={() => void downloadTemplate(dataset)}>
              Download the template
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => goTo('data')}>
            Open the Data room
          </Button>
        </>
      }
    />
  )
}

export const NO_TASKS = {
  title: 'Upload Onboarding tasks to see readiness',
  body: 'Readiness reads the Onboarding tasks dataset: one row per person per task, with its owner, due date and completed date. Due dates may be written as "Day -3". Until it is loaded, readiness numbers show "—", never 0%.',
}

export const NO_PLAN = {
  title: 'Upload a Hiring plan to see starts against plan',
  body: 'This tab reads the Hiring plan dataset: one row per planned role, or one row per month and department with a count. Add it in the Data room; the template shows both shapes.',
}

export const NO_STARTS = {
  title: 'No upcoming starts to show',
  body: 'Upcoming starts come from pre-hire records in Employees (a hire date after the as-of date) and from accepted offers in Candidates with a start date. Load either in the Data room.',
}
