/**
 * My team's tiles and readout on hand-built inputs: a tile keeps its numbers and opens its own
 * view's tab, and the readout ranks findings like the Scorecard after Manager mode's hide lists.
 */
import { describe, expect, it } from 'vitest'
import type { Finding, Kpi } from '@/components/types'
import { finding, fixtureContext, practice } from '@/views/scorecard/engine/testkit'
import { relink, teamFindings } from './numbers'

const labelOf = (view: string, tab: string) => `${view}, ${tab}`

describe('relink', () => {
  it("opens the producing view's tab from My team, keeping every number and drill", () => {
    const drill = () => null
    const k: Kpi = {
      id: 'voluntary',
      label: 'Voluntary attrition',
      value: 0.1,
      format: 'pct',
      tab: 'attrition',
      drill,
    }
    const [out] = relink(k, 'hrbp', labelOf)
    expect(out).toMatchObject({
      id: 'voluntary',
      value: 0.1,
      drill,
      link: { view: 'hrbp', tab: 'attrition', label: 'hrbp, attrition' },
    })
    expect(out.tab).toBeUndefined()
    // A tile that already links elsewhere keeps its link; a missing tile is left out.
    const linked: Kpi = { ...k, link: { view: 'onboarding', tab: 'plan', label: 'Onboarding, Hiring plan' } }
    expect(relink(linked, 'hrbp', labelOf)).toEqual([linked])
    expect(relink(undefined, 'hrbp', labelOf)).toEqual([])
  })
})

describe('teamFindings', () => {
  const view = (key: 'recruiting' | 'onboarding' | 'hrbp' | 'talent') =>
    practice(key, { kpis: [], findings: [] })
  const f = (id: string, severity: Finding['severity'], metricId?: string) =>
    finding({ id, severity, metricId })

  it("puts critical first and each practice's most serious before any second, at most six", () => {
    const ctx = fixtureContext()
    const out = teamFindings(ctx, [
      { view: view('recruiting'), findings: [f('r1', 'warning'), f('r2', 'warning'), f('r3', 'critical')] },
      { view: view('onboarding'), findings: [f('o1', 'warning')] },
      { view: view('hrbp'), findings: [f('h1', 'critical'), f('h2', 'info'), f('h3', 'good')] },
      { view: view('talent'), findings: [f('t1', 'warning'), f('t2', 'warning')] },
    ])
    expect(out.map((s) => s.finding.id)).toEqual([
      'recruiting:r3',
      'hrbp:h1',
      'recruiting:r1',
      'onboarding:o1',
      'talent:t1',
      'recruiting:r2',
    ])
    expect(out.every((s) => s.finding.severity !== 'good')).toBe(true)
  })

  it('leaves out findings whose metric Manager mode hides, in every mode', () => {
    const ctx = fixtureContext()
    expect(ctx.access.mode).toBe('hr')
    const out = teamFindings(ctx, [
      {
        view: view('talent'),
        findings: [
          f('risk', 'critical', 'talent.retention.flightRisk'),
          f('key', 'critical', 'talent.finding.keyTalent'),
          f('training', 'warning', 'talent.learning.requiredOnTime'),
        ],
      },
      { view: view('onboarding'), findings: [f('i9', 'critical', 'onboarding.first90.i9Section2')] },
    ])
    expect(out.map((s) => s.finding.id)).toEqual(['talent:training'])
  })
})
