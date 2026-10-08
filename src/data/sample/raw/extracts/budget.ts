/**
 * The budget as the planning tool exports it: a scenario column, fiscal periods written as months
 * ("Apr 2026"), the cost as "Personnel cost" and headcount as "Budget HC". The Q1 2027 lines come
 * from the tool's newer template, which writes the currency as "US$". Finance confirmed the
 * mapping. Every value reads back exactly, so the rows the import yields are the clean ones.
 */
import type { BudgetLine, Datasets } from '../../../schema'
import type { RawExtract } from '../extract'
import { type Column, toAoa } from '../format'
import { FILES } from '../plan'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Apr 2026" for 2026-04-01. */
const monthText = (iso: string) => `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`

/** The rows the import yields: the clean budget. */
export const budgetPlanted = (base: Datasets): BudgetLine[] => base.budget

export function budgetExtract(base: Datasets): RawExtract<'budget'> {
  const columns: Column<BudgetLine>[] = [
    { header: 'Scenario', cell: (r) => r.planVersion ?? null },
    { header: 'Fiscal Period', cell: (r) => monthText(r.period) },
    { header: 'Business Unit', cell: (r) => r.businessUnit },
    { header: 'Department', cell: (r) => r.department ?? null },
    { header: 'Cost Center', cell: (r) => r.costCenter ?? null },
    { header: 'Budget HC', cell: (r) => r.budgetHeadcount },
    { header: 'Personnel Cost', cell: (r) => r.budgetCost ?? null },
    {
      header: 'Currency',
      cell: (r) => (r.currency === 'USD' && r.period >= '2027-01-01' ? 'US$' : (r.currency ?? null)),
    },
  ]
  return { dataset: 'budget', ...FILES.budget, aoa: toAoa(base.budget, columns) }
}
