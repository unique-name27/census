/**
 * Home (docs/ROLES-V2.md part 5): the first page of the CHRO and of the seven practice and partner
 * modes. Its body is the home of the mode on screen (`ui/HomePage.tsx`): a chart-led top band,
 * Needs attention (the mode's own open items, from the Action center's split) and My list (one
 * table of the records the role works on), then a few figures of its own. Every number is its
 * producing view's number for the context on screen, read from that view's model.
 *
 * It has no `summary` and no `actions` (it composes other views' numbers, so the Scorecard and the
 * Action center must not count them twice). Its folder-tab headline is the producing view's own:
 * targets met (CHRO), employees (HRBP, Finance), median compa-ratio, critical roles covered, open
 * cases, open reqs.
 */
import { DATASET_KEYS } from '@/data/schema'
import { view as comp } from '../comp'
import { hrbpHeadline } from '../hrbp/engine'
import { view as recruiting } from '../recruiting'
import { M as SCORECARD } from '../scorecard/metrics'
import { scorecardIfReady } from '../scorecard/ui/useScorecard'
import { view as services } from '../services'
import { view as talent } from '../talent'
import type { Headline, ViewDef } from '../types'
import { homeTitle } from './engine/title'
import { HomeActions } from './ui/HomeActions'
import { HomePage } from './ui/HomePage'

function View(_: { tab: string }) {
  return <HomePage />
}

const employees: ViewDef['headline'] = (ctx) => {
  const h = hrbpHeadline(ctx)
  return {
    value: h.value.toLocaleString('en-US'),
    label: 'employees',
    metricId: h.metricId,
    spark: h.spark,
    uses: h.uses,
  }
}

const headline: ViewDef['headline'] = (ctx): Headline => {
  switch (ctx.access.mode) {
    case 'chro': {
      const model = scorecardIfReady(ctx)
      return model
        ? {
            value: model.headline.value,
            label: 'targets met',
            metricId: SCORECARD.targetsMet,
            uses: model.headline.uses,
          }
        : { value: '', label: 'targets met', metricId: SCORECARD.targetsMet }
    }
    case 'compensation':
      return comp.headline(ctx)
    case 'talent-management':
      return talent.headline(ctx)
    case 'hr-ops':
      return services.headline(ctx)
    case 'recruiter':
      return recruiting.headline(ctx)
    default:
      // HRBP for a business unit or a region, Finance, and the Developer preview: employees in scope.
      return employees(ctx)
  }
}

export const view: ViewDef = {
  key: 'home',
  label: 'Home',
  title: homeTitle,
  tabs: [{ key: 'overview', label: 'Overview' }],
  View,
  headline,
  datasets: [...DATASET_KEYS],
  HeaderActions: HomeActions,
}
