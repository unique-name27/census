/**
 * The Level pyramid's KPI strip (docs/ANALYSES.md, 5.4): employees against a year ago, three level
 * mix shares (entry, senior individual, management and executive) in points against a year ago,
 * and the Org design manager ratio. Each tile carries its metric, its fields and its records.
 */
import type { Kpi } from '@/components/types'
import type { Level } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { ID } from '@/views/hrbp/metrics'
import { count } from '../../../engine/base'
import { employeesOnSpec, scopePart, titled } from '../../../engine/drill'
import { tagKpis } from '../../../engine/drillUses'
import { HEADCOUNT, ifPresent, PAST_HEADCOUNT } from '../../../engine/lineage'
import { computeOrg } from '../../../engine/org'
import { orgKpis } from '../../../engine/tiles'
import { levelsSpec, levelsText, pyramidExtra } from './drill'
import { MIX_TILE } from './lineage'
import { PYRAMID_METRIC } from './metrics'
import { EXECUTIVE_LEVELS, type Population, type PyramidData } from './model'

/** The tiles' level sets: entry, senior individual, management and executive. */
export const MIX_TILES: readonly {
  id: string
  label: string
  levels: readonly Level[]
  filterLabel: string
}[] = [
  { id: 'pyramid-entry', label: 'Entry levels (L1 to L2)', levels: ['L1', 'L2'], filterLabel: 'L1 and L2' },
  {
    id: 'pyramid-senior',
    label: 'Senior individual levels (L5 to L6)',
    levels: ['L5', 'L6'],
    filterLabel: 'L5 and L6',
  },
  {
    id: 'pyramid-management',
    label: 'Manager and executive levels (M1 to E3)',
    levels: ['M1', 'M2', ...EXECUTIVE_LEVELS],
    filterLabel: 'M1 to E3',
  },
]

/** The share of a population at a set of levels, today and a year ago (null under the minimum). */
export function shareAt(pop: Population, levels: readonly Level[], min: number) {
  const rows = pop.rows.filter((r) => levels.includes(r.level))
  const now = rows.reduce((a, r) => a + r.today, 0)
  const then = pop.yearAgoTotal == null ? null : rows.reduce((a, r) => a + (r.yearAgo ?? 0), 0)
  return {
    count: now,
    yearAgoCount: then,
    share: pop.total >= min ? now / pop.total : null,
    yearAgoShare:
      then != null && pop.yearAgoTotal != null && pop.yearAgoTotal >= min ? then / pop.yearAgoTotal : null,
    records: rows.flatMap((r) => r.records),
  }
}

export function pyramidKpis(d: PyramidData): Kpi[] {
  const p = d.prep
  const min = p.set.minGroup
  const { main } = d
  const headcountUses = p.uses(HEADCOUNT, ifPresent(PAST_HEADCOUNT))
  const mixUses = p.uses(MIX_TILE)
  // Headcount counts everyone People stats counts, with or without a level.
  const today = main.total + main.noLevel.length
  const yearAgo = main.yearAgoTotal == null ? null : main.yearAgoTotal + main.noLevelYearAgo.length
  const todayRecords = [...main.rows.flatMap((r) => r.records), ...main.noLevel]
  const yearAgoRecords = [...main.rows.flatMap((r) => r.yearAgoRecords), ...main.noLevelYearAgo]
  const who = p.set.countContractors ? 'Employees and contractors' : 'Employees'

  const tiles: Kpi[] = [
    {
      id: 'pyramid-employees',
      metricId: ID.headcount,
      label: p.set.countContractors ? 'In headcount' : 'Employees',
      value: today,
      format: 'int',
      delta: yearAgo == null ? null : today - yearAgo,
      deltaLabel: 'vs a year ago',
      goodDirection: null,
      note: main.noLevel.length
        ? `${count(main.noLevel.length, 'person', 'people')} with no level`
        : `As of ${formatDate(d.asOf)}`,
      definition: p.text(ID.headcount),
      drill: today
        ? () => employeesOnSpec(p, d.asOf, { rows: todayRecords, extra: pyramidExtra(d) })
        : undefined,
      deltaDrill:
        yearAgo == null || !yearAgoRecords.length
          ? undefined
          : () =>
              employeesOnSpec(p, d.yearAgoDate, {
                title: titled(`${who} on ${formatDate(d.yearAgoDate)}`, scopePart(p)),
                rows: yearAgoRecords,
                extra: pyramidExtra(d),
              }),
      noteDrill: main.noLevel.length
        ? () =>
            employeesOnSpec(p, d.asOf, {
              title: titled(`${who} with no level`, scopePart(p)),
              rows: main.noLevel,
              note: 'People with no level are counted in headcount but not in the pyramid.',
            })
        : undefined,
      uses: headcountUses,
    },
    ...MIX_TILES.map((t): Kpi => {
      const s = shareAt(main, t.levels, min)
      const delta = s.share != null && s.yearAgoShare != null ? s.share - s.yearAgoShare : null
      return {
        id: t.id,
        metricId: PYRAMID_METRIC.levelMix,
        label: t.label,
        value: s.share,
        format: 'pct',
        delta,
        deltaLabel: 'vs a year ago',
        goodDirection: null,
        suppressed: s.share == null && main.total > 0,
        note: `${count(s.count, 'person', 'people')} at ${levelsText(t.levels)}`,
        formula:
          s.share == null
            ? undefined
            : `${s.count.toLocaleString('en-US')} of ${main.total.toLocaleString('en-US')} employees with a level.`,
        definition: p.text(PYRAMID_METRIC.levelMix),
        drill:
          s.share == null || !s.records.length
            ? undefined
            : () => levelsSpec(d, t.levels, s.records, { filterLabel: t.filterLabel }),
        uses: mixUses,
      }
    }),
  ]
  // The manager ratio exactly as Org design shows it (People stats' own tile).
  const ratio = orgKpis(p, computeOrg(p)).find((k) => k.id === 'manager-ratio')
  if (ratio) tiles.push({ ...ratio, id: 'pyramid-manager-ratio' })
  return tagKpis(tiles)
}
