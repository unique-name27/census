/**
 * My team (docs/ROLES.md 2.2, docs/DESIGN-REFRESH.md 4.2): Manager mode's home, one manager's org
 * on one page: key figures, what needs attention beside headcount over time, then People, Hiring,
 * Talent and the open items the org owns (`ui/TeamPage.tsx`, engine in `engine/`). It has no
 * `summary` (it composes other views' numbers, so the Scorecard and Ask must not count them twice)
 * and no `actions`. In Developer mode it opens by address with the scope on screen; without a
 * leader it asks for one. HR mode does not show it.
 */
import { useMemo } from 'react'
import { PICKER_TITLE } from '@/access/copy'
import { openManagerPicker, useMode } from '@/access/store'
import { leaderOptions } from '@/app/filterOptions'
import { LeaderPicker } from '@/app/LeaderPicker'
import { Button, EmptyState, Grid, Pending } from '@/components'
import { useAnalytics, useAnalyticsPending } from '@/data/context'
import { focusLeader, withMode } from '@/data/scope'
import { useCensus } from '@/data/store'
import { fmt } from '@/lib/format'
import { hrbpHeadline } from '../hrbp/engine'
import type { ViewDef } from '../types'
import { TeamPage } from './ui/TeamPage'

/** The datasets My team reads (the eight Manager mode reads). */
export const TEAM_DATASETS = [
  'employees',
  'jobChanges',
  'reviews',
  'succession',
  'learning',
  'requisitions',
  'candidates',
  'onboardingTasks',
] as const

/** Developer mode without a leader: the leader filter's own list, to preview a manager's page. */
function PreviewPicker() {
  const ctx = useAnalytics()
  const modes = useCensus((s) => s.filters.modes)
  const setFilters = useCensus((s) => s.setFilters)
  const options = useMemo(() => leaderOptions(ctx.org, ctx.asOf, 3), [ctx.org, ctx.asOf])
  return (
    <LeaderPicker
      options={options}
      value={null}
      onChange={(id) => setFilters({ leaderId: id, modes: withMode(modes, 'leaderId', 'include') })}
    />
  )
}

function View() {
  const ctx = useAnalytics()
  const { access } = ctx
  // The context follows a mode change a moment later (it is computed in the background): until it
  // catches up, hold the frame rather than flash the other mode's page (the Developer preview's
  // "Pick a leader" while switching to Manager mode). An off-screen tree laid out in a mode of its
  // own (the figure scan, a whole-view export) is never behind, so it never holds.
  const liveMode = useMode((s) => s.mode)
  const catchingUp = useAnalyticsPending()
  if (catchingUp && liveMode !== access.mode)
    return (
      <Grid>
        <Pending title="My team key figures" height={160} message="Switching mode." />
      </Grid>
    )
  if (access.mode === 'manager' && access.unset)
    return (
      <EmptyState
        title="Choose a manager to see their org"
        body="Manager mode shows Census for one manager's org. Pick the manager from the list of people who lead 3 or more employees."
        action={
          <Button variant="primary" size="sm" onClick={() => openManagerPicker()}>
            {PICKER_TITLE}
          </Button>
        }
      />
    )
  if (access.mode !== 'manager' && !focusLeader(ctx.filters))
    return (
      <EmptyState
        title="Pick a leader to preview My team"
        body="My team shows one manager's org. Pick a leader to see the page as that manager would."
        action={<PreviewPicker />}
      />
    )
  return <TeamPage />
}

export const view: ViewDef = {
  key: 'team',
  label: 'My team',
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  // People stats' headline on the same context: active employees in the scope, with its spark.
  headline: (ctx) => {
    const h = hrbpHeadline(ctx)
    return {
      value: fmt(h.value, 'int'),
      label: 'employees',
      metricId: h.metricId,
      spark: h.spark,
      uses: h.uses,
    }
  },
  datasets: [...TEAM_DATASETS],
}
