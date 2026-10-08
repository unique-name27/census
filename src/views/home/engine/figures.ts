/**
 * Every figure, key figures strip and readout on each role home, in page order (docs/ROLES-V2.md
 * part 5). Ids are `home-<slug>-<thing>` for a role's own figures (both HRBP modes share `hrbp`)
 * and the three every home draws: `home-attention-wait`, `home-attention` and `home-list`. The
 * access matrix places them on the Home view, and a test keeps this list equal to the ids in `ui/`.
 */
import type { Mode } from '@/access/modes'

export type HomeSlug = 'chro' | 'hrbp' | 'comp' | 'talent' | 'ops' | 'rec' | 'fin'

/** The figures every role home draws: Needs attention (its chart and its list) and My list. */
export const SHARED: readonly string[] = ['home-attention-wait', 'home-attention', 'home-list']

export const HOME_FIGURES: Readonly<Record<HomeSlug, readonly string[]>> = {
  chro: [
    'home-chro-standing',
    'home-chro-kpis',
    'home-chro-measures',
    'home-chro-practices',
    ...SHARED.slice(0, 2),
    'home-chro-risks',
    'home-list',
    'home-chro-hc-trend',
    'home-chro-attrition-bu',
  ],
  hrbp: [
    'home-hrbp-standing',
    'home-hrbp-kpis',
    'home-hrbp-measures',
    'home-hrbp-findings',
    ...SHARED,
    'home-hrbp-attrition-by-group',
    'home-hrbp-attrition-trend',
    'home-hrbp-req-risk',
    'home-hrbp-pipeline',
  ],
  comp: [
    'home-comp-in-band',
    'home-comp-kpis',
    'home-comp-distribution',
    'home-comp-cycle',
    ...SHARED,
    'home-comp-outliers',
    'home-comp-below-cause',
  ],
  talent: [
    'home-talent-coverage',
    'home-talent-kpis',
    'home-talent-exposure',
    'home-talent-overdue-trend',
    ...SHARED,
    'home-talent-review-coverage',
    'home-talent-rating-mix',
  ],
  ops: [
    'home-ops-sla',
    'home-ops-kpis',
    'home-ops-backlog',
    'home-ops-sla-trend',
    ...SHARED,
    'home-ops-tx',
    'home-ops-day-one',
  ],
  rec: [
    'home-rec-next-step',
    'home-rec-kpis',
    'home-rec-pipeline',
    'home-rec-waiting',
    ...SHARED,
    'home-rec-req-age',
    'home-rec-starts',
  ],
  fin: [
    'home-fin-vs-plan',
    'home-fin-kpis',
    'home-fin-plan',
    'home-fin-cost-unit',
    ...SHARED,
    'home-fin-reqs-plan',
    'home-fin-worker-mix',
    'home-fin-cost-center',
  ],
}

/** The home each mode opens on the Home view, or null (HR, Manager and Developer have their own). */
export const SLUG_OF: Readonly<Record<Mode, HomeSlug | null>> = {
  hr: null,
  chro: 'chro',
  'hrbp-unit': 'hrbp',
  'hrbp-region': 'hrbp',
  compensation: 'comp',
  'talent-management': 'talent',
  recruiter: 'rec',
  'hr-ops': 'ops',
  finance: 'fin',
  manager: null,
  developer: null,
}

/** Every id in the list, once. */
export const ALL_HOME_FIGURES: readonly string[] = [...new Set(Object.values(HOME_FIGURES).flat())]
