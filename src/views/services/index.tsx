/**
 * HR ops: are employees getting fast, correct answers, and are HR transactions
 * processed on time? Every measure ties to the Hire-to-Retire Atlas process that governs it.
 * Leave & return follows people on leave through their return (Atlas LV-01 to LV-03).
 */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import type { ViewDef } from '../types'
import { computeCached, headline } from './engine'
import { servicesActions } from './engine/actions'
import { servicesSummary } from './engine/summary'
import { CasesTab } from './ui/CasesTab'
import { LeaveTab } from './ui/LeaveTab'
import { LevelsTab } from './ui/LevelsTab'
import { Overview } from './ui/Overview'
import { TransactionsTab } from './ui/TransactionsTab'

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const m = useMemo(() => computeCached(ctx), [ctx])
  switch (tab) {
    case 'cases':
      return <CasesTab m={m} ctx={ctx} />
    case 'transactions':
      return <TransactionsTab m={m} ctx={ctx} />
    case 'leave':
      return <LeaveTab m={m} ctx={ctx} />
    case 'levels':
      return <LevelsTab m={m} ctx={ctx} />
    default:
      return <Overview m={m} ctx={ctx} />
  }
}

export const view: ViewDef = {
  key: 'services',
  label: 'HR ops',
  tabs: [
    { key: 'overview', label: 'Overview' },
    { key: 'cases', label: 'Cases' },
    { key: 'transactions', label: 'HR transactions' },
    { key: 'leave', label: 'Leave & return' },
    { key: 'levels', label: 'Service levels' },
  ],
  View,
  headline,
  datasets: ['cases', 'transactions', 'employees'],
  summary: servicesSummary,
  actions: servicesActions,
}
