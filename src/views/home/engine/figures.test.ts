/**
 * The role homes' figures (docs/ROLES-V2.md 5.1 and 8.8, test 4's last two lines): `HOME_FIGURES`
 * lists exactly the ids the homes draw; each home's figures show in its own mode and in no other
 * role's; every figure's metric shows in that mode (a hidden metric would leave a hole in the page);
 * and the source keeps the house rules (metric and fields on every Figure, no em dash in a sentence).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MODES, type Mode } from '@/access/modes'
import { decide } from '@/access/policy'
import { modeCtx } from '@/views/actions/engine/roleKit'
import { M as ACTIONS } from '@/views/actions/metrics'
import { FIGURE_METRIC as COMP_FIGURE } from '@/views/comp/engine/definitions'
import { M as COMP } from '@/views/comp/metrics'
import { ID as HRBP } from '@/views/hrbp/metrics'
import { M as ONBOARDING } from '@/views/onboarding/metrics'
import { FIGURE_METRICS as RECRUITING_FIGURE } from '@/views/recruiting/engine/metricLinks'
import { RM } from '@/views/recruiting/metrics'
import { M as SCORECARD } from '@/views/scorecard/metrics'
import { M as SERVICES, FIGURE_METRIC as SERVICES_FIGURE } from '@/views/services/metrics'
import { TALENT_METRIC as TALENT, FIGURE_METRIC as TALENT_FIGURE } from '@/views/talent/engine/settings'
import { ALL_HOME_FIGURES, HOME_FIGURES, type HomeSlug, SHARED, SLUG_OF } from './figures'

const dir = new URL('../ui/', import.meta.url)
const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
const text = (f: string) => readFileSync(new URL(f, dir), 'utf8')

/** The metrics each home figure (and key figures strip) shows, as its `metric` or its tiles'. */
const METRICS: Readonly<Record<HomeSlug, Readonly<Record<string, readonly string[]>>>> = {
  chro: {
    'home-chro-standing': [SCORECARD.targetsMet],
    'home-chro-kpis': [HRBP.headcount, HRBP.voluntary, HRBP.regretted, RM.openReqs, ACTIONS.critical],
    'home-chro-measures': [SCORECARD.status],
    'home-chro-practices': [SCORECARD.status],
    'home-attention-wait': [ACTIONS.critical],
    'home-attention': [ACTIONS.critical],
    'home-list': [HRBP.scorecard],
    'home-chro-hc-trend': [HRBP.headcount],
    'home-chro-attrition-bu': [HRBP.voluntary],
  },
  hrbp: {
    'home-hrbp-standing': [SCORECARD.targetsMet],
    'home-hrbp-kpis': [
      HRBP.headcount,
      HRBP.voluntary,
      HRBP.regretted,
      HRBP.firstYear,
      RM.openReqs,
      ONBOARDING.starts,
    ],
    'home-hrbp-measures': [SCORECARD.status],
    'home-attention-wait': [ACTIONS.open],
    'home-attention': [ACTIONS.open],
    'home-list': [HRBP.scorecard, HRBP.voluntary, TALENT_FIGURE['talent-key-talent-top']],
    'home-hrbp-attrition-by-group': [HRBP.voluntary],
    'home-hrbp-attrition-trend': [HRBP.trailing12],
    'home-hrbp-req-risk': [RECRUITING_FIGURE['recruiting-req-age-vs-pipeline']],
    'home-hrbp-pipeline': [RECRUITING_FIGURE['recruiting-pipeline-today']],
  },
  comp: {
    'home-comp-in-band': [COMP.inBand],
    'home-comp-kpis': [
      COMP.compaMedian,
      COMP.belowMin,
      COMP.aboveMax,
      COMP.spend,
      COMP.proposals,
      COMP.differentiation,
    ],
    'home-comp-distribution': [COMP_FIGURE['comp-compa-distribution']],
    'home-comp-cycle': [COMP_FIGURE['comp-cycle-progress']],
    'home-attention-wait': [ACTIONS.open],
    'home-attention': [ACTIONS.open],
    'home-list': [COMP.belowMin, COMP.aboveMax],
    'home-comp-outliers': [COMP_FIGURE['comp-compa-location-level']],
    'home-comp-below-cause': [COMP_FIGURE['comp-below-min-cause']],
  },
  talent: {
    'home-talent-coverage': [TALENT.criticalCoverage],
    'home-talent-kpis': [
      TALENT.ratedCoverage,
      TALENT.highPerformers,
      TALENT.highPotentials,
      TALENT.keyTalent,
      TALENT.requiredOnTime,
      TALENT.regrettedHigh,
    ],
    'home-talent-exposure': [TALENT_FIGURE['talent-succession-exposure']],
    'home-talent-overdue-trend': [TALENT_FIGURE['talent-overdue-trend']],
    'home-attention-wait': [ACTIONS.open],
    'home-attention': [ACTIONS.open],
    'home-list': [TALENT.roleStatus, TALENT.nineBox],
    'home-talent-review-coverage': [TALENT.ratedCoverage],
    'home-talent-rating-mix': [TALENT_FIGURE['talent-rating-distribution']],
  },
  ops: {
    'home-ops-sla': [SERVICES.resolutionSla],
    'home-ops-kpis': [SERVICES.backlog, SERVICES.onTime, SERVICES.returnsSoon, ONBOARDING.dayMinus3],
    'home-ops-backlog': [SERVICES_FIGURE['services-backlog-by-age']],
    'home-ops-sla-trend': [SERVICES_FIGURE['services-sla-by-month']],
    'home-attention-wait': [ACTIONS.open],
    'home-attention': [ACTIONS.open],
    'home-list': [SERVICES.backlog, SERVICES.onTime, SERVICES.returnsSoon],
    'home-ops-tx': [SERVICES_FIGURE['services-tx-on-time-by-type']],
    'home-ops-day-one': [ONBOARDING.readinessByOwner],
  },
  rec: {
    'home-rec-next-step': [RM.lackingNextStep],
    'home-rec-kpis': [RM.openReqs, RM.activeCandidates, RM.offersWaiting],
    'home-rec-pipeline': [RECRUITING_FIGURE['recruiting-pipeline-today']],
    'home-rec-waiting': [RECRUITING_FIGURE['recruiting-waiting-time']],
    'home-attention-wait': [ACTIONS.open],
    'home-attention': [ACTIONS.open],
    'home-list': [RM.openReqs, RM.lackingNextStep],
    'home-rec-req-age': [RECRUITING_FIGURE['recruiting-req-age-vs-pipeline']],
    'home-rec-starts': [ONBOARDING.readiness],
  },
  fin: {
    'home-fin-vs-plan': [COMP.headcountVsBudget, ONBOARDING.vsPlan],
    'home-fin-kpis': [
      HRBP.headcount,
      HRBP.hires,
      RM.openReqs,
      ONBOARDING.notInPlan,
      HRBP.contingent,
      // Monthly cost against budget with a budget loaded; a year's target cash without one.
      COMP.costVsBudget,
      COMP.costTargetCash,
    ],
    'home-fin-plan': [COMP_FIGURE['comp-cost-budget-trend'], ONBOARDING.vsPlanByMonth],
    'home-fin-cost-unit': [COMP.costVsBudget, COMP_FIGURE['comp-cost-by-unit']],
    'home-attention-wait': [ACTIONS.open],
    'home-attention': [ACTIONS.open],
    'home-list': [ONBOARDING.gap, COMP_FIGURE['comp-cost-by-cost-center']],
    'home-fin-reqs-plan': [ONBOARDING.notInPlan],
    'home-fin-worker-mix': [HRBP.contingent],
    'home-fin-cost-center': [COMP_FIGURE['comp-cost-by-cost-center']],
  },
}

const HOME_MODES = MODES.filter((m) => SLUG_OF[m] != null) as Mode[]

describe('the role homes’ figures', () => {
  it('lists exactly the ids the homes draw, each a home id', () => {
    const drawn = new Set(
      files.flatMap((f) => [...text(f).matchAll(/id="(home-[a-z0-9-]+)"/g)].map((m) => m[1])),
    )
    expect([...drawn].sort()).toEqual([...ALL_HOME_FIGURES].sort())
    for (const [slug, ids] of Object.entries(HOME_FIGURES))
      for (const id of ids) expect(SHARED.includes(id) || id.startsWith(`home-${slug}-`), id).toBe(true)
  })

  it("shows each home's figures in its own mode and in no other role mode", () => {
    for (const mode of HOME_MODES) {
      const slug = SLUG_OF[mode] as HomeSlug
      const own = new Set(HOME_FIGURES[slug])
      for (const id of ALL_HOME_FIGURES) {
        const shown = decide(mode, `figure:${id}`, { view: 'home', tab: 'overview' }).access !== 'hidden'
        expect(shown, `${mode} ${id}`).toBe(own.has(id))
      }
    }
    for (const mode of ['hr', 'manager'] as const)
      for (const id of ALL_HOME_FIGURES)
        expect(decide(mode, `figure:${id}`, { view: 'home', tab: 'overview' }).access, `${mode} ${id}`).toBe(
          'hidden',
        )
  })

  it('gives every home figure a metric its mode shows', () => {
    for (const mode of HOME_MODES) {
      const slug = SLUG_OF[mode] as HomeSlug
      const ctx = modeCtx(mode)
      expect(Object.keys(METRICS[slug]).sort(), slug).toEqual(
        HOME_FIGURES[slug].filter((id) => !id.endsWith('-risks') && !id.endsWith('-findings')).sort(),
      )
      for (const [id, metrics] of Object.entries(METRICS[slug]))
        for (const metric of metrics) {
          expect(ctx.metrics.def(metric), `${id}: ${metric} is in the catalog`).toBeTruthy()
          expect(ctx.access.can(`metric:${metric}`), `${mode} ${id}: ${metric}`).toBe(true)
        }
    }
  }, 120_000)
})

describe('the home source', () => {
  it('declares a metric on every Figure, Hero and list it draws', () => {
    let n = 0
    for (const f of files.filter((x) => x.endsWith('.tsx')))
      for (const tag of ['<Figure', '<Hero', '<ListFigure'])
        for (const chunk of text(f).split(tag).slice(1)) {
          // A JSX element (props on the next line, or a type argument first), not another name.
          if (!/^(\s|<[A-Za-z]+>\s)/.test(chunk)) continue
          n++
          expect(chunk.slice(0, 600), `${f} ${tag}`).toMatch(/\bmetric=\{/)
        }
    expect(n).toBeGreaterThanOrEqual(40)
  })

  it('writes no em dash into a sentence and no exclamation mark', () => {
    for (const f of files) {
      expect(text(f), f).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      expect(text(f), f).not.toMatch(/'[^'\n]*!'/)
    }
  })
})
