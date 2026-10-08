/**
 * The aggregate tables Ask's `view_summary` returns for Engineering by stage (`tab:
 * 'analyses:stages'`), beside its tiles and findings, so it can answer "how many verification
 * engineers per RTL designer" or "which stages are we hiring into" from the numbers the tab shows.
 * Counts, FTE, shares and ratios per stage only, never a person; shares and ratios under the
 * anonymity minimum are null already. Planned starts are left out where the mode hides them. Pure.
 */
import type { AnalysisTable } from '../../types'
import type { CapacityRow, HiringRow, RatioRow, WhereModel } from './capacity'
import { HIRING_USES, STAGES_USES, WHERE_USES } from './metrics'

export function stagesTables(x: {
  capacity: readonly CapacityRow[]
  hiring: readonly HiringRow[]
  ratios: readonly RatioRow[]
  where: WhereModel
  showPlanned: boolean
}): AnalysisTable[] {
  const topSite = new Map<string, { site: string; people: number; share: number | null }>()
  for (const c of x.where.cells) {
    if (c.dim !== 'location' || c.other || c.group === 'Not recorded') continue
    const best = topSite.get(c.stage)
    if (!best || c.people > best.people)
      topSite.set(c.stage, { site: c.group, people: c.people, share: c.share })
  }
  return [
    {
      id: 'capacity',
      title: 'Engineering capacity by chip development stage, in lifecycle order',
      columns: {
        stage: 'the chip development stage',
        employees: 'employees in the stage (headcount)',
        contractors: 'contractors in the stage (always apart from employees)',
        employeeFte: 'FTE of the employees (blank FTE counts as 1)',
        contractorFte: 'FTE of the contractors',
        share: 'employees in the stage ÷ engineering employees (a fraction)',
        contractorShare: 'contractors ÷ (employees + contractors) in the stage (a fraction)',
        change: 'employees today minus 12 months ago, each in their current job function’s stage',
        topSite: 'the site with the most of the stage’s employees',
        topSiteShare: 'that site’s share of the stage’s employees (a fraction)',
      },
      rows: x.capacity.map((r) => ({
        stage: r.stage,
        employees: r.employees,
        contractors: r.contractors,
        employeeFte: r.employeeFte,
        contractorFte: r.contractorFte,
        share: r.share,
        contractorShare: r.contractorShare,
        change: r.change,
        topSite: topSite.get(r.stage)?.site ?? null,
        topSiteShare: topSite.get(r.stage)?.share ?? null,
      })),
      uses: WHERE_USES,
    },
    {
      id: 'hiring',
      title: 'Hiring in flight by chip development stage',
      columns: {
        stage: 'the chip development stage',
        accepted: 'accepted offers and pre-hires not yet started',
        openings: 'openings of open reqs (a req takes its department’s most common job function)',
        ...(x.showPlanned ? { planned: 'hiring plan starts in the planned starts window with no req' } : {}),
        employeesToday: 'the stage’s employees today',
      },
      rows: x.hiring.map((r) => ({
        stage: r.stage,
        accepted: r.accepted,
        openings: r.open,
        ...(x.showPlanned ? { planned: r.planned } : {}),
        employeesToday: r.today,
      })),
      uses: HIRING_USES,
    },
    {
      id: 'ratios',
      title: 'Stage ratios against the references set in Metric definitions',
      columns: {
        ratio: 'what is divided by what',
        value:
          'people in the first stages for each person in the second (heads; employees only unless contractors count in ratios)',
        withContractors: 'the same ratio with contractors in both stages',
        reference: 'the reference set for it; null means none',
        status:
          'Below reference, Near reference, Above reference, No reference, or why there is no value (too few people below the line)',
        above: 'people above the line',
        below: 'people below the line',
      },
      rows: x.ratios.map((r) => ({
        ratio: r.label,
        value: r.value,
        withContractors: r.withContractors,
        reference: r.reference,
        status: r.statusLabel,
        above: r.top,
        below: r.bottom,
      })),
      uses: STAGES_USES,
    },
  ]
}
