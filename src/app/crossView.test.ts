/**
 * Links between views (docs/ROADMAP.md Parts 1 and 3): each related view shows its one linked
 * survey number, Recruiting's "Hires vs plan" is Onboarding's plan number and opens its Hiring plan
 * tab, HR ops points new hire readiness by site to Onboarding, and the "AI agents for …" header
 * line reaches every view with an HR area, Onboarding and Compliance included.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { invalidRefs } from '@/data/quality'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type SurveyType } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { CATALOG } from '@/metrics/catalog'
import { SAMPLE_AGENTS } from '@/views/ai/catalog/sample'
import { agentLinkFor } from '@/views/ai/catalog/summary'
import { linkedHeadline, linkedSpots } from '@/views/listening/linked'
import { hiresVsPlan } from '@/views/onboarding/api'
import { PLAN_LINK } from '@/views/recruiting/plan'
import { VIEWS, viewByKey } from '@/views/registry'

const VIEWS_DIR = new URL('../views/', import.meta.url)
const uiText = (view: string, file: string): string =>
  readFileSync(new URL(`${view}/ui/${file}`, VIEWS_DIR), 'utf8')
const uiFiles = (view: string): string[] =>
  readdirSync(new URL(`${view}/ui/`, VIEWS_DIR)).filter((f) => f.endsWith('.tsx'))

/** The file that draws each tab a linked survey number sits on. */
const TAB_FILE: Record<string, string> = {
  'recruiting.sources': 'SourcesTab.tsx',
  'recruiting.requisitions': 'RequisitionsTab.tsx',
  'hrbp.attrition': 'Attrition.tsx',
  'hrbp.org': 'OrgDesign.tsx',
  'services.cases': 'CasesTab.tsx',
  'talent.retention': 'RetentionTab.tsx',
  'talent.learning': 'LearningTab.tsx',
}

/**
 * Onboarding draws its own day-30 pulse figure on First 90 days, and HR ops its own Return to work
 * figure on Leave & return; every other survey's number is `<LinkedSurvey>`.
 */
const OWN_FIGURE = new Set<SurveyType>([
  'Onboarding pulse day 30',
  'Onboarding pulse day 90',
  'Return to work',
])
const LINKED = linkedSpots().filter((s) => !OWN_FIGURE.has(s.survey))

let ctx: AnalyticsContext
beforeAll(() => {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
  ) as Record<DatasetKey, SourceMeta>
  ctx = buildContext({
    data: generateSample(),
    sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
  })
})

describe('linked survey numbers', () => {
  it('sit on the tab the roadmap names, once each, with an id of the host view', () => {
    expect(LINKED.map((s) => `${s.view}.${s.tab}`).sort()).toEqual(Object.keys(TAB_FILE).sort())
    for (const s of LINKED) {
      const file = TAB_FILE[`${s.view}.${s.tab}`]
      const tag = new RegExp(`<LinkedSurvey\\b[^>]*?survey="${s.survey}"[^>]*?id="([a-z0-9-]+)"`)
      const found = uiText(s.view, file).match(tag)
      expect(found, `${s.survey} on ${file}`).not.toBeNull()
      expect(found?.[1].startsWith(`${s.view}-`), s.survey).toBe(true)
      // Nowhere else in the view: one number, not copies.
      const elsewhere = uiFiles(s.view).filter(
        (f) => f !== file && uiText(s.view, f).includes(`survey="${s.survey}"`),
      )
      expect(elsewhere, s.survey).toEqual([])
      expect(
        viewByKey.get(s.view)?.tabs.some((t) => t.key === s.tab),
        `${s.view}.${s.tab}`,
      ).toBe(true)
    }
  })

  it('each has a number on the sample, a registered metric, valid lineage and grouped drills', () => {
    for (const s of LINKED) {
      const h = linkedHeadline(ctx, s.survey)
      expect(h, s.survey).not.toBeNull()
      expect(h?.value == null || Number.isFinite(h.value), s.survey).toBe(true)
      expect(CATALOG.byId.has(h?.metricId ?? ''), s.survey).toBe(true)
      expect(h?.uses.length, s.survey).toBeGreaterThan(0)
      expect(invalidRefs(h?.uses ?? []), s.survey).toEqual([])
      const spec = resolveDrill(h?.drill)
      // Survey answers never drill to a person: grouped counts and scores only.
      expect(spec?.kind, s.survey).toBe('surveyGroups')
      for (const row of spec?.rows ?? []) expect(row, s.survey).not.toHaveProperty('respondentKey')
    }
  })

  it('manager feedback across all managers: one company number, manager cuts stay in Listening', () => {
    const h = linkedHeadline(ctx, 'Manager feedback')!
    expect(h.respondents).toBeGreaterThanOrEqual(10)
    expect(h.tab).toBe('managers')
  })
})

describe('hires vs plan on Recruiting', () => {
  it("is Onboarding's plan number, in the Scorecard summary too, and opens Onboarding, Hiring plan", () => {
    const tile = viewByKey
      .get('recruiting')
      ?.summary?.(ctx)
      .kpis.find((k) => k.id === 'hires-vs-plan')
    expect(tile?.value).toBe(hiresVsPlan(ctx)?.value)
    expect(tile?.metricId).toBe(hiresVsPlan(ctx)?.metricId)
    expect(tile?.link).toEqual(PLAN_LINK)
    expect(PLAN_LINK).toEqual({ view: 'onboarding', tab: 'plan', label: 'Onboarding, Hiring plan' })
    expect(viewByKey.get('onboarding')?.tabs.find((t) => t.key === 'plan')?.label).toBe('Hiring plan')
    expect(uiText('recruiting', 'OverviewTab.tsx')).toContain('overviewKpis(ctx)')
  })
})

describe('new hire readiness by site', () => {
  it('lives in Onboarding; HR transactions links there and keeps no copy', () => {
    const tx = uiText('services', 'TransactionsTab.tsx')
    expect(tx).not.toContain('services-new-hire-readiness')
    expect(tx).toContain("goTo('onboarding', 'first90')")
    expect(uiText('onboarding', 'First90Tab.tsx')).toContain('id="onboarding-new-hire-entered"')
    // HR ops keeps the ON-03 row in its Service levels scorecard.
    expect(CATALOG.byId.has('services.levels.on03-hire-day-minus-3')).toBe(true)
    expect(CATALOG.byId.has('services.tx.newHireReady')).toBe(false)
  })
})

describe('AI in HR header links', () => {
  it('reach every view with an HR area, Onboarding and Compliance included', () => {
    const none = new Set(['scorecard', 'listening', 'ai'])
    for (const v of VIEWS) {
      const link = agentLinkFor(v.key, SAMPLE_AGENTS)
      if (none.has(v.key)) expect(link, v.key).toBeNull()
      else expect(link?.count, v.key).toBeGreaterThan(0)
    }
    expect(agentLinkFor('onboarding', SAMPLE_AGENTS)?.text).toBe('AI agents for Onboarding (2)')
    expect(agentLinkFor('compliance', SAMPLE_AGENTS)?.text).toBe('AI agents for Compliance (1)')
  })
})
