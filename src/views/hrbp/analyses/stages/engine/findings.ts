/**
 * The Engineering by stage readout (docs/ANALYSES.md, 4.7), ranked by severity then by how many
 * people each finding covers; the readout shows 4 (2 on phones), Ask and exports read all.
 *
 *  1. Below reference: a ratio below its reference by "below by" or more. Warning.
 *  2. Concentrated where attrition is high: a stage with at least "concentrated at one site" of
 *     its people at one site whose voluntary attrition (People stats, last 12 months) is at least
 *     the attrition gap above the company's. Warning, with Focus on the site.
 *  3. Planned roles with no req: the two stages with the most (left out where planned starts are
 *     hidden). Info.
 *  4. Contractor-heavy stage: contractors at least "contractor-heavy stage" of a stage. Info.
 *  5. Not mapped or only proposed: engineering employees in job functions with no stage above
 *     the not-mapped share, or any function whose stage is only proposed. Info.
 *
 * Every finding cites `hrbp.stages.findings` and its numbers' fields. Pure.
 */
import type { ChartNote } from '@/charts/core/notes'
import type { Finding, Severity } from '@/components/types'
import { periodWindows } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import { formatMonth } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { hasExitData, type RateResult } from '@/lib/people'
import { comingQuarter } from '@/views/onboarding/engine/plan'
import { peopleStatsAttrition } from '../../../engine/settings'
import { type EngPerson, NOT_MAPPED, STAGE_ROWS, type StageKey, type StagesBase, stageLabel } from './base'
import type { CapacityRow, HiringRow, RatioRow } from './capacity'
import { linesSpec, peopleSpec, titled } from './drills'
import type { InFlight } from './hiring'
import { CONCENTRATION_USES, PLANNED_USES, SID, STAGES_USES, WHERE_USES } from './metrics'
import { andList, count, inSentence } from './wording'

/** A number with as few decimals as it needs, up to two: "1.5", "1.33". */
export const plain = (v: number): string => (+v.toFixed(2)).toLocaleString('en-US')

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** A finding with the people it covers, for ranking. */
interface Ranked {
  finding: Finding
  weight: number
}

export interface Concentration {
  site: string
  stages: { key: StageKey; label: string; share: number; atSite: number; total: number }[]
  rate: number
  company: number
  people: EngPerson[]
}

/** Voluntary attrition of a site and of the company, as People stats measures it, last 12 months. */
function siteAttrition(b: StagesBase): (site: string) => RateResult & { company: RateResult } {
  const ctx = b.ctx
  const w = periodWindows('t12m', ctx.asOf).current
  const opts = { exitDataPresent: hasExitData(ctx.all.employees) }
  let company: RateResult | null = null
  const memo = new Map<string, RateResult & { company: RateResult }>()
  return (site) => {
    const hit = memo.get(site)
    if (hit) return hit
    company ??= peopleStatsAttrition(ctx.metrics, ctx.all.employees, w, 'voluntary', opts)
    const own = peopleStatsAttrition(
      ctx.metrics,
      ctx.all.employees.filter((e) => e.location === site),
      w,
      'voluntary',
      opts,
    )
    const out = { ...own, company }
    memo.set(site, out)
    return out
  }
}

/** Stages concentrated at a site whose voluntary attrition is above the company's (rule 2). */
export function concentrations(b: StagesBase, capacity: readonly CapacityRow[]): Concentration[] {
  const { concentration, attritionGap } = b.set.findings
  const min = b.set.minGroup
  // A scope of one site (Filter to Bengaluru) puts every stage there: nothing to compare.
  const allSites = new Set<string>()
  for (const r of capacity)
    for (const p of r.people.employees) {
      const site = p.e.location?.trim()
      if (site) allSites.add(site)
    }
  if (allSites.size < 2) return []
  const rateOf = siteAttrition(b)
  const bySite = new Map<string, Concentration>()
  for (const row of capacity) {
    if (row.key === NOT_MAPPED) continue
    const people = row.people.employees
    if (people.length < min) continue
    const sites = new Map<string, EngPerson[]>()
    for (const p of people) {
      const site = p.e.location?.trim()
      if (!site) continue
      const arr = sites.get(site)
      if (arr) arr.push(p)
      else sites.set(site, [p])
    }
    let top: [string, EngPerson[]] | null = null
    for (const entry of sites)
      if (!top || entry[1].length > top[1].length || (entry[1].length === top[1].length && entry[0] < top[0]))
        top = entry
    if (!top) continue
    // A group under the anonymity minimum is never flagged (it would point at a few people).
    if (top[1].length < min) continue
    const share = top[1].length / people.length
    if (share < concentration - 1e-12) continue
    const r = rateOf(top[0])
    if (r.rate == null || r.company.rate == null) continue
    if (r.avgHeadcount < min) continue
    if (r.rate - r.company.rate < attritionGap - 1e-12) continue
    const c = bySite.get(top[0]) ?? {
      site: top[0],
      stages: [],
      rate: r.rate,
      company: r.company.rate,
      people: [],
    }
    c.stages.push({ key: row.key, label: row.stage, share, atSite: top[1].length, total: people.length })
    c.people.push(...top[1])
    bySite.set(top[0], c)
  }
  return [...bySite.values()].sort(
    (x, y) => y.people.length - x.people.length || x.site.localeCompare(y.site),
  )
}

export interface FindingInputs {
  family: string | null
  capacity: readonly CapacityRow[]
  hiring: readonly HiringRow[]
  ratios: readonly RatioRow[]
  flight: InFlight
  /** Engineering employees (and interns while they count) in scope. */
  counted: readonly EngPerson[]
}

const pct0 = (v: number) => fmt(v, 'pct0')

/** The readout, and the chart notes taken from it (up to two per chart). */
export interface StagesReadout {
  findings: Finding[]
  notes: { capacity: ChartNote[]; hiring: ChartNote[] }
}

export function stagesFindings(b: StagesBase, x: FindingInputs): StagesReadout {
  const out: Ranked[] = []
  const notes: StagesReadout['notes'] = { capacity: [], hiring: [] }
  const f = b.set.findings
  const scope = b.ctx.isCompany ? null : b.ctx.scopeLabel
  const familyWords = x.family ?? null

  // 1. A ratio below its reference.
  for (const r of x.ratios) {
    if (r.status !== 'below' || r.value == null || r.reference == null) continue
    const topRows = x.capacity.filter((c) => (r.def.top as readonly string[]).includes(c.key))
    const employees = topRows.reduce((n, c) => n + c.employees, 0)
    const contractors = r.contractorsTop
    const openTop = x.hiring
      .filter((h) => (r.def.top as readonly string[]).includes(h.key))
      .reduce((n, h) => n + h.open, 0)
    const openAll = x.hiring.reduce((n, h) => n + h.open, 0)
    const fam = majorityFamily([...r.people.top])
    // Contractors are named either way; while they do not count in ratios, the ratio with them follows.
    const alsoWith =
      !b.set.ratioContractors && r.contractorsTop + r.contractorsBottom > 0 && r.withContractors != null
        ? `; ${plain(r.withContractors)} with contractors`
        : ''
    notes.capacity.push({
      at: r.def.top[0],
      text: `${plain(r.value)} ${r.def.per.replace(/^engineers /, '')}`,
    })
    out.push({
      weight: r.top + r.bottom,
      finding: {
        id: `stages-below-${r.id}`,
        metricId: SID.findings,
        severity: 'warning',
        title: `${r.def.topWords} has ${plain(r.value)} ${r.def.per}, below the ${plain(r.reference)} reference.`,
        detail: [
          `${count(employees, 'engineer')} in ${inSentence(r.def.topWords)}${
            contractors > 0 ? ` and ${count(contractors, 'contractor')}` : ''
          } for ${r.bottom.toLocaleString('en-US')} in ${inSentence(r.def.bottomWords)}${alsoWith}.`,
          openAll > 0
            ? `${r.def.topWords} holds ${openTop.toLocaleString('en-US')} of the ${count(openAll, 'open engineering opening')}.`
            : null,
        ]
          .filter(Boolean)
          .join(' '),
        action: `Weigh the ${inSentence(r.def.topWords)} gap in the ${comingQuarter(b.asOf).label} hiring plan${
          fam ? ` with the ${fam} leaders` : ''
        }.`,
        drill: () =>
          peopleSpec(
            b,
            titled(`${r.def.topWords} and ${inSentence(r.def.bottomWords)}`, familyWords, scope),
            [...r.people.top, ...r.people.bottom],
            { uses: STAGES_USES },
          ),
        uses: STAGES_USES,
      },
    })
  }

  // 2. Concentrated at a site whose voluntary attrition is high.
  for (const c of concentrations(b, x.capacity)) {
    const many = c.stages.length > 1
    // The three largest shares by name; the rest as a count.
    const named = [...c.stages]
      .sort((p, q) => q.share - p.share)
      .slice(0, 3)
      .sort((p, q) => order(p.key) - order(q.key))
    const more = c.stages.length - named.length
    const parts = [
      ...named.map((s) => `${pct0(s.share)} of ${inSentence(s.label)}`),
      ...(more ? [`${more} more ${more === 1 ? 'stage' : 'stages'}`] : []),
    ]
    const lead = [...c.stages].sort((p, q) => q.atSite - p.atSite)[0]
    if (lead) notes.capacity.push({ at: lead.key, text: `${pct0(lead.share)} in ${c.site}` })
    out.push({
      weight: c.people.length,
      finding: {
        id: `stages-concentrated-${c.site}`,
        metricId: SID.findings,
        severity: 'warning',
        title: `${capitalize(andList(parts))} ${many ? 'sit' : 'sits'} in ${c.site}, where voluntary attrition is ${fmt(
          c.rate,
          'pct',
        )}.`,
        detail: `The company's is ${fmt(c.company, 'pct')} over the last 12 months. ${count(
          c.people.length,
          'engineer',
        )} in ${many ? 'these stages' : 'this stage'} ${c.people.length === 1 ? 'works' : 'work'} there.`,
        action: `Review succession and knowledge sharing for ${andList(
          c.stages.map((s) => inSentence(s.label)),
        )} outside ${c.site}.`,
        filter: groupFilter('location', c.site),
        drill: () =>
          peopleSpec(b, titled(andList(c.stages.map((s) => s.label)), c.site, familyWords), c.people, {
            uses: WHERE_USES,
            filter: groupFilter('location', c.site),
          }),
        uses: CONCENTRATION_USES,
      },
    })
  }

  // 3. Planned roles with no req (only where planned starts are shown).
  if (x.flight.planned) {
    const ranked = x.hiring
      .filter((h) => (h.planned ?? 0) > 0)
      .sort((p, q) => (q.planned ?? 0) - (p.planned ?? 0) || order(p.key) - order(q.key))
    const total = ranked.reduce((n, h) => n + (h.planned ?? 0), 0)
    const [a, second] = ranked
    if (a) {
      const w = x.flight.window
      const lines = [...a.records.lines, ...(second?.records.lines ?? [])]
      notes.hiring.push({ at: a.key, text: `${a.planned} planned with no req` })
      out.push({
        weight: total,
        finding: {
          id: 'stages-planned-no-req',
          metricId: SID.findings,
          severity: 'info',
          title: `${a.stage} has ${count(a.planned ?? 0, 'planned start')} in the next ${count(
            w.months,
            'month',
          )} with no req yet${second ? `, and ${inSentence(second.stage)} ${second.planned}` : ''}.`,
          detail: `Across engineering, ${count(total, 'planned start')} from ${formatMonth(w.start)} to ${formatMonth(
            w.end,
          )} ${total === 1 ? 'has' : 'have'} no req.`,
          action: 'Open the reqs or move the roles in the plan with talent acquisition.',
          drill: () =>
            linesSpec(
              b,
              titled(
                `Planned starts with no req, ${andList([a.stage, ...(second ? [inSentence(second.stage)] : [])])}`,
                familyWords,
              ),
              lines,
              { uses: PLANNED_USES },
            ),
          uses: PLANNED_USES,
        },
      })
    }
  }

  // 4. A contractor-heavy stage.
  const heavy = x.capacity
    .filter(
      (c) =>
        c.contractorShare != null &&
        c.contractors >= b.set.minGroup &&
        c.contractorShare >= f.contractorShare - 1e-12,
    )
    .sort((p, q) => (q.contractorShare ?? 0) - (p.contractorShare ?? 0))
  if (heavy.length) {
    const [top, ...rest] = heavy
    out.push({
      weight: top.contractors,
      finding: {
        id: `stages-contractors-${top.key}`,
        metricId: SID.findings,
        severity: 'info',
        title: `Contractors are ${pct0(top.contractorShare ?? 0)} of ${inSentence(top.stage)}.`,
        detail: [
          `${count(top.contractors, 'contractor')} and ${count(top.employees, 'employee')}.`,
          rest.length
            ? `Also at or above ${pct0(f.contractorShare)}: ${andList(rest.map((r) => inSentence(r.stage)))}.`
            : null,
        ]
          .filter(Boolean)
          .join(' '),
        action: `Review the contractor mix in ${inSentence(top.stage)} with its engineering leaders.`,
        drill: () =>
          peopleSpec(
            b,
            titled(`Contractors in ${inSentence(top.stage)}`, familyWords, scope),
            top.people.contractors,
          ),
        uses: STAGES_USES,
      },
    })
  }

  // 5. Not mapped, or only proposed.
  const total = x.counted.length
  const unmapped = x.counted.filter((p) => p.stage === NOT_MAPPED)
  const proposed = x.counted.filter((p) => p.source === 'Proposed')
  const unmappedFires = total > 0 && unmapped.length / total > f.unmappedShare + 1e-12
  if (unmappedFires || proposed.length) {
    const fnNames = (xs: readonly EngPerson[]) => {
      const c = new Map<string, number>()
      for (const p of xs)
        c.set(p.jobFunction ?? 'No job function', (c.get(p.jobFunction ?? 'No job function') ?? 0) + 1)
      const names = [...c.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0])).map(([n]) => n)
      return names.length > 3
        ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
        : andList(names)
    }
    const proposedFns = new Set(proposed.map((p) => p.jobFunction))
    const firstProposed = proposed[0]
    const title = unmappedFires
      ? `${count(unmapped.length, 'engineer')} (${pct0(unmapped.length / total)}) ${
          unmapped.length === 1 ? 'is' : 'are'
        } in job functions with no stage: ${fnNames(unmapped)}.`
      : `${count(proposed.length, 'engineer')} ${proposed.length === 1 ? 'is' : 'are'} in ${
          proposedFns.size === 1 ? 'a job function whose stage is' : 'job functions whose stages are'
        } only proposed: ${fnNames(proposed)}.`
    const detail = [
      unmappedFires && proposed.length
        ? `${count(proposed.length, 'more engineer')} ${proposed.length === 1 ? 'is' : 'are'} in a stage that is only proposed: ${fnNames(proposed)}.`
        : null,
      !unmappedFires && firstProposed && proposedFns.size === 1
        ? `Census proposes ${stageLabel(firstProposed.stage)} from the name until a stage is saved.`
        : !unmappedFires
          ? 'Census proposes each stage from the job function’s name or commonest title until one is saved.'
          : null,
    ]
      .filter(Boolean)
      .join(' ')
    const people = [...unmapped, ...proposed]
    out.push({
      weight: people.length,
      finding: {
        id: 'stages-not-mapped',
        metricId: SID.findings,
        severity: 'info',
        title,
        detail: detail || undefined,
        action: 'Confirm or change the stage in Settings, Official lists, Job functions.',
        drill: () =>
          peopleSpec(
            b,
            titled('Engineers in a job function with no saved stage', familyWords, scope),
            people,
            { uses: STAGES_USES },
          ),
        uses: STAGES_USES,
      },
    })
  }

  return {
    findings: out
      .sort((p, q) => RANK[p.finding.severity] - RANK[q.finding.severity] || q.weight - p.weight)
      .map((r) => r.finding),
    notes: { capacity: notes.capacity.slice(0, 2), hiring: notes.hiring.slice(0, 2) },
  }
}

const STAGE_ORDER = new Map<string, number>(STAGE_ROWS.map((r, i) => [r.key, i]))
const order = (k: StageKey): number => STAGE_ORDER.get(k) ?? STAGE_ORDER.size

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The job family most of these people are in, or null. */
function majorityFamily(people: readonly EngPerson[]): string | null {
  const c = new Map<string, number>()
  for (const p of people) if (p.family) c.set(p.family, (c.get(p.family) ?? 0) + 1)
  let best: string | null = null
  let n = 0
  for (const [k, v] of c)
    if (v > n) {
      best = k
      n = v
    }
  return best
}
