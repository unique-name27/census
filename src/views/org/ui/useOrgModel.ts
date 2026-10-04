/** The org model for the current analytics context, computed once per context. */
import { useMemo } from 'react'
import type { Definition } from '@/charts'
import { useAnalytics } from '@/data/context'
import { buildOrgModel, type OrgModel } from '../engine'

export function useOrgModel(): OrgModel {
  const ctx = useAnalytics()
  return useMemo(() => buildOrgModel(ctx), [ctx])
}

export const CHART_DEFINITIONS: Definition[] = [
  {
    term: 'Who is shown',
    text: 'Everyone active on the as-of date (hired on or before it, not yet left), including contractors and interns. A selected leader becomes the top of the chart; other filters dim cards instead of hiding them so reporting lines stay readable.',
  },
  {
    term: 'Direct reports',
    text: 'Active people of every worker type who report to the person on the as-of date.',
  },
  { term: 'Total org', text: 'Everyone below the person, at every level.' },
  { term: 'Wide span', text: '12 or more direct reports.' },
  { term: 'Span of 1', text: 'Exactly one direct report.' },
  {
    term: 'Single-report chain',
    text: 'Exactly one direct report, who leads 5 or more people. The extra layer sits above a whole team.',
  },
  {
    term: 'New manager, large team',
    text: 'Managing for under 12 months with 8 or more direct reports. Managing since is the move from an individual contributor level to a manager level in Job changes, otherwise the hire date.',
  },
  { term: 'New hire', text: 'Joined in the last 90 days.' },
  {
    term: 'Reporting line note',
    text: "The person's manager in the data is not active on the as-of date (shown under the next active manager up), is not in the roster, or is part of a reporting loop.",
  },
  {
    term: 'Open roles',
    text: 'Open requisitions shown as dashed cards under their hiring manager, when the Open roles switch is on.',
  },
]
