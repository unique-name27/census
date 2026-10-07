/**
 * The AI in HR view's metric dictionary entries (docs/METRICS.md), registered with
 * `defineMetrics('ai', [...])`: the counts its figures show about the agent catalog. They read no
 * people data (the catalog is kept in this browser), so they name no fields, are never judged
 * against the data standard and carry no tier.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'.
 */
import { defineMetrics } from '@/metrics/define'
import type { MetricDef } from '@/metrics/types'

/** Metric ids, by what the view calls them. */
export const M = {
  byArea: 'ai.catalog.byArea',
  coverage: 'ai.catalog.coverage',
  sources: 'ai.catalog.sources',
} as const

const OWNER = 'HR technology'
const CATALOG =
  'Every agent in the catalog kept in this browser, whatever its status: sample, pilot or live. The list filters do not change it.'
const NOW = 'The catalog as it stands now; no period applies.'

export const metrics: MetricDef[] = defineMetrics('ai', [
  {
    id: M.byArea,
    name: 'Agents by HR area',
    definition: 'How many agents the catalog lists for each HR area.',
    formula: 'count of agents per HR area',
    population: `${CATALOG} The counts on screen follow the audience, status and search filters.`,
    window: NOW,
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER,
  },
  {
    id: M.coverage,
    name: 'Agents by HR area and audience',
    definition:
      'How many agents serve each audience (the HR team, managers or employees) in each HR area. An empty cell is an area where that audience has no agent yet.',
    formula: 'count of agents per HR area whose audience includes the column',
    population: `${CATALOG} An agent for several audiences counts once in each.`,
    window: NOW,
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER,
  },
  {
    id: M.sources,
    name: 'Data sources agents draw on',
    definition:
      'How many agents draw on each system or document, so access approvals and content owners can be reviewed with the busiest sources first. Sources are matched regardless of capitals and spacing.',
    formula: 'count of agents listing the source',
    population: `${CATALOG} An agent counts once per source, and once in Other however many folded sources it lists.`,
    window: NOW,
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER,
  },
])
