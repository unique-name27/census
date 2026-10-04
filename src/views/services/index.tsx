/**
 * HR ops: are employees getting fast, correct answers, and are HR transactions
 * processed on time? Every measure ties to the Hire-to-Retire Atlas process that governs it.
 */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import type { ViewDef } from '../types'
import { compute, headline } from './engine'
import { CasesTab } from './ui/CasesTab'
import { LevelsTab } from './ui/LevelsTab'
import { Overview } from './ui/Overview'
import { TransactionsTab } from './ui/TransactionsTab'

function View({ tab }: { tab: string }) {
  const ctx = useAnalytics()
  const m = useMemo(() => compute(ctx), [ctx])
  switch (tab) {
    case 'cases':
      return <CasesTab m={m} ctx={ctx} />
    case 'transactions':
      return <TransactionsTab m={m} ctx={ctx} />
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
    { key: 'levels', label: 'Service levels' },
  ],
  View,
  headline,
  datasets: ['cases', 'transactions', 'employees'],
}
